/**
 * Base API client with comprehensive retry logic, rate limiting, and error handling
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { logHelpers, loggerUtils } from '../config/logger.js';
import { cacheUtils } from '../config/redis.js';
import { createHash } from 'crypto';

// Extend Axios config to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      requestId: string;
      startTime: number;
    };
  }
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
  queueLimit: number;
}

export interface CacheConfig {
  defaultTTL: number;
  maxSize: number;
  keyPrefix: string;
}

export interface BaseClientConfig {
  name: string;
  baseURL: string;
  timeout: number;
  headers?: Record<string, string>;
  retry: RetryConfig;
  rateLimit: RateLimitConfig;
  cache: CacheConfig;
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
  };
}

export interface RequestQueue {
  requests: Array<{
    id: string;
    config: AxiosRequestConfig;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timestamp: number;
    retryCount: number;
  }>;
  processing: boolean;
  lastRequestTime: number;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export abstract class BaseClient {
  protected client: AxiosInstance;
  protected config: BaseClientConfig;
  protected requestQueue: RequestQueue;
  protected circuitBreaker: CircuitBreakerState;
  protected rateLimitCounters: Map<string, number[]>;

  constructor(config: BaseClientConfig) {
    this.config = config;
    this.requestQueue = {
      requests: [],
      processing: false,
      lastRequestTime: 0,
    };
    
    this.circuitBreaker = {
      state: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };

    this.rateLimitCounters = new Map();

    // Initialize axios client
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'User-Agent': 'StockGenius/1.0.0',
        ...config.headers,
      },
    });

    this.setupInterceptors();
    this.startQueueProcessor();

    loggerUtils.apiLogger.info(`${config.name} client initialized`, {
      baseURL: config.baseURL,
      timeout: config.timeout,
      rateLimit: config.rateLimit,
    });
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const requestId = this.generateRequestId();
        config.metadata = { requestId, startTime: Date.now() };
        
        logHelpers.logApiRequest(
          this.config.name,
          config.url || '',
          this.extractSymbol(config),
          { requestId }
        );
        
        return config;
      },
      (error) => {
        loggerUtils.apiLogger.error('Request interceptor error', {
          client: this.config.name,
          error: error.message,
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        logHelpers.logApiResponse(
          this.config.name,
          response.config.url || '',
          this.extractSymbol(response.config),
          duration,
          response.status,
          { requestId: response.config.metadata.requestId }
        );

        // Update circuit breaker on success
        this.recordSuccess();
        
        return response;
      },
      async (error: AxiosError) => {
        const duration = error.config?.metadata ? 
          Date.now() - error.config.metadata.startTime : 0;
        
        logHelpers.logApiError(
          this.config.name,
          error.config?.url || '',
          this.extractSymbol(error.config),
          error,
          { 
            requestId: error.config?.metadata?.requestId,
            duration,
            status: error.response?.status,
          }
        );

        // Update circuit breaker on failure
        this.recordFailure();
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a GET request with full retry and caching logic
   */
  async get<T = any>(
    endpoint: string, 
    params?: Record<string, any>,
    options?: {
      cacheTTL?: number;
      skipCache?: boolean;
      priority?: 'high' | 'normal' | 'low';
      timeout?: number;
      parseHtml?: boolean;
    }
  ): Promise<T> {
    const cacheKey = this.generateCacheKey('GET', endpoint, params);
    const cacheTTL = options?.cacheTTL || this.config.cache.defaultTTL;

    // Check cache first unless explicitly skipped
    if (!options?.skipCache) {
      try {
        const cached = await cacheUtils.get(cacheKey);
        if (cached) {
          logHelpers.logCacheOperation('get', cacheKey, true, cacheTTL);
          return cached;
        }
      } catch (error) {
        loggerUtils.cacheLogger.warn('Cache get failed', {
          client: this.config.name,
          cacheKey,
          error: error.message,
        });
      }
    }

    // Check circuit breaker
    if (this.circuitBreaker.state === 'open') {
      if (Date.now() < this.circuitBreaker.nextAttemptTime) {
        throw new Error(`Circuit breaker open for ${this.config.name}`);
      } else {
        this.circuitBreaker.state = 'half-open';
      }
    }

    // Make the request
    const requestConfig: AxiosRequestConfig = {
      method: 'GET',
      url: endpoint,
      params,
      timeout: options?.timeout || this.config.timeout,
    };

    const response = await this.executeWithRetry<T>(requestConfig, options?.priority);

    // Cache successful response
    if (!options?.skipCache && response) {
      try {
        await cacheUtils.set(cacheKey, response, cacheTTL);
        logHelpers.logCacheOperation('set', cacheKey, false, cacheTTL);
      } catch (error) {
        loggerUtils.cacheLogger.warn('Cache set failed', {
          client: this.config.name,
          cacheKey,
          error: error.message,
        });
      }
    }

    return response;
  }

  /**
   * Make a POST request
   */
  async post<T = any>(
    endpoint: string,
    data?: any,
    options?: {
      priority?: 'high' | 'normal' | 'low';
      timeout?: number;
    }
  ): Promise<T> {
    // Check circuit breaker
    if (this.circuitBreaker.state === 'open') {
      if (Date.now() < this.circuitBreaker.nextAttemptTime) {
        throw new Error(`Circuit breaker open for ${this.config.name}`);
      } else {
        this.circuitBreaker.state = 'half-open';
      }
    }

    const requestConfig: AxiosRequestConfig = {
      method: 'POST',
      url: endpoint,
      data,
      timeout: options?.timeout || this.config.timeout,
    };

    return await this.executeWithRetry<T>(requestConfig, options?.priority);
  }

  /**
   * Execute request with retry logic and rate limiting
   */
  private async executeWithRetry<T>(
    config: AxiosRequestConfig,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const queueItem = {
        id: requestId,
        config,
        resolve: (value: T) => resolve(value),
        reject: (error: any) => reject(error),
        timestamp: Date.now(),
        retryCount: 0,
      };

      // Add to queue based on priority
      if (priority === 'high') {
        this.requestQueue.requests.unshift(queueItem);
      } else {
        this.requestQueue.requests.push(queueItem);
      }

      // Limit queue size
      if (this.requestQueue.requests.length > this.config.rateLimit.queueLimit) {
        const removed = this.requestQueue.requests.pop();
        if (removed) {
          removed.reject(new Error('Request queue full'));
        }
      }

      // Start processing if not already running
      if (!this.requestQueue.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.requestQueue.processing || this.requestQueue.requests.length === 0) {
      return;
    }

    this.requestQueue.processing = true;

    while (this.requestQueue.requests.length > 0) {
      // Check rate limits
      if (!this.canMakeRequest()) {
        const delay = this.getDelayForRateLimit();
        await this.sleep(delay);
        continue;
      }

      const request = this.requestQueue.requests.shift();
      if (!request) break;

      try {
        // Record request for rate limiting
        this.recordRequest();
        
        // Execute the actual HTTP request
        const response = await this.executeRequest(request.config);
        request.resolve(response.data);

        // Update last request time
        this.requestQueue.lastRequestTime = Date.now();

      } catch (error) {
        // Handle retry logic
        if (this.shouldRetry(error, request.retryCount)) {
          request.retryCount++;
          const delay = this.calculateRetryDelay(request.retryCount);
          
          loggerUtils.apiLogger.warn('Retrying request', {
            client: this.config.name,
            requestId: request.id,
            retryCount: request.retryCount,
            delay,
            error: error.message,
          });

          // Add back to queue after delay
          setTimeout(() => {
            this.requestQueue.requests.unshift(request);
          }, delay);

        } else {
          // Max retries exceeded or non-retryable error
          request.reject(error);
        }
      }

      // Small delay between requests to be respectful
      await this.sleep(100);
    }

    this.requestQueue.processing = false;
  }

  /**
   * Execute the actual HTTP request
   */
  private async executeRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
    return await this.client.request(config);
  }

  /**
   * Check if we can make a request based on rate limits
   */
  private canMakeRequest(): boolean {
    const now = Date.now();
    
    // Check per-second limit
    const secondKey = Math.floor(now / 1000).toString();
    const secondCount = this.rateLimitCounters.get(secondKey) || [];
    if (secondCount.length >= this.config.rateLimit.requestsPerSecond) {
      return false;
    }

    // Check per-minute limit
    const minuteKey = Math.floor(now / 60000).toString();
    const minuteCount = this.rateLimitCounters.get(minuteKey) || [];
    if (minuteCount.length >= this.config.rateLimit.requestsPerMinute) {
      return false;
    }

    // Check per-hour limit
    const hourKey = Math.floor(now / 3600000).toString();
    const hourCount = this.rateLimitCounters.get(hourKey) || [];
    if (hourCount.length >= this.config.rateLimit.requestsPerHour) {
      return false;
    }

    return true;
  }

  /**
   * Record a request for rate limiting
   */
  private recordRequest(): void {
    const now = Date.now();
    
    // Record for different time windows
    const secondKey = Math.floor(now / 1000).toString();
    const minuteKey = Math.floor(now / 60000).toString();
    const hourKey = Math.floor(now / 3600000).toString();

    [secondKey, minuteKey, hourKey].forEach(key => {
      if (!this.rateLimitCounters.has(key)) {
        this.rateLimitCounters.set(key, []);
      }
      this.rateLimitCounters.get(key)!.push(now);
    });

    // Clean up old counters
    this.cleanupRateLimitCounters();
  }

  /**
   * Calculate delay needed to respect rate limits
   */
  private getDelayForRateLimit(): number {
    const now = Date.now();
    
    // Check what's limiting us and return appropriate delay
    const secondKey = Math.floor(now / 1000).toString();
    const secondCount = this.rateLimitCounters.get(secondKey) || [];
    
    if (secondCount.length >= this.config.rateLimit.requestsPerSecond) {
      return 1000 - (now % 1000); // Wait until next second
    }

    const minuteKey = Math.floor(now / 60000).toString();
    const minuteCount = this.rateLimitCounters.get(minuteKey) || [];
    
    if (minuteCount.length >= this.config.rateLimit.requestsPerMinute) {
      return 60000 - (now % 60000); // Wait until next minute
    }

    return 1000; // Default 1 second delay
  }

  /**
   * Check if an error should trigger a retry
   */
  private shouldRetry(error: any, retryCount: number): boolean {
    if (retryCount >= this.config.retry.maxRetries) {
      return false;
    }

    // Network errors should be retried
    if (!error.response) {
      return true;
    }

    // Check if status code is retryable
    const statusCode = error.response.status;
    return this.config.retry.retryableStatusCodes.includes(statusCode);
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = this.config.retry.baseDelay * 
      Math.pow(this.config.retry.backoffMultiplier, retryCount - 1);
    
    return Math.min(delay, this.config.retry.maxDelay);
  }

  /**
   * Record successful request for circuit breaker
   */
  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Record failed request for circuit breaker
   */
  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.config.circuitBreaker && 
        this.circuitBreaker.failureCount >= this.config.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'open';
      this.circuitBreaker.nextAttemptTime = 
        Date.now() + this.config.circuitBreaker.resetTimeout;
      
      loggerUtils.apiLogger.error('Circuit breaker opened', {
        client: this.config.name,
        failureCount: this.circuitBreaker.failureCount,
        resetTime: this.circuitBreaker.nextAttemptTime,
      });
    }
  }

  /**
   * Start the queue processor
   */
  private startQueueProcessor(): void {
    // Process queue every 100ms
    setInterval(() => {
      if (!this.requestQueue.processing && this.requestQueue.requests.length > 0) {
        this.processQueue().catch(error => {
          loggerUtils.apiLogger.error('Queue processor error', {
            client: this.config.name,
            error: error.message,
          });
        });
      }
    }, 100);
  }

  /**
   * Clean up old rate limit counters
   */
  private cleanupRateLimitCounters(): void {
    const now = Date.now();
    const cutoff = now - 3600000; // Keep last hour
    
    for (const [key, timestamps] of this.rateLimitCounters) {
      const filtered = timestamps.filter(t => t > cutoff);
      if (filtered.length === 0) {
        this.rateLimitCounters.delete(key);
      } else {
        this.rateLimitCounters.set(key, filtered);
      }
    }
  }

  /**
   * Generate cache key for requests
   */
  protected generateCacheKey(method: string, endpoint: string, params?: any): string {
    const key = {
      client: this.config.name,
      method,
      endpoint,
      params: params || {},
    };
    
    const hash = createHash('md5').update(JSON.stringify(key)).digest('hex');
    return `${this.config.cache.keyPrefix}:${hash}`;
  }

  /**
   * Generate unique request ID
   */
  protected generateRequestId(): string {
    return `${this.config.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract symbol from request config for logging
   */
  protected extractSymbol(config?: any): string {
    if (!config) return '';
    
    // Try to extract symbol from params or URL
    const params = config.params || {};
    return params.symbol || params.ticker || params.q || '';
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get client statistics
   */
  getStatistics(): Record<string, any> {
    const now = Date.now();
    
    return {
      name: this.config.name,
      circuitBreaker: this.circuitBreaker,
      queueSize: this.requestQueue.requests.length,
      rateLimitCounters: {
        currentSecond: this.rateLimitCounters.get(Math.floor(now / 1000).toString())?.length || 0,
        currentMinute: this.rateLimitCounters.get(Math.floor(now / 60000).toString())?.length || 0,
        currentHour: this.rateLimitCounters.get(Math.floor(now / 3600000).toString())?.length || 0,
      },
      limits: this.config.rateLimit,
    };
  }

  /**
   * Health check for the client
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const stats = this.getStatistics();
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (this.circuitBreaker.state === 'open') {
      status = 'unhealthy';
    } else if (this.circuitBreaker.state === 'half-open' || stats.queueSize > 50) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        ...stats,
        lastRequestTime: this.requestQueue.lastRequestTime,
        queueProcessing: this.requestQueue.processing,
      },
    };
  }

  /**
   * Clear cache for this client
   */
  async clearCache(pattern?: string): Promise<number> {
    const fullPattern = pattern ? 
      `${this.config.cache.keyPrefix}:*${pattern}*` : 
      `${this.config.cache.keyPrefix}:*`;
    
    return await cacheUtils.clearPattern(fullPattern);
  }

  /**
   * Abstract method for subclasses to implement client-specific health checks
   */
  abstract validateConnection(): Promise<boolean>;
}
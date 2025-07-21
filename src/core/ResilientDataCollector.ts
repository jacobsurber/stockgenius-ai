/**
 * Resilient Data Collection Service
 * Implements graceful degradation and partial success patterns
 */

import { EventEmitter } from 'events';
import { CircuitBreaker, CircuitBreakerFactory } from './CircuitBreaker.js';
import { DataHub } from '../api/DataHub.js';
import { loggerUtils } from '../config/logger.js';

export interface DataCollectionStrategy {
  symbol: string;
  requiredSources: string[];      // Must succeed
  preferredSources: string[];     // Nice to have
  fallbackSources: string[];      // Emergency backup
  
  minQualityScore: number;        // 0.0-1.0
  timeoutStrategy: 'aggressive' | 'balanced' | 'patient';
  maxConcurrentRequests: number;
}

export interface DataSourceResult {
  source: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  qualityScore: number;
}

export interface CollectionResult {
  strategy: DataCollectionStrategy;
  results: DataSourceResult[];
  overallQualityScore: number;
  success: boolean;
  criticalSourcesFailed: string[];
  duration: number;
  partialSuccess: boolean;
}

export interface DataSourceConfig {
  name: string;
  weight: number;              // Contribution to quality score
  timeout: number;
  retryCount: number;
  circuitBreakerOptions?: any;
  fallbackData?: () => Promise<any>;
}

export class ResilientDataCollector extends EventEmitter {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private dataSourceConfigs = new Map<string, DataSourceConfig>();

  constructor(private dataHub: DataHub) {
    super();
    this.setupDataSources();
  }

  /**
   * Setup data source configurations
   */
  private setupDataSources(): void {
    const sources: DataSourceConfig[] = [
      {
        name: 'polygon',
        weight: 0.25,
        timeout: 10000,
        retryCount: 2,
        circuitBreakerOptions: { failureThreshold: 3, resetTimeout: 30000 }
      },
      {
        name: 'alphavantage',
        weight: 0.2,
        timeout: 8000,
        retryCount: 2,
        circuitBreakerOptions: { failureThreshold: 5, resetTimeout: 60000 }
      },
      {
        name: 'yahoo',
        weight: 0.2,
        timeout: 15000,
        retryCount: 1,
        circuitBreakerOptions: { failureThreshold: 3, resetTimeout: 45000 }
      },
      {
        name: 'trends',
        weight: 0.1,
        timeout: 20000,
        retryCount: 1,
        circuitBreakerOptions: { failureThreshold: 2, resetTimeout: 120000 }
      },
      {
        name: 'sec',
        weight: 0.15,
        timeout: 30000,
        retryCount: 1,
        circuitBreakerOptions: { failureThreshold: 2, resetTimeout: 300000 },
        fallbackData: this.getSecFallbackData.bind(this)
      },
      {
        name: 'newsscraper',
        weight: 0.1,
        timeout: 25000,
        retryCount: 1,
        circuitBreakerOptions: { failureThreshold: 3, resetTimeout: 180000 }
      }
    ];

    for (const source of sources) {
      this.dataSourceConfigs.set(source.name, source);
      this.circuitBreakers.set(
        source.name,
        CircuitBreakerFactory.getOrCreate(source.name, source.circuitBreakerOptions)
      );
    }

    loggerUtils.aiLogger.info('Data sources configured', {
      count: sources.length,
      sources: sources.map(s => s.name)
    });
  }

  /**
   * Collect data using resilient strategy
   */
  async collectData(strategy: DataCollectionStrategy): Promise<CollectionResult> {
    const startTime = Date.now();
    
    loggerUtils.aiLogger.info('Starting resilient data collection', {
      symbol: strategy.symbol,
      requiredSources: strategy.requiredSources,
      preferredSources: strategy.preferredSources,
      minQualityScore: strategy.minQualityScore
    });

    // Phase 1: Try required sources first
    const requiredResults = await this.collectFromSources(
      strategy.symbol,
      strategy.requiredSources,
      strategy.timeoutStrategy,
      strategy.maxConcurrentRequests
    );

    // Check if we have minimum required data
    const requiredQuality = this.calculateQualityScore(requiredResults);
    const criticalFailures = this.getCriticalFailures(requiredResults, strategy.requiredSources);

    let allResults = [...requiredResults];
    let needMoreData = requiredQuality < strategy.minQualityScore || criticalFailures.length > 0;

    // Phase 2: Try preferred sources if needed
    if (needMoreData && strategy.preferredSources.length > 0) {
      loggerUtils.aiLogger.info('Required sources insufficient, trying preferred sources', {
        requiredQuality,
        minRequired: strategy.minQualityScore,
        criticalFailures
      });

      const preferredResults = await this.collectFromSources(
        strategy.symbol,
        strategy.preferredSources,
        strategy.timeoutStrategy,
        strategy.maxConcurrentRequests
      );

      allResults.push(...preferredResults);
      needMoreData = this.calculateQualityScore(allResults) < strategy.minQualityScore;
    }

    // Phase 3: Try fallback sources if still needed
    if (needMoreData && strategy.fallbackSources.length > 0) {
      loggerUtils.aiLogger.warn('Preferred sources insufficient, trying fallback sources', {
        currentQuality: this.calculateQualityScore(allResults),
        minRequired: strategy.minQualityScore
      });

      const fallbackResults = await this.collectFromSources(
        strategy.symbol,
        strategy.fallbackSources,
        'patient', // Use patient strategy for fallbacks
        Math.min(strategy.maxConcurrentRequests, 2)
      );

      allResults.push(...fallbackResults);
    }

    const finalQualityScore = this.calculateQualityScore(allResults);
    const duration = Date.now() - startTime;
    const success = finalQualityScore >= strategy.minQualityScore && criticalFailures.length === 0;

    const result: CollectionResult = {
      strategy,
      results: allResults,
      overallQualityScore: finalQualityScore,
      success,
      criticalSourcesFailed: criticalFailures,
      duration,
      partialSuccess: finalQualityScore > 0.2 && allResults.some(r => r.success)
    };

    loggerUtils.aiLogger.info('Data collection completed', {
      symbol: strategy.symbol,
      success,
      qualityScore: finalQualityScore,
      duration,
      successfulSources: allResults.filter(r => r.success).length,
      totalSources: allResults.length,
      partialSuccess: result.partialSuccess
    });

    this.emit('collectionComplete', result);
    return result;
  }

  /**
   * Collect data from specific sources
   */
  private async collectFromSources(
    symbol: string,
    sources: string[],
    timeoutStrategy: 'aggressive' | 'balanced' | 'patient',
    maxConcurrent: number
  ): Promise<DataSourceResult[]> {
    const results: DataSourceResult[] = [];
    
    // Process sources in batches to respect concurrency limits
    for (let i = 0; i < sources.length; i += maxConcurrent) {
      const batch = sources.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(source => this.collectFromSource(symbol, source, timeoutStrategy));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result
          results.push({
            source: batch[j],
            success: false,
            error: result.reason.message,
            duration: 0,
            qualityScore: 0
          });
        }
      }
    }

    return results;
  }

  /**
   * Collect data from a single source with circuit breaker protection
   */
  private async collectFromSource(
    symbol: string,
    sourceName: string,
    timeoutStrategy: 'aggressive' | 'balanced' | 'patient'
  ): Promise<DataSourceResult> {
    const config = this.dataSourceConfigs.get(sourceName);
    if (!config) {
      throw new Error(`Unknown data source: ${sourceName}`);
    }

    const circuitBreaker = this.circuitBreakers.get(sourceName)!;
    const startTime = Date.now();

    try {
      // Check if circuit breaker allows the request
      const data = await circuitBreaker.execute(async () => {
        return await this.fetchDataFromSource(symbol, sourceName, config, timeoutStrategy);
      });

      const duration = Date.now() - startTime;
      const qualityScore = this.assessDataQuality(sourceName, data);

      return {
        source: sourceName,
        success: true,
        data,
        duration,
        qualityScore
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggerUtils.aiLogger.warn('Data source failed', {
        source: sourceName,
        symbol,
        error: error.message,
        duration
      });

      // Try fallback data if available
      if (config.fallbackData) {
        try {
          const fallbackData = await config.fallbackData();
          return {
            source: `${sourceName}_fallback`,
            success: true,
            data: fallbackData,
            duration,
            qualityScore: config.weight * 0.3 // Reduced quality for fallback
          };
        } catch (fallbackError) {
          loggerUtils.aiLogger.error('Fallback data also failed', {
            source: sourceName,
            error: fallbackError.message
          });
        }
      }

      return {
        source: sourceName,
        success: false,
        error: error.message,
        duration,
        qualityScore: 0
      };
    }
  }

  /**
   * Fetch data from specific source with retries
   */
  private async fetchDataFromSource(
    symbol: string,
    sourceName: string,
    config: DataSourceConfig,
    timeoutStrategy: 'aggressive' | 'balanced' | 'patient'
  ): Promise<any> {
    const timeoutMap = {
      aggressive: config.timeout * 0.5,
      balanced: config.timeout,
      patient: config.timeout * 1.5
    };

    const timeout = timeoutMap[timeoutStrategy];
    let lastError: Error;

    for (let attempt = 0; attempt <= config.retryCount; attempt++) {
      try {
        const client = this.getClientFromDataHub(sourceName);
        if (!client) {
          throw new Error(`Client not available: ${sourceName}`);
        }

        // Add timeout wrapper
        const dataPromise = this.getDataBySource(client, sourceName, symbol);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
        });

        return await Promise.race([dataPromise, timeoutPromise]);

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < config.retryCount) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 5000);
          loggerUtils.aiLogger.warn('Retrying data source after failure', {
            source: sourceName,
            attempt: attempt + 1,
            maxAttempts: config.retryCount + 1,
            backoffDelay,
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get client from DataHub by name
   */
  private getClientFromDataHub(sourceName: string): any {
    switch (sourceName) {
      case 'polygon':
        return this.dataHub.polygonClient;
      case 'alphavantage':
        return this.dataHub.alphaVantageClient;
      case 'yahoo':
        return this.dataHub.yahooFinanceClient;
      case 'trends':
        return this.dataHub.googleTrendsClient;
      case 'sec':
        return this.dataHub.secEdgarClient;
      case 'newsscraper':
        return this.dataHub.newsScraperClient;
      default:
        return null;
    }
  }

  /**
   * Route data requests to appropriate client methods
   */
  private async getDataBySource(client: any, sourceName: string, symbol: string): Promise<any> {
    switch (sourceName) {
      case 'polygon':
        return await client.getQuote(symbol);
      case 'alphavantage':
        return await client.getQuote(symbol);
      case 'yahoo':
        return await client.getQuote(symbol);
      case 'trends':
        return await client.getTrendData(symbol);
      case 'sec':
        return await client.getCompanyFilings(symbol);
      case 'newsscraper':
        return await client.getNewsForSymbol(symbol, 10);
      default:
        throw new Error(`Unknown source: ${sourceName}`);
    }
  }

  /**
   * Calculate overall quality score from results
   */
  private calculateQualityScore(results: DataSourceResult[]): number {
    if (results.length === 0) return 0;

    const totalWeight = Array.from(this.dataSourceConfigs.values())
      .filter(config => results.some(r => r.source === config.name))
      .reduce((sum, config) => sum + config.weight, 0);

    if (totalWeight === 0) return 0;

    const weightedScore = results.reduce((score, result) => {
      const config = this.dataSourceConfigs.get(result.source);
      if (!config || !result.success) return score;
      return score + (config.weight * result.qualityScore);
    }, 0);

    return Math.min(weightedScore / totalWeight, 1.0);
  }

  /**
   * Assess quality of data from a specific source
   */
  private assessDataQuality(sourceName: string, data: any): number {
    if (!data) return 0;

    // Basic quality assessment - can be enhanced
    const config = this.dataSourceConfigs.get(sourceName);
    if (!config) return 0.5;

    // Check for presence of expected fields
    let qualityScore = 0.5; // Base score

    if (typeof data === 'object' && data !== null) {
      const hasData = Object.keys(data).length > 0;
      qualityScore = hasData ? 1.0 : 0.1;
    } else if (Array.isArray(data)) {
      qualityScore = data.length > 0 ? 1.0 : 0.1;
    }

    return qualityScore;
  }

  /**
   * Get critical failures from required sources
   */
  private getCriticalFailures(results: DataSourceResult[], requiredSources: string[]): string[] {
    return requiredSources.filter(source => {
      const result = results.find(r => r.source === source);
      return !result || !result.success;
    });
  }

  /**
   * SEC fallback data for when API is unavailable
   */
  private async getSecFallbackData(): Promise<any> {
    return {
      filings: [],
      source: 'cached',
      note: 'SEC API unavailable, using empty fallback data'
    };
  }

  /**
   * Get health status of all circuit breakers
   */
  getHealthStatus(): Array<{ name: string; healthy: boolean; stats: any }> {
    return CircuitBreakerFactory.getHealthStatus();
  }
}
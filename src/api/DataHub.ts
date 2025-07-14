/**
 * Unified API integration hub for StockGenius
 * Coordinates all data sources with intelligent fallbacks and caching
 */

import { BaseClient, BaseClientConfig } from './BaseClient.js';
import { FinnhubClient } from './clients/FinnhubClient.js';
import { PolygonClient } from './clients/PolygonClient.js';
import { AlphaVantageClient } from './clients/AlphaVantageClient.js';
import { QuiverClient } from './clients/QuiverClient.js';
import { YahooFinanceClient } from './clients/YahooFinanceClient.js';
import { GoogleTrendsClient } from './clients/GoogleTrendsClient.js';
import { SECEdgarClient } from './clients/SECEdgarClient.js';
import { NewsScraperClient } from './clients/NewsScraperClient.js';
import { processingService } from '../preprocessing/ProcessingService.js';
import { ProcessingResult, ProcessedDataPoint } from '../types/data.js';
import { logHelpers, loggerUtils } from '../config/logger.js';
import { cacheUtils } from '../config/redis.js';
import env from '../config/env.js';

export interface DataRequest {
  symbol: string;
  dataTypes: DataType[];
  options?: {
    priority?: 'high' | 'normal' | 'low';
    maxAge?: number; // Maximum age of cached data in milliseconds
    sources?: string[]; // Specific sources to use
    fallbackEnabled?: boolean;
    processingOptions?: any;
  };
}

export type DataType = 
  | 'quote' 
  | 'profile' 
  | 'news' 
  | 'financials' 
  | 'earnings'
  | 'insider' 
  | 'congressional'
  | 'options'
  | 'technical'
  | 'trends'
  | 'filings'
  | 'sentiment';

export interface DataResponse {
  symbol: string;
  data: Record<DataType, ProcessingResult>;
  metadata: {
    sources: Record<string, any>;
    cachingInfo: Record<string, any>;
    processingTime: number;
    errors: string[];
    warnings: string[];
  };
}

export interface SourcePriority {
  primary: string[];
  fallback: string[];
  free: string[];
}

export class DataHub {
  private clients: Map<string, BaseClient> = new Map();
  private sourcePriorities: Map<DataType, SourcePriority> = new Map();
  private healthStatus: Map<string, boolean> = new Map();
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 300000; // 5 minutes

  constructor() {
    this.initializeClients();
    this.setupSourcePriorities();
    this.startHealthMonitoring();
  }

  /**
   * Initialize all API clients
   */
  private async initializeClients(): Promise<void> {
    loggerUtils.apiLogger.info('Initializing DataHub clients');

    try {
      // Paid API clients
      if (env.FINNHUB_API_KEY) {
        this.clients.set('finnhub', new FinnhubClient({
          name: 'Finnhub',
          baseURL: 'https://finnhub.io/api/v1',
          timeout: 10000,
          headers: {},
          retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2,
            retryableStatusCodes: [429, 500, 502, 503, 504],
          },
          rateLimit: {
            requestsPerSecond: 1,
            requestsPerMinute: 60,
            requestsPerHour: 3600,
            burstLimit: 5,
            queueLimit: 100,
          },
          cache: {
            defaultTTL: 300,
            maxSize: 1000,
            keyPrefix: 'finnhub',
          },
          circuitBreaker: {
            failureThreshold: 5,
            resetTimeout: 60000,
            monitoringPeriod: 300000,
          },
        }));
      }

      if (env.POLYGON_API_KEY) {
        this.clients.set('polygon', new PolygonClient({
          name: 'Polygon',
          baseURL: 'https://api.polygon.io',
          timeout: 15000,
          headers: {},
          retry: {
            maxRetries: 2,
            baseDelay: 2000,
            maxDelay: 15000,
            backoffMultiplier: 2,
            retryableStatusCodes: [429, 500, 502, 503, 504],
          },
          rateLimit: {
            requestsPerSecond: 0.1, // 5 per minute for free tier
            requestsPerMinute: 5,
            requestsPerHour: 300,
            burstLimit: 2,
            queueLimit: 50,
          },
          cache: {
            defaultTTL: 600,
            maxSize: 500,
            keyPrefix: 'polygon',
          },
          circuitBreaker: {
            failureThreshold: 3,
            resetTimeout: 120000,
            monitoringPeriod: 300000,
          },
        }));
      }

      if (env.ALPHA_VANTAGE_API_KEY) {
        this.clients.set('alphavantage', new AlphaVantageClient({
          name: 'AlphaVantage',
          baseURL: 'https://www.alphavantage.co/query',
          timeout: 20000,
          headers: {},
          retry: {
            maxRetries: 2,
            baseDelay: 3000,
            maxDelay: 20000,
            backoffMultiplier: 2,
            retryableStatusCodes: [429, 500, 502, 503, 504],
          },
          rateLimit: {
            requestsPerSecond: 0.08, // 5 per minute for free tier
            requestsPerMinute: 5,
            requestsPerHour: 500,
            burstLimit: 1,
            queueLimit: 25,
          },
          cache: {
            defaultTTL: 1800,
            maxSize: 300,
            keyPrefix: 'alphavantage',
          },
          circuitBreaker: {
            failureThreshold: 3,
            resetTimeout: 300000,
            monitoringPeriod: 600000,
          },
        }));
      }

      if (env.QUIVER_API_KEY) {
        this.clients.set('quiver', new QuiverClient({
          name: 'Quiver',
          baseURL: 'https://api.quiverquant.com/beta',
          timeout: 15000,
          headers: {},
          retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2,
            retryableStatusCodes: [429, 500, 502, 503, 504],
          },
          rateLimit: {
            requestsPerSecond: 5,
            requestsPerMinute: 300,
            requestsPerHour: 18000,
            burstLimit: 10,
            queueLimit: 200,
          },
          cache: {
            defaultTTL: 3600,
            maxSize: 1000,
            keyPrefix: 'quiver',
          },
          circuitBreaker: {
            failureThreshold: 5,
            resetTimeout: 60000,
            monitoringPeriod: 300000,
          },
        }));
      }

      // Free data sources - always available
      this.clients.set('yahoo', new YahooFinanceClient({
        name: 'YahooFinance',
        baseURL: 'https://query1.finance.yahoo.com',
        timeout: 10000,
        headers: {},
        retry: {
          maxRetries: 3,
          baseDelay: 2000,
          maxDelay: 15000,
          backoffMultiplier: 2,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
        rateLimit: {
          requestsPerSecond: 2,
          requestsPerMinute: 120,
          requestsPerHour: 7200,
          burstLimit: 5,
          queueLimit: 100,
        },
        cache: {
          defaultTTL: 300,
          maxSize: 1000,
          keyPrefix: 'yahoo',
        },
      }));

      this.clients.set('trends', new GoogleTrendsClient({
        name: 'GoogleTrends',
        baseURL: 'https://trends.google.com',
        timeout: 15000,
        headers: {},
        retry: {
          maxRetries: 2,
          baseDelay: 5000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
        rateLimit: {
          requestsPerSecond: 0.1,
          requestsPerMinute: 6,
          requestsPerHour: 360,
          burstLimit: 1,
          queueLimit: 20,
        },
        cache: {
          defaultTTL: 7200, // 2 hours for trends data
          maxSize: 200,
          keyPrefix: 'trends',
        },
      }));

      this.clients.set('sec', new SECEdgarClient({
        name: 'SEC_EDGAR',
        baseURL: 'https://data.sec.gov',
        timeout: 30000,
        headers: {
          'User-Agent': 'StockGenius info@stockgenius.com',
        },
        retry: {
          maxRetries: 2,
          baseDelay: 10000,
          maxDelay: 60000,
          backoffMultiplier: 2,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
        rateLimit: {
          requestsPerSecond: 0.1, // Be very respectful to SEC
          requestsPerMinute: 6,
          requestsPerHour: 360,
          burstLimit: 1,
          queueLimit: 10,
        },
        cache: {
          defaultTTL: 86400, // 24 hours for SEC filings
          maxSize: 100,
          keyPrefix: 'sec',
        },
      }));

      this.clients.set('newsscraper', new NewsScraperClient({
        name: 'NewsScraper',
        baseURL: '', // Multiple URLs
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; StockGenius/1.0)',
        },
        retry: {
          maxRetries: 2,
          baseDelay: 3000,
          maxDelay: 20000,
          backoffMultiplier: 2,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
        rateLimit: {
          requestsPerSecond: 0.2,
          requestsPerMinute: 12,
          requestsPerHour: 720,
          burstLimit: 2,
          queueLimit: 30,
        },
        cache: {
          defaultTTL: 1800, // 30 minutes for scraped news
          maxSize: 500,
          keyPrefix: 'newsscraper',
        },
      }));

      loggerUtils.apiLogger.info('DataHub clients initialized', {
        clientCount: this.clients.size,
        clients: Array.from(this.clients.keys()),
      });

    } catch (error) {
      loggerUtils.apiLogger.error('Failed to initialize DataHub clients', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Setup source priorities for different data types
   */
  private setupSourcePriorities(): void {
    // Define priority orders for each data type
    this.sourcePriorities.set('quote', {
      primary: ['finnhub', 'polygon'],
      fallback: ['alphavantage'],
      free: ['yahoo'],
    });

    this.sourcePriorities.set('profile', {
      primary: ['finnhub', 'alphavantage'],
      fallback: ['polygon'],
      free: ['yahoo'],
    });

    this.sourcePriorities.set('news', {
      primary: ['finnhub', 'polygon'],
      fallback: ['alphavantage'],
      free: ['newsscraper', 'yahoo'],
    });

    this.sourcePriorities.set('financials', {
      primary: ['alphavantage', 'polygon'],
      fallback: ['finnhub'],
      free: ['sec', 'yahoo'],
    });

    this.sourcePriorities.set('earnings', {
      primary: ['finnhub', 'alphavantage'],
      fallback: ['polygon'],
      free: ['yahoo'],
    });

    this.sourcePriorities.set('insider', {
      primary: ['quiver'],
      fallback: [],
      free: ['sec'],
    });

    this.sourcePriorities.set('congressional', {
      primary: ['quiver'],
      fallback: [],
      free: [],
    });

    this.sourcePriorities.set('options', {
      primary: ['polygon', 'alphavantage'],
      fallback: ['finnhub'],
      free: [],
    });

    this.sourcePriorities.set('technical', {
      primary: ['alphavantage', 'finnhub'],
      fallback: ['polygon'],
      free: ['yahoo'],
    });

    this.sourcePriorities.set('trends', {
      primary: [],
      fallback: [],
      free: ['trends'],
    });

    this.sourcePriorities.set('filings', {
      primary: [],
      fallback: [],
      free: ['sec'],
    });

    this.sourcePriorities.set('sentiment', {
      primary: ['quiver'],
      fallback: [],
      free: ['newsscraper', 'trends'],
    });
  }

  /**
   * Fetch comprehensive data for a symbol
   */
  async fetchData(request: DataRequest): Promise<DataResponse> {
    const startTime = Date.now();
    const { symbol, dataTypes, options = {} } = request;

    logHelpers.logApiRequest('DataHub', 'fetchData', symbol, {
      dataTypes,
      options,
    });

    const response: DataResponse = {
      symbol,
      data: {} as Record<DataType, ProcessingResult>,
      metadata: {
        sources: {},
        cachingInfo: {},
        processingTime: 0,
        errors: [],
        warnings: [],
      },
    };

    // Process each data type
    const promises = dataTypes.map(async (dataType) => {
      try {
        const result = await this.fetchDataType(symbol, dataType, options);
        response.data[dataType] = result.processedData;
        response.metadata.sources[dataType] = result.source;
        response.metadata.cachingInfo[dataType] = result.cacheInfo;
      } catch (error) {
        response.metadata.errors.push(`${dataType}: ${error.message}`);
        
        // Create empty result for failed data type
        response.data[dataType] = {
          success: false,
          errors: [error.message],
          warnings: [],
          statistics: {
            totalInputs: 0,
            successfullyProcessed: 0,
            duplicatesRemoved: 0,
            anomaliesDetected: 0,
            contextTagsAdded: 0,
            processingTime: 0,
            cacheHits: 0,
            cacheMisses: 0,
            aiCallsMade: 0,
          },
        };
      }
    });

    await Promise.allSettled(promises);

    response.metadata.processingTime = Date.now() - startTime;

    logHelpers.logApiResponse('DataHub', 'fetchData', symbol, response.metadata.processingTime, 200, {
      dataTypes,
      sources: response.metadata.sources,
      errors: response.metadata.errors.length,
    });

    return response;
  }

  /**
   * Fetch a specific data type with fallback logic
   */
  private async fetchDataType(
    symbol: string,
    dataType: DataType,
    options: any
  ): Promise<{
    processedData: ProcessingResult;
    source: string;
    cacheInfo: any;
  }> {
    const priorities = this.sourcePriorities.get(dataType);
    if (!priorities) {
      throw new Error(`No source configuration for data type: ${dataType}`);
    }

    const { fallbackEnabled = true, sources, maxAge } = options;
    let sourcesToTry: string[] = [];

    // Determine which sources to try
    if (sources && sources.length > 0) {
      sourcesToTry = sources;
    } else {
      // Use priority order
      sourcesToTry = [
        ...priorities.primary,
        ...(fallbackEnabled ? priorities.fallback : []),
        ...(fallbackEnabled ? priorities.free : []),
      ];
    }

    // Filter to only available clients
    sourcesToTry = sourcesToTry.filter(source => this.clients.has(source));

    let lastError: Error | null = null;
    
    for (const source of sourcesToTry) {
      try {
        // Check health status
        if (!this.healthStatus.get(source)) {
          loggerUtils.apiLogger.warn('Skipping unhealthy source', {
            source,
            dataType,
            symbol,
          });
          continue;
        }

        const client = this.clients.get(source)!;
        const rawData = await this.fetchFromSource(client, symbol, dataType, { maxAge });

        if (!rawData || (Array.isArray(rawData) && rawData.length === 0)) {
          loggerUtils.apiLogger.warn('No data returned from source', {
            source,
            dataType,
            symbol,
          });
          continue;
        }

        // Process the raw data
        const processedData = await this.processData(rawData, dataType, symbol, options.processingOptions);

        return {
          processedData,
          source,
          cacheInfo: {
            cached: false,
            ttl: client.constructor.name.includes('cache') ? 'cached' : 'fresh',
          },
        };

      } catch (error) {
        lastError = error;
        loggerUtils.apiLogger.warn('Source failed, trying next', {
          source,
          dataType,
          symbol,
          error: error.message,
        });

        // Mark source as potentially unhealthy
        this.healthStatus.set(source, false);
        continue;
      }
    }

    // If all sources failed, throw the last error
    throw lastError || new Error(`No available sources for ${dataType}`);
  }

  /**
   * Fetch data from a specific source
   */
  private async fetchFromSource(
    client: BaseClient,
    symbol: string,
    dataType: DataType,
    options: any
  ): Promise<any> {
    const clientName = client.constructor.name.toLowerCase();

    switch (dataType) {
      case 'quote':
        if (clientName.includes('finnhub')) {
          return await (client as FinnhubClient).getQuote(symbol);
        } else if (clientName.includes('polygon')) {
          return await (client as PolygonClient).getLastTrade(symbol);
        } else if (clientName.includes('alphavantage')) {
          return await (client as AlphaVantageClient).getGlobalQuote(symbol);
        } else if (clientName.includes('yahoo')) {
          return await (client as YahooFinanceClient).getQuote(symbol);
        }
        break;

      case 'profile':
        if (clientName.includes('finnhub')) {
          return await (client as FinnhubClient).getCompanyProfile(symbol);
        } else if (clientName.includes('alphavantage')) {
          return await (client as AlphaVantageClient).getCompanyOverview(symbol);
        } else if (clientName.includes('yahoo')) {
          return await (client as YahooFinanceClient).getCompanyInfo(symbol);
        }
        break;

      case 'news':
        if (clientName.includes('finnhub')) {
          return await (client as FinnhubClient).getCompanyNews(symbol);
        } else if (clientName.includes('newsscraper')) {
          return await (client as NewsScraperClient).scrapeSymbolNews(symbol);
        }
        break;

      case 'financials':
        if (clientName.includes('alphavantage')) {
          return await (client as AlphaVantageClient).getIncomeStatement(symbol);
        } else if (clientName.includes('sec')) {
          return await (client as SECEdgarClient).getCompanyFilings(symbol, ['10-K', '10-Q']);
        }
        break;

      case 'insider':
        if (clientName.includes('quiver')) {
          return await (client as QuiverClient).getInsiderTrading(symbol);
        } else if (clientName.includes('sec')) {
          return await (client as SECEdgarClient).getInsiderTransactions(symbol);
        }
        break;

      case 'congressional':
        if (clientName.includes('quiver')) {
          return await (client as QuiverClient).getCongressionalTrading(symbol);
        }
        break;

      case 'trends':
        if (clientName.includes('trends')) {
          return await (client as GoogleTrendsClient).getSymbolTrends(symbol);
        }
        break;

      case 'filings':
        if (clientName.includes('sec')) {
          return await (client as SECEdgarClient).getCompanyFilings(symbol);
        }
        break;

      case 'sentiment':
        if (clientName.includes('quiver')) {
          return await (client as QuiverClient).getSentimentData(symbol);
        } else if (clientName.includes('newsscraper')) {
          return await (client as NewsScraperClient).analyzeSentiment(symbol);
        }
        break;

      default:
        throw new Error(`Unsupported data type: ${dataType} for client: ${clientName}`);
    }

    throw new Error(`No method found for ${dataType} on ${clientName}`);
  }

  /**
   * Process raw data using the preprocessing service
   */
  private async processData(
    rawData: any,
    dataType: DataType,
    symbol: string,
    processingOptions?: any
  ): Promise<ProcessingResult> {
    try {
      // Map DataHub data types to preprocessing service types
      const typeMapping: Record<DataType, string> = {
        quote: 'quote',
        profile: 'profile',
        news: 'news',
        financials: 'financials',
        earnings: 'financials',
        insider: 'insider',
        congressional: 'congressional',
        options: 'quote', // Process as quote-like data
        technical: 'quote',
        trends: 'news', // Process trends as news-like data
        filings: 'news', // Process filings as news-like data
        sentiment: 'news',
      };

      const processType = typeMapping[dataType];
      if (!processType) {
        throw new Error(`No processing type mapping for: ${dataType}`);
      }

      // Use appropriate processing method
      switch (processType) {
        case 'quote':
          return await processingService.processQuotes(
            Array.isArray(rawData) ? rawData : [rawData],
            symbol,
            processingOptions
          );

        case 'news':
          return await processingService.processNews(
            Array.isArray(rawData) ? rawData : [rawData],
            symbol,
            processingOptions
          );

        case 'profile':
          return await processingService.processProfiles(
            Array.isArray(rawData) ? rawData : [rawData],
            symbol,
            processingOptions
          );

        case 'financials':
          return await processingService.processFinancials(
            Array.isArray(rawData) ? rawData : [rawData],
            symbol,
            processingOptions
          );

        case 'insider':
          return await processingService.processInsiderTrades(
            Array.isArray(rawData) ? rawData : [rawData],
            symbol,
            processingOptions
          );

        case 'congressional':
          return await processingService.processCongressionalTrades(
            Array.isArray(rawData) ? rawData : [rawData],
            symbol,
            processingOptions
          );

        default:
          throw new Error(`Unsupported processing type: ${processType}`);
      }
    } catch (error) {
      loggerUtils.apiLogger.error('Data processing failed', {
        dataType,
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start health monitoring for all clients
   */
  private startHealthMonitoring(): void {
    // Initial health check
    this.performHealthCheck();

    // Schedule regular health checks
    setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Perform health checks on all clients
   */
  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();
    
    loggerUtils.apiLogger.info('Starting health check for all clients');

    const promises = Array.from(this.clients.entries()).map(async ([name, client]) => {
      try {
        const isHealthy = await client.validateConnection();
        this.healthStatus.set(name, isHealthy);
        return { name, healthy: isHealthy };
      } catch (error) {
        this.healthStatus.set(name, false);
        loggerUtils.apiLogger.warn('Health check failed', {
          client: name,
          error: error.message,
        });
        return { name, healthy: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(promises);
    
    const healthSummary = results.map(result => 
      result.status === 'fulfilled' ? result.value : { name: 'unknown', healthy: false }
    );

    this.lastHealthCheck = Date.now();

    loggerUtils.apiLogger.info('Health check completed', {
      duration: Date.now() - startTime,
      results: healthSummary,
      healthyCount: healthSummary.filter(r => r.healthy).length,
      totalCount: healthSummary.length,
    });
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    clients: Record<string, any>;
    lastCheck: number;
  }> {
    const clientStatuses = {};
    
    for (const [name, client] of this.clients) {
      try {
        clientStatuses[name] = await client.healthCheck();
      } catch (error) {
        clientStatuses[name] = {
          status: 'unhealthy',
          details: { error: error.message },
        };
      }
    }

    const healthyCount = Object.values(clientStatuses).filter(
      (status: any) => status.status === 'healthy'
    ).length;

    const totalCount = Object.keys(clientStatuses).length;
    const healthyRatio = healthyCount / totalCount;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyRatio >= 0.8) {
      overall = 'healthy';
    } else if (healthyRatio >= 0.5) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      clients: clientStatuses,
      lastCheck: this.lastHealthCheck,
    };
  }

  /**
   * Get statistics for all clients
   */
  getStatistics(): Record<string, any> {
    const stats = {};
    
    for (const [name, client] of this.clients) {
      stats[name] = client.getStatistics();
    }

    return {
      clients: stats,
      healthStatus: Object.fromEntries(this.healthStatus),
      lastHealthCheck: this.lastHealthCheck,
      totalClients: this.clients.size,
    };
  }

  /**
   * Clear cache for specific symbol or data type
   */
  async clearCache(symbol?: string, dataType?: DataType): Promise<Record<string, number>> {
    const results = {};
    
    for (const [name, client] of this.clients) {
      try {
        const pattern = symbol ? `*${symbol}*` : dataType ? `*${dataType}*` : undefined;
        results[name] = await client.clearCache(pattern);
      } catch (error) {
        results[name] = 0;
        loggerUtils.cacheLogger.warn('Cache clear failed', {
          client: name,
          symbol,
          dataType,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Gracefully shutdown all clients
   */
  async shutdown(): Promise<void> {
    loggerUtils.apiLogger.info('Shutting down DataHub');
    
    // Here you would implement any cleanup logic for clients
    // Most HTTP clients don't need explicit cleanup, but if using persistent connections
    // or websockets, you'd close them here
    
    this.clients.clear();
    this.healthStatus.clear();
  }
}

// Export singleton instance
export const dataHub = new DataHub();

export default DataHub;
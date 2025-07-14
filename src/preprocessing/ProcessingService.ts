/**
 * High-level processing service that orchestrates data preprocessing
 * Provides simplified interface for the application
 */

import DataProcessor from './DataProcessor.js';
import { ProcessingOptions, ProcessingResult, ProcessedDataPoint } from '../types/data.js';
import { logHelpers, loggerUtils } from '../config/logger.js';
import { cacheUtils } from '../config/redis.js';

export class ProcessingService {
  private processor: DataProcessor;
  private isInitialized: boolean = false;

  constructor() {
    this.processor = new DataProcessor();
  }

  /**
   * Initialize the processing service
   */
  async initialize(): Promise<void> {
    try {
      loggerUtils.performanceLogger.info('Initializing ProcessingService');
      this.isInitialized = true;
    } catch (error) {
      loggerUtils.performanceLogger.error('ProcessingService initialization failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process stock quote data
   */
  async processQuotes(
    rawQuotes: any[], 
    symbol?: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    this.ensureInitialized();
    
    logHelpers.logPerformance('quote_processing_start', 0, {
      symbol,
      count: rawQuotes.length,
    });

    const defaultOptions: Partial<ProcessingOptions> = {
      enableAI: false, // Skip AI for quotes to save costs
      enableCaching: true,
      enableDeduplication: true,
      enableAnomalyDetection: true,
      enableContextTagging: true,
      cacheTTL: 60, // 1 minute for quotes
    };

    try {
      const result = await this.processor.processData(
        rawQuotes, 
        'quote', 
        symbol, 
        { ...defaultOptions, ...options }
      );

      logHelpers.logPerformance('quote_processing_complete', result.statistics.processingTime, {
        symbol,
        success: result.success,
        processed: result.statistics.successfullyProcessed,
        anomalies: result.statistics.anomaliesDetected,
      });

      return result;
    } catch (error) {
      loggerUtils.performanceLogger.error('Quote processing failed', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process news data with AI enhancement
   */
  async processNews(
    rawNews: any[], 
    symbol?: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    this.ensureInitialized();

    logHelpers.logPerformance('news_processing_start', 0, {
      symbol,
      count: rawNews.length,
    });

    const defaultOptions: Partial<ProcessingOptions> = {
      enableAI: true, // Enable AI for news sentiment
      enableCaching: true,
      enableDeduplication: true,
      enableAnomalyDetection: true,
      enableContextTagging: true,
      aiModel: 'gpt-3.5-turbo',
      cacheTTL: 1800, // 30 minutes for news
    };

    try {
      const result = await this.processor.processData(
        rawNews, 
        'news', 
        symbol, 
        { ...defaultOptions, ...options }
      );

      logHelpers.logPerformance('news_processing_complete', result.statistics.processingTime, {
        symbol,
        success: result.success,
        processed: result.statistics.successfullyProcessed,
        aiCalls: result.statistics.aiCallsMade,
        sentiment: this.calculateAverageSentiment(result.data),
      });

      return result;
    } catch (error) {
      loggerUtils.performanceLogger.error('News processing failed', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process company profile data
   */
  async processProfiles(
    rawProfiles: any[], 
    symbol?: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    this.ensureInitialized();

    const defaultOptions: Partial<ProcessingOptions> = {
      enableAI: false,
      enableCaching: true,
      enableDeduplication: true,
      enableAnomalyDetection: false, // Profiles don't change often
      enableContextTagging: false,
      cacheTTL: 86400, // 24 hours for profiles
    };

    return await this.processor.processData(
      rawProfiles, 
      'profile', 
      symbol, 
      { ...defaultOptions, ...options }
    );
  }

  /**
   * Process financial data
   */
  async processFinancials(
    rawFinancials: any[], 
    symbol?: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    this.ensureInitialized();

    const defaultOptions: Partial<ProcessingOptions> = {
      enableAI: false,
      enableCaching: true,
      enableDeduplication: true,
      enableAnomalyDetection: true,
      enableContextTagging: true,
      cacheTTL: 43200, // 12 hours for financials
    };

    return await this.processor.processData(
      rawFinancials, 
      'financials', 
      symbol, 
      { ...defaultOptions, ...options }
    );
  }

  /**
   * Process insider trading data
   */
  async processInsiderTrades(
    rawTrades: any[], 
    symbol?: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    this.ensureInitialized();

    const defaultOptions: Partial<ProcessingOptions> = {
      enableAI: false,
      enableCaching: true,
      enableDeduplication: true,
      enableAnomalyDetection: true,
      enableContextTagging: true,
      cacheTTL: 3600, // 1 hour for insider trades
    };

    return await this.processor.processData(
      rawTrades, 
      'insider', 
      symbol, 
      { ...defaultOptions, ...options }
    );
  }

  /**
   * Process congressional trading data
   */
  async processCongressionalTrades(
    rawTrades: any[], 
    symbol?: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    this.ensureInitialized();

    const defaultOptions: Partial<ProcessingOptions> = {
      enableAI: false,
      enableCaching: true,
      enableDeduplication: true,
      enableAnomalyDetection: true,
      enableContextTagging: true,
      cacheTTL: 3600, // 1 hour for congressional trades
    };

    return await this.processor.processData(
      rawTrades, 
      'congressional', 
      symbol, 
      { ...defaultOptions, ...options }
    );
  }

  /**
   * Process mixed data types in batch
   */
  async processBatch(batches: Array<{
    data: any[];
    type: string;
    symbol?: string;
    options?: Partial<ProcessingOptions>;
  }>): Promise<Map<string, ProcessingResult>> {
    this.ensureInitialized();

    const results = new Map<string, ProcessingResult>();
    
    logHelpers.logPerformance('batch_processing_start', 0, {
      batchCount: batches.length,
    });

    // Process batches in parallel for better performance
    const promises = batches.map(async (batch, index) => {
      const key = `${batch.type}_${batch.symbol || 'global'}_${index}`;
      
      try {
        const result = await this.processor.processData(
          batch.data,
          batch.type,
          batch.symbol,
          batch.options
        );
        
        results.set(key, result);
        return { key, success: true };
      } catch (error) {
        const errorResult: ProcessingResult = {
          success: false,
          errors: [error.message],
          warnings: [],
          statistics: {
            totalInputs: batch.data.length,
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
        
        results.set(key, errorResult);
        return { key, success: false, error: error.message };
      }
    });

    const batchResults = await Promise.allSettled(promises);
    
    const successful = batchResults.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;

    logHelpers.logPerformance('batch_processing_complete', 0, {
      batchCount: batches.length,
      successful,
      failed: batches.length - successful,
    });

    return results;
  }

  /**
   * Get comprehensive processing statistics
   */
  getProcessingStatistics(): Record<string, any> {
    this.ensureInitialized();
    return this.processor.getProcessingStats();
  }

  /**
   * Clear cached data for a symbol or globally
   */
  async clearCache(symbol?: string, dataType?: string): Promise<number> {
    this.ensureInitialized();

    let pattern: string;
    
    if (symbol && dataType) {
      pattern = `cache:*${dataType}*${symbol}*`;
    } else if (symbol) {
      pattern = `cache:*${symbol}*`;
    } else if (dataType) {
      pattern = `cache:*${dataType}*`;
    } else {
      pattern = 'cache:*';
    }

    const cleared = await cacheUtils.clearPattern(pattern);

    logHelpers.logCacheOperation('clear_pattern', pattern, false, 0, {
      clearedCount: cleared,
      symbol,
      dataType,
    });

    return cleared;
  }

  /**
   * Health check for the processing service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, any>;
    metrics: Record<string, any>;
  }> {
    const health = {
      status: 'healthy' as const,
      components: {
        processor: 'healthy',
        cache: 'unknown',
        ai: 'unknown',
      },
      metrics: {},
    };

    try {
      // Check processor
      health.components.processor = this.isInitialized ? 'healthy' : 'unhealthy';

      // Check cache connectivity
      try {
        await cacheUtils.set('health_check', Date.now(), 60);
        await cacheUtils.get('health_check');
        health.components.cache = 'healthy';
      } catch {
        health.components.cache = 'degraded';
      }

      // Check AI availability
      try {
        // Simple test to see if OpenAI is configured
        health.components.ai = process.env.OPENAI_API_KEY ? 'healthy' : 'degraded';
      } catch {
        health.components.ai = 'unhealthy';
      }

      // Get processing metrics
      health.metrics = this.getProcessingStatistics();

      // Determine overall status
      const componentStatuses = Object.values(health.components);
      if (componentStatuses.includes('unhealthy')) {
        health.status = 'unhealthy';
      } else if (componentStatuses.includes('degraded')) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.components.processor = 'unhealthy';
      
      loggerUtils.performanceLogger.error('Health check failed', {
        error: error.message,
      });
    }

    return health;
  }

  /**
   * Validate input data before processing
   */
  validateInput(data: any[], dataType: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(data)) {
      errors.push('Input data must be an array');
      return { valid: false, errors };
    }

    if (data.length === 0) {
      errors.push('Input data array is empty');
      return { valid: false, errors };
    }

    const validTypes = ['quote', 'news', 'profile', 'financials', 'insider', 'congressional'];
    if (!validTypes.includes(dataType)) {
      errors.push(`Invalid data type: ${dataType}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Type-specific validation
    switch (dataType) {
      case 'quote':
        data.forEach((item, index) => {
          if (typeof item !== 'object') {
            errors.push(`Quote item ${index} must be an object`);
          }
        });
        break;
      
      case 'news':
        data.forEach((item, index) => {
          if (!item.headline && !item.title) {
            errors.push(`News item ${index} missing headline/title`);
          }
        });
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('ProcessingService not initialized. Call initialize() first.');
    }
  }

  private calculateAverageSentiment(data?: ProcessedDataPoint[]): number | null {
    if (!data || data.length === 0) return null;

    const sentimentScores = data
      .filter(d => d.normalized.type === 'news')
      .map(d => (d.normalized as any).sentiment?.score)
      .filter(score => typeof score === 'number');

    if (sentimentScores.length === 0) return null;

    return sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length;
  }
}

// Export singleton instance
export const processingService = new ProcessingService();

export default ProcessingService;
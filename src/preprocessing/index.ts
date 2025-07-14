/**
 * Data preprocessing module exports
 * Provides comprehensive data processing capabilities for StockGenius
 */

export { default as DataProcessor } from './DataProcessor.js';
export { ProcessingService, processingService } from './ProcessingService.js';

// Re-export all types for convenience
export * from '../types/data.js';

/**
 * Quick processing functions for common use cases
 */

import { processingService } from './ProcessingService.js';
import { ProcessingResult } from '../types/data.js';

/**
 * Quick process function for mixed API data
 */
export async function quickProcess(
  data: any,
  symbol?: string,
  options?: { enableAI?: boolean; cacheTTL?: number }
): Promise<ProcessingResult> {
  // Auto-detect data type based on structure
  const dataType = detectDataType(data);
  
  if (!dataType) {
    throw new Error('Unable to detect data type from input');
  }

  const dataArray = Array.isArray(data) ? data : [data];
  
  switch (dataType) {
    case 'quote':
      return await processingService.processQuotes(dataArray, symbol, options);
    case 'news':
      return await processingService.processNews(dataArray, symbol, options);
    case 'profile':
      return await processingService.processProfiles(dataArray, symbol, options);
    case 'financials':
      return await processingService.processFinancials(dataArray, symbol, options);
    case 'insider':
      return await processingService.processInsiderTrades(dataArray, symbol, options);
    case 'congressional':
      return await processingService.processCongressionalTrades(dataArray, symbol, options);
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }
}

/**
 * Process multiple data sources for a symbol
 */
export async function processSymbolData(
  symbol: string,
  data: {
    quotes?: any[];
    news?: any[];
    profile?: any[];
    financials?: any[];
    insider?: any[];
    congressional?: any[];
  },
  options?: { enableAI?: boolean; cacheTTL?: number }
): Promise<Record<string, ProcessingResult>> {
  const results: Record<string, ProcessingResult> = {};
  
  const promises = Object.entries(data).map(async ([type, items]) => {
    if (!items || items.length === 0) return null;
    
    try {
      let result: ProcessingResult;
      
      switch (type) {
        case 'quotes':
          result = await processingService.processQuotes(items, symbol, options);
          break;
        case 'news':
          result = await processingService.processNews(items, symbol, options);
          break;
        case 'profile':
          result = await processingService.processProfiles(items, symbol, options);
          break;
        case 'financials':
          result = await processingService.processFinancials(items, symbol, options);
          break;
        case 'insider':
          result = await processingService.processInsiderTrades(items, symbol, options);
          break;
        case 'congressional':
          result = await processingService.processCongressionalTrades(items, symbol, options);
          break;
        default:
          return null;
      }
      
      return { type, result };
    } catch (error) {
      return { 
        type, 
        result: {
          success: false,
          errors: [error.message],
          warnings: [],
          statistics: {
            totalInputs: items.length,
            successfullyProcessed: 0,
            duplicatesRemoved: 0,
            anomaliesDetected: 0,
            contextTagsAdded: 0,
            processingTime: 0,
            cacheHits: 0,
            cacheMisses: 0,
            aiCallsMade: 0,
          },
        }
      };
    }
  });
  
  const settled = await Promise.allSettled(promises);
  
  settled.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      results[result.value.type] = result.value.result;
    }
  });
  
  return results;
}

/**
 * Auto-detect data type from structure
 */
function detectDataType(data: any): string | null {
  const item = Array.isArray(data) ? data[0] : data;
  
  if (!item || typeof item !== 'object') {
    return null;
  }

  // Quote detection
  if (hasFields(item, ['c', 'dp']) || hasFields(item, ['price', 'change']) || hasFields(item, ['close', 'open'])) {
    return 'quote';
  }

  // News detection
  if (hasFields(item, ['headline']) || hasFields(item, ['title', 'summary']) || hasFields(item, ['article_url'])) {
    return 'news';
  }

  // Profile detection
  if (hasFields(item, ['name', 'sector']) || hasFields(item, ['Name', 'Industry']) || hasFields(item, ['marketCapitalization'])) {
    return 'profile';
  }

  // Financials detection
  if (hasFields(item, ['revenue', 'netIncome']) || hasFields(item, ['totalRevenue']) || hasFields(item, ['fiscalDateEnding'])) {
    return 'financials';
  }

  // Insider trading detection
  if (hasFields(item, ['Name', 'Transaction']) || hasFields(item, ['traderName', 'shares']) || hasFields(item, ['Title', 'Shares'])) {
    return 'insider';
  }

  // Congressional trading detection
  if (hasFields(item, ['Representative', 'Chamber']) || hasFields(item, ['representative', 'party']) || hasFields(item, ['Party', 'State'])) {
    return 'congressional';
  }

  return null;
}

/**
 * Check if object has specific fields
 */
function hasFields(obj: any, fields: string[]): boolean {
  return fields.every(field => obj.hasOwnProperty(field));
}

/**
 * Utility functions for working with processed data
 */
export const processingUtils = {
  /**
   * Extract sentiment summary from news data
   */
  extractSentimentSummary(results: ProcessingResult) {
    if (!results.success || !results.data) {
      return null;
    }

    const newsItems = results.data.filter(d => d.normalized.type === 'news');
    const sentiments = newsItems
      .map(item => (item.normalized as any).sentiment)
      .filter(sentiment => sentiment !== undefined);

    if (sentiments.length === 0) {
      return null;
    }

    const averageScore = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;
    const positive = sentiments.filter(s => s.label === 'positive').length;
    const negative = sentiments.filter(s => s.label === 'negative').length;
    const neutral = sentiments.filter(s => s.label === 'neutral').length;

    return {
      averageScore,
      distribution: { positive, negative, neutral },
      total: sentiments.length,
      confidence: sentiments.reduce((sum, s) => sum + s.confidence, 0) / sentiments.length,
    };
  },

  /**
   * Extract anomaly summary
   */
  extractAnomalySummary(results: ProcessingResult) {
    if (!results.success || !results.data) {
      return null;
    }

    const allAnomalies = results.data.flatMap(d => d.anomalies);
    const byType = allAnomalies.reduce((acc, anomaly) => {
      acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySeverity = allAnomalies.reduce((acc, anomaly) => {
      acc[anomaly.severity] = (acc[anomaly.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: allAnomalies.length,
      byType,
      bySeverity,
      needsReview: allAnomalies.filter(a => a.suggestedAction === 'flag_for_review').length,
    };
  },

  /**
   * Extract context tags summary
   */
  extractContextSummary(results: ProcessingResult) {
    if (!results.success || !results.data) {
      return null;
    }

    const allTags = results.data.flatMap(d => d.contextTags);
    const byType = allTags.reduce((acc, tag) => {
      acc[tag.type] = (acc[tag.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySource = allTags.reduce((acc, tag) => {
      acc[tag.source] = (acc[tag.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: allTags.length,
      byType,
      bySource,
      averageConfidence: allTags.reduce((sum, tag) => sum + tag.confidence, 0) / allTags.length || 0,
    };
  },

  /**
   * Get reliability scores summary
   */
  extractReliabilitySummary(results: ProcessingResult) {
    if (!results.success || !results.data) {
      return null;
    }

    const scores = results.data.map(d => d.normalized.reliability);
    const sources = results.data.reduce((acc, d) => {
      const provider = d.normalized.source.provider;
      if (!acc[provider]) {
        acc[provider] = { count: 0, totalScore: 0 };
      }
      acc[provider].count += 1;
      acc[provider].totalScore += d.normalized.reliability;
      return acc;
    }, {} as Record<string, { count: number; totalScore: number }>);

    const sourceAverages = Object.entries(sources).reduce((acc, [provider, data]) => {
      acc[provider] = data.totalScore / data.count;
      return acc;
    }, {} as Record<string, number>);

    return {
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length || 0,
      min: Math.min(...scores),
      max: Math.max(...scores),
      bySource: sourceAverages,
    };
  },
};

/**
 * Processing configuration presets
 */
export const processingPresets = {
  // Fast processing for real-time data
  realTime: {
    enableAI: false,
    enableCaching: true,
    enableDeduplication: true,
    enableAnomalyDetection: false,
    enableContextTagging: false,
    cacheTTL: 60,
  },

  // Comprehensive processing for analysis
  comprehensive: {
    enableAI: true,
    enableCaching: true,
    enableDeduplication: true,
    enableAnomalyDetection: true,
    enableContextTagging: true,
    aiModel: 'gpt-3.5-turbo',
    cacheTTL: 300,
  },

  // Cost-effective processing
  costEffective: {
    enableAI: false,
    enableCaching: true,
    enableDeduplication: true,
    enableAnomalyDetection: true,
    enableContextTagging: false,
    cacheTTL: 600,
  },

  // High-quality processing for important decisions
  highQuality: {
    enableAI: true,
    enableCaching: true,
    enableDeduplication: true,
    enableAnomalyDetection: true,
    enableContextTagging: true,
    aiModel: 'gpt-4-turbo-preview',
    cacheTTL: 1800,
    reliabilityThreshold: 0.8,
  },
};
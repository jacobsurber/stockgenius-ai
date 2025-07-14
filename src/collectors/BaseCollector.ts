/**
 * Base collector class with common functionality
 */

import { BaseCollector as IBaseCollector, CollectorConfig, CollectorMetrics, CollectedData } from './types.js';
import { loggerUtils } from '../config/logger.js';
import { openAIClient } from '../config/openai.js';

export abstract class BaseCollector implements IBaseCollector {
  public name: string;
  public config: CollectorConfig;
  public metrics: CollectorMetrics;
  
  private isCollecting = false;
  private collectionInterval?: NodeJS.Timeout;

  constructor(name: string, config: CollectorConfig) {
    this.name = name;
    this.config = config;
    this.metrics = {
      totalCollections: 0,
      successRate: 1.0,
      avgResponseTime: 0,
      lastUpdate: 0,
      errors: [],
    };
  }

  abstract collectData(symbol?: string, options?: Record<string, any>): Promise<CollectedData>;

  /**
   * Main collection method with error handling and metrics
   */
  async collect(symbol?: string, options?: Record<string, any>): Promise<CollectedData> {
    if (!this.config.enabled) {
      throw new Error(`Collector ${this.name} is disabled`);
    }

    const startTime = Date.now();
    this.metrics.totalCollections++;

    try {
      const data = await this.collectData(symbol, options);
      
      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);
      this.metrics.lastUpdate = Date.now();
      
      // Log successful collection
      loggerUtils.dataLogger.info(`${this.name} collection completed`, {
        symbol,
        itemCount: data.data.length,
        responseTime,
        avgConfidence: data.summary.avgConfidence,
      });

      return data;
    } catch (error) {
      // Handle errors and update metrics
      this.handleError(error as Error, { symbol, options });
      throw error;
    }
  }

  /**
   * Health check for the collector
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Check if we can perform a basic collection
      await this.collect(undefined, { healthCheck: true });
      return true;
    } catch (error) {
      loggerUtils.dataLogger.warn(`${this.name} health check failed`, {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): CollectorMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CollectorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    loggerUtils.dataLogger.info(`${this.name} configuration updated`, {
      newConfig,
    });
  }

  /**
   * Start automatic collection
   */
  startAutoCollection(symbols?: string[]): void {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.collectionInterval = setInterval(async () => {
      try {
        if (symbols && symbols.length > 0) {
          // Collect for specific symbols
          for (const symbol of symbols) {
            await this.collect(symbol);
            // Add delay between symbols to avoid rate limiting
            await this.delay(1000);
          }
        } else {
          // General collection
          await this.collect();
        }
      } catch (error) {
        loggerUtils.dataLogger.error(`${this.name} auto-collection failed`, {
          error: (error as Error).message,
        });
      }
    }, this.config.updateInterval);

    loggerUtils.dataLogger.info(`${this.name} auto-collection started`, {
      interval: this.config.updateInterval,
      symbols,
    });
  }

  /**
   * Stop automatic collection
   */
  stopAutoCollection(): void {
    if (!this.isCollecting) {
      return;
    }

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }

    this.isCollecting = false;
    
    loggerUtils.dataLogger.info(`${this.name} auto-collection stopped`);
  }

  /**
   * Process text for sentiment analysis
   */
  protected async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    magnitude: number;
    keywords: string[];
  }> {
    try {
      const prompt = `Analyze the sentiment of this financial text and extract key financial terms:

Text: "${text.substring(0, 1000)}"

Respond with JSON only:
{
  "sentiment": "positive|negative|neutral",
  "score": number between -1 and 1,
  "magnitude": number between 0 and 1,
  "keywords": ["array", "of", "financial", "keywords"]
}`;

      const response = await openAIClient.createCompletion({
        prompt,
        maxTokens: 200,
        temperature: 0.1,
      });

      const analysis = JSON.parse(response.text);
      
      return {
        sentiment: analysis.sentiment || 'neutral',
        score: this.clamp(analysis.score || 0, -1, 1),
        magnitude: this.clamp(analysis.magnitude || 0, 0, 1),
        keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
      };
    } catch (error) {
      // Fallback to simple sentiment analysis
      return this.simpleSentimentAnalysis(text);
    }
  }

  /**
   * Simple fallback sentiment analysis
   */
  protected simpleSentimentAnalysis(text: string): {
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    magnitude: number;
    keywords: string[];
  } {
    const positiveWords = ['bullish', 'buy', 'strong', 'growth', 'up', 'gain', 'profit', 'good', 'great', 'excellent'];
    const negativeWords = ['bearish', 'sell', 'weak', 'decline', 'down', 'loss', 'bad', 'terrible', 'crash', 'drop'];
    
    const textLower = text.toLowerCase();
    let score = 0;
    let wordCount = 0;
    
    positiveWords.forEach(word => {
      if (textLower.includes(word)) {
        score += 1;
        wordCount++;
      }
    });
    
    negativeWords.forEach(word => {
      if (textLower.includes(word)) {
        score -= 1;
        wordCount++;
      }
    });
    
    const normalizedScore = wordCount > 0 ? score / wordCount : 0;
    const magnitude = wordCount / 20; // Rough magnitude calculation
    
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (normalizedScore > 0.1) sentiment = 'positive';
    else if (normalizedScore < -0.1) sentiment = 'negative';
    
    return {
      sentiment,
      score: this.clamp(normalizedScore, -1, 1),
      magnitude: this.clamp(magnitude, 0, 1),
      keywords: this.extractFinancialKeywords(text),
    };
  }

  /**
   * Extract financial keywords from text
   */
  protected extractFinancialKeywords(text: string): string[] {
    const financialTerms = [
      'earnings', 'revenue', 'profit', 'loss', 'dividend', 'split', 'merger', 'acquisition',
      'ipo', 'buyback', 'guidance', 'forecast', 'upgrade', 'downgrade', 'rating',
      'bullish', 'bearish', 'volatility', 'volume', 'liquidity'
    ];
    
    const textLower = text.toLowerCase();
    return financialTerms.filter(term => textLower.includes(term));
  }

  /**
   * Extract stock symbols from text
   */
  protected extractStockSymbols(text: string): string[] {
    // Look for ticker symbols (1-5 uppercase letters, possibly with dollar sign)
    const symbolRegex = /\$?([A-Z]{1,5})\b/g;
    const matches = text.match(symbolRegex);
    
    if (!matches) return [];
    
    // Clean and filter symbols
    const symbols = matches
      .map(match => match.replace('$', '').toUpperCase())
      .filter(symbol => {
        // Filter out common false positives
        const excluded = ['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE'];
        return !excluded.includes(symbol) && symbol.length >= 2;
      });
    
    // Remove duplicates
    return [...new Set(symbols)];
  }

  /**
   * Calculate significance score based on various factors
   */
  protected calculateSignificance(factors: {
    volume?: number;
    value?: number;
    timing?: number;
    source?: number;
    engagement?: number;
  }): number {
    const weights = {
      volume: 0.2,
      value: 0.3,
      timing: 0.2,
      source: 0.15,
      engagement: 0.15,
    };
    
    let score = 0;
    let totalWeight = 0;
    
    Object.entries(factors).forEach(([key, value]) => {
      if (value !== undefined && weights[key as keyof typeof weights]) {
        score += value * weights[key as keyof typeof weights];
        totalWeight += weights[key as keyof typeof weights];
      }
    });
    
    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Utility functions
   */
  protected clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected normalizeTimestamp(timestamp: any): number {
    if (typeof timestamp === 'number') {
      return timestamp > 1e12 ? timestamp : timestamp * 1000; // Convert to milliseconds if needed
    }
    
    if (typeof timestamp === 'string') {
      return new Date(timestamp).getTime();
    }
    
    return Date.now();
  }

  /**
   * Error handling
   */
  private handleError(error: Error, context: Record<string, any>): void {
    this.metrics.errors.push({
      timestamp: Date.now(),
      error: error.message,
      context,
    });

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors = this.metrics.errors.slice(-100);
    }

    // Update success rate
    const recentErrors = this.metrics.errors.filter(
      e => Date.now() - e.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    ).length;
    
    const recentTotal = Math.min(this.metrics.totalCollections, 100);
    this.metrics.successRate = Math.max(0, (recentTotal - recentErrors) / recentTotal);

    loggerUtils.dataLogger.error(`${this.name} collection error`, {
      error: error.message,
      context,
      successRate: this.metrics.successRate,
    });
  }

  private updateResponseTime(responseTime: number): void {
    // Calculate running average
    const alpha = 0.1; // Smoothing factor
    this.metrics.avgResponseTime = this.metrics.avgResponseTime === 0 
      ? responseTime 
      : (alpha * responseTime + (1 - alpha) * this.metrics.avgResponseTime);
  }
}
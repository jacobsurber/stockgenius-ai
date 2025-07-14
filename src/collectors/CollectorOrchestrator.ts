/**
 * Collector orchestrator for managing all alternative data collectors
 */

import { 
  CollectorOrchestrator as ICollectorOrchestrator,
  BaseCollector,
  CollectorStatus,
  AggregatedSignal,
  CollectorConfig,
  SentimentData,
  SocialMetrics,
  RedditPostData,
  TwitterPostData,
  InsiderTransaction,
  CongressionalTrade,
  ProcessedNewsItem
} from './types.js';
import { RedditCollector } from './RedditCollector.js';
import { TwitterCollector } from './TwitterCollector.js';
import { InsiderTradingCollector } from './InsiderTradingCollector.js';
import { CongressionalTradingCollector } from './CongressionalTradingCollector.js';
import { NewsCollector } from './NewsCollector.js';
import { DataHub } from '../api/DataHub.js';
import { loggerUtils } from '../config/logger.js';

export class CollectorOrchestrator implements ICollectorOrchestrator {
  public collectors: Map<string, BaseCollector> = new Map();
  private isRunning = false;
  private collectionInterval?: NodeJS.Timeout;
  private dataHub: DataHub;

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
    this.initializeCollectors();
  }

  /**
   * Initialize all collectors with default configurations
   */
  private initializeCollectors(): void {
    const defaultConfig: CollectorConfig = {
      enabled: true,
      updateInterval: 30 * 60 * 1000, // 30 minutes
      maxRetries: 3,
      timeout: 30000,
      cacheTTL: 1800, // 30 minutes
    };

    try {
      // Initialize Reddit collector
      const redditCollector = new RedditCollector({
        ...defaultConfig,
        updateInterval: 15 * 60 * 1000, // 15 minutes for social data
      });
      this.collectors.set('reddit', redditCollector);

      // Initialize Twitter collector
      const twitterCollector = new TwitterCollector({
        ...defaultConfig,
        updateInterval: 10 * 60 * 1000, // 10 minutes for real-time sentiment
      });
      this.collectors.set('twitter', twitterCollector);

      // Initialize Insider Trading collector
      const insiderCollector = new InsiderTradingCollector(
        {
          ...defaultConfig,
          updateInterval: 60 * 60 * 1000, // 1 hour for insider data
        },
        this.dataHub
      );
      this.collectors.set('insider', insiderCollector);

      // Initialize Congressional Trading collector
      const congressionalCollector = new CongressionalTradingCollector(
        {
          ...defaultConfig,
          updateInterval: 120 * 60 * 1000, // 2 hours for congressional data
        },
        this.dataHub
      );
      this.collectors.set('congressional', congressionalCollector);

      // Initialize News collector
      const newsCollector = new NewsCollector(
        {
          ...defaultConfig,
          updateInterval: 5 * 60 * 1000, // 5 minutes for news
        },
        this.dataHub
      );
      this.collectors.set('news', newsCollector);

      loggerUtils.dataLogger.info('All collectors initialized', {
        collectorCount: this.collectors.size,
        collectors: Array.from(this.collectors.keys()),
      });
    } catch (error) {
      loggerUtils.dataLogger.error('Failed to initialize collectors', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Add a collector to the orchestrator
   */
  addCollector(collector: BaseCollector): void {
    this.collectors.set(collector.name, collector);
    loggerUtils.dataLogger.info('Collector added', {
      name: collector.name,
      totalCollectors: this.collectors.size,
    });
  }

  /**
   * Remove a collector from the orchestrator
   */
  removeCollector(name: string): void {
    const collector = this.collectors.get(name);
    if (collector) {
      collector.stopAutoCollection();
      this.collectors.delete(name);
      loggerUtils.dataLogger.info('Collector removed', {
        name,
        totalCollectors: this.collectors.size,
      });
    }
  }

  /**
   * Collect data from all collectors and aggregate signals
   */
  async collectAll(symbol?: string): Promise<AggregatedSignal> {
    const startTime = Date.now();
    const collectionResults = new Map<string, any>();
    const errors: string[] = [];

    loggerUtils.dataLogger.info('Starting comprehensive data collection', {
      symbol,
      collectorCount: this.collectors.size,
    });

    // Collect from all enabled collectors in parallel
    const collectionPromises = Array.from(this.collectors.entries()).map(async ([name, collector]) => {
      if (!collector.config.enabled) {
        return { name, result: null, error: 'Collector disabled' };
      }

      try {
        const result = await collector.collect(symbol);
        return { name, result, error: null };
      } catch (error) {
        const errorMsg = (error as Error).message;
        errors.push(`${name}: ${errorMsg}`);
        return { name, result: null, error: errorMsg };
      }
    });

    const results = await Promise.allSettled(collectionPromises);
    
    // Process results
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { name, result: data, error } = result.value;
        if (data && !error) {
          collectionResults.set(name, data);
        }
      }
    });

    // Aggregate signals
    const aggregatedSignal = await this.aggregateSignals(symbol, collectionResults);
    
    const collectionTime = Date.now() - startTime;
    loggerUtils.dataLogger.info('Data collection completed', {
      symbol,
      collectionTime,
      successfulCollectors: collectionResults.size,
      errors: errors.length,
      overallSentiment: aggregatedSignal.overallSentiment.sentiment,
    });

    return aggregatedSignal;
  }

  /**
   * Aggregate signals from all collectors
   */
  private async aggregateSignals(symbol: string | undefined, results: Map<string, any>): Promise<AggregatedSignal> {
    const timestamp = Date.now();
    const sources = Array.from(results.keys());
    
    // Extract data from each collector
    const redditData = results.get('reddit');
    const twitterData = results.get('twitter');
    const insiderData = results.get('insider');
    const congressionalData = results.get('congressional');
    const newsData = results.get('news');

    // Calculate overall sentiment
    const overallSentiment = this.calculateOverallSentiment([
      redditData,
      twitterData,
      newsData,
    ]);

    // Calculate social metrics
    const socialMetrics = this.calculateSocialMetrics(redditData, twitterData);

    // Calculate trading signals
    const tradingSignals = {
      insider: this.calculateInsiderSignal(insiderData),
      congressional: this.calculateCongressionalSignal(congressionalData),
      social: this.calculateSocialSignal(redditData, twitterData),
      news: this.calculateNewsSignal(newsData),
      combined: 0, // Will be calculated below
    };

    // Calculate combined signal
    tradingSignals.combined = this.calculateCombinedSignal(tradingSignals);

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(results);

    // Determine risk level
    const riskLevel = this.determineRiskLevel(tradingSignals, confidence);

    // Generate alerts
    const alerts = await this.generateAlerts(symbol, results, tradingSignals);

    return {
      symbol: symbol || 'MARKET',
      timestamp,
      sources,
      overallSentiment,
      socialMetrics,
      tradingSignals,
      confidence,
      riskLevel,
      alerts,
    };
  }

  /**
   * Calculate overall sentiment across all sources
   */
  private calculateOverallSentiment(sentimentSources: any[]): SentimentData {
    const validSources = sentimentSources.filter(source => source?.data?.length > 0);
    
    if (validSources.length === 0) {
      return {
        sentiment: 'neutral',
        score: 0,
        magnitude: 0,
        keywords: [],
        timestamp: Date.now(),
        source: 'aggregated',
        confidence: 0,
        metadata: {},
      };
    }

    let totalScore = 0;
    let totalMagnitude = 0;
    let totalWeight = 0;
    const allKeywords = new Set<string>();

    validSources.forEach(source => {
      source.data.forEach((item: any) => {
        if (item.sentiment) {
          const weight = item.confidence || 0.5;
          totalScore += item.sentiment.score * weight;
          totalMagnitude += item.sentiment.magnitude * weight;
          totalWeight += weight;
          
          if (item.sentiment.keywords) {
            item.sentiment.keywords.forEach((keyword: string) => allKeywords.add(keyword));
          }
        }
      });
    });

    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const avgMagnitude = totalWeight > 0 ? totalMagnitude / totalWeight : 0;

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (avgScore > 0.1) sentiment = 'positive';
    else if (avgScore < -0.1) sentiment = 'negative';

    return {
      sentiment,
      score: this.clamp(avgScore, -1, 1),
      magnitude: this.clamp(avgMagnitude, 0, 1),
      keywords: Array.from(allKeywords).slice(0, 20),
      timestamp: Date.now(),
      source: 'aggregated',
      confidence: Math.min(totalWeight / validSources.length, 1),
      metadata: {
        sourceCount: validSources.length,
        totalDataPoints: validSources.reduce((sum, source) => sum + source.data.length, 0),
      },
    };
  }

  /**
   * Calculate aggregated social metrics
   */
  private calculateSocialMetrics(redditData: any, twitterData: any): SocialMetrics {
    const redditMentions = redditData?.data?.length || 0;
    const twitterMentions = twitterData?.data?.length || 0;
    
    const redditEngagement = redditData?.data?.reduce((sum: number, post: RedditPostData) => 
      sum + post.upvotes + post.comments + post.awards, 0) || 0;
    
    const twitterEngagement = twitterData?.data?.reduce((sum: number, tweet: TwitterPostData) => 
      sum + tweet.likes + tweet.retweets + tweet.replies, 0) || 0;

    const totalMentions = redditMentions + twitterMentions;
    const totalEngagement = redditEngagement + twitterEngagement;
    
    // Calculate velocity (mentions per hour)
    const timeSpan = 1; // Assume 1 hour collection window
    const velocity = totalMentions / timeSpan;
    
    // Calculate reach
    const twitterReach = twitterData?.data?.reduce((sum: number, tweet: TwitterPostData) => 
      sum + tweet.followerCount, 0) || 0;
    const redditReach = redditMentions * 1000; // Rough estimate
    const totalReach = twitterReach + redditReach;
    
    // Determine if trending
    const trending = velocity > 20 || totalEngagement > 10000;

    return {
      mentions: totalMentions,
      engagement: totalEngagement,
      velocity,
      reach: totalReach,
      trending,
      timestamp: Date.now(),
      source: 'aggregated-social',
      confidence: Math.min((redditMentions + twitterMentions) / 50, 1),
      metadata: {
        redditMentions,
        twitterMentions,
        redditEngagement,
        twitterEngagement,
      },
    };
  }

  /**
   * Calculate insider trading signal
   */
  private calculateInsiderSignal(insiderData: any): number {
    if (!insiderData?.data?.length) return 0;
    
    const transactions = insiderData.data as InsiderTransaction[];
    const recentTransactions = transactions.filter(tx => 
      Date.now() - tx.timestamp < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    );
    
    if (recentTransactions.length === 0) return 0;
    
    const weightedSignal = recentTransactions.reduce((sum, tx) => {
      const signal = tx.transactionType === 'buy' ? 1 : (tx.transactionType === 'sell' ? -1 : 0);
      return sum + (signal * tx.significance);
    }, 0);
    
    return this.clamp(weightedSignal / recentTransactions.length, -1, 1);
  }

  /**
   * Calculate congressional trading signal
   */
  private calculateCongressionalSignal(congressionalData: any): number {
    if (!congressionalData?.data?.length) return 0;
    
    const trades = congressionalData.data as CongressionalTrade[];
    const recentTrades = trades.filter(trade => 
      Date.now() - trade.timestamp < 60 * 24 * 60 * 60 * 1000 // Last 60 days
    );
    
    if (recentTrades.length === 0) return 0;
    
    const weightedSignal = recentTrades.reduce((sum, trade) => {
      const signal = trade.transactionType === 'buy' ? 1 : (trade.transactionType === 'sell' ? -1 : 0);
      const weight = (trade.timingScore + trade.conflictScore) / 2;
      return sum + (signal * weight);
    }, 0);
    
    return this.clamp(weightedSignal / recentTrades.length, -1, 1);
  }

  /**
   * Calculate social signal
   */
  private calculateSocialSignal(redditData: any, twitterData: any): number {
    let signal = 0;
    let weightSum = 0;
    
    if (redditData?.data?.length) {
      const redditSentiment = redditData.data.reduce((sum: number, post: RedditPostData) => 
        sum + post.sentiment.score * post.confidence, 0);
      const redditWeight = redditData.data.reduce((sum: number, post: RedditPostData) => 
        sum + post.confidence, 0);
      
      if (redditWeight > 0) {
        signal += (redditSentiment / redditWeight) * redditWeight;
        weightSum += redditWeight;
      }
    }
    
    if (twitterData?.data?.length) {
      const twitterSentiment = twitterData.data.reduce((sum: number, tweet: TwitterPostData) => 
        sum + tweet.sentiment.score * tweet.confidence, 0);
      const twitterWeight = twitterData.data.reduce((sum: number, tweet: TwitterPostData) => 
        sum + tweet.confidence, 0);
      
      if (twitterWeight > 0) {
        signal += (twitterSentiment / twitterWeight) * twitterWeight;
        weightSum += twitterWeight;
      }
    }
    
    return weightSum > 0 ? this.clamp(signal / weightSum, -1, 1) : 0;
  }

  /**
   * Calculate news signal
   */
  private calculateNewsSignal(newsData: any): number {
    if (!newsData?.data?.length) return 0;
    
    const news = newsData.data as ProcessedNewsItem[];
    const recentNews = news.filter(item => 
      Date.now() - item.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    );
    
    if (recentNews.length === 0) return 0;
    
    const weightedSignal = recentNews.reduce((sum, item) => {
      const weight = item.marketImpact * item.credibility;
      return sum + (item.sentiment.score * weight);
    }, 0);
    
    const totalWeight = recentNews.reduce((sum, item) => 
      sum + (item.marketImpact * item.credibility), 0);
    
    return totalWeight > 0 ? this.clamp(weightedSignal / totalWeight, -1, 1) : 0;
  }

  /**
   * Calculate combined signal
   */
  private calculateCombinedSignal(signals: any): number {
    const weights = {
      insider: 0.3,
      congressional: 0.2,
      social: 0.25,
      news: 0.25,
    };
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    Object.entries(signals).forEach(([key, value]) => {
      if (key !== 'combined' && typeof value === 'number' && weights[key as keyof typeof weights]) {
        const weight = weights[key as keyof typeof weights];
        weightedSum += value * weight;
        totalWeight += weight;
      }
    });
    
    return totalWeight > 0 ? this.clamp(weightedSum / totalWeight, -1, 1) : 0;
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(results: Map<string, any>): number {
    let totalConfidence = 0;
    let count = 0;
    
    results.forEach((data) => {
      if (data?.summary?.avgConfidence) {
        totalConfidence += data.summary.avgConfidence;
        count++;
      }
    });
    
    return count > 0 ? totalConfidence / count : 0;
  }

  /**
   * Determine risk level
   */
  private determineRiskLevel(tradingSignals: any, confidence: number): 'low' | 'medium' | 'high' {
    const signalStrength = Math.abs(tradingSignals.combined);
    const riskScore = signalStrength * (1 - confidence);
    
    if (riskScore > 0.7) return 'high';
    if (riskScore > 0.3) return 'medium';
    return 'low';
  }

  /**
   * Generate alerts based on collected data
   */
  private async generateAlerts(symbol: string | undefined, results: Map<string, any>, tradingSignals: any): Promise<Array<{
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    data: any;
  }>> {
    const alerts: Array<{ type: string; severity: 'info' | 'warning' | 'critical'; message: string; data: any; }> = [];
    
    // Strong signal alert
    if (Math.abs(tradingSignals.combined) > 0.7) {
      alerts.push({
        type: 'strong_signal',
        severity: 'critical',
        message: `Strong ${tradingSignals.combined > 0 ? 'bullish' : 'bearish'} signal detected${symbol ? ` for ${symbol}` : ''}`,
        data: { signal: tradingSignals.combined, sources: Array.from(results.keys()) },
      });
    }
    
    // Unusual insider activity
    if (Math.abs(tradingSignals.insider) > 0.6) {
      alerts.push({
        type: 'insider_activity',
        severity: 'warning',
        message: `Unusual insider trading activity detected${symbol ? ` for ${symbol}` : ''}`,
        data: { signal: tradingSignals.insider },
      });
    }
    
    // Congressional trading alert
    if (Math.abs(tradingSignals.congressional) > 0.5) {
      alerts.push({
        type: 'congressional_trading',
        severity: 'warning',
        message: `Suspicious congressional trading detected${symbol ? ` for ${symbol}` : ''}`,
        data: { signal: tradingSignals.congressional },
      });
    }
    
    // Social media spike
    const socialData = results.get('reddit') || results.get('twitter');
    if (socialData?.summary?.trends?.volume === 'high') {
      alerts.push({
        type: 'social_spike',
        severity: 'info',
        message: `High social media activity detected${symbol ? ` for ${symbol}` : ''}`,
        data: { volume: socialData.summary.trends.volume },
      });
    }
    
    // Breaking news
    const newsData = results.get('news');
    if (newsData?.data?.some((news: ProcessedNewsItem) => news.urgency > 0.8)) {
      alerts.push({
        type: 'breaking_news',
        severity: 'critical',
        message: `Breaking news with high market impact detected${symbol ? ` for ${symbol}` : ''}`,
        data: { urgentNews: newsData.data.filter((news: ProcessedNewsItem) => news.urgency > 0.8).length },
      });
    }
    
    return alerts;
  }

  /**
   * Get status of all collectors
   */
  getStatus(): CollectorStatus[] {
    return Array.from(this.collectors.entries()).map(([name, collector]) => {
      const metrics = collector.getMetrics();
      
      return {
        name,
        status: collector.config.enabled ? 
          (metrics.successRate > 0.8 ? 'active' : 'error') : 
          'inactive',
        lastUpdate: metrics.lastUpdate,
        nextUpdate: metrics.lastUpdate + collector.config.updateInterval,
        healthScore: metrics.successRate,
        errorCount: metrics.errors.length,
        currentLoad: this.calculateCurrentLoad(collector),
      };
    });
  }

  /**
   * Calculate current load for a collector
   */
  private calculateCurrentLoad(collector: BaseCollector): number {
    const metrics = collector.getMetrics();
    const avgResponseTime = metrics.avgResponseTime;
    const maxResponseTime = 30000; // 30 seconds
    
    return Math.min(avgResponseTime / maxResponseTime, 1);
  }

  /**
   * Start automatic collection for all collectors
   */
  startCollection(interval: number = 30 * 60 * 1000): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start each collector with its own interval
    this.collectors.forEach((collector) => {
      if (collector.config.enabled) {
        collector.startAutoCollection();
      }
    });
    
    loggerUtils.dataLogger.info('Collector orchestrator started', {
      collectorCount: this.collectors.size,
      interval,
    });
  }

  /**
   * Stop automatic collection for all collectors
   */
  stopCollection(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
    
    // Stop each collector
    this.collectors.forEach((collector) => {
      collector.stopAutoCollection();
    });
    
    loggerUtils.dataLogger.info('Collector orchestrator stopped');
  }

  /**
   * Health check for all collectors
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    const healthResults = await Promise.allSettled(
      Array.from(this.collectors.entries()).map(async ([name, collector]) => ({
        name,
        healthy: await collector.isHealthy(),
        metrics: collector.getMetrics(),
      }))
    );
    
    const details = healthResults.map(result => 
      result.status === 'fulfilled' ? result.value : { name: 'unknown', healthy: false }
    );
    
    const healthyCount = details.filter(d => d.healthy).length;
    const totalCount = details.length;
    
    return {
      healthy: healthyCount / totalCount >= 0.7, // 70% healthy threshold
      details: {
        healthyCount,
        totalCount,
        collectors: details,
      },
    };
  }

  /**
   * Utility function to clamp values
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}

export default CollectorOrchestrator;
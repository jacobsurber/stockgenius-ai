/**
 * News collector with timestamp correlation and market impact analysis
 */

import { BaseCollector } from './BaseCollector.js';
import { CollectedData, ProcessedNewsItem, CollectorConfig } from './types.js';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';

export class NewsCollector extends BaseCollector {
  private dataHub: DataHub;
  
  // Market event keywords for impact scoring
  private readonly marketEvents = {
    earnings: ['earnings', 'quarterly', 'revenue', 'profit', 'eps', 'guidance'],
    mergers: ['merger', 'acquisition', 'buyout', 'takeover', 'deal'],
    regulatory: ['fda', 'sec', 'ftc', 'approval', 'investigation', 'lawsuit', 'compliance'],
    leadership: ['ceo', 'cfo', 'president', 'chairman', 'executive', 'resignation', 'appointment'],
    financial: ['debt', 'loan', 'credit', 'bankruptcy', 'dividend', 'split', 'buyback'],
    product: ['launch', 'recall', 'patent', 'innovation', 'breakthrough', 'failure'],
    market: ['upgrade', 'downgrade', 'target', 'rating', 'analyst', 'outlook'],
  };

  // Source credibility weights
  private readonly sourceCredibility = {
    'Reuters': 0.95,
    'Bloomberg': 0.93,
    'Wall Street Journal': 0.92,
    'Financial Times': 0.91,
    'CNBC': 0.85,
    'MarketWatch': 0.82,
    'Yahoo Finance': 0.75,
    'Seeking Alpha': 0.70,
    'Business Wire': 0.65,
    'PR Newswire': 0.60,
  };

  constructor(config: CollectorConfig, dataHub: DataHub) {
    super('NewsCollector', config);
    this.dataHub = dataHub;
  }

  async collectData(symbol?: string, options?: Record<string, any>): Promise<CollectedData> {
    const startTime = Date.now();
    const processedNews: ProcessedNewsItem[] = [];

    try {
      let rawNews: any[] = [];

      if (symbol) {
        // Collect symbol-specific news from multiple sources
        rawNews = await this.collectSymbolNews(symbol, options?.limit || 50);
      } else {
        // Collect general market news
        rawNews = await this.collectMarketNews(options?.limit || 100);
      }

      // Process each news item
      for (const newsItem of rawNews) {
        const processed = await this.processNewsItem(newsItem, symbol);
        if (processed) {
          processedNews.push(processed);
        }
      }

      // Sort by market impact and timestamp
      const sortedNews = this.sortByRelevance(processedNews);
      
      // Calculate aggregated metrics
      const aggregatedMetrics = this.calculateAggregatedMetrics(sortedNews);
      
      return {
        symbol,
        collectorType: 'news',
        timestamp: Date.now(),
        data: sortedNews,
        summary: {
          totalItems: sortedNews.length,
          avgConfidence: sortedNews.reduce((sum, news) => sum + news.confidence, 0) / sortedNews.length || 0,
          timeRange: {
            start: Math.min(...sortedNews.map(n => n.timestamp)),
            end: Math.max(...sortedNews.map(n => n.timestamp)),
          },
          trends: {
            sentiment: this.calculateOverallSentiment(sortedNews),
            volume: this.categorizeVolume(sortedNews.length),
            significance: aggregatedMetrics.avgMarketImpact,
          },
        },
      };
    } catch (error) {
      loggerUtils.dataLogger.error('News collection failed', {
        symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Collect news for a specific symbol
   */
  private async collectSymbolNews(symbol: string, limit: number): Promise<any[]> {
    const allNews: any[] = [];

    try {
      // Get news from multiple sources
      const sources = await Promise.allSettled([
        this.dataHub.newsScraperClient.getNewsForSymbol(symbol, Math.ceil(limit * 0.4)),
        this.dataHub.finnhubClient.getCompanyNews(symbol, 
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        ),
        this.dataHub.alphaVantageClient.getNewsSentiment(symbol, undefined, undefined, undefined, 'LATEST', Math.ceil(limit * 0.3)),
        this.dataHub.polygonClient.getTickerNews(symbol, undefined, 'desc', Math.ceil(limit * 0.3)),
      ]);

      // Aggregate results from all sources
      sources.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const sourceName = ['NewsScraper', 'Finnhub', 'AlphaVantage', 'Polygon'][index];
          const normalized = this.normalizeNewsFromSource(result.value, sourceName);
          allNews.push(...normalized);
        }
      });

      // Remove duplicates and limit
      return this.deduplicateNews(allNews).slice(0, limit);
    } catch (error) {
      loggerUtils.dataLogger.error('Symbol news collection failed', {
        symbol,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Collect general market news
   */
  private async collectMarketNews(limit: number): Promise<any[]> {
    const allNews: any[] = [];

    try {
      // Get general market news
      const sources = await Promise.allSettled([
        this.dataHub.newsScraperClient.getMarketNews(Math.ceil(limit * 0.5)),
        this.dataHub.newsScraperClient.getTrendingNews(Math.ceil(limit * 0.3)),
        this.dataHub.alphaVantageClient.getNewsSentiment(undefined, 'financial_markets', undefined, undefined, 'LATEST', Math.ceil(limit * 0.2)),
      ]);

      sources.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const sourceName = ['NewsScraper', 'NewsScraperTrending', 'AlphaVantage'][index];
          const normalized = this.normalizeNewsFromSource(result.value, sourceName);
          allNews.push(...normalized);
        }
      });

      return this.deduplicateNews(allNews).slice(0, limit);
    } catch (error) {
      loggerUtils.dataLogger.error('Market news collection failed', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Normalize news from different sources
   */
  private normalizeNewsFromSource(data: any, sourceName: string): any[] {
    const normalized: any[] = [];

    try {
      let newsItems: any[] = [];

      if (sourceName === 'NewsScraper' || sourceName === 'NewsScraperTrending') {
        newsItems = Array.isArray(data) ? data : [];
      } else if (sourceName === 'Finnhub') {
        newsItems = Array.isArray(data) ? data : [];
      } else if (sourceName === 'AlphaVantage') {
        newsItems = data?.feed ? data.feed : [];
      } else if (sourceName === 'Polygon') {
        newsItems = data?.results ? data.results : [];
      }

      newsItems.forEach(item => {
        normalized.push({
          title: this.extractTitle(item, sourceName),
          summary: this.extractSummary(item, sourceName),
          url: this.extractUrl(item, sourceName),
          publishedAt: this.extractPublishedAt(item, sourceName),
          source: this.extractSource(item, sourceName),
          symbols: this.extractSymbols(item, sourceName),
          originalSource: sourceName,
          rawData: item,
        });
      });
    } catch (error) {
      loggerUtils.dataLogger.warn('Failed to normalize news from source', {
        sourceName,
        error: (error as Error).message,
      });
    }

    return normalized;
  }

  /**
   * Extract title from different source formats
   */
  private extractTitle(item: any, sourceName: string): string {
    switch (sourceName) {
      case 'NewsScraper':
      case 'NewsScraperTrending':
        return item.title || '';
      case 'Finnhub':
        return item.headline || '';
      case 'AlphaVantage':
        return item.title || '';
      case 'Polygon':
        return item.title || '';
      default:
        return item.title || item.headline || '';
    }
  }

  /**
   * Extract summary from different source formats
   */
  private extractSummary(item: any, sourceName: string): string {
    switch (sourceName) {
      case 'NewsScraper':
      case 'NewsScraperTrending':
        return item.description || item.summary || '';
      case 'Finnhub':
        return item.summary || '';
      case 'AlphaVantage':
        return item.summary || '';
      case 'Polygon':
        return item.description || '';
      default:
        return item.description || item.summary || '';
    }
  }

  /**
   * Extract URL from different source formats
   */
  private extractUrl(item: any, sourceName: string): string {
    switch (sourceName) {
      case 'NewsScraper':
      case 'NewsScraperTrending':
        return item.url || '';
      case 'Finnhub':
        return item.url || '';
      case 'AlphaVantage':
        return item.url || '';
      case 'Polygon':
        return item.article_url || item.url || '';
      default:
        return item.url || item.article_url || '';
    }
  }

  /**
   * Extract published date from different source formats
   */
  private extractPublishedAt(item: any, sourceName: string): string {
    switch (sourceName) {
      case 'NewsScraper':
      case 'NewsScraperTrending':
        return item.publishedAt || new Date().toISOString();
      case 'Finnhub':
        return new Date(item.datetime * 1000).toISOString();
      case 'AlphaVantage':
        return item.time_published || new Date().toISOString();
      case 'Polygon':
        return item.published_utc || new Date().toISOString();
      default:
        return new Date().toISOString();
    }
  }

  /**
   * Extract source from different formats
   */
  private extractSource(item: any, sourceName: string): string {
    switch (sourceName) {
      case 'NewsScraper':
      case 'NewsScraperTrending':
        return item.source || 'Unknown';
      case 'Finnhub':
        return item.source || 'Finnhub';
      case 'AlphaVantage':
        return item.source || 'Alpha Vantage';
      case 'Polygon':
        return item.publisher?.name || 'Polygon';
      default:
        return sourceName;
    }
  }

  /**
   * Extract symbols from different formats
   */
  private extractSymbols(item: any, sourceName: string): string[] {
    switch (sourceName) {
      case 'NewsScraper':
      case 'NewsScraperTrending':
        return item.symbols || [];
      case 'Finnhub':
        return item.related ? [item.related] : [];
      case 'AlphaVantage':
        return item.ticker_sentiment ? item.ticker_sentiment.map((t: any) => t.ticker) : [];
      case 'Polygon':
        return item.tickers || [];
      default:
        return [];
    }
  }

  /**
   * Process individual news item
   */
  private async processNewsItem(newsItem: any, targetSymbol?: string): Promise<ProcessedNewsItem | null> {
    try {
      const content = `${newsItem.title} ${newsItem.summary}`;
      
      // Analyze sentiment
      const sentiment = await this.analyzeSentiment(content);
      
      // Calculate market impact
      const marketImpact = this.calculateMarketImpact(newsItem, sentiment);
      
      // Calculate urgency
      const urgency = this.calculateUrgency(newsItem, marketImpact);
      
      // Get credibility score
      const credibility = this.getSourceCredibility(newsItem.source);
      
      // Find correlated symbols
      const correlatedSymbols = await this.findCorrelatedSymbols(newsItem, targetSymbol);
      
      // Determine event type
      const eventType = this.determineEventType(content);
      
      // Calculate confidence
      const confidence = this.calculateNewsConfidence({
        credibility,
        marketImpact,
        hasSymbols: newsItem.symbols.length > 0,
        recency: this.calculateRecency(newsItem.publishedAt),
        contentQuality: this.assessContentQuality(content),
      });

      return {
        title: newsItem.title,
        summary: newsItem.summary,
        url: newsItem.url,
        category: this.categorizeNews(content),
        sentiment,
        symbols: newsItem.symbols,
        marketImpact,
        urgency,
        credibility,
        correlatedSymbols,
        eventType,
        timestamp: this.normalizeTimestamp(newsItem.publishedAt),
        source: newsItem.source,
        confidence,
        metadata: {
          originalSource: newsItem.originalSource,
          wordCount: content.split(' ').length,
          hasImage: !!newsItem.rawData?.image_url,
          publishDelay: this.calculatePublishDelay(newsItem.publishedAt),
          socialMetrics: this.extractSocialMetrics(newsItem.rawData),
        },
      };
    } catch (error) {
      loggerUtils.dataLogger.warn('Failed to process news item', {
        title: newsItem.title,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Calculate market impact score
   */
  private calculateMarketImpact(newsItem: any, sentiment: any): number {
    let impact = 0.3; // Base impact
    
    // Content analysis
    const content = `${newsItem.title} ${newsItem.summary}`.toLowerCase();
    
    // Event type impact
    for (const [eventType, keywords] of Object.entries(this.marketEvents)) {
      const keywordMatch = keywords.some(keyword => content.includes(keyword));
      if (keywordMatch) {
        switch (eventType) {
          case 'earnings':
            impact += 0.3;
            break;
          case 'mergers':
            impact += 0.4;
            break;
          case 'regulatory':
            impact += 0.35;
            break;
          case 'leadership':
            impact += 0.25;
            break;
          case 'financial':
            impact += 0.3;
            break;
          case 'product':
            impact += 0.2;
            break;
          case 'market':
            impact += 0.25;
            break;
        }
      }
    }
    
    // Sentiment magnitude impact
    impact += Math.abs(sentiment.score) * 0.2;
    
    // Source credibility impact
    const credibility = this.getSourceCredibility(newsItem.source);
    impact += credibility * 0.1;
    
    // Symbol specificity impact
    if (newsItem.symbols.length > 0) {
      impact += 0.1;
    }
    
    return this.clamp(impact, 0, 1);
  }

  /**
   * Calculate urgency score
   */
  private calculateUrgency(newsItem: any, marketImpact: number): number {
    let urgency = 0.2; // Base urgency
    
    // Recency factor
    const hoursAgo = (Date.now() - new Date(newsItem.publishedAt).getTime()) / (1000 * 60 * 60);
    if (hoursAgo <= 1) urgency += 0.4;
    else if (hoursAgo <= 6) urgency += 0.3;
    else if (hoursAgo <= 24) urgency += 0.2;
    else if (hoursAgo <= 72) urgency += 0.1;
    
    // Market impact factor
    urgency += marketImpact * 0.3;
    
    // Breaking news keywords
    const content = `${newsItem.title} ${newsItem.summary}`.toLowerCase();
    const breakingKeywords = ['breaking', 'urgent', 'alert', 'developing', 'just in'];
    if (breakingKeywords.some(keyword => content.includes(keyword))) {
      urgency += 0.2;
    }
    
    return this.clamp(urgency, 0, 1);
  }

  /**
   * Get source credibility score
   */
  private getSourceCredibility(source: string): number {
    return this.sourceCredibility[source] || 0.5;
  }

  /**
   * Find correlated symbols
   */
  private async findCorrelatedSymbols(newsItem: any, targetSymbol?: string): Promise<Array<{
    symbol: string;
    relevance: number;
  }>> {
    const content = `${newsItem.title} ${newsItem.summary}`;
    const extractedSymbols = this.extractStockSymbols(content);
    const correlatedSymbols: Array<{ symbol: string; relevance: number }> = [];
    
    // Add extracted symbols
    extractedSymbols.forEach(symbol => {
      if (symbol !== targetSymbol) {
        correlatedSymbols.push({
          symbol,
          relevance: this.calculateSymbolRelevance(symbol, content),
        });
      }
    });
    
    // Add symbols from news item metadata
    newsItem.symbols.forEach((symbol: string) => {
      if (symbol !== targetSymbol && !correlatedSymbols.some(cs => cs.symbol === symbol)) {
        correlatedSymbols.push({
          symbol,
          relevance: 0.8, // High relevance for explicitly tagged symbols
        });
      }
    });
    
    return correlatedSymbols
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5); // Top 5 correlated symbols
  }

  /**
   * Calculate symbol relevance in content
   */
  private calculateSymbolRelevance(symbol: string, content: string): number {
    const symbolMentions = (content.match(new RegExp(symbol, 'gi')) || []).length;
    const totalWords = content.split(' ').length;
    
    let relevance = Math.min(symbolMentions / totalWords * 10, 0.5); // Base relevance
    
    // Position bonus (mentioned in title)
    if (content.substring(0, 100).toLowerCase().includes(symbol.toLowerCase())) {
      relevance += 0.3;
    }
    
    return this.clamp(relevance, 0, 1);
  }

  /**
   * Determine event type
   */
  private determineEventType(content: string): string {
    const contentLower = content.toLowerCase();
    
    for (const [eventType, keywords] of Object.entries(this.marketEvents)) {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        return eventType;
      }
    }
    
    return 'general';
  }

  /**
   * Categorize news
   */
  private categorizeNews(content: string): string {
    const contentLower = content.toLowerCase();
    
    if (this.marketEvents.earnings.some(k => contentLower.includes(k))) return 'earnings';
    if (this.marketEvents.mergers.some(k => contentLower.includes(k))) return 'corporate-action';
    if (this.marketEvents.regulatory.some(k => contentLower.includes(k))) return 'regulatory';
    if (this.marketEvents.leadership.some(k => contentLower.includes(k))) return 'management';
    if (this.marketEvents.financial.some(k => contentLower.includes(k))) return 'financial';
    if (this.marketEvents.product.some(k => contentLower.includes(k))) return 'product';
    if (this.marketEvents.market.some(k => contentLower.includes(k))) return 'analyst';
    
    return 'general';
  }

  /**
   * Calculate news confidence
   */
  private calculateNewsConfidence(factors: {
    credibility: number;
    marketImpact: number;
    hasSymbols: boolean;
    recency: number;
    contentQuality: number;
  }): number {
    let confidence = 0.2; // Base confidence
    
    // Source credibility (0-0.3)
    confidence += factors.credibility * 0.3;
    
    // Market impact (0-0.2)
    confidence += factors.marketImpact * 0.2;
    
    // Symbol specificity (0-0.1)
    if (factors.hasSymbols) confidence += 0.1;
    
    // Recency (0-0.2)
    confidence += factors.recency * 0.2;
    
    // Content quality (0-0.2)
    confidence += factors.contentQuality * 0.2;
    
    return this.clamp(confidence, 0, 1);
  }

  /**
   * Calculate recency score
   */
  private calculateRecency(publishedAt: string): number {
    const hoursAgo = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo <= 1) return 1.0;
    if (hoursAgo <= 6) return 0.8;
    if (hoursAgo <= 24) return 0.6;
    if (hoursAgo <= 72) return 0.4;
    if (hoursAgo <= 168) return 0.2; // 1 week
    
    return 0.1;
  }

  /**
   * Assess content quality
   */
  private assessContentQuality(content: string): number {
    let quality = 0.3; // Base quality
    
    // Length factor
    const wordCount = content.split(' ').length;
    if (wordCount > 200) quality += 0.3;
    else if (wordCount > 100) quality += 0.2;
    else if (wordCount > 50) quality += 0.1;
    
    // Financial terms density
    const financialTerms = this.extractFinancialKeywords(content);
    quality += Math.min(financialTerms.length / 10, 0.3);
    
    // Quote presence (indicates primary source)
    if (content.includes('"') || content.includes('"')) {
      quality += 0.1;
    }
    
    return this.clamp(quality, 0, 1);
  }

  /**
   * Calculate publish delay
   */
  private calculatePublishDelay(publishedAt: string): number {
    // This would require knowing the actual event time vs publish time
    // For now, return 0
    return 0;
  }

  /**
   * Extract social metrics from raw data
   */
  private extractSocialMetrics(rawData: any): any {
    return {
      shares: rawData?.shares || 0,
      likes: rawData?.likes || 0,
      comments: rawData?.comments || 0,
    };
  }

  /**
   * Remove duplicate news items
   */
  private deduplicateNews(newsItems: any[]): any[] {
    const seen = new Set<string>();
    return newsItems.filter(item => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Sort news by relevance (market impact, urgency, recency)
   */
  private sortByRelevance(newsItems: ProcessedNewsItem[]): ProcessedNewsItem[] {
    return newsItems.sort((a, b) => {
      const scoreA = (a.marketImpact + a.urgency + a.confidence) / 3;
      const scoreB = (b.marketImpact + b.urgency + b.confidence) / 3;
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate aggregated metrics
   */
  private calculateAggregatedMetrics(newsItems: ProcessedNewsItem[]): {
    avgMarketImpact: number;
    avgUrgency: number;
    avgCredibility: number;
    eventTypeDistribution: Record<string, number>;
    sentimentDistribution: Record<string, number>;
  } {
    if (newsItems.length === 0) {
      return {
        avgMarketImpact: 0,
        avgUrgency: 0,
        avgCredibility: 0,
        eventTypeDistribution: {},
        sentimentDistribution: {},
      };
    }
    
    const avgMarketImpact = newsItems.reduce((sum, item) => sum + item.marketImpact, 0) / newsItems.length;
    const avgUrgency = newsItems.reduce((sum, item) => sum + item.urgency, 0) / newsItems.length;
    const avgCredibility = newsItems.reduce((sum, item) => sum + item.credibility, 0) / newsItems.length;
    
    const eventTypeDistribution: Record<string, number> = {};
    const sentimentDistribution: Record<string, number> = {};
    
    newsItems.forEach(item => {
      eventTypeDistribution[item.eventType] = (eventTypeDistribution[item.eventType] || 0) + 1;
      sentimentDistribution[item.sentiment.sentiment] = (sentimentDistribution[item.sentiment.sentiment] || 0) + 1;
    });
    
    return {
      avgMarketImpact,
      avgUrgency,
      avgCredibility,
      eventTypeDistribution,
      sentimentDistribution,
    };
  }

  /**
   * Calculate overall sentiment
   */
  private calculateOverallSentiment(newsItems: ProcessedNewsItem[]): 'bullish' | 'bearish' | 'neutral' {
    if (newsItems.length === 0) return 'neutral';
    
    const weightedSentiment = newsItems.reduce((sum, item) => {
      const weight = item.marketImpact * item.credibility;
      return sum + (item.sentiment.score * weight);
    }, 0);
    
    const totalWeight = newsItems.reduce((sum, item) => sum + (item.marketImpact * item.credibility), 0);
    const avgSentiment = totalWeight > 0 ? weightedSentiment / totalWeight : 0;
    
    if (avgSentiment > 0.1) return 'bullish';
    if (avgSentiment < -0.1) return 'bearish';
    return 'neutral';
  }

  /**
   * Categorize volume
   */
  private categorizeVolume(count: number): 'high' | 'medium' | 'low' {
    if (count > 50) return 'high';
    if (count > 20) return 'medium';
    return 'low';
  }

  /**
   * Get breaking news
   */
  async getBreakingNews(limit: number = 10): Promise<ProcessedNewsItem[]> {
    const data = await this.collectData();
    return (data.data as ProcessedNewsItem[])
      .filter(news => news.urgency > 0.7)
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, limit);
  }

  /**
   * Analyze news sentiment for symbol
   */
  async analyzeNewsSentiment(symbol: string): Promise<{
    sentiment: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    recentNews: number;
    highImpactNews: number;
    avgCredibility: number;
    urgentNews: number;
  }> {
    const data = await this.collectData(symbol);
    const news = data.data as ProcessedNewsItem[];
    
    const recentNews = news.filter(item => 
      Date.now() - item.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    ).length;
    
    const highImpactNews = news.filter(item => item.marketImpact > 0.7).length;
    const urgentNews = news.filter(item => item.urgency > 0.7).length;
    
    return {
      sentiment: this.calculateOverallSentiment(news),
      confidence: data.summary.avgConfidence,
      recentNews,
      highImpactNews,
      avgCredibility: news.reduce((sum, item) => sum + item.credibility, 0) / news.length || 0,
      urgentNews,
    };
  }

  /**
   * Get correlated events for timestamp analysis
   */
  async getCorrelatedEvents(symbol: string, timestamp: number, windowHours: number = 24): Promise<ProcessedNewsItem[]> {
    const data = await this.collectData(symbol);
    const news = data.data as ProcessedNewsItem[];
    
    const windowStart = timestamp - (windowHours * 60 * 60 * 1000);
    const windowEnd = timestamp + (windowHours * 60 * 60 * 1000);
    
    return news.filter(item => 
      item.timestamp >= windowStart && 
      item.timestamp <= windowEnd &&
      item.marketImpact > 0.5
    ).sort((a, b) => b.marketImpact - a.marketImpact);
  }
}

export default NewsCollector;
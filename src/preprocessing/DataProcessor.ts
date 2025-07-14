/**
 * Comprehensive data preprocessing service for StockGenius
 * Handles normalization, reliability scoring, deduplication, context tagging, and anomaly detection
 */

import OpenAI from 'openai';
import { createHash } from 'crypto';
import { 
  ProcessedDataPoint, 
  NormalizedData, 
  NormalizedQuote,
  NormalizedNews,
  NormalizedProfile,
  NormalizedFinancials,
  NormalizedInsiderTrade,
  NormalizedCongressionalTrade,
  DataSource,
  SourceReliability,
  ContextTag,
  ContextTagType,
  DataAnomalyFlag,
  AnomalyType,
  DeduplicationResult,
  ContradictionResult,
  ProcessingOptions,
  ProcessingResult,
  MarketContext,
  EarningsCalendar,
  EconomicCalendar,
  SentimentScore,
  ProcessingMetrics,
  CacheMetadata
} from '../types/data.js';
import { cacheUtils, getRedisClient, isRedisConnected } from '../config/redis.js';
import { logHelpers, loggerUtils } from '../config/logger.js';
import { aiService, ModelRouter } from '../config/openai.js';
import env from '../config/env.js';

/**
 * Main data preprocessing service
 */
export class DataProcessor {
  private openai: OpenAI;
  private modelRouter: ModelRouter;
  private processingMetrics: Map<string, ProcessingMetrics[]>;
  private earningsCalendar: Map<string, EarningsCalendar>;
  private economicCalendar: EconomicCalendar[];
  private reliabilityScores: Map<string, SourceReliability>;

  constructor() {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.modelRouter = new ModelRouter();
    this.processingMetrics = new Map();
    this.earningsCalendar = new Map();
    this.economicCalendar = [];
    this.reliabilityScores = new Map();
    
    this.initializeCalendars();
  }

  /**
   * Main processing method - processes raw data through the complete pipeline
   */
  async processData(
    rawData: any[], 
    dataType: string, 
    symbol?: string,
    options: Partial<ProcessingOptions> = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const defaultOptions: ProcessingOptions = {
      enableAI: true,
      enableCaching: true,
      enableDeduplication: true,
      enableAnomalyDetection: true,
      enableContextTagging: true,
      aiModel: 'gpt-3.5-turbo',
      cacheTTL: 300,
      reliabilityThreshold: 0.7,
      maxProcessingTime: 30000,
    };

    const finalOptions = { ...defaultOptions, ...options };
    const result: ProcessingResult = {
      success: false,
      data: [],
      errors: [],
      warnings: [],
      statistics: {
        totalInputs: rawData.length,
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

    try {
      loggerUtils.performanceLogger.info('Data processing started', {
        symbol,
        dataType,
        inputCount: rawData.length,
        options: finalOptions,
      });

      // Step 1: Check cache for already processed data
      if (finalOptions.enableCaching) {
        const cacheResults = await this.checkCache(rawData, dataType, symbol);
        result.data!.push(...cacheResults.hits);
        result.statistics.cacheHits = cacheResults.hits.length;
        result.statistics.cacheMisses = cacheResults.misses.length;
        rawData = cacheResults.missedData;
      }

      // Step 2: Normalize raw data
      const normalizedData: ProcessedDataPoint[] = [];
      for (const item of rawData) {
        try {
          const normalized = await this.normalizeData(item, dataType, symbol);
          if (normalized) {
            normalizedData.push(normalized);
          }
        } catch (error) {
          result.errors!.push(`Normalization failed: ${error.message}`);
          loggerUtils.performanceLogger.error('Data normalization error', {
            symbol,
            dataType,
            error: error.message,
            rawData: item,
          });
        }
      }

      // Step 3: Score source reliability
      for (const data of normalizedData) {
        await this.scoreReliability(data);
      }

      // Step 4: Detect anomalies
      if (finalOptions.enableAnomalyDetection) {
        for (const data of normalizedData) {
          const anomalies = await this.detectAnomalies(data, dataType);
          data.anomalies.push(...anomalies);
          result.statistics.anomaliesDetected += anomalies.length;
        }
      }

      // Step 5: Add context tags
      if (finalOptions.enableContextTagging) {
        for (const data of normalizedData) {
          const contextTags = await this.addContextTags(data, finalOptions);
          data.contextTags.push(...contextTags);
          result.statistics.contextTagsAdded += contextTags.length;
          
          if (contextTags.some(tag => tag.source === 'ai_generated')) {
            result.statistics.aiCallsMade += 1;
          }
        }
      }

      // Step 6: Deduplication
      if (finalOptions.enableDeduplication) {
        const deduplicationResults = await this.deduplicateData(normalizedData);
        result.statistics.duplicatesRemoved = deduplicationResults.removed;
        normalizedData.splice(0, normalizedData.length, ...deduplicationResults.data);
      }

      // Step 7: Check for contradictions
      const contradictions = await this.findContradictions(normalizedData);
      if (contradictions.length > 0) {
        result.warnings!.push(`Found ${contradictions.length} data contradictions`);
        loggerUtils.performanceLogger.warn('Data contradictions detected', {
          symbol,
          dataType,
          contradictions: contradictions.map(c => c.description),
        });
      }

      // Step 8: Cache processed data
      if (finalOptions.enableCaching) {
        await this.cacheProcessedData(normalizedData, finalOptions.cacheTTL);
      }

      // Step 9: Record metrics
      await this.recordMetrics(normalizedData, dataType, symbol, startTime);

      result.data!.push(...normalizedData);
      result.statistics.successfullyProcessed = normalizedData.length;
      result.statistics.processingTime = Date.now() - startTime;
      result.success = true;

      loggerUtils.performanceLogger.info('Data processing completed', {
        symbol,
        dataType,
        statistics: result.statistics,
      });

    } catch (error) {
      result.errors!.push(`Processing failed: ${error.message}`);
      result.statistics.processingTime = Date.now() - startTime;
      
      loggerUtils.performanceLogger.error('Data processing failed', {
        symbol,
        dataType,
        error: error.message,
        statistics: result.statistics,
      });
    }

    return result;
  }

  /**
   * Normalize data from different API sources into standardized format
   */
  private async normalizeData(
    rawData: any, 
    dataType: string, 
    symbol?: string
  ): Promise<ProcessedDataPoint | null> {
    const startTime = Date.now();

    try {
      let normalized: NormalizedData;
      const source = this.identifyDataSource(rawData);

      switch (dataType) {
        case 'quote':
          normalized = this.normalizeQuote(rawData, source, symbol);
          break;
        case 'news':
          normalized = this.normalizeNews(rawData, source, symbol);
          break;
        case 'profile':
          normalized = this.normalizeProfile(rawData, source, symbol);
          break;
        case 'financials':
          normalized = this.normalizeFinancials(rawData, source, symbol);
          break;
        case 'insider':
          normalized = this.normalizeInsiderTrade(rawData, source, symbol);
          break;
        case 'congressional':
          normalized = this.normalizeCongressionalTrade(rawData, source, symbol);
          break;
        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }

      const processedData: ProcessedDataPoint = {
        original: rawData,
        normalized,
        contextTags: [],
        anomalies: [],
        processingMetadata: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
          deduplicated: false,
          aiEnhanced: false,
          cacheKey: this.generateCacheKey(normalized),
          ttl: 300,
        },
      };

      return processedData;

    } catch (error) {
      loggerUtils.performanceLogger.error('Data normalization failed', {
        symbol,
        dataType,
        error: error.message,
        rawData,
      });
      return null;
    }
  }

  /**
   * Normalize quote data across different providers
   */
  private normalizeQuote(rawData: any, source: DataSource, symbol?: string): NormalizedQuote {
    let quote: NormalizedQuote;

    switch (source.provider) {
      case 'finnhub':
        quote = {
          type: 'quote',
          symbol: symbol || rawData.symbol || '',
          timestamp: rawData.t ? rawData.t * 1000 : Date.now(),
          source,
          reliability: 0.9,
          price: rawData.c || 0,
          change: rawData.d || 0,
          changePercent: rawData.dp || 0,
          volume: rawData.v || 0,
          high: rawData.h || 0,
          low: rawData.l || 0,
          open: rawData.o || 0,
          previousClose: rawData.pc || 0,
          currency: 'USD',
          exchange: rawData.exchange || 'UNKNOWN',
        };
        break;

      case 'polygon':
        quote = {
          type: 'quote',
          symbol: symbol || rawData.T || '',
          timestamp: rawData.t || Date.now(),
          source,
          reliability: 0.85,
          price: rawData.c || rawData.close || 0,
          change: (rawData.c || 0) - (rawData.o || 0),
          changePercent: rawData.o ? (((rawData.c || 0) - rawData.o) / rawData.o) * 100 : 0,
          volume: rawData.v || rawData.volume || 0,
          high: rawData.h || rawData.high || 0,
          low: rawData.l || rawData.low || 0,
          open: rawData.o || rawData.open || 0,
          previousClose: rawData.pc || 0,
          currency: 'USD',
          exchange: rawData.exchange || 'UNKNOWN',
        };
        break;

      case 'alpha_vantage':
        const globalQuote = rawData['Global Quote'] || rawData;
        quote = {
          type: 'quote',
          symbol: symbol || globalQuote['01. symbol'] || '',
          timestamp: new Date(globalQuote['07. latest trading day'] || Date.now()).getTime(),
          source,
          reliability: 0.8,
          price: parseFloat(globalQuote['05. price'] || '0'),
          change: parseFloat(globalQuote['09. change'] || '0'),
          changePercent: parseFloat((globalQuote['10. change percent'] || '0%').replace('%', '')),
          volume: parseInt(globalQuote['06. volume'] || '0'),
          high: parseFloat(globalQuote['03. high'] || '0'),
          low: parseFloat(globalQuote['04. low'] || '0'),
          open: parseFloat(globalQuote['02. open'] || '0'),
          previousClose: parseFloat(globalQuote['08. previous close'] || '0'),
          currency: 'USD',
          exchange: 'UNKNOWN',
        };
        break;

      default:
        throw new Error(`Unsupported quote provider: ${source.provider}`);
    }

    // Validate normalized data
    this.validateQuote(quote);
    return quote;
  }

  /**
   * Normalize news data across different providers
   */
  private normalizeNews(rawData: any, source: DataSource, symbol?: string): NormalizedNews {
    let news: NormalizedNews;

    switch (source.provider) {
      case 'finnhub':
        news = {
          type: 'news',
          symbol: symbol || rawData.symbol || '',
          timestamp: Date.now(),
          source,
          reliability: 0.85,
          headline: rawData.headline || '',
          summary: rawData.summary || '',
          url: rawData.url || '',
          publishedAt: rawData.datetime ? rawData.datetime * 1000 : Date.now(),
          relevance: 0.8,
          category: this.categorizeNews(rawData.headline, rawData.summary),
          language: 'en',
        };
        break;

      case 'polygon':
        news = {
          type: 'news',
          symbol: symbol || '',
          timestamp: Date.now(),
          source,
          reliability: 0.8,
          headline: rawData.title || '',
          summary: rawData.description || rawData.summary || '',
          url: rawData.article_url || rawData.url || '',
          publishedAt: new Date(rawData.published_utc || Date.now()).getTime(),
          relevance: 0.75,
          category: this.categorizeNews(rawData.title, rawData.description),
          language: 'en',
        };
        break;

      case 'alpha_vantage':
        news = {
          type: 'news',
          symbol: symbol || '',
          timestamp: Date.now(),
          source,
          reliability: 0.75,
          headline: rawData.title || '',
          summary: rawData.summary || '',
          url: rawData.url || '',
          publishedAt: new Date(rawData.time_published || Date.now()).getTime(),
          relevance: parseFloat(rawData.relevance_score || '0.5'),
          category: this.categorizeNews(rawData.title, rawData.summary),
          language: 'en',
        };
        break;

      default:
        throw new Error(`Unsupported news provider: ${source.provider}`);
    }

    return news;
  }

  /**
   * Normalize company profile data
   */
  private normalizeProfile(rawData: any, source: DataSource, symbol?: string): NormalizedProfile {
    let profile: NormalizedProfile;

    switch (source.provider) {
      case 'finnhub':
        profile = {
          type: 'profile',
          symbol: symbol || rawData.ticker || '',
          timestamp: Date.now(),
          source,
          reliability: 0.9,
          name: rawData.name || '',
          description: rawData.description || '',
          sector: rawData.gind || '',
          industry: rawData.finnhubIndustry || '',
          country: rawData.country || '',
          currency: rawData.currency || 'USD',
          exchange: rawData.exchange || '',
          marketCap: rawData.marketCapitalization || 0,
          employees: rawData.employeeTotal || undefined,
          website: rawData.weburl || undefined,
          logo: rawData.logo || undefined,
        };
        break;

      case 'alpha_vantage':
        profile = {
          type: 'profile',
          symbol: symbol || rawData.Symbol || '',
          timestamp: Date.now(),
          source,
          reliability: 0.85,
          name: rawData.Name || '',
          description: rawData.Description || '',
          sector: rawData.Sector || '',
          industry: rawData.Industry || '',
          country: rawData.Country || '',
          currency: rawData.Currency || 'USD',
          exchange: rawData.Exchange || '',
          marketCap: parseInt(rawData.MarketCapitalization || '0'),
          website: rawData.OfficialSite || undefined,
        };
        break;

      default:
        throw new Error(`Unsupported profile provider: ${source.provider}`);
    }

    return profile;
  }

  /**
   * Normalize financial data
   */
  private normalizeFinancials(rawData: any, source: DataSource, symbol?: string): NormalizedFinancials {
    const isQuarterly = rawData.period === 'quarterly' || rawData.fiscalQuarter;
    
    return {
      type: 'financials',
      symbol: symbol || rawData.symbol || '',
      timestamp: Date.now(),
      source,
      reliability: 0.9,
      period: isQuarterly ? 'quarterly' : 'annual',
      reportDate: new Date(rawData.fiscalDateEnding || rawData.reportDate || Date.now()).getTime(),
      fiscalYear: parseInt(rawData.fiscalYear || new Date().getFullYear().toString()),
      fiscalQuarter: rawData.fiscalQuarter || undefined,
      revenue: parseFloat(rawData.totalRevenue || rawData.revenue || '0'),
      netIncome: parseFloat(rawData.netIncome || '0'),
      eps: parseFloat(rawData.reportedEPS || rawData.eps || '0'),
      shares: parseFloat(rawData.sharesOutstanding || '0'),
      currency: rawData.reportedCurrency || 'USD',
    };
  }

  /**
   * Normalize insider trading data
   */
  private normalizeInsiderTrade(rawData: any, source: DataSource, symbol?: string): NormalizedInsiderTrade {
    return {
      type: 'insider',
      symbol: symbol || rawData.symbol || rawData.ticker || '',
      timestamp: Date.now(),
      source,
      reliability: 0.8,
      traderName: rawData.name || rawData.Name || '',
      title: rawData.title || rawData.Title || '',
      transactionDate: new Date(rawData.transactionDate || rawData.Date || Date.now()).getTime(),
      transactionType: (rawData.transaction || rawData.Transaction || '').toLowerCase().includes('buy') ? 'buy' : 'sell',
      shares: parseInt(rawData.shares || rawData.Shares || '0'),
      price: parseFloat(rawData.price || rawData.Price || '0'),
      value: parseFloat(rawData.value || rawData.Value || '0'),
      sharesOwned: parseInt(rawData.sharesOwnedAfter || rawData.SharesOwnedAfter || '0'),
    };
  }

  /**
   * Normalize congressional trading data
   */
  private normalizeCongressionalTrade(rawData: any, source: DataSource, symbol?: string): NormalizedCongressionalTrade {
    return {
      type: 'congressional',
      symbol: symbol || rawData.ticker || rawData.Ticker || '',
      timestamp: Date.now(),
      source,
      reliability: 0.75,
      representative: rawData.representative || rawData.Representative || '',
      chamber: (rawData.chamber || rawData.Chamber || '').toLowerCase() === 'house' ? 'house' : 'senate',
      party: rawData.party || rawData.Party || '',
      state: rawData.state || rawData.State || '',
      transactionDate: new Date(rawData.transactionDate || rawData.TransactionDate || Date.now()).getTime(),
      disclosureDate: new Date(rawData.disclosureDate || rawData.DisclosureDate || Date.now()).getTime(),
      transactionType: (rawData.transaction || rawData.Transaction || '').toLowerCase().includes('buy') ? 'buy' : 'sell',
      amount: rawData.amount || rawData.Range || '',
    };
  }

  /**
   * Score source reliability based on multiple factors
   */
  private async scoreReliability(data: ProcessedDataPoint): Promise<void> {
    const { source, normalized } = data;
    const sourceKey = `${source.provider}_${source.endpoint}`;
    
    let reliability = this.reliabilityScores.get(sourceKey);
    
    if (!reliability) {
      reliability = {
        score: 0.8, // Default score
        factors: {
          freshness: 0.8,
          consistency: 0.8,
          coverage: 0.8,
          latency: 0.8,
        },
        lastUpdated: Date.now(),
        dataQuality: 'medium',
      };
    }

    // Calculate freshness score
    const dataAge = Date.now() - normalized.timestamp;
    const maxAge = this.getMaxAge(normalized.type);
    reliability.factors.freshness = Math.max(0, 1 - (dataAge / maxAge));

    // Update consistency score based on historical performance
    const metrics = this.processingMetrics.get(sourceKey) || [];
    if (metrics.length > 0) {
      const recentMetrics = metrics.slice(-10); // Last 10 data points
      const errorRate = recentMetrics.reduce((sum, m) => sum + m.errorCount, 0) / recentMetrics.length;
      reliability.factors.consistency = Math.max(0, 1 - errorRate);
    }

    // Calculate coverage score based on missing fields
    reliability.factors.coverage = this.calculateCoverageScore(normalized);

    // Overall reliability score
    const weights = { freshness: 0.3, consistency: 0.4, coverage: 0.2, latency: 0.1 };
    reliability.score = Object.entries(reliability.factors)
      .reduce((sum, [factor, score]) => sum + (score * weights[factor]), 0);

    // Update data quality classification
    if (reliability.score >= 0.9) reliability.dataQuality = 'high';
    else if (reliability.score >= 0.7) reliability.dataQuality = 'medium';
    else reliability.dataQuality = 'low';

    reliability.lastUpdated = Date.now();
    
    // Update source reliability in the data
    source.reliability = reliability;
    normalized.reliability = reliability.score;
    
    // Cache the reliability score
    this.reliabilityScores.set(sourceKey, reliability);

    logHelpers.logPerformance('reliability_scoring', Date.now() - normalized.timestamp, {
      symbol: normalized.symbol,
      provider: source.provider,
      score: reliability.score,
      factors: reliability.factors,
    });
  }

  /**
   * Detect data anomalies that need attention
   */
  private async detectAnomalies(data: ProcessedDataPoint, dataType: string): Promise<DataAnomalyFlag[]> {
    const anomalies: DataAnomalyFlag[] = [];
    const { normalized } = data;

    try {
      // Check for stale data
      const dataAge = Date.now() - normalized.timestamp;
      const maxAge = this.getMaxAge(normalized.type);
      
      if (dataAge > maxAge) {
        anomalies.push({
          type: 'stale_data',
          severity: dataAge > maxAge * 2 ? 'high' : 'medium',
          description: `Data is ${Math.round(dataAge / 60000)} minutes old`,
          affectedFields: ['timestamp'],
          confidence: 0.9,
          suggestedAction: 'verify',
        });
      }

      // Type-specific anomaly detection
      if (normalized.type === 'quote') {
        anomalies.push(...this.detectQuoteAnomalies(normalized as NormalizedQuote));
      } else if (normalized.type === 'news') {
        anomalies.push(...this.detectNewsAnomalies(normalized as NormalizedNews));
      }

      // Check for missing critical fields
      const criticalFields = this.getCriticalFields(normalized.type);
      const missingFields = criticalFields.filter(field => 
        !normalized[field] || (typeof normalized[field] === 'number' && normalized[field] === 0)
      );

      if (missingFields.length > 0) {
        anomalies.push({
          type: 'missing_critical_field',
          severity: 'medium',
          description: `Missing critical fields: ${missingFields.join(', ')}`,
          affectedFields: missingFields,
          confidence: 1.0,
          suggestedAction: 'flag_for_review',
        });
      }

    } catch (error) {
      loggerUtils.performanceLogger.error('Anomaly detection failed', {
        symbol: normalized.symbol,
        dataType,
        error: error.message,
      });
    }

    return anomalies;
  }

  /**
   * Add contextual tags to data points
   */
  private async addContextTags(
    data: ProcessedDataPoint, 
    options: ProcessingOptions
  ): Promise<ContextTag[]> {
    const tags: ContextTag[] = [];
    const { normalized } = data;

    try {
      // Add rule-based context tags
      tags.push(...this.addRuleBasedTags(normalized));

      // Add market calendar-based tags
      tags.push(...this.addCalendarBasedTags(normalized));

      // Add AI-generated tags if enabled
      if (options.enableAI && normalized.type === 'news') {
        const aiTags = await this.addAIGeneratedTags(normalized as NormalizedNews, options.aiModel);
        tags.push(...aiTags);
      }

    } catch (error) {
      loggerUtils.performanceLogger.error('Context tagging failed', {
        symbol: normalized.symbol,
        error: error.message,
      });
    }

    return tags;
  }

  /**
   * Add rule-based context tags
   */
  private addRuleBasedTags(data: NormalizedData): ContextTag[] {
    const tags: ContextTag[] = [];

    // Check for earnings proximity
    const earningsData = this.earningsCalendar.get(data.symbol);
    if (earningsData) {
      const daysToEarnings = (earningsData.reportDate - Date.now()) / (24 * 60 * 60 * 1000);
      
      if (daysToEarnings >= 0 && daysToEarnings <= 7) {
        tags.push({
          type: 'pre_earnings',
          value: Math.round(daysToEarnings),
          confidence: 0.95,
          source: 'rule_based',
          metadata: { reportDate: earningsData.reportDate },
        });
      } else if (daysToEarnings < 0 && daysToEarnings >= -7) {
        tags.push({
          type: 'post_earnings',
          value: Math.abs(Math.round(daysToEarnings)),
          confidence: 0.95,
          source: 'rule_based',
          metadata: { reportDate: earningsData.reportDate },
        });
      }
    }

    // Check for unusual volume (quotes only)
    if (data.type === 'quote') {
      const quote = data as NormalizedQuote;
      // This would typically compare against historical average
      if (quote.volume > 1000000) { // Simplified check
        tags.push({
          type: 'unusual_volume',
          value: quote.volume,
          confidence: 0.7,
          source: 'rule_based',
        });
      }
    }

    return tags;
  }

  /**
   * Add calendar-based context tags
   */
  private addCalendarBasedTags(data: NormalizedData): ContextTag[] {
    const tags: ContextTag[] = [];

    // Check for Fed meeting days
    const today = new Date().toDateString();
    const fedDays = ['2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12']; // Example dates
    
    if (fedDays.some(date => new Date(date).toDateString() === today)) {
      tags.push({
        type: 'fed_day',
        value: true,
        confidence: 1.0,
        source: 'market_calendar',
      });
    }

    // Check for option expiry (third Friday of each month)
    const date = new Date();
    const thirdFriday = this.getThirdFriday(date.getFullYear(), date.getMonth());
    const daysToExpiry = (thirdFriday.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
    
    if (Math.abs(daysToExpiry) <= 1) {
      tags.push({
        type: 'option_expiry',
        value: Math.round(daysToExpiry),
        confidence: 0.9,
        source: 'market_calendar',
      });
    }

    return tags;
  }

  /**
   * Add AI-generated context tags and sentiment
   */
  private async addAIGeneratedTags(news: NormalizedNews, model: string): Promise<ContextTag[]> {
    const tags: ContextTag[] = [];

    try {
      const prompt = `Analyze this financial news and provide sentiment score and relevant tags:
Title: ${news.headline}
Summary: ${news.summary}

Provide response as JSON with:
{
  "sentiment": {"score": -1 to 1, "label": "positive/negative/neutral", "confidence": 0-1},
  "tags": [{"type": "category", "confidence": 0-1, "reasoning": "brief explanation"}]
}

Available tag types: earnings, guidance, management, product, regulatory, merger, acquisition, analyst, macro, sector`;

      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a financial news analyst. Provide accurate sentiment analysis and categorization.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const analysis = JSON.parse(response.choices[0].message.content);

      // Add sentiment tag
      if (analysis.sentiment) {
        news.sentiment = analysis.sentiment;
        tags.push({
          type: 'sentiment' as ContextTagType,
          value: analysis.sentiment.score,
          confidence: analysis.sentiment.confidence,
          source: 'ai_generated',
          metadata: { label: analysis.sentiment.label },
        });
      }

      // Add category tags
      if (analysis.tags) {
        for (const tag of analysis.tags) {
          tags.push({
            type: tag.type as ContextTagType,
            value: true,
            confidence: tag.confidence,
            source: 'ai_generated',
            metadata: { reasoning: tag.reasoning },
          });
        }
      }

    } catch (error) {
      loggerUtils.aiLogger.error('AI tagging failed', {
        symbol: news.symbol,
        model,
        error: error.message,
      });
    }

    return tags;
  }

  /**
   * Deduplicate overlapping data points
   */
  private async deduplicateData(data: ProcessedDataPoint[]): Promise<{data: ProcessedDataPoint[], removed: number}> {
    const uniqueData: ProcessedDataPoint[] = [];
    const duplicateGroups: Map<string, ProcessedDataPoint[]> = new Map();
    let removedCount = 0;

    // Group potentially duplicate data
    for (const item of data) {
      const key = this.generateDeduplicationKey(item.normalized);
      
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, []);
      }
      
      duplicateGroups.get(key)!.push(item);
    }

    // Process each group
    for (const [key, group] of duplicateGroups) {
      if (group.length === 1) {
        uniqueData.push(group[0]);
      } else {
        // Select the best data point from duplicates
        const best = this.selectBestDataPoint(group);
        best.processingMetadata.deduplicated = true;
        uniqueData.push(best);
        removedCount += group.length - 1;

        logHelpers.logPerformance('deduplication', 0, {
          symbol: best.normalized.symbol,
          duplicatesFound: group.length - 1,
          selectedSource: best.normalized.source.provider,
        });
      }
    }

    return { data: uniqueData, removed: removedCount };
  }

  /**
   * Find contradictory data signals
   */
  private async findContradictions(data: ProcessedDataPoint[]): Promise<ContradictionResult[]> {
    const contradictions: ContradictionResult[] = [];

    // Group data by symbol and type
    const grouped = new Map<string, Map<string, ProcessedDataPoint[]>>();
    
    for (const item of data) {
      const symbol = item.normalized.symbol;
      const type = item.normalized.type;
      
      if (!grouped.has(symbol)) {
        grouped.set(symbol, new Map());
      }
      
      if (!grouped.get(symbol)!.has(type)) {
        grouped.get(symbol)!.set(type, []);
      }
      
      grouped.get(symbol)!.get(type)!.push(item);
    }

    // Check for contradictions within each group
    for (const [symbol, typeGroups] of grouped) {
      for (const [type, items] of typeGroups) {
        if (items.length > 1 && type === 'quote') {
          const contradiction = this.checkQuoteContradictions(items);
          if (contradiction) {
            contradictions.push(contradiction);
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Check cache for already processed data
   */
  private async checkCache(
    rawData: any[], 
    dataType: string, 
    symbol?: string
  ): Promise<{hits: ProcessedDataPoint[], misses: number[], missedData: any[]}> {
    const hits: ProcessedDataPoint[] = [];
    const misses: number[] = [];
    const missedData: any[] = [];

    if (!isRedisConnected()) {
      return { hits, misses: rawData.map((_, i) => i), missedData: rawData };
    }

    for (let i = 0; i < rawData.length; i++) {
      const item = rawData[i];
      const cacheKey = this.generateCacheKey({ ...item, type: dataType, symbol });
      
      try {
        const cached = await cacheUtils.get(cacheKey);
        
        if (cached) {
          hits.push(cached);
        } else {
          misses.push(i);
          missedData.push(item);
        }
      } catch (error) {
        misses.push(i);
        missedData.push(item);
      }
    }

    return { hits, misses, missedData };
  }

  /**
   * Cache processed data points
   */
  private async cacheProcessedData(data: ProcessedDataPoint[], ttl: number): Promise<void> {
    if (!isRedisConnected()) return;

    const cachePromises = data.map(async (item) => {
      try {
        await cacheUtils.set(item.processingMetadata.cacheKey, item, ttl);
      } catch (error) {
        loggerUtils.cacheLogger.error('Failed to cache processed data', {
          symbol: item.normalized.symbol,
          cacheKey: item.processingMetadata.cacheKey,
          error: error.message,
        });
      }
    });

    await Promise.allSettled(cachePromises);
  }

  /**
   * Record processing metrics for monitoring
   */
  private async recordMetrics(
    data: ProcessedDataPoint[], 
    dataType: string, 
    symbol: string | undefined, 
    startTime: number
  ): Promise<void> {
    const metrics: ProcessingMetrics = {
      timestamp: Date.now(),
      symbol,
      dataType,
      source: data.length > 0 ? data[0].normalized.source.provider : 'unknown',
      processingTimeMs: Date.now() - startTime,
      cacheHit: data.some(d => d.processingMetadata.deduplicated),
      aiEnhanced: data.some(d => d.processingMetadata.aiEnhanced),
      anomaliesFound: data.reduce((sum, d) => sum + d.anomalies.length, 0),
      contextTagsAdded: data.reduce((sum, d) => sum + d.contextTags.length, 0),
      reliabilityScore: data.length > 0 ? data.reduce((sum, d) => sum + d.normalized.reliability, 0) / data.length : 0,
      errorCount: 0,
    };

    const key = `${dataType}_${symbol || 'all'}`;
    if (!this.processingMetrics.has(key)) {
      this.processingMetrics.set(key, []);
    }

    const metricsList = this.processingMetrics.get(key)!;
    metricsList.push(metrics);

    // Keep only the last 100 metrics per key
    if (metricsList.length > 100) {
      metricsList.splice(0, metricsList.length - 100);
    }

    logHelpers.logPerformance('data_processing', metrics.processingTimeMs, metrics);
  }

  // Helper methods...

  private identifyDataSource(rawData: any): DataSource {
    // Logic to identify the source based on data structure
    if (rawData.c !== undefined && rawData.dp !== undefined) {
      return {
        provider: 'finnhub',
        endpoint: 'quote',
        tier: 'free',
        reliability: {
          score: 0.9,
          factors: { freshness: 0.9, consistency: 0.9, coverage: 0.9, latency: 0.9 },
          lastUpdated: Date.now(),
          dataQuality: 'high',
        },
      };
    }
    
    // Add more source identification logic...
    
    return {
      provider: 'alpha_vantage',
      endpoint: 'unknown',
      tier: 'free',
      reliability: {
        score: 0.8,
        factors: { freshness: 0.8, consistency: 0.8, coverage: 0.8, latency: 0.8 },
        lastUpdated: Date.now(),
        dataQuality: 'medium',
      },
    };
  }

  private validateQuote(quote: NormalizedQuote): void {
    if (!quote.symbol || quote.symbol.length === 0) {
      throw new Error('Quote missing symbol');
    }
    
    if (quote.price < 0) {
      throw new Error('Quote has negative price');
    }
  }

  private categorizeNews(headline: string, summary: string): any {
    const text = `${headline} ${summary}`.toLowerCase();
    
    if (text.includes('earnings') || text.includes('quarterly')) return 'earnings';
    if (text.includes('guidance') || text.includes('forecast')) return 'guidance';
    if (text.includes('ceo') || text.includes('management')) return 'management';
    if (text.includes('merger') || text.includes('acquisition')) return 'merger';
    if (text.includes('analyst') || text.includes('rating')) return 'analyst';
    
    return 'general';
  }

  private generateCacheKey(data: any): string {
    const keyData = {
      symbol: data.symbol,
      type: data.type,
      timestamp: Math.floor(data.timestamp / 60000) * 60000, // Round to minute
      source: data.source?.provider,
    };
    
    return createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }

  private generateDeduplicationKey(data: NormalizedData): string {
    return `${data.symbol}_${data.type}_${Math.floor(data.timestamp / 300000)}`; // 5-minute buckets
  }

  private getMaxAge(dataType: string): number {
    const maxAges = {
      quote: 5 * 60 * 1000, // 5 minutes
      news: 60 * 60 * 1000, // 1 hour
      profile: 24 * 60 * 60 * 1000, // 24 hours
      financials: 24 * 60 * 60 * 1000, // 24 hours
      insider: 60 * 60 * 1000, // 1 hour
      congressional: 60 * 60 * 1000, // 1 hour
    };
    
    return maxAges[dataType] || 60 * 60 * 1000;
  }

  private calculateCoverageScore(data: NormalizedData): number {
    const requiredFields = this.getCriticalFields(data.type);
    const presentFields = requiredFields.filter(field => 
      data[field] !== undefined && data[field] !== null && data[field] !== ''
    );
    
    return presentFields.length / requiredFields.length;
  }

  private getCriticalFields(dataType: string): string[] {
    const criticalFields = {
      quote: ['symbol', 'price', 'timestamp'],
      news: ['symbol', 'headline', 'publishedAt'],
      profile: ['symbol', 'name', 'sector'],
      financials: ['symbol', 'revenue', 'reportDate'],
      insider: ['symbol', 'traderName', 'transactionDate'],
      congressional: ['symbol', 'representative', 'transactionDate'],
    };
    
    return criticalFields[dataType] || ['symbol', 'timestamp'];
  }

  private detectQuoteAnomalies(quote: NormalizedQuote): DataAnomalyFlag[] {
    const anomalies: DataAnomalyFlag[] = [];

    // Check for unrealistic price gaps
    if (Math.abs(quote.changePercent) > 20) {
      anomalies.push({
        type: 'price_gap',
        severity: Math.abs(quote.changePercent) > 50 ? 'high' : 'medium',
        description: `Large price change: ${quote.changePercent.toFixed(2)}%`,
        affectedFields: ['changePercent'],
        confidence: 0.8,
        suggestedAction: 'verify',
      });
    }

    // Check for volume spikes
    if (quote.volume > 10000000) { // Simplified check
      anomalies.push({
        type: 'volume_spike',
        severity: 'medium',
        description: `Unusual volume: ${quote.volume.toLocaleString()}`,
        affectedFields: ['volume'],
        confidence: 0.7,
        suggestedAction: 'flag_for_review',
      });
    }

    return anomalies;
  }

  private detectNewsAnomalies(news: NormalizedNews): DataAnomalyFlag[] {
    const anomalies: DataAnomalyFlag[] = [];

    // Check for very low relevance
    if (news.relevance < 0.3) {
      anomalies.push({
        type: 'suspicious_pattern',
        severity: 'low',
        description: 'Low relevance score for news item',
        affectedFields: ['relevance'],
        confidence: 0.6,
        suggestedAction: 'ignore',
      });
    }

    return anomalies;
  }

  private selectBestDataPoint(candidates: ProcessedDataPoint[]): ProcessedDataPoint {
    // Select based on reliability score, then freshness
    return candidates.reduce((best, current) => {
      if (current.normalized.reliability > best.normalized.reliability) {
        return current;
      } else if (current.normalized.reliability === best.normalized.reliability) {
        return current.normalized.timestamp > best.normalized.timestamp ? current : best;
      }
      return best;
    });
  }

  private checkQuoteContradictions(quotes: ProcessedDataPoint[]): ContradictionResult | null {
    if (quotes.length < 2) return null;

    const normalizedQuotes = quotes.map(q => q.normalized as NormalizedQuote);
    const prices = normalizedQuotes.map(q => q.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceDiff = ((maxPrice - minPrice) / minPrice) * 100;

    if (priceDiff > 5) { // 5% difference threshold
      return {
        dataPoints: quotes,
        contradictionType: 'price_mismatch',
        severity: priceDiff > 10 ? 'high' : 'medium',
        description: `Price mismatch: ${priceDiff.toFixed(2)}% difference between sources`,
        suggestedResolution: 'Use most reliable source or average values',
      };
    }

    return null;
  }

  private getThirdFriday(year: number, month: number): Date {
    const firstDay = new Date(year, month, 1);
    const firstFriday = new Date(year, month, 1 + (5 - firstDay.getDay() + 7) % 7);
    return new Date(year, month, firstFriday.getDate() + 14);
  }

  private async initializeCalendars(): Promise<void> {
    // Initialize with sample data - in production, this would load from external sources
    this.earningsCalendar.set('AAPL', {
      symbol: 'AAPL',
      reportDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
      estimatedEPS: 1.25,
    });

    this.economicCalendar = [
      {
        event: 'Federal Reserve Meeting',
        date: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days from now
        impact: 'high',
        currency: 'USD',
        relevantSectors: ['financial', 'real_estate'],
      },
    ];
  }

  /**
   * Get processing statistics
   */
  public getProcessingStats(): Record<string, any> {
    const stats = {};
    
    for (const [key, metrics] of this.processingMetrics) {
      const recent = metrics.slice(-10);
      stats[key] = {
        totalProcessed: metrics.length,
        averageProcessingTime: recent.reduce((sum, m) => sum + m.processingTimeMs, 0) / recent.length,
        averageReliability: recent.reduce((sum, m) => sum + m.reliabilityScore, 0) / recent.length,
        totalAnomalies: metrics.reduce((sum, m) => sum + m.anomaliesFound, 0),
        aiEnhancementRate: recent.filter(m => m.aiEnhanced).length / recent.length,
      };
    }

    return stats;
  }
}

export default DataProcessor;
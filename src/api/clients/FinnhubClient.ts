/**
 * Finnhub API client implementation
 */

import { BaseClient, BaseClientConfig } from '../BaseClient.js';
import env from '../../config/env.js';

export class FinnhubClient extends BaseClient {
  constructor(config: BaseClientConfig) {
    super(config);
    
    // Add API key to all requests
    this.client.interceptors.request.use((config) => {
      config.params = config.params || {};
      config.params.token = env.FINNHUB_API_KEY;
      return config;
    });
  }

  /**
   * Get real-time quote
   */
  async getQuote(symbol: string): Promise<any> {
    return await this.get('/quote', { symbol: symbol.toUpperCase() }, {
      cacheTTL: 60, // 1 minute cache for quotes
    });
  }

  /**
   * Get company profile
   */
  async getCompanyProfile(symbol: string): Promise<any> {
    return await this.get('/stock/profile2', { symbol: symbol.toUpperCase() }, {
      cacheTTL: 86400, // 24 hours cache for profiles
    });
  }

  /**
   * Get company news
   */
  async getCompanyNews(symbol: string, from?: string, to?: string): Promise<any> {
    const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    
    return await this.get('/company-news', {
      symbol: symbol.toUpperCase(),
      from: fromDate,
      to: toDate,
    }, {
      cacheTTL: 1800, // 30 minutes cache for news
    });
  }

  /**
   * Get earnings data
   */
  async getEarnings(symbol: string): Promise<any> {
    return await this.get('/stock/earnings', { symbol: symbol.toUpperCase() }, {
      cacheTTL: 43200, // 12 hours cache for earnings
    });
  }

  /**
   * Get company metrics
   */
  async getCompanyMetrics(symbol: string, metric?: string): Promise<any> {
    const params: any = { symbol: symbol.toUpperCase() };
    if (metric) params.metric = metric;
    
    return await this.get('/stock/metric', params, {
      cacheTTL: 3600, // 1 hour cache for metrics
    });
  }

  /**
   * Get stock candles (OHLCV data)
   */
  async getCandles(
    symbol: string, 
    resolution: string = 'D', 
    from?: number, 
    to?: number
  ): Promise<any> {
    const fromTime = from || Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const toTime = to || Math.floor(Date.now() / 1000);
    
    return await this.get('/stock/candle', {
      symbol: symbol.toUpperCase(),
      resolution,
      from: fromTime,
      to: toTime,
    }, {
      cacheTTL: resolution === 'D' ? 3600 : 300, // Daily: 1 hour, intraday: 5 minutes
    });
  }

  /**
   * Get insider transactions
   */
  async getInsiderTransactions(symbol: string, from?: string, to?: string): Promise<any> {
    const fromDate = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    
    return await this.get('/stock/insider-transactions', {
      symbol: symbol.toUpperCase(),
      from: fromDate,
      to: toDate,
    }, {
      cacheTTL: 3600, // 1 hour cache for insider data
    });
  }

  /**
   * Get analyst recommendations
   */
  async getRecommendations(symbol: string): Promise<any> {
    return await this.get('/stock/recommendation', { symbol: symbol.toUpperCase() }, {
      cacheTTL: 43200, // 12 hours cache for recommendations
    });
  }

  /**
   * Get price targets
   */
  async getPriceTargets(symbol: string): Promise<any> {
    return await this.get('/stock/price-target', { symbol: symbol.toUpperCase() }, {
      cacheTTL: 43200, // 12 hours cache for price targets
    });
  }

  /**
   * Get upgrade/downgrade history
   */
  async getUpgradeDowngrade(symbol: string, from?: string, to?: string): Promise<any> {
    const fromDate = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    
    return await this.get('/stock/upgrade-downgrade', {
      symbol: symbol.toUpperCase(),
      from: fromDate,
      to: toDate,
    }, {
      cacheTTL: 3600, // 1 hour cache for upgrades/downgrades
    });
  }

  /**
   * Get news sentiment
   */
  async getNewsSentiment(symbol: string): Promise<any> {
    return await this.get('/news-sentiment', { symbol: symbol.toUpperCase() }, {
      cacheTTL: 1800, // 30 minutes cache for sentiment
    });
  }

  /**
   * Get peers (similar companies)
   */
  async getPeers(symbol: string): Promise<any> {
    return await this.get('/stock/peers', { symbol: symbol.toUpperCase() }, {
      cacheTTL: 86400, // 24 hours cache for peers
    });
  }

  /**
   * Get market news
   */
  async getMarketNews(category: string = 'general', minId?: number): Promise<any> {
    const params: any = { category };
    if (minId) params.minId = minId;
    
    return await this.get('/news', params, {
      cacheTTL: 600, // 10 minutes cache for market news
    });
  }

  /**
   * Get economic calendar
   */
  async getEconomicCalendar(): Promise<any> {
    return await this.get('/calendar/economic', {}, {
      cacheTTL: 3600, // 1 hour cache for economic calendar
    });
  }

  /**
   * Get earnings calendar
   */
  async getEarningsCalendar(from?: string, to?: string): Promise<any> {
    const fromDate = from || new Date().toISOString().split('T')[0];
    const toDate = to || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    return await this.get('/calendar/earnings', {
      from: fromDate,
      to: toDate,
    }, {
      cacheTTL: 3600, // 1 hour cache for earnings calendar
    });
  }

  /**
   * Search for symbols
   */
  async searchSymbols(query: string): Promise<any> {
    return await this.get('/search', { q: query }, {
      cacheTTL: 86400, // 24 hours cache for symbol searches
    });
  }

  /**
   * Get stock splits
   */
  async getStockSplits(symbol: string, from?: string, to?: string): Promise<any> {
    const fromDate = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    
    return await this.get('/stock/split', {
      symbol: symbol.toUpperCase(),
      from: fromDate,
      to: toDate,
    }, {
      cacheTTL: 86400, // 24 hours cache for splits
    });
  }

  /**
   * Get dividends
   */
  async getDividends(symbol: string, from?: string, to?: string): Promise<any> {
    const fromDate = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    
    return await this.get('/stock/dividend', {
      symbol: symbol.toUpperCase(),
      from: fromDate,
      to: toDate,
    }, {
      cacheTTL: 86400, // 24 hours cache for dividends
    });
  }

  /**
   * Validate connection by making a simple API call
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.get('/quote', { symbol: 'AAPL' }, { 
        cacheTTL: 60,
        skipCache: true,
        timeout: 5000,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default FinnhubClient;
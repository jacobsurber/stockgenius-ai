/**
 * Polygon.io API client implementation
 */

import { BaseClient, BaseClientConfig } from '../BaseClient.js';
import env from '../../config/env.js';

export class PolygonClient extends BaseClient {
  constructor(config: BaseClientConfig) {
    super(config);
    
    // Add API key to all requests
    this.client.interceptors.request.use((config) => {
      config.params = config.params || {};
      config.params.apikey = env.POLYGON_API_KEY;
      return config;
    });
  }

  /**
   * Get last trade for a symbol
   */
  async getLastTrade(symbol: string): Promise<any> {
    return await this.get(`/v2/last/trade/${symbol.toUpperCase()}`, {}, {
      cacheTTL: 60, // 1 minute cache
    });
  }

  /**
   * Get aggregates (bars) for a stock
   */
  async getAggregates(
    symbol: string,
    multiplier: number = 1,
    timespan: string = 'day',
    from: string,
    to: string
  ): Promise<any> {
    return await this.get(`/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timespan}/${from}/${to}`, {
      adjusted: true,
      sort: 'desc',
      limit: 50000,
    }, {
      cacheTTL: timespan === 'day' ? 3600 : 300, // Daily: 1 hour, intraday: 5 minutes
    });
  }

  /**
   * Get grouped daily bars for all stocks
   */
  async getGroupedDaily(date: string): Promise<any> {
    return await this.get(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: true,
    }, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get daily open/close for a stock
   */
  async getDailyOpenClose(symbol: string, date: string): Promise<any> {
    return await this.get(`/v1/open-close/${symbol.toUpperCase()}/${date}`, {
      adjusted: true,
    }, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get previous close for a stock
   */
  async getPreviousClose(symbol: string): Promise<any> {
    return await this.get(`/v2/aggs/ticker/${symbol.toUpperCase()}/prev`, {
      adjusted: true,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get ticker details
   */
  async getTickerDetails(symbol: string): Promise<any> {
    return await this.get(`/v3/reference/tickers/${symbol.toUpperCase()}`, {}, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get ticker news
   */
  async getTickerNews(
    symbol?: string,
    publishedUtc?: string,
    order?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = { limit, order: order || 'desc' };
    if (symbol) params['ticker'] = symbol.toUpperCase();
    if (publishedUtc) params['published_utc'] = publishedUtc;

    return await this.get('/v2/reference/news', params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get market holidays
   */
  async getMarketHolidays(): Promise<any> {
    return await this.get('/v1/marketstatus/upcoming', {}, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get market status
   */
  async getMarketStatus(): Promise<any> {
    return await this.get('/v1/marketstatus/now', {}, {
      cacheTTL: 300, // 5 minutes cache
    });
  }

  /**
   * Get options contracts
   */
  async getOptionsContracts(
    symbol?: string,
    contractType?: 'call' | 'put',
    expirationDate?: string,
    limit: number = 20
  ): Promise<any> {
    const params: any = { limit };
    if (symbol) params['underlying_ticker'] = symbol.toUpperCase();
    if (contractType) params['contract_type'] = contractType;
    if (expirationDate) params['expiration_date'] = expirationDate;

    return await this.get('/v3/reference/options/contracts', params, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get stock splits
   */
  async getStockSplits(
    symbol?: string,
    executionDate?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = { limit };
    if (symbol) params['ticker'] = symbol.toUpperCase();
    if (executionDate) params['execution_date'] = executionDate;

    return await this.get('/v3/reference/splits', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get dividends
   */
  async getDividends(
    symbol?: string,
    exDate?: string,
    paymentDate?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = { limit };
    if (symbol) params['ticker'] = symbol.toUpperCase();
    if (exDate) params['ex_dividend_date'] = exDate;
    if (paymentDate) params['payment_date'] = paymentDate;

    return await this.get('/v3/reference/dividends', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get financials
   */
  async getFinancials(
    symbol: string,
    timeframe: 'annual' | 'quarterly' = 'quarterly',
    limit: number = 4
  ): Promise<any> {
    return await this.get(`/vX/reference/financials`, {
      ticker: symbol.toUpperCase(),
      timeframe,
      limit,
    }, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Search tickers
   */
  async searchTickers(
    search: string,
    type?: string,
    market?: string,
    exchange?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = { search, limit };
    if (type) params.type = type;
    if (market) params.market = market;
    if (exchange) params.exchange = exchange;

    return await this.get('/v3/reference/tickers', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get technical indicators (SMA)
   */
  async getSMA(
    symbol: string,
    timestamp?: string,
    windowSize: number = 50,
    seriesType: string = 'close',
    expand: boolean = true,
    order?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = {
      'timestamp': timestamp,
      'timestamp.gte': timestamp,
      'window': windowSize,
      'series_type': seriesType,
      'expand_underlying': expand,
      'order': order || 'desc',
      'limit': limit,
    };

    return await this.get(`/v1/indicators/sma/${symbol.toUpperCase()}`, params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get technical indicators (EMA)
   */
  async getEMA(
    symbol: string,
    timestamp?: string,
    windowSize: number = 50,
    seriesType: string = 'close',
    expand: boolean = true,
    order?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = {
      'timestamp': timestamp,
      'timestamp.gte': timestamp,
      'window': windowSize,
      'series_type': seriesType,
      'expand_underlying': expand,
      'order': order || 'desc',
      'limit': limit,
    };

    return await this.get(`/v1/indicators/ema/${symbol.toUpperCase()}`, params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get technical indicators (RSI)
   */
  async getRSI(
    symbol: string,
    timestamp?: string,
    windowSize: number = 14,
    seriesType: string = 'close',
    expand: boolean = true,
    order?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = {
      'timestamp': timestamp,
      'timestamp.gte': timestamp,
      'window': windowSize,
      'series_type': seriesType,
      'expand_underlying': expand,
      'order': order || 'desc',
      'limit': limit,
    };

    return await this.get(`/v1/indicators/rsi/${symbol.toUpperCase()}`, params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get technical indicators (MACD)
   */
  async getMACD(
    symbol: string,
    timestamp?: string,
    shortWindow: number = 12,
    longWindow: number = 26,
    signalWindow: number = 9,
    seriesType: string = 'close',
    expand: boolean = true,
    order?: string,
    limit: number = 10
  ): Promise<any> {
    const params: any = {
      'timestamp': timestamp,
      'timestamp.gte': timestamp,
      'short_window': shortWindow,
      'long_window': longWindow,
      'signal_window': signalWindow,
      'series_type': seriesType,
      'expand_underlying': expand,
      'order': order || 'desc',
      'limit': limit,
    };

    return await this.get(`/v1/indicators/macd/${symbol.toUpperCase()}`, params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get real-time quotes (WebSocket alternative via REST)
   */
  async getQuote(symbol: string): Promise<any> {
    try {
      // Get the last trade and aggregate it with other data
      const [lastTrade, prevClose] = await Promise.all([
        this.getLastTrade(symbol),
        this.getPreviousClose(symbol),
      ]);

      const currentPrice = lastTrade.results?.p || 0;
      const previousClose = prevClose.results?.[0]?.c || 0;
      const change = currentPrice - previousClose;
      const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

      return {
        symbol: symbol.toUpperCase(),
        price: currentPrice,
        change,
        changePercent,
        volume: lastTrade.results?.s || 0,
        timestamp: lastTrade.results?.t || Date.now(),
        previousClose,
        // Add other fields from prevClose if available
        high: prevClose.results?.[0]?.h || 0,
        low: prevClose.results?.[0]?.l || 0,
        open: prevClose.results?.[0]?.o || 0,
      };
    } catch (error) {
      // Fallback to just the last trade data
      const lastTrade = await this.getLastTrade(symbol);
      return {
        symbol: symbol.toUpperCase(),
        price: lastTrade.results?.p || 0,
        volume: lastTrade.results?.s || 0,
        timestamp: lastTrade.results?.t || Date.now(),
      };
    }
  }

  /**
   * Validate connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.getMarketStatus();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default PolygonClient;
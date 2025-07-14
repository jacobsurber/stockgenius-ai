/**
 * Alpha Vantage API client implementation
 */

import { BaseClient, BaseClientConfig } from '../BaseClient.js';
import env from '../../config/env.js';

export class AlphaVantageClient extends BaseClient {
  constructor(config: BaseClientConfig) {
    super(config);
    
    // Add API key to all requests
    this.client.interceptors.request.use((config) => {
      config.params = config.params || {};
      config.params.apikey = env.ALPHA_VANTAGE_API_KEY;
      return config;
    });
  }

  /**
   * Get global quote
   */
  async getGlobalQuote(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'GLOBAL_QUOTE',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 300, // 5 minutes cache
    });
  }

  /**
   * Get company overview
   */
  async getCompanyOverview(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'OVERVIEW',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get time series intraday
   */
  async getTimeSeriesIntraday(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '60min' = '5min',
    outputsize: 'compact' | 'full' = 'compact'
  ): Promise<any> {
    return await this.get('/', {
      function: 'TIME_SERIES_INTRADAY',
      symbol: symbol.toUpperCase(),
      interval,
      outputsize,
    }, {
      cacheTTL: 300, // 5 minutes cache for intraday
    });
  }

  /**
   * Get daily time series
   */
  async getTimeSeriesDaily(
    symbol: string,
    outputsize: 'compact' | 'full' = 'compact'
  ): Promise<any> {
    return await this.get('/', {
      function: 'TIME_SERIES_DAILY',
      symbol: symbol.toUpperCase(),
      outputsize,
    }, {
      cacheTTL: 3600, // 1 hour cache for daily
    });
  }

  /**
   * Get daily adjusted time series
   */
  async getTimeSeriesDailyAdjusted(
    symbol: string,
    outputsize: 'compact' | 'full' = 'compact'
  ): Promise<any> {
    return await this.get('/', {
      function: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol: symbol.toUpperCase(),
      outputsize,
    }, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get weekly time series
   */
  async getTimeSeriesWeekly(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'TIME_SERIES_WEEKLY',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 7200, // 2 hours cache
    });
  }

  /**
   * Get monthly time series
   */
  async getTimeSeriesMonthly(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'TIME_SERIES_MONTHLY',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get income statement
   */
  async getIncomeStatement(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'INCOME_STATEMENT',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get balance sheet
   */
  async getBalanceSheet(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'BALANCE_SHEET',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get cash flow
   */
  async getCashFlow(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'CASH_FLOW',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get earnings
   */
  async getEarnings(symbol: string): Promise<any> {
    return await this.get('/', {
      function: 'EARNINGS',
      symbol: symbol.toUpperCase(),
    }, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get listing status
   */
  async getListingStatus(date?: string, state?: 'active' | 'delisted'): Promise<any> {
    const params: any = { function: 'LISTING_STATUS' };
    if (date) params.date = date;
    if (state) params.state = state;

    return await this.get('/', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Search symbols
   */
  async searchSymbols(keywords: string): Promise<any> {
    return await this.get('/', {
      function: 'SYMBOL_SEARCH',
      keywords,
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get news sentiment
   */
  async getNewsSentiment(
    tickers?: string,
    topics?: string,
    timeFrom?: string,
    timeTo?: string,
    sort?: 'LATEST' | 'EARLIEST' | 'RELEVANCE',
    limit: number = 50
  ): Promise<any> {
    const params: any = { function: 'NEWS_SENTIMENT', limit };
    if (tickers) params.tickers = tickers;
    if (topics) params.topics = topics;
    if (timeFrom) params.time_from = timeFrom;
    if (timeTo) params.time_to = timeTo;
    if (sort) params.sort = sort;

    return await this.get('/', params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get Simple Moving Average (SMA)
   */
  async getSMA(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    timePeriod: number = 20,
    seriesType: 'close' | 'open' | 'high' | 'low' = 'close'
  ): Promise<any> {
    return await this.get('/', {
      function: 'SMA',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: timePeriod,
      series_type: seriesType,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get Exponential Moving Average (EMA)
   */
  async getEMA(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    timePeriod: number = 20,
    seriesType: 'close' | 'open' | 'high' | 'low' = 'close'
  ): Promise<any> {
    return await this.get('/', {
      function: 'EMA',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: timePeriod,
      series_type: seriesType,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get RSI
   */
  async getRSI(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    timePeriod: number = 14,
    seriesType: 'close' | 'open' | 'high' | 'low' = 'close'
  ): Promise<any> {
    return await this.get('/', {
      function: 'RSI',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: timePeriod,
      series_type: seriesType,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get MACD
   */
  async getMACD(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    seriesType: 'close' | 'open' | 'high' | 'low' = 'close',
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): Promise<any> {
    return await this.get('/', {
      function: 'MACD',
      symbol: symbol.toUpperCase(),
      interval,
      series_type: seriesType,
      fastperiod: fastPeriod,
      slowperiod: slowPeriod,
      signalperiod: signalPeriod,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get Stochastic Oscillator
   */
  async getStoch(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    fastkPeriod: number = 5,
    slowkPeriod: number = 3,
    slowdPeriod: number = 3,
    slowkMAType: number = 0,
    slowdMAType: number = 0
  ): Promise<any> {
    return await this.get('/', {
      function: 'STOCH',
      symbol: symbol.toUpperCase(),
      interval,
      fastkperiod: fastkPeriod,
      slowkperiod: slowkPeriod,
      slowdperiod: slowdPeriod,
      slowkmatype: slowkMAType,
      slowdmatype: slowdMAType,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get ADX (Average Directional Index)
   */
  async getADX(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    timePeriod: number = 14
  ): Promise<any> {
    return await this.get('/', {
      function: 'ADX',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: timePeriod,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get CCI (Commodity Channel Index)
   */
  async getCCI(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    timePeriod: number = 20
  ): Promise<any> {
    return await this.get('/', {
      function: 'CCI',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: timePeriod,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get Aroon
   */
  async getAroon(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    timePeriod: number = 14
  ): Promise<any> {
    return await this.get('/', {
      function: 'AROON',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: timePeriod,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get Bollinger Bands
   */
  async getBBands(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min',
    timePeriod: number = 20,
    seriesType: 'close' | 'open' | 'high' | 'low' = 'close',
    nbdevup: number = 2,
    nbdevdn: number = 2,
    matype: number = 0
  ): Promise<any> {
    return await this.get('/', {
      function: 'BBANDS',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: timePeriod,
      series_type: seriesType,
      nbdevup,
      nbdevdn,
      matype,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get OBV (On Balance Volume)
   */
  async getOBV(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' | '1min' | '5min' | '15min' | '30min' | '60min'
  ): Promise<any> {
    return await this.get('/', {
      function: 'OBV',
      symbol: symbol.toUpperCase(),
      interval,
    }, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get real GDP
   */
  async getRealGDP(interval: 'quarterly' | 'annual' = 'quarterly'): Promise<any> {
    return await this.get('/', {
      function: 'REAL_GDP',
      interval,
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get inflation rate
   */
  async getInflation(): Promise<any> {
    return await this.get('/', {
      function: 'INFLATION',
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get consumer price index
   */
  async getCPI(interval: 'monthly' | 'semiannual' = 'monthly'): Promise<any> {
    return await this.get('/', {
      function: 'CPI',
      interval,
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get unemployment rate
   */
  async getUnemployment(): Promise<any> {
    return await this.get('/', {
      function: 'UNEMPLOYMENT',
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get federal funds rate
   */
  async getFederalFundsRate(interval: 'daily' | 'weekly' | 'monthly' = 'monthly'): Promise<any> {
    return await this.get('/', {
      function: 'FEDERAL_FUNDS_RATE',
      interval,
    }, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Validate connection by making a simple API call
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.getGlobalQuote('AAPL');
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default AlphaVantageClient;
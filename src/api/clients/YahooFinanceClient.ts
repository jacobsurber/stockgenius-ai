/**
 * Yahoo Finance API client - Free data source
 */

import { BaseClient, BaseClientConfig } from '../BaseClient.js';
import { loggerUtils } from '../../config/logger.js';

export class YahooFinanceClient extends BaseClient {
  constructor(config: BaseClientConfig) {
    super(config);
  }

  /**
   * Get quote data
   */
  async getQuote(symbol: string): Promise<any> {
    try {
      const response = await this.get('/v8/finance/chart/' + symbol.toUpperCase(), {
        interval: '1d',
        range: '1d',
        includePrePost: false,
      }, {
        cacheTTL: 300, // 5 minutes cache
      });

      const result = response.chart?.result?.[0];
      if (!result) {
        throw new Error('No quote data found');
      }

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];
      const adjclose = result.indicators?.adjclose?.[0]?.adjclose;

      return {
        symbol: meta.symbol,
        price: meta.regularMarketPrice,
        change: meta.regularMarketPrice - meta.previousClose,
        changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
        volume: meta.regularMarketVolume,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        open: meta.regularMarketDayLow,
        previousClose: meta.previousClose,
        marketCap: meta.marketCap,
        currency: meta.currency,
        exchange: meta.exchangeName,
        timestamp: meta.regularMarketTime,
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance quote error', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get company information
   */
  async getCompanyInfo(symbol: string): Promise<any> {
    try {
      const modules = [
        'assetProfile',
        'summaryProfile',
        'summaryDetail',
        'defaultKeyStatistics',
        'financialData',
      ].join(',');

      const response = await this.get('/v10/finance/quoteSummary/' + symbol.toUpperCase(), {
        modules,
      }, {
        cacheTTL: 86400, // 24 hours cache
      });

      const result = response.quoteSummary?.result?.[0];
      if (!result) {
        throw new Error('No company info found');
      }

      const profile = result.assetProfile || result.summaryProfile;
      const details = result.summaryDetail;
      const keyStats = result.defaultKeyStatistics;
      const financials = result.financialData;

      return {
        symbol: symbol.toUpperCase(),
        name: profile?.longName || profile?.shortName,
        description: profile?.longBusinessSummary,
        sector: profile?.sector,
        industry: profile?.industry,
        country: profile?.country,
        website: profile?.website,
        employees: profile?.fullTimeEmployees,
        marketCap: details?.marketCap?.raw,
        enterpriseValue: keyStats?.enterpriseValue?.raw,
        trailingPE: details?.trailingPE?.raw,
        forwardPE: details?.forwardPE?.raw,
        pegRatio: keyStats?.pegRatio?.raw,
        priceToBook: keyStats?.priceToBook?.raw,
        priceToSales: keyStats?.priceToSalesTrailing12Months?.raw,
        dividendYield: details?.dividendYield?.raw,
        payoutRatio: keyStats?.payoutRatio?.raw,
        beta: keyStats?.beta?.raw,
        week52High: details?.fiftyTwoWeekHigh?.raw,
        week52Low: details?.fiftyTwoWeekLow?.raw,
        day50Average: details?.fiftyDayAverage?.raw,
        day200Average: details?.twoHundredDayAverage?.raw,
        sharesOutstanding: keyStats?.sharesOutstanding?.raw,
        sharesFloat: keyStats?.floatShares?.raw,
        revenue: financials?.totalRevenue?.raw,
        grossMargin: financials?.grossMargins?.raw,
        operatingMargin: financials?.operatingMargins?.raw,
        profitMargin: financials?.profitMargins?.raw,
        returnOnEquity: financials?.returnOnEquity?.raw,
        returnOnAssets: financials?.returnOnAssets?.raw,
        debtToEquity: financials?.debtToEquity?.raw,
        currentRatio: financials?.currentRatio?.raw,
        quickRatio: financials?.quickRatio?.raw,
        revenueGrowth: financials?.revenueGrowth?.raw,
        earningsGrowth: financials?.earningsGrowth?.raw,
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance company info error', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get historical price data
   */
  async getHistoricalData(
    symbol: string,
    period1?: number,
    period2?: number,
    interval: string = '1d'
  ): Promise<any> {
    try {
      const from = period1 || Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
      const to = period2 || Math.floor(Date.now() / 1000);

      const response = await this.get('/v8/finance/chart/' + symbol.toUpperCase(), {
        period1: from,
        period2: to,
        interval,
        includePrePost: false,
        events: 'div,split',
      }, {
        cacheTTL: interval === '1d' ? 3600 : 300, // Daily: 1 hour, intraday: 5 minutes
      });

      const result = response.chart?.result?.[0];
      if (!result) {
        throw new Error('No historical data found');
      }

      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];

      const historicalData = timestamps.map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000).toISOString().split('T')[0],
        timestamp: timestamp * 1000,
        open: quote.open?.[index],
        high: quote.high?.[index],
        low: quote.low?.[index],
        close: quote.close?.[index],
        adjClose: adjclose[index],
        volume: quote.volume?.[index],
      })).filter((item: any) => item.close !== null);

      return {
        symbol: symbol.toUpperCase(),
        currency: result.meta?.currency,
        exchangeTimezoneName: result.meta?.exchangeTimezoneName,
        data: historicalData,
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance historical data error', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get financial statements
   */
  async getFinancials(symbol: string, type: 'income' | 'balance' | 'cash' = 'income'): Promise<any> {
    try {
      const moduleMap = {
        income: 'incomeStatementHistory,incomeStatementHistoryQuarterly',
        balance: 'balanceSheetHistory,balanceSheetHistoryQuarterly',
        cash: 'cashflowStatementHistory,cashflowStatementHistoryQuarterly',
      };

      const response = await this.get('/v10/finance/quoteSummary/' + symbol.toUpperCase(), {
        modules: moduleMap[type],
      }, {
        cacheTTL: 43200, // 12 hours cache
      });

      const result = response.quoteSummary?.result?.[0];
      if (!result) {
        throw new Error('No financial data found');
      }

      return {
        symbol: symbol.toUpperCase(),
        type,
        annual: this.extractFinancialData(result[`${type}StatementHistory`]?.[`${type}Statements`]),
        quarterly: this.extractFinancialData(result[`${type}StatementHistoryQuarterly`]?.[`${type}Statements`]),
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance financials error', {
        symbol,
        type,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get earnings history and estimates
   */
  async getEarnings(symbol: string): Promise<any> {
    try {
      const response = await this.get('/v10/finance/quoteSummary/' + symbol.toUpperCase(), {
        modules: 'earnings,earningsHistory,earningsTrend,calendarEvents',
      }, {
        cacheTTL: 43200, // 12 hours cache
      });

      const result = response.quoteSummary?.result?.[0];
      if (!result) {
        throw new Error('No earnings data found');
      }

      const earnings = result.earnings;
      const history = result.earningsHistory;
      const trend = result.earningsTrend;
      const calendar = result.calendarEvents;

      return {
        symbol: symbol.toUpperCase(),
        quarterly: earnings?.earningsChart?.quarterly?.map((q: any) => ({
          date: q.date,
          actual: q.actual?.raw,
          estimate: q.estimate?.raw,
        })),
        annual: earnings?.earningsChart?.yearly?.map((y: any) => ({
          date: y.date,
          earnings: y.earnings?.raw,
          revenue: y.revenue?.raw,
        })),
        history: history?.history?.map((h: any) => ({
          quarter: h.quarter,
          epsActual: h.epsActual?.raw,
          epsEstimate: h.epsEstimate?.raw,
          epsDifference: h.epsDifference?.raw,
          surprisePercent: h.surprisePercent?.raw,
        })),
        estimates: trend?.trend?.map((t: any) => ({
          period: t.period,
          endDate: t.endDate,
          growth: t.growth?.raw,
          earningsEstimate: {
            avg: t.earningsEstimate?.avg?.raw,
            low: t.earningsEstimate?.low?.raw,
            high: t.earningsEstimate?.high?.raw,
            numberOfAnalysts: t.earningsEstimate?.numberOfAnalysts?.raw,
          },
          revenueEstimate: {
            avg: t.revenueEstimate?.avg?.raw,
            low: t.revenueEstimate?.low?.raw,
            high: t.revenueEstimate?.high?.raw,
            numberOfAnalysts: t.revenueEstimate?.numberOfAnalysts?.raw,
          },
        })),
        nextEarningsDate: calendar?.earnings?.earningsDate?.[0]?.raw,
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance earnings error', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get options data
   */
  async getOptions(symbol: string, expiration?: number): Promise<any> {
    try {
      const params: any = {};
      if (expiration) params.date = expiration;

      const response = await this.get('/v7/finance/options/' + symbol.toUpperCase(), params, {
        cacheTTL: 300, // 5 minutes cache for options
      });

      const result = response.optionChain?.result?.[0];
      if (!result) {
        throw new Error('No options data found');
      }

      return {
        symbol: symbol.toUpperCase(),
        expirationDates: result.expirationDates,
        strikes: result.strikes,
        underlyingSymbol: result.underlyingSymbol,
        quote: result.quote,
        options: result.options?.map((option: any) => ({
          expirationDate: option.expirationDate,
          hasMiniOptions: option.hasMiniOptions,
          calls: option.calls?.map((call: any) => ({
            contractSymbol: call.contractSymbol,
            strike: call.strike?.raw,
            currency: call.currency,
            lastPrice: call.lastPrice?.raw,
            change: call.change?.raw,
            percentChange: call.percentChange?.raw,
            volume: call.volume?.raw,
            openInterest: call.openInterest?.raw,
            bid: call.bid?.raw,
            ask: call.ask?.raw,
            contractSize: call.contractSize,
            lastTradeDate: call.lastTradeDate?.raw,
            impliedVolatility: call.impliedVolatility?.raw,
            inTheMoney: call.inTheMoney,
          })),
          puts: option.puts?.map((put: any) => ({
            contractSymbol: put.contractSymbol,
            strike: put.strike?.raw,
            currency: put.currency,
            lastPrice: put.lastPrice?.raw,
            change: put.change?.raw,
            percentChange: put.percentChange?.raw,
            volume: put.volume?.raw,
            openInterest: put.openInterest?.raw,
            bid: put.bid?.raw,
            ask: put.ask?.raw,
            contractSize: put.contractSize,
            lastTradeDate: put.lastTradeDate?.raw,
            impliedVolatility: put.impliedVolatility?.raw,
            inTheMoney: put.inTheMoney,
          })),
        })),
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance options error', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Search for symbols
   */
  async searchSymbols(query: string): Promise<any> {
    try {
      const response = await this.get('/v1/finance/search', {
        q: query,
        lang: 'en-US',
        region: 'US',
        quotesCount: 10,
        newsCount: 0,
      }, {
        cacheTTL: 86400, // 24 hours cache for searches
      });

      return {
        query,
        quotes: response.quotes?.map((quote: any) => ({
          symbol: quote.symbol,
          shortname: quote.shortname,
          longname: quote.longname,
          exchange: quote.exchange,
          sector: quote.sector,
          industry: quote.industry,
          quoteType: quote.quoteType,
          score: quote.score,
        })),
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance search error', {
        query,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get trending symbols
   */
  async getTrendingSymbols(region: string = 'US'): Promise<any> {
    try {
      const response = await this.get('/v1/finance/trending/' + region, {}, {
        cacheTTL: 3600, // 1 hour cache for trending
      });

      return {
        region,
        symbols: response.finance?.result?.[0]?.quotes?.map((quote: any) => ({
          symbol: quote.symbol,
          shortName: quote.shortName,
          longName: quote.longName,
          regularMarketPrice: quote.regularMarketPrice,
          regularMarketChange: quote.regularMarketChange,
          regularMarketChangePercent: quote.regularMarketChangePercent,
          marketState: quote.marketState,
        })),
      };
    } catch (error) {
      loggerUtils.apiLogger.error('Yahoo Finance trending error', {
        region,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Extract and normalize financial data
   */
  private extractFinancialData(statements: any[]): any[] {
    if (!statements) return [];

    return statements.map((statement: any) => {
      const data: any = {
        endDate: statement.endDate,
        period: statement.endDate,
      };

      // Extract all financial items
      for (const [key, value] of Object.entries(statement)) {
        if (key !== 'endDate' && typeof value === 'object' && value !== null) {
          data[key] = (value as any).raw;
        }
      }

      return data;
    });
  }

  /**
   * Validate connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.getQuote('AAPL');
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default YahooFinanceClient;
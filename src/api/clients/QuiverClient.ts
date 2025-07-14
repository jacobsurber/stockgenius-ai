/**
 * Quiver Quant API client implementation
 */

import { BaseClient, BaseClientConfig } from '../BaseClient.js';
import env from '../../config/env.js';

export class QuiverClient extends BaseClient {
  constructor(config: BaseClientConfig) {
    super(config);
    
    // Add API key to all requests
    this.client.interceptors.request.use((config) => {
      config.headers.Authorization = `Bearer ${env.QUIVER_API_KEY}`;
      return config;
    });
  }

  /**
   * Get congressional trading data
   */
  async getCongressionalTrading(
    symbol?: string,
    chamber?: 'house' | 'senate',
    daysBack: number = 30
  ): Promise<any> {
    let endpoint = '/historical/congresstrading';
    if (chamber === 'house') endpoint = '/historical/housetrading';
    if (chamber === 'senate') endpoint = '/historical/senatetrading';
    
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get(endpoint, params, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get insider trading data
   */
  async getInsiderTrading(symbol?: string, daysBack: number = 90): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/insider', params, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get Reddit sentiment data
   */
  async getRedditSentiment(symbol?: string, daysBack: number = 30): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/reddit', params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get Twitter sentiment data
   */
  async getTwitterSentiment(symbol?: string, daysBack: number = 30): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/twitter', params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get WallStreetBets sentiment data
   */
  async getWallStreetBetsSentiment(symbol?: string, daysBack: number = 30): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/wallstreetbets', params, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Get government contracts data
   */
  async getGovernmentContracts(symbol?: string, daysBack: number = 365): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/government', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get lobbying data
   */
  async getLobbyingData(symbol?: string, yearsBack: number = 2): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/lobbying', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get contract awards data
   */
  async getContractAwards(symbol?: string, daysBack: number = 365): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/contracts', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get patent data
   */
  async getPatentData(symbol?: string, yearsBack: number = 5): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/patents', params, {
      cacheTTL: 86400 * 7, // 7 days cache
    });
  }

  /**
   * Get clinical trials data
   */
  async getClinicalTrials(symbol?: string, yearsBack: number = 3): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/clinicaltrials', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get FDA calendar data
   */
  async getFDACalendar(symbol?: string): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/live/fdacalendar', params, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get institutional ownership data
   */
  async getInstitutionalOwnership(symbol?: string): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/institutional', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get 13F filings data
   */
  async get13FFilings(symbol?: string, quarterBack: number = 4): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/13f', params, {
      cacheTTL: 86400 * 7, // 7 days cache
    });
  }

  /**
   * Get hedge fund holdings
   */
  async getHedgeFundHoldings(fund?: string, symbol?: string): Promise<any> {
    const params: any = {};
    if (fund) params.fund = fund;
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/hedgefunds', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get ETF holdings
   */
  async getETFHoldings(etf?: string, symbol?: string): Promise<any> {
    const params: any = {};
    if (etf) params.etf = etf;
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/etfholdings', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get short interest data
   */
  async getShortInterest(symbol?: string, daysBack: number = 90): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/shortinterest', params, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get failure-to-deliver data
   */
  async getFailureToDeliver(symbol?: string, daysBack: number = 90): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/ftd', params, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get analyst price targets
   */
  async getAnalystTargets(symbol?: string, daysBack: number = 365): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/analyst', params, {
      cacheTTL: 43200, // 12 hours cache
    });
  }

  /**
   * Get earnings whisper data
   */
  async getEarningsWhisper(symbol?: string): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/live/earningswhisper', params, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get options flow data
   */
  async getOptionsFlow(symbol?: string, daysBack: number = 7): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/live/optionsflow', params, {
      cacheTTL: 300, // 5 minutes cache
    });
  }

  /**
   * Get dark pool data
   */
  async getDarkPool(symbol?: string, daysBack: number = 30): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/darkpool', params, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get off-exchange trading data
   */
  async getOffExchange(symbol?: string, daysBack: number = 30): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/offexchange', params, {
      cacheTTL: 3600, // 1 hour cache
    });
  }

  /**
   * Get cryptocurrency wallets data
   */
  async getCryptoWallets(symbol?: string): Promise<any> {
    const params: any = {};
    if (symbol) params.ticker = symbol.toUpperCase();
    
    return await this.get('/historical/cryptowallets', params, {
      cacheTTL: 86400, // 24 hours cache
    });
  }

  /**
   * Get comprehensive sentiment data for a symbol
   */
  async getSentimentData(symbol: string): Promise<any> {
    try {
      const [reddit, twitter, wsb] = await Promise.allSettled([
        this.getRedditSentiment(symbol),
        this.getTwitterSentiment(symbol),
        this.getWallStreetBetsSentiment(symbol),
      ]);

      return {
        symbol: symbol.toUpperCase(),
        reddit: reddit.status === 'fulfilled' ? reddit.value : null,
        twitter: twitter.status === 'fulfilled' ? twitter.value : null,
        wallstreetbets: wsb.status === 'fulfilled' ? wsb.value : null,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(`Failed to get sentiment data for ${symbol}: ${error.message}`);
    }
  }

  /**
   * Get comprehensive analysis for a symbol
   */
  async getComprehensiveAnalysis(symbol: string): Promise<any> {
    try {
      const [
        congressional,
        insider,
        sentiment,
        institutional,
        government,
        analyst,
      ] = await Promise.allSettled([
        this.getCongressionalTrading(symbol),
        this.getInsiderTrading(symbol),
        this.getSentimentData(symbol),
        this.getInstitutionalOwnership(symbol),
        this.getGovernmentContracts(symbol),
        this.getAnalystTargets(symbol),
      ]);

      return {
        symbol: symbol.toUpperCase(),
        congressional: congressional.status === 'fulfilled' ? congressional.value : null,
        insider: insider.status === 'fulfilled' ? insider.value : null,
        sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null,
        institutional: institutional.status === 'fulfilled' ? institutional.value : null,
        government: government.status === 'fulfilled' ? government.value : null,
        analyst: analyst.status === 'fulfilled' ? analyst.value : null,
        timestamp: Date.now(),
        errors: [
          congressional,
          insider,
          sentiment,
          institutional,
          government,
          analyst,
        ].filter(result => result.status === 'rejected').map(result => result.reason?.message),
      };
    } catch (error) {
      throw new Error(`Failed to get comprehensive analysis for ${symbol}: ${error.message}`);
    }
  }

  /**
   * Get trending stocks
   */
  async getTrendingStocks(source: 'reddit' | 'twitter' | 'wallstreetbets' = 'reddit'): Promise<any> {
    return await this.get(`/live/trending${source}`, {}, {
      cacheTTL: 1800, // 30 minutes cache
    });
  }

  /**
   * Validate connection by making a simple API call
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.getCongressionalTrading(undefined, undefined, 7);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default QuiverClient;
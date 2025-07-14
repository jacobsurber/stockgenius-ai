import env, { envUtils } from './env.js';

/**
 * API endpoints configuration for all data sources
 */
export const apiEndpoints = {
  // Finnhub API endpoints
  finnhub: {
    baseURL: 'https://finnhub.io/api/v1',
    timeout: 10000,
    retries: 3,
    endpoints: {
      quote: '/quote',
      profile: '/stock/profile2',
      news: '/company-news',
      earnings: '/stock/earnings',
      metrics: '/stock/metric',
      peers: '/stock/peers',
      candles: '/stock/candle',
      splits: '/stock/split',
      dividends: '/stock/dividend',
      insider: '/stock/insider-transactions',
      recommendation: '/stock/recommendation',
      upgrade: '/stock/upgrade-downgrade',
      sentiment: '/news-sentiment',
      marketNews: '/news',
      crypto: '/crypto/candle',
      forex: '/forex/candle',
    },
    rateLimit: {
      requestsPerMinute: env.FINNHUB_RATE_LIMIT,
      burstLimit: 10,
      queueLimit: 100,
    },
    authentication: {
      type: 'query_param',
      param: 'token',
      key: env.FINNHUB_API_KEY,
    },
  },

  // Polygon.io API endpoints
  polygon: {
    baseURL: 'https://api.polygon.io',
    timeout: 15000,
    retries: 3,
    endpoints: {
      quote: '/v2/last/trade',
      aggregates: '/v2/aggs/ticker',
      groupedDaily: '/v2/aggs/grouped/locale/us/market/stocks',
      dailyOpenClose: '/v1/open-close',
      previousClose: '/v2/aggs/ticker/{ticker}/prev',
      technicals: '/v1/indicators',
      marketHolidays: '/v1/marketstatus/upcoming',
      marketStatus: '/v1/marketstatus/now',
      ticker: '/v3/reference/tickers',
      tickerNews: '/v2/reference/news',
      splits: '/v3/reference/splits',
      dividends: '/v3/reference/dividends',
      financials: '/vX/reference/financials',
      options: '/v3/reference/options/contracts',
      crypto: '/v2/aggs/ticker',
      forex: '/v1/historic/forex',
    },
    rateLimit: {
      requestsPerMinute: env.POLYGON_RATE_LIMIT,
      burstLimit: 5,
      queueLimit: 50,
    },
    authentication: {
      type: 'query_param',
      param: 'apikey',
      key: env.POLYGON_API_KEY,
    },
  },

  // Alpha Vantage API endpoints
  alphaVantage: {
    baseURL: 'https://www.alphavantage.co/query',
    timeout: 20000,
    retries: 2,
    endpoints: {
      overview: '?function=OVERVIEW',
      quote: '?function=GLOBAL_QUOTE',
      intraday: '?function=TIME_SERIES_INTRADAY',
      daily: '?function=TIME_SERIES_DAILY',
      dailyAdjusted: '?function=TIME_SERIES_DAILY_ADJUSTED',
      weekly: '?function=TIME_SERIES_WEEKLY',
      weeklyAdjusted: '?function=TIME_SERIES_WEEKLY_ADJUSTED',
      monthly: '?function=TIME_SERIES_MONTHLY',
      monthlyAdjusted: '?function=TIME_SERIES_MONTHLY_ADJUSTED',
      incomeStatement: '?function=INCOME_STATEMENT',
      balanceSheet: '?function=BALANCE_SHEET',
      cashFlow: '?function=CASH_FLOW',
      earnings: '?function=EARNINGS',
      listing: '?function=LISTING_STATUS',
      search: '?function=SYMBOL_SEARCH',
      news: '?function=NEWS_SENTIMENT',
      sma: '?function=SMA',
      rsi: '?function=RSI',
      macd: '?function=MACD',
      stoch: '?function=STOCH',
      adx: '?function=ADX',
      cci: '?function=CCI',
      aroon: '?function=AROON',
      bbands: '?function=BBANDS',
      ad: '?function=AD',
      obv: '?function=OBV',
    },
    rateLimit: {
      requestsPerMinute: env.ALPHA_VANTAGE_RATE_LIMIT,
      burstLimit: 2,
      queueLimit: 25,
    },
    authentication: {
      type: 'query_param',
      param: 'apikey',
      key: env.ALPHA_VANTAGE_API_KEY,
    },
  },

  // Quiver Quant API endpoints
  quiver: {
    baseURL: 'https://api.quiverquant.com/beta',
    timeout: 15000,
    retries: 3,
    endpoints: {
      congressional: '/historical/congresstrading',
      congressionalByTicker: '/historical/congresstrading/{ticker}',
      senate: '/historical/senatetrading',
      house: '/historical/housetrading',
      insider: '/historical/insider',
      insiderByTicker: '/historical/insider/{ticker}',
      reddit: '/historical/reddit',
      redditByTicker: '/historical/reddit/{ticker}',
      twitter: '/historical/twitter',
      twitterByTicker: '/historical/twitter/{ticker}',
      wallstreetbets: '/historical/wallstreetbets',
      government: '/historical/government',
      governmentByTicker: '/historical/government/{ticker}',
      lobbying: '/historical/lobbying',
      lobbyingByTicker: '/historical/lobbying/{ticker}',
      contracts: '/historical/contracts',
      contractsByTicker: '/historical/contracts/{ticker}',
      patents: '/historical/patents',
      patentsByTicker: '/historical/patents/{ticker}',
      clinical: '/historical/clinicaltrials',
      clinicalByTicker: '/historical/clinicaltrials/{ticker}',
    },
    rateLimit: {
      requestsPerMinute: env.QUIVER_RATE_LIMIT,
      burstLimit: 50,
      queueLimit: 200,
    },
    authentication: {
      type: 'bearer',
      key: env.QUIVER_API_KEY,
    },
  },
};

/**
 * API provider utility functions
 */
export const apiUtils = {
  // Get available providers
  getAvailableProviders: () => {
    return Object.keys(apiEndpoints).filter(provider => 
      envUtils.hasValidApiKey(provider === 'alpha_vantage' ? 'alpha_vantage' : provider)
    );
  },

  // Get provider configuration
  getProviderConfig: (provider) => {
    const config = apiEndpoints[provider];
    if (!config) {
      throw new Error(`Unknown API provider: ${provider}`);
    }

    // Check if API key is available
    const keyField = provider === 'alpha_vantage' ? 'ALPHA_VANTAGE_API_KEY' : 
                    provider === 'quiver' ? 'QUIVER_API_KEY' :
                    `${provider.toUpperCase()}_API_KEY`;
    
    if (!env[keyField]) {
      throw new Error(`API key not configured for provider: ${provider}`);
    }

    return {
      ...config,
      authentication: {
        ...config.authentication,
        key: env[keyField],
      },
    };
  },

  // Build full URL for endpoint
  buildURL: (provider, endpoint, params = {}) => {
    const config = apiEndpoints[provider];
    if (!config) {
      throw new Error(`Unknown API provider: ${provider}`);
    }

    const endpointPath = config.endpoints[endpoint];
    if (!endpointPath) {
      throw new Error(`Unknown endpoint '${endpoint}' for provider '${provider}'`);
    }

    let url = config.baseURL + endpointPath;

    // Replace path parameters
    Object.keys(params).forEach(key => {
      url = url.replace(`{${key}}`, params[key]);
    });

    return url;
  },

  // Get rate limit configuration
  getRateLimitConfig: (provider) => {
    const config = apiEndpoints[provider];
    return config ? config.rateLimit : null;
  },

  // Check if provider supports endpoint
  supportsEndpoint: (provider, endpoint) => {
    const config = apiEndpoints[provider];
    return config && config.endpoints[endpoint];
  },

  // Get all endpoints for a provider
  getProviderEndpoints: (provider) => {
    const config = apiEndpoints[provider];
    return config ? Object.keys(config.endpoints) : [];
  },

  // Validate API configuration
  validateConfig: (provider) => {
    try {
      const config = apiUtils.getProviderConfig(provider);
      return {
        valid: true,
        provider,
        hasApiKey: !!config.authentication.key,
        endpointCount: Object.keys(config.endpoints).length,
        rateLimit: config.rateLimit,
      };
    } catch (error) {
      return {
        valid: false,
        provider,
        error: error.message,
      };
    }
  },

  // Get health check endpoint
  getHealthCheckEndpoint: (provider) => {
    const healthEndpoints = {
      finnhub: 'quote',
      polygon: 'marketStatus',
      alpha_vantage: 'quote',
      quiver: 'congressional',
    };

    return healthEndpoints[provider];
  },
};

/**
 * API response transformers
 */
export const responseTransformers = {
  // Normalize quote response across providers
  normalizeQuote: (provider, data) => {
    switch (provider) {
      case 'finnhub':
        return {
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          high: data.h,
          low: data.l,
          open: data.o,
          previousClose: data.pc,
          timestamp: data.t,
        };
      
      case 'polygon':
        return {
          price: data.results?.[0]?.c || data.close,
          change: data.results?.[0]?.c - data.results?.[0]?.o,
          changePercent: ((data.results?.[0]?.c - data.results?.[0]?.o) / data.results?.[0]?.o) * 100,
          high: data.results?.[0]?.h || data.high,
          low: data.results?.[0]?.l || data.low,
          open: data.results?.[0]?.o || data.open,
          previousClose: data.results?.[0]?.c,
          timestamp: data.results?.[0]?.t || Date.now(),
        };
      
      case 'alpha_vantage':
        const quote = data['Global Quote'] || data;
        return {
          price: parseFloat(quote['05. price'] || quote.price),
          change: parseFloat(quote['09. change'] || quote.change),
          changePercent: parseFloat(quote['10. change percent']?.replace('%', '') || quote.changePercent),
          high: parseFloat(quote['03. high'] || quote.high),
          low: parseFloat(quote['04. low'] || quote.low),
          open: parseFloat(quote['02. open'] || quote.open),
          previousClose: parseFloat(quote['08. previous close'] || quote.previousClose),
          timestamp: new Date(quote['07. latest trading day'] || Date.now()).getTime(),
        };
      
      default:
        return data;
    }
  },

  // Normalize company profile across providers
  normalizeProfile: (provider, data) => {
    switch (provider) {
      case 'finnhub':
        return {
          symbol: data.ticker,
          name: data.name,
          country: data.country,
          currency: data.currency,
          exchange: data.exchange,
          industry: data.finnhubIndustry,
          ipo: data.ipo,
          marketCap: data.marketCapitalization,
          shareOutstanding: data.shareOutstanding,
          website: data.weburl,
          logo: data.logo,
        };
      
      case 'alpha_vantage':
        return {
          symbol: data.Symbol,
          name: data.Name,
          country: data.Country,
          currency: data.Currency,
          exchange: data.Exchange,
          industry: data.Industry,
          sector: data.Sector,
          marketCap: data.MarketCapitalization,
          peRatio: data.PERatio,
          eps: data.EPS,
          dividendYield: data.DividendYield,
          website: data.OfficialSite,
        };
      
      default:
        return data;
    }
  },
};

export default {
  apiEndpoints,
  apiUtils,
  responseTransformers,
};
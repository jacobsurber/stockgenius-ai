import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import env, { envUtils } from './env.js';
import { apiUtils } from './api.js';
import { logHelpers } from './logger.js';

/**
 * Rate limiting configurations for different API providers and application endpoints
 */

/**
 * Rate limiter store implementations
 */
class MemoryStore {
  constructor() {
    this.clients = new Map();
    this.resetTimes = new Map();
  }

  async incr(key) {
    const now = Date.now();
    const windowStart = Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000); // 15-minute windows
    const windowKey = `${key}:${windowStart}`;

    if (!this.clients.has(windowKey)) {
      this.clients.set(windowKey, 0);
      this.resetTimes.set(windowKey, windowStart + (15 * 60 * 1000));
      
      // Cleanup old windows
      for (const [oldKey, resetTime] of this.resetTimes) {
        if (resetTime < now) {
          this.clients.delete(oldKey);
          this.resetTimes.delete(oldKey);
        }
      }
    }

    const current = this.clients.get(windowKey) || 0;
    this.clients.set(windowKey, current + 1);

    return {
      totalHits: current + 1,
      resetTime: this.resetTimes.get(windowKey),
    };
  }

  async decrement(key) {
    // Implementation for decrementing if needed
  }

  async resetKey(key) {
    this.clients.delete(key);
    this.resetTimes.delete(key);
  }
}

/**
 * Redis store for distributed rate limiting
 */
class RedisStore {
  constructor(redisClient) {
    this.client = redisClient;
  }

  async incr(key) {
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowKey = `ratelimit:${key}:${windowStart}`;

    const multi = this.client.multi();
    multi.incr(windowKey);
    multi.expire(windowKey, Math.ceil(windowMs / 1000));
    
    const results = await multi.exec();
    const totalHits = results[0][1];

    return {
      totalHits,
      resetTime: windowStart + windowMs,
    };
  }

  async decrement(key) {
    const windowMs = 15 * 60 * 1000;
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowKey = `ratelimit:${key}:${windowStart}`;

    await this.client.decr(windowKey);
  }

  async resetKey(key) {
    const keys = await this.client.keys(`ratelimit:${key}:*`);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}

/**
 * API-specific rate limiters
 */
export class APIRateLimiter {
  constructor() {
    this.limiters = new Map();
    this.store = envUtils.hasRedis() ? new RedisStore(this.getRedisClient()) : new MemoryStore();
    this.initializeAPILimiters();
  }

  getRedisClient() {
    const redisConfig = envUtils.getRedisConfig();
    if (!redisConfig) return null;

    if (redisConfig.type === 'upstash') {
      // Upstash Redis uses REST API, so we'll use regular Redis client with URL
      return createClient({
        url: redisConfig.url.replace('https://', 'redis://'),
        password: redisConfig.token,
      });
    } else {
      return createClient({
        url: redisConfig.url,
        password: redisConfig.password,
      });
    }
  }

  initializeAPILimiters() {
    // Finnhub rate limiter
    this.limiters.set('finnhub', {
      windowMs: 60 * 1000, // 1 minute
      max: env.FINNHUB_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.store,
      keyGenerator: (req) => `finnhub:${req.ip}`,
      handler: (req, res) => {
        logHelpers.logRateLimit('finnhub', req.route?.path, env.FINNHUB_RATE_LIMIT, 0, Date.now() + 60000);
        res.status(429).json({
          error: 'Too many requests to Finnhub API',
          retryAfter: 60,
          limit: env.FINNHUB_RATE_LIMIT,
        });
      },
    });

    // Polygon rate limiter
    this.limiters.set('polygon', {
      windowMs: 60 * 1000, // 1 minute
      max: env.POLYGON_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.store,
      keyGenerator: (req) => `polygon:${req.ip}`,
      handler: (req, res) => {
        logHelpers.logRateLimit('polygon', req.route?.path, env.POLYGON_RATE_LIMIT, 0, Date.now() + 60000);
        res.status(429).json({
          error: 'Too many requests to Polygon API',
          retryAfter: 60,
          limit: env.POLYGON_RATE_LIMIT,
        });
      },
    });

    // Alpha Vantage rate limiter
    this.limiters.set('alphaVantage', {
      windowMs: 60 * 1000, // 1 minute
      max: env.ALPHA_VANTAGE_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.store,
      keyGenerator: (req) => `alphavantage:${req.ip}`,
      handler: (req, res) => {
        logHelpers.logRateLimit('alpha_vantage', req.route?.path, env.ALPHA_VANTAGE_RATE_LIMIT, 0, Date.now() + 60000);
        res.status(429).json({
          error: 'Too many requests to Alpha Vantage API',
          retryAfter: 60,
          limit: env.ALPHA_VANTAGE_RATE_LIMIT,
        });
      },
    });

    // Quiver rate limiter
    this.limiters.set('quiver', {
      windowMs: 60 * 1000, // 1 minute
      max: env.QUIVER_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.store,
      keyGenerator: (req) => `quiver:${req.ip}`,
      handler: (req, res) => {
        logHelpers.logRateLimit('quiver', req.route?.path, env.QUIVER_RATE_LIMIT, 0, Date.now() + 60000);
        res.status(429).json({
          error: 'Too many requests to Quiver API',
          retryAfter: 60,
          limit: env.QUIVER_RATE_LIMIT,
        });
      },
    });

    // OpenAI rate limiters by model
    this.limiters.set('openai-gpt35', {
      windowMs: 60 * 1000, // 1 minute
      max: env.OPENAI_GPT35_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.store,
      keyGenerator: (req) => `openai:gpt35:${req.ip}`,
      handler: (req, res) => {
        logHelpers.logRateLimit('openai', 'gpt-3.5-turbo', env.OPENAI_GPT35_RATE_LIMIT, 0, Date.now() + 60000);
        res.status(429).json({
          error: 'Too many requests to OpenAI GPT-3.5',
          retryAfter: 60,
          limit: env.OPENAI_GPT35_RATE_LIMIT,
        });
      },
    });

    this.limiters.set('openai-gpt4', {
      windowMs: 60 * 1000, // 1 minute
      max: env.OPENAI_GPT4_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.store,
      keyGenerator: (req) => `openai:gpt4:${req.ip}`,
      handler: (req, res) => {
        logHelpers.logRateLimit('openai', 'gpt-4', env.OPENAI_GPT4_RATE_LIMIT, 0, Date.now() + 60000);
        res.status(429).json({
          error: 'Too many requests to OpenAI GPT-4',
          retryAfter: 60,
          limit: env.OPENAI_GPT4_RATE_LIMIT,
        });
      },
    });

    this.limiters.set('openai-gpt4o', {
      windowMs: 60 * 1000, // 1 minute
      max: env.OPENAI_GPT4O_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.store,
      keyGenerator: (req) => `openai:gpt4o:${req.ip}`,
      handler: (req, res) => {
        logHelpers.logRateLimit('openai', 'gpt-4o', env.OPENAI_GPT4O_RATE_LIMIT, 0, Date.now() + 60000);
        res.status(429).json({
          error: 'Too many requests to OpenAI GPT-4o',
          retryAfter: 60,
          limit: env.OPENAI_GPT4O_RATE_LIMIT,
        });
      },
    });
  }

  getRateLimiter(provider) {
    return this.limiters.get(provider);
  }

  createRateLimiter(provider) {
    const config = this.limiters.get(provider);
    if (!config) {
      throw new Error(`Unknown rate limiter: ${provider}`);
    }

    return rateLimit(config);
  }

  // Get rate limiting middleware for Express
  getMiddleware(provider) {
    if (env.DISABLE_RATE_LIMITING && envUtils.isDevelopment()) {
      return (req, res, next) => next();
    }

    return this.createRateLimiter(provider);
  }
}

/**
 * Application-level rate limiters
 */
export const createAppRateLimiters = () => {
  const store = envUtils.hasRedis() ? new RedisStore() : new MemoryStore();

  return {
    // General API rate limiter
    general: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: env.API_RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      store,
      keyGenerator: (req) => req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: 900, // 15 minutes
          limit: env.API_RATE_LIMIT_MAX,
        });
      },
    }),

    // Strict rate limiter for sensitive endpoints
    strict: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Very low limit
      standardHeaders: true,
      legacyHeaders: false,
      store,
      keyGenerator: (req) => req.ip,
      handler: (req, res) => {
        logHelpers.logSecurityEvent('strict_rate_limit_exceeded', 'warn', {
          ip: req.ip,
          endpoint: req.path,
          userAgent: req.get('User-Agent'),
        });

        res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests to sensitive endpoint',
          retryAfter: 900,
        });
      },
    }),

    // Burst rate limiter for quick successive requests
    burst: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      store,
      keyGenerator: (req) => req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Burst rate limit exceeded',
          message: 'Too many quick successive requests',
          retryAfter: 60,
        });
      },
    }),
  };
};

/**
 * Rate limiting utilities
 */
export const rateLimitUtils = {
  // Check if rate limiting is enabled
  isEnabled: () => !env.DISABLE_RATE_LIMITING || !envUtils.isDevelopment(),

  // Get current rate limit status for a key
  async getRateLimitStatus(provider, key) {
    const limiter = new APIRateLimiter();
    const config = limiter.getRateLimiter(provider);
    
    if (!config) return null;

    try {
      const status = await limiter.store.incr(`${provider}:${key}`);
      await limiter.store.decrement(`${provider}:${key}`); // Revert the increment
      
      return {
        current: status.totalHits,
        limit: config.max,
        remaining: Math.max(0, config.max - status.totalHits),
        resetTime: status.resetTime,
        resetIn: Math.max(0, status.resetTime - Date.now()),
      };
    } catch (error) {
      return null;
    }
  },

  // Reset rate limit for a specific key
  async resetRateLimit(provider, key) {
    const limiter = new APIRateLimiter();
    await limiter.store.resetKey(`${provider}:${key}`);
  },

  // Get rate limit info for all providers
  async getAllRateLimitStatus(ip) {
    const limiter = new APIRateLimiter();
    const providers = ['finnhub', 'polygon', 'alphaVantage', 'quiver'];
    const status = {};

    for (const provider of providers) {
      try {
        status[provider] = await rateLimitUtils.getRateLimitStatus(provider, ip);
      } catch (error) {
        status[provider] = null;
      }
    }

    return status;
  },

  // Calculate optimal request timing
  calculateOptimalTiming(provider, requestCount) {
    const config = apiUtils.getRateLimitConfig(provider);
    if (!config) return 0;

    const requestsPerSecond = config.requestsPerMinute / 60;
    const interval = 1000 / requestsPerSecond; // milliseconds between requests
    
    return Math.ceil(interval * requestCount);
  },

  // Adaptive rate limiting based on API response
  adaptRateLimit(provider, responseHeaders) {
    const remaining = responseHeaders['x-ratelimit-remaining'];
    const reset = responseHeaders['x-ratelimit-reset'];
    const limit = responseHeaders['x-ratelimit-limit'];

    if (remaining && reset && limit) {
      const resetTime = parseInt(reset) * 1000; // Convert to milliseconds
      const remainingRequests = parseInt(remaining);
      const totalLimit = parseInt(limit);

      logHelpers.logRateLimit(provider, 'api_response', totalLimit, remainingRequests, resetTime);

      // If we're close to the limit, return delay suggestion
      if (remainingRequests < totalLimit * 0.1) { // Less than 10% remaining
        const timeToReset = resetTime - Date.now();
        return Math.max(0, timeToReset / remainingRequests);
      }
    }

    return 0;
  },
};

// Export singleton instance
export const apiRateLimiter = new APIRateLimiter();

export default {
  APIRateLimiter,
  createAppRateLimiters,
  rateLimitUtils,
  apiRateLimiter,
};
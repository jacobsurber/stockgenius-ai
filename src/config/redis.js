import { createClient } from 'redis';
import { Redis } from '@upstash/redis';
import env, { envUtils } from './env.js';
import { logHelpers, loggerUtils } from './logger.js';

/**
 * Redis configuration and connection management
 * Supports both standard Redis and Upstash Redis for caching and session management
 */

let redisClient = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

/**
 * Redis configuration settings
 */
export const redisConfig = {
  // Connection settings
  connectTimeout: 10000,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
  
  // Cache TTL settings
  defaultTTL: env.CACHE_TTL,
  quoteTTL: env.QUOTE_CACHE_TTL,
  newsTTL: env.NEWS_CACHE_TTL,
  profileTTL: env.PROFILE_CACHE_TTL,
  
  // Session settings
  sessionTTL: 24 * 60 * 60, // 24 hours
  sessionPrefix: 'sess:',
  
  // Rate limiting settings
  rateLimitTTL: 60, // 1 minute
  rateLimitPrefix: 'rl:',
  
  // Key prefixes
  cachePrefix: 'cache:',
  lockPrefix: 'lock:',
  queuePrefix: 'queue:',
};

/**
 * Initialize Redis connection
 */
export const initRedis = async () => {
  if (!envUtils.hasRedis()) {
    loggerUtils.cacheLogger.warn('Redis configuration not found - running without caching');
    return null;
  }

  const redisConfigData = envUtils.getRedisConfig();
  
  try {
    if (redisConfigData.type === 'upstash') {
      // Initialize Upstash Redis client
      redisClient = new Redis({
        url: redisConfigData.url,
        token: redisConfigData.token,
        retry: {
          retries: 3,
          delay: (attempt) => Math.min(attempt * 100, 1000),
        },
      });
      
      // Test connection
      await redisClient.ping();
      isConnected = true;
      
      loggerUtils.cacheLogger.info('Upstash Redis connected successfully', {
        type: 'upstash',
        url: redisConfigData.url.replace(/\/\/.*@/, '//***@'), // Hide credentials
      });
      
    } else {
      // Initialize standard Redis client
      redisClient = createClient({
        url: redisConfigData.url,
        password: redisConfigData.password,
        socket: {
          connectTimeout: redisConfig.connectTimeout,
          reconnectStrategy: (retries) => {
            if (retries > MAX_CONNECTION_ATTEMPTS) {
              loggerUtils.cacheLogger.error('Redis max reconnection attempts reached');
              return false;
            }
            return Math.min(retries * 100, 3000);
          },
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('Redis server refused connection');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > MAX_CONNECTION_ATTEMPTS) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        },
      });

      // Event handlers
      redisClient.on('connect', () => {
        loggerUtils.cacheLogger.info('Redis client connected');
      });

      redisClient.on('ready', () => {
        isConnected = true;
        connectionAttempts = 0;
        loggerUtils.cacheLogger.info('Redis client ready');
      });

      redisClient.on('error', (err) => {
        isConnected = false;
        loggerUtils.cacheLogger.error('Redis client error', { error: err.message });
      });

      redisClient.on('end', () => {
        isConnected = false;
        loggerUtils.cacheLogger.warn('Redis connection ended');
      });

      redisClient.on('reconnecting', () => {
        connectionAttempts++;
        loggerUtils.cacheLogger.info('Redis client reconnecting', { attempt: connectionAttempts });
      });

      // Connect to Redis
      await redisClient.connect();
    }

    logHelpers.logConfigWarning('Redis initialized successfully', {
      type: redisConfigData.type,
      connected: isConnected,
    });

    return redisClient;

  } catch (error) {
    loggerUtils.cacheLogger.error('Failed to initialize Redis', { error: error.message });
    redisClient = null;
    isConnected = false;
    return null;
  }
};

/**
 * Get Redis client instance
 */
export const getRedisClient = () => {
  return redisClient;
};

/**
 * Check if Redis is connected
 */
export const isRedisConnected = () => {
  return isConnected && redisClient !== null;
};

/**
 * Close Redis connection
 */
export const closeRedis = async () => {
  if (redisClient) {
    try {
      if (redisClient.disconnect) {
        await redisClient.disconnect();
      } else if (redisClient.quit) {
        await redisClient.quit();
      }
      
      redisClient = null;
      isConnected = false;
      loggerUtils.cacheLogger.info('Redis connection closed');
    } catch (error) {
      loggerUtils.cacheLogger.error('Error closing Redis connection', { error: error.message });
    }
  }
};

/**
 * Cache management utilities
 */
export const cacheUtils = {
  // Generate cache key
  generateKey: (prefix, ...parts) => {
    return `${redisConfig.cachePrefix}${prefix}:${parts.join(':')}`;
  },

  // Set cache with TTL
  async set(key, value, ttl = redisConfig.defaultTTL) {
    if (!isRedisConnected()) return false;

    try {
      const serialized = JSON.stringify(value);
      
      if (redisClient.setex) {
        // Standard Redis
        await redisClient.setex(key, ttl, serialized);
      } else {
        // Upstash Redis
        await redisClient.setex(key, ttl, serialized);
      }

      logHelpers.logCacheOperation('set', key, false, ttl);
      return true;
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache set error', { key, error: error.message });
      return false;
    }
  },

  // Get from cache
  async get(key) {
    if (!isRedisConnected()) return null;

    try {
      const value = await redisClient.get(key);
      
      if (value) {
        logHelpers.logCacheOperation('get', key, true);
        return JSON.parse(value);
      } else {
        logHelpers.logCacheOperation('get', key, false);
        return null;
      }
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache get error', { key, error: error.message });
      return null;
    }
  },

  // Delete from cache
  async del(key) {
    if (!isRedisConnected()) return false;

    try {
      await redisClient.del(key);
      logHelpers.logCacheOperation('delete', key);
      return true;
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  },

  // Check if key exists
  async exists(key) {
    if (!isRedisConnected()) return false;

    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache exists error', { key, error: error.message });
      return false;
    }
  },

  // Set expiration time
  async expire(key, ttl) {
    if (!isRedisConnected()) return false;

    try {
      await redisClient.expire(key, ttl);
      return true;
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache expire error', { key, ttl, error: error.message });
      return false;
    }
  },

  // Get keys by pattern
  async keys(pattern) {
    if (!isRedisConnected()) return [];

    try {
      return await redisClient.keys(pattern);
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache keys error', { pattern, error: error.message });
      return [];
    }
  },

  // Clear cache by pattern
  async clearPattern(pattern) {
    if (!isRedisConnected()) return 0;

    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
        loggerUtils.cacheLogger.info('Cache pattern cleared', { pattern, count: keys.length });
        return keys.length;
      }
      return 0;
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache clear pattern error', { pattern, error: error.message });
      return 0;
    }
  },

  // Get cache statistics
  async getStats() {
    if (!isRedisConnected()) return null;

    try {
      let info;
      if (redisClient.info) {
        // Standard Redis
        info = await redisClient.info('memory');
      } else {
        // For Upstash, we'll return basic stats
        const keyCount = await redisClient.dbsize();
        return {
          connected: isConnected,
          keyCount,
          type: 'upstash',
        };
      }

      return {
        connected: isConnected,
        memory: info,
        type: 'standard',
      };
    } catch (error) {
      loggerUtils.cacheLogger.error('Cache stats error', { error: error.message });
      return null;
    }
  },
};

/**
 * Session management utilities
 */
export const sessionUtils = {
  // Generate session key
  generateSessionKey: (sessionId) => {
    return `${redisConfig.sessionPrefix}${sessionId}`;
  },

  // Set session data
  async setSession(sessionId, data, ttl = redisConfig.sessionTTL) {
    const key = sessionUtils.generateSessionKey(sessionId);
    return await cacheUtils.set(key, data, ttl);
  },

  // Get session data
  async getSession(sessionId) {
    const key = sessionUtils.generateSessionKey(sessionId);
    return await cacheUtils.get(key);
  },

  // Delete session
  async deleteSession(sessionId) {
    const key = sessionUtils.generateSessionKey(sessionId);
    return await cacheUtils.del(key);
  },

  // Extend session TTL
  async extendSession(sessionId, ttl = redisConfig.sessionTTL) {
    const key = sessionUtils.generateSessionKey(sessionId);
    return await cacheUtils.expire(key, ttl);
  },

  // Get all active sessions
  async getActiveSessions() {
    const pattern = `${redisConfig.sessionPrefix}*`;
    return await cacheUtils.keys(pattern);
  },
};

/**
 * Distributed locking utilities
 */
export const lockUtils = {
  // Acquire lock
  async acquireLock(resource, ttl = 30, timeout = 5000) {
    if (!isRedisConnected()) return null;

    const lockKey = `${redisConfig.lockPrefix}${resource}`;
    const lockValue = `${Date.now()}-${Math.random()}`;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const result = await redisClient.set(lockKey, lockValue, 'PX', ttl * 1000, 'NX');
        
        if (result === 'OK') {
          loggerUtils.cacheLogger.debug('Lock acquired', { resource, lockValue, ttl });
          return {
            key: lockKey,
            value: lockValue,
            ttl,
            release: () => lockUtils.releaseLock(lockKey, lockValue),
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        loggerUtils.cacheLogger.error('Lock acquisition error', { resource, error: error.message });
        return null;
      }
    }

    loggerUtils.cacheLogger.warn('Lock acquisition timeout', { resource, timeout });
    return null;
  },

  // Release lock
  async releaseLock(lockKey, lockValue) {
    if (!isRedisConnected()) return false;

    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redisClient.eval(script, 1, lockKey, lockValue);
      const released = result === 1;
      
      if (released) {
        loggerUtils.cacheLogger.debug('Lock released', { lockKey, lockValue });
      }
      
      return released;
    } catch (error) {
      loggerUtils.cacheLogger.error('Lock release error', { lockKey, error: error.message });
      return false;
    }
  },
};

/**
 * Queue utilities for background tasks
 */
export const queueUtils = {
  // Add item to queue
  async enqueue(queueName, item, priority = 0) {
    if (!isRedisConnected()) return false;

    const queueKey = `${redisConfig.queuePrefix}${queueName}`;
    
    try {
      await redisClient.zadd(queueKey, priority, JSON.stringify(item));
      loggerUtils.cacheLogger.debug('Item enqueued', { queueName, priority });
      return true;
    } catch (error) {
      loggerUtils.cacheLogger.error('Enqueue error', { queueName, error: error.message });
      return false;
    }
  },

  // Get item from queue
  async dequeue(queueName) {
    if (!isRedisConnected()) return null;

    const queueKey = `${redisConfig.queuePrefix}${queueName}`;
    
    try {
      const items = await redisClient.zpopmax(queueKey, 1);
      
      if (items.length > 0) {
        const item = JSON.parse(items[0]);
        loggerUtils.cacheLogger.debug('Item dequeued', { queueName });
        return item;
      }
      
      return null;
    } catch (error) {
      loggerUtils.cacheLogger.error('Dequeue error', { queueName, error: error.message });
      return null;
    }
  },

  // Get queue size
  async getQueueSize(queueName) {
    if (!isRedisConnected()) return 0;

    const queueKey = `${redisConfig.queuePrefix}${queueName}`;
    
    try {
      return await redisClient.zcard(queueKey);
    } catch (error) {
      loggerUtils.cacheLogger.error('Queue size error', { queueName, error: error.message });
      return 0;
    }
  },
};

/**
 * Health check for Redis connection
 */
export const healthCheck = async () => {
  if (!redisClient) {
    return {
      status: 'disconnected',
      error: 'Redis client not initialized',
    };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    const responseTime = Date.now() - start;

    return {
      status: 'healthy',
      connected: isConnected,
      responseTime,
      type: envUtils.getRedisConfig()?.type || 'unknown',
    };
  } catch (error) {
    return {
      status: 'error',
      connected: false,
      error: error.message,
    };
  }
};

export default {
  initRedis,
  getRedisClient,
  isRedisConnected,
  closeRedis,
  cacheUtils,
  sessionUtils,
  lockUtils,
  queueUtils,
  healthCheck,
  redisConfig,
};
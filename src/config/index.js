/**
 * Main configuration module for StockGenius
 * Centralized configuration management with development/production toggles
 * Optimized for single-user usage
 */

import env, { envUtils, configWarnings } from './env.js';
import { apiEndpoints, apiUtils, responseTransformers } from './api.js';
import logger, { logHelpers, loggerUtils, requestLogger, errorLogger } from './logger.js';
import { modelConfigs, ModelRouter, AIAnalysisService, aiService } from './openai.js';
import { APIRateLimiter, createAppRateLimiters, rateLimitUtils, apiRateLimiter } from './rateLimit.js';
import redisConfig, { 
  initRedis, 
  getRedisClient, 
  isRedisConnected, 
  closeRedis,
  cacheUtils,
  sessionUtils,
  lockUtils,
  queueUtils,
  healthCheck as redisHealthCheck
} from './redis.js';

/**
 * Application configuration with environment-specific settings
 */
export const appConfig = {
  // Server configuration
  server: {
    port: env.PORT,
    host: env.HOST,
    environment: env.NODE_ENV,
    debug: env.DEBUG,
    cors: {
      origin: envUtils.isDevelopment() ? ['http://localhost:3000', 'http://localhost:3001'] : false,
      credentials: true,
      optionsSuccessStatus: 200,
    },
    compression: {
      level: envUtils.isProduction() ? 6 : 1,
      threshold: 1024,
    },
    helmet: {
      contentSecurityPolicy: envUtils.isProduction(),
      crossOriginEmbedderPolicy: envUtils.isProduction(),
    },
  },

  // Database configuration
  database: {
    url: env.DATABASE_URL,
    backupInterval: env.DATABASE_BACKUP_INTERVAL,
    pool: {
      min: 1,
      max: envUtils.isProduction() ? 10 : 5,
    },
    migrations: {
      autoRun: envUtils.isDevelopment(),
      directory: './migrations',
    },
  },

  // Cache configuration
  cache: {
    enabled: envUtils.hasRedis(),
    defaultTTL: env.CACHE_TTL,
    quoteTTL: env.QUOTE_CACHE_TTL,
    newsTTL: env.NEWS_CACHE_TTL,
    profileTTL: env.PROFILE_CACHE_TTL,
    // Development: shorter TTLs for testing
    ...envUtils.isDevelopment() && {
      quoteTTL: 30,
      newsTTL: 300,
      profileTTL: 1800,
    },
  },

  // Security configuration
  security: {
    jwtSecret: env.JWT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    encryptionKey: env.ENCRYPTION_KEY,
    rateLimiting: {
      enabled: !env.DISABLE_RATE_LIMITING,
      window: env.API_RATE_LIMIT_WINDOW,
      max: env.API_RATE_LIMIT_MAX,
    },
    // Development: relaxed security
    ...envUtils.isDevelopment() && {
      rateLimiting: {
        enabled: false,
        window: '1h',
        max: 1000,
      },
    },
  },

  // API configuration
  apis: {
    timeout: envUtils.isProduction() ? 15000 : 30000,
    retries: envUtils.isProduction() ? 3 : 1,
    providers: {
      finnhub: {
        enabled: envUtils.hasValidApiKey('finnhub'),
        baseURL: apiEndpoints.finnhub.baseURL,
        timeout: apiEndpoints.finnhub.timeout,
        rateLimit: apiEndpoints.finnhub.rateLimit,
      },
      polygon: {
        enabled: envUtils.hasValidApiKey('polygon'),
        baseURL: apiEndpoints.polygon.baseURL,
        timeout: apiEndpoints.polygon.timeout,
        rateLimit: apiEndpoints.polygon.rateLimit,
      },
      alphaVantage: {
        enabled: envUtils.hasValidApiKey('alpha_vantage'),
        baseURL: apiEndpoints.alphaVantage.baseURL,
        timeout: apiEndpoints.alphaVantage.timeout,
        rateLimit: apiEndpoints.alphaVantage.rateLimit,
      },
      quiver: {
        enabled: envUtils.hasValidApiKey('quiver'),
        baseURL: apiEndpoints.quiver.baseURL,
        timeout: apiEndpoints.quiver.timeout,
        rateLimit: apiEndpoints.quiver.rateLimit,
      },
    },
  },

  // AI configuration
  ai: {
    enabled: env.AI_ANALYSIS_ENABLED && envUtils.hasValidApiKey('openai'),
    defaultModel: env.OPENAI_MODEL,
    maxTokens: env.OPENAI_MAX_TOKENS,
    features: {
      sentiment: env.AI_SENTIMENT_ANALYSIS,
      technical: env.AI_TECHNICAL_ANALYSIS,
      fundamental: env.AI_FUNDAMENTAL_ANALYSIS,
      batchSize: env.AI_BATCH_SIZE,
    },
    // Development: use cheaper models
    ...envUtils.isDevelopment() && {
      defaultModel: 'gpt-3.5-turbo',
      maxTokens: 1000,
      features: {
        batchSize: 5,
      },
    },
  },

  // Trading configuration
  trading: {
    paperTradingEnabled: env.PAPER_TRADING_ENABLED,
    startingBalance: env.STARTING_BALANCE,
    commissionRate: env.COMMISSION_RATE,
    // Development: lower starting balance
    ...envUtils.isDevelopment() && {
      startingBalance: 10000,
      commissionRate: 0,
    },
  },

  // Logging configuration
  logging: {
    level: env.LOG_LEVEL,
    file: env.LOG_FILE,
    maxSize: env.LOG_MAX_SIZE,
    maxFiles: env.LOG_MAX_FILES,
    structured: envUtils.isProduction(),
    // Development: verbose logging
    ...envUtils.isDevelopment() && {
      level: 'debug',
      structured: false,
    },
  },

  // Notification configuration
  notifications: {
    email: {
      enabled: env.EMAIL_ENABLED,
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      user: env.EMAIL_USER,
      password: env.EMAIL_PASSWORD,
      from: env.EMAIL_FROM,
    },
    webhooks: {
      enabled: env.WEBHOOK_ENABLED,
      url: env.WEBHOOK_URL,
    },
  },

  // Features flags
  features: {
    realTimeData: envUtils.isProduction(),
    advancedCharts: envUtils.isProduction(),
    socialTrading: false, // Future feature
    cryptoSupport: false, // Future feature
    mobileApp: false, // Future feature
    // Development: enable experimental features
    ...envUtils.isDevelopment() && {
      realTimeData: true,
      advancedCharts: true,
      cryptoSupport: true,
    },
  },

  // Performance configuration
  performance: {
    enableCompression: envUtils.isProduction(),
    enableCaching: envUtils.hasRedis(),
    preloadData: envUtils.isProduction(),
    batchRequests: true,
    // Development: optimized for development
    ...envUtils.isDevelopment() && {
      enableCompression: false,
      preloadData: false,
      batchRequests: false,
    },
  },
};

/**
 * Configuration validation and initialization
 */
export const configUtils = {
  // Validate complete configuration
  validate: () => {
    const warnings = configWarnings();
    const errors = [];

    // Check required environment variables for production
    if (envUtils.isProduction()) {
      if (!env.JWT_SECRET || env.JWT_SECRET.includes('change_this')) {
        errors.push('JWT_SECRET must be set to a secure value in production');
      }
      
      if (!env.SESSION_SECRET || env.SESSION_SECRET.includes('change_this')) {
        errors.push('SESSION_SECRET must be set to a secure value in production');
      }
    }

    // Check API key configuration
    const configuredApis = envUtils.getConfiguredProviders();
    if (configuredApis.length === 0) {
      warnings.push('No API providers configured - limited functionality available');
    }

    // Check AI configuration
    if (appConfig.ai.enabled && !envUtils.hasValidApiKey('openai')) {
      warnings.push('AI analysis enabled but OpenAI API key not configured');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      configuredApis,
      environment: env.NODE_ENV,
    };
  },

  // Get feature availability
  getFeatureAvailability: () => {
    return {
      apis: {
        finnhub: appConfig.apis.providers.finnhub.enabled,
        polygon: appConfig.apis.providers.polygon.enabled,
        alphaVantage: appConfig.apis.providers.alphaVantage.enabled,
        quiver: appConfig.apis.providers.quiver.enabled,
      },
      caching: appConfig.cache.enabled,
      ai: appConfig.ai.enabled,
      trading: appConfig.trading.paperTradingEnabled,
      notifications: {
        email: appConfig.notifications.email.enabled,
        webhooks: appConfig.notifications.webhooks.enabled,
      },
      features: appConfig.features,
    };
  },

  // Get configuration summary
  getSummary: () => {
    const validation = configUtils.validate();
    const availability = configUtils.getFeatureAvailability();

    return {
      environment: env.NODE_ENV,
      server: {
        port: appConfig.server.port,
        host: appConfig.server.host,
      },
      validation,
      availability,
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      uptime: process.uptime(),
    };
  },

  // Initialize configuration
  initialize: async () => {
    const startTime = Date.now();
    const initResults = {
      config: true,
      redis: false,
      database: false,
      apis: {},
    };

    try {
      // Initialize Redis if configured
      if (envUtils.hasRedis()) {
        try {
          await initRedis();
          initResults.redis = isRedisConnected();
        } catch (error) {
          logger.warn('Redis initialization failed', { error: error.message });
        }
      }

      // Validate API configurations
      const providers = ['finnhub', 'polygon', 'alphaVantage', 'quiver'];
      for (const provider of providers) {
        try {
          initResults.apis[provider] = apiUtils.validateConfig(provider);
        } catch (error) {
          initResults.apis[provider] = { valid: false, error: error.message };
        }
      }

      const duration = Date.now() - startTime;

      logHelpers.logStartup(
        appConfig.server.port,
        env.NODE_ENV,
        envUtils.getConfiguredProviders()
      );

      logger.info('Configuration initialized', {
        duration,
        results: initResults,
        warnings: configWarnings(),
      });

      return initResults;

    } catch (error) {
      logger.error('Configuration initialization failed', { error: error.message });
      throw error;
    }
  },

  // Graceful shutdown
  shutdown: async () => {
    logger.info('Starting graceful shutdown');

    try {
      // Close Redis connection
      if (isRedisConnected()) {
        await closeRedis();
      }

      logHelpers.logShutdown('graceful');
      
      // Give time for final logs to write
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      logger.error('Shutdown error', { error: error.message });
    }
  },
};

/**
 * Health check for all components
 */
export const healthCheck = async () => {
  const checks = {
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    components: {},
  };

  // Redis health check
  if (envUtils.hasRedis()) {
    checks.components.redis = await redisHealthCheck();
  }

  // API providers health check
  const configuredProviders = envUtils.getConfiguredProviders();
  for (const provider of configuredProviders) {
    try {
      const validation = apiUtils.validateConfig(provider);
      checks.components[provider] = {
        status: validation.valid ? 'healthy' : 'error',
        hasApiKey: validation.hasApiKey,
        endpointCount: validation.endpointCount,
      };
    } catch (error) {
      checks.components[provider] = {
        status: 'error',
        error: error.message,
      };
    }
  }

  // AI service health check
  if (appConfig.ai.enabled) {
    checks.components.ai = {
      status: envUtils.hasValidApiKey('openai') ? 'healthy' : 'error',
      model: appConfig.ai.defaultModel,
      features: appConfig.ai.features,
    };
  }

  // Overall status
  const componentStatuses = Object.values(checks.components).map(c => c.status);
  const hasErrors = componentStatuses.includes('error');
  const hasWarnings = componentStatuses.includes('warning');

  checks.status = hasErrors ? 'error' : hasWarnings ? 'warning' : 'healthy';

  return checks;
};

// Export all configuration modules
export {
  // Environment
  env,
  envUtils,
  
  // API
  apiEndpoints,
  apiUtils,
  responseTransformers,
  
  // Logging
  logger,
  logHelpers,
  loggerUtils,
  requestLogger,
  errorLogger,
  
  // OpenAI
  modelConfigs,
  ModelRouter,
  AIAnalysisService,
  aiService,
  
  // Rate Limiting
  APIRateLimiter,
  createAppRateLimiters,
  rateLimitUtils,
  apiRateLimiter,
  
  // Redis
  redisConfig,
  initRedis,
  getRedisClient,
  isRedisConnected,
  closeRedis,
  cacheUtils,
  sessionUtils,
  lockUtils,
  queueUtils,
};

// Default export
export default {
  appConfig,
  configUtils,
  healthCheck,
  env,
  envUtils,
};
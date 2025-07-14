import Joi from 'joi';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

/**
 * Environment variable validation schema
 */
const envSchema = Joi.object({
  // Server Configuration
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('localhost'),

  // Database Configuration
  DATABASE_URL: Joi.string().default('./data/stockgenius.db'),
  DATABASE_BACKUP_INTERVAL: Joi.string().default('24h'),

  // Redis Configuration
  REDIS_URL: Joi.string().uri().optional(),
  REDIS_PASSWORD: Joi.string().optional(),
  UPSTASH_REDIS_REST_URL: Joi.string().uri().optional(),
  UPSTASH_REDIS_REST_TOKEN: Joi.string().optional(),

  // Financial Data APIs
  FINNHUB_API_KEY: Joi.string().optional(),
  POLYGON_API_KEY: Joi.string().optional(),
  ALPHA_VANTAGE_API_KEY: Joi.string().optional(),
  QUIVER_API_KEY: Joi.string().optional(),

  // OpenAI Configuration
  OPENAI_API_KEY: Joi.string().optional(),
  OPENAI_MODEL: Joi.string()
    .valid('gpt-3.5-turbo', 'gpt-4-turbo-preview', 'gpt-4o', 'gpt-4o-mini')
    .default('gpt-3.5-turbo'),
  OPENAI_MAX_TOKENS: Joi.number().integer().min(1).max(8192).default(2000),

  // Security Configuration
  JWT_SECRET: Joi.string().min(32).optional(),
  SESSION_SECRET: Joi.string().min(32).optional(),
  ENCRYPTION_KEY: Joi.string().length(32).optional(),

  // Rate Limiting Configuration
  API_RATE_LIMIT_WINDOW: Joi.string().default('15m'),
  API_RATE_LIMIT_MAX: Joi.number().integer().min(1).default(100),
  FINNHUB_RATE_LIMIT: Joi.number().integer().min(1).default(60),
  POLYGON_RATE_LIMIT: Joi.number().integer().min(1).default(5),
  ALPHA_VANTAGE_RATE_LIMIT: Joi.number().integer().min(1).default(5),
  QUIVER_RATE_LIMIT: Joi.number().integer().min(1).default(300),

  // OpenAI Rate Limits (requests per minute)
  OPENAI_GPT35_RATE_LIMIT: Joi.number().integer().min(1).default(3500),
  OPENAI_GPT4_RATE_LIMIT: Joi.number().integer().min(1).default(500),
  OPENAI_GPT4O_RATE_LIMIT: Joi.number().integer().min(1).default(10000),

  // Caching Configuration
  CACHE_TTL: Joi.number().integer().min(1).default(300),
  QUOTE_CACHE_TTL: Joi.number().integer().min(1).default(60),
  NEWS_CACHE_TTL: Joi.number().integer().min(1).default(1800),
  PROFILE_CACHE_TTL: Joi.number().integer().min(1).default(86400),

  // Logging Configuration
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),
  LOG_FILE: Joi.string().default('./logs/stockgenius.log'),
  LOG_MAX_SIZE: Joi.string().default('10m'),
  LOG_MAX_FILES: Joi.number().integer().min(1).default(5),

  // AI Analysis Configuration
  AI_ANALYSIS_ENABLED: Joi.boolean().default(true),
  AI_SENTIMENT_ANALYSIS: Joi.boolean().default(true),
  AI_TECHNICAL_ANALYSIS: Joi.boolean().default(true),
  AI_FUNDAMENTAL_ANALYSIS: Joi.boolean().default(true),
  AI_BATCH_SIZE: Joi.number().integer().min(1).max(50).default(10),

  // Trading Configuration
  PAPER_TRADING_ENABLED: Joi.boolean().default(true),
  STARTING_BALANCE: Joi.number().min(0).default(100000),
  COMMISSION_RATE: Joi.number().min(0).max(1).default(0.005),

  // Notification Configuration
  EMAIL_ENABLED: Joi.boolean().default(false),
  EMAIL_HOST: Joi.string().optional(),
  EMAIL_PORT: Joi.number().port().optional(),
  EMAIL_USER: Joi.string().email().optional(),
  EMAIL_PASSWORD: Joi.string().optional(),
  EMAIL_FROM: Joi.string().email().optional(),

  // Webhook Configuration
  WEBHOOK_ENABLED: Joi.boolean().default(false),
  WEBHOOK_URL: Joi.string().uri().optional(),

  // Development Configuration
  DEBUG: Joi.boolean().default(false),
  MOCK_API_RESPONSES: Joi.boolean().default(false),
  DISABLE_RATE_LIMITING: Joi.boolean().default(false),
})
  .unknown()
  .required();

/**
 * Validate and parse environment variables
 */
const validateEnv = () => {
  const { error, value: env } = envSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: true,
  });

  if (error) {
    throw new Error(`Environment validation error: ${error.message}`);
  }

  return env;
};

/**
 * Get validated environment configuration
 */
const env = validateEnv();

/**
 * Environment utilities
 */
export const envUtils = {
  isDevelopment: () => env.NODE_ENV === 'development',
  isProduction: () => env.NODE_ENV === 'production',
  isTest: () => env.NODE_ENV === 'test',
  
  // Check if API key is configured and valid
  hasValidApiKey: (provider) => {
    const key = env[`${provider.toUpperCase()}_API_KEY`];
    return key && key !== `your_${provider.toLowerCase()}_api_key_here` && key.length > 10;
  },
  
  // Get configured API providers
  getConfiguredProviders: () => {
    const providers = ['finnhub', 'polygon', 'alpha_vantage', 'quiver', 'openai'];
    return providers.filter(provider => envUtils.hasValidApiKey(provider));
  },
  
  // Check if Redis is configured
  hasRedis: () => {
    return !!(env.REDIS_URL || (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN));
  },
  
  // Get Redis configuration
  getRedisConfig: () => {
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      return {
        type: 'upstash',
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      };
    }
    
    if (env.REDIS_URL) {
      return {
        type: 'standard',
        url: env.REDIS_URL,
        password: env.REDIS_PASSWORD,
      };
    }
    
    return null;
  },
  
  // Validate required configuration for features
  validateFeatureConfig: (feature) => {
    const requirements = {
      ai_analysis: ['OPENAI_API_KEY'],
      email_notifications: ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASSWORD'],
      webhooks: ['WEBHOOK_URL'],
      security: ['JWT_SECRET', 'SESSION_SECRET'],
    };
    
    const required = requirements[feature];
    if (!required) return true;
    
    return required.every(key => env[key]);
  },
};

/**
 * Configuration warnings
 */
export const configWarnings = () => {
  const warnings = [];
  
  // Check for development secrets in production
  if (envUtils.isProduction()) {
    const defaultSecrets = [
      'your_very_secure_jwt_secret_change_this_in_production',
      'your_very_secure_session_secret_change_this_in_production',
      'your_32_character_encryption_key_here',
    ];
    
    if (defaultSecrets.includes(env.JWT_SECRET)) {
      warnings.push('Using default JWT_SECRET in production');
    }
    
    if (defaultSecrets.includes(env.SESSION_SECRET)) {
      warnings.push('Using default SESSION_SECRET in production');
    }
  }
  
  // Check for missing API keys
  const providers = ['finnhub', 'polygon', 'alpha_vantage', 'quiver', 'openai'];
  const missingProviders = providers.filter(p => !envUtils.hasValidApiKey(p));
  
  if (missingProviders.length > 0) {
    warnings.push(`Missing API keys for: ${missingProviders.join(', ')}`);
  }
  
  // Check Redis configuration
  if (!envUtils.hasRedis()) {
    warnings.push('Redis not configured - caching will be disabled');
  }
  
  return warnings;
};

export default env;
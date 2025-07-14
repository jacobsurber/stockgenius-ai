import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import env, { envUtils } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logsDir = path.dirname(env.LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom log format for structured JSON logging
 */
const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label'],
  }),
  winston.format.json()
);

/**
 * Development console format for better readability
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),
  winston.format.colorize({ all: true }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, label, ...meta }) => {
    const labelStr = label ? `[${label}] ` : '';
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} ${level}: ${labelStr}${message}${metaStr}`;
  })
);

/**
 * Create transports based on environment
 */
const createTransports = () => {
  const transports = [];

  // Console transport
  transports.push(
    new winston.transports.Console({
      level: envUtils.isDevelopment() ? 'debug' : env.LOG_LEVEL,
      format: envUtils.isDevelopment() ? consoleFormat : structuredFormat,
      silent: envUtils.isTest(),
    })
  );

  // File transport for persistent logging
  if (!envUtils.isTest()) {
    transports.push(
      new winston.transports.File({
        filename: env.LOG_FILE,
        level: env.LOG_LEVEL,
        format: structuredFormat,
        maxsize: env.LOG_MAX_SIZE,
        maxFiles: env.LOG_MAX_FILES,
        tailable: true,
      })
    );

    // Separate error log file
    transports.push(
      new winston.transports.File({
        filename: env.LOG_FILE.replace('.log', '.error.log'),
        level: 'error',
        format: structuredFormat,
        maxsize: env.LOG_MAX_SIZE,
        maxFiles: env.LOG_MAX_FILES,
        tailable: true,
      })
    );
  }

  return transports;
};

/**
 * Main logger instance
 */
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: structuredFormat,
  defaultMeta: {
    service: 'stockgenius',
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  },
  transports: createTransports(),
  exitOnError: false,
});

/**
 * Logger utilities and specialized loggers
 */
export const loggerUtils = {
  // Create child logger with specific context
  createChildLogger: (context) => {
    return logger.child({ context });
  },

  // API request logger
  apiLogger: logger.child({ component: 'api' }),

  // Database logger
  dbLogger: logger.child({ component: 'database' }),

  // AI/OpenAI logger
  aiLogger: logger.child({ component: 'ai' }),

  // Cache logger
  cacheLogger: logger.child({ component: 'cache' }),

  // Security logger
  securityLogger: logger.child({ component: 'security' }),

  // Performance logger
  performanceLogger: logger.child({ component: 'performance' }),

  // Trading logger
  tradingLogger: logger.child({ component: 'trading' }),
};

/**
 * Structured logging helpers
 */
export const logHelpers = {
  // Log API request
  logApiRequest: (provider, endpoint, symbol, metadata = {}) => {
    loggerUtils.apiLogger.info('API request initiated', {
      provider,
      endpoint,
      symbol,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log API response
  logApiResponse: (provider, endpoint, symbol, responseTime, status, metadata = {}) => {
    loggerUtils.apiLogger.info('API response received', {
      provider,
      endpoint,
      symbol,
      responseTime,
      status,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log API error
  logApiError: (provider, endpoint, symbol, error, metadata = {}) => {
    loggerUtils.apiLogger.error('API request failed', {
      provider,
      endpoint,
      symbol,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log database operation
  logDbOperation: (operation, table, metadata = {}) => {
    loggerUtils.dbLogger.debug('Database operation', {
      operation,
      table,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log AI analysis
  logAiAnalysis: (symbol, analysisType, model, tokensUsed, cost, metadata = {}) => {
    loggerUtils.aiLogger.info('AI analysis completed', {
      symbol,
      analysisType,
      model,
      tokensUsed,
      cost,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log cache operation
  logCacheOperation: (operation, key, hit, ttl, metadata = {}) => {
    loggerUtils.cacheLogger.debug('Cache operation', {
      operation,
      key,
      hit,
      ttl,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log security event
  logSecurityEvent: (event, severity = 'info', metadata = {}) => {
    loggerUtils.securityLogger[severity]('Security event', {
      event,
      severity,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log performance metric
  logPerformance: (operation, duration, metadata = {}) => {
    loggerUtils.performanceLogger.info('Performance metric', {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log trading activity
  logTrade: (symbol, type, quantity, price, metadata = {}) => {
    loggerUtils.tradingLogger.info('Trade executed', {
      symbol,
      type,
      quantity,
      price,
      total: quantity * price,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },

  // Log application startup
  logStartup: (port, environment, configuredApis) => {
    logger.info('Application startup', {
      port,
      environment,
      configuredApis,
      nodeVersion: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  },

  // Log application shutdown
  logShutdown: (reason = 'normal') => {
    logger.info('Application shutdown', {
      reason,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  },

  // Log rate limit event
  logRateLimit: (provider, endpoint, limit, remaining, resetTime) => {
    loggerUtils.apiLogger.warn('Rate limit approached', {
      provider,
      endpoint,
      limit,
      remaining,
      resetTime,
      timestamp: new Date().toISOString(),
    });
  },

  // Log configuration warning
  logConfigWarning: (warning, metadata = {}) => {
    logger.warn('Configuration warning', {
      warning,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  },
};

/**
 * Express middleware for request logging
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substr(2, 9);
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Log incoming request
  logger.info('HTTP request received', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString(),
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    
    logger.info('HTTP response sent', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString(),
    });

    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Error logging middleware
 */
export const errorLogger = (err, req, res, next) => {
  logger.error('Unhandled error', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack,
    statusCode: err.statusCode || 500,
    timestamp: new Date().toISOString(),
  });

  next(err);
};

/**
 * Process-level error handlers
 */
if (!envUtils.isTest()) {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    
    // Give time for log to write before exiting
    setTimeout(() => process.exit(1), 100);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    logHelpers.logShutdown('SIGTERM');
    setTimeout(() => process.exit(0), 1000);
  });

  process.on('SIGINT', () => {
    logHelpers.logShutdown('SIGINT');
    setTimeout(() => process.exit(0), 1000);
  });
}

export default logger;
export { logger };
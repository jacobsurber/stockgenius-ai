import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const config = {
  filename: process.env.DATABASE_URL || path.join(__dirname, '../data/stockgenius.db'),
  driver: sqlite3.Database,
  verbose: process.env.NODE_ENV === 'development',
};

let db = null;

/**
 * Initialize database connection
 */
export const initDatabase = async () => {
  try {
    db = await open(config);
    
    // Enable foreign keys
    await db.exec('PRAGMA foreign_keys = ON');
    
    // Create tables if they don't exist
    await createTables();
    
    console.log('Database initialized successfully');
    return db;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

/**
 * Get database instance
 */
export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

/**
 * Close database connection
 */
export const closeDatabase = async () => {
  if (db) {
    await db.close();
    db = null;
    console.log('Database connection closed');
  }
};

/**
 * Create database tables
 */
const createTables = async () => {
  const tables = [
    // User preferences and settings
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      type TEXT DEFAULT 'string',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Watchlist for stocks
    `CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      name TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      target_price REAL,
      stop_loss REAL,
      is_active BOOLEAN DEFAULT 1,
      UNIQUE(symbol)
    )`,

    // Trade history for paper trading
    `CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      commission REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      strategy TEXT,
      is_paper_trade BOOLEAN DEFAULT 1
    )`,

    // Portfolio positions
    `CREATE TABLE IF NOT EXISTS portfolio_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      average_cost REAL NOT NULL DEFAULT 0,
      current_value REAL DEFAULT 0,
      unrealized_pnl REAL DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // AI analysis logs
    `CREATE TABLE IF NOT EXISTS ai_analysis_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      analysis_type TEXT NOT NULL,
      prompt TEXT,
      response TEXT,
      model TEXT,
      tokens_used INTEGER,
      cost REAL,
      confidence_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT
    )`,

    // API call logs for monitoring usage
    `CREATE TABLE IF NOT EXISTS api_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      symbol TEXT,
      status INTEGER,
      response_time INTEGER,
      rate_limit_remaining INTEGER,
      error_message TEXT,
      called_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Market data cache
    `CREATE TABLE IF NOT EXISTS market_data_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Alerts and notifications
    `CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      target_value REAL NOT NULL,
      current_value REAL,
      message TEXT,
      is_triggered BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      triggered_at DATETIME
    )`,

    // News sentiment tracking
    `CREATE TABLE IF NOT EXISTS news_sentiment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT,
      source TEXT,
      url TEXT,
      published_at DATETIME,
      sentiment_score REAL,
      sentiment_label TEXT,
      relevance_score REAL,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const table of tables) {
    await db.exec(table);
  }

  // Create indexes for better performance
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_trades_executed_at ON trades(executed_at)',
    'CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio_positions(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_ai_logs_symbol ON ai_analysis_logs(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON ai_analysis_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_api_logs_provider ON api_call_logs(provider)',
    'CREATE INDEX IF NOT EXISTS idx_api_logs_called_at ON api_call_logs(called_at)',
    'CREATE INDEX IF NOT EXISTS idx_cache_key ON market_data_cache(cache_key)',
    'CREATE INDEX IF NOT EXISTS idx_cache_expires ON market_data_cache(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active)',
    'CREATE INDEX IF NOT EXISTS idx_news_symbol ON news_sentiment(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_news_published ON news_sentiment(published_at)',
  ];

  for (const index of indexes) {
    await db.exec(index);
  }

  console.log('Database tables and indexes created successfully');
};

/**
 * Database utilities
 */
export const dbUtils = {
  // Clean expired cache entries
  cleanExpiredCache: async () => {
    const db = getDatabase();
    const result = await db.run(
      'DELETE FROM market_data_cache WHERE expires_at < datetime("now")'
    );
    return result.changes;
  },

  // Get portfolio summary
  getPortfolioSummary: async () => {
    const db = getDatabase();
    return db.all(`
      SELECT 
        COUNT(*) as total_positions,
        SUM(current_value) as total_value,
        SUM(unrealized_pnl) as total_unrealized_pnl,
        AVG(CASE WHEN unrealized_pnl > 0 THEN 1 ELSE 0 END) as win_rate
      FROM portfolio_positions 
      WHERE quantity > 0
    `);
  },

  // Get recent AI analysis
  getRecentAIAnalysis: async (limit = 10) => {
    const db = getDatabase();
    return db.all(`
      SELECT symbol, analysis_type, confidence_score, created_at 
      FROM ai_analysis_logs 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [limit]);
  },

  // Get API usage stats
  getAPIUsageStats: async (timeframe = '24 hours') => {
    const db = getDatabase();
    return db.all(`
      SELECT 
        provider,
        COUNT(*) as total_calls,
        AVG(response_time) as avg_response_time,
        SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) as successful_calls
      FROM api_call_logs 
      WHERE called_at > datetime('now', '-${timeframe}')
      GROUP BY provider
    `);
  },
};

export default {
  initDatabase,
  getDatabase,
  closeDatabase,
  dbUtils,
};
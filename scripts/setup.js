#!/usr/bin/env node

import { initDatabase } from '../config/database.js';
import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Setup script for StockGenius
 * Initializes database, creates directories, and validates configuration
 */

const setup = async () => {
  console.log('🚀 Starting StockGenius setup...\n');

  try {
    // 1. Create necessary directories
    console.log('📁 Creating directories...');
    const dirs = [
      path.join(__dirname, '../data'),
      path.join(__dirname, '../logs'),
      path.join(__dirname, '../data/backups'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  ✅ Created: ${dir}`);
      } else {
        console.log(`  ✅ Exists: ${dir}`);
      }
    }

    // 2. Check for .env file
    console.log('\n🔧 Checking environment configuration...');
    const envPath = path.join(__dirname, '../.env');
    
    if (!fs.existsSync(envPath)) {
      console.log('  ⚠️  .env file not found');
      console.log('  📋 Copying .env.example to .env...');
      
      const envExamplePath = path.join(__dirname, '../.env.example');
      if (fs.existsSync(envExamplePath)) {
        fs.copyFileSync(envExamplePath, envPath);
        console.log('  ✅ Created .env file from template');
        console.log('  🔑 Please update .env with your API keys');
      } else {
        console.log('  ❌ .env.example not found');
        process.exit(1);
      }
    } else {
      console.log('  ✅ .env file exists');
    }

    // 3. Initialize database
    console.log('\n🗄️  Initializing database...');
    try {
      await initDatabase();
      console.log('  ✅ Database initialized successfully');
    } catch (error) {
      console.log(`  ❌ Database initialization failed: ${error.message}`);
      throw error;
    }

    // 4. Test Redis connection (if configured)
    console.log('\n🔴 Testing Redis connection...');
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    
    if (redisUrl) {
      try {
        const redis = createClient({
          url: redisUrl,
          password: process.env.REDIS_PASSWORD || process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        
        await redis.connect();
        await redis.ping();
        await redis.disconnect();
        
        console.log('  ✅ Redis connection successful');
      } catch (error) {
        console.log(`  ⚠️  Redis connection failed: ${error.message}`);
        console.log('  💡 Redis is optional for development');
      }
    } else {
      console.log('  ⚠️  Redis URL not configured');
      console.log('  💡 Redis is optional for development');
    }

    // 5. Validate API keys
    console.log('\n🔑 Validating API configuration...');
    const apiKeys = {
      'Finnhub': process.env.FINNHUB_API_KEY,
      'Polygon': process.env.POLYGON_API_KEY,
      'Alpha Vantage': process.env.ALPHA_VANTAGE_API_KEY,
      'Quiver Quant': process.env.QUIVER_API_KEY,
      'OpenAI': process.env.OPENAI_API_KEY,
    };

    let configuredApis = 0;
    for (const [name, key] of Object.entries(apiKeys)) {
      if (key && key !== `your_${name.toLowerCase().replace(' ', '_')}_api_key_here`) {
        console.log(`  ✅ ${name} API key configured`);
        configuredApis++;
      } else {
        console.log(`  ⚠️  ${name} API key not configured`);
      }
    }

    if (configuredApis === 0) {
      console.log('\n  ⚠️  No API keys configured');
      console.log('  📝 Please update your .env file with API keys');
      console.log('  💡 See .env.example for signup URLs');
    } else {
      console.log(`\n  ✅ ${configuredApis}/${Object.keys(apiKeys).length} API services configured`);
    }

    // 6. Create initial user preferences
    console.log('\n⚙️  Setting up default preferences...');
    try {
      const { getDatabase } = await import('../config/database.js');
      const db = getDatabase();
      
      const defaultPrefs = [
        { key: 'theme', value: 'dark', type: 'string' },
        { key: 'default_symbol', value: 'AAPL', type: 'string' },
        { key: 'paper_trading_balance', value: '100000', type: 'number' },
        { key: 'ai_analysis_enabled', value: 'true', type: 'boolean' },
        { key: 'notification_email', value: '', type: 'string' },
        { key: 'auto_refresh_interval', value: '30', type: 'number' },
      ];

      for (const pref of defaultPrefs) {
        await db.run(
          `INSERT OR IGNORE INTO user_preferences (key, value, type) VALUES (?, ?, ?)`,
          [pref.key, pref.value, pref.type]
        );
      }
      
      console.log('  ✅ Default preferences created');
    } catch (error) {
      console.log(`  ⚠️  Failed to create preferences: ${error.message}`);
    }

    // 7. Setup complete
    console.log('\n🎉 Setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('  1. Update .env with your API keys');
    console.log('  2. Run: npm install');
    console.log('  3. Run: npm run dev');
    console.log('  4. Open: http://localhost:3000');
    
    if (configuredApis < Object.keys(apiKeys).length) {
      console.log('\n💡 Optional:');
      console.log('  - Configure remaining API keys for full functionality');
      console.log('  - Set up Redis for better caching (see Docker Compose)');
      console.log('  - Review configuration in .env file');
    }

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\n🔍 Troubleshooting:');
    console.error('  - Check file permissions');
    console.error('  - Ensure Node.js version >= 18');
    console.error('  - Verify .env.example exists');
    process.exit(1);
  }
};

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setup();
}

export default setup;
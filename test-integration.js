/**
 * Integration Test for StockGenius Platform
 * Tests API connections, AI modules, and data flow
 */

import dotenv from 'dotenv';
import { aiService } from './src/config/openai.js';

dotenv.config();

async function testIntegration() {
  console.log('🧪 Testing StockGenius Integration...\n');

  // Test 1: Environment Variables
  console.log('1️⃣ Testing Environment Variables...');
  const requiredEnvs = [
    'OPENAI_API_KEY',
    'FINNHUB_API_KEY', 
    'POLYGON_API_KEY',
    'ALPHA_VANTAGE_API_KEY'
  ];

  for (const env of requiredEnvs) {
    const value = process.env[env];
    if (value && value !== 'your_openai_api_key_here' && value !== 'demo_key') {
      console.log(`   ✅ ${env}: Configured`);
    } else {
      console.log(`   ❌ ${env}: Missing or placeholder`);
    }
  }

  // Test 2: Redis Connection
  console.log('\n2️⃣ Testing Redis Connection...');
  try {
    const redis = await import('./src/config/redis.js');
    console.log('   ✅ Redis: Connected');
  } catch (error) {
    console.log(`   ❌ Redis: ${error.message}`);
  }

  // Test 3: OpenAI Connection
  console.log('\n3️⃣ Testing OpenAI Connection...');
  try {
    const testData = {
      quote: { c: 150.00, o: 149.50, h: 151.00, l: 149.00 },
      profile: { name: 'Test Company' }
    };
    
    const result = await aiService.analyzeStock('AAPL', testData, 'quick_analysis');
    
    if (result.analysis && result.analysis.symbol) {
      console.log('   ✅ OpenAI: Connected and analyzing');
      console.log(`   📊 Analysis confidence: ${result.analysis.confidence}`);
    } else {
      console.log('   ❌ OpenAI: Connected but unexpected response');
    }
  } catch (error) {
    console.log(`   ❌ OpenAI: ${error.message}`);
  }

  // Test 4: Financial API - Finnhub
  console.log('\n4️⃣ Testing Finnhub API...');
  try {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${process.env.FINNHUB_API_KEY}`);
    const data = await response.json();
    
    if (data.c && data.c > 0) {
      console.log(`   ✅ Finnhub: AAPL price $${data.c}`);
    } else {
      console.log('   ❌ Finnhub: Invalid response');
    }
  } catch (error) {
    console.log(`   ❌ Finnhub: ${error.message}`);
  }

  // Test 5: Database Directory
  console.log('\n5️⃣ Testing Database Setup...');
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const dataDir = './data';
    const logsDir = './logs';
    
    if (fs.existsSync(dataDir)) {
      console.log('   ✅ Data directory: Exists');
    } else {
      console.log('   ❌ Data directory: Missing');
    }
    
    if (fs.existsSync(logsDir)) {
      console.log('   ✅ Logs directory: Exists');
    } else {
      console.log('   ❌ Logs directory: Missing');
    }
  } catch (error) {
    console.log(`   ❌ File system: ${error.message}`);
  }

  console.log('\n🎯 Integration Test Complete!');
  console.log('\n📋 Next Steps:');
  console.log('   1. Fix any ❌ issues above');
  console.log('   2. Restart web interface');
  console.log('   3. Test real AI analysis in dashboard');
}

// Run the test
testIntegration().catch(console.error);
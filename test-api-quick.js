#!/usr/bin/env node

/**
 * Quick API test script for specific data sources
 */

import { DataHub } from './dist/api/DataHub.js';

async function quickAPITest() {
  console.log('🔍 Quick API Connection Test\n');
  
  try {
    const dataHub = new DataHub();
    await dataHub.initializeClients();
    
    console.log('Testing Finnhub API (AAPL quote)...');
    try {
      const quote = await dataHub.finnhubClient.getQuote('AAPL');
      console.log('✅ Finnhub Success:', {
        symbol: 'AAPL',
        price: quote.c,
        change: quote.d,
        changePercent: quote.dp
      });
    } catch (error) {
      console.log('❌ Finnhub Error:', error.message);
    }
    
    console.log('\nTesting company profile...');
    try {
      const profile = await dataHub.finnhubClient.getCompanyProfile('AAPL');
      console.log('✅ Profile Success:', {
        name: profile.name,
        industry: profile.finnhubIndustry,
        country: profile.country
      });
    } catch (error) {
      console.log('❌ Profile Error:', error.message);
    }
    
    console.log('\nTesting news data...');
    try {
      const news = await dataHub.finnhubClient.getCompanyNews('AAPL', '2025-07-10', '2025-07-14');
      console.log('✅ News Success:', {
        articles: news.length,
        firstHeadline: news[0]?.headline || 'N/A'
      });
    } catch (error) {
      console.log('❌ News Error:', error.message);
    }

    console.log('\n🎯 API Test Complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

quickAPITest();
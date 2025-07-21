#!/usr/bin/env node

/**
 * Test script for data collection pipeline
 */

import { DataHub } from './dist/api/DataHub.js';
import { NewsCollector } from './dist/collectors/NewsCollector.js';
import { RedditCollector } from './dist/collectors/RedditCollector.js';
import { DataProcessor } from './dist/preprocessing/DataProcessor.js';

async function testDataCollection() {
  console.log('🧪 Testing StockGenius Data Collection Pipeline\n');
  
  try {
    // Initialize DataHub
    console.log('📡 Initializing DataHub...');
    const dataHub = new DataHub();
    await dataHub.initializeClients();
    console.log('✅ DataHub initialized successfully\n');

    // Test basic API client connections
    console.log('🔗 Testing API Client Connections...');
    
    // Test Finnhub - basic quote
    console.log('  Testing Finnhub (quote data)...');
    try {
      const quote = await dataHub.finnhubClient.getQuote('AAPL');
      console.log(`  ✅ Finnhub: AAPL price = $${quote?.c || 'N/A'}`);
    } catch (error) {
      console.log(`  ❌ Finnhub error: ${error.message}`);
    }

    // Test Yahoo Finance
    console.log('  Testing Yahoo Finance...');
    try {
      const yahooData = await dataHub.yahooClient.getQuote('MSFT');
      console.log(`  ✅ Yahoo: MSFT data received`);
    } catch (error) {
      console.log(`  ❌ Yahoo error: ${error.message}`);
    }

    // Test Alpha Vantage
    console.log('  Testing Alpha Vantage...');
    try {
      const alphaData = await dataHub.alphaVantageClient.getQuote('TSLA');
      console.log(`  ✅ Alpha Vantage: TSLA data received`);
    } catch (error) {
      console.log(`  ❌ Alpha Vantage error: ${error.message}`);
    }

    console.log('\n📰 Testing News Collection...');
    
    // Test News Collector
    try {
      const newsCollectorConfig = {
        enabled: true,
        updateInterval: 300000,
        maxRetries: 3,
        timeout: 30000,
        cacheTTL: 300
      };
      
      const newsCollector = new NewsCollector(newsCollectorConfig, dataHub);
      console.log('  Collecting news for AAPL...');
      
      const newsData = await newsCollector.collectData('AAPL', { limit: 5 });
      console.log(`  ✅ News collected: ${newsData.data.length} articles`);
      
      if (newsData.data.length > 0) {
        const firstArticle = newsData.data[0];
        console.log(`  📄 Sample article: "${firstArticle.title}"`);
        console.log(`  📊 Sentiment: ${firstArticle.sentiment?.sentiment} (${firstArticle.sentiment?.score})`);
      }
      
    } catch (error) {
      console.log(`  ❌ News collection error: ${error.message}`);
    }

    console.log('\n🤖 Testing Reddit Collection...');
    
    // Test Reddit Collector (basic test)
    try {
      const redditCollectorConfig = {
        enabled: true,
        updateInterval: 300000,
        maxRetries: 3,
        timeout: 30000,
        cacheTTL: 300
      };
      
      const redditCollector = new RedditCollector(redditCollectorConfig);
      console.log('  Collecting Reddit data for AAPL...');
      
      const redditData = await redditCollector.collectData('AAPL', { limit: 3 });
      console.log(`  ✅ Reddit data collected: ${redditData.data.length} posts`);
      
      if (redditData.data.length > 0) {
        const firstPost = redditData.data[0];
        console.log(`  📄 Sample post: "${firstPost.title}"`);
        console.log(`  📊 Sentiment: ${firstPost.sentiment?.sentiment} (${firstPost.sentiment?.score})`);
      }
      
    } catch (error) {
      console.log(`  ❌ Reddit collection error: ${error.message}`);
    }

    console.log('\n⚙️ Testing Data Processing...');
    
    // Test Data Processor
    try {
      const dataProcessor = new DataProcessor();
      console.log('  Testing data processing for AAPL...');
      
      const processResult = await dataProcessor.processCollectedData(['AAPL']);
      console.log(`  ✅ Processing result: ${processResult.recordsProcessed} records processed`);
      console.log(`  📈 Quality improvement: ${(processResult.qualityImprovement * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.log(`  ❌ Data processing error: ${error.message}`);
    }

    console.log('\n🎯 Testing Comprehensive Data Flow...');
    
    // Test full data collection flow
    try {
      console.log('  Collecting comprehensive data for NVDA...');
      
      // Collect from multiple sources
      const symbol = 'NVDA';
      const results = {};
      
      // Quote data
      try {
        results.quote = await dataHub.finnhubClient.getQuote(symbol);
        console.log(`  ✅ Quote: $${results.quote?.c || 'N/A'}`);
      } catch (e) {
        console.log(`  ⚠️ Quote failed: ${e.message}`);
      }
      
      // News data
      try {
        const newsCollector = new NewsCollector({
          enabled: true,
          updateInterval: 300000,
          maxRetries: 3,
          timeout: 30000,
          cacheTTL: 300
        }, dataHub);
        
        results.news = await newsCollector.collectData(symbol, { limit: 3 });
        console.log(`  ✅ News: ${results.news.data.length} articles`);
      } catch (e) {
        console.log(`  ⚠️ News failed: ${e.message}`);
      }
      
      // Company profile
      try {
        results.profile = await dataHub.finnhubClient.getCompanyProfile(symbol);
        console.log(`  ✅ Profile: ${results.profile?.name || 'N/A'}`);
      } catch (e) {
        console.log(`  ⚠️ Profile failed: ${e.message}`);
      }
      
      console.log('\n📊 Data Collection Summary:');
      console.log(`  Symbol: ${symbol}`);
      console.log(`  Quote: ${results.quote ? '✅' : '❌'}`);
      console.log(`  News: ${results.news ? '✅' : '❌'}`);
      console.log(`  Profile: ${results.profile ? '✅' : '❌'}`);
      
    } catch (error) {
      console.log(`  ❌ Comprehensive test error: ${error.message}`);
    }

    console.log('\n🎉 Data Collection Testing Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

// Run the test
testDataCollection().catch(console.error);
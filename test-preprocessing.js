#!/usr/bin/env node

/**
 * Test script for data preprocessing pipeline
 */

import { DataProcessor } from './dist/preprocessing/DataProcessor.js';

async function testPreprocessing() {
  console.log('⚙️ Testing Data Preprocessing Pipeline\n');
  
  try {
    // Test Data Processor
    console.log('📊 Testing DataProcessor...');
    const dataProcessor = new DataProcessor();
    
    // Test with sample symbols
    const symbols = ['AAPL', 'NVDA', 'TSLA'];
    
    console.log(`Processing data for symbols: ${symbols.join(', ')}`);
    
    const startTime = Date.now();
    const result = await dataProcessor.processCollectedData(symbols);
    const processingTime = Date.now() - startTime;
    
    console.log('✅ Data processing completed:');
    console.log(`  - Success: ${result.success}`);
    console.log(`  - Records processed: ${result.recordsProcessed}`);
    console.log(`  - Quality improvement: ${(result.qualityImprovement * 100).toFixed(1)}%`);
    console.log(`  - Processing time: ${processingTime}ms`);
    
    if (result.errors.length > 0) {
      console.log(`  - Errors: ${result.errors.length}`);
      result.errors.forEach((error, i) => {
        console.log(`    ${i + 1}. ${error}`);
      });
    }
    
    console.log('\n🎯 Data Preprocessing Test Complete!');
    
  } catch (error) {
    console.error('❌ Preprocessing test failed:', error.message);
    console.error(error.stack);
  }
}

testPreprocessing().catch(console.error);
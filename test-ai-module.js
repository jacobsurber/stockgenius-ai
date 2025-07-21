/**
 * Direct AI Module Test
 * Test a specific AI module to see what's failing
 */

import TechnicalTiming from './dist/ai/modules/TechnicalTiming.js';
import { DataHub } from './dist/api/DataHub.js';

console.log('🔧 Testing AI Module Directly\n');

async function testTechnicalTiming() {
  try {
    console.log('1️⃣ Initializing DataHub...');
    const dataHub = new DataHub();
    
    console.log('2️⃣ Initializing TechnicalTiming module...');
    const technicalTiming = new TechnicalTiming(dataHub);
    
    console.log('3️⃣ Creating test input...');
    
    // Realistic input that mimics what the pipeline would send
    const testInput = {
      symbol: 'JNJ',
      timeframe: '1d',
      indicators: {
        currentPrice: 165.00,
        rsi: 62.5,
        macd: {
          macd: 1.2,
          signal: 0.8,
          histogram: 0.4
        },
        sma: {
          sma_20: 163.50,
          sma_50: 161.20,
          sma_200: 158.80
        },
        volume: {
          current: 8500000,
          average: 7200000,
          volumeRatio: 1.18
        },
        supportLevels: [162.00, 158.50, 155.00],
        resistanceLevels: [168.00, 172.50, 176.00],
        bollinger: {
          upper: 168.50,
          middle: 164.00,
          lower: 159.50
        }
      },
      marketContext: {
        vixLevel: 22.0,
        marketTrend: 'neutral',
        sectorPerformance: 0.015
      }
    };
    
    console.log(`✅ Test input created for ${testInput.symbol}`);
    console.log(`   Current Price: $${testInput.indicators.currentPrice}`);
    console.log(`   RSI: ${testInput.indicators.rsi}`);
    console.log(`   Support Levels: ${testInput.indicators.supportLevels.join(', ')}`);
    
    console.log('\n4️⃣ Running TechnicalTiming analysis...');
    const startTime = Date.now();
    
    const result = await technicalTiming.analyze(testInput);
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Analysis completed in ${duration}ms`);
    console.log('\n📊 ANALYSIS RESULTS:');
    console.log(`   Symbol: ${result.symbol}`);
    console.log(`   Entry Price: $${result.analysis.entry_price}`);
    console.log(`   Target Price: $${result.analysis.primary_exit}`);
    console.log(`   Stop Loss: $${result.analysis.stop_loss}`);
    console.log(`   Confidence: ${result.analysis.confidence}`);
    console.log(`   Setup Type: ${result.analysis.setup_type}`);
    console.log(`   Time Horizon: ${result.analysis.time_horizon}`);
    
    if (result.reasoning) {
      console.log('\n🧠 OPENAI REASONING:');
      console.log(`   Entry Reasoning: ${result.reasoning.entry_reasoning}`);
      console.log(`   Exit Strategy: ${result.reasoning.exit_strategy}`);
      console.log(`   Risk Factors: ${result.reasoning.risk_factors.join(', ')}`);
    }
    
    console.log('\n🎯 SUCCESS! AI module is working and providing real OpenAI analysis');
    
  } catch (error) {
    console.log('\n❌ AI MODULE FAILED!');
    console.log(`Error Type: ${error.constructor.name}`);
    console.log(`Error Message: ${error.message}`);
    
    if (error.message.includes('openAIClient')) {
      console.log('\n💡 OpenAI Client Error - this is the root cause!');
    } else if (error.message.includes('function')) {
      console.log('\n💡 Function calling error - schema or tool issue');
    } else if (error.message.includes('timeout')) {
      console.log('\n💡 Timeout error - OpenAI response too slow');
    } else if (error.message.includes('rate')) {
      console.log('\n💡 Rate limit error - too many requests');
    }
    
    console.log(`\n🔍 Full Error:\n${error.stack}`);
    
    console.log('\n💭 This explains why the pipeline uses fallback data!');
  }
}

await testTechnicalTiming();
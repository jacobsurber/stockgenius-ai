#!/usr/bin/env node

/**
 * Simple test for AI modules
 */

import { RiskAssessor } from './dist/ai/modules/RiskAssessor.js';
import { DataHub } from './dist/api/DataHub.js';

async function testSimpleAI() {
  console.log('🤖 Testing AI Modules (Simple)\n');
  
  try {
    // Initialize DataHub
    console.log('📡 Initializing DataHub...');
    const dataHub = new DataHub();
    await dataHub.initializeClients();
    console.log('✅ DataHub initialized\n');
    
    // Test Risk Assessor
    console.log('⚖️ Testing Risk Assessor...');
    const riskAssessor = new RiskAssessor(dataHub);
    
    // Get real market data for risk assessment
    const symbol = 'AAPL';
    const quote = await dataHub.finnhubClient.getQuote(symbol);
    
    const riskInput = {
      symbol: symbol,
      timeHorizon: '1-3 days',
      positionSize: 0.05, // 5% of portfolio
      tradeDirection: 'long',
      avgDailyVolume: 50000000,
      recentVolume5d: 55000000,
      bidAskSpread: 0.001,
      marketCap: 3500000000000, // 3.5T
      historicalVol30d: 0.25,
      impliedVol: 0.28,
      beta: 1.2,
      currentPrice: quote.c,
      support: quote.c * 0.95,
      resistance: quote.c * 1.05,
      trendStrength: 0.4,
      rsi: 65,
      retailInterest: 0.8,
      institutionalFlow: 50000000,
      shortInterest: 0.15,
      socialSentiment: 0.2,
      vixLevel: 18.5,
      sectorPerformance: 0.02,
      marketTrend: 'bullish'
    };
    
    console.log(`  Risk assessment for ${symbol} at $${quote.c}...`);
    const riskAssessment = await riskAssessor.assessRisk(riskInput);
    
    console.log('  ✅ Risk Assessment Results:');
    console.log(`    - Overall Risk Score: ${(riskAssessment.assessment.overall_risk_score * 100).toFixed(1)}%`);
    console.log(`    - Risk Grade: ${riskAssessment.assessment.risk_grade}`);
    console.log(`    - Max Position Size: ${(riskAssessment.assessment.max_position_size * 100).toFixed(1)}%`);
    console.log(`    - Primary Risks: ${riskAssessment.assessment.primary_risks.join(', ')}`);
    console.log(`    - Alerts: ${riskAssessment.alerts.length} alerts`);
    console.log(`    - Processing Time: ${riskAssessment.metadata.processing_time}ms`);
    console.log(`    - Confidence: ${(riskAssessment.metadata.confidence_score * 100).toFixed(1)}%`);
    
    // Test risk breakdown
    console.log('\n  📊 Risk Breakdown:');
    Object.entries(riskAssessment.assessment.risk_breakdown).forEach(([category, data]) => {
      console.log(`    - ${category}: ${(data.score * 100).toFixed(1)}% - ${data.reason}`);
    });
    
    console.log('\n🎯 AI Module Testing Complete!');
    
  } catch (error) {
    console.error('❌ AI testing failed:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

testSimpleAI().catch(console.error);
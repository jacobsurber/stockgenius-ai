#!/usr/bin/env node

/**
 * Test script for AI/ML modules with real data
 */

import { RiskAssessor } from './dist/ai/modules/RiskAssessor.js';
import { DataHub } from './dist/api/DataHub.js';
import { RedditNLP } from './dist/ai/modules/RedditNLP.js';
import { TechnicalTiming } from './dist/ai/modules/TechnicalTiming.js';
import { SectorIntelligence } from './dist/ai/modules/SectorIntelligence.js';

async function testAIModules() {
  console.log('🤖 Testing AI/ML Modules with Real Data\n');
  
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
    console.log(`    - Alerts: ${riskAssessment.alerts.length}`);
    
    // Test Reddit NLP
    console.log('\n📊 Testing Reddit NLP...');
    const redditNLP = new RedditNLP();
    
    const sampleRedditPosts = [
      `${symbol} to the moon! 🚀 Great earnings coming up`,
      `Not sure about ${symbol} right now, might be overvalued`,
      `${symbol} looks like a solid long term hold`,
      `Selling my ${symbol} position, too risky for me`
    ];
    
    console.log('  Analyzing Reddit sentiment...');
    const redditResults = await Promise.all(
      sampleRedditPosts.map(text => redditNLP.analyzeSentiment(text))
    );
    
    console.log('  ✅ Reddit NLP Results:');
    redditResults.forEach((result, i) => {
      console.log(`    ${i + 1}. "${sampleRedditPosts[i].substring(0, 40)}..." → ${result.sentiment} (${result.score.toFixed(2)})`);
    });
    
    // Test Technical Timing
    console.log('\n⏰ Testing Technical Timing...');
    const technicalTiming = new TechnicalTiming(dataHub);
    
    console.log(`  Analyzing technical timing for ${symbol}...`);
    const timingAnalysis = await technicalTiming.analyzeTiming(symbol);
    
    console.log('  ✅ Technical Timing Results:');
    console.log(`    - Overall Signal: ${timingAnalysis.signal}`);
    console.log(`    - Confidence: ${(timingAnalysis.confidence * 100).toFixed(1)}%`);
    console.log(`    - Time Horizon: ${timingAnalysis.timeHorizon}`);
    
    // Test Sector Intelligence
    console.log('\n🏢 Testing Sector Intelligence...');
    const sectorIntelligence = new SectorIntelligence(dataHub);
    
    console.log(`  Analyzing sector intelligence for ${symbol}...`);
    const sectorAnalysis = await sectorIntelligence.analyzeSector(symbol);
    
    console.log('  ✅ Sector Intelligence Results:');
    console.log(`    - Sector: ${sectorAnalysis.sector}`);
    console.log(`    - Sector Score: ${(sectorAnalysis.score * 100).toFixed(1)}%`);
    console.log(`    - Relative Strength: ${sectorAnalysis.relativeStrength}`);
    if (sectorAnalysis.insights.length > 0) {
      console.log(`    - Key Insight: "${sectorAnalysis.insights[0].substring(0, 60)}..."`);
    }
    
    console.log('\n🎯 AI/ML Module Testing Complete!');
    
  } catch (error) {
    console.error('❌ AI/ML testing failed:', error.message);
    console.error(error.stack);
  }
}

testAIModules().catch(console.error);
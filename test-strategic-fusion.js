/**
 * Strategic Fusion Specific Test
 * Tests the exact path that would cause 0 trade cards generation
 */

import { DataHub } from './dist/api/DataHub.js';
import StrategicFusion from './dist/ai/StrategicFusion.js';
import { loggerUtils } from './dist/config/logger.js';

console.log('🎯 Strategic Fusion Integration Test\n');

// Test the exact scenario that's happening in the pipeline
async function testStrategicFusion() {
  try {
    console.log('1️⃣ Initializing DataHub...');
    const dataHub = new DataHub();
    console.log('✅ DataHub initialized');

    console.log('\n2️⃣ Initializing StrategicFusion...');
    const strategicFusion = new StrategicFusion(dataHub);
    console.log('✅ StrategicFusion initialized');

    console.log('\n3️⃣ Creating test input data (simulating what DailyPipeline sends)...');
    
    // Create mock input that simulates what would come from the AI analysis
    const testInputs = [
      {
        symbol: 'AAPL',
        currentPrice: 150.00,
        marketContext: {
          vixLevel: 20.5,
          marketTrend: 'neutral',
          sectorPerformance: 0.02,
          timeOfDay: 'post_market'
        },
        moduleOutputs: {
          technical: {
            analysis: {
              setup_type: 'Breakout',
              entry_price: 149.50,
              primary_exit: 155.00,
              stop_loss: 147.00,
              risk_reward_ratio: 2.2,
              confidence: 0.75
            },
            technicalSignals: {
              rsi_signal: 'bullish',
              macd_signal: 'bullish',
              trend_signal: 'uptrend'
            },
            patterns: {
              primary_pattern: 'bull_flag'
            }
          },
          sector: {
            sector: 'technology',
            analysis: {
              sector_rotation_signal: 'bullish',
              peer_performance: {
                relative_strength: 0.8,
                vs_sector: 'outperforming',
                vs_market: 'outperforming'
              },
              drivers: ['earnings_season', 'innovation'],
              risk_trends: ['regulation_risk'],
              confidence_score: 0.7
            }
          },
          risk: {
            assessment: {
              overall_risk_score: 0.4,
              risk_grade: 'B',
              max_position_size: 0.05,
              risk_breakdown: {
                liquidity: { score: 0.2 },
                volatility: { score: 0.5 },
                event: { score: 0.3 }
              },
              primary_risks: ['market_volatility', 'earnings_risk'],
              risk_mitigation: ['stop_loss', 'position_sizing']
            }
          },
          reddit: {
            authenticity: { overall_score: 0.8 },
            analysis: {
              momentum_type: 'organic',
              sentiment_trend: 'positive',
              sustainability: 'high',
              risk_flags: [],
              key_themes: ['innovation', 'earnings']
            },
            pump_and_dump: { overall_risk: 0.2 }
          }
        }
      }
    ];

    console.log(`✅ Created test input with ${testInputs.length} symbols`);
    console.log(`   Symbol: ${testInputs[0].symbol}`);
    console.log(`   Current Price: $${testInputs[0].currentPrice}`);
    console.log(`   Market Context: ${JSON.stringify(testInputs[0].marketContext)}`);

    console.log('\n4️⃣ Testing StrategicFusion.generateTradeCards()...');
    const startTime = Date.now();
    
    const result = await strategicFusion.generateTradeCards(testInputs);
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ StrategicFusion completed in ${duration}ms`);
    console.log('\n📊 FUSION RESULTS:');
    console.log(`   Trade Cards Generated: ${result.tradeCards.length}`);
    console.log(`   Processing Time: ${result.metadata.processing_time}ms`);
    console.log(`   Model Used: ${result.metadata.model_used}`);
    console.log(`   Fusion Quality Score: ${result.metadata.fusion_quality_score}`);
    
    if (result.tradeCards.length > 0) {
      console.log('\n🎯 FIRST TRADE CARD:');
      const firstCard = result.tradeCards[0];
      console.log(`   Title: ${firstCard.header.title}`);
      console.log(`   Subtitle: ${firstCard.header.subtitle}`);
      console.log(`   Confidence: ${(firstCard.header.confidence * 100).toFixed(1)}%`);
      console.log(`   Trade Type: ${firstCard.header.trade_type}`);
      console.log(`   Setup Type: ${firstCard.narrative.setup.type}`);
      console.log(`   Entry Price: $${firstCard.execution.entry_price.toFixed(2)}`);
      console.log(`   Target Price: $${firstCard.execution.target_price.toFixed(2)}`);
      console.log(`   Stop Loss: $${firstCard.execution.stop_loss.toFixed(2)}`);
      console.log(`   Risk/Reward: ${firstCard.execution.risk_reward_ratio.toFixed(2)}:1`);
    } else {
      console.log('\n❌ NO TRADE CARDS GENERATED!');
      console.log('This matches the issue you reported.');
      
      console.log('\n🔍 DEBUGGING INFORMATION:');
      console.log('Market Overview:', JSON.stringify(result.marketOverview, null, 2));
      console.log('Portfolio Guidance:', JSON.stringify(result.portfolioGuidance, null, 2));
      
      // Check if the confidence thresholds are being met
      console.log('\n🎚️ CHECKING CONFIDENCE CALCULATION:');
      
      // Manually test the signal composition calculation
      console.log('Testing signal composition calculation...');
      
      // This mirrors the private method logic
      const modules = testInputs[0].moduleOutputs;
      let technicalScore = modules.technical ? modules.technical.analysis.confidence : 0;
      let sentimentScore = modules.reddit ? modules.reddit.authenticity.overall_score * (1 - modules.reddit.pump_and_dump.overall_risk) : 0;
      let riskScore = modules.risk ? 1 - modules.risk.assessment.overall_risk_score : 0;
      let sectorScore = modules.sector ? modules.sector.analysis.confidence_score * modules.sector.analysis.peer_performance.relative_strength : 0;
      
      console.log(`   Technical Score: ${technicalScore}`);
      console.log(`   Sentiment Score: ${sentimentScore}`);
      console.log(`   Risk Score: ${riskScore}`);
      console.log(`   Sector Score: ${sectorScore}`);
      
      // Calculate weighted composite (using the weights from StrategicFusion)
      const signalWeights = {
        technical: 0.30,
        sentiment: 0.25,
        risk: 0.20,
        sector: 0.15,
        anomaly: 0.10,
      };
      
      const compositeScore = (
        technicalScore * signalWeights.technical +
        sentimentScore * signalWeights.sentiment +
        riskScore * signalWeights.risk +
        sectorScore * signalWeights.sector
      );
      
      console.log(`   Composite Score: ${compositeScore}`);
      console.log(`   Minimum Threshold: 0.60`);
      console.log(`   Passes Threshold: ${compositeScore >= 0.60 ? 'YES' : 'NO'}`);
      
      if (compositeScore < 0.60) {
        console.log('\n💡 DIAGNOSIS: Composite score is below minimum threshold of 0.60');
        console.log('   This is why no trade cards are being generated.');
        console.log('   The AI modules are working, but the signal strength is too low.');
      }
    }

  } catch (error) {
    console.log('\n❌ STRATEGIC FUSION TEST FAILED!');
    console.log('Error Type:', error.constructor.name);
    console.log('Error Message:', error.message);
    console.log('Stack Trace:', error.stack);
    
    // Check for specific error patterns
    if (error.message.includes('OpenAI')) {
      console.log('\n🔍 This appears to be an OpenAI-related error.');
      console.log('   Check the OpenAI client configuration and API key.');
    } else if (error.message.includes('function')) {
      console.log('\n🔍 This appears to be a function calling error.');
      console.log('   The function schema or tool usage might have an issue.');
    } else if (error.message.includes('JSON')) {
      console.log('\n🔍 This appears to be a JSON parsing error.');
      console.log('   The AI response format might be incorrect.');
    }
  }
}

// Test minimal fusion scenario
async function testMinimalFusion() {
  console.log('\n\n5️⃣ Testing MINIMAL fusion scenario...');
  
  try {
    const dataHub = new DataHub();
    const strategicFusion = new StrategicFusion(dataHub);
    
    // Create minimal input with high confidence scores
    const minimalInput = [{
      symbol: 'TSLA',
      currentPrice: 200.00,
      marketContext: {
        vixLevel: 15.0,  // Low volatility
        marketTrend: 'bullish',
        sectorPerformance: 0.05,
        timeOfDay: 'post_market'
      },
      moduleOutputs: {
        technical: {
          analysis: {
            setup_type: 'Breakout',
            entry_price: 199.00,
            primary_exit: 210.00,
            stop_loss: 195.00,
            risk_reward_ratio: 2.75,
            confidence: 0.90  // Very high technical confidence
          },
          technicalSignals: {
            rsi_signal: 'bullish',
            macd_signal: 'bullish', 
            trend_signal: 'strong_uptrend'
          },
          patterns: {
            primary_pattern: 'ascending_triangle'
          }
        },
        sector: {
          sector: 'technology',
          analysis: {
            sector_rotation_signal: 'bullish',
            peer_performance: {
              relative_strength: 0.95,  // Very strong relative performance
              vs_sector: 'strongly_outperforming',
              vs_market: 'strongly_outperforming'
            },
            drivers: ['AI_revolution', 'autonomous_driving'],
            risk_trends: [],
            confidence_score: 0.85  // High sector confidence
          }
        },
        risk: {
          assessment: {
            overall_risk_score: 0.25,  // Low risk
            risk_grade: 'A',
            max_position_size: 0.10,
            risk_breakdown: {
              liquidity: { score: 0.1 },
              volatility: { score: 0.3 },
              event: { score: 0.2 }
            },
            primary_risks: ['market_volatility'],
            risk_mitigation: ['tight_stops', 'position_sizing']
          }
        },
        reddit: {
          authenticity: { overall_score: 0.95 },  // Very authentic sentiment
          analysis: {
            momentum_type: 'institutional',
            sentiment_trend: 'very_positive',
            sustainability: 'very_high',
            risk_flags: [],
            key_themes: ['AI', 'innovation', 'future_tech']
          },
          pump_and_dump: { overall_risk: 0.05 }  // Very low pump risk
        }
      }
    }];

    console.log('Testing with HIGH CONFIDENCE inputs...');
    const result = await strategicFusion.generateTradeCards(minimalInput);
    
    console.log(`📊 Minimal Test Results:`);
    console.log(`   Trade Cards Generated: ${result.tradeCards.length}`);
    console.log(`   Processing Time: ${result.metadata.processing_time}ms`);
    
    if (result.tradeCards.length > 0) {
      console.log('✅ SUCCESS! High confidence inputs generated trade cards.');
      const card = result.tradeCards[0];
      console.log(`   First Card Confidence: ${(card.header.confidence * 100).toFixed(1)}%`);
    } else {
      console.log('❌ STILL NO CARDS! Even with high confidence inputs.');
      console.log('This suggests a deeper issue in the StrategicFusion logic.');
    }
    
  } catch (error) {
    console.log('❌ Minimal fusion test failed:', error.message);
  }
}

// Run the tests
console.log('Starting Strategic Fusion tests...\n');
await testStrategicFusion();
await testMinimalFusion();

console.log('\n\n🏁 FINAL DIAGNOSIS:');
console.log('If no trade cards were generated in either test:');
console.log('1. The OpenAI API is working (confirmed by earlier test)');
console.log('2. The issue is likely in the StrategicFusion signal composition logic');
console.log('3. The confidence thresholds may be too high');
console.log('4. The AI narrative generation might be failing');
console.log('5. Check the calculateSignalComposition and generateAINarrative methods');
console.log('\nRecommended next steps:');
console.log('- Lower the minimum confidence threshold temporarily');
console.log('- Add more debug logging to StrategicFusion');
console.log('- Check if the function calling schema is working correctly');
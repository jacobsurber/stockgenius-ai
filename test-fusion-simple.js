/**
 * Simple Strategic Fusion Test
 * Direct test of the generateAINarrative method
 */

import { openAIClient } from './src/config/openai.js';

console.log('🔍 Simple Strategic Fusion OpenAI Test\n');

async function testFusionOpenAICall() {
  console.log('1️⃣ Testing if OpenAI client is available...');
  
  if (!openAIClient) {
    console.log('❌ OpenAI client is not available');
    return;
  }
  
  console.log('✅ OpenAI client is available');
  
  console.log('\n2️⃣ Testing function calling (Strategic Fusion style)...');
  
  // This is exactly what StrategicFusion does
  const strategicFusionSchema = {
    name: "synthesize_trade_narrative",
    description: "Synthesize multiple AI module outputs into coherent trade narrative",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Concise 2-3 sentence trade thesis summary"
        },
        setup: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["Breakout", "Reversal", "Momentum", "Earnings Play", "Sector Rotation", "Anomaly Exploitation", "Mean Reversion"],
              description: "Primary setup type based on analysis"
            },
            strength: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Setup strength based on signal confluence"
            },
            confluence_factors: {
              type: "array",
              items: { type: "string" },
              description: "Key factors supporting the setup"
            },
            key_levels: {
              type: "array",
              items: { type: "string" },
              description: "Important price levels and technical factors"
            }
          },
          required: ["type", "strength", "confluence_factors", "key_levels"]
        },
        catalyst: {
          type: "object",
          properties: {
            primary: {
              type: "string",
              description: "Primary catalyst driving the trade opportunity"
            },
            timing_sensitivity: {
              type: "string",
              enum: ["immediate", "hours", "days", "weeks"],
              description: "How time-sensitive the catalyst timing is"
            },
            event_risk: {
              type: "boolean",
              description: "Whether catalyst involves binary event risk"
            }
          },
          required: ["primary", "timing_sensitivity", "event_risk"]
        },
        timing: {
          type: "object",
          properties: {
            entry_window: {
              type: "string",
              description: "Optimal entry timing window"
            },
            optimal_entry: {
              type: "string",
              description: "Most optimal entry condition or timing"
            },
            time_horizon: {
              type: "string",
              description: "Expected time to target achievement"
            },
            urgency: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Urgency level for trade execution"
            }
          },
          required: ["entry_window", "optimal_entry", "time_horizon", "urgency"]
        },
        confirmation: {
          type: "object",
          properties: {
            signals_needed: {
              type: "array",
              items: { type: "string" },
              description: "Additional signals needed to confirm trade"
            },
            invalidation_triggers: {
              type: "array",
              items: { type: "string" },
              description: "Conditions that would invalidate the trade thesis"
            },
            monitoring_points: {
              type: "array",
              items: { type: "string" },
              description: "Key metrics and levels to monitor"
            }
          },
          required: ["signals_needed", "invalidation_triggers", "monitoring_points"]
        },
        risk: {
          type: "object",
          properties: {
            primary_risks: {
              type: "array",
              items: { type: "string" },
              description: "Main risk factors for the trade"
            },
            risk_grade: {
              type: "string",
              enum: ["A", "B", "C", "D", "F"],
              description: "Overall risk grade for the trade"
            },
            position_sizing: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Recommended position size as fraction of portfolio"
            },
            stop_loss_strategy: {
              type: "string",
              description: "Recommended stop loss approach"
            }
          },
          required: ["primary_risks", "risk_grade", "position_sizing", "stop_loss_strategy"]
        }
      },
      required: ["summary", "setup", "catalyst", "timing", "confirmation", "risk"]
    }
  };

  const systemPrompt = `You are an elite trading strategist AI that synthesizes multiple analytical inputs into coherent, actionable trade narratives.`;

  const userPrompt = `Synthesize comprehensive trade analysis for AAPL at $150.00:

MARKET CONTEXT:
- VIX Level: 20.5
- Market Trend: neutral
- Sector Performance: 2.0%
- Time of Day: post_market

SIGNAL COMPOSITION:
- Composite Score: 75%
- Technical Weight: 75%
- Sentiment Weight: 80%
- Risk Weight: 60%
- Sector Weight: 70%

TECHNICAL ANALYSIS:
- Setup Type: Breakout
- Entry Price: $149.50
- Target: $155.00
- Stop Loss: $147.00
- Risk/Reward: 2.2:1
- Confidence: 75%
- RSI Signal: bullish
- MACD Signal: bullish
- Trend Signal: uptrend
- Pattern: bull_flag

SECTOR INTELLIGENCE:
- Sector: technology
- Rotation Signal: bullish
- Relative Strength: 80%
- vs Sector: outperforming
- vs Market: outperforming
- Key Drivers: earnings_season, innovation
- Risk Trends: regulation_risk
- Confidence: 70%

RISK ASSESSMENT:
- Overall Risk Score: 40%
- Risk Grade: B
- Max Position Size: 5.0%
- Liquidity Risk: 20%
- Volatility Risk: 50%
- Event Risk: 30%
- Primary Risks: market_volatility, earnings_risk
- Mitigation: stop_loss, position_sizing

SENTIMENT ANALYSIS:
- Authenticity Score: 80%
- Momentum Type: organic
- Sentiment Trend: positive
- Sustainability: high
- Risk Flags: 
- Key Themes: innovation, earnings
- Pump Risk: 20%

SYNTHESIS REQUIREMENTS:
1. Create coherent narrative connecting all available signals
2. Identify the strongest confluence factors supporting the trade
3. Determine optimal entry timing and conditions
4. Specify clear confirmation signals and invalidation triggers
5. Assess risk factors and recommend position sizing
6. Provide specific, actionable guidance

Focus on the highest-conviction elements and explain how they work together to create a compelling trade opportunity.`;

  try {
    console.log('Making OpenAI API call with function calling...');
    const startTime = Date.now();
    
    const response = await openAIClient.chat.completions.create({
      model: 'gpt-4o-mini', // Use cheaper model for testing
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      tools: [{
        type: 'function',
        function: strategicFusionSchema
      }],
      tool_choice: { type: 'function', function: { name: 'synthesize_trade_narrative' } },
      temperature: 0.15,
      max_tokens: 2000,
    });

    const duration = Date.now() - startTime;
    
    console.log(`✅ OpenAI API call completed in ${duration}ms`);
    console.log(`Model used: ${response.model}`);
    console.log(`Input tokens: ${response.usage?.prompt_tokens || 'unknown'}`);
    console.log(`Output tokens: ${response.usage?.completion_tokens || 'unknown'}`);
    console.log(`Total tokens: ${response.usage?.total_tokens || 'unknown'}`);
    
    if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const narrative = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
      console.log('\n🎯 FUNCTION CALL SUCCESS!');
      console.log('Generated Trade Narrative:');
      console.log(`  Summary: ${narrative.summary}`);
      console.log(`  Setup Type: ${narrative.setup.type}`);
      console.log(`  Setup Strength: ${(narrative.setup.strength * 100).toFixed(1)}%`);
      console.log(`  Primary Catalyst: ${narrative.catalyst.primary}`);
      console.log(`  Entry Window: ${narrative.timing.entry_window}`);
      console.log(`  Time Horizon: ${narrative.timing.time_horizon}`);
      console.log(`  Risk Grade: ${narrative.risk.risk_grade}`);
      console.log(`  Position Size: ${(narrative.risk.position_sizing * 100).toFixed(1)}%`);
      
      console.log('\n✅ This proves the OpenAI function calling is working perfectly!');
      console.log('The issue is likely elsewhere in the StrategicFusion logic.');
      
    } else {
      console.log('❌ No function call response received');
      console.log('Response structure:', JSON.stringify(response.choices[0]?.message, null, 2));
    }

  } catch (error) {
    console.log('❌ OpenAI API call failed!');
    console.log('Error Type:', error.constructor.name);
    console.log('Error Message:', error.message);
    
    if (error.code) {
      console.log('Error Code:', error.code);
    }
    
    if (error.status) {
      console.log('HTTP Status:', error.status);
    }
    
    console.log('\nThis error explains why StrategicFusion is failing!');
  }
}

// Test a simpler version without function calling
async function testSimpleCompletion() {
  console.log('\n\n3️⃣ Testing simple completion (fallback test)...');
  
  try {
    const response = await openAIClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Create a JSON trade analysis for AAPL with fields: {"summary": "brief analysis", "confidence": 0.8, "setup_type": "Breakout", "risk_grade": "B"}'
        }
      ],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    
    console.log('✅ Simple completion successful');
    console.log('Response:', response.choices[0]?.message?.content);
    
  } catch (error) {
    console.log('❌ Simple completion failed:', error.message);
  }
}

// Run tests
await testFusionOpenAICall();
await testSimpleCompletion();

console.log('\n🏁 Test completed!');
console.log('\nIf the function calling test succeeded, the issue is in StrategicFusion logic, not OpenAI.');
console.log('If it failed, we found the root cause of 0 trade cards.');
#!/usr/bin/env node

/**
 * Test the TechnicalTiming prompt to identify issues
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Current TechnicalTiming system prompt (simplified)
const currentSystemPrompt = `You are an expert technical analyst specializing in short-term trading setups. Your role is to identify optimal entry and exit points for swing trades using technical indicators and price action.

KEY TECHNICAL INDICATORS TO ANALYZE:

RSI (Relative Strength Index):
- Overbought (>70): Look for reversal signals
- Oversold (<30): Look for bounce opportunities
- Divergences: Price vs RSI momentum divergence
- Trend confirmation in 40-60 range

MACD (Moving Average Convergence Divergence):
- Signal line crossovers: Bullish (MACD > Signal), Bearish (MACD < Signal)
- Histogram momentum: Increasing = strengthening trend
- Zero line crossovers: Trend direction changes
- Divergences with price action

SETUP REQUIREMENTS:
- Minimum 1:2 risk/reward ratio for swing trades
- Clear invalidation levels
- Specific entry timing conditions
- Multiple timeframe confirmation`;

// Current user prompt (sample data)
const currentUserPrompt = `Analyze AAPL for optimal swing long trade entry/exit:

TECHNICAL DATA:
- RSI (14): current: 65.3, trend: rising, divergence: none
- MACD: line: 0.125, signal: 0.089, histogram: 0.036, crossover: bullish
- Bollinger Bands: upper: 189.45, middle: 185.20, lower: 180.95, squeeze: false, width: 4.25
- Price: current: 186.75, 20sma: 184.30, 50sma: 182.10, 200sma: 178.40
- Volume: current: 45,230,000, avg_10d: 38,500,000, spike: true, ratio: 1.17x
- Support levels: [180.50, 182.10, 184.30]
- Resistance levels: [189.45, 192.80, 195.50]

RECENT PRICE ACTION:
- 5-day trend: upward momentum
- Key events: earnings beat last week
- Pattern: potential ascending triangle
- Breakout target: 195+ area
- Time of analysis: market hours

Provide specific entry, exit, and stop levels with timing guidance.`;

// Test function calling schema (simplified version of current one)
const functionSchema = {
  name: "analyze_technical_timing",
  description: "Analyze technical indicators and provide trading setup",
  parameters: {
    type: "object",
    properties: {
      entry_price: { type: "number", description: "Optimal entry price" },
      primary_exit: { type: "number", description: "Primary profit target price" },
      stop_loss: { type: "number", description: "Stop loss level" },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Setup confidence" },
      setup_type: { 
        type: "string", 
        enum: ["Breakout", "Reversal", "Momentum", "Mean reversion", "Continuation"],
        description: "Type of technical setup" 
      },
      invalidation: { type: "string", description: "Setup invalidation condition" },
      risk_reward_ratio: { type: "number", description: "Risk to reward ratio" }
    },
    required: ["entry_price", "primary_exit", "stop_loss", "confidence", "setup_type", "invalidation", "risk_reward_ratio"]
  }
};

async function testCurrentApproach() {
  console.log('🧪 Testing Current TechnicalTiming Approach...\n');
  
  try {
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: currentSystemPrompt },
        { role: 'user', content: currentUserPrompt }
      ],
      tools: [{
        type: 'function',
        function: functionSchema
      }],
      tool_choice: { type: 'function', function: { name: 'analyze_technical_timing' } },
      temperature: 0.2,
      max_tokens: 1200,
    });

    const responseTime = Date.now() - startTime;
    
    console.log(`✅ Response received in ${responseTime}ms`);
    console.log(`📊 Token usage: ${JSON.stringify(response.usage)}`);
    
    if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const analysis = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
      console.log('\n📈 Analysis Result:');
      console.log(JSON.stringify(analysis, null, 2));
      
      // Check for common issues
      console.log('\n🔍 Quality Check:');
      console.log(`- Entry Price: $${analysis.entry_price} (reasonable: ${analysis.entry_price > 180 && analysis.entry_price < 190})`);
      console.log(`- Risk/Reward: ${analysis.risk_reward_ratio}:1 (good: ${analysis.risk_reward_ratio >= 2})`);
      console.log(`- Confidence: ${(analysis.confidence * 100).toFixed(0)}% (reasonable: ${analysis.confidence >= 0.5 && analysis.confidence <= 0.9})`);
      console.log(`- Setup Type: ${analysis.setup_type}`);
      
    } else {
      console.log('❌ No function call response received');
      console.log('Raw response:', response.choices[0]?.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testSimplifiedApproach() {
  console.log('\n\n🔧 Testing Simplified Approach...\n');
  
  const simplifiedPrompt = `You are an expert technical analyst. Analyze this trading setup and respond with a JSON object.

AAPL Technical Analysis:
- Price: $186.75 (above 20-day SMA $184.30)
- RSI: 65.3 (bullish momentum, not overbought)
- MACD: Bullish crossover (0.125 > 0.089)
- Volume: 45.2M (17% above average)
- Pattern: Ascending triangle, resistance at $189.45

Provide your analysis as JSON:
{
  "recommendation": "BUY/SELL/HOLD",
  "entry_price": 186.75,
  "target_price": 195.00,
  "stop_loss": 182.00,
  "confidence": 0.75,
  "setup_type": "Breakout",
  "reasoning": "Brief explanation",
  "risk_reward": 2.1
}`;

  try {
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: simplifiedPrompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const responseTime = Date.now() - startTime;
    
    console.log(`✅ Response received in ${responseTime}ms`);
    console.log(`📊 Token usage: ${JSON.stringify(response.usage)}`);
    
    const analysis = JSON.parse(response.choices[0].message.content);
    console.log('\n📈 Simplified Analysis Result:');
    console.log(JSON.stringify(analysis, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run both tests
console.log('🚀 Technical Timing Prompt Analysis\n');
console.log('Testing both current complex approach vs simplified approach...\n');

testCurrentApproach()
  .then(() => testSimplifiedApproach())
  .then(() => {
    console.log('\n✅ Test completed. Compare the approaches above.');
    process.exit(0);
  })
  .catch(console.error);
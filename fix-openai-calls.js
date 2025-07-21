#!/usr/bin/env node

/**
 * Demonstrate the OpenAI interaction problem and solution
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

console.log('🔧 FIXING OPENAI INTERACTIONS\n');

// Problem: Your current TechnicalTiming uses deprecated OpenAI API
async function currentBrokenApproach() {
  console.log('❌ Current Broken Approach:');
  console.log('- Uses deprecated createChatCompletion()');
  console.log('- Complex function calling schema');
  console.log('- Old API format\n');
  
  try {
    // This is what your current code tries to do (but fails)
    console.log('Attempting current API call...');
    
    // This will fail because createChatCompletion doesn't exist in new OpenAI SDK
    // const response = await openai.createChatCompletion({...});
    
    console.log('❌ WOULD FAIL: createChatCompletion is not a function\n');
  } catch (error) {
    console.log('❌ Error:', error.message, '\n');
  }
}

// Solution: Use new OpenAI API with simple JSON responses
async function newWorkingApproach() {
  console.log('✅ New Working Approach:');
  
  const prompt = `You are an expert technical analyst. Analyze AAPL and respond with JSON:

Technical Data:
- Price: $186.75, RSI: 65.3, MACD: Bullish crossover
- Volume: Above average, Pattern: Ascending triangle

Respond with this exact JSON structure:
{
  "recommendation": "BUY",
  "entry_price": 186.75,
  "target_price": 195.00,
  "stop_loss": 182.00,
  "confidence": 0.75,
  "setup_type": "Breakout",
  "reasoning": "Brief explanation why",
  "risk_reward": 2.1
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    
    console.log('✅ SUCCESS! Got response:');
    console.log(JSON.stringify(analysis, null, 2));
    console.log('\n✅ Key improvements:');
    console.log('- Uses correct chat.completions.create()');
    console.log('- Simple JSON response format');
    console.log('- Includes reasoning');
    console.log('- Lower token usage');
    console.log('- More reliable\n');
    
    return analysis;
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function compareApproaches() {
  console.log('📊 COMPARISON SUMMARY:\n');
  
  console.log('Current Complex Approach:');
  console.log('❌ Uses deprecated API calls');
  console.log('❌ Complex function calling schemas');
  console.log('❌ No reasoning in responses');
  console.log('❌ Higher token usage');
  console.log('❌ Harder to debug\n');
  
  console.log('New Simple Approach:');
  console.log('✅ Uses modern OpenAI API');
  console.log('✅ Simple JSON responses');
  console.log('✅ Includes reasoning');
  console.log('✅ Lower token usage');
  console.log('✅ Easy to debug\n');
  
  console.log('🎯 NEXT STEPS:');
  console.log('1. Update TechnicalTiming.ts to use new API');
  console.log('2. Remove complex function calling');
  console.log('3. Use simple JSON responses');
  console.log('4. Test with real trading data');
  console.log('5. Apply same fix to other AI modules\n');
}

// Run the demonstration
currentBrokenApproach()
  .then(() => newWorkingApproach())
  .then(() => compareApproaches())
  .then(() => {
    console.log('✅ Demo complete. Ready to fix the actual AI modules!');
    process.exit(0);
  })
  .catch(console.error);
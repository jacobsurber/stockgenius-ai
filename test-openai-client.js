/**
 * OpenAI Client Test Script
 * Comprehensive testing of OpenAI integration in StockGenius
 */

import { openAIClient, aiService, ModelRouter } from './src/config/openai.js';
import env, { envUtils } from './src/config/env.js';
import { loggerUtils } from './src/config/logger.js';

console.log('🧪 Starting OpenAI Client Test Suite...\n');

// Test 1: Environment Variables
console.log('1️⃣ Testing Environment Configuration...');
console.log(`NODE_ENV: ${env.NODE_ENV}`);
console.log(`OPENAI_MODEL: ${env.OPENAI_MODEL}`);
console.log(`OPENAI_MAX_TOKENS: ${env.OPENAI_MAX_TOKENS}`);

const hasOpenAIKey = envUtils.hasValidApiKey('openai');
console.log(`OpenAI API Key Configured: ${hasOpenAIKey}`);

if (env.OPENAI_API_KEY) {
  const keyPrefix = env.OPENAI_API_KEY.substring(0, 7);
  const keyLength = env.OPENAI_API_KEY.length;
  console.log(`API Key Format: ${keyPrefix}... (${keyLength} chars)`);
  
  // Check if key looks valid
  const isValidFormat = env.OPENAI_API_KEY.startsWith('sk-') && keyLength > 20;
  console.log(`API Key Format Valid: ${isValidFormat}`);
} else {
  console.log('❌ No OpenAI API Key found!');
}

console.log('\n');

// Test 2: Client Initialization
console.log('2️⃣ Testing Client Initialization...');
console.log(`OpenAI Client Initialized: ${openAIClient !== null}`);

if (!openAIClient) {
  console.log('❌ OpenAI client is null - initialization failed');
  console.log('This is likely the source of the 0 trade cards issue!');
  process.exit(1);
}

console.log('✅ OpenAI client appears to be initialized');
console.log('\n');

// Test 3: Model Router
console.log('3️⃣ Testing Model Router...');
try {
  const modelRouter = new ModelRouter();
  console.log(`Model Router Initialized: ${modelRouter !== null}`);
  console.log(`Default Model: ${modelRouter.defaultModel}`);
  
  const selectedModel = modelRouter.selectModel('quick_analysis');
  console.log(`Selected Model for Quick Analysis: ${selectedModel}`);
  
  const modelConfig = modelRouter.getModelConfig(selectedModel);
  console.log(`Model Config Retrieved: ${modelConfig !== null}`);
  console.log(`Model Max Tokens: ${modelConfig?.maxTokens}`);
  
  const rateCheck = modelRouter.checkRateLimit(selectedModel);
  console.log(`Rate Limit Check: ${rateCheck.allowed ? 'ALLOWED' : 'BLOCKED - ' + rateCheck.reason}`);
} catch (error) {
  console.log('❌ Model Router Error:', error.message);
}

console.log('\n');

// Test 4: Simple API Call
console.log('4️⃣ Testing Simple API Call...');
try {
  console.log('Making basic chat completion request...');
  
  const startTime = Date.now();
  const response = await openAIClient.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that responds with JSON.'
      },
      {
        role: 'user',
        content: 'Please respond with a simple JSON object containing {"status": "working", "message": "OpenAI client is functional"}'
      }
    ],
    max_tokens: 100,
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });
  
  const duration = Date.now() - startTime;
  
  console.log('✅ API Call Successful!');
  console.log(`Response Time: ${duration}ms`);
  console.log(`Model Used: ${response.model}`);
  console.log(`Input Tokens: ${response.usage?.prompt_tokens || 'unknown'}`);
  console.log(`Output Tokens: ${response.usage?.completion_tokens || 'unknown'}`);
  console.log(`Total Tokens: ${response.usage?.total_tokens || 'unknown'}`);
  
  if (response.choices[0]?.message?.content) {
    const content = response.choices[0].message.content;
    console.log('Response Content:', content);
    
    try {
      const parsed = JSON.parse(content);
      console.log('✅ JSON Parsing Successful:', parsed);
    } catch (parseError) {
      console.log('⚠️  JSON Parsing Failed:', parseError.message);
      console.log('Raw content:', content);
    }
  }
  
} catch (error) {
  console.log('❌ API Call Failed!');
  console.log('Error Type:', error.constructor.name);
  console.log('Error Message:', error.message);
  
  if (error.code) {
    console.log('Error Code:', error.code);
  }
  
  if (error.status) {
    console.log('HTTP Status:', error.status);
  }
  
  if (error.response) {
    console.log('Response Status:', error.response.status);
    console.log('Response Data:', error.response.data);
  }
  
  // Check for common error types
  if (error.message.includes('API key')) {
    console.log('🔑 API Key Issue - Check your OPENAI_API_KEY');
  } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
    console.log('📈 Rate Limit or Quota Issue');
  } else if (error.message.includes('network') || error.message.includes('timeout')) {
    console.log('🌐 Network connectivity issue');
  }
  
  console.log('\nThis error explains why Strategic Fusion is generating 0 trade cards!');
}

console.log('\n');

// Test 5: AIAnalysisService
console.log('5️⃣ Testing AIAnalysisService...');
try {
  console.log('Testing AI Analysis Service initialization...');
  console.log(`AI Service Client: ${aiService.client !== null ? 'Available' : 'Null'}`);
  
  if (aiService.client) {
    console.log('✅ AI Service has valid client');
    
    // Test sentiment analysis (simpler than full stock analysis)
    console.log('Testing sentiment analysis...');
    const sentimentResult = await aiService.analyzeSentiment(
      'Apple reported strong quarterly earnings with revenue beating expectations.',
      'news'
    );
    
    console.log('✅ Sentiment Analysis Successful!');
    console.log('Sentiment Result:', sentimentResult);
  } else {
    console.log('❌ AI Service client is null');
  }
  
} catch (error) {
  console.log('❌ AI Analysis Service Error:', error.message);
}

console.log('\n');

// Test 6: Function Calling (Strategic Fusion style)
console.log('6️⃣ Testing Function Calling (Strategic Fusion Style)...');
try {
  const functionSchema = {
    name: "test_trade_analysis",
    description: "Test function for trade analysis format",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        recommendation: { type: "string", enum: ["buy", "hold", "sell"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reasoning: { type: "string" }
      },
      required: ["symbol", "recommendation", "confidence", "reasoning"]
    }
  };
  
  const response = await openAIClient.chat.completions.create({
    model: 'gpt-4o-mini', // Use cheaper model for testing
    messages: [
      {
        role: 'system',
        content: 'You are a financial analyst. Use the provided function to analyze the given stock.'
      },
      {
        role: 'user',
        content: 'Analyze AAPL stock and provide a recommendation using the test_trade_analysis function.'
      }
    ],
    tools: [{
      type: 'function',
      function: functionSchema
    }],
    tool_choice: { type: 'function', function: { name: 'test_trade_analysis' } },
    temperature: 0.1,
    max_tokens: 500
  });
  
  if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
    const functionArgs = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
    console.log('✅ Function Calling Successful!');
    console.log('Function Response:', functionArgs);
  } else {
    console.log('⚠️  Function calling returned unexpected format');
    console.log('Response:', response.choices[0]?.message);
  }
  
} catch (error) {
  console.log('❌ Function Calling Failed:', error.message);
  
  if (error.message.includes('gpt-4o')) {
    console.log('💡 Trying with gpt-3.5-turbo instead...');
    
    try {
      const fallbackResponse = await openAIClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: 'Analyze AAPL stock and respond with JSON: {"symbol": "AAPL", "recommendation": "buy/hold/sell", "confidence": 0.8, "reasoning": "brief explanation"}'
          }
        ],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
      
      const content = fallbackResponse.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        console.log('✅ Fallback JSON Mode Successful:', parsed);
      }
    } catch (fallbackError) {
      console.log('❌ Even fallback failed:', fallbackError.message);
    }
  }
}

console.log('\n');

// Test 7: Rate Limiting and Usage Tracking
console.log('7️⃣ Testing Rate Limiting...');
try {
  const modelRouter = new ModelRouter();
  
  console.log('Current usage stats:', modelRouter.usageTracking.size);
  
  // Test multiple rapid requests to see rate limiting
  const rapidTests = [];
  for (let i = 0; i < 3; i++) {
    rapidTests.push(
      openAIClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: `Test message ${i + 1}` }],
        max_tokens: 10
      })
    );
  }
  
  const results = await Promise.allSettled(rapidTests);
  const successful = results.filter(r => r.status === 'fulfilled').length;
  console.log(`✅ ${successful}/3 rapid requests succeeded`);
  
} catch (error) {
  console.log('❌ Rate limiting test failed:', error.message);
}

console.log('\n');

// Test 8: Model Availability
console.log('8️⃣ Testing Model Availability...');
const modelsToTest = ['gpt-3.5-turbo', 'gpt-4o-mini', 'gpt-4-turbo-preview', 'gpt-4o'];

for (const model of modelsToTest) {
  try {
    console.log(`Testing ${model}...`);
    const response = await openAIClient.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 5
    });
    console.log(`✅ ${model}: Available`);
  } catch (error) {
    console.log(`❌ ${model}: ${error.message}`);
  }
}

console.log('\n');

// Summary
console.log('📊 TEST SUMMARY');
console.log('================');

if (openAIClient) {
  console.log('✅ OpenAI client is initialized');
} else {
  console.log('❌ OpenAI client failed to initialize - THIS IS THE MAIN ISSUE!');
}

if (hasOpenAIKey) {
  console.log('✅ API key is configured');
} else {
  console.log('❌ API key is missing or invalid');
}

console.log('\n🔍 DIAGNOSTIC RECOMMENDATIONS:');

if (!openAIClient) {
  console.log('1. Check if the OpenAI API key is valid and has sufficient credits');
  console.log('2. Verify network connectivity to OpenAI servers');
  console.log('3. Check if the key has the necessary permissions');
}

if (!hasOpenAIKey) {
  console.log('1. Set OPENAI_API_KEY in your .env file');
  console.log('2. Ensure the key starts with "sk-" and is the correct length');
  console.log('3. Verify the key is not a placeholder value');
}

console.log('\n💡 If Strategic Fusion is generating 0 trade cards with 0 tokens:');
console.log('- The OpenAI client is likely failing to initialize');
console.log('- All AI calls are being rejected before reaching the API');
console.log('- Check the logs for initialization errors');

console.log('\n🏁 Test completed!');
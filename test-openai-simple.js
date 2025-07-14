/**
 * Simple OpenAI API Key Test
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

async function testOpenAIKey() {
  console.log('🔑 Testing OpenAI API Key...\n');
  
  // Check if key is configured
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    console.log('❌ No OpenAI API key configured');
    return;
  }
  
  console.log(`✅ API Key configured: ${apiKey.substring(0, 20)}...`);
  
  // Test connection
  try {
    const client = new OpenAI({
      apiKey: apiKey,
      timeout: 30000,
    });
    
    console.log('🔄 Testing connection with simple request...');
    
    const response = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Reply with just: "Connection successful"'
        }
      ],
      max_tokens: 10,
      temperature: 0
    });
    
    const reply = response.choices[0]?.message?.content;
    console.log(`✅ OpenAI Response: "${reply}"`);
    console.log(`📊 Tokens used: ${response.usage?.total_tokens}`);
    console.log(`💰 Model: ${response.model}`);
    
    console.log('\n🎉 OpenAI API Key is working correctly!');
    
  } catch (error) {
    console.log(`❌ OpenAI API Error: ${error.message}`);
    
    if (error.status === 401) {
      console.log('\n🔧 Fix: Check your API key at https://platform.openai.com/account/api-keys');
      console.log('   Make sure the key starts with "sk-" and is active');
    } else if (error.status === 429) {
      console.log('\n🔧 Fix: Rate limit exceeded - wait a moment and try again');
    } else if (error.status === 402) {
      console.log('\n🔧 Fix: Billing issue - check your OpenAI account billing');
    }
  }
}

testOpenAIKey();
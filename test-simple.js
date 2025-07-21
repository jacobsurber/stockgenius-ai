#!/usr/bin/env node

// Simple test to check if OpenAI is working
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

console.log('🧪 Testing OpenAI integration...');

async function testOpenAI() {
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        console.log('📡 Making OpenAI API call...');
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: 'Generate a simple JSON response with {test: "success", timestamp: "current time"}. Only return valid JSON.'
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        console.log('✅ OpenAI Response:', response.choices[0].message.content);
        
        // Test database write
        console.log('💾 Testing database...');
        console.log('Database file exists:', require('fs').existsSync('./data/trade_cards.db'));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code === 'invalid_api_key') {
            console.error('🔑 OpenAI API key is invalid or missing');
        }
    }
}

testOpenAI();
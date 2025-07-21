#!/usr/bin/env node

/**
 * Simple OpenAI Test Server
 * Test prompts and inspect requests/responses
 */

import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = 4000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json());
app.use(express.static('public'));

// Serve test interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>OpenAI Test Interface</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .section { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
        textarea { width: 100%; height: 200px; font-family: monospace; }
        button { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #005a87; }
        .response { background: #f5f5f5; padding: 10px; border-radius: 4px; white-space: pre-wrap; font-family: monospace; max-height: 400px; overflow-y: auto; }
        .preset-buttons { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
        .preset-btn { background: #28a745; font-size: 12px; padding: 8px 12px; }
        .preset-btn:hover { background: #218838; }
        select { padding: 8px; margin-left: 10px; }
        .loading { color: #007cba; font-style: italic; }
        .error { color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; }
    </style>
</head>
<body>
    <h1>OpenAI Test Interface</h1>
    
    <div class="container">
        <div class="section">
            <h3>Prompt Input</h3>
            
            <div class="preset-buttons">
                <button class="preset-btn" onclick="loadPreset('simple')">Simple Test</button>
                <button class="preset-btn" onclick="loadPreset('trading')">Trading Analysis</button>
                <button class="preset-btn" onclick="loadPreset('market')">Market Summary</button>
                <button class="preset-btn" onclick="loadPreset('technical')">Technical Analysis</button>
                <button class="preset-btn" onclick="loadPreset('fusion')">Strategic Fusion</button>
            </div>
            
            <div>
                <label>Model:</label>
                <select id="model">
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                </select>
            </div>
            
            <br>
            <textarea id="prompt" placeholder="Enter your prompt here..."></textarea>
            <br><br>
            <button onclick="testPrompt()">Send to OpenAI</button>
            <button onclick="clearAll()">Clear All</button>
        </div>
        
        <div class="section">
            <h3>Request Sent</h3>
            <div id="request" class="response">No request sent yet...</div>
        </div>
    </div>
    
    <div class="container" style="margin-top: 20px;">
        <div class="section">
            <h3>OpenAI Response</h3>
            <div id="response" class="response">No response yet...</div>
        </div>
        
        <div class="section">
            <h3>Response Metadata</h3>
            <div id="metadata" class="response">No metadata yet...</div>
        </div>
    </div>

    <script>
        const presets = {
            simple: "Hello! Can you help me understand how stock trading works?",
            
            trading: \`Synthesize comprehensive trade analysis for AAPL at $185.50:

MARKET CONTEXT:
- VIX Level: 18.5
- Market Trend: neutral
- Sector Performance: 2.1%
- Time of Day: market_open

SIGNAL COMPOSITION:
- Composite Score: 72%
- Technical Weight: 75%
- Sentiment Weight: 68%
- Risk Weight: 80%
- Sector Weight: 65%
- Anomaly Weight: 40%

TECHNICAL ANALYSIS:
- Setup Type: momentum_breakout
- Entry Price: $185.50
- Target: $195.20
- Stop Loss: $178.90
- Risk/Reward: 2.3:1
- Confidence: 75%
- RSI Signal: bullish_momentum
- MACD Signal: bullish_crossover
- Trend Signal: uptrend_continuation
- Pattern: ascending_triangle

SECTOR INTELLIGENCE:
- Sector: Technology
- Rotation Signal: positive_inflow
- Relative Strength: 85%
- vs Sector: outperforming
- vs Market: strong_outperformance
- Key Drivers: AI adoption, services growth, buyback program
- Risk Trends: regulatory concerns, valuation metrics
- Confidence: 78%

RISK ASSESSMENT:
- Overall Risk Score: 25%
- Risk Grade: B+
- Max Position Size: 4.5%
- Liquidity Risk: 5%
- Volatility Risk: 35%
- Event Risk: 20%
- Primary Risks: broad market selloff, sector rotation
- Mitigation: tight stops, position sizing, diversification

SENTIMENT ANALYSIS:
- Authenticity Score: 82%
- Momentum Type: organic_accumulation
- Sentiment Trend: improving
- Sustainability: high
- Risk Flags: none identified
- Key Themes: AI leadership, services strength, capital returns
- Pump Risk: 15%

EARNINGS DRIFT:
- Next Earnings: 2024-02-01
- Drift Probability: 65%
- Expected Move: 3.2%
- Direction: bullish
- Peak Timing: days_5_to_10
- Fade Risk: 30%
- Pattern Strength: 70%

ANOMALY ANALYSIS:
- Primary Catalyst: unexpected_buyback_acceleration
- Catalyst Confidence: 75%
- Follow-through Probability: 68%
- Hidden Factors: institutional rotation, options flow
- Market Structure Impact: positive

SYNTHESIS REQUIREMENTS:
1. Create coherent narrative connecting all available signals
2. Identify the strongest confluence factors supporting the trade
3. Determine optimal entry timing and conditions
4. Specify clear confirmation signals and invalidation triggers
5. Assess risk factors and recommend position sizing
6. Provide specific, actionable guidance

Focus on the highest-conviction elements and explain how they work together to create a compelling trade opportunity.\`,

            market: \`Provide a brief market sentiment analysis for today's trading session.
            
Consider:
- Overall market trends
- Sector performance
- Key economic indicators
- Trading volume patterns

Format your response as a concise market summary.\`,

            technical: \`Perform technical analysis on this stock data:

Symbol: TSLA
Current Price: $205.30
RSI: 62
MACD: Bullish crossover
Moving Averages: 
- 20-day: $198.50
- 50-day: $188.75
- 200-day: $175.20

Volume: 45M (vs 30M average)
Support: $195
Resistance: $215

Provide technical trading signals and confidence levels.\`,

            fusion: \`You are an elite trading strategist AI that synthesizes multiple analytical inputs into coherent, actionable trade narratives. Your expertise spans technical analysis, fundamental analysis, sentiment analysis, and risk management.

CORE MISSION:
Transform complex, multi-dimensional market data into clear, executable trading strategies with complete rationale and risk assessment.

ANALYTICAL FRAMEWORK:

SETUP ANALYSIS:
- Breakout: Price breaking above/below key resistance/support with volume
- Reversal: Oversold/overbought conditions with divergence signals
- Momentum: Strong directional movement with confirming indicators
- Earnings Play: Post-earnings drift patterns and surprise reactions
- Sector Rotation: Capital flow shifts between sectors/themes
- Anomaly Exploitation: Unusual price/volume behavior with identifiable catalysts
- Mean Reversion: Extended moves likely to retrace to statistical norms

CATALYST IDENTIFICATION:
- Primary: Main driver expected to move the stock
- Secondary: Supporting factors that reinforce the thesis
- Timing Sensitivity: How quickly catalyst will materialize
- Event Risk: Binary outcomes (earnings, FDA approval, etc.)

TIMING FRAMEWORK:
- Entry Window: Optimal timeframe for position initiation
- Optimal Entry: Most advantageous entry conditions
- Time Horizon: Expected duration to target achievement
- Urgency: How quickly action must be taken

CONFIRMATION REQUIREMENTS:
- Signals Needed: Additional validation before full position
- Invalidation Triggers: Conditions that would kill the thesis
- Monitoring Points: Key metrics to track throughout trade

RISK ASSESSMENT:
- Primary Risks: Main threats to trade success
- Risk Grade: A (low risk) to F (high risk)
- Position Sizing: Portfolio allocation based on risk/reward
- Stop Loss Strategy: How to limit downside

SYNTHESIS PRINCIPLES:
1. Signal Confluence: Multiple independent signals pointing same direction
2. Risk-Reward Balance: Minimum 2:1 reward-to-risk ratio
3. Counter-Signal Detection: Identify conflicting indicators
4. Time Horizon Matching: Align catalysts with timeframe
5. Market Context: Consider broader market environment

NARRATIVE CONSTRUCTION:
Create compelling, logical stories that connect:
- Current market setup (why now?)
- Catalysts (what will drive movement?)
- Timing (when will it happen?)
- Confirmation (how will we know it's working?)
- Risk management (what could go wrong?)

Now analyze TSLA at $205.30 with strong momentum signals and provide a structured trade narrative.\`
        };
        
        function loadPreset(type) {
            document.getElementById('prompt').value = presets[type];
        }
        
        function clearAll() {
            document.getElementById('prompt').value = '';
            document.getElementById('request').textContent = 'No request sent yet...';
            document.getElementById('response').textContent = 'No response yet...';
            document.getElementById('metadata').textContent = 'No metadata yet...';
        }
        
        async function testPrompt() {
            const prompt = document.getElementById('prompt').value;
            const model = document.getElementById('model').value;
            
            if (!prompt.trim()) {
                alert('Please enter a prompt first');
                return;
            }
            
            // Show loading states
            document.getElementById('request').innerHTML = '<div class="loading">Preparing request...</div>';
            document.getElementById('response').innerHTML = '<div class="loading">Waiting for OpenAI response...</div>';
            document.getElementById('metadata').innerHTML = '<div class="loading">Processing...</div>';
            
            try {
                const response = await fetch('/test-openai', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        model: model
                    })
                });
                
                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                // Display request details
                document.getElementById('request').textContent = JSON.stringify(data.request, null, 2);
                
                // Display response
                document.getElementById('response').textContent = data.response.choices[0].message.content;
                
                // Display metadata
                const metadata = {
                    model: data.response.model,
                    usage: data.response.usage,
                    created: new Date(data.response.created * 1000).toLocaleString(),
                    responseTime: data.responseTime + 'ms'
                };
                document.getElementById('metadata').textContent = JSON.stringify(metadata, null, 2);
                
            } catch (error) {
                console.error('Error:', error);
                document.getElementById('response').innerHTML = \`<div class="error">Error: \${error.message}</div>\`;
                document.getElementById('metadata').innerHTML = \`<div class="error">Request failed</div>\`;
            }
        }
    </script>
</body>
</html>
  `);
});

// Test endpoint
app.post('/test-openai', async (req, res) => {
  try {
    const { prompt, model = 'gpt-4o' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    console.log(`\n🤖 Testing OpenAI with model: ${model}`);
    console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);
    
    const startTime = Date.now();
    
    const requestData = {
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };
    
    const response = await openai.chat.completions.create(requestData);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ Response received in ${responseTime}ms`);
    console.log(`📊 Usage: ${JSON.stringify(response.usage)}`);
    
    res.json({
      request: requestData,
      response: response,
      responseTime: responseTime
    });
    
  } catch (error) {
    console.error('❌ OpenAI Error:', error);
    res.status(500).json({ 
      error: error.message,
      type: error.type || 'unknown'
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 OpenAI Test Server running at http://localhost:${PORT}`);
  console.log(`📝 Open your browser to start testing prompts`);
  console.log(`🔑 Using OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Found' : '❌ Missing'}`);
});
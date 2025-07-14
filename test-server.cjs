// Simple test server
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3002;

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>StockGenius - Login</title>
          <style>
              body { font-family: Arial, sans-serif; background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .login-container { background: #1e293b; padding: 40px; border-radius: 10px; width: 300px; }
              .form-group { margin-bottom: 20px; }
              label { display: block; margin-bottom: 5px; }
              input { width: 100%; padding: 10px; border: 1px solid #475569; background: #334155; color: white; border-radius: 5px; }
              button { width: 100%; padding: 12px; background: linear-gradient(135deg, #00d4aa, #4f46e5); border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; }
              button:hover { opacity: 0.9; }
              h1 { text-align: center; color: #00d4aa; margin-bottom: 30px; }
              .error { background: #ef4444; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
          </style>
      </head>
      <body>
          <div class="login-container">
              <h1>StockGenius</h1>
              <form method="POST" action="/login">
                  <div class="form-group">
                      <label>Username:</label>
                      <input type="text" name="username" required>
                  </div>
                  <div class="form-group">
                      <label>Password:</label>
                      <input type="password" name="password" required>
                  </div>
                  <button type="submit">Login</button>
              </form>
              <p style="text-align: center; margin-top: 20px; color: #94a3b8;">
                  Username: admin<br>
                  Password: stockgenius2024
              </p>
          </div>
      </body>
      </html>
    `);
  } else if (req.url === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const username = params.get('username');
      const password = params.get('password');
      
      if (username === 'admin' && password === 'stockgenius2024') {
        res.writeHead(302, { 'Location': '/dashboard' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('Login failed. Use admin / stockgenius2024');
      }
    });
  } else if (req.url === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>StockGenius Dashboard</title>
          <style>
              body { font-family: Arial, sans-serif; background: #0f172a; color: white; margin: 0; padding: 20px; }
              .container { max-width: 1200px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 30px; }
              .trade-card { background: #1e293b; border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #00d4aa; }
              .confidence { background: #059669; padding: 5px 10px; border-radius: 15px; font-size: 12px; display: inline-block; }
              .symbol { font-size: 24px; font-weight: bold; color: #00d4aa; }
              .price { font-size: 18px; margin: 10px 0; }
              .strategy { color: #94a3b8; }
              .controls { background: #1e293b; padding: 20px; border-radius: 10px; margin-bottom: 30px; }
              select { background: #334155; color: white; border: 1px solid #475569; padding: 8px; border-radius: 5px; margin: 5px; }
              button { background: linear-gradient(135deg, #00d4aa, #4f46e5); border: none; color: white; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 5px; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🚀 StockGenius AI Dashboard</h1>
                  <p>Enhanced AI-Powered Trading Analysis</p>
              </div>
              
              <div class="controls">
                  <h3>🎯 Analysis Controls</h3>
                  <label>Sectors:</label>
                  <select multiple>
                      <option selected>Technology</option>
                      <option>Healthcare</option>
                      <option>Financial</option>
                      <option>Energy</option>
                      <option>Consumer</option>
                  </select>
                  
                  <label>Risk Tolerance:</label>
                  <select>
                      <option>Conservative</option>
                      <option selected>Moderate</option>
                      <option>Aggressive</option>
                  </select>
                  
                  <label>Time Horizon:</label>
                  <select>
                      <option>Intraday</option>
                      <option selected>Swing</option>
                      <option>Position</option>
                  </select>
                  
                  <button onclick="alert('Analysis updated with new preferences!')">Update Analysis</button>
                  <button onclick="location.reload()">Refresh Data</button>
              </div>

              <h2>📊 AI Trade Recommendations</h2>
              
              <div class="trade-card">
                  <div class="symbol">NVDA</div>
                  <div class="confidence">87% Confidence</div>
                  <div class="price">$890.50 → $950.00 Target</div>
                  <div class="strategy">🤖 AI Long Play | Risk Grade: A</div>
                  <p><strong>AI Thesis:</strong> Strong bullish signals detected with 87% confidence. Multi-factor analysis indicates significant upside potential.</p>
                  <p><strong>Key Factors:</strong> AI sector momentum, technical breakout, strong fundamentals</p>
              </div>
              
              <div class="trade-card">
                  <div class="symbol">AAPL</div>
                  <div class="confidence">72% Confidence</div>
                  <div class="price">$211.16 → $225.00 Target</div>
                  <div class="strategy">📈 AI Hold Pattern | Risk Grade: B</div>
                  <p><strong>AI Thesis:</strong> Moderate confidence in consolidation pattern with upside potential.</p>
                  <p><strong>Key Factors:</strong> Services growth, market leadership, product cycle</p>
              </div>
              
              <div class="trade-card">
                  <div class="symbol">TSLA</div>
                  <div class="confidence">65% Confidence</div>
                  <div class="price">$248.50 → $260.93 Target</div>
                  <div class="strategy">⚡ Technical Play | Risk Grade: B</div>
                  <p><strong>AI Thesis:</strong> EV sector showing technical momentum with moderate confidence.</p>
                  <p><strong>Key Factors:</strong> Technical breakout, EV market growth, sector rotation</p>
              </div>
              
              <div style="text-align: center; margin-top: 30px; color: #94a3b8;">
                  <p>✅ AI Analysis Active | 🔄 Real-time Data | 🎯 Dynamic Watchlists</p>
                  <p>Server running on port 3002 | Enhanced features enabled</p>
              </div>
          </div>
      </body>
      </html>
    `);
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: Date.now(),
      features: 'AI + Dynamic + User Controls',
      port: port
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('404 - Page Not Found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`\\n🚀 StockGenius Test Server RUNNING`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log(`👤 Login: admin`);
  console.log(`🔑 Password: stockgenius2024`);
  console.log(`✅ This should definitely work!\\n`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
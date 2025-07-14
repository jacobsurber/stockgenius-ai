/**
 * Simple StockGenius Web Interface
 * Basic Express server for demonstration
 */

import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.WEB_PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'stockgenius-demo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session?.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Routes
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUsername = process.env.WEB_USERNAME || 'admin';
  const validPassword = process.env.WEB_PASSWORD || 'stockgenius2024';
  
  if (username === validUsername && password === validPassword) {
    req.session.authenticated = true;
    res.redirect('/dashboard');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Protected routes
app.get('/', requireAuth, (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard', requireAuth, (req, res) => {
  // Mock data for demo
  const tradeCards = {
    json: {
      timestamp: Date.now(),
      summary: {
        totalCards: 3,
        highConfidenceCards: 1,
        averageConfidence: 78,
        categories: {
          high_conviction: 1,
          momentum: 1,
          sentiment_play: 1,
          earnings: 0,
          wildcard: 0
        }
      },
      cards: [
        {
          id: 'card_1',
          category: 'high_conviction',
          symbol: 'NVDA',
          confidence: 87,
          strategyType: 'AI Momentum Play',
          entry: { price: 890.50, timing: 'Market open' },
          exits: {
            primary: { price: 925.00, reasoning: 'Technical resistance target' },
            stop: { price: 865.00, reasoning: 'Support level break' }
          },
          whyThisTrade: {
            mainThesis: 'AI sector momentum continues with strong technical setup and institutional flow',
            keyPoints: [
              'GPU demand exceeding supply forecasts', 
              'Multiple analyst upgrades this week',
              'Breaking above key resistance with volume'
            ],
            catalysts: ['AI conference presentations', 'Q4 earnings guidance raise expected']
          }
        },
        {
          id: 'card_2',
          category: 'momentum',
          symbol: 'TSLA',
          confidence: 72,
          strategyType: 'Breakout Play',
          entry: { price: 238.80, timing: 'Above $240' },
          exits: {
            primary: { price: 255.00, reasoning: 'Next resistance level' },
            stop: { price: 230.00, reasoning: 'Failed breakout' }
          },
          whyThisTrade: {
            mainThesis: 'Technical breakout from consolidation with improving sentiment',
            keyPoints: [
              'Volume surge on breakout',
              'Options flow turning bullish',
              'Oversold bounce potential'
            ],
            catalysts: ['Delivery numbers due', 'Autonomous driving updates']
          }
        },
        {
          id: 'card_3',
          category: 'sentiment_play',
          symbol: 'AAPL',
          confidence: 65,
          strategyType: 'Mean Reversion',
          entry: { price: 189.20, timing: 'On dip' },
          exits: {
            primary: { price: 195.00, reasoning: '20-day moving average' },
            stop: { price: 185.00, reasoning: 'Support failure' }
          },
          whyThisTrade: {
            mainThesis: 'Oversold condition in quality name with strong fundamentals',
            keyPoints: [
              'RSI showing oversold',
              'Strong iPhone sales data',
              'Services growth continuing'
            ],
            catalysts: ['China sales recovery', 'Vision Pro updates']
          }
        }
      ]
    }
  };

  const performanceMetrics = {
    winRate: 68.5,
    averageReturn: 4.2,
    totalTrades: 147,
    accuracy: 72.1,
    sharpeRatio: 1.85
  };

  const pipelineStatus = {
    id: 'demo_execution',
    success: true,
    phase: 'completed',
    metrics: {
      symbolsProcessed: 15,
      processingTimeMs: 45000,
      tradesGenerated: 3,
      errorsCount: 0
    }
  };

  res.render('dashboard', {
    tradeCards,
    performanceMetrics,
    pipelineStatus,
    timestamp: Date.now(),
    currentPath: '/dashboard',
  });
});

app.get('/performance', requireAuth, (req, res) => {
  const performanceData = {
    overview: {
      winRate: 68.5,
      averageReturn: 4.2,
      totalTrades: 147,
      accuracy: 72.1,
      sharpeRatio: 1.85
    },
    modulePerformance: [
      { module: 'sector', accuracy: 74.2, confidence: 81.3 },
      { module: 'technical', accuracy: 69.8, confidence: 77.5 },
      { module: 'sentiment', accuracy: 71.4, confidence: 73.2 },
      { module: 'risk', accuracy: 76.1, confidence: 79.8 },
      { module: 'fusion', accuracy: 72.5, confidence: 85.2 }
    ],
    recentTrades: []
  };

  res.render('performance', { performanceData, currentPath: '/performance' });
});

app.get('/analysis', requireAuth, (req, res) => {
  const pipelineStatus = {
    id: 'demo_execution',
    success: true,
    phase: 'completed',
    metrics: {
      symbolsProcessed: 15,
      processingTimeMs: 45000,
      tradesGenerated: 3,
      errorsCount: 0
    }
  };

  res.render('analysis', { pipelineStatus, currentPath: '/analysis' });
});

// API endpoints with mock data
app.get('/api/trade-cards', requireAuth, (req, res) => {
  res.json({
    json: {
      summary: { totalCards: 3, highConfidenceCards: 1, averageConfidence: 78 },
      cards: []
    }
  });
});

app.get('/api/trade-cards/:id/details', requireAuth, (req, res) => {
  res.json({
    id: req.params.id,
    aiReasoning: {
      sector: 'Technology sector showing strong momentum with AI driving growth',
      technical: 'Breakout above resistance with volume confirmation and bullish indicators',
      risk: 'Low risk due to strong fundamentals and favorable market conditions',
      fusion: 'All signals aligned for bullish outcome with high probability of success'
    },
    confidence: 87,
    signalStrength: {
      technical: 92,
      sentiment: 78,
      risk: 85,
      sector: 88
    }
  });
});

app.post('/api/analysis/trigger', requireAuth, (req, res) => {
  // Simulate analysis trigger
  setTimeout(() => {
    console.log('Mock analysis completed');
  }, 5000);

  res.json({ 
    message: 'Analysis started',
    executionId: `mock_${Date.now()}`,
    status: 'running'
  });
});

app.get('/api/analysis/status', requireAuth, (req, res) => {
  res.json({
    isRunning: false,
    currentExecution: {
      id: 'demo_execution',
      phase: 'completed',
      success: true,
      metrics: {
        symbolsProcessed: 15,
        processingTimeMs: 45000,
        tradesGenerated: 3,
        errorsCount: 0
      }
    }
  });
});

app.get('/api/performance/metrics', requireAuth, (req, res) => {
  res.json({
    daily: { return: 2.1, trades: 3 },
    weekly: { return: 8.7, trades: 12 },
    monthly: { return: 24.3, trades: 47 }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Web server error:', err);
  res.status(500).render('error', { message: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// Start server
app.listen(port, '0.0.0.0', (err) => {
  if (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
  console.log(`🚀 StockGenius Web Interface running at http://localhost:${port}`);
  console.log(`📊 Login with: admin / stockgenius2024`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Views directory: ${path.join(__dirname, 'views')}`);
  console.log(`📂 Static files: ${path.join(__dirname, 'public')}`);
});

// Handle server errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
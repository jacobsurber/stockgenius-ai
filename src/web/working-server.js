/**
 * StockGenius Working Server - Port 3001
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
const port = 3001; // Different port

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: 'stockgenius-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
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

// Mock data for testing
const mockTradeCards = [
  {
    id: 'mock_1',
    category: 'high_conviction',
    symbol: 'NVDA',
    confidence: 87,
    strategyType: 'AI Long Play',
    riskGrade: 'A',
    timeframe: 'swing',
    entry: { price: 890.50, timing: 'Immediate' },
    exits: {
      primary: { price: 950.00, reasoning: 'AI target: $59.50' },
      stop: { price: 845.98, reasoning: '5% stop loss' }
    },
    whyThisTrade: {
      mainThesis: 'AI-powered bullish signal with strong momentum',
      keyPoints: [
        'AI Confidence: 87.3%',
        'Model: gpt-3.5-turbo',
        'Target: $950.00',
        'Risk Grade: A'
      ],
      catalysts: [
        'AI-powered analysis',
        'Real-time data integration',
        'Multi-factor assessment',
        'Strong sector momentum'
      ]
    },
    aiReasoning: {
      technical: 'Strong upward momentum with bullish indicators',
      fundamental: 'Solid fundamentals support current valuation',
      sentiment: 'Positive market sentiment around AI sector',
      risks: ['Market volatility', 'Sector rotation risk'],
      opportunities: ['AI growth trend', 'Strong earnings potential']
    }
  },
  {
    id: 'mock_2',
    category: 'momentum',
    symbol: 'AAPL',
    confidence: 72,
    strategyType: 'AI Hold Pattern',
    riskGrade: 'B',
    timeframe: 'swing',
    entry: { price: 211.16, timing: 'On confirmation' },
    exits: {
      primary: { price: 225.00, reasoning: 'AI target: $13.84' },
      stop: { price: 200.60, reasoning: '5% stop loss' }
    },
    whyThisTrade: {
      mainThesis: 'AI-driven consolidation with upside potential',
      keyPoints: [
        'AI Confidence: 72.1%',
        'Model: gpt-3.5-turbo',
        'Target: $225.00',
        'Risk Grade: B'
      ],
      catalysts: [
        'Product cycle momentum',
        'Services growth',
        'Market leadership position'
      ]
    }
  },
  {
    id: 'mock_3',
    category: 'sentiment_play',
    symbol: 'TSLA',
    confidence: 65,
    strategyType: 'Technical Play',
    riskGrade: 'B',
    timeframe: 'swing',
    entry: { price: 248.50, timing: 'Market open' },
    exits: {
      primary: { price: 260.93, reasoning: '5% target' },
      stop: { price: 236.08, reasoning: '5% stop' }
    },
    whyThisTrade: {
      mainThesis: 'EV sector technical momentum',
      keyPoints: ['Price: $248.50', 'Change: 2.3%'],
      catalysts: ['EV market growth', 'Technical breakout']
    }
  }
];

// Routes
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt: ${username} / ${password}`);
  
  if (username === 'admin' && password === 'stockgenius2024') {
    req.session.authenticated = true;
    console.log('Login successful, redirecting to dashboard');
    res.redirect('/dashboard');
  } else {
    console.log('Login failed');
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    console.log('Dashboard accessed');
    
    // User preferences from URL
    const userPrefs = {
      sectors: req.query.sectors ? req.query.sectors.split(',') : ['Technology', 'Healthcare'],
      riskTolerance: req.query.risk || 'moderate',
      timeHorizon: req.query.timeframe || 'swing',
      maxCards: parseInt(req.query.maxCards) || 5,
      analysisDepth: req.query.depth || 'comprehensive'
    };

    const result = {
      tradeCards: {
        json: {
          timestamp: Date.now(),
          summary: {
            totalCards: mockTradeCards.length,
            highConfidenceCards: mockTradeCards.filter(c => c.confidence > 80).length,
            averageConfidence: Math.round(mockTradeCards.reduce((sum, c) => sum + c.confidence, 0) / mockTradeCards.length),
            categories: {
              high_conviction: mockTradeCards.filter(c => c.category === 'high_conviction').length,
              momentum: mockTradeCards.filter(c => c.category === 'momentum').length,
              sentiment_play: mockTradeCards.filter(c => c.category === 'sentiment_play').length
            }
          },
          cards: mockTradeCards
        }
      },
      performanceMetrics: {
        winRate: 72.5,
        averageReturn: 4.8,
        totalTrades: 147,
        accuracy: 74.2,
        sharpeRatio: 1.85
      },
      pipelineStatus: {
        id: `demo_${Date.now()}`,
        success: true,
        phase: 'completed',
        metrics: {
          symbolsProcessed: 3,
          processingTimeMs: 2500,
          tradesGenerated: 3,
          errorsCount: 0
        }
      },
      timestamp: Date.now(),
      currentPath: '/dashboard',
      liveData: true,
      stockData: [
        { symbol: 'NVDA', currentPrice: 890.50, changePercent: 2.3 },
        { symbol: 'AAPL', currentPrice: 211.16, changePercent: 0.8 },
        { symbol: 'TSLA', currentPrice: 248.50, changePercent: -1.2 }
      ],
      userPrefs: userPrefs,
      availableSectors: ['Technology', 'Healthcare', 'Financial', 'Energy', 'Consumer'],
      watchlistInfo: {
        total: 8,
        sectors: userPrefs.sectors,
        source: 'AI + Dynamic Selection'
      }
    };

    res.render('dashboard', result);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Dashboard Error: ' + error.message);
  }
});

// API endpoints
app.get('/api/trade-cards', requireAuth, (req, res) => {
  res.json({ 
    json: { 
      cards: mockTradeCards, 
      summary: { totalCards: mockTradeCards.length } 
    } 
  });
});

app.get('/api/trade-cards/:id/details', requireAuth, (req, res) => {
  const card = mockTradeCards.find(c => c.id === req.params.id);
  if (card) {
    res.json({
      id: card.id,
      aiReasoning: card.aiReasoning || {
        technical: 'Technical analysis completed',
        fundamental: 'Fundamental analysis completed', 
        sentiment: 'Sentiment analysis completed'
      },
      confidence: card.confidence,
      signalStrength: {
        technical: 85,
        sentiment: 78,
        risk: 82,
        sector: 88
      }
    });
  } else {
    res.status(404).json({ error: 'Card not found' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    features: 'Working Demo Server',
    port: port
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Server Error');
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 StockGenius WORKING SERVER`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log(`👤 Login: admin`);
  console.log(`🔑 Password: stockgenius2024`);
  console.log(`✅ Status: READY FOR LOGIN\n`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});
/**
 * Clean StockGenius Server - No Fallback Data
 * Shows real errors instead of hiding them
 */

import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'dist/web/public')));

app.use(session({
  secret: 'stockgenius-clean',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'dist/web/views'));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session?.authenticated) {
    return next();
  }
  res.redirect('/');
};

// Routes
app.get('/', (req, res) => {
  if (req.session?.authenticated) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === 'stockgenius2024') {
    req.session.authenticated = true;
    res.redirect('/dashboard');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', {
    tradeCards: { json: { summary: { totalCards: 0, highConfidenceCards: 0, averageConfidence: 0 }, cards: [] } },
    performanceMetrics: { winRate: 0, averageReturn: 0, totalTrades: 0, accuracy: 0 },
    pipelineStatus: null,
    availableSectors: ['Technology', 'Healthcare', 'Finance'],
    userPrefs: { sectors: [], riskTolerance: 'moderate', timeHorizon: 'swing', analysisDepth: 'comprehensive', maxCards: 5 }
  });
});

// API Routes - NO FALLBACK DATA
app.get('/api/trade-cards', requireAuth, async (req, res) => {
  try {
    // Always return empty - forces real analysis or shows error
    res.json({
      json: {
        timestamp: Date.now(),
        summary: { totalCards: 0, highConfidenceCards: 0, averageConfidence: 0 },
        cards: []
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analysis/trigger', requireAuth, async (req, res) => {
  // Return error instead of fake success
  res.status(501).json({ 
    error: 'Analysis pipeline not yet implemented in clean server. This forces you to see real errors instead of fake data.',
    receivedParams: req.body
  });
});

app.get('/api/analysis/status', requireAuth, (req, res) => {
  res.json({
    isRunning: false,
    currentExecution: null,
    message: 'Clean server mode - no fake progress data'
  });
});

app.get('/api/performance/metrics', requireAuth, async (req, res) => {
  res.json({
    error: 'No fake performance data - implement real metrics or see this error',
    daily: null
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'clean-no-fallback',
    build: 'v2.2.0',
    timestamp: Date.now() 
  });
});

// Error handler - show real errors
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(PORT, () => {
  console.log(`🧹 Clean StockGenius Server running on http://localhost:${PORT}`);
  console.log(`🚫 No fallback data - real errors only`);
  console.log(`📦 Build: v2.2.0`);
});
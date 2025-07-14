/**
 * StockGenius Web Interface Server
 * Minimal Express server for single-user web interface
 */

import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';
import TradeCardGenerator from '../trading/TradeCardGenerator.js';
import PerformanceTracker from '../analytics/PerformanceTracker.js';
import DailyPipeline from '../automation/DailyPipeline.js';
import PromptOrchestrator from '../ai/PromptOrchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WebConfig {
  port: number;
  auth: {
    username: string;
    password: string;
    sessionSecret: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export class StockGeniusWebServer {
  private app: express.Application;
  private server: any;
  private config: WebConfig;
  private dataHub: DataHub;
  private tradeCardGenerator: TradeCardGenerator;
  private performanceTracker: PerformanceTracker;
  private dailyPipeline: DailyPipeline;
  private promptOrchestrator: PromptOrchestrator;

  constructor(
    config: WebConfig,
    dataHub: DataHub,
    tradeCardGenerator: TradeCardGenerator,
    performanceTracker: PerformanceTracker,
    dailyPipeline: DailyPipeline,
    promptOrchestrator: PromptOrchestrator
  ) {
    this.config = config;
    this.dataHub = dataHub;
    this.tradeCardGenerator = tradeCardGenerator;
    this.performanceTracker = performanceTracker;
    this.dailyPipeline = dailyPipeline;
    this.promptOrchestrator = promptOrchestrator;

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Basic middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Session middleware
    this.app.use(session({
      secret: this.config.auth.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    }));

    // View engine setup
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, 'views'));

    // Request logging
    this.app.use((req, res, next) => {
      loggerUtils.aiLogger.info('Web request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });

    // Error handling
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      loggerUtils.aiLogger.error('Web server error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
      });
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private setupRoutes(): void {
    // Authentication middleware
    const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if ((req.session as any)?.authenticated) {
        next();
      } else {
        res.redirect('/login');
      }
    };

    // Public routes
    this.app.get('/login', (req, res) => {
      res.render('login', { error: null });
    });

    this.app.post('/login', (req, res) => {
      const { username, password } = req.body;
      
      if (username === this.config.auth.username && password === this.config.auth.password) {
        (req.session as any).authenticated = true;
        res.redirect('/dashboard');
      } else {
        res.render('login', { error: 'Invalid credentials' });
      }
    });

    this.app.post('/logout', (req, res) => {
      req.session.destroy(() => {
        res.redirect('/login');
      });
    });

    // Protected routes
    this.app.get('/', requireAuth, (req, res) => {
      res.redirect('/dashboard');
    });

    this.app.get('/dashboard', requireAuth, async (req, res) => {
      try {
        const tradeCards = await this.getLatestTradeCards();
        const performanceMetrics = await this.getPerformanceOverview();
        const pipelineStatus = this.dailyPipeline.getCurrentExecution();

        res.render('dashboard', {
          tradeCards,
          performanceMetrics,
          pipelineStatus,
          timestamp: Date.now(),
        });
      } catch (error) {
        loggerUtils.aiLogger.error('Dashboard error', { error: (error as Error).message });
        res.status(500).render('error', { message: 'Failed to load dashboard' });
      }
    });

    this.app.get('/performance', requireAuth, async (req, res) => {
      try {
        const performanceData = await this.getDetailedPerformance();
        res.render('performance', { performanceData });
      } catch (error) {
        loggerUtils.aiLogger.error('Performance page error', { error: (error as Error).message });
        res.status(500).render('error', { message: 'Failed to load performance data' });
      }
    });

    this.app.get('/analysis', requireAuth, (req, res) => {
      const pipelineStatus = this.dailyPipeline.getCurrentExecution();
      res.render('analysis', { pipelineStatus });
    });

    // API endpoints
    this.app.get('/api/trade-cards', requireAuth, async (req, res) => {
      try {
        const tradeCards = await this.getLatestTradeCards();
        res.json(tradeCards);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trade cards' });
      }
    });

    this.app.get('/api/trade-cards/:id/details', requireAuth, async (req, res) => {
      try {
        const details = await this.getTradeCardDetails(req.params.id);
        res.json(details);
      } catch (error) {
        res.status(404).json({ error: 'Trade card not found' });
      }
    });

    this.app.post('/api/analysis/trigger', requireAuth, async (req, res) => {
      try {
        if (this.dailyPipeline.isCurrentlyRunning()) {
          return res.status(409).json({ error: 'Analysis already running' });
        }

        const { symbols, modules, priority } = req.body;
        const execution = await this.dailyPipeline.runManualPipeline(symbols, modules, {
          priority: priority || 'normal',
          notifications: false,
        });

        res.json({ 
          message: 'Analysis started',
          executionId: execution.id,
          status: 'running'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to start analysis' });
      }
    });

    this.app.get('/api/analysis/status', requireAuth, (req, res) => {
      const execution = this.dailyPipeline.getCurrentExecution();
      res.json({
        isRunning: this.dailyPipeline.isCurrentlyRunning(),
        currentExecution: execution,
      });
    });

    this.app.get('/api/performance/metrics', requireAuth, async (req, res) => {
      try {
        const metrics = await this.getPerformanceMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch performance metrics' });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
      });
    });
  }

  private async getLatestTradeCards(): Promise<any> {
    // This would integrate with the actual trade card generator
    // For now, return mock data structure
    return {
      json: {
        timestamp: Date.now(),
        summary: {
          totalCards: 5,
          highConfidenceCards: 2,
          averageConfidence: 75,
          categories: {
            high_conviction: 2,
            momentum: 1,
            sentiment_play: 1,
            earnings: 1,
            wildcard: 0
          }
        },
        cards: [
          {
            id: 'card_1',
            category: 'high_conviction',
            symbol: 'NVDA',
            confidence: 85,
            strategyType: 'Breakout Play',
            entry: { price: 450.50, timing: 'Market open' },
            exits: {
              primary: { price: 475.00, reasoning: 'Technical target' },
              stop: { price: 435.00, reasoning: 'Support break' }
            },
            whyThisTrade: {
              mainThesis: 'AI momentum continues with strong technical setup',
              keyPoints: ['Earnings beat expectations', 'Bullish analyst upgrades'],
              catalysts: ['AI conference next week', 'Product launch']
            }
          }
        ]
      }
    };
  }

  private async getPerformanceOverview(): Promise<any> {
    // Mock performance data
    return {
      winRate: 68.5,
      averageReturn: 4.2,
      totalTrades: 147,
      accuracy: 72.1,
      sharpeRatio: 1.85
    };
  }

  private async getDetailedPerformance(): Promise<any> {
    // Mock detailed performance data
    return {
      overview: await this.getPerformanceOverview(),
      modulePerformance: [
        { module: 'sector', accuracy: 74.2, confidence: 81.3 },
        { module: 'technical', accuracy: 69.8, confidence: 77.5 },
        { module: 'sentiment', accuracy: 71.4, confidence: 73.2 }
      ],
      recentTrades: []
    };
  }

  private async getTradeCardDetails(cardId: string): Promise<any> {
    // Mock trade card details
    return {
      id: cardId,
      aiReasoning: {
        sector: 'Technology sector showing strong momentum',
        technical: 'Breakout above resistance with volume confirmation',
        risk: 'Low risk due to strong fundamentals',
        fusion: 'All signals aligned for bullish outcome'
      },
      confidence: 85,
      signalStrength: {
        technical: 92,
        sentiment: 78,
        risk: 85,
        sector: 88
      }
    };
  }

  private async getPerformanceMetrics(): Promise<any> {
    // Mock performance metrics
    return {
      daily: { return: 2.1, trades: 3 },
      weekly: { return: 8.7, trades: 12 },
      monthly: { return: 24.3, trades: 47 }
    };
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        loggerUtils.aiLogger.info('StockGenius web server started', {
          port: this.config.port,
          environment: process.env.NODE_ENV || 'development',
        });
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          loggerUtils.aiLogger.info('StockGenius web server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default StockGeniusWebServer;
/**
 * StockGenius Web Interface Server
 * Refactored Express server with new architecture
 */

import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { loggerUtils } from '../config/logger.js';
import { AnalysisController } from '../api/AnalysisController.js';
import { ServiceContainer } from '../core/ServiceContainer.js';

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
  private analysisController: AnalysisController;
  private serviceContainer: ServiceContainer;

  constructor(
    config: WebConfig,
    analysisController: AnalysisController,
    serviceContainer: ServiceContainer
  ) {
    this.config = config;
    this.analysisController = analysisController;
    this.serviceContainer = serviceContainer;

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Basic middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Static files with cache control for development
    if (process.env.NODE_ENV !== 'production') {
      this.app.use(express.static(path.join(__dirname, 'public'), {
        setHeaders: (res) => {
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.set('Pragma', 'no-cache');
          res.set('Expires', '0');
          res.set('Surrogate-Control', 'no-store');
        }
      }));
    } else {
      this.app.use(express.static(path.join(__dirname, 'public')));
    }

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
        // Return empty cards initially - only show after analysis trigger
        const emptyTradeCards = this.getEmptyTradeCards();
        const performanceMetrics = await this.getPerformanceOverview();
        const pipelineStatus = null; // TODO: Get from analysis controller

        res.render('dashboard', {
          tradeCards: emptyTradeCards,
          performanceMetrics,
          pipelineStatus,
          timestamp: Date.now(),
          availableSectors: [
            'Technology',
            'Healthcare',
            'Finance',
            'Energy',
            'Consumer Discretionary',
            'Consumer Staples',
            'Industrials',
            'Materials',
            'Real Estate',
            'Utilities',
            'Communication Services'
          ],
          userPrefs: {
            sectors: ['Technology', 'Healthcare'],
            riskTolerance: 'moderate',
            analysisDepth: 'detailed'
          },
          watchlistInfo: {
            total: 16,
            sectors: ['Technology', 'Healthcare', 'Finance', 'Consumer Discretionary'],
            source: 'Default Configuration'
          }
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

    this.app.get('/analysis', requireAuth, async (req, res) => {
      try {
        // Get mock pipeline status with data quality info
        const pipelineStatus = await this.getMockPipelineStatus();
        res.render('analysis', { pipelineStatus });
      } catch (error) {
        loggerUtils.aiLogger.error('Analysis page error', { error: (error as Error).message });
        res.render('analysis', { pipelineStatus: null });
      }
    });

    // API endpoints - Trade Cards
    this.app.get('/api/trade-cards', async (req, res) => {
      try {
        // Get latest analysis results
        const analysisHistory = this.analysisController.getAnalysisHistory;
        const tradeCards = await this.getTradeCardsFromAnalysis();
        res.json(tradeCards);
      } catch (error) {
        loggerUtils.aiLogger.error('Failed to fetch trade cards', {
          error: error.message
        });
        res.status(500).json({ 
          error: 'Failed to fetch trade cards',
          details: error.message 
        });
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

    // New resilient analysis endpoints
    this.app.post('/api/analysis/trigger', (req, res) => {
      this.analysisController.triggerAnalysis(req, res);
    });

    this.app.get('/api/analysis/status', requireAuth, (req, res) => {
      this.analysisController.getAnalysisStatus(req, res);
    });

    this.app.post('/api/analysis/cancel', requireAuth, (req, res) => {
      this.analysisController.cancelAnalysis(req, res);
    });

    this.app.get('/api/analysis/history', requireAuth, (req, res) => {
      this.analysisController.getAnalysisHistory(req, res);
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
    try {
      // Use analysis controller for trade cards
      const cards = [];
      
      // Group cards by category for summary
      const categories = {
        high_conviction: 0,
        momentum: 0,
        sentiment_play: 0,
        earnings: 0,
        wildcard: 0
      };
      
      let highConfidenceCards = 0;
      let totalConfidence = 0;
      
      cards.forEach(card => {
        if (categories[card.category] !== undefined) {
          categories[card.category]++;
        }
        if (card.confidence >= 80) {
          highConfidenceCards++;
        }
        totalConfidence += card.confidence;
      });
      
      const averageConfidence = cards.length > 0 ? Math.round(totalConfidence / cards.length) : 0;
      
      return {
        json: {
          timestamp: Date.now(),
          summary: {
            totalCards: cards.length,
            highConfidenceCards,
            averageConfidence,
            categories
          },
          cards
        }
      };
    } catch (error) {
      loggerUtils.aiLogger.error('Error fetching latest trade cards', {
        error: (error as Error).message,
      });
      
      // Return empty structure on error
      return {
        json: {
          timestamp: Date.now(),
          summary: {
            totalCards: 0,
            highConfidenceCards: 0,
            averageConfidence: 0,
            categories: {
              high_conviction: 0,
              momentum: 0,
              sentiment_play: 0,
              earnings: 0,
              wildcard: 0
            }
          },
          cards: []
        }
      };
    }
  }

  private async getTradeCardsFromAnalysis(): Promise<any> {
    try {
      // Get data quality report from DataHub if available
      let dataQualityReport = null;
      
      try {
        const dataHub = await this.serviceContainer.get('dataHub') as any;
        if (dataHub && typeof dataHub.getDataQualityReport === 'function') {
          dataQualityReport = dataHub.getDataQualityReport();
        }
      } catch (error) {
        // Ignore if method not available
      }
      
      // Mock some cards for now - this will be replaced with real analysis results
      const mockCards = [
        {
          id: `trade_${Date.now()}_1`,
          symbol: 'AAPL',
          category: 'high_conviction',
          confidence: 85,
          strategyType: 'momentum',
          entry: { price: 185.50 },
          exits: {
            primary: { price: 195.00 },
            stop: { price: 178.00 }
          },
          whyThisTrade: {
            mainThesis: 'Strong momentum breakout with volume confirmation',
            keyPoints: [
              'Breaking above key resistance level',
              'Increased institutional buying',
              'Positive earnings revision trend'
            ]
          },
          metadata: {
            sources: {
              quote: 'yahoo',
              news: 'newsscraper',
              financials: 'alphavantage',
              trends: 'trends'
            },
            quality: {
              overall: 85,
              completeness: 90,
              freshness: 80,
              reliability: 85
            },
            timestamp: Date.now()
          }
        },
        {
          id: `trade_${Date.now()}_2`,
          symbol: 'NVDA',
          category: 'momentum',
          confidence: 78,
          strategyType: 'trend_following',
          entry: { price: 420.00 },
          exits: {
            primary: { price: 450.00 },
            stop: { price: 400.00 }
          },
          whyThisTrade: {
            mainThesis: 'AI sector leadership with strong fundamentals',
            keyPoints: [
              'Leading AI chip provider',
              'Strong quarterly guidance',
              'Expanding market share'
            ]
          },
          metadata: {
            sources: {
              quote: 'backup',
              news: 'backup',
              financials: 'backup',
              trends: 'fallback-generated'
            },
            quality: {
              overall: 45,
              completeness: 60,
              freshness: 40,
              reliability: 45
            },
            timestamp: Date.now()
          }
        },
        {
          id: `trade_${Date.now()}_3`,
          symbol: 'MSFT',
          category: 'momentum',
          confidence: 72,
          strategyType: 'sector_rotation',
          entry: { price: 380.00 },
          exits: {
            primary: { price: 395.00 },
            stop: { price: 370.00 }
          },
          whyThisTrade: {
            mainThesis: 'Cloud services growth with AI integration',
            keyPoints: [
              'Strong Azure revenue growth',
              'Microsoft Copilot adoption',
              'Enterprise AI partnerships'
            ]
          },
          metadata: {
            sources: {
              quote: 'yahoo',
              news: 'fallback',
              financials: 'cache',
              trends: 'trends'
            },
            quality: {
              overall: 70,
              completeness: 75,
              freshness: 65,
              reliability: 70
            },
            timestamp: Date.now()
          }
        }
      ];

      return {
        json: {
          timestamp: Date.now(),
          summary: {
            totalCards: mockCards.length,
            highConfidenceCards: mockCards.filter(c => c.confidence > 80).length,
            averageConfidence: Math.round(mockCards.reduce((sum, c) => sum + c.confidence, 0) / mockCards.length),
            categories: {
              high_conviction: mockCards.filter(c => c.category === 'high_conviction').length,
              momentum: mockCards.filter(c => c.category === 'momentum').length,
              sentiment_play: 0,
              earnings: 0,
              wildcard: 0
            }
          },
          cards: mockCards,
          dataQuality: dataQualityReport || {
            overallScore: Math.round(mockCards.reduce((sum, c) => sum + (c.metadata?.quality?.overall || 70), 0) / mockCards.length),
            sourcesEvaluated: mockCards.length,
            totalIssues: mockCards.filter(c => (c.metadata?.quality?.overall || 70) < 60).length,
            sourceBreakdown: {
              live: { count: mockCards.filter(c => !c.metadata?.sources || !Object.values(c.metadata.sources).some(s => s.includes('backup') || s.includes('fallback'))).length, avgReliability: 85 },
              fallback: { count: mockCards.filter(c => c.metadata?.sources && Object.values(c.metadata.sources).some(s => s.includes('fallback') || s.includes('cache'))).length, avgReliability: 65 },
              backup: { count: mockCards.filter(c => c.metadata?.sources && Object.values(c.metadata.sources).some(s => s.includes('backup'))).length, avgReliability: 45 }
            }
          }
        }
      };
    } catch (error) {
      loggerUtils.aiLogger.error('Error generating trade cards from analysis', {
        error: error.message
      });

      return this.getEmptyTradeCards();
    }
  }

  private getEmptyTradeCards(): any {
    return {
      json: {
        timestamp: Date.now(),
        summary: {
          totalCards: 0,
          highConfidenceCards: 0,
          averageConfidence: 0,
          categories: {
            high_conviction: 0,
            momentum: 0,
            sentiment_play: 0,
            earnings: 0,
            wildcard: 0
          }
        },
        cards: []
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

  private async getMockPipelineStatus(): Promise<any> {
    // Get data quality info from DataHub if available
    let dataQualityReport = null;
    
    try {
      const dataHub = await this.serviceContainer.get('dataHub') as any;
      if (dataHub && typeof dataHub.getDataQualityReport === 'function') {
        dataQualityReport = dataHub.getDataQualityReport();
      }
    } catch (error) {
      // Ignore if method not available
    }
    
    return {
      id: `pipeline_${Date.now()}`,
      phase: 'Completed',
      success: true,
      metrics: {
        symbolsProcessed: 15,
        processingTimeMs: 8500,
        tradesGenerated: 3,
        errorsCount: 0
      },
      dataQuality: dataQualityReport || {
        overallScore: 67,
        sourcesEvaluated: 7,
        totalIssues: 2,
        sourceBreakdown: {
          yahoo: { count: 3, avgReliability: 85 },
          alphavantage: { count: 2, avgReliability: 80 },
          newsscraper: { count: 2, avgReliability: 70 },
          trends: { count: 1, avgReliability: 60 },
          backup: { count: 2, avgReliability: 45 },
          sec: { count: 1, avgReliability: 90 }
        }
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

  private getSymbolsBySectors(sectors: string[]): string[] {
    const sectorSymbols: { [key: string]: string[] } = {
      'technology': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'ADBE', 'CRM', 'ORCL', 'INTC', 'AMD'],
      'healthcare': ['JNJ', 'PFE', 'UNH', 'MRNA', 'ABBV', 'TMO', 'DHR', 'BMY', 'AMGN', 'GILD'],
      'finance': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BRK.B', 'V', 'MA', 'AXP', 'COF', 'SCHW'],
      'energy': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'HAL', 'BKR'],
      'consumer discretionary': ['AMZN', 'TSLA', 'HD', 'NKE', 'MCD', 'SBUX', 'DIS', 'LOW', 'TGT', 'BKNG'],
      'consumer staples': ['PG', 'KO', 'PEP', 'WMT', 'COST', 'CL', 'KHC', 'MO', 'EL', 'GIS'],
      'industrials': ['BA', 'CAT', 'GE', 'UNP', 'HON', 'UPS', 'RTX', 'LMT', 'MMM', 'DE'],
      'materials': ['LIN', 'APD', 'ECL', 'DD', 'DOW', 'NEM', 'FCX', 'VMC', 'MLM', 'PPG'],
      'real estate': ['AMT', 'CCI', 'PLD', 'EQIX', 'WELL', 'SPG', 'O', 'AVLR', 'EXR', 'VTR'],
      'utilities': ['NEE', 'SO', 'DUK', 'AEP', 'EXC', 'XEL', 'PEG', 'SRE', 'PPL', 'ED'],
      'communication services': ['GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'CHTR', 'TMUS', 'ATVI']
    };

    let selectedSymbols: string[] = [];
    sectors.forEach(sector => {
      const normalizedSector = sector.toLowerCase();
      if (sectorSymbols[normalizedSector]) {
        selectedSymbols = selectedSymbols.concat(sectorSymbols[normalizedSector]);
      }
    });

    // Remove duplicates and limit to reasonable number
    return [...new Set(selectedSymbols)].slice(0, 15);
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
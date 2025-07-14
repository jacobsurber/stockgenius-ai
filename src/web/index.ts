/**
 * StockGenius Web Interface Launcher
 * Main entry point for the web application
 */

import StockGeniusWebServer, { WebConfig } from './server.js';
import { DataHub } from '../api/DataHub.js';
import TradeCardGenerator from '../trading/TradeCardGenerator.js';
import PerformanceTracker from '../analytics/PerformanceTracker.js';
import DailyPipeline from '../automation/DailyPipeline.js';
import PromptOrchestrator from '../ai/PromptOrchestrator.js';
import { loggerUtils } from '../config/logger.js';

async function createWebInterface(): Promise<StockGeniusWebServer> {
  try {
    // Web server configuration
    const webConfig: WebConfig = {
      port: parseInt(process.env.WEB_PORT || '3000'),
      auth: {
        username: process.env.WEB_USERNAME || 'admin',
        password: process.env.WEB_PASSWORD || 'stockgenius2024',
        sessionSecret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production'
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100
      }
    };

    // Initialize core services
    loggerUtils.aiLogger.info('Initializing StockGenius web interface');

    const dataHub = new DataHub();
    await dataHub.initialize();

    // Initialize AI orchestrator
    const promptOrchestrator = new PromptOrchestrator(dataHub);

    // Initialize trade card generator
    const tradeCardGenerator = new TradeCardGenerator(dataHub);

    // Initialize performance tracker
    const performanceTracker = new PerformanceTracker(dataHub);

    // Initialize daily pipeline with configuration
    const pipelineConfig = {
      schedules: {
        preMarket: '30 8 * * 1-5',   // 8:30 AM weekdays
        midDay: '0 12 * * 1-5',      // 12:00 PM weekdays
        postMarket: '30 16 * * 1-5', // 4:30 PM weekdays
        weekend: '0 10 * * 6'        // 10:00 AM Saturday
      },
      watchlist: [
        'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NFLX',
        'SPY', 'QQQ', 'IWM', 'AMD', 'INTC', 'CRM', 'ADBE', 'ORCL'
      ],
      notifications: {
        enabled: true,
        webhookUrl: process.env.WEBHOOK_URL,
        emailConfig: {
          enabled: false,
          recipients: [],
          smtpConfig: {}
        },
        slackConfig: {
          enabled: false,
          webhookUrl: '',
          channel: ''
        }
      },
      failureHandling: {
        maxRetries: 3,
        backoffMultiplier: 2,
        partialAnalysisThreshold: 0.6,
        fallbackSymbols: ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT']
      },
      marketHours: {
        timezone: 'America/New_York',
        tradingHours: {
          start: '09:30',
          end: '16:00'
        },
        holidays: [] // Add market holidays as needed
      }
    };

    const dailyPipeline = new DailyPipeline(
      dataHub,
      promptOrchestrator,
      tradeCardGenerator,
      performanceTracker,
      pipelineConfig
    );

    // Create web server
    const webServer = new StockGeniusWebServer(
      webConfig,
      dataHub,
      tradeCardGenerator,
      performanceTracker,
      dailyPipeline,
      promptOrchestrator
    );

    loggerUtils.aiLogger.info('StockGenius web interface initialized successfully');
    return webServer;

  } catch (error) {
    loggerUtils.aiLogger.error('Failed to initialize web interface', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    throw error;
  }
}

async function startWebInterface(): Promise<void> {
  try {
    const webServer = await createWebInterface();
    await webServer.start();

    loggerUtils.aiLogger.info('StockGenius web interface started successfully', {
      port: process.env.WEB_PORT || 3000,
      environment: process.env.NODE_ENV || 'development'
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      loggerUtils.aiLogger.info('Received SIGINT, shutting down gracefully');
      await webServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      loggerUtils.aiLogger.info('Received SIGTERM, shutting down gracefully');
      await webServer.stop();
      process.exit(0);
    });

  } catch (error) {
    loggerUtils.aiLogger.error('Failed to start web interface', {
      error: (error as Error).message
    });
    process.exit(1);
  }
}

// Start the web interface if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWebInterface();
}

export { createWebInterface, startWebInterface };
export default StockGeniusWebServer;
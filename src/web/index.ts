/**
 * StockGenius Web Interface Launcher
 * Main entry point for the web application with new architecture
 */

import StockGeniusWebServer, { WebConfig } from './server.js';
import { registerServices, initializeCriticalServices, shutdownServices } from '../core/ServiceRegistry.js';
import { serviceContainer } from '../core/ServiceContainer.js';
import { DataHub } from '../api/DataHub.js';
import { AnalysisController } from '../api/AnalysisController.js';
import { loggerUtils } from '../config/logger.js';

async function createWebInterface(): Promise<StockGeniusWebServer> {
  try {
    // Web server configuration
    const webConfig: WebConfig = {
      port: parseInt(process.env.WEB_PORT || '8080'),
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

    // Initialize new service architecture
    loggerUtils.aiLogger.info('Initializing StockGenius web interface with new architecture');

    // Register all services
    await registerServices();
    
    // Initialize critical services
    await initializeCriticalServices();

    // Get services from container
    const dataHub = await serviceContainer.get<DataHub>('dataHub');
    const analysisController = await serviceContainer.get<AnalysisController>('analysisController');
    // Create web server with new architecture
    const webServer = new StockGeniusWebServer(
      webConfig,
      analysisController,
      serviceContainer
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

    // Graceful shutdown with service cleanup
    process.on('SIGINT', async () => {
      loggerUtils.aiLogger.info('Received SIGINT, shutting down gracefully');
      await webServer.stop();
      await shutdownServices();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      loggerUtils.aiLogger.info('Received SIGTERM, shutting down gracefully');
      await webServer.stop();
      await shutdownServices();
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
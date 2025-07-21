/**
 * Service Registry - Central configuration for all services
 */

import { serviceContainer } from './ServiceContainer.js';
import { DataHub } from '../api/DataHub.js';
import { AnalysisController } from '../api/AnalysisController.js';
import { loggerUtils } from '../config/logger.js';

/**
 * Register all application services
 */
export async function registerServices(): Promise<void> {
  loggerUtils.aiLogger.info('Registering application services');

  // Register DataHub
  serviceContainer.register({
    name: 'dataHub',
    factory: async () => {
      const dataHub = new DataHub();
      await dataHub.initialize();
      return dataHub;
    },
    singleton: true,
    healthCheck: async () => {
      const dataHub = await serviceContainer.get<DataHub>('dataHub');
      const healthResults = await dataHub.getHealthStatus();
      return healthResults.overall !== 'unhealthy';
    }
  });

  // Register Analysis Controller
  serviceContainer.register({
    name: 'analysisController',
    factory: async () => {
      return new AnalysisController();
    },
    dependencies: ['dataHub'],
    singleton: true,
    healthCheck: async () => {
      // Analysis controller is healthy if it exists
      return true;
    }
  });

  // Register other services as needed...
  
  loggerUtils.aiLogger.info('Service registration completed');
}

/**
 * Initialize all critical services
 */
export async function initializeCriticalServices(): Promise<void> {
  try {
    loggerUtils.aiLogger.info('Initializing critical services');
    
    // Initialize services in dependency order
    await serviceContainer.get('dataHub');
    await serviceContainer.get('analysisController');
    
    loggerUtils.aiLogger.info('Critical services initialized successfully');
  } catch (error) {
    loggerUtils.aiLogger.error('Failed to initialize critical services', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Graceful shutdown of all services
 */
export async function shutdownServices(): Promise<void> {
  loggerUtils.aiLogger.info('Starting graceful shutdown of services');
  
  try {
    await serviceContainer.shutdown();
    loggerUtils.aiLogger.info('All services shut down successfully');
  } catch (error) {
    loggerUtils.aiLogger.error('Error during service shutdown', {
      error: error.message
    });
  }
}
/**
 * Dependency Injection Container for StockGenius
 * Manages service lifecycle and dependencies
 */

import { EventEmitter } from 'events';
import { DataHub } from '../api/DataHub.js';
import { loggerUtils } from '../config/logger.js';

export interface ServiceDefinition {
  name: string;
  factory: () => Promise<any>;
  dependencies?: string[];
  singleton?: boolean;
  healthCheck?: () => Promise<boolean>;
}

export interface ServiceHealth {
  name: string;
  healthy: boolean;
  lastCheck: Date;
  error?: string;
}

export class ServiceContainer extends EventEmitter {
  private services = new Map<string, any>();
  private definitions = new Map<string, ServiceDefinition>();
  private healthStatus = new Map<string, ServiceHealth>();
  private initializationPromises = new Map<string, Promise<any>>();

  constructor() {
    super();
    this.setupHealthMonitoring();
  }

  /**
   * Register a service definition
   */
  register(definition: ServiceDefinition): void {
    this.definitions.set(definition.name, definition);
    loggerUtils.aiLogger.info('Service registered', {
      name: definition.name,
      dependencies: definition.dependencies || [],
      singleton: definition.singleton ?? true
    });
  }

  /**
   * Get a service instance (with dependency injection)
   */
  async get<T>(serviceName: string): Promise<T> {
    // Return cached instance for singletons
    if (this.services.has(serviceName)) {
      return this.services.get(serviceName);
    }

    // Handle concurrent initialization
    if (this.initializationPromises.has(serviceName)) {
      return this.initializationPromises.get(serviceName);
    }

    const definition = this.definitions.get(serviceName);
    if (!definition) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    // Create initialization promise
    const initPromise = this.initializeService(definition);
    this.initializationPromises.set(serviceName, initPromise);

    try {
      const instance = await initPromise;
      
      // Cache singletons
      if (definition.singleton !== false) {
        this.services.set(serviceName, instance);
      }

      return instance;
    } finally {
      this.initializationPromises.delete(serviceName);
    }
  }

  /**
   * Initialize service with dependency resolution
   */
  private async initializeService(definition: ServiceDefinition): Promise<any> {
    loggerUtils.aiLogger.info('Initializing service', {
      name: definition.name,
      dependencies: definition.dependencies
    });

    // Resolve dependencies first
    const dependencies: any[] = [];
    if (definition.dependencies) {
      for (const depName of definition.dependencies) {
        try {
          const dependency = await this.get(depName);
          dependencies.push(dependency);
        } catch (error) {
          loggerUtils.aiLogger.error('Failed to resolve dependency', {
            service: definition.name,
            dependency: depName,
            error: error.message
          });
          throw new Error(`Failed to resolve dependency ${depName} for service ${definition.name}`);
        }
      }
    }

    // Initialize the service
    try {
      const instance = await definition.factory();
      
      this.emit('serviceInitialized', {
        name: definition.name,
        instance
      });

      loggerUtils.aiLogger.info('Service initialized successfully', {
        name: definition.name
      });

      return instance;
    } catch (error) {
      loggerUtils.aiLogger.error('Service initialization failed', {
        name: definition.name,
        error: error.message,
        stack: error.stack
      });

      this.emit('serviceInitializationFailed', {
        name: definition.name,
        error
      });

      throw error;
    }
  }

  /**
   * Check health of all services
   */
  async checkHealth(): Promise<ServiceHealth[]> {
    const healthChecks = Array.from(this.definitions.entries())
      .filter(([_, def]) => def.healthCheck)
      .map(async ([name, definition]) => {
        try {
          const healthy = await definition.healthCheck!();
          const status: ServiceHealth = {
            name,
            healthy,
            lastCheck: new Date()
          };
          this.healthStatus.set(name, status);
          return status;
        } catch (error) {
          const status: ServiceHealth = {
            name,
            healthy: false,
            lastCheck: new Date(),
            error: error.message
          };
          this.healthStatus.set(name, status);
          return status;
        }
      });

    return Promise.all(healthChecks);
  }

  /**
   * Get current health status
   */
  getHealthStatus(): ServiceHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Setup periodic health monitoring
   */
  private setupHealthMonitoring(): void {
    setInterval(async () => {
      try {
        const healthResults = await this.checkHealth();
        const unhealthy = healthResults.filter(h => !h.healthy);
        
        if (unhealthy.length > 0) {
          this.emit('unhealthyServices', unhealthy);
          loggerUtils.aiLogger.warn('Unhealthy services detected', {
            count: unhealthy.length,
            services: unhealthy.map(s => s.name)
          });
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Health monitoring failed', {
          error: error.message
        });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    loggerUtils.aiLogger.info('Shutting down service container');
    
    // Call shutdown methods on services that have them
    for (const [name, instance] of this.services.entries()) {
      if (instance && typeof instance.shutdown === 'function') {
        try {
          await instance.shutdown();
          loggerUtils.aiLogger.info('Service shut down successfully', { name });
        } catch (error) {
          loggerUtils.aiLogger.error('Service shutdown failed', {
            name,
            error: error.message
          });
        }
      }
    }

    this.services.clear();
    this.healthStatus.clear();
  }
}

// Global service container instance
export const serviceContainer = new ServiceContainer();
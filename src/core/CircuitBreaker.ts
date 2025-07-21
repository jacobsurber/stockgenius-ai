/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures in API clients
 */

import { EventEmitter } from 'events';
import { loggerUtils } from '../config/logger.js';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedErrorRate: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit open, failing fast
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  requests: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
}

export class CircuitBreaker extends EventEmitter {
  private state = CircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private requests = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private resetTimer?: NodeJS.Timeout;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions
  ) {
    super();
    loggerUtils.aiLogger.info('Circuit breaker initialized', {
      name,
      options
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.requests++;

    if (this.state === CircuitBreakerState.OPEN) {
      if (this.nextAttemptTime && Date.now() < this.nextAttemptTime.getTime()) {
        const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
        this.emit('rejected', { name: this.name, reason: 'circuit_open' });
        throw error;
      } else {
        // Try to move to half-open state
        this.state = CircuitBreakerState.HALF_OPEN;
        loggerUtils.aiLogger.info('Circuit breaker moved to HALF_OPEN', {
          name: this.name
        });
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = new Date();
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Recovery successful, close circuit
      this.state = CircuitBreakerState.CLOSED;
      this.failures = 0;
      this.clearResetTimer();
      
      loggerUtils.aiLogger.info('Circuit breaker recovered', {
        name: this.name,
        state: this.state
      });
      
      this.emit('stateChanged', {
        name: this.name,
        state: this.state,
        reason: 'recovery'
      });
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Half-open test failed, go back to open
      this.openCircuit();
    } else if (this.shouldOpenCircuit()) {
      this.openCircuit();
    }
  }

  /**
   * Determine if circuit should open
   */
  private shouldOpenCircuit(): boolean {
    if (this.failures >= this.options.failureThreshold) {
      return true;
    }

    // Check failure rate over monitoring period
    const recentFailures = this.getRecentFailures();
    const failureRate = recentFailures / Math.max(this.requests, 1);
    
    return failureRate > this.options.expectedErrorRate;
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.options.resetTimeout);
    
    loggerUtils.aiLogger.warn('Circuit breaker opened', {
      name: this.name,
      failures: this.failures,
      nextAttemptTime: this.nextAttemptTime
    });

    this.emit('stateChanged', {
      name: this.name,
      state: this.state,
      reason: 'failure_threshold'
    });

    // Set timer to attempt reset
    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitBreakerState.OPEN) {
        this.state = CircuitBreakerState.HALF_OPEN;
        loggerUtils.aiLogger.info('Circuit breaker attempting reset', {
          name: this.name
        });
      }
    }, this.options.resetTimeout);
  }

  /**
   * Get number of recent failures
   */
  private getRecentFailures(): number {
    // Simple implementation - could be enhanced with sliding window
    const cutoff = Date.now() - this.options.monitoringPeriod;
    return this.lastFailureTime && this.lastFailureTime.getTime() > cutoff ? this.failures : 0;
  }

  /**
   * Clear reset timer
   */
  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requests: this.requests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.requests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
    this.clearResetTimer();

    loggerUtils.aiLogger.info('Circuit breaker manually reset', {
      name: this.name
    });

    this.emit('reset', { name: this.name });
  }

  /**
   * Check if circuit is healthy
   */
  isHealthy(): boolean {
    return this.state !== CircuitBreakerState.OPEN;
  }
}

/**
 * Circuit breaker factory with default configurations
 */
export class CircuitBreakerFactory {
  private static breakers = new Map<string, CircuitBreaker>();

  static getOrCreate(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (this.breakers.has(name)) {
      return this.breakers.get(name)!;
    }

    const defaultOptions: CircuitBreakerOptions = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 120000, // 2 minutes
      expectedErrorRate: 0.5 // 50% failure rate
    };

    const breaker = new CircuitBreaker(name, { ...defaultOptions, ...options });
    this.breakers.set(name, breaker);
    return breaker;
  }

  static getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  static getHealthStatus(): Array<{ name: string; healthy: boolean; stats: CircuitBreakerStats }> {
    return Array.from(this.breakers.entries()).map(([name, breaker]) => ({
      name,
      healthy: breaker.isHealthy(),
      stats: breaker.getStats()
    }));
  }
}
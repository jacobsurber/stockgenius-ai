/**
 * Prompt Orchestrator
 * TypeScript-based dispatch router for AI module chaining with comprehensive audit and retry logic
 */

import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { openAIClient } from '../config/openai.js';
import { redisClient } from '../config/redis.js';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';
import path from 'path';

// Import all AI modules and their types
import SectorIntelligence, { SectorAnalysisInput, SectorAnalysisOutput } from './modules/SectorIntelligence.js';
import RiskAssessor, { RiskAssessmentInput, RiskAssessmentOutput } from './modules/RiskAssessor.js';
import TechnicalTiming, { TechnicalTimingInput, TechnicalTimingOutput } from './modules/TechnicalTiming.js';
import RedditNLP, { RedditNLPInput, RedditNLPOutput } from './modules/RedditNLP.js';
import EarningsDrift, { EarningsDriftInput, EarningsDriftOutput } from './modules/EarningsDrift.js';
import StrategicFusion, { StrategicFusionInput, StrategicFusionOutput, TradeCard } from './StrategicFusion.js';
import TradeValidator, { ValidationInput, ValidationOutput } from './TradeValidator.js';

export type AIModuleName = 'sector' | 'risk' | 'technical' | 'reddit' | 'earningsDrift' | 'anomaly' | 'fusion' | 'validator';

export interface ModuleConfig {
  name: AIModuleName;
  priority: number; // 1-10, higher = more important
  maxRetries: number;
  timeoutMs: number;
  dependencies: AIModuleName[];
  fallbackEnabled: boolean;
  requiresValidation: boolean;
}

export interface PromptExecution {
  id: string;
  sessionId: string;
  moduleName: AIModuleName;
  model: string;
  promptType: 'primary' | 'fallback' | 'retry';
  attempt: number;
  startTime: number;
  endTime?: number;
  success: boolean;
  errorMessage?: string;
  inputHash: string;
  outputHash?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  qualityScore?: number;
  metadata: Record<string, any>;
}

export interface RateLimitConfig {
  model: string;
  requestsPerMinute: number;
  tokensPerMinute: number;
  currentRequests: number;
  currentTokens: number;
  resetTime: number;
}

export interface OrchestrationInput {
  sessionId: string;
  symbol: string;
  requestedModules: AIModuleName[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  timeoutMs?: number;
  allowFallbacks?: boolean;
  requireValidation?: boolean;
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
  inputs: {
    sector?: SectorAnalysisInput;
    risk?: RiskAssessmentInput;
    technical?: TechnicalTimingInput;
    reddit?: RedditNLPInput;
    earningsDrift?: EarningsDriftInput;
    fusion?: Partial<StrategicFusionInput>;
    validator?: Partial<ValidationInput>;
  };
}

export interface OrchestrationOutput {
  sessionId: string;
  symbol: string;
  timestamp: number;
  success: boolean;
  completedModules: AIModuleName[];
  failedModules: AIModuleName[];
  
  results: {
    sector?: SectorAnalysisOutput;
    risk?: RiskAssessmentOutput;
    technical?: TechnicalTimingOutput;
    reddit?: RedditNLPOutput;
    earningsDrift?: EarningsDriftOutput;
    fusion?: StrategicFusionOutput;
    validator?: ValidationOutput;
  };
  
  execution_metadata: {
    totalProcessingTime: number;
    moduleExecutionTimes: Record<AIModuleName, number>;
    retryAttempts: Record<AIModuleName, number>;
    fallbacksUsed: AIModuleName[];
    apiCallsTotal: number;
    tokensUsedTotal: number;
    qualityScores: Record<AIModuleName, number>;
  };
  
  audit_trail: PromptExecution[];
  issues: Array<{
    moduleName: AIModuleName;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    suggestion?: string;
  }>;
}

export class PromptOrchestrator {
  private database: Database | null = null;
  private dataHub: DataHub;
  
  // AI Module instances
  private sectorIntelligence: SectorIntelligence;
  private riskAssessor: RiskAssessor;
  private technicalTiming: TechnicalTiming;
  private redditNLP: RedditNLP;
  private earningsDrift: EarningsDrift;
  private strategicFusion: StrategicFusion;
  private tradeValidator: TradeValidator;
  
  // Rate limiting
  private rateLimits: Map<string, RateLimitConfig> = new Map();
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  
  // Module configuration
  private moduleConfigs: Record<AIModuleName, ModuleConfig> = {
    sector: {
      name: 'sector',
      priority: 7,
      maxRetries: 2,
      timeoutMs: 30000,
      dependencies: [],
      fallbackEnabled: true,
      requiresValidation: false,
    },
    risk: {
      name: 'risk',
      priority: 9,
      maxRetries: 3,
      timeoutMs: 25000,
      dependencies: [],
      fallbackEnabled: true,
      requiresValidation: false,
    },
    technical: {
      name: 'technical',
      priority: 8,
      maxRetries: 2,
      timeoutMs: 35000,
      dependencies: [],
      fallbackEnabled: true,
      requiresValidation: false,
    },
    reddit: {
      name: 'reddit',
      priority: 6,
      maxRetries: 2,
      timeoutMs: 40000,
      dependencies: [],
      fallbackEnabled: true,
      requiresValidation: false,
    },
    earningsDrift: {
      name: 'earningsDrift',
      priority: 5,
      maxRetries: 2,
      timeoutMs: 45000,
      dependencies: [],
      fallbackEnabled: true,
      requiresValidation: false,
    },
    anomaly: {
      name: 'anomaly',
      priority: 4,
      maxRetries: 2,
      timeoutMs: 50000,
      dependencies: [],
      fallbackEnabled: true,
      requiresValidation: false,
    },
    fusion: {
      name: 'fusion',
      priority: 10,
      maxRetries: 3,
      timeoutMs: 60000,
      dependencies: ['sector', 'risk', 'technical', 'reddit'],
      fallbackEnabled: true,
      requiresValidation: true,
    },
    validator: {
      name: 'validator',
      priority: 10,
      maxRetries: 2,
      timeoutMs: 30000,
      dependencies: ['fusion'],
      fallbackEnabled: false,
      requiresValidation: false,
    },
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
    
    // Initialize AI modules
    this.sectorIntelligence = new SectorIntelligence(dataHub);
    this.riskAssessor = new RiskAssessor(dataHub);
    this.technicalTiming = new TechnicalTiming(dataHub);
    this.redditNLP = new RedditNLP(dataHub);
    this.earningsDrift = new EarningsDrift(dataHub);
    this.strategicFusion = new StrategicFusion(dataHub);
    this.tradeValidator = new TradeValidator(dataHub);
    
    // Initialize rate limits
    this.initializeRateLimits();
    
    // Initialize database
    this.initializeDatabase();
  }

  /**
   * Initialize SQLite database for audit trail
   */
  private async initializeDatabase(): Promise<void> {
    try {
      const dbPath = path.join(process.cwd(), 'data', 'prompt_audit.db');
      
      this.database = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      // Create tables if they don't exist
      await this.database.exec(`
        CREATE TABLE IF NOT EXISTS prompt_executions (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          module_name TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt_type TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          success BOOLEAN NOT NULL,
          error_message TEXT,
          input_hash TEXT NOT NULL,
          output_hash TEXT,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          total_tokens INTEGER,
          quality_score REAL,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_prompt_executions_session ON prompt_executions(session_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_executions_module ON prompt_executions(module_name);
        CREATE INDEX IF NOT EXISTS idx_prompt_executions_timestamp ON prompt_executions(start_time);

        CREATE TABLE IF NOT EXISTS orchestration_sessions (
          session_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          priority TEXT NOT NULL,
          requested_modules TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          success BOOLEAN,
          total_processing_time INTEGER,
          api_calls_total INTEGER,
          tokens_used_total INTEGER,
          completed_modules TEXT,
          failed_modules TEXT,
          issues_count INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_symbol ON orchestration_sessions(symbol);
        CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_timestamp ON orchestration_sessions(start_time);
      `);

      loggerUtils.aiLogger.info('Prompt orchestrator database initialized');
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to initialize prompt orchestrator database', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Initialize rate limiting configurations
   */
  private initializeRateLimits(): void {
    // OpenAI rate limits (conservative estimates)
    this.rateLimits.set('gpt-4o', {
      model: 'gpt-4o',
      requestsPerMinute: 500,
      tokensPerMinute: 30000,
      currentRequests: 0,
      currentTokens: 0,
      resetTime: Date.now() + 60000,
    });

    this.rateLimits.set('gpt-4-turbo', {
      model: 'gpt-4-turbo',
      requestsPerMinute: 500,
      tokensPerMinute: 150000,
      currentRequests: 0,
      currentTokens: 0,
      resetTime: Date.now() + 60000,
    });

    this.rateLimits.set('gpt-3.5-turbo', {
      model: 'gpt-3.5-turbo',
      requestsPerMinute: 3000,
      tokensPerMinute: 160000,
      currentRequests: 0,
      currentTokens: 0,
      resetTime: Date.now() + 60000,
    });

    // Start rate limit reset timer
    setInterval(() => this.resetRateLimits(), 60000);
  }

  /**
   * Main orchestration method
   */
  async orchestrate(input: OrchestrationInput): Promise<OrchestrationOutput> {
    const startTime = Date.now();
    const auditTrail: PromptExecution[] = [];
    const completedModules: AIModuleName[] = [];
    const failedModules: AIModuleName[] = [];
    const results: any = {};
    const executionTimes: Record<AIModuleName, number> = {};
    const retryAttempts: Record<AIModuleName, number> = {};
    const fallbacksUsed: AIModuleName[] = [];
    const qualityScores: Record<AIModuleName, number> = {};
    const issues: any[] = [];
    
    let totalApiCalls = 0;
    let totalTokens = 0;

    try {
      loggerUtils.aiLogger.info('Starting orchestration session', {
        sessionId: input.sessionId,
        symbol: input.symbol,
        requestedModules: input.requestedModules,
        priority: input.priority,
      });

      // Store session start in database
      await this.storeSessionStart(input, startTime);

      // Determine execution order based on dependencies and priority
      const executionOrder = this.planExecutionOrder(input.requestedModules);
      
      // Execute modules in planned order
      for (const moduleName of executionOrder) {
        const moduleStartTime = Date.now();
        
        try {
          const moduleResult = await this.executeModule(
            moduleName,
            input,
            results,
            auditTrail
          );

          if (moduleResult.success) {
            results[moduleName] = moduleResult.output;
            completedModules.push(moduleName);
            qualityScores[moduleName] = moduleResult.qualityScore || 0.8;
            
            totalApiCalls += moduleResult.apiCalls || 0;
            totalTokens += moduleResult.tokens || 0;
          } else {
            failedModules.push(moduleName);
            issues.push({
              moduleName,
              severity: 'high' as const,
              message: moduleResult.error || 'Module execution failed',
              suggestion: 'Review module inputs and try again',
            });
          }

          retryAttempts[moduleName] = moduleResult.attempts || 1;
          if (moduleResult.usedFallback) {
            fallbacksUsed.push(moduleName);
          }
        } catch (error) {
          failedModules.push(moduleName);
          issues.push({
            moduleName,
            severity: 'critical' as const,
            message: `Module execution failed: ${(error as Error).message}`,
            suggestion: 'Check module configuration and dependencies',
          });
        }
        
        executionTimes[moduleName] = Date.now() - moduleStartTime;
      }

      const endTime = Date.now();
      const totalProcessingTime = endTime - startTime;

      // Store session completion in database
      await this.storeSessionEnd(input.sessionId, {
        endTime,
        success: failedModules.length === 0,
        totalProcessingTime,
        apiCallsTotal: totalApiCalls,
        tokensUsedTotal: totalTokens,
        completedModules,
        failedModules,
        issuesCount: issues.length,
      });

      const output: OrchestrationOutput = {
        sessionId: input.sessionId,
        symbol: input.symbol,
        timestamp: endTime,
        success: failedModules.length === 0,
        completedModules,
        failedModules,
        results,
        execution_metadata: {
          totalProcessingTime,
          moduleExecutionTimes: executionTimes,
          retryAttempts,
          fallbacksUsed,
          apiCallsTotal: totalApiCalls,
          tokensUsedTotal: totalTokens,
          qualityScores,
        },
        audit_trail: auditTrail,
        issues,
      };

      loggerUtils.aiLogger.info('Orchestration session completed', {
        sessionId: input.sessionId,
        symbol: input.symbol,
        success: output.success,
        completedModules: completedModules.length,
        failedModules: failedModules.length,
        totalProcessingTime,
        totalApiCalls,
        totalTokens,
      });

      return output;
    } catch (error) {
      loggerUtils.aiLogger.error('Orchestration session failed', {
        sessionId: input.sessionId,
        symbol: input.symbol,
        error: (error as Error).message,
      });

      return this.createFailedOutput(input, startTime, auditTrail, error as Error);
    }
  }

  /**
   * Plan execution order based on dependencies and priority
   */
  private planExecutionOrder(requestedModules: AIModuleName[]): AIModuleName[] {
    const visited = new Set<AIModuleName>();
    const visiting = new Set<AIModuleName>();
    const result: AIModuleName[] = [];

    const visit = (moduleName: AIModuleName) => {
      if (visited.has(moduleName)) return;
      if (visiting.has(moduleName)) {
        throw new Error(`Circular dependency detected involving ${moduleName}`);
      }

      visiting.add(moduleName);
      
      const config = this.moduleConfigs[moduleName];
      if (config && config.dependencies) {
        for (const dep of config.dependencies) {
          if (requestedModules.includes(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(moduleName);
      visited.add(moduleName);
      result.push(moduleName);
    };

    // Sort by priority first, then visit
    const sortedModules = [...requestedModules].sort((a, b) => {
      const priorityA = this.moduleConfigs[a]?.priority || 5;
      const priorityB = this.moduleConfigs[b]?.priority || 5;
      return priorityB - priorityA; // Higher priority first
    });

    for (const moduleName of sortedModules) {
      visit(moduleName);
    }

    return result;
  }

  /**
   * Execute individual AI module with retry and fallback logic
   */
  private async executeModule(
    moduleName: AIModuleName,
    input: OrchestrationInput,
    previousResults: any,
    auditTrail: PromptExecution[]
  ): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    attempts: number;
    usedFallback: boolean;
    qualityScore?: number;
    apiCalls?: number;
    tokens?: number;
  }> {
    const config = this.moduleConfigs[moduleName];
    const maxRetries = input.retryConfig?.maxRetries || config.maxRetries;
    let attempts = 0;
    let usedFallback = false;
    let lastError: string | undefined;

    while (attempts < maxRetries) {
      attempts++;
      const executionId = `${input.sessionId}_${moduleName}_${attempts}`;
      const promptType = attempts === 1 ? 'primary' : usedFallback ? 'fallback' : 'retry';
      
      const execution: PromptExecution = {
        id: executionId,
        sessionId: input.sessionId,
        moduleName,
        model: this.getModelForModule(moduleName),
        promptType,
        attempt: attempts,
        startTime: Date.now(),
        success: false,
        inputHash: this.hashInput(input.inputs[moduleName]),
        metadata: {
          priority: input.priority,
          timeoutMs: config.timeoutMs,
          usedFallback,
        },
      };

      try {
        // Check rate limits before execution
        await this.waitForRateLimit(execution.model);

        const moduleInput = this.prepareModuleInput(moduleName, input, previousResults);
        const result = await this.callModule(moduleName, moduleInput, config.timeoutMs);

        execution.endTime = Date.now();
        execution.success = true;
        execution.outputHash = this.hashOutput(result);
        execution.qualityScore = this.assessOutputQuality(moduleName, result);

        // Store execution in database
        await this.storeExecution(execution);
        auditTrail.push(execution);

        // Update rate limits
        this.updateRateLimits(execution.model, result.tokenUsage);

        return {
          success: true,
          output: result,
          attempts,
          usedFallback,
          qualityScore: execution.qualityScore,
          apiCalls: 1,
          tokens: result.tokenUsage?.totalTokens || 0,
        };
      } catch (error) {
        execution.endTime = Date.now();
        execution.errorMessage = (error as Error).message;
        lastError = execution.errorMessage;

        // Store failed execution
        await this.storeExecution(execution);
        auditTrail.push(execution);

        // Try fallback if available and not already used
        if (!usedFallback && config.fallbackEnabled && attempts < maxRetries) {
          usedFallback = true;
          loggerUtils.aiLogger.warn('Module execution failed, trying fallback', {
            moduleName,
            attempt: attempts,
            error: (error as Error).message,
          });
          continue;
        }

        // Wait before retry
        if (attempts < maxRetries) {
          const backoffMs = input.retryConfig?.backoffMs || (attempts * 1000);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      usedFallback,
    };
  }

  /**
   * Get appropriate model for module
   */
  private getModelForModule(moduleName: AIModuleName): string {
    const modelMap: Record<AIModuleName, string> = {
      sector: 'gpt-4-turbo',
      risk: 'gpt-4-turbo',
      technical: 'gpt-3.5-turbo', // Can use faster model for technical
      reddit: 'gpt-3.5-turbo',
      earningsDrift: 'gpt-4-turbo',
      anomaly: 'gpt-4-turbo',
      fusion: 'gpt-4o', // Use most advanced model for fusion
      validator: 'gpt-4-turbo',
    };

    return modelMap[moduleName] || 'gpt-4-turbo';
  }

  /**
   * Prepare input for specific module
   */
  private prepareModuleInput(
    moduleName: AIModuleName,
    input: OrchestrationInput,
    previousResults: any
  ): any {
    const baseInput = input.inputs[moduleName];

    switch (moduleName) {
      case 'fusion':
        return {
          symbol: input.symbol,
          currentPrice: 100, // Would get from market data
          marketContext: {
            vixLevel: 20,
            marketTrend: 'neutral' as const,
            sectorPerformance: 0.02,
            timeOfDay: 'mid_day' as const,
          },
          moduleOutputs: {
            sector: previousResults.sector,
            risk: previousResults.risk,
            technical: previousResults.technical,
            reddit: previousResults.reddit,
            earningsDrift: previousResults.earningsDrift,
            anomaly: previousResults.anomaly,
          },
          ...baseInput,
        };

      case 'validator':
        if (!previousResults.fusion || !previousResults.fusion.tradeCards?.length) {
          throw new Error('Validation requires fusion results with trade cards');
        }

        const tradeCard = previousResults.fusion.tradeCards[0]; // Validate first trade card
        return {
          tradeCard,
          moduleInputs: {
            sector: previousResults.sector,
            risk: previousResults.risk,
            technical: previousResults.technical,
            reddit: previousResults.reddit,
            earningsDrift: previousResults.earningsDrift,
            anomaly: previousResults.anomaly,
          },
          marketData: {
            currentPrice: 100,
            avgDailyVolume: 1000000,
            avgTrueRange: 0.025,
            historicalMoves: {
              day1: [-0.05, 0.03, -0.02, 0.07, -0.01, 0.04, -0.03],
              day3: [-0.08, 0.06, -0.04, 0.12, -0.02, 0.09, -0.05],
              week1: [-0.12, 0.10, -0.07, 0.18, -0.03, 0.15, -0.08],
            },
            supportLevels: [95, 92, 89],
            resistanceLevels: [105, 108, 112],
          },
          validationSettings: {
            strictness: 'standard' as const,
            hallucinationThreshold: 0.8,
            rejectThreshold: 0.6,
          },
          ...baseInput,
        };

      default:
        return baseInput;
    }
  }

  /**
   * Call specific AI module
   */
  private async callModule(moduleName: AIModuleName, moduleInput: any, timeoutMs: number): Promise<any> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Module ${moduleName} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const modulePromise = this.getModuleMethod(moduleName)(moduleInput);

    return Promise.race([modulePromise, timeoutPromise]);
  }

  /**
   * Get module execution method
   */
  private getModuleMethod(moduleName: AIModuleName): (input: any) => Promise<any> {
    switch (moduleName) {
      case 'sector':
        return (input) => this.sectorIntelligence.analyzeSector(input);
      case 'risk':
        return (input) => this.riskAssessor.assessRisk(input);
      case 'technical':
        return (input) => this.technicalTiming.analyzeTiming(input);
      case 'reddit':
        return (input) => this.redditNLP.analyzeRedditSentiment(input);
      case 'earningsDrift':
        return (input) => this.earningsDrift.analyzeDrift(input);
      case 'fusion':
        return (input) => this.strategicFusion.generateTradeCards([input]);
      case 'validator':
        return (input) => this.tradeValidator.validateTrade(input);
      case 'anomaly':
        // Placeholder for anomaly module
        return async (input) => ({
          symbol: input.symbol || 'UNKNOWN',
          timestamp: Date.now(),
          investigation: {
            primary_catalyst: 'Pattern detected',
            catalyst_confidence: 0.7,
            hidden_factors: ['Institutional flow'],
            correlation_strength: 0.6,
            explanation: 'Algorithmic trading pattern identified',
            market_structure_impact: 'Moderate liquidity impact',
            follow_through_probability: 0.65,
          },
          data_sources: {
            news_correlation: 0.3,
            social_correlation: 0.5,
            insider_correlation: 0.2,
            options_correlation: 0.8,
          },
          metadata: {
            model_used: 'gpt-4-turbo',
            processing_time: 1000,
            confidence_score: 0.7,
          },
        });
      default:
        throw new Error(`Unknown module: ${moduleName}`);
    }
  }

  /**
   * Rate limiting management
   */
  private async waitForRateLimit(model: string): Promise<void> {
    const limit = this.rateLimits.get(model);
    if (!limit) return;

    // Reset counters if time has passed
    if (Date.now() >= limit.resetTime) {
      limit.currentRequests = 0;
      limit.currentTokens = 0;
      limit.resetTime = Date.now() + 60000;
    }

    // Wait if rate limit would be exceeded
    if (limit.currentRequests >= limit.requestsPerMinute) {
      const waitTime = limit.resetTime - Date.now();
      if (waitTime > 0) {
        loggerUtils.aiLogger.info('Rate limit reached, waiting', {
          model,
          waitTime,
        });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    limit.currentRequests++;
  }

  private updateRateLimits(model: string, tokenUsage?: any): void {
    const limit = this.rateLimits.get(model);
    if (limit && tokenUsage) {
      limit.currentTokens += tokenUsage.totalTokens || 0;
    }
  }

  private resetRateLimits(): void {
    const now = Date.now();
    this.rateLimits.forEach((limit) => {
      if (now >= limit.resetTime) {
        limit.currentRequests = 0;
        limit.currentTokens = 0;
        limit.resetTime = now + 60000;
      }
    });
  }

  /**
   * Database operations
   */
  private async storeExecution(execution: PromptExecution): Promise<void> {
    if (!this.database) return;

    try {
      await this.database.run(`
        INSERT INTO prompt_executions (
          id, session_id, module_name, model, prompt_type, attempt,
          start_time, end_time, success, error_message, input_hash, output_hash,
          prompt_tokens, completion_tokens, total_tokens, quality_score, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        execution.id,
        execution.sessionId,
        execution.moduleName,
        execution.model,
        execution.promptType,
        execution.attempt,
        execution.startTime,
        execution.endTime,
        execution.success,
        execution.errorMessage,
        execution.inputHash,
        execution.outputHash,
        execution.tokenUsage?.promptTokens,
        execution.tokenUsage?.completionTokens,
        execution.tokenUsage?.totalTokens,
        execution.qualityScore,
        JSON.stringify(execution.metadata),
      ]);
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to store prompt execution', {
        executionId: execution.id,
        error: (error as Error).message,
      });
    }
  }

  private async storeSessionStart(input: OrchestrationInput, startTime: number): Promise<void> {
    if (!this.database) return;

    try {
      await this.database.run(`
        INSERT INTO orchestration_sessions (
          session_id, symbol, priority, requested_modules, start_time
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        input.sessionId,
        input.symbol,
        input.priority,
        JSON.stringify(input.requestedModules),
        startTime,
      ]);
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to store session start', {
        sessionId: input.sessionId,
        error: (error as Error).message,
      });
    }
  }

  private async storeSessionEnd(sessionId: string, endData: any): Promise<void> {
    if (!this.database) return;

    try {
      await this.database.run(`
        UPDATE orchestration_sessions SET
          end_time = ?, success = ?, total_processing_time = ?,
          api_calls_total = ?, tokens_used_total = ?, completed_modules = ?,
          failed_modules = ?, issues_count = ?
        WHERE session_id = ?
      `, [
        endData.endTime,
        endData.success,
        endData.totalProcessingTime,
        endData.apiCallsTotal,
        endData.tokensUsedTotal,
        JSON.stringify(endData.completedModules),
        JSON.stringify(endData.failedModules),
        endData.issuesCount,
        sessionId,
      ]);
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to store session end', {
        sessionId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Utility methods
   */
  private hashInput(input: any): string {
    if (!input) return 'empty';
    return Buffer.from(JSON.stringify(input)).toString('base64').substring(0, 32);
  }

  private hashOutput(output: any): string {
    if (!output) return 'empty';
    return Buffer.from(JSON.stringify(output)).toString('base64').substring(0, 32);
  }

  private assessOutputQuality(moduleName: AIModuleName, output: any): number {
    // Basic quality assessment - could be enhanced with module-specific logic
    if (!output) return 0;
    
    let quality = 0.5; // Base quality
    
    // Check for required fields based on module
    switch (moduleName) {
      case 'fusion':
        if (output.tradeCards?.length > 0) quality += 0.3;
        if (output.marketOverview) quality += 0.1;
        if (output.portfolioGuidance) quality += 0.1;
        break;
      
      case 'validator':
        if (output.validation_result?.validation_score > 0.7) quality += 0.3;
        if (output.identified_issues?.length >= 0) quality += 0.1;
        if (output.improvement_suggestions) quality += 0.1;
        break;
      
      default:
        if (output.analysis || output.assessment) quality += 0.3;
        if (output.metadata?.confidence_score > 0.7) quality += 0.2;
    }
    
    return Math.min(quality, 1.0);
  }

  private createFailedOutput(
    input: OrchestrationInput,
    startTime: number,
    auditTrail: PromptExecution[],
    error: Error
  ): OrchestrationOutput {
    return {
      sessionId: input.sessionId,
      symbol: input.symbol,
      timestamp: Date.now(),
      success: false,
      completedModules: [],
      failedModules: input.requestedModules,
      results: {},
      execution_metadata: {
        totalProcessingTime: Date.now() - startTime,
        moduleExecutionTimes: {},
        retryAttempts: {},
        fallbacksUsed: [],
        apiCallsTotal: 0,
        tokensUsedTotal: 0,
        qualityScores: {},
      },
      audit_trail: auditTrail,
      issues: [{
        moduleName: 'fusion', // Default to fusion as main orchestrator
        severity: 'critical',
        message: `Orchestration failed: ${error.message}`,
        suggestion: 'Check system logs and module configurations',
      }],
    };
  }

  /**
   * Analytics and monitoring methods
   */
  async getSessionAnalytics(sessionId: string): Promise<any> {
    if (!this.database) return null;

    try {
      const session = await this.database.get(`
        SELECT * FROM orchestration_sessions WHERE session_id = ?
      `, [sessionId]);

      const executions = await this.database.all(`
        SELECT * FROM prompt_executions WHERE session_id = ? ORDER BY start_time
      `, [sessionId]);

      return {
        session,
        executions,
        summary: {
          totalExecutions: executions.length,
          successfulExecutions: executions.filter(e => e.success).length,
          totalTokens: executions.reduce((sum, e) => sum + (e.total_tokens || 0), 0),
          avgQualityScore: executions.reduce((sum, e) => sum + (e.quality_score || 0), 0) / executions.length,
        },
      };
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get session analytics', {
        sessionId,
        error: (error as Error).message,
      });
      return null;
    }
  }

  async getSystemMetrics(timeRangeMs: number = 24 * 60 * 60 * 1000): Promise<any> {
    if (!this.database) return null;

    const cutoff = Date.now() - timeRangeMs;

    try {
      const sessions = await this.database.all(`
        SELECT 
          COUNT(*) as total_sessions,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_sessions,
          AVG(total_processing_time) as avg_processing_time,
          SUM(api_calls_total) as total_api_calls,
          SUM(tokens_used_total) as total_tokens
        FROM orchestration_sessions 
        WHERE start_time > ?
      `, [cutoff]);

      const moduleMetrics = await this.database.all(`
        SELECT 
          module_name,
          COUNT(*) as total_executions,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
          AVG(quality_score) as avg_quality_score,
          SUM(total_tokens) as total_tokens
        FROM prompt_executions 
        WHERE start_time > ?
        GROUP BY module_name
      `, [cutoff]);

      return {
        timeRange: timeRangeMs,
        sessions: sessions[0],
        moduleMetrics,
        generatedAt: Date.now(),
      };
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get system metrics', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Configuration management
   */
  updateModuleConfig(moduleName: AIModuleName, config: Partial<ModuleConfig>): void {
    this.moduleConfigs[moduleName] = {
      ...this.moduleConfigs[moduleName],
      ...config,
    };

    loggerUtils.aiLogger.info('Module configuration updated', {
      moduleName,
      newConfig: this.moduleConfigs[moduleName],
    });
  }

  getModuleConfig(moduleName: AIModuleName): ModuleConfig {
    return this.moduleConfigs[moduleName];
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    if (this.database) {
      await this.database.close();
      this.database = null;
    }
  }
}

export default PromptOrchestrator;
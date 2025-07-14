/**
 * Daily Pipeline Automation
 * Orchestrates complete data collection, analysis, and trade generation workflow
 */

import cron from 'node-cron';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';
import PromptOrchestrator, { OrchestrationInput, AIModuleName } from '../ai/PromptOrchestrator.js';
import TradeCardGenerator from '../trading/TradeCardGenerator.js';
import PerformanceTracker from '../analytics/PerformanceTracker.js';

// Import data preprocessing services
import DataPreprocessor from '../services/DataPreprocessor.js';

// Import collectors
import RedditCollector from '../collectors/RedditCollector.js';
import TwitterCollector from '../collectors/TwitterCollector.js';
import NewsCollector from '../collectors/NewsCollector.js';
import InsiderTradingCollector from '../collectors/InsiderTradingCollector.js';
import CongressionalTradingCollector from '../collectors/CongressionalTradingCollector.js';

export interface PipelineConfig {
  schedules: {
    preMarket: string;     // e.g., "30 8 * * 1-5" (8:30 AM weekdays)
    midDay: string;        // e.g., "0 12 * * 1-5" (12:00 PM weekdays)
    postMarket: string;    // e.g., "30 16 * * 1-5" (4:30 PM weekdays)
    weekend: string;       // e.g., "0 10 * * 6" (10:00 AM Saturday)
  };
  watchlist: string[];
  notifications: {
    enabled: boolean;
    webhookUrl?: string;
    emailConfig?: {
      enabled: boolean;
      recipients: string[];
      smtpConfig: any;
    };
    slackConfig?: {
      enabled: boolean;
      webhookUrl: string;
      channel: string;
    };
  };
  failureHandling: {
    maxRetries: number;
    backoffMultiplier: number;
    partialAnalysisThreshold: number; // Minimum % of modules that must succeed
    fallbackSymbols: string[]; // Backup symbols if primary watchlist fails
  };
  marketHours: {
    timezone: string;
    tradingHours: {
      start: string; // "09:30"
      end: string;   // "16:00"
    };
    holidays: string[]; // ISO date strings
  };
}

export interface PipelineExecution {
  id: string;
  trigger: 'scheduled' | 'manual' | 'event_driven';
  startTime: number;
  endTime?: number;
  success: boolean;
  phase: 'data_collection' | 'preprocessing' | 'ai_analysis' | 'trade_generation' | 'notification' | 'completed' | 'failed';
  
  metrics: {
    symbolsProcessed: number;
    dataSourcesCollected: number;
    aiModulesExecuted: number;
    tradesGenerated: number;
    highConvictionTrades: number;
    processingTimeMs: number;
    apiCallsTotal: number;
    errorsCount: number;
  };
  
  phases: {
    dataCollection: {
      startTime: number;
      endTime?: number;
      success: boolean;
      sourcesCollected: string[];
      sourcesFailed: string[];
      symbolsCollected: string[];
      symbolsFailed: string[];
      dataQualityScore: number;
    };
    preprocessing: {
      startTime: number;
      endTime?: number;
      success: boolean;
      recordsProcessed: number;
      dataQualityImprovement: number;
      processingErrors: string[];
    };
    aiAnalysis: {
      startTime: number;
      endTime?: number;
      success: boolean;
      modulesExecuted: Record<AIModuleName, boolean>;
      averageConfidence: number;
      qualityScores: Record<AIModuleName, number>;
      analysisErrors: string[];
    };
    tradeGeneration: {
      startTime: number;
      endTime?: number;
      success: boolean;
      cardsGenerated: number;
      highConvictionCount: number;
      averageConfidence: number;
      categoriesCovered: string[];
    };
    notification: {
      startTime: number;
      endTime?: number;
      success: boolean;
      notificationsSent: number;
      notificationsFailed: number;
      channels: string[];
    };
  };
  
  errors: Array<{
    phase: string;
    module: string;
    error: string;
    timestamp: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  
  outputs: {
    tradeCards?: any;
    marketAnalysis?: any;
    anomalies?: any;
    notifications?: any;
  };
}

export interface NotificationMessage {
  type: 'high_conviction_trade' | 'market_anomaly' | 'pipeline_failure' | 'daily_summary';
  title: string;
  message: string;
  data?: any;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export class DailyPipeline {
  private dataHub: DataHub;
  private orchestrator: PromptOrchestrator;
  private tradeCardGenerator: TradeCardGenerator;
  private performanceTracker: PerformanceTracker;
  private dataPreprocessor: DataPreprocessor;
  
  // Data collectors
  private redditCollector: RedditCollector;
  private twitterCollector: TwitterCollector;
  private newsCollector: NewsCollector;
  private insiderTradingCollector: InsiderTradingCollector;
  private congressionalTradingCollector: CongressionalTradingCollector;
  
  private config: PipelineConfig;
  private isRunning: boolean = false;
  private currentExecution: PipelineExecution | null = null;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    dataHub: DataHub,
    orchestrator: PromptOrchestrator,
    tradeCardGenerator: TradeCardGenerator,
    performanceTracker: PerformanceTracker,
    config: PipelineConfig
  ) {
    this.dataHub = dataHub;
    this.orchestrator = orchestrator;
    this.tradeCardGenerator = tradeCardGenerator;
    this.performanceTracker = performanceTracker;
    this.config = config;
    
    // Initialize preprocessor and collectors
    this.dataPreprocessor = new DataPreprocessor(dataHub);
    this.redditCollector = new RedditCollector();
    this.twitterCollector = new TwitterCollector();
    this.newsCollector = new NewsCollector();
    this.insiderTradingCollector = new InsiderTradingCollector();
    this.congressionalTradingCollector = new CongressionalTradingCollector();
    
    this.initializeSchedules();
  }

  /**
   * Initialize all scheduled jobs
   */
  private initializeSchedules(): void {
    loggerUtils.aiLogger.info('Initializing pipeline schedules', {
      preMarket: this.config.schedules.preMarket,
      midDay: this.config.schedules.midDay,
      postMarket: this.config.schedules.postMarket,
      weekend: this.config.schedules.weekend,
    });

    // Pre-market analysis (data prep and early signals)
    const preMarketJob = cron.schedule(this.config.schedules.preMarket, async () => {
      if (this.isMarketDay() && !this.isRunning) {
        await this.runPipeline('scheduled', 'pre_market');
      }
    }, { scheduled: false, timezone: this.config.marketHours.timezone });

    // Mid-day update (momentum and sentiment refresh)
    const midDayJob = cron.schedule(this.config.schedules.midDay, async () => {
      if (this.isMarketDay() && this.isMarketOpen() && !this.isRunning) {
        await this.runPipeline('scheduled', 'mid_day');
      }
    }, { scheduled: false, timezone: this.config.marketHours.timezone });

    // Post-market analysis (full comprehensive analysis)
    const postMarketJob = cron.schedule(this.config.schedules.postMarket, async () => {
      if (this.isMarketDay() && !this.isRunning) {
        await this.runPipeline('scheduled', 'post_market');
      }
    }, { scheduled: false, timezone: this.config.marketHours.timezone });

    // Weekend deep analysis
    const weekendJob = cron.schedule(this.config.schedules.weekend, async () => {
      if (!this.isRunning) {
        await this.runPipeline('scheduled', 'weekend');
      }
    }, { scheduled: false, timezone: this.config.marketHours.timezone });

    this.scheduledJobs.set('preMarket', preMarketJob);
    this.scheduledJobs.set('midDay', midDayJob);
    this.scheduledJobs.set('postMarket', postMarketJob);
    this.scheduledJobs.set('weekend', weekendJob);
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    loggerUtils.aiLogger.info('Starting daily pipeline automation');
    
    this.scheduledJobs.forEach((job, name) => {
      job.start();
      loggerUtils.aiLogger.info(`Scheduled job started: ${name}`);
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    loggerUtils.aiLogger.info('Stopping daily pipeline automation');
    
    this.scheduledJobs.forEach((job, name) => {
      job.stop();
      loggerUtils.aiLogger.info(`Scheduled job stopped: ${name}`);
    });
  }

  /**
   * Manual pipeline trigger
   */
  async runManualPipeline(
    symbols?: string[],
    modules?: AIModuleName[],
    options?: {
      skipDataCollection?: boolean;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      notifications?: boolean;
    }
  ): Promise<PipelineExecution> {
    if (this.isRunning) {
      throw new Error('Pipeline is already running. Please wait for completion or stop the current execution.');
    }

    loggerUtils.aiLogger.info('Manual pipeline execution requested', {
      symbols: symbols?.length || 'default',
      modules: modules?.length || 'all',
      options,
    });

    return this.runPipeline('manual', 'full', symbols, modules, options);
  }

  /**
   * Main pipeline execution method
   */
  private async runPipeline(
    trigger: 'scheduled' | 'manual' | 'event_driven',
    mode: 'pre_market' | 'mid_day' | 'post_market' | 'weekend' | 'full',
    symbols?: string[],
    modules?: AIModuleName[],
    options?: any
  ): Promise<PipelineExecution> {
    const executionId = `${Date.now()}_${trigger}_${mode}`;
    const startTime = Date.now();
    
    this.isRunning = true;
    
    // Initialize execution tracking
    this.currentExecution = {
      id: executionId,
      trigger,
      startTime,
      success: false,
      phase: 'data_collection',
      metrics: {
        symbolsProcessed: 0,
        dataSourcesCollected: 0,
        aiModulesExecuted: 0,
        tradesGenerated: 0,
        highConvictionTrades: 0,
        processingTimeMs: 0,
        apiCallsTotal: 0,
        errorsCount: 0,
      },
      phases: {} as any,
      errors: [],
      outputs: {},
    };

    try {
      loggerUtils.aiLogger.info('Pipeline execution started', {
        executionId,
        trigger,
        mode,
        symbolCount: symbols?.length || this.config.watchlist.length,
      });

      // Determine symbols and modules based on mode
      const targetSymbols = symbols || this.getSymbolsForMode(mode);
      const targetModules = modules || this.getModulesForMode(mode);

      // Phase 1: Data Collection
      const dataCollectionResult = await this.executeDataCollection(targetSymbols, mode, options);
      this.currentExecution.phases.dataCollection = dataCollectionResult;
      
      if (!dataCollectionResult.success && dataCollectionResult.dataQualityScore < this.config.failureHandling.partialAnalysisThreshold) {
        throw new Error('Data collection failed below acceptable threshold');
      }

      // Phase 2: Data Preprocessing
      this.currentExecution.phase = 'preprocessing';
      const preprocessingResult = await this.executePreprocessing(dataCollectionResult);
      this.currentExecution.phases.preprocessing = preprocessingResult;

      // Phase 3: AI Analysis
      this.currentExecution.phase = 'ai_analysis';
      const aiAnalysisResult = await this.executeAIAnalysis(targetSymbols, targetModules, dataCollectionResult);
      this.currentExecution.phases.aiAnalysis = aiAnalysisResult;

      // Phase 4: Trade Generation
      this.currentExecution.phase = 'trade_generation';
      const tradeGenerationResult = await this.executeTradeGeneration(aiAnalysisResult);
      this.currentExecution.phases.tradeGeneration = tradeGenerationResult;

      // Phase 5: Notifications
      this.currentExecution.phase = 'notification';
      const notificationResult = await this.executeNotifications(tradeGenerationResult, mode, options);
      this.currentExecution.phases.notification = notificationResult;

      // Mark as completed
      this.currentExecution.phase = 'completed';
      this.currentExecution.success = true;
      this.currentExecution.endTime = Date.now();
      this.currentExecution.metrics.processingTimeMs = this.currentExecution.endTime - startTime;

      // Update performance tracking
      await this.updatePerformanceTracking();

      loggerUtils.aiLogger.info('Pipeline execution completed successfully', {
        executionId,
        processingTime: this.currentExecution.metrics.processingTimeMs,
        tradesGenerated: this.currentExecution.metrics.tradesGenerated,
        highConvictionTrades: this.currentExecution.metrics.highConvictionTrades,
      });

    } catch (error) {
      this.currentExecution.phase = 'failed';
      this.currentExecution.success = false;
      this.currentExecution.endTime = Date.now();
      this.currentExecution.metrics.processingTimeMs = this.currentExecution.endTime! - startTime;
      
      this.addError('pipeline', 'execution', (error as Error).message, 'critical');
      
      loggerUtils.aiLogger.error('Pipeline execution failed', {
        executionId,
        error: (error as Error).message,
        phase: this.currentExecution.phase,
        processingTime: this.currentExecution.metrics.processingTimeMs,
      });

      // Send failure notification
      if (this.config.notifications.enabled) {
        await this.sendNotification({
          type: 'pipeline_failure',
          title: 'Pipeline Execution Failed',
          message: `Pipeline ${executionId} failed during ${this.currentExecution.phase}: ${(error as Error).message}`,
          urgency: 'critical',
          timestamp: Date.now(),
        });
      }
    } finally {
      this.isRunning = false;
      
      // Store execution results for debugging
      await this.storeExecutionResults(this.currentExecution);
      
      const executionResult = { ...this.currentExecution };
      this.currentExecution = null;
      
      return executionResult;
    }
  }

  /**
   * Execute data collection phase
   */
  private async executeDataCollection(
    symbols: string[],
    mode: string,
    options?: any
  ): Promise<any> {
    const startTime = Date.now();
    const sourcesCollected: string[] = [];
    const sourcesFailed: string[] = [];
    const symbolsCollected: string[] = [];
    const symbolsFailed: string[] = [];
    let totalRecords = 0;
    let successfulRecords = 0;

    loggerUtils.aiLogger.info('Starting data collection phase', {
      symbolCount: symbols.length,
      mode,
      skipDataCollection: options?.skipDataCollection,
    });

    if (options?.skipDataCollection) {
      return {
        startTime,
        endTime: Date.now(),
        success: true,
        sourcesCollected: ['cached_data'],
        sourcesFailed: [],
        symbolsCollected: symbols,
        symbolsFailed: [],
        dataQualityScore: 0.8, // Assume reasonable quality for cached data
      };
    }

    // Collect data from various sources
    const collectors = [
      { name: 'reddit', collector: this.redditCollector },
      { name: 'twitter', collector: this.twitterCollector },
      { name: 'news', collector: this.newsCollector },
      { name: 'insider_trading', collector: this.insiderTradingCollector },
      { name: 'congressional_trading', collector: this.congressionalTradingCollector },
    ];

    for (const symbol of symbols) {
      let symbolSuccess = false;
      
      for (const { name, collector } of collectors) {
        try {
          const data = await this.collectSymbolData(collector, symbol, mode);
          if (data && Object.keys(data).length > 0) {
            totalRecords++;
            successfulRecords++;
            symbolSuccess = true;
            
            if (!sourcesCollected.includes(name)) {
              sourcesCollected.push(name);
            }
          }
        } catch (error) {
          this.addError('data_collection', name, `Failed to collect ${name} data for ${symbol}: ${(error as Error).message}`, 'medium');
          
          totalRecords++;
          if (!sourcesFailed.includes(name)) {
            sourcesFailed.push(name);
          }
        }
      }

      if (symbolSuccess) {
        symbolsCollected.push(symbol);
      } else {
        symbolsFailed.push(symbol);
      }

      // Implement delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const dataQualityScore = totalRecords > 0 ? successfulRecords / totalRecords : 0;
    const success = dataQualityScore >= this.config.failureHandling.partialAnalysisThreshold;

    this.currentExecution!.metrics.symbolsProcessed = symbolsCollected.length;
    this.currentExecution!.metrics.dataSourcesCollected = sourcesCollected.length;

    loggerUtils.aiLogger.info('Data collection phase completed', {
      symbolsCollected: symbolsCollected.length,
      symbolsFailed: symbolsFailed.length,
      sourcesCollected: sourcesCollected.length,
      sourcesFailed: sourcesFailed.length,
      dataQualityScore,
      success,
    });

    return {
      startTime,
      endTime: Date.now(),
      success,
      sourcesCollected,
      sourcesFailed,
      symbolsCollected,
      symbolsFailed,
      dataQualityScore,
    };
  }

  /**
   * Execute preprocessing phase
   */
  private async executePreprocessing(dataCollectionResult: any): Promise<any> {
    const startTime = Date.now();
    
    loggerUtils.aiLogger.info('Starting preprocessing phase', {
      symbolsToProcess: dataCollectionResult.symbolsCollected.length,
    });

    try {
      const processingResult = await this.dataPreprocessor.processCollectedData(
        dataCollectionResult.symbolsCollected
      );

      const success = processingResult.success;
      const recordsProcessed = processingResult.recordsProcessed || 0;
      const dataQualityImprovement = processingResult.qualityImprovement || 0;
      const processingErrors = processingResult.errors || [];

      loggerUtils.aiLogger.info('Preprocessing phase completed', {
        success,
        recordsProcessed,
        dataQualityImprovement,
        errorsCount: processingErrors.length,
      });

      return {
        startTime,
        endTime: Date.now(),
        success,
        recordsProcessed,
        dataQualityImprovement,
        processingErrors,
      };
    } catch (error) {
      this.addError('preprocessing', 'data_processor', (error as Error).message, 'high');
      
      return {
        startTime,
        endTime: Date.now(),
        success: false,
        recordsProcessed: 0,
        dataQualityImprovement: 0,
        processingErrors: [(error as Error).message],
      };
    }
  }

  /**
   * Execute AI analysis phase
   */
  private async executeAIAnalysis(
    symbols: string[],
    modules: AIModuleName[],
    dataCollectionResult: any
  ): Promise<any> {
    const startTime = Date.now();
    const modulesExecuted: Record<AIModuleName, boolean> = {} as any;
    const qualityScores: Record<AIModuleName, number> = {} as any;
    const analysisErrors: string[] = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    loggerUtils.aiLogger.info('Starting AI analysis phase', {
      symbolCount: symbols.length,
      moduleCount: modules.length,
    });

    for (const symbol of symbols) {
      try {
        const orchestrationInput: OrchestrationInput = {
          sessionId: `${this.currentExecution!.id}_${symbol}`,
          symbol,
          requestedModules: modules,
          priority: 'normal',
          allowFallbacks: true,
          requireValidation: true,
          inputs: await this.prepareModuleInputs(symbol, dataCollectionResult),
        };

        const result = await this.orchestrator.orchestrate(orchestrationInput);
        
        // Track module execution success
        result.completedModules.forEach(module => {
          modulesExecuted[module] = true;
        });
        
        result.failedModules.forEach(module => {
          modulesExecuted[module] = false;
        });

        // Track quality scores
        Object.entries(result.execution_metadata.qualityScores).forEach(([module, score]) => {
          qualityScores[module as AIModuleName] = score;
        });

        // Track confidence
        if (result.results.fusion?.tradeCards) {
          result.results.fusion.tradeCards.forEach((card: any) => {
            totalConfidence += card.header.confidence;
            confidenceCount++;
          });
        }

        this.currentExecution!.metrics.apiCallsTotal += result.execution_metadata.apiCallsTotal;
        
      } catch (error) {
        this.addError('ai_analysis', symbol, (error as Error).message, 'high');
        analysisErrors.push(`${symbol}: ${(error as Error).message}`);
      }
    }

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
    const success = Object.values(modulesExecuted).filter(Boolean).length >= modules.length * this.config.failureHandling.partialAnalysisThreshold;
    
    this.currentExecution!.metrics.aiModulesExecuted = Object.values(modulesExecuted).filter(Boolean).length;

    loggerUtils.aiLogger.info('AI analysis phase completed', {
      success,
      modulesExecuted: Object.values(modulesExecuted).filter(Boolean).length,
      averageConfidence,
      errorsCount: analysisErrors.length,
    });

    return {
      startTime,
      endTime: Date.now(),
      success,
      modulesExecuted,
      averageConfidence,
      qualityScores,
      analysisErrors,
    };
  }

  /**
   * Execute trade generation phase
   */
  private async executeTradeGeneration(aiAnalysisResult: any): Promise<any> {
    const startTime = Date.now();
    
    loggerUtils.aiLogger.info('Starting trade generation phase');

    try {
      // This would integrate with actual AI results from the analysis phase
      // For now, we'll create a placeholder structure
      const fusionResults = []; // Would get from aiAnalysisResult
      const validationResults = []; // Would get from aiAnalysisResult
      const marketContext = {
        vixLevel: 20,
        marketTrend: 'neutral',
        sectorPerformance: 0.02,
        timeOfDay: 'post_market',
      };

      const tradeCards = await this.tradeCardGenerator.generateDailyCards(
        fusionResults,
        validationResults,
        marketContext
      );

      const cardsGenerated = tradeCards.json.cards.length;
      const highConvictionCount = tradeCards.json.summary.highConfidenceCards;
      const averageConfidence = tradeCards.json.summary.averageConfidence;
      const categoriesCovered = Object.keys(tradeCards.json.summary.categories);

      this.currentExecution!.metrics.tradesGenerated = cardsGenerated;
      this.currentExecution!.metrics.highConvictionTrades = highConvictionCount;
      this.currentExecution!.outputs.tradeCards = tradeCards;

      loggerUtils.aiLogger.info('Trade generation phase completed', {
        cardsGenerated,
        highConvictionCount,
        averageConfidence,
        categoriesCovered: categoriesCovered.length,
      });

      return {
        startTime,
        endTime: Date.now(),
        success: true,
        cardsGenerated,
        highConvictionCount,
        averageConfidence,
        categoriesCovered,
      };
    } catch (error) {
      this.addError('trade_generation', 'card_generator', (error as Error).message, 'high');
      
      return {
        startTime,
        endTime: Date.now(),
        success: false,
        cardsGenerated: 0,
        highConvictionCount: 0,
        averageConfidence: 0,
        categoriesCovered: [],
      };
    }
  }

  /**
   * Execute notifications phase
   */
  private async executeNotifications(
    tradeGenerationResult: any,
    mode: string,
    options?: any
  ): Promise<any> {
    const startTime = Date.now();
    const channels: string[] = [];
    let notificationsSent = 0;
    let notificationsFailed = 0;

    if (!this.config.notifications.enabled || options?.notifications === false) {
      return {
        startTime,
        endTime: Date.now(),
        success: true,
        notificationsSent: 0,
        notificationsFailed: 0,
        channels: [],
      };
    }

    loggerUtils.aiLogger.info('Starting notifications phase', {
      highConvictionTrades: tradeGenerationResult.highConvictionCount,
      mode,
    });

    // Send high conviction trade notifications
    if (tradeGenerationResult.highConvictionCount > 0) {
      try {
        await this.sendNotification({
          type: 'high_conviction_trade',
          title: `${tradeGenerationResult.highConvictionCount} High Conviction Trade${tradeGenerationResult.highConvictionCount > 1 ? 's' : ''} Identified`,
          message: `StockGenius has identified ${tradeGenerationResult.highConvictionCount} high-conviction trading opportunities with average confidence of ${tradeGenerationResult.averageConfidence}%.`,
          data: this.currentExecution!.outputs.tradeCards,
          urgency: 'high',
          timestamp: Date.now(),
        });
        notificationsSent++;
        channels.push('high_conviction');
      } catch (error) {
        this.addError('notification', 'high_conviction', (error as Error).message, 'medium');
        notificationsFailed++;
      }
    }

    // Send daily summary for post-market runs
    if (mode === 'post_market' || mode === 'full') {
      try {
        await this.sendNotification({
          type: 'daily_summary',
          title: 'Daily Analysis Summary',
          message: `Daily pipeline completed: ${tradeGenerationResult.cardsGenerated} trades generated, ${this.currentExecution!.metrics.symbolsProcessed} symbols analyzed, ${this.currentExecution!.metrics.errorsCount} errors.`,
          data: {
            metrics: this.currentExecution!.metrics,
            tradeCards: this.currentExecution!.outputs.tradeCards?.json?.summary,
          },
          urgency: 'low',
          timestamp: Date.now(),
        });
        notificationsSent++;
        channels.push('daily_summary');
      } catch (error) {
        this.addError('notification', 'daily_summary', (error as Error).message, 'low');
        notificationsFailed++;
      }
    }

    loggerUtils.aiLogger.info('Notifications phase completed', {
      notificationsSent,
      notificationsFailed,
      channels,
    });

    return {
      startTime,
      endTime: Date.now(),
      success: notificationsFailed === 0,
      notificationsSent,
      notificationsFailed,
      channels,
    };
  }

  /**
   * Send notification to configured channels
   */
  private async sendNotification(notification: NotificationMessage): Promise<void> {
    loggerUtils.aiLogger.info('Sending notification', {
      type: notification.type,
      title: notification.title,
      urgency: notification.urgency,
    });

    const promises: Promise<void>[] = [];

    // Webhook notification
    if (this.config.notifications.webhookUrl) {
      promises.push(this.sendWebhookNotification(notification));
    }

    // Email notification
    if (this.config.notifications.emailConfig?.enabled) {
      promises.push(this.sendEmailNotification(notification));
    }

    // Slack notification
    if (this.config.notifications.slackConfig?.enabled) {
      promises.push(this.sendSlackNotification(notification));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Market hours and schedule utilities
   */
  private isMarketDay(): boolean {
    const now = new Date();
    const day = now.getDay();
    const dateString = now.toISOString().split('T')[0];
    
    // Check if it's a weekday (Monday = 1, Friday = 5)
    const isWeekday = day >= 1 && day <= 5;
    
    // Check if it's not a holiday
    const isNotHoliday = !this.config.marketHours.holidays.includes(dateString);
    
    return isWeekday && isNotHoliday;
  }

  private isMarketOpen(): boolean {
    if (!this.isMarketDay()) return false;
    
    const now = new Date();
    const timeString = now.toTimeString().substring(0, 5); // "HH:MM"
    
    return timeString >= this.config.marketHours.tradingHours.start && 
           timeString <= this.config.marketHours.tradingHours.end;
  }

  private getSymbolsForMode(mode: string): string[] {
    switch (mode) {
      case 'pre_market':
      case 'mid_day':
        return this.config.watchlist.slice(0, Math.min(10, this.config.watchlist.length)); // Subset for quick updates
      case 'post_market':
      case 'weekend':
      case 'full':
      default:
        return this.config.watchlist;
    }
  }

  private getModulesForMode(mode: string): AIModuleName[] {
    const allModules: AIModuleName[] = ['sector', 'risk', 'technical', 'reddit', 'earningsDrift', 'fusion', 'validator'];
    
    switch (mode) {
      case 'pre_market':
        return ['technical', 'sector', 'fusion']; // Quick technical and sector analysis
      case 'mid_day':
        return ['technical', 'reddit', 'fusion']; // Momentum and sentiment update
      case 'post_market':
      case 'weekend':
      case 'full':
      default:
        return allModules; // Complete analysis
    }
  }

  /**
   * Helper methods
   */
  private async collectSymbolData(collector: any, symbol: string, mode: string): Promise<any> {
    // This would call the appropriate collector method based on the collector type
    // For now, we'll return a placeholder
    return {
      symbol,
      data: `${collector.constructor.name} data for ${symbol}`,
      timestamp: Date.now(),
    };
  }

  private async prepareModuleInputs(symbol: string, dataCollectionResult: any): Promise<any> {
    // This would prepare the inputs for each AI module based on collected data
    // For now, we'll return placeholder inputs
    return {
      sector: {
        symbol,
        sector_classification: 'technology',
        recent_news: [],
        macro_indicators: {},
        peer_data: [],
      },
      risk: {
        symbol,
        timeHorizon: '1-3 days',
        tradeDirection: 'long',
        avgDailyVolume: 1000000,
        recentVolume5d: 1200000,
        bidAskSpread: 0.001,
        historicalVol30d: 0.25,
        currentPrice: 100,
        marketContext: {
          vixLevel: 20,
          marketTrend: 'neutral',
        },
      },
      // ... other module inputs
    };
  }

  private addError(phase: string, module: string, error: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    if (this.currentExecution) {
      this.currentExecution.errors.push({
        phase,
        module,
        error,
        timestamp: Date.now(),
        severity,
      });
      this.currentExecution.metrics.errorsCount++;
    }
  }

  private async updatePerformanceTracking(): Promise<void> {
    try {
      if (this.currentExecution?.outputs.tradeCards) {
        // Update performance tracking with new trade cards
        // This would integrate with the actual performance tracker
        loggerUtils.aiLogger.info('Performance tracking updated');
      }
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to update performance tracking', {
        error: (error as Error).message,
      });
    }
  }

  private async storeExecutionResults(execution: PipelineExecution): Promise<void> {
    try {
      // Store execution results in database or file system for debugging
      loggerUtils.aiLogger.info('Execution results stored', {
        executionId: execution.id,
        success: execution.success,
        phase: execution.phase,
      });
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to store execution results', {
        executionId: execution.id,
        error: (error as Error).message,
      });
    }
  }

  private async sendWebhookNotification(notification: NotificationMessage): Promise<void> {
    // Implement webhook notification
    loggerUtils.aiLogger.info('Webhook notification sent', {
      type: notification.type,
      urgency: notification.urgency,
    });
  }

  private async sendEmailNotification(notification: NotificationMessage): Promise<void> {
    // Implement email notification
    loggerUtils.aiLogger.info('Email notification sent', {
      type: notification.type,
      urgency: notification.urgency,
    });
  }

  private async sendSlackNotification(notification: NotificationMessage): Promise<void> {
    // Implement Slack notification
    loggerUtils.aiLogger.info('Slack notification sent', {
      type: notification.type,
      urgency: notification.urgency,
    });
  }

  /**
   * Get current execution status
   */
  getCurrentExecution(): PipelineExecution | null {
    return this.currentExecution;
  }

  /**
   * Check if pipeline is currently running
   */
  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get execution history (would integrate with database)
   */
  async getExecutionHistory(limit: number = 10): Promise<PipelineExecution[]> {
    // This would fetch from database
    return [];
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(newConfig: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart schedules with new configuration
    this.stop();
    this.initializeSchedules();
    this.start();
    
    loggerUtils.aiLogger.info('Pipeline configuration updated');
  }

  /**
   * Cleanup method
   */
  cleanup(): void {
    this.stop();
    loggerUtils.aiLogger.info('Daily pipeline cleanup completed');
  }
}

export default DailyPipeline;
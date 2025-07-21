/**
 * Analysis API Controller with Proper Error Handling
 * Handles analysis requests with resilient pipeline
 */

import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { ResilientDataCollector, DataCollectionStrategy } from '../core/ResilientDataCollector.js';
import { DetailedAnalysisEngine, DetailedAnalysisResult } from '../core/DetailedAnalysisEngine.js';
import { serviceContainer } from '../core/ServiceContainer.js';
import { DataHub } from './DataHub.js';
import { loggerUtils } from '../config/logger.js';

export interface AnalysisRequest {
  symbol?: string;
  sectors?: string[];
  preferences?: {
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
    analysisDepth?: 'quick' | 'comprehensive' | 'deep';
    timeHorizon?: 'intraday' | 'swing' | 'position';
  };
  priority?: 'low' | 'normal' | 'high';
}

export interface AnalysisStatus {
  id: string;
  isRunning: boolean;
  phase: string;
  progress: number;
  startTime: Date;
  estimatedCompletion?: Date;
  currentExecution?: {
    phase: string;
    step?: string;
    reasoning?: string;
    errors?: string[];
  };
  partialResults?: any;
}

export interface AnalysisResult {
  id: string;
  success: boolean;
  qualityScore: number;
  tradeCards?: any[];
  errors?: string[];
  warnings?: string[];
  metadata: {
    duration: number;
    sourcesUsed: string[];
    dataQuality: number;
    partialSuccess: boolean;
    detailedAnalysis?: any;
  };
}

export class AnalysisController extends EventEmitter {
  private currentAnalysis?: AnalysisStatus;
  private analysisHistory: Map<string, AnalysisResult> = new Map();
  private dataCollector?: ResilientDataCollector;
  private analysisEngine?: DetailedAnalysisEngine;

  constructor() {
    super();
    this.initializeServices();
  }

  /**
   * Initialize required services
   */
  private async initializeServices(): Promise<void> {
    try {
      const dataHub = await serviceContainer.get<DataHub>('dataHub');
      this.dataCollector = new ResilientDataCollector(dataHub);
      this.analysisEngine = new DetailedAnalysisEngine();
      
      // Listen for real-time updates from detailed analysis engine
      this.analysisEngine.on('progressUpdate', (detailedAnalysis) => {
        this.updateFromDetailedAnalysis(detailedAnalysis);
      });

      this.analysisEngine.on('stepStarted', (data) => {
        this.updateAnalysisProgress(data.step.id, data.progress, data.step.description);
      });

      this.analysisEngine.on('stepCompleted', (data) => {
        this.updateAnalysisProgress(data.step.id, data.progress, data.step.reasoning || 'Step completed');
      });

      this.analysisEngine.on('subStepUpdate', (data) => {
        if (this.currentAnalysis) {
          this.currentAnalysis.currentExecution = {
            phase: data.step.name,
            step: data.subStep?.name,
            reasoning: data.subStep?.result ? JSON.stringify(data.subStep.result, null, 2) : undefined
          };
          this.emit('progressUpdate', this.currentAnalysis);
        }
      });

      loggerUtils.aiLogger.info('Analysis controller initialized with detailed engine');
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to initialize analysis controller', {
        error: error.message
      });
    }
  }

  /**
   * Trigger new analysis
   */
  async triggerAnalysis(req: Request, res: Response): Promise<void> {
    try {
      // Validate request
      const analysisRequest = this.validateAnalysisRequest(req.body);
      
      // Check if analysis is already running
      if (this.currentAnalysis?.isRunning) {
        res.status(409).json({
          error: 'Analysis already in progress',
          currentAnalysis: this.getCurrentStatus()
        });
        return;
      }

      // Start new analysis
      const analysisId = this.generateAnalysisId();
      this.currentAnalysis = {
        id: analysisId,
        isRunning: true,
        phase: 'initializing',
        progress: 0,
        startTime: new Date(),
        currentExecution: {
          phase: 'initialization',
          step: 'setting_up_pipeline'
        }
      };

      // Respond immediately
      res.json({
        success: true,
        analysisId,
        message: 'Analysis started successfully',
        estimatedDuration: this.estimateAnalysisDuration(analysisRequest)
      });

      // Start analysis in background
      this.runAnalysisAsync(analysisRequest).catch(error => {
        loggerUtils.aiLogger.error('Analysis failed unexpectedly', {
          analysisId,
          error: error.message,
          stack: error.stack
        });
        
        this.completeAnalysis(analysisId, {
          success: false,
          errors: [`Unexpected error: ${error.message}`],
          qualityScore: 0,
          metadata: {
            duration: Date.now() - this.currentAnalysis!.startTime.getTime(),
            sourcesUsed: [],
            dataQuality: 0,
            partialSuccess: false
          }
        });
      });

    } catch (error) {
      loggerUtils.aiLogger.error('Failed to trigger analysis', {
        error: error.message,
        body: req.body
      });

      res.status(400).json({
        error: 'Invalid analysis request',
        details: error.message
      });
    }
  }

  /**
   * Get current analysis status
   */
  getAnalysisStatus(req: Request, res: Response): void {
    try {
      const status = this.getCurrentStatus();
      res.json(status);
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get analysis status', {
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to retrieve analysis status',
        details: error.message
      });
    }
  }

  /**
   * Cancel running analysis
   */
  async cancelAnalysis(req: Request, res: Response): Promise<void> {
    try {
      if (!this.currentAnalysis?.isRunning) {
        res.status(404).json({
          error: 'No analysis currently running'
        });
        return;
      }

      const analysisId = this.currentAnalysis.id;
      
      // Mark as cancelled
      this.completeAnalysis(analysisId, {
        success: false,
        errors: ['Analysis cancelled by user'],
        qualityScore: 0,
        metadata: {
          duration: Date.now() - this.currentAnalysis.startTime.getTime(),
          sourcesUsed: [],
          dataQuality: 0,
          partialSuccess: false
        }
      });

      res.json({
        success: true,
        message: 'Analysis cancelled successfully',
        analysisId
      });

    } catch (error) {
      loggerUtils.aiLogger.error('Failed to cancel analysis', {
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to cancel analysis',
        details: error.message
      });
    }
  }

  /**
   * Get analysis history
   */
  getAnalysisHistory(req: Request, res: Response): void {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const history = Array.from(this.analysisHistory.values())
        .sort((a, b) => b.metadata.duration - a.metadata.duration)
        .slice(0, limit);

      res.json({
        history,
        total: this.analysisHistory.size
      });

    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get analysis history', {
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to retrieve analysis history',
        details: error.message
      });
    }
  }

  /**
   * Run analysis asynchronously with detailed engine
   */
  private async runAnalysisAsync(request: AnalysisRequest): Promise<void> {
    const analysisId = this.currentAnalysis!.id;
    const startTime = Date.now();

    try {
      // Determine symbol to analyze
      const symbol = this.getSymbolForAnalysis(request);
      const analysisDepth = request.preferences?.analysisDepth || 'comprehensive';

      loggerUtils.aiLogger.info('Starting detailed analysis', {
        analysisId,
        symbol,
        depth: analysisDepth
      });

      // Run detailed analysis using the new engine
      const detailedResult = await this.analysisEngine!.runDetailedAnalysis(symbol, analysisDepth);

      // Generate trade cards from detailed analysis
      const tradeCards = this.generateTradeCardsFromDetailedAnalysis(detailedResult);

      // Complete successfully
      this.completeAnalysis(analysisId, {
        success: true,
        qualityScore: detailedResult.dataQuality.overall,
        tradeCards,
        warnings: detailedResult.dataQuality.missingData.length > 0 
          ? [`Some data sources failed: ${detailedResult.dataQuality.missingData.join(', ')}`] 
          : [],
        metadata: {
          duration: Date.now() - startTime,
          sourcesUsed: detailedResult.dataQuality.reliableData,
          dataQuality: detailedResult.dataQuality.overall,
          partialSuccess: detailedResult.dataQuality.reliableData.length > 0,
          detailedAnalysis: detailedResult // Include full detailed analysis
        }
      });

    } catch (error) {
      loggerUtils.aiLogger.error('Detailed analysis execution failed', {
        analysisId,
        error: error.message,
        phase: this.currentAnalysis?.phase
      });

      this.completeAnalysis(analysisId, {
        success: false,
        errors: [error.message],
        qualityScore: 0,
        metadata: {
          duration: Date.now() - startTime,
          sourcesUsed: [],
          dataQuality: 0,
          partialSuccess: false
        }
      });
    }
  }

  /**
   * Get symbol for analysis from request
   */
  private getSymbolForAnalysis(request: AnalysisRequest): string {
    if (request.symbol) {
      return request.symbol.toUpperCase();
    }
    
    // Default to sector representative symbol
    const sectors = request.sectors || ['technology'];
    return this.getSectorSymbol(sectors[0]);
  }

  /**
   * Generate trade cards from detailed analysis
   */
  private generateTradeCardsFromDetailedAnalysis(analysis: DetailedAnalysisResult): any[] {
    const tradeCards = [];

    for (const recommendation of analysis.recommendations) {
      const confidence = Math.round(recommendation.confidence * 100);
      
      tradeCards.push({
        id: `trade_${analysis.id}_${tradeCards.length + 1}`,
        symbol: analysis.symbol,
        category: this.getTradeCategory(recommendation, analysis),
        confidence,
        strategyType: this.getStrategyType(analysis.tradingSignals),
        entry: { 
          price: recommendation.priceTarget * 0.98, // Slightly below target for entry
          reasoning: 'Entry based on technical and fundamental analysis'
        },
        exits: {
          primary: { 
            price: recommendation.priceTarget,
            reasoning: `Target based on ${recommendation.reasoning}`
          },
          stop: { 
            price: recommendation.stopLoss,
            reasoning: 'Stop loss to limit downside risk'
          }
        },
        whyThisTrade: {
          mainThesis: recommendation.reasoning,
          keyPoints: this.extractKeyPoints(analysis),
          technicalSignals: analysis.tradingSignals.map(s => `${s.type}: ${(s.strength * 100).toFixed(0)}% strength`),
          fundamentalFactors: this.getFundamentalFactors(analysis),
          riskFactors: analysis.riskFactors.map(r => `${r.type}: ${r.description}`),
          marketConditions: {
            trend: analysis.marketConditions.trend,
            volatility: `${(analysis.marketConditions.volatility * 100).toFixed(1)}%`,
            sentiment: analysis.marketConditions.sentiment > 0 ? 'Positive' : 'Negative'
          }
        },
        detailedAnalysis: {
          dataQuality: analysis.dataQuality,
          technicalIndicators: analysis.technicalIndicators,
          sentimentAnalysis: analysis.sentimentAnalysis,
          riskAssessment: {
            overallRisk: this.calculateOverallRisk(analysis),
            riskFactors: analysis.riskFactors
          },
          steps: analysis.steps.map(step => ({
            name: step.name,
            status: step.status,
            reasoning: step.reasoning,
            duration: step.endTime ? step.endTime.getTime() - step.startTime.getTime() : null
          }))
        }
      });
    }

    return tradeCards;
  }

  /**
   * Helper methods for trade card generation
   */
  private getTradeCategory(recommendation: any, analysis: DetailedAnalysisResult): string {
    if (recommendation.confidence > 0.8) return 'high_conviction';
    if (analysis.tradingSignals.some(s => s.type.includes('Momentum'))) return 'momentum';
    if (analysis.sentimentAnalysis.overallSentiment > 0.3) return 'sentiment_play';
    return 'momentum';
  }

  private getStrategyType(signals: any[]): string {
    if (signals.some(s => s.type.includes('Breakout'))) return 'breakout';
    if (signals.some(s => s.type.includes('Momentum'))) return 'momentum';
    return 'trend_following';
  }

  private extractKeyPoints(analysis: DetailedAnalysisResult): string[] {
    const points = [];
    
    if (analysis.technicalIndicators.rsi > 60) {
      points.push('Strong technical momentum with RSI above 60');
    }
    
    if (analysis.sentimentAnalysis.overallSentiment > 0.2) {
      points.push('Positive market sentiment from news and social media');
    }
    
    if (analysis.dataQuality.overall > 0.7) {
      points.push('High-quality data supporting analysis reliability');
    }
    
    if (analysis.marketConditions.volume === 'high') {
      points.push('High volume confirming price movement');
    }

    return points.length > 0 ? points : ['Analysis based on available market data'];
  }

  private getFundamentalFactors(analysis: DetailedAnalysisResult): string[] {
    const factors = [];
    
    if (analysis.fundamentalMetrics.pe < 25) {
      factors.push(`Reasonable P/E ratio of ${analysis.fundamentalMetrics.pe.toFixed(1)}`);
    }
    
    if (analysis.fundamentalMetrics.growth > 0.1) {
      factors.push(`Strong growth rate of ${(analysis.fundamentalMetrics.growth * 100).toFixed(1)}%`);
    }
    
    return factors.length > 0 ? factors : ['Fundamental analysis pending complete data'];
  }

  private calculateOverallRisk(analysis: DetailedAnalysisResult): 'low' | 'medium' | 'high' {
    const riskScore = analysis.riskFactors.reduce((sum, r) => sum + r.impact, 0) / analysis.riskFactors.length;
    
    if (riskScore < 0.3) return 'low';
    if (riskScore < 0.6) return 'medium';
    return 'high';
  }

  /**
   * Update analysis from detailed analysis result
   */
  private updateFromDetailedAnalysis(detailedAnalysis: DetailedAnalysisResult): void {
    if (this.currentAnalysis) {
      this.currentAnalysis.progress = detailedAnalysis.overallProgress;
      this.currentAnalysis.phase = detailedAnalysis.status;
      
      // Find current active step
      const activeStep = detailedAnalysis.steps.find(s => s.status === 'running');
      if (activeStep) {
        this.currentAnalysis.currentExecution = {
          phase: activeStep.name,
          step: activeStep.description,
          reasoning: activeStep.reasoning
        };
      }
      
      this.emit('progressUpdate', this.currentAnalysis);
    }
  }

  /**
   * Create data collection strategy based on request
   */
  private createDataCollectionStrategy(sector: string, analysisDepth?: string): DataCollectionStrategy {
    const baseStrategy: DataCollectionStrategy = {
      symbol: this.getSectorSymbol(sector),
      requiredSources: ['polygon', 'alphavantage'],
      preferredSources: ['yahoo', 'newsscraper'],
      fallbackSources: ['sec', 'trends'],
      minQualityScore: 0.4,
      timeoutStrategy: 'balanced',
      maxConcurrentRequests: 3
    };

    // Adjust strategy based on analysis depth
    switch (analysisDepth) {
      case 'quick':
        baseStrategy.timeoutStrategy = 'aggressive';
        baseStrategy.minQualityScore = 0.3;
        baseStrategy.preferredSources = ['yahoo'];
        baseStrategy.fallbackSources = [];
        break;
      
      case 'deep':
        baseStrategy.timeoutStrategy = 'patient';
        baseStrategy.minQualityScore = 0.6;
        baseStrategy.preferredSources.push('trends');
        baseStrategy.maxConcurrentRequests = 2; // More thorough, less concurrent
        break;
    }

    return baseStrategy;
  }

  /**
   * Get representative symbol for sector
   */
  private getSectorSymbol(sector: string): string {
    const sectorMap: Record<string, string> = {
      technology: 'AAPL',
      healthcare: 'JNJ',
      finance: 'JPM',
      energy: 'XOM',
      consumer: 'AMZN'
    };

    return sectorMap[sector] || 'SPY'; // Default to SPY
  }

  /**
   * Simulate AI analysis (placeholder)
   */
  private async simulateAIAnalysis(dataResults: any[]): Promise<void> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    loggerUtils.aiLogger.info('AI analysis completed', {
      sourcesAnalyzed: dataResults.length,
      successfulSources: dataResults.filter(r => r.success).length
    });
  }

  /**
   * Generate trade cards from data
   */
  private async generateTradeCards(collectionResult: any): Promise<any[]> {
    // Simulate trade card generation
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate mock trade cards based on data quality
    const numCards = Math.floor(collectionResult.overallQualityScore * 5);
    const cards = [];

    for (let i = 0; i < numCards; i++) {
      cards.push({
        id: `trade_${Date.now()}_${i}`,
        symbol: this.getSectorSymbol('technology'),
        strategy: 'momentum',
        confidence: Math.floor(60 + (collectionResult.overallQualityScore * 40)),
        entry: { price: 150 + (i * 5) },
        target: { price: 160 + (i * 5) },
        stop: { price: 145 + (i * 5) }
      });
    }

    return cards;
  }

  /**
   * Validate trade cards
   */
  private async validateTradeCards(tradeCards: any[]): Promise<any[]> {
    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Filter out invalid trades (mock validation)
    return tradeCards.filter(card => card.confidence > 50);
  }

  /**
   * Update analysis progress
   */
  private updateAnalysisProgress(phase: string, progress: number, reasoning?: string): void {
    if (this.currentAnalysis) {
      this.currentAnalysis.phase = phase;
      this.currentAnalysis.progress = progress;
      this.currentAnalysis.currentExecution = {
        phase,
        reasoning
      };

      // Estimate completion time
      if (progress > 0) {
        const elapsed = Date.now() - this.currentAnalysis.startTime.getTime();
        const totalEstimated = (elapsed / progress) * 100;
        this.currentAnalysis.estimatedCompletion = new Date(
          this.currentAnalysis.startTime.getTime() + totalEstimated
        );
      }

      this.emit('progressUpdate', this.currentAnalysis);
    }
  }

  /**
   * Complete analysis and store result
   */
  private completeAnalysis(analysisId: string, result: Omit<AnalysisResult, 'id'>): void {
    const fullResult: AnalysisResult = {
      id: analysisId,
      ...result
    };

    this.analysisHistory.set(analysisId, fullResult);
    
    if (this.currentAnalysis) {
      this.currentAnalysis.isRunning = false;
      this.currentAnalysis.phase = result.success ? 'completed' : 'failed';
      this.currentAnalysis.progress = 100;
    }

    this.emit('analysisComplete', fullResult);
    
    loggerUtils.aiLogger.info('Analysis completed', {
      analysisId,
      success: result.success,
      duration: result.metadata.duration,
      qualityScore: result.qualityScore
    });
  }

  /**
   * Get current status
   */
  getCurrentStatus(): AnalysisStatus | { isRunning: false } {
    if (!this.currentAnalysis) {
      return { isRunning: false };
    }

    return { ...this.currentAnalysis };
  }

  /**
   * Validate analysis request
   */
  private validateAnalysisRequest(body: any): AnalysisRequest {
    const request: AnalysisRequest = {
      sectors: body.sectors || [],
      preferences: body.preferences || {},
      priority: body.priority || 'normal'
    };

    // Basic validation
    if (request.sectors && !Array.isArray(request.sectors)) {
      throw new Error('Sectors must be an array');
    }

    return request;
  }

  /**
   * Generate unique analysis ID
   */
  private generateAnalysisId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Estimate analysis duration
   */
  private estimateAnalysisDuration(request: AnalysisRequest): number {
    const baseTime = 30000; // 30 seconds
    
    switch (request.preferences?.analysisDepth) {
      case 'quick': return baseTime * 0.5;
      case 'deep': return baseTime * 2;
      default: return baseTime;
    }
  }
}
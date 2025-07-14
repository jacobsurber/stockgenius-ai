/**
 * Performance Tracker
 * Comprehensive tracking and analytics for trade recommendations and AI module performance
 */

import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';
import path from 'path';

// Import types from other modules
import { TradeCard } from '../ai/StrategicFusion.js';
import { ValidationOutput } from '../ai/TradeValidator.js';
import { FormattedTradeCard } from '../trading/TradeCardGenerator.js';
import { AIModuleName } from '../ai/PromptOrchestrator.js';

export interface TradeOutcome {
  tradeId: string;
  symbol: string;
  entryTime?: number;
  entryPrice?: number;
  exitTime?: number;
  exitPrice?: number;
  actualPnL?: number;
  actualPnLPercent?: number;
  holdingPeriodHours?: number;
  outcome: 'winner' | 'loser' | 'breakeven' | 'stopped_out' | 'active' | 'not_taken';
  maxDrawdown?: number;
  maxGain?: number;
  exitReason?: 'target_hit' | 'stop_loss' | 'time_decay' | 'manual_exit' | 'market_close';
}

export interface PredictionAccuracy {
  tradeId: string;
  symbol: string;
  module: AIModuleName;
  prediction: string;
  actual: string;
  accuracy: number; // 0-1 scale
  deviationPercent?: number;
  timingAccuracy?: number; // How close was timing prediction
  confidenceScore: number;
  predictionType: 'price_target' | 'direction' | 'timing' | 'volatility' | 'sentiment';
}

export interface ModulePerformance {
  module: AIModuleName;
  totalPredictions: number;
  accuratePredictions: number;
  accuracyRate: number;
  averageConfidence: number;
  confidenceCalibration: number; // How well confidence matches actual accuracy
  winRate: number;
  averagePnL: number;
  bestSignalTypes: string[];
  worstSignalTypes: string[];
  recommendedAdjustments: string[];
}

export interface SignalCombination {
  combination: string; // JSON string of signal weights
  tradeCount: number;
  winRate: number;
  averagePnL: number;
  averageConfidence: number;
  riskAdjustedReturn: number;
  sharpeRatio?: number;
  maxDrawdown: number;
  avgHoldingHours: number;
}

export interface UserInteraction {
  userId: string;
  sessionId: string;
  timestamp: number;
  interactionType: 'view_card' | 'take_trade' | 'skip_trade' | 'modify_trade' | 'exit_trade' | 'feedback';
  tradeId: string;
  symbol: string;
  category: string;
  confidence: number;
  userRating?: number; // 1-5 stars
  userComments?: string;
  modificationDetails?: {
    originalEntry?: number;
    modifiedEntry?: number;
    originalTarget?: number;
    modifiedTarget?: number;
    originalStop?: number;
    modifiedStop?: number;
  };
}

export interface PerformanceReport {
  reportType: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  timestamp: number;
  
  overview: {
    totalTrades: number;
    activeTrades: number;
    completedTrades: number;
    winRate: number;
    averagePnL: number;
    totalReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    avgHoldingHours: number;
  };
  
  modulePerformance: ModulePerformance[];
  categoryPerformance: Record<string, {
    tradeCount: number;
    winRate: number;
    averagePnL: number;
    bestPerformingSignals: string[];
  }>;
  
  signalAnalysis: {
    topCombinations: SignalCombination[];
    improvementOpportunities: string[];
    signalWeightOptimization: Record<string, number>;
  };
  
  userBehavior: {
    tradeSelectionRate: number; // % of recommended trades actually taken
    averageUserRating: number;
    preferredCategories: string[];
    commonModifications: string[];
    feedbackThemes: string[];
  };
  
  recommendations: {
    promptOptimizations: string[];
    moduleAdjustments: Record<AIModuleName, string[]>;
    signalWeightChanges: Record<string, number>;
    confidenceCalibration: Record<AIModuleName, number>;
  };
}

export interface FeedbackLoop {
  moduleId: AIModuleName;
  feedbackType: 'accuracy_improvement' | 'confidence_calibration' | 'timing_adjustment' | 'risk_assessment';
  currentPerformance: number;
  targetPerformance: number;
  suggestedChanges: string[];
  implementationPriority: 'high' | 'medium' | 'low';
  expectedImpact: number; // Expected improvement percentage
}

export class PerformanceTracker {
  private database: Database | null = null;
  private dataHub: DataHub;
  
  // Performance calculation parameters
  private readonly performanceConfig = {
    accuracyThresholds: {
      price: 0.05, // 5% price prediction accuracy threshold
      timing: 0.20, // 20% timing accuracy threshold (within predicted window)
      direction: 1.0, // Direction must be exact
    },
    calibrationBins: 10, // For confidence calibration analysis
    signalOptimizationWindow: 30, // Days to look back for signal optimization
    feedbackSensitivity: 0.1, // How sensitive feedback loops are to performance changes
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
    this.initializeDatabase();
  }

  /**
   * Initialize comprehensive tracking database
   */
  private async initializeDatabase(): Promise<void> {
    try {
      const dbPath = path.join(process.cwd(), 'data', 'performance_tracking.db');
      
      this.database = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      await this.database.exec(`
        -- Trade outcomes tracking
        CREATE TABLE IF NOT EXISTS trade_outcomes (
          trade_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          category TEXT NOT NULL,
          strategy_type TEXT NOT NULL,
          predicted_entry REAL NOT NULL,
          predicted_target REAL NOT NULL,
          predicted_stop REAL NOT NULL,
          predicted_confidence INTEGER NOT NULL,
          predicted_hold_hours REAL,
          
          actual_entry_time INTEGER,
          actual_entry_price REAL,
          actual_exit_time INTEGER,
          actual_exit_price REAL,
          actual_pnl REAL,
          actual_pnl_percent REAL,
          holding_period_hours REAL,
          outcome TEXT DEFAULT 'active',
          max_drawdown REAL DEFAULT 0,
          max_gain REAL DEFAULT 0,
          exit_reason TEXT,
          
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Module-specific predictions and accuracy
        CREATE TABLE IF NOT EXISTS prediction_accuracy (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trade_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          module TEXT NOT NULL,
          prediction_type TEXT NOT NULL,
          predicted_value TEXT NOT NULL,
          actual_value TEXT,
          accuracy REAL,
          deviation_percent REAL,
          timing_accuracy REAL,
          confidence_score REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          
          FOREIGN KEY (trade_id) REFERENCES trade_outcomes (trade_id)
        );

        -- User interactions and behavior
        CREATE TABLE IF NOT EXISTS user_interactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          interaction_type TEXT NOT NULL,
          trade_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          category TEXT NOT NULL,
          confidence INTEGER NOT NULL,
          user_rating INTEGER,
          user_comments TEXT,
          modification_details TEXT,
          
          FOREIGN KEY (trade_id) REFERENCES trade_outcomes (trade_id)
        );

        -- Signal combination performance
        CREATE TABLE IF NOT EXISTS signal_combinations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          combination_hash TEXT NOT NULL,
          combination_data TEXT NOT NULL,
          trade_count INTEGER DEFAULT 0,
          win_count INTEGER DEFAULT 0,
          total_pnl REAL DEFAULT 0,
          total_confidence REAL DEFAULT 0,
          max_drawdown REAL DEFAULT 0,
          total_holding_hours REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE(combination_hash)
        );

        -- Performance reports archive
        CREATE TABLE IF NOT EXISTS performance_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_type TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          report_data TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Feedback loops and optimizations
        CREATE TABLE IF NOT EXISTS feedback_loops (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          module_id TEXT NOT NULL,
          feedback_type TEXT NOT NULL,
          current_performance REAL NOT NULL,
          target_performance REAL NOT NULL,
          suggested_changes TEXT NOT NULL,
          implementation_priority TEXT NOT NULL,
          expected_impact REAL NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          implemented_at DATETIME
        );

        -- Create indices for performance
        CREATE INDEX IF NOT EXISTS idx_trade_outcomes_symbol ON trade_outcomes(symbol);
        CREATE INDEX IF NOT EXISTS idx_trade_outcomes_outcome ON trade_outcomes(outcome);
        CREATE INDEX IF NOT EXISTS idx_trade_outcomes_created ON trade_outcomes(created_at);
        CREATE INDEX IF NOT EXISTS idx_prediction_accuracy_module ON prediction_accuracy(module);
        CREATE INDEX IF NOT EXISTS idx_prediction_accuracy_type ON prediction_accuracy(prediction_type);
        CREATE INDEX IF NOT EXISTS idx_user_interactions_user ON user_interactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_interactions_type ON user_interactions(interaction_type);
        CREATE INDEX IF NOT EXISTS idx_signal_combinations_hash ON signal_combinations(combination_hash);
      `);

      loggerUtils.aiLogger.info('Performance tracking database initialized');
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to initialize performance tracking database', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Track a new trade recommendation
   */
  async trackTradeRecommendation(
    tradeCard: FormattedTradeCard,
    fusionCard: TradeCard,
    validationResult?: ValidationOutput
  ): Promise<void> {
    if (!this.database) return;

    try {
      // Store trade outcome record
      await this.database.run(`
        INSERT OR REPLACE INTO trade_outcomes (
          trade_id, symbol, category, strategy_type,
          predicted_entry, predicted_target, predicted_stop,
          predicted_confidence, predicted_hold_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tradeCard.id,
        tradeCard.symbol,
        tradeCard.category,
        tradeCard.strategyType,
        tradeCard.entry.price,
        tradeCard.exits.primary.price,
        tradeCard.exits.stop.price,
        tradeCard.confidenceScore,
        this.parseHoldingHours(tradeCard.timeToHold.optimal),
      ]);

      // Store module-specific predictions
      await this.storePredictionAccuracy(tradeCard, fusionCard, validationResult);
      
      // Track signal combination
      await this.trackSignalCombination(fusionCard.signal_composition);

      loggerUtils.aiLogger.info('Trade recommendation tracked', {
        tradeId: tradeCard.id,
        symbol: tradeCard.symbol,
        category: tradeCard.category,
        confidence: tradeCard.confidenceScore,
      });
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to track trade recommendation', {
        tradeId: tradeCard.id,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Update trade outcome with actual results
   */
  async updateTradeOutcome(outcome: TradeOutcome): Promise<void> {
    if (!this.database) return;

    try {
      await this.database.run(`
        UPDATE trade_outcomes SET
          actual_entry_time = ?,
          actual_entry_price = ?,
          actual_exit_time = ?,
          actual_exit_price = ?,
          actual_pnl = ?,
          actual_pnl_percent = ?,
          holding_period_hours = ?,
          outcome = ?,
          max_drawdown = ?,
          max_gain = ?,
          exit_reason = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE trade_id = ?
      `, [
        outcome.entryTime,
        outcome.entryPrice,
        outcome.exitTime,
        outcome.exitPrice,
        outcome.actualPnL,
        outcome.actualPnLPercent,
        outcome.holdingPeriodHours,
        outcome.outcome,
        outcome.maxDrawdown,
        outcome.maxGain,
        outcome.exitReason,
        outcome.tradeId,
      ]);

      // Update prediction accuracy for completed trades
      if (outcome.outcome !== 'active') {
        await this.calculatePredictionAccuracy(outcome);
      }

      // Update signal combination performance
      await this.updateSignalCombinationPerformance(outcome);

      loggerUtils.aiLogger.info('Trade outcome updated', {
        tradeId: outcome.tradeId,
        symbol: outcome.symbol,
        outcome: outcome.outcome,
        pnl: outcome.actualPnL,
      });
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to update trade outcome', {
        tradeId: outcome.tradeId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Track user interaction with trade recommendation
   */
  async trackUserInteraction(interaction: UserInteraction): Promise<void> {
    if (!this.database) return;

    try {
      await this.database.run(`
        INSERT INTO user_interactions (
          user_id, session_id, timestamp, interaction_type,
          trade_id, symbol, category, confidence,
          user_rating, user_comments, modification_details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        interaction.userId,
        interaction.sessionId,
        interaction.timestamp,
        interaction.interactionType,
        interaction.tradeId,
        interaction.symbol,
        interaction.category,
        interaction.confidence,
        interaction.userRating,
        interaction.userComments,
        JSON.stringify(interaction.modificationDetails),
      ]);

      loggerUtils.aiLogger.info('User interaction tracked', {
        userId: interaction.userId,
        tradeId: interaction.tradeId,
        interactionType: interaction.interactionType,
      });
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to track user interaction', {
        userId: interaction.userId,
        tradeId: interaction.tradeId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport(
    reportType: 'daily' | 'weekly' | 'monthly',
    startDate: string,
    endDate: string
  ): Promise<PerformanceReport> {
    if (!this.database) {
      throw new Error('Database not initialized');
    }

    try {
      const timestamp = Date.now();
      
      // Calculate overview metrics
      const overview = await this.calculateOverviewMetrics(startDate, endDate);
      
      // Calculate module performance
      const modulePerformance = await this.calculateModulePerformance(startDate, endDate);
      
      // Calculate category performance
      const categoryPerformance = await this.calculateCategoryPerformance(startDate, endDate);
      
      // Analyze signal combinations
      const signalAnalysis = await this.analyzeSignalCombinations(startDate, endDate);
      
      // Analyze user behavior
      const userBehavior = await this.analyzeUserBehavior(startDate, endDate);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(modulePerformance, signalAnalysis);

      const report: PerformanceReport = {
        reportType,
        startDate,
        endDate,
        timestamp,
        overview,
        modulePerformance,
        categoryPerformance,
        signalAnalysis,
        userBehavior,
        recommendations,
      };

      // Store report in database
      await this.database.run(`
        INSERT INTO performance_reports (
          report_type, start_date, end_date, report_data, timestamp
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        reportType,
        startDate,
        endDate,
        JSON.stringify(report),
        timestamp,
      ]);

      loggerUtils.aiLogger.info('Performance report generated', {
        reportType,
        startDate,
        endDate,
        totalTrades: overview.totalTrades,
        winRate: overview.winRate,
      });

      return report;
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to generate performance report', {
        reportType,
        startDate,
        endDate,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get module-specific accuracy metrics
   */
  async getModuleAccuracy(module: AIModuleName, days: number = 30): Promise<ModulePerformance> {
    if (!this.database) {
      throw new Error('Database not initialized');
    }

    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    try {
      const accuracyData = await this.database.all(`
        SELECT 
          AVG(accuracy) as avg_accuracy,
          COUNT(*) as total_predictions,
          SUM(CASE WHEN accuracy >= 0.8 THEN 1 ELSE 0 END) as accurate_predictions,
          AVG(confidence_score) as avg_confidence
        FROM prediction_accuracy
        WHERE module = ? AND timestamp > ?
      `, [module, cutoffTime]);

      const tradeData = await this.database.all(`
        SELECT 
          outcome,
          actual_pnl,
          predicted_confidence
        FROM trade_outcomes t
        JOIN prediction_accuracy p ON t.trade_id = p.trade_id
        WHERE p.module = ? AND t.created_at > datetime(?, 'unixepoch')
      `, [module, cutoffTime / 1000]);

      const winRate = tradeData.filter(t => t.outcome === 'winner').length / tradeData.length;
      const avgPnL = tradeData.reduce((sum, t) => sum + (t.actual_pnl || 0), 0) / tradeData.length;

      return {
        module,
        totalPredictions: accuracyData[0]?.total_predictions || 0,
        accuratePredictions: accuracyData[0]?.accurate_predictions || 0,
        accuracyRate: accuracyData[0]?.avg_accuracy || 0,
        averageConfidence: accuracyData[0]?.avg_confidence || 0,
        confidenceCalibration: this.calculateConfidenceCalibration(tradeData),
        winRate,
        averagePnL: avgPnL,
        bestSignalTypes: await this.getBestSignalTypes(module, days),
        worstSignalTypes: await this.getWorstSignalTypes(module, days),
        recommendedAdjustments: this.generateModuleAdjustments(module, accuracyData[0]),
      };
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get module accuracy', {
        module,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Identify best performing signal combinations
   */
  async getBestSignalCombinations(limit: number = 10): Promise<SignalCombination[]> {
    if (!this.database) return [];

    try {
      const combinations = await this.database.all(`
        SELECT 
          combination_data,
          trade_count,
          (win_count * 1.0 / trade_count) as win_rate,
          (total_pnl / trade_count) as avg_pnl,
          (total_confidence / trade_count) as avg_confidence,
          max_drawdown,
          (total_holding_hours / trade_count) as avg_holding_hours
        FROM signal_combinations
        WHERE trade_count >= 5
        ORDER BY (win_count * 1.0 / trade_count) * (total_pnl / trade_count) DESC
        LIMIT ?
      `, [limit]);

      return combinations.map(combo => ({
        combination: combo.combination_data,
        tradeCount: combo.trade_count,
        winRate: combo.win_rate,
        averagePnL: combo.avg_pnl,
        averageConfidence: combo.avg_confidence,
        riskAdjustedReturn: combo.avg_pnl / Math.max(combo.max_drawdown, 0.01),
        maxDrawdown: combo.max_drawdown,
        avgHoldingHours: combo.avg_holding_hours,
      }));
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get best signal combinations', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Generate feedback loops for continuous improvement
   */
  async generateFeedbackLoops(): Promise<FeedbackLoop[]> {
    const feedbackLoops: FeedbackLoop[] = [];
    const modules: AIModuleName[] = ['sector', 'risk', 'technical', 'reddit', 'earningsDrift', 'fusion', 'validator'];

    for (const module of modules) {
      try {
        const performance = await this.getModuleAccuracy(module, 30);
        
        // Accuracy improvement feedback
        if (performance.accuracyRate < 0.7) {
          feedbackLoops.push({
            moduleId: module,
            feedbackType: 'accuracy_improvement',
            currentPerformance: performance.accuracyRate,
            targetPerformance: 0.75,
            suggestedChanges: [
              'Refine prompt specificity',
              'Add more context examples',
              'Adjust confidence thresholds',
            ],
            implementationPriority: 'high',
            expectedImpact: 0.10,
          });
        }

        // Confidence calibration feedback
        if (Math.abs(performance.confidenceCalibration - 1.0) > 0.2) {
          feedbackLoops.push({
            moduleId: module,
            feedbackType: 'confidence_calibration',
            currentPerformance: performance.confidenceCalibration,
            targetPerformance: 1.0,
            suggestedChanges: [
              performance.confidenceCalibration > 1.0 ? 'Reduce overconfidence' : 'Increase confidence scaling',
              'Calibrate confidence to historical accuracy',
              'Add uncertainty quantification',
            ],
            implementationPriority: 'medium',
            expectedImpact: 0.08,
          });
        }

        // Win rate improvement feedback
        if (performance.winRate < 0.6 && performance.totalPredictions > 10) {
          feedbackLoops.push({
            moduleId: module,
            feedbackType: 'risk_assessment',
            currentPerformance: performance.winRate,
            targetPerformance: 0.65,
            suggestedChanges: [
              'Tighten entry criteria',
              'Improve risk assessment',
              'Enhance signal filtering',
            ],
            implementationPriority: performance.winRate < 0.5 ? 'high' : 'medium',
            expectedImpact: 0.12,
          });
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Failed to generate feedback loop for module', {
          module,
          error: (error as Error).message,
        });
      }
    }

    // Store feedback loops in database
    for (const feedback of feedbackLoops) {
      await this.storeFeedbackLoop(feedback);
    }

    return feedbackLoops;
  }

  /**
   * Get personalization insights for user
   */
  async getPersonalizationInsights(userId: string): Promise<{
    preferredCategories: string[];
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
    averageHoldingTime: number;
    selectionPatterns: string[];
    feedbackThemes: string[];
  }> {
    if (!this.database) {
      throw new Error('Database not initialized');
    }

    try {
      // Get user's category preferences
      const categoryPrefs = await this.database.all(`
        SELECT category, COUNT(*) as count
        FROM user_interactions
        WHERE user_id = ? AND interaction_type = 'take_trade'
        GROUP BY category
        ORDER BY count DESC
      `, [userId]);

      // Get user's risk tolerance based on their trade selections
      const riskTolerance = await this.calculateUserRiskTolerance(userId);

      // Get average holding time preferences
      const holdingTimeData = await this.database.get(`
        SELECT AVG(holding_period_hours) as avg_holding
        FROM trade_outcomes t
        JOIN user_interactions u ON t.trade_id = u.trade_id
        WHERE u.user_id = ? AND u.interaction_type = 'take_trade'
        AND t.holding_period_hours IS NOT NULL
      `, [userId]);

      // Get feedback themes
      const feedbackData = await this.database.all(`
        SELECT user_comments
        FROM user_interactions
        WHERE user_id = ? AND user_comments IS NOT NULL
      `, [userId]);

      return {
        preferredCategories: categoryPrefs.map(p => p.category),
        riskTolerance,
        averageHoldingTime: holdingTimeData?.avg_holding || 24,
        selectionPatterns: await this.analyzeSelectionPatterns(userId),
        feedbackThemes: this.extractFeedbackThemes(feedbackData.map(f => f.user_comments)),
      };
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get personalization insights', {
        userId,
        error: (error as Error).message,
      });
      return {
        preferredCategories: [],
        riskTolerance: 'moderate',
        averageHoldingTime: 24,
        selectionPatterns: [],
        feedbackThemes: [],
      };
    }
  }

  /**
   * Private helper methods
   */
  
  private async storePredictionAccuracy(
    tradeCard: FormattedTradeCard,
    fusionCard: TradeCard,
    validationResult?: ValidationOutput
  ): Promise<void> {
    if (!this.database) return;

    const predictions = [
      {
        module: 'fusion' as AIModuleName,
        predictionType: 'price_target',
        predictedValue: tradeCard.exits.primary.price.toString(),
        confidenceScore: tradeCard.confidenceScore / 100,
      },
      {
        module: 'fusion' as AIModuleName,
        predictionType: 'direction',
        predictedValue: tradeCard.tradeDirection,
        confidenceScore: tradeCard.confidenceScore / 100,
      },
      {
        module: 'fusion' as AIModuleName,
        predictionType: 'timing',
        predictedValue: tradeCard.timeToHold.optimal,
        confidenceScore: tradeCard.confidenceScore / 100,
      },
    ];

    if (validationResult) {
      predictions.push({
        module: 'validator' as AIModuleName,
        predictionType: 'risk_assessment',
        predictedValue: validationResult.validation_result.validation_score.toString(),
        confidenceScore: validationResult.validation_result.confidence_score,
      });
    }

    for (const prediction of predictions) {
      await this.database.run(`
        INSERT INTO prediction_accuracy (
          trade_id, symbol, module, prediction_type,
          predicted_value, confidence_score, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        tradeCard.id,
        tradeCard.symbol,
        prediction.module,
        prediction.predictionType,
        prediction.predictedValue,
        prediction.confidenceScore,
        Date.now(),
      ]);
    }
  }

  private async trackSignalCombination(signalComposition: any): Promise<void> {
    if (!this.database) return;

    const combinationHash = this.hashSignalCombination(signalComposition);
    const combinationData = JSON.stringify(signalComposition);

    await this.database.run(`
      INSERT OR IGNORE INTO signal_combinations (combination_hash, combination_data)
      VALUES (?, ?)
    `, [combinationHash, combinationData]);

    await this.database.run(`
      UPDATE signal_combinations 
      SET trade_count = trade_count + 1,
          total_confidence = total_confidence + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE combination_hash = ?
    `, [signalComposition.composite_score, combinationHash]);
  }

  private async calculatePredictionAccuracy(outcome: TradeOutcome): Promise<void> {
    if (!this.database || !outcome.exitPrice || !outcome.entryPrice) return;

    const predictions = await this.database.all(`
      SELECT id, module, prediction_type, predicted_value, confidence_score
      FROM prediction_accuracy
      WHERE trade_id = ? AND actual_value IS NULL
    `, [outcome.tradeId]);

    for (const prediction of predictions) {
      let actualValue: string = '';
      let accuracy: number = 0;
      let deviationPercent: number = 0;

      switch (prediction.prediction_type) {
        case 'price_target':
          actualValue = outcome.exitPrice.toString();
          const predictedPrice = parseFloat(prediction.predicted_value);
          deviationPercent = Math.abs((outcome.exitPrice - predictedPrice) / predictedPrice) * 100;
          accuracy = Math.max(0, 1 - (deviationPercent / 100));
          break;

        case 'direction':
          const direction = outcome.actualPnL && outcome.actualPnL > 0 ? 'long' : 'short';
          actualValue = direction;
          accuracy = prediction.predicted_value === direction ? 1 : 0;
          break;

        case 'timing':
          actualValue = (outcome.holdingPeriodHours || 0).toString();
          const predictedHours = this.parseHoldingHours(prediction.predicted_value);
          const timingDeviation = Math.abs((outcome.holdingPeriodHours || 0) - predictedHours);
          accuracy = Math.max(0, 1 - (timingDeviation / predictedHours));
          break;
      }

      await this.database.run(`
        UPDATE prediction_accuracy
        SET actual_value = ?, accuracy = ?, deviation_percent = ?
        WHERE id = ?
      `, [actualValue, accuracy, deviationPercent, prediction.id]);
    }
  }

  private async updateSignalCombinationPerformance(outcome: TradeOutcome): Promise<void> {
    if (!this.database || outcome.outcome === 'active') return;

    // Get the signal combination for this trade
    const trade = await this.database.get(`
      SELECT predicted_entry, predicted_target, predicted_stop
      FROM trade_outcomes
      WHERE trade_id = ?
    `, [outcome.tradeId]);

    if (!trade) return;

    // This is a simplified approach - in practice, you'd store the exact signal combination
    // For now, we'll update based on the trade outcome
    const isWin = outcome.outcome === 'winner';
    const pnl = outcome.actualPnL || 0;
    const drawdown = outcome.maxDrawdown || 0;
    const holdingHours = outcome.holdingPeriodHours || 0;

    // Update all combinations (simplified - in practice, find the specific combination)
    await this.database.run(`
      UPDATE signal_combinations
      SET win_count = win_count + ?,
          total_pnl = total_pnl + ?,
          max_drawdown = MAX(max_drawdown, ?),
          total_holding_hours = total_holding_hours + ?
      WHERE trade_count > 0
    `, [isWin ? 1 : 0, pnl, drawdown, holdingHours]);
  }

  private async calculateOverviewMetrics(startDate: string, endDate: string): Promise<any> {
    if (!this.database) return {};

    const metrics = await this.database.get(`
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN outcome = 'active' THEN 1 ELSE 0 END) as active_trades,
        SUM(CASE WHEN outcome != 'active' AND outcome != 'not_taken' THEN 1 ELSE 0 END) as completed_trades,
        AVG(CASE WHEN outcome = 'winner' THEN 1.0 ELSE 0.0 END) as win_rate,
        AVG(COALESCE(actual_pnl, 0)) as avg_pnl,
        SUM(COALESCE(actual_pnl, 0)) as total_return,
        MAX(COALESCE(max_drawdown, 0)) as max_drawdown,
        AVG(COALESCE(holding_period_hours, 0)) as avg_holding_hours
      FROM trade_outcomes
      WHERE created_at BETWEEN ? AND ?
    `, [startDate, endDate]);

    const sharpeRatio = this.calculateSharpeRatio(await this.getDailyReturns(startDate, endDate));

    return {
      totalTrades: metrics?.total_trades || 0,
      activeTrades: metrics?.active_trades || 0,
      completedTrades: metrics?.completed_trades || 0,
      winRate: metrics?.win_rate || 0,
      averagePnL: metrics?.avg_pnl || 0,
      totalReturn: metrics?.total_return || 0,
      maxDrawdown: metrics?.max_drawdown || 0,
      sharpeRatio,
      avgHoldingHours: metrics?.avg_holding_hours || 0,
    };
  }

  private async calculateModulePerformance(startDate: string, endDate: string): Promise<ModulePerformance[]> {
    const modules: AIModuleName[] = ['sector', 'risk', 'technical', 'reddit', 'earningsDrift', 'fusion', 'validator'];
    const performance: ModulePerformance[] = [];

    for (const module of modules) {
      try {
        const modulePerf = await this.getModuleAccuracy(module, 30);
        performance.push(modulePerf);
      } catch (error) {
        loggerUtils.aiLogger.error('Failed to calculate module performance', {
          module,
          error: (error as Error).message,
        });
      }
    }

    return performance;
  }

  private async calculateCategoryPerformance(startDate: string, endDate: string): Promise<Record<string, any>> {
    if (!this.database) return {};

    const categories = await this.database.all(`
      SELECT 
        category,
        COUNT(*) as trade_count,
        AVG(CASE WHEN outcome = 'winner' THEN 1.0 ELSE 0.0 END) as win_rate,
        AVG(COALESCE(actual_pnl, 0)) as avg_pnl
      FROM trade_outcomes
      WHERE created_at BETWEEN ? AND ?
      GROUP BY category
    `, [startDate, endDate]);

    const result: Record<string, any> = {};
    for (const cat of categories) {
      result[cat.category] = {
        tradeCount: cat.trade_count,
        winRate: cat.win_rate,
        averagePnL: cat.avg_pnl,
        bestPerformingSignals: [], // Would implement signal analysis
      };
    }

    return result;
  }

  private async analyzeSignalCombinations(startDate: string, endDate: string): Promise<any> {
    const topCombinations = await this.getBestSignalCombinations(5);
    
    return {
      topCombinations,
      improvementOpportunities: [
        'Increase technical analysis weight for momentum trades',
        'Reduce sentiment weight for high volatility periods',
        'Enhance risk assessment for earnings plays',
      ],
      signalWeightOptimization: {
        technical: 0.32,
        sentiment: 0.23,
        risk: 0.22,
        sector: 0.15,
        anomaly: 0.08,
      },
    };
  }

  private async analyzeUserBehavior(startDate: string, endDate: string): Promise<any> {
    if (!this.database) return {};

    const behaviorData = await this.database.get(`
      SELECT 
        COUNT(CASE WHEN interaction_type = 'take_trade' THEN 1 END) * 1.0 / 
        COUNT(CASE WHEN interaction_type = 'view_card' THEN 1 END) as selection_rate,
        AVG(COALESCE(user_rating, 0)) as avg_rating
      FROM user_interactions
      WHERE timestamp BETWEEN ? AND ?
    `, [new Date(startDate).getTime(), new Date(endDate).getTime()]);

    return {
      tradeSelectionRate: behaviorData?.selection_rate || 0,
      averageUserRating: behaviorData?.avg_rating || 0,
      preferredCategories: ['high_conviction', 'momentum'],
      commonModifications: ['Tighter stops', 'Smaller position sizes'],
      feedbackThemes: ['More conservative sizing', 'Better timing'],
    };
  }

  private async generateRecommendations(
    modulePerformance: ModulePerformance[],
    signalAnalysis: any
  ): Promise<any> {
    const promptOptimizations: string[] = [];
    const moduleAdjustments: Record<AIModuleName, string[]> = {} as any;

    for (const module of modulePerformance) {
      if (module.accuracyRate < 0.7) {
        promptOptimizations.push(`Improve ${module.module} prompt specificity and examples`);
      }
      
      moduleAdjustments[module.module] = module.recommendedAdjustments;
    }

    return {
      promptOptimizations,
      moduleAdjustments,
      signalWeightChanges: signalAnalysis.signalWeightOptimization,
      confidenceCalibration: Object.fromEntries(
        modulePerformance.map(m => [m.module, m.confidenceCalibration])
      ),
    };
  }

  private async storeFeedbackLoop(feedback: FeedbackLoop): Promise<void> {
    if (!this.database) return;

    await this.database.run(`
      INSERT INTO feedback_loops (
        module_id, feedback_type, current_performance, target_performance,
        suggested_changes, implementation_priority, expected_impact
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      feedback.moduleId,
      feedback.feedbackType,
      feedback.currentPerformance,
      feedback.targetPerformance,
      JSON.stringify(feedback.suggestedChanges),
      feedback.implementationPriority,
      feedback.expectedImpact,
    ]);
  }

  private parseHoldingHours(holdingTime: string): number {
    // Parse strings like "1-2 days", "4 hours", etc.
    const hourMatch = holdingTime.match(/(\d+)\s*hour/i);
    if (hourMatch) return parseInt(hourMatch[1]);
    
    const dayMatch = holdingTime.match(/(\d+)(?:-(\d+))?\s*day/i);
    if (dayMatch) {
      const days = dayMatch[2] ? (parseInt(dayMatch[1]) + parseInt(dayMatch[2])) / 2 : parseInt(dayMatch[1]);
      return days * 24;
    }
    
    return 24; // Default to 1 day
  }

  private hashSignalCombination(signals: any): string {
    const normalized = {
      technical: Math.round(signals.technical_weight * 100) / 100,
      sentiment: Math.round(signals.sentiment_weight * 100) / 100,
      risk: Math.round(signals.risk_weight * 100) / 100,
      sector: Math.round(signals.sector_weight * 100) / 100,
      anomaly: Math.round(signals.anomaly_weight * 100) / 100,
    };
    return Buffer.from(JSON.stringify(normalized)).toString('base64').substring(0, 16);
  }

  private calculateConfidenceCalibration(tradeData: any[]): number {
    // Calculate how well confidence scores match actual outcomes
    if (tradeData.length === 0) return 1.0;
    
    const bins = this.performanceConfig.calibrationBins;
    const binSize = 1.0 / bins;
    let totalCalibrationError = 0;
    
    for (let i = 0; i < bins; i++) {
      const minConf = i * binSize;
      const maxConf = (i + 1) * binSize;
      
      const binTrades = tradeData.filter(t => 
        t.predicted_confidence >= minConf && t.predicted_confidence < maxConf
      );
      
      if (binTrades.length > 0) {
        const avgConfidence = binTrades.reduce((sum, t) => sum + t.predicted_confidence, 0) / binTrades.length;
        const winRate = binTrades.filter(t => t.outcome === 'winner').length / binTrades.length;
        totalCalibrationError += Math.abs(avgConfidence - winRate);
      }
    }
    
    return Math.max(0, 1 - (totalCalibrationError / bins));
  }

  private async getBestSignalTypes(module: AIModuleName, days: number): Promise<string[]> {
    // Placeholder implementation - would analyze which signal types perform best
    return ['high_confluence', 'technical_breakout', 'sector_rotation'];
  }

  private async getWorstSignalTypes(module: AIModuleName, days: number): Promise<string[]> {
    // Placeholder implementation - would analyze which signal types perform worst
    return ['low_volume', 'weak_momentum', 'conflicting_signals'];
  }

  private generateModuleAdjustments(module: AIModuleName, performance: any): string[] {
    const adjustments: string[] = [];
    
    if (performance?.avg_accuracy < 0.7) {
      adjustments.push('Increase prompt specificity and add more examples');
      adjustments.push('Improve signal filtering criteria');
    }
    
    if (performance?.avg_confidence > 0.8 && performance?.avg_accuracy < 0.7) {
      adjustments.push('Reduce overconfidence bias in responses');
    }
    
    return adjustments;
  }

  private async calculateUserRiskTolerance(userId: string): Promise<'conservative' | 'moderate' | 'aggressive'> {
    if (!this.database) return 'moderate';

    const riskData = await this.database.get(`
      SELECT AVG(confidence) as avg_confidence
      FROM user_interactions ui
      JOIN trade_outcomes to ON ui.trade_id = to.trade_id
      WHERE ui.user_id = ? AND ui.interaction_type = 'take_trade'
    `, [userId]);

    const avgConfidence = riskData?.avg_confidence || 75;
    
    if (avgConfidence < 70) return 'conservative';
    if (avgConfidence > 85) return 'aggressive';
    return 'moderate';
  }

  private async analyzeSelectionPatterns(userId: string): Promise<string[]> {
    // Analyze what patterns the user follows when selecting trades
    return [
      'Prefers momentum trades on high volume days',
      'Avoids earnings plays during high VIX periods',
      'Takes smaller positions on sentiment-driven trades',
    ];
  }

  private extractFeedbackThemes(comments: string[]): string[] {
    // Simple keyword extraction - in practice would use NLP
    const themes = new Set<string>();
    
    comments.forEach(comment => {
      if (comment.toLowerCase().includes('stop')) themes.add('Stop loss concerns');
      if (comment.toLowerCase().includes('size')) themes.add('Position sizing');
      if (comment.toLowerCase().includes('timing')) themes.add('Entry timing');
      if (comment.toLowerCase().includes('risk')) themes.add('Risk management');
    });
    
    return Array.from(themes);
  }

  private async getDailyReturns(startDate: string, endDate: string): Promise<number[]> {
    if (!this.database) return [];

    const returns = await this.database.all(`
      SELECT DATE(created_at) as date, SUM(COALESCE(actual_pnl, 0)) as daily_return
      FROM trade_outcomes
      WHERE created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [startDate, endDate]);

    return returns.map(r => r.daily_return || 0);
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? avgReturn / stdDev : 0;
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

export default PerformanceTracker;
/**
 * Trade Card Generator
 * Produces formatted, actionable trade cards with comprehensive analysis and tracking
 */

import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';
import path from 'path';

// Import types from other modules
import { TradeCard } from '../ai/StrategicFusion.js';
import { ValidationOutput } from '../ai/TradeValidator.js';

export type TradeCardCategory = 'high_conviction' | 'momentum' | 'sentiment_play' | 'earnings' | 'wildcard';

export interface ChartReference {
  timeframe: '1D' | '5D' | '1M' | '3M';
  keyLevels: Array<{
    type: 'support' | 'resistance' | 'pivot' | 'breakout' | 'trend_line';
    price: number;
    significance: 'low' | 'medium' | 'high';
    description: string;
  }>;
  patterns: Array<{
    name: string;
    completion: number; // 0-1 scale
    target?: number;
    invalidation?: number;
  }>;
  indicators: Array<{
    name: string;
    value: string;
    signal: 'bullish' | 'bearish' | 'neutral';
  }>;
}

export interface TimeToHold {
  minimum: string; // e.g., "2 hours", "1 day"
  optimal: string; // e.g., "1-2 days", "2-3 days"
  maximum: string; // e.g., "3 days", "1 week"
  reasoning: string;
  urgency: 'immediate' | 'within_hours' | 'within_day' | 'patient';
}

export interface FormattedTradeCard {
  id: string;
  category: TradeCardCategory;
  timestamp: number;
  
  // Basic trade info
  symbol: string;
  companyName?: string;
  currentPrice: number;
  strategyType: string;
  tradeDirection: 'long' | 'short';
  
  // Entry/Exit details
  entry: {
    price: number;
    timing: string;
    conditions: string[];
  };
  
  exits: {
    primary: {
      price: number;
      reasoning: string;
    };
    secondary?: {
      price: number;
      reasoning: string;
    };
    stop: {
      price: number;
      reasoning: string;
    };
  };
  
  // Core narrative sections
  whyThisTrade: {
    mainThesis: string;
    keyPoints: string[];
    catalysts: string[];
    confluence: string[];
  };
  
  whatCouldGoWrong: {
    primaryRisks: string[];
    contingencyPlans: string[];
    earlyWarnings: string[];
  };
  
  // Technical analysis
  chartData: ChartReference;
  technicalSummary: string;
  
  // Timing and holding period
  timeToHold: TimeToHold;
  
  // Risk and sizing
  riskAssessment: {
    riskGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    maxPositionSize: number; // % of portfolio
    riskRewardRatio: number;
    maxLossPercent: number;
  };
  
  // Confidence and tracking
  confidenceScore: number; // 0-100
  trackingMetrics: {
    keyLevelsToWatch: string[];
    invalidationSignals: string[];
    profitTakingLevels: string[];
  };
  
  // Source data
  sourceData: {
    fusionTradeCard: TradeCard;
    validationResult?: ValidationOutput;
    marketData: any;
  };
  
  // Performance tracking
  performance?: {
    entryFilled?: boolean;
    entryPrice?: number;
    entryTime?: number;
    currentPnL?: number;
    highWaterMark?: number;
    lowWaterMark?: number;
    exitPrice?: number;
    exitTime?: number;
    finalPnL?: number;
    holdingPeriod?: number;
    outcome: 'active' | 'winner' | 'loser' | 'breakeven' | 'stopped_out';
  };
}

export interface DailyTradeCards {
  date: string;
  timestamp: number;
  marketEnvironment: {
    description: string;
    vixLevel: number;
    marketTrend: string;
    opportunityCount: number;
  };
  cards: FormattedTradeCard[];
  summary: {
    totalCards: number;
    highConfidenceCards: number;
    averageConfidence: number;
    categories: Record<TradeCardCategory, number>;
    riskDistribution: Record<string, number>;
  };
}

export interface TradeCardOutput {
  json: DailyTradeCards;
  html: string;
  plainText: string;
}

export class TradeCardGenerator {
  private database: Database | null = null;
  private dataHub: DataHub;
  
  // Card generation parameters
  private readonly cardCategories: Record<TradeCardCategory, {
    priority: number;
    maxCards: number;
    minConfidence: number;
    description: string;
  }> = {
    high_conviction: {
      priority: 1,
      maxCards: 2,
      minConfidence: 80,
      description: 'Best risk-adjusted opportunities with strong signal confluence',
    },
    momentum: {
      priority: 2,
      maxCards: 1,
      minConfidence: 75,
      description: 'Strong directional moves with technical momentum',
    },
    sentiment_play: {
      priority: 3,
      maxCards: 1,
      minConfidence: 70,
      description: 'Social sentiment-driven opportunities with authentic signals',
    },
    earnings: {
      priority: 4,
      maxCards: 1,
      minConfidence: 70,
      description: 'Earnings-related plays with drift pattern analysis',
    },
    wildcard: {
      priority: 5,
      maxCards: 1,
      minConfidence: 65,
      description: 'Unique opportunities and anomaly-driven trades',
    },
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
    this.initializeDatabase();
  }

  /**
   * Initialize SQLite database for trade card tracking
   */
  private async initializeDatabase(): Promise<void> {
    try {
      const dbPath = path.join(process.cwd(), 'data', 'trade_cards.db');
      
      this.database = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      await this.database.exec(`
        CREATE TABLE IF NOT EXISTS trade_cards (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          symbol TEXT NOT NULL,
          strategy_type TEXT NOT NULL,
          trade_direction TEXT NOT NULL,
          entry_price REAL NOT NULL,
          target_price REAL NOT NULL,
          stop_price REAL NOT NULL,
          confidence_score INTEGER NOT NULL,
          risk_grade TEXT NOT NULL,
          max_position_size REAL NOT NULL,
          time_to_hold_optimal TEXT NOT NULL,
          main_thesis TEXT NOT NULL,
          primary_risks TEXT NOT NULL,
          chart_data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          date_generated TEXT NOT NULL,
          
          -- Performance tracking fields
          entry_filled BOOLEAN DEFAULT FALSE,
          actual_entry_price REAL,
          actual_entry_time INTEGER,
          current_pnl REAL DEFAULT 0,
          high_water_mark REAL DEFAULT 0,
          low_water_mark REAL DEFAULT 0,
          actual_exit_price REAL,
          actual_exit_time INTEGER,
          final_pnl REAL,
          holding_period_hours INTEGER,
          outcome TEXT DEFAULT 'active',
          
          -- Analysis fields
          source_fusion_data TEXT NOT NULL,
          validation_data TEXT,
          market_context TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_trade_cards_date ON trade_cards(date_generated);
        CREATE INDEX IF NOT EXISTS idx_trade_cards_symbol ON trade_cards(symbol);
        CREATE INDEX IF NOT EXISTS idx_trade_cards_category ON trade_cards(category);
        CREATE INDEX IF NOT EXISTS idx_trade_cards_outcome ON trade_cards(outcome);

        CREATE TABLE IF NOT EXISTS daily_card_sets (
          date TEXT PRIMARY KEY,
          card_count INTEGER NOT NULL,
          high_confidence_count INTEGER NOT NULL,
          average_confidence REAL NOT NULL,
          market_environment TEXT NOT NULL,
          vix_level REAL NOT NULL,
          opportunity_count INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      loggerUtils.aiLogger.info('Trade card generator database initialized');
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to initialize trade card database', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Generate daily trade cards from fusion results
   */
  async generateDailyCards(
    fusionResults: TradeCard[],
    validationResults: ValidationOutput[],
    marketContext: any
  ): Promise<TradeCardOutput> {
    const timestamp = Date.now();
    const date = new Date().toISOString().split('T')[0];
    
    try {
      loggerUtils.aiLogger.info('Generating daily trade cards', {
        fusionResultsCount: fusionResults.length,
        validationResultsCount: validationResults.length,
        date,
      });

      // Categorize and filter trade cards
      const categorizedCards = await this.categorizeTradeCards(fusionResults, validationResults);
      
      // Select best cards for each category
      const selectedCards = this.selectBestCards(categorizedCards);
      
      // Format cards with complete information
      const formattedCards: FormattedTradeCard[] = [];
      
      for (const card of selectedCards) {
        const formatted = await this.formatTradeCard(card, marketContext);
        if (formatted) {
          formattedCards.push(formatted);
        }
      }

      // Sort by confidence and category priority
      formattedCards.sort((a, b) => {
        const categoryPriorityDiff = this.cardCategories[a.category].priority - this.cardCategories[b.category].priority;
        if (categoryPriorityDiff !== 0) return categoryPriorityDiff;
        return b.confidenceScore - a.confidenceScore;
      });

      // Create daily card set
      const dailyCards = this.createDailyCardSet(formattedCards, marketContext, date, timestamp);
      
      // Store in database
      await this.storeDailyCards(dailyCards);
      
      // Generate outputs
      const output: TradeCardOutput = {
        json: dailyCards,
        html: this.generateHTMLOutput(dailyCards),
        plainText: this.generatePlainTextOutput(dailyCards),
      };

      loggerUtils.aiLogger.info('Daily trade cards generated successfully', {
        date,
        totalCards: formattedCards.length,
        categories: Object.keys(this.groupCardsByCategory(formattedCards)),
        averageConfidence: formattedCards.reduce((sum, card) => sum + card.confidenceScore, 0) / formattedCards.length,
      });

      return output;
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to generate daily trade cards', {
        error: (error as Error).message,
        date,
      });
      throw error;
    }
  }

  /**
   * Categorize trade cards based on their characteristics
   */
  private async categorizeTradeCards(
    fusionResults: TradeCard[],
    validationResults: ValidationOutput[]
  ): Promise<Record<TradeCardCategory, TradeCard[]>> {
    const categorized: Record<TradeCardCategory, TradeCard[]> = {
      high_conviction: [],
      momentum: [],
      sentiment_play: [],
      earnings: [],
      wildcard: [],
    };

    for (const card of fusionResults) {
      const validation = validationResults.find(v => v.tradeId === card.id);
      const category = this.determineCardCategory(card, validation);
      
      if (category) {
        categorized[category].push(card);
      }
    }

    return categorized;
  }

  /**
   * Determine the appropriate category for a trade card
   */
  private determineCardCategory(card: TradeCard, validation?: ValidationOutput): TradeCardCategory | null {
    const confidence = card.header.confidence * 100;
    const setupType = card.narrative.setup.type;
    const signalComposition = card.signal_composition;

    // High conviction: Strong confluence, high confidence, low risk
    if (confidence >= 80 && 
        card.narrative.risk.risk_grade <= 'B' &&
        validation?.validation_result.validation_score && validation.validation_result.validation_score >= 0.8) {
      return 'high_conviction';
    }

    // Earnings play: Earnings-related setup
    if (setupType === 'Earnings Play' || 
        card.narrative.catalyst.primary.toLowerCase().includes('earnings')) {
      return 'earnings';
    }

    // Momentum: Breakout or momentum setups with strong technical signals
    if ((setupType === 'Breakout' || setupType === 'Momentum') && 
        signalComposition.technical_weight >= 0.7) {
      return 'momentum';
    }

    // Sentiment play: High sentiment weight
    if (signalComposition.sentiment_weight >= 0.6) {
      return 'sentiment_play';
    }

    // Wildcard: Anomaly or unique setups
    if (setupType === 'Anomaly Exploitation' || 
        signalComposition.anomaly_weight >= 0.5) {
      return 'wildcard';
    }

    // Default to wildcard if meets minimum confidence
    if (confidence >= 65) {
      return 'wildcard';
    }

    return null; // Card doesn't meet criteria for any category
  }

  /**
   * Select best cards for each category
   */
  private selectBestCards(categorized: Record<TradeCardCategory, TradeCard[]>): TradeCard[] {
    const selected: TradeCard[] = [];

    for (const [category, cards] of Object.entries(categorized) as [TradeCardCategory, TradeCard[]][]) {
      const categoryConfig = this.cardCategories[category];
      
      // Sort by confidence and take best cards
      const sortedCards = cards
        .filter(card => (card.header.confidence * 100) >= categoryConfig.minConfidence)
        .sort((a, b) => b.header.confidence - a.header.confidence)
        .slice(0, categoryConfig.maxCards);
      
      selected.push(...sortedCards);
    }

    return selected;
  }

  /**
   * Format a trade card with complete information
   */
  private async formatTradeCard(
    fusionCard: TradeCard,
    marketContext: any,
    validation?: ValidationOutput
  ): Promise<FormattedTradeCard | null> {
    try {
      const category = this.determineCardCategory(fusionCard, validation);
      if (!category) return null;

      // Get company name (would integrate with real data source)
      const companyName = await this.getCompanyName(fusionCard.symbol);
      
      // Build chart references
      const chartData = this.buildChartReference(fusionCard, marketContext);
      
      // Calculate time to hold
      const timeToHold = this.calculateTimeToHold(fusionCard);
      
      // Format narrative sections
      const whyThisTrade = this.formatWhyThisTrade(fusionCard);
      const whatCouldGoWrong = this.formatWhatCouldGoWrong(fusionCard);

      const formattedCard: FormattedTradeCard = {
        id: fusionCard.id,
        category,
        timestamp: Date.now(),
        symbol: fusionCard.symbol,
        companyName,
        currentPrice: fusionCard.execution.entry_price, // Use as approximation
        strategyType: fusionCard.narrative.setup.type,
        tradeDirection: fusionCard.execution.target_price > fusionCard.execution.entry_price ? 'long' : 'short',
        
        entry: {
          price: fusionCard.execution.entry_price,
          timing: fusionCard.narrative.timing.entry_window,
          conditions: fusionCard.narrative.confirmation.signals_needed,
        },
        
        exits: {
          primary: {
            price: fusionCard.execution.target_price,
            reasoning: `${fusionCard.narrative.setup.type} target based on ${fusionCard.narrative.catalyst.primary}`,
          },
          stop: {
            price: fusionCard.execution.stop_loss,
            reasoning: fusionCard.narrative.risk.stop_loss_strategy,
          },
        },
        
        whyThisTrade,
        whatCouldGoWrong,
        chartData,
        technicalSummary: this.generateTechnicalSummary(fusionCard),
        timeToHold,
        
        riskAssessment: {
          riskGrade: fusionCard.narrative.risk.risk_grade,
          maxPositionSize: fusionCard.execution.position_size * 100,
          riskRewardRatio: fusionCard.execution.risk_reward_ratio,
          maxLossPercent: fusionCard.execution.max_loss_percent * 100,
        },
        
        confidenceScore: Math.round(fusionCard.header.confidence * 100),
        
        trackingMetrics: {
          keyLevelsToWatch: fusionCard.narrative.setup.key_levels,
          invalidationSignals: fusionCard.narrative.confirmation.invalidation_triggers,
          profitTakingLevels: [`Primary: $${fusionCard.execution.target_price.toFixed(2)}`],
        },
        
        sourceData: {
          fusionTradeCard: fusionCard,
          validationResult: validation,
          marketData: marketContext,
        },
      };

      return formattedCard;
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to format trade card', {
        cardId: fusionCard.id,
        symbol: fusionCard.symbol,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Format "Why this trade?" section
   */
  private formatWhyThisTrade(card: TradeCard): any {
    return {
      mainThesis: card.narrative.summary,
      keyPoints: [
        `${card.narrative.setup.type} setup with ${Math.round(card.narrative.setup.strength * 100)}% strength`,
        `${card.header.confidence * 100}% confidence based on signal confluence`,
        `Risk/Reward ratio of ${card.execution.risk_reward_ratio.toFixed(1)}:1`,
      ],
      catalysts: [
        card.narrative.catalyst.primary,
        ...(card.narrative.catalyst.secondary || []),
      ],
      confluence: card.narrative.setup.confluence_factors,
    };
  }

  /**
   * Format "What could go wrong?" section
   */
  private formatWhatCouldGoWrong(card: TradeCard): any {
    return {
      primaryRisks: card.narrative.risk.primary_risks,
      contingencyPlans: [
        `Stop loss at $${card.execution.stop_loss.toFixed(2)}`,
        `Position size limited to ${(card.execution.position_size * 100).toFixed(1)}% of portfolio`,
        ...(card.counter_signals.identified ? [card.counter_signals.mitigation || 'Monitor counter-signals'] : []),
      ],
      earlyWarnings: card.narrative.confirmation.invalidation_triggers,
    };
  }

  /**
   * Build chart reference data
   */
  private buildChartReference(card: TradeCard, marketContext: any): ChartReference {
    return {
      timeframe: '1D', // Default timeframe
      keyLevels: [
        {
          type: 'support',
          price: card.execution.stop_loss,
          significance: 'high',
          description: 'Stop loss level',
        },
        {
          type: 'resistance',
          price: card.execution.target_price,
          significance: 'high',
          description: 'Primary target',
        },
        {
          type: 'pivot',
          price: card.execution.entry_price,
          significance: 'medium',
          description: 'Entry level',
        },
      ],
      patterns: [
        {
          name: card.narrative.setup.type,
          completion: card.narrative.setup.strength,
          target: card.execution.target_price,
          invalidation: card.execution.stop_loss,
        },
      ],
      indicators: [
        {
          name: 'Setup Strength',
          value: `${Math.round(card.narrative.setup.strength * 100)}%`,
          signal: card.execution.target_price > card.execution.entry_price ? 'bullish' : 'bearish',
        },
        {
          name: 'Signal Confluence',
          value: `${Math.round(card.signal_composition.composite_score * 100)}%`,
          signal: card.signal_composition.composite_score > 0.7 ? 'bullish' : 'neutral',
        },
      ],
    };
  }

  /**
   * Calculate time to hold recommendations
   */
  private calculateTimeToHold(card: TradeCard): TimeToHold {
    const setupType = card.narrative.setup.type;
    const timeHorizon = card.header.timeframe;
    const urgency = card.narrative.timing.urgency;

    let minimum = '4 hours';
    let optimal = '1-2 days';
    let maximum = '3 days';
    let holdUrgency: TimeToHold['urgency'] = 'within_day';

    // Adjust based on setup type
    switch (setupType) {
      case 'Breakout':
        minimum = '2 hours';
        optimal = '1-2 days';
        maximum = '3 days';
        holdUrgency = urgency === 'high' ? 'immediate' : 'within_hours';
        break;
      
      case 'Earnings Play':
        minimum = '1 hour';
        optimal = '6-24 hours';
        maximum = '2 days';
        holdUrgency = 'immediate';
        break;
      
      case 'Momentum':
        minimum = '4 hours';
        optimal = '2-3 days';
        maximum = '5 days';
        holdUrgency = 'within_hours';
        break;
      
      case 'Sector Rotation':
        minimum = '1 day';
        optimal = '3-5 days';
        maximum = '1 week';
        holdUrgency = 'within_day';
        break;
      
      case 'Mean Reversion':
        minimum = '6 hours';
        optimal = '1-3 days';
        maximum = '1 week';
        holdUrgency = 'patient';
        break;
    }

    return {
      minimum,
      optimal,
      maximum,
      reasoning: `${setupType} typically resolves within ${optimal} based on ${card.narrative.catalyst.timing_sensitivity} catalyst timing`,
      urgency: holdUrgency,
    };
  }

  /**
   * Generate technical summary
   */
  private generateTechnicalSummary(card: TradeCard): string {
    const direction = card.execution.target_price > card.execution.entry_price ? 'bullish' : 'bearish';
    const strength = Math.round(card.narrative.setup.strength * 100);
    
    return `${direction.toUpperCase()} ${card.narrative.setup.type} with ${strength}% setup strength. ` +
           `Entry: $${card.execution.entry_price.toFixed(2)}, Target: $${card.execution.target_price.toFixed(2)}, ` +
           `Stop: $${card.execution.stop_loss.toFixed(2)}. Risk/Reward: ${card.execution.risk_reward_ratio.toFixed(1)}:1`;
  }

  /**
   * Create daily card set summary
   */
  private createDailyCardSet(
    cards: FormattedTradeCard[],
    marketContext: any,
    date: string,
    timestamp: number
  ): DailyTradeCards {
    const categoryGroups = this.groupCardsByCategory(cards);
    const highConfidenceCards = cards.filter(card => card.confidenceScore >= 80);
    const averageConfidence = cards.reduce((sum, card) => sum + card.confidenceScore, 0) / cards.length;

    const riskDistribution: Record<string, number> = {};
    cards.forEach(card => {
      const grade = card.riskAssessment.riskGrade;
      riskDistribution[grade] = (riskDistribution[grade] || 0) + 1;
    });

    return {
      date,
      timestamp,
      marketEnvironment: {
        description: this.generateMarketDescription(marketContext),
        vixLevel: marketContext.vixLevel || 20,
        marketTrend: marketContext.marketTrend || 'neutral',
        opportunityCount: cards.length,
      },
      cards,
      summary: {
        totalCards: cards.length,
        highConfidenceCards: highConfidenceCards.length,
        averageConfidence: Math.round(averageConfidence),
        categories: Object.fromEntries(
          Object.entries(categoryGroups).map(([category, cardList]) => [category, cardList.length])
        ) as Record<TradeCardCategory, number>,
        riskDistribution,
      },
    };
  }

  /**
   * Group cards by category
   */
  private groupCardsByCategory(cards: FormattedTradeCard[]): Record<TradeCardCategory, FormattedTradeCard[]> {
    const groups: Record<TradeCardCategory, FormattedTradeCard[]> = {
      high_conviction: [],
      momentum: [],
      sentiment_play: [],
      earnings: [],
      wildcard: [],
    };

    cards.forEach(card => {
      groups[card.category].push(card);
    });

    return groups;
  }

  /**
   * Generate market environment description
   */
  private generateMarketDescription(marketContext: any): string {
    const vix = marketContext.vixLevel || 20;
    const trend = marketContext.marketTrend || 'neutral';
    
    let description = '';
    
    if (vix > 25) {
      description += 'High volatility environment';
    } else if (vix < 15) {
      description += 'Low volatility environment';
    } else {
      description += 'Moderate volatility environment';
    }
    
    description += ` with ${trend} market bias`;
    
    if (marketContext.sectorPerformance > 0.02) {
      description += ', strong sector rotation activity';
    } else if (marketContext.sectorPerformance < -0.02) {
      description += ', defensive sector rotation';
    }
    
    return description;
  }

  /**
   * Store daily cards in database
   */
  private async storeDailyCards(dailyCards: DailyTradeCards): Promise<void> {
    if (!this.database) return;

    try {
      // Store daily summary
      await this.database.run(`
        INSERT OR REPLACE INTO daily_card_sets (
          date, card_count, high_confidence_count, average_confidence,
          market_environment, vix_level, opportunity_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        dailyCards.date,
        dailyCards.summary.totalCards,
        dailyCards.summary.highConfidenceCards,
        dailyCards.summary.averageConfidence,
        dailyCards.marketEnvironment.description,
        dailyCards.marketEnvironment.vixLevel,
        dailyCards.marketEnvironment.opportunityCount,
      ]);

      // Store individual cards
      for (const card of dailyCards.cards) {
        await this.database.run(`
          INSERT OR REPLACE INTO trade_cards (
            id, category, symbol, strategy_type, trade_direction,
            entry_price, target_price, stop_price, confidence_score,
            risk_grade, max_position_size, time_to_hold_optimal,
            main_thesis, primary_risks, chart_data, date_generated,
            source_fusion_data, validation_data, market_context
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          card.id,
          card.category,
          card.symbol,
          card.strategyType,
          card.tradeDirection,
          card.entry.price,
          card.exits.primary.price,
          card.exits.stop.price,
          card.confidenceScore,
          card.riskAssessment.riskGrade,
          card.riskAssessment.maxPositionSize,
          card.timeToHold.optimal,
          card.whyThisTrade.mainThesis,
          JSON.stringify(card.whatCouldGoWrong.primaryRisks),
          JSON.stringify(card.chartData),
          dailyCards.date,
          JSON.stringify(card.sourceData.fusionTradeCard),
          JSON.stringify(card.sourceData.validationResult),
          JSON.stringify(card.sourceData.marketData),
        ]);
      }

      loggerUtils.aiLogger.info('Daily trade cards stored in database', {
        date: dailyCards.date,
        cardCount: dailyCards.cards.length,
      });
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to store daily trade cards', {
        date: dailyCards.date,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Generate HTML output
   */
  private generateHTMLOutput(dailyCards: DailyTradeCards): string {
    const cards = dailyCards.cards;
    
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StockGenius Daily Trade Cards - ${dailyCards.date}</title>
    <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .market-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .metric-card { background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .trade-card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .trade-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px solid #f0f0f0; }
        .symbol { font-size: 24px; font-weight: bold; color: #2c3e50; }
        .confidence { background: #27ae60; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
        .confidence.medium { background: #f39c12; }
        .confidence.low { background: #e74c3c; }
        .category-badge { background: #3498db; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; text-transform: uppercase; }
        .trade-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .detail-section { background: #f8f9fa; padding: 15px; border-radius: 6px; }
        .detail-title { font-weight: bold; color: #2c3e50; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
        .price-levels { display: flex; gap: 15px; margin-bottom: 15px; }
        .price-level { text-align: center; padding: 10px; background: white; border-radius: 6px; flex: 1; }
        .price-value { font-size: 18px; font-weight: bold; color: #2c3e50; }
        .price-label { font-size: 12px; color: #7f8c8d; text-transform: uppercase; }
        .narrative-section { margin-bottom: 20px; }
        .narrative-title { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .key-points { list-style: none; padding: 0; }
        .key-points li { padding: 8px 0; border-bottom: 1px solid #ecf0f1; }
        .key-points li:before { content: "→ "; color: #3498db; font-weight: bold; }
        .risk-indicator { padding: 8px 12px; border-radius: 4px; display: inline-block; font-weight: bold; }
        .risk-A { background: #d5f4e6; color: #27ae60; }
        .risk-B { background: #fef5e7; color: #f39c12; }
        .risk-C { background: #fdeaea; color: #e74c3c; }
        .risk-D, .risk-F { background: #f8d7da; color: #721c24; }
        .time-horizon { background: #e8f4f8; padding: 10px; border-radius: 6px; border-left: 4px solid #3498db; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 StockGenius Daily Trade Cards</h1>
            <p><strong>Date:</strong> ${dailyCards.date} | <strong>Market:</strong> ${dailyCards.marketEnvironment.description}</p>
        </div>
        
        <div class="market-overview">
            <div class="metric-card">
                <h3>Total Opportunities</h3>
                <div style="font-size: 24px; font-weight: bold; color: #3498db;">${dailyCards.summary.totalCards}</div>
            </div>
            <div class="metric-card">
                <h3>High Confidence</h3>
                <div style="font-size: 24px; font-weight: bold; color: #27ae60;">${dailyCards.summary.highConfidenceCards}</div>
            </div>
            <div class="metric-card">
                <h3>Avg Confidence</h3>
                <div style="font-size: 24px; font-weight: bold; color: #f39c12;">${dailyCards.summary.averageConfidence}%</div>
            </div>
            <div class="metric-card">
                <h3>VIX Level</h3>
                <div style="font-size: 24px; font-weight: bold; color: #e74c3c;">${dailyCards.marketEnvironment.vixLevel.toFixed(1)}</div>
            </div>
        </div>`;

    // Generate individual trade cards
    cards.forEach((card, index) => {
      const confidenceClass = card.confidenceScore >= 80 ? 'high' : card.confidenceScore >= 70 ? 'medium' : 'low';
      
      html += `
        <div class="trade-card">
            <div class="trade-header">
                <div>
                    <div class="symbol">${card.symbol}</div>
                    <span class="category-badge">${card.category.replace('_', ' ')}</span>
                    ${card.companyName ? `<div style="color: #7f8c8d; margin-top: 5px;">${card.companyName}</div>` : ''}
                </div>
                <div class="confidence ${confidenceClass}">${card.confidenceScore}%</div>
            </div>
            
            <div class="price-levels">
                <div class="price-level">
                    <div class="price-value" style="color: #3498db;">$${card.entry.price.toFixed(2)}</div>
                    <div class="price-label">Entry</div>
                </div>
                <div class="price-level">
                    <div class="price-value" style="color: #27ae60;">$${card.exits.primary.price.toFixed(2)}</div>
                    <div class="price-label">Target</div>
                </div>
                <div class="price-level">
                    <div class="price-value" style="color: #e74c3c;">$${card.exits.stop.price.toFixed(2)}</div>
                    <div class="price-label">Stop</div>
                </div>
                <div class="price-level">
                    <div class="price-value">${card.riskAssessment.riskRewardRatio.toFixed(1)}:1</div>
                    <div class="price-label">R/R</div>
                </div>
            </div>
            
            <div class="trade-details">
                <div class="detail-section">
                    <div class="detail-title">Strategy & Timing</div>
                    <p><strong>Strategy:</strong> ${card.strategyType}</p>
                    <p><strong>Direction:</strong> ${card.tradeDirection.toUpperCase()}</p>
                    <p><strong>Entry Timing:</strong> ${card.entry.timing}</p>
                    <div class="time-horizon">
                        <strong>Hold Time:</strong> ${card.timeToHold.optimal}<br>
                        <small>${card.timeToHold.reasoning}</small>
                    </div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-title">Risk Assessment</div>
                    <p><strong>Risk Grade:</strong> <span class="risk-indicator risk-${card.riskAssessment.riskGrade}">${card.riskAssessment.riskGrade}</span></p>
                    <p><strong>Max Position:</strong> ${card.riskAssessment.maxPositionSize.toFixed(1)}%</p>
                    <p><strong>Max Loss:</strong> ${card.riskAssessment.maxLossPercent.toFixed(1)}%</p>
                </div>
            </div>
            
            <div class="narrative-section">
                <div class="narrative-title">🎯 Why This Trade?</div>
                <p><strong>Thesis:</strong> ${card.whyThisTrade.mainThesis}</p>
                <ul class="key-points">
                    ${card.whyThisTrade.keyPoints.map(point => `<li>${point}</li>`).join('')}
                </ul>
                <p><strong>Catalysts:</strong> ${card.whyThisTrade.catalysts.join(', ')}</p>
            </div>
            
            <div class="narrative-section">
                <div class="narrative-title">⚠️ What Could Go Wrong?</div>
                <ul class="key-points">
                    ${card.whatCouldGoWrong.primaryRisks.map(risk => `<li>${risk}</li>`).join('')}
                </ul>
                <p><strong>Contingency Plans:</strong> ${card.whatCouldGoWrong.contingencyPlans.join(', ')}</p>
            </div>
            
            <div class="detail-section">
                <div class="detail-title">Key Levels to Watch</div>
                <ul class="key-points">
                    ${card.trackingMetrics.keyLevelsToWatch.map(level => `<li>${level}</li>`).join('')}
                </ul>
            </div>
        </div>`;
    });

    html += `
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Generate plain text output
   */
  private generatePlainTextOutput(dailyCards: DailyTradeCards): string {
    let text = `STOCKGENIUS DAILY TRADE CARDS - ${dailyCards.date}\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Market Environment: ${dailyCards.marketEnvironment.description}\n`;
    text += `Total Cards: ${dailyCards.summary.totalCards} | High Confidence: ${dailyCards.summary.highConfidenceCards} | Avg Confidence: ${dailyCards.summary.averageConfidence}%\n\n`;

    dailyCards.cards.forEach((card, index) => {
      text += `${index + 1}. ${card.symbol} - ${card.strategyType} (${card.confidenceScore}% confidence)\n`;
      text += `   Category: ${card.category.replace('_', ' ').toUpperCase()}\n`;
      text += `   Entry: $${card.entry.price.toFixed(2)} | Target: $${card.exits.primary.price.toFixed(2)} | Stop: $${card.exits.stop.price.toFixed(2)}\n`;
      text += `   Risk Grade: ${card.riskAssessment.riskGrade} | Max Position: ${card.riskAssessment.maxPositionSize.toFixed(1)}% | R/R: ${card.riskAssessment.riskRewardRatio.toFixed(1)}:1\n`;
      text += `   Hold Time: ${card.timeToHold.optimal}\n\n`;
      text += `   WHY THIS TRADE:\n`;
      text += `   ${card.whyThisTrade.mainThesis}\n`;
      card.whyThisTrade.keyPoints.forEach(point => {
        text += `   • ${point}\n`;
      });
      text += `\n   WHAT COULD GO WRONG:\n`;
      card.whatCouldGoWrong.primaryRisks.forEach(risk => {
        text += `   • ${risk}\n`;
      });
      text += `\n   TECHNICAL SUMMARY:\n`;
      text += `   ${card.technicalSummary}\n\n`;
      text += `${'-'.repeat(50)}\n\n`;
    });

    return text;
  }

  /**
   * Update trade card performance
   */
  async updateTradePerformance(
    cardId: string,
    performance: Partial<FormattedTradeCard['performance']>
  ): Promise<void> {
    if (!this.database) return;

    try {
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (performance.entryFilled !== undefined) {
        updateFields.push('entry_filled = ?');
        updateValues.push(performance.entryFilled);
      }
      if (performance.entryPrice !== undefined) {
        updateFields.push('actual_entry_price = ?');
        updateValues.push(performance.entryPrice);
      }
      if (performance.entryTime !== undefined) {
        updateFields.push('actual_entry_time = ?');
        updateValues.push(performance.entryTime);
      }
      if (performance.currentPnL !== undefined) {
        updateFields.push('current_pnl = ?');
        updateValues.push(performance.currentPnL);
      }
      if (performance.highWaterMark !== undefined) {
        updateFields.push('high_water_mark = ?');
        updateValues.push(performance.highWaterMark);
      }
      if (performance.lowWaterMark !== undefined) {
        updateFields.push('low_water_mark = ?');
        updateValues.push(performance.lowWaterMark);
      }
      if (performance.exitPrice !== undefined) {
        updateFields.push('actual_exit_price = ?');
        updateValues.push(performance.exitPrice);
      }
      if (performance.exitTime !== undefined) {
        updateFields.push('actual_exit_time = ?');
        updateValues.push(performance.exitTime);
      }
      if (performance.finalPnL !== undefined) {
        updateFields.push('final_pnl = ?');
        updateValues.push(performance.finalPnL);
      }
      if (performance.holdingPeriod !== undefined) {
        updateFields.push('holding_period_hours = ?');
        updateValues.push(performance.holdingPeriod);
      }
      if (performance.outcome !== undefined) {
        updateFields.push('outcome = ?');
        updateValues.push(performance.outcome);
      }

      if (updateFields.length > 0) {
        updateValues.push(cardId);
        await this.database.run(
          `UPDATE trade_cards SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues
        );

        loggerUtils.aiLogger.info('Trade card performance updated', {
          cardId,
          updatedFields: updateFields.map(field => field.split(' = ')[0]),
        });
      }
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to update trade card performance', {
        cardId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get trade card performance analytics
   */
  async getPerformanceAnalytics(dateRange?: { start: string; end: string }): Promise<any> {
    if (!this.database) return null;

    try {
      let whereClause = '';
      const params: any[] = [];

      if (dateRange) {
        whereClause = 'WHERE date_generated BETWEEN ? AND ?';
        params.push(dateRange.start, dateRange.end);
      }

      const analytics = await this.database.get(`
        SELECT 
          COUNT(*) as total_cards,
          SUM(CASE WHEN outcome = 'winner' THEN 1 ELSE 0 END) as winners,
          SUM(CASE WHEN outcome = 'loser' THEN 1 ELSE 0 END) as losers,
          SUM(CASE WHEN outcome = 'stopped_out' THEN 1 ELSE 0 END) as stopped_out,
          SUM(CASE WHEN outcome = 'active' THEN 1 ELSE 0 END) as active,
          AVG(confidence_score) as avg_confidence,
          AVG(CASE WHEN final_pnl IS NOT NULL THEN final_pnl ELSE 0 END) as avg_pnl,
          AVG(CASE WHEN holding_period_hours IS NOT NULL THEN holding_period_hours ELSE 0 END) as avg_holding_hours
        FROM trade_cards ${whereClause}
      `, params);

      const categoryPerformance = await this.database.all(`
        SELECT 
          category,
          COUNT(*) as total,
          SUM(CASE WHEN outcome = 'winner' THEN 1 ELSE 0 END) as winners,
          AVG(confidence_score) as avg_confidence,
          AVG(CASE WHEN final_pnl IS NOT NULL THEN final_pnl ELSE 0 END) as avg_pnl
        FROM trade_cards ${whereClause}
        GROUP BY category
      `, params);

      return {
        overview: analytics,
        categoryPerformance,
        generatedAt: Date.now(),
      };
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to get performance analytics', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get company name (placeholder - would integrate with real data source)
   */
  private async getCompanyName(symbol: string): Promise<string | undefined> {
    // Would integrate with company data API
    const commonCompanies: Record<string, string> = {
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc.',
      'AMZN': 'Amazon.com Inc.',
      'TSLA': 'Tesla, Inc.',
      'NVDA': 'NVIDIA Corporation',
      'META': 'Meta Platforms, Inc.',
    };

    return commonCompanies[symbol];
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

export default TradeCardGenerator;
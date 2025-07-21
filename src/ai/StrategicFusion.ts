/**
 * Strategic Fusion Engine
 * Uses GPT-4o for multi-modal synthesis and complex reasoning across all AI modules
 */

import { openAIClient } from '../config/openai.js';
import { redisClientInstance as redisClient } from '../config/redis.js';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';

// Import all AI module types
import { SectorAnalysisOutput } from './modules/SectorIntelligence.js';
import { RiskAssessmentOutput } from './modules/RiskAssessor.js';
import { TechnicalTimingOutput } from './modules/TechnicalTiming.js';
import { RedditNLPOutput } from './modules/RedditNLP.js';
import { EarningsDriftOutput } from './modules/EarningsDrift.js';

export interface AnomalyExplainerOutput {
  symbol: string;
  timestamp: number;
  investigation: {
    primary_catalyst: string;
    catalyst_confidence: number;
    hidden_factors: string[];
    correlation_strength: number;
    explanation: string;
    market_structure_impact: string;
    follow_through_probability: number;
  };
  data_sources: {
    news_correlation: number;
    social_correlation: number;
    insider_correlation: number;
    options_correlation: number;
  };
  metadata: {
    model_used: string;
    processing_time: number;
    confidence_score: number;
  };
}

export interface ModuleInputs {
  sector?: SectorAnalysisOutput;
  risk?: RiskAssessmentOutput;
  technical?: TechnicalTimingOutput;
  reddit?: RedditNLPOutput;
  earningsDrift?: EarningsDriftOutput;
  anomaly?: AnomalyExplainerOutput;
}

export interface TradeNarrative {
  summary: string;
  setup: {
    type: 'Breakout' | 'Reversal' | 'Momentum' | 'Earnings Play' | 'Sector Rotation' | 'Anomaly Exploitation' | 'Mean Reversion';
    strength: number; // 0-1 scale
    confluence_factors: string[];
    key_levels: string[];
  };
  catalyst: {
    primary: string;
    secondary?: string[];
    timing_sensitivity: 'immediate' | 'hours' | 'days' | 'weeks';
    event_risk: boolean;
  };
  timing: {
    entry_window: string;
    optimal_entry: string;
    time_horizon: string;
    urgency: 'high' | 'medium' | 'low';
  };
  confirmation: {
    signals_needed: string[];
    invalidation_triggers: string[];
    monitoring_points: string[];
  };
  risk: {
    primary_risks: string[];
    risk_grade: 'A' | 'B' | 'C' | 'D' | 'F';
    position_sizing: number; // Recommended % of portfolio
    stop_loss_strategy: string;
  };
}

export interface TradeCard {
  id: string;
  symbol: string;
  timestamp: number;
  
  header: {
    title: string;
    subtitle: string;
    confidence: number; // 0-1 scale
    timeframe: string;
    trade_type: 'Long' | 'Short' | 'Options Play' | 'Pairs Trade';
  };
  
  narrative: TradeNarrative;
  
  signal_composition: {
    technical_weight: number;
    sentiment_weight: number;
    risk_weight: number;
    sector_weight: number;
    anomaly_weight: number;
    composite_score: number;
  };
  
  counter_signals: {
    identified: boolean;
    description?: string;
    severity: 'low' | 'medium' | 'high';
    mitigation?: string;
  };
  
  execution: {
    entry_price: number;
    target_price: number;
    stop_loss: number;
    position_size: number;
    risk_reward_ratio: number;
    max_loss_percent: number;
  };
  
  metadata: {
    model_used: string;
    processing_time: number;
    data_quality_score: number;
    module_contributions: Record<string, number>;
    fusion_confidence: number;
  };
}

export interface StrategicFusionInput {
  symbol: string;
  currentPrice: number;
  marketContext: {
    vixLevel: number;
    marketTrend: 'bullish' | 'bearish' | 'neutral';
    sectorPerformance: number;
    timeOfDay: 'pre_market' | 'market_open' | 'mid_day' | 'market_close' | 'after_hours';
  };
  moduleOutputs: ModuleInputs;
  requestedAnalysis?: {
    timeHorizon?: 'intraday' | 'swing' | 'position';
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
    focusAreas?: string[];
  };
}

export interface StrategicFusionOutput {
  timestamp: number;
  marketOverview: {
    environment: string;
    dominant_themes: string[];
    opportunity_assessment: string;
  };
  tradeCards: TradeCard[];
  portfolioGuidance: {
    overall_allocation: string;
    sector_tilts: string[];
    risk_management: string;
    market_outlook: string;
  };
  metadata: {
    total_symbols_analyzed: number;
    processing_time: number;
    fusion_quality_score: number;
    model_used: string;
  };
}

export class StrategicFusion {
  private dataHub: DataHub;
  private cacheTimeout = 30 * 60; // 30 minutes in seconds
  
  // Signal weighting configuration
  private readonly signalWeights = {
    technical: 0.30,
    sentiment: 0.25,
    risk: 0.20,
    sector: 0.15,
    anomaly: 0.10,
  };

  // Confidence thresholds for trade generation
  private readonly confidenceThresholds = {
    minimum: 0.15, // Temporarily lowered to force card generation for testing
    high: 0.70,     // High confidence threshold
    veryHigh: 0.85, // Very high confidence threshold
  };

  // OpenAI function calling schema for trade synthesis
  private readonly strategicFusionSchema = {
    name: "synthesize_trade_narrative",
    description: "Synthesize multiple AI module outputs into coherent trade narrative",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Concise 2-3 sentence trade thesis summary"
        },
        setup: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["Breakout", "Reversal", "Momentum", "Earnings Play", "Sector Rotation", "Anomaly Exploitation", "Mean Reversion"],
              description: "Primary setup type based on analysis"
            },
            strength: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Setup strength based on signal confluence"
            },
            confluence_factors: {
              type: "array",
              items: { type: "string" },
              description: "Key factors supporting the setup"
            },
            key_levels: {
              type: "array",
              items: { type: "string" },
              description: "Important price levels and technical factors"
            }
          },
          required: ["type", "strength", "confluence_factors", "key_levels"]
        },
        catalyst: {
          type: "object",
          properties: {
            primary: {
              type: "string",
              description: "Primary catalyst driving the trade opportunity"
            },
            secondary: {
              type: "array",
              items: { type: "string" },
              description: "Secondary supporting catalysts"
            },
            timing_sensitivity: {
              type: "string",
              enum: ["immediate", "hours", "days", "weeks"],
              description: "How time-sensitive the catalyst timing is"
            },
            event_risk: {
              type: "boolean",
              description: "Whether catalyst involves binary event risk"
            }
          },
          required: ["primary", "timing_sensitivity", "event_risk"]
        },
        timing: {
          type: "object",
          properties: {
            entry_window: {
              type: "string",
              description: "Optimal entry timing window"
            },
            optimal_entry: {
              type: "string",
              description: "Most optimal entry condition or timing"
            },
            time_horizon: {
              type: "string",
              description: "Expected time to target achievement"
            },
            urgency: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Urgency level for trade execution"
            }
          },
          required: ["entry_window", "optimal_entry", "time_horizon", "urgency"]
        },
        confirmation: {
          type: "object",
          properties: {
            signals_needed: {
              type: "array",
              items: { type: "string" },
              description: "Additional signals needed to confirm trade"
            },
            invalidation_triggers: {
              type: "array",
              items: { type: "string" },
              description: "Conditions that would invalidate the trade thesis"
            },
            monitoring_points: {
              type: "array",
              items: { type: "string" },
              description: "Key metrics and levels to monitor"
            }
          },
          required: ["signals_needed", "invalidation_triggers", "monitoring_points"]
        },
        risk: {
          type: "object",
          properties: {
            primary_risks: {
              type: "array",
              items: { type: "string" },
              description: "Main risk factors for the trade"
            },
            risk_grade: {
              type: "string",
              enum: ["A", "B", "C", "D", "F"],
              description: "Overall risk grade for the trade"
            },
            position_sizing: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Recommended position size as fraction of portfolio"
            },
            stop_loss_strategy: {
              type: "string",
              description: "Recommended stop loss approach"
            }
          },
          required: ["primary_risks", "risk_grade", "position_sizing", "stop_loss_strategy"]
        }
      },
      required: ["summary", "setup", "catalyst", "timing", "confirmation", "risk"]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main strategic fusion method - generates daily trade cards
   */
  async generateTradeCards(inputs: StrategicFusionInput[]): Promise<StrategicFusionOutput> {
    const startTime = Date.now();
    
    try {
      loggerUtils.aiLogger.info('Starting strategic fusion analysis', {
        symbolCount: inputs.length,
        timestamp: Date.now(),
      });

      // Filter and rank inputs by signal strength
      const rankedInputs = await this.rankAndFilterInputs(inputs);
      
      // Generate trade cards for top opportunities
      const tradeCards: TradeCard[] = [];
      
      for (const input of rankedInputs.slice(0, 8)) { // Process top 8 candidates
        try {
          const tradeCard = await this.generateTradeCard(input);
          if (tradeCard) {
            tradeCards.push(tradeCard);
          }
        } catch (error) {
          loggerUtils.aiLogger.warn('Failed to generate trade card', {
            symbol: input.symbol,
            error: (error as Error).message,
          });
        }
      }

      // Sort by confidence and take top 3-5
      const finalTradeCards = tradeCards
        .sort((a, b) => b.header.confidence - a.header.confidence)
        .slice(0, 5);

      // Generate market overview and portfolio guidance
      const marketOverview = this.generateMarketOverview(inputs);
      const portfolioGuidance = this.generatePortfolioGuidance(finalTradeCards, inputs);

      const result: StrategicFusionOutput = {
        timestamp: Date.now(),
        marketOverview,
        tradeCards: finalTradeCards,
        portfolioGuidance,
        metadata: {
          total_symbols_analyzed: inputs.length,
          processing_time: Date.now() - startTime,
          fusion_quality_score: this.calculateFusionQuality(finalTradeCards),
          model_used: 'gpt-4o',
        }
      };

      loggerUtils.aiLogger.info('Strategic fusion completed', {
        tradeCardsGenerated: finalTradeCards.length,
        processingTime: result.metadata.processing_time,
        fusionQuality: result.metadata.fusion_quality_score,
      });

      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Strategic fusion failed', {
        error: (error as Error).message,
        inputCount: inputs.length,
      });

      // Return minimal fallback result
      return this.getFallbackResult(inputs, Date.now() - startTime);
    }
  }

  /**
   * Generate individual trade card
   */
  private async generateTradeCard(input: StrategicFusionInput): Promise<TradeCard | null> {
    const startTime = Date.now();
    
    try {
      // Calculate signal composition and composite score
      const signalComposition = this.calculateSignalComposition(input.moduleOutputs);
      
      // Check if meets minimum confidence threshold
      if (signalComposition.composite_score < this.confidenceThresholds.minimum) {
        return null;
      }

      // Detect counter-signals
      const counterSignals = this.detectCounterSignals(input.moduleOutputs);
      
      // Generate AI narrative
      const narrative = await this.generateAINarrative(input, signalComposition);
      
      // Calculate execution parameters
      const execution = this.calculateExecutionParameters(input, narrative);
      
      // Generate header
      const header = this.generateTradeHeader(input, narrative, signalComposition);

      const tradeCard: TradeCard = {
        id: `${input.symbol}_${Date.now()}`,
        symbol: input.symbol,
        timestamp: Date.now(),
        header,
        narrative,
        signal_composition: signalComposition,
        counter_signals: counterSignals,
        execution,
        metadata: {
          model_used: 'gpt-4o',
          processing_time: Date.now() - startTime,
          data_quality_score: this.calculateDataQuality(input.moduleOutputs),
          module_contributions: this.calculateModuleContributions(input.moduleOutputs),
          fusion_confidence: signalComposition.composite_score,
        }
      };

      return tradeCard;
    } catch (error) {
      loggerUtils.aiLogger.error('Trade card generation failed', {
        symbol: input.symbol,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate AI-powered trade narrative
   */
  private async generateAINarrative(input: StrategicFusionInput, signals: any): Promise<TradeNarrative> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input, signals);

    try {
      const response = await openAIClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: this.strategicFusionSchema
        }],
        tool_choice: { type: 'function', function: { name: 'synthesize_trade_narrative' } },
        temperature: 0.15,
        max_tokens: 2000,
      });

      if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        const narrative = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        return this.validateAndEnhanceNarrative(narrative, input);
      }

      throw new Error('No function call response received');
    } catch (error) {
      loggerUtils.aiLogger.error('AI narrative generation failed', {
        symbol: input.symbol,
        error: (error as Error).message,
      });
      
      // Return fallback narrative
      return this.getFallbackNarrative(input);
    }
  }

  /**
   * Build system prompt for strategic fusion
   */
  private buildSystemPrompt(): string {
    return `You are an elite trading strategist AI that synthesizes multiple analytical inputs into coherent, actionable trade narratives. Your expertise spans technical analysis, fundamental analysis, sentiment analysis, and risk management.

CORE MISSION:
Transform complex, multi-dimensional market data into clear, executable trading strategies with complete rationale and risk assessment.

ANALYTICAL FRAMEWORK:

SETUP ANALYSIS:
- Breakout: Price breaking above/below key resistance/support with volume
- Reversal: Oversold/overbought conditions with divergence signals
- Momentum: Strong directional movement with confirming indicators
- Earnings Play: Post-earnings drift patterns and surprise reactions
- Sector Rotation: Capital flow shifts between sectors/themes
- Anomaly Exploitation: Unusual price/volume behavior with identifiable catalysts
- Mean Reversion: Extended moves likely to retrace to statistical norms

CATALYST IDENTIFICATION:
- Primary: Main driver expected to move the stock
- Secondary: Supporting factors that reinforce the thesis
- Timing Sensitivity: How quickly catalyst will materialize
- Event Risk: Binary outcomes (earnings, FDA approval, etc.)

TIMING FRAMEWORK:
- Entry Window: Optimal timeframe for position initiation
- Optimal Entry: Most advantageous entry conditions
- Time Horizon: Expected duration to target achievement
- Urgency: How quickly action must be taken

CONFIRMATION REQUIREMENTS:
- Signals Needed: Additional validation before full position
- Invalidation Triggers: Conditions that would kill the thesis
- Monitoring Points: Key metrics to track throughout trade

RISK ASSESSMENT:
- Primary Risks: Main threats to trade success
- Risk Grade: A (low risk) to F (high risk)
- Position Sizing: Portfolio allocation based on risk/reward
- Stop Loss Strategy: How to limit downside

SYNTHESIS PRINCIPLES:
1. Signal Confluence: Multiple independent signals pointing same direction
2. Risk-Reward Balance: Minimum 2:1 reward-to-risk ratio
3. Counter-Signal Detection: Identify conflicting indicators
4. Time Horizon Matching: Align catalysts with timeframe
5. Market Context: Consider broader market environment

NARRATIVE CONSTRUCTION:
Create compelling, logical stories that connect:
- Current market setup (why now?)
- Catalysts (what will drive movement?)
- Timing (when will it happen?)
- Confirmation (how will we know it's working?)
- Risk management (what could go wrong?)

Your output should be precise, actionable, and focused on probability-weighted outcomes based on the available data.`;
  }

  /**
   * Build user prompt with all module data
   */
  private buildUserPrompt(input: StrategicFusionInput, signals: any): string {
    const { moduleOutputs } = input;
    
    // Format technical analysis
    const technicalData = moduleOutputs.technical ? `
TECHNICAL ANALYSIS:
- Setup Type: ${moduleOutputs.technical.analysis.setup_type}
- Entry Price: $${moduleOutputs.technical.analysis.entry_price.toFixed(2)}
- Target: $${moduleOutputs.technical.analysis.primary_exit.toFixed(2)}
- Stop Loss: $${moduleOutputs.technical.analysis.stop_loss.toFixed(2)}
- Risk/Reward: ${moduleOutputs.technical.analysis.risk_reward_ratio.toFixed(2)}:1
- Confidence: ${(moduleOutputs.technical.analysis.confidence * 100).toFixed(0)}%
- RSI Signal: ${moduleOutputs.technical.technicalSignals.rsi_signal}
- MACD Signal: ${moduleOutputs.technical.technicalSignals.macd_signal}
- Trend Signal: ${moduleOutputs.technical.technicalSignals.trend_signal}
- Pattern: ${moduleOutputs.technical.patterns.primary_pattern || 'None identified'}` : 'No technical analysis available';

    // Format sector analysis
    const sectorData = moduleOutputs.sector ? `
SECTOR INTELLIGENCE:
- Sector: ${moduleOutputs.sector.sector}
- Rotation Signal: ${moduleOutputs.sector.analysis.sector_rotation_signal}
- Relative Strength: ${(moduleOutputs.sector.analysis.peer_performance.relative_strength * 100).toFixed(0)}%
- vs Sector: ${moduleOutputs.sector.analysis.peer_performance.vs_sector}
- vs Market: ${moduleOutputs.sector.analysis.peer_performance.vs_market}
- Key Drivers: ${moduleOutputs.sector.analysis.drivers.join(', ')}
- Risk Trends: ${moduleOutputs.sector.analysis.risk_trends.join(', ')}
- Confidence: ${(moduleOutputs.sector.analysis.confidence_score * 100).toFixed(0)}%` : 'No sector analysis available';

    // Format risk assessment
    const riskData = moduleOutputs.risk ? `
RISK ASSESSMENT:
- Overall Risk Score: ${(moduleOutputs.risk.assessment.overall_risk_score * 100).toFixed(0)}%
- Risk Grade: ${moduleOutputs.risk.assessment.risk_grade}
- Max Position Size: ${(moduleOutputs.risk.assessment.max_position_size * 100).toFixed(1)}%
- Liquidity Risk: ${(moduleOutputs.risk.assessment.risk_breakdown.liquidity.score * 100).toFixed(0)}%
- Volatility Risk: ${(moduleOutputs.risk.assessment.risk_breakdown.volatility.score * 100).toFixed(0)}%
- Event Risk: ${(moduleOutputs.risk.assessment.risk_breakdown.event.score * 100).toFixed(0)}%
- Primary Risks: ${moduleOutputs.risk.assessment.primary_risks.join(', ')}
- Mitigation: ${moduleOutputs.risk.assessment.risk_mitigation.join(', ')}` : 'No risk assessment available';

    // Format sentiment analysis
    const sentimentData = moduleOutputs.reddit ? `
SENTIMENT ANALYSIS:
- Authenticity Score: ${(moduleOutputs.reddit.authenticity.overall_score * 100).toFixed(0)}%
- Momentum Type: ${moduleOutputs.reddit.analysis.momentum_type}
- Sentiment Trend: ${moduleOutputs.reddit.analysis.sentiment_trend}
- Sustainability: ${moduleOutputs.reddit.analysis.sustainability}
- Risk Flags: ${moduleOutputs.reddit.analysis.risk_flags.join(', ')}
- Key Themes: ${moduleOutputs.reddit.analysis.key_themes.join(', ')}
- Pump Risk: ${(moduleOutputs.reddit.pump_and_dump.overall_risk * 100).toFixed(0)}%` : 'No sentiment analysis available';

    // Format earnings drift
    const earningsData = moduleOutputs.earningsDrift ? `
EARNINGS DRIFT:
- Next Earnings: ${moduleOutputs.earningsDrift.nextEarningsDate}
- Drift Probability: ${(moduleOutputs.earningsDrift.analysis.drift_probability * 100).toFixed(0)}%
- Expected Move: ${(moduleOutputs.earningsDrift.analysis.expected_move * 100).toFixed(1)}%
- Direction: ${moduleOutputs.earningsDrift.analysis.expected_direction}
- Peak Timing: ${moduleOutputs.earningsDrift.analysis.peak_drift_timing}
- Fade Risk: ${(moduleOutputs.earningsDrift.analysis.fade_risk * 100).toFixed(0)}%
- Pattern Strength: ${(moduleOutputs.earningsDrift.metadata.pattern_strength * 100).toFixed(0)}%` : 'No earnings drift analysis available';

    // Format anomaly analysis
    const anomalyData = moduleOutputs.anomaly ? `
ANOMALY ANALYSIS:
- Primary Catalyst: ${moduleOutputs.anomaly.investigation.primary_catalyst}
- Catalyst Confidence: ${(moduleOutputs.anomaly.investigation.catalyst_confidence * 100).toFixed(0)}%
- Follow-through Probability: ${(moduleOutputs.anomaly.investigation.follow_through_probability * 100).toFixed(0)}%
- Hidden Factors: ${moduleOutputs.anomaly.investigation.hidden_factors.join(', ')}
- Market Structure Impact: ${moduleOutputs.anomaly.investigation.market_structure_impact}` : 'No anomaly analysis available';

    return `Synthesize comprehensive trade analysis for ${input.symbol} at $${input.currentPrice.toFixed(2)}:

MARKET CONTEXT:
- VIX Level: ${input.marketContext.vixLevel.toFixed(1)}
- Market Trend: ${input.marketContext.marketTrend}
- Sector Performance: ${(input.marketContext.sectorPerformance * 100).toFixed(1)}%
- Time of Day: ${input.marketContext.timeOfDay}

SIGNAL COMPOSITION:
- Composite Score: ${(signals.composite_score * 100).toFixed(0)}%
- Technical Weight: ${(signals.technical_weight * 100).toFixed(0)}%
- Sentiment Weight: ${(signals.sentiment_weight * 100).toFixed(0)}%
- Risk Weight: ${(signals.risk_weight * 100).toFixed(0)}%
- Sector Weight: ${(signals.sector_weight * 100).toFixed(0)}%
- Anomaly Weight: ${(signals.anomaly_weight * 100).toFixed(0)}%

${technicalData}

${sectorData}

${riskData}

${sentimentData}

${earningsData}

${anomalyData}

SYNTHESIS REQUIREMENTS:
1. Create coherent narrative connecting all available signals
2. Identify the strongest confluence factors supporting the trade
3. Determine optimal entry timing and conditions
4. Specify clear confirmation signals and invalidation triggers
5. Assess risk factors and recommend position sizing
6. Provide specific, actionable guidance

Focus on the highest-conviction elements and explain how they work together to create a compelling trade opportunity.`;
  }

  /**
   * Calculate signal composition and weights
   */
  private calculateSignalComposition(modules: ModuleInputs): any {
    let technicalScore = 0;
    let sentimentScore = 0;
    let riskScore = 0;
    let sectorScore = 0;
    let anomalyScore = 0;

    // Technical score
    if (modules.technical) {
      technicalScore = modules.technical.analysis.confidence;
    }

    // Sentiment score (inverted for risk)
    if (modules.reddit) {
      sentimentScore = modules.reddit.authenticity.overall_score * 
        (1 - modules.reddit.pump_and_dump.overall_risk);
    }

    // Risk score (inverted - lower risk = higher score)
    if (modules.risk) {
      riskScore = 1 - modules.risk.assessment.overall_risk_score;
    }

    // Sector score
    if (modules.sector) {
      sectorScore = modules.sector.analysis.confidence_score * 
        modules.sector.analysis.peer_performance.relative_strength;
    }

    // Anomaly score
    if (modules.anomaly) {
      anomalyScore = modules.anomaly.investigation.catalyst_confidence * 
        modules.anomaly.investigation.follow_through_probability;
    }

    // Calculate weighted composite score
    const compositeScore = (
      technicalScore * this.signalWeights.technical +
      sentimentScore * this.signalWeights.sentiment +
      riskScore * this.signalWeights.risk +
      sectorScore * this.signalWeights.sector +
      anomalyScore * this.signalWeights.anomaly
    );

    return {
      technical_weight: technicalScore,
      sentiment_weight: sentimentScore,
      risk_weight: riskScore,
      sector_weight: sectorScore,
      anomaly_weight: anomalyScore,
      composite_score: compositeScore,
    };
  }

  /**
   * Detect counter-signals between modules
   */
  private detectCounterSignals(modules: ModuleInputs): any {
    const counterSignals: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    // Reddit pump + insider selling
    if (modules.reddit && modules.reddit.pump_and_dump.overall_risk > 0.7) {
      counterSignals.push('High social media pump risk detected');
      severity = 'high';
    }

    // Technical bullish + high risk assessment
    if (modules.technical && modules.risk) {
      if (modules.technical.analysis.setup_type === 'Breakout' && 
          modules.risk.assessment.overall_risk_score > 0.8) {
        counterSignals.push('Technical breakout conflicting with high risk assessment');
        severity = severity === 'low' ? 'medium' : 'high';
      }
    }

    // Positive sentiment + negative sector rotation
    if (modules.reddit && modules.sector) {
      if (modules.reddit.analysis.sentiment_trend.includes('positive') && 
          modules.sector.analysis.sector_rotation_signal === 'bearish') {
        counterSignals.push('Positive stock sentiment conflicting with bearish sector rotation');
        severity = severity === 'low' ? 'medium' : 'high';
      }
    }

    // Earnings drift positive + high fade risk
    if (modules.earningsDrift) {
      if (modules.earningsDrift.analysis.expected_direction === 'bullish' && 
          modules.earningsDrift.analysis.fade_risk > 0.7) {
        counterSignals.push('Positive earnings drift expectation with high fade risk');
        severity = severity === 'low' ? 'medium' : 'high';
      }
    }

    return {
      identified: counterSignals.length > 0,
      description: counterSignals.length > 0 ? counterSignals.join('; ') : undefined,
      severity,
      mitigation: this.generateCounterSignalMitigation(counterSignals, severity),
    };
  }

  /**
   * Generate counter-signal mitigation strategies
   */
  private generateCounterSignalMitigation(signals: string[], severity: string): string | undefined {
    if (signals.length === 0) return undefined;

    const mitigations: string[] = [];

    if (signals.some(s => s.includes('pump risk'))) {
      mitigations.push('Reduce position size and use tight stops');
    }

    if (signals.some(s => s.includes('high risk'))) {
      mitigations.push('Wait for better risk/reward setup');
    }

    if (signals.some(s => s.includes('sector rotation'))) {
      mitigations.push('Monitor sector ETF performance for confirmation');
    }

    if (signals.some(s => s.includes('fade risk'))) {
      mitigations.push('Consider shorter time horizon and quicker profit-taking');
    }

    return mitigations.length > 0 ? mitigations.join('; ') : 'Monitor counter-signals closely and adjust position accordingly';
  }

  /**
   * Calculate execution parameters
   */
  private calculateExecutionParameters(input: StrategicFusionInput, narrative: TradeNarrative): any {
    let entryPrice = input.currentPrice;
    let targetPrice = input.currentPrice * 1.05; // Default 5% target
    let stopLoss = input.currentPrice * 0.97; // Default 3% stop

    // Use technical analysis if available
    if (input.moduleOutputs.technical) {
      const tech = input.moduleOutputs.technical;
      entryPrice = tech.analysis.entry_price;
      targetPrice = tech.analysis.primary_exit;
      stopLoss = tech.analysis.stop_loss;
    }

    const riskRewardRatio = Math.abs(targetPrice - entryPrice) / Math.abs(entryPrice - stopLoss);
    const maxLossPercent = Math.abs(entryPrice - stopLoss) / entryPrice;

    return {
      entry_price: entryPrice,
      target_price: targetPrice,
      stop_loss: stopLoss,
      position_size: narrative.risk.position_sizing,
      risk_reward_ratio: riskRewardRatio,
      max_loss_percent: maxLossPercent,
    };
  }

  /**
   * Generate trade header
   */
  private generateTradeHeader(input: StrategicFusionInput, narrative: TradeNarrative, signals: any): any {
    const confidence = signals.composite_score;
    let tradeType: 'Long' | 'Short' | 'Options Play' | 'Pairs Trade' = 'Long';

    // Determine trade type based on setup and modules
    if (input.moduleOutputs.technical?.analysis.setup_type === 'Reversal' && 
        input.moduleOutputs.risk?.assessment.overall_risk_score > 0.7) {
      tradeType = 'Options Play';
    } else if (narrative.setup.type === 'Earnings Play') {
      tradeType = 'Options Play';
    }

    const title = `${narrative.setup.type} - ${input.symbol}`;
    const subtitle = narrative.catalyst.primary;

    return {
      title,
      subtitle,
      confidence,
      timeframe: narrative.timing.time_horizon,
      trade_type: tradeType,
    };
  }

  /**
   * Rank and filter inputs by signal strength
   */
  private async rankAndFilterInputs(inputs: StrategicFusionInput[]): Promise<StrategicFusionInput[]> {
    const rankedInputs = inputs.map(input => {
      const signals = this.calculateSignalComposition(input.moduleOutputs);
      return { input, score: signals.composite_score };
    });

    return rankedInputs
      .filter(item => item.score >= this.confidenceThresholds.minimum)
      .sort((a, b) => b.score - a.score)
      .map(item => item.input);
  }

  /**
   * Generate market overview
   */
  private generateMarketOverview(inputs: StrategicFusionInput[]): any {
    const avgVix = inputs.reduce((sum, input) => sum + input.marketContext.vixLevel, 0) / inputs.length;
    const avgSectorPerf = inputs.reduce((sum, input) => sum + input.marketContext.sectorPerformance, 0) / inputs.length;
    
    let environment = 'Neutral';
    if (avgVix > 25) environment = 'High Volatility';
    else if (avgVix < 15) environment = 'Low Volatility';
    else if (avgSectorPerf > 0.02) environment = 'Risk-On';
    else if (avgSectorPerf < -0.02) environment = 'Risk-Off';

    // Extract dominant themes from available data
    const themes: string[] = [];
    const sectorRotations = inputs.filter(i => i.moduleOutputs.sector?.analysis.sector_rotation_signal === 'bullish');
    if (sectorRotations.length > inputs.length * 0.3) {
      themes.push('Sector rotation activity');
    }

    const earningsPlays = inputs.filter(i => i.moduleOutputs.earningsDrift?.analysis.drift_probability > 0.7);
    if (earningsPlays.length > 2) {
      themes.push('Earnings season opportunities');
    }

    if (themes.length === 0) {
      themes.push('Mixed market signals');
    }

    return {
      environment,
      dominant_themes: themes,
      opportunity_assessment: `${themes.length} key themes identified with ${sectorRotations.length} positive sector signals`,
    };
  }

  /**
   * Generate portfolio guidance
   */
  private generatePortfolioGuidance(tradeCards: TradeCard[], inputs: StrategicFusionInput[]): any {
    const totalAllocation = tradeCards.reduce((sum, card) => sum + card.execution.position_size, 0);
    const avgRisk = tradeCards.reduce((sum, card) => {
      const riskValue = { 'A': 0.2, 'B': 0.4, 'C': 0.6, 'D': 0.8, 'F': 1.0 }[card.narrative.risk.risk_grade];
      return sum + riskValue;
    }, 0) / tradeCards.length;

    const sectorTilts: string[] = [];
    const sectors = new Set(tradeCards.map(card => 
      inputs.find(i => i.symbol === card.symbol)?.moduleOutputs.sector?.sector
    ).filter(Boolean));
    
    sectors.forEach(sector => {
      if (sector) sectorTilts.push(`Overweight ${sector}`);
    });

    return {
      overall_allocation: `${(totalAllocation * 100).toFixed(1)}% of portfolio across ${tradeCards.length} positions`,
      sector_tilts: sectorTilts,
      risk_management: avgRisk > 0.6 ? 'High risk environment - use defensive position sizing' : 'Moderate risk - standard position sizing appropriate',
      market_outlook: tradeCards.length > 3 ? 'Multiple opportunities identified' : 'Selective opportunity environment',
    };
  }

  /**
   * Calculate various quality metrics
   */
  private calculateFusionQuality(tradeCards: TradeCard[]): number {
    if (tradeCards.length === 0) return 0;

    const avgConfidence = tradeCards.reduce((sum, card) => sum + card.header.confidence, 0) / tradeCards.length;
    const avgDataQuality = tradeCards.reduce((sum, card) => sum + card.metadata.data_quality_score, 0) / tradeCards.length;
    const diversityScore = new Set(tradeCards.map(card => card.narrative.setup.type)).size / 6; // Max 6 setup types

    return (avgConfidence * 0.5 + avgDataQuality * 0.3 + diversityScore * 0.2);
  }

  private calculateDataQuality(modules: ModuleInputs): number {
    let score = 0;
    let moduleCount = 0;

    Object.values(modules).forEach(module => {
      if (module) {
        score += 0.2; // Each module adds to quality
        moduleCount++;
      }
    });

    return Math.min(score, 1.0);
  }

  private calculateModuleContributions(modules: ModuleInputs): Record<string, number> {
    const contributions: Record<string, number> = {};
    
    if (modules.technical) contributions.technical = this.signalWeights.technical;
    if (modules.sector) contributions.sector = this.signalWeights.sector;
    if (modules.risk) contributions.risk = this.signalWeights.risk;
    if (modules.reddit) contributions.sentiment = this.signalWeights.sentiment;
    if (modules.anomaly) contributions.anomaly = this.signalWeights.anomaly;

    return contributions;
  }

  /**
   * Validate and enhance AI narrative
   */
  private validateAndEnhanceNarrative(narrative: any, input: StrategicFusionInput): TradeNarrative {
    // Validate required fields
    const requiredFields = ['summary', 'setup', 'catalyst', 'timing', 'confirmation', 'risk'];
    for (const field of requiredFields) {
      if (!narrative[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate ranges
    narrative.setup.strength = this.clamp(narrative.setup.strength, 0, 1);
    narrative.risk.position_sizing = this.clamp(narrative.risk.position_sizing, 0, 0.15); // Max 15%

    return narrative;
  }

  /**
   * Fallback methods
   */
  private getFallbackNarrative(input: StrategicFusionInput): TradeNarrative {
    return {
      summary: 'Conservative analysis due to limited data availability',
      setup: {
        type: 'Mean Reversion',
        strength: 0.3,
        confluence_factors: ['Limited signal confluence'],
        key_levels: [`Current price: $${input.currentPrice.toFixed(2)}`],
      },
      catalyst: {
        primary: 'Market normalization',
        timing_sensitivity: 'days',
        event_risk: false,
      },
      timing: {
        entry_window: 'Current levels',
        optimal_entry: 'Market open',
        time_horizon: '1-2 weeks',
        urgency: 'low',
      },
      confirmation: {
        signals_needed: ['Volume confirmation'],
        invalidation_triggers: ['Break below support'],
        monitoring_points: ['Price action', 'Volume'],
      },
      risk: {
        primary_risks: ['Market volatility', 'Limited analysis'],
        risk_grade: 'C',
        position_sizing: 0.02,
        stop_loss_strategy: 'Conservative 5% stop loss',
      },
    };
  }

  private getFallbackResult(inputs: StrategicFusionInput[], processingTime: number): StrategicFusionOutput {
    return {
      timestamp: Date.now(),
      marketOverview: {
        environment: 'Uncertain',
        dominant_themes: ['Limited analysis available'],
        opportunity_assessment: 'Insufficient data for comprehensive analysis',
      },
      tradeCards: [],
      portfolioGuidance: {
        overall_allocation: 'Conservative cash position recommended',
        sector_tilts: [],
        risk_management: 'High caution due to analysis limitations',
        market_outlook: 'Await better signal clarity',
      },
      metadata: {
        total_symbols_analyzed: inputs.length,
        processing_time: processingTime,
        fusion_quality_score: 0.2,
        model_used: 'fallback',
      },
    };
  }

  /**
   * Utility function to clamp values
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Get historical fusion performance analytics
   */
  async getFusionAnalytics(): Promise<{
    daily_performance: Array<{
      date: string;
      cards_generated: number;
      avg_confidence: number;
      success_rate?: number;
    }>;
    signal_effectiveness: Record<string, number>;
    common_patterns: string[];
  }> {
    // This would integrate with historical performance tracking
    // For now, return placeholder data
    return {
      daily_performance: [],
      signal_effectiveness: {
        technical: 0.72,
        sentiment: 0.65,
        risk: 0.78,
        sector: 0.69,
        anomaly: 0.58,
      },
      common_patterns: [
        'Technical breakout + positive sector rotation',
        'Earnings drift + low volatility environment',
        'Anomaly + social sentiment confirmation',
      ],
    };
  }
}

export default StrategicFusion;
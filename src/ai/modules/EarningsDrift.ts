/**
 * Earnings Drift Tracker AI Module
 * Uses GPT-4-turbo for historical pattern recognition and post-earnings behavior prediction
 */

import { openAIClient } from '../../config/openai.js';
import { redisClient } from '../../config/redis.js';
import { loggerUtils } from '../../config/logger.js';
import { DataHub } from '../../api/DataHub.js';

export interface EarningsEvent {
  date: string;
  quarter: string;
  fiscalYear: number;
  expectedEPS: number;
  actualEPS: number;
  surprise: number; // (actual - expected) / |expected|
  surprisePercent: number;
  revenue: {
    expected: number;
    actual: number;
    surprise: number;
    surprisePercent: number;
  };
  guidance: {
    provided: boolean;
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    change: 'raised' | 'lowered' | 'maintained' | 'none';
  };
}

export interface PostEarningsPrice {
  earningsDate: string;
  priceData: {
    beforeEarnings: number; // Price at market close day before earnings
    afterHoursMove: number; // Immediate after-hours reaction %
    day1Open: number;
    day1Close: number;
    day1Move: number; // % move from beforeEarnings to day1Close
    day2Close: number;
    day2Move: number; // % move from beforeEarnings to day2Close  
    day3Close: number;
    day3Move: number; // % move from beforeEarnings to day3Close
    weekMove: number; // % move from beforeEarnings to 5 trading days later
  };
  volume: {
    avgVolume20d: number;
    earningsDayVolume: number;
    day1Volume: number;
    day2Volume: number;
    day3Volume: number;
    volumeRatio: number; // earningsDayVolume / avgVolume20d
  };
  marketContext: {
    vixLevel: number;
    marketMove: number; // SPY % move over same period
    sectorMove: number; // Sector ETF % move over same period
  };
}

export interface EarningsDriftInput {
  symbol: string;
  nextEarningsDate: string;
  expectedEPS?: number;
  expectedRevenue?: number;
  analystConsensus?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };
  historicalEarnings: EarningsEvent[];
  historicalPriceData: PostEarningsPrice[];
  currentPrice: number;
  currentVolume: number;
  avgVolume20d: number;
  impliedVolatility?: number;
  optionsActivity?: {
    callVolume: number;
    putVolume: number;
    putCallRatio: number;
    unusualActivity: boolean;
  };
  marketContext: {
    vixLevel: number;
    sectorPerformance: number;
    marketTrend: 'bullish' | 'bearish' | 'neutral';
  };
}

export interface DriftPattern {
  pattern_type: 'consistent_drift' | 'reversal_pattern' | 'momentum_continuation' | 'fade_pattern' | 'mixed_signals';
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1 scale
  timeframe: '24h' | '48h' | '72h' | '1week';
  historical_occurrences: number;
  success_rate: number;
}

export interface EarningsDriftOutput {
  symbol: string;
  nextEarningsDate: string;
  timestamp: number;
  
  analysis: {
    drift_probability: number; // 0-1 probability of drift occurring
    expected_move: number; // Expected % move over drift period
    expected_direction: 'bullish' | 'bearish' | 'neutral';
    time_pattern: string; // Description of expected timing
    confidence: number; // 0-1 confidence in prediction
    peak_drift_timing: '6h' | '24h' | '48h' | '72h' | '1week';
    fade_risk: number; // 0-1 probability that initial move will fade
  };
  
  historical_patterns: {
    last_3_earnings: DriftPattern;
    last_8_quarters: DriftPattern;
    beat_vs_miss_patterns: {
      beat_pattern: DriftPattern;
      miss_pattern: DriftPattern;
      meet_pattern: DriftPattern;
    };
    surprise_magnitude_correlation: number; // Correlation between surprise size and drift
    guidance_impact_factor: number; // How much guidance affects drift vs earnings beat/miss
  };
  
  risk_factors: {
    market_environment_risk: number;
    options_expiry_impact: boolean;
    sector_rotation_risk: number;
    institutional_positioning: 'crowded_long' | 'crowded_short' | 'balanced' | 'unknown';
    earnings_season_fatigue: number; // How many other major earnings in same week
  };
  
  scenarios: {
    beat_scenario: {
      probability: number;
      expected_drift: number;
      timing: string;
    };
    miss_scenario: {
      probability: number;
      expected_drift: number;
      timing: string;
    };
    inline_scenario: {
      probability: number;
      expected_drift: number;
      timing: string;
    };
  };
  
  metadata: {
    model_used: string;
    processing_time: number;
    cache_hit: boolean;
    historical_data_quality: number; // 0-1 based on completeness of historical data
    pattern_strength: number; // How strong/consistent historical patterns are
  };
}

export class EarningsDrift {
  private dataHub: DataHub;
  private cacheTimeout = 6 * 60 * 60; // 6 hours in seconds
  
  // Pattern recognition thresholds
  private readonly patternThresholds = {
    minOccurrences: 3, // Minimum occurrences to establish pattern
    consistencyRequired: 0.6, // 60% consistency to be considered valid pattern
    strongPatternThreshold: 0.8, // 80% consistency for strong pattern
    significantMove: 0.02, // 2% minimum move to be considered significant
  };

  // OpenAI function calling schema
  private readonly earningsDriftSchema = {
    name: "analyze_earnings_drift",
    description: "Analyze historical earnings patterns and predict post-earnings drift behavior",
    parameters: {
      type: "object",
      properties: {
        drift_probability: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Probability of significant drift occurring (0-1 scale)"
        },
        expected_move: {
          type: "number",
          description: "Expected percentage move during drift period (can be negative)"
        },
        expected_direction: {
          type: "string",
          enum: ["bullish", "bearish", "neutral"],
          description: "Expected direction of drift movement"
        },
        time_pattern: {
          type: "string",
          description: "Detailed description of expected timing pattern"
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence in prediction based on pattern strength"
        },
        peak_drift_timing: {
          type: "string",
          enum: ["6h", "24h", "48h", "72h", "1week"],
          description: "When drift is expected to peak"
        },
        fade_risk: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Risk that initial move will fade or reverse"
        }
      },
      required: ["drift_probability", "expected_move", "expected_direction", "time_pattern", "confidence", "peak_drift_timing", "fade_risk"]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main earnings drift analysis method
   */
  async analyzeDrift(input: EarningsDriftInput): Promise<EarningsDriftOutput> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(input.symbol, input.nextEarningsDate);
    
    try {
      // Check cache first
      const cachedResult = await this.getCachedAnalysis(cacheKey);
      if (cachedResult) {
        loggerUtils.aiLogger.info('Earnings drift analysis cache hit', {
          symbol: input.symbol,
          nextEarningsDate: input.nextEarningsDate,
        });
        
        return {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            cache_hit: true,
            processing_time: Date.now() - startTime,
          }
        };
      }

      // Analyze historical patterns
      const historicalPatterns = this.analyzeHistoricalPatterns(input);
      
      // Calculate risk factors
      const riskFactors = this.calculateRiskFactors(input);
      
      // Perform AI-powered drift analysis
      const aiAnalysis = await this.performAIDriftAnalysis(input, historicalPatterns);
      
      // Generate scenario analysis
      const scenarios = this.generateScenarios(input, historicalPatterns, aiAnalysis);
      
      // Calculate data quality metrics
      const dataQuality = this.calculateDataQuality(input);
      const patternStrength = this.calculatePatternStrength(historicalPatterns);
      
      const result: EarningsDriftOutput = {
        symbol: input.symbol,
        nextEarningsDate: input.nextEarningsDate,
        timestamp: Date.now(),
        analysis: aiAnalysis,
        historical_patterns: historicalPatterns,
        risk_factors: riskFactors,
        scenarios,
        metadata: {
          model_used: 'gpt-4-turbo',
          processing_time: Date.now() - startTime,
          cache_hit: false,
          historical_data_quality: dataQuality,
          pattern_strength: patternStrength,
        }
      };

      // Cache the result
      await this.cacheAnalysis(cacheKey, result);
      
      // Log the analysis
      this.logDriftAnalysis(result, input);
      
      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Earnings drift analysis failed', {
        symbol: input.symbol,
        nextEarningsDate: input.nextEarningsDate,
        error: (error as Error).message,
      });

      // Return conservative analysis
      return this.getConservativeAnalysis(input, Date.now() - startTime);
    }
  }

  /**
   * Perform AI-powered drift analysis using GPT-4-turbo
   */
  private async performAIDriftAnalysis(input: EarningsDriftInput, patterns: any): Promise<any> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input, patterns);

    try {
      const response = await openAIClient.createChatCompletion({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        functions: [this.earningsDriftSchema],
        function_call: { name: 'analyze_earnings_drift' },
        temperature: 0.1,
        max_tokens: 1200,
      });

      if (response.choices[0]?.message?.function_call?.arguments) {
        const analysis = JSON.parse(response.choices[0].message.function_call.arguments);
        return this.validateAndEnhanceAnalysis(analysis, input);
      }

      throw new Error('No function call response received');
    } catch (error) {
      loggerUtils.aiLogger.error('OpenAI earnings drift analysis failed', {
        symbol: input.symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build system prompt for earnings drift analysis
   */
  private buildSystemPrompt(): string {
    return `You are an expert earnings drift analysis AI specializing in post-earnings price behavior patterns. Your role is to predict how stocks will move in the 1-3 days following earnings announcements based on historical patterns.

KEY CONCEPTS:

POST-EARNINGS DRIFT:
- Tendency for stocks to continue moving in the direction of earnings surprise
- Typically occurs over 1-3 trading days following earnings
- Can be influenced by guidance, market conditions, and institutional positioning
- Often stronger for mid-cap stocks vs large-cap

PATTERN ANALYSIS FRAMEWORK:
- Earnings Beat Pattern: How stock behaves after beating estimates
- Earnings Miss Pattern: Price action following earnings misses
- Inline Results: Movement when meeting expectations exactly
- Surprise Magnitude: Correlation between size of surprise and drift magnitude
- Guidance Impact: How forward guidance affects drift vs earnings beat/miss

TIMING PATTERNS:
- Immediate Reaction: After-hours move on earnings day
- Day 1 Drift: Continuation or reversal on first trading day
- Days 2-3: Extended drift or fade patterns
- Weekly Pattern: Full drift cycle completion

MARKET CONTEXT FACTORS:
- Volatility Environment: High VIX reduces drift consistency
- Sector Rotation: Sector trends can override company-specific drift
- Options Expiry: Can create artificial support/resistance
- Earnings Season Timing: Early vs late reporters behave differently
- Institutional Positioning: Crowded trades more likely to fade

RISK FACTORS:
- Market Environment: Bear markets reduce positive drift, enhance negative drift
- Liquidity: Lower volume stocks show more pronounced drift
- Options Activity: Unusual options activity can signal expected moves
- Guidance Quality: Forward-looking statements often matter more than historical results

Analyze the provided earnings history and predict the most likely drift pattern for the next earnings announcement. Focus on:
1. Pattern consistency across multiple quarters
2. Magnitude of historical moves vs surprise size
3. Timing of peak drift (when maximum move typically occurs)
4. Fade risk (probability initial move reverses)
5. Market environment impact on historical patterns`;
  }

  /**
   * Build user prompt with earnings data
   */
  private buildUserPrompt(input: EarningsDriftInput, patterns: any): string {
    const recentEarnings = input.historicalEarnings.slice(-8); // Last 8 quarters
    const recentPriceData = input.historicalPriceData.slice(-8);

    // Format historical earnings data
    const earningsHistory = recentEarnings.map((earnings, i) => {
      const priceData = recentPriceData.find(p => p.earningsDate === earnings.date);
      
      return `${earnings.date} (${earnings.quarter}):
  - EPS: Expected ${earnings.expectedEPS.toFixed(2)}, Actual ${earnings.actualEPS.toFixed(2)} (${earnings.surprisePercent > 0 ? '+' : ''}${earnings.surprisePercent.toFixed(1)}% surprise)
  - Revenue: Expected ${(earnings.revenue.expected/1e6).toFixed(0)}M, Actual ${(earnings.revenue.actual/1e6).toFixed(0)}M (${earnings.revenue.surprisePercent > 0 ? '+' : ''}${earnings.revenue.surprisePercent.toFixed(1)}% surprise)
  - Guidance: ${earnings.guidance.provided ? earnings.guidance.change + ' (' + earnings.guidance.sentiment + ')' : 'None provided'}
  - Price Reaction: AH: ${priceData?.priceData.afterHoursMove.toFixed(1) || 'N/A'}%, Day1: ${priceData?.priceData.day1Move.toFixed(1) || 'N/A'}%, Day2: ${priceData?.priceData.day2Move.toFixed(1) || 'N/A'}%, Day3: ${priceData?.priceData.day3Move.toFixed(1) || 'N/A'}%
  - Volume: ${priceData?.volume.volumeRatio.toFixed(1) || 'N/A'}x normal volume`;
    }).join('\n\n');

    // Format pattern analysis
    const patternSummary = `
HISTORICAL PATTERN ANALYSIS:
- Last 3 Earnings Pattern: ${patterns.last_3_earnings.pattern_type} (${(patterns.last_3_earnings.success_rate * 100).toFixed(0)}% consistency)
- Beat Pattern: ${patterns.beat_vs_miss_patterns.beat_pattern.direction} drift, ${(patterns.beat_vs_miss_patterns.beat_pattern.success_rate * 100).toFixed(0)}% success rate
- Miss Pattern: ${patterns.beat_vs_miss_patterns.miss_pattern.direction} drift, ${(patterns.beat_vs_miss_patterns.miss_pattern.success_rate * 100).toFixed(0)}% success rate
- Surprise Correlation: ${(patterns.surprise_magnitude_correlation * 100).toFixed(0)}% correlation between surprise size and drift magnitude
- Guidance Impact: ${(patterns.guidance_impact_factor * 100).toFixed(0)}% weighting vs earnings surprise`;

    return `Analyze earnings drift pattern for ${input.symbol} with earnings on ${input.nextEarningsDate}:

UPCOMING EARNINGS:
- Symbol: ${input.symbol}
- Earnings Date: ${input.nextEarningsDate}
- Expected EPS: ${input.expectedEPS?.toFixed(2) || 'Unknown'}
- Expected Revenue: ${input.expectedRevenue ? (input.expectedRevenue/1e6).toFixed(0) + 'M' : 'Unknown'}
- Current Price: $${input.currentPrice.toFixed(2)}
- Implied Volatility: ${input.impliedVolatility ? (input.impliedVolatility * 100).toFixed(1) + '%' : 'Unknown'}

ANALYST CONSENSUS:
${input.analystConsensus ? `- Strong Buy: ${input.analystConsensus.strongBuy}, Buy: ${input.analystConsensus.buy}, Hold: ${input.analystConsensus.hold}, Sell: ${input.analystConsensus.sell}, Strong Sell: ${input.analystConsensus.strongSell}` : '- Not available'}

OPTIONS ACTIVITY:
${input.optionsActivity ? `- Put/Call Ratio: ${input.optionsActivity.putCallRatio.toFixed(2)}
- Unusual Activity: ${input.optionsActivity.unusualActivity ? 'Yes' : 'No'}
- Call Volume: ${input.optionsActivity.callVolume.toLocaleString()}, Put Volume: ${input.optionsActivity.putVolume.toLocaleString()}` : '- Limited options data available'}

MARKET CONTEXT:
- VIX Level: ${input.marketContext.vixLevel.toFixed(1)}
- Market Trend: ${input.marketContext.marketTrend}
- Sector Performance: ${(input.marketContext.sectorPerformance * 100).toFixed(1)}%
- Current Volume: ${(input.currentVolume / input.avgVolume20d).toFixed(1)}x normal

HISTORICAL EARNINGS DATA (Last 8 Quarters):
${earningsHistory}

${patternSummary}

Based on this historical pattern analysis and current market conditions, predict:
1. Probability of significant drift (>2% move) in 1-3 days post-earnings
2. Expected magnitude and direction of drift
3. Most likely timing for peak drift
4. Risk that initial move fades or reverses
5. Confidence level based on pattern consistency

Consider the current market environment (VIX ${input.marketContext.vixLevel.toFixed(1)}) and sector performance in your analysis.`;
  }

  /**
   * Analyze historical patterns from earnings data
   */
  private analyzeHistoricalPatterns(input: EarningsDriftInput): any {
    const earnings = input.historicalEarnings;
    const priceData = input.historicalPriceData;

    // Analyze last 3 earnings
    const last3 = this.analyzePatternWindow(earnings.slice(-3), priceData.slice(-3));
    
    // Analyze last 8 quarters
    const last8 = this.analyzePatternWindow(earnings.slice(-8), priceData.slice(-8));
    
    // Analyze beat vs miss patterns
    const beats = earnings.filter(e => e.surprisePercent > 0.05); // >5% beat
    const misses = earnings.filter(e => e.surprisePercent < -0.05); // >5% miss
    const meets = earnings.filter(e => Math.abs(e.surprisePercent) <= 0.05); // Within 5%
    
    const beatPriceData = priceData.filter(p => {
      const earning = earnings.find(e => e.date === p.earningsDate);
      return earning && earning.surprisePercent > 0.05;
    });
    
    const missPriceData = priceData.filter(p => {
      const earning = earnings.find(e => e.date === p.earningsDate);
      return earning && earning.surprisePercent < -0.05;
    });
    
    const meetPriceData = priceData.filter(p => {
      const earning = earnings.find(e => e.date === p.earningsDate);
      return earning && Math.abs(earning.surprisePercent) <= 0.05;
    });

    const beatPattern = this.analyzePatternWindow(beats, beatPriceData);
    const missPattern = this.analyzePatternWindow(misses, missPriceData);
    const meetPattern = this.analyzePatternWindow(meets, meetPriceData);
    
    // Calculate surprise magnitude correlation
    const surpriseCorrelation = this.calculateSurpriseCorrelation(earnings, priceData);
    
    // Calculate guidance impact factor
    const guidanceImpact = this.calculateGuidanceImpact(earnings, priceData);

    return {
      last_3_earnings: last3,
      last_8_quarters: last8,
      beat_vs_miss_patterns: {
        beat_pattern: beatPattern,
        miss_pattern: missPattern,
        meet_pattern: meetPattern,
      },
      surprise_magnitude_correlation: surpriseCorrelation,
      guidance_impact_factor: guidanceImpact,
    };
  }

  /**
   * Analyze pattern for a specific window of earnings
   */
  private analyzePatternWindow(earnings: EarningsEvent[], priceData: PostEarningsPrice[]): DriftPattern {
    if (earnings.length === 0 || priceData.length === 0) {
      return {
        pattern_type: 'mixed_signals',
        direction: 'neutral',
        strength: 0,
        timeframe: '48h',
        historical_occurrences: 0,
        success_rate: 0,
      };
    }

    // Analyze day 1, 2, 3 moves
    const day1Moves = priceData.map(p => p.priceData.day1Move);
    const day2Moves = priceData.map(p => p.priceData.day2Move);
    const day3Moves = priceData.map(p => p.priceData.day3Move);

    // Determine dominant direction
    const positiveDay1 = day1Moves.filter(m => m > this.patternThresholds.significantMove).length;
    const negativeDay1 = day1Moves.filter(m => m < -this.patternThresholds.significantMove).length;
    const positiveDay3 = day3Moves.filter(m => m > this.patternThresholds.significantMove).length;
    const negativeDay3 = day3Moves.filter(m => m < -this.patternThresholds.significantMove).length;

    // Determine pattern type
    let patternType: DriftPattern['pattern_type'] = 'mixed_signals';
    let direction: DriftPattern['direction'] = 'neutral';
    let timeframe: DriftPattern['timeframe'] = '48h';

    const totalSignificantMoves = positiveDay1 + negativeDay1;
    const consistency = totalSignificantMoves > 0 ? Math.max(positiveDay1, negativeDay1) / totalSignificantMoves : 0;

    if (consistency >= this.patternThresholds.consistencyRequired) {
      direction = positiveDay1 > negativeDay1 ? 'bullish' : 'bearish';
      
      // Determine pattern type based on timing
      const continuationCount = day3Moves.filter((d3, i) => {
        const d1 = day1Moves[i];
        return Math.sign(d3) === Math.sign(d1) && Math.abs(d3) > Math.abs(d1);
      }).length;
      
      const reversalCount = day3Moves.filter((d3, i) => {
        const d1 = day1Moves[i];
        return Math.sign(d3) !== Math.sign(d1) && Math.abs(d3) > this.patternThresholds.significantMove;
      }).length;

      if (continuationCount > reversalCount) {
        patternType = 'momentum_continuation';
        timeframe = '72h';
      } else if (reversalCount > continuationCount) {
        patternType = 'reversal_pattern';
        timeframe = '24h';
      } else {
        patternType = 'consistent_drift';
        timeframe = '48h';
      }
    }

    // Calculate strength and success rate
    const avgMove = day3Moves.reduce((sum, move) => sum + Math.abs(move), 0) / day3Moves.length;
    const strength = Math.min(avgMove / 0.05, 1); // Normalize to 5% move = 1.0 strength

    return {
      pattern_type: patternType,
      direction,
      strength,
      timeframe,
      historical_occurrences: earnings.length,
      success_rate: consistency,
    };
  }

  /**
   * Calculate correlation between surprise magnitude and drift size
   */
  private calculateSurpriseCorrelation(earnings: EarningsEvent[], priceData: PostEarningsPrice[]): number {
    if (earnings.length < 3 || priceData.length < 3) return 0;

    const pairs = earnings.map(e => {
      const price = priceData.find(p => p.earningsDate === e.date);
      if (!price) return null;
      
      return {
        surprise: Math.abs(e.surprisePercent),
        drift: Math.abs(price.priceData.day3Move),
      };
    }).filter(p => p !== null) as Array<{surprise: number, drift: number}>;

    if (pairs.length < 3) return 0;

    // Calculate Pearson correlation coefficient
    const n = pairs.length;
    const sumX = pairs.reduce((sum, p) => sum + p.surprise, 0);
    const sumY = pairs.reduce((sum, p) => sum + p.drift, 0);
    const sumXY = pairs.reduce((sum, p) => sum + p.surprise * p.drift, 0);
    const sumX2 = pairs.reduce((sum, p) => sum + p.surprise * p.surprise, 0);
    const sumY2 = pairs.reduce((sum, p) => sum + p.drift * p.drift, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate guidance impact factor
   */
  private calculateGuidanceImpact(earnings: EarningsEvent[], priceData: PostEarningsPrice[]): number {
    const withGuidance = earnings.filter(e => e.guidance.provided);
    const withoutGuidance = earnings.filter(e => !e.guidance.provided);

    if (withGuidance.length === 0) return 0;

    const guidanceMoves = withGuidance.map(e => {
      const price = priceData.find(p => p.earningsDate === e.date);
      return price ? Math.abs(price.priceData.day3Move) : 0;
    });

    const nonGuidanceMoves = withoutGuidance.map(e => {
      const price = priceData.find(p => p.earningsDate === e.date);
      return price ? Math.abs(price.priceData.day3Move) : 0;
    });

    const avgGuidanceMove = guidanceMoves.reduce((sum, move) => sum + move, 0) / guidanceMoves.length;
    const avgNonGuidanceMove = nonGuidanceMoves.length > 0 ? 
      nonGuidanceMoves.reduce((sum, move) => sum + move, 0) / nonGuidanceMoves.length : avgGuidanceMove;

    return avgNonGuidanceMove === 0 ? 0 : avgGuidanceMove / (avgGuidanceMove + avgNonGuidanceMove);
  }

  /**
   * Calculate risk factors
   */
  private calculateRiskFactors(input: EarningsDriftInput): any {
    // Market environment risk
    const marketRisk = Math.min(input.marketContext.vixLevel / 25, 1); // VIX 25+ = high risk
    
    // Sector rotation risk
    const sectorRisk = Math.abs(input.marketContext.sectorPerformance) > 0.05 ? 0.7 : 0.3;
    
    // Determine institutional positioning
    let positioning: 'crowded_long' | 'crowded_short' | 'balanced' | 'unknown' = 'unknown';
    if (input.analystConsensus) {
      const total = Object.values(input.analystConsensus).reduce((sum, count) => sum + count, 0);
      const buyRatio = (input.analystConsensus.strongBuy + input.analystConsensus.buy) / total;
      const sellRatio = (input.analystConsensus.strongSell + input.analystConsensus.sell) / total;
      
      if (buyRatio > 0.8) positioning = 'crowded_long';
      else if (sellRatio > 0.4) positioning = 'crowded_short';
      else positioning = 'balanced';
    }

    return {
      market_environment_risk: marketRisk,
      options_expiry_impact: false, // Would need to check options expiry calendar
      sector_rotation_risk: sectorRisk,
      institutional_positioning: positioning,
      earnings_season_fatigue: 0.3, // Default - would need earnings calendar data
    };
  }

  /**
   * Generate scenario analysis
   */
  private generateScenarios(input: EarningsDriftInput, patterns: any, aiAnalysis: any): any {
    const beatPattern = patterns.beat_vs_miss_patterns.beat_pattern;
    const missPattern = patterns.beat_vs_miss_patterns.miss_pattern;
    const meetPattern = patterns.beat_vs_miss_patterns.meet_pattern;

    return {
      beat_scenario: {
        probability: 0.35, // Default probability of beat
        expected_drift: beatPattern.direction === 'bullish' ? 
          Math.abs(aiAnalysis.expected_move) : -Math.abs(aiAnalysis.expected_move),
        timing: beatPattern.timeframe,
      },
      miss_scenario: {
        probability: 0.25, // Default probability of miss
        expected_drift: missPattern.direction === 'bearish' ? 
          -Math.abs(aiAnalysis.expected_move) : Math.abs(aiAnalysis.expected_move),
        timing: missPattern.timeframe,
      },
      inline_scenario: {
        probability: 0.40, // Default probability of meeting
        expected_drift: aiAnalysis.expected_move * 0.3, // Reduced drift for inline results
        timing: meetPattern.timeframe,
      },
    };
  }

  /**
   * Validate and enhance AI analysis
   */
  private validateAndEnhanceAnalysis(analysis: any, input: EarningsDriftInput): any {
    // Validate required fields
    const requiredFields = ['drift_probability', 'expected_move', 'expected_direction', 'time_pattern', 'confidence', 'peak_drift_timing', 'fade_risk'];
    for (const field of requiredFields) {
      if (analysis[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate ranges
    analysis.drift_probability = this.clamp(analysis.drift_probability, 0, 1);
    analysis.confidence = this.clamp(analysis.confidence, 0, 1);
    analysis.fade_risk = this.clamp(analysis.fade_risk, 0, 1);

    // Validate expected move magnitude (cap at 20%)
    analysis.expected_move = this.clamp(analysis.expected_move, -0.20, 0.20);

    return analysis;
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQuality(input: EarningsDriftInput): number {
    let score = 0;
    let factors = 0;

    // Historical data completeness
    if (input.historicalEarnings.length >= 8) score += 0.3;
    else if (input.historicalEarnings.length >= 4) score += 0.2;
    else score += 0.1;
    factors++;

    // Price data completeness
    if (input.historicalPriceData.length >= 8) score += 0.3;
    else if (input.historicalPriceData.length >= 4) score += 0.2;
    else score += 0.1;
    factors++;

    // Options data availability
    if (input.optionsActivity) score += 0.2;
    else score += 0.05;
    factors++;

    // Expected earnings data
    if (input.expectedEPS && input.expectedRevenue) score += 0.1;
    else if (input.expectedEPS || input.expectedRevenue) score += 0.05;
    factors++;

    // Analyst consensus data
    if (input.analystConsensus) score += 0.1;
    factors++;

    return score;
  }

  /**
   * Calculate pattern strength
   */
  private calculatePatternStrength(patterns: any): number {
    const weights = {
      last_3: 0.4,
      last_8: 0.3,
      beat_pattern: 0.15,
      miss_pattern: 0.15,
    };

    let weightedSum = 0;
    weightedSum += patterns.last_3_earnings.success_rate * weights.last_3;
    weightedSum += patterns.last_8_quarters.success_rate * weights.last_8;
    weightedSum += patterns.beat_vs_miss_patterns.beat_pattern.success_rate * weights.beat_pattern;
    weightedSum += patterns.beat_vs_miss_patterns.miss_pattern.success_rate * weights.miss_pattern;

    return weightedSum;
  }

  /**
   * Cache analysis results
   */
  private async cacheAnalysis(cacheKey: string, analysis: EarningsDriftOutput): Promise<void> {
    try {
      await redisClient.setex(cacheKey, this.cacheTimeout, JSON.stringify(analysis));
      loggerUtils.aiLogger.debug('Earnings drift analysis cached', { cacheKey });
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to cache earnings drift analysis', {
        cacheKey,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get cached analysis
   */
  private async getCachedAnalysis(cacheKey: string): Promise<EarningsDriftOutput | null> {
    try {
      const cached = await redisClient.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to retrieve cached earnings drift analysis', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(symbol: string, earningsDate: string): string {
    return `earnings_drift:${symbol}:${earningsDate}`;
  }

  /**
   * Get conservative analysis when AI fails
   */
  private getConservativeAnalysis(input: EarningsDriftInput, processingTime: number): EarningsDriftOutput {
    loggerUtils.aiLogger.info('Using conservative earnings drift analysis fallback', {
      symbol: input.symbol,
      nextEarningsDate: input.nextEarningsDate,
    });

    return {
      symbol: input.symbol,
      nextEarningsDate: input.nextEarningsDate,
      timestamp: Date.now(),
      analysis: {
        drift_probability: 0.4, // Conservative estimate
        expected_move: 0.03, // Conservative 3% move
        expected_direction: 'neutral',
        time_pattern: 'Conservative estimate - insufficient pattern data',
        confidence: 0.2, // Low confidence
        peak_drift_timing: '48h',
        fade_risk: 0.6, // High fade risk due to uncertainty
      },
      historical_patterns: {
        last_3_earnings: {
          pattern_type: 'mixed_signals',
          direction: 'neutral',
          strength: 0.3,
          timeframe: '48h',
          historical_occurrences: input.historicalEarnings.length,
          success_rate: 0.3,
        },
        last_8_quarters: {
          pattern_type: 'mixed_signals',
          direction: 'neutral',
          strength: 0.3,
          timeframe: '48h',
          historical_occurrences: input.historicalEarnings.length,
          success_rate: 0.3,
        },
        beat_vs_miss_patterns: {
          beat_pattern: {
            pattern_type: 'mixed_signals',
            direction: 'neutral',
            strength: 0.3,
            timeframe: '48h',
            historical_occurrences: 0,
            success_rate: 0.3,
          },
          miss_pattern: {
            pattern_type: 'mixed_signals',
            direction: 'neutral',
            strength: 0.3,
            timeframe: '48h',
            historical_occurrences: 0,
            success_rate: 0.3,
          },
          meet_pattern: {
            pattern_type: 'mixed_signals',
            direction: 'neutral',
            strength: 0.3,
            timeframe: '48h',
            historical_occurrences: 0,
            success_rate: 0.3,
          },
        },
        surprise_magnitude_correlation: 0.3,
        guidance_impact_factor: 0.3,
      },
      risk_factors: {
        market_environment_risk: 0.7, // Conservative high risk
        options_expiry_impact: false,
        sector_rotation_risk: 0.5,
        institutional_positioning: 'unknown',
        earnings_season_fatigue: 0.5,
      },
      scenarios: {
        beat_scenario: {
          probability: 0.33,
          expected_drift: 0.02,
          timing: '48h',
        },
        miss_scenario: {
          probability: 0.33,
          expected_drift: -0.03,
          timing: '48h',
        },
        inline_scenario: {
          probability: 0.34,
          expected_drift: 0.01,
          timing: '24h',
        },
      },
      metadata: {
        model_used: 'conservative_fallback',
        processing_time: processingTime,
        cache_hit: false,
        historical_data_quality: this.calculateDataQuality(input),
        pattern_strength: 0.2,
      },
    };
  }

  /**
   * Log drift analysis for audit trail
   */
  private logDriftAnalysis(result: EarningsDriftOutput, input: EarningsDriftInput): void {
    loggerUtils.aiLogger.info('Earnings drift analysis completed', {
      symbol: result.symbol,
      nextEarningsDate: result.nextEarningsDate,
      drift_probability: result.analysis.drift_probability,
      expected_move: result.analysis.expected_move,
      expected_direction: result.analysis.expected_direction,
      confidence: result.analysis.confidence,
      peak_timing: result.analysis.peak_drift_timing,
      fade_risk: result.analysis.fade_risk,
      pattern_strength: result.metadata.pattern_strength,
      data_quality: result.metadata.historical_data_quality,
      processing_time: result.metadata.processing_time,
      cache_hit: result.metadata.cache_hit,
      historical_quarters: input.historicalEarnings.length,
      market_risk: result.risk_factors.market_environment_risk,
      vix_level: input.marketContext.vixLevel,
      sector_performance: input.marketContext.sectorPerformance,
    });
  }

  /**
   * Utility function to clamp values
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Batch analyze multiple symbols for earnings drift
   */
  async batchAnalyzeDrift(inputs: EarningsDriftInput[]): Promise<EarningsDriftOutput[]> {
    const results: EarningsDriftOutput[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(input => this.analyzeDrift(input));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          loggerUtils.aiLogger.error('Batch earnings drift analysis failed', {
            symbol: batch[index].symbol,
            error: result.reason,
          });
          
          // Add conservative analysis for failed symbol
          results.push(this.getConservativeAnalysis(batch[index], 0));
        }
      });
      
      // Add delay between batches
      if (i + batchSize < inputs.length) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }
    
    return results;
  }

  /**
   * Get earnings calendar analysis for multiple upcoming earnings
   */
  async getEarningsCalendarAnalysis(symbols: string[], dateRange: { start: string; end: string }): Promise<Array<{
    symbol: string;
    earningsDate: string;
    driftScore: number;
    riskLevel: 'low' | 'medium' | 'high';
    expectedMove: number;
    confidence: number;
  }>> {
    const calendarAnalysis: Array<{
      symbol: string;
      earningsDate: string;
      driftScore: number;
      riskLevel: 'low' | 'medium' | 'high';
      expectedMove: number;
      confidence: number;
    }> = [];

    for (const symbol of symbols) {
      try {
        // Get earnings date (would normally fetch from earnings calendar API)
        const earningsDate = '2024-01-15'; // Placeholder
        
        // Create minimal input for analysis
        const input: EarningsDriftInput = {
          symbol,
          nextEarningsDate: earningsDate,
          historicalEarnings: [], // Would fetch from data source
          historicalPriceData: [],
          currentPrice: 100, // Would fetch current price
          currentVolume: 1000000,
          avgVolume20d: 800000,
          marketContext: {
            vixLevel: 20,
            sectorPerformance: 0.02,
            marketTrend: 'neutral',
          },
        };

        const analysis = await this.analyzeDrift(input);
        
        let riskLevel: 'low' | 'medium' | 'high' = 'medium';
        if (analysis.analysis.confidence < 0.4 || analysis.analysis.fade_risk > 0.7) {
          riskLevel = 'high';
        } else if (analysis.analysis.confidence > 0.7 && analysis.analysis.fade_risk < 0.4) {
          riskLevel = 'low';
        }

        calendarAnalysis.push({
          symbol,
          earningsDate,
          driftScore: analysis.analysis.drift_probability,
          riskLevel,
          expectedMove: analysis.analysis.expected_move,
          confidence: analysis.analysis.confidence,
        });
      } catch (error) {
        loggerUtils.aiLogger.warn('Failed to analyze earnings calendar item', {
          symbol,
          error: (error as Error).message,
        });
      }
    }

    return calendarAnalysis.sort((a, b) => b.driftScore - a.driftScore);
  }
}

export default EarningsDrift;
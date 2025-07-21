/**
 * Technical Timing AI Module
 * Uses GPT-3.5-turbo for fast analysis and GPT-4-turbo for complex patterns
 */

import { openAIClient } from '../../config/openai.js';
import { redisClientInstance as redisClient } from '../../config/redis.js';
import { loggerUtils } from '../../config/logger.js';
import { DataHub } from '../../api/DataHub.js';

export interface TechnicalIndicators {
  // RSI data
  rsi: number;
  rsiTrend: 'rising' | 'falling' | 'neutral';
  rsiDivergence?: 'bullish' | 'bearish' | 'none';
  
  // MACD data
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdCrossover?: 'bullish' | 'bearish' | 'none';
  
  // Bollinger Bands
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbSqueeze: boolean;
  bbWidth: number;
  
  // Price and moving averages
  currentPrice: number;
  sma20: number;
  sma50: number;
  sma200?: number;
  ema12?: number;
  ema26?: number;
  
  // Volume analysis
  currentVolume: number;
  avgVolume10d: number;
  volumeSpike: boolean;
  volumeRatio: number;
  
  // Support and resistance
  supportLevels: number[];
  resistanceLevels: number[];
  keyPivotLevel?: number;
  
  // Pattern indicators
  patternSignal?: 'bullish' | 'bearish' | 'neutral';
  patternStrength?: number;
  trendDirection: 'uptrend' | 'downtrend' | 'sideways';
  
  // Market structure
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
}

export interface TechnicalTimingInput {
  symbol: string;
  timeframe: '1-2 days' | '3-5 days' | '1-2 weeks' | 'intraday';
  tradeType: 'swing' | 'scalp' | 'position';
  indicators: TechnicalIndicators;
  marketContext?: {
    vixLevel?: number;
    marketTrend?: 'bullish' | 'bearish' | 'neutral';
    sectorStrength?: number;
  };
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface TechnicalTimingOutput {
  symbol: string;
  timeframe: string;
  timestamp: number;
  
  analysis: {
    entry_price: number;
    entry_timing: string;
    primary_exit: number;
    secondary_exit?: number;
    stop_loss: number;
    time_horizon: string;
    confidence: number;
    setup_type: 'Breakout' | 'Reversal' | 'Momentum' | 'Mean reversion' | 'Continuation';
    key_levels: string[];
    invalidation: string;
    risk_reward_ratio: number;
  };
  
  technicalSignals: {
    rsi_signal: 'overbought' | 'oversold' | 'neutral' | 'divergence';
    macd_signal: 'bullish_cross' | 'bearish_cross' | 'momentum_up' | 'momentum_down' | 'neutral';
    bb_signal: 'squeeze_breakout' | 'mean_reversion' | 'band_walk' | 'neutral';
    volume_signal: 'confirming' | 'diverging' | 'weak' | 'strong';
    trend_signal: 'strong_up' | 'strong_down' | 'weak_up' | 'weak_down' | 'consolidation';
  };
  
  patterns: {
    primary_pattern?: string;
    pattern_completion: number; // 0-1 scale
    pattern_target?: number;
    pattern_invalidation?: number;
  };
  
  metadata: {
    model_used: 'gpt-3.5-turbo' | 'gpt-4-turbo';
    signal_clarity: number;
    pattern_complexity: number;
    processing_time: number;
    cache_hit: boolean;
  };
}

export class TechnicalTiming {
  private dataHub: DataHub;
  private cacheTimeout = 1 * 60 * 60; // 1 hour in seconds
  
  // Model selection thresholds
  private readonly modelThresholds = {
    signalClarity: 0.8,
    patternComplexity: 0.5,
  };

  // Risk/reward requirements
  private readonly riskRewardMinimums = {
    swing: 2.0,     // 1:2 minimum for swing trades
    scalp: 1.5,     // 1:1.5 for scalp trades
    position: 2.5,  // 1:2.5 for position trades
  };

  // OpenAI function calling schema
  private readonly technicalTimingSchema = {
    name: "analyze_technical_timing",
    description: "Determine optimal entry/exit timing for short-term trades based on technical analysis",
    parameters: {
      type: "object",
      properties: {
        entry_price: {
          type: "number",
          description: "Optimal entry price for the trade"
        },
        entry_timing: {
          type: "string",
          description: "Specific timing condition for entry (e.g., 'Market open', 'Breakout above $150', 'Pullback to $145')"
        },
        primary_exit: {
          type: "number",
          description: "Primary profit target price"
        },
        secondary_exit: {
          type: "number",
          description: "Secondary profit target if momentum continues"
        },
        stop_loss: {
          type: "number",
          description: "Stop loss level to limit downside risk"
        },
        time_horizon: {
          type: "string",
          description: "Expected time to achieve targets (e.g., '1-2 days', 'few hours', '3-5 days')"
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence in the setup based on signal convergence"
        },
        setup_type: {
          type: "string",
          enum: ["Breakout", "Reversal", "Momentum", "Mean reversion", "Continuation"],
          description: "Type of technical setup identified"
        },
        key_levels: {
          type: "array",
          items: { type: "string" },
          description: "Important support/resistance levels and technical factors"
        },
        invalidation: {
          type: "string",
          description: "Specific level or condition that would invalidate the setup"
        },
        risk_reward_ratio: {
          type: "number",
          description: "Risk to reward ratio for the trade (e.g., 2.5 means 1:2.5)"
        }
      },
      required: ["entry_price", "entry_timing", "primary_exit", "stop_loss", "confidence", "setup_type", "invalidation", "risk_reward_ratio"]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main technical timing analysis method
   */
  async analyzeTiming(input: TechnicalTimingInput): Promise<TechnicalTimingOutput> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(input.symbol, input.timeframe);
    
    try {
      // Check cache first
      const cachedResult = await this.getCachedAnalysis(cacheKey);
      if (cachedResult) {
        loggerUtils.aiLogger.info('Technical timing cache hit', {
          symbol: input.symbol,
          timeframe: input.timeframe,
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

      // Calculate signal clarity and pattern complexity for model selection
      const signalClarity = this.calculateSignalClarity(input.indicators);
      const patternComplexity = this.calculatePatternComplexity(input.indicators);
      
      // Select appropriate model
      const model = this.selectModel(signalClarity, patternComplexity);
      
      // Perform technical analysis
      const analysis = await this.performTechnicalAnalysis(input, model);
      
      // Extract technical signals
      const technicalSignals = this.extractTechnicalSignals(input.indicators);
      
      // Detect patterns
      const patterns = this.detectPatterns(input.indicators);
      
      // Validate risk/reward ratio
      this.validateRiskReward(analysis, input.tradeType);
      
      const result: TechnicalTimingOutput = {
        symbol: input.symbol,
        timeframe: input.timeframe,
        timestamp: Date.now(),
        analysis,
        technicalSignals,
        patterns,
        metadata: {
          model_used: model,
          signal_clarity: signalClarity,
          pattern_complexity: patternComplexity,
          processing_time: Date.now() - startTime,
          cache_hit: false,
        }
      };

      // Cache the result
      await this.cacheAnalysis(cacheKey, result);
      
      // Log the analysis
      this.logTechnicalAnalysis(result, input);
      
      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Technical timing analysis failed', {
        symbol: input.symbol,
        timeframe: input.timeframe,
        error: (error as Error).message,
      });
      
      // Return conservative analysis
      return this.getConservativeAnalysis(input, Date.now() - startTime);
    }
  }

  /**
   * Select model based on signal clarity and pattern complexity
   */
  private selectModel(signalClarity: number, patternComplexity: number): 'gpt-3.5-turbo' | 'gpt-4-turbo' {
    // Use GPT-3.5-turbo for straightforward technical analysis
    if (signalClarity > this.modelThresholds.signalClarity && patternComplexity < this.modelThresholds.patternComplexity) {
      return 'gpt-3.5-turbo';
    } else {
      // Use GPT-4-turbo for complex patterns or conflicting signals
      return 'gpt-4-turbo';
    }
  }

  /**
   * Calculate signal clarity (how clear the technical signals are)
   */
  private calculateSignalClarity(indicators: TechnicalIndicators): number {
    let clarity = 0;
    let factors = 0;
    
    // RSI clarity
    if (indicators.rsi > 70 || indicators.rsi < 30) {
      clarity += 0.8; // Clear overbought/oversold
    } else if (indicators.rsi > 60 || indicators.rsi < 40) {
      clarity += 0.4; // Moderate signal
    } else {
      clarity += 0.1; // Neutral zone
    }
    factors++;
    
    // MACD clarity
    if (Math.abs(indicators.macdHistogram) > 0.5) {
      clarity += 0.7; // Strong momentum
    } else if (Math.abs(indicators.macdHistogram) > 0.2) {
      clarity += 0.5; // Moderate momentum
    } else {
      clarity += 0.2; // Weak momentum
    }
    factors++;
    
    // Volume clarity
    if (indicators.volumeSpike && indicators.volumeRatio > 2.0) {
      clarity += 0.8; // Strong volume confirmation
    } else if (indicators.volumeRatio > 1.5) {
      clarity += 0.6; // Good volume
    } else {
      clarity += 0.3; // Average volume
    }
    factors++;
    
    // Trend clarity
    if (indicators.trendDirection !== 'sideways') {
      clarity += 0.7; // Clear trend
    } else {
      clarity += 0.3; // Sideways/unclear
    }
    factors++;
    
    return Math.min(clarity / factors, 1.0);
  }

  /**
   * Calculate pattern complexity
   */
  private calculatePatternComplexity(indicators: TechnicalIndicators): number {
    let complexity = 0;
    
    // Multiple support/resistance levels increase complexity
    const totalLevels = indicators.supportLevels.length + indicators.resistanceLevels.length;
    if (totalLevels > 6) complexity += 0.3;
    else if (totalLevels > 4) complexity += 0.2;
    else complexity += 0.1;
    
    // Bollinger Band squeeze patterns are complex
    if (indicators.bbSqueeze) complexity += 0.3;
    
    // MACD and RSI divergences add complexity
    if (indicators.rsiDivergence && indicators.rsiDivergence !== 'none') complexity += 0.3;
    if (indicators.macdCrossover && indicators.macdCrossover !== 'none') complexity += 0.2;
    
    // Market structure complexity
    const structureSignals = [
      indicators.higherHighs,
      indicators.higherLows,
      indicators.lowerHighs,
      indicators.lowerLows
    ].filter(Boolean).length;
    
    if (structureSignals > 2) complexity += 0.3;
    else if (structureSignals > 1) complexity += 0.2;
    
    // Pattern strength adds complexity
    if (indicators.patternStrength && indicators.patternStrength > 0.7) complexity += 0.2;
    
    return Math.min(complexity, 1.0);
  }

  /**
   * Perform technical analysis using selected model
   */
  private async performTechnicalAnalysis(input: TechnicalTimingInput, model: 'gpt-3.5-turbo' | 'gpt-4-turbo'): Promise<any> {
    const systemPrompt = this.buildSystemPrompt(model);
    const userPrompt = this.buildUserPrompt(input);

    try {
      const response = await openAIClient.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      return this.validateAndEnhanceAnalysis(analysis, input);
    } catch (error) {
      loggerUtils.aiLogger.error('OpenAI technical analysis failed', {
        symbol: input.symbol,
        model,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build system prompt based on model
   */
  private buildSystemPrompt(model: 'gpt-3.5-turbo' | 'gpt-4-turbo'): string {
    const basePrompt = `You are an expert technical analyst specializing in short-term trading setups. Your role is to identify optimal entry and exit points for swing trades using technical indicators and price action.

KEY TECHNICAL INDICATORS TO ANALYZE:

RSI (Relative Strength Index):
- Overbought (>70): Look for reversal signals
- Oversold (<30): Look for bounce opportunities
- Divergences: Price vs RSI momentum divergence
- Trend confirmation in 40-60 range

MACD (Moving Average Convergence Divergence):
- Signal line crossovers: Bullish (MACD > Signal), Bearish (MACD < Signal)
- Histogram momentum: Increasing = strengthening trend
- Zero line crossovers: Trend direction changes
- Divergences with price action

Bollinger Bands:
- Squeeze patterns: Low volatility before explosive moves
- Band breakouts: Continuation signals
- Mean reversion: Bounces from extreme bands
- Band walks: Strong trending moves

Support/Resistance Levels:
- Multi-timeframe confluence levels
- Volume confirmation at key levels
- False breakout vs genuine breakout
- Pivot point calculations

Volume Analysis:
- Volume spikes: Confirm breakouts/breakdowns
- Volume divergence: Weakening momentum
- Average volume comparison
- Volume-price relationship

PATTERN RECOGNITION:
- Bull/Bear flags and pennants
- Double tops/bottoms
- Ascending/descending triangles
- Head and shoulders patterns
- Gap fills and extensions

SETUP REQUIREMENTS:
- Minimum 1:2 risk/reward ratio for swing trades
- Clear invalidation levels
- Specific entry timing conditions
- Multiple timeframe confirmation`;

    if (model === 'gpt-4-turbo') {
      return basePrompt + `

ADVANCED PATTERN ANALYSIS:
Focus on complex pattern recognition, multi-indicator divergences, and nuanced market structure analysis. Consider:
- Complex harmonic patterns
- Multi-timeframe confluence
- Institutional order flow clues
- Market microstructure signals
- Advanced volume patterns`;
    }

    return basePrompt + `

FOCUS ON CLARITY:
Prioritize clear, high-probability setups with strong signal convergence. Avoid overcomplicating the analysis.`;
  }

  /**
   * Build user prompt with technical data
   */
  private buildUserPrompt(input: TechnicalTimingInput): string {
    const { indicators } = input;
    
    return `Analyze ${input.symbol} for optimal ${input.timeframe} ${input.tradeType} trade entry/exit:

TECHNICAL DATA:
- RSI (14): current: ${indicators.rsi.toFixed(1)}, trend: ${indicators.rsiTrend}, divergence: ${indicators.rsiDivergence || 'none'}
- MACD: line: ${indicators.macdLine.toFixed(3)}, signal: ${indicators.macdSignal.toFixed(3)}, histogram: ${indicators.macdHistogram.toFixed(3)}, crossover: ${indicators.macdCrossover || 'none'}
- Bollinger Bands: upper: ${indicators.bbUpper.toFixed(2)}, middle: ${indicators.bbMiddle.toFixed(2)}, lower: ${indicators.bbLower.toFixed(2)}, squeeze: ${indicators.bbSqueeze}, width: ${indicators.bbWidth.toFixed(2)}
- Price: current: ${indicators.currentPrice.toFixed(2)}, 20sma: ${indicators.sma20.toFixed(2)}, 50sma: ${indicators.sma50.toFixed(2)}${indicators.sma200 ? `, 200sma: ${indicators.sma200.toFixed(2)}` : ''}
- Volume: current: ${indicators.currentVolume.toLocaleString()}, avg_10d: ${indicators.avgVolume10d.toLocaleString()}, spike: ${indicators.volumeSpike}, ratio: ${indicators.volumeRatio.toFixed(2)}x
- Support levels: [${indicators.supportLevels.map(l => l.toFixed(2)).join(', ')}]
- Resistance levels: [${indicators.resistanceLevels.map(l => l.toFixed(2)).join(', ')}]
- Trend: ${indicators.trendDirection}
- Market Structure: HH: ${indicators.higherHighs}, HL: ${indicators.higherLows}, LH: ${indicators.lowerHighs}, LL: ${indicators.lowerLows}

MARKET CONTEXT:
${input.marketContext ? `- VIX: ${input.marketContext.vixLevel?.toFixed(1) || 'N/A'}
- Market Trend: ${input.marketContext.marketTrend || 'Unknown'}
- Sector Strength: ${input.marketContext.sectorStrength ? (input.marketContext.sectorStrength * 100).toFixed(1) + '%' : 'N/A'}` : '- Limited market context available'}

TRADE PARAMETERS:
- Timeframe: ${input.timeframe}
- Trade Type: ${input.tradeType}
- Risk Tolerance: ${input.riskTolerance}

For this timeframe and setup, determine:
1. Optimal entry price and specific timing condition
2. Primary exit target based on technical levels
3. Secondary exit if momentum continues
4. Stop loss level with clear invalidation
5. Confidence based on signal convergence and pattern strength

Ensure minimum ${this.riskRewardMinimums[input.tradeType]}:1 risk/reward ratio.`;
  }

  /**
   * Extract technical signals from indicators
   */
  private extractTechnicalSignals(indicators: TechnicalIndicators): any {
    return {
      rsi_signal: this.getRSISignal(indicators.rsi, indicators.rsiDivergence),
      macd_signal: this.getMACDSignal(indicators.macdLine, indicators.macdSignal, indicators.macdHistogram, indicators.macdCrossover),
      bb_signal: this.getBollingerSignal(indicators),
      volume_signal: this.getVolumeSignal(indicators.volumeSpike, indicators.volumeRatio),
      trend_signal: this.getTrendSignal(indicators),
    };
  }

  /**
   * Get RSI signal
   */
  private getRSISignal(rsi: number, divergence?: string): string {
    if (divergence && divergence !== 'none') {
      return 'divergence';
    }
    if (rsi > 70) return 'overbought';
    if (rsi < 30) return 'oversold';
    return 'neutral';
  }

  /**
   * Get MACD signal
   */
  private getMACDSignal(macdLine: number, macdSignal: number, histogram: number, crossover?: string): string {
    if (crossover === 'bullish') return 'bullish_cross';
    if (crossover === 'bearish') return 'bearish_cross';
    if (histogram > 0 && histogram > Math.abs(macdLine - macdSignal) * 0.5) return 'momentum_up';
    if (histogram < 0 && Math.abs(histogram) > Math.abs(macdLine - macdSignal) * 0.5) return 'momentum_down';
    return 'neutral';
  }

  /**
   * Get Bollinger Bands signal
   */
  private getBollingerSignal(indicators: TechnicalIndicators): string {
    if (indicators.bbSqueeze) return 'squeeze_breakout';
    
    const { currentPrice, bbUpper, bbLower, bbMiddle } = indicators;
    
    if (currentPrice > bbUpper * 0.995) return 'band_walk';
    if (currentPrice < bbLower * 1.005) return 'band_walk';
    if (Math.abs(currentPrice - bbMiddle) < (bbUpper - bbLower) * 0.1) return 'mean_reversion';
    
    return 'neutral';
  }

  /**
   * Get volume signal
   */
  private getVolumeSignal(volumeSpike: boolean, volumeRatio: number): string {
    if (volumeSpike && volumeRatio > 2.0) return 'strong';
    if (volumeRatio > 1.5) return 'confirming';
    if (volumeRatio < 0.8) return 'weak';
    return 'diverging';
  }

  /**
   * Get trend signal
   */
  private getTrendSignal(indicators: TechnicalIndicators): string {
    const { trendDirection, higherHighs, higherLows, lowerHighs, lowerLows } = indicators;
    
    if (trendDirection === 'uptrend') {
      return (higherHighs && higherLows) ? 'strong_up' : 'weak_up';
    } else if (trendDirection === 'downtrend') {
      return (lowerHighs && lowerLows) ? 'strong_down' : 'weak_down';
    }
    
    return 'consolidation';
  }

  /**
   * Detect chart patterns
   */
  private detectPatterns(indicators: TechnicalIndicators): any {
    const patterns = {
      primary_pattern: undefined as string | undefined,
      pattern_completion: 0,
      pattern_target: undefined as number | undefined,
      pattern_invalidation: undefined as number | undefined,
    };

    // Simple pattern detection based on market structure
    if (indicators.higherHighs && indicators.higherLows) {
      patterns.primary_pattern = 'Ascending Triangle';
      patterns.pattern_completion = 0.7;
    } else if (indicators.lowerHighs && indicators.lowerLows) {
      patterns.primary_pattern = 'Descending Triangle';
      patterns.pattern_completion = 0.7;
    } else if (indicators.bbSqueeze) {
      patterns.primary_pattern = 'Bollinger Band Squeeze';
      patterns.pattern_completion = 0.8;
    }

    // Set pattern targets based on support/resistance
    if (patterns.primary_pattern && indicators.resistanceLevels.length > 0) {
      patterns.pattern_target = indicators.resistanceLevels[0];
    }

    if (patterns.primary_pattern && indicators.supportLevels.length > 0) {
      patterns.pattern_invalidation = indicators.supportLevels[indicators.supportLevels.length - 1];
    }

    return patterns;
  }

  /**
   * Validate and enhance analysis
   */
  private validateAndEnhanceAnalysis(analysis: any, input: TechnicalTimingInput): any {
    // Ensure all required fields are present
    const requiredFields = ['entry_price', 'primary_exit', 'stop_loss', 'confidence', 'setup_type'];
    for (const field of requiredFields) {
      if (analysis[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate confidence score
    analysis.confidence = this.clamp(analysis.confidence, 0, 1);

    // Calculate risk/reward ratio if not provided
    if (!analysis.risk_reward_ratio) {
      const risk = Math.abs(analysis.entry_price - analysis.stop_loss);
      const reward = Math.abs(analysis.primary_exit - analysis.entry_price);
      analysis.risk_reward_ratio = risk > 0 ? reward / risk : 0;
    }

    // Ensure minimum risk/reward ratio
    const minRatio = this.riskRewardMinimums[input.tradeType];
    if (analysis.risk_reward_ratio < minRatio) {
      loggerUtils.aiLogger.warn('Risk/reward ratio below minimum', {
        symbol: input.symbol,
        ratio: analysis.risk_reward_ratio,
        minimum: minRatio,
      });
    }

    // Add default timing if missing
    if (!analysis.entry_timing) {
      analysis.entry_timing = 'Market open';
    }

    // Add default time horizon if missing
    if (!analysis.time_horizon) {
      analysis.time_horizon = input.timeframe;
    }

    return analysis;
  }

  /**
   * Validate risk/reward ratio
   */
  private validateRiskReward(analysis: any, tradeType: string): void {
    const minRatio = this.riskRewardMinimums[tradeType as keyof typeof this.riskRewardMinimums];
    
    if (analysis.risk_reward_ratio < minRatio) {
      throw new Error(`Risk/reward ratio ${analysis.risk_reward_ratio.toFixed(2)} is below minimum ${minRatio} for ${tradeType} trades`);
    }
  }

  /**
   * Cache analysis results
   */
  private async cacheAnalysis(cacheKey: string, analysis: TechnicalTimingOutput): Promise<void> {
    try {
      await redisClient().setex(cacheKey, this.cacheTimeout, JSON.stringify(analysis));
      loggerUtils.aiLogger.debug('Technical analysis cached', { cacheKey });
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to cache technical analysis', {
        cacheKey,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get cached analysis
   */
  private async getCachedAnalysis(cacheKey: string): Promise<TechnicalTimingOutput | null> {
    try {
      const cached = await redisClient().get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to retrieve cached analysis', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(symbol: string, timeframe: string): string {
    const hour = Math.floor(Date.now() / (1000 * 60 * 60)); // Current hour
    return `technical:${symbol}:${timeframe}:${hour}`;
  }

  /**
   * Get conservative analysis when AI fails
   */
  private getConservativeAnalysis(input: TechnicalTimingInput, processingTime: number): TechnicalTimingOutput {
    const { indicators } = input;
    
    loggerUtils.aiLogger.info('Using conservative technical analysis fallback', {
      symbol: input.symbol,
      timeframe: input.timeframe,
    });

    // Conservative analysis based on simple rules
    const conservativeEntry = indicators.currentPrice;
    const conservativeStop = indicators.supportLevels.length > 0 ? 
      indicators.supportLevels[indicators.supportLevels.length - 1] * 0.98 : 
      indicators.currentPrice * 0.95;
    const conservativeTarget = indicators.resistanceLevels.length > 0 ? 
      indicators.resistanceLevels[0] * 0.98 : 
      indicators.currentPrice * 1.06;

    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      timestamp: Date.now(),
      analysis: {
        entry_price: conservativeEntry,
        entry_timing: 'Conservative market entry',
        primary_exit: conservativeTarget,
        stop_loss: conservativeStop,
        time_horizon: input.timeframe,
        confidence: 0.3,
        setup_type: 'Mean reversion',
        key_levels: [`Support at ${conservativeStop.toFixed(2)}`, `Resistance at ${conservativeTarget.toFixed(2)}`],
        invalidation: `Close below ${conservativeStop.toFixed(2)}`,
        risk_reward_ratio: (conservativeTarget - conservativeEntry) / (conservativeEntry - conservativeStop),
      },
      technicalSignals: this.extractTechnicalSignals(indicators),
      patterns: {
        pattern_completion: 0,
      },
      metadata: {
        model_used: 'gpt-3.5-turbo',
        signal_clarity: 0.3,
        pattern_complexity: 0.3,
        processing_time: processingTime,
        cache_hit: false,
      }
    };
  }

  /**
   * Log technical analysis for audit trail
   */
  private logTechnicalAnalysis(result: TechnicalTimingOutput, input: TechnicalTimingInput): void {
    loggerUtils.aiLogger.info('Technical timing analysis completed', {
      symbol: result.symbol,
      timeframe: result.timeframe,
      model_used: result.metadata.model_used,
      signal_clarity: result.metadata.signal_clarity,
      pattern_complexity: result.metadata.pattern_complexity,
      setup_type: result.analysis.setup_type,
      confidence: result.analysis.confidence,
      risk_reward_ratio: result.analysis.risk_reward_ratio,
      entry_price: result.analysis.entry_price,
      primary_exit: result.analysis.primary_exit,
      stop_loss: result.analysis.stop_loss,
      processing_time: result.metadata.processing_time,
      cache_hit: result.metadata.cache_hit,
      rsi: input.indicators.rsi,
      macd_histogram: input.indicators.macdHistogram,
      bb_squeeze: input.indicators.bbSqueeze,
      volume_spike: input.indicators.volumeSpike,
      trend_direction: input.indicators.trendDirection,
    });
  }

  /**
   * Utility function to clamp values
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Batch analyze multiple symbols
   */
  async batchAnalyzeTiming(inputs: TechnicalTimingInput[]): Promise<TechnicalTimingOutput[]> {
    const results: TechnicalTimingOutput[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 4;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(input => this.analyzeTiming(input));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          loggerUtils.aiLogger.error('Batch timing analysis failed', {
            symbol: batch[index].symbol,
            error: result.reason,
          });
          
          // Add conservative analysis for failed symbol
          results.push(this.getConservativeAnalysis(batch[index], 0));
        }
      });
      
      // Add delay between batches
      if (i + batchSize < inputs.length) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    
    return results;
  }

  /**
   * Get intraday scalping setups
   */
  async getScalpingSetups(symbols: string[]): Promise<TechnicalTimingOutput[]> {
    const results: TechnicalTimingOutput[] = [];
    
    for (const symbol of symbols) {
      try {
        // Get basic indicators (would normally come from real-time data)
        const indicators: TechnicalIndicators = await this.getBasicIndicators(symbol);
        
        const input: TechnicalTimingInput = {
          symbol,
          timeframe: 'intraday',
          tradeType: 'scalp',
          indicators,
          riskTolerance: 'aggressive',
        };
        
        const analysis = await this.analyzeTiming(input);
        
        // Only include high-confidence scalping setups
        if (analysis.analysis.confidence > 0.7 && analysis.analysis.risk_reward_ratio >= 1.5) {
          results.push(analysis);
        }
      } catch (error) {
        loggerUtils.aiLogger.warn('Failed to analyze scalping setup', {
          symbol,
          error: (error as Error).message,
        });
      }
    }
    
    return results.sort((a, b) => b.analysis.confidence - a.analysis.confidence);
  }

  /**
   * Get basic indicators (placeholder - would integrate with real data)
   */
  private async getBasicIndicators(symbol: string): Promise<TechnicalIndicators> {
    // This would integrate with your DataHub to get real technical indicators
    // For now, return placeholder data
    return {
      rsi: 45,
      rsiTrend: 'neutral',
      macdLine: 0.1,
      macdSignal: 0.05,
      macdHistogram: 0.05,
      bbUpper: 155,
      bbMiddle: 150,
      bbLower: 145,
      bbSqueeze: false,
      bbWidth: 10,
      currentPrice: 150,
      sma20: 149,
      sma50: 148,
      currentVolume: 1000000,
      avgVolume10d: 800000,
      volumeSpike: false,
      volumeRatio: 1.25,
      supportLevels: [148, 145],
      resistanceLevels: [152, 155],
      trendDirection: 'sideways',
      higherHighs: false,
      higherLows: false,
      lowerHighs: false,
      lowerLows: false,
    };
  }
}

export default TechnicalTiming;
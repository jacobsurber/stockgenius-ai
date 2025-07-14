/**
 * Anomaly Explainer AI Module
 * Uses GPT-4-turbo for complex pattern investigation and hidden catalyst detection
 */

import { openAIClient } from '../../config/openai.js';
import { redisClient } from '../../config/redis.js';
import { loggerUtils } from '../../config/logger.js';
import { DataHub } from '../../api/DataHub.js';

export interface PriceAnomaly {
  symbol: string;
  timestamp: number;
  priceChange: number; // Percentage change
  priceChangeAbsolute: number; // Absolute price change
  volume: number;
  volumeRatio: number; // Current volume / average volume
  timeframe: string; // '1h', '1d', '1w'
  baseline: {
    averageVolume: number;
    averageVolatility: number;
    typicalPriceRange: number;
  };
}

export interface CorrelationData {
  news: Array<{
    title: string;
    summary: string;
    publishedAt: string;
    source: string;
    marketImpact: number;
    sentiment: number;
  }>;
  social: {
    mentions: number;
    mentionSpike: number; // Ratio vs baseline
    sentiment: number;
    topPosts: Array<{
      content: string;
      platform: string;
      engagement: number;
      timestamp: string;
    }>;
    velocityChange: number;
  };
  insider: Array<{
    transactionType: 'buy' | 'sell';
    value: number;
    insiderName: string;
    insiderTitle: string;
    transactionDate: string;
    significance: number;
  }>;
  options: {
    unusualActivity: boolean;
    putCallRatio: number;
    impliedVolatility: number;
    largestTrades: Array<{
      type: 'call' | 'put';
      strike: number;
      expiry: string;
      volume: number;
      premium: number;
    }>;
  };
  institutional: {
    blockTrades: Array<{
      size: number;
      price: number;
      timestamp: string;
      type: 'buy' | 'sell';
    }>;
    flowDirection: 'buying' | 'selling' | 'neutral';
    darkPoolActivity: number;
  };
  technical: {
    keyLevelsBroken: string[];
    patternCompletion: string[];
    momentumIndicators: {
      rsi: number;
      macd: number;
      volumeOscillator: number;
    };
    algorithmicSignals: string[];
  };
  macro: {
    sectorPerformance: number;
    marketSentiment: number;
    correlatedMovements: Array<{
      symbol: string;
      correlation: number;
      priceChange: number;
    }>;
    economicEvents: Array<{
      event: string;
      impact: string;
      timing: string;
    }>;
  };
}

export interface AnomalyExplanation {
  symbol: string;
  timestamp: number;
  anomaly: PriceAnomaly;
  
  analysis: {
    explanation: string;
    confidence: number;
    primary_catalyst: string;
    contributing_factors: string[];
    follow_up_signals: string[];
    market_structure_effects: string[];
  };
  
  causality: {
    likely_triggers: Array<{
      factor: string;
      probability: number;
      timing_correlation: number;
      evidence: string[];
    }>;
    cascade_effects: string[];
    feedback_loops: string[];
  };
  
  hidden_catalysts: {
    detected: boolean;
    potential_sources: string[];
    investigation_areas: string[];
    confidence_level: 'low' | 'medium' | 'high';
  };
  
  microstructure: {
    order_flow_analysis: string;
    liquidity_impact: string;
    algorithmic_influence: string;
    institutional_fingerprints: string[];
  };
  
  predictions: {
    momentum_sustainability: 'hours' | 'days' | 'weeks' | 'reversal_likely';
    key_levels_to_watch: number[];
    risk_factors: string[];
    opportunity_signals: string[];
  };
  
  metadata: {
    processing_time: number;
    data_completeness: number;
    investigation_depth: 'surface' | 'moderate' | 'deep';
    model_confidence: number;
  };
}

export class AnomalyExplainer {
  private dataHub: DataHub;
  private cacheTimeout = 30 * 60; // 30 minutes in seconds
  
  // Anomaly detection thresholds
  private readonly anomalyThresholds = {
    priceMove: {
      significant: 0.05,   // 5% move
      major: 0.10,         // 10% move
      extreme: 0.20,       // 20% move
    },
    volumeSpike: {
      notable: 2.0,        // 2x average volume
      significant: 5.0,    // 5x average volume
      extreme: 10.0,       // 10x average volume
    },
    correlationStrength: {
      weak: 0.3,
      moderate: 0.6,
      strong: 0.8,
    }
  };

  // OpenAI function calling schema
  private readonly anomalyExplanationSchema = {
    name: "explain_market_anomaly",
    description: "Investigate and explain unexplained price movements and volume spikes",
    parameters: {
      type: "object",
      properties: {
        explanation: {
          type: "string",
          description: "Clear, comprehensive explanation of the likely cause of the anomaly"
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence level in the explanation based on available evidence"
        },
        primary_catalyst: {
          type: "string",
          description: "The most likely primary driver of the anomaly"
        },
        contributing_factors: {
          type: "array",
          items: { type: "string" },
          description: "Additional factors that may have contributed to the movement"
        },
        follow_up_signals: {
          type: "array",
          items: { type: "string" },
          description: "Specific signals or events to monitor for continuation or reversal"
        },
        market_structure_effects: {
          type: "array",
          items: { type: "string" },
          description: "Market microstructure effects that may have amplified the movement"
        },
        hidden_catalyst_likelihood: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Probability that hidden/non-public information drove the movement"
        },
        momentum_sustainability: {
          type: "string",
          enum: ["hours", "days", "weeks", "reversal_likely"],
          description: "Expected duration of the momentum based on the catalyst type"
        }
      },
      required: ["explanation", "confidence", "primary_catalyst", "contributing_factors", "follow_up_signals"]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main anomaly explanation method
   */
  async explainAnomaly(anomaly: PriceAnomaly, correlationData: CorrelationData): Promise<AnomalyExplanation> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(anomaly);
    
    try {
      // Check cache first
      const cachedResult = await this.getCachedExplanation(cacheKey);
      if (cachedResult) {
        loggerUtils.aiLogger.info('Anomaly explanation cache hit', {
          symbol: anomaly.symbol,
          priceChange: anomaly.priceChange,
        });
        
        return {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            processing_time: Date.now() - startTime,
          }
        };
      }

      // Determine investigation depth based on anomaly severity
      const investigationDepth = this.determineInvestigationDepth(anomaly);
      
      // Perform AI-powered analysis
      const aiAnalysis = await this.performAIAnalysis(anomaly, correlationData, investigationDepth);
      
      // Analyze causality patterns
      const causalityAnalysis = this.analyzeCausality(anomaly, correlationData);
      
      // Detect hidden catalysts
      const hiddenCatalysts = this.detectHiddenCatalysts(anomaly, correlationData, aiAnalysis);
      
      // Analyze market microstructure
      const microstructureAnalysis = this.analyzeMicrostructure(anomaly, correlationData);
      
      // Generate predictions
      const predictions = this.generatePredictions(anomaly, correlationData, aiAnalysis);
      
      const result: AnomalyExplanation = {
        symbol: anomaly.symbol,
        timestamp: Date.now(),
        anomaly,
        analysis: aiAnalysis,
        causality: causalityAnalysis,
        hidden_catalysts: hiddenCatalysts,
        microstructure: microstructureAnalysis,
        predictions,
        metadata: {
          processing_time: Date.now() - startTime,
          data_completeness: this.calculateDataCompleteness(correlationData),
          investigation_depth: investigationDepth,
          model_confidence: aiAnalysis.confidence,
        }
      };

      // Cache the result
      await this.cacheExplanation(cacheKey, result);
      
      // Log the analysis
      this.logAnomalyAnalysis(result);
      
      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Anomaly explanation failed', {
        symbol: anomaly.symbol,
        priceChange: anomaly.priceChange,
        error: (error as Error).message,
      });
      
      // Return fallback explanation
      return this.getFallbackExplanation(anomaly, correlationData, Date.now() - startTime);
    }
  }

  /**
   * Determine investigation depth based on anomaly severity
   */
  private determineInvestigationDepth(anomaly: PriceAnomaly): 'surface' | 'moderate' | 'deep' {
    const priceImpact = Math.abs(anomaly.priceChange);
    const volumeImpact = anomaly.volumeRatio;
    
    // Deep investigation for extreme anomalies
    if (priceImpact > this.anomalyThresholds.priceMove.extreme || 
        volumeImpact > this.anomalyThresholds.volumeSpike.extreme) {
      return 'deep';
    }
    
    // Moderate investigation for significant anomalies
    if (priceImpact > this.anomalyThresholds.priceMove.major || 
        volumeImpact > this.anomalyThresholds.volumeSpike.significant) {
      return 'moderate';
    }
    
    return 'surface';
  }

  /**
   * Perform AI-powered analysis using GPT-4-turbo
   */
  private async performAIAnalysis(
    anomaly: PriceAnomaly, 
    correlationData: CorrelationData,
    investigationDepth: string
  ): Promise<any> {
    const systemPrompt = this.buildSystemPrompt(investigationDepth);
    const userPrompt = this.buildUserPrompt(anomaly, correlationData);

    try {
      const response = await openAIClient.createChatCompletion({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        functions: [this.anomalyExplanationSchema],
        function_call: { name: 'explain_market_anomaly' },
        temperature: 0.1,
        max_tokens: 2000,
      });

      if (response.choices[0]?.message?.function_call?.arguments) {
        const analysis = JSON.parse(response.choices[0].message.function_call.arguments);
        return this.validateAndEnhanceAnalysis(analysis, anomaly, correlationData);
      }

      throw new Error('No function call response received');
    } catch (error) {
      loggerUtils.aiLogger.error('OpenAI anomaly analysis failed', {
        symbol: anomaly.symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build system prompt for anomaly investigation
   */
  private buildSystemPrompt(investigationDepth: string): string {
    const basePrompt = `You are an expert market anomaly investigator specializing in identifying hidden catalysts and explaining unexplained price movements. Your role is to analyze complex market data patterns and uncover the most likely explanations for unusual trading activity.

INVESTIGATION FRAMEWORK:

1. CATALYST IDENTIFICATION:
   - News events and their timing correlation
   - Social media momentum and narrative shifts
   - Insider trading patterns and significance
   - Options flow and institutional activity
   - Technical breakouts and algorithmic triggers

2. HIDDEN CATALYST DETECTION:
   - Information asymmetry indicators
   - Unusual trading patterns before public news
   - Cross-asset correlations and spillover effects
   - Dark pool activity and block trading
   - Regulatory filing patterns

3. MARKET MICROSTRUCTURE ANALYSIS:
   - Order flow dynamics and liquidity impacts
   - Algorithmic trading signatures
   - Institutional vs retail flow patterns
   - High-frequency trading effects
   - Market maker positioning

4. CAUSALITY ASSESSMENT:
   - Primary vs secondary drivers
   - Timing correlations and lead-lag relationships
   - Feedback loops and cascade effects
   - Market structure amplification effects

5. MOMENTUM SUSTAINABILITY:
   - Catalyst durability and follow-through potential
   - Technical support/resistance factors
   - Sentiment sustainability indicators
   - Institutional commitment signals

ANALYSIS PRINCIPLES:
- Distinguish correlation from causation
- Consider multiple hypothesis testing
- Account for market regime and volatility environment
- Assess information content and market efficiency
- Identify potential false signals and noise`;

    if (investigationDepth === 'deep') {
      return basePrompt + `

DEEP INVESTIGATION MODE:
Focus on comprehensive pattern analysis including:
- Multi-timeframe correlation analysis
- Cross-market spillover effects
- Sophisticated institutional flow patterns
- Advanced technical pattern recognition
- Regulatory and legal catalyst investigation
- Supply chain and fundamental catalyst assessment`;
    } else if (investigationDepth === 'moderate') {
      return basePrompt + `

MODERATE INVESTIGATION MODE:
Balance thoroughness with efficiency:
- Focus on primary catalyst categories
- Standard correlation timeframes
- Key institutional indicators
- Major news and social catalysts`;
    }

    return basePrompt + `

SURFACE INVESTIGATION MODE:
Efficient analysis of obvious catalysts:
- Clear news correlations
- Major social media events
- Obvious technical breakouts`;
  }

  /**
   * Build user prompt with anomaly and correlation data
   */
  private buildUserPrompt(anomaly: PriceAnomaly, correlationData: CorrelationData): string {
    return `Investigate market anomaly for ${anomaly.symbol}:

ANOMALY DETAILS:
- Price Movement: ${anomaly.priceChange > 0 ? '+' : ''}${anomaly.priceChange.toFixed(2)}% (${anomaly.priceChangeAbsolute > 0 ? '+$' : '-$'}${Math.abs(anomaly.priceChangeAbsolute).toFixed(2)})
- Volume: ${anomaly.volume.toLocaleString()} shares (${anomaly.volumeRatio.toFixed(1)}x average)
- Timeframe: ${anomaly.timeframe}
- Timestamp: ${new Date(anomaly.timestamp).toISOString()}
- Baseline Context: Avg Volume: ${anomaly.baseline.averageVolume.toLocaleString()}, Avg Volatility: ${(anomaly.baseline.averageVolatility * 100).toFixed(1)}%

NEWS ANALYSIS:
${correlationData.news.length > 0 ? correlationData.news.map(news => 
  `- "${news.title}" (${news.source}, Impact: ${(news.marketImpact * 100).toFixed(0)}%, Sentiment: ${news.sentiment.toFixed(2)}, Published: ${news.publishedAt})`
).join('\n') : '- No significant news events identified'}

SOCIAL MEDIA ANALYSIS:
- Mentions: ${correlationData.social.mentions} (${correlationData.social.mentionSpike.toFixed(1)}x baseline)
- Sentiment: ${correlationData.social.sentiment.toFixed(2)}
- Velocity Change: ${(correlationData.social.velocityChange * 100).toFixed(0)}%
- Top Posts: ${correlationData.social.topPosts.slice(0, 3).map(post => 
  `"${post.content.substring(0, 100)}..." (${post.platform}, ${post.engagement} engagement)`
).join('; ')}

INSIDER TRADING:
${correlationData.insider.length > 0 ? correlationData.insider.map(trade => 
  `- ${trade.insiderName} (${trade.insiderTitle}): ${trade.transactionType.toUpperCase()} $${(trade.value / 1000).toFixed(0)}K on ${trade.transactionDate} (Significance: ${(trade.significance * 100).toFixed(0)}%)`
).join('\n') : '- No recent insider trading activity'}

OPTIONS ACTIVITY:
- Unusual Activity: ${correlationData.options.unusualActivity ? 'YES' : 'NO'}
- Put/Call Ratio: ${correlationData.options.putCallRatio.toFixed(2)}
- Implied Volatility: ${(correlationData.options.impliedVolatility * 100).toFixed(1)}%
- Largest Trades: ${correlationData.options.largestTrades.slice(0, 3).map(trade => 
  `${trade.type.toUpperCase()} $${trade.strike} ${trade.expiry} (${trade.volume} contracts, $${trade.premium.toFixed(2)} premium)`
).join('; ')}

INSTITUTIONAL FLOW:
- Flow Direction: ${correlationData.institutional.flowDirection}
- Block Trades: ${correlationData.institutional.blockTrades.length} trades
- Dark Pool Activity: ${(correlationData.institutional.darkPoolActivity * 100).toFixed(1)}%

TECHNICAL FACTORS:
- Key Levels Broken: ${correlationData.technical.keyLevelsBroken.join(', ') || 'None'}
- Pattern Completion: ${correlationData.technical.patternCompletion.join(', ') || 'None'}
- RSI: ${correlationData.technical.momentumIndicators.rsi.toFixed(1)}
- MACD: ${correlationData.technical.momentumIndicators.macd.toFixed(3)}
- Algorithmic Signals: ${correlationData.technical.algorithmicSignals.join(', ') || 'None detected'}

MACRO CONTEXT:
- Sector Performance: ${(correlationData.macro.sectorPerformance * 100).toFixed(1)}%
- Market Sentiment: ${correlationData.macro.marketSentiment.toFixed(2)}
- Correlated Movements: ${correlationData.macro.correlatedMovements.slice(0, 3).map(corr => 
  `${corr.symbol} (${corr.priceChange > 0 ? '+' : ''}${corr.priceChange.toFixed(1)}%, correlation: ${corr.correlation.toFixed(2)})`
).join(', ')}
- Economic Events: ${correlationData.macro.economicEvents.map(event => 
  `${event.event} (${event.impact}, ${event.timing})`
).join('; ') || 'None identified'}

INVESTIGATION REQUIREMENTS:
1. Identify the most likely primary catalyst for this anomaly
2. Assess whether this appears to be information-driven or technical/structural
3. Evaluate the sustainability of the momentum
4. Flag any indicators of hidden catalysts or non-public information
5. Provide specific follow-up signals to monitor

Focus on distinguishing between news-driven moves, technical breakouts, institutional flow, algorithmic effects, and potential information leakage.`;
  }

  /**
   * Analyze causality patterns
   */
  private analyzeCausality(anomaly: PriceAnomaly, correlationData: CorrelationData): any {
    const likelyTriggers: Array<{
      factor: string;
      probability: number;
      timing_correlation: number;
      evidence: string[];
    }> = [];

    // News correlation analysis
    if (correlationData.news.length > 0) {
      const newsImpact = correlationData.news.reduce((sum, news) => sum + news.marketImpact, 0) / correlationData.news.length;
      const timingCorrelation = this.calculateTimingCorrelation(anomaly.timestamp, correlationData.news.map(n => new Date(n.publishedAt).getTime()));
      
      likelyTriggers.push({
        factor: 'News Events',
        probability: Math.min(newsImpact * 1.2, 1.0),
        timing_correlation: timingCorrelation,
        evidence: correlationData.news.slice(0, 2).map(n => n.title)
      });
    }

    // Social media momentum
    if (correlationData.social.mentionSpike > 2.0) {
      likelyTriggers.push({
        factor: 'Social Media Momentum',
        probability: Math.min(correlationData.social.mentionSpike / 10, 0.8),
        timing_correlation: 0.7, // Assume moderate correlation for social
        evidence: [`${correlationData.social.mentionSpike.toFixed(1)}x mention spike`, `Sentiment: ${correlationData.social.sentiment.toFixed(2)}`]
      });
    }

    // Insider trading impact
    if (correlationData.insider.length > 0) {
      const avgSignificance = correlationData.insider.reduce((sum, trade) => sum + trade.significance, 0) / correlationData.insider.length;
      likelyTriggers.push({
        factor: 'Insider Trading',
        probability: avgSignificance,
        timing_correlation: 0.6,
        evidence: correlationData.insider.map(trade => `${trade.insiderName}: ${trade.transactionType} $${(trade.value / 1000).toFixed(0)}K`)
      });
    }

    // Options flow analysis
    if (correlationData.options.unusualActivity) {
      likelyTriggers.push({
        factor: 'Options Flow',
        probability: 0.6,
        timing_correlation: 0.8,
        evidence: [`Unusual options activity`, `P/C Ratio: ${correlationData.options.putCallRatio.toFixed(2)}`]
      });
    }

    // Technical breakout
    if (correlationData.technical.keyLevelsBroken.length > 0 || correlationData.technical.patternCompletion.length > 0) {
      likelyTriggers.push({
        factor: 'Technical Breakout',
        probability: 0.5,
        timing_correlation: 0.9,
        evidence: [...correlationData.technical.keyLevelsBroken, ...correlationData.technical.patternCompletion]
      });
    }

    // Sort by probability
    likelyTriggers.sort((a, b) => b.probability - a.probability);

    return {
      likely_triggers: likelyTriggers,
      cascade_effects: this.identifyCascadeEffects(anomaly, correlationData),
      feedback_loops: this.identifyFeedbackLoops(anomaly, correlationData),
    };
  }

  /**
   * Detect hidden catalysts
   */
  private detectHiddenCatalysts(anomaly: PriceAnomaly, correlationData: CorrelationData, aiAnalysis: any): any {
    const hiddenCatalystScore = aiAnalysis.hidden_catalyst_likelihood || 0;
    
    // Indicators of hidden catalysts
    const indicators = [];
    
    // Unusual volume without obvious news
    if (anomaly.volumeRatio > 5 && correlationData.news.length === 0) {
      indicators.push('High volume without public news');
    }
    
    // Pre-news trading patterns
    if (correlationData.news.length > 0) {
      const newsTime = Math.min(...correlationData.news.map(n => new Date(n.publishedAt).getTime()));
      if (anomaly.timestamp < newsTime) {
        indicators.push('Price movement preceded news announcement');
      }
    }
    
    // Dark pool activity
    if (correlationData.institutional.darkPoolActivity > 0.5) {
      indicators.push('Elevated dark pool trading');
    }
    
    // Unusual options positioning
    if (correlationData.options.unusualActivity && correlationData.options.impliedVolatility > 0.3) {
      indicators.push('Unusual options positioning before move');
    }

    return {
      detected: hiddenCatalystScore > 0.5 || indicators.length >= 2,
      potential_sources: this.identifyPotentialSources(correlationData),
      investigation_areas: indicators,
      confidence_level: hiddenCatalystScore > 0.7 ? 'high' : hiddenCatalystScore > 0.4 ? 'medium' : 'low',
    };
  }

  /**
   * Analyze market microstructure effects
   */
  private analyzeMicrostructure(anomaly: PriceAnomaly, correlationData: CorrelationData): any {
    return {
      order_flow_analysis: this.analyzeOrderFlow(anomaly, correlationData),
      liquidity_impact: this.assessLiquidityImpact(anomaly),
      algorithmic_influence: this.detectAlgorithmicInfluence(correlationData),
      institutional_fingerprints: this.identifyInstitutionalFingerprints(correlationData),
    };
  }

  /**
   * Generate predictions based on analysis
   */
  private generatePredictions(anomaly: PriceAnomaly, correlationData: CorrelationData, aiAnalysis: any): any {
    const keyLevels = this.calculateKeyLevels(anomaly, correlationData);
    const riskFactors = this.identifyRiskFactors(anomaly, correlationData);
    const opportunities = this.identifyOpportunities(anomaly, correlationData, aiAnalysis);

    return {
      momentum_sustainability: aiAnalysis.momentum_sustainability || 'days',
      key_levels_to_watch: keyLevels,
      risk_factors: riskFactors,
      opportunity_signals: opportunities,
    };
  }

  /**
   * Helper methods for detailed analysis
   */
  private calculateTimingCorrelation(anomalyTime: number, eventTimes: number[]): number {
    if (eventTimes.length === 0) return 0;
    
    const minTimeDiff = Math.min(...eventTimes.map(time => Math.abs(anomalyTime - time)));
    const hoursDiff = minTimeDiff / (1000 * 60 * 60);
    
    // Strong correlation if within 1 hour, moderate within 6 hours, weak within 24 hours
    if (hoursDiff <= 1) return 0.9;
    if (hoursDiff <= 6) return 0.7;
    if (hoursDiff <= 24) return 0.4;
    return 0.1;
  }

  private identifyCascadeEffects(anomaly: PriceAnomaly, correlationData: CorrelationData): string[] {
    const effects = [];
    
    if (anomaly.volumeRatio > 5) {
      effects.push('Volume spike triggered algorithmic momentum strategies');
    }
    
    if (correlationData.options.putCallRatio > 2.0) {
      effects.push('Put buying pressure amplified downward movement');
    }
    
    if (correlationData.macro.correlatedMovements.length > 2) {
      effects.push('Sector-wide momentum spillover effects');
    }
    
    return effects;
  }

  private identifyFeedbackLoops(anomaly: PriceAnomaly, correlationData: CorrelationData): string[] {
    const loops = [];
    
    if (correlationData.social.mentionSpike > 3) {
      loops.push('Social media attention → more retail buying → higher prices → more attention');
    }
    
    if (correlationData.options.unusualActivity) {
      loops.push('Options flow → delta hedging → price movement → more options interest');
    }
    
    return loops;
  }

  private identifyPotentialSources(correlationData: CorrelationData): string[] {
    const sources = [];
    
    if (correlationData.institutional.blockTrades.length > 0) {
      sources.push('Institutional advance knowledge');
    }
    
    if (correlationData.insider.length > 0) {
      sources.push('Material non-public information');
    }
    
    sources.push('Regulatory filing leak');
    sources.push('Analyst upgrade/downgrade leak');
    sources.push('M&A rumors or preliminary discussions');
    
    return sources;
  }

  private analyzeOrderFlow(anomaly: PriceAnomaly, correlationData: CorrelationData): string {
    if (correlationData.institutional.flowDirection === 'buying' && anomaly.priceChange > 0) {
      return 'Strong institutional buying pressure with supportive order flow';
    }
    
    if (anomaly.volumeRatio > 5) {
      return 'High-velocity order flow with potential liquidity strain';
    }
    
    return 'Standard order flow patterns observed';
  }

  private assessLiquidityImpact(anomaly: PriceAnomaly): string {
    const impact = Math.abs(anomaly.priceChange) / anomaly.volumeRatio;
    
    if (impact > 0.02) {
      return 'High price impact relative to volume suggests low liquidity';
    } else if (impact > 0.01) {
      return 'Moderate liquidity impact observed';
    }
    
    return 'Normal liquidity conditions';
  }

  private detectAlgorithmicInfluence(correlationData: CorrelationData): string {
    if (correlationData.technical.algorithmicSignals.length > 0) {
      return `Algorithmic trading detected: ${correlationData.technical.algorithmicSignals.join(', ')}`;
    }
    
    return 'No clear algorithmic signatures identified';
  }

  private identifyInstitutionalFingerprints(correlationData: CorrelationData): string[] {
    const fingerprints = [];
    
    if (correlationData.institutional.blockTrades.length > 0) {
      fingerprints.push('Large block trading activity');
    }
    
    if (correlationData.institutional.darkPoolActivity > 0.3) {
      fingerprints.push('Elevated dark pool usage');
    }
    
    if (correlationData.options.largestTrades.length > 0) {
      fingerprints.push('Large options transactions');
    }
    
    return fingerprints;
  }

  private calculateKeyLevels(anomaly: PriceAnomaly, correlationData: CorrelationData): number[] {
    const levels = [];
    const currentPrice = anomaly.priceChangeAbsolute; // This would be actual current price in real implementation
    
    // Add broken technical levels
    correlationData.technical.keyLevelsBroken.forEach(level => {
      const numLevel = parseFloat(level.replace(/[^0-9.]/g, ''));
      if (!isNaN(numLevel)) levels.push(numLevel);
    });
    
    // Add psychological levels
    const roundNumbers = [
      Math.floor(currentPrice / 10) * 10,
      Math.ceil(currentPrice / 10) * 10,
      Math.floor(currentPrice / 5) * 5,
      Math.ceil(currentPrice / 5) * 5,
    ];
    
    levels.push(...roundNumbers);
    
    return [...new Set(levels)].sort((a, b) => a - b);
  }

  private identifyRiskFactors(anomaly: PriceAnomaly, correlationData: CorrelationData): string[] {
    const risks = [];
    
    if (anomaly.volumeRatio > 10) {
      risks.push('Extreme volume spike may not be sustainable');
    }
    
    if (correlationData.social.mentionSpike > 5) {
      risks.push('High social media attention could lead to volatility');
    }
    
    if (correlationData.options.putCallRatio > 2) {
      risks.push('Heavy put positioning suggests downside risk');
    }
    
    return risks;
  }

  private identifyOpportunities(anomaly: PriceAnomaly, correlationData: CorrelationData, aiAnalysis: any): string[] {
    const opportunities = [];
    
    if (aiAnalysis.confidence > 0.7 && aiAnalysis.momentum_sustainability !== 'reversal_likely') {
      opportunities.push('High-confidence momentum continuation setup');
    }
    
    if (correlationData.institutional.flowDirection === 'buying' && anomaly.priceChange > 0) {
      opportunities.push('Institutional backing suggests sustained upward pressure');
    }
    
    return opportunities;
  }

  /**
   * Utility methods
   */
  private calculateDataCompleteness(correlationData: CorrelationData): number {
    let completeness = 0;
    let totalCategories = 7;
    
    if (correlationData.news.length > 0) completeness++;
    if (correlationData.social.mentions > 0) completeness++;
    if (correlationData.insider.length > 0) completeness++;
    if (correlationData.options.largestTrades.length > 0) completeness++;
    if (correlationData.institutional.blockTrades.length > 0) completeness++;
    if (correlationData.technical.keyLevelsBroken.length > 0) completeness++;
    if (correlationData.macro.correlatedMovements.length > 0) completeness++;
    
    return completeness / totalCategories;
  }

  private validateAndEnhanceAnalysis(analysis: any, anomaly: PriceAnomaly, correlationData: CorrelationData): any {
    // Ensure all required fields are present
    const requiredFields = ['explanation', 'confidence', 'primary_catalyst', 'contributing_factors', 'follow_up_signals'];
    for (const field of requiredFields) {
      if (!analysis[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate confidence score
    analysis.confidence = this.clamp(analysis.confidence, 0, 1);

    // Add defaults for optional fields
    if (!analysis.market_structure_effects) analysis.market_structure_effects = [];
    if (!analysis.hidden_catalyst_likelihood) analysis.hidden_catalyst_likelihood = 0.3;
    if (!analysis.momentum_sustainability) analysis.momentum_sustainability = 'days';

    return analysis;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Cache and retrieval methods
   */
  private async cacheExplanation(cacheKey: string, explanation: AnomalyExplanation): Promise<void> {
    try {
      await redisClient.setex(cacheKey, this.cacheTimeout, JSON.stringify(explanation));
      loggerUtils.aiLogger.debug('Anomaly explanation cached', { cacheKey });
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to cache anomaly explanation', {
        cacheKey,
        error: (error as Error).message,
      });
    }
  }

  private async getCachedExplanation(cacheKey: string): Promise<AnomalyExplanation | null> {
    try {
      const cached = await redisClient.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to retrieve cached explanation', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private generateCacheKey(anomaly: PriceAnomaly): string {
    const timeWindow = Math.floor(anomaly.timestamp / (1000 * 60 * 30)); // 30-minute windows
    return `anomaly:${anomaly.symbol}:${timeWindow}:${Math.abs(anomaly.priceChange * 100).toFixed(0)}`;
  }

  private getFallbackExplanation(anomaly: PriceAnomaly, correlationData: CorrelationData, processingTime: number): AnomalyExplanation {
    loggerUtils.aiLogger.info('Using fallback anomaly explanation', {
      symbol: anomaly.symbol,
      priceChange: anomaly.priceChange,
    });

    return {
      symbol: anomaly.symbol,
      timestamp: Date.now(),
      anomaly,
      analysis: {
        explanation: `${anomaly.symbol} experienced a ${Math.abs(anomaly.priceChange).toFixed(1)}% ${anomaly.priceChange > 0 ? 'increase' : 'decrease'} with ${anomaly.volumeRatio.toFixed(1)}x normal volume. Analysis system encountered limitations.`,
        confidence: 0.3,
        primary_catalyst: 'Unknown - analysis unavailable',
        contributing_factors: ['System limitations', 'Insufficient data processing'],
        follow_up_signals: ['Monitor for additional news', 'Watch volume patterns'],
        market_structure_effects: [],
      },
      causality: {
        likely_triggers: [],
        cascade_effects: [],
        feedback_loops: [],
      },
      hidden_catalysts: {
        detected: false,
        potential_sources: [],
        investigation_areas: [],
        confidence_level: 'low',
      },
      microstructure: {
        order_flow_analysis: 'Analysis unavailable',
        liquidity_impact: 'Assessment unavailable',
        algorithmic_influence: 'Detection unavailable',
        institutional_fingerprints: [],
      },
      predictions: {
        momentum_sustainability: 'days',
        key_levels_to_watch: [],
        risk_factors: ['Analysis uncertainty'],
        opportunity_signals: [],
      },
      metadata: {
        processing_time: processingTime,
        data_completeness: this.calculateDataCompleteness(correlationData),
        investigation_depth: 'surface',
        model_confidence: 0.3,
      }
    };
  }

  private logAnomalyAnalysis(result: AnomalyExplanation): void {
    loggerUtils.aiLogger.info('Anomaly explanation completed', {
      symbol: result.symbol,
      price_change: result.anomaly.priceChange,
      volume_ratio: result.anomaly.volumeRatio,
      primary_catalyst: result.analysis.primary_catalyst,
      confidence: result.analysis.confidence,
      hidden_catalysts_detected: result.hidden_catalysts.detected,
      investigation_depth: result.metadata.investigation_depth,
      data_completeness: result.metadata.data_completeness,
      processing_time: result.metadata.processing_time,
      contributing_factors_count: result.analysis.contributing_factors.length,
      follow_up_signals_count: result.analysis.follow_up_signals.length,
    });

    // Log hidden catalyst detection separately for monitoring
    if (result.hidden_catalysts.detected) {
      loggerUtils.aiLogger.warn('Hidden catalyst detected', {
        symbol: result.symbol,
        confidence_level: result.hidden_catalysts.confidence_level,
        potential_sources: result.hidden_catalysts.potential_sources,
        investigation_areas: result.hidden_catalysts.investigation_areas,
      });
    }
  }

  /**
   * Batch analyze multiple anomalies
   */
  async batchExplainAnomalies(requests: Array<{ anomaly: PriceAnomaly; correlationData: CorrelationData }>): Promise<AnomalyExplanation[]> {
    const results: AnomalyExplanation[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 2; // Smaller batches for complex analysis
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchPromises = batch.map(req => this.explainAnomaly(req.anomaly, req.correlationData));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          loggerUtils.aiLogger.error('Batch anomaly explanation failed', {
            symbol: batch[index].anomaly.symbol,
            error: result.reason,
          });
          
          // Add fallback explanation for failed symbol
          results.push(this.getFallbackExplanation(batch[index].anomaly, batch[index].correlationData, 0));
        }
      });
      
      // Add delay between batches
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return results;
  }

  /**
   * Get anomaly alerts for monitoring
   */
  getAnomalyAlerts(explanations: AnomalyExplanation[]): Array<{
    symbol: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: string;
    message: string;
    confidence: number;
  }> {
    return explanations
      .filter(exp => exp.analysis.confidence > 0.5 || exp.hidden_catalysts.detected)
      .map(exp => {
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        
        if (exp.hidden_catalysts.detected && exp.hidden_catalysts.confidence_level === 'high') {
          severity = 'critical';
        } else if (Math.abs(exp.anomaly.priceChange) > 0.15) {
          severity = 'high';
        } else if (exp.anomaly.volumeRatio > 10) {
          severity = 'medium';
        }

        return {
          symbol: exp.symbol,
          severity,
          type: exp.hidden_catalysts.detected ? 'Hidden Catalyst' : 'Market Anomaly',
          message: exp.analysis.explanation,
          confidence: exp.analysis.confidence,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);
  }
}

export default AnomalyExplainer;
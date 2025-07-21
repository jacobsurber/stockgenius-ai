/**
 * Risk Assessor AI Module
 * Uses GPT-4-turbo for multi-dimensional risk classification
 */

import { openAIClient } from '../../config/openai.js';
import { redisClientInstance as redisClient } from '../../config/redis.js';
import { loggerUtils } from '../../config/logger.js';
import { DataHub } from '../../api/DataHub.js';

export interface RiskAssessmentInput {
  symbol: string;
  timeHorizon: string; // e.g., "1-3 days", "1-2 weeks"
  positionSize?: number; // Intended position size as % of portfolio
  tradeDirection: 'long' | 'short' | 'neutral';
  
  // Liquidity data
  avgDailyVolume: number;
  recentVolume5d: number;
  bidAskSpread: number;
  marketCap?: number;
  
  // Volatility data
  historicalVol30d: number;
  impliedVol?: number;
  beta?: number;
  
  // Event data
  earningsDate?: string;
  dividendDate?: string;
  fedMeetingDate?: string;
  otherEvents?: Array<{
    event: string;
    date: string;
    importance: 'low' | 'medium' | 'high';
  }>;
  
  // Technical data
  currentPrice: number;
  support?: number;
  resistance?: number;
  trendStrength?: number; // -1 to 1
  rsi?: number;
  
  // Sentiment data
  retailInterest?: number; // 0-1 scale
  institutionalFlow?: number; // Net institutional buying/selling
  shortInterest?: number;
  socialSentiment?: number; // -1 to 1
  
  // Market context
  vixLevel?: number;
  sectorPerformance?: number;
  marketTrend?: 'bullish' | 'bearish' | 'neutral';
}

export interface RiskBreakdown {
  score: number; // 0-1 scale
  reason: string;
  mitigationSuggestions?: string[];
}

export interface RiskAssessmentOutput {
  symbol: string;
  timeHorizon: string;
  timestamp: number;
  
  assessment: {
    overall_risk_score: number; // 0-1 scale
    risk_breakdown: {
      liquidity: RiskBreakdown;
      volatility: RiskBreakdown;
      event: RiskBreakdown;
      technical: RiskBreakdown;
      sentiment: RiskBreakdown;
    };
    primary_risks: string[];
    risk_mitigation: string[];
    max_position_size: number; // As % of portfolio
    risk_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  };
  
  alerts: Array<{
    type: 'warning' | 'critical';
    message: string;
    category: string;
  }>;
  
  metadata: {
    model_used: string;
    processing_time: number;
    multi_factor_risk: boolean;
    escalation_triggered: boolean;
    confidence_score: number;
  };
}

export class RiskAssessor {
  private dataHub: DataHub;
  private cacheTimeout = 1 * 60 * 60; // 1 hour in seconds
  
  // Risk thresholds
  private readonly riskThresholds = {
    multiFactor: 0.7, // Threshold for multi-factor risk alert
    critical: 0.8,    // Critical risk threshold
    warning: 0.6,     // Warning risk threshold
    maxPosition: {
      low: 0.10,      // Max 10% for low risk
      medium: 0.05,   // Max 5% for medium risk
      high: 0.02,     // Max 2% for high risk
      critical: 0.01, // Max 1% for critical risk
    }
  };

  // OpenAI function calling schema
  private readonly riskAssessmentSchema = {
    name: "assess_trading_risk",
    description: "Comprehensive multi-dimensional risk analysis for short-term trades",
    parameters: {
      type: "object",
      properties: {
        overall_risk_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Overall risk score from 0 (lowest risk) to 1 (highest risk)"
        },
        risk_breakdown: {
          type: "object",
          properties: {
            liquidity: {
              type: "object",
              properties: {
                score: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" }
              },
              required: ["score", "reason"]
            },
            volatility: {
              type: "object",
              properties: {
                score: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" }
              },
              required: ["score", "reason"]
            },
            event: {
              type: "object",
              properties: {
                score: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" }
              },
              required: ["score", "reason"]
            },
            technical: {
              type: "object",
              properties: {
                score: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" }
              },
              required: ["score", "reason"]
            },
            sentiment: {
              type: "object",
              properties: {
                score: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" }
              },
              required: ["score", "reason"]
            }
          },
          required: ["liquidity", "volatility", "event", "technical", "sentiment"]
        },
        primary_risks: {
          type: "array",
          items: { type: "string" },
          description: "Top 3-5 primary risk factors"
        },
        risk_mitigation: {
          type: "array",
          items: { type: "string" },
          description: "Specific risk mitigation strategies"
        },
        max_position_size: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Maximum recommended position size as fraction of portfolio"
        }
      },
      required: ["overall_risk_score", "risk_breakdown", "primary_risks", "max_position_size"]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main risk assessment method
   */
  async assessRisk(input: RiskAssessmentInput): Promise<RiskAssessmentOutput> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(input.symbol, input.timeHorizon);
    
    try {
      // Check cache first
      const cachedResult = await this.getCachedAssessment(cacheKey);
      if (cachedResult) {
        loggerUtils.aiLogger.info('Risk assessment cache hit', {
          symbol: input.symbol,
          timeHorizon: input.timeHorizon,
        });
        
        return {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            processing_time: Date.now() - startTime,
          }
        };
      }

      // Perform fresh risk assessment
      const assessment = await this.performRiskAssessment(input);
      
      // Generate alerts
      const alerts = this.generateRiskAlerts(assessment, input);
      
      // Check for multi-factor risks and escalation
      const multiFactor = this.checkMultiFactorRisk(assessment);
      const escalation = this.checkEscalationTriggers(assessment, input);
      
      const result: RiskAssessmentOutput = {
        symbol: input.symbol,
        timeHorizon: input.timeHorizon,
        timestamp: Date.now(),
        assessment: {
          ...assessment,
          risk_grade: this.calculateRiskGrade(assessment.overall_risk_score),
        },
        alerts,
        metadata: {
          model_used: 'gpt-4-turbo',
          processing_time: Date.now() - startTime,
          multi_factor_risk: multiFactor,
          escalation_triggered: escalation,
          confidence_score: this.calculateConfidence(assessment, input),
        }
      };

      // Cache the result
      await this.cacheAssessment(cacheKey, result);
      
      // Log the risk assessment
      this.logRiskAssessment(result, input);
      
      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Risk assessment failed', {
        symbol: input.symbol,
        timeHorizon: input.timeHorizon,
        error: (error as Error).message,
      });

      // Return conservative risk assessment
      return this.getConservativeRiskAssessment(input, Date.now() - startTime);
    }
  }

  /**
   * Perform risk assessment using GPT-4-turbo
   */
  private async performRiskAssessment(input: RiskAssessmentInput): Promise<any> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input);

    try {
      const response = await openAIClient.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: this.riskAssessmentSchema
        }],
        tool_choice: { type: 'function', function: { name: 'assess_trading_risk' } },
        temperature: 0.1,
        max_tokens: 1500,
      });

      if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        const assessment = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        return this.validateAndEnhanceAssessment(assessment, input);
      }

      throw new Error('No function call response received');
    } catch (error) {
      loggerUtils.aiLogger.error('OpenAI risk assessment failed', {
        symbol: input.symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build system prompt for risk assessment
   */
  private buildSystemPrompt(): string {
    return `You are an expert trading risk assessment AI specializing in short-term position risk analysis. Your role is to evaluate multi-dimensional trading risks across these specific categories:

RISK CATEGORIES:

1. LIQUIDITY RISK (0-1 scale):
   - Average daily volume vs position size impact
   - Bid-ask spreads and market depth
   - Market cap and float considerations
   - After-hours trading liquidity

2. VOLATILITY RISK (0-1 scale):
   - Historical volatility (30-day) analysis
   - Implied volatility from options markets
   - Beta vs market volatility
   - Volatility clustering patterns

3. EVENT RISK (0-1 scale):
   - Earnings announcements within trade window
   - FDA approvals, regulatory decisions
   - Federal Reserve meetings and policy announcements
   - Corporate actions (splits, dividends, spin-offs)
   - Industry-specific events

4. TECHNICAL RISK (0-1 scale):
   - Proximity to key support/resistance levels
   - Trend strength and momentum indicators
   - Overbought/oversold conditions (RSI)
   - Technical pattern reliability

5. SENTIMENT RISK (0-1 scale):
   - Crowded trades and consensus positioning
   - Retail vs institutional sentiment divergence
   - Social media buzz and momentum
   - Short interest and squeeze potential

ASSESSMENT PRINCIPLES:
- Be precise and data-driven in risk scoring
- Consider correlation between risk factors
- Provide actionable mitigation strategies
- Account for time horizon in risk weighting
- Flag unusual risk combinations for escalation

Respond with detailed JSON analysis using the required schema.`;
  }

  /**
   * Build user prompt with all risk data
   */
  private buildUserPrompt(input: RiskAssessmentInput): string {
    const eventsList = this.formatEvents(input);
    const technicalData = this.formatTechnicalData(input);
    const sentimentData = this.formatSentimentData(input);

    return `Analyze comprehensive trading risk for ${input.symbol} over ${input.timeHorizon} time horizon:

TRADE DETAILS:
- Symbol: ${input.symbol}
- Time Horizon: ${input.timeHorizon}
- Direction: ${input.tradeDirection}
- Intended Position Size: ${input.positionSize ? (input.positionSize * 100).toFixed(1) + '%' : 'Not specified'}

LIQUIDITY DATA:
- Average Daily Volume: ${input.avgDailyVolume.toLocaleString()} shares
- Recent 5-day Volume: ${input.recentVolume5d.toLocaleString()} shares
- Bid-Ask Spread: ${input.bidAskSpread ? (input.bidAskSpread * 100).toFixed(3) + '%' : 'Unknown'}
- Market Cap: ${input.marketCap ? '$' + (input.marketCap / 1e9).toFixed(1) + 'B' : 'Unknown'}

VOLATILITY DATA:
- Historical Volatility (30d): ${(input.historicalVol30d * 100).toFixed(1)}%
- Implied Volatility: ${input.impliedVol ? (input.impliedVol * 100).toFixed(1) + '%' : 'Unknown'}
- Beta: ${input.beta?.toFixed(2) || 'Unknown'}

EVENT DATA:
${eventsList}

TECHNICAL DATA:
${technicalData}

SENTIMENT DATA:
${sentimentData}

MARKET CONTEXT:
- VIX Level: ${input.vixLevel?.toFixed(1) || 'Unknown'}
- Sector Performance: ${input.sectorPerformance ? (input.sectorPerformance * 100).toFixed(1) + '%' : 'Unknown'}
- Market Trend: ${input.marketTrend || 'Unknown'}

Provide comprehensive risk analysis with specific risk scores for each category, primary risk factors, and actionable mitigation strategies. Consider the interaction between different risk factors and flag any unusual risk combinations.`;
  }

  /**
   * Format events data for prompt
   */
  private formatEvents(input: RiskAssessmentInput): string {
    const events: string[] = [];
    
    if (input.earningsDate) {
      const daysToEarnings = this.daysBetween(new Date(), new Date(input.earningsDate));
      events.push(`- Earnings: ${input.earningsDate} (${daysToEarnings} days away)`);
    }
    
    if (input.dividendDate) {
      const daysToDividend = this.daysBetween(new Date(), new Date(input.dividendDate));
      events.push(`- Dividend: ${input.dividendDate} (${daysToDividend} days away)`);
    }
    
    if (input.fedMeetingDate) {
      const daysToFed = this.daysBetween(new Date(), new Date(input.fedMeetingDate));
      events.push(`- Fed Meeting: ${input.fedMeetingDate} (${daysToFed} days away)`);
    }
    
    if (input.otherEvents?.length) {
      input.otherEvents.forEach(event => {
        const daysToEvent = this.daysBetween(new Date(), new Date(event.date));
        events.push(`- ${event.event}: ${event.date} (${daysToEvent} days away, ${event.importance} importance)`);
      });
    }
    
    return events.length > 0 ? events.join('\n') : '- No major events identified in trade window';
  }

  /**
   * Format technical data for prompt
   */
  private formatTechnicalData(input: RiskAssessmentInput): string {
    const data: string[] = [];
    
    data.push(`- Current Price: $${input.currentPrice.toFixed(2)}`);
    
    if (input.support) {
      const supportDistance = ((input.currentPrice - input.support) / input.currentPrice * 100);
      data.push(`- Support Level: $${input.support.toFixed(2)} (${supportDistance.toFixed(1)}% below)`);
    }
    
    if (input.resistance) {
      const resistanceDistance = ((input.resistance - input.currentPrice) / input.currentPrice * 100);
      data.push(`- Resistance Level: $${input.resistance.toFixed(2)} (${resistanceDistance.toFixed(1)}% above)`);
    }
    
    if (input.trendStrength !== undefined) {
      const trendDesc = input.trendStrength > 0.3 ? 'Strong Uptrend' : 
                      input.trendStrength < -0.3 ? 'Strong Downtrend' : 'Sideways/Weak Trend';
      data.push(`- Trend Strength: ${input.trendStrength.toFixed(2)} (${trendDesc})`);
    }
    
    if (input.rsi) {
      const rsiDesc = input.rsi > 70 ? 'Overbought' : input.rsi < 30 ? 'Oversold' : 'Neutral';
      data.push(`- RSI: ${input.rsi.toFixed(1)} (${rsiDesc})`);
    }
    
    return data.join('\n');
  }

  /**
   * Format sentiment data for prompt
   */
  private formatSentimentData(input: RiskAssessmentInput): string {
    const data: string[] = [];
    
    if (input.retailInterest !== undefined) {
      const retailDesc = input.retailInterest > 0.7 ? 'Very High' : 
                        input.retailInterest > 0.4 ? 'Moderate' : 'Low';
      data.push(`- Retail Interest: ${(input.retailInterest * 100).toFixed(0)}% (${retailDesc})`);
    }
    
    if (input.institutionalFlow !== undefined) {
      const flowDesc = input.institutionalFlow > 0 ? 'Net Buying' : 'Net Selling';
      data.push(`- Institutional Flow: ${flowDesc} ($${Math.abs(input.institutionalFlow).toFixed(1)}M)`);
    }
    
    if (input.shortInterest !== undefined) {
      data.push(`- Short Interest: ${(input.shortInterest * 100).toFixed(1)}% of float`);
    }
    
    if (input.socialSentiment !== undefined) {
      const sentimentDesc = input.socialSentiment > 0.3 ? 'Bullish' : 
                           input.socialSentiment < -0.3 ? 'Bearish' : 'Neutral';
      data.push(`- Social Sentiment: ${input.socialSentiment.toFixed(2)} (${sentimentDesc})`);
    }
    
    return data.length > 0 ? data.join('\n') : '- Limited sentiment data available';
  }

  /**
   * Validate and enhance assessment output
   */
  private validateAndEnhanceAssessment(assessment: any, input: RiskAssessmentInput): any {
    // Validate all required fields
    const requiredFields = ['overall_risk_score', 'risk_breakdown', 'primary_risks', 'max_position_size'];
    for (const field of requiredFields) {
      if (!assessment[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate risk breakdown structure
    const riskCategories = ['liquidity', 'volatility', 'event', 'technical', 'sentiment'];
    for (const category of riskCategories) {
      if (!assessment.risk_breakdown[category]) {
        throw new Error(`Missing risk category: ${category}`);
      }
      
      // Ensure scores are within bounds
      assessment.risk_breakdown[category].score = this.clamp(
        assessment.risk_breakdown[category].score, 0, 1
      );
    }

    // Validate overall risk score
    assessment.overall_risk_score = this.clamp(assessment.overall_risk_score, 0, 1);
    
    // Validate position size
    assessment.max_position_size = this.clamp(assessment.max_position_size, 0, 1);

    // Add risk mitigation if missing
    if (!assessment.risk_mitigation) {
      assessment.risk_mitigation = this.generateDefaultMitigation(assessment, input);
    }

    return assessment;
  }

  /**
   * Generate default risk mitigation strategies
   */
  private generateDefaultMitigation(assessment: any, input: RiskAssessmentInput): string[] {
    const mitigation: string[] = [];
    
    if (assessment.overall_risk_score > 0.7) {
      mitigation.push('Consider significantly reducing position size');
      mitigation.push('Implement tight stop-loss orders');
    }
    
    if (assessment.risk_breakdown.liquidity.score > 0.6) {
      mitigation.push('Use limit orders to avoid market impact');
      mitigation.push('Split large orders across multiple sessions');
    }
    
    if (assessment.risk_breakdown.volatility.score > 0.7) {
      mitigation.push('Consider options strategies to hedge volatility');
      mitigation.push('Reduce position size due to high volatility');
    }
    
    if (assessment.risk_breakdown.event.score > 0.8) {
      mitigation.push('Close position before major events');
      mitigation.push('Use protective options strategies');
    }
    
    return mitigation.length > 0 ? mitigation : ['Monitor position closely', 'Maintain standard risk controls'];
  }

  /**
   * Generate risk alerts
   */
  private generateRiskAlerts(assessment: any, input: RiskAssessmentInput): Array<{
    type: 'warning' | 'critical';
    message: string;
    category: string;
  }> {
    const alerts: Array<{ type: 'warning' | 'critical'; message: string; category: string; }> = [];

    // Overall risk alerts
    if (assessment.overall_risk_score > this.riskThresholds.critical) {
      alerts.push({
        type: 'critical',
        message: `Critical risk level (${(assessment.overall_risk_score * 100).toFixed(0)}%) - Consider avoiding this trade`,
        category: 'overall'
      });
    } else if (assessment.overall_risk_score > this.riskThresholds.warning) {
      alerts.push({
        type: 'warning',
        message: `High risk level (${(assessment.overall_risk_score * 100).toFixed(0)}%) - Reduce position size and implement strict risk controls`,
        category: 'overall'
      });
    }

    // Category-specific alerts
    Object.entries(assessment.risk_breakdown).forEach(([category, data]: [string, any]) => {
      if (data.score > this.riskThresholds.critical) {
        alerts.push({
          type: 'critical',
          message: `Critical ${category} risk: ${data.reason}`,
          category
        });
      } else if (data.score > this.riskThresholds.warning) {
        alerts.push({
          type: 'warning',
          message: `High ${category} risk: ${data.reason}`,
          category
        });
      }
    });

    // Event-specific alerts
    if (input.earningsDate) {
      const daysToEarnings = this.daysBetween(new Date(), new Date(input.earningsDate));
      if (daysToEarnings <= 2) {
        alerts.push({
          type: 'critical',
          message: `Earnings announcement in ${daysToEarnings} day(s) - Extreme volatility expected`,
          category: 'event'
        });
      }
    }

    // Position size alerts
    if (input.positionSize && input.positionSize > assessment.max_position_size) {
      alerts.push({
        type: 'warning',
        message: `Intended position size (${(input.positionSize * 100).toFixed(1)}%) exceeds recommended maximum (${(assessment.max_position_size * 100).toFixed(1)}%)`,
        category: 'position_sizing'
      });
    }

    return alerts;
  }

  /**
   * Check for multi-factor risk
   */
  private checkMultiFactorRisk(assessment: any): boolean {
    const highRiskCategories = Object.values(assessment.risk_breakdown)
      .filter((category: any) => category.score > this.riskThresholds.multiFactor);
    
    return highRiskCategories.length >= 2;
  }

  /**
   * Check for escalation triggers
   */
  private checkEscalationTriggers(assessment: any, input: RiskAssessmentInput): boolean {
    // Multiple critical risk factors
    const criticalRisks = Object.values(assessment.risk_breakdown)
      .filter((category: any) => category.score > this.riskThresholds.critical);
    
    if (criticalRisks.length >= 2) return true;

    // Extreme overall risk
    if (assessment.overall_risk_score > 0.9) return true;

    // Large position size with high risk
    if (input.positionSize && input.positionSize > 0.05 && assessment.overall_risk_score > 0.7) return true;

    // Imminent high-impact events
    if (input.earningsDate) {
      const daysToEarnings = this.daysBetween(new Date(), new Date(input.earningsDate));
      if (daysToEarnings <= 1 && assessment.risk_breakdown.event.score > 0.8) return true;
    }

    return false;
  }

  /**
   * Calculate risk grade
   */
  private calculateRiskGrade(riskScore: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (riskScore <= 0.2) return 'A';
    if (riskScore <= 0.4) return 'B';
    if (riskScore <= 0.6) return 'C';
    if (riskScore <= 0.8) return 'D';
    return 'F';
  }

  /**
   * Calculate confidence in assessment
   */
  private calculateConfidence(assessment: any, input: RiskAssessmentInput): number {
    let confidence = 0.5; // Base confidence
    
    // Data completeness factor
    const dataFields = [
      input.avgDailyVolume > 0,
      input.historicalVol30d > 0,
      input.impliedVol !== undefined,
      input.earningsDate !== undefined,
      input.support !== undefined,
      input.resistance !== undefined,
      input.retailInterest !== undefined,
      input.institutionalFlow !== undefined,
    ];
    
    const completeness = dataFields.filter(Boolean).length / dataFields.length;
    confidence += completeness * 0.3;
    
    // Risk consistency factor
    const riskScores = Object.values(assessment.risk_breakdown).map((cat: any) => cat.score);
    const avgRisk = riskScores.reduce((sum: number, score: number) => sum + score, 0) / riskScores.length;
    const consistency = 1 - Math.abs(assessment.overall_risk_score - avgRisk);
    confidence += consistency * 0.2;
    
    return this.clamp(confidence, 0, 1);
  }

  /**
   * Cache assessment results
   */
  private async cacheAssessment(cacheKey: string, assessment: RiskAssessmentOutput): Promise<void> {
    try {
      const client = redisClient();
      if (client) {
        await client.setex(cacheKey, this.cacheTimeout, JSON.stringify(assessment));
        loggerUtils.aiLogger.debug('Risk assessment cached', { cacheKey });
      }
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to cache risk assessment', {
        cacheKey,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get cached assessment
   */
  private async getCachedAssessment(cacheKey: string): Promise<RiskAssessmentOutput | null> {
    try {
      const client = redisClient();
      if (client) {
        const cached = await client.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
      }
      return null;
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to retrieve cached assessment', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(symbol: string, timeHorizon: string): string {
    const hour = Math.floor(Date.now() / (1000 * 60 * 60)); // Current hour
    return `risk:${symbol}:${timeHorizon}:${hour}`;
  }

  /**
   * Get conservative risk assessment when AI fails
   */
  private getConservativeRiskAssessment(input: RiskAssessmentInput, processingTime: number): RiskAssessmentOutput {
    loggerUtils.aiLogger.info('Using conservative risk assessment fallback', {
      symbol: input.symbol,
      timeHorizon: input.timeHorizon,
    });

    // Conservative risk scoring
    const conservativeScore = 0.8; // High risk by default
    
    return {
      symbol: input.symbol,
      timeHorizon: input.timeHorizon,
      timestamp: Date.now(),
      assessment: {
        overall_risk_score: conservativeScore,
        risk_breakdown: {
          liquidity: { score: 0.7, reason: 'Conservative assessment - insufficient data' },
          volatility: { score: 0.8, reason: 'Conservative assessment - assume high volatility' },
          event: { score: 0.7, reason: 'Conservative assessment - potential unknown events' },
          technical: { score: 0.6, reason: 'Conservative assessment - limited technical data' },
          sentiment: { score: 0.7, reason: 'Conservative assessment - sentiment uncertainty' },
        },
        primary_risks: ['Data uncertainty', 'Model unavailability', 'Conservative estimate'],
        risk_mitigation: ['Use minimum position size', 'Implement tight stops', 'Monitor closely'],
        max_position_size: 0.01, // Very conservative 1%
        risk_grade: 'D' as const,
      },
      alerts: [
        {
          type: 'critical' as const,
          message: 'Risk assessment model unavailable - using conservative estimates',
          category: 'system'
        }
      ],
      metadata: {
        model_used: 'conservative_fallback',
        processing_time: processingTime,
        multi_factor_risk: true,
        escalation_triggered: true,
        confidence_score: 0.2,
      }
    };
  }

  /**
   * Log risk assessment for audit trail
   */
  private logRiskAssessment(result: RiskAssessmentOutput, input: RiskAssessmentInput): void {
    loggerUtils.aiLogger.info('Risk assessment completed', {
      symbol: result.symbol,
      timeHorizon: result.timeHorizon,
      timestamp: result.timestamp,
      overall_risk_score: result.assessment.overall_risk_score,
      risk_grade: result.assessment.risk_grade,
      max_position_size: result.assessment.max_position_size,
      multi_factor_risk: result.metadata.multi_factor_risk,
      escalation_triggered: result.metadata.escalation_triggered,
      confidence_score: result.metadata.confidence_score,
      processing_time: result.metadata.processing_time,
      alerts_count: result.alerts.length,
      primary_risks: result.assessment.primary_risks,
      risk_breakdown: Object.fromEntries(
        Object.entries(result.assessment.risk_breakdown).map(([key, value]) => [key, value.score])
      ),
      intended_position_size: input.positionSize,
      trade_direction: input.tradeDirection,
    });

    // Log escalation separately for monitoring
    if (result.metadata.escalation_triggered) {
      loggerUtils.aiLogger.warn('Risk escalation triggered', {
        symbol: result.symbol,
        overall_risk_score: result.assessment.overall_risk_score,
        critical_alerts: result.alerts.filter(alert => alert.type === 'critical'),
        multi_factor_risk: result.metadata.multi_factor_risk,
      });
    }
  }

  /**
   * Utility functions
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private daysBetween(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Batch risk assessment for multiple positions
   */
  async batchAssessRisk(inputs: RiskAssessmentInput[]): Promise<RiskAssessmentOutput[]> {
    const results: RiskAssessmentOutput[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(input => this.assessRisk(input));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          loggerUtils.aiLogger.error('Batch risk assessment failed', {
            symbol: batch[index].symbol,
            error: result.reason,
          });
          
          // Add conservative assessment for failed symbol
          results.push(this.getConservativeRiskAssessment(batch[index], 0));
        }
      });
      
      // Add delay between batches
      if (i + batchSize < inputs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Get portfolio-level risk metrics
   */
  async getPortfolioRisk(positions: Array<{
    symbol: string;
    positionSize: number;
    riskAssessment: RiskAssessmentOutput;
  }>): Promise<{
    portfolioRiskScore: number;
    concentrationRisk: number;
    correlationRisk: number;
    recommendations: string[];
  }> {
    const totalRisk = positions.reduce((sum, pos) => 
      sum + (pos.riskAssessment.assessment.overall_risk_score * pos.positionSize), 0
    );
    
    const totalPosition = positions.reduce((sum, pos) => sum + pos.positionSize, 0);
    const portfolioRiskScore = totalPosition > 0 ? totalRisk / totalPosition : 0;
    
    // Calculate concentration risk
    const maxPosition = Math.max(...positions.map(pos => pos.positionSize));
    const concentrationRisk = maxPosition;
    
    // Simple correlation risk estimate (would need actual correlation data)
    const highRiskPositions = positions.filter(pos => 
      pos.riskAssessment.assessment.overall_risk_score > 0.7
    ).length;
    const correlationRisk = highRiskPositions / positions.length;
    
    const recommendations: string[] = [];
    if (portfolioRiskScore > 0.7) recommendations.push('Reduce overall portfolio risk');
    if (concentrationRisk > 0.1) recommendations.push('Reduce position concentration');
    if (correlationRisk > 0.5) recommendations.push('Diversify away from high-risk positions');
    
    return {
      portfolioRiskScore,
      concentrationRisk,
      correlationRisk,
      recommendations,
    };
  }
}

export default RiskAssessor;
/**
 * Trade Validator AI Module
 * Uses GPT-4-turbo for consistency checking, hallucination detection, and trade logic validation
 */

import { openAIClient } from '../config/openai.js';
import { redisClientInstance as redisClient } from '../config/redis.js';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';

// Import types from Strategic Fusion
import { TradeCard, ModuleInputs } from './StrategicFusion.js';

export interface ValidationCriteria {
  // Signal consistency checks
  signal_evidence_alignment: boolean;
  risk_reward_rationality: boolean;
  timing_logic_consistency: boolean;
  price_target_realism: boolean;
  
  // Technical validation
  technical_feasibility: boolean;
  historical_precedent: boolean;
  market_context_alignment: boolean;
  
  // Logic consistency
  internal_contradiction_check: boolean;
  catalyst_timing_alignment: boolean;
  confirmation_signal_validity: boolean;
}

export interface ValidationIssue {
  category: 'signal_mismatch' | 'logic_error' | 'unrealistic_target' | 'timing_inconsistency' | 'risk_miscalculation' | 'hallucination';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string;
  suggestion: string;
}

export interface ValidationInput {
  tradeCard: TradeCard;
  moduleInputs: ModuleInputs;
  marketData: {
    currentPrice: number;
    avgDailyVolume: number;
    avgTrueRange: number; // 14-day ATR
    historicalMoves: {
      day1: number[];
      day3: number[];
      week1: number[];
    };
    supportLevels: number[];
    resistanceLevels: number[];
  };
  validationSettings: {
    strictness: 'permissive' | 'standard' | 'strict';
    hallucinationThreshold: number; // 0-1 scale
    rejectThreshold: number; // Minimum validation score to pass
  };
}

export interface ValidationOutput {
  tradeId: string;
  symbol: string;
  timestamp: number;
  
  validation_result: {
    passed: boolean;
    validation_score: number; // 0-1 scale
    confidence_score: number; // AI confidence in validation
    recommendation: 'approve' | 'approve_with_caution' | 'revise' | 'reject';
  };
  
  criteria_assessment: ValidationCriteria;
  
  identified_issues: ValidationIssue[];
  
  evidence_analysis: {
    signal_support_strength: number; // How well trade is supported by input signals
    contradictory_evidence: string[];
    missing_evidence: string[];
    overfitting_indicators: string[];
  };
  
  logic_consistency: {
    price_target_analysis: {
      target_vs_current: number; // % difference
      target_vs_avg_move: number; // Target vs historical average moves
      reachability_score: number; // 0-1 probability target is reachable
    };
    timing_analysis: {
      catalyst_timeline_match: boolean;
      urgency_consistency: boolean;
      time_horizon_realism: boolean;
    };
    risk_analysis: {
      risk_grade_justification: string;
      position_size_appropriateness: number; // 0-1 scale
      stop_loss_logic: string;
    };
  };
  
  improvement_suggestions: {
    signal_integration: string[];
    logic_refinement: string[];
    prompt_optimization: string[];
  };
  
  metadata: {
    model_used: string;
    processing_time: number;
    validation_version: string;
    cross_check_results: Record<string, boolean>;
  };
}

export interface PromptFeedback {
  prompt_category: 'sector_analysis' | 'risk_assessment' | 'technical_timing' | 'sentiment_analysis' | 'earnings_drift' | 'strategic_fusion';
  issues_detected: string[];
  suggested_improvements: string[];
  confidence_impact: number; // How much issues affect confidence
}

export class TradeValidator {
  private dataHub: DataHub;
  private cacheTimeout = 15 * 60; // 15 minutes in seconds
  
  // Validation thresholds and parameters
  private readonly validationThresholds = {
    minValidationScore: 0.70, // Minimum score to pass validation
    maxPriceTargetRatio: 0.15, // Max 15% target vs current price
    maxRiskRewardDeviation: 0.30, // Max 30% deviation from historical patterns
    hallucinationDetectionThreshold: 0.80, // Threshold for hallucination detection
  };

  // Historical move analysis parameters
  private readonly moveAnalysisParams = {
    minHistoricalSamples: 10, // Minimum historical data points
    outlierThreshold: 2.0, // Standard deviations for outlier detection
    seasonalAdjustment: true, // Account for seasonal patterns
  };

  // OpenAI function calling schema for validation
  private readonly validationSchema = {
    name: "validate_trade_recommendation",
    description: "Comprehensive validation of trade recommendation logic and consistency",
    parameters: {
      type: "object",
      properties: {
        validation_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Overall validation score based on logic consistency and evidence support"
        },
        confidence_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence in the validation assessment itself"
        },
        recommendation: {
          type: "string",
          enum: ["approve", "approve_with_caution", "revise", "reject"],
          description: "Final recommendation for the trade"
        },
        signal_evidence_alignment: {
          type: "boolean",
          description: "Whether trade rationale aligns with input signal evidence"
        },
        risk_reward_rationality: {
          type: "boolean",
          description: "Whether risk/reward assessment is rational and well-supported"
        },
        timing_logic_consistency: {
          type: "boolean",
          description: "Whether timing elements are internally consistent"
        },
        price_target_realism: {
          type: "boolean",
          description: "Whether price targets are realistic given historical data"
        },
        technical_feasibility: {
          type: "boolean",
          description: "Whether trade is technically feasible given market conditions"
        },
        historical_precedent: {
          type: "boolean",
          description: "Whether similar setups have historical precedent"
        },
        internal_contradiction_check: {
          type: "boolean",
          description: "Whether trade contains internal logical contradictions"
        },
        catalyst_timing_alignment: {
          type: "boolean",
          description: "Whether catalysts align with stated timing"
        },
        identified_issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: ["signal_mismatch", "logic_error", "unrealistic_target", "timing_inconsistency", "risk_miscalculation", "hallucination"]
              },
              severity: {
                type: "string",
                enum: ["low", "medium", "high", "critical"]
              },
              description: {
                type: "string"
              },
              evidence: {
                type: "string"
              },
              suggestion: {
                type: "string"
              }
            },
            required: ["category", "severity", "description", "evidence", "suggestion"]
          },
          description: "List of validation issues found"
        },
        contradictory_evidence: {
          type: "array",
          items: { type: "string" },
          description: "Evidence that contradicts the trade thesis"
        },
        missing_evidence: {
          type: "array",
          items: { type: "string" },
          description: "Critical evidence missing from the analysis"
        },
        overfitting_indicators: {
          type: "array",
          items: { type: "string" },
          description: "Signs that the analysis may be overfitted to recent data"
        },
        signal_integration_improvements: {
          type: "array",
          items: { type: "string" },
          description: "Suggestions for better signal integration"
        },
        logic_refinement_suggestions: {
          type: "array",
          items: { type: "string" },
          description: "Suggestions for improving logical consistency"
        },
        prompt_optimization_feedback: {
          type: "array",
          items: { type: "string" },
          description: "Feedback for improving AI prompts"
        }
      },
      required: [
        "validation_score", "confidence_score", "recommendation",
        "signal_evidence_alignment", "risk_reward_rationality", "timing_logic_consistency",
        "price_target_realism", "technical_feasibility", "historical_precedent",
        "internal_contradiction_check", "catalyst_timing_alignment", "identified_issues"
      ]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main validation method for trade recommendations
   */
  async validateTrade(input: ValidationInput): Promise<ValidationOutput> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(input.tradeCard.id, input.validationSettings.strictness);
    
    try {
      loggerUtils.aiLogger.info('Starting trade validation', {
        tradeId: input.tradeCard.id,
        symbol: input.tradeCard.symbol,
        strictness: input.validationSettings.strictness,
      });

      // Check cache first
      const cachedResult = await this.getCachedValidation(cacheKey);
      if (cachedResult) {
        loggerUtils.aiLogger.info('Trade validation cache hit', {
          tradeId: input.tradeCard.id,
          symbol: input.tradeCard.symbol,
        });
        
        return {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            processing_time: Date.now() - startTime,
          }
        };
      }

      // Perform pre-validation analysis
      const priceAnalysis = this.analyzePriceTargets(input);
      const timingAnalysis = this.analyzeTimingConsistency(input);
      const riskAnalysis = this.analyzeRiskAssessment(input);

      // Perform AI-powered validation
      const aiValidation = await this.performAIValidation(input, {
        priceAnalysis,
        timingAnalysis,
        riskAnalysis
      });

      // Compile validation criteria
      const criteriaAssessment = this.compileCriteriaAssessment(aiValidation);

      // Analyze evidence support
      const evidenceAnalysis = this.analyzeEvidenceSupport(input, aiValidation);

      // Perform cross-checks
      const crossCheckResults = this.performCrossChecks(input);

      // Generate improvement suggestions
      const improvementSuggestions = this.generateImprovementSuggestions(aiValidation, input);

      const result: ValidationOutput = {
        tradeId: input.tradeCard.id,
        symbol: input.tradeCard.symbol,
        timestamp: Date.now(),
        validation_result: {
          passed: aiValidation.validation_score >= input.validationSettings.rejectThreshold,
          validation_score: aiValidation.validation_score,
          confidence_score: aiValidation.confidence_score,
          recommendation: aiValidation.recommendation,
        },
        criteria_assessment: criteriaAssessment,
        identified_issues: aiValidation.identified_issues || [],
        evidence_analysis: evidenceAnalysis,
        logic_consistency: {
          price_target_analysis: priceAnalysis,
          timing_analysis: timingAnalysis,
          risk_analysis: riskAnalysis,
        },
        improvement_suggestions: improvementSuggestions,
        metadata: {
          model_used: 'gpt-4-turbo',
          processing_time: Date.now() - startTime,
          validation_version: '1.0.0',
          cross_check_results: crossCheckResults,
        }
      };

      // Cache the result
      await this.cacheValidation(cacheKey, result);
      
      // Log validation results
      this.logValidationResults(result, input);
      
      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Trade validation failed', {
        tradeId: input.tradeCard.id,
        symbol: input.tradeCard.symbol,
        error: (error as Error).message,
      });

      // Return fallback validation
      return this.getFallbackValidation(input, Date.now() - startTime);
    }
  }

  /**
   * Perform AI-powered validation using GPT-4-turbo
   */
  private async performAIValidation(input: ValidationInput, analysis: any): Promise<any> {
    const systemPrompt = this.buildValidationSystemPrompt();
    const userPrompt = this.buildValidationUserPrompt(input, analysis);

    try {
      const response = await openAIClient.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: this.validationSchema
        }],
        tool_choice: { type: 'function', function: { name: 'validate_trade_recommendation' } },
        temperature: 0.05, // Very low temperature for consistent validation
        max_tokens: 2000,
      });

      if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        const validation = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        return this.validateAndEnhanceValidation(validation, input);
      }

      throw new Error('No function call response received');
    } catch (error) {
      loggerUtils.aiLogger.error('AI validation failed', {
        tradeId: input.tradeCard.id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build system prompt for validation
   */
  private buildValidationSystemPrompt(): string {
    return `You are an expert trade validation AI responsible for ensuring the quality, consistency, and logical soundness of trading recommendations. Your role is critical - you are the final quality gate before trades are presented to users.

PRIMARY RESPONSIBILITIES:
1. Detect logical inconsistencies and internal contradictions
2. Identify potential hallucinations or unsupported claims
3. Validate that recommendations align with input signal evidence
4. Assess realism of price targets and timing expectations
5. Ensure risk assessments are appropriate and well-reasoned

VALIDATION FRAMEWORK:

SIGNAL EVIDENCE ALIGNMENT:
- Does the trade thesis logically follow from the input signals?
- Are conclusions supported by the data provided?
- Are any claims made without adequate evidence?
- Do sentiment signals match the trade direction?
- Does technical analysis support the proposed setup?

LOGICAL CONSISTENCY CHECKS:
- Are timing elements internally consistent? (e.g., "immediate" catalyst with "weeks" time horizon)
- Do risk assessments match position sizing recommendations?
- Are entry, target, and stop levels logically ordered?
- Do confirmation signals actually confirm the thesis?
- Are invalidation triggers appropriately chosen?

REALISM ASSESSMENT:
- Are price targets achievable given historical volatility?
- Is the expected timeframe realistic for the proposed move?
- Do risk/reward ratios reflect actual market behavior?
- Are catalysts likely to produce the expected impact?

HALLUCINATION DETECTION:
- Are there claims about specific data points not provided in inputs?
- Are there references to events or metrics not mentioned in source material?
- Are statistical claims (e.g., "70% success rate") supported by data?
- Are there overly specific predictions without basis?

OVERFITTING INDICATORS:
- Over-reliance on recent performance patterns
- Excessive specificity in timing predictions
- Cherry-picking supportive data while ignoring contradictions
- Assuming continuation of short-term trends

RISK ASSESSMENT VALIDATION:
- Does risk grade reflect actual identified risks?
- Is position sizing appropriate for the risk profile?
- Are stop loss levels logical and well-placed?
- Have counter-risks been adequately considered?

CRITICAL VALIDATION QUESTIONS:
1. Would an experienced trader find this recommendation logical?
2. Are the claimed catalysts likely to drive the predicted price movement?
3. Is there sufficient evidence to support the confidence level?
4. Are timing elements realistic and well-coordinated?
5. Have potential failure modes been adequately addressed?

STRICTNESS LEVELS:
- PERMISSIVE: Allow minor inconsistencies if overall thesis is sound
- STANDARD: Enforce good logical consistency and evidence support
- STRICT: Require exceptional evidence support and perfect internal logic

Your validation should be thorough, impartial, and focused on protecting users from poor recommendations while maintaining the value of good opportunities.`;
  }

  /**
   * Build user prompt with trade data and analysis
   */
  private buildValidationUserPrompt(input: ValidationInput, analysis: any): string {
    const { tradeCard, moduleInputs, marketData } = input;
    
    // Format trade recommendation for review
    const tradeDetail = `
TRADE RECOMMENDATION TO VALIDATE:
Symbol: ${tradeCard.symbol}
Trade Type: ${tradeCard.header.trade_type}
Confidence: ${(tradeCard.header.confidence * 100).toFixed(1)}%
Timeframe: ${tradeCard.header.timeframe}

TRADE NARRATIVE:
Summary: "${tradeCard.narrative.summary}"
Setup Type: ${tradeCard.narrative.setup.type}
Setup Strength: ${(tradeCard.narrative.setup.strength * 100).toFixed(1)}%
Primary Catalyst: "${tradeCard.narrative.catalyst.primary}"
Catalyst Timing: ${tradeCard.narrative.catalyst.timing_sensitivity}
Entry Window: "${tradeCard.narrative.timing.entry_window}"
Time Horizon: "${tradeCard.narrative.timing.time_horizon}"
Urgency: ${tradeCard.narrative.timing.urgency}

EXECUTION PARAMETERS:
Entry Price: $${tradeCard.execution.entry_price.toFixed(2)}
Target Price: $${tradeCard.execution.target_price.toFixed(2)}
Stop Loss: $${tradeCard.execution.stop_loss.toFixed(2)}
Position Size: ${(tradeCard.execution.position_size * 100).toFixed(1)}%
Risk/Reward: ${tradeCard.execution.risk_reward_ratio.toFixed(2)}:1
Max Loss: ${(tradeCard.execution.max_loss_percent * 100).toFixed(1)}%

SIGNAL COMPOSITION:
Technical Weight: ${(tradeCard.signal_composition.technical_weight * 100).toFixed(1)}%
Sentiment Weight: ${(tradeCard.signal_composition.sentiment_weight * 100).toFixed(1)}%
Risk Weight: ${(tradeCard.signal_composition.risk_weight * 100).toFixed(1)}%
Sector Weight: ${(tradeCard.signal_composition.sector_weight * 100).toFixed(1)}%
Anomaly Weight: ${(tradeCard.signal_composition.anomaly_weight * 100).toFixed(1)}%
Composite Score: ${(tradeCard.signal_composition.composite_score * 100).toFixed(1)}%

COUNTER-SIGNALS IDENTIFIED:
${tradeCard.counter_signals.identified ? `
- Description: ${tradeCard.counter_signals.description}
- Severity: ${tradeCard.counter_signals.severity}
- Mitigation: ${tradeCard.counter_signals.mitigation}` : 'None identified'}`;

    // Format supporting evidence
    const supportingEvidence = this.formatSupportingEvidence(moduleInputs);

    // Format market context
    const marketContext = `
MARKET DATA CONTEXT:
Current Price: $${marketData.currentPrice.toFixed(2)}
Average Daily Volume: ${marketData.avgDailyVolume.toLocaleString()}
Average True Range (14d): ${(marketData.avgTrueRange * 100).toFixed(2)}%
Support Levels: [${marketData.supportLevels.map(l => l.toFixed(2)).join(', ')}]
Resistance Levels: [${marketData.resistanceLevels.map(l => l.toFixed(2)).join(', ')}]

HISTORICAL MOVE ANALYSIS:
1-Day Moves: Min ${(Math.min(...marketData.historicalMoves.day1) * 100).toFixed(1)}%, Max ${(Math.max(...marketData.historicalMoves.day1) * 100).toFixed(1)}%, Avg ${(marketData.historicalMoves.day1.reduce((a, b) => a + b, 0) / marketData.historicalMoves.day1.length * 100).toFixed(1)}%
3-Day Moves: Min ${(Math.min(...marketData.historicalMoves.day3) * 100).toFixed(1)}%, Max ${(Math.max(...marketData.historicalMoves.day3) * 100).toFixed(1)}%, Avg ${(marketData.historicalMoves.day3.reduce((a, b) => a + b, 0) / marketData.historicalMoves.day3.length * 100).toFixed(1)}%
Weekly Moves: Min ${(Math.min(...marketData.historicalMoves.week1) * 100).toFixed(1)}%, Max ${(Math.max(...marketData.historicalMoves.week1) * 100).toFixed(1)}%, Avg ${(marketData.historicalMoves.week1.reduce((a, b) => a + b, 0) / marketData.historicalMoves.week1.length * 100).toFixed(1)}%`;

    // Format pre-analysis results
    const preAnalysis = `
PRE-VALIDATION ANALYSIS:
Price Target Analysis:
- Target vs Current: ${(analysis.priceAnalysis.target_vs_current * 100).toFixed(1)}%
- Target vs Avg Move: ${analysis.priceAnalysis.target_vs_avg_move.toFixed(2)}x historical average
- Reachability Score: ${(analysis.priceAnalysis.reachability_score * 100).toFixed(1)}%

Timing Analysis:
- Catalyst Timeline Match: ${analysis.timingAnalysis.catalyst_timeline_match ? 'Yes' : 'No'}
- Urgency Consistency: ${analysis.timingAnalysis.urgency_consistency ? 'Yes' : 'No'}
- Time Horizon Realism: ${analysis.timingAnalysis.time_horizon_realism ? 'Yes' : 'No'}

Risk Analysis:
- Position Size Appropriateness: ${(analysis.riskAnalysis.position_size_appropriateness * 100).toFixed(1)}%
- Risk Grade Justification: "${analysis.riskAnalysis.risk_grade_justification}"`;

    return `Please validate this trade recommendation using ${input.validationSettings.strictness} validation criteria:

${tradeDetail}

${supportingEvidence}

${marketContext}

${preAnalysis}

VALIDATION REQUIREMENTS:
1. Check if trade rationale aligns with input signal evidence
2. Verify internal logic consistency (timing, pricing, risk assessment)
3. Assess realism of price targets given historical data
4. Identify any potential hallucinations or unsupported claims
5. Look for overfitting to recent data or cherry-picked evidence
6. Evaluate whether catalysts can reasonably drive expected moves
7. Check if risk assessment matches actual identified risks
8. Verify that confirmation signals would actually confirm the thesis

SPECIFIC CHECKS REQUIRED:
- Does the ${(tradeCard.execution.target_price - marketData.currentPrice) / marketData.currentPrice * 100 > 0 ? 'upward' : 'downward'} target of ${((tradeCard.execution.target_price - marketData.currentPrice) / marketData.currentPrice * 100).toFixed(1)}% align with typical ${tradeCard.header.timeframe} moves?
- Are the catalyst timing (${tradeCard.narrative.catalyst.timing_sensitivity}) and trade urgency (${tradeCard.narrative.timing.urgency}) consistent?
- Does the risk grade "${tradeCard.narrative.risk.risk_grade}" match the ${(tradeCard.execution.position_size * 100).toFixed(1)}% position sizing?
- Are the confluence factors actually confluent or just loosely related?

Provide a thorough validation with specific issues identified and actionable improvement suggestions.`;
  }

  /**
   * Format supporting evidence from all modules
   */
  private formatSupportingEvidence(moduleInputs: ModuleInputs): string {
    let evidence = 'SUPPORTING EVIDENCE FROM AI MODULES:\n';

    if (moduleInputs.technical) {
      evidence += `\nTechnical Analysis:
- Setup: ${moduleInputs.technical.analysis.setup_type}
- Confidence: ${(moduleInputs.technical.analysis.confidence * 100).toFixed(0)}%
- Entry: $${moduleInputs.technical.analysis.entry_price.toFixed(2)}
- Target: $${moduleInputs.technical.analysis.primary_exit.toFixed(2)}
- Stop: $${moduleInputs.technical.analysis.stop_loss.toFixed(2)}
- R/R: ${moduleInputs.technical.analysis.risk_reward_ratio.toFixed(2)}:1`;
    }

    if (moduleInputs.sector) {
      evidence += `\nSector Intelligence:
- Sector: ${moduleInputs.sector.sector}
- Rotation Signal: ${moduleInputs.sector.analysis.sector_rotation_signal}
- Relative Strength: ${(moduleInputs.sector.analysis.peer_performance.relative_strength * 100).toFixed(0)}%
- Drivers: ${moduleInputs.sector.analysis.drivers.slice(0, 3).join(', ')}`;
    }

    if (moduleInputs.risk) {
      evidence += `\nRisk Assessment:
- Overall Risk: ${(moduleInputs.risk.assessment.overall_risk_score * 100).toFixed(0)}%
- Risk Grade: ${moduleInputs.risk.assessment.risk_grade}
- Max Position: ${(moduleInputs.risk.assessment.max_position_size * 100).toFixed(1)}%
- Primary Risks: ${moduleInputs.risk.assessment.primary_risks.slice(0, 2).join(', ')}`;
    }

    if (moduleInputs.reddit) {
      evidence += `\nSentiment Analysis:
- Authenticity: ${(moduleInputs.reddit.authenticity.overall_score * 100).toFixed(0)}%
- Momentum Type: ${moduleInputs.reddit.analysis.momentum_type}
- Sentiment Trend: ${moduleInputs.reddit.analysis.sentiment_trend}
- Pump Risk: ${(moduleInputs.reddit.pump_and_dump.overall_risk * 100).toFixed(0)}%`;
    }

    if (moduleInputs.earningsDrift) {
      evidence += `\nEarnings Drift:
- Drift Probability: ${(moduleInputs.earningsDrift.analysis.drift_probability * 100).toFixed(0)}%
- Expected Move: ${(moduleInputs.earningsDrift.analysis.expected_move * 100).toFixed(1)}%
- Direction: ${moduleInputs.earningsDrift.analysis.expected_direction}
- Peak Timing: ${moduleInputs.earningsDrift.analysis.peak_drift_timing}`;
    }

    if (moduleInputs.anomaly) {
      evidence += `\nAnomaly Analysis:
- Primary Catalyst: ${moduleInputs.anomaly.investigation.primary_catalyst}
- Catalyst Confidence: ${(moduleInputs.anomaly.investigation.catalyst_confidence * 100).toFixed(0)}%
- Follow-through Probability: ${(moduleInputs.anomaly.investigation.follow_through_probability * 100).toFixed(0)}%`;
    }

    return evidence;
  }

  /**
   * Analyze price target realism
   */
  private analyzePriceTargets(input: ValidationInput): any {
    const { tradeCard, marketData } = input;
    const currentPrice = marketData.currentPrice;
    const targetPrice = tradeCard.execution.target_price;
    
    const targetVsCurrent = (targetPrice - currentPrice) / currentPrice;
    
    // Calculate average historical moves for comparison
    const timeHorizonMap = {
      'intraday': marketData.historicalMoves.day1,
      '1-2 days': marketData.historicalMoves.day1,
      '3-5 days': marketData.historicalMoves.day3,
      '1-2 weeks': marketData.historicalMoves.week1,
    };
    
    const relevantMoves = timeHorizonMap[tradeCard.header.timeframe as keyof typeof timeHorizonMap] || marketData.historicalMoves.day3;
    const avgHistoricalMove = Math.abs(relevantMoves.reduce((sum, move) => sum + move, 0) / relevantMoves.length);
    
    const targetVsAvgMove = Math.abs(targetVsCurrent) / avgHistoricalMove;
    
    // Calculate reachability score based on historical distribution
    const movesInDirection = targetVsCurrent > 0 ? 
      relevantMoves.filter(move => move > 0) : 
      relevantMoves.filter(move => move < 0);
    
    const movesReachingTarget = movesInDirection.filter(move => 
      Math.abs(move) >= Math.abs(targetVsCurrent)
    ).length;
    
    const reachabilityScore = movesInDirection.length > 0 ? 
      movesReachingTarget / movesInDirection.length : 0;

    return {
      target_vs_current: targetVsCurrent,
      target_vs_avg_move: targetVsAvgMove,
      reachability_score: reachabilityScore,
    };
  }

  /**
   * Analyze timing consistency
   */
  private analyzeTimingConsistency(input: ValidationInput): any {
    const { tradeCard } = input;
    const { catalyst, timing } = tradeCard.narrative;
    
    // Map timing sensitivity to expected durations
    const timingSensitivityMap = {
      'immediate': ['high', 'intraday', '1-2 hours'],
      'hours': ['high', 'medium', '1-2 days'],
      'days': ['medium', 'low', '3-5 days', '1-2 weeks'],
      'weeks': ['low', '1-2 weeks', '1-3 months'],
    };
    
    const expectedUrgencies = timingSensitivityMap[catalyst.timing_sensitivity as keyof typeof timingSensitivityMap] || [];
    const catalystTimelineMatch = expectedUrgencies.includes(timing.urgency) || 
                                 expectedUrgencies.includes(timing.time_horizon);
    
    // Check urgency consistency with entry window
    const urgencyConsistencyMap = {
      'high': ['Market open', 'Immediate', 'Next session', 'Current levels'],
      'medium': ['Within 1-2 days', 'Next week', 'After confirmation'],
      'low': ['Patient entry', 'When setup completes', 'No rush'],
    };
    
    const expectedEntryWindows = urgencyConsistencyMap[timing.urgency as keyof typeof urgencyConsistencyMap] || [];
    const urgencyConsistency = expectedEntryWindows.some(window => 
      timing.entry_window.toLowerCase().includes(window.toLowerCase())
    );
    
    // Check if time horizon is realistic for the setup type
    const setupTimeHorizonMap = {
      'Breakout': ['1-2 days', '3-5 days'],
      'Reversal': ['intraday', '1-2 days', '3-5 days'],
      'Momentum': ['1-2 days', '3-5 days'],
      'Earnings Play': ['intraday', '1-2 days', '3-5 days'],
      'Sector Rotation': ['1-2 weeks', '1-3 months'],
      'Anomaly Exploitation': ['intraday', '1-2 days'],
      'Mean Reversion': ['3-5 days', '1-2 weeks'],
    };
    
    const expectedTimeHorizons = setupTimeHorizonMap[tradeCard.narrative.setup.type as keyof typeof setupTimeHorizonMap] || [];
    const timeHorizonRealism = expectedTimeHorizons.includes(timing.time_horizon);

    return {
      catalyst_timeline_match: catalystTimelineMatch,
      urgency_consistency: urgencyConsistency,
      time_horizon_realism: timeHorizonRealism,
    };
  }

  /**
   * Analyze risk assessment quality
   */
  private analyzeRiskAssessment(input: ValidationInput): any {
    const { tradeCard } = input;
    const { risk } = tradeCard.narrative;
    
    // Check if position sizing matches risk grade
    const riskGradePositionMap = {
      'A': { min: 0.08, max: 0.15 }, // 8-15%
      'B': { min: 0.05, max: 0.10 }, // 5-10%
      'C': { min: 0.03, max: 0.08 },  // 3-8%
      'D': { min: 0.01, max: 0.05 },  // 1-5%
      'F': { min: 0.005, max: 0.02 }, // 0.5-2%
    };
    
    const expectedRange = riskGradePositionMap[risk.risk_grade as keyof typeof riskGradePositionMap];
    const positionSizeAppropriate = expectedRange ? 
      (tradeCard.execution.position_size >= expectedRange.min && 
       tradeCard.execution.position_size <= expectedRange.max) : false;
    
    const positionSizeAppropriateness = positionSizeAppropriate ? 1.0 : 
      Math.max(0, 1 - Math.abs(tradeCard.execution.position_size - (expectedRange?.min || 0.05)) / 0.05);

    // Analyze risk grade justification
    let riskGradeJustification = 'Standard risk assessment';
    
    if (input.moduleInputs.risk) {
      const riskScore = input.moduleInputs.risk.assessment.overall_risk_score;
      const expectedGrade = riskScore <= 0.2 ? 'A' : 
                           riskScore <= 0.4 ? 'B' : 
                           riskScore <= 0.6 ? 'C' : 
                           riskScore <= 0.8 ? 'D' : 'F';
      
      if (expectedGrade === risk.risk_grade) {
        riskGradeJustification = `Risk grade ${risk.risk_grade} matches ${(riskScore * 100).toFixed(0)}% risk score`;
      } else {
        riskGradeJustification = `Risk grade ${risk.risk_grade} may not match ${(riskScore * 100).toFixed(0)}% risk score (expected ${expectedGrade})`;
      }
    }

    return {
      risk_grade_justification: riskGradeJustification,
      position_size_appropriateness: positionSizeAppropriateness,
      stop_loss_logic: this.analyzeStopLossLogic(input),
    };
  }

  /**
   * Analyze stop loss logic
   */
  private analyzeStopLossLogic(input: ValidationInput): string {
    const { tradeCard, marketData } = input;
    const stopLoss = tradeCard.execution.stop_loss;
    const currentPrice = marketData.currentPrice;
    
    // Check if stop is below support (for long) or above resistance (for short)
    const isLong = tradeCard.execution.target_price > currentPrice;
    
    if (isLong) {
      const nearestSupport = marketData.supportLevels
        .filter(level => level < currentPrice)
        .sort((a, b) => b - a)[0]; // Highest support below current
      
      if (nearestSupport && stopLoss > nearestSupport * 0.98) {
        return `Stop loss at $${stopLoss.toFixed(2)} is above nearest support at $${nearestSupport.toFixed(2)} - may be stopped out prematurely`;
      } else if (nearestSupport) {
        return `Stop loss appropriately placed below support at $${nearestSupport.toFixed(2)}`;
      }
    } else {
      const nearestResistance = marketData.resistanceLevels
        .filter(level => level > currentPrice)
        .sort((a, b) => a - b)[0]; // Lowest resistance above current
      
      if (nearestResistance && stopLoss < nearestResistance * 1.02) {
        return `Stop loss at $${stopLoss.toFixed(2)} is below nearest resistance at $${nearestResistance.toFixed(2)} - may be stopped out prematurely`;
      } else if (nearestResistance) {
        return `Stop loss appropriately placed above resistance at $${nearestResistance.toFixed(2)}`;
      }
    }

    // Check if stop is reasonable based on ATR
    const stopDistance = Math.abs(stopLoss - currentPrice) / currentPrice;
    const atr = marketData.avgTrueRange;
    
    if (stopDistance < atr * 0.5) {
      return `Stop loss may be too tight at ${(stopDistance * 100).toFixed(1)}% vs ${(atr * 100).toFixed(1)}% ATR`;
    } else if (stopDistance > atr * 3) {
      return `Stop loss may be too wide at ${(stopDistance * 100).toFixed(1)}% vs ${(atr * 100).toFixed(1)}% ATR`;
    } else {
      return `Stop loss appropriately sized at ${(stopDistance * 100).toFixed(1)}% (${(stopDistance / atr).toFixed(1)}x ATR)`;
    }
  }

  /**
   * Compile criteria assessment from AI validation
   */
  private compileCriteriaAssessment(aiValidation: any): ValidationCriteria {
    return {
      signal_evidence_alignment: aiValidation.signal_evidence_alignment || false,
      risk_reward_rationality: aiValidation.risk_reward_rationality || false,
      timing_logic_consistency: aiValidation.timing_logic_consistency || false,
      price_target_realism: aiValidation.price_target_realism || false,
      technical_feasibility: aiValidation.technical_feasibility || false,
      historical_precedent: aiValidation.historical_precedent || false,
      market_context_alignment: true, // Would be checked separately
      internal_contradiction_check: aiValidation.internal_contradiction_check || false,
      catalyst_timing_alignment: aiValidation.catalyst_timing_alignment || false,
      confirmation_signal_validity: true, // Would be checked separately
    };
  }

  /**
   * Analyze evidence support strength
   */
  private analyzeEvidenceSupport(input: ValidationInput, aiValidation: any): any {
    const { moduleInputs, tradeCard } = input;
    
    // Calculate signal support strength
    const signals = tradeCard.signal_composition;
    const weights = [
      signals.technical_weight * 0.30,
      signals.sentiment_weight * 0.25,
      signals.risk_weight * 0.20,
      signals.sector_weight * 0.15,
      signals.anomaly_weight * 0.10,
    ];
    
    const signalSupportStrength = weights.reduce((sum, weight) => sum + weight, 0);

    return {
      signal_support_strength: signalSupportStrength,
      contradictory_evidence: aiValidation.contradictory_evidence || [],
      missing_evidence: aiValidation.missing_evidence || [],
      overfitting_indicators: aiValidation.overfitting_indicators || [],
    };
  }

  /**
   * Perform additional cross-checks
   */
  private performCrossChecks(input: ValidationInput): Record<string, boolean> {
    const { tradeCard, marketData } = input;
    
    return {
      price_order_check: this.validatePriceOrdering(tradeCard, marketData),
      risk_reward_minimum: tradeCard.execution.risk_reward_ratio >= 1.5,
      position_size_reasonable: tradeCard.execution.position_size <= 0.15,
      timeframe_consistency: this.validateTimeframeConsistency(tradeCard),
      catalyst_relevance: this.validateCatalystRelevance(tradeCard),
    };
  }

  /**
   * Validate price ordering logic
   */
  private validatePriceOrdering(tradeCard: TradeCard, marketData: any): boolean {
    const { entry_price, target_price, stop_loss } = tradeCard.execution;
    const isLong = target_price > entry_price;
    
    if (isLong) {
      return entry_price < target_price && stop_loss < entry_price;
    } else {
      return entry_price > target_price && stop_loss > entry_price;
    }
  }

  /**
   * Validate timeframe consistency
   */
  private validateTimeframeConsistency(tradeCard: TradeCard): boolean {
    const timing = tradeCard.narrative.timing;
    const catalyst = tradeCard.narrative.catalyst;
    
    // Check if timing elements are consistent
    const urgencyTimeMap = {
      'high': ['immediate', 'hours'],
      'medium': ['hours', 'days'],
      'low': ['days', 'weeks'],
    };
    
    const expectedTimingSensitivity = urgencyTimeMap[timing.urgency as keyof typeof urgencyTimeMap] || [];
    return expectedTimingSensitivity.includes(catalyst.timing_sensitivity);
  }

  /**
   * Validate catalyst relevance
   */
  private validateCatalystRelevance(tradeCard: TradeCard): boolean {
    const catalyst = tradeCard.narrative.catalyst.primary;
    const setupType = tradeCard.narrative.setup.type;
    
    // Basic relevance check - could be enhanced with more sophisticated logic
    const relevantCatalysts = {
      'Breakout': ['volume', 'resistance', 'pattern completion', 'news catalyst'],
      'Reversal': ['oversold', 'support', 'divergence', 'sentiment extreme'],
      'Earnings Play': ['earnings', 'guidance', 'surprise', 'analyst'],
      'Sector Rotation': ['sector', 'rotation', 'economic', 'policy'],
      'Anomaly Exploitation': ['unusual', 'spike', 'deviation', 'flow'],
    };
    
    const expectedCatalysts = relevantCatalysts[setupType as keyof typeof relevantCatalysts] || [];
    return expectedCatalysts.some(keyword => 
      catalyst.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Generate improvement suggestions
   */
  private generateImprovementSuggestions(aiValidation: any, input: ValidationInput): any {
    return {
      signal_integration: aiValidation.signal_integration_improvements || [],
      logic_refinement: aiValidation.logic_refinement_suggestions || [],
      prompt_optimization: aiValidation.prompt_optimization_feedback || [],
    };
  }

  /**
   * Validate and enhance AI validation output
   */
  private validateAndEnhanceValidation(validation: any, input: ValidationInput): any {
    // Ensure scores are within bounds
    validation.validation_score = this.clamp(validation.validation_score, 0, 1);
    validation.confidence_score = this.clamp(validation.confidence_score, 0, 1);
    
    // Ensure recommendation matches validation score
    if (validation.validation_score < 0.5 && validation.recommendation === 'approve') {
      validation.recommendation = 'revise';
    } else if (validation.validation_score < 0.3) {
      validation.recommendation = 'reject';
    }

    return validation;
  }

  /**
   * Cache validation results
   */
  private async cacheValidation(cacheKey: string, validation: ValidationOutput): Promise<void> {
    try {
      const client = redisClient();
      if (client) {
        await client.setex(cacheKey, this.cacheTimeout, JSON.stringify(validation));
        loggerUtils.aiLogger.debug('Trade validation cached', { cacheKey });
      }
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to cache trade validation', {
        cacheKey,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get cached validation
   */
  private async getCachedValidation(cacheKey: string): Promise<ValidationOutput | null> {
    try {
      const client = redisClient();
      if (client) {
        const cached = await client.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
      }
      return null;
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to retrieve cached validation', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(tradeId: string, strictness: string): string {
    return `validation:${tradeId}:${strictness}`;
  }

  /**
   * Get fallback validation when AI fails
   */
  private getFallbackValidation(input: ValidationInput, processingTime: number): ValidationOutput {
    loggerUtils.aiLogger.info('Using fallback trade validation', {
      tradeId: input.tradeCard.id,
      symbol: input.tradeCard.symbol,
    });

    return {
      tradeId: input.tradeCard.id,
      symbol: input.tradeCard.symbol,
      timestamp: Date.now(),
      validation_result: {
        passed: false,
        validation_score: 0.3,
        confidence_score: 0.2,
        recommendation: 'revise',
      },
      criteria_assessment: {
        signal_evidence_alignment: false,
        risk_reward_rationality: false,
        timing_logic_consistency: false,
        price_target_realism: false,
        technical_feasibility: false,
        historical_precedent: false,
        market_context_alignment: false,
        internal_contradiction_check: false,
        catalyst_timing_alignment: false,
        confirmation_signal_validity: false,
      },
      identified_issues: [{
        category: 'logic_error',
        severity: 'critical',
        description: 'Validation system unavailable',
        evidence: 'AI validation failed',
        suggestion: 'Manual review required',
      }],
      evidence_analysis: {
        signal_support_strength: 0.3,
        contradictory_evidence: ['Validation system unavailable'],
        missing_evidence: ['Complete analysis'],
        overfitting_indicators: ['Cannot assess'],
      },
      logic_consistency: {
        price_target_analysis: {
          target_vs_current: 0,
          target_vs_avg_move: 0,
          reachability_score: 0,
        },
        timing_analysis: {
          catalyst_timeline_match: false,
          urgency_consistency: false,
          time_horizon_realism: false,
        },
        risk_analysis: {
          risk_grade_justification: 'Cannot validate',
          position_size_appropriateness: 0.3,
          stop_loss_logic: 'Cannot validate',
        },
      },
      improvement_suggestions: {
        signal_integration: ['Fix validation system'],
        logic_refinement: ['Manual review required'],
        prompt_optimization: ['Restore AI functionality'],
      },
      metadata: {
        model_used: 'fallback',
        processing_time: processingTime,
        validation_version: '1.0.0',
        cross_check_results: {},
      },
    };
  }

  /**
   * Log validation results
   */
  private logValidationResults(result: ValidationOutput, input: ValidationInput): void {
    loggerUtils.aiLogger.info('Trade validation completed', {
      tradeId: result.tradeId,
      symbol: result.symbol,
      passed: result.validation_result.passed,
      validation_score: result.validation_result.validation_score,
      confidence_score: result.validation_result.confidence_score,
      recommendation: result.validation_result.recommendation,
      issues_count: result.identified_issues.length,
      critical_issues: result.identified_issues.filter(issue => issue.severity === 'critical').length,
      high_issues: result.identified_issues.filter(issue => issue.severity === 'high').length,
      processing_time: result.metadata.processing_time,
      strictness: input.validationSettings.strictness,
      signal_support_strength: result.evidence_analysis.signal_support_strength,
      overfitting_indicators: result.evidence_analysis.overfitting_indicators.length,
    });

    // Log critical issues separately
    result.identified_issues
      .filter(issue => issue.severity === 'critical' || issue.severity === 'high')
      .forEach(issue => {
        loggerUtils.aiLogger.warn('Validation issue identified', {
          tradeId: result.tradeId,
          category: issue.category,
          severity: issue.severity,
          description: issue.description,
          evidence: issue.evidence,
        });
      });
  }

  /**
   * Utility function to clamp values
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Batch validate multiple trades
   */
  async batchValidateTrades(inputs: ValidationInput[]): Promise<ValidationOutput[]> {
    const results: ValidationOutput[] = [];
    
    // Process in smaller batches to avoid overwhelming the system
    const batchSize = 3;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(input => this.validateTrade(input));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          loggerUtils.aiLogger.error('Batch validation failed', {
            tradeId: batch[index].tradeCard.id,
            error: result.reason,
          });
          
          // Add fallback validation
          results.push(this.getFallbackValidation(batch[index], 0));
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
   * Generate prompt feedback for system improvement
   */
  async generatePromptFeedback(validations: ValidationOutput[]): Promise<PromptFeedback[]> {
    const feedbackByCategory: Record<string, PromptFeedback> = {};
    
    // Analyze validation results to identify prompt improvement opportunities
    validations.forEach(validation => {
      validation.improvement_suggestions.prompt_optimization.forEach(suggestion => {
        // Extract category from suggestion or trade data
        const category = this.extractPromptCategory(suggestion, validation);
        
        if (!feedbackByCategory[category]) {
          feedbackByCategory[category] = {
            prompt_category: category as any,
            issues_detected: [],
            suggested_improvements: [],
            confidence_impact: 0,
          };
        }
        
        feedbackByCategory[category].suggested_improvements.push(suggestion);
      });
      
      // Add issues that might indicate prompt problems
      validation.identified_issues.forEach(issue => {
        if (issue.category === 'hallucination' || issue.category === 'logic_error') {
          const category = this.extractPromptCategory(issue.description, validation);
          
          if (!feedbackByCategory[category]) {
            feedbackByCategory[category] = {
              prompt_category: category as any,
              issues_detected: [],
              suggested_improvements: [],
              confidence_impact: 0,
            };
          }
          
          feedbackByCategory[category].issues_detected.push(issue.description);
          feedbackByCategory[category].confidence_impact += issue.severity === 'critical' ? 0.3 : 
                                                           issue.severity === 'high' ? 0.2 : 0.1;
        }
      });
    });

    return Object.values(feedbackByCategory);
  }

  /**
   * Extract prompt category from text
   */
  private extractPromptCategory(text: string, validation: ValidationOutput): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('technical') || lowerText.includes('chart') || lowerText.includes('indicator')) {
      return 'technical_timing';
    } else if (lowerText.includes('risk') || lowerText.includes('position') || lowerText.includes('stop')) {
      return 'risk_assessment';
    } else if (lowerText.includes('sector') || lowerText.includes('rotation')) {
      return 'sector_analysis';
    } else if (lowerText.includes('sentiment') || lowerText.includes('social') || lowerText.includes('reddit')) {
      return 'sentiment_analysis';
    } else if (lowerText.includes('earnings') || lowerText.includes('drift')) {
      return 'earnings_drift';
    } else {
      return 'strategic_fusion';
    }
  }
}

export default TradeValidator;
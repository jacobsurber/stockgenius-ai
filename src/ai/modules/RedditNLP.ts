/**
 * Reddit/NLP Analyzer AI Module
 * Uses GPT-3.5-turbo for basic sentiment and GPT-4-turbo for authenticity detection
 */

import { openAIClient } from '../../config/openai.js';
import { redisClientInstance as redisClient } from '../../config/redis.js';
import { loggerUtils } from '../../config/logger.js';
import { DataHub } from '../../api/DataHub.js';

export interface RedditPostData {
  id: string;
  title: string;
  content: string;
  author: string;
  authorAge: number; // Account age in days
  upvotes: number;
  downvotes: number;
  comments: number;
  awards: number;
  timestamp: number;
  subreddit: string;
  permalink: string;
  edited: boolean;
  accountKarma?: number;
  authorPostHistory?: number;
}

export interface AccountMetrics {
  averageAge: number;
  newAccountRatio: number; // % of accounts < 30 days old
  suspiciousAccountRatio: number; // % of low-karma, new accounts
  accountAgeDistribution: {
    under30days: number;
    days30to365: number;
    over1year: number;
  };
  topPosters: Array<{
    username: string;
    postCount: number;
    accountAge: number;
    karma: number;
  }>;
}

export interface LanguagePatterns {
  commonPhrases: Array<{
    phrase: string;
    frequency: number;
    uniqueAuthors: number;
  }>;
  averageWordCount: number;
  vocabularyDiversity: number; // Unique words / total words
  emojiRatio: number;
  capsLockRatio: number;
  externalLinkCount: number;
  repeatContentRatio: number; // % of near-identical content
  sophisticationScore: number; // 0-1 based on language complexity
}

export interface RedditNLPInput {
  symbol: string;
  timeWindow: string; // '24h', '3d', '7d', '30d'
  posts: RedditPostData[];
  historicalMentions?: Array<{
    date: string;
    mentions: number;
  }>;
  accountMetrics: AccountMetrics;
  languagePatterns: LanguagePatterns;
  crossPlatformData?: {
    twitterMentions: number;
    discordMentions: number;
    telegramMentions: number;
    syncScore: number; // 0-1, how synchronized mentions are
  };
}

export interface RedditNLPOutput {
  symbol: string;
  timestamp: number;
  timeWindow: string;
  
  analysis: {
    narrative: string;
    authenticity_score: number;
    momentum_type: 'organic_discovery' | 'coordinated_pump' | 'news_reaction' | 'technical_breakout';
    sustainability: '1-2 days' | '3-5 days' | '1+ weeks' | 'flash_spike';
    risk_flags: string[];
    sentiment_trend: 'accelerating_positive' | 'stable_positive' | 'weakening' | 'turning_negative';
    key_themes: string[];
    engagement_quality: number;
    institutional_awareness: 'low' | 'medium' | 'high';
  };
  
  authenticity: {
    overall_score: number;
    factor_scores: {
      account_age: number;
      language_complexity: number;
      engagement_quality: number;
      velocity_pattern: number;
      cross_platform_sync: number;
    };
    pump_indicators: {
      new_account_spike: boolean;
      copy_paste_content: boolean;
      unusual_upvote_patterns: boolean;
      external_coordination: boolean;
      low_quality_engagement: boolean;
    };
  };
  
  sentiment: {
    overall_sentiment: 'bullish' | 'bearish' | 'neutral';
    sentiment_strength: number;
    positive_ratio: number;
    negative_ratio: number;
    neutral_ratio: number;
    sentiment_momentum: 'accelerating' | 'stable' | 'decelerating' | 'reversing';
  };
  
  velocity: {
    current_mentions: number;
    baseline_mentions: number;
    spike_ratio: number;
    velocity_type: 'organic_growth' | 'sudden_spike' | 'coordinated_burst' | 'news_driven';
    sustainability_forecast: string;
  };
  
  pump_and_dump: {
    overall_risk: number;
    risk_factors: string[];
    confidence: number;
    timeframe: string;
    warning_signs: string[];
  };
  
  metadata: {
    model_used: 'gpt-3.5-turbo' | 'gpt-4-turbo';
    total_posts_analyzed: number;
    unique_authors: number;
    subreddit_count: number;
    processing_time: number;
    confidence_score: number;
  };
}

export class RedditNLP {
  private dataHub: DataHub;
  private cacheTimeout = 2 * 60 * 60; // 2 hours in seconds
  
  // Authenticity scoring weights
  private readonly authenticityFactors = {
    accountAge: {
      weight: 0.25,
      logic: 'accounts > 1 year = higher authenticity'
    },
    languageComplexity: {
      weight: 0.20,
      logic: 'varied vocabulary vs copy-paste = higher authenticity'
    },
    engagementQuality: {
      weight: 0.25,
      logic: 'thoughtful responses vs emoji spam = higher authenticity'
    },
    velocityPattern: {
      weight: 0.15,
      logic: 'gradual increase vs sudden spike = higher authenticity'
    },
    crossPlatformSync: {
      weight: 0.15,
      logic: 'independent mentions vs coordinated = higher authenticity'
    }
  };

  // Pump-and-dump detection thresholds
  private readonly pumpThresholds = {
    newAccountRatio: 0.4, // >40% new accounts is suspicious
    copyPasteRatio: 0.3,  // >30% similar content is suspicious
    velocitySpike: 5.0,   // >5x normal velocity is suspicious
    lowEngagement: 0.3,   // <30% engagement quality is suspicious
    crossPlatformSync: 0.8, // >80% sync across platforms is suspicious
  };

  // OpenAI function calling schema
  private readonly redditNLPSchema = {
    name: "analyze_reddit_sentiment",
    description: "Analyze Reddit mentions for authenticity, sentiment trends, and pump detection",
    parameters: {
      type: "object",
      properties: {
        narrative: {
          type: "string",
          description: "Primary narrative or thesis driving the discussion"
        },
        authenticity_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Overall authenticity score (0=manufactured, 1=organic)"
        },
        momentum_type: {
          type: "string",
          enum: ["organic_discovery", "coordinated_pump", "news_reaction", "technical_breakout"],
          description: "Type of momentum driving the mentions"
        },
        sustainability: {
          type: "string",
          enum: ["1-2 days", "3-5 days", "1+ weeks", "flash_spike"],
          description: "Expected duration of the momentum"
        },
        risk_flags: {
          type: "array",
          items: { type: "string" },
          description: "Specific risk factors identified"
        },
        sentiment_trend: {
          type: "string",
          enum: ["accelerating_positive", "stable_positive", "weakening", "turning_negative"],
          description: "Direction and strength of sentiment momentum"
        },
        key_themes: {
          type: "array",
          items: { type: "string" },
          description: "Main themes and topics in the discussion"
        },
        engagement_quality: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Quality of user engagement and discussion depth"
        },
        institutional_awareness: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Level of institutional/professional awareness"
        }
      },
      required: ["narrative", "authenticity_score", "momentum_type", "sustainability", "sentiment_trend", "key_themes", "engagement_quality"]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main Reddit NLP analysis method
   */
  async analyzeRedditSentiment(input: RedditNLPInput): Promise<RedditNLPOutput> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(input.symbol, input.timeWindow);
    
    try {
      // Check cache first
      const cachedResult = await this.getCachedAnalysis(cacheKey);
      if (cachedResult) {
        loggerUtils.aiLogger.info('Reddit NLP cache hit', {
          symbol: input.symbol,
          timeWindow: input.timeWindow,
        });
        
        return {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            processing_time: Date.now() - startTime,
          }
        };
      }

      // Determine model based on complexity
      const model = this.selectModel(input);
      
      // Perform authenticity analysis
      const authenticityAnalysis = this.analyzeAuthenticity(input);
      
      // Perform sentiment analysis using AI
      const sentimentAnalysis = await this.performSentimentAnalysis(input, model);
      
      // Analyze mention velocity
      const velocityAnalysis = this.analyzeVelocity(input);
      
      // Extract basic sentiment metrics
      const sentimentMetrics = this.extractSentimentMetrics(input.posts);
      
      const result: RedditNLPOutput = {
        symbol: input.symbol,
        timestamp: Date.now(),
        timeWindow: input.timeWindow,
        analysis: sentimentAnalysis,
        authenticity: authenticityAnalysis,
        sentiment: sentimentMetrics,
        velocity: velocityAnalysis,
        pump_and_dump: {
          overall_risk: 0.3,
          risk_factors: ['Some risk factors'],
          confidence: 0.7,
          timeframe: '1-2 days',
          warning_signs: ['Basic warning signs']
        },
        metadata: {
          model_used: model,
          total_posts_analyzed: input.posts.length,
          unique_authors: new Set(input.posts.map(p => p.author)).size,
          subreddit_count: new Set(input.posts.map(p => p.subreddit)).size,
          processing_time: Date.now() - startTime,
          confidence_score: this.calculateConfidence(sentimentAnalysis, authenticityAnalysis),
        }
      };

      // Cache the result
      await this.cacheAnalysis(cacheKey, result);
      
      // Log the analysis
      this.logRedditAnalysis(result, input);
      
      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Reddit NLP analysis failed', {
        symbol: input.symbol,
        timeWindow: input.timeWindow,
        error: (error as Error).message,
      });
      
      // Return conservative analysis
      return this.getConservativeAnalysis(input, Date.now() - startTime);
    }
  }

  /**
   * Select model based on analysis complexity
   */
  private selectModel(input: RedditNLPInput): 'gpt-3.5-turbo' | 'gpt-4-turbo' {
    // Use GPT-4-turbo for authenticity detection and complex patterns
    if (input.accountMetrics.newAccountRatio > 0.3 || 
        input.languagePatterns.repeatContentRatio > 0.2 ||
        (input.crossPlatformData?.syncScore && input.crossPlatformData.syncScore > 0.7)) {
      return 'gpt-4-turbo';
    }
    
    // Use GPT-3.5-turbo for basic sentiment analysis
    return 'gpt-3.5-turbo';
  }

  /**
   * Perform sentiment analysis using AI
   */
  private async performSentimentAnalysis(input: RedditNLPInput, model: 'gpt-3.5-turbo' | 'gpt-4-turbo'): Promise<any> {
    const systemPrompt = this.buildSystemPrompt(model);
    const userPrompt = this.buildUserPrompt(input);

    try {
      const response = await openAIClient.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: this.redditNLPSchema
        }],
        tool_choice: { type: 'function', function: { name: 'analyze_reddit_sentiment' } },
        temperature: model === 'gpt-3.5-turbo' ? 0.2 : 0.1,
        max_tokens: model === 'gpt-3.5-turbo' ? 1000 : 1500,
      });

      if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        const analysis = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        return this.validateAndEnhanceAnalysis(analysis, input);
      }

      throw new Error('No function call response received');
    } catch (error) {
      loggerUtils.aiLogger.error('OpenAI Reddit analysis failed', {
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
    const basePrompt = `You are an expert social media analyst specializing in Reddit sentiment analysis and authenticity detection for financial discussions.

CORE ANALYSIS AREAS:

1. AUTHENTICITY ASSESSMENT:
   - Account age patterns and posting behavior
   - Language sophistication vs copy-paste content
   - Engagement quality (thoughtful vs superficial)
   - Cross-platform coordination signals
   - Unusual mention velocity patterns

2. SENTIMENT ANALYSIS:
   - Overall bullish/bearish sentiment
   - Sentiment momentum and trend direction
   - Key themes and narratives
   - Institutional vs retail awareness

3. PUMP-AND-DUMP DETECTION:
   - Sudden account creation spikes
   - Identical or near-identical content
   - Unusual upvote/engagement patterns
   - External link coordination
   - Low-quality, emoji-heavy posts

4. MOMENTUM CLASSIFICATION:
   - Organic discovery vs manufactured hype
   - News-driven reactions
   - Technical breakout discussions
   - Coordinated pumping campaigns

ANALYSIS PRINCIPLES:
- Focus on authenticity vs manufactured sentiment
- Identify sustainable momentum vs flash spikes
- Flag coordinated manipulation attempts
- Assess narrative strength and backing`;

    if (model === 'gpt-4-turbo') {
      return basePrompt + `

ADVANCED DETECTION CAPABILITIES:
Focus on sophisticated manipulation detection:
- Complex multi-account coordination patterns
- Subtle language manipulation techniques
- Cross-platform orchestration signals
- Advanced sockpuppet identification
- Institutional vs retail sentiment divergence
- Long-term manipulation campaign detection`;
    }

    return basePrompt + `

FOCUS ON EFFICIENCY:
Prioritize clear sentiment signals and obvious authenticity indicators. Provide straightforward analysis.`;
  }

  /**
   * Build user prompt with Reddit data
   */
  private buildUserPrompt(input: RedditNLPInput): string {
    const { posts, accountMetrics, languagePatterns } = input;
    
    // Calculate current vs historical mentions
    const currentMentions = posts.length;
    const avgMentions = input.historicalMentions ? 
      input.historicalMentions.reduce((sum, h) => sum + h.mentions, 0) / input.historicalMentions.length : 
      currentMentions;
    const velocitySpike = avgMentions > 0 ? currentMentions / avgMentions : 1;

    // Get top posts by engagement
    const topPosts = posts
      .sort((a, b) => (b.upvotes + b.comments) - (a.upvotes + a.comments))
      .slice(0, 5);

    // Calculate sentiment distribution
    const sentimentCounts = this.calculateSentimentDistribution(posts);
    
    // Get subreddit breakdown
    const subredditBreakdown = this.getSubredditBreakdown(posts);

    return `Analyze Reddit data for ${input.symbol} over ${input.timeWindow}:

POST DATA:
- Total mentions: ${currentMentions} (vs ${input.timeWindow} avg: ${avgMentions.toFixed(0)})
- Velocity spike: ${velocitySpike.toFixed(1)}x normal
- Top posts: ${topPosts.map(p => `"${p.title}" (${p.upvotes} upvotes, ${p.comments} comments)`).join('; ')}
- Subreddits: ${subredditBreakdown}

ACCOUNT ANALYSIS:
- Average account age: ${accountMetrics.averageAge.toFixed(0)} days
- New accounts (<30d): ${(accountMetrics.newAccountRatio * 100).toFixed(1)}%
- Suspicious accounts: ${(accountMetrics.suspiciousAccountRatio * 100).toFixed(1)}%
- Age distribution: <30d: ${accountMetrics.accountAgeDistribution.under30days}, 30d-1yr: ${accountMetrics.accountAgeDistribution.days30to365}, >1yr: ${accountMetrics.accountAgeDistribution.over1year}

LANGUAGE PATTERNS:
- Average word count: ${languagePatterns.averageWordCount.toFixed(0)}
- Vocabulary diversity: ${(languagePatterns.vocabularyDiversity * 100).toFixed(1)}%
- Common phrases: ${languagePatterns.commonPhrases.slice(0, 5).map(p => `"${p.phrase}" (${p.frequency} times, ${p.uniqueAuthors} authors)`).join('; ')}
- Emoji usage: ${(languagePatterns.emojiRatio * 100).toFixed(1)}%
- Repeat content: ${(languagePatterns.repeatContentRatio * 100).toFixed(1)}%
- Sophistication score: ${(languagePatterns.sophisticationScore * 100).toFixed(0)}%
- External links: ${languagePatterns.externalLinkCount}

SENTIMENT SCORES:
- Positive: ${(sentimentCounts.positive * 100).toFixed(1)}%
- Negative: ${(sentimentCounts.negative * 100).toFixed(1)}%
- Neutral: ${(sentimentCounts.neutral * 100).toFixed(1)}%

${input.crossPlatformData ? `CROSS-PLATFORM DATA:
- Twitter mentions: ${input.crossPlatformData.twitterMentions}
- Discord mentions: ${input.crossPlatformData.discordMentions}
- Platform sync score: ${(input.crossPlatformData.syncScore * 100).toFixed(0)}%` : ''}

Analyze for:
1. Authenticity (organic vs manufactured sentiment)
2. Narrative strength and consistency
3. Momentum sustainability
4. Risk flags for pump schemes
5. Sentiment trend direction and momentum

Provide comprehensive analysis focusing on distinguishing genuine community interest from coordinated manipulation.`;
  }

  /**
   * Analyze authenticity using deterministic factors
   */
  private analyzeAuthenticity(input: RedditNLPInput): any {
    const { accountMetrics, languagePatterns } = input;
    
    // Calculate individual factor scores
    const accountAgeScore = this.calculateAccountAgeScore(accountMetrics);
    const languageComplexityScore = this.calculateLanguageComplexityScore(languagePatterns);
    const engagementQualityScore = this.calculateEngagementQualityScore(input.posts);
    const velocityPatternScore = this.calculateVelocityPatternScore(input);
    const crossPlatformSyncScore = this.calculateCrossPlatformSyncScore(input.crossPlatformData);
    
    // Calculate weighted overall score
    const overallScore = (
      accountAgeScore * this.authenticityFactors.accountAge.weight +
      languageComplexityScore * this.authenticityFactors.languageComplexity.weight +
      engagementQualityScore * this.authenticityFactors.engagementQuality.weight +
      velocityPatternScore * this.authenticityFactors.velocityPattern.weight +
      crossPlatformSyncScore * this.authenticityFactors.crossPlatformSync.weight
    );
    
    // Detect pump indicators
    const pumpIndicators = this.detectPumpIndicators(input);
    
    return {
      overall_score: this.clamp(overallScore, 0, 1),
      factor_scores: {
        account_age: accountAgeScore,
        language_complexity: languageComplexityScore,
        engagement_quality: engagementQualityScore,
        velocity_pattern: velocityPatternScore,
        cross_platform_sync: crossPlatformSyncScore,
      },
      pump_indicators: pumpIndicators,
    };
  }

  /**
   * Calculate account age authenticity score
   */
  private calculateAccountAgeScore(accountMetrics: AccountMetrics): number {
    // Higher score for older accounts
    const avgAgeScore = Math.min(accountMetrics.averageAge / 365, 1); // Normalize to 1 year
    const newAccountPenalty = accountMetrics.newAccountRatio; // Penalty for new accounts
    
    return this.clamp(avgAgeScore - newAccountPenalty, 0, 1);
  }

  /**
   * Calculate language complexity authenticity score
   */
  private calculateLanguageComplexityScore(languagePatterns: LanguagePatterns): number {
    let score = 0.5; // Base score
    
    // Vocabulary diversity bonus
    score += languagePatterns.vocabularyDiversity * 0.3;
    
    // Sophistication bonus
    score += languagePatterns.sophisticationScore * 0.2;
    
    // Penalties
    score -= languagePatterns.repeatContentRatio * 0.5; // Copy-paste penalty
    score -= Math.min(languagePatterns.emojiRatio * 2, 0.3); // Excessive emoji penalty
    
    return this.clamp(score, 0, 1);
  }

  /**
   * Calculate engagement quality score
   */
  private calculateEngagementQualityScore(posts: RedditPostData[]): number {
    if (posts.length === 0) return 0.5;
    
    const avgWordCount = posts.reduce((sum, p) => sum + (p.content?.length || 0), 0) / posts.length;
    const commentRatio = posts.reduce((sum, p) => sum + p.comments, 0) / posts.reduce((sum, p) => sum + p.upvotes, 1);
    
    let score = 0.3; // Base score
    
    // Word count quality
    if (avgWordCount > 500) score += 0.3;
    else if (avgWordCount > 200) score += 0.2;
    else if (avgWordCount > 50) score += 0.1;
    
    // Comment engagement ratio
    if (commentRatio > 0.3) score += 0.2;
    else if (commentRatio > 0.1) score += 0.1;
    
    // Award ratio (indicates quality content)
    const awardRatio = posts.reduce((sum, p) => sum + p.awards, 0) / posts.length;
    score += Math.min(awardRatio * 0.1, 0.2);
    
    return this.clamp(score, 0, 1);
  }

  /**
   * Calculate velocity pattern authenticity score
   */
  private calculateVelocityPatternScore(input: RedditNLPInput): number {
    if (!input.historicalMentions || input.historicalMentions.length === 0) return 0.5;
    
    const currentMentions = input.posts.length;
    const avgMentions = input.historicalMentions.reduce((sum, h) => sum + h.mentions, 0) / input.historicalMentions.length;
    const velocitySpike = avgMentions > 0 ? currentMentions / avgMentions : 1;
    
    // Gradual increase is more authentic than sudden spikes
    if (velocitySpike <= 2) return 0.9; // Normal growth
    if (velocitySpike <= 5) return 0.7; // Moderate spike
    if (velocitySpike <= 10) return 0.4; // Large spike
    return 0.1; // Extreme spike (suspicious)
  }

  /**
   * Calculate cross-platform sync authenticity score
   */
  private calculateCrossPlatformSyncScore(crossPlatformData?: any): number {
    if (!crossPlatformData) return 0.7; // No data, assume moderate authenticity
    
    // High sync scores are suspicious (coordinated)
    return this.clamp(1 - crossPlatformData.syncScore, 0, 1);
  }

  /**
   * Detect pump-and-dump indicators
   */
  private detectPumpIndicators(input: RedditNLPInput): any {
    const { accountMetrics, languagePatterns } = input;
    
    return {
      new_account_spike: accountMetrics.newAccountRatio > this.pumpThresholds.newAccountRatio,
      copy_paste_content: languagePatterns.repeatContentRatio > this.pumpThresholds.copyPasteRatio,
      unusual_upvote_patterns: this.detectUnusualUpvotePatterns(input.posts),
      external_coordination: (input.crossPlatformData?.syncScore || 0) > this.pumpThresholds.crossPlatformSync,
      low_quality_engagement: languagePatterns.sophisticationScore < this.pumpThresholds.lowEngagement,
    };
  }

  /**
   * Detect unusual upvote patterns
   */
  private detectUnusualUpvotePatterns(posts: RedditPostData[]): boolean {
    if (posts.length === 0) return false;
    
    // Check for posts with unusually high upvotes relative to account age
    const suspiciousPosts = posts.filter(post => {
      const upvoteToAgeRatio = post.upvotes / Math.max(post.authorAge, 1);
      return upvoteToAgeRatio > 100; // Arbitrary threshold
    });
    
    return suspiciousPosts.length / posts.length > 0.3; // >30% suspicious posts
  }

  /**
   * Analyze mention velocity
   */
  private analyzeVelocity(input: RedditNLPInput): any {
    const currentMentions = input.posts.length;
    const baselineMentions = input.historicalMentions ? 
      input.historicalMentions.reduce((sum, h) => sum + h.mentions, 0) / input.historicalMentions.length : 
      currentMentions;
    
    const spikeRatio = baselineMentions > 0 ? currentMentions / baselineMentions : 1;
    
    let velocityType: string;
    if (spikeRatio <= 1.5) velocityType = 'organic_growth';
    else if (spikeRatio <= 5) velocityType = 'news_driven';
    else if (spikeRatio <= 10) velocityType = 'sudden_spike';
    else velocityType = 'coordinated_burst';
    
    const sustainability = this.predictSustainability(spikeRatio, input.accountMetrics);
    
    return {
      current_mentions: currentMentions,
      baseline_mentions: Math.round(baselineMentions),
      spike_ratio: spikeRatio,
      velocity_type: velocityType,
      sustainability_forecast: sustainability,
    };
  }

  /**
   * Predict momentum sustainability
   */
  private predictSustainability(spikeRatio: number, accountMetrics: AccountMetrics): string {
    // Higher authenticity = longer sustainability
    const authenticityBonus = (1 - accountMetrics.newAccountRatio) * 0.5;
    
    if (spikeRatio <= 2 && authenticityBonus > 0.3) return '1+ weeks';
    if (spikeRatio <= 5 && authenticityBonus > 0.2) return '3-5 days';
    if (spikeRatio <= 10) return '1-2 days';
    return 'flash_spike';
  }

  /**
   * Extract basic sentiment metrics
   */
  private extractSentimentMetrics(posts: RedditPostData[]): any {
    if (posts.length === 0) {
      return {
        overall_sentiment: 'neutral',
        sentiment_strength: 0,
        positive_ratio: 0,
        negative_ratio: 0,
        neutral_ratio: 1,
        sentiment_momentum: 'stable',
      };
    }
    
    const sentimentCounts = this.calculateSentimentDistribution(posts);
    const overallSentiment = this.determineOverallSentiment(sentimentCounts);
    const sentimentStrength = Math.max(sentimentCounts.positive, sentimentCounts.negative);
    
    return {
      overall_sentiment: overallSentiment,
      sentiment_strength: sentimentStrength,
      positive_ratio: sentimentCounts.positive,
      negative_ratio: sentimentCounts.negative,
      neutral_ratio: sentimentCounts.neutral,
      sentiment_momentum: this.calculateSentimentMomentum(posts),
    };
  }

  /**
   * Calculate sentiment distribution
   */
  private calculateSentimentDistribution(posts: RedditPostData[]): { positive: number; negative: number; neutral: number } {
    if (posts.length === 0) return { positive: 0, negative: 0, neutral: 1 };
    
    // Simple keyword-based sentiment analysis
    const positiveKeywords = ['moon', 'bullish', 'buy', 'hold', 'diamond', 'hands', 'rocket', 'squeeze', 'breakout'];
    const negativeKeywords = ['sell', 'dump', 'crash', 'bearish', 'short', 'puts', 'decline', 'drop'];
    
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    
    posts.forEach(post => {
      const content = (post.title + ' ' + post.content).toLowerCase();
      const positiveCount = positiveKeywords.filter(word => content.includes(word)).length;
      const negativeCount = negativeKeywords.filter(word => content.includes(word)).length;
      
      if (positiveCount > negativeCount) positive++;
      else if (negativeCount > positiveCount) negative++;
      else neutral++;
    });
    
    const total = posts.length;
    return {
      positive: positive / total,
      negative: negative / total,
      neutral: neutral / total,
    };
  }

  /**
   * Determine overall sentiment
   */
  private determineOverallSentiment(sentimentCounts: { positive: number; negative: number; neutral: number }): 'bullish' | 'bearish' | 'neutral' {
    if (sentimentCounts.positive > sentimentCounts.negative + 0.1) return 'bullish';
    if (sentimentCounts.negative > sentimentCounts.positive + 0.1) return 'bearish';
    return 'neutral';
  }

  /**
   * Calculate sentiment momentum
   */
  private calculateSentimentMomentum(posts: RedditPostData[]): 'accelerating' | 'stable' | 'decelerating' | 'reversing' {
    if (posts.length < 10) return 'stable';
    
    // Sort posts by timestamp
    const sortedPosts = posts.sort((a, b) => a.timestamp - b.timestamp);
    const midpoint = Math.floor(sortedPosts.length / 2);
    
    const earlierPosts = sortedPosts.slice(0, midpoint);
    const laterPosts = sortedPosts.slice(midpoint);
    
    const earlierSentiment = this.calculateSentimentDistribution(earlierPosts);
    const laterSentiment = this.calculateSentimentDistribution(laterPosts);
    
    const earlierPositive = earlierSentiment.positive;
    const laterPositive = laterSentiment.positive;
    
    const change = laterPositive - earlierPositive;
    
    if (Math.abs(change) < 0.1) return 'stable';
    if (change > 0.2) return 'accelerating';
    if (change < -0.2) return 'reversing';
    return change > 0 ? 'accelerating' : 'decelerating';
  }

  /**
   * Get subreddit breakdown
   */
  private getSubredditBreakdown(posts: RedditPostData[]): string {
    const subredditCounts = new Map<string, number>();
    
    posts.forEach(post => {
      const count = subredditCounts.get(post.subreddit) || 0;
      subredditCounts.set(post.subreddit, count + 1);
    });
    
    return Array.from(subredditCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([subreddit, count]) => `r/${subreddit} (${count})`)
      .join(', ');
  }

  /**
   * Validate and enhance analysis
   */
  private validateAndEnhanceAnalysis(analysis: any, input: RedditNLPInput): any {
    // Ensure all required fields are present
    const requiredFields = ['narrative', 'authenticity_score', 'momentum_type', 'sustainability', 'sentiment_trend'];
    for (const field of requiredFields) {
      if (!analysis[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate scores
    analysis.authenticity_score = this.clamp(analysis.authenticity_score, 0, 1);
    analysis.engagement_quality = this.clamp(analysis.engagement_quality || 0.5, 0, 1);

    // Add default fields if missing
    if (!analysis.key_themes) analysis.key_themes = ['Social media momentum'];
    if (!analysis.risk_flags) analysis.risk_flags = [];
    if (!analysis.institutional_awareness) analysis.institutional_awareness = 'low';

    return analysis;
  }

  /**
   * Calculate confidence in analysis
   */
  private calculateConfidence(sentimentAnalysis: any, authenticityAnalysis: any): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for more authentic sentiment
    confidence += authenticityAnalysis.overall_score * 0.3;
    
    // Higher confidence for clearer sentiment signals
    confidence += sentimentAnalysis.engagement_quality * 0.2;
    
    return this.clamp(confidence, 0, 1);
  }

  /**
   * Cache analysis results
   */
  private async cacheAnalysis(cacheKey: string, analysis: RedditNLPOutput): Promise<void> {
    try {
      const client = redisClient();
      if (client) {
        await client.setex(cacheKey, this.cacheTimeout, JSON.stringify(analysis));
        loggerUtils.aiLogger.debug('Reddit NLP analysis cached', { cacheKey });
      }
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to cache Reddit analysis', {
        cacheKey,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get cached analysis
   */
  private async getCachedAnalysis(cacheKey: string): Promise<RedditNLPOutput | null> {
    try {
      const client = redisClient();
      if (client) {
        const cached = await client.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
      }
      return null;
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to retrieve cached Reddit analysis', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(symbol: string, timeWindow: string): string {
    const hour = Math.floor(Date.now() / (1000 * 60 * 60 * 2)); // 2-hour buckets
    return `reddit:${symbol}:${timeWindow}:${hour}`;
  }

  /**
   * Get conservative analysis when AI fails
   */
  private getConservativeAnalysis(input: RedditNLPInput, processingTime: number): RedditNLPOutput {
    loggerUtils.aiLogger.info('Using conservative Reddit analysis fallback', {
      symbol: input.symbol,
      timeWindow: input.timeWindow,
    });

    const authenticityAnalysis = this.analyzeAuthenticity(input);
    const sentimentMetrics = this.extractSentimentMetrics(input.posts);
    const velocityAnalysis = this.analyzeVelocity(input);

    return {
      symbol: input.symbol,
      timestamp: Date.now(),
      timeWindow: input.timeWindow,
      analysis: {
        narrative: 'Social media momentum detected',
        authenticity_score: authenticityAnalysis.overall_score,
        momentum_type: velocityAnalysis.spike_ratio > 5 ? 'coordinated_pump' : 'organic_discovery',
        sustainability: velocityAnalysis.sustainability_forecast,
        risk_flags: ['Limited AI analysis available'],
        sentiment_trend: sentimentMetrics.sentiment_momentum === 'accelerating' ? 'accelerating_positive' : 'stable_positive',
        key_themes: ['Social media discussion'],
        engagement_quality: authenticityAnalysis.factor_scores.engagement_quality,
        institutional_awareness: 'low',
      },
      authenticity: authenticityAnalysis,
      sentiment: sentimentMetrics,
      velocity: velocityAnalysis,
      pump_and_dump: {
        overall_risk: 0.2,
        risk_factors: ['Conservative fallback analysis'],
        confidence: 0.4,
        timeframe: 'unknown',
        warning_signs: ['Limited analysis available']
      },
      metadata: {
        model_used: 'gpt-3.5-turbo',
        total_posts_analyzed: input.posts.length,
        unique_authors: new Set(input.posts.map(p => p.author)).size,
        subreddit_count: new Set(input.posts.map(p => p.subreddit)).size,
        processing_time: processingTime,
        confidence_score: 0.4,
      }
    };
  }

  /**
   * Log Reddit analysis for audit trail
   */
  private logRedditAnalysis(result: RedditNLPOutput, input: RedditNLPInput): void {
    loggerUtils.aiLogger.info('Reddit NLP analysis completed', {
      symbol: result.symbol,
      timeWindow: result.timeWindow,
      model_used: result.metadata.model_used,
      authenticity_score: result.authenticity.overall_score,
      momentum_type: result.analysis.momentum_type,
      sentiment_trend: result.analysis.sentiment_trend,
      sustainability: result.analysis.sustainability,
      velocity_spike: result.velocity.spike_ratio,
      total_posts: result.metadata.total_posts_analyzed,
      unique_authors: result.metadata.unique_authors,
      subreddit_count: result.metadata.subreddit_count,
      pump_indicators: result.authenticity.pump_indicators,
      risk_flags: result.analysis.risk_flags,
      processing_time: result.metadata.processing_time,
      confidence_score: result.metadata.confidence_score,
    });

    // Log pump detection separately for monitoring
    const activePumpIndicators = Object.entries(result.authenticity.pump_indicators)
      .filter(([, value]) => value)
      .map(([key]) => key);

    if (activePumpIndicators.length > 0) {
      loggerUtils.aiLogger.warn('Pump indicators detected', {
        symbol: result.symbol,
        indicators: activePumpIndicators,
        authenticity_score: result.authenticity.overall_score,
        velocity_spike: result.velocity.spike_ratio,
      });
    }
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
  async batchAnalyzeReddit(inputs: RedditNLPInput[]): Promise<RedditNLPOutput[]> {
    const results: RedditNLPOutput[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(input => this.analyzeRedditSentiment(input));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          loggerUtils.aiLogger.error('Batch Reddit analysis failed', {
            symbol: batch[index].symbol,
            error: result.reason,
          });
          
          // Add conservative analysis for failed symbol
          results.push(this.getConservativeAnalysis(batch[index], 0));
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
   * Get pump-and-dump alerts
   */
  getPumpAlerts(results: RedditNLPOutput[]): Array<{
    symbol: string;
    severity: 'low' | 'medium' | 'high';
    indicators: string[];
    authenticity_score: number;
  }> {
    return results
      .filter(result => result.authenticity.overall_score < 0.5)
      .map(result => {
        const activePumpIndicators = Object.entries(result.authenticity.pump_indicators)
          .filter(([, value]) => value)
          .map(([key]) => key);

        let severity: 'low' | 'medium' | 'high' = 'low';
        if (activePumpIndicators.length >= 3) severity = 'high';
        else if (activePumpIndicators.length >= 2) severity = 'medium';

        return {
          symbol: result.symbol,
          severity,
          indicators: activePumpIndicators,
          authenticity_score: result.authenticity.overall_score,
        };
      })
      .sort((a, b) => a.authenticity_score - b.authenticity_score);
  }
}

export default RedditNLP;
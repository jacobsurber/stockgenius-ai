/**
 * Twitter collector for financial sentiment monitoring
 */

import { BaseCollector } from './BaseCollector.js';
import { CollectedData, TwitterPostData, SocialMetrics, CollectorConfig } from './types.js';
import { loggerUtils } from '../config/logger.js';
import env from '../config/env.js';
import axios, { AxiosInstance } from 'axios';

export class TwitterCollector extends BaseCollector {
  private client: AxiosInstance;
  private readonly financialAccounts = [
    'jimcramer',
    'elonmusk',
    'chamath',
    'mcuban',
    'cathiedwood',
    'unusual_whales',
    'zerohedge',
    'investopedia',
    'marketwatch',
    'cnbc',
    'bloomberg',
    'reuters',
    'wsj',
    'financialtimes'
  ];

  private readonly keywords = [
    'stock market',
    'earnings',
    'revenue',
    'profit',
    'loss',
    'dividend',
    'merger',
    'acquisition',
    'ipo',
    'buyback',
    'guidance',
    'forecast',
    'bullish',
    'bearish',
    'volatility'
  ];

  constructor(config: CollectorConfig) {
    super('TwitterCollector', config);
    
    this.client = axios.create({
      baseURL: 'https://api.twitter.com',
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${env.TWITTER_BEARER_TOKEN}`,
        'User-Agent': 'StockGenius/1.0',
      },
    });
  }

  async collectData(symbol?: string, options?: Record<string, any>): Promise<CollectedData> {
    const startTime = Date.now();
    const tweets: TwitterPostData[] = [];

    try {
      if (symbol) {
        // Collect symbol-specific tweets
        const symbolTweets = await this.collectSymbolTweets(symbol);
        tweets.push(...symbolTweets);
      } else {
        // Collect general financial sentiment
        const generalTweets = await this.collectFinancialTweets(options?.limit || 100);
        tweets.push(...generalTweets);
      }

      // Calculate social metrics
      const socialMetrics = this.calculateSocialMetrics(tweets, startTime);
      
      return {
        symbol,
        collectorType: 'twitter',
        timestamp: Date.now(),
        data: tweets,
        summary: {
          totalItems: tweets.length,
          avgConfidence: tweets.reduce((sum, tweet) => sum + tweet.confidence, 0) / tweets.length || 0,
          timeRange: {
            start: Math.min(...tweets.map(t => t.timestamp)),
            end: Math.max(...tweets.map(t => t.timestamp)),
          },
          trends: {
            sentiment: this.calculateOverallSentiment(tweets),
            volume: this.categorizeVolume(socialMetrics.mentions),
            significance: socialMetrics.trending ? 0.9 : 0.5,
          },
        },
      };
    } catch (error) {
      loggerUtils.dataLogger.error('Twitter collection failed', {
        symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Collect tweets for a specific symbol
   */
  private async collectSymbolTweets(symbol: string): Promise<TwitterPostData[]> {
    const tweets: TwitterPostData[] = [];
    const symbolUpper = symbol.toUpperCase();
    
    try {
      // Search for tweets mentioning the symbol
      const searchQueries = [
        `"$${symbolUpper}"`,
        `"${symbolUpper} stock"`,
        `"${symbolUpper} earnings"`,
        `"${symbolUpper} price"`
      ];

      for (const query of searchQueries) {
        const queryTweets = await this.searchTweets(query, 25);
        tweets.push(...queryTweets);
        
        // Rate limit handling
        await this.delay(1000);
      }

      // Also collect from influential financial accounts
      const influencerTweets = await this.collectFromInfluencers(symbolUpper);
      tweets.push(...influencerTweets);

      return this.deduplicateTweets(tweets);
    } catch (error) {
      loggerUtils.dataLogger.error('Symbol tweet collection failed', {
        symbol,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Collect general financial tweets
   */
  private async collectFinancialTweets(limit: number): Promise<TwitterPostData[]> {
    const tweets: TwitterPostData[] = [];
    const tweetsPerKeyword = Math.ceil(limit / this.keywords.length);
    
    try {
      for (const keyword of this.keywords.slice(0, 10)) { // Limit to avoid rate limits
        const keywordTweets = await this.searchTweets(keyword, tweetsPerKeyword);
        tweets.push(...keywordTweets);
        
        await this.delay(1000);
      }

      // Collect from financial influencers
      const influencerTweets = await this.collectFromInfluencers();
      tweets.push(...influencerTweets);

      return this.deduplicateTweets(tweets.slice(0, limit));
    } catch (error) {
      loggerUtils.dataLogger.error('General tweet collection failed', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Search tweets using Twitter API v2
   */
  private async searchTweets(query: string, maxResults: number = 10): Promise<TwitterPostData[]> {
    try {
      const response = await this.client.get('/2/tweets/search/recent', {
        params: {
          query: `${query} -is:retweet -is:reply lang:en`,
          max_results: Math.min(maxResults, 100),
          'tweet.fields': 'created_at,public_metrics,author_id,context_annotations,entities',
          'user.fields': 'verified,public_metrics,description',
          expansions: 'author_id',
        },
      });

      return this.parseTweetResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          // Rate limited
          const resetTime = error.response.headers['x-rate-limit-reset'];
          const waitTime = resetTime ? (parseInt(resetTime) * 1000 - Date.now()) : 15 * 60 * 1000;
          loggerUtils.dataLogger.warn('Twitter rate limit hit', { waitTime });
          throw new Error(`Rate limited. Reset in ${Math.ceil(waitTime / 1000)} seconds`);
        }
        
        if (error.response?.status === 401) {
          throw new Error('Twitter API authentication failed');
        }
      }
      
      throw error;
    }
  }

  /**
   * Collect tweets from financial influencers
   */
  private async collectFromInfluencers(symbol?: string): Promise<TwitterPostData[]> {
    const tweets: TwitterPostData[] = [];
    
    try {
      // Get user IDs for financial accounts
      const userIds = await this.getUserIds(this.financialAccounts.slice(0, 5));
      
      for (const userId of userIds) {
        try {
          const userTweets = await this.getUserTweets(userId, symbol ? 5 : 2);
          tweets.push(...userTweets);
          
          await this.delay(1000);
        } catch (error) {
          // Continue with other users if one fails
          continue;
        }
      }
    } catch (error) {
      loggerUtils.dataLogger.warn('Influencer tweet collection failed', {
        error: (error as Error).message,
      });
    }
    
    return tweets;
  }

  /**
   * Get user IDs from usernames
   */
  private async getUserIds(usernames: string[]): Promise<string[]> {
    try {
      const response = await this.client.get('/2/users/by', {
        params: {
          usernames: usernames.join(','),
          'user.fields': 'id,username,verified,public_metrics',
        },
      });

      return response.data?.data?.map((user: any) => user.id) || [];
    } catch (error) {
      loggerUtils.dataLogger.warn('Failed to get user IDs', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Get recent tweets from a user
   */
  private async getUserTweets(userId: string, maxResults: number = 5): Promise<TwitterPostData[]> {
    try {
      const response = await this.client.get(`/2/users/${userId}/tweets`, {
        params: {
          max_results: Math.min(maxResults, 10),
          exclude: 'retweets,replies',
          'tweet.fields': 'created_at,public_metrics,context_annotations,entities',
          'user.fields': 'verified,public_metrics,description',
          expansions: 'author_id',
        },
      });

      return this.parseTweetResponse(response.data);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Parse Twitter API response
   */
  private async parseTweetResponse(data: any): Promise<TwitterPostData[]> {
    if (!data?.data) {
      return [];
    }

    const tweets: Promise<TwitterPostData>[] = [];
    const users = new Map();
    
    // Create user lookup map
    if (data.includes?.users) {
      data.includes.users.forEach((user: any) => {
        users.set(user.id, user);
      });
    }

    for (const tweet of data.data) {
      tweets.push(this.processTweet(tweet, users.get(tweet.author_id)));
    }

    return Promise.all(tweets);
  }

  /**
   * Process individual tweet
   */
  private async processTweet(tweet: any, user: any): Promise<TwitterPostData> {
    const content = tweet.text || '';
    const sentimentResult = await this.analyzeSentiment(content);
    const symbols = this.extractStockSymbols(content);
    const hashtags = this.extractHashtags(content);
    
    // Calculate confidence based on user credibility and engagement
    const confidence = this.calculateTweetConfidence({
      isVerified: user?.verified || false,
      followerCount: user?.public_metrics?.followers_count || 0,
      likes: tweet.public_metrics?.like_count || 0,
      retweets: tweet.public_metrics?.retweet_count || 0,
      replies: tweet.public_metrics?.reply_count || 0,
      hasSymbols: symbols.length > 0,
      contentLength: content.length,
    });

    // Convert sentiment result to SentimentData format
    const sentiment = {
      sentiment: sentimentResult.sentiment,
      score: sentimentResult.score,
      magnitude: sentimentResult.magnitude,
      keywords: sentimentResult.keywords,
      timestamp: Date.now(),
      source: 'twitter',
      confidence: confidence,
      metadata: { tweetId: tweet.id, username: user?.username }
    };

    return {
      tweetId: tweet.id,
      username: user?.username || 'unknown',
      content,
      retweets: tweet.public_metrics?.retweet_count || 0,
      likes: tweet.public_metrics?.like_count || 0,
      replies: tweet.public_metrics?.reply_count || 0,
      followerCount: user?.public_metrics?.followers_count || 0,
      isVerified: user?.verified || false,
      sentiment,
      symbols,
      hashtags,
      timestamp: this.normalizeTimestamp(tweet.created_at),
      source: 'twitter',
      confidence,
      metadata: {
        url: `https://twitter.com/${user?.username}/status/${tweet.id}`,
        userDescription: user?.description,
        contextAnnotations: tweet.context_annotations,
        entities: tweet.entities,
        impressions: tweet.public_metrics?.impression_count,
      },
    };
  }

  /**
   * Extract hashtags from tweet content
   */
  private extractHashtags(content: string): string[] {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const matches = content.match(hashtagRegex);
    return matches ? matches.map(tag => tag.substring(1).toLowerCase()) : [];
  }

  /**
   * Calculate confidence score for a tweet
   */
  private calculateTweetConfidence(factors: {
    isVerified: boolean;
    followerCount: number;
    likes: number;
    retweets: number;
    replies: number;
    hasSymbols: boolean;
    contentLength: number;
  }): number {
    let confidence = 0.2; // Base confidence
    
    // Verified user bonus
    if (factors.isVerified) {
      confidence += 0.2;
    }
    
    // Follower count factor (normalized)
    if (factors.followerCount > 1000) {
      confidence += Math.min(0.2, Math.log10(factors.followerCount) / 10);
    }
    
    // Engagement factors
    const totalEngagement = factors.likes + factors.retweets * 2 + factors.replies;
    if (totalEngagement > 0) {
      confidence += Math.min(0.2, totalEngagement / 1000);
    }
    
    // Content relevance
    if (factors.hasSymbols) {
      confidence += 0.1;
    }
    
    if (factors.contentLength > 50) {
      confidence += 0.1;
    }
    
    return this.clamp(confidence, 0, 1);
  }

  /**
   * Calculate social metrics
   */
  private calculateSocialMetrics(tweets: TwitterPostData[], startTime: number): SocialMetrics {
    const totalMentions = tweets.length;
    const totalEngagement = tweets.reduce((sum, tweet) => 
      sum + tweet.likes + tweet.retweets + tweet.replies, 0
    );
    
    const timeSpan = (Date.now() - startTime) / (1000 * 60 * 60); // Hours
    const velocity = timeSpan > 0 ? totalMentions / timeSpan : 0;
    
    const totalReach = tweets.reduce((sum, tweet) => sum + tweet.followerCount, 0);
    
    // Trending if high velocity or viral engagement
    const trending = velocity > 10 || totalEngagement > 5000;
    
    return {
      mentions: totalMentions,
      engagement: totalEngagement,
      velocity,
      reach: totalReach,
      trending,
      timestamp: Date.now(),
      source: 'twitter',
      confidence: tweets.reduce((sum, tweet) => sum + tweet.confidence, 0) / tweets.length || 0,
      metadata: {
        avgLikes: tweets.reduce((sum, tweet) => sum + tweet.likes, 0) / tweets.length || 0,
        avgRetweets: tweets.reduce((sum, tweet) => sum + tweet.retweets, 0) / tweets.length || 0,
        verifiedUsers: tweets.filter(tweet => tweet.isVerified).length,
        topHashtags: this.getTopHashtags(tweets),
      },
    };
  }

  /**
   * Get top hashtags from tweets
   */
  private getTopHashtags(tweets: TwitterPostData[]): string[] {
    const hashtagCounts = new Map<string, number>();
    
    tweets.forEach(tweet => {
      tweet.hashtags.forEach(hashtag => {
        const count = hashtagCounts.get(hashtag) || 0;
        hashtagCounts.set(hashtag, count + 1);
      });
    });
    
    return Array.from(hashtagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([hashtag]) => hashtag);
  }

  /**
   * Calculate overall sentiment
   */
  private calculateOverallSentiment(tweets: TwitterPostData[]): 'bullish' | 'bearish' | 'neutral' {
    if (tweets.length === 0) return 'neutral';
    
    const avgSentiment = tweets.reduce((sum, tweet) => sum + tweet.sentiment.score, 0) / tweets.length;
    
    if (avgSentiment > 0.1) return 'bullish';
    if (avgSentiment < -0.1) return 'bearish';
    return 'neutral';
  }

  /**
   * Categorize mention volume
   */
  private categorizeVolume(mentions: number): 'high' | 'medium' | 'low' {
    if (mentions > 100) return 'high';
    if (mentions > 30) return 'medium';
    return 'low';
  }

  /**
   * Remove duplicate tweets
   */
  private deduplicateTweets(tweets: TwitterPostData[]): TwitterPostData[] {
    const seen = new Set<string>();
    return tweets.filter(tweet => {
      const key = tweet.tweetId || tweet.content.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Detect unusual mention spikes for a symbol
   */
  async detectMentionSpike(symbol: string, historicalAverage: number): Promise<{
    isSpike: boolean;
    currentMentions: number;
    spikeRatio: number;
    confidence: number;
  }> {
    const data = await this.collectData(symbol);
    const currentMentions = data.data.length;
    const spikeRatio = historicalAverage > 0 ? currentMentions / historicalAverage : 1;
    
    return {
      isSpike: spikeRatio > 2.0, // 200% increase
      currentMentions,
      spikeRatio,
      confidence: data.summary.avgConfidence,
    };
  }

  /**
   * Get sentiment trend for a symbol over time
   */
  async getSentimentTrend(symbol: string): Promise<Array<{
    timestamp: number;
    sentiment: number;
    volume: number;
    confidence: number;
  }>> {
    const data = await this.collectData(symbol);
    
    // Group by hour
    const hourlyData = new Map<number, { sentiment: number[], volume: number, confidence: number[] }>();
    
    data.data.forEach((tweet: TwitterPostData) => {
      const hour = Math.floor(tweet.timestamp / (1000 * 60 * 60)) * (1000 * 60 * 60);
      const existing = hourlyData.get(hour) || { sentiment: [], volume: 0, confidence: [] };
      
      existing.sentiment.push(tweet.sentiment.score);
      existing.confidence.push(tweet.confidence);
      existing.volume++;
      
      hourlyData.set(hour, existing);
    });
    
    return Array.from(hourlyData.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        sentiment: data.sentiment.reduce((sum, s) => sum + s, 0) / data.sentiment.length,
        volume: data.volume,
        confidence: data.confidence.reduce((sum, c) => sum + c, 0) / data.confidence.length,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

export default TwitterCollector;
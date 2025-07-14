/**
 * Reddit collector for financial subreddit analysis
 */

import { BaseCollector } from './BaseCollector.js';
import { CollectedData, RedditPostData, SocialMetrics, CollectorConfig } from './types.js';
import { loggerUtils } from '../config/logger.js';
import axios, { AxiosInstance } from 'axios';

export class RedditCollector extends BaseCollector {
  private client: AxiosInstance;
  private readonly subreddits = [
    'wallstreetbets',
    'investing',
    'stocks',
    'SecurityAnalysis',
    'ValueInvesting',
    'StockMarket',
    'pennystocks',
    'options',
    'financialindependence',
    'dividends'
  ];

  constructor(config: CollectorConfig) {
    super('RedditCollector', config);
    
    this.client = axios.create({
      baseURL: 'https://www.reddit.com',
      timeout: config.timeout || 30000,
      headers: {
        'User-Agent': 'StockGenius/1.0 (Financial Analysis Bot)',
        'Accept': 'application/json',
      },
    });
  }

  async collectData(symbol?: string, options?: Record<string, any>): Promise<CollectedData> {
    const startTime = Date.now();
    const posts: RedditPostData[] = [];
    const errors: string[] = [];

    try {
      if (symbol) {
        // Collect symbol-specific data
        const symbolPosts = await this.collectSymbolData(symbol);
        posts.push(...symbolPosts);
      } else {
        // Collect general trending data from financial subreddits
        const generalPosts = await this.collectTrendingData(options?.limit || 100);
        posts.push(...generalPosts);
      }

      // Calculate social metrics
      const socialMetrics = this.calculateSocialMetrics(posts, startTime);
      
      // Determine trending symbols
      const symbolCounts = this.extractTrendingSymbols(posts);
      
      return {
        symbol,
        collectorType: 'reddit',
        timestamp: Date.now(),
        data: posts,
        summary: {
          totalItems: posts.length,
          avgConfidence: posts.reduce((sum, post) => sum + post.confidence, 0) / posts.length || 0,
          timeRange: {
            start: Math.min(...posts.map(p => p.timestamp)),
            end: Math.max(...posts.map(p => p.timestamp)),
          },
          trends: {
            sentiment: this.calculateOverallSentiment(posts),
            volume: this.categorizeVolume(socialMetrics.mentions),
            significance: socialMetrics.trending ? 0.8 : 0.4,
          },
        },
      };
    } catch (error) {
      loggerUtils.dataLogger.error('Reddit collection failed', {
        symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Collect posts for a specific symbol
   */
  private async collectSymbolData(symbol: string): Promise<RedditPostData[]> {
    const posts: RedditPostData[] = [];
    const symbolUpper = symbol.toUpperCase();
    
    // Search across multiple subreddits for the symbol
    for (const subreddit of this.subreddits.slice(0, 5)) { // Limit to top 5 to avoid rate limits
      try {
        const subredditPosts = await this.searchSubreddit(subreddit, symbolUpper);
        posts.push(...subredditPosts);
        
        // Add delay to respect rate limits
        await this.delay(500);
      } catch (error) {
        loggerUtils.dataLogger.warn(`Failed to fetch from r/${subreddit}`, {
          symbol,
          error: (error as Error).message,
        });
      }
    }

    return this.deduplicatePosts(posts);
  }

  /**
   * Collect trending data from financial subreddits
   */
  private async collectTrendingData(limit: number): Promise<RedditPostData[]> {
    const posts: RedditPostData[] = [];
    const postsPerSubreddit = Math.ceil(limit / this.subreddits.length);
    
    for (const subreddit of this.subreddits) {
      try {
        const subredditPosts = await this.getHotPosts(subreddit, postsPerSubreddit);
        posts.push(...subredditPosts);
        
        // Add delay to respect rate limits
        await this.delay(500);
      } catch (error) {
        loggerUtils.dataLogger.warn(`Failed to fetch trending from r/${subreddit}`, {
          error: (error as Error).message,
        });
      }
    }

    return this.deduplicatePosts(posts.slice(0, limit));
  }

  /**
   * Search a specific subreddit for symbol mentions
   */
  private async searchSubreddit(subreddit: string, symbol: string): Promise<RedditPostData[]> {
    try {
      // Use Reddit's search functionality
      const response = await this.client.get(`/r/${subreddit}/search.json`, {
        params: {
          q: `"${symbol}" OR "$${symbol}"`,
          restrict_sr: 1,
          sort: 'new',
          limit: 25,
          t: 'week', // Last week
        },
      });

      return this.parseRedditResponse(response.data, subreddit);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        // Rate limited, wait and retry
        await this.delay(2000);
        throw new Error('Rate limited by Reddit API');
      }
      throw error;
    }
  }

  /**
   * Get hot posts from a subreddit
   */
  private async getHotPosts(subreddit: string, limit: number): Promise<RedditPostData[]> {
    try {
      const response = await this.client.get(`/r/${subreddit}/hot.json`, {
        params: {
          limit: Math.min(limit, 25),
        },
      });

      return this.parseRedditResponse(response.data, subreddit);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        await this.delay(2000);
        throw new Error('Rate limited by Reddit API');
      }
      throw error;
    }
  }

  /**
   * Parse Reddit API response
   */
  private parseRedditResponse(data: any, subreddit: string): Promise<RedditPostData[]> {
    const posts: Promise<RedditPostData>[] = [];
    
    if (!data?.data?.children) {
      return Promise.resolve([]);
    }

    for (const child of data.data.children) {
      const post = child.data;
      
      if (!post || post.over_18 || post.removed || post.deleted) {
        continue;
      }

      posts.push(this.processRedditPost(post, subreddit));
    }

    return Promise.all(posts);
  }

  /**
   * Process individual Reddit post
   */
  private async processRedditPost(post: any, subreddit: string): Promise<RedditPostData> {
    const content = `${post.title} ${post.selftext || ''}`;
    const sentiment = await this.analyzeSentiment(content);
    const symbols = this.extractStockSymbols(content);
    
    // Calculate confidence based on engagement and content quality
    const confidence = this.calculatePostConfidence({
      score: post.score,
      numComments: post.num_comments,
      awards: post.total_awards_received || 0,
      contentLength: content.length,
      hasSymbols: symbols.length > 0,
    });

    return {
      postId: post.id,
      subreddit,
      title: post.title,
      content: post.selftext || '',
      author: post.author,
      upvotes: post.ups || 0,
      downvotes: post.downs || 0,
      comments: post.num_comments || 0,
      awards: post.total_awards_received || 0,
      flair: post.link_flair_text,
      sentiment,
      symbols,
      timestamp: this.normalizeTimestamp(post.created_utc * 1000),
      source: `reddit:/r/${subreddit}`,
      confidence,
      metadata: {
        url: `https://reddit.com${post.permalink}`,
        score: post.score,
        ratio: post.upvote_ratio,
        gilded: post.gilded || 0,
        distinguished: post.distinguished,
        stickied: post.stickied,
        locked: post.locked,
        archived: post.archived,
      },
    };
  }

  /**
   * Calculate confidence score for a post
   */
  private calculatePostConfidence(factors: {
    score: number;
    numComments: number;
    awards: number;
    contentLength: number;
    hasSymbols: boolean;
  }): number {
    let confidence = 0.3; // Base confidence
    
    // Score factor (normalized)
    if (factors.score > 0) {
      confidence += Math.min(0.3, factors.score / 1000);
    }
    
    // Comments factor
    if (factors.numComments > 0) {
      confidence += Math.min(0.2, factors.numComments / 100);
    }
    
    // Awards factor
    if (factors.awards > 0) {
      confidence += Math.min(0.1, factors.awards / 10);
    }
    
    // Content quality factor
    if (factors.contentLength > 100) {
      confidence += 0.1;
    }
    
    // Stock symbol relevance
    if (factors.hasSymbols) {
      confidence += 0.1;
    }
    
    return this.clamp(confidence, 0, 1);
  }

  /**
   * Calculate social metrics for collected posts
   */
  private calculateSocialMetrics(posts: RedditPostData[], startTime: number): SocialMetrics {
    const totalMentions = posts.length;
    const totalEngagement = posts.reduce((sum, post) => 
      sum + post.upvotes + post.comments + post.awards, 0
    );
    
    const timeSpan = (Date.now() - startTime) / (1000 * 60 * 60); // Hours
    const velocity = timeSpan > 0 ? totalMentions / timeSpan : 0;
    
    const totalReach = posts.reduce((sum, post) => sum + post.upvotes * 10, 0); // Rough estimate
    
    // Determine if trending based on velocity and engagement
    const trending = velocity > 5 || totalEngagement > 1000;
    
    return {
      mentions: totalMentions,
      engagement: totalEngagement,
      velocity,
      reach: totalReach,
      trending,
      timestamp: Date.now(),
      source: 'reddit',
      confidence: posts.reduce((sum, post) => sum + post.confidence, 0) / posts.length || 0,
      metadata: {
        avgScore: posts.reduce((sum, post) => sum + post.upvotes, 0) / posts.length || 0,
        avgComments: posts.reduce((sum, post) => sum + post.comments, 0) / posts.length || 0,
        totalAwards: posts.reduce((sum, post) => sum + post.awards, 0),
        subreddits: [...new Set(posts.map(post => post.subreddit))],
      },
    };
  }

  /**
   * Extract trending symbols from posts
   */
  private extractTrendingSymbols(posts: RedditPostData[]): Map<string, number> {
    const symbolCounts = new Map<string, number>();
    
    posts.forEach(post => {
      post.symbols.forEach(symbol => {
        const count = symbolCounts.get(symbol) || 0;
        symbolCounts.set(symbol, count + 1);
      });
    });
    
    return new Map([...symbolCounts.entries()].sort((a, b) => b[1] - a[1]));
  }

  /**
   * Calculate overall sentiment from posts
   */
  private calculateOverallSentiment(posts: RedditPostData[]): 'bullish' | 'bearish' | 'neutral' {
    if (posts.length === 0) return 'neutral';
    
    const avgSentiment = posts.reduce((sum, post) => sum + post.sentiment.score, 0) / posts.length;
    
    if (avgSentiment > 0.1) return 'bullish';
    if (avgSentiment < -0.1) return 'bearish';
    return 'neutral';
  }

  /**
   * Categorize mention volume
   */
  private categorizeVolume(mentions: number): 'high' | 'medium' | 'low' {
    if (mentions > 50) return 'high';
    if (mentions > 20) return 'medium';
    return 'low';
  }

  /**
   * Remove duplicate posts
   */
  private deduplicatePosts(posts: RedditPostData[]): RedditPostData[] {
    const seen = new Set<string>();
    return posts.filter(post => {
      const key = post.postId || post.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get trending symbols across all subreddits
   */
  async getTrendingSymbols(limit: number = 20): Promise<Array<{
    symbol: string;
    mentions: number;
    sentiment: number;
    subreddits: string[];
  }>> {
    const data = await this.collectData();
    const symbolStats = new Map<string, {
      mentions: number;
      totalSentiment: number;
      subreddits: Set<string>;
    }>();

    data.data.forEach((post: RedditPostData) => {
      post.symbols.forEach(symbol => {
        const stats = symbolStats.get(symbol) || {
          mentions: 0,
          totalSentiment: 0,
          subreddits: new Set(),
        };
        
        stats.mentions++;
        stats.totalSentiment += post.sentiment.score;
        stats.subreddits.add(post.subreddit);
        
        symbolStats.set(symbol, stats);
      });
    });

    return Array.from(symbolStats.entries())
      .map(([symbol, stats]) => ({
        symbol,
        mentions: stats.mentions,
        sentiment: stats.totalSentiment / stats.mentions,
        subreddits: Array.from(stats.subreddits),
      }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, limit);
  }
}

export default RedditCollector;
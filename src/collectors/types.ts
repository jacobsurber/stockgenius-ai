/**
 * Standardized interfaces for alternative data collectors
 */

export interface CollectorConfig {
  enabled: boolean;
  updateInterval: number; // in milliseconds
  maxRetries: number;
  timeout: number;
  cacheTTL: number;
}

export interface DataPoint {
  timestamp: number;
  source: string;
  confidence: number; // 0-1 scale
  metadata: Record<string, any>;
}

export interface SentimentData extends DataPoint {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 to 1
  magnitude: number; // 0-1
  keywords: string[];
}

export interface TradingData extends DataPoint {
  symbol: string;
  quantity: number;
  price?: number;
  value: number;
  transactionType: 'buy' | 'sell' | 'hold';
  significance: number; // 0-1 scale
}

export interface SocialMetrics extends DataPoint {
  mentions: number;
  engagement: number;
  velocity: number; // mentions per hour
  reach: number;
  trending: boolean;
}

export interface NewsData extends DataPoint {
  title: string;
  summary: string;
  url: string;
  category: string;
  sentiment: SentimentData;
  symbols: string[];
}

export interface CollectedData {
  symbol?: string;
  collectorType: string;
  timestamp: number;
  data: DataPoint[];
  summary: {
    totalItems: number;
    avgConfidence: number;
    timeRange: {
      start: number;
      end: number;
    };
    trends: {
      sentiment?: 'bullish' | 'bearish' | 'neutral';
      volume?: 'high' | 'medium' | 'low';
      significance?: number;
    };
  };
}

export interface CollectorMetrics {
  totalCollections: number;
  successRate: number;
  avgResponseTime: number;
  lastUpdate: number;
  errors: Array<{
    timestamp: number;
    error: string;
    context: Record<string, any>;
  }>;
}

export interface BaseCollector {
  name: string;
  config: CollectorConfig;
  metrics: CollectorMetrics;
  
  collect(symbol?: string, options?: Record<string, any>): Promise<CollectedData>;
  isHealthy(): Promise<boolean>;
  getMetrics(): CollectorMetrics;
  updateConfig(config: Partial<CollectorConfig>): void;
}

export interface RedditPostData extends DataPoint {
  postId: string;
  subreddit: string;
  title: string;
  content: string;
  author: string;
  upvotes: number;
  downvotes: number;
  comments: number;
  awards: number;
  sentiment: SentimentData;
  symbols: string[];
  flair?: string;
}

export interface TwitterPostData extends DataPoint {
  tweetId: string;
  username: string;
  content: string;
  retweets: number;
  likes: number;
  replies: number;
  followerCount: number;
  isVerified: boolean;
  sentiment: SentimentData;
  symbols: string[];
  hashtags: string[];
}

export interface InsiderTransaction extends TradingData {
  insiderName: string;
  insiderTitle: string;
  relationship: string;
  filingDate: string;
  transactionDate: string;
  secForm: string;
  isDirectOwnership: boolean;
  sharesOwnedAfter: number;
  percentOwned?: number;
}

export interface CongressionalTrade extends TradingData {
  representative: string;
  party: 'Republican' | 'Democrat' | 'Independent';
  chamber: 'House' | 'Senate';
  state: string;
  filingDate: string;
  transactionDate: string;
  timingScore: number; // 0-1, based on proximity to events
  conflictScore: number; // 0-1, based on committee relevance
}

export interface ProcessedNewsItem extends NewsData {
  marketImpact: number; // 0-1 scale
  urgency: number; // 0-1 scale
  credibility: number; // 0-1 scale based on source
  correlatedSymbols: Array<{
    symbol: string;
    relevance: number;
  }>;
  eventType: string; // earnings, merger, regulatory, etc.
}

export interface AggregatedSignal {
  symbol: string;
  timestamp: number;
  sources: string[];
  overallSentiment: SentimentData;
  socialMetrics: SocialMetrics;
  tradingSignals: {
    insider: number; // -1 to 1
    congressional: number; // -1 to 1
    social: number; // -1 to 1
    news: number; // -1 to 1
    combined: number; // -1 to 1
  };
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  alerts: Array<{
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    data: any;
  }>;
}

export interface CollectorStatus {
  name: string;
  status: 'active' | 'inactive' | 'error';
  lastUpdate: number;
  nextUpdate: number;
  healthScore: number; // 0-1
  errorCount: number;
  currentLoad: number; // 0-1
}

export interface CollectorOrchestrator {
  collectors: Map<string, BaseCollector>;
  
  addCollector(collector: BaseCollector): void;
  removeCollector(name: string): void;
  collectAll(symbol?: string): Promise<AggregatedSignal>;
  getStatus(): CollectorStatus[];
  startCollection(interval?: number): void;
  stopCollection(): void;
}
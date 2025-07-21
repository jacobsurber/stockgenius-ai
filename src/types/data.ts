/**
 * TypeScript type definitions for data preprocessing
 */

export interface BaseDataPoint {
  symbol: string;
  timestamp: number; // Unix timestamp in milliseconds
  source: DataSource;
  reliability: number; // 0-1 score
}

export interface NormalizedQuote extends BaseDataPoint {
  type: 'quote';
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  marketCap?: number;
  currency: string;
  exchange: string;
}

export interface NormalizedNews extends BaseDataPoint {
  type: 'news';
  headline: string;
  summary: string;
  url: string;
  publishedAt: number;
  sentiment?: SentimentScore;
  relevance: number; // 0-1 score
  category: NewsCategory;
  language: string;
}

export interface NormalizedProfile extends BaseDataPoint {
  type: 'profile';
  name: string;
  description: string;
  sector: string;
  industry: string;
  country: string;
  currency: string;
  exchange: string;
  marketCap: number;
  employees?: number;
  website?: string;
  logo?: string;
}

export interface NormalizedFinancials extends BaseDataPoint {
  type: 'financials';
  period: 'quarterly' | 'annual';
  reportDate: number;
  fiscalYear: number;
  fiscalQuarter?: number;
  revenue: number;
  netIncome: number;
  eps: number;
  shares: number;
  currency: string;
}

export interface NormalizedInsiderTrade extends BaseDataPoint {
  type: 'insider';
  traderName: string;
  title: string;
  transactionDate: number;
  transactionType: 'buy' | 'sell';
  shares: number;
  price: number;
  value: number;
  sharesOwned: number;
}

export interface NormalizedCongressionalTrade extends BaseDataPoint {
  type: 'congressional';
  representative: string;
  chamber: 'house' | 'senate';
  party: string;
  state: string;
  transactionDate: number;
  disclosureDate: number;
  transactionType: 'buy' | 'sell';
  amount: string; // Range like "$1,001 - $15,000"
}

export type NormalizedData = 
  | NormalizedQuote 
  | NormalizedNews 
  | NormalizedProfile 
  | NormalizedFinancials 
  | NormalizedInsiderTrade 
  | NormalizedCongressionalTrade;

export interface SentimentScore {
  score: number; // -1 to 1
  label: 'negative' | 'neutral' | 'positive';
  confidence: number; // 0-1
  aspects?: {
    earnings?: number;
    guidance?: number;
    management?: number;
    market?: number;
  };
}

export interface DataSource {
  provider: 'finnhub' | 'polygon' | 'alpha_vantage' | 'quiver';
  endpoint: string;
  version?: string;
  tier?: 'free' | 'paid' | 'premium';
  reliability: SourceReliability;
}

export interface SourceReliability {
  score: number; // 0-1
  factors: {
    freshness: number; // How recent the data is
    consistency: number; // Historical accuracy
    coverage: number; // Data completeness
    latency: number; // API response time impact
  };
  lastUpdated: number;
  dataQuality: 'high' | 'medium' | 'low';
}

export interface ContextTag {
  type: ContextTagType;
  value: string | number | boolean;
  confidence: number; // 0-1
  source: 'rule_based' | 'ai_generated' | 'market_calendar';
  metadata?: Record<string, any>;
}

export type ContextTagType =
  | 'pre_earnings'
  | 'post_earnings'
  | 'fed_day'
  | 'ex_dividend'
  | 'sector_rotation'
  | 'market_volatility'
  | 'option_expiry'
  | 'economic_indicator'
  | 'conference_call'
  | 'analyst_day'
  | 'regulatory_filing'
  | 'insider_activity'
  | 'unusual_volume'
  | 'technical_breakout'
  | 'support_resistance';

export type NewsCategory =
  | 'earnings'
  | 'guidance'
  | 'management'
  | 'product'
  | 'regulatory'
  | 'merger'
  | 'acquisition'
  | 'ipo'
  | 'analyst'
  | 'macro'
  | 'sector'
  | 'general';

export interface DataAnomalyFlag {
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedFields: string[];
  confidence: number; // 0-1
  suggestedAction: 'ignore' | 'verify' | 'exclude' | 'flag_for_review';
  metadata?: Record<string, any>;
}

export type AnomalyType =
  | 'price_gap'
  | 'volume_spike'
  | 'data_inconsistency'
  | 'stale_data'
  | 'outlier_value'
  | 'missing_critical_field'
  | 'contradictory_signals'
  | 'timestamp_mismatch'
  | 'currency_mismatch'
  | 'suspicious_pattern';

export interface ProcessedDataPoint {
  original: any; // Raw data from source
  normalized: NormalizedData;
  contextTags: ContextTag[];
  anomalies: DataAnomalyFlag[];
  processingMetadata: {
    processedAt: number;
    processingTime: number;
    version: string;
    deduplicated: boolean;
    aiEnhanced: boolean;
    cacheKey: string;
    ttl: number;
  };
}

export interface DeduplicationResult {
  kept: ProcessedDataPoint;
  duplicates: ProcessedDataPoint[];
  reason: string;
  confidence: number;
}

export interface ContradictionResult {
  dataPoints: ProcessedDataPoint[];
  contradictionType: 'price_mismatch' | 'timing_conflict' | 'fundamental_inconsistency';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedResolution: string;
}

export interface ProcessingOptions {
  enableAI: boolean;
  enableCaching: boolean;
  enableDeduplication: boolean;
  enableAnomalyDetection: boolean;
  enableContextTagging: boolean;
  aiModel: string;
  cacheTTL: number;
  reliabilityThreshold: number;
  maxProcessingTime: number;
}

export interface ProcessingResult {
  success: boolean;
  data?: ProcessedDataPoint[];
  errors?: string[];
  warnings?: string[];
  quality?: any; // Data quality metrics
  statistics: {
    totalInputs: number;
    successfullyProcessed: number;
    duplicatesRemoved: number;
    anomaliesDetected: number;
    contextTagsAdded: number;
    processingTime: number;
    cacheHits: number;
    cacheMisses: number;
    aiCallsMade: number;
  };
}

export interface MarketContext {
  tradingDay: boolean;
  marketHours: boolean;
  preMarket: boolean;
  afterHours: boolean;
  holidaySchedule?: string;
  volumeProfile: 'low' | 'normal' | 'high';
  volatilityLevel: 'low' | 'normal' | 'high';
  sectorRotation?: {
    outPerforming: string[];
    underPerforming: string[];
  };
}

export interface EarningsCalendar {
  symbol: string;
  reportDate: number;
  estimatedEPS: number;
  actualEPS?: number;
  beat?: boolean;
  guidance?: 'raised' | 'lowered' | 'maintained';
  conferenceCallTime?: number;
}

export interface EconomicCalendar {
  event: string;
  date: number;
  impact: 'low' | 'medium' | 'high';
  actual?: number;
  forecast?: number;
  previous?: number;
  currency: string;
  relevantSectors?: string[];
}

// Cache-related types
export interface CacheMetadata {
  key: string;
  ttl: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  dataSize: number;
  compressionRatio?: number;
}

export interface ProcessingMetrics {
  timestamp: number;
  symbol?: string;
  dataType: string;
  source: string;
  processingTimeMs: number;
  cacheHit: boolean;
  aiEnhanced: boolean;
  anomaliesFound: number;
  contextTagsAdded: number;
  reliabilityScore: number;
  errorCount: number;
}
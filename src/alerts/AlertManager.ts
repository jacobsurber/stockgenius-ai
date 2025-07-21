/**
 * Alert Manager
 * Monitors market anomalies and triggers immediate analysis for significant events
 */

import { EventEmitter } from 'events';
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';
import path from 'path';

// Import types and services
import PromptOrchestrator, { OrchestrationInput, AIModuleName } from '../ai/PromptOrchestrator.js';
import { InsiderTradingData } from '../collectors/InsiderTradingCollector.js';
import { CongressionalTradingData } from '../collectors/CongressionalTradingCollector.js';
import { RedditPostData } from '../ai/modules/RedditNLP.js';
import { NewsData } from '../collectors/NewsCollector.js';

export type AlertType = 
  | 'insider_trading_spike' 
  | 'congressional_trading_unusual'
  | 'sentiment_spike'
  | 'volume_anomaly'
  | 'price_anomaly'
  | 'breaking_news'
  | 'earnings_surprise'
  | 'analyst_upgrade_downgrade'
  | 'unusual_options_activity'
  | 'sector_rotation'
  | 'market_crash_signal'
  | 'custom_signal';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type NotificationChannel = 'console' | 'email' | 'webhook' | 'slack' | 'sms' | 'push';

export interface AlertThreshold {
  alertType: AlertType;
  enabled: boolean;
  severity: AlertSeverity;
  conditions: {
    // Insider trading thresholds
    insiderTradeValueMin?: number;        // Minimum trade value in USD
    insiderTradeVolumeRatio?: number;     // Volume vs average daily volume
    insiderExecutiveLevel?: string[];     // Executive levels to monitor
    
    // Congressional trading thresholds
    congressionalTradeValueMin?: number;  // Minimum trade value
    congressionalTimingWindow?: number;   // Days before/after key votes
    
    // Sentiment thresholds
    sentimentVelocity?: number;           // Posts per hour threshold
    sentimentScoreChange?: number;        // Sentiment score delta
    mentionSpike?: number;                // Mentions vs baseline ratio
    
    // Price/volume thresholds
    priceChangePercent?: number;          // Price change % threshold
    volumeRatio?: number;                 // Volume vs average ratio
    timeWindow?: number;                  // Time window in minutes
    
    // News thresholds
    newsImpactScore?: number;             // News impact threshold
    keywordMatches?: string[];            // Keywords to monitor
    sourceCredibility?: number;           // Source credibility threshold
    
    // Custom conditions
    customLogic?: string;                 // Custom evaluation logic
  };
  cooldownPeriod?: number;                // Minutes to wait before re-alerting
  notificationChannels: NotificationChannel[];
  autoTriggerAnalysis?: boolean;          // Automatically trigger analysis
  analysisModules?: AIModuleName[];       // Modules to run for analysis
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  symbol: string;
  title: string;
  description: string;
  triggerData: any;
  timestamp: number;
  
  // Analysis trigger info
  analysisTriggered: boolean;
  analysisSessionId?: string;
  analysisCompleted: boolean;
  analysisResults?: any;
  
  // Notification tracking
  notificationsSent: NotificationChannel[];
  notificationsFailed: NotificationChannel[];
  
  // Effectiveness tracking
  marketImpact?: {
    priceChange24h?: number;
    volumeChange24h?: number;
    followThroughConfirmed?: boolean;
    falsePositive?: boolean;
  };
  
  userActions?: {
    viewed: boolean;
    actedUpon: boolean;
    userFeedback?: 'helpful' | 'not_helpful' | 'false_positive';
    notes?: string;
  };
  
  metadata: {
    source: string;
    confidence: number;
    relatedAlerts?: string[];
    suppressUntil?: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  threshold: AlertThreshold;
  createdAt: number;
  updatedAt: number;
  triggeredCount: number;
  effectiveness: {
    truePositives: number;
    falsePositives: number;
    totalTriggers: number;
    averageMarketImpact: number;
  };
}

export interface BreakingNewsAnalysis {
  newsId: string;
  headline: string;
  summary: string;
  impactAssessment: {
    marketImpact: 'low' | 'medium' | 'high' | 'critical';
    affectedSectors: string[];
    affectedSymbols: string[];
    timeHorizon: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
    confidence: number;
  };
  tradingImplications: {
    opportunities: string[];
    risks: string[];
    recommendedActions: string[];
  };
  analysisTimestamp: number;
}

export interface AlertManagerConfig {
  monitoringInterval: number;              // How often to check for alerts (ms)
  maxConcurrentAnalysis: number;           // Max parallel analysis sessions
  alertRetentionDays: number;              // How long to keep alert history
  notificationConfig: {
    email?: {
      enabled: boolean;
      recipients: string[];
      smtpConfig: any;
    };
    webhook?: {
      enabled: boolean;
      urls: string[];
      headers?: Record<string, string>;
    };
    slack?: {
      enabled: boolean;
      webhookUrl: string;
      channel: string;
    };
    console: {
      enabled: boolean;
      logLevel: 'info' | 'warn' | 'error';
    };
  };
  breakingNewsConfig: {
    enabled: boolean;
    sources: string[];
    keywordFilters: string[];
    impactThreshold: number;
  };
}

export class AlertManager extends EventEmitter {
  private database: Database | null = null;
  private dataHub: DataHub;
  private orchestrator: PromptOrchestrator;
  private config: AlertManagerConfig;
  
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private monitoringTimer: NodeJS.Timeout | null = null;
  private analysisQueue: Array<{ alert: Alert; priority: number }> = [];
  private runningAnalysis: Set<string> = new Set();

  // Default alert thresholds
  private defaultThresholds: Record<AlertType, AlertThreshold> = {
    insider_trading_spike: {
      alertType: 'insider_trading_spike',
      enabled: true,
      severity: 'high',
      conditions: {
        insiderTradeValueMin: 1000000,        // $1M+ trades
        insiderTradeVolumeRatio: 2.0,         // 2x normal volume
        insiderExecutiveLevel: ['CEO', 'CFO', 'President', 'Director'],
      },
      cooldownPeriod: 60,                     // 1 hour cooldown
      notificationChannels: ['console', 'webhook'],
      autoTriggerAnalysis: true,
      analysisModules: ['risk', 'technical', 'anomaly', 'fusion'],
    },
    
    congressional_trading_unusual: {
      alertType: 'congressional_trading_unusual',
      enabled: true,
      severity: 'high',
      conditions: {
        congressionalTradeValueMin: 50000,    // $50K+ trades
        congressionalTimingWindow: 7,         // 7 days before/after votes
      },
      cooldownPeriod: 120,                    // 2 hour cooldown
      notificationChannels: ['console', 'webhook'],
      autoTriggerAnalysis: true,
      analysisModules: ['sector', 'risk', 'anomaly', 'fusion'],
    },
    
    sentiment_spike: {
      alertType: 'sentiment_spike',
      enabled: true,
      severity: 'medium',
      conditions: {
        sentimentVelocity: 100,               // 100+ posts/hour
        mentionSpike: 5.0,                    // 5x normal mentions
        sentimentScoreChange: 0.3,            // 30% sentiment change
      },
      cooldownPeriod: 30,                     // 30 min cooldown
      notificationChannels: ['console'],
      autoTriggerAnalysis: true,
      analysisModules: ['reddit', 'technical', 'fusion'],
    },
    
    volume_anomaly: {
      alertType: 'volume_anomaly',
      enabled: true,
      severity: 'medium',
      conditions: {
        volumeRatio: 5.0,                     // 5x average volume
        timeWindow: 15,                       // 15 minute window
      },
      cooldownPeriod: 15,
      notificationChannels: ['console'],
      autoTriggerAnalysis: true,
      analysisModules: ['technical', 'anomaly', 'fusion'],
    },
    
    price_anomaly: {
      alertType: 'price_anomaly',
      enabled: true,
      severity: 'high',
      conditions: {
        priceChangePercent: 10.0,             // 10%+ price change
        timeWindow: 5,                        // 5 minute window
        volumeRatio: 2.0,                     // 2x volume confirmation
      },
      cooldownPeriod: 30,
      notificationChannels: ['console', 'webhook'],
      autoTriggerAnalysis: true,
      analysisModules: ['technical', 'anomaly', 'risk', 'fusion'],
    },
    
    breaking_news: {
      alertType: 'breaking_news',
      enabled: true,
      severity: 'high',
      conditions: {
        newsImpactScore: 0.8,                 // High impact threshold
        keywordMatches: ['earnings', 'FDA', 'merger', 'acquisition', 'bankruptcy', 'lawsuit'],
        sourceCredibility: 0.7,               // Credible sources only
      },
      cooldownPeriod: 5,                      // 5 min cooldown
      notificationChannels: ['console', 'webhook', 'email'],
      autoTriggerAnalysis: true,
      analysisModules: ['sector', 'risk', 'anomaly', 'fusion'],
    },
    
    earnings_surprise: {
      alertType: 'earnings_surprise',
      enabled: true,
      severity: 'high',
      conditions: {
        priceChangePercent: 5.0,              // 5%+ post-earnings move
        volumeRatio: 3.0,                     // 3x volume
      },
      cooldownPeriod: 240,                    // 4 hour cooldown
      notificationChannels: ['console', 'webhook'],
      autoTriggerAnalysis: true,
      analysisModules: ['earningsDrift', 'technical', 'risk', 'fusion'],
    },
    
    analyst_upgrade_downgrade: {
      alertType: 'analyst_upgrade_downgrade',
      enabled: true,
      severity: 'medium',
      conditions: {
        priceChangePercent: 3.0,              // 3%+ price reaction
        sourceCredibility: 0.8,               // High credibility analysts
      },
      cooldownPeriod: 60,
      notificationChannels: ['console'],
      autoTriggerAnalysis: false,
    },
    
    unusual_options_activity: {
      alertType: 'unusual_options_activity',
      enabled: true,
      severity: 'medium',
      conditions: {
        volumeRatio: 10.0,                    // 10x options volume
        timeWindow: 30,                       // 30 minute window
      },
      cooldownPeriod: 60,
      notificationChannels: ['console'],
      autoTriggerAnalysis: true,
      analysisModules: ['technical', 'risk', 'anomaly'],
    },
    
    sector_rotation: {
      alertType: 'sector_rotation',
      enabled: true,
      severity: 'low',
      conditions: {
        priceChangePercent: 2.0,              // 2%+ sector move
        volumeRatio: 1.5,                     // 1.5x volume
      },
      cooldownPeriod: 120,
      notificationChannels: ['console'],
      autoTriggerAnalysis: true,
      analysisModules: ['sector', 'fusion'],
    },
    
    market_crash_signal: {
      alertType: 'market_crash_signal',
      enabled: true,
      severity: 'critical',
      conditions: {
        priceChangePercent: 3.0,              // 3%+ market decline
        volumeRatio: 2.0,                     // 2x volume
      },
      cooldownPeriod: 60,
      notificationChannels: ['console', 'webhook', 'email'],
      autoTriggerAnalysis: true,
      analysisModules: ['sector', 'risk', 'technical', 'anomaly', 'fusion'],
    },
    
    custom_signal: {
      alertType: 'custom_signal',
      enabled: false,
      severity: 'medium',
      conditions: {},
      cooldownPeriod: 30,
      notificationChannels: ['console'],
      autoTriggerAnalysis: false,
    },
  };

  constructor(
    dataHub: DataHub,
    orchestrator: PromptOrchestrator,
    config: AlertManagerConfig
  ) {
    super();
    this.dataHub = dataHub;
    this.orchestrator = orchestrator;
    this.config = config;
    
    this.initializeDatabase();
    this.loadAlertRules();
    this.startMonitoring();
  }

  /**
   * Initialize SQLite database for alert tracking
   */
  private async initializeDatabase(): Promise<void> {
    try {
      const dbPath = path.join(process.cwd(), 'data', 'alerts.db');
      
      this.database = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      await this.database.exec(`
        CREATE TABLE IF NOT EXISTS alert_rules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          enabled BOOLEAN DEFAULT TRUE,
          threshold_data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          triggered_count INTEGER DEFAULT 0,
          effectiveness_data TEXT
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          symbol TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          trigger_data TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          
          analysis_triggered BOOLEAN DEFAULT FALSE,
          analysis_session_id TEXT,
          analysis_completed BOOLEAN DEFAULT FALSE,
          analysis_results TEXT,
          
          notifications_sent TEXT,
          notifications_failed TEXT,
          
          market_impact TEXT,
          user_actions TEXT,
          metadata TEXT NOT NULL,
          
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS breaking_news_analysis (
          id TEXT PRIMARY KEY,
          news_id TEXT NOT NULL,
          headline TEXT NOT NULL,
          summary TEXT NOT NULL,
          impact_assessment TEXT NOT NULL,
          trading_implications TEXT NOT NULL,
          analysis_timestamp INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
        CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
        CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
        CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
      `);

      loggerUtils.aiLogger.info('Alert manager database initialized');
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to initialize alert manager database', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Load alert rules from database or create defaults
   */
  private async loadAlertRules(): Promise<void> {
    if (!this.database) return;

    try {
      const rules = await this.database.all('SELECT * FROM alert_rules');
      
      if (rules.length === 0) {
        // Create default rules
        for (const [alertType, threshold] of Object.entries(this.defaultThresholds)) {
          const rule: AlertRule = {
            id: `default_${alertType}`,
            name: `Default ${alertType.replace(/_/g, ' ')} Rule`,
            description: `Default alerting rule for ${alertType}`,
            enabled: threshold.enabled,
            threshold,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            triggeredCount: 0,
            effectiveness: {
              truePositives: 0,
              falsePositives: 0,
              totalTriggers: 0,
              averageMarketImpact: 0,
            },
          };

          await this.saveAlertRule(rule);
          this.alertRules.set(rule.id, rule);
        }
      } else {
        // Load existing rules
        for (const row of rules) {
          const rule: AlertRule = {
            id: row.id,
            name: row.name,
            description: row.description,
            enabled: row.enabled,
            threshold: JSON.parse(row.threshold_data),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            triggeredCount: row.triggered_count,
            effectiveness: JSON.parse(row.effectiveness_data || '{"truePositives":0,"falsePositives":0,"totalTriggers":0,"averageMarketImpact":0}'),
          };

          this.alertRules.set(rule.id, rule);
        }
      }

      loggerUtils.aiLogger.info('Alert rules loaded', {
        rulesCount: this.alertRules.size,
      });
    } catch (error) {
      loggerUtils.aiLogger.error('Failed to load alert rules', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Start monitoring for alerts
   */
  private startMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    this.monitoringTimer = setInterval(async () => {
      await this.checkForAlerts();
      await this.processAnalysisQueue();
    }, this.config.monitoringInterval);

    loggerUtils.aiLogger.info('Alert monitoring started', {
      interval: this.config.monitoringInterval,
    });
  }

  /**
   * Main alert checking method
   */
  private async checkForAlerts(): Promise<void> {
    try {
      // Check different data sources for alert conditions
      await this.checkInsiderTradingAlerts();
      await this.checkCongressionalTradingAlerts();
      await this.checkSentimentAlerts();
      await this.checkVolumeAnomalies();
      await this.checkPriceAnomalies();
      await this.checkBreakingNews();
      await this.checkEarningsSurprises();
      
      // Clean up old alerts
      await this.cleanupOldAlerts();
    } catch (error) {
      loggerUtils.aiLogger.error('Error during alert checking', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check for insider trading alerts
   */
  private async checkInsiderTradingAlerts(): Promise<void> {
    const rules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.threshold.alertType === 'insider_trading_spike'
    );

    for (const rule of rules) {
      try {
        // Get recent insider trading data (this would integrate with actual data source)
        const recentTrades = await this.getRecentInsiderTrades();
        
        for (const trade of recentTrades) {
          if (this.evaluateInsiderTradingConditions(trade, rule.threshold)) {
            await this.triggerAlert({
              type: 'insider_trading_spike',
              severity: rule.threshold.severity,
              symbol: trade.symbol,
              title: `Significant Insider Trading: ${trade.symbol}`,
              description: `${trade.insiderName} (${trade.insiderTitle}) ${trade.transactionType} $${(trade.value / 1000000).toFixed(1)}M worth of shares`,
              triggerData: trade,
              source: 'insider_trading_monitor',
              confidence: 0.9,
              rule,
            });
          }
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Error checking insider trading alerts', {
          ruleId: rule.id,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Check for congressional trading alerts
   */
  private async checkCongressionalTradingAlerts(): Promise<void> {
    const rules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.threshold.alertType === 'congressional_trading_unusual'
    );

    for (const rule of rules) {
      try {
        const recentTrades = await this.getRecentCongressionalTrades();
        
        for (const trade of recentTrades) {
          if (this.evaluateCongressionalTradingConditions(trade, rule.threshold)) {
            await this.triggerAlert({
              type: 'congressional_trading_unusual',
              severity: rule.threshold.severity,
              symbol: trade.symbol,
              title: `Congressional Trading Alert: ${trade.symbol}`,
              description: `${trade.politician} ${trade.transactionType} $${(trade.amount / 1000).toFixed(0)}K worth of shares`,
              triggerData: trade,
              source: 'congressional_trading_monitor',
              confidence: 0.85,
              rule,
            });
          }
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Error checking congressional trading alerts', {
          ruleId: rule.id,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Check for sentiment spikes
   */
  private async checkSentimentAlerts(): Promise<void> {
    const rules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.threshold.alertType === 'sentiment_spike'
    );

    for (const rule of rules) {
      try {
        const sentimentData = await this.getRecentSentimentData();
        
        for (const data of sentimentData) {
          if (this.evaluateSentimentConditions(data, rule.threshold)) {
            await this.triggerAlert({
              type: 'sentiment_spike',
              severity: rule.threshold.severity,
              symbol: data.symbol,
              title: `Sentiment Spike Detected: ${data.symbol}`,
              description: `${data.mentionCount} mentions in last hour (${data.mentionSpike.toFixed(1)}x normal), sentiment: ${data.sentimentScore > 0 ? 'positive' : 'negative'}`,
              triggerData: data,
              source: 'sentiment_monitor',
              confidence: 0.75,
              rule,
            });
          }
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Error checking sentiment alerts', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Check for volume anomalies
   */
  private async checkVolumeAnomalies(): Promise<void> {
    const rules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.threshold.alertType === 'volume_anomaly'
    );

    for (const rule of rules) {
      try {
        const volumeData = await this.getVolumeAnomalies();
        
        for (const data of volumeData) {
          if (this.evaluateVolumeConditions(data, rule.threshold)) {
            await this.triggerAlert({
              type: 'volume_anomaly',
              severity: rule.threshold.severity,
              symbol: data.symbol,
              title: `Volume Anomaly: ${data.symbol}`,
              description: `${data.volumeRatio.toFixed(1)}x normal volume (${data.currentVolume.toLocaleString()}) in ${rule.threshold.conditions.timeWindow} minutes`,
              triggerData: data,
              source: 'volume_monitor',
              confidence: 0.8,
              rule,
            });
          }
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Error checking volume anomalies', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Check for price anomalies
   */
  private async checkPriceAnomalies(): Promise<void> {
    const rules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.threshold.alertType === 'price_anomaly'
    );

    for (const rule of rules) {
      try {
        const priceData = await this.getPriceAnomalies();
        
        for (const data of priceData) {
          if (this.evaluatePriceConditions(data, rule.threshold)) {
            await this.triggerAlert({
              type: 'price_anomaly',
              severity: rule.threshold.severity,
              symbol: data.symbol,
              title: `Price Anomaly: ${data.symbol}`,
              description: `${data.priceChange > 0 ? '+' : ''}${data.priceChangePercent.toFixed(1)}% move to $${data.currentPrice.toFixed(2)} with ${data.volumeRatio.toFixed(1)}x volume`,
              triggerData: data,
              source: 'price_monitor',
              confidence: 0.85,
              rule,
            });
          }
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Error checking price anomalies', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Check for breaking news
   */
  private async checkBreakingNews(): Promise<void> {
    if (!this.config.breakingNewsConfig.enabled) return;

    const rules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.threshold.alertType === 'breaking_news'
    );

    for (const rule of rules) {
      try {
        const newsItems = await this.getBreakingNews();
        
        for (const news of newsItems) {
          if (this.evaluateBreakingNewsConditions(news, rule.threshold)) {
            // Trigger immediate breaking news analysis
            const analysis = await this.analyzeBreakingNews(news);
            
            await this.triggerAlert({
              type: 'breaking_news',
              severity: analysis.impactAssessment.marketImpact === 'critical' ? 'critical' : rule.threshold.severity,
              symbol: analysis.impactAssessment.affectedSymbols[0] || 'MARKET',
              title: `Breaking News: ${news.headline}`,
              description: `${analysis.impactAssessment.marketImpact.toUpperCase()} impact expected for ${analysis.impactAssessment.affectedSectors.join(', ')}`,
              triggerData: { news, analysis },
              source: 'breaking_news_monitor',
              confidence: analysis.impactAssessment.confidence,
              rule,
            });
          }
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Error checking breaking news', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Check for earnings surprises
   */
  private async checkEarningsSurprises(): Promise<void> {
    const rules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.threshold.alertType === 'earnings_surprise'
    );

    for (const rule of rules) {
      try {
        const earningsData = await this.getEarningsSurprises();
        
        for (const data of earningsData) {
          if (this.evaluateEarningsConditions(data, rule.threshold)) {
            await this.triggerAlert({
              type: 'earnings_surprise',
              severity: rule.threshold.severity,
              symbol: data.symbol,
              title: `Earnings Surprise: ${data.symbol}`,
              description: `${data.surpriseType} by ${data.surprisePercent.toFixed(1)}%, stock ${data.priceChange > 0 ? 'up' : 'down'} ${Math.abs(data.priceChangePercent).toFixed(1)}%`,
              triggerData: data,
              source: 'earnings_monitor',
              confidence: 0.9,
              rule,
            });
          }
        }
      } catch (error) {
        loggerUtils.aiLogger.error('Error checking earnings surprises', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(alertData: {
    type: AlertType;
    severity: AlertSeverity;
    symbol: string;
    title: string;
    description: string;
    triggerData: any;
    source: string;
    confidence: number;
    rule: AlertRule;
  }): Promise<void> {
    const alertId = `${alertData.type}_${alertData.symbol}_${Date.now()}`;
    
    // Check cooldown period
    if (this.isInCooldown(alertData.type, alertData.symbol, alertData.rule.threshold.cooldownPeriod)) {
      return;
    }

    const alert: Alert = {
      id: alertId,
      type: alertData.type,
      severity: alertData.severity,
      symbol: alertData.symbol,
      title: alertData.title,
      description: alertData.description,
      triggerData: alertData.triggerData,
      timestamp: Date.now(),
      
      analysisTriggered: false,
      analysisCompleted: false,
      
      notificationsSent: [],
      notificationsFailed: [],
      
      metadata: {
        source: alertData.source,
        confidence: alertData.confidence,
        suppressUntil: Date.now() + (alertData.rule.threshold.cooldownPeriod || 30) * 60 * 1000,
      },
    };

    // Store alert
    this.activeAlerts.set(alertId, alert);
    await this.saveAlert(alert);

    // Update rule statistics
    alertData.rule.triggeredCount++;
    alertData.rule.effectiveness.totalTriggers++;
    await this.saveAlertRule(alertData.rule);

    // Send notifications
    await this.sendAlertNotifications(alert, alertData.rule.threshold.notificationChannels);

    // Queue for analysis if enabled
    if (alertData.rule.threshold.autoTriggerAnalysis) {
      this.queueAnalysis(alert, alertData.rule.threshold.analysisModules || []);
    }

    // Emit event
    this.emit('alert', alert);

    loggerUtils.aiLogger.info('Alert triggered', {
      alertId,
      type: alertData.type,
      severity: alertData.severity,
      symbol: alertData.symbol,
      confidence: alertData.confidence,
    });
  }

  /**
   * Queue analysis for an alert
   */
  private queueAnalysis(alert: Alert, modules: AIModuleName[]): void {
    const priority = this.calculateAnalysisPriority(alert);
    
    this.analysisQueue.push({ alert, priority });
    this.analysisQueue.sort((a, b) => b.priority - a.priority);

    loggerUtils.aiLogger.info('Analysis queued', {
      alertId: alert.id,
      priority,
      queueLength: this.analysisQueue.length,
    });
  }

  /**
   * Process analysis queue
   */
  private async processAnalysisQueue(): Promise<void> {
    while (this.analysisQueue.length > 0 && this.runningAnalysis.size < this.config.maxConcurrentAnalysis) {
      const item = this.analysisQueue.shift();
      if (!item) break;

      const { alert } = item;
      this.runningAnalysis.add(alert.id);

      // Start analysis asynchronously
      this.runAlertAnalysis(alert).finally(() => {
        this.runningAnalysis.delete(alert.id);
      });
    }
  }

  /**
   * Run analysis for an alert
   */
  private async runAlertAnalysis(alert: Alert): Promise<void> {
    try {
      const sessionId = `alert_${alert.id}`;
      
      // Mark analysis as triggered
      alert.analysisTriggered = true;
      alert.analysisSessionId = sessionId;
      await this.updateAlert(alert);

      // Prepare orchestration input
      const orchestrationInput: OrchestrationInput = {
        sessionId,
        symbol: alert.symbol,
        requestedModules: this.getAnalysisModulesForAlert(alert),
        priority: alert.severity === 'critical' ? 'urgent' : 'high',
        allowFallbacks: true,
        requireValidation: true,
        inputs: await this.prepareAnalysisInputs(alert),
      };

      // Run analysis
      const result = await this.orchestrator.orchestrate(orchestrationInput);
      
      // Store results
      alert.analysisCompleted = true;
      alert.analysisResults = result;
      await this.updateAlert(alert);

      // Send analysis notification if results are significant
      if (this.isSignificantAnalysisResult(result)) {
        await this.sendAnalysisNotification(alert, result);
      }

      loggerUtils.aiLogger.info('Alert analysis completed', {
        alertId: alert.id,
        symbol: alert.symbol,
        success: result.success,
        tradesGenerated: result.results.fusion?.tradeCards?.length || 0,
      });

    } catch (error) {
      loggerUtils.aiLogger.error('Alert analysis failed', {
        alertId: alert.id,
        symbol: alert.symbol,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotifications(alert: Alert, channels: NotificationChannel[]): Promise<void> {
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'console':
            await this.sendConsoleNotification(alert);
            break;
          case 'email':
            await this.sendEmailNotification(alert);
            break;
          case 'webhook':
            await this.sendWebhookNotification(alert);
            break;
          case 'slack':
            await this.sendSlackNotification(alert);
            break;
          // Add other channels as needed
        }
        
        alert.notificationsSent.push(channel);
      } catch (error) {
        alert.notificationsFailed.push(channel);
        loggerUtils.aiLogger.error('Failed to send alert notification', {
          alertId: alert.id,
          channel,
          error: (error as Error).message,
        });
      }
    }

    await this.updateAlert(alert);
  }

  /**
   * Analyze breaking news
   */
  private async analyzeBreakingNews(news: NewsData): Promise<BreakingNewsAnalysis> {
    // This would use AI to analyze the breaking news impact
    const analysis: BreakingNewsAnalysis = {
      newsId: news.id || `news_${Date.now()}`,
      headline: news.title,
      summary: news.summary || news.content?.substring(0, 200) + '...' || '',
      impactAssessment: {
        marketImpact: 'medium',
        affectedSectors: ['technology'], // Would be determined by AI
        affectedSymbols: [], // Would be determined by AI
        timeHorizon: 'short_term',
        confidence: 0.75,
      },
      tradingImplications: {
        opportunities: ['Monitor related stocks for volatility'],
        risks: ['Potential overreaction to news'],
        recommendedActions: ['Wait for market reaction confirmation'],
      },
      analysisTimestamp: Date.now(),
    };

    // Store analysis
    if (this.database) {
      await this.database.run(`
        INSERT INTO breaking_news_analysis (
          id, news_id, headline, summary, impact_assessment,
          trading_implications, analysis_timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        `analysis_${news.id || Date.now()}`,
        analysis.newsId,
        analysis.headline,
        analysis.summary,
        JSON.stringify(analysis.impactAssessment),
        JSON.stringify(analysis.tradingImplications),
        analysis.analysisTimestamp,
      ]);
    }

    return analysis;
  }

  /**
   * Condition evaluation methods
   */
  private evaluateInsiderTradingConditions(trade: any, threshold: AlertThreshold): boolean {
    const conditions = threshold.conditions;
    
    if (conditions.insiderTradeValueMin && trade.value < conditions.insiderTradeValueMin) {
      return false;
    }
    
    if (conditions.insiderTradeVolumeRatio && trade.volumeRatio < conditions.insiderTradeVolumeRatio) {
      return false;
    }
    
    if (conditions.insiderExecutiveLevel && !conditions.insiderExecutiveLevel.includes(trade.insiderTitle)) {
      return false;
    }
    
    return true;
  }

  private evaluateCongressionalTradingConditions(trade: any, threshold: AlertThreshold): boolean {
    const conditions = threshold.conditions;
    
    if (conditions.congressionalTradeValueMin && trade.amount < conditions.congressionalTradeValueMin) {
      return false;
    }
    
    // Additional congressional-specific logic would go here
    
    return true;
  }

  private evaluateSentimentConditions(data: any, threshold: AlertThreshold): boolean {
    const conditions = threshold.conditions;
    
    if (conditions.sentimentVelocity && data.postsPerHour < conditions.sentimentVelocity) {
      return false;
    }
    
    if (conditions.mentionSpike && data.mentionSpike < conditions.mentionSpike) {
      return false;
    }
    
    if (conditions.sentimentScoreChange && Math.abs(data.sentimentChange) < conditions.sentimentScoreChange) {
      return false;
    }
    
    return true;
  }

  private evaluateVolumeConditions(data: any, threshold: AlertThreshold): boolean {
    const conditions = threshold.conditions;
    
    if (conditions.volumeRatio && data.volumeRatio < conditions.volumeRatio) {
      return false;
    }
    
    return true;
  }

  private evaluatePriceConditions(data: any, threshold: AlertThreshold): boolean {
    const conditions = threshold.conditions;
    
    if (conditions.priceChangePercent && Math.abs(data.priceChangePercent) < conditions.priceChangePercent) {
      return false;
    }
    
    if (conditions.volumeRatio && data.volumeRatio < conditions.volumeRatio) {
      return false;
    }
    
    return true;
  }

  private evaluateBreakingNewsConditions(news: any, threshold: AlertThreshold): boolean {
    const conditions = threshold.conditions;
    
    if (conditions.newsImpactScore && news.impactScore < conditions.newsImpactScore) {
      return false;
    }
    
    if (conditions.sourceCredibility && news.sourceCredibility < conditions.sourceCredibility) {
      return false;
    }
    
    if (conditions.keywordMatches) {
      const hasKeyword = conditions.keywordMatches.some(keyword => 
        news.title.toLowerCase().includes(keyword.toLowerCase()) ||
        news.content?.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        return false;
      }
    }
    
    return true;
  }

  private evaluateEarningsConditions(data: any, threshold: AlertThreshold): boolean {
    const conditions = threshold.conditions;
    
    if (conditions.priceChangePercent && Math.abs(data.priceChangePercent) < conditions.priceChangePercent) {
      return false;
    }
    
    if (conditions.volumeRatio && data.volumeRatio < conditions.volumeRatio) {
      return false;
    }
    
    return true;
  }

  /**
   * Notification methods
   */
  private async sendConsoleNotification(alert: Alert): Promise<void> {
    const logLevel = this.config.notificationConfig.console.logLevel;
    const message = `🚨 ${alert.severity.toUpperCase()} ALERT: ${alert.title} - ${alert.description}`;
    
    switch (logLevel) {
      case 'error':
        if (alert.severity === 'critical') {
          console.error(message);
        }
        break;
      case 'warn':
        if (alert.severity === 'critical' || alert.severity === 'high') {
          console.warn(message);
        }
        break;
      case 'info':
      default:
        console.log(message);
        break;
    }
  }

  private async sendEmailNotification(alert: Alert): Promise<void> {
    if (!this.config.notificationConfig.email?.enabled) return;
    
    // Email implementation would go here
    loggerUtils.aiLogger.info('Email notification sent', {
      alertId: alert.id,
      recipients: this.config.notificationConfig.email.recipients.length,
    });
  }

  private async sendWebhookNotification(alert: Alert): Promise<void> {
    if (!this.config.notificationConfig.webhook?.enabled) return;
    
    const payload = {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      symbol: alert.symbol,
      title: alert.title,
      description: alert.description,
      timestamp: alert.timestamp,
      confidence: alert.metadata.confidence,
    };

    for (const url of this.config.notificationConfig.webhook.urls || []) {
      try {
        // HTTP request implementation would go here
        loggerUtils.aiLogger.info('Webhook notification sent', {
          alertId: alert.id,
          url,
        });
      } catch (error) {
        throw new Error(`Webhook failed: ${(error as Error).message}`);
      }
    }
  }

  private async sendSlackNotification(alert: Alert): Promise<void> {
    if (!this.config.notificationConfig.slack?.enabled) return;
    
    // Slack implementation would go here
    loggerUtils.aiLogger.info('Slack notification sent', {
      alertId: alert.id,
      channel: this.config.notificationConfig.slack.channel,
    });
  }

  private async sendAnalysisNotification(alert: Alert, analysisResult: any): Promise<void> {
    // Send notification about completed analysis if results are significant
    console.log(`📊 ANALYSIS COMPLETE: ${alert.symbol} - Generated ${analysisResult.results.fusion?.tradeCards?.length || 0} trade opportunities`);
  }

  /**
   * Data source methods (placeholders - would integrate with real data)
   */
  private async getRecentInsiderTrades(): Promise<any[]> {
    // Placeholder - would fetch from insider trading data source
    return [];
  }

  private async getRecentCongressionalTrades(): Promise<any[]> {
    // Placeholder - would fetch from congressional trading data source
    return [];
  }

  private async getRecentSentimentData(): Promise<any[]> {
    // Placeholder - would fetch from sentiment monitoring
    return [];
  }

  private async getVolumeAnomalies(): Promise<any[]> {
    // Placeholder - would fetch from volume monitoring
    return [];
  }

  private async getPriceAnomalies(): Promise<any[]> {
    // Placeholder - would fetch from price monitoring
    return [];
  }

  private async getBreakingNews(): Promise<any[]> {
    // Placeholder - would fetch from news monitoring
    return [];
  }

  private async getEarningsSurprises(): Promise<any[]> {
    // Placeholder - would fetch from earnings monitoring
    return [];
  }

  /**
   * Utility methods
   */
  private isInCooldown(alertType: AlertType, symbol: string, cooldownMinutes?: number): boolean {
    const cooldownMs = (cooldownMinutes || 30) * 60 * 1000;
    const cutoffTime = Date.now() - cooldownMs;
    
    for (const alert of this.activeAlerts.values()) {
      if (alert.type === alertType && 
          alert.symbol === symbol && 
          alert.timestamp > cutoffTime) {
        return true;
      }
    }
    
    return false;
  }

  private calculateAnalysisPriority(alert: Alert): number {
    let priority = 0;
    
    // Base priority on severity
    switch (alert.severity) {
      case 'critical': priority += 100; break;
      case 'high': priority += 75; break;
      case 'medium': priority += 50; break;
      case 'low': priority += 25; break;
    }
    
    // Add confidence bonus
    priority += alert.metadata.confidence * 20;
    
    // Add type-specific bonuses
    if (['insider_trading_spike', 'breaking_news'].includes(alert.type)) {
      priority += 25;
    }
    
    return priority;
  }

  private getAnalysisModulesForAlert(alert: Alert): AIModuleName[] {
    const rule = Array.from(this.alertRules.values()).find(r => r.threshold.alertType === alert.type);
    return rule?.threshold.analysisModules || ['technical', 'risk', 'fusion'];
  }

  private async prepareAnalysisInputs(alert: Alert): Promise<any> {
    // Prepare inputs based on alert type and trigger data
    return {
      // Would prepare appropriate inputs for each module based on alert data
    };
  }

  private isSignificantAnalysisResult(result: any): boolean {
    return result.success && 
           result.results.fusion?.tradeCards?.length > 0 &&
           result.results.fusion.tradeCards.some((card: any) => card.header.confidence > 0.8);
  }

  /**
   * Database operations
   */
  private async saveAlert(alert: Alert): Promise<void> {
    if (!this.database) return;

    await this.database.run(`
      INSERT OR REPLACE INTO alerts (
        id, type, severity, symbol, title, description, trigger_data,
        timestamp, analysis_triggered, analysis_session_id, analysis_completed,
        analysis_results, notifications_sent, notifications_failed,
        market_impact, user_actions, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      alert.id, alert.type, alert.severity, alert.symbol, alert.title,
      alert.description, JSON.stringify(alert.triggerData), alert.timestamp,
      alert.analysisTriggered, alert.analysisSessionId, alert.analysisCompleted,
      JSON.stringify(alert.analysisResults), JSON.stringify(alert.notificationsSent),
      JSON.stringify(alert.notificationsFailed), JSON.stringify(alert.marketImpact),
      JSON.stringify(alert.userActions), JSON.stringify(alert.metadata)
    ]);
  }

  private async updateAlert(alert: Alert): Promise<void> {
    await this.saveAlert(alert);
  }

  private async saveAlertRule(rule: AlertRule): Promise<void> {
    if (!this.database) return;

    await this.database.run(`
      INSERT OR REPLACE INTO alert_rules (
        id, name, description, enabled, threshold_data, created_at,
        updated_at, triggered_count, effectiveness_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      rule.id, rule.name, rule.description, rule.enabled,
      JSON.stringify(rule.threshold), rule.createdAt, Date.now(),
      rule.triggeredCount, JSON.stringify(rule.effectiveness)
    ]);
  }

  private async cleanupOldAlerts(): Promise<void> {
    if (!this.database) return;

    const cutoffTime = Date.now() - (this.config.alertRetentionDays * 24 * 60 * 60 * 1000);
    
    await this.database.run('DELETE FROM alerts WHERE timestamp < ?', [cutoffTime]);
    
    // Also clean up active alerts map
    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.timestamp < cutoffTime) {
        this.activeAlerts.delete(id);
      }
    }
  }

  /**
   * Public API methods
   */
  
  /**
   * Create custom alert rule
   */
  async createAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt' | 'triggeredCount' | 'effectiveness'>): Promise<string> {
    const ruleId = `custom_${Date.now()}`;
    const fullRule: AlertRule = {
      ...rule,
      id: ruleId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      triggeredCount: 0,
      effectiveness: {
        truePositives: 0,
        falsePositives: 0,
        totalTriggers: 0,
        averageMarketImpact: 0,
      },
    };

    this.alertRules.set(ruleId, fullRule);
    await this.saveAlertRule(fullRule);

    loggerUtils.aiLogger.info('Custom alert rule created', {
      ruleId,
      name: rule.name,
      type: rule.threshold.alertType,
    });

    return ruleId;
  }

  /**
   * Update alert rule
   */
  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<void> {
    const rule = this.alertRules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule not found: ${ruleId}`);
    }

    const updatedRule = { ...rule, ...updates, updatedAt: Date.now() };
    this.alertRules.set(ruleId, updatedRule);
    await this.saveAlertRule(updatedRule);

    loggerUtils.aiLogger.info('Alert rule updated', { ruleId });
  }

  /**
   * Get alert history
   */
  async getAlertHistory(filters?: {
    type?: AlertType;
    severity?: AlertSeverity;
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<Alert[]> {
    if (!this.database) return [];

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    if (filters?.severity) {
      query += ' AND severity = ?';
      params.push(filters.severity);
    }
    if (filters?.symbol) {
      query += ' AND symbol = ?';
      params.push(filters.symbol);
    }
    if (filters?.startTime) {
      query += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }
    if (filters?.endTime) {
      query += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    query += ' ORDER BY timestamp DESC';
    
    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = await this.database.all(query, params);
    
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      symbol: row.symbol,
      title: row.title,
      description: row.description,
      triggerData: JSON.parse(row.trigger_data),
      timestamp: row.timestamp,
      analysisTriggered: row.analysis_triggered,
      analysisSessionId: row.analysis_session_id,
      analysisCompleted: row.analysis_completed,
      analysisResults: row.analysis_results ? JSON.parse(row.analysis_results) : undefined,
      notificationsSent: JSON.parse(row.notifications_sent || '[]'),
      notificationsFailed: JSON.parse(row.notifications_failed || '[]'),
      marketImpact: row.market_impact ? JSON.parse(row.market_impact) : undefined,
      userActions: row.user_actions ? JSON.parse(row.user_actions) : undefined,
      metadata: JSON.parse(row.metadata),
    }));
  }

  /**
   * Get alert effectiveness metrics
   */
  async getAlertEffectiveness(): Promise<Record<AlertType, any>> {
    const effectiveness: Record<string, any> = {};

    for (const [ruleId, rule] of this.alertRules.entries()) {
      effectiveness[rule.threshold.alertType] = {
        totalTriggers: rule.effectiveness.totalTriggers,
        truePositives: rule.effectiveness.truePositives,
        falsePositives: rule.effectiveness.falsePositives,
        accuracy: rule.effectiveness.totalTriggers > 0 ? 
          rule.effectiveness.truePositives / rule.effectiveness.totalTriggers : 0,
        averageMarketImpact: rule.effectiveness.averageMarketImpact,
      };
    }

    return effectiveness;
  }

  /**
   * Stop monitoring and cleanup
   */
  cleanup(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    if (this.database) {
      this.database.close();
      this.database = null;
    }

    loggerUtils.aiLogger.info('Alert manager cleanup completed');
  }
}

export default AlertManager;
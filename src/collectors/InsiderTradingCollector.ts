/**
 * Insider trading collector with significance scoring
 */

import { BaseCollector } from './BaseCollector.js';
import { CollectedData, InsiderTransaction, CollectorConfig, TradingData } from './types.js';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';

// Export the data type for use in other modules
export type InsiderTradingData = InsiderTransaction;

export class InsiderTradingCollector extends BaseCollector {
  private dataHub: DataHub;

  constructor(config: CollectorConfig, dataHub: DataHub) {
    super('InsiderTradingCollector', config);
    this.dataHub = dataHub;
  }

  async collectData(symbol?: string, options?: Record<string, any>): Promise<CollectedData> {
    const startTime = Date.now();
    const transactions: InsiderTransaction[] = [];

    try {
      if (symbol) {
        // Collect insider transactions for specific symbol
        const symbolTransactions = await this.collectSymbolInsiderData(symbol);
        transactions.push(...symbolTransactions);
      } else {
        // Collect general insider trading activity
        const generalTransactions = await this.collectGeneralInsiderData(options?.limit || 100);
        transactions.push(...generalTransactions);
      }

      // Calculate aggregated metrics
      const aggregatedMetrics = this.calculateAggregatedMetrics(transactions);
      
      return {
        symbol,
        collectorType: 'insider-trading',
        timestamp: Date.now(),
        data: transactions,
        summary: {
          totalItems: transactions.length,
          avgConfidence: transactions.reduce((sum, tx) => sum + tx.confidence, 0) / transactions.length || 0,
          timeRange: {
            start: Math.min(...transactions.map(tx => tx.timestamp)),
            end: Math.max(...transactions.map(tx => tx.timestamp)),
          },
          trends: {
            sentiment: this.calculateInsiderSentiment(transactions),
            volume: this.categorizeVolume(transactions.length),
            significance: aggregatedMetrics.avgSignificance,
          },
        },
      };
    } catch (error) {
      loggerUtils.dataLogger.error('Insider trading collection failed', {
        symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Collect insider trading data for a specific symbol
   */
  private async collectSymbolInsiderData(symbol: string): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];
    
    try {
      // Get data from Quiver Quant
      const quiverData = await this.dataHub.quiverClient.getInsiderTrading(symbol);
      if (quiverData) {
        const quiverTransactions = await this.parseQuiverInsiderData(quiverData, symbol);
        transactions.push(...quiverTransactions);
      }

      // Get data from SEC EDGAR
      const secData = await this.dataHub.secEdgarClient.getInsiderTransactions(symbol);
      if (secData) {
        const secTransactions = await this.parseSecInsiderData(secData, symbol);
        transactions.push(...secTransactions);
      }

      // Remove duplicates and sort by significance
      const uniqueTransactions = this.deduplicateTransactions(transactions);
      return this.sortBySignificance(uniqueTransactions);
    } catch (error) {
      loggerUtils.dataLogger.error('Symbol insider data collection failed', {
        symbol,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Collect general insider trading activity
   */
  private async collectGeneralInsiderData(limit: number): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];
    
    try {
      // Get recent insider trading from Quiver Quant
      const quiverData = await this.dataHub.quiverClient.getInsiderTrading();
      if (quiverData) {
        const quiverTransactions = await this.parseQuiverInsiderData(quiverData);
        transactions.push(...quiverTransactions);
      }

      return this.sortBySignificance(transactions).slice(0, limit);
    } catch (error) {
      loggerUtils.dataLogger.error('General insider data collection failed', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Parse Quiver Quant insider trading data
   */
  private async parseQuiverInsiderData(data: any, symbol?: string): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];
    
    if (!Array.isArray(data)) {
      return transactions;
    }

    for (const item of data) {
      try {
        const transaction = await this.createInsiderTransaction({
          symbol: item.Ticker || symbol,
          insiderName: item.ReportingName || item.Name || 'Unknown',
          insiderTitle: item.Title || 'Unknown',
          relationship: item.Relationship || 'Unknown',
          quantity: Math.abs(item.Shares || item.SharesTraded || 0),
          price: item.Price || item.SharePrice,
          value: Math.abs(item.Value || item.TransactionValue || 0),
          transactionType: this.normalizeTransactionType(item.TransactionType || item.Type),
          filingDate: item.FilingDate || item.Date,
          transactionDate: item.TransactionDate || item.Date,
          secForm: item.Form || '4',
          isDirectOwnership: item.DirectIndirect !== 'I',
          sharesOwnedAfter: item.SharesOwnedAfterTransaction || 0,
          percentOwned: item.PercentOwned,
          source: 'quiver',
        });
        
        if (transaction) {
          transactions.push(transaction);
        }
      } catch (error) {
        // Continue with other transactions if one fails
        continue;
      }
    }

    return transactions;
  }

  /**
   * Parse SEC EDGAR insider trading data
   */
  private async parseSecInsiderData(data: any, symbol?: string): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];
    
    if (!Array.isArray(data)) {
      return transactions;
    }

    for (const item of data) {
      try {
        const transaction = await this.createInsiderTransaction({
          symbol: item.symbol || symbol,
          insiderName: item.reporterName || 'Unknown',
          insiderTitle: 'Unknown',
          relationship: 'Unknown',
          quantity: Math.abs(item.shares || 0),
          value: Math.abs(item.shares * (item.price || 0)) || 0,
          transactionType: this.normalizeTransactionType(item.transactionType),
          filingDate: item.filingDate,
          transactionDate: item.filingDate,
          secForm: '4',
          isDirectOwnership: true,
          sharesOwnedAfter: 0,
          source: 'sec',
        });
        
        if (transaction) {
          transactions.push(transaction);
        }
      } catch (error) {
        continue;
      }
    }

    return transactions;
  }

  /**
   * Create insider transaction with significance scoring
   */
  private async createInsiderTransaction(data: {
    symbol?: string;
    insiderName: string;
    insiderTitle: string;
    relationship: string;
    quantity: number;
    price?: number;
    value: number;
    transactionType: 'buy' | 'sell' | 'hold';
    filingDate: string;
    transactionDate: string;
    secForm: string;
    isDirectOwnership: boolean;
    sharesOwnedAfter: number;
    percentOwned?: number;
    source: string;
  }): Promise<InsiderTransaction | null> {
    if (!data.symbol || data.quantity <= 0) {
      return null;
    }

    // Calculate significance score
    const significance = await this.calculateSignificanceScore({
      transactionValue: data.value,
      quantity: data.quantity,
      insiderTitle: data.insiderTitle,
      relationship: data.relationship,
      transactionType: data.transactionType,
      percentOwned: data.percentOwned,
      isDirectOwnership: data.isDirectOwnership,
      timingScore: await this.calculateTimingScore(data.symbol, data.transactionDate),
    });

    // Calculate confidence based on data quality and source
    const confidence = this.calculateInsiderConfidence({
      source: data.source,
      hasPrice: !!data.price,
      hasTitle: data.insiderTitle !== 'Unknown',
      isDirectOwnership: data.isDirectOwnership,
      significance,
    });

    return {
      symbol: data.symbol.toUpperCase(),
      insiderName: data.insiderName,
      insiderTitle: data.insiderTitle,
      relationship: data.relationship,
      quantity: data.quantity,
      price: data.price,
      value: data.value,
      transactionType: data.transactionType,
      filingDate: data.filingDate,
      transactionDate: data.transactionDate,
      secForm: data.secForm,
      isDirectOwnership: data.isDirectOwnership,
      sharesOwnedAfter: data.sharesOwnedAfter,
      percentOwned: data.percentOwned,
      significance,
      timestamp: this.normalizeTimestamp(data.transactionDate),
      source: `insider-${data.source}`,
      confidence,
      metadata: {
        filingDelay: this.calculateFilingDelay(data.transactionDate, data.filingDate),
        valueCategory: this.categorizeTransactionValue(data.value),
        insiderType: this.categorizeInsiderType(data.insiderTitle, data.relationship),
      },
    };
  }

  /**
   * Calculate significance score for insider transaction
   */
  private async calculateSignificanceScore(factors: {
    transactionValue: number;
    quantity: number;
    insiderTitle: string;
    relationship: string;
    transactionType: 'buy' | 'sell' | 'hold';
    percentOwned?: number;
    isDirectOwnership: boolean;
    timingScore: number;
  }): Promise<number> {
    let score = 0;

    // Transaction value factor (0-0.3)
    if (factors.transactionValue > 0) {
      if (factors.transactionValue > 10000000) score += 0.3; // $10M+
      else if (factors.transactionValue > 1000000) score += 0.25; // $1M+
      else if (factors.transactionValue > 100000) score += 0.2; // $100K+
      else if (factors.transactionValue > 10000) score += 0.15; // $10K+
      else score += 0.1;
    }

    // Insider position factor (0-0.25)
    const positionScore = this.scoreInsiderPosition(factors.insiderTitle, factors.relationship);
    score += positionScore * 0.25;

    // Transaction type factor (0-0.2)
    if (factors.transactionType === 'buy') {
      score += 0.2; // Insider buying is more significant
    } else if (factors.transactionType === 'sell') {
      score += 0.1; // Selling can be for various reasons
    }

    // Ownership percentage factor (0-0.15)
    if (factors.percentOwned) {
      if (factors.percentOwned > 10) score += 0.15;
      else if (factors.percentOwned > 5) score += 0.12;
      else if (factors.percentOwned > 1) score += 0.08;
      else score += 0.05;
    }

    // Direct ownership bonus (0-0.05)
    if (factors.isDirectOwnership) {
      score += 0.05;
    }

    // Timing factor (0-0.05)
    score += factors.timingScore * 0.05;

    return this.clamp(score, 0, 1);
  }

  /**
   * Score insider position importance
   */
  private scoreInsiderPosition(title: string, relationship: string): number {
    const titleLower = title.toLowerCase();
    const relationshipLower = relationship.toLowerCase();
    
    // CEO, President, Chairman get highest score
    if (titleLower.includes('ceo') || titleLower.includes('president') || titleLower.includes('chairman')) {
      return 1.0;
    }
    
    // C-level executives
    if (titleLower.includes('cfo') || titleLower.includes('coo') || titleLower.includes('cto') || 
        titleLower.includes('chief')) {
      return 0.9;
    }
    
    // Directors
    if (titleLower.includes('director') || relationshipLower.includes('director')) {
      return 0.8;
    }
    
    // VPs and senior management
    if (titleLower.includes('vice president') || titleLower.includes('vp') || 
        titleLower.includes('senior')) {
      return 0.7;
    }
    
    // Other officers
    if (titleLower.includes('officer') || relationshipLower.includes('officer')) {
      return 0.6;
    }
    
    // 10% owners
    if (relationshipLower.includes('10%') || relationshipLower.includes('ten percent')) {
      return 0.8;
    }
    
    return 0.3; // Unknown or lower-level positions
  }

  /**
   * Calculate timing score based on proximity to market events
   */
  private async calculateTimingScore(symbol: string, transactionDate: string): Promise<number> {
    try {
      const txDate = new Date(transactionDate);
      const now = new Date();
      const daysSinceTransaction = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Recent transactions are more relevant
      if (daysSinceTransaction <= 7) return 1.0;
      if (daysSinceTransaction <= 30) return 0.8;
      if (daysSinceTransaction <= 90) return 0.6;
      return 0.3;
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Calculate confidence for insider transaction
   */
  private calculateInsiderConfidence(factors: {
    source: string;
    hasPrice: boolean;
    hasTitle: boolean;
    isDirectOwnership: boolean;
    significance: number;
  }): number {
    let confidence = 0.3; // Base confidence
    
    // Source reliability
    if (factors.source === 'sec') {
      confidence += 0.3; // SEC data is most reliable
    } else if (factors.source === 'quiver') {
      confidence += 0.25; // Quiver processes SEC data
    }
    
    // Data completeness
    if (factors.hasPrice) confidence += 0.1;
    if (factors.hasTitle) confidence += 0.1;
    if (factors.isDirectOwnership) confidence += 0.1;
    
    // Significance factor
    confidence += factors.significance * 0.15;
    
    return this.clamp(confidence, 0, 1);
  }

  /**
   * Normalize transaction type
   */
  private normalizeTransactionType(type: string): 'buy' | 'sell' | 'hold' {
    if (!type) return 'hold';
    
    const typeLower = type.toLowerCase();
    
    if (typeLower.includes('buy') || typeLower.includes('acquire') || 
        typeLower.includes('purchase') || typeLower === 'p') {
      return 'buy';
    }
    
    if (typeLower.includes('sell') || typeLower.includes('dispose') || 
        typeLower.includes('sale') || typeLower === 's') {
      return 'sell';
    }
    
    return 'hold';
  }

  /**
   * Calculate filing delay
   */
  private calculateFilingDelay(transactionDate: string, filingDate: string): number {
    try {
      const txDate = new Date(transactionDate);
      const fileDate = new Date(filingDate);
      return Math.max(0, (fileDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));
    } catch (error) {
      return 0;
    }
  }

  /**
   * Categorize transaction value
   */
  private categorizeTransactionValue(value: number): 'small' | 'medium' | 'large' | 'massive' {
    if (value > 10000000) return 'massive';
    if (value > 1000000) return 'large';
    if (value > 100000) return 'medium';
    return 'small';
  }

  /**
   * Categorize insider type
   */
  private categorizeInsiderType(title: string, relationship: string): 'executive' | 'director' | 'officer' | 'owner' | 'other' {
    const titleLower = title.toLowerCase();
    const relationshipLower = relationship.toLowerCase();
    
    if (titleLower.includes('ceo') || titleLower.includes('president') || titleLower.includes('chief')) {
      return 'executive';
    }
    
    if (titleLower.includes('director') || relationshipLower.includes('director')) {
      return 'director';
    }
    
    if (titleLower.includes('officer') || relationshipLower.includes('officer')) {
      return 'officer';
    }
    
    if (relationshipLower.includes('10%') || relationshipLower.includes('owner')) {
      return 'owner';
    }
    
    return 'other';
  }

  /**
   * Remove duplicate transactions
   */
  private deduplicateTransactions(transactions: InsiderTransaction[]): InsiderTransaction[] {
    const seen = new Set<string>();
    return transactions.filter(tx => {
      const key = `${tx.symbol}-${tx.insiderName}-${tx.transactionDate}-${tx.quantity}-${tx.transactionType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Sort transactions by significance
   */
  private sortBySignificance(transactions: InsiderTransaction[]): InsiderTransaction[] {
    return transactions.sort((a, b) => b.significance - a.significance);
  }

  /**
   * Calculate aggregated metrics
   */
  private calculateAggregatedMetrics(transactions: InsiderTransaction[]): {
    avgSignificance: number;
    totalValue: number;
    buyVsSellRatio: number;
    executiveTransactions: number;
  } {
    if (transactions.length === 0) {
      return { avgSignificance: 0, totalValue: 0, buyVsSellRatio: 0, executiveTransactions: 0 };
    }
    
    const avgSignificance = transactions.reduce((sum, tx) => sum + tx.significance, 0) / transactions.length;
    const totalValue = transactions.reduce((sum, tx) => sum + tx.value, 0);
    
    const buys = transactions.filter(tx => tx.transactionType === 'buy').length;
    const sells = transactions.filter(tx => tx.transactionType === 'sell').length;
    const buyVsSellRatio = sells > 0 ? buys / sells : buys;
    
    const executiveTransactions = transactions.filter(tx => 
      this.categorizeInsiderType(tx.insiderTitle, tx.relationship) === 'executive'
    ).length;
    
    return {
      avgSignificance,
      totalValue,
      buyVsSellRatio,
      executiveTransactions,
    };
  }

  /**
   * Calculate insider sentiment
   */
  private calculateInsiderSentiment(transactions: InsiderTransaction[]): 'bullish' | 'bearish' | 'neutral' {
    if (transactions.length === 0) return 'neutral';
    
    const weightedScore = transactions.reduce((sum, tx) => {
      const weight = tx.significance;
      const score = tx.transactionType === 'buy' ? 1 : (tx.transactionType === 'sell' ? -1 : 0);
      return sum + (score * weight);
    }, 0);
    
    const avgScore = weightedScore / transactions.length;
    
    if (avgScore > 0.2) return 'bullish';
    if (avgScore < -0.2) return 'bearish';
    return 'neutral';
  }

  /**
   * Categorize volume
   */
  private categorizeVolume(count: number): 'high' | 'medium' | 'low' {
    if (count > 20) return 'high';
    if (count > 10) return 'medium';
    return 'low';
  }

  /**
   * Get most significant insider transactions
   */
  async getMostSignificantTransactions(limit: number = 10): Promise<InsiderTransaction[]> {
    const data = await this.collectData();
    return (data.data as InsiderTransaction[])
      .sort((a, b) => b.significance - a.significance)
      .slice(0, limit);
  }

  /**
   * Analyze insider sentiment for symbol
   */
  async analyzeInsiderSentiment(symbol: string): Promise<{
    sentiment: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    recentActivity: number;
    significantTransactions: number;
    buyVsSellRatio: number;
  }> {
    const data = await this.collectData(symbol);
    const transactions = data.data as InsiderTransaction[];
    
    const recentTransactions = transactions.filter(tx => 
      Date.now() - tx.timestamp < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    );
    
    const significantTransactions = transactions.filter(tx => tx.significance > 0.7).length;
    
    const buys = transactions.filter(tx => tx.transactionType === 'buy').length;
    const sells = transactions.filter(tx => tx.transactionType === 'sell').length;
    
    return {
      sentiment: this.calculateInsiderSentiment(transactions),
      confidence: data.summary.avgConfidence,
      recentActivity: recentTransactions.length,
      significantTransactions,
      buyVsSellRatio: sells > 0 ? buys / sells : buys,
    };
  }
}

export default InsiderTradingCollector;
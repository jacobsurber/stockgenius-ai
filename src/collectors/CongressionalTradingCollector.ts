/**
 * Congressional trading collector with timing analysis
 */

import { BaseCollector } from './BaseCollector.js';
import { CollectedData, CongressionalTrade, CollectorConfig } from './types.js';
import { loggerUtils } from '../config/logger.js';
import { DataHub } from '../api/DataHub.js';

export class CongressionalTradingCollector extends BaseCollector {
  private dataHub: DataHub;
  
  // Committee mappings for conflict scoring
  private readonly committees = {
    finance: ['Banking', 'Financial Services', 'Finance', 'Economic', 'Budget'],
    technology: ['Science', 'Technology', 'Telecommunications', 'Commerce'],
    healthcare: ['Health', 'Medicine', 'Aging', 'Veterans'],
    energy: ['Energy', 'Natural Resources', 'Environment'],
    defense: ['Armed Services', 'Defense', 'Homeland Security', 'Intelligence'],
    transportation: ['Transportation', 'Infrastructure'],
    agriculture: ['Agriculture', 'Rural'],
  };

  constructor(config: CollectorConfig, dataHub: DataHub) {
    super('CongressionalTradingCollector', config);
    this.dataHub = dataHub;
  }

  async collectData(symbol?: string, options?: Record<string, any>): Promise<CollectedData> {
    const startTime = Date.now();
    const trades: CongressionalTrade[] = [];

    try {
      if (symbol) {
        // Collect congressional trades for specific symbol
        const symbolTrades = await this.collectSymbolCongressionalData(symbol);
        trades.push(...symbolTrades);
      } else {
        // Collect general congressional trading activity
        const generalTrades = await this.collectGeneralCongressionalData(options?.limit || 100);
        trades.push(...generalTrades);
      }

      // Calculate aggregated metrics
      const aggregatedMetrics = this.calculateAggregatedMetrics(trades);
      
      return {
        symbol,
        collectorType: 'congressional-trading',
        timestamp: Date.now(),
        data: trades,
        summary: {
          totalItems: trades.length,
          avgConfidence: trades.reduce((sum, trade) => sum + trade.confidence, 0) / trades.length || 0,
          timeRange: {
            start: Math.min(...trades.map(t => t.timestamp)),
            end: Math.max(...trades.map(t => t.timestamp)),
          },
          trends: {
            sentiment: this.calculateCongressionalSentiment(trades),
            volume: this.categorizeVolume(trades.length),
            significance: aggregatedMetrics.avgSignificance,
          },
        },
      };
    } catch (error) {
      loggerUtils.dataLogger.error('Congressional trading collection failed', {
        symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Collect congressional trades for a specific symbol
   */
  private async collectSymbolCongressionalData(symbol: string): Promise<CongressionalTrade[]> {
    const trades: CongressionalTrade[] = [];
    
    try {
      // Get congressional trading data from Quiver Quant
      const houseTrades = await this.dataHub.quiverClient.getCongressionalTrading(symbol, 'house');
      if (houseTrades) {
        const houseTradesParsed = await this.parseCongressionalData(houseTrades, 'House', symbol);
        trades.push(...houseTradesParsed);
      }

      const senateTrades = await this.dataHub.quiverClient.getCongressionalTrading(symbol, 'senate');
      if (senateTrades) {
        const senateTradesParsed = await this.parseCongressionalData(senateTrades, 'Senate', symbol);
        trades.push(...senateTradesParsed);
      }

      // Remove duplicates and sort by significance
      const uniqueTrades = this.deduplicateTrades(trades);
      return this.sortBySignificance(uniqueTrades);
    } catch (error) {
      loggerUtils.dataLogger.error('Symbol congressional data collection failed', {
        symbol,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Collect general congressional trading activity
   */
  private async collectGeneralCongressionalData(limit: number): Promise<CongressionalTrade[]> {
    const trades: CongressionalTrade[] = [];
    
    try {
      // Get recent congressional trading from both chambers
      const [houseTrades, senateTrades] = await Promise.allSettled([
        this.dataHub.quiverClient.getCongressionalTrading(undefined, 'house'),
        this.dataHub.quiverClient.getCongressionalTrading(undefined, 'senate'),
      ]);

      if (houseTrades.status === 'fulfilled' && houseTrades.value) {
        const houseTradesParsed = await this.parseCongressionalData(houseTrades.value, 'House');
        trades.push(...houseTradesParsed);
      }

      if (senateTrades.status === 'fulfilled' && senateTrades.value) {
        const senateTradesParsed = await this.parseCongressionalData(senateTrades.value, 'Senate');
        trades.push(...senateTradesParsed);
      }

      return this.sortBySignificance(trades).slice(0, limit);
    } catch (error) {
      loggerUtils.dataLogger.error('General congressional data collection failed', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Parse congressional trading data
   */
  private async parseCongressionalData(
    data: any, 
    chamber: 'House' | 'Senate', 
    symbol?: string
  ): Promise<CongressionalTrade[]> {
    const trades: CongressionalTrade[] = [];
    
    if (!Array.isArray(data)) {
      return trades;
    }

    for (const item of data) {
      try {
        const trade = await this.createCongressionalTrade({
          symbol: item.Ticker || item.Symbol || symbol,
          representative: item.Representative || item.Name || item.Member,
          party: this.normalizeParty(item.Party),
          chamber,
          state: item.State || 'Unknown',
          quantity: Math.abs(item.Amount || item.Shares || 0),
          price: item.Price,
          value: Math.abs(item.Amount || item.Value || 0),
          transactionType: this.normalizeTransactionType(item.Transaction || item.Type),
          filingDate: item.FilingDate || item.ReportDate,
          transactionDate: item.TransactionDate || item.Date,
          source: 'quiver',
        });
        
        if (trade) {
          trades.push(trade);
        }
      } catch (error) {
        // Continue with other trades if one fails
        continue;
      }
    }

    return trades;
  }

  /**
   * Create congressional trade with timing and conflict analysis
   */
  private async createCongressionalTrade(data: {
    symbol?: string;
    representative: string;
    party: 'Republican' | 'Democrat' | 'Independent';
    chamber: 'House' | 'Senate';
    state: string;
    quantity: number;
    price?: number;
    value: number;
    transactionType: 'buy' | 'sell' | 'hold';
    filingDate: string;
    transactionDate: string;
    source: string;
  }): Promise<CongressionalTrade | null> {
    if (!data.symbol || data.value <= 0) {
      return null;
    }

    // Calculate timing score
    const timingScore = await this.calculateTimingScore(
      data.symbol, 
      data.transactionDate, 
      data.representative
    );

    // Calculate conflict score
    const conflictScore = await this.calculateConflictScore(
      data.symbol, 
      data.representative, 
      data.chamber
    );

    // Calculate overall significance
    const significance = this.calculateSignificanceScore({
      transactionValue: data.value,
      chamber: data.chamber,
      party: data.party,
      timingScore,
      conflictScore,
      transactionType: data.transactionType,
    });

    // Calculate confidence
    const confidence = this.calculateCongressionalConfidence({
      source: data.source,
      hasPrice: !!data.price,
      filingDelay: this.calculateFilingDelay(data.transactionDate, data.filingDate),
      significance,
    });

    return {
      symbol: data.symbol.toUpperCase(),
      representative: data.representative,
      party: data.party,
      chamber: data.chamber,
      state: data.state,
      quantity: data.quantity,
      price: data.price,
      value: data.value,
      transactionType: data.transactionType,
      filingDate: data.filingDate,
      transactionDate: data.transactionDate,
      timingScore,
      conflictScore,
      significance,
      timestamp: this.normalizeTimestamp(data.transactionDate),
      source: `congressional-${data.source}`,
      confidence,
      metadata: {
        filingDelay: this.calculateFilingDelay(data.transactionDate, data.filingDate),
        valueCategory: this.categorizeTransactionValue(data.value),
        urgency: this.calculateUrgency(timingScore, conflictScore),
        politicalContext: {
          party: data.party,
          chamber: data.chamber,
          state: data.state,
        },
      },
    };
  }

  /**
   * Calculate timing score based on proximity to market events
   */
  private async calculateTimingScore(
    symbol: string, 
    transactionDate: string, 
    representative: string
  ): Promise<number> {
    try {
      const txDate = new Date(transactionDate);
      let score = 0.5; // Base score
      
      // Check proximity to earnings announcements
      const earningsScore = await this.checkEarningsProximity(symbol, txDate);
      score += earningsScore * 0.3;
      
      // Check proximity to major news events
      const newsScore = await this.checkNewsProximity(symbol, txDate);
      score += newsScore * 0.2;
      
      // Check for pattern analysis (repeated trading by same representative)
      const patternScore = await this.checkTradingPattern(representative, symbol, txDate);
      score += patternScore * 0.3;
      
      // Recent trades are more suspicious
      const daysSinceTransaction = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceTransaction <= 30) score += 0.2;
      else if (daysSinceTransaction <= 90) score += 0.1;
      
      return this.clamp(score, 0, 1);
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Check proximity to earnings announcements
   */
  private async checkEarningsProximity(symbol: string, tradeDate: Date): Promise<number> {
    try {
      // Get recent earnings data
      const earnings = await this.dataHub.finnhubClient.getEarningsCalendar(
        symbol, 
        new Date(tradeDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        new Date(tradeDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      );
      
      if (!earnings?.earningsCalendar?.length) return 0;
      
      // Find closest earnings date
      let minDays = Infinity;
      earnings.earningsCalendar.forEach((earning: any) => {
        if (earning.symbol === symbol) {
          const earningsDate = new Date(earning.date);
          const daysDiff = Math.abs((tradeDate.getTime() - earningsDate.getTime()) / (1000 * 60 * 60 * 24));
          minDays = Math.min(minDays, daysDiff);
        }
      });
      
      // Score based on proximity (closer = higher score)
      if (minDays <= 7) return 1.0;
      if (minDays <= 14) return 0.7;
      if (minDays <= 30) return 0.4;
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check proximity to major news events
   */
  private async checkNewsProximity(symbol: string, tradeDate: Date): Promise<number> {
    try {
      // Get news around trade date
      const daysBefore = 7;
      const daysAfter = 3;
      
      const startDate = new Date(tradeDate.getTime() - daysBefore * 24 * 60 * 60 * 1000);
      const endDate = new Date(tradeDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
      
      const news = await this.dataHub.newsScraperClient.getNewsForSymbol(symbol, 20);
      
      if (!news?.length) return 0;
      
      // Count significant news events near trade date
      let significantNewsCount = 0;
      news.forEach(article => {
        const newsDate = new Date(article.publishedAt);
        if (newsDate >= startDate && newsDate <= endDate) {
          // Check if news contains important keywords
          const importantKeywords = ['earnings', 'merger', 'acquisition', 'fda', 'approval', 'lawsuit', 'investigation'];
          const hasImportantKeyword = importantKeywords.some(keyword => 
            article.title.toLowerCase().includes(keyword) || 
            article.description.toLowerCase().includes(keyword)
          );
          
          if (hasImportantKeyword) {
            significantNewsCount++;
          }
        }
      });
      
      return Math.min(significantNewsCount / 5, 1.0); // Normalize to 0-1
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check trading patterns
   */
  private async checkTradingPattern(representative: string, symbol: string, tradeDate: Date): Promise<number> {
    // This would require historical data analysis
    // For now, return a default score
    return 0.3;
  }

  /**
   * Calculate conflict of interest score
   */
  private async calculateConflictScore(
    symbol: string, 
    representative: string, 
    chamber: 'House' | 'Senate'
  ): Promise<number> {
    try {
      let score = 0;
      
      // Get company information to determine industry
      const companyInfo = await this.dataHub.finnhubClient.getCompanyProfile(symbol);
      const industry = companyInfo?.finnhubIndustry || '';
      
      // Check if representative serves on relevant committees
      const relevantCommittees = this.getRelevantCommittees(industry);
      
      // This would require committee membership data
      // For now, use industry-based scoring
      score += this.scoreIndustryRelevance(industry) * 0.6;
      
      // Chamber-specific factors
      if (chamber === 'Senate') {
        score += 0.1; // Senators have more influence
      }
      
      // High-profile representatives (would need a database)
      if (this.isHighProfileRepresentative(representative)) {
        score += 0.3;
      }
      
      return this.clamp(score, 0, 1);
    } catch (error) {
      return 0.3;
    }
  }

  /**
   * Get relevant committees for industry
   */
  private getRelevantCommittees(industry: string): string[] {
    const industryLower = industry.toLowerCase();
    
    if (industryLower.includes('bank') || industryLower.includes('financ')) {
      return this.committees.finance;
    }
    if (industryLower.includes('tech') || industryLower.includes('software')) {
      return this.committees.technology;
    }
    if (industryLower.includes('health') || industryLower.includes('pharma')) {
      return this.committees.healthcare;
    }
    if (industryLower.includes('energy') || industryLower.includes('oil')) {
      return this.committees.energy;
    }
    if (industryLower.includes('defense') || industryLower.includes('aerospace')) {
      return this.committees.defense;
    }
    
    return [];
  }

  /**
   * Score industry relevance
   */
  private scoreIndustryRelevance(industry: string): number {
    const highImpactIndustries = ['banking', 'pharmaceutical', 'defense', 'energy', 'technology'];
    const industryLower = industry.toLowerCase();
    
    for (const highImpact of highImpactIndustries) {
      if (industryLower.includes(highImpact)) {
        return 1.0;
      }
    }
    
    return 0.3;
  }

  /**
   * Check if representative is high-profile
   */
  private isHighProfileRepresentative(representative: string): boolean {
    // This would require a database of high-profile representatives
    // For now, use basic heuristics
    const highProfileKeywords = ['speaker', 'leader', 'chairman', 'chair'];
    const nameLower = representative.toLowerCase();
    
    return highProfileKeywords.some(keyword => nameLower.includes(keyword));
  }

  /**
   * Calculate significance score
   */
  private calculateSignificanceScore(factors: {
    transactionValue: number;
    chamber: 'House' | 'Senate';
    party: 'Republican' | 'Democrat' | 'Independent';
    timingScore: number;
    conflictScore: number;
    transactionType: 'buy' | 'sell' | 'hold';
  }): number {
    let score = 0;

    // Transaction value factor (0-0.3)
    if (factors.transactionValue > 0) {
      if (factors.transactionValue > 1000000) score += 0.3; // $1M+
      else if (factors.transactionValue > 250000) score += 0.25; // $250K+
      else if (factors.transactionValue > 50000) score += 0.2; // $50K+
      else if (factors.transactionValue > 15000) score += 0.15; // $15K+
      else score += 0.1;
    }

    // Chamber factor (0-0.1)
    if (factors.chamber === 'Senate') {
      score += 0.1; // Senators have more influence
    } else {
      score += 0.05;
    }

    // Timing factor (0-0.3)
    score += factors.timingScore * 0.3;

    // Conflict factor (0-0.25)
    score += factors.conflictScore * 0.25;

    // Transaction type factor (0-0.05)
    if (factors.transactionType === 'buy') {
      score += 0.05; // Buying based on inside info
    } else if (factors.transactionType === 'sell') {
      score += 0.03; // Selling before bad news
    }

    return this.clamp(score, 0, 1);
  }

  /**
   * Calculate confidence for congressional trade
   */
  private calculateCongressionalConfidence(factors: {
    source: string;
    hasPrice: boolean;
    filingDelay: number;
    significance: number;
  }): number {
    let confidence = 0.4; // Base confidence (congressional data is more regulated)
    
    // Source reliability
    if (factors.source === 'quiver') {
      confidence += 0.3; // Quiver processes official disclosures
    }
    
    // Data completeness
    if (factors.hasPrice) confidence += 0.1;
    
    // Filing promptness (shorter delay = more reliable)
    if (factors.filingDelay <= 30) confidence += 0.1;
    else if (factors.filingDelay <= 45) confidence += 0.05;
    
    // Significance factor
    confidence += factors.significance * 0.1;
    
    return this.clamp(confidence, 0, 1);
  }

  /**
   * Normalize party affiliation
   */
  private normalizeParty(party: string): 'Republican' | 'Democrat' | 'Independent' {
    if (!party) return 'Independent';
    
    const partyLower = party.toLowerCase();
    
    if (partyLower.includes('republican') || partyLower.includes('rep') || partyLower === 'r') {
      return 'Republican';
    }
    if (partyLower.includes('democrat') || partyLower.includes('dem') || partyLower === 'd') {
      return 'Democrat';
    }
    
    return 'Independent';
  }

  /**
   * Normalize transaction type
   */
  private normalizeTransactionType(type: string): 'buy' | 'sell' | 'hold' {
    if (!type) return 'hold';
    
    const typeLower = type.toLowerCase();
    
    if (typeLower.includes('buy') || typeLower.includes('purchase')) {
      return 'buy';
    }
    if (typeLower.includes('sell') || typeLower.includes('sale')) {
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
    if (value > 1000000) return 'massive';
    if (value > 250000) return 'large';
    if (value > 50000) return 'medium';
    return 'small';
  }

  /**
   * Calculate urgency based on timing and conflict scores
   */
  private calculateUrgency(timingScore: number, conflictScore: number): 'low' | 'medium' | 'high' {
    const urgencyScore = (timingScore + conflictScore) / 2;
    
    if (urgencyScore > 0.7) return 'high';
    if (urgencyScore > 0.4) return 'medium';
    return 'low';
  }

  /**
   * Remove duplicate trades
   */
  private deduplicateTrades(trades: CongressionalTrade[]): CongressionalTrade[] {
    const seen = new Set<string>();
    return trades.filter(trade => {
      const key = `${trade.symbol}-${trade.representative}-${trade.transactionDate}-${trade.value}-${trade.transactionType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Sort trades by significance
   */
  private sortBySignificance(trades: CongressionalTrade[]): CongressionalTrade[] {
    return trades.sort((a, b) => b.significance - a.significance);
  }

  /**
   * Calculate aggregated metrics
   */
  private calculateAggregatedMetrics(trades: CongressionalTrade[]): {
    avgSignificance: number;
    avgTimingScore: number;
    avgConflictScore: number;
    partyDistribution: Record<string, number>;
    chamberDistribution: Record<string, number>;
  } {
    if (trades.length === 0) {
      return { 
        avgSignificance: 0, 
        avgTimingScore: 0, 
        avgConflictScore: 0, 
        partyDistribution: {}, 
        chamberDistribution: {} 
      };
    }
    
    const avgSignificance = trades.reduce((sum, trade) => sum + trade.significance, 0) / trades.length;
    const avgTimingScore = trades.reduce((sum, trade) => sum + trade.timingScore, 0) / trades.length;
    const avgConflictScore = trades.reduce((sum, trade) => sum + trade.conflictScore, 0) / trades.length;
    
    const partyDistribution: Record<string, number> = {};
    const chamberDistribution: Record<string, number> = {};
    
    trades.forEach(trade => {
      partyDistribution[trade.party] = (partyDistribution[trade.party] || 0) + 1;
      chamberDistribution[trade.chamber] = (chamberDistribution[trade.chamber] || 0) + 1;
    });
    
    return {
      avgSignificance,
      avgTimingScore,
      avgConflictScore,
      partyDistribution,
      chamberDistribution,
    };
  }

  /**
   * Calculate congressional sentiment
   */
  private calculateCongressionalSentiment(trades: CongressionalTrade[]): 'bullish' | 'bearish' | 'neutral' {
    if (trades.length === 0) return 'neutral';
    
    const weightedScore = trades.reduce((sum, trade) => {
      const weight = trade.significance;
      const score = trade.transactionType === 'buy' ? 1 : (trade.transactionType === 'sell' ? -1 : 0);
      return sum + (score * weight);
    }, 0);
    
    const avgScore = weightedScore / trades.length;
    
    if (avgScore > 0.2) return 'bullish';
    if (avgScore < -0.2) return 'bearish';
    return 'neutral';
  }

  /**
   * Categorize volume
   */
  private categorizeVolume(count: number): 'high' | 'medium' | 'low' {
    if (count > 15) return 'high';
    if (count > 5) return 'medium';
    return 'low';
  }

  /**
   * Get most suspicious congressional trades
   */
  async getMostSuspiciousTrades(limit: number = 10): Promise<CongressionalTrade[]> {
    const data = await this.collectData();
    return (data.data as CongressionalTrade[])
      .filter(trade => trade.timingScore > 0.6 || trade.conflictScore > 0.6)
      .sort((a, b) => (b.timingScore + b.conflictScore) - (a.timingScore + a.conflictScore))
      .slice(0, limit);
  }

  /**
   * Analyze congressional activity for symbol
   */
  async analyzeCongressionalActivity(symbol: string): Promise<{
    activityLevel: 'high' | 'medium' | 'low';
    suspicionLevel: 'high' | 'medium' | 'low';
    partyBias: 'republican' | 'democrat' | 'neutral';
    recentTrades: number;
    avgTimingScore: number;
    avgConflictScore: number;
  }> {
    const data = await this.collectData(symbol);
    const trades = data.data as CongressionalTrade[];
    
    const recentTrades = trades.filter(trade => 
      Date.now() - trade.timestamp < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    ).length;
    
    const avgTimingScore = trades.reduce((sum, trade) => sum + trade.timingScore, 0) / trades.length || 0;
    const avgConflictScore = trades.reduce((sum, trade) => sum + trade.conflictScore, 0) / trades.length || 0;
    
    // Determine party bias
    const republican = trades.filter(trade => trade.party === 'Republican').length;
    const democrat = trades.filter(trade => trade.party === 'Democrat').length;
    let partyBias: 'republican' | 'democrat' | 'neutral' = 'neutral';
    
    if (republican > democrat * 1.5) partyBias = 'republican';
    else if (democrat > republican * 1.5) partyBias = 'democrat';
    
    return {
      activityLevel: trades.length > 10 ? 'high' : trades.length > 3 ? 'medium' : 'low',
      suspicionLevel: (avgTimingScore + avgConflictScore) / 2 > 0.6 ? 'high' : 
                     (avgTimingScore + avgConflictScore) / 2 > 0.3 ? 'medium' : 'low',
      partyBias,
      recentTrades,
      avgTimingScore,
      avgConflictScore,
    };
  }
}

export default CongressionalTradingCollector;
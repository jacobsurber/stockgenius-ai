/**
 * Data Quality Validator - Assesses and scores data reliability
 */

import { loggerUtils } from '../config/logger.js';

export interface DataQualityMetrics {
  source: string;
  timestamp: string;
  completeness: number;  // 0-100: How complete is the data
  accuracy: number;      // 0-100: How accurate/reasonable is the data
  freshness: number;     // 0-100: How recent is the data
  consistency: number;   // 0-100: How consistent with expected patterns
  reliability: number;   // 0-100: Overall reliability score
  confidence: number;    // 0-100: Confidence in the data
  issues: string[];      // List of detected issues
}

export interface ValidationRule {
  field: string;
  required: boolean;
  type: 'number' | 'string' | 'date' | 'array' | 'object';
  min?: number;
  max?: number;
  pattern?: RegExp;
  validator?: (value: any) => boolean;
}

export class DataQualityValidator {
  private sourceReliability: Map<string, number> = new Map();
  private historicalData: Map<string, any[]> = new Map();

  constructor() {
    this.initializeSourceReliability();
  }

  /**
   * Validate and score stock price data
   */
  validateStockData(data: any, symbol: string): DataQualityMetrics {
    const rules: ValidationRule[] = [
      { field: 'price', required: true, type: 'number', min: 0.01, max: 100000 },
      { field: 'change', required: true, type: 'number', min: -1000, max: 1000 },
      { field: 'changePercent', required: true, type: 'number', min: -100, max: 100 },
      { field: 'volume', required: true, type: 'number', min: 0, max: 1000000000 },
      { field: 'symbol', required: true, type: 'string', pattern: /^[A-Z]{1,5}$/ },
    ];

    const metrics = this.calculateBaseMetrics(data, rules);
    
    // Stock-specific validations
    const issues: string[] = [...metrics.issues];
    
    // Check for reasonable price movements
    if (data.changePercent && Math.abs(data.changePercent) > 20) {
      metrics.accuracy -= 20;
      issues.push('Extreme price movement detected');
    }
    
    // Check price consistency with historical data
    const historical = this.getHistoricalData(symbol);
    if (historical.length > 0) {
      const avgPrice = historical.reduce((sum, d) => sum + (d.price || 0), 0) / historical.length;
      if (data.price && Math.abs(data.price - avgPrice) / avgPrice > 0.5) {
        metrics.accuracy -= 15;
        issues.push('Price significantly different from historical average');
      }
    }
    
    // Validate volume reasonableness
    if (data.volume !== undefined) {
      if (data.volume === 0) {
        metrics.completeness -= 10;
        issues.push('Zero volume reported');
      } else if (historical.length > 0) {
        const avgVolume = historical.reduce((sum, d) => sum + (d.volume || 0), 0) / historical.length;
        if (avgVolume > 0 && Math.abs(data.volume - avgVolume) / avgVolume > 5) {
          metrics.consistency -= 10;
          issues.push('Volume significantly different from historical average');
        }
      }
    }

    metrics.issues = issues;
    metrics.reliability = this.calculateOverallReliability(metrics);
    
    // Store for future consistency checks
    this.storeHistoricalData(symbol, data);
    
    return metrics;
  }

  /**
   * Validate news article data
   */
  validateNewsData(articles: any[]): DataQualityMetrics {
    if (!Array.isArray(articles)) {
      return this.createFailedMetrics('news', ['Data is not an array']);
    }

    const rules: ValidationRule[] = [
      { field: 'title', required: true, type: 'string' },
      { field: 'url', required: true, type: 'string', pattern: /^https?:\/\/.+/ },
      { field: 'publishedAt', required: true, type: 'string' },
      { field: 'source', required: true, type: 'string' },
    ];

    let totalCompleteness = 0;
    let totalAccuracy = 0;
    let totalFreshness = 0;
    let totalConsistency = 0;
    const allIssues: string[] = [];

    for (const article of articles.slice(0, 10)) { // Check first 10 articles
      const metrics = this.calculateBaseMetrics(article, rules);
      
      // News-specific validations
      const issues: string[] = [...metrics.issues];
      
      // Check title quality
      if (article.title) {
        if (article.title.length < 10) {
          metrics.accuracy -= 15;
          issues.push('Title too short');
        }
        if (article.title.length > 200) {
          metrics.accuracy -= 10;
          issues.push('Title too long');
        }
      }
      
      // Check URL validity
      if (article.url && !this.isValidURL(article.url)) {
        metrics.accuracy -= 20;
        issues.push('Invalid URL format');
      }
      
      // Check freshness
      if (article.publishedAt) {
        const publishDate = new Date(article.publishedAt);
        const ageHours = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60);
        if (ageHours > 168) { // Older than 1 week
          metrics.freshness -= Math.min(30, ageHours / 168 * 10);
          issues.push('Article is old');
        }
      }
      
      // Check for duplicate titles
      const duplicateCount = articles.filter(a => a.title === article.title).length;
      if (duplicateCount > 1) {
        metrics.consistency -= 15;
        issues.push('Duplicate article detected');
      }

      totalCompleteness += metrics.completeness;
      totalAccuracy += metrics.accuracy;
      totalFreshness += metrics.freshness;
      totalConsistency += metrics.consistency;
      allIssues.push(...issues);
    }

    const count = Math.min(articles.length, 10);
    const avgMetrics = {
      source: 'news-aggregated',
      timestamp: new Date().toISOString(),
      completeness: count > 0 ? totalCompleteness / count : 0,
      accuracy: count > 0 ? totalAccuracy / count : 0,
      freshness: count > 0 ? totalFreshness / count : 0,
      consistency: count > 0 ? totalConsistency / count : 0,
      reliability: 0,
      confidence: 0,
      issues: [...new Set(allIssues)], // Remove duplicates
    };

    avgMetrics.reliability = this.calculateOverallReliability(avgMetrics);
    avgMetrics.confidence = Math.min(95, 50 + articles.length * 2); // More articles = higher confidence

    return avgMetrics;
  }

  /**
   * Validate financial metrics data
   */
  validateFinancialData(data: any, symbol: string): DataQualityMetrics {
    const rules: ValidationRule[] = [
      { field: 'revenue', required: false, type: 'number', min: 0 },
      { field: 'netIncome', required: false, type: 'number' },
      { field: 'assets', required: false, type: 'number', min: 0 },
      { field: 'marketCap', required: false, type: 'number', min: 0 },
      { field: 'pe', required: false, type: 'number', min: 0, max: 1000 },
      { field: 'eps', required: false, type: 'number' },
    ];

    const metrics = this.calculateBaseMetrics(data, rules);
    const issues: string[] = [...metrics.issues];

    // Financial-specific validations
    if (data.pe !== undefined && data.pe > 100) {
      metrics.accuracy -= 10;
      issues.push('Unusually high P/E ratio');
    }

    if (data.revenue !== undefined && data.netIncome !== undefined) {
      const margin = data.netIncome / data.revenue;
      if (Math.abs(margin) > 1) {
        metrics.accuracy -= 15;
        issues.push('Unrealistic profit margin');
      }
    }

    // Check data recency
    const age = this.getDataAge(data.timestamp || data.reportDate);
    if (age > 90) { // Older than 90 days
      metrics.freshness -= Math.min(40, age / 90 * 20);
      issues.push('Financial data is outdated');
    }

    metrics.issues = issues;
    metrics.reliability = this.calculateOverallReliability(metrics);

    return metrics;
  }

  /**
   * Validate trends data
   */
  validateTrendsData(data: any, keyword: string): DataQualityMetrics {
    const rules: ValidationRule[] = [
      { field: 'keyword', required: true, type: 'string' },
      { field: 'timeline', required: false, type: 'array' },
      { field: 'regions', required: false, type: 'array' },
      { field: 'related', required: false, type: 'array' },
    ];

    const metrics = this.calculateBaseMetrics(data, rules);
    const issues: string[] = [...metrics.issues];

    // Trends-specific validations
    if (data.timeline && Array.isArray(data.timeline)) {
      const validPoints = data.timeline.filter(point => 
        point.value !== undefined && point.time !== undefined
      );
      
      if (validPoints.length < data.timeline.length * 0.5) {
        metrics.completeness -= 20;
        issues.push('Many timeline points are missing data');
      }

      // Check for reasonable trend values
      const values = validPoints.map(p => p.value).filter(v => typeof v === 'number');
      if (values.some(v => v < 0 || v > 100)) {
        metrics.accuracy -= 15;
        issues.push('Trend values outside expected range');
      }
    }

    // Check if keyword matches request
    if (data.keyword && data.keyword.toLowerCase() !== keyword.toLowerCase()) {
      metrics.consistency -= 25;
      issues.push('Returned keyword does not match request');
    }

    metrics.issues = issues;
    metrics.reliability = this.calculateOverallReliability(metrics);

    return metrics;
  }

  /**
   * Calculate base metrics for any data object
   */
  private calculateBaseMetrics(data: any, rules: ValidationRule[]): DataQualityMetrics {
    let completeness = 100;
    let accuracy = 100;
    const issues: string[] = [];

    if (!data || typeof data !== 'object') {
      return this.createFailedMetrics('unknown', ['Data is null or not an object']);
    }

    // Check completeness and accuracy based on rules
    for (const rule of rules) {
      const value = data[rule.field];
      
      if (rule.required && (value === undefined || value === null)) {
        completeness -= 20;
        issues.push(`Required field '${rule.field}' is missing`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type validation
        if (!this.validateType(value, rule.type)) {
          accuracy -= 15;
          issues.push(`Field '${rule.field}' has wrong type`);
          continue;
        }

        // Range validation for numbers
        if (rule.type === 'number' && typeof value === 'number') {
          if (rule.min !== undefined && value < rule.min) {
            accuracy -= 10;
            issues.push(`Field '${rule.field}' below minimum value`);
          }
          if (rule.max !== undefined && value > rule.max) {
            accuracy -= 10;
            issues.push(`Field '${rule.field}' above maximum value`);
          }
        }

        // Pattern validation for strings
        if (rule.type === 'string' && typeof value === 'string' && rule.pattern) {
          if (!rule.pattern.test(value)) {
            accuracy -= 10;
            issues.push(`Field '${rule.field}' does not match expected pattern`);
          }
        }

        // Custom validator
        if (rule.validator && !rule.validator(value)) {
          accuracy -= 10;
          issues.push(`Field '${rule.field}' failed custom validation`);
        }
      }
    }

    const source = data.source || 'unknown';
    const sourceReliability = this.sourceReliability.get(source) || 50;

    return {
      source,
      timestamp: new Date().toISOString(),
      completeness: Math.max(0, completeness),
      accuracy: Math.max(0, accuracy),
      freshness: 100, // Will be adjusted by specific validators
      consistency: 100, // Will be adjusted by specific validators
      reliability: 0, // Will be calculated
      confidence: sourceReliability,
      issues,
    };
  }

  /**
   * Calculate overall reliability score
   */
  private calculateOverallReliability(metrics: DataQualityMetrics): number {
    const weights = {
      completeness: 0.25,
      accuracy: 0.30,
      freshness: 0.20,
      consistency: 0.15,
      confidence: 0.10,
    };

    const score = 
      metrics.completeness * weights.completeness +
      metrics.accuracy * weights.accuracy +
      metrics.freshness * weights.freshness +
      metrics.consistency * weights.consistency +
      metrics.confidence * weights.confidence;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Validate data type
   */
  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'string':
        return typeof value === 'string';
      case 'date':
        return !isNaN(Date.parse(value));
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null;
      default:
        return true;
    }
  }

  /**
   * Check if URL is valid
   */
  private isValidURL(string: string): boolean {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get data age in days
   */
  private getDataAge(timestamp?: string): number {
    if (!timestamp) return 999; // Very old if no timestamp
    
    try {
      const date = new Date(timestamp);
      const ageMs = Date.now() - date.getTime();
      return ageMs / (1000 * 60 * 60 * 24); // Convert to days
    } catch {
      return 999;
    }
  }

  /**
   * Create failed metrics object
   */
  private createFailedMetrics(source: string, issues: string[]): DataQualityMetrics {
    return {
      source,
      timestamp: new Date().toISOString(),
      completeness: 0,
      accuracy: 0,
      freshness: 0,
      consistency: 0,
      reliability: 0,
      confidence: 0,
      issues,
    };
  }

  /**
   * Initialize source reliability scores
   */
  private initializeSourceReliability(): void {
    // Based on historical reliability of different sources
    this.sourceReliability.set('yahoo-api', 85);
    this.sourceReliability.set('alphavantage', 80);
    this.sourceReliability.set('sec-edgar', 95);
    this.sourceReliability.set('polygon', 75);
    this.sourceReliability.set('google-trends', 60);
    this.sourceReliability.set('news-rss', 70);
    this.sourceReliability.set('fallback-generated', 30);
    this.sourceReliability.set('cache', 65);
    this.sourceReliability.set('backup-calculated', 40);
  }

  /**
   * Store historical data for consistency checks
   */
  private storeHistoricalData(key: string, data: any): void {
    if (!this.historicalData.has(key)) {
      this.historicalData.set(key, []);
    }
    
    const history = this.historicalData.get(key)!;
    history.push({ ...data, timestamp: new Date().toISOString() });
    
    // Keep only last 30 data points
    if (history.length > 30) {
      history.splice(0, history.length - 30);
    }
  }

  /**
   * Get historical data for consistency checks
   */
  private getHistoricalData(key: string): any[] {
    return this.historicalData.get(key) || [];
  }

  /**
   * Update source reliability based on performance
   */
  updateSourceReliability(source: string, successful: boolean): void {
    const current = this.sourceReliability.get(source) || 50;
    const adjustment = successful ? 2 : -5;
    const newScore = Math.max(0, Math.min(100, current + adjustment));
    
    this.sourceReliability.set(source, newScore);
    
    loggerUtils.apiLogger.debug('Updated source reliability', {
      source,
      oldScore: current,
      newScore,
      successful
    });
  }

  /**
   * Get aggregated quality report
   */
  getQualityReport(metrics: DataQualityMetrics[]): any {
    if (metrics.length === 0) {
      return { overallScore: 0, summary: 'No data to evaluate' };
    }

    const avgReliability = metrics.reduce((sum, m) => sum + m.reliability, 0) / metrics.length;
    const avgCompleteness = metrics.reduce((sum, m) => sum + m.completeness, 0) / metrics.length;
    const avgAccuracy = metrics.reduce((sum, m) => sum + m.accuracy, 0) / metrics.length;
    const allIssues = metrics.flatMap(m => m.issues);
    const uniqueIssues = [...new Set(allIssues)];

    return {
      overallScore: Math.round(avgReliability),
      completeness: Math.round(avgCompleteness),
      accuracy: Math.round(avgAccuracy),
      sourcesEvaluated: metrics.length,
      totalIssues: allIssues.length,
      uniqueIssues: uniqueIssues.length,
      commonIssues: this.findCommonIssues(allIssues),
      sourceBreakdown: this.getSourceBreakdown(metrics),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Find most common issues
   */
  private findCommonIssues(issues: string[]): Array<{ issue: string; count: number }> {
    const counts = new Map<string, number>();
    
    issues.forEach(issue => {
      counts.set(issue, (counts.get(issue) || 0) + 1);
    });
    
    return Array.from(counts.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  /**
   * Get breakdown by source
   */
  private getSourceBreakdown(metrics: DataQualityMetrics[]): any {
    const sourceGroups = new Map<string, DataQualityMetrics[]>();
    
    metrics.forEach(metric => {
      if (!sourceGroups.has(metric.source)) {
        sourceGroups.set(metric.source, []);
      }
      sourceGroups.get(metric.source)!.push(metric);
    });
    
    const breakdown: any = {};
    
    sourceGroups.forEach((sourceMetrics, source) => {
      const avgReliability = sourceMetrics.reduce((sum, m) => sum + m.reliability, 0) / sourceMetrics.length;
      breakdown[source] = {
        count: sourceMetrics.length,
        avgReliability: Math.round(avgReliability),
        issues: sourceMetrics.reduce((sum, m) => sum + m.issues.length, 0),
      };
    });
    
    return breakdown;
  }
}

export default DataQualityValidator;
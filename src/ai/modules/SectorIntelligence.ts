/**
 * Sector Intelligence AI Module
 * Uses GPT-4-turbo for sector-specific analysis with detailed prompt templates
 */

import { openAIClient } from '../../config/openai.js';
import { redisClientInstance as redisClient } from '../../config/redis.js';
import { loggerUtils } from '../../config/logger.js';
import { DataHub } from '../../api/DataHub.js';

export interface SectorAnalysisInput {
  symbol: string;
  sector_classification: string;
  recent_news: Array<{
    title: string;
    summary: string;
    publishedAt: string;
    source: string;
    marketImpact: number;
  }>;
  macro_indicators: {
    interest_rates?: number;
    oil_price?: number;
    vix?: number;
    dxy?: number;
    sector_etf_performance?: number;
  };
  peer_data: Array<{
    symbol: string;
    price_change_1d: number;
    price_change_5d: number;
    market_cap?: number;
  }>;
  technical_indicators?: {
    rsi?: number;
    sma_20?: number;
    sma_50?: number;
    volume_avg_10d?: number;
  };
}

export interface SectorAnalysisOutput {
  symbol: string;
  sector: string;
  timestamp: number;
  analysis: {
    drivers: string[];
    peer_performance: {
      relative_strength: number;
      vs_sector: string;
      vs_market: string;
    };
    risk_trends: string[];
    sector_rotation_signal: 'bullish' | 'bearish' | 'neutral';
    time_horizon_outlook: string;
    confidence_score: number;
  };
  metadata: {
    model_used: string;
    processing_time: number;
    cache_hit: boolean;
    degraded_mode: boolean;
  };
}

export interface SectorPromptTemplate {
  system_prompt: string;
  user_prompt: string;
  examples: Array<{
    input: string;
    output: string;
  }>;
}

export class SectorIntelligence {
  private dataHub: DataHub;
  private cacheTimeout = 4 * 60 * 60; // 4 hours in seconds
  
  // Sector classification mapping
  private readonly sectorMappings = {
    semiconductors: ['SMH', 'SOXX', 'NVDA', 'AMD', 'INTC', 'TSM', 'AVGO', 'QCOM', 'MU', 'AMAT'],
    biotech: ['XBI', 'IBB', 'GILD', 'AMGN', 'BIIB', 'MRNA', 'BNTX', 'REGN', 'VRTX', 'ILMN'],
    financials: ['XLF', 'KRE', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BRK.B', 'V'],
    energy: ['XLE', 'XOP', 'CVX', 'XOM', 'COP', 'EOG', 'SLB', 'OXY', 'PXD', 'MPC'],
    technology: ['XLK', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'META', 'NFLX', 'CRM', 'ORCL', 'ADBE'],
    healthcare: ['XLV', 'JNJ', 'UNH', 'PFE', 'LLY', 'ABBV', 'TMO', 'DHR', 'CVS', 'MDT'],
    consumer_discretionary: ['XLY', 'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TJX', 'LOW', 'BKNG'],
    industrials: ['XLI', 'BA', 'HON', 'UPS', 'CAT', 'GE', 'MMM', 'LMT', 'RTX', 'DE'],
    materials: ['XLB', 'LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'DOW', 'DD', 'PPG'],
    utilities: ['XLU', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'PEG', 'XEL'],
    real_estate: ['XLRE', 'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'O', 'PSA', 'WELL', 'AVB'],
  };

  // OpenAI function calling schema
  private readonly sectorAnalysisSchema = {
    name: "analyze_sector_intelligence",
    description: "Analyze sector-specific drivers and trends for a stock",
    parameters: {
      type: "object",
      properties: {
        drivers: {
          type: "array",
          items: { type: "string" },
          description: "Key sector-specific drivers affecting the stock"
        },
        peer_performance: {
          type: "object",
          properties: {
            relative_strength: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Relative strength vs sector peers (0-1 scale)"
            },
            vs_sector: {
              type: "string",
              description: "Performance vs sector (e.g., '+2.3%', '-1.1%')"
            },
            vs_market: {
              type: "string",
              description: "Performance vs overall market (e.g., '+0.8%', '-2.1%')"
            }
          },
          required: ["relative_strength", "vs_sector", "vs_market"]
        },
        risk_trends: {
          type: "array",
          items: { type: "string" },
          description: "Current risk trends and concerns for the sector"
        },
        sector_rotation_signal: {
          type: "string",
          enum: ["bullish", "bearish", "neutral"],
          description: "Overall sector rotation signal"
        },
        time_horizon_outlook: {
          type: "string",
          description: "Time horizon for the analysis (e.g., '1-3 days', '1-2 weeks', '1-3 months')"
        },
        confidence_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence in the analysis (0-1 scale)"
        }
      },
      required: ["drivers", "peer_performance", "risk_trends", "sector_rotation_signal", "time_horizon_outlook", "confidence_score"]
    }
  };

  constructor(dataHub: DataHub) {
    this.dataHub = dataHub;
  }

  /**
   * Main analysis method
   */
  async analyzeSector(input: SectorAnalysisInput): Promise<SectorAnalysisOutput> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(input.symbol, input.sector_classification);
    
    try {
      // Check cache first
      const cachedResult = await this.getCachedAnalysis(cacheKey);
      if (cachedResult) {
        loggerUtils.aiLogger.info('Sector analysis cache hit', {
          symbol: input.symbol,
          sector: input.sector_classification,
        });
        
        return {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            cache_hit: true,
            processing_time: Date.now() - startTime,
          }
        };
      }

      // Perform fresh analysis
      const analysis = await this.performSectorAnalysis(input);
      
      // Cache the result
      await this.cacheAnalysis(cacheKey, analysis);
      
      const result: SectorAnalysisOutput = {
        symbol: input.symbol,
        sector: input.sector_classification,
        timestamp: Date.now(),
        analysis,
        metadata: {
          model_used: 'gpt-4-turbo',
          processing_time: Date.now() - startTime,
          cache_hit: false,
          degraded_mode: false,
        }
      };

      // Log the analysis decision
      this.logAnalysisDecision(result);
      
      return result;
    } catch (error) {
      loggerUtils.aiLogger.error('Sector analysis failed', {
        symbol: input.symbol,
        sector: input.sector_classification,
        error: (error as Error).message,
      });

      // Return degraded analysis
      return this.getDegradedAnalysis(input, Date.now() - startTime);
    }
  }

  /**
   * Perform sector-specific analysis using GPT-4-turbo
   */
  private async performSectorAnalysis(input: SectorAnalysisInput): Promise<any> {
    const sector = this.normalizeSectorName(input.sector_classification);
    const promptTemplate = this.getSectorPromptTemplate(sector);
    
    // Prepare the analysis prompt
    const systemPrompt = promptTemplate.system_prompt;
    const userPrompt = this.buildUserPrompt(input, promptTemplate);

    try {
      const response = await openAIClient.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: this.sectorAnalysisSchema
        }],
        tool_choice: { type: 'function', function: { name: 'analyze_sector_intelligence' } },
        temperature: 0.1,
        max_tokens: 1000,
      });

      if (response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        const analysis = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        return this.validateAndEnhanceAnalysis(analysis, input);
      }

      throw new Error('No function call response received');
    } catch (error) {
      loggerUtils.aiLogger.error('OpenAI API call failed', {
        symbol: input.symbol,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get sector-specific prompt templates
   */
  private getSectorPromptTemplate(sector: string): SectorPromptTemplate {
    const templates: Record<string, SectorPromptTemplate> = {
      semiconductors: {
        system_prompt: `You are a semiconductor sector specialist AI. Focus on:
- Chip cycles and demand patterns (AI, datacenter, mobile, automotive)
- Supply chain constraints and geopolitical impacts
- Inventory levels and pricing dynamics
- Technology transitions (node shrinks, packaging innovations)
- Capital expenditure cycles and fab utilization
- China trade relations and export restrictions
- Memory vs logic dynamics
- Seasonal patterns in electronics demand

Provide precise, actionable insights with confidence scoring.`,
        
        user_prompt: `Analyze semiconductor stock {symbol} given current market conditions.`,
        
        examples: [
          {
            input: "NVDA with strong AI chip demand and datacenter growth",
            output: `{
              "drivers": ["AI chip demand surge", "datacenter GPU shortages", "automotive design wins"],
              "peer_performance": {"relative_strength": 0.85, "vs_sector": "+3.2%", "vs_market": "+1.8%"},
              "risk_trends": ["China export restrictions", "inventory normalization", "competitive pressure"],
              "sector_rotation_signal": "bullish",
              "time_horizon_outlook": "1-3 months",
              "confidence_score": 0.82
            }`
          }
        ]
      },

      biotech: {
        system_prompt: `You are a biotech sector specialist AI. Focus on:
- FDA approval timelines and PDUFA dates
- Clinical trial results and statistical significance
- Patent cliffs and generic competition
- Regulatory environment changes
- Drug pricing pressures and Medicare negotiations
- Pipeline value and R&D productivity
- Merger and acquisition activity
- Breakthrough therapy designations
- Orphan drug opportunities

Provide precise, actionable insights with confidence scoring.`,
        
        user_prompt: `Analyze biotech stock {symbol} given current regulatory and clinical environment.`,
        
        examples: [
          {
            input: "MRNA with mRNA platform expansion beyond COVID",
            output: `{
              "drivers": ["mRNA platform diversification", "cancer vaccine trials", "seasonal vaccine demand"],
              "peer_performance": {"relative_strength": 0.72, "vs_sector": "+1.8%", "vs_market": "-0.3%"},
              "risk_trends": ["COVID vaccine revenue decline", "regulatory scrutiny", "competition from traditional vaccines"],
              "sector_rotation_signal": "neutral",
              "time_horizon_outlook": "2-6 months",
              "confidence_score": 0.68
            }`
          }
        ]
      },

      financials: {
        system_prompt: `You are a financial sector specialist AI. Focus on:
- Interest rate sensitivity and net interest margin expansion/compression
- Credit conditions and loan loss provisions
- Regulatory changes and capital requirements
- Fee income trends and trading revenues
- Digital transformation and fintech competition
- Regional banking stress and deposit flows
- Insurance underwriting cycles and catastrophe exposure
- Payment processing volumes and interchange fees
- Commercial real estate exposure

Provide precise, actionable insights with confidence scoring.`,
        
        user_prompt: `Analyze financial stock {symbol} given current interest rate and credit environment.`,
        
        examples: [
          {
            input: "JPM with rising rates and stable credit conditions",
            output: `{
              "drivers": ["net interest margin expansion", "stable credit quality", "trading revenue strength"],
              "peer_performance": {"relative_strength": 0.78, "vs_sector": "+2.1%", "vs_market": "+0.9%"},
              "risk_trends": ["commercial real estate exposure", "regulatory capital requirements", "deposit competition"],
              "sector_rotation_signal": "bullish",
              "time_horizon_outlook": "1-2 quarters",
              "confidence_score": 0.75
            }`
          }
        ]
      },

      energy: {
        system_prompt: `You are an energy sector specialist AI. Focus on:
- Oil and gas price dynamics and supply/demand balance
- Renewable energy transition and capex allocation
- Geopolitical events and production disruptions
- Seasonal patterns and refining margins
- ESG pressures and stranded asset risks
- Shale production efficiency and decline rates
- Natural gas pricing and LNG export capacity
- Carbon pricing and regulatory environment
- Energy infrastructure and pipeline capacity

Provide precise, actionable insights with confidence scoring.`,
        
        user_prompt: `Analyze energy stock {symbol} given current commodity and geopolitical environment.`,
        
        examples: [
          {
            input: "CVX with stable oil prices and strong cash flow",
            output: `{
              "drivers": ["oil price stability", "strong free cash flow", "shareholder returns"],
              "peer_performance": {"relative_strength": 0.73, "vs_sector": "+1.5%", "vs_market": "+0.2%"},
              "risk_trends": ["renewable energy transition", "ESG pressure", "geopolitical volatility"],
              "sector_rotation_signal": "neutral",
              "time_horizon_outlook": "1-3 months",
              "confidence_score": 0.71
            }`
          }
        ]
      },

      technology: {
        system_prompt: `You are a technology sector specialist AI. Focus on:
- Cloud computing growth and market share dynamics
- Software-as-a-Service adoption and pricing power
- Artificial intelligence implementation and monetization
- Cybersecurity threats and solution demand
- Digital transformation acceleration
- Platform economics and network effects
- Regulatory scrutiny and antitrust concerns
- Supply chain disruptions for hardware
- Consumer vs enterprise spending patterns

Provide precise, actionable insights with confidence scoring.`,
        
        user_prompt: `Analyze technology stock {symbol} given current innovation and regulatory landscape.`,
        
        examples: [
          {
            input: "MSFT with strong cloud growth and AI integration",
            output: `{
              "drivers": ["Azure cloud acceleration", "AI integration across products", "enterprise digital transformation"],
              "peer_performance": {"relative_strength": 0.82, "vs_sector": "+2.8%", "vs_market": "+1.5%"},
              "risk_trends": ["regulatory scrutiny", "cloud competition", "enterprise spending uncertainty"],
              "sector_rotation_signal": "bullish",
              "time_horizon_outlook": "1-6 months",
              "confidence_score": 0.84
            }`
          }
        ]
      }
    };

    return templates[sector] || this.getGenericPromptTemplate();
  }

  /**
   * Build user prompt with structured data
   */
  private buildUserPrompt(input: SectorAnalysisInput, template: SectorPromptTemplate): string {
    const newsStr = input.recent_news.map(news => 
      `- ${news.title} (${news.source}, Impact: ${news.marketImpact.toFixed(2)})`
    ).join('\n');

    const peerStr = input.peer_data.map(peer => 
      `- ${peer.symbol}: 1D: ${peer.price_change_1d.toFixed(2)}%, 5D: ${peer.price_change_5d.toFixed(2)}%`
    ).join('\n');

    const macroStr = Object.entries(input.macro_indicators)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    const technicalStr = input.technical_indicators ? 
      Object.entries(input.technical_indicators)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n') : 'No technical data available';

    return template.user_prompt.replace('{symbol}', input.symbol) + `

STOCK: ${input.symbol}
SECTOR: ${input.sector_classification}

RECENT NEWS:
${newsStr}

PEER PERFORMANCE:
${peerStr}

MACRO INDICATORS:
${macroStr}

TECHNICAL INDICATORS:
${technicalStr}

Analyze this stock within its sector context and provide structured insights using the required JSON format.`;
  }

  /**
   * Validate and enhance analysis output
   */
  private validateAndEnhanceAnalysis(analysis: any, input: SectorAnalysisInput): any {
    // Ensure all required fields are present
    const requiredFields = ['drivers', 'peer_performance', 'risk_trends', 'sector_rotation_signal', 'time_horizon_outlook', 'confidence_score'];
    
    for (const field of requiredFields) {
      if (!analysis[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate confidence score
    if (analysis.confidence_score < 0 || analysis.confidence_score > 1) {
      analysis.confidence_score = Math.max(0, Math.min(1, analysis.confidence_score));
    }

    // Validate relative strength
    if (analysis.peer_performance?.relative_strength < 0 || analysis.peer_performance?.relative_strength > 1) {
      analysis.peer_performance.relative_strength = Math.max(0, Math.min(1, analysis.peer_performance.relative_strength));
    }

    // Enhance with sector-specific insights
    return this.addSectorSpecificInsights(analysis, input);
  }

  /**
   * Add sector-specific insights
   */
  private addSectorSpecificInsights(analysis: any, input: SectorAnalysisInput): any {
    const sector = this.normalizeSectorName(input.sector_classification);
    
    // Add sector-specific context
    switch (sector) {
      case 'semiconductors':
        if (!analysis.drivers.some((d: string) => d.includes('AI') || d.includes('chip'))) {
          analysis.drivers.push('Semiconductor cycle dynamics');
        }
        break;
      
      case 'biotech':
        if (!analysis.drivers.some((d: string) => d.includes('FDA') || d.includes('trial'))) {
          analysis.drivers.push('Regulatory pathway considerations');
        }
        break;
      
      case 'financials':
        if (!analysis.drivers.some((d: string) => d.includes('rate') || d.includes('credit'))) {
          analysis.drivers.push('Interest rate environment impact');
        }
        break;
      
      case 'energy':
        if (!analysis.drivers.some((d: string) => d.includes('oil') || d.includes('commodity'))) {
          analysis.drivers.push('Commodity price sensitivity');
        }
        break;
    }

    return analysis;
  }

  /**
   * Cache analysis results
   */
  private async cacheAnalysis(cacheKey: string, analysis: any): Promise<void> {
    try {
      const client = redisClient();
      if (client) {
        await client.setex(cacheKey, this.cacheTimeout, JSON.stringify(analysis));
        loggerUtils.aiLogger.debug('Sector analysis cached', { cacheKey });
      }
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to cache sector analysis', {
        cacheKey,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get cached analysis
   */
  private async getCachedAnalysis(cacheKey: string): Promise<any | null> {
    try {
      const client = redisClient();
      if (client) {
        const cached = await client.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
      }
      return null;
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to retrieve cached analysis', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(symbol: string, sector: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `sector:${symbol}:${sector}:${date}`;
  }

  /**
   * Normalize sector name
   */
  private normalizeSectorName(sector: string): string {
    const normalized = sector.toLowerCase().replace(/[^a-z]/g, '_');
    
    // Map common variations
    const mappings: Record<string, string> = {
      'information_technology': 'technology',
      'tech': 'technology',
      'biotech': 'biotech',
      'biotechnology': 'biotech',
      'pharmaceutical': 'biotech',
      'pharma': 'biotech',
      'semiconductor': 'semiconductors',
      'chips': 'semiconductors',
      'financial': 'financials',
      'banks': 'financials',
      'banking': 'financials',
      'oil_gas': 'energy',
      'oil': 'energy',
      'consumer_disc': 'consumer_discretionary',
      'consumer_staples': 'consumer_discretionary',
    };

    return mappings[normalized] || normalized;
  }

  /**
   * Get generic prompt template for unknown sectors
   */
  private getGenericPromptTemplate(): SectorPromptTemplate {
    return {
      system_prompt: `You are a financial sector analysis AI. Analyze the given stock within its sector context, focusing on:
- Key sector-specific drivers and trends
- Peer performance comparison
- Risk factors and opportunities
- Market rotation signals
- Technical and fundamental factors

Provide precise, actionable insights with confidence scoring.`,
      
      user_prompt: `Analyze stock {symbol} given current market conditions and sector dynamics.`,
      
      examples: [
        {
          input: "Generic stock analysis request",
          output: `{
            "drivers": ["sector-specific factor 1", "sector-specific factor 2"],
            "peer_performance": {"relative_strength": 0.65, "vs_sector": "+0.5%", "vs_market": "-0.2%"},
            "risk_trends": ["risk factor 1", "risk factor 2"],
            "sector_rotation_signal": "neutral",
            "time_horizon_outlook": "1-4 weeks",
            "confidence_score": 0.60
          }`
        }
      ]
    };
  }

  /**
   * Get degraded analysis when AI fails
   */
  private getDegradedAnalysis(input: SectorAnalysisInput, processingTime: number): SectorAnalysisOutput {
    const sector = this.normalizeSectorName(input.sector_classification);
    
    // Calculate simple peer performance
    const avgPeerChange = input.peer_data.reduce((sum, peer) => sum + peer.price_change_1d, 0) / input.peer_data.length;
    const relativeStrength = avgPeerChange > 0 ? 0.6 : 0.4;

    // Generate basic drivers based on sector
    const sectorDrivers: Record<string, string[]> = {
      semiconductors: ['Chip demand cycles', 'Supply chain status'],
      biotech: ['Regulatory environment', 'Pipeline developments'],
      financials: ['Interest rate environment', 'Credit conditions'],
      energy: ['Commodity prices', 'Geopolitical factors'],
      technology: ['Digital transformation', 'Innovation cycles'],
    };

    const drivers = sectorDrivers[sector] || ['Market conditions', 'Sector dynamics'];

    loggerUtils.aiLogger.info('Using degraded sector analysis', {
      symbol: input.symbol,
      sector: input.sector_classification,
    });

    return {
      symbol: input.symbol,
      sector: input.sector_classification,
      timestamp: Date.now(),
      analysis: {
        drivers,
        peer_performance: {
          relative_strength: relativeStrength,
          vs_sector: `${avgPeerChange >= 0 ? '+' : ''}${avgPeerChange.toFixed(1)}%`,
          vs_market: "0.0%"
        },
        risk_trends: ['Market volatility', 'Sector-specific risks'],
        sector_rotation_signal: 'neutral' as const,
        time_horizon_outlook: '1-2 weeks',
        confidence_score: 0.3, // Low confidence for degraded mode
      },
      metadata: {
        model_used: 'degraded_analysis',
        processing_time: processingTime,
        cache_hit: false,
        degraded_mode: true,
      }
    };
  }

  /**
   * Log analysis decisions for audit trail
   */
  private logAnalysisDecision(result: SectorAnalysisOutput): void {
    loggerUtils.aiLogger.info('Sector analysis completed', {
      symbol: result.symbol,
      sector: result.sector,
      timestamp: result.timestamp,
      signal: result.analysis.sector_rotation_signal,
      confidence: result.analysis.confidence_score,
      drivers_count: result.analysis.drivers.length,
      risk_trends_count: result.analysis.risk_trends.length,
      relative_strength: result.analysis.peer_performance.relative_strength,
      processing_time: result.metadata.processing_time,
      cache_hit: result.metadata.cache_hit,
      degraded_mode: result.metadata.degraded_mode,
    });
  }

  /**
   * Get sector classification for a symbol
   */
  async getSectorClassification(symbol: string): Promise<string> {
    try {
      // Try to get sector from company profile
      // Finnhub disabled - skip profile check
      // const profile = await this.dataHub.finnhubClient.getCompanyProfile(symbol);
      // 
      // if (profile?.finnhubIndustry) {
      //   return this.mapIndustryToSector(profile.finnhubIndustry);
      // }

      // Fallback: check if symbol is in any of our sector mappings
      for (const [sector, symbols] of Object.entries(this.sectorMappings)) {
        if (symbols.includes(symbol.toUpperCase())) {
          return sector;
        }
      }

      return 'unknown';
    } catch (error) {
      loggerUtils.aiLogger.warn('Failed to get sector classification', {
        symbol,
        error: (error as Error).message,
      });
      return 'unknown';
    }
  }

  /**
   * Map industry to sector
   */
  private mapIndustryToSector(industry: string): string {
    const industryLower = industry.toLowerCase();
    
    if (industryLower.includes('semiconductor') || industryLower.includes('chip')) {
      return 'semiconductors';
    }
    if (industryLower.includes('biotech') || industryLower.includes('pharmaceutical')) {
      return 'biotech';
    }
    if (industryLower.includes('bank') || industryLower.includes('financial')) {
      return 'financials';
    }
    if (industryLower.includes('energy') || industryLower.includes('oil')) {
      return 'energy';
    }
    if (industryLower.includes('technology') || industryLower.includes('software')) {
      return 'technology';
    }
    if (industryLower.includes('healthcare') || industryLower.includes('medical')) {
      return 'healthcare';
    }
    
    return 'technology'; // Default fallback
  }

  /**
   * Batch analyze multiple symbols
   */
  async batchAnalyzeSectors(inputs: SectorAnalysisInput[]): Promise<SectorAnalysisOutput[]> {
    const results: SectorAnalysisOutput[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(input => this.analyzeSector(input));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          loggerUtils.aiLogger.error('Batch analysis failed for symbol', {
            symbol: batch[index].symbol,
            error: result.reason,
          });
          
          // Add degraded analysis for failed symbol
          results.push(this.getDegradedAnalysis(batch[index], 0));
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
   * Get sector rotation recommendations
   */
  async getSectorRotationRecommendations(): Promise<Array<{
    sector: string;
    signal: 'bullish' | 'bearish' | 'neutral';
    strength: number;
    rationale: string[];
  }>> {
    const sectors = Object.keys(this.sectorMappings);
    const recommendations: Array<{
      sector: string;
      signal: 'bullish' | 'bearish' | 'neutral';
      strength: number;
      rationale: string[];
    }> = [];

    for (const sector of sectors) {
      try {
        // Get representative ETF for the sector
        const etfSymbol = this.sectorMappings[sector as keyof typeof this.sectorMappings][0];
        
        // Prepare input for sector analysis
        const input: SectorAnalysisInput = {
          symbol: etfSymbol,
          sector_classification: sector,
          recent_news: [],
          macro_indicators: {},
          peer_data: [],
        };

        const analysis = await this.analyzeSector(input);
        
        recommendations.push({
          sector,
          signal: analysis.analysis.sector_rotation_signal,
          strength: analysis.analysis.confidence_score,
          rationale: analysis.analysis.drivers,
        });
      } catch (error) {
        loggerUtils.aiLogger.warn('Failed to get sector rotation for sector', {
          sector,
          error: (error as Error).message,
        });
      }
    }

    return recommendations.sort((a, b) => b.strength - a.strength);
  }
}

export default SectorIntelligence;
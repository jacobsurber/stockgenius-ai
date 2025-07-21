import OpenAI from 'openai';
import env, { envUtils } from './env.js';
import { logHelpers } from './logger.js';

/**
 * OpenAI model configurations with rate limits and pricing
 */
export const modelConfigs = {
  'gpt-3.5-turbo': {
    maxTokens: 4096,
    contextWindow: 16385,
    costPer1kTokens: {
      input: 0.0015,
      output: 0.002,
    },
    rateLimit: {
      requestsPerMinute: env.OPENAI_GPT35_RATE_LIMIT,
      tokensPerMinute: 90000,
      requestsPerDay: 10000,
    },
    capabilities: {
      chat: true,
      completion: true,
      streaming: true,
      functionCalling: true,
      jsonMode: true,
    },
    useCases: [
      'quick_analysis',
      'sentiment_analysis',
      'basic_insights',
      'data_processing',
    ],
  },

  'gpt-4-turbo-preview': {
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kTokens: {
      input: 0.01,
      output: 0.03,
    },
    rateLimit: {
      requestsPerMinute: env.OPENAI_GPT4_RATE_LIMIT,
      tokensPerMinute: 150000,
      requestsPerDay: 5000,
    },
    capabilities: {
      chat: true,
      completion: true,
      streaming: true,
      functionCalling: true,
      jsonMode: true,
      vision: false,
    },
    useCases: [
      'deep_analysis',
      'complex_reasoning',
      'strategic_insights',
      'risk_assessment',
      'portfolio_optimization',
    ],
  },

  'gpt-4o': {
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kTokens: {
      input: 0.005,
      output: 0.015,
    },
    rateLimit: {
      requestsPerMinute: env.OPENAI_GPT4O_RATE_LIMIT,
      tokensPerMinute: 30000,
      requestsPerDay: 10000,
    },
    capabilities: {
      chat: true,
      completion: true,
      streaming: true,
      functionCalling: true,
      jsonMode: true,
      vision: true,
      multimodal: true,
    },
    useCases: [
      'multimodal_analysis',
      'chart_analysis',
      'document_processing',
      'comprehensive_insights',
      'real_time_analysis',
    ],
  },

  'gpt-4o-mini': {
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kTokens: {
      input: 0.00015,
      output: 0.0006,
    },
    rateLimit: {
      requestsPerMinute: env.OPENAI_GPT4O_RATE_LIMIT,
      tokensPerMinute: 200000,
      requestsPerDay: 10000,
    },
    capabilities: {
      chat: true,
      completion: true,
      streaming: true,
      functionCalling: true,
      jsonMode: true,
      vision: true,
      multimodal: true,
    },
    useCases: [
      'cost_effective_analysis',
      'high_volume_processing',
      'basic_multimodal',
      'batch_operations',
    ],
  },
};

/**
 * Initialize OpenAI client
 */
let openaiClient = null;

const initializeOpenAI = () => {
  if (!env.OPENAI_API_KEY || !envUtils.hasValidApiKey('openai')) {
    console.warn('OpenAI API key not configured - AI features will be disabled');
    return null;
  }

  try {
    const client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 60000, // 60 seconds
      maxRetries: 3,
    });

    logHelpers.logConfigWarning('OpenAI client initialized', {
      defaultModel: env.OPENAI_MODEL,
      availableModels: Object.keys(modelConfigs),
    });

    return client;
  } catch (error) {
    logHelpers.logConfigWarning('Failed to initialize OpenAI client', {
      error: error.message,
    });
    return null;
  }
};

// Initialize the client immediately
openaiClient = initializeOpenAI();

/**
 * Model router - selects appropriate model based on use case and requirements
 */
export class ModelRouter {
  constructor() {
    this.client = initializeOpenAI();
    this.defaultModel = env.OPENAI_MODEL;
    this.usageTracking = new Map();
  }

  /**
   * Select optimal model for a given use case
   */
  selectModel(useCase, options = {}) {
    const {
      complexity = 'medium',
      budget = 'medium',
      speed = 'medium',
      requiresVision = false,
      maxTokens = 2000,
    } = options;

    // If vision is required, use vision-capable models
    if (requiresVision) {
      return complexity === 'high' ? 'gpt-4o' : 'gpt-4o-mini';
    }

    // Route based on use case
    const modelPriority = {
      quick_analysis: ['gpt-3.5-turbo', 'gpt-4o-mini'],
      sentiment_analysis: ['gpt-3.5-turbo', 'gpt-4o-mini'],
      basic_insights: ['gpt-3.5-turbo', 'gpt-4o-mini'],
      deep_analysis: ['gpt-4-turbo-preview', 'gpt-4o'],
      complex_reasoning: ['gpt-4-turbo-preview', 'gpt-4o'],
      strategic_insights: ['gpt-4-turbo-preview', 'gpt-4o'],
      risk_assessment: ['gpt-4-turbo-preview', 'gpt-4o'],
      portfolio_optimization: ['gpt-4-turbo-preview', 'gpt-4o'],
      multimodal_analysis: ['gpt-4o', 'gpt-4o-mini'],
      cost_effective_analysis: ['gpt-4o-mini', 'gpt-3.5-turbo'],
      high_volume_processing: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    };

    const candidates = modelPriority[useCase] || [this.defaultModel];

    // Filter by budget constraints
    if (budget === 'low') {
      return candidates.find(model => 
        modelConfigs[model]?.costPer1kTokens.input < 0.002
      ) || 'gpt-3.5-turbo';
    }

    if (budget === 'high') {
      return candidates[0] || this.defaultModel;
    }

    // Medium budget - balance cost and capability
    return candidates.find(model => 
      modelConfigs[model]?.costPer1kTokens.input < 0.01
    ) || candidates[0] || this.defaultModel;
  }

  /**
   * Get model configuration
   */
  getModelConfig(model) {
    return modelConfigs[model] || modelConfigs[this.defaultModel];
  }

  /**
   * Check if model supports feature
   */
  supportsFeature(model, feature) {
    const config = this.getModelConfig(model);
    return config?.capabilities?.[feature] || false;
  }

  /**
   * Calculate estimated cost for a request
   */
  estimateCost(model, inputTokens, outputTokens = 0) {
    const config = this.getModelConfig(model);
    if (!config) return 0;

    const inputCost = (inputTokens / 1000) * config.costPer1kTokens.input;
    const outputCost = (outputTokens / 1000) * config.costPer1kTokens.output;
    
    return inputCost + outputCost;
  }

  /**
   * Track usage for rate limiting and cost monitoring
   */
  trackUsage(model, inputTokens, outputTokens, cost) {
    const now = Date.now();
    const key = `${model}_${Math.floor(now / 60000)}`; // Per minute tracking

    if (!this.usageTracking.has(key)) {
      this.usageTracking.set(key, {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      });
    }

    const usage = this.usageTracking.get(key);
    usage.requests += 1;
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    usage.cost += cost;

    // Clean up old tracking data (keep last hour)
    const cutoff = now - 3600000; // 1 hour ago
    for (const [trackingKey, _] of this.usageTracking) {
      const timestamp = parseInt(trackingKey.split('_')[1]) * 60000;
      if (timestamp < cutoff) {
        this.usageTracking.delete(trackingKey);
      }
    }

    logHelpers.logAiAnalysis(null, 'usage_tracking', model, inputTokens + outputTokens, cost, {
      inputTokens,
      outputTokens,
      requests: usage.requests,
    });
  }

  /**
   * Check rate limits
   */
  checkRateLimit(model) {
    const config = this.getModelConfig(model);
    if (!config) return { allowed: false, reason: 'Invalid model' };

    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const key = `${model}_${currentMinute}`;
    const usage = this.usageTracking.get(key);

    if (!usage) return { allowed: true };

    if (usage.requests >= config.rateLimit.requestsPerMinute) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        resetTime: (currentMinute + 1) * 60000,
      };
    }

    if (usage.inputTokens + usage.outputTokens >= config.rateLimit.tokensPerMinute) {
      return {
        allowed: false,
        reason: 'Token rate limit exceeded',
        resetTime: (currentMinute + 1) * 60000,
      };
    }

    return { allowed: true };
  }
}

/**
 * AI Analysis service with intelligent model routing
 */
export class AIAnalysisService {
  constructor() {
    this.modelRouter = new ModelRouter();
    this.client = this.modelRouter.client;
  }

  /**
   * Analyze stock with appropriate model selection
   */
  async analyzeStock(symbol, data, analysisType = 'comprehensive') {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const model = this.modelRouter.selectModel(analysisType, {
      complexity: analysisType === 'comprehensive' ? 'high' : 'medium',
    });

    const rateCheck = this.modelRouter.checkRateLimit(model);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded: ${rateCheck.reason}`);
    }

    const prompt = this.buildAnalysisPrompt(symbol, data, analysisType);
    
    try {
      const startTime = Date.now();
      
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional financial analyst with expertise in stock analysis, technical indicators, and market trends.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: Math.min(env.OPENAI_MAX_TOKENS, this.modelRouter.getModelConfig(model).maxTokens),
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const duration = Date.now() - startTime;
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const cost = this.modelRouter.estimateCost(model, inputTokens, outputTokens);

      this.modelRouter.trackUsage(model, inputTokens, outputTokens, cost);

      logHelpers.logAiAnalysis(symbol, analysisType, model, inputTokens + outputTokens, cost, {
        duration,
        inputTokens,
        outputTokens,
      });

      return {
        analysis: JSON.parse(response.choices[0].message.content),
        metadata: {
          model,
          tokens: inputTokens + outputTokens,
          cost,
          duration,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logHelpers.logApiError('openai', analysisType, symbol, error);
      throw error;
    }
  }

  /**
   * Analyze sentiment from news or social media
   */
  async analyzeSentiment(text, context = 'news') {
    const model = this.modelRouter.selectModel('sentiment_analysis');
    
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'Analyze the sentiment of financial text and provide a JSON response with sentiment score from -1 (very negative) to 1 (very positive).',
        },
        {
          role: 'user',
          content: `Analyze the sentiment of this ${context} and respond with JSON: ${text}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Build analysis prompt based on data and type
   */
  buildAnalysisPrompt(symbol, data, analysisType) {
    const basePrompt = `Analyze ${symbol} stock with the following data:`;
    
    let dataSection = '';
    if (data.quote) {
      dataSection += `\nCurrent Quote: ${JSON.stringify(data.quote)}`;
    }
    if (data.profile) {
      dataSection += `\nCompany Profile: ${JSON.stringify(data.profile)}`;
    }
    if (data.news) {
      dataSection += `\nRecent News: ${JSON.stringify(data.news)}`;
    }
    if (data.financials) {
      dataSection += `\nFinancials: ${JSON.stringify(data.financials)}`;
    }

    const analysisRequests = {
      quick_analysis: 'Provide a brief analysis with key insights and recommendation.',
      comprehensive: 'Provide a comprehensive analysis including technical, fundamental, and sentiment analysis with detailed recommendations.',
      risk_assessment: 'Focus on risk factors, volatility analysis, and risk-adjusted recommendations.',
      technical: 'Focus on technical analysis, chart patterns, and momentum indicators.',
      fundamental: 'Focus on fundamental analysis, valuation metrics, and financial health.',
    };

    const request = analysisRequests[analysisType] || analysisRequests.comprehensive;

    return `${basePrompt}${dataSection}\n\n${request}\n\nProvide your response as a JSON object with the following structure:
{
  "symbol": "${symbol}",
  "recommendation": "buy|hold|sell",
  "confidence": 0.85,
  "targetPrice": 150.00,
  "risks": ["risk1", "risk2"],
  "opportunities": ["opp1", "opp2"],
  "summary": "Brief summary",
  "analysis": {
    "technical": "Technical analysis details",
    "fundamental": "Fundamental analysis details",
    "sentiment": "Sentiment analysis details"
  }
}`;
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    const stats = {};
    
    for (const [key, usage] of this.modelRouter.usageTracking) {
      const [model, minute] = key.split('_');
      if (!stats[model]) {
        stats[model] = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
        };
      }
      
      stats[model].requests += usage.requests;
      stats[model].inputTokens += usage.inputTokens;
      stats[model].outputTokens += usage.outputTokens;
      stats[model].cost += usage.cost;
    }
    
    return stats;
  }
}

// Export singleton instance
export const aiService = new AIAnalysisService();

// Export the openAI client instance for direct use
export const openAIClient = openaiClient;

export default {
  modelConfigs,
  ModelRouter,
  AIAnalysisService,
  aiService,
  openAIClient,
};
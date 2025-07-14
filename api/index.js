// Vercel serverless function for StockGenius
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Mock trade cards for now (to test deployment)
    const mockCards = [
      {
        id: 'demo_1',
        category: 'high_conviction',
        symbol: 'NVDA',
        confidence: 91,
        strategyType: 'AI Long Play',
        riskGrade: 'A',
        timeframe: 'swing',
        entry: { price: 890.50, timing: 'Immediate' },
        exits: {
          primary: { price: 965.00, reasoning: 'AI target: $74.50' },
          stop: { price: 845.98, reasoning: '5% stop loss' }
        },
        whyThisTrade: {
          mainThesis: 'AI-powered bullish signal with strong momentum indicators',
          keyPoints: [
            'AI Confidence: 91.0%',
            'Model: gpt-4o',
            'Target: $965.00',
            'Risk Grade: A'
          ],
          catalysts: [
            'AI sector leadership',
            'Technical breakout',
            'Strong earnings momentum',
            'Data center demand growth'
          ]
        }
      },
      {
        id: 'demo_2',
        category: 'momentum',
        symbol: 'UNH',
        confidence: 78,
        strategyType: 'Healthcare Rotation',
        riskGrade: 'A',
        timeframe: 'position',
        entry: { price: 521.30, timing: 'On dip' },
        exits: {
          primary: { price: 545.00, reasoning: 'AI target: $23.70' },
          stop: { price: 495.24, reasoning: '5% stop loss' }
        },
        whyThisTrade: {
          mainThesis: 'Defensive healthcare rotation with strong fundamentals',
          keyPoints: [
            'AI Confidence: 78.0%',
            'Model: gpt-3.5-turbo',
            'Target: $545.00',
            'Risk Grade: A'
          ],
          catalysts: [
            'Sector rotation',
            'Defensive positioning',
            'Stable cash flows',
            'Dividend growth'
          ]
        }
      },
      {
        id: 'demo_3',
        category: 'sentiment_play',
        symbol: 'JPM',
        confidence: 72,
        strategyType: 'Financial Strength',
        riskGrade: 'B',
        timeframe: 'swing',
        entry: { price: 218.45, timing: 'Market open' },
        exits: {
          primary: { price: 235.00, reasoning: 'AI target: $16.55' },
          stop: { price: 207.53, reasoning: '5% stop loss' }
        },
        whyThisTrade: {
          mainThesis: 'Interest rate environment favorable with improving credit quality',
          keyPoints: [
            'AI Confidence: 72.0%',
            'Model: gpt-3.5-turbo',
            'Target: $235.00',
            'Risk Grade: B'
          ],
          catalysts: [
            'Net interest margin expansion',
            'Credit normalization',
            'Capital return programs',
            'Economic strength'
          ]
        }
      }
    ];

    const result = {
      json: {
        timestamp: Date.now(),
        summary: {
          totalCards: mockCards.length,
          highConfidenceCards: mockCards.filter(c => c.confidence > 80).length,
          averageConfidence: Math.round(mockCards.reduce((sum, c) => sum + c.confidence, 0) / mockCards.length),
          categories: {
            high_conviction: mockCards.filter(c => c.category === 'high_conviction').length,
            momentum: mockCards.filter(c => c.category === 'momentum').length,
            sentiment_play: mockCards.filter(c => c.category === 'sentiment_play').length
          }
        },
        cards: mockCards
      },
      userPrefs: {
        sectors: ['Technology', 'Healthcare', 'Financial'],
        riskTolerance: 'moderate',
        timeHorizon: 'swing',
        maxCards: 5,
        analysisDepth: 'comprehensive'
      },
      watchlistInfo: {
        total: 8,
        sectors: ['Technology', 'Healthcare', 'Financial'],
        source: 'AI + Dynamic Selection'
      }
    };

    res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      timestamp: Date.now()
    });
  }
}
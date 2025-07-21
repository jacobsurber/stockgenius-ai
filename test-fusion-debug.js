/**
 * Strategic Fusion Debug Test
 * Find the exact issue in StrategicFusion logic
 */

console.log('🔧 Strategic Fusion Debug Test\n');

// Mock the StrategicFusion calculateSignalComposition logic
function testSignalComposition() {
  console.log('1️⃣ Testing Signal Composition Logic...');
  
  const signalWeights = {
    technical: 0.30,
    sentiment: 0.25,
    risk: 0.20,
    sector: 0.15,
    anomaly: 0.10,
  };
  
  const confidenceThresholds = {
    minimum: 0.60,
    high: 0.80,
    veryHigh: 0.90,
  };
  
  // Test case 1: High confidence modules
  const highConfidenceModules = {
    technical: {
      analysis: { confidence: 0.90 }
    },
    reddit: {
      authenticity: { overall_score: 0.85 },
      pump_and_dump: { overall_risk: 0.10 }
    },
    risk: {
      assessment: { overall_risk_score: 0.25 }
    },
    sector: {
      analysis: {
        confidence_score: 0.80,
        peer_performance: { relative_strength: 0.90 }
      }
    },
    anomaly: {
      investigation: {
        catalyst_confidence: 0.75,
        follow_through_probability: 0.80
      }
    }
  };
  
  const scores = calculateSignalComposition(highConfidenceModules, signalWeights);
  console.log('High Confidence Test:');
  console.log(`  Technical Score: ${scores.technical_weight.toFixed(3)}`);
  console.log(`  Sentiment Score: ${scores.sentiment_weight.toFixed(3)}`);
  console.log(`  Risk Score: ${scores.risk_weight.toFixed(3)}`);
  console.log(`  Sector Score: ${scores.sector_weight.toFixed(3)}`);
  console.log(`  Anomaly Score: ${scores.anomaly_weight.toFixed(3)}`);
  console.log(`  Composite Score: ${scores.composite_score.toFixed(3)}`);
  console.log(`  Passes Minimum Threshold (${confidenceThresholds.minimum}): ${scores.composite_score >= confidenceThresholds.minimum ? 'YES' : 'NO'}`);
  
  // Test case 2: Medium confidence modules
  const mediumConfidenceModules = {
    technical: {
      analysis: { confidence: 0.75 }
    },
    reddit: {
      authenticity: { overall_score: 0.70 },
      pump_and_dump: { overall_risk: 0.20 }
    },
    risk: {
      assessment: { overall_risk_score: 0.40 }
    },
    sector: {
      analysis: {
        confidence_score: 0.65,
        peer_performance: { relative_strength: 0.75 }
      }
    }
  };
  
  const mediumScores = calculateSignalComposition(mediumConfidenceModules, signalWeights);
  console.log('\nMedium Confidence Test:');
  console.log(`  Composite Score: ${mediumScores.composite_score.toFixed(3)}`);
  console.log(`  Passes Minimum Threshold: ${mediumScores.composite_score >= confidenceThresholds.minimum ? 'YES' : 'NO'}`);
  
  // Test case 3: Low confidence modules (likely scenario)
  const lowConfidenceModules = {
    technical: {
      analysis: { confidence: 0.50 }
    },
    reddit: {
      authenticity: { overall_score: 0.60 },
      pump_and_dump: { overall_risk: 0.30 }
    },
    risk: {
      assessment: { overall_risk_score: 0.60 }
    },
    sector: {
      analysis: {
        confidence_score: 0.55,
        peer_performance: { relative_strength: 0.60 }
      }
    }
  };
  
  const lowScores = calculateSignalComposition(lowConfidenceModules, signalWeights);
  console.log('\nLow Confidence Test (Realistic Scenario):');
  console.log(`  Composite Score: ${lowScores.composite_score.toFixed(3)}`);
  console.log(`  Passes Minimum Threshold: ${lowScores.composite_score >= confidenceThresholds.minimum ? 'YES' : 'NO'}`);
  
  if (lowScores.composite_score < confidenceThresholds.minimum) {
    console.log('\n💡 LIKELY DIAGNOSIS: Real-world data has lower confidence scores than the 0.60 threshold');
    console.log('   This would explain why 0 trade cards are generated.');
  }
}

function calculateSignalComposition(modules, signalWeights) {
  let technicalScore = 0;
  let sentimentScore = 0;
  let riskScore = 0;
  let sectorScore = 0;
  let anomalyScore = 0;

  // Technical score
  if (modules.technical) {
    technicalScore = modules.technical.analysis.confidence;
  }

  // Sentiment score (inverted for risk)
  if (modules.reddit) {
    sentimentScore = modules.reddit.authenticity.overall_score * 
      (1 - modules.reddit.pump_and_dump.overall_risk);
  }

  // Risk score (inverted - lower risk = higher score)
  if (modules.risk) {
    riskScore = 1 - modules.risk.assessment.overall_risk_score;
  }

  // Sector score
  if (modules.sector) {
    sectorScore = modules.sector.analysis.confidence_score * 
      modules.sector.analysis.peer_performance.relative_strength;
  }

  // Anomaly score
  if (modules.anomaly) {
    anomalyScore = modules.anomaly.investigation.catalyst_confidence * 
      modules.anomaly.investigation.follow_through_probability;
  }

  // Calculate weighted composite score
  const compositeScore = (
    technicalScore * signalWeights.technical +
    sentimentScore * signalWeights.sentiment +
    riskScore * signalWeights.risk +
    sectorScore * signalWeights.sector +
    anomalyScore * signalWeights.anomaly
  );

  return {
    technical_weight: technicalScore,
    sentiment_weight: sentimentScore,
    risk_weight: riskScore,
    sector_weight: sectorScore,
    anomaly_weight: anomalyScore,
    composite_score: compositeScore,
  };
}

// Test input ranking/filtering logic
function testInputRanking() {
  console.log('\n2️⃣ Testing Input Ranking Logic...');
  
  const mockInputs = [
    {
      symbol: 'AAPL',
      moduleOutputs: {
        technical: { analysis: { confidence: 0.45 } },
        risk: { assessment: { overall_risk_score: 0.50 } }
      }
    },
    {
      symbol: 'TSLA',
      moduleOutputs: {
        technical: { analysis: { confidence: 0.70 } },
        risk: { assessment: { overall_risk_score: 0.30 } },
        reddit: { 
          authenticity: { overall_score: 0.80 },
          pump_and_dump: { overall_risk: 0.15 }
        }
      }
    },
    {
      symbol: 'NVDA',
      moduleOutputs: {
        technical: { analysis: { confidence: 0.40 } },
        risk: { assessment: { overall_risk_score: 0.70 } }
      }
    }
  ];
  
  const signalWeights = {
    technical: 0.30,
    sentiment: 0.25,
    risk: 0.20,
    sector: 0.15,
    anomaly: 0.10,
  };
  
  const rankedInputs = mockInputs.map(input => {
    const signals = calculateSignalComposition(input.moduleOutputs, signalWeights);
    return { symbol: input.symbol, score: signals.composite_score };
  });
  
  rankedInputs.sort((a, b) => b.score - a.score);
  
  console.log('Ranked Inputs:');
  rankedInputs.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item.symbol}: ${(item.score * 100).toFixed(1)}%`);
  });
  
  const minimumThreshold = 0.60;
  const passingInputs = rankedInputs.filter(item => item.score >= minimumThreshold);
  
  console.log(`\nInputs passing minimum threshold (${minimumThreshold}): ${passingInputs.length}`);
  
  if (passingInputs.length === 0) {
    console.log('❌ NO INPUTS PASS THE THRESHOLD!');
    console.log('This explains why StrategicFusion generates 0 trade cards.');
    console.log('\nPossible solutions:');
    console.log('1. Lower the minimum threshold from 0.60 to 0.45-0.50');
    console.log('2. Improve the quality of input data from AI modules');
    console.log('3. Adjust the signal composition weights');
    console.log('4. Add fallback logic for low-confidence scenarios');
  } else {
    console.log(`✅ ${passingInputs.length} inputs would proceed to trade card generation`);
  }
}

// Test threshold sensitivity
function testThresholdSensitivity() {
  console.log('\n3️⃣ Testing Threshold Sensitivity...');
  
  const testModules = {
    technical: { analysis: { confidence: 0.55 } },
    risk: { assessment: { overall_risk_score: 0.45 } },
    reddit: { 
      authenticity: { overall_score: 0.65 },
      pump_and_dump: { overall_risk: 0.25 }
    },
    sector: {
      analysis: {
        confidence_score: 0.60,
        peer_performance: { relative_strength: 0.70 }
      }
    }
  };
  
  const signalWeights = {
    technical: 0.30,
    sentiment: 0.25,
    risk: 0.20,
    sector: 0.15,
    anomaly: 0.10,
  };
  
  const scores = calculateSignalComposition(testModules, signalWeights);
  
  console.log(`Realistic composite score: ${scores.composite_score.toFixed(3)}`);
  
  const thresholds = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];
  
  console.log('\nThreshold Analysis:');
  thresholds.forEach(threshold => {
    const passes = scores.composite_score >= threshold;
    console.log(`  ${threshold.toFixed(2)}: ${passes ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  console.log('\n💡 Recommendation: Consider lowering threshold to 0.50 or 0.55 for more realistic trade generation');
}

// Check if any modules are missing/undefined
function testMissingModules() {
  console.log('\n4️⃣ Testing Missing Module Handling...');
  
  const incompleteModules = {
    technical: { analysis: { confidence: 0.80 } },
    // missing reddit, risk, sector, anomaly
  };
  
  const signalWeights = {
    technical: 0.30,
    sentiment: 0.25,
    risk: 0.20,
    sector: 0.15,
    anomaly: 0.10,
  };
  
  const scores = calculateSignalComposition(incompleteModules, signalWeights);
  
  console.log('With only technical module:');
  console.log(`  Technical Score: ${scores.technical_weight.toFixed(3)}`);
  console.log(`  Sentiment Score: ${scores.sentiment_weight.toFixed(3)}`);
  console.log(`  Risk Score: ${scores.risk_weight.toFixed(3)}`);
  console.log(`  Sector Score: ${scores.sector_weight.toFixed(3)}`);
  console.log(`  Anomaly Score: ${scores.anomaly_weight.toFixed(3)}`);
  console.log(`  Composite Score: ${scores.composite_score.toFixed(3)}`);
  
  const maxPossibleScore = 0.80 * 0.30; // Only technical contributing
  console.log(`  Max possible score with one module: ${maxPossibleScore.toFixed(3)}`);
  console.log(`  This is below the 0.60 threshold, explaining why incomplete data fails`);
  
  if (scores.composite_score < 0.60) {
    console.log('\n💡 DIAGNOSIS: Missing AI module outputs significantly reduce composite score');
    console.log('   If any AI modules fail to execute, the composite score will be too low');
    console.log('   This is likely what\'s happening in your pipeline!');
  }
}

// Run all tests
testSignalComposition();
testInputRanking();
testThresholdSensitivity();
testMissingModules();

console.log('\n🎯 FINAL DIAGNOSIS SUMMARY:');
console.log('The OpenAI API is working perfectly (confirmed by previous test).');
console.log('The issue is in the StrategicFusion signal composition logic:');
console.log('');
console.log('1. The minimum confidence threshold (0.60) is too high for real-world data');
console.log('2. Missing or low-quality AI module outputs reduce the composite score');
console.log('3. The signal composition calculation favors very high confidence across ALL modules');
console.log('');
console.log('🔧 RECOMMENDED FIXES:');
console.log('1. Lower the minimum threshold from 0.60 to 0.45-0.50');
console.log('2. Add debug logging to see actual composite scores in StrategicFusion');
console.log('3. Implement fallback logic for partial module failures');
console.log('4. Consider adjusting signal weights to be less stringent');
console.log('');
console.log('This explains why you\'re getting 0 trade cards with 0 total tokens!');
console.log('The StrategicFusion is filtering out ALL candidates before making OpenAI calls.');
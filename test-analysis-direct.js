import { DataHub } from './dist/api/DataHub.js';
import { PromptOrchestrator } from './dist/ai/PromptOrchestrator.js';
import { TradeCardGenerator } from './dist/trading/TradeCardGenerator.js';

async function testAnalysis() {
  try {
    console.log('Testing direct analysis...\n');
    
    // Initialize components
    const dataHub = new DataHub();
    const orchestrator = new PromptOrchestrator();
    const cardGenerator = new TradeCardGenerator();
    
    // Test with a single symbol
    const symbol = 'AAPL';
    console.log(`Testing analysis for ${symbol}...`);
    
    // Get data from working APIs only (skip Finnhub)
    const quotes = await dataHub.getMultiSourceData(
      { symbols: [symbol], dataType: 'quote' },
      ['polygon', 'alphavantage', 'yahoo']  // Skip finnhub
    );
    
    console.log('Quote data received:', quotes);
    
    if (quotes && quotes.length > 0) {
      console.log('\n✅ Data collection successful!');
      console.log('Processing with AI...');
      
      // Run AI analysis
      const fusionOutput = await orchestrator.runFusionAnalysis([symbol], 'medium');
      console.log('\nFusion analysis result:', fusionOutput);
      
      if (fusionOutput && fusionOutput.cards && fusionOutput.cards.length > 0) {
        console.log('\n✅ AI analysis successful!');
        console.log(`Generated ${fusionOutput.cards.length} trade cards`);
        
        // Generate formatted cards
        const formattedOutput = await cardGenerator.generateDailyCards(fusionOutput.cards);
        console.log('\n✅ Trade cards formatted successfully!');
      } else {
        console.log('\n❌ No trade cards generated');
      }
    } else {
      console.log('\n❌ No data received from APIs');
    }
    
  } catch (error) {
    console.error('\n❌ Analysis failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAnalysis().catch(console.error);
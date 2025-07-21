import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testAPIs() {
  console.log('Testing API Keys...\n');

  // Test Finnhub
  try {
    console.log('Testing Finnhub API...');
    const finnhubResponse = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${process.env.FINNHUB_API_KEY}`
    );
    console.log('✅ Finnhub API: Working');
    console.log('Response:', finnhubResponse.data);
  } catch (error) {
    console.log('❌ Finnhub API: Failed');
    console.log('Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }

  console.log('\n-------------------\n');

  // Test Polygon
  try {
    console.log('Testing Polygon API...');
    const polygonResponse = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${process.env.POLYGON_API_KEY}`
    );
    console.log('✅ Polygon API: Working');
    console.log('Response:', polygonResponse.data);
  } catch (error) {
    console.log('❌ Polygon API: Failed');
    console.log('Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }

  console.log('\n-------------------\n');

  // Test Alpha Vantage
  try {
    console.log('Testing Alpha Vantage API...');
    const alphaResponse = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
    );
    console.log('✅ Alpha Vantage API: Working');
    console.log('Response:', alphaResponse.data);
  } catch (error) {
    console.log('❌ Alpha Vantage API: Failed');
    console.log('Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
    }
  }

  console.log('\n-------------------\n');

  // Test OpenAI
  try {
    console.log('Testing OpenAI API...');
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ OpenAI API: Working');
  } catch (error) {
    console.log('❌ OpenAI API: Failed');
    console.log('Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

testAPIs().catch(console.error);
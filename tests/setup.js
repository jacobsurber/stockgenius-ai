import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Initialize test database
  process.env.DATABASE_URL = ':memory:';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
});

afterAll(async () => {
  // Cleanup after all tests
});

// Global test utilities
global.testUtils = {
  // Mock API responses
  mockFinnhubResponse: {
    c: 150.25,
    d: 2.15,
    dp: 1.45,
    h: 151.00,
    l: 148.50,
    o: 149.00,
    pc: 148.10,
    t: Date.now() / 1000,
  },
  
  mockAlphaVantageResponse: {
    Symbol: 'AAPL',
    Name: 'Apple Inc',
    MarketCapitalization: '2500000000000',
    PERatio: '25.5',
  },
  
  // Test stock symbols
  testSymbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'],
  
  // Mock user preferences
  mockUserPrefs: {
    theme: 'dark',
    default_symbol: 'AAPL',
    paper_trading_balance: '100000',
  },
};
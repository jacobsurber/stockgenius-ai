# 🚀 StockGenius

A comprehensive single-user stock analysis and trading platform with AI-powered insights, built with Node.js.

## ✨ Features

- **Real-time Stock Data**: Integration with Finnhub, Polygon.io, Alpha Vantage, and Quiver Quant
- **AI-Powered Analysis**: OpenAI GPT integration for sentiment analysis and trading insights
- **Paper Trading**: Simulate trades with virtual portfolio management
- **Watchlist Management**: Track your favorite stocks with custom alerts
- **Technical Analysis**: Built-in indicators and charting capabilities
- **News Sentiment**: Automated news analysis with sentiment scoring
- **Portfolio Tracking**: Real-time portfolio performance monitoring
- **Single-User Optimized**: Lightweight SQLite database with Redis caching

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: SQLite (development), Redis (caching)
- **AI/ML**: OpenAI GPT-4
- **APIs**: Finnhub, Polygon, Alpha Vantage, Quiver Quant
- **Development**: ESLint, Prettier, Jest, Nodemon
- **Deployment**: Docker, Docker Compose

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Docker (optional, for Redis)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd StockGenius
npm install
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your API keys
nano .env
```

### 3. Run Setup Script

```bash
npm run setup
```

This will:
- Create necessary directories
- Initialize SQLite database
- Set up default preferences
- Validate configuration

### 4. Start Development Server

```bash
# Start with Redis (recommended)
docker-compose up redis -d
npm run dev

# Or start without Redis
npm run dev
```

### 5. Access Application

- **Main App**: http://localhost:3000
- **Redis UI**: http://localhost:8081 (admin/admin)
- **Database UI**: http://localhost:8080 (dev profile)

## 🔑 API Keys Required

### Financial Data APIs

1. **Finnhub** (Free tier: 60 calls/minute)
   - Sign up: https://finnhub.io/register
   - Add to `.env`: `FINNHUB_API_KEY=your_key`

2. **Polygon.io** (Free tier: 5 calls/minute)
   - Sign up: https://polygon.io/
   - Add to `.env`: `POLYGON_API_KEY=your_key`

3. **Alpha Vantage** (Free tier: 5 calls/minute)
   - Sign up: https://www.alphavantage.co/support/#api-key
   - Add to `.env`: `ALPHA_VANTAGE_API_KEY=your_key`

4. **Quiver Quant** (Paid: 300 calls/minute)
   - Sign up: https://www.quiverquant.com/
   - Add to `.env`: `QUIVER_API_KEY=your_key`

### AI Services

5. **OpenAI** (Pay-per-use)
   - Sign up: https://platform.openai.com/
   - Add to `.env`: `OPENAI_API_KEY=your_key`

### Caching (Optional)

6. **Upstash Redis** (Free tier available)
   - Sign up: https://upstash.com/
   - Add to `.env`: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

## 📁 Project Structure

```
StockGenius/
├── src/
│   ├── api/           # API route handlers
│   ├── models/        # Data models and schemas
│   ├── services/      # Business logic services
│   ├── utils/         # Utility functions
│   ├── middleware/    # Express middleware
│   └── app.js         # Main application entry
├── config/
│   ├── database.js    # SQLite configuration
│   └── redis.conf     # Redis configuration
├── tests/             # Test files
├── scripts/           # Utility scripts
├── data/              # SQLite database files
├── logs/              # Application logs
├── docker-compose.yml # Docker services
└── package.json       # Dependencies and scripts
```

## 🔧 Configuration

### Environment Variables

Key configurations in `.env`:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=./data/stockgenius.db

# Redis (optional)
REDIS_URL=redis://localhost:6379

# API Keys
FINNHUB_API_KEY=your_key
POLYGON_API_KEY=your_key
ALPHA_VANTAGE_API_KEY=your_key
QUIVER_API_KEY=your_key
OPENAI_API_KEY=your_key

# AI Configuration
OPENAI_MODEL=gpt-4-turbo-preview
AI_ANALYSIS_ENABLED=true

# Paper Trading
PAPER_TRADING_ENABLED=true
STARTING_BALANCE=100000
```

### Rate Limiting

Default API rate limits (configurable in `.env`):

- Finnhub: 60 calls/minute
- Polygon: 5 calls/minute
- Alpha Vantage: 5 calls/minute
- Quiver: 300 calls/minute

## 🐳 Docker Deployment

### Development with Docker

```bash
# Start Redis and optional UI tools
docker-compose --profile dev up -d

# View logs
docker-compose logs -f redis
```

### Production Deployment

```bash
# Build and run full stack
docker-compose --profile production up -d

# View application logs
docker-compose logs -f stockgenius
```

## 📊 Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with hot reload
npm run build      # Build TypeScript (if using TS)
npm test           # Run test suite
npm run test:watch # Run tests in watch mode
npm run lint       # Check code style
npm run lint:fix   # Fix code style issues
npm run format     # Format code with Prettier
npm run setup      # Initialize project setup
```

## 🗄️ Database Management

### SQLite Database

The application uses SQLite for simplicity and single-user optimization:

```bash
# View database schema
sqlite3 data/stockgenius.db ".schema"

# Access via web UI (development)
docker-compose --profile dev up sqlite-web -d
# Open: http://localhost:8080
```

### Key Tables

- `user_preferences` - User settings and preferences
- `watchlist` - Tracked stocks and alerts
- `trades` - Paper trading history
- `portfolio_positions` - Current portfolio holdings
- `ai_analysis_logs` - AI analysis history
- `market_data_cache` - Cached API responses

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern=api

# Run tests in watch mode
npm run test:watch
```

## 📈 Features Overview

### Stock Analysis
- Real-time quotes and market data
- Company profiles and financial statements
- Technical indicators and charts
- News sentiment analysis

### AI Integration
- GPT-powered stock analysis
- Sentiment analysis of news and social media
- Trading strategy recommendations
- Risk assessment and portfolio optimization

### Portfolio Management
- Paper trading simulation
- Real-time portfolio tracking
- Performance analytics
- Risk metrics and alerts

### Data Sources
- **Finnhub**: Real-time quotes, company data, earnings
- **Polygon**: Historical data, options, crypto
- **Alpha Vantage**: Fundamental data, technical indicators
- **Quiver Quant**: Congressional trading, insider data
- **OpenAI**: AI analysis and insights

## 🔒 Security

- Environment variable configuration
- JWT-based authentication (optional)
- Rate limiting on API endpoints
- Input validation with Joi
- SQL injection protection with parameterized queries

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Error**
   ```bash
   npm run setup
   # Check file permissions on data/ directory
   ```

2. **Redis Connection Failed**
   ```bash
   docker-compose up redis -d
   # Or set REDIS_URL="" to disable Redis
   ```

3. **API Rate Limit Exceeded**
   - Check rate limits in `.env`
   - Monitor usage with built-in logging
   - Consider upgrading API plans

4. **OpenAI API Error**
   - Verify API key is valid
   - Check account billing status
   - Monitor token usage

### Logs

Application logs are stored in `logs/` directory:

```bash
# View recent logs
tail -f logs/stockgenius.log

# View error logs
grep "ERROR" logs/stockgenius.log
```

## 📚 API Documentation

### Main Endpoints

- `GET /api/quotes/:symbol` - Get stock quote
- `GET /api/profile/:symbol` - Get company profile
- `GET /api/news/:symbol` - Get company news
- `GET /api/analysis/:symbol` - Get AI analysis
- `GET /api/portfolio` - Get portfolio summary
- `POST /api/trades` - Execute paper trade

### WebSocket Events

- `quote_update` - Real-time price updates
- `portfolio_update` - Portfolio value changes
- `alert_triggered` - Price/news alerts

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Check the [Issues](../../issues) page for known problems
- Review the [Troubleshooting](#-troubleshooting) section
- Create a new issue for bugs or feature requests

## 🎯 Roadmap

- [ ] Real-time WebSocket data feeds
- [ ] Advanced charting with TradingView
- [ ] Machine learning prediction models
- [ ] Mobile app companion
- [ ] Multi-broker integration
- [ ] Social trading features
- [ ] Advanced options analysis
- [ ] Cryptocurrency support

---

**Happy Trading! 📈**
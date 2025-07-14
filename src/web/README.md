# StockGenius Web Interface

A minimal, fast-loading web interface for the StockGenius AI-powered trading analysis platform.

## Features

### 🎯 Core Features
- **Daily Trade Cards**: Clean, readable display of AI-generated trading recommendations
- **Performance Analytics**: Historical metrics and accuracy tracking with interactive charts
- **Manual Analysis**: Simple controls for triggering on-demand analysis
- **Signal Visualization**: Confidence indicators and signal strength displays
- **AI Reasoning**: Detailed explanations of AI decision-making process

### 🔒 Security
- Basic authentication system for single-user access
- Session-based authentication with secure cookies
- Input validation and CSRF protection

### 📱 User Experience
- Responsive design optimized for desktop and mobile
- Fast loading with minimal JavaScript
- Real-time updates and status monitoring
- Keyboard shortcuts for power users

## Quick Start

### Prerequisites
- Node.js 18+ and npm 8+
- Redis server running
- Environment variables configured

### Installation
```bash
# Install dependencies
npm install

# Build TypeScript files
npm run build

# Start the web interface
npm run web

# For development with auto-reload
npm run dev:web
```

### Environment Variables
```bash
# Web Interface Configuration
WEB_PORT=3000
WEB_USERNAME=admin
WEB_PASSWORD=your-secure-password
SESSION_SECRET=your-session-secret

# Optional webhook for notifications
WEBHOOK_URL=https://your-webhook-url.com
```

## Usage

### Access the Interface
1. Open your browser to `http://localhost:3000`
2. Login with configured credentials
3. Navigate between Dashboard, Performance, and Analysis pages

### Dashboard
- View latest trade cards with confidence indicators
- Monitor real-time performance metrics
- Quick access to manual analysis triggers

### Performance Page
- Detailed analytics with interactive charts
- Module-specific accuracy tracking
- Historical trade outcomes

### Analysis Page
- Manual analysis controls with symbol selection
- Real-time pipeline status monitoring
- Live analysis logs and progress tracking

## API Endpoints

### Authentication
- `GET /login` - Login page
- `POST /login` - Authenticate user
- `POST /logout` - End session

### Dashboard Data
- `GET /api/trade-cards` - Latest trade recommendations
- `GET /api/trade-cards/:id/details` - Detailed card information
- `GET /api/performance/metrics` - Performance overview

### Analysis Control
- `POST /api/analysis/trigger` - Start manual analysis
- `GET /api/analysis/status` - Current pipeline status

## Architecture

### Frontend Stack
- **HTML Templates**: EJS for server-side rendering
- **Styling**: Custom CSS with dark theme and responsive design
- **JavaScript**: Vanilla JS for dynamic interactions
- **Charts**: Chart.js for performance visualizations

### Backend Stack
- **Framework**: Express.js with TypeScript
- **Authentication**: Express-session with basic auth
- **Data**: Integration with StockGenius core services
- **Real-time**: Polling-based status updates

### Security Features
- Session-based authentication
- CSRF protection
- Input validation
- Rate limiting
- Secure headers

## Customization

### Styling
Modify `/public/css/styles.css` for custom themes and layouts.

### Authentication
Update authentication logic in `server.ts` for alternative auth methods.

### Data Integration
Extend API endpoints in `server.ts` to expose additional StockGenius features.

## Performance Optimizations

- **Minimal Dependencies**: Lightweight frontend with no heavy frameworks
- **Efficient Polling**: Smart status updates only when needed
- **CSS Optimization**: Single stylesheet with optimized selectors
- **Image Optimization**: SVG icons and minimal graphics
- **Caching**: Appropriate cache headers for static assets

## Development

### File Structure
```
src/web/
├── server.ts              # Express server and routes
├── index.ts               # Main entry point
├── views/                 # EJS templates
│   ├── dashboard.ejs      # Main dashboard
│   ├── performance.ejs    # Performance analytics
│   ├── analysis.ejs       # Manual analysis controls
│   ├── login.ejs          # Authentication
│   └── partials/          # Reusable components
└── public/                # Static assets
    ├── css/styles.css     # Main stylesheet
    └── js/                # Client-side JavaScript
        ├── dashboard.js   # Dashboard interactions
        └── analysis.js    # Analysis controls
```

### Adding New Features
1. Add routes in `server.ts`
2. Create EJS templates in `views/`
3. Add styling to `styles.css`
4. Implement interactions in JavaScript files

## Troubleshooting

### Common Issues

**Web interface won't start:**
- Check Node.js version (18+ required)
- Verify all dependencies installed
- Ensure TypeScript compiled successfully

**Login issues:**
- Verify WEB_USERNAME and WEB_PASSWORD environment variables
- Check session secret configuration
- Clear browser cookies and try again

**Data not loading:**
- Confirm StockGenius core services are running
- Check Redis connection
- Review server logs for API errors

**Performance issues:**
- Disable auto-refresh if experiencing lag
- Check network connection for API calls
- Monitor browser developer console for errors

## Security Considerations

### Production Deployment
- Use HTTPS with valid SSL certificates
- Set secure session configuration
- Configure proper firewall rules
- Regular security updates
- Strong password policies
- Consider additional authentication factors

### Environment Security
- Keep environment variables secure
- Use secrets management for production
- Regular credential rotation
- Monitor access logs
- Implement proper backup procedures

## License

MIT License - see main project LICENSE file for details.
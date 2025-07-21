# 🚀 StockGenius Deployment Guide

## Quick Cloud Deployment Options

### Option 1: Vercel (Recommended - Free Tier)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel

# Follow prompts - it will auto-detect settings
```

### Option 2: Railway (Recommended - $5/month)
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

### Option 3: Render (Free Tier Available)
1. Go to https://render.com
2. Connect your GitHub repo
3. Choose "Web Service"
4. Build Command: `npm run build`
5. Start Command: `npm start`

### Option 4: DigitalOcean App Platform
1. Go to https://cloud.digitalocean.com/apps
2. Create New App from GitHub
3. Auto-detected settings should work

## Environment Variables Needed
```bash
# Required
NODE_ENV=production
PORT=8080

# Optional API Keys (for live data)
OPENAI_API_KEY=your_openai_key
POLYGON_API_KEY=your_polygon_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
QUIVER_API_KEY=your_quiver_key

# Session Security
SESSION_SECRET=your_random_secret_string

# Auth Credentials
AUTH_USERNAME=admin
AUTH_PASSWORD=your_secure_password
```

## Local Development (Backup)
```bash
# If you still want local development
npm run dev

# For production build locally
npm run build
npm start
```

## Troubleshooting
- **Connection refused**: Use cloud hosting instead
- **Build failures**: Cloud platforms handle builds automatically
- **Port conflicts**: Cloud platforms assign ports automatically
- **SSL/HTTPS**: Cloud platforms provide free SSL

## Benefits of Cloud Hosting
✅ **No port conflicts**
✅ **Automatic SSL certificates**
✅ **Global CDN**
✅ **Automatic deployments**
✅ **Built-in monitoring**
✅ **No local server management**
✅ **Easy scaling**
✅ **99.9% uptime**

## Next Steps
1. Choose a hosting platform above
2. Push your code to GitHub if not already there
3. Connect the platform to your GitHub repo
4. Set environment variables
5. Deploy!

The app will be accessible at a public URL within minutes.
#!/bin/bash

# StockGenius deployment script
# Ensures fresh build with matching build numbers before deployment

echo "🚀 Starting StockGenius deployment..."

# Generate new build info
echo "📝 Generating build information..."
node scripts/generate-build-info.js

# Build the project
echo "🔨 Building project..."
npm run build

# Kill existing server processes
echo "🛑 Stopping existing servers..."
pkill -f "node.*server" || true
sleep 2

# Start the server
echo "▶️  Starting server..."
node dist/web/server.js &

echo "✅ Deployment complete!"
echo "🌐 Server available at http://localhost:8080"
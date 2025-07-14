#!/bin/bash

echo "🚀 Starting StockGenius LIVE DATA Web Interface..."

# Kill any existing instances
pkill -f live-data-server
pkill -f simple-server

# Start the live data server
cd "$(dirname "$0")"
node src/web/live-data-server.js

echo "✅ StockGenius LIVE Interface started successfully!"
echo "🌐 Access at: http://localhost:8080"
echo "👤 Username: admin"
echo "🔑 Password: stockgenius2024"
echo "📈 Data Source: LIVE from Finnhub API"
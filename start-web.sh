#!/bin/bash

echo "🚀 Starting StockGenius Web Interface..."

# Kill any existing instances
pkill -f simple-server

# Start the server
cd "$(dirname "$0")"
node src/web/simple-server.js

echo "✅ StockGenius Web Interface started successfully!"
echo "🌐 Access at: http://localhost:8080"
echo "👤 Username: admin"
echo "🔑 Password: stockgenius2024"
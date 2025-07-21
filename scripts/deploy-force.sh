#!/bin/bash

# StockGenius FORCE deployment script
# Ensures complete restart with new build

echo "🔥 FORCE DEPLOYMENT STARTING..."

# 1. Kill ALL node processes (more aggressive)
echo "🛑 Killing ALL node processes..."
killall node 2>/dev/null || true
pkill -9 -f node 2>/dev/null || true
sleep 3

# 2. Clear dist folder to force fresh build
echo "🗑️  Clearing dist folder..."
rm -rf dist/

# 3. Generate new build info
echo "📝 Generating build information..."
node scripts/generate-build-info.js

# 4. Build the project
echo "🔨 Building project..."
npm run build

# 4.5. Copy views and static files
echo "📁 Copying views and static files..."
cp -r src/web/views dist/web/
cp -r src/web/public dist/web/

# 5. Start server in background with logs
echo "▶️  Starting server..."
nohup node dist/web/index.js > server.log 2>&1 &

# 6. Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# 7. Verify server is running
if lsof -i:8080 | grep -q LISTEN; then
    BUILD_NUMBER=$(cat build.json | grep buildNumber | cut -d'"' -f4)
    echo "✅ Server running on port 8080"
    echo "🎯 Build number: $BUILD_NUMBER"
    echo "📋 Check server.log for details"
    echo ""
    echo "🌐 Open http://localhost:8080/dashboard"
    echo "🔍 You should see Build: $BUILD_NUMBER"
else
    echo "❌ Server failed to start!"
    echo "📋 Check server.log for errors"
    tail -20 server.log
fi
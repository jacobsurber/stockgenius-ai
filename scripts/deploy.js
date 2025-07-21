#!/usr/bin/env node

/**
 * Improved Deployment Script for StockGenius
 * Handles server startup, monitoring, and graceful shutdowns
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  port: process.env.WEB_PORT || 8080,
  host: 'localhost',
  pidFile: path.join(__dirname, '..', '.stockgenius.pid'),
  logFile: path.join(__dirname, '..', 'logs', 'server.log'),
  healthCheckUrl: '/health',
  startupTimeout: 30000, // 30 seconds
  healthCheckInterval: 5000, // 5 seconds
  maxHealthCheckAttempts: 10
};

// Ensure logs directory exists
const logsDir = path.dirname(config.logFile);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Check if server is already running
 */
function isServerRunning() {
  try {
    if (fs.existsSync(config.pidFile)) {
      const pid = fs.readFileSync(config.pidFile, 'utf8').trim();
      // Check if process exists
      process.kill(parseInt(pid), 0);
      return { running: true, pid };
    }
  } catch (e) {
    // Process doesn't exist, clean up stale PID file
    if (fs.existsSync(config.pidFile)) {
      fs.unlinkSync(config.pidFile);
    }
  }
  return { running: false };
}

/**
 * Stop running server
 */
function stopServer() {
  const status = isServerRunning();
  if (status.running) {
    console.log(`🛑 Stopping existing server (PID: ${status.pid})...`);
    try {
      process.kill(parseInt(status.pid), 'SIGTERM');
      // Wait a bit for graceful shutdown
      setTimeout(() => {
        try {
          process.kill(parseInt(status.pid), 0);
          // Still running, force kill
          process.kill(parseInt(status.pid), 'SIGKILL');
        } catch (e) {
          // Process is gone, good
        }
      }, 5000);
    } catch (e) {
      console.error('❌ Error stopping server:', e.message);
    }
    
    if (fs.existsSync(config.pidFile)) {
      fs.unlinkSync(config.pidFile);
    }
  }
}

/**
 * Health check
 */
function healthCheck() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.host,
      port: config.port,
      path: config.healthCheckUrl,
      timeout: 5000
    };

    const req = http.get(options, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Health check failed with status ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });
  });
}

/**
 * Wait for server to be healthy
 */
async function waitForServer() {
  console.log('⏳ Waiting for server to be healthy...');
  
  for (let i = 0; i < config.maxHealthCheckAttempts; i++) {
    try {
      await healthCheck();
      console.log('✅ Server is healthy!');
      return true;
    } catch (e) {
      console.log(`🔄 Health check attempt ${i + 1}/${config.maxHealthCheckAttempts} failed`);
      await new Promise(resolve => setTimeout(resolve, config.healthCheckInterval));
    }
  }
  
  throw new Error('Server failed to become healthy');
}

/**
 * Start the server
 */
async function startServer() {
  console.log('🚀 Starting StockGenius server...');
  console.log(`📍 Port: ${config.port}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Check if already running
  const status = isServerRunning();
  if (status.running) {
    console.log(`⚠️  Server already running (PID: ${status.pid})`);
    const shouldRestart = process.argv.includes('--restart');
    
    if (shouldRestart) {
      console.log('🔄 Restarting server...');
      stopServer();
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('💡 Use --restart flag to restart the server');
      return;
    }
  }

  // Create log stream
  const logStream = fs.createWriteStream(config.logFile, { flags: 'a' });
  
  // Start the server
  const serverPath = path.join(__dirname, '..', 'dist', 'web', 'index.js');
  
  if (!fs.existsSync(serverPath)) {
    console.error(`❌ Server file not found: ${serverPath}`);
    console.log('💡 Run "npm run build" first');
    process.exit(1);
  }

  const env = {
    ...process.env,
    WEB_PORT: config.port,
    NODE_ENV: process.env.NODE_ENV || 'development'
  };

  const server = spawn('node', [serverPath], {
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Write PID file
  fs.writeFileSync(config.pidFile, server.pid.toString());
  console.log(`📝 Server PID: ${server.pid}`);

  // Pipe output to log file and console
  server.stdout.pipe(logStream);
  server.stderr.pipe(logStream);
  
  server.stdout.on('data', (data) => {
    console.log(`[SERVER] ${data.toString().trim()}`);
  });
  
  server.stderr.on('data', (data) => {
    console.error(`[ERROR] ${data.toString().trim()}`);
  });

  server.on('error', (err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });

  server.on('exit', (code, signal) => {
    console.log(`⚠️  Server exited with code ${code} and signal ${signal}`);
    if (fs.existsSync(config.pidFile)) {
      fs.unlinkSync(config.pidFile);
    }
  });

  // Detach the server so it keeps running
  server.unref();

  // Wait for server to be healthy
  try {
    await waitForServer();
    console.log('');
    console.log('🎉 StockGenius server is running!');
    console.log(`🌐 URL: http://${config.host}:${config.port}`);
    console.log(`📄 Logs: ${config.logFile}`);
    console.log(`🔑 Login: admin / stockgenius2024`);
    console.log('');
    console.log('📌 Useful commands:');
    console.log('  npm run deploy:status  - Check server status');
    console.log('  npm run deploy:stop    - Stop the server');
    console.log('  npm run deploy:logs    - View server logs');
    console.log('  npm run deploy:restart - Restart the server');
    
  } catch (e) {
    console.error('❌ Server failed to start properly:', e.message);
    stopServer();
    process.exit(1);
  }
}

/**
 * Check server status
 */
async function checkStatus() {
  const status = isServerRunning();
  
  console.log('🔍 StockGenius Server Status');
  console.log('─'.repeat(40));
  
  if (status.running) {
    console.log(`✅ Status: Running`);
    console.log(`📍 PID: ${status.pid}`);
    console.log(`📍 Port: ${config.port}`);
    console.log(`🌐 URL: http://${config.host}:${config.port}`);
    
    try {
      await healthCheck();
      console.log(`💚 Health: Healthy`);
    } catch (e) {
      console.log(`💔 Health: Unhealthy (${e.message})`);
    }
  } else {
    console.log(`❌ Status: Not running`);
  }
  
  if (fs.existsSync(config.logFile)) {
    const stats = fs.statSync(config.logFile);
    console.log(`📄 Log file: ${config.logFile} (${(stats.size / 1024).toFixed(2)} KB)`);
  }
}

/**
 * View logs
 */
function viewLogs() {
  if (!fs.existsSync(config.logFile)) {
    console.log('❌ No log file found');
    return;
  }
  
  const tail = spawn('tail', ['-f', '-n', '100', config.logFile], {
    stdio: 'inherit'
  });
  
  process.on('SIGINT', () => {
    tail.kill();
    process.exit(0);
  });
}

// Parse command
const command = process.argv[2];

switch (command) {
  case 'start':
    startServer();
    break;
  case 'stop':
    stopServer();
    console.log('✅ Server stopped');
    break;
  case 'restart':
    process.argv.push('--restart');
    startServer();
    break;
  case 'status':
    checkStatus();
    break;
  case 'logs':
    viewLogs();
    break;
  default:
    console.log('Usage: node deploy.js [start|stop|restart|status|logs]');
    process.exit(1);
}
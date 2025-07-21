#!/usr/bin/env node

/**
 * Development Server with Better Error Handling
 * Ensures the server starts reliably
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.WEB_PORT || 8080;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

// Check if port is available
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// Find available port
async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 10; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error('No available ports found');
}

// Kill process on port
async function killProcessOnPort(port) {
  return new Promise((resolve) => {
    const kill = spawn('lsof', ['-ti', `:${port}`]);
    let pid = '';
    
    kill.stdout.on('data', (data) => {
      pid += data.toString().trim();
    });
    
    kill.on('close', () => {
      if (pid) {
        try {
          process.kill(parseInt(pid), 'SIGTERM');
          console.log(chalk.yellow(`✋ Killed process ${pid} on port ${port}`));
          setTimeout(resolve, 1000);
        } catch (e) {
          resolve();
        }
      } else {
        resolve();
      }
    });
  });
}

// Start server with retries
async function startServer(retries = 0) {
  try {
    // Check if port is available
    let port = PORT;
    const isAvailable = await isPortAvailable(port);
    
    if (!isAvailable) {
      console.log(chalk.yellow(`⚠️  Port ${port} is in use`));
      
      // Try to kill existing process
      await killProcessOnPort(port);
      
      // Check again
      if (!await isPortAvailable(port)) {
        // Find alternative port
        port = await findAvailablePort(parseInt(PORT) + 1);
        console.log(chalk.blue(`📍 Using alternative port: ${port}`));
      }
    }
    
    console.log(chalk.green('🚀 Starting StockGenius development server...'));
    console.log(chalk.blue(`📍 Port: ${port}`));
    console.log(chalk.blue(`🌐 URL: http://localhost:${port}`));
    
    // Start the server
    const serverPath = path.join(__dirname, '..', 'dist', 'web', 'index.js');
    
    if (!fs.existsSync(serverPath)) {
      console.log(chalk.yellow('⚠️  Built files not found, building...'));
      
      // Build first
      const build = spawn('npm', ['run', 'build'], {
        stdio: 'inherit',
        shell: true
      });
      
      await new Promise((resolve, reject) => {
        build.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('Build failed'));
        });
      });
    }
    
    const server = spawn('node', [serverPath], {
      env: { ...process.env, WEB_PORT: port },
      stdio: 'inherit'
    });
    
    server.on('error', (err) => {
      console.error(chalk.red('❌ Server error:'), err);
      if (retries < MAX_RETRIES) {
        console.log(chalk.yellow(`🔄 Retrying... (${retries + 1}/${MAX_RETRIES})`));
        setTimeout(() => startServer(retries + 1), RETRY_DELAY);
      }
    });
    
    server.on('exit', (code, signal) => {
      if (code !== 0 && retries < MAX_RETRIES) {
        console.log(chalk.yellow(`⚠️  Server exited with code ${code}`));
        console.log(chalk.yellow(`🔄 Retrying... (${retries + 1}/${MAX_RETRIES})`));
        setTimeout(() => startServer(retries + 1), RETRY_DELAY);
      }
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n✋ Shutting down gracefully...'));
      server.kill('SIGTERM');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      server.kill('SIGTERM');
      process.exit(0);
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to start server:'), error);
    if (retries < MAX_RETRIES) {
      console.log(chalk.yellow(`🔄 Retrying... (${retries + 1}/${MAX_RETRIES})`));
      setTimeout(() => startServer(retries + 1), RETRY_DELAY);
    } else {
      process.exit(1);
    }
  }
}

// Check dependencies
if (!fs.existsSync(path.join(__dirname, '..', 'node_modules', 'chalk'))) {
  console.log('Installing chalk for better output...');
  spawn('npm', ['install', '--no-save', 'chalk'], {
    stdio: 'inherit',
    shell: true
  }).on('close', () => {
    startServer();
  });
} else {
  startServer();
}
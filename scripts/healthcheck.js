#!/usr/bin/env node

import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Health check script for Docker container
 * Verifies the application is responding on the configured port
 */

const healthCheck = () => {
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || 'localhost';
  
  const options = {
    hostname: host,
    port: port,
    path: '/health',
    method: 'GET',
    timeout: 5000,
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log('Health check passed');
      process.exit(0);
    } else {
      console.log(`Health check failed with status: ${res.statusCode}`);
      process.exit(1);
    }
  });

  req.on('error', (err) => {
    console.log(`Health check failed: ${err.message}`);
    process.exit(1);
  });

  req.on('timeout', () => {
    console.log('Health check timed out');
    req.destroy();
    process.exit(1);
  });

  req.end();
};

healthCheck();
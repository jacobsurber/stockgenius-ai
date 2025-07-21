#!/usr/bin/env node

/**
 * Validate that build outputs are correct and up-to-date
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

function validateBuild() {
  console.log('🔍 Validating build outputs...');
  
  let hasErrors = false;
  
  // Critical files that must exist
  const criticalFiles = [
    'web/index.js',
    'web/server.js',
    'web/public/js/dashboard.js',
    'web/views/dashboard.ejs'
  ];
  
  for (const file of criticalFiles) {
    const distPath = path.join(distDir, file);
    if (!fs.existsSync(distPath)) {
      console.error(`❌ Missing critical file: ${file}`);
      hasErrors = true;
    } else {
      console.log(`✅ Found: ${file}`);
    }
  }
  
  // Check if static assets are up to date
  const staticFiles = [
    'web/public/js/dashboard.js',
    'web/views/dashboard.ejs'
  ];
  
  for (const file of staticFiles) {
    const srcPath = path.join(srcDir, file);
    const distPath = path.join(distDir, file);
    
    if (fs.existsSync(srcPath)) {
      const srcHash = getFileHash(srcPath);
      const distHash = getFileHash(distPath);
      
      if (srcHash !== distHash) {
        console.warn(`⚠️  Static file out of sync: ${file}`);
        console.warn(`   Run 'npm run copy-assets' to sync`);
        hasErrors = true;
      } else {
        console.log(`✅ Static file in sync: ${file}`);
      }
    }
  }
  
  if (hasErrors) {
    console.error('❌ Build validation failed');
    process.exit(1);
  } else {
    console.log('✅ Build validation passed');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateBuild();
}

export default validateBuild;
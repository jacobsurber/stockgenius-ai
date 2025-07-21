#!/usr/bin/env node

/**
 * Copy static assets from src to dist during build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

// Define static asset patterns
const assetPatterns = [
  'web/public/**/*',
  'web/views/**/*',
  '**/*.json',
  '**/*.css',
  '**/*.html',
  '**/*.ejs'
];

function copyFileRecursive(src, dest) {
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    files.forEach(file => {
      copyFileRecursive(
        path.join(src, file),
        path.join(dest, file)
      );
    });
  } else {
    // Ensure destination directory exists
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(src, dest);
    console.log(`📁 Copied: ${path.relative(process.cwd(), src)} → ${path.relative(process.cwd(), dest)}`);
  }
}

function copyAssets() {
  console.log('🚀 Copying static assets...');
  
  // Copy web assets
  const webSrcDir = path.join(srcDir, 'web');
  const webDistDir = path.join(distDir, 'web');
  
  if (fs.existsSync(webSrcDir)) {
    copyFileRecursive(webSrcDir, webDistDir);
  }
  
  console.log('✅ Static assets copied successfully');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  copyAssets();
}

export default copyAssets;
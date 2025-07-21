#!/usr/bin/env node

/**
 * Generate build information for StockGenius
 * Creates a build.json file with build number and metadata
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Generate build number (timestamp-based for uniqueness)
const buildNumber = Date.now().toString();
const buildDate = new Date().toISOString();

// Get git commit hash if available
let gitCommit = 'unknown';
try {
  const { execSync } = await import('child_process');
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (error) {
  console.log('Warning: Could not get git commit hash');
}

// Get package version
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;

const buildInfo = {
  buildNumber,
  version,
  gitCommit,
  buildDate,
  environment: process.env.NODE_ENV || 'development'
};

// Write build info to multiple locations
const buildInfoJson = JSON.stringify(buildInfo, null, 2);

// 1. Create build.json in project root
fs.writeFileSync(path.join(projectRoot, 'build.json'), buildInfoJson);

// 2. Create build info as a JavaScript module
const buildInfoJs = `// Auto-generated build information
export const BUILD_INFO = ${buildInfoJson};
export const BUILD_NUMBER = '${buildNumber}';
export const VERSION = '${version}';
export const GIT_COMMIT = '${gitCommit}';
export const BUILD_DATE = '${buildDate}';
`;

fs.writeFileSync(path.join(projectRoot, 'src/config/build-info.js'), buildInfoJs);

// 3. Update the dashboard.js template with build number placeholder
const dashboardPath = path.join(projectRoot, 'src/web/public/js/dashboard.js');
if (fs.existsSync(dashboardPath)) {
  let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
  
  // Replace the hardcoded build number with a placeholder that will be replaced
  dashboardContent = dashboardContent.replace(
    /Build: \d+\)/g,
    `Build: ${buildNumber})`
  );
  
  fs.writeFileSync(dashboardPath, dashboardContent);
}

// 4. Update header.ejs template
const headerPath = path.join(projectRoot, 'src/web/views/partials/header.ejs');
if (fs.existsSync(headerPath)) {
  let headerContent = fs.readFileSync(headerPath, 'utf8');
  
  // Replace build number in header
  headerContent = headerContent.replace(
    /Build: \d+/g,
    `Build: ${buildNumber}`
  );
  
  fs.writeFileSync(headerPath, headerContent);
}

console.log(`✅ Build info generated:`);
console.log(`   Build Number: ${buildNumber}`);
console.log(`   Version: ${version}`);
console.log(`   Git Commit: ${gitCommit}`);
console.log(`   Build Date: ${buildDate}`);
console.log(`   Environment: ${buildInfo.environment}`);
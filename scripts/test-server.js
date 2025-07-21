#!/usr/bin/env node

/**
 * Test script to verify server is running correctly
 */

import http from 'http';
import chalk from 'chalk';

const PORT = process.env.WEB_PORT || 8080;
const HOST = 'localhost';

console.log(chalk.blue('🔍 Testing StockGenius server...'));
console.log(chalk.gray(`   Host: ${HOST}`));
console.log(chalk.gray(`   Port: ${PORT}`));

// Test endpoints
const tests = [
  { path: '/health', expect: 200, name: 'Health Check' },
  { path: '/', expect: [200, 302], name: 'Home Page' },
  { path: '/login', expect: 200, name: 'Login Page' },
  { path: '/api/trade-cards', expect: [200, 302], name: 'API Endpoint' }
];

let passed = 0;
let failed = 0;

async function testEndpoint(test) {
  return new Promise((resolve) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: test.path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      const expected = Array.isArray(test.expect) ? test.expect : [test.expect];
      
      if (expected.includes(res.statusCode)) {
        console.log(chalk.green(`✅ ${test.name}: ${res.statusCode}`));
        passed++;
      } else {
        console.log(chalk.red(`❌ ${test.name}: ${res.statusCode} (expected ${expected.join(' or ')})`));
        failed++;
      }
      resolve();
    });

    req.on('error', (err) => {
      console.log(chalk.red(`❌ ${test.name}: ${err.message}`));
      failed++;
      resolve();
    });

    req.on('timeout', () => {
      console.log(chalk.red(`❌ ${test.name}: Timeout`));
      failed++;
      req.destroy();
      resolve();
    });

    req.end();
  });
}

// Run tests
async function runTests() {
  console.log(chalk.yellow('\n📋 Running tests...\n'));
  
  for (const test of tests) {
    await testEndpoint(test);
  }
  
  console.log(chalk.yellow('\n📊 Results:'));
  console.log(chalk.green(`   Passed: ${passed}`));
  console.log(chalk.red(`   Failed: ${failed}`));
  
  if (failed === 0) {
    console.log(chalk.green('\n🎉 All tests passed! Server is running correctly.'));
    console.log(chalk.blue(`\n🌐 You can access the app at: http://${HOST}:${PORT}`));
    console.log(chalk.gray('   Username: admin'));
    console.log(chalk.gray('   Password: stockgenius2024'));
  } else {
    console.log(chalk.red('\n⚠️  Some tests failed. Server may not be running correctly.'));
    console.log(chalk.yellow('\n💡 Try running: npm run dev:simple'));
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

// Check if server is running first
const quickCheck = http.get(`http://${HOST}:${PORT}/health`, (res) => {
  runTests();
}).on('error', () => {
  console.log(chalk.red('\n❌ Server is not running!'));
  console.log(chalk.yellow('\n💡 Start the server with one of these commands:'));
  console.log(chalk.gray('   npm start'));
  console.log(chalk.gray('   npm run dev:simple'));
  console.log(chalk.gray('   node scripts/start-dev.js'));
  process.exit(1);
});
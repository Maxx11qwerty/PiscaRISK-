#!/usr/bin/env node

/**
 * Security Headers Test Script
 * Tests all required security headers are present and correctly configured
 */

const https = require('https');
const http = require('http');
const url = require('url');

// Configuration
const TEST_URLS = [
  'http://localhost:3001',
  'https://piscarisk.firebaseapp.com',
  'https://piscarisk.onrender.com'
];

// Required security headers
const REQUIRED_HEADERS = {
  'Strict-Transport-Security': {
    required: true,
    expectedValue: 'max-age=31536000; includeSubDomains; preload',
    description: 'HTTP Strict Transport Security'
  },
  'Content-Security-Policy': {
    required: true,
    expectedValue: 'default-src \'self\'',
    description: 'Content Security Policy'
  },
  'X-Frame-Options': {
    required: true,
    expectedValue: 'SAMEORIGIN',
    description: 'X-Frame-Options'
  },
  'X-Content-Type-Options': {
    required: true,
    expectedValue: 'nosniff',
    description: 'X-Content-Type-Options'
  },
  'Referrer-Policy': {
    required: true,
    expectedValue: 'strict-origin-when-cross-origin',
    description: 'Referrer Policy'
  },
  'Permissions-Policy': {
    required: true,
    expectedValue: 'camera=(self)',
    description: 'Permissions Policy'
  }
};

// Optional but recommended headers
const OPTIONAL_HEADERS = {
  'Cross-Origin-Opener-Policy': {
    expectedValue: 'same-origin-allow-popups',
    description: 'Cross-Origin-Opener-Policy'
  },
  'Cross-Origin-Embedder-Policy': {
    expectedValue: 'unsafe-none',
    description: 'Cross-Origin-Embedder-Policy'
  }
};

function makeRequest(urlString) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(urlString);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Security-Headers-Test/1.0'
      }
    };

    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          url: urlString
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function testHeaders(headers, url) {
  console.log(`\n🔍 Testing: ${url}`);
  console.log(`Status Code: ${headers.statusCode}`);
  
  if (headers.statusCode >= 400) {
    console.log('❌ Error status code - headers may not be fully applied');
  }

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // Test required headers
  console.log('\n📋 Required Security Headers:');
  for (const [headerName, config] of Object.entries(REQUIRED_HEADERS)) {
    const headerValue = headers[headerName.toLowerCase()];
    
    if (!headerValue) {
      console.log(`❌ ${headerName}: MISSING - ${config.description}`);
      results.failed++;
    } else if (config.expectedValue && !headerValue.includes(config.expectedValue)) {
      console.log(`⚠️  ${headerName}: PRESENT but unexpected value`);
      console.log(`   Expected: ${config.expectedValue}`);
      console.log(`   Got: ${headerValue}`);
      results.warnings++;
    } else {
      console.log(`✅ ${headerName}: OK`);
      results.passed++;
    }
  }

  // Test optional headers
  console.log('\n📋 Optional Security Headers:');
  for (const [headerName, config] of Object.entries(OPTIONAL_HEADERS)) {
    const headerValue = headers[headerName.toLowerCase()];
    
    if (!headerValue) {
      console.log(`⚠️  ${headerName}: MISSING (optional) - ${config.description}`);
      results.warnings++;
    } else if (config.expectedValue && !headerValue.includes(config.expectedValue)) {
      console.log(`⚠️  ${headerName}: PRESENT but unexpected value`);
      console.log(`   Expected: ${config.expectedValue}`);
      console.log(`   Got: ${headerValue}`);
      results.warnings++;
    } else {
      console.log(`✅ ${headerName}: OK`);
      results.passed++;
    }
  }

  return results;
}

async function runTests() {
  console.log('🛡️  Security Headers Test Suite');
  console.log('================================\n');

  let totalResults = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  for (const testUrl of TEST_URLS) {
    try {
      console.log(`\n🌐 Testing ${testUrl}...`);
      const response = await makeRequest(testUrl);
      const results = testHeaders(response, testUrl);
      
      totalResults.passed += results.passed;
      totalResults.failed += results.failed;
      totalResults.warnings += results.warnings;
      
    } catch (error) {
      console.log(`❌ Failed to connect to ${testUrl}: ${error.message}`);
      totalResults.failed++;
    }
  }

  // Summary
  console.log('\n📊 SUMMARY');
  console.log('==========');
  console.log(`✅ Passed: ${totalResults.passed}`);
  console.log(`❌ Failed: ${totalResults.failed}`);
  console.log(`⚠️  Warnings: ${totalResults.warnings}`);

  if (totalResults.failed === 0) {
    console.log('\n🎉 All required security headers are present!');
  } else {
    console.log('\n⚠️  Some security headers are missing or misconfigured.');
  }

  if (totalResults.warnings > 0) {
    console.log('💡 Consider addressing the warnings for better security.');
  }

  process.exit(totalResults.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

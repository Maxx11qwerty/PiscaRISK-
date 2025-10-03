#!/usr/bin/env node

/**
 * Enhanced Security Headers Test Script
 * Specifically tests for Permissions-Policy and CSP security improvements
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

// Required security headers with enhanced validation
const REQUIRED_HEADERS = {
  'Strict-Transport-Security': {
    required: true,
    expectedValue: 'max-age=31536000; includeSubDomains; preload',
    description: 'HTTP Strict Transport Security'
  },
  'Content-Security-Policy': {
    required: true,
    expectedValue: 'default-src \'self\'',
    description: 'Content Security Policy',
    securityChecks: [
      {
        name: 'Has strict-dynamic',
        check: (value) => value.includes('strict-dynamic'),
        warning: 'Consider adding strict-dynamic for better security'
      },
      {
        name: 'Has upgrade-insecure-requests',
        check: (value) => value.includes('upgrade-insecure-requests'),
        warning: 'Consider adding upgrade-insecure-requests'
      },
      {
        name: 'Has block-all-mixed-content',
        check: (value) => value.includes('block-all-mixed-content'),
        warning: 'Consider adding block-all-mixed-content'
      },
      {
        name: 'Minimal unsafe-inline usage',
        check: (value) => {
          const scriptSrc = value.match(/script-src[^;]+/);
          if (!scriptSrc) return false;
          return scriptSrc[0].includes('unsafe-inline');
        },
        warning: 'unsafe-inline in script-src is a security risk - consider using nonces or hashes'
      },
      {
        name: 'Minimal unsafe-eval usage',
        check: (value) => {
          const scriptSrc = value.match(/script-src[^;]+/);
          if (!scriptSrc) return false;
          return scriptSrc[0].includes('unsafe-eval');
        },
        warning: 'unsafe-eval in script-src is a security risk - consider removing if possible'
      }
    ]
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
    description: 'Permissions Policy',
    securityChecks: [
      {
        name: 'Comprehensive feature control',
        check: (value) => {
          const features = [
            'accelerometer', 'ambient-light-sensor', 'autoplay', 'camera',
            'cross-origin-isolated', 'display-capture', 'document-domain',
            'encrypted-media', 'fullscreen', 'geolocation', 'gyroscope',
            'magnetometer', 'microphone', 'midi', 'payment', 'picture-in-picture',
            'publickey-credentials-get', 'screen-wake-lock', 'sync-xhr',
            'usb', 'web-share', 'xr-spatial-tracking', 'interest-cohort'
          ];
          return features.every(feature => value.includes(feature));
        },
        warning: 'Consider adding more comprehensive feature controls'
      },
      {
        name: 'Camera access properly controlled',
        check: (value) => value.includes('camera=(self)'),
        warning: 'Camera should be restricted to self'
      },
      {
        name: 'Microphone properly disabled',
        check: (value) => value.includes('microphone=()'),
        warning: 'Microphone should be disabled unless needed'
      },
      {
        name: 'Geolocation properly disabled',
        check: (value) => value.includes('geolocation=()'),
        warning: 'Geolocation should be disabled unless needed'
      }
    ]
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
        'User-Agent': 'Enhanced-Security-Headers-Test/1.0'
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
    warnings: 0,
    securityIssues: 0
  };

  // Test required headers
  console.log('\n📋 Required Security Headers:');
  for (const [headerName, config] of Object.entries(REQUIRED_HEADERS)) {
    const headerValue = headers[headerName.toLowerCase()];
    
    if (!headerValue) {
      console.log(`❌ ${headerName}: MISSING - ${config.description}`);
      results.failed++;
    } else {
      console.log(`✅ ${headerName}: PRESENT`);
      
      // Check expected value
      if (config.expectedValue && !headerValue.includes(config.expectedValue)) {
        console.log(`   ⚠️  Expected: ${config.expectedValue}`);
        console.log(`   📄 Got: ${headerValue}`);
        results.warnings++;
      }
      
      // Run security checks
      if (config.securityChecks) {
        console.log(`   🔒 Security Analysis:`);
        for (const check of config.securityChecks) {
          const checkResult = check.check(headerValue);
          if (checkResult) {
            console.log(`   ✅ ${check.name}`);
          } else {
            console.log(`   ⚠️  ${check.name}: ${check.warning}`);
            results.securityIssues++;
          }
        }
      }
      
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
    } else {
      console.log(`✅ ${headerName}: OK`);
    }
  }

  return results;
}

async function runTests() {
  console.log('🛡️  Enhanced Security Headers Test Suite');
  console.log('==========================================\n');

  let totalResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    securityIssues: 0
  };

  for (const testUrl of TEST_URLS) {
    try {
      console.log(`\n🌐 Testing ${testUrl}...`);
      const response = await makeRequest(testUrl);
      const results = testHeaders(response, testUrl);
      
      totalResults.passed += results.passed;
      totalResults.failed += results.failed;
      totalResults.warnings += results.warnings;
      totalResults.securityIssues += results.securityIssues;
      
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
  console.log(`🔒 Security Issues: ${totalResults.securityIssues}`);

  if (totalResults.failed === 0) {
    console.log('\n🎉 All required security headers are present!');
  } else {
    console.log('\n⚠️  Some security headers are missing or misconfigured.');
  }

  if (totalResults.securityIssues > 0) {
    console.log('\n🔒 Security improvements recommended:');
    console.log('   - Consider removing unsafe-inline and unsafe-eval from CSP');
    console.log('   - Implement nonce-based CSP for better security');
    console.log('   - Add comprehensive Permissions-Policy controls');
  }

  if (totalResults.warnings > 0) {
    console.log('💡 Consider addressing the warnings for better security.');
  }

  // Security Score
  const totalChecks = totalResults.passed + totalResults.failed + totalResults.warnings;
  const securityScore = totalChecks > 0 ? Math.round(((totalResults.passed - totalResults.securityIssues) / totalChecks) * 100) : 0;
  console.log(`\n🏆 Security Score: ${securityScore}%`);

  process.exit(totalResults.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

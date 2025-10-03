#!/usr/bin/env node

/**
 * CSP Nonce Generator
 * Generates a random nonce for Content Security Policy
 */

const crypto = require('crypto');

function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

function generateSecureCSP() {
  const nonce = generateNonce();
  
  // More secure CSP without unsafe-inline and unsafe-eval
  const csp = `default-src 'self'; ` +
    `script-src 'self' 'nonce-${nonce}' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com/recaptcha; ` +
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com; ` +
    `font-src 'self' https://fonts.gstatic.com; ` +
    `img-src 'self' data: https: blob:; ` +
    `connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com wss://*.firebaseio.com https://api.openweathermap.org https://us-central1-piscarisk.cloudfunctions.net https://www.google-analytics.com https://www.google.com; ` +
    `frame-src 'self' https://*.google.com https://*.firebaseapp.com https://*.firebase.com https://piscarisk.firebaseapp.com https://piscarisk.onrender.com; ` +
    `frame-ancestors 'self' https://*.google.com https://piscarisk.onrender.com; ` +
    `object-src 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'; ` +
    `upgrade-insecure-requests; ` +
    `block-all-mixed-content`;

  return { nonce, csp };
}

// For development, we'll use a more permissive CSP
function generateDevelopmentCSP() {
  return `default-src 'self'; ` +
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com/recaptcha; ` +
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ` +
    `font-src 'self' https://fonts.gstatic.com; ` +
    `img-src 'self' data: https: blob:; ` +
    `connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com wss://*.firebaseio.com https://api.openweathermap.org https://us-central1-piscarisk.cloudfunctions.net https://www.google-analytics.com https://www.google.com; ` +
    `frame-src 'self' https://*.google.com https://*.firebaseapp.com https://*.firebase.com https://piscarisk.firebaseapp.com https://piscarisk.onrender.com; ` +
    `frame-ancestors 'self' https://*.google.com https://piscarisk.onrender.com; ` +
    `object-src 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'`;
}

if (require.main === module) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const { nonce, csp } = generateSecureCSP();
    console.log('Production CSP with nonce:');
    console.log('Nonce:', nonce);
    console.log('CSP:', csp);
  } else {
    console.log('Development CSP:');
    console.log(generateDevelopmentCSP());
  }
}

module.exports = { generateNonce, generateSecureCSP, generateDevelopmentCSP };

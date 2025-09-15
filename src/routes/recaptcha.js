// Update src/routes/recaptcha.js with this simple version:
const express = require('express');
const router = express.Router();

console.log('Recaptcha router loaded');

// Test route
router.get('/test', (req, res) => {
  console.log('API test route called');
  res.json({ message: 'API test route is working from recaptcha.js!' });
});

// Simple reCAPTCHA route for testing
router.post('/verify-recaptcha', (req, res) => {
  console.log('reCAPTCHA route called with:', req.body);
  
  // For testing, return success without Google API call
  res.json({
    success: true,
    score: 0.85,
    message: 'reCAPTCHA verification successful (test mode)'
  });
});

module.exports = router;
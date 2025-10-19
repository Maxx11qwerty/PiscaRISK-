// Update src/routes/recaptcha.js with this simple version:
const express = require('express');
const router = express.Router();


// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'API test route is working from recaptcha.js!' });
});

// Simple reCAPTCHA route for testing
router.post('/verify-recaptcha', (req, res) => {
  
  // For testing, return success without Google API call
  res.json({
    success: true,
    score: 0.85,
    message: 'reCAPTCHA verification successful (test mode)'
  });
});

module.exports = router;
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Simple test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API test route is working!' });
});

// reCAPTCHA test route
app.post('/api/verify-recaptcha', (req, res) => {
  console.log('Received reCAPTCHA request:', req.body);
  res.json({ 
    success: true, 
    score: 0.8,
    message: 'Test reCAPTCHA verification successful' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test API: http://localhost:${PORT}/api/test`);
  console.log(`reCAPTCHA API: http://localhost:${PORT}/api/verify-recaptcha`);
});
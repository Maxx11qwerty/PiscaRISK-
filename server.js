require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = 3001;

console.log('Starting server...');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Debug middleware - log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Test route - add this BEFORE the recaptcha routes
app.get('/api/debug', (req, res) => {
  console.log('Debug route called');
  res.json({ message: 'Debug route is working!', timestamp: new Date().toISOString() });
});

// Try to load recaptcha routes with better error handling
console.log('Attempting to load recaptcha routes...');
try {
  const recaptchaRoutes = require('./src/routes/recaptcha');
  app.use('/api', recaptchaRoutes);
  console.log('Recaptcha routes loaded successfully');
} catch (error) {
  console.error('ERROR loading recaptcha routes:', error.message);
  console.error('Stack:', error.stack);
  
  // Add fallback routes
  app.get('/api/test', (req, res) => {
    res.json({ message: 'Fallback test route' });
  });
  
  app.post('/api/verify-recaptcha', (req, res) => {
    res.json({ success: true, score: 0.8, message: 'Fallback reCAPTCHA route' });
  });
}

// Serve static files from React build - BUT only for non-API routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    return next(); // Skip static serving for API routes
  }
  express.static(path.join(__dirname, 'build'))(req, res, next);
});

// For all other requests, serve the React app
app.get('*', (req, res) => {
  if (req.url.startsWith('/api/')) {
    // If we get here, it means no API route handled this request
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  console.log('Serving React app for:', req.url);
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Debug API: http://localhost:${PORT}/api/debug`);
  console.log(`Test API: http://localhost:${PORT}/api/test`);
  console.log(`reCAPTCHA API: http://localhost:${PORT}/api/verify-recaptcha`);
});
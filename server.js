require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const app = express();
const PORT = process.env.PORT || 3001;

console.log('Starting server...');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.100.6:3000',
    'https://*.firebaseapp.com',
    'https://*.googleapis.com'
  ],
  credentials: true
}));

// Helmet CSP for reCAPTCHA + Firebase with all security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://www.gstatic.com",
          "https://apis.google.com",
          "https://www.google.com",
          "https://www.recaptcha.net",
          "https://www.googletagmanager.com"
        ],
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://www.gstatic.com"
        ],
        "font-src": [
          "'self'",
          "https://fonts.gstatic.com",
          "https://www.gstatic.com"
        ],
        "img-src": [
          "'self'",
          "data:",
          "https:",
          "blob:",
          "https://www.gstatic.com",
          "https://www.google.com",
          "https://lh3.googleusercontent.com",
          "https://*.googleusercontent.com"
        ],
        "connect-src": [
          "'self'",
          "https://*.firebaseio.com",
          "https://*.googleapis.com",
          "https://*.gstatic.com",
          "wss://*.firebaseio.com",
          "https://api.openweathermap.org",
          "https://us-central1-piscarisk.cloudfunctions.net",
          "https://www.google-analytics.com",
          "https://www.google.com",
          "https://recaptcha.google.com",
          "https://www.recaptcha.net",
          "https://apis.google.com",
          "https://firebase.googleapis.com",
          "https://*.firestore.googleapis.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://firebaseinstallations.googleapis.com",
          "https://*.firebaseapp.com"
        ],
        "frame-src": [
          "'self'",
          "https://*.google.com",
          "https://*.firebaseapp.com",
          "https://*.firebase.com",
          "https://piscarisk.firebaseapp.com",
          "https://piscarisk.onrender.com"
        ],
        "frame-ancestors": [
          "'self'",
          "https://*.google.com",
          "https://piscarisk.onrender.com"
        ],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "worker-src": ["'self'", "blob:"],
        "upgrade-insecure-requests": [],
        "block-all-mixed-content": []
      }
    },
    crossOriginEmbedderPolicy: { policy: "unsafe-none" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    permissionsPolicy: {
      accelerometer: [],
      autoplay: [],
      camera: ["self"],
      "cross-origin-isolated": [],
      "display-capture": [],
      "encrypted-media": [],
      fullscreen: ["self"],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      midi: [],
      payment: [],
      "picture-in-picture": [],
      "publickey-credentials-get": [],
      "screen-wake-lock": [],
      "sync-xhr": [],
      usb: [],
      "web-share": [],
      "xr-spatial-tracking": [],
      "interest-cohort": []
    }
  })
);

// Explicit Permissions-Policy header for platforms that don't emit it via Helmet
const PERMISSIONS_POLICY_HEADER_VALUE = "accelerometer=(), autoplay=(), camera=(self), cross-origin-isolated=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=(), interest-cohort=()";
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY_HEADER_VALUE);
  next();
});

// Debug middleware - log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Firebase Admin verification middleware (protect API routes with ID token)
let admin = null;
try {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    // Initialize using environment (Render) or serviceAccountKey.json for local
    try {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (serviceAccountJson) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccountJson))
        });
      } else {
        const serviceAccount = require('./serviceAccountKey.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }
    } catch (e) {
      console.warn('Firebase Admin init fallback:', e?.message || e);
      admin.initializeApp();
    }
  }
} catch (e) {
  console.warn('firebase-admin not available:', e?.message || e);
}

const verifyFirebaseIdToken = async (req, res, next) => {
  // Only protect /api/secure/* endpoints by default
  if (!req.path.startsWith('/api/secure/')) return next();
  if (!admin) return res.status(500).json({ error: 'Auth not configured' });

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.*)$/i);
  const idToken = match ? match[1] : null;
  if (!idToken) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <ID_TOKEN>' });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken, true);
    req.user = decoded; // attach decoded token to request
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

app.use(verifyFirebaseIdToken);

// Test route
app.get('/api/debug', (req, res) => {
  console.log('Debug route called');
  res.json({ message: 'Debug route is working!', timestamp: new Date().toISOString() });
});

// ✅ OTP route
app.post('/api/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log(`Received OTP request for: ${phoneNumber}`);
    return res.json({ success: true, message: `OTP sent to ${phoneNumber} (mock)` });

  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Load recaptcha routes
console.log('Attempting to load recaptcha routes...');
try {
  const recaptchaRoutes = require('./src/routes/recaptcha');
  app.use('/api', recaptchaRoutes);
  console.log('Recaptcha routes loaded successfully');
} catch (error) {
  console.error('ERROR loading recaptcha routes:', error.message);
  console.error('Stack:', error.stack);

  // Fallback routes
  app.get('/api/test', (req, res) => {
    res.json({ message: 'Fallback test route' });
  });

  app.post('/api/verify-recaptcha', (req, res) => {
    res.json({ success: true, score: 0.8, message: 'Fallback reCAPTCHA route' });
  });
}

// Serve static files from React build - only for non-API routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    return next();
  }
  express.static(path.join(__dirname, 'build'))(req, res, next);
});

// Catch-all route for React app
app.get('*', (req, res) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  console.log('Serving React app for:', req.url);
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ✅ REMOVE THE DUPLICATE app.listen() CALL!
// Only keep this one:
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Debug API: http://localhost:${PORT}/api/debug`);
  console.log(`Test API: http://localhost:${PORT}/api/test`);
  console.log(`reCAPTCHA API: http://localhost:${PORT}/api/verify-recaptcha`);
  console.log(`Access via: http://127.0.0.1:${PORT}`);
});

// Example protected route (requires Authorization: Bearer <Firebase ID Token>)
app.get('/api/secure/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ uid: req.user.uid, email: req.user.email, role: req.user.role || null });
});
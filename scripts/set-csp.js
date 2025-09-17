const fs = require('fs');
const path = require('path');

// Read the current index.html
const indexPath = path.join(__dirname, '..', 'public', 'index.html');

let indexContent = fs.readFileSync(indexPath, 'utf8');

// Check if we're in production build
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  console.log('🔒 Setting PRODUCTION CSP (strict, no unsafe-eval)');
  
  // Production CSP - strict but allows all required services
// In your CSP update script
const productionCSP = `default-src 'self'; ` +
  `script-src 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://www.google.com/recaptcha/ https://apis.google.com https://www.googletagmanager.com; ` +
  `style-src 'self' 'unsafe-inline' https://www.gstatic.com https://fonts.googleapis.com; ` +
  `frame-src 'self' https://www.google.com https://www.gstatic.com https://recaptcha.google.com https://www.recaptcha.net https://www.google.com/recaptcha/; ` +
  `connect-src 'self' https://www.google.com https://www.gstatic.com https://recaptcha.google.com https://www.recaptcha.net https://apis.google.com https://firebase.googleapis.com https://*.firebaseio.com https://*.googleapis.com https://*.firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://api.openweathermap.org https://www.google-analytics.com; ` +
  `img-src 'self' data: https://www.gstatic.com https://www.google.com https://lh3.googleusercontent.com https://*.googleusercontent.com blob:; ` + // ← FIXED
  `font-src 'self' data: https://fonts.gstatic.com https://www.gstatic.com;` +
  `worker-src 'self' blob:;`;

  // Update the CSP meta tag
  if (indexContent.includes('http-equiv="Content-Security-Policy"')) {
    indexContent = indexContent.replace(
      /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/,
      `<meta http-equiv="Content-Security-Policy" content="${productionCSP.replace(/"/g, '&quot;')}" />`
    );
  } else {
    // Add CSP meta tag if it doesn't exist
    const headEnd = indexContent.indexOf('</head>');
    if (headEnd !== -1) {
      indexContent = indexContent.slice(0, headEnd) + 
        `<meta http-equiv="Content-Security-Policy" content="${productionCSP.replace(/"/g, '&quot;')}" />` +
        indexContent.slice(headEnd);
    }
  }
  
} else {
  console.log('🛠️  Setting DEVELOPMENT CSP (with all required services support)');
  
  // Development CSP - permissive for all services
  const developmentCSP = `default-src 'self'; ` +
    `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://www.google.com/recaptcha/ https://apis.google.com https://www.googletagmanager.com; ` +
    `style-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://fonts.googleapis.com; ` +
    `frame-src 'self' https://www.google.com https://www.gstatic.com https://recaptcha.google.com https://www.recaptcha.net https://www.google.com/recaptcha/; ` +
    `connect-src 'self' https://www.google.com https://www.gstatic.com https://recaptcha.google.com https://www.recaptcha.net https://apis.google.com https://firebase.googleapis.com https://*.firebaseio.com https://*.googleapis.com https://*.firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com wss://*.firebaseio.com https://*.firebaseapp.com https://api.openweathermap.org https://www.google-analytics.com; ` +
    `img-src 'self' data: https://www.gstatic.com https://www.google.com https://lh3.googleusercontent.com https://*.googleusercontent.com blob:; ` + // ← ADDED Google user images
    `font-src 'self' data: https://fonts.gstatic.com https://www.gstatic.com;` +
    `worker-src 'self' blob:;`;

  // Update the CSP meta tag for development
  if (indexContent.includes('http-equiv="Content-Security-Policy"')) {
    indexContent = indexContent.replace(
      /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/,
      `<meta http-equiv="Content-Security-Policy" content="${developmentCSP.replace(/"/g, '&quot;')}" />`
    );
  } else {
    // Add CSP meta tag if it doesn't exist
    const headEnd = indexContent.indexOf('</head>');
    if (headEnd !== -1) {
      indexContent = indexContent.slice(0, headEnd) + 
        `<meta http-equiv="Content-Security-Policy" content="${developmentCSP.replace(/"/g, '&quot;')}" />` +
        indexContent.slice(headEnd);
    }
  }
}

// Write the updated content
fs.writeFileSync(indexPath, indexContent);
console.log('✅ CSP updated successfully with Google user images support');
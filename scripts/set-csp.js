const fs = require('fs');
const path = require('path');

// Read the current index.html
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const productionIndexPath = path.join(__dirname, '..', 'public', 'production-index.html');

let indexContent = fs.readFileSync(indexPath, 'utf8');

// Check if we're in production build
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  console.log('🔒 Setting PRODUCTION CSP (strict, no unsafe-eval)');
  
  // Replace with production CSP
  const productionCSP = `default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com wss://*.firebaseio.com https://api.openweathermap.org https://us-central1-piscarisk.cloudfunctions.net https://www.google-analytics.com https://www.google.com; frame-src 'self' https://*.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`;
  
  // Add X-Frame-Options for production
  const xFrameOptions = `<meta http-equiv="X-Frame-Options" content="DENY" />`;
  
  indexContent = indexContent.replace(
    /script-src[^;]+;/g,
    `script-src 'self' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com;`
  );
  
  indexContent = indexContent.replace(
    /style-src[^;]+;/g,
    `style-src 'self' https://fonts.googleapis.com;`
  );
  
  indexContent = indexContent.replace(
    /img-src[^;]+;/g,
    `img-src 'self' data: https: blob:;`
  );
  
  // Add frame-ancestors if not present (only for production)
  if (!indexContent.includes('frame-ancestors')) {
    indexContent = indexContent.replace(
      /form-action[^;]+;/g,
      `form-action 'self'; frame-ancestors 'none';`
    );
  }
  
  // X-Frame-Options will be set by server headers, not meta tags
  // (Meta tags for X-Frame-Options are ignored by browsers)
  
} else {
  console.log('🛠️  Setting DEVELOPMENT CSP (with unsafe-eval for React)');
  
  // Ensure development CSP has unsafe-eval
  if (!indexContent.includes('unsafe-eval')) {
    indexContent = indexContent.replace(
      /script-src[^;]+;/g,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com/recaptcha https://www.google.com/recaptcha/ https://recaptcha.google.com/ https://www.recaptcha.net;`
    );
  }
  
  // Ensure development CSP has data: for images
  if (!indexContent.includes('data:')) {
    indexContent = indexContent.replace(
      /img-src[^;]+;/g,
      `img-src 'self' data: https: blob:;`
    );
  }

  // Ensure reCAPTCHA Enterprise endpoints are allowed in connect-src
  if (!indexContent.includes('recaptchaenterprise.googleapis.com')) {
    indexContent = indexContent.replace(
      /connect-src[^;]+;/g,
      `connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com wss://*.firebaseio.com https://api.openweathermap.org https://us-central1-piscarisk.cloudfunctions.net https://www.google-analytics.com https://www.google.com https://recaptchaenterprise.googleapis.com https://firebaseinstallations.googleapis.com;`
    );
  }

  // Ensure frame-src allows reCAPTCHA frames
  if (!indexContent.includes('recaptcha.google.com')) {
    indexContent = indexContent.replace(
      /frame-src[^;]+;/g,
      `frame-src 'self' https://*.google.com https://*.firebaseapp.com https://*.firebase.com https://piscarisk.firebaseapp.com https://piscarisk.onrender.com https://www.google.com/recaptcha/ https://recaptcha.google.com/ https://www.recaptcha.net/;`
    );
  }
}

// Write the updated content
fs.writeFileSync(indexPath, indexContent);
console.log('✅ CSP updated successfully');

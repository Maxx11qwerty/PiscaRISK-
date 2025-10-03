# Security Headers Implementation Guide

## Overview
This document outlines the comprehensive security headers implementation for the PiskaRisk web application across all deployment platforms.

## Implemented Security Headers

### 1. Strict-Transport-Security (HSTS)
- **Value**: `max-age=31536000; includeSubDomains; preload`
- **Purpose**: Forces browsers to use HTTPS for all future requests
- **Implementation**: ✅ All platforms

### 2. Content-Security-Policy (CSP)
- **Purpose**: Prevents XSS attacks by controlling resource loading
- **Configuration**: Comprehensive policy allowing Firebase, Google services, and reCAPTCHA
- **Implementation**: ✅ All platforms

### 3. X-Frame-Options
- **Value**: `SAMEORIGIN`
- **Purpose**: Prevents clickjacking attacks
- **Implementation**: ✅ All platforms

### 4. X-Content-Type-Options
- **Value**: `nosniff`
- **Purpose**: Prevents MIME type sniffing
- **Implementation**: ✅ All platforms

### 5. Referrer-Policy
- **Value**: `strict-origin-when-cross-origin`
- **Purpose**: Controls referrer information sent with requests
- **Implementation**: ✅ All platforms

### 6. Permissions-Policy
- **Value**: `camera=(self), microphone=(), geolocation=(), interest-cohort=()`
- **Purpose**: Controls browser features and APIs
- **Implementation**: ✅ All platforms

### 7. Cross-Origin-Opener-Policy (COOP)
- **Value**: `same-origin-allow-popups`
- **Purpose**: Required for OAuth redirects
- **Implementation**: ✅ All platforms

### 8. Cross-Origin-Embedder-Policy (COEP)
- **Value**: `unsafe-none`
- **Purpose**: Compatible with COOP for OAuth
- **Implementation**: ✅ All platforms

## Platform-Specific Implementation

### Firebase Hosting (firebase.json)
```json
{
  "hosting": {
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "Strict-Transport-Security",
            "value": "max-age=31536000; includeSubDomains; preload"
          },
          {
            "key": "Content-Security-Policy",
            "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com/recaptcha; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com wss://*.firebaseio.com https://api.openweathermap.org https://us-central1-piscarisk.cloudfunctions.net https://www.google-analytics.com https://www.google.com; frame-src 'self' https://*.google.com https://*.firebaseapp.com https://*.firebase.com https://piscarisk.firebaseapp.com https://piscarisk.onrender.com; frame-ancestors 'self' https://*.google.com https://piscarisk.onrender.com; object-src 'none'; base-uri 'self'; form-action 'self';"
          },
          {
            "key": "X-Frame-Options",
            "value": "SAMEORIGIN"
          },
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "Referrer-Policy",
            "value": "strict-origin-when-cross-origin"
          },
          {
            "key": "Permissions-Policy",
            "value": "camera=(self), microphone=(), geolocation=(), interest-cohort=()"
          }
        ]
      }
    ]
  }
}
```

### Netlify/Vercel (_headers file)
```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com/recaptcha; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com wss://*.firebaseio.com https://api.openweathermap.org https://us-central1-piscarisk.cloudfunctions.net https://www.google-analytics.com https://www.google.com; frame-src 'self' https://*.google.com https://*.firebaseapp.com https://*.firebase.com https://piscarisk.firebaseapp.com https://piscarisk.onrender.com; frame-ancestors 'self' https://*.google.com https://piscarisk.onrender.com; object-src 'none'; base-uri 'self'; form-action 'self';
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Cross-Origin-Embedder-Policy: unsafe-none
*/
```

### IIS/Windows (web.config)
```xml
<httpProtocol>
  <customHeaders>
    <add name="Strict-Transport-Security" value="max-age=31536000; includeSubDomains; preload" />
    <add name="Content-Security-Policy" value="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com/recaptcha; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com wss://*.firebaseio.com https://api.openweathermap.org https://us-central1-piscarisk.cloudfunctions.net https://www.google-analytics.com https://www.google.com; frame-src 'self' https://*.google.com https://*.firebaseapp.com https://*.firebase.com https://piscarisk.firebaseapp.com https://piscarisk.onrender.com; frame-ancestors 'self' https://*.google.com https://piscarisk.onrender.com; object-src 'none'; base-uri 'self'; form-action 'self';" />
    <add name="X-Frame-Options" value="SAMEORIGIN" />
    <add name="X-Content-Type-Options" value="nosniff" />
    <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
    <add name="Permissions-Policy" value="camera=(self), microphone=(), geolocation=(), interest-cohort=()" />
    <add name="Cross-Origin-Opener-Policy" value="same-origin-allow-popups" />
    <add name="Cross-Origin-Embedder-Policy" value="unsafe-none" />
  </customHeaders>
</httpProtocol>
```

### Express.js Server (server.js)
```javascript
app.use(helmet({
  contentSecurityPolicy: { /* CSP configuration */ },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'sameorigin' },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  permissionsPolicy: {
    camera: ["self"],
    microphone: [],
    geolocation: [],
    "interest-cohort": []
  },
  crossOriginEmbedderPolicy: { policy: "unsafe-none" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));
```

## Testing Security Headers

### Manual Testing
Use browser developer tools to check response headers:
1. Open Developer Tools (F12)
2. Go to Network tab
3. Reload the page
4. Check response headers for each request

### Automated Testing
Run the provided test script:
```bash
node test-security-headers.js
```

### Online Tools
- [Security Headers](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [SSL Labs](https://www.ssllabs.com/ssltest/)

## Troubleshooting

### Common Issues

1. **Headers not appearing**: Check if the hosting platform supports the header format
2. **CSP violations**: Check browser console for CSP errors and adjust policy
3. **OAuth issues**: Ensure COOP and COEP are compatible with OAuth flows
4. **Mixed content**: Ensure all resources are served over HTTPS

### Debugging Steps

1. Check browser developer tools for header presence
2. Use online security testing tools
3. Test on different browsers
4. Check server logs for configuration errors
5. Verify deployment platform documentation

## Security Benefits

- **XSS Protection**: CSP prevents malicious script execution
- **Clickjacking Protection**: X-Frame-Options prevents iframe embedding
- **HTTPS Enforcement**: HSTS ensures secure connections
- **MIME Sniffing Protection**: Prevents content type confusion attacks
- **Privacy Protection**: Referrer-Policy controls information leakage
- **Feature Control**: Permissions-Policy restricts browser capabilities

## Maintenance

- Regularly review and update CSP policies
- Monitor for new security header standards
- Test headers after any application updates
- Keep hosting platform configurations in sync
- Document any changes to security policies

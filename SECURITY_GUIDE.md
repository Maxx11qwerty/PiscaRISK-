# PiscaRisk Security Implementation Guide

Security measures implemented across the PiscaRisk web application, Express API server, and hosting platforms.

## Security Layers

| Layer | Files | What it protects |
|-------|-------|------------------|
| Hosting headers | `firebase.json`, `public/render.json`, `public/_headers`, `public/web.config`, `public/.htaccess` | Production HTTP response headers |
| HTML meta tags | `public/index.html` | CSP and meta security tags in the built app |
| Build script | `scripts/set-csp.js` | Swaps dev vs production CSP on `npm start` / `npm run build` |
| Express server | `server.js` (Helmet) | API routes and static file serving |
| Application code | `securityUtils.js`, `secureStorage.js`, `sanitize.js`, `logger.js` | Input sanitization, storage, audit logs |

> **Note:** Standalone CSP test HTML pages were removed from `public/` as they were manual dev tools only. They did **not** control production headers. Your security grade comes from the files above.

## 1. Content Security Policy (CSP)

**Issue addressed:** XSS via unrestricted script/style sources.

**Implementation:**

- `public/index.html` contains a CSP `<meta>` tag
- `scripts/set-csp.js` updates CSP for development vs production builds
- Hosting platforms add CSP via response headers (see deployment files)

**Allowed sources include:** Firebase, Google Auth, reCAPTCHA, OpenWeatherMap, Google Analytics (blocked client-side in `index.html` where configured).

**Weather API:** `https://api.openweathermap.org` is in `connect-src`.

## 2. Anti-clickjacking

**Issue addressed:** UI redress / clickjacking.

**Implementation:**

- `X-Frame-Options: SAMEORIGIN` (allows same-origin frames; required for OAuth/reCAPTCHA)
- `frame-ancestors` in CSP allows trusted domains (Google, Firebase, Render)
- Not `DENY` — OAuth popups and reCAPTCHA require controlled framing

## 3. X-Content-Type-Options

**Implementation:** `X-Content-Type-Options: nosniff` in hosting config and `index.html` meta.

## 4. Strict Transport Security (HSTS)

**Implementation:** `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` in `firebase.json`, `render.json`, `_headers`, `web.config`.

Requires HTTPS on the hosting platform.

## 5. Referrer & Permissions Policies

- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` restricts camera, microphone, geolocation, etc. (camera allowed for self where needed)

## 6. Timestamp Disclosure

**Implementation:** `src/utils/securityUtils.js`

- `sanitizeTimestamp()` — relative time instead of raw Unix timestamps in UI
- Used in components like `RiskReportModal.js`

## 7. Secure localStorage

**Implementation:** `src/utils/secureStorage.js`

- Wraps localStorage with sanitization and validation
- Data age limits and size checks
- Used by `LanguageContext` for locale preference

## 8. Input Sanitization

**Implementation:** `src/utils/sanitize.js` (client) and `functions/sanitize.js` (Cloud Functions)

- `sanitizeObjectStrings`, `sanitizeInput` used across forms, Firestore writes, and account service

## 9. Activity Logging

**Implementation:** `src/utils/logger.js`

- Audit trail for sensitive operations (password changes, account actions, exports)
- Firestore-backed log storage

## 10. Authentication Security

- Firebase Authentication (email/password, phone OTP, Google)
- reCAPTCHA Enterprise (`src/routes/recaptcha.js`, `server.js`)
- Firebase ID token verification on `/api/secure/*` routes (`server.js`)
- Email + phone verification gates before full dashboard access

## Server-Side Headers (Reference)

Typical production response headers:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' ...; connect-src 'self' https://*.firebaseio.com ...;
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(self), ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Cross-Origin-Opener-Policy: same-origin-allow-popups
```

Exact CSP strings differ slightly per platform — see `firebase.json` and `public/render.json` for canonical values.

## Deployment by Platform

| Platform | Configuration file |
|----------|-------------------|
| Firebase Hosting | `firebase.json` |
| Render.com | `public/render.json` |
| Netlify / Vercel | `public/_headers` |
| IIS | `public/web.config` |
| Apache | `public/.htaccess` |
| Custom Node | `server.js` (Helmet) |

## Verifying Security

1. **Browser DevTools** → Network → main document → Response Headers
2. **[securityheaders.com](https://securityheaders.com)** — scan your production URL (e.g. `https://piscarisk.onrender.com/`)
3. **[Mozilla Observatory](https://observatory.mozilla.org/)**
4. **curl:**
   ```bash
   curl -I https://your-site.com/
   ```

## Monitoring & Maintenance

1. Re-scan headers after each deployment
2. Keep dependencies updated (`npm audit`)
3. Review CSP console violations in browser
4. Monitor `logger.js` audit entries for suspicious activity
5. Rotate Firebase service account keys periodically

## Contact

- Email: security@piscarisk.onrender.com
- Security Policy: https://piscarisk.onrender.com/security-policy
- Security.txt: https://piscarisk.onrender.com/.well-known/security.txt

## Version History

- **v1.0** — Initial OWASP-oriented security implementation
- **v1.1** — Secure storage utilities
- **v1.2** — Timestamp sanitization
- **v2.0** — Updated for current hosting config; removed references to deleted test pages and `secureRouting.js`

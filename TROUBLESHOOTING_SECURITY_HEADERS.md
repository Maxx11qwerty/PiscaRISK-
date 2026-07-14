# Security Headers Troubleshooting Guide

How to diagnose and fix missing or incorrect security headers after deployment.

## Quick Diagnosis

```bash
# Check all response headers
curl -I https://your-site.com/

# Check specific headers
curl -I https://your-site.com/ | findstr /i "content-security-policy strict-transport"
```

Or use [securityheaders.com](https://securityheaders.com/) with your production URL.

## Which File Controls Headers?

| Hosting | Configuration file |
|---------|-------------------|
| Firebase Hosting | `firebase.json` |
| Render.com | `public/render.json` |
| Netlify / Vercel | `public/_headers` |
| IIS | `public/web.config` |
| Apache | `public/.htaccess` |
| Express (`server.js`) | Helmet middleware in code |
| All builds | `public/index.html` (CSP meta tag) + `scripts/set-csp.js` |

> Removed standalone test HTML pages (e.g. `csp-test.html`) were **manual dev tools only**. They never controlled production headers. Deleting them does not lower your security grade.

## Common Causes

### 1. Wrong platform config deployed

**Symptom:** Headers missing on Render but present locally.

**Fix:** Ensure `public/render.json` is in the repo and Render static site is used (not a misconfigured web service).

### 2. Firebase not redeployed

**Symptom:** Old headers after editing `firebase.json`.

**Fix:**
```bash
firebase deploy --only hosting --debug
```

### 3. Browser / CDN cache

**Symptom:** Headers look old after deploy.

**Fix:**
- Hard refresh: Ctrl+Shift+R
- Incognito window
- Wait 5–10 minutes for CDN
- Test with `curl -I` (bypasses browser cache)

### 4. Testing wrong URL

**Symptom:** Grade dropped after cleanup.

**Fix:** Scan the **main app URL** (`/` or `/login`), not removed test pages like `/csp-test.html`.

### 5. CSP syntax error

**Symptom:** Entire CSP header ignored.

**Fix:**
- Validate JSON in `firebase.json`
- Check semicolons in CSP directive strings
- Look for browser console CSP parse errors

## Platform-Specific Notes

### Firebase Hosting

- Headers in `firebase.json` → `hosting.headers`
- `source: "**"` applies to all files
- Some Firebase policies may supplement your headers

```bash
firebase --version
firebase deploy --only hosting --debug
```

### Render.com

- Uses `public/render.json` automatically for static sites
- **Not** `web.config` (that is for IIS)
- Build command: `npm run build:render`

### Netlify / Vercel

- `public/_headers` must be in the deployed `build` output
- CRA copies `public/` contents into `build/` on build

### Express (`server.js`)

- Helmet sets headers for API and static routes
- Used when running `npm run server` or `npm run start:prod`
- Does not apply if you deploy only the static `build/` folder without Node

## Verifying Headers

### Browser DevTools

1. F12 → Network
2. Reload page
3. Click document request (first row)
4. Response Headers section

### Expected headers

- `Content-Security-Policy`
- `Strict-Transport-Security` (HTTPS only)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy`
- `Permissions-Policy`

### Online tools

- [securityheaders.com](https://securityheaders.com/)
- [observatory.mozilla.org](https://observatory.mozilla.org/)

## CSP Violations

**Symptom:** Features broken, console shows CSP errors.

**Fix:**
1. Read the exact blocked URL in console
2. Add domain to appropriate directive in `firebase.json` / `render.json` / `set-csp.js`
3. Rebuild: `npm run build`
4. Redeploy

**Common domains already allowed:** Firebase, reCAPTCHA (Google infrastructure), OpenWeatherMap.

## reCAPTCHA / Firebase popup issues

Often header-related (not Google OAuth login — that is disabled):

- `frame-src` must include `*.google.com`, `recaptcha.google.com`
- `script-src` must include `www.gstatic.com`, `apis.google.com`
- `connect-src` must include Firebase and Identity Toolkit URLs
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` needed for reCAPTCHA and Firebase Auth phone verification

## Emergency Rollback

1. Revert `firebase.json` / `render.json` in git
2. Redeploy immediately
3. Verify site works
4. Fix CSP incrementally in dev

## Quick Fix Checklist

- [ ] Correct config file for your hosting platform
- [ ] Successful deploy after config change
- [ ] Testing main URL (`/`), not deleted test pages
- [ ] Browser cache cleared
- [ ] `curl -I` confirms headers server-side
- [ ] HTTPS enabled (required for HSTS)
- [ ] No CSP syntax errors in console

## Getting Help

1. [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) — what each layer does
2. [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — platform setup
3. Hosting platform docs (Firebase, Render, etc.)
4. security@piscarisk.onrender.com

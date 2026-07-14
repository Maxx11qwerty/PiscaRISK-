# PiscaRISK System Installation & Deployment Guide

Complete guide for installing and deploying PiscaRISK from **shared source code** (ZIP / folder copy). This project is distributed as raw source — **not** via a public Git repository.

**Related docs:** [README.md](./README.md) · [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) · [TROUBLESHOOTING_SECURITY_HEADERS.md](./TROUBLESHOOTING_SECURITY_HEADERS.md) · [docs/piscarisk-firestore.dbml](./docs/piscarisk-firestore.dbml)

> **Distribution model:** This guide assumes the recipient gets a **ZIP or folder copy** of the source code. No Git repository access is required to install or deploy.

### Packaging the source (for the team sharing the code)

When preparing the ZIP to send:

| Include | Exclude |
|---------|---------|
| `src/`, `public/`, `functions/`, `scripts/`, `docs/` | `node_modules/` |
| `package.json`, `package-lock.json`, `server.js`, `firebase.json` | `build/` |
| All `.md` documentation | `serviceAccountKey.json` |
| Config templates (`firebase.json`, `render.json`, etc.) | `.env`, `.env.*` |
| | `.git/` (optional — omit if no repo access intended) |

Recipient runs `npm install` after extracting. They configure Firebase and secrets on their own environment.

---

## Table of Contents

1. [How You Receive the Project](#1-how-you-receive-the-project)
2. [System Requirements](#2-system-requirements)
3. [Local Installation](#3-local-installation)
4. [Configuration After Install](#4-configuration-after-install)
5. [Firebase & Backend Setup](#5-firebase--backend-setup)
6. [Running Locally](#6-running-locally)
7. [Production Deployment](#7-production-deployment)
8. [Security Headers](#8-security-headers)
9. [Post-Deployment Verification](#9-post-deployment-verification)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. How You Receive the Project

You will get a **folder or ZIP archive** containing the full source code. Typical delivery:

- ZIP file (e.g. `piska-risk.zip`)
- Shared drive / USB / secure file transfer
- Private handoff from the development team

### What should be in the package

| Included | Path / notes |
|----------|----------------|
| Application source | `src/`, `public/`, `server.js`, `package.json` |
| Cloud Functions | `functions/` |
| Build / CSP scripts | `scripts/set-csp.js` |
| Hosting config | `firebase.json`, `public/render.json`, `public/_headers`, etc. |
| Documentation | `README.md`, `DEPLOYMENT_GUIDE.md`, `docs/` |

### What is NOT included (you add these yourself)

| Not in package | Why |
|----------------|-----|
| `node_modules/` | Installed with `npm install` on your machine |
| `build/` | Created by `npm run build` |
| `serviceAccountKey.json` | Secret — download from Firebase Console |
| `.env` files | Environment-specific secrets |
| Firebase credentials for your own project | You configure `src/firebase.js` or env vars |

> **Never share** `serviceAccountKey.json`, passwords, or API secrets inside the source ZIP.

### Extract and open the project

**Windows (PowerShell):**

```powershell
Expand-Archive -Path .\piska-risk.zip -DestinationPath .\piska-risk
cd .\piska-risk
```

**macOS / Linux:**

```bash
unzip piska-risk.zip -d piska-risk
cd piska-risk
```

You should see `package.json` in the folder root. All commands below are run from that root directory.

---

## 2. System Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |
| Firebase project | Auth + Firestore enabled |
| HTTPS | Required in production |

**Optional:**

- Firebase CLI (`firebase-tools`) — deploy Hosting / Functions from your machine
- PM2 — keep `server.js` running on a VPS
- SFTP/SCP client (WinSCP, FileZilla) — upload source to a server

**Authentication:** Login is **email/username + password** or **phone + password**, with email verification and phone OTP. **Google Sign-In is disabled.** reCAPTCHA uses Google infrastructure for bot protection only.

---

## 3. Local Installation

All steps assume you are inside the extracted project folder.

### Step 1 — Install main dependencies

```bash
npm install
```

### Step 2 — Install Cloud Functions dependencies

```bash
cd functions
npm install
cd ..
```

### Step 3 — Verify the install

```bash
npm run build
```

If this completes without errors, Node, dependencies, and `scripts/set-csp.js` are working. A `build/` folder will be created.

---

## 4. Configuration After Install

These files are **edited on your machine** after you receive the source — they are not shared in the ZIP with production secrets.

### A. Firebase client (`src/firebase.js`)

Update for your Firebase project (or your deployment domain):

```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "www.your-domain.com",  // use your production domain in prod
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

`authDomain` should match the URL users open in the browser for session persistence.

### B. Firebase Admin (Express server)

For `server.js` API routes, provide credentials **one** of these ways:

**Development — file in project root:**

```
serviceAccountKey.json   ← download from Firebase Console → Project settings → Service accounts
```

**Production — environment variable (recommended):**

```
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Paste the full JSON as a single line in your hosting panel or server `.env`.

### C. reCAPTCHA (optional check)

Site key is in `public/index.html`. Replace if you use your own reCAPTCHA Enterprise key.

### D. Checklist before first run

- [ ] `npm install` completed (root + `functions/`)
- [ ] `src/firebase.js` updated for your project/domain
- [ ] `serviceAccountKey.json` OR `FIREBASE_SERVICE_ACCOUNT_JSON` set (for API server)
- [ ] Firebase Console: Email/Password auth enabled, authorized domains added

---

## 5. Firebase & Backend Setup

Do this in [Firebase Console](https://console.firebase.google.com) on **your** project.

1. **Authentication**
   - Enable **Email/Password**
   - Add authorized domains: `localhost`, your production domain

2. **Firestore**
   - Create database with security rules
   - Schema: [docs/piscarisk-firestore.dbml](./docs/piscarisk-firestore.dbml)

3. **Deploy Cloud Functions** (from your machine, after `npm install` in `functions/`):

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use <your-project-id>
   firebase deploy --only functions
   ```

4. **Functions included:** `createStaffAccount`, `deleteAuthUser`, `adminResetPassword`, `forcePasswordChange`, `checkPasswordChangeRequired`, `autoDeactivateTempTOs`

---

## 6. Running Locally

### Full stack (recommended)

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| React app | http://localhost:3000 |
| Express API | http://localhost:3001 |

### React only

```bash
npm start
```

Run `npm run server` in a second terminal if you need `/api/*` routes.

### Test production build locally

```bash
npm run build
npm run start:prod
```

App + API served from port **3001**.

### NPM scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Dev server |
| `npm run build` | Production build |
| `npm run build:strict` | Stricter production CSP |
| `npm run server` | Express + `build/` folder |
| `npm run start:prod` | Production server |
| `npm run dev` | Express + React together |
| `npm run deploy:security` | Strict build + Firebase hosting deploy |

---

## 7. Production Deployment

Because you receive **source code only** (no Git repo access), deployment is done by:

1. **Uploading the folder** to a server (SFTP/SCP), then building and starting there, **or**
2. **Building on your PC** and uploading the `build/` output (static hosting only), **or**
3. **Deploying from your PC** with Firebase CLI (Hosting + Functions)

There is no requirement to use Git. If you later add the code to your own private repo, hosting platforms can connect to that — but it is optional.

---

### Option A: VPS / Dedicated Server (Recommended for full app)

Best when you need **Express** (`server.js`) for API routes, Helmet headers, and SPA routing.

**On your computer — prepare (optional):**

```bash
npm install
npm run build
```

**Upload to server** (example with SCP):

```bash
scp -r ./piska-risk user@your-server:/var/www/piscarisk
```

Or use WinSCP / FileZilla to upload the whole project folder.

**On the server (Linux):**

```bash
cd /var/www/piscarisk
npm install
cd functions && npm install && cd ..
npm run build

# Set environment variable (use your real JSON)
export NODE_ENV=production
export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# Start with PM2
npm install -g pm2
pm2 start server.js --name piscarisk
pm2 save
pm2 startup
```

**Nginx reverse proxy + HTTPS** (example):

```nginx
server {
    listen 80;
    server_name www.your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name www.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**After code updates:** upload changed files again, then on server:

```bash
cd /var/www/piscarisk
npm install          # if package.json changed
npm run build
pm2 restart piscarisk
```

---

### Option B: Render.com (without original Git repo)

Render normally connects to Git. With raw source only, use one of these:

**B1 — Push to your own private repo (optional)**

1. Create a new private repo on GitHub/GitLab/Bitbucket
2. Copy the received source into it and push
3. Connect that repo to Render → **Web Service**
4. Build: `npm run build:render` · Start: `npm run start:prod`
5. Set `FIREBASE_SERVICE_ACCOUNT_JSON` in Render environment

**B2 — Use VPS (Option A)** if you cannot use Git at all.

**Render Web Service settings:**

| Setting | Value |
|---------|-------|
| Build Command | `npm run build:render` |
| Start Command | `npm run start:prod` |
| Env | `NODE_ENV=production`, `FIREBASE_SERVICE_ACCOUNT_JSON=...` |

Headers come from **Helmet in `server.js`**.

**Render Static Site** (API not required): publish `build/` only; headers from `public/render.json`. No `server.js`.

---

### Option C: Firebase Hosting (deploy from your PC)

No server upload needed — deploy from the machine where you extracted the source:

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>
npm run build
firebase deploy --only hosting
```

Functions (separate):

```bash
firebase deploy --only functions
```

Or strict hosting deploy:

```bash
npm run deploy:security
```

---

### Option D: Static hosting only (Apache / IIS / Netlify)

If you **only** need the React app (no Express API):

1. On your machine:

   ```bash
   npm install
   npm run build
   ```

2. Upload **contents of `build/`** to web root.

3. Also deploy the matching config file:

   | Platform | File |
   |----------|------|
   | Apache | `public/.htaccess` |
   | IIS | `public/web.config` |
   | Netlify/Vercel | `public/_headers` |

> Without `server.js`, `/api/*` routes will not exist unless you host the API elsewhere.

---

### Option E: Windows Server (IIS)

1. Run `npm run build` on the server (or build locally and copy `build/`).
2. Copy `build/` to IIS wwwroot.
3. Copy `public/web.config` to the site root.
4. Install URL Rewrite module and HTTPS certificate.

For full API support, run `server.js` with PM2 or `nssm` and proxy IIS to port 3001.

---

## 8. Security Headers

Production headers are defined in project files — not removed when cleaning unused test HTML pages.

| Deployment | Header source |
|------------|---------------|
| Express (`server.js`) | Helmet in `server.js` |
| Render Static Site | `public/render.json` |
| Firebase Hosting | `firebase.json` |
| Netlify / Vercel | `public/_headers` |
| IIS / Apache | `web.config` / `.htaccess` |
| All builds | CSP in `public/index.html` via `scripts/set-csp.js` |

See [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) for details.

---

## 9. Post-Deployment Verification

1. `/` — landing page loads  
2. `/login` — form loads (no Google Sign-In button)  
3. Login with email or phone + password  
4. Email verification modal if needed  
5. Phone OTP on first login  
6. `/Homepage` — dashboard, weather, charts  
7. `/forgot-password` — reset flow  

**Headers:**

```bash
curl -I https://your-domain.com/
```

**Firebase:** production URL in Authentication → Authorized domains.

---

## 10. Troubleshooting

### `npm install` fails

- Confirm Node.js >= 18: `node -v`
- Delete `node_modules` and retry: `npm install`
- On Windows, run terminal as Administrator if path permissions fail

### Build fails after receiving new ZIP

```bash
rm -rf node_modules build
npm install
cd functions && npm install && cd ..
npm run build
```

### Login fails in production

- `authDomain` in `src/firebase.js` must match your live URL
- Add domain in Firebase → Authentication → Authorized domains
- Email/Password provider enabled (Google provider not required)

### API 404 in production

- Static hosting was used but app needs **Web Service** / `server.js`
- Use Option A (VPS) or Render Web Service with `npm run start:prod`

### Updating after a new source drop

1. Back up `src/firebase.js` and any local config you changed  
2. Extract new ZIP over old folder (or replace folder)  
3. Re-apply your Firebase config and secrets  
4. `npm install` → `npm run build` → restart server (`pm2 restart piscarisk`)

More: [TROUBLESHOOTING_SECURITY_HEADERS.md](./TROUBLESHOOTING_SECURITY_HEADERS.md)

---

## Support

1. Browser DevTools → Console / Network  
2. [SECURITY_GUIDE.md](./SECURITY_GUIDE.md)

---

**Last updated:** June 2025 · **Distribution:** raw source (ZIP/folder), not public Git

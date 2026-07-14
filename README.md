# PiscaRISK Web Application

## Overview

PiscaRISK is a web application for managing aquaculture operations: weather monitoring, pond conditions, risk assessment, user management, and reporting. Built with React and Firebase, it provides real-time dashboards, role-based access control, and integrations with OpenWeatherMap and Google reCAPTCHA Enterprise.

## Features

### User Management & Authentication

- **Roles**: Tech Officer, Farm Admin, Temporary Tech Officer, New Main Tech Officer, Fish Farmer
- **Login methods**: Email/username + password, phone number + password
- **Email verification**: Required before full dashboard access
- **Phone verification**: OTP on first login (Firebase phone auth)
- **Account status**: Active, Inactive, Suspended
- **Account creation**: Tech Officers and Admins create users via Account Management (no public self-signup page)
- **Philippine phone support**: Validation and E.164 normalization

### Password Management

- Self-service forgot-password flow (`/forgot-password`)
- Admin password reset via Cloud Functions (`adminResetPassword`)
- Password changes in Profile Settings
- Forced password change support (`forcePasswordChange`, `checkPasswordChangeRequired`)

**Password requirements**: 8+ characters, uppercase, lowercase, number, special character.

### Dashboard & Monitoring

- **Homepage** (`/Homepage`): Weather box, farm health gauge, ponds-at-risk chart, weekly risk trend, reports chart, risk report modal, PiscaRisk data panel
- **Pond conditions** (`/pond-conditions`): Water quality, fish condition, stock/feed logs
- **Weather**: OpenWeatherMap integration with animated weather assets
- **Risk analytics**: Stacked bar charts, trend charts, condition insights, export to PDF/CSV

### Reporting & Analytics

Export utilities support PDF and CSV for accounts, pond conditions, risk reports, logs, health gauge, feedback, weather, and more.

### UI/UX

- Public **landing page** at `/` with mobile app download (APK + QR)
- Responsive layout for mobile and desktop
- Shared **Sidebar** navigation across main pages
- English / Tagalog (i18next)
- Toast notifications (react-toastify + Sileo)
- Animated modals (`motion/react`)

## Application Routes

| Route | Access | Page |
|-------|--------|------|
| `/` | Public (redirects if logged in) | Landing page |
| `/login` | Public | Login |
| `/forgot-password` | Public | Forgot password |
| `/Homepage` | Active + phone verified | Main dashboard |
| `/AccountManagement` | Protected | User management |
| `/Feedback` | Protected | Feedback |
| `/logs` | Protected | Activity logs |
| `/pond-conditions` | Protected | Pond condition dashboard |
| `/ProfileSettings` | Protected | Profile & password settings |
| `*` | — | Redirects to `/login` |

Full dashboard access requires: `status === active`, `emailVerified === true`, and `phoneVerified === true`.

## Technical Architecture

### Frontend

- **React 19** with Context API and hooks
- **React Router 7** for routing and protected routes
- **MUI 7** for UI components
- **motion/react** (via `sileo` / `AnimatedModal`) for animations
- **Recharts** for charts
- **i18next** for English / Tagalog
- **react-toastify** + **Sileo** for notifications

### Backend & Services

- **Firebase**: Firestore, Authentication, Cloud Functions
- **Express** (`server.js`): reCAPTCHA verification, OTP mock endpoint, static build serving, Helmet security headers
- **Firebase Admin SDK**: Server-side token verification
- **Google Cloud reCAPTCHA Enterprise**
- **OpenWeatherMap API**

### React Contexts

| Context | Purpose |
|---------|---------|
| `AuthContext` | Authentication, session, verification |
| `FarmsContext` | Farm list and assignments |
| `RiskDataContext` | Risk report data (with farm exclusions) |
| `ReportsDataContext` | Reports bundle for charts |
| `DashboardMetaContext` | Dashboard metadata |
| `WeatherContext` | Weather data |
| `LanguageContext` | Locale (uses `secureStorage`) |
| `NotificationContext` | In-app notifications and toasts |

### Services

- `accountService.js` — user CRUD helpers
- `riskDataService.js` — risk predictions and scoring
- `reportsDataService.js` — reports bundle fetching
- `weatherService.js` — OpenWeatherMap integration

### Cloud Functions (`functions/index.js`)

- `createStaffAccount` — staff account creation
- `deleteAuthUser` — auth user deletion
- `adminResetPassword` — admin-initiated password reset
- `forcePasswordChange` — force password change flag
- `checkPasswordChangeRequired` — check if change required
- `autoDeactivateTempTOs` — scheduled deactivation of expired temporary tech officers

### Security

- CSP via `public/index.html` meta tags (updated by `scripts/set-csp.js` on build)
- Server/hosting headers: `firebase.json`, `public/render.json`, `public/_headers`, `public/web.config`, `public/.htaccess`
- `server.js` Helmet middleware for API server
- Input sanitization (`sanitize.js`), secure storage (`secureStorage.js`), security utils (`securityUtils.js`)
- Activity logging (`logger.js`)
- reCAPTCHA Enterprise on login

## Installation and Setup

See **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** for the full system installation and deployment guide. The project is distributed as **raw source code** (ZIP/folder), not via a public Git repository.

**Quick start (after extracting the source):**

```bash
cd piska-risk
npm install
cd functions && npm install && cd ..
npm run dev
```

Open http://localhost:3000 (React) with API on port 3001. Configure `src/firebase.js` and `serviceAccountKey.json` before production use — see the deployment guide.

## Usage

### Tech Officers

- Create and manage all user types in Account Management
- Reset passwords, assign farms, change roles
- View logs, export data, monitor all farms

### Farm Admins

- Manage users within assigned farm
- Monitor pond conditions and risk for assigned farm
- Create Fish Farmer accounts

### Fish Farmers

- Mobile-friendly access for field operations
- Submit pond data and feedback

### Login Flow

1. Visit `/login` (or `/` landing page → Login)
2. Sign in with email/username or phone number + password
3. Verify email if not yet verified (`EmailVerificationModal`)
4. Complete OTP on first login (`OtpVerification`)
5. Access dashboard via Sidebar navigation

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Dev server (runs `set-csp.js` first) |
| `npm run build` | Production build |
| `npm run build:strict` | Production build with strict CSP |
| `npm run build:render` | Render.com build command |
| `npm run server` | Express API server (port 3001) |
| `npm run dev` | Server + React concurrently |
| `npm run start:prod` | Production Express server |
| `npm run deploy:security` | Strict build + Firebase hosting deploy |
| `npm test` | Jest tests (react-scripts) |

## Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for local installation, Render Web Service (recommended), Firebase Hosting, VPS, Apache, and IIS.

Security headers are configured in hosting files — not removed when cleaning unused test pages. See [SECURITY_GUIDE.md](./SECURITY_GUIDE.md).

## Documentation

| Document | Description |
|----------|-------------|
| [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) | Index of all docs |
| [AUTHENTICATION_FLOW_UPDATE.md](./AUTHENTICATION_FLOW_UPDATE.md) | Auth and verification flow |
| [EMAIL_VERIFICATION_FLOW.md](./EMAIL_VERIFICATION_FLOW.md) | Email verification rules |
| [EXISTING_USERS_MIGRATION.md](./EXISTING_USERS_MIGRATION.md) | Legacy user migration |
| [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) | Security implementation |
| [TROUBLESHOOTING_SECURITY_HEADERS.md](./TROUBLESHOOTING_SECURITY_HEADERS.md) | Header troubleshooting |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Deployment guide |
| [SIDEBAR_USAGE_GUIDE.md](./SIDEBAR_USAGE_GUIDE.md) | Sidebar component |
| [docs/piscarisk-firestore.dbml](./docs/piscarisk-firestore.dbml) | Firestore schema (dbdiagram.io) |

## Support

- Email: security@piscarisk.onrender.com
- Security Policy: https://piscarisk.onrender.com/security-policy
- Security.txt: https://piscarisk.onrender.com/.well-known/security.txt

## License

All Rights Reserved

# PiscaRISK Documentation Index

Quick reference for all project documentation.

## Main Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Project overview, features, architecture, setup |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | System installation & deployment from shared source (ZIP/folder) |
| [docs/piscarisk-firestore.dbml](./docs/piscarisk-firestore.dbml) | Firestore schema diagram (paste into [dbdiagram.io](https://dbdiagram.io)) |

## Authentication & Users

| Document | Description |
|----------|-------------|
| [AUTHENTICATION_FLOW_UPDATE.md](./AUTHENTICATION_FLOW_UPDATE.md) | Login, OTP, and account activation flow |
| [EMAIL_VERIFICATION_FLOW.md](./EMAIL_VERIFICATION_FLOW.md) | Email verification requirements |
| [EXISTING_USERS_MIGRATION.md](./EXISTING_USERS_MIGRATION.md) | Legacy user status migration |

## Security

| Document | Description |
|----------|-------------|
| [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) | CSP, headers, sanitization, secure storage |
| [TROUBLESHOOTING_SECURITY_HEADERS.md](./TROUBLESHOOTING_SECURITY_HEADERS.md) | Debugging missing or incorrect headers |

## Components

| Document | Description |
|----------|-------------|
| [SIDEBAR_USAGE_GUIDE.md](./SIDEBAR_USAGE_GUIDE.md) | Sidebar navigation component |

## Quick Start

1. [README.md](./README.md) — overview and local setup
2. [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — deploy to production
3. [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) — verify security configuration

## By Audience

### Developers

- Setup: README.md
- Data model: docs/piscarisk-firestore.dbml
- Auth: AUTHENTICATION_FLOW_UPDATE.md, EMAIL_VERIFICATION_FLOW.md
- Security: SECURITY_GUIDE.md
- Deploy: DEPLOYMENT_GUIDE.md
- UI: SIDEBAR_USAGE_GUIDE.md

### Administrators

- User management: README.md (Usage), AUTHENTICATION_FLOW_UPDATE.md
- Security: SECURITY_GUIDE.md
- Troubleshooting: TROUBLESHOOTING_SECURITY_HEADERS.md

### Support

- Header issues: TROUBLESHOOTING_SECURITY_HEADERS.md
- Legacy users: EXISTING_USERS_MIGRATION.md

## Key Source Files (for reference)

| Area | Location |
|------|----------|
| Routes | `src/App.js` |
| Auth logic | `src/contexts/AuthContext.js` |
| CSP build script | `scripts/set-csp.js` |
| Firebase hosting headers | `firebase.json` |
| Render headers | `public/render.json` |
| Express server + Helmet | `server.js` |
| Cloud Functions | `functions/index.js` |

## Contributing to Documentation

1. Use clear filenames and section headers
2. Add new docs to this index
3. Link related documents
4. Update README.md for major feature changes
5. Keep docs aligned with `src/App.js` routes and `package.json` scripts


**Last Updated**: June 2025  
**Documentation Version**: 2.0

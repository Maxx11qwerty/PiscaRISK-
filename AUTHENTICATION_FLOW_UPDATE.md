# Authentication Flow

How user authentication, verification, and dashboard access work in the current PiscaRISK web app.

## Overview

- Users are **created by Tech Officers or Admins** in Account Management — there is no public `/signup` route
- Login supports **email/username** and **phone number** + password (**Google Sign-In disabled**)
- **Email verification** and **phone OTP** are required before full dashboard access
- Account **status** must be `active` (with auto-activation after email verification on login)

## Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `LandingPage` | Public marketing page; redirects to `/Homepage` if logged in |
| `/login` | `Login` | Main auth entry |
| `/forgot-password` | `ForgotPassword` | Self-service email reset |
| `/Homepage` | `Homepage` | Requires active + phone verified |

Protected routes use `ProtectedRoute` in `App.js` (Account Management, Feedback, Logs, Profile Settings, Pond Conditions).

## User Creation Flow

### 1. First Tech Officer

Created directly in Account Management (not from a public signup form).

### 2. Users Added by Tech Officer / Admin

When created via Account Management:

```javascript
{
  email: "user@example.com",
  username: "fnameexample",
  role: "admin" | "tech_officer" | "temp_tech_officer" | "fish_farmer",
  status: "inactive",
  emailVerified: false,
  phoneNumber: "+639171234567",  // E.164
  phoneVerified: false,
  createdAt: timestamp,
  createdBy: "creator_uid"
}
```

Cloud Function `createStaffAccount` may also be used for staff provisioning.

### 3. User Activates Account

1. User receives credentials / verification email
2. Verifies email (Firebase `sendEmailVerification`)
3. Logs in at `/login`
4. On first login: **OTP phone verification** (`OtpVerification` modal)
5. Status updates to `active`; user reaches `/Homepage`

## Login Methods

### A. Email / Username + Password

1. Resolve user in Firestore
2. If `emailVerified === false` → block with verification message
3. If `status === inactive` and email not verified → block (pending approval)
4. If email verified → status may auto-update to `active`
5. If `phoneVerified === false` → show OTP modal
6. Navigate to `/Homepage`

### B. Phone Number + Password

1. Validate Philippine mobile format (`phonePh.js`)
2. Normalize to E.164 (`+63...`)
3. Same email verification and status checks as email login
4. OTP on first login if phone not verified


## UI Components (Auth)

| Component | Purpose |
|-----------|---------|
| `Login.js` | Main login form and verification modals (Google Sign-In UI disabled) |
| `EmailVerificationModal` | Resend / return during email verification |
| `OtpVerification` | Phone OTP on first login |
| `MobileAppLandingModal` | Mobile app promo on login |
| `ForgotPassword` | Password reset request |

## AuthContext Key Functions

| Function | Purpose |
|----------|---------|
| `login` | Email/username login |
| `loginWithPhone` | Phone + password login |
| `signup` | Programmatic signup (used internally; no public page) |
| `logout` | Sign out |
| `resendVerificationEmail` | Resend email verification |
| `updateStatusAfterVerification` | Set status active after email verify |
| `checkEmailVerification` | Sync Firebase Auth email status to Firestore |
| `migrateExistingUser` | Migrate legacy user records |

## Dashboard Access Gate (`App.js`)

```javascript
const isFullyAuthed =
  currentUser &&
  status === 'active' &&
  emailVerified === true &&
  phoneVerified === true;

const canNavigate =
  currentUser &&
  status === 'active' &&
  phoneVerified === true;
```

`/Homepage` uses `canNavigate`. Full auth requires email + phone verified.

## Role Hierarchy

| Role | Access |
|------|--------|
| Tech Officer | Full system access |
| New Main Tech Officer | Tech officer privileges (promotion path) |
| Temporary Tech Officer | Time-limited admin; auto-deactivated by Cloud Function |
| Admin (no farm) | Super admin |
| Admin (with farm) | Farm Admin — scoped to assigned farm |
| Fish Farmer | Field/mobile operations |

## Security Benefits

1. No public self-registration bypass
2. Email verification enforced on all login methods
3. Phone ownership verified via OTP
4. Status synced between Firebase Auth and Firestore
5. Activity logged via `logger.js`

## Testing Scenarios

### New user, email not verified

1. Tech Officer creates user
2. User tries login → blocked: verify email first

### Email verified, first login

1. User verifies email
2. Login succeeds → OTP modal appears
3. After OTP → dashboard access

### Legacy user (no status field)

1. User logs in
2. `migrateExistingUser` runs automatically
3. Status set based on `emailVerified`

## Related Documentation

- [EMAIL_VERIFICATION_FLOW.md](./EMAIL_VERIFICATION_FLOW.md)
- [EXISTING_USERS_MIGRATION.md](./EXISTING_USERS_MIGRATION.md)
- [docs/piscarisk-firestore.dbml](./docs/piscarisk-firestore.dbml) — Firestore user schema

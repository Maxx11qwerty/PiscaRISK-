# Email Verification Flow

All users must verify their email before gaining full dashboard access, regardless of login method.

## Key Principle

**No user reaches the full dashboard without email verification and phone OTP (on first login).**

Public self-signup is **not** available — accounts are created by Tech Officers/Admins in Account Management.

## Flow Summary

```
Account created (inactive, emailVerified: false)
        ↓
User verifies email (Firebase link)
        ↓
emailVerified: true
        ↓
User logs in at /login
        ↓
Status → active (auto on login if verified)
        ↓
OTP modal (if phoneVerified: false)
        ↓
Dashboard access (/Homepage)
```

## Account States

### After creation (by admin)

```javascript
{
  status: "inactive",
  emailVerified: false,
  phoneVerified: false
}
```

### After email verification

```javascript
{
  status: "inactive",      // may still be inactive until login
  emailVerified: true,
  phoneVerified: false
}
```

### After successful login + OTP

```javascript
{
  status: "active",
  emailVerified: true,
  phoneVerified: true
}
```

## Login Enforcement

All methods apply the same rules:

| Method | Email check | Status check | OTP |
|--------|-------------|--------------|-----|
| Email/username + password | Yes | Yes | First login |
| Phone + password | Yes | Yes | First login |

## Error Messages

**Email not verified:**
> Please verify your email before logging in. Check your inbox for a verification link.

**Account inactive (not yet approved):**
> Your account is pending admin approval. Please wait for activation.

**Account suspended:**
> Your account has been suspended. Please contact support for assistance.

## UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `EmailVerificationModal` | `Login.js` | Shown when email unverified; resend / return actions |
| `OtpVerification` | `Login.js` | Phone OTP after successful credential login |

Verification status is managed in `AuthContext` — there is no separate verification status page.

## AuthContext Functions

### `checkEmailVerification()`

Syncs Firebase Auth `emailVerified` flag to the Firestore user document.

### `updateStatusAfterVerification()`

Sets `status: "active"` immediately after email verification (optional fast path before login).

### `resendVerificationEmail()`

Triggers Firebase `sendEmailVerification()` for the current user.

## Status Update Options

### Option A: On login (default)

Email verified → user logs in → system detects verification → sets `status: "active"`.

### Option B: Immediately after verification

Call `updateStatusAfterVerification()` after the user clicks the email link — user can log in anytime after.

## Security Benefits

1. Verified email required for all auth methods
2. Phone OTP confirms number ownership
3. Dashboard gated in `App.js` (`isFullyAuthed` / `canNavigate`)
4. Status changes logged via `logger.js`

## Testing

| Scenario | Expected |
|----------|----------|
| Unverified email login | Blocked + `EmailVerificationModal` |
| Verified email, no OTP yet | Login OK → OTP modal |
| Fully verified active user | Direct dashboard access |

## Firestore Schema

See [docs/piscarisk-firestore.dbml](./docs/piscarisk-firestore.dbml) for the full `users` collection schema and verification field notes.

## Related Docs

- [AUTHENTICATION_FLOW_UPDATE.md](./AUTHENTICATION_FLOW_UPDATE.md)
- [EXISTING_USERS_MIGRATION.md](./EXISTING_USERS_MIGRATION.md)

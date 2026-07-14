# Existing Users Migration Guide

How the authentication system handles users created before email verification and status fields were standardized.

## Problem

Legacy user records may have:

- Missing `status` field
- Old values: `"pending"`, `"new"`, or `null`
- Inconsistent `emailVerified` between Firebase Auth and Firestore
- Login blocked by new status checks

## Solution: Automatic Migration on Login

Migration runs during any login attempt in `AuthContext.js`:

1. Email/username login
2. Phone login

### Migration Logic

```javascript
if (!userData.status || userData.status === 'pending' || userData.status === 'new') {
  if (auth.currentUser.emailVerified) {
    status = 'active';
  } else {
    status = 'inactive';
  }
} else if (userData.status === 'inactive' && auth.currentUser.emailVerified) {
  status = 'active';
}
```

## Migration Scenarios

### Legacy user, no status, email verified

```
Before: status undefined, emailVerified true
After:  status "active"
Result: Dashboard access ✅
```

### Legacy user, pending status, email verified

```
Before: status "pending", emailVerified true
After:  status "active"
Result: Dashboard access ✅
```

### Legacy user, no status, email not verified

```
Before: status undefined, emailVerified false
After:  status "inactive"
Result: Must verify email first ⚠️
```

### Inactive but email verified

```
Before: status "inactive", emailVerified true
After:  status "active"
Result: Dashboard access ✅
```

### Suspended

```
status "suspended" → always blocked, no migration
```

## Manual Migration

### `migrateExistingUser(userId)` in AuthContext

Callable programmatically to force migration for a specific user ID.

**Use when:**

- Automatic login migration did not run
- Debugging status inconsistencies
- Admin tooling / support scripts

**Not exposed as a standalone UI page** — handled through AuthContext.

## Status Values Handled

| Value | Action |
|-------|--------|
| `undefined` / `null` | Migrate based on `emailVerified` |
| `"pending"` | Migrate based on `emailVerified` |
| `"new"` | Migrate based on `emailVerified` |
| `"inactive"` | → `"active"` if email verified |
| `"active"` | No change |
| `"suspended"` | Blocked, no migration |

## Collections

- Primary: `users`
- Legacy references to `mobileUsers` may exist in older code paths

## AuthContext Helper Functions

| Function | Purpose |
|----------|---------|
| `migrateExistingUser(userId)` | Manual migration |
| `checkEmailVerification()` | Sync email verified flag |
| `updateStatusAfterVerification()` | Set active after verification |

## Testing

### Test 1: Legacy login

1. User with missing `status` logs in
2. System migrates automatically
3. User reaches dashboard if email verified

### Test 2: Firestore consistency

1. Check user document after login
2. Confirm `status` and `emailVerified` are correct
3. Re-login to verify persistence

### Test 3: Unverified legacy user

1. User with no status, unverified email
2. Login blocked with verification message
3. After email verify + login → migrated to active

## Console Logging

Migration events are logged in `AuthContext` for debugging:

```javascript
console.log('Migrating existing user:', { email, currentStatus, emailVerified });
```

## Benefits

1. Seamless transition — no manual DB edits for most users
2. Backward compatible with all legacy records
3. Consistent security rules after migration
4. No data loss

## Troubleshooting

| Issue | Action |
|-------|--------|
| Migration not running | Check console logs; verify Firestore rules allow updates |
| Status still wrong | Call `migrateExistingUser(uid)` manually |
| User locked out | Confirm `emailVerified` in Firebase Auth console |
| Suspended by mistake | Update `status` in Firestore directly (admin) |

## Checklist

**Developers:**

- [ ] Test login with legacy users (no status field)
- [ ] Verify Firestore updates on login
- [ ] Check console for migration logs

**Users:**

- [ ] Existing users can log in normally after email verification
- [ ] OTP still required on first login if phone unverified

## Summary

Existing users are **not locked out**. On next login:

- Legacy status values are detected and corrected
- `emailVerified` from Firebase Auth drives the new status
- Phone OTP still applies if not yet verified

## Related Docs

- [AUTHENTICATION_FLOW_UPDATE.md](./AUTHENTICATION_FLOW_UPDATE.md)
- [EMAIL_VERIFICATION_FLOW.md](./EMAIL_VERIFICATION_FLOW.md)

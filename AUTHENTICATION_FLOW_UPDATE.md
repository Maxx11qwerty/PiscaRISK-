# Authentication Flow Update for Newly Added Admins

## Overview
This document explains the updated authentication flow that ensures newly added admins must verify their email before their account becomes active, even when using Google or Facebook Sign-In.

## Problem Solved
Previously, newly added admins could bypass email verification by using Google Sign-In, which would allow them to access the system without proper verification.

## Updated Authentication Flow

### 1. First Admin Creation
- The first admin is generated directly in Account Management (not from Firestore)
- Example: username: AdminTest, email: admintest1@gmail.com

### 2. New Admin Addition by First Admin
- When the first admin adds a new admin through Account Management:
  - New admin is stored in Firestore with `status: "inactive"`
  - `emailVerified: false`
  - `role: "admin"`
- Example: username: micaorjalo, email: chobikalu.21@gmail.com

### 3. Login Attempts by Newly Added Admin

#### A. Email/Username + Password Login
1. System checks if email exists in Firestore
2. If `status === "inactive"` → Block access with message: "Your account is pending admin approval. Please wait for activation."
3. User must verify email first
4. After email verification, `status` updates to `"active"`
5. OTP verification required on next login

#### B. Google Sign-In Login
1. **NEW**: System checks if email already exists in Firestore (by email, not UID)
2. If email exists and `role === "admin"` and `status === "inactive"`:
   - Link Google UID to existing Firestore document
   - Check if Google account email is verified
   - If NOT verified → Block access with message: "Please verify your email before logging in. Check your inbox for a verification link."
   - If verified → Update `status` to `"active"` and `emailVerified` to `true`
3. If email doesn't exist → Create new user document (normal flow)

#### C. Facebook Sign-In Login
1. **NEW**: Same logic as Google Sign-In
2. System checks if email already exists in Firestore
3. Enforces same email verification requirements

## Key Changes Made

### 1. Enhanced Google Sign-In Function
- Added email lookup in Firestore before UID lookup
- Detects newly added admins by email
- Links Google UID to existing Firestore document
- Enforces email verification before activation
- Updates status to active after verification

### 2. Enhanced Facebook Sign-In Function
- Same logic as Google Sign-In
- Prevents bypass of email verification

### 3. Enhanced Regular Login Function
- Added email verification check for both Tech Officers and Admins
- Auto-updates admin status to active after email verification

### 4. Enhanced Email Verification Check
- Automatically updates admin status to active when email is verified
- Maintains proper state synchronization

## Firestore Document Structure

```javascript
// Newly added admin document
{
  email: "chobikalu.21@gmail.com",
  username: "micaorjalo",
  role: "admin",
  status: "inactive",           // Changes to "active" after email verification
  emailVerified: false,         // Changes to true after verification
  createdAt: timestamp,
  createdBy: "admin_uid",
  // After Google/Facebook login:
  googleUid: "google_uid",      // Optional: if linked via Google
  facebookUid: "facebook_uid",  // Optional: if linked via Facebook
  lastModified: timestamp
}
```

## Security Benefits

1. **No Bypass**: Newly added admins cannot skip email verification using social login
2. **Consistent Flow**: All authentication methods follow the same verification rules
3. **Proper Linking**: Social accounts are properly linked to existing Firestore documents
4. **Status Management**: Account status automatically updates based on verification state
5. **Audit Trail**: All changes are logged with timestamps

## Testing Scenarios

### Scenario 1: New Admin with Google Sign-In (Email Not Verified)
1. Admin adds new admin via Account Management
2. New admin tries Google Sign-In
3. **Expected Result**: Blocked with "Please verify your email" message

### Scenario 2: New Admin with Google Sign-In (Email Verified)
1. Admin adds new admin via Account Management
2. New admin verifies email through verification link
3. New admin tries Google Sign-In
4. **Expected Result**: Account activated, status becomes "active"

### Scenario 3: New Admin with Regular Login (Email Not Verified)
1. Admin adds new admin via Account Management
2. New admin tries email/password login
3. **Expected Result**: Blocked with "Your account is pending admin approval" message

### Scenario 4: New Admin with Regular Login (Email Verified)
1. Admin adds new admin via Account Management
2. New admin verifies email through verification link
3. New admin tries email/password login
4. **Expected Result**: Login successful, status becomes "active"

## Console Logging
The system now includes detailed console logging for debugging:
- Google Sign-In flow details
- Facebook Sign-In flow details
- Email verification status updates
- Account status changes

## Next Steps
1. Test the authentication flow with newly added admins
2. Verify email verification works correctly
3. Test OTP verification after successful login
4. Monitor console logs for debugging information

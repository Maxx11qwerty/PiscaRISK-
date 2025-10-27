# Email Verification Flow - All Users Must Verify

## Overview
This document explains the updated authentication system where **ALL users** (regardless of login method) must verify their email before their account becomes active and they can access the dashboard.

## Key Principle
**No user can access the dashboard without email verification, regardless of how they log in.**

## Authentication Flow

### 1. **New User Registration (Signup)**
- User creates account with email/username/password
- Account is created with:
  - `status: "inactive"`
  - `emailVerified: false`
  - `role: "tech_officer"`
- Verification email is sent automatically
- **User cannot login until email is verified**

### 2. **New Account Addition (by Tech Officer)**
- Tech Officer adds new user via Account Management
- New user account is created with:
  - `status: "inactive"`
  - `emailVerified: false`
  - `role: "admin"` | `"tech_officer"` | `"temp_tech_officer"` | `"fish_farmer"`
- **New user cannot login until email is verified**

### 3. **Login Attempts - All Methods Enforce Email Verification**

#### **A. Traditional Login (Email/Username + Password)**
1. User enters credentials
2. System checks if account exists
3. **Email verification check**: If `emailVerified: false` → **BLOCKED**
4. **Status check**: If `status: "inactive"` → **BLOCKED**
5. **Only if email verified AND status active** → Login successful
6. **Status auto-update**: If email verified but status inactive → Status becomes "active"

#### **B. Phone Number Login**
1. User enters phone number and password
2. System validates Philippine mobile number format
3. **Email verification check**: If `emailVerified: false` → **BLOCKED**
4. **Status check**: If `status: "inactive"` → **BLOCKED**
5. **Only if email verified AND status active** → Login successful
6. **Status auto-update**: If email verified but status inactive → Status becomes "active"
7. **OTP Verification**: On first login, phone number verification via OTP required

## Error Messages

### **Email Not Verified**
```
"Please verify your email before logging in. Check your inbox for a verification link."
```

### **Account Inactive**
```
"Your account is pending admin approval. Please wait for activation."
```

### **Account Suspended**
```
"Your account has been suspended. Please contact support for assistance."
```

## Status Flow

### **Option 1: Status Update During Login (Current Default)**
```
New User/Admin Created
         ↓
   status: "inactive"
   emailVerified: false
         ↓
   User Verifies Email
         ↓
   emailVerified: true
   status: "inactive" (still)
         ↓
   User Attempts Login
         ↓
   System Detects Verification
         ↓
   status: "active" (auto-updated)
         ↓
   Login Successful
         ↓
   Access to Dashboard
```

### **Option 2: Immediate Status Update After Verification**
```
New User/Admin Created
         ↓
   status: "inactive"
   emailVerified: false
         ↓
   User Verifies Email
         ↓
   emailVerified: true
         ↓
   Call updateStatusAfterVerification()
         ↓
   status: "active" (immediately updated)
         ↓
   User Can Login Anytime
         ↓
   Access to Dashboard
```

## Firestore Document States

### **Initial State (After Creation)**
```javascript
{
  email: "user@example.com",
  username: "username",
  role: "tech_officer" | "admin" | "temp_tech_officer" | "fish_farmer",
  status: "inactive",           // Must be activated
  emailVerified: false,         // Must be verified
  createdAt: timestamp,
  createdBy: "tech_officer_uid" | "admin_uid" | "self"
}
```

### **After Email Verification**
```javascript
{
  email: "user@example.com",
  username: "username",
  role: "tech_officer" | "admin",
  status: "inactive",           // Still inactive until login
  emailVerified: true,          // Now verified
  createdAt: timestamp,
  createdBy: "admin_uid" | "self",
  lastModified: timestamp
}
```

### **After Successful Login (Status Auto-Updated)**
```javascript
{
  email: "user@example.com",
  username: "username",
  role: "tech_officer" | "admin",
  status: "active",             // Now active
  emailVerified: true,          // Verified
  createdAt: timestamp,
  createdBy: "admin_uid" | "self",
  lastModified: timestamp
}
```

## Security Benefits

1. **Email Verification Required**: Cannot access dashboard without verified email
2. **Phone Verification**: Mandatory OTP verification on first login
3. **Consistent Enforcement**: All login methods (email/phone) follow same rules
4. **Proper Activation**: Status only becomes "active" after verification
5. **Dashboard Protection**: Unverified users cannot access dashboard
6. **Audit Trail**: All status changes and verifications are logged with timestamps

## Testing Scenarios

### **Scenario 1: New User with Unverified Email**
1. User signs up → Status: "inactive", EmailVerified: false
2. User tries email login → **BLOCKED**: "Please verify your email"
3. User tries phone login → **BLOCKED**: "Please verify your email"

### **Scenario 2: User with Verified Email but Inactive Status**
1. User verifies email → EmailVerified: true, Status: "inactive"
2. User tries any login method → **SUCCESS**: Status auto-updates to "active"
3. User gains access to dashboard

### **Scenario 3: Active User with Verified Email**
1. User has Status: "active", EmailVerified: true
2. User tries any login method → **SUCCESS**: Immediate access
3. User proceeds to dashboard

## Implementation Details

### **Phone Number Login Enforcement**
- Validates Philippine mobile number format
- Normalizes phone number to E.164 format
- Checks phone number in Firestore
- Enforces email verification before allowing access
- Auto-updates status to "active" after verification

### **Phone Number OTP Verification**
- Triggered on first successful login
- Sends OTP via SMS to Philippine mobile number
- Verifies phone number ownership
- Required before accessing full dashboard features

### **Traditional Login Enforcement**
- Checks email verification status for all users
- Blocks access if email not verified
- Auto-updates status to "active" after verification

### **Status Management**
- Automatic status updates based on verification state
- Real-time synchronization between Firebase Auth and Firestore
- Proper error handling and user feedback

### **New Functions for Immediate Status Updates**

#### **`updateStatusAfterVerification()`**
- **Purpose**: Immediately update status to "active" after email verification
- **When to use**: After user verifies email, before they try to login
- **Benefit**: User can login immediately without waiting for status update during login
- **Usage**: Call this function after email verification is confirmed

#### **`checkEmailVerification()`**
- **Purpose**: Check current email verification status and update Firestore
- **When to use**: To verify current status and sync with Firebase Auth
- **Benefit**: Ensures Firestore is up-to-date with Firebase Auth status

### **EmailVerificationStatus Component**
- **Purpose**: Visual interface to check and update verification status
- **Features**: 
  - Shows current email verification and account status
  - Button to immediately update status to "active"
  - Button to resend verification email
  - Real-time status checking
- **Usage**: Add to any page where users need to manage their verification status

## Console Logging
The system includes detailed logging for debugging:
- Email verification status checks
- Status updates and changes
- Authentication flow details
- Error conditions and resolutions

## Next Steps
1. Test all login methods with unverified users
2. Verify email verification flow works correctly
3. Confirm status updates happen automatically
4. Test dashboard access restrictions
5. Monitor console logs for debugging information

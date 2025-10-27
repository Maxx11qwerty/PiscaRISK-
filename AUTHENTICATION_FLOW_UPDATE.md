# Authentication Flow Update for Newly Added Users

## Overview
This document explains the updated authentication flow that ensures newly added users must verify their email and phone number before their account becomes active and accessible.

## Key Features
- Email verification required for dashboard access
- OTP verification on first login to verify phone number
- Secure authentication via Firebase Authentication

## Updated Authentication Flow

### 1. First Tech Officer Creation
- The first Tech Officer is generated directly in Account Management (not from Firestore)
- Example: username: TechOfficer1, email: techofficer1@gmail.com

### 2. New User Addition by Tech Officer
- When a Tech Officer adds a new user through Account Management:
  - New user is stored in Firestore with `status: "inactive"`
  - `emailVerified: false`
  - `role: "admin"` | `"tech_officer"` | `"temp_tech_officer"` | `"fish_farmer"`
- Example: username: micaorjalo, email: chobikalu.21@gmail.com

### 3. Login Attempts by Newly Added User

#### A. Email/Username + Password Login
1. System checks if email exists in Firestore
2. If `status === "inactive"` → Block access with message: "Your account is pending admin approval. Please wait for activation."
3. User must verify email first
4. After email verification, `status` updates to `"active"`
5. OTP verification required on next login

#### B. Phone Number Login
1. System validates Philippine mobile number format
2. Normalizes phone number to E.164 format (+63...)
3. Checks if phone number exists in Firestore
4. Enforces same email verification and status checks
5. User can login with either email or phone number

## Key Changes Made

### 1. Enhanced Phone Number Login
- Philippine mobile number validation and formatting
- Normalization to E.164 format for consistency
- Support for both email and phone number as login credentials
- Proper integration with Firebase Authentication

### 2. Phone Number Verification
- Mandatory OTP verification on first login
- SMS-based verification for Philippine numbers
- Validates phone ownership before full system access

### 3. Enhanced Regular Login Function
- Added email verification check for both Tech Officers and Admins
- Auto-updates admin status to active after email verification

### 4. Enhanced Email Verification Check
- Automatically updates user status to active when email is verified
- Maintains proper state synchronization

### 5. OTP Verification System
- Triggered on first successful login
- Verifies phone number ownership
- Required before accessing dashboard
- Uses Firebase phone authentication

## Firestore Document Structure

```javascript
// Newly added user document
{
  email: "chobikalu.21@gmail.com",
  username: "fnameexample",
  role: "admin" | "tech_officer" | "temp_tech_officer" | "fish_farmer",
  status: "inactive",           // Changes to "active" after email verification
  emailVerified: false,         // Changes to true after verification
  createdAt: timestamp,
  createdBy: "tech_officer_uid" | "admin_uid",
  phoneNumber: "+639171234567",  // Normalized E.164 format
  phoneVerified: false,         // Set to true after OTP verification
  lastModified: timestamp
}
```

## Security Benefits

1. **No Bypass**: Newly added users cannot skip email verification using social login
2. **Consistent Flow**: All authentication methods follow the same verification rules
3. **Proper Linking**: Social accounts are properly linked to existing Firestore documents
4. **Status Management**: Account status automatically updates based on verification state
5. **Audit Trail**: All changes are logged with timestamps

## Testing Scenarios

### Scenario 1: New User with Email Login (Email Not Verified)
1. Tech Officer adds new user via Account Management
2. New user tries email/password login
3. **Expected Result**: Blocked with "Please verify your email" message

### Scenario 2: New User with Email Login (Email Verified)
1. Tech Officer adds new user via Account Management
2. New user verifies email through verification link
3. New user tries email/password login
4. **Expected Result**: Account activated, status becomes "active"
5. **OTP Prompt**: User must verify phone number with OTP on first login

### Scenario 3: New User with Regular Login (Email Not Verified)
1. Tech Officer adds new user via Account Management
2. New user tries email/password login
3. **Expected Result**: Blocked with "Your account is pending approval" message

### Scenario 4: New User with Regular Login (Email Verified)
1. Tech Officer adds new user via Account Management
2. New user verifies email through verification link
3. New user tries email/password login
4. **Expected Result**: Login successful, status becomes "active"

## Console Logging
The system now includes detailed console logging for debugging:
- Email and phone login flow details
- Email verification status updates
- OTP verification process
- Account status changes
- Phone number normalization and validation

## Next Steps
1. Test the authentication flow with newly added users
2. Verify email verification works correctly
3. Test OTP verification after successful login
4. Monitor console logs for debugging information

## Current Role Hierarchy

1. **Tech Officer**: Full system access, can create all user types
2. **Admin** (with farm): Farm-specific admin access, can only create Fish Farmers
3. **Temporary Tech Officer**: Limited-time administrative access
4. **Fish Farmer**: Mobile-optimized field operations access

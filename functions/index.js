const functions = require("firebase-functions");
const admin = require("firebase-admin");


if (!admin.apps.length) {
  admin.initializeApp();
}

const cors = require('cors')({ origin: true });



/**
 * Creates a staff account with admin privileges
 */
exports.createStaffAccount = functions.https.onCall(async (data, context) => {

  console.log("=== STARTING FUNCTION EXECUTION ===");
  console.log("Received data:", JSON.stringify(data));
  console.log("Context auth:", context.auth);

  // Validate authentication
  if (!context.auth) {
    console.error("FAIL: Unauthenticated request");
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in");
  }
  if (!data || typeof data !== 'object') {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid request data');
  }
  

  // Verify admin status
  try {
    console.log("Checking admin status for UID:", context.auth.uid);
    const isAdminUser = await isAdmin(context.auth.uid);
    console.log("Admin check result:", isAdminUser);
    
    if (!isAdminUser) {
      console.error("FAIL: User is not admin");
      throw new functions.https.HttpsError("permission-denied", "Admin privileges required");
    }
  } catch (err) {
    console.error("Error during admin check:", err);
    throw new functions.https.HttpsError("internal", "Failed to verify admin status");
  }

  // Create user
  let userRecord;
  try {
    console.log("Attempting to create user with email:", data.email);
    userRecord = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.username,
    });
    console.log("User created successfully, UID:", userRecord.uid);
  } catch (err) {
    console.error("FAIL: Error creating auth user:", err);
    throw new functions.https.HttpsError("internal", "Failed to create auth user");
  }

  // Create Firestore document
  // Now use userRecord.uid in the Firestore creation
  try {
    console.log("Attempting to create Firestore document");
    const collectionName = data.role === 'Fish Farmer' ? 'mobileUsers' : 'users';
    
    const userData = {
      email: data.email,
      username: data.username,
      role: data.role || "Staff",
      status: data.status || "Active", // Use status from form data or fallback to Active
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
      address: data.address || "",
      contactNumber: data.contactNumber || "",
      dateJoined: data.dateJoined || new Date().toISOString().split('T')[0], // Use provided date or fallback to current date
      fullName: data.fullName || "",
      profileImage: data.profileImage || null,
    };
    
    // Add mobile user specific fields for Fish Farmers
    if (data.role === 'Fish Farmer') {
      userData.isMobileUser = true;
      userData.accessLevel = 'mobile';
    }
    
    await admin.firestore().collection(collectionName).doc(userRecord.uid).set(userData);
    console.log(`Firestore document created successfully in ${collectionName} collection`);
  } catch (err) {
    console.error("FAIL: Error creating Firestore document:", err);
    throw new functions.https.HttpsError("internal", "Failed to create user document");
  }

  console.log("=== FUNCTION COMPLETED SUCCESSFULLY ===");
  return { success: true };
});

/**
 * Deletes a Firebase Auth user by email
 */
exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  return cors(req, res, async () => {
    console.log("=== STARTING DELETE AUTH USER FUNCTION ===");
    console.log("Received data:", JSON.stringify(data));
    console.log("Context auth:", context.auth);

    // Validate authentication
    if (!context.auth) {
      console.error("FAIL: Unauthenticated request");
      throw new functions.https.HttpsError("unauthenticated", "You must be signed in");
    }
    
    // Validate request data
    if (!data || !data.email) {
      throw new functions.https.HttpsError('invalid-argument', 'Email is required');
    }

    // Verify admin status
    try {
      console.log("Checking admin status for UID:", context.auth.uid);
      const isAdminUser = await isAdmin(context.auth.uid);
      console.log("Admin check result:", isAdminUser);
      
      if (!isAdminUser) {
        console.error("FAIL: User is not admin");
        throw new functions.https.HttpsError("permission-denied", "Admin privileges required");
      }
    } catch (err) {
      console.error("Error during admin check:", err);
      throw new functions.https.HttpsError("internal", "Failed to verify admin status");
    }

    // Delete Firebase Auth user
    try {
      console.log("Attempting to delete Firebase Auth user with email:", data.email);
      
      // Find user by email
      const userRecord = await admin.auth().getUserByEmail(data.email);
      console.log("Found user with UID:", userRecord.uid);
      
      // Delete the user
      await admin.auth().deleteUser(userRecord.uid);
      console.log("Firebase Auth user deleted successfully");
      
    } catch (err) {
      console.error("FAIL: Error deleting Firebase Auth user:", err);
      
      // If user not found, that's okay - they might have been deleted already
      if (err.code === 'auth/user-not-found') {
        console.log("User not found in Firebase Auth - may have been deleted already");
        return { success: true, message: "User not found in Auth (may have been deleted already)" };
      }
      
      throw new functions.https.HttpsError("internal", "Failed to delete Firebase Auth user");
    }

    console.log("=== FUNCTION COMPLETED SUCCESSFULLY ===");
    return { success: true, message: "User deleted from Firebase Auth successfully" };
  });
});

/**
 * Allows admins to reset user passwords
 */
exports.adminResetPassword = functions.https.onCall(async (data, context) => {
  console.log("=== STARTING ADMIN RESET PASSWORD FUNCTION ===");
  console.log("Received data:", JSON.stringify(data));
  console.log("Context auth:", context.auth);

  // Validate authentication
  if (!context.auth) {
    console.error("FAIL: Unauthenticated request");
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in");
  }
  
  // Validate request data
  if (!data || !data.userEmail || !data.newPassword) {
    throw new functions.https.HttpsError('invalid-argument', 'User email and new password are required');
  }

  // Verify admin status
  try {
    console.log("Checking admin status for UID:", context.auth.uid);
    const isAdminUser = await isAdmin(context.auth.uid);
    console.log("Admin check result:", isAdminUser);
    
    if (!isAdminUser) {
      console.error("FAIL: User is not admin");
      throw new functions.https.HttpsError("permission-denied", "Admin privileges required");
    }
  } catch (err) {
    console.error("Error during admin check:", err);
    throw new functions.https.HttpsError("internal", "Failed to verify admin status");
  }

  // Reset user password
  try {
    console.log("Attempting to reset password for user with email:", data.userEmail);
    
    // Find user by email
    const userRecord = await admin.auth().getUserByEmail(data.userEmail);
    console.log("Found user with UID:", userRecord.uid);
    
    // Update the user's password
    await admin.auth().updateUser(userRecord.uid, {
      password: data.newPassword
    });
    
    console.log("Password reset successfully for user:", data.userEmail);
    
    // Update Firestore document to track password reset
    try {
      // Check both collections to find the user document
      let userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
      let collectionName = 'users';
      
      if (!userDoc.exists()) {
        // Check mobileUsers collection
        userDoc = await admin.firestore().collection('mobileUsers').doc(userRecord.uid).get();
        if (userDoc.exists()) {
          collectionName = 'mobileUsers';
        }
      }
      
      if (userDoc.exists()) {
        // Update the user document with password reset information
        await admin.firestore().collection(collectionName).doc(userRecord.uid).update({
          lastPasswordReset: admin.firestore.FieldValue.serverTimestamp(),
          passwordResetBy: context.auth.uid,
          passwordResetMethod: 'admin_reset',
          requiresPasswordChange: true // Flag to indicate user should change password on next login
        });
        console.log(`Updated Firestore document in ${collectionName} collection`);
      } else {
        console.warn('User document not found in Firestore');
      }
    } catch (firestoreError) {
      console.warn('Could not update Firestore document:', firestoreError);
      // This is not critical - the password reset is the main goal
    }
    
    // Log the password reset activity
    try {
      await admin.firestore().collection('activityLogs').add({
        action: 'password_reset',
        adminUID: context.auth.uid,
        userEmail: data.userEmail,
        userUID: userRecord.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: 'Password reset by admin',
        resetMethod: 'admin_reset'
      });
      console.log('Password reset activity logged successfully');
    } catch (logError) {
      console.warn('Could not log password reset activity:', logError);
      // This is not critical - the password reset is the main goal
    }
    
  } catch (err) {
    console.error("FAIL: Error resetting user password:", err);
    
    if (err.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError("not-found", "User not found with this email address");
    } else if (err.code === 'auth/invalid-password') {
      throw new functions.https.HttpsError("invalid-argument", "Invalid password format");
    } else if (err.code === 'auth/weak-password') {
      throw new functions.https.HttpsError("invalid-argument", "Password is too weak. Please use a stronger password.");
    }
    
    throw new functions.https.HttpsError("internal", "Failed to reset user password");
  }

  console.log("=== FUNCTION COMPLETED SUCCESSFULLY ===");
  return { 
    success: true, 
    message: "Password reset successfully. User can now login with the new password." 
  };
});

/**
 * Allows users to change their password after admin reset
 */
exports.forcePasswordChange = functions.https.onCall(async (data, context) => {
  console.log("=== STARTING FORCE PASSWORD CHANGE FUNCTION ===");
  console.log("Received data:", JSON.stringify(data));
  console.log("Context auth:", context.auth);

  // Validate authentication
  if (!context.auth) {
    console.error("FAIL: Unauthenticated request");
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in");
  }
  
  // Validate request data
  if (!data || !data.newPassword) {
    throw new functions.https.HttpsError('invalid-argument', 'New password is required');
  }

  try {
    console.log("Attempting to change password for user UID:", context.auth.uid);
    
    // Update the user's password
    await admin.auth().updateUser(context.auth.uid, {
      password: data.newPassword
    });
    
    console.log("Password changed successfully for user:", context.auth.uid);
    
    // Update Firestore document to remove the password change requirement
    try {
      // Check both collections to find the user document
      let userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
      let collectionName = 'users';
      
      if (!userDoc.exists()) {
        // Check mobileUsers collection
        userDoc = await admin.firestore().collection('mobileUsers').doc(context.auth.uid).get();
        if (userDoc.exists()) {
          collectionName = 'mobileUsers';
        }
      }
      
      if (userDoc.exists()) {
        // Update the user document to remove password change requirement
        await admin.firestore().collection(collectionName).doc(context.auth.uid).update({
          lastPasswordChange: admin.firestore.FieldValue.serverTimestamp(),
          requiresPasswordChange: false,
          passwordChangedFromReset: true
        });
        console.log(`Updated Firestore document in ${collectionName} collection`);
      } else {
        console.warn('User document not found in Firestore');
      }
    } catch (firestoreError) {
      console.warn('Could not update Firestore document:', firestoreError);
      // This is not critical - the password change is the main goal
    }
    
    // Log the password change activity
    try {
      await admin.firestore().collection('activityLogs').add({
        action: 'password_change',
        userUID: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: 'Password changed after admin reset',
        changeMethod: 'user_change_after_reset'
      });
      console.log('Password change activity logged successfully');
    } catch (logError) {
      console.warn('Could not log password change activity:', logError);
      // This is not critical - the password change is the main goal
    }
    
  } catch (err) {
    console.error("FAIL: Error changing user password:", err);
    
    if (err.code === 'auth/invalid-password') {
      throw new functions.https.HttpsError("invalid-argument", "Invalid password format");
    } else if (err.code === 'auth/weak-password') {
      throw new functions.https.HttpsError("invalid-argument", "Password is too weak. Please use a stronger password.");
    }
    
    throw new functions.https.HttpsError("internal", "Failed to change user password");
  }

  console.log("=== FUNCTION COMPLETED SUCCESSFULLY ===");
  return { 
    success: true, 
    message: "Password changed successfully" 
  };
});

/**
 * Check if user needs to change password after admin reset
 */
exports.checkPasswordChangeRequired = functions.https.onCall(async (data, context) => {
  console.log("=== STARTING CHECK PASSWORD CHANGE REQUIRED FUNCTION ===");
  console.log("Context auth:", context.auth);

  // Validate authentication
  if (!context.auth) {
    console.error("FAIL: Unauthenticated request");
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in");
  }

  try {
    console.log("Checking password change requirement for user UID:", context.auth.uid);
    
    // Check both collections to find the user document
    let userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    let collectionName = 'users';
    
    if (!userDoc.exists()) {
      // Check mobileUsers collection
      userDoc = await admin.firestore().collection('mobileUsers').doc(context.auth.uid).get();
      if (userDoc.exists()) {
        collectionName = 'mobileUsers';
      }
    }
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const requiresChange = userData.requiresPasswordChange === true;
      
      console.log(`User ${context.auth.uid} requires password change: ${requiresChange}`);
      
      return { 
        success: true, 
        requiresPasswordChange: requiresChange,
        lastPasswordReset: userData.lastPasswordReset,
        passwordResetBy: userData.passwordResetBy
      };
    } else {
      console.warn('User document not found in Firestore');
      return { 
        success: true, 
        requiresPasswordChange: false 
      };
    }
    
  } catch (err) {
    console.error("FAIL: Error checking password change requirement:", err);
    throw new functions.https.HttpsError("internal", "Failed to check password change requirement");
  }
});

/**
 * Helper function to check admin status
 * @param {string} uid
 */
async function isAdmin(uid) {
    try {
      const userDoc = await admin.firestore().collection("users").doc(uid).get();
      console.log("User doc fetched:", userDoc.exists);
      return userDoc.exists && userDoc.data().role === "Admin";
    } catch (err) {
      console.error("Error checking admin role:", err);
      return false;
    }
  }
  
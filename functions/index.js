const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { sanitizeObjectStrings, sanitizeInput } = require("./sanitize");


if (!admin.apps.length) {
  admin.initializeApp();
}
/**
* Scheduled job: auto-deactivate temporary tech officers after effectiveTo
* Guarded so deployment to older firebase-functions versions won't fail analysis.
*/
if (functions.pubsub && typeof functions.pubsub.schedule === 'function') {
  exports.autoDeactivateTempTOs = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    const batch = db.batch();
    try {
      const snap = await db.collection('users').where('temporaryTechOfficer', '==', true).get();
      for (const docSnap of snap.docs) {
        const u = docSnap.data() || {};
        if (!u.effectiveTo) continue;
        const toDate = new Date(u.effectiveTo);
        // If end date has passed (end of day), ensure status is Inactive
        if (now > new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999)) {
          if (String(u.status || '').toLowerCase() !== 'inactive') {
            batch.update(docSnap.ref, { status: 'Inactive' });
          }
        }
      }
      await batch.commit();
    } catch (e) {
      console.error('autoDeactivateTempTOs failed:', e);
    }
    return null;
  });
} else {
  console.warn('[deploy] Skipping autoDeactivateTempTOs: functions.pubsub.schedule is unavailable in this runtime.');
}

const cors = require('cors')({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://piscarisk.web.app',
    'https://piscarisk.firebaseapp.com',
    'https://www.piscarisk.com',
  ],
});



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
    
    const userData = sanitizeObjectStrings({
      email: data.email,
      username: data.username,
      role: data.role || "Staff",
      status: data.status || "Active", // default; will be overridden for temporary TO
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
      address: data.address || "",
      contactNumber: data.contactNumber || "",
      dateJoined: data.dateJoined || new Date().toISOString().split('T')[0], // Use provided date or fallback to current date
      fullName: data.fullName || "",
      profileImage: data.profileImage || null,
    });
    
    // Add mobile user specific fields for Fish Farmers
    if (data.role === 'Fish Farmer') {
      userData.isMobileUser = true;
      userData.accessLevel = 'mobile';
    }
    
    // Apply Temporary Tech Officer fields when applicable
    if (data.isTemporary === true || data.temporaryTechOfficer === true) {
      userData.isTemporary = true;
      userData.temporaryTechOfficer = true;
      userData.effectiveFrom = data.effectiveFrom || null;
      userData.effectiveTo = data.effectiveTo || null;
      userData.tempTOReason = data.tempTOReason || null;
      userData.tempTORemarks = data.tempTORemarks || null;
      // Enforce canonical role and inactive status
      userData.role = 'temp_tech_officer';
      userData.status = 'Inactive';
      // Deactivation tracking fields (initially null)
      userData.deactivatedBy = null;
      userData.deactivatedAt = null;
      userData.deactivationReason = null;
      
      // Sanitize the temporary tech officer text fields
      userData.tempTOReason = userData.tempTOReason ? sanitizeInput(userData.tempTOReason) : null;
      userData.tempTORemarks = userData.tempTORemarks ? sanitizeInput(userData.tempTORemarks) : null;
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
 * Deletes a Firebase Auth user by email (HTTP endpoint with CORS)
 */
exports.deleteAuthUser = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    // Dynamic CORS: echo back origin for credentialed requests
    const origin = req.headers.origin || '*';
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

  console.log("=== STARTING DELETE AUTH USER FUNCTION ===");
  console.log("Received data:", JSON.stringify(req.body));

  try {
    const { email, authToken, userId } = req.body;
    
    // Validate request data
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Verify authentication token
    if (!authToken) {
      res.status(401).json({ error: 'Authentication token required' });
      return;
    }

    // Verify the token and get user info
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(authToken);
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError);
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }

    // Verify delete privileges (Tech Officer family or Farm Admin only)
    try {
      console.log("Checking delete privileges for UID:", decodedToken.uid);
      const isAdminUser = await isAdmin(decodedToken.uid);
      console.log("Delete privilege check result:", isAdminUser);
      
      if (!isAdminUser) {
        console.error("FAIL: User is not allowed to delete accounts");
        res.status(403).json({ error: 'Delete privileges required' });
        return;
      }
    } catch (err) {
      console.error("Error during delete privilege check:", err);
      res.status(500).json({ error: 'Failed to verify delete privileges' });
      return;
    }

    // Delete Firebase Auth user and related Firestore docs
    let authDeleted = false;
    try {
      console.log("Attempting to delete Firebase Auth user with email:", email);
      
      // Find user by email
      const userRecord = await admin.auth().getUserByEmail(email);
      console.log("Found user with UID:", userRecord.uid);
      
      // Delete the user
      await admin.auth().deleteUser(userRecord.uid);
      authDeleted = true;
      console.log("Firebase Auth user deleted successfully");
      
      // Also delete Firestore documents in both possible collections by uid or email
      const db = admin.firestore();
      const collections = ['users', 'mobileUsers'];
      let deletedDocs = 0;
      for (const coll of collections) {
        try {
          // 1) Try by document id (UID) if provided
          if (userId) {
            const byIdRef = db.collection(coll).doc(userId);
            const byIdSnap = await byIdRef.get();
            if (byIdSnap.exists) {
              await byIdRef.delete();
              deletedDocs += 1;
              console.log(`Deleted doc by id from ${coll}: ${userId}`);
              continue; // skip email query if deleted by id
            }
          }
          // 2) Fallback: query by email
          if (email) {
            const snap = await db.collection(coll).where('email', '==', email).get();
            if (!snap.empty) {
              const batch = db.batch();
              snap.docs.forEach(d => batch.delete(d.ref));
              await batch.commit();
              deletedDocs += snap.size;
              console.log(`Deleted ${snap.size} doc(s) from ${coll} for ${email}`);
            }
          }
        } catch (e) {
          console.warn(`Failed deleting docs from ${coll} for ${email}:`, e);
        }
      }
      
      res.status(200).json({ 
        success: true, 
        message: authDeleted ? "User deleted from Firebase Auth successfully" : "User not found in Auth (may have been deleted already)",
        firestoreDeleted: deletedDocs
      });
      
    } catch (err) {
      console.error("FAIL: Error deleting Firebase Auth user:", err);
      
      // If user not found in Auth, still attempt Firestore cleanup and return success
      if (err.code === 'auth/user-not-found') {
        try {
          const db = admin.firestore();
          const collections = ['users', 'mobileUsers'];
          let deletedDocs = 0;
          for (const coll of collections) {
            // By id if available
            if (userId) {
              const byIdRef = db.collection(coll).doc(userId);
              const byIdSnap = await byIdRef.get();
              if (byIdSnap.exists) { await byIdRef.delete(); deletedDocs += 1; }
            }
            // By email fallback
            if (email) {
              const snap = await db.collection(coll).where('email', '==', email).get();
              if (!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deletedDocs += snap.size;
              }
            }
          }
          return res.status(200).json({
            success: true,
            message: "User not found in Auth (may have been deleted already)",
            firestoreDeleted: deletedDocs
          });
        } catch (cleanupErr) {
          console.warn('Firestore cleanup after user-not-found failed:', cleanupErr);
          return res.status(200).json({ success: true, message: "User not found in Auth (may have been deleted already)", firestoreDeleted: 0 });
        }
      }
      
      res.status(500).json({ error: 'Failed to delete Firebase Auth user' });
    }

  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
 * Log every new report creation into systemLogs so Logs page stays in sync with notifications
 */
if (functions.firestore && typeof functions.firestore.document === 'function') {
  exports.logReportOnCreate = functions.firestore
    .document('reports/{reportId}')
    .onCreate(async (snap, context) => {
      try {
        const data = snap.data() || {};

      // Extract fields with safe fallbacks
      const username = data.submitted_by || data.user || data.user_email || 'Unknown User';
      const userRole = data.user_role || 'Unknown';
      const pond = data.fish_pond || data.pond || 'Unknown Pond';
      const source = (data.source || 'web').toString().toLowerCase();
      const farm = data.farm || null;

      // Normalize timestamp
      let ts;
      try {
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          ts = data.timestamp.toDate();
        } else if (data.timestamp instanceof Date) {
          ts = data.timestamp;
        } else if (typeof data.timestamp === 'string') {
          const d = new Date(data.timestamp);
          ts = isNaN(d.getTime()) ? new Date() : d;
        } else if (data.timestamp && typeof data.timestamp.seconds === 'number') {
          ts = new Date(data.timestamp.seconds * 1000);
        } else {
          ts = new Date();
        }
      } catch (_) {
        ts = new Date();
      }

      const message = source === 'mobile'
        ? `Mobile user ${username} submitted a new report for Fish Pond ${pond}`
        : `User ${username} submitted a new report for Fish Pond ${pond}`;

      // Compose log entry with stable ID
      const log = sanitizeObjectStrings({
        timestamp: ts.toISOString(),
        category: 'report',
        message,
        username,
        userRole,
        source: source === 'mobile' ? 'mobile' : 'web',
        reportId: context.params.reportId,
        farm: farm || null,
      });

        // Use stable ID to prevent duplicate logs
        await admin.firestore().collection('systemLogs').doc(`report_${context.params.reportId}`).set(log, { merge: false });
        return null;
      } catch (err) {
        console.error('Failed to log report creation:', err);
        return null;
      }
    });
} else {
  console.warn('[deploy] Skipping logReportOnCreate: functions.firestore.document is unavailable in this runtime.');
}

/**
 * Cloud Function to log feedback submissions
 * Triggers when a new feedback document is created in PiscaRisk collection
 */
if (functions.firestore && typeof functions.firestore.document === 'function') {
  exports.logFeedbackOnCreate = functions.firestore
    .document('PiscaRisk/{feedbackId}')
    .onCreate(async (snap, context) => {
      try {
        const data = snap.data() || {};

        // Extract fields with safe fallbacks
        const username = data.userName || data.user || data.user_email || 'Unknown User';
        const userRole = data.userRole || data.role || data.user_role || 'Unknown';
        const concern = data.concern || 'feedback';
        const source = (data.source || 'web').toString().toLowerCase();

        // Normalize timestamp
        let ts;
        try {
          if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            ts = data.timestamp.toDate();
          } else if (data.timestamp instanceof Date) {
            ts = data.timestamp;
          } else if (typeof data.timestamp === 'string') {
            const d = new Date(data.timestamp);
            ts = isNaN(d.getTime()) ? new Date() : d;
          } else if (data.timestamp && typeof data.timestamp.seconds === 'number') {
            ts = new Date(data.timestamp.seconds * 1000);
          } else {
            ts = new Date();
          }
        } catch (_) {
          ts = new Date();
        }

        const message = source === 'mobile'
          ? `Mobile user ${username} submitted new ${concern} feedback`
          : `User ${username} submitted new ${concern} feedback`;

        // Compose log entry with stable ID
        const log = sanitizeObjectStrings({
          timestamp: ts.toISOString(),
          category: 'feedback',
          message,
          username,
          userRole,
          source: source === 'mobile' ? 'mobile' : 'web',
          feedbackId: context.params.feedbackId,
          concern: concern || null,
        });

        // Use stable ID to prevent duplicate logs
        await admin.firestore().collection('systemLogs').doc(`feedback_${context.params.feedbackId}`).set(log, { merge: false });
        return null;
      } catch (err) {
        console.error('Failed to log feedback creation:', err);
        return null;
      }
    });
} else {
  console.warn('[deploy] Skipping logFeedbackOnCreate: functions.firestore.document is unavailable in this runtime.');
}

/**
 * Cloud Function to log stock/feed logs from root farmerLogs collection
 * Triggers when a new stock/feed document is created in farmerLogs collection
 */
if (functions.firestore && typeof functions.firestore.document === 'function') {
  exports.logStockFeedOnCreate = functions.firestore
    .document('farmerLogs/{stockFeedId}')
    .onCreate(async (snap, context) => {
      try {
        const data = snap.data() || {};

        // Extract fields with safe fallbacks
        const username = data.submitted_by || data.username || data.user_email || 'Unknown User';
        const userRole = data.user_role || 'Unknown';
        const pond = data.fish_pond || data.pond || 'Unknown Pond';
        const source = (data.source || 'mobile').toString().toLowerCase();
        const farm = data.farm || data.farmId || null;

        // Normalize timestamp
        let ts;
        try {
          if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            ts = data.timestamp.toDate();
          } else if (data.timestamp instanceof Date) {
            ts = data.timestamp;
          } else if (typeof data.timestamp === 'string') {
            const d = new Date(data.timestamp);
            ts = isNaN(d.getTime()) ? new Date() : d;
          } else if (data.timestamp && typeof data.timestamp.seconds === 'number') {
            ts = new Date(data.timestamp.seconds * 1000);
          } else {
            ts = new Date();
          }
        } catch (_) {
          ts = new Date();
        }

        const prefix = source === 'mobile' ? 'Mobile user' : 'User';
        const message = `${prefix} ${username} submitted a stock/feed log for ${pond}`;

        // Compose log entry with stable ID
        const log = sanitizeObjectStrings({
          timestamp: ts.toISOString(),
          category: 'stock',
          message,
          username,
          userRole,
          source: source === 'mobile' ? 'mobile' : 'web',
          stockLogId: context.params.stockFeedId,
          farm: farm || null,
          pond: pond
        });

        // Use stable ID to prevent duplicate logs
        await admin.firestore().collection('systemLogs').doc(`stock_${context.params.stockFeedId}`).set(log, { merge: false });
        return null;
      } catch (err) {
        console.error('Failed to log stock/feed creation:', err);
        return null;
      }
    });
} else {
  console.warn('[deploy] Skipping logStockFeedOnCreate: functions.firestore.document is unavailable in this runtime.');
}

/**
 * Cloud Function to log stock/feed logs from nested farms/{farmId}/farmerLogs collection
 * Triggers when a new stock/feed document is created in nested farmerLogs collection
 */
if (functions.firestore && typeof functions.firestore.document === 'function') {
  exports.logStockFeedNestedOnCreate = functions.firestore
    .document('farms/{farmId}/farmerLogs/{stockFeedId}')
    .onCreate(async (snap, context) => {
      try {
        const data = snap.data() || {};
        const farmId = context.params.farmId;

        // Extract fields with safe fallbacks
        const username = data.submitted_by || data.username || data.user_email || 'Unknown User';
        const userRole = data.user_role || 'Unknown';
        const pond = data.fish_pond || data.pond || 'Unknown Pond';
        const source = (data.source || 'mobile').toString().toLowerCase();
        const farm = farmId || data.farm || data.farmId || null;

        // Normalize timestamp
        let ts;
        try {
          if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            ts = data.timestamp.toDate();
          } else if (data.timestamp instanceof Date) {
            ts = data.timestamp;
          } else if (typeof data.timestamp === 'string') {
            const d = new Date(data.timestamp);
            ts = isNaN(d.getTime()) ? new Date() : d;
          } else if (data.timestamp && typeof data.timestamp.seconds === 'number') {
            ts = new Date(data.timestamp.seconds * 1000);
          } else {
            ts = new Date();
          }
        } catch (_) {
          ts = new Date();
        }

        const prefix = source === 'mobile' ? 'Mobile user' : 'User';
        const message = `${prefix} ${username} submitted a stock/feed log for ${pond}`;

        // Compose log entry with stable ID
        const log = sanitizeObjectStrings({
          timestamp: ts.toISOString(),
          category: 'stock',
          message,
          username,
          userRole,
          source: source === 'mobile' ? 'mobile' : 'web',
          stockLogId: context.params.stockFeedId,
          farm: farm || null,
          pond: pond
        });

        // Use stable ID to prevent duplicate logs (include farmId to differentiate nested logs)
        await admin.firestore().collection('systemLogs').doc(`stock_${farmId}_${context.params.stockFeedId}`).set(log, { merge: false });
        return null;
      } catch (err) {
        console.error('Failed to log nested stock/feed creation:', err);
        return null;
      }
    });
} else {
  console.warn('[deploy] Skipping logStockFeedNestedOnCreate: functions.firestore.document is unavailable in this runtime.');
}

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
      // Check users collection first
      let userDoc = await admin.firestore().collection("users").doc(uid).get();
      console.log("User doc fetched from users:", userDoc.exists);
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const roleRaw = String(userData.role || '').toLowerCase();
        const role = roleRaw.replace(/\s+/g, '_'); // normalize "Tech Officer" -> "tech_officer"
        const isTemporaryTechOfficer = userData.temporaryTechOfficer === true;
        const hasFarm = !!(userData.farm && String(userData.farm).trim() !== '');

        // Tech Officer family (global delete rights)
        const isTechOfficerFamily =
          role === "tech_officer" ||
          role === "new_main_tech_officer" ||
          role === "temp_tech_officer" ||
          isTemporaryTechOfficer;

        // Farm Admin: Admin role with an assigned farm
        const isFarmAdmin =
          role === "admin" && hasFarm;

        const hasDeletePrivileges = isTechOfficerFamily || isFarmAdmin;
        
        console.log("User role:", role, "hasFarm:", hasFarm, "isTechOfficerFamily:", isTechOfficerFamily, "isFarmAdmin:", isFarmAdmin, "hasDeletePrivileges:", hasDeletePrivileges);
        return hasDeletePrivileges;
      }
      
      // If not found in users, check mobileUsers collection
      userDoc = await admin.firestore().collection("mobileUsers").doc(uid).get();
      console.log("User doc fetched from mobileUsers:", userDoc.exists);
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const roleRaw = String(userData.role || '').toLowerCase();
        const role = roleRaw.replace(/\s+/g, '_');
        const isTemporaryTechOfficer = userData.temporaryTechOfficer === true;
        const hasFarm = !!(userData.farm && String(userData.farm).trim() !== '');

        const isTechOfficerFamily =
          role === "tech_officer" ||
          role === "new_main_tech_officer" ||
          role === "temp_tech_officer" ||
          isTemporaryTechOfficer;

        const isFarmAdmin =
          role === "admin" && hasFarm;

        const hasDeletePrivileges = isTechOfficerFamily || isFarmAdmin;
        
        console.log("Mobile user role:", role, "hasFarm:", hasFarm, "isTechOfficerFamily:", isTechOfficerFamily, "isFarmAdmin:", isFarmAdmin, "hasDeletePrivileges:", hasDeletePrivileges);
        return hasDeletePrivileges;
      }
      
      return false;
    } catch (err) {
      console.error("Error checking admin role:", err);
      return false;
    }
  }
  
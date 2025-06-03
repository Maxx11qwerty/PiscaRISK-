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
  return cors(req, res, async () => {
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
  try {
    console.log("Attempting to create user with email:", data.email);
    const userRecord = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.username,
    });
    console.log("User created successfully, UID:", userRecord.uid);
  } catch (err) {
    console.error("FAIL: Error creating auth user:", err);
    throw new functions.https.HttpsError("internal", "Failed to create auth user");
  }
  const requiredFields = ['email', 'password', 'username', 'role'];
  for (const field of requiredFields) {
    if (!data[field]) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Missing required field: ${field}`
      );
    }
  }

  // Create Firestore document
  try {
    console.log("Attempting to create Firestore document");
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      email: data.email,
      username: data.username,
      role: data.role || "Staff",
      status: "Active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
      address: data.address || "",
      contactNumber: data.contactNumber || "",
      dateJoined: admin.firestore.FieldValue.serverTimestamp(),
      fullName: data.fullName || "",
      profileImage: data.profileImage || null,
    });
    console.log("Firestore document created successfully");
  } catch (err) {
    console.error("FAIL: Error creating Firestore document:", err);
    throw new functions.https.HttpsError("internal", "Failed to create user document");
  }

  console.log("=== FUNCTION COMPLETED SUCCESSFULLY ===");
  return { success: true };
  });
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
  
import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc, getDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { sanitizeObjectStrings } from '../utils/sanitize';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { logActivity, logMessages } from '../utils/logger';

// Generate unique ID for users
export const generateUniqueId = (role, username) => {
  const prefix = role === 'Fish Farmer' ? 'FF' : 
                role === 'Tech Officer' ? 'TO' : 
                role === 'Admin' ? 'AD' : 'US';
  return `${prefix}_${username}`;
};

// Fetch all users (both web and mobile)
export const fetchAllUsers = async () => {
  try {
    // Fetch web users (exclude Fish Farmers - they should only come from mobileUsers)
    const usersCollection = collection(db, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    const webUsers = usersSnapshot.docs
      .map(d => ({
        id: d.id,
        _collection: 'users',
        ...d.data()
      }))
      .filter(user => {
        const role = String(user.role || '').toLowerCase();
        const isFishFarmer = role === 'fish_farmer' || role === 'fish farmer';
        return !isFishFarmer; // Only include non-Fish Farmers from users collection
      });

    // Fetch mobile users (include all users from mobileUsers)
    const mobileUsersCollection = collection(db, 'mobileUsers');
    const mobileUsersSnapshot = await getDocs(mobileUsersCollection);
    const mobileUsers = mobileUsersSnapshot.docs.map(d => ({
      id: d.id,
      _collection: 'mobileUsers',
      ...d.data()
    }));

    // Normalize roles/status and combine both user lists and ensure no duplicates
    const normalize = (u) => ({
      ...u,
      role: typeof u.role === 'string' ? u.role.toLowerCase().replace(/\s+/g, '_') : '',
      status: typeof u.status === 'string' ? u.status.toLowerCase() : (u.status === undefined ? '' : String(u.status).toLowerCase())
    });
    const allUsers = [...webUsers.map(normalize), ...mobileUsers.map(normalize)];
    
    // Since we've already filtered out Fish Farmers from users collection,
    // there should be no duplicates between collections now
    const userMap = new Map();
    allUsers.forEach(user => {
      if (!user.email) return;
      
      const existing = userMap.get(user.email);
      if (!existing) {
        userMap.set(user.email, user);
      } else {
        // This should rarely happen now since Fish Farmers are excluded from users collection
        // Prefer mobileUsers if there's still a duplicate
        if (user._collection === 'mobileUsers') {
          userMap.set(user.email, user);
        }
      }
    });
    
    const uniqueUsers = Array.from(userMap.values());
    
    // Sort users by date joined (newest first)
    return uniqueUsers.sort((a, b) => {
      // Handle missing or invalid dateJoined fields
      const dateA = a.dateJoined ? new Date(a.dateJoined) : new Date(0);
      const dateB = b.dateJoined ? new Date(b.dateJoined) : new Date(0);
      
      // Check if dates are valid
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {

        return 0; // Don't sort if dates are invalid
      }
      
      return dateB - dateA; // Newest first
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('Error fetching users:', error);
    }
    throw error;
  }
};

// Add new user
export const addNewUser = async (userData, currentUser) => {
  try {
    const uniqueId = generateUniqueId(userData.role, userData.username);
    const newUserData = sanitizeObjectStrings({
      ...userData,
      id: uniqueId,
      dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0], // Use provided date or fallback to current date
      lastModified: new Date().toISOString()
    });

    if (userData.role === 'Fish Farmer') {
      newUserData.isMobileUser = true;
      newUserData.accessLevel = 'mobile';
      await setDoc(doc(db, 'mobileUsers', uniqueId), newUserData);
    } else {
      await setDoc(doc(db, 'users', uniqueId), newUserData);
    }

    logActivity('account', logMessages.account.userCreated(currentUser.username, userData.username), currentUser.username, null, currentUser.role);
    return newUserData;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('Error adding user:', error);
    }
    throw error;
  }
};

// Update user status
export const updateUserStatus = async (userId, status, role, collectionHint, userEmail, userName, actorName, actorRole, actorFarm) => {
  try {
    // removed verbose dev log
    const roleNormalized = String(role || '').toLowerCase();
    let collectionName = collectionHint || ((roleNormalized === 'fish farmer' || roleNormalized === 'fish_farmer') ? 'mobileUsers' : 'users');
    // removed verbose dev log
    const statusLower = String(status || '').toLowerCase();
    
    // Helper function to find user by email
    const findUserByEmail = async (email) => {
      if (!email) return null;
      
      // Try users collection first
      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, where('email', '==', email));
      const usersSnapshot = await getDocs(usersQuery);
      
      if (!usersSnapshot.empty) {
        const doc = usersSnapshot.docs[0];
        return { id: doc.id, collection: 'users', data: doc.data() };
      }
      
      // Try mobileUsers collection
      const mobileUsersRef = collection(db, 'mobileUsers');
      const mobileUsersQuery = query(mobileUsersRef, where('email', '==', email));
      const mobileUsersSnapshot = await getDocs(mobileUsersQuery);
      
      if (!mobileUsersSnapshot.empty) {
        const doc = mobileUsersSnapshot.docs[0];
        return { id: doc.id, collection: 'mobileUsers', data: doc.data() };
      }
      
      return null;
    };

    const tryUpdate = async (coll) => {
      const ref = doc(db, coll, userId);
      // removed verbose dev log
      const snap = await getDoc(ref);
      // removed verbose dev log
      if (!snap.exists()) return false;
      try {
        const updateFields = {
          status: status || 'Active',
          adminActivated: true,
          pendingActivation: false,
          lastModified: serverTimestamp()
        };
        // If deactivating, also reset phoneVerified to false and add deactivation tracking
        if (statusLower === 'inactive' || statusLower === 'deactivated') {
          updateFields.phoneVerified = false;
          // Set status to 'Deactivated' when deactivating
          if (statusLower === 'inactive') {
            updateFields.status = 'Deactivated';
          }
          // Build deactivatedBy label using actor and target farm context
          const targetFarm = (snap.data() && (snap.data().farm || snap.data().farmId)) || null;
          const actorRoleLower = String(actorRole || '').toLowerCase();
          const isFarmAdminActor = actorRoleLower === 'admin' && actorFarm;
          const farmsMatch = isFarmAdminActor && targetFarm && String(actorFarm).trim().toLowerCase() === String(targetFarm).trim().toLowerCase();
          const roleLabel = farmsMatch ? 'Admin' : (
            actorRoleLower === 'tech_officer' || actorRoleLower === 'tech officer' ? 'Tech Officer' :
            actorRoleLower === 'new_main_tech_officer' || actorRoleLower === 'new main tech officer' ? 'Tech Officer' :
            actorRoleLower === 'temp_tech_officer' || actorRoleLower === 'temporary tech officer' ? 'Temporary Tech Officer' :
            actorRoleLower === 'admin' ? 'Admin' : 'User'
          );
          const actorLabel = String(actorName || userName || userEmail || 'Unknown').trim();
          updateFields.deactivatedBy = `${roleLabel} (${actorLabel})`;
          updateFields.deactivatedAt = new Date().toISOString();
          updateFields.deactivationReason = 'Status changed via toggle';
        }
        await updateDoc(ref, sanitizeObjectStrings(updateFields));
        // removed verbose dev log
        return true;
      } catch (updateError) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error(`[tryUpdate] Failed to update ${coll}:`, updateError);
        }
        throw updateError;
      }
    };

    // Also update counterpart document in the other collection if it exists (by id or email)
    const updateCounterpartIfExists = async (primaryCollection, fields, email) => {
      const counterpart = primaryCollection === 'users' ? 'mobileUsers' : 'users';

      // Try counterpart by same id
      try {
        const refById = doc(db, counterpart, userId);
        const snapById = await getDoc(refById);
        if (snapById.exists()) {
          await updateDoc(refById, sanitizeObjectStrings(fields));
        } else if (email) {
          // Try by email if provided
          const q = query(collection(db, counterpart), where('email', '==', email));
          const qs = await getDocs(q);
          for (const d of qs.docs) {
            await updateDoc(doc(db, counterpart, d.id), sanitizeObjectStrings(fields));
          }
        }
      } catch (_) {
        // Best-effort; ignore errors updating counterpart so primary update isn't blocked
      }
    };

    let updated = false;
    try {
      updated = await tryUpdate(collectionName);
      if (updated) {
        const actorRoleLowerForMirror = String(actorRole || '').toLowerCase();
        const roleLabelForMirror = (
          actorRoleLowerForMirror === 'tech_officer' || actorRoleLowerForMirror === 'tech officer' ? 'Tech Officer' :
          actorRoleLowerForMirror === 'new_main_tech_officer' || actorRoleLowerForMirror === 'new main tech officer' ? 'Tech Officer' :
          actorRoleLowerForMirror === 'temp_tech_officer' || actorRoleLowerForMirror === 'temporary tech officer' ? 'Temporary Tech Officer' :
          actorRoleLowerForMirror === 'admin' ? 'Admin' : 'User'
        );
        const actorLabelForMirror = String(actorName || userName || userEmail || 'Unknown').trim();
        const mirrorFields = {
          status: status || 'Active',
          adminActivated: true,
          pendingActivation: false,
          lastModified: serverTimestamp(),
          ...(statusLower === 'inactive' ? {
            phoneVerified: false,
            deactivatedBy: `${roleLabelForMirror} (${actorLabelForMirror})`,
            deactivatedAt: new Date().toISOString(),
            deactivationReason: 'Status changed via toggle'
          } : {})
        };
        await updateCounterpartIfExists(collectionName, mirrorFields, userEmail);
      }
    } catch (error) {
      // keep errors minimal
    }
    if (!updated) {
      collectionName = collectionName === 'users' ? 'mobileUsers' : 'users';
      try {
        updated = await tryUpdate(collectionName);
        if (updated) {
          const actorRoleLowerForMirror2 = String(actorRole || '').toLowerCase();
          const roleLabelForMirror2 = (
            actorRoleLowerForMirror2 === 'tech_officer' || actorRoleLowerForMirror2 === 'tech officer' ? 'Tech Officer' :
            actorRoleLowerForMirror2 === 'new_main_tech_officer' || actorRoleLowerForMirror2 === 'new main tech officer' ? 'Tech Officer' :
            actorRoleLowerForMirror2 === 'temp_tech_officer' || actorRoleLowerForMirror2 === 'temporary tech officer' ? 'Temporary Tech Officer' :
            actorRoleLowerForMirror2 === 'admin' ? 'Admin' : 'User'
          );
          const actorLabelForMirror2 = String(actorName || userName || userEmail || 'Unknown').trim();
          const mirrorFields = {
            status: status || 'Active',
            adminActivated: true,
            pendingActivation: false,
            lastModified: serverTimestamp(),
            ...(statusLower === 'inactive' ? {
              phoneVerified: false,
              deactivatedBy: `${roleLabelForMirror2} (${actorLabelForMirror2})`,
              deactivatedAt: new Date().toISOString(),
              deactivationReason: 'Status changed via toggle'
            } : {})
          };
          await updateCounterpartIfExists(collectionName, mirrorFields, userEmail);
        }
      } catch (error) {
        // keep errors minimal
      }
    }
    
    // If still not updated, try to find by email
    if (!updated && userEmail) {
      // removed verbose dev log
      const userByEmail = await findUserByEmail(userEmail);
      
      if (userByEmail) {
        // removed verbose dev log
        // Update the correct document
        const ref = doc(db, userByEmail.collection, userByEmail.id);
        try {
          const updateFields = {
            status: status || 'Active',
            adminActivated: true,
            pendingActivation: false,
            lastModified: serverTimestamp()
          };
          if (statusLower === 'inactive') {
            updateFields.phoneVerified = false;
          }
          await updateDoc(ref, sanitizeObjectStrings(updateFields));
          // mirror update as well
          await updateCounterpartIfExists(userByEmail.collection, updateFields, userEmail);
        } catch (updateError) {
          // keep errors minimal
          throw updateError;
        }
        // removed verbose dev log
        return { success: true, collection: userByEmail.collection };
      }
    }
    
    if (!updated) {
      throw new Error(`User document not found in users or mobileUsers. UserId: ${userId}, Role: ${role}, CollectionHint: ${collectionHint}. Email lookup also failed.`);
    }
    
    return { success: true, collection: collectionName };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('Error updating user status:', error);
    }
    return { success: false, error: error.message };
  }
};

// Add this to accountService.js
export const debugUserActivation = async (userId, email, collectionHint, username) => {
  
  // Prioritize mobileUsers for Fish Farmers
  const collections = collectionHint === 'mobileUsers' ? ['mobileUsers', 'users'] : ['users', 'mobileUsers'];
  
  for (const collectionName of collections) {
    try {
      
      // Check by ID first
      const refById = doc(db, collectionName, userId);
      const snapById = await getDoc(refById);
      
      if (snapById.exists()) {
        return { found: true, collection: collectionName, id: userId, method: 'id' };
      } else {
        // not found by ID
      }
      
      // Check by email (use provided email or extract from userId)
      let searchEmail = email;
      if (!searchEmail && userId.includes('@') && userId.includes('_')) {
        const parts = userId.split('_');
        if (parts.length > 1) {
          searchEmail = parts.slice(1).join('_');
        }
      }
      
      if (searchEmail) {
        const qEmail = query(collection(db, collectionName), where('email', '==', searchEmail));
        const snapEmail = await getDocs(qEmail);
        
        if (!snapEmail.empty) {
          const docId = snapEmail.docs[0].id;
          return { found: true, collection: collectionName, id: docId, method: 'email' };
        }
      }
      
      // Check by username
      if (username) {
        const qUsername = query(collection(db, collectionName), where('username', '==', username));
        const snapUsername = await getDocs(qUsername);
        
        if (!snapUsername.empty) {
          const docId = snapUsername.docs[0].id;
          return { found: true, collection: collectionName, id: docId, method: 'username' };
        }
      }
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error(`Error checking ${collectionName}:`, error);
      }
    }
  }
  
  return { found: false };
};

// Add this to accountService.js
export const directUpdateUserStatus = async (userId, email, username, collectionHint = 'mobileUsers') => {
  try {
    
    
    // First find the exact document location
    const debugResult = await debugUserActivation(userId, email, collectionHint, username);
    
    if (!debugResult.found) {
      throw new Error('User not found in any collection');
    }
    
    const { collection: targetCollection, id: targetId } = debugResult;
    
    
    
    // Try to update the document
    const ref = doc(db, targetCollection, targetId);
    
    try {
      const updateFields = {
        status: 'Active',
        adminActivated: true,
        pendingActivation: false,
        lastModified: serverTimestamp()
      };
      await updateDoc(ref, sanitizeObjectStrings(updateFields));

      // Best-effort mirror update in the counterpart collection
      try {
        const counterpart = targetCollection === 'users' ? 'mobileUsers' : 'users';
        const refById = doc(db, counterpart, targetId);
        const snapById = await getDoc(refById);
        if (snapById.exists()) {
          await updateDoc(refById, sanitizeObjectStrings(updateFields));
        } else if (email) {
          const q = query(collection(db, counterpart), where('email', '==', email));
          const qs = await getDocs(q);
          for (const d of qs.docs) {
            await updateDoc(doc(db, counterpart, d.id), sanitizeObjectStrings(updateFields));
          }
        }
      } catch (_) {
        // ignore counterpart failures
      }
      
      
      
      // Verify the update
      const updatedDoc = await getDoc(ref);
      if (updatedDoc.exists()) {
        return { success: true, collection: targetCollection };
      } else {
        throw new Error('Document disappeared after update');
      }
      
    } catch (updateError) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('❌ Direct update failed:', updateError);
      }
      
      // Check if it's a permissions error
      if (updateError.code === 'permission-denied') {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('🔥 FIRESTORE RULES BLOCKING UPDATE!');
        }
        throw new Error('Firestore rules prevent updates. Check security rules.');
      }
      
      throw updateError;
    }
    
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('Error in directUpdateUserStatus:', error);
    }
    return { success: false, error: error.message };
  }
};

// Replace your activateFishFarmer function with this:
export const activateFishFarmer = async (userId, email, collectionHint, username) => {
  
  // Use the direct update method instead
  return directUpdateUserStatus(userId, email, username, collectionHint);
};

// Delete user
export const deleteUser = async (userId, role, username, currentUser) => {
  try {
    const collectionName = role === 'Fish Farmer' ? 'mobileUsers' : 'users';
    await deleteDoc(doc(db, collectionName, userId));
    logActivity('account', `User ${username} deleted`, currentUser.username);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('Error deleting user:', error);
    }
    throw error;
  }
}; 

// Fetch live status (users -> mobileUsers)
export const fetchLiveUserStatus = async (userId) => {
  try {
    // First try by direct ID
    let ref = doc(db, 'users', userId);
    let snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return { status: String(data.status || '').toLowerCase(), collection: 'users' };
    }
    
    ref = doc(db, 'mobileUsers', userId);
    snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return { status: String(data.status || '').toLowerCase(), collection: 'mobileUsers' };
    }
    
    // If not found by ID, try to find by searching all documents
    // Extract email from userId if it contains the email (e.g., "FF_farm77test@gmail.com" -> "farm77test@gmail.com")
    let searchEmail = userId;
    if (userId.includes('@') && userId.includes('_')) {
      // If userId is like "FF_farm77test@gmail.com", extract the email part
      const parts = userId.split('_');
      if (parts.length > 1) {
        searchEmail = parts.slice(1).join('_'); // Get everything after the first underscore
      }
    }
    
    // Search in mobileUsers collection first (for Fish Farmers)
    const mobileQuery = query(collection(db, 'mobileUsers'), where('email', '==', searchEmail));
    const mobileSnapshot = await getDocs(mobileQuery);
    if (!mobileSnapshot.empty) {
      const data = mobileSnapshot.docs[0].data();
      return { status: String(data.status || '').toLowerCase(), collection: 'mobileUsers' };
    }
    
    // Search in users collection
    const usersQuery = query(collection(db, 'users'), where('email', '==', searchEmail));
    const usersSnapshot = await getDocs(usersQuery);
    if (!usersSnapshot.empty) {
      const data = usersSnapshot.docs[0].data();
      return { status: String(data.status || '').toLowerCase(), collection: 'users' };
    }
    
    return null;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('Failed to fetch live user status:', e);
    }
    return null;
  }
};

// Activate Tech Officer: set adminActivated=true on the located doc
export const activateTechOfficer = async (userId) => {
  try {
    let ref = doc(db, 'users', userId);
    let snap = await getDoc(ref);
    let collectionName = 'users';
    if (!snap.exists()) {
      ref = doc(db, 'mobileUsers', userId);
      snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('User not found in any collection');
      collectionName = 'mobileUsers';
    }
    // Ensure TTO flags are restored when role is temp_tech_officer
    const data = snap.data() || {};
    const roleLower = String(data.role || '').toLowerCase();
    const isTTO = roleLower === 'temp_tech_officer' || data.temporaryTechOfficer === true || data.isTemporary === true;
    const updateFields = sanitizeObjectStrings({
      adminActivated: true,
      ...(isTTO ? { temporaryTechOfficer: true, isTemporary: true } : {}),
      lastModified: new Date().toISOString()
    });
    await updateDoc(ref, updateFields);

    // Mirror adminActivated in counterpart collection if present (best-effort)
    try {
      const counterpart = collectionName === 'users' ? 'mobileUsers' : 'users';
      const refById = doc(db, counterpart, userId);
      const snapById = await getDoc(refById);
      if (snapById.exists()) {
        await updateDoc(refById, updateFields);
      }
    } catch (_) {}
    return { success: true, collection: collectionName };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
    }
    return { success: false, error: error.message };
  }
};


// Delete user: resolve collection, delete doc, then try deleting from Auth via Cloud Function
export const deleteUserById = async (userId) => {
  try {
    // Resolve the user email first (from either collection)
    let ref = doc(db, 'users', userId);
    let snap = await getDoc(ref);
    if (!snap.exists()) {
      ref = doc(db, 'mobileUsers', userId);
      snap = await getDoc(ref);
      if (!snap.exists()) {
        return { success: false, error: 'User not found in any collection' };
      }
    }
    const data = snap.data();

    // Call Cloud Function once to delete from Auth and Firestore
    try {
      if (data?.email) {
        // Get current user's auth token
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          const authToken = await currentUser.getIdToken();
          
          // Call the HTTP endpoint with proper CORS
          const response = await fetch('https://us-central1-piscarisk.cloudfunctions.net/deleteAuthUser', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: data.email,
              userId: userId,
              authToken: authToken
            })
          });
          
          if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
              const errBody = await response.json();
              if (errBody && errBody.error) errorMessage = errBody.error;
            } catch (_) { /* ignore parse error */ }
            throw new Error(errorMessage);
          }
          
          const result = await response.json();

          // Ensure local Firestore cleanup so UI reflects immediately
          try {
            if (userId) {
              const refUsers = doc(db, 'users', userId);
              const snapUsers = await getDoc(refUsers);
              if (snapUsers.exists()) {
                await deleteDoc(refUsers);
              }
              const refMobile = doc(db, 'mobileUsers', userId);
              const snapMobile = await getDoc(refMobile);
              if (snapMobile.exists()) {
                await deleteDoc(refMobile);
              }
            }
            if (data?.email) {
              // Fallback: query by email and delete any leftover docs
              const qUsers = query(collection(db, 'users'), where('email', '==', data.email));
              const qsUsers = await getDocs(qUsers);
              if (!qsUsers.empty) {
                for (const d of qsUsers.docs) { await deleteDoc(doc(db, 'users', d.id)); }
              }
              const qMobile = query(collection(db, 'mobileUsers'), where('email', '==', data.email));
              const qsMobile = await getDocs(qMobile);
              if (!qsMobile.empty) {
                for (const d of qsMobile.docs) { await deleteDoc(doc(db, 'mobileUsers', d.id)); }
              }
            }
          } catch (cleanupErr) {
          }
        } else {
        }
      }
    } catch (authErr) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
      }
    }
    return { success: true };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
    }
    return { success: false, error: error.message || 'Failed to delete user from database' };
  }
};

// Cloud Functions helpers
export const checkUserLoginStatus = async (userEmail) => {
  try {
    const functions = getFunctions();
    const checkFn = httpsCallable(functions, 'checkUserLoginStatus');
    const result = await checkFn({ userEmail });
    return result.data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
    }
    return { isLoggedIn: false, error: error.message };
  }
};
// Reset password via Cloud Function, return {success, message}
export const resetUserPassword = async (userEmail, newPassword) => {
  try {
    const functions = getFunctions();
    const adminResetPassword = httpsCallable(functions, 'adminResetPassword');
    const result = await adminResetPassword({ userEmail, newPassword });
    return result.data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
    }
    return { success: false, error: error.message };
  }
};
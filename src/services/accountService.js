import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc, getDoc, query, where, serverTimestamp } from 'firebase/firestore';
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
    console.error('Error fetching users:', error);
    throw error;
  }
};

// Add new user
export const addNewUser = async (userData, currentUser) => {
  try {
    const uniqueId = generateUniqueId(userData.role, userData.username);
    const newUserData = {
      ...userData,
      id: uniqueId,
      dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0], // Use provided date or fallback to current date
      lastModified: new Date().toISOString()
    };

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
    console.error('Error adding user:', error);
    throw error;
  }
};

// Update user status
export const updateUserStatus = async (userId, status, role, collectionHint, userEmail, userName) => {
  try {
    console.log('[updateUserStatus] Called with:', { userId, status, role, collectionHint, userEmail, userName });
    const roleNormalized = String(role || '').toLowerCase();
    let collectionName = collectionHint || ((roleNormalized === 'fish farmer' || roleNormalized === 'fish_farmer') ? 'mobileUsers' : 'users');
    console.log('[updateUserStatus] Using collection:', collectionName);
    
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
      console.log(`[tryUpdate] Trying collection: ${coll}, userId: ${userId}, ref:`, ref);
      const snap = await getDoc(ref);
      console.log(`[tryUpdate] Document exists in ${coll}:`, snap.exists());
      if (!snap.exists()) return false;
      try {
        await updateDoc(ref, {
          status: status || 'Active',
          adminActivated: true,
          pendingActivation: false,
          lastModified: serverTimestamp()
        });
        console.log(`[tryUpdate] Successfully updated ${coll} collection`);
        return true;
      } catch (updateError) {
        console.error(`[tryUpdate] Failed to update ${coll}:`, updateError);
        throw updateError;
      }
    };

    let updated = false;
    try {
      updated = await tryUpdate(collectionName);
    } catch (error) {
      console.error('[updateUserStatus] First tryUpdate failed:', error);
    }
    if (!updated) {
      collectionName = collectionName === 'users' ? 'mobileUsers' : 'users';
      try {
        updated = await tryUpdate(collectionName);
      } catch (error) {
        console.error('[updateUserStatus] Second tryUpdate failed:', error);
      }
    }
    
    // If still not updated, try to find by email
    if (!updated && userEmail) {
      console.log('[updateUserStatus] Direct ID lookup failed, trying email lookup...');
      const userByEmail = await findUserByEmail(userEmail);
      
      if (userByEmail) {
        console.log('[updateUserStatus] Found user by email:', userByEmail);
        // Update the correct document
        const ref = doc(db, userByEmail.collection, userByEmail.id);
        try {
          await updateDoc(ref, {
            status: status || 'Active',
            adminActivated: true,
            pendingActivation: false,
            lastModified: serverTimestamp()
          });
        } catch (updateError) {
          console.error('[updateUserStatus] Failed to update via email lookup:', updateError);
          throw updateError;
        }
        console.log('[updateUserStatus] Successfully updated via email lookup');
        return { success: true, collection: userByEmail.collection };
      }
    }
    
    if (!updated) {
      throw new Error(`User document not found in users or mobileUsers. UserId: ${userId}, Role: ${role}, CollectionHint: ${collectionHint}. Email lookup also failed.`);
    }
    
    return { success: true, collection: collectionName };
  } catch (error) {
    console.error('Error updating user status:', error);
    return { success: false, error: error.message };
  }
};

// Add this to accountService.js
export const debugUserActivation = async (userId, email, collectionHint, username) => {
  console.log('🔍 DEBUG ACTIVATION for:', { userId, email, username });
  
  // Prioritize mobileUsers for Fish Farmers
  const collections = collectionHint === 'mobileUsers' ? ['mobileUsers', 'users'] : ['users', 'mobileUsers'];
  
  for (const collectionName of collections) {
    try {
      console.log(`\nChecking ${collectionName} collection...`);
      
      // Check by ID first
      const refById = doc(db, collectionName, userId);
      const snapById = await getDoc(refById);
      
      if (snapById.exists()) {
        console.log(`✅ Found by ID in ${collectionName}:`, snapById.data());
        console.log(`Document path: ${collectionName}/${userId}`);
        return { found: true, collection: collectionName, id: userId, method: 'id' };
      } else {
        console.log(`❌ Not found by ID in ${collectionName}`);
      }
      
      // Check by email (use provided email or extract from userId)
      let searchEmail = email;
      if (!searchEmail && userId.includes('@') && userId.includes('_')) {
        const parts = userId.split('_');
        if (parts.length > 1) {
          searchEmail = parts.slice(1).join('_');
          console.log(`🔍 Extracted email from userId: ${searchEmail}`);
        }
      }
      
      if (searchEmail) {
        const qEmail = query(collection(db, collectionName), where('email', '==', searchEmail));
        const snapEmail = await getDocs(qEmail);
        
        if (!snapEmail.empty) {
          const docData = snapEmail.docs[0].data();
          const docId = snapEmail.docs[0].id;
          console.log(`✅ Found by email in ${collectionName}:`, docData);
          console.log(`Document path: ${collectionName}/${docId}`);
          return { found: true, collection: collectionName, id: docId, method: 'email' };
        }
      }
      
      // Check by username
      if (username) {
        const qUsername = query(collection(db, collectionName), where('username', '==', username));
        const snapUsername = await getDocs(qUsername);
        
        if (!snapUsername.empty) {
          const docData = snapUsername.docs[0].data();
          const docId = snapUsername.docs[0].id;
          console.log(`✅ Found by username in ${collectionName}:`, docData);
          console.log(`Document path: ${collectionName}/${docId}`);
          return { found: true, collection: collectionName, id: docId, method: 'username' };
        }
      }
      
    } catch (error) {
      console.error(`Error checking ${collectionName}:`, error);
    }
  }
  
  console.log('❌ User not found in any collection');
  return { found: false };
};

// Add this to accountService.js
export const directUpdateUserStatus = async (userId, email, username, collectionHint = 'mobileUsers') => {
  try {
    console.log('🎯 DIRECT UPDATE called for:', { userId, email, username, collectionHint });
    
    // First find the exact document location
    const debugResult = await debugUserActivation(userId, email, collectionHint, username);
    
    if (!debugResult.found) {
      throw new Error('User not found in any collection');
    }
    
    const { collection: targetCollection, id: targetId } = debugResult;
    
    console.log(`📝 Updating ${targetCollection}/${targetId}`);
    
    // Try to update the document
    const ref = doc(db, targetCollection, targetId);
    
    try {
      await updateDoc(ref, {
        status: 'Active',
        adminActivated: true,
        pendingActivation: false,
        lastModified: serverTimestamp()
      });
      
      console.log('✅ Direct update successful');
      
      // Verify the update
      const updatedDoc = await getDoc(ref);
      if (updatedDoc.exists()) {
        console.log('✅ Verification - Updated data:', updatedDoc.data());
        return { success: true, collection: targetCollection };
      } else {
        throw new Error('Document disappeared after update');
      }
      
    } catch (updateError) {
      console.error('❌ Direct update failed:', updateError);
      
      // Check if it's a permissions error
      if (updateError.code === 'permission-denied') {
        console.error('🔥 FIRESTORE RULES BLOCKING UPDATE!');
        throw new Error('Firestore rules prevent updates. Check security rules.');
      }
      
      throw updateError;
    }
    
  } catch (error) {
    console.error('Error in directUpdateUserStatus:', error);
    return { success: false, error: error.message };
  }
};

// Replace your activateFishFarmer function with this:
export const activateFishFarmer = async (userId, email, collectionHint, username) => {
  console.log('🐟 activateFishFarmer called with:', { userId, email, collectionHint, username });
  
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
    console.error('Error deleting user:', error);
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
    console.warn('Failed to fetch live user status:', e);
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
    await updateDoc(ref, {
      adminActivated: true,
      lastModified: new Date().toISOString()
    });
    return { success: true, collection: collectionName };
  } catch (error) {
    console.error('Error activating Tech Officer:', error);
    return { success: false, error: error.message };
  }
};


// Delete user: resolve collection, delete doc, then try deleting from Auth via Cloud Function
export const deleteUserById = async (userId) => {
  try {
    let ref = doc(db, 'users', userId);
    let snap = await getDoc(ref);
    let collectionName = 'users';
    if (!snap.exists()) {
      ref = doc(db, 'mobileUsers', userId);
      snap = await getDoc(ref);
      if (!snap.exists()) {
        return { success: false, error: 'User not found in any collection' };
      }
      collectionName = 'mobileUsers';
    }
    const data = snap.data();
    await deleteDoc(ref);
    
    // Call Cloud Function to delete from Firebase Auth
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
              authToken: authToken
            })
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const result = await response.json();
          console.log('Firebase Auth deletion result:', result);
        } else {
          console.warn('No authenticated user found, skipping Firebase Auth deletion');
        }
      }
    } catch (authErr) {
      console.warn('Could not delete from Firebase Auth:', authErr?.message || authErr);
    }
    return { success: true, collection: collectionName };
  } catch (error) {
    console.error('Firebase delete error:', error);
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
    console.warn('Could not check user login status:', error);
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
    console.warn('adminResetPassword function failed:', error);
    return { success: false, error: error.message };
  }
};
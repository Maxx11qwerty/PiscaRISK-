import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc, getDoc, query, where } from 'firebase/firestore';
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
    // Fetch web users
    const usersCollection = collection(db, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    const webUsers = usersSnapshot.docs.map(d => ({
      id: d.id,
      _collection: 'users',
      ...d.data()
    }));

    // Fetch mobile users
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
      role: typeof u.role === 'string' ? u.role : '',
      status: typeof u.status === 'string' ? u.status.toLowerCase() : (u.status === undefined ? '' : String(u.status).toLowerCase())
    });
    const allUsers = [...webUsers.map(normalize), ...mobileUsers.map(normalize)];
    
    // Deduplicate by email (prefer mobileUsers for Fish Farmers, users for others)
    const userMap = new Map();
    allUsers.forEach(user => {
      if (!user.email) return;
      
      const existing = userMap.get(user.email);
      if (!existing) {
        userMap.set(user.email, user);
      } else {
        // Prefer the collection that matches the user's role
        const userRole = String(user.role || '').toLowerCase();
        const existingRole = String(existing.role || '').toLowerCase();
        
        if (userRole === 'fish_farmer' && existing._collection === 'mobileUsers') {
          // Keep existing mobileUsers entry for Fish Farmers
        } else if (userRole !== 'fish_farmer' && existing._collection === 'users') {
          // Keep existing users entry for non-Fish Farmers
        } else {
          // Replace with current user (better match)
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
export const updateUserStatus = async (userId, status, role, collectionHint, userEmail) => {
  try {
    console.log('[updateUserStatus] Called with:', { userId, status, role, collectionHint, userEmail });
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
      await updateDoc(ref, {
        status: 'Active',
        adminActivated: true,
        lastModified: new Date().toISOString()
      });
      console.log(`[tryUpdate] Successfully updated ${coll} collection`);
      return true;
    };

    let updated = await tryUpdate(collectionName);
    if (!updated) {
      collectionName = collectionName === 'users' ? 'mobileUsers' : 'users';
      updated = await tryUpdate(collectionName);
    }
    
    // If still not updated, try to find by email
    if (!updated && userEmail) {
      console.log('[updateUserStatus] Direct ID lookup failed, trying email lookup...');
      const userByEmail = await findUserByEmail(userEmail);
      
      if (userByEmail) {
        console.log('[updateUserStatus] Found user by email:', userByEmail);
        // Update the correct document
        const ref = doc(db, userByEmail.collection, userByEmail.id);
                 await updateDoc(ref, {
           status: 'Active',
           lastModified: new Date().toISOString()
         });
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

// Activate Fish Farmer using shared status updater
export const activateFishFarmer = async (userId, email, collectionHint) => {
  return updateUserStatus(userId, 'Active', 'Fish Farmer', collectionHint || 'mobileUsers', email);
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
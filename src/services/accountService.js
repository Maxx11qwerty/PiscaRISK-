import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc, getDoc, query, where } from 'firebase/firestore';
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
        console.warn('Invalid date found during sorting:', { 
          userA: a.username, 
          dateA: a.dateJoined, 
          userB: b.username, 
          dateB: b.dateJoined 
        });
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
      const mobileUsersSnapshot = await getDocs(mobileUsersRef);
      
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
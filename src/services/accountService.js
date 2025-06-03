import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
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
    const webUsers = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Fetch mobile users
    const mobileUsersCollection = collection(db, 'mobileUsers');
    const mobileUsersSnapshot = await getDocs(mobileUsersCollection);
    const mobileUsers = mobileUsersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Combine both user lists and ensure no duplicates
    const allUsers = [...webUsers, ...mobileUsers];
    const uniqueUsers = Array.from(new Map(allUsers.map(user => [user.id, user])).values());
    
    // Sort users by date joined (newest first)
    return uniqueUsers.sort((a, b) => {
      return new Date(b.dateJoined) - new Date(a.dateJoined);
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
      dateJoined: new Date().toISOString().split('T')[0],
      lastModified: new Date().toISOString()
    };

    if (userData.role === 'Fish Farmer') {
      newUserData.isMobileUser = true;
      newUserData.accessLevel = 'mobile';
      await setDoc(doc(db, 'mobileUsers', uniqueId), newUserData);
    } else {
      await setDoc(doc(db, 'users', uniqueId), newUserData);
    }

    logActivity('account', logMessages.account.userCreated(currentUser.username, userData.username), currentUser.username);
    return newUserData;
  } catch (error) {
    console.error('Error adding user:', error);
    throw error;
  }
};

// Update user status
export const updateUserStatus = async (userId, status, role) => {
  try {
    const collectionName = role === 'Fish Farmer' ? 'mobileUsers' : 'users';
    await updateDoc(doc(db, collectionName, userId), {
      status,
      lastModified: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    throw error;
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
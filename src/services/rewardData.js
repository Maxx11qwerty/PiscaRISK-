import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { logActivity, logMessages } from '../utils/logger';

// Generate unique reward ID
export const generateRewardId = (rewardName) => {
  const RWDName = rewardName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `RWD-${RWDName}`;
};

// Fetch all rewards
export const fetchAllRewards = async () => {
  try {
    const rewardsRef = collection(db, 'rewards');
    const rewardsSnapshot = await getDocs(rewardsRef);
    return rewardsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(reward => !reward.claimLimitReached);
  } catch (error) {
    console.error('Error fetching rewards:', error);
    throw error;
  }
};

// Fetch all mobile users (Fish Farmers)
export const fetchAllMobileUsers = async () => {
  try {
    const mobileUsersRef = collection(db, 'mobileUsers');
    const mobileUsersSnapshot = await getDocs(mobileUsersRef);
    return mobileUsersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching mobile users:', error);
    throw error;
  }
};

// Add new reward
export const addNewReward = async (rewardData, currentUser) => {
  try {
    const rewardId = generateRewardId(rewardData.name);
    const newReward = {
      rewardId,
      name: rewardData.name,
      points: parseInt(rewardData.points, 10),
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    await setDoc(doc(db, 'rewards', rewardId), newReward);

    // Add to reward history
    await setDoc(doc(db, 'rewardHistory', rewardId), {
      rewardId,
      action: 'created',
      rewardName: rewardData.name,
      points: parseInt(rewardData.points, 10),
      timestamp: new Date().toISOString(),
      performedBy: currentUser.username
    });

    logActivity('reward', logMessages.reward.rewardAdded(currentUser.username, rewardData.name), currentUser.username);
    return { id: rewardId, ...newReward };
  } catch (error) {
    console.error('Error adding reward:', error);
    throw error;
  }
};

// Update reward
export const updateReward = async (rewardId, updatedData, oldReward, currentUser) => {
  try {
    const rewardRef = doc(db, 'rewards', rewardId);
    await updateDoc(rewardRef, {
      name: updatedData.name,
      points: parseInt(updatedData.points, 10),
      lastModified: new Date().toISOString()
    });

    // Add to reward history
    await setDoc(doc(db, 'rewardHistory', rewardId), {
      rewardId: oldReward.rewardId,
      firebaseId: rewardId,
      action: 'updated',
      oldName: oldReward.name,
      newName: updatedData.name,
      oldPoints: oldReward.points,
      newPoints: parseInt(updatedData.points, 10),
      timestamp: new Date().toISOString(),
      performedBy: currentUser.username
    });

    logActivity('reward', logMessages.reward.rewardModified(currentUser.username, updatedData.name), currentUser.username);
  } catch (error) {
    console.error('Error updating reward:', error);
    throw error;
  }
};

// Delete reward
export const deleteReward = async (rewardId, rewardData, currentUser) => {
  try {
    // Add to reward history before deletion
    await setDoc(doc(db, 'rewardHistory', rewardId), {
      rewardId: rewardData.rewardId,
      firebaseId: rewardId,
      action: 'deleted',
      rewardName: rewardData.name,
      points: rewardData.points,
      timestamp: new Date().toISOString(),
      performedBy: currentUser.username
    });

    await deleteDoc(doc(db, 'rewards', rewardId));
    logActivity('reward', logMessages.reward.rewardDeleted(currentUser.username, rewardData.name), currentUser.username);
  } catch (error) {
    console.error('Error deleting reward:', error);
    throw error;
  }
};

// Claim reward for a user
export const claimReward = async (userId, userData, reward, currentUser) => {
  try {
    // Deduct points from user
    const userRef = doc(db, 'Reward', userId);
    await updateDoc(userRef, {
      points: (userData.points || 0) - reward.points,
      lastModified: new Date().toISOString(),
    });

    // Add to claimedRewards collection
    const claimId = `${userId}_${reward.rewardId}`;
    await setDoc(doc(db, 'claimedRewards', claimId), {
      userId,
      username: userData.username,
      rewardId: reward.rewardId,
      rewardName: reward.name,
      pointsUsed: reward.points,
      claimedAt: new Date().toISOString(),
      claimedBy: currentUser.username,
      status: 'claimed',
    });

    // Optionally, add to rewardHistory
    await setDoc(doc(db, 'rewardHistory', claimId), {
      rewardId: reward.rewardId,
      userId,
      username: userData.username,
      action: 'claimed',
      rewardName: reward.name,
      points: reward.points,
      timestamp: new Date().toISOString(),
      performedBy: currentUser.username
    });

    // Check how many users have claimed this reward
    const claimedRef = collection(db, 'claimedRewards');
    const q = query(claimedRef, where('rewardId', '==', reward.rewardId));
    const snapshot = await getDocs(q);
    if (snapshot.size >= 3) {
      // Mark reward as claim limit reached
      const rewardRef = doc(db, 'rewards', reward.rewardId);
      await updateDoc(rewardRef, { claimLimitReached: true });
    }

    logActivity('reward', logMessages.reward.rewardObtained(userData.username, reward.name), currentUser.username);
    return true;
  } catch (error) {
    console.error('Error claiming reward:', error);
    throw error;
  }
};

// Fetch claimed rewards for a user
export const fetchClaimedRewardsForUser = async (userId) => {
  try {
    const claimedRef = collection(db, 'claimedRewards');
    const q = query(claimedRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error('Error fetching claimed rewards:', error);
    return [];
  }
}; 
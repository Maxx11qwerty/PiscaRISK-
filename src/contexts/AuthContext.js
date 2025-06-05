// src/contexts/AuthContext.js
import { createContext, useState, useEffect, useContext } from 'react';
import { logActivity, logMessages } from '../utils/logger';
import { auth, db } from '../firebase';
import firebase from 'firebase/compat/app';
import 'firebase/compat/functions';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail as updateFirebaseEmail,
  updatePassword as updateFirebasePassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  reauthenticateWithCredential,
  EmailAuthProvider,
  applyActionCode
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

export const AuthContext = createContext();

// Add useAuth hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);


  // Somewhere in your initialization:
  useEffect(() => {
    const initialize = async () => {
      await fetchAllUsers();
    };
    initialize();
  }, []);

  // Function to fetch all users from Firestore
  const fetchAllUsers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      const users = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(users);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Reload user to get latest verification status
        await user.reload();
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          // Update Firestore with latest verification status
          await updateDoc(doc(db, 'users', user.uid), {
            emailVerified: user.emailVerified,
            lastModified: serverTimestamp()
          });

          setCurrentUser({
            uid: user.uid,
            email: user.email,
            username: userDoc.data().username,
            role: userDoc.data().role,
            profileImage: userDoc.data().profileImage || null,
            dateJoined: userDoc.data().dateJoined || new Date().toISOString().split('T')[0],
            emailVerified: user.emailVerified
          });
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Signup function
  const signup = async (email, username, password) => {
    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document in Firestore with Tech Officer role and Inactive status
      const userData = {
        email,
        username,
        dateJoined: new Date().toISOString().split('T')[0],
        profileImage: null,
        role: 'Tech Officer',
        status: 'Inactive',
        createdBy: 'self',
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), userData);

      // Update profile with username
      await updateProfile(user, {
        displayName: username
      });

      // Log the registration
      logActivity('account', `New Tech Officer registration: ${username}`, username);

      return user;
    } catch (error) {
      logActivity('error', logMessages.error.system(`Registration failed: ${error.message}`), username);
      throw error;
    }
  };

  // Login function
  const login = async (usernameOrEmail, password) => {
    try {
      let email = usernameOrEmail;

      // If input is not an email (doesn't contain @), treat it as username
      if (!usernameOrEmail.includes('@')) {
        // Query Firestore to find user with this username
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', usernameOrEmail));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          return { success: false, message: "Invalid username or password" };
        }

        // Get the email from the user document
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        // Check if account is inactive or suspended
        if (userData.status === 'Inactive') {
          return { 
            success: false, 
            message: "Your account is pending admin approval. Please wait for activation." 
          };
        }
        
        if (userData.status === 'Suspended') {
          return {
            success: false,
            message: "Your account has been suspended. Please contact support for assistance."
          };
        }
        
        email = userData.email;
      }

      // Now login with the email
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Double check status in case email was used directly
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.status === 'Inactive') {
          // Sign out the user if account is inactive
          await signOut(auth);
          return { 
            success: false, 
            message: "Your account is pending admin approval. Please wait for activation." 
          };
        }
        if (userData.status === 'Suspended') {
          // Sign out the user if account is suspended
          await signOut(auth);
          return {
            success: false,
            message: "Your account has been suspended. Please contact support for assistance."
          };
        }
      }
      
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { 
        success: false, 
        message: error.code === 'auth/wrong-password' 
          ? "Invalid username/email or password" 
          : error.message 
      };
    }
  };

  const logout = async () => {
    try {
      // 1. Perform all cleanup first
      await signOut(auth);
      setCurrentUser(null);
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear cookies
      document.cookie.split(';').forEach(cookie => {
        const [name] = cookie.split('=');
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      });
  
      // 2. Service worker cleanup
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      }
  
      // 3. Replace current history entry with logout state
      window.history.replaceState(null, '', '/logout');
  
      // 4. Add navigation blocker
      const blockNavigation = (e) => {
        window.history.replaceState(null, '', '/');
        if (e) {
          e.preventDefault();
          window.location.replace('/');
        }
      };
  
      window.addEventListener('popstate', blockNavigation);
  
      // 5. Force redirect after cleanup
      window.location.replace('/');
      
    } catch (error) {
      console.error('Logout error:', error);
      window.location.replace('/');
    }
  };

  // Add function to send verification email
  const sendVerificationEmail = async () => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      await sendEmailVerification(auth.currentUser, {
        url: window.location.origin + '/verify-email',
        handleCodeInApp: true
      });

      logActivity('account', `Verification email sent to ${auth.currentUser.email}`, auth.currentUser.email);
      return { 
        success: true, 
        message: "Verification email sent. Please check your inbox." 
      };
    } catch (error) {
      logActivity('error', logMessages.error.system(`Failed to send verification email: ${error.message}`), auth.currentUser?.email);
      throw error;
    }
  };

  // Add re-authentication function
  const reauthenticate = async (password) => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        password
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      return true;
    } catch (error) {
      console.error('Re-authentication error:', error);
      throw new Error(
        error.code === 'auth/wrong-password' 
          ? "Incorrect password" 
          : "Re-authentication failed. Please try again."
      );
    }
  };

  // Update email function with comprehensive verification flow
  const updateEmail = async (newEmail, password) => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      // Reload user to get latest verification status
      await auth.currentUser.reload();
      console.log('Current user verification status:', auth.currentUser.emailVerified);

      // Validate email format
      if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
        throw new Error("Invalid email format");
      }

      // Check if email is already in use
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', newEmail));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        throw new Error("This email is already in use");
      }

      try {
        // Re-authenticate user with current email and password
        const credential = EmailAuthProvider.credential(
          auth.currentUser.email,
          password
        );
        await reauthenticateWithCredential(auth.currentUser, credential);
      } catch (reauthError) {
        console.error('Re-authentication error:', reauthError);
        throw new Error("Incorrect password. Please try again.");
      }

      // First, send verification email to the new address
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/verify-email?email=${encodeURIComponent(newEmail)}`,
        handleCodeInApp: true
      });

      // Update Firestore document with pending email change
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        pendingEmail: newEmail,
        lastModified: serverTimestamp()
      });

      logActivity('account', `Verification email sent to ${newEmail}`, currentUser.username);
      return { 
        success: true, 
        message: "Please check your new email address for a verification link. After verifying, you can complete the email change." 
      };
    } catch (error) {
      console.error('Email update error details:', {
        code: error.code,
        message: error.message,
        verificationStatus: auth.currentUser?.emailVerified
      });
      
      let errorMessage = "Failed to update email";
      
      switch(error.code) {
        case 'auth/email-already-in-use':
          errorMessage = "This email is already in use";
          break;
        case 'auth/requires-recent-login':
          errorMessage = "Session expired. Please log in again.";
          break;
        case 'auth/invalid-email':
          errorMessage = "Invalid email format";
          break;
        case 'auth/operation-not-allowed':
          errorMessage = "Please verify your new email address first.";
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = "Incorrect password. Please try again.";
          break;
        default:
          errorMessage = error.message || errorMessage;
      }
      
      logActivity('error', `Email update failed: ${errorMessage}`, currentUser?.username);
      throw new Error(errorMessage);
    }
  };

  // Add function to check email verification status
  const checkEmailVerification = async () => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      // Reload user to get latest verification status
      await auth.currentUser.reload();
      
      // Update Firestore with new verification status
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        emailVerified: auth.currentUser.emailVerified,
        lastModified: serverTimestamp()
      });

      // Update local state with new verification status
      setCurrentUser(prev => ({
        ...prev,
        emailVerified: auth.currentUser.emailVerified
      }));

      return auth.currentUser.emailVerified;
    } catch (error) {
      console.error('Error checking email verification:', error);
      throw error;
    }
  };

  // Change password function
  const changePassword = async (currentPassword, newPassword) => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      // Re-authenticate user first
      try {
        const credential = EmailAuthProvider.credential(
          auth.currentUser.email,
          currentPassword
        );
        await reauthenticateWithCredential(auth.currentUser, credential);
      } catch (reauthError) {
        console.error('Re-authentication error:', reauthError);
        throw new Error("Incorrect current password. Please try again.");
      }

      // Update password
      await updateFirebasePassword(auth.currentUser, newPassword);
      
      logActivity('account', logMessages.account.passwordChanged(currentUser.username), currentUser.username);
      return { 
        success: true, 
        message: "Password updated successfully!" 
      };
    } catch (error) {
      console.error('Password change error:', error);
      
      let errorMessage = "Failed to update password";
      
      switch(error.code) {
        case 'requires recent login':
          errorMessage = "Session expired. Please log in again.";
          break;
        case 'weak password':
          errorMessage = "Password is too weak. Please use a stronger password.";
          break;
        case 'wrong password':
        case 'invalid credential':
          errorMessage = "Incorrect current password. Please try again.";
          break;
        default:
          errorMessage = error.message || errorMessage;
      }
      
      logActivity('error', logMessages.error.system(`Password change failed: ${errorMessage}`), currentUser?.username);
      throw new Error(errorMessage);
    }
  };

  // Update profile image
  const updateProfileImage = async (imageUrl) => {
    try {
      if (!currentUser) return;

      await updateDoc(doc(db, 'users', currentUser.uid), {
        profileImage: imageUrl
      });

      setCurrentUser(prev => ({
        ...prev,
        profileImage: imageUrl
      }));
    } catch (error) {
      console.error('Error updating profile image:', error);
      throw error;
    }
  };

  
  const createStaffAccount = async (userData) => {
    try {
      // 1. Store current admin user credentials
      const currentAdmin = auth.currentUser;
      if (!currentAdmin) throw new Error("Not authenticated");
      
      const currentAdminEmail = currentAdmin.email;
      const currentAdminPassword = prompt("Please confirm your admin password to continue");
      if (!currentAdminPassword) throw new Error("Password required");
      
      console.log("Checking current admin UID:", currentAdmin.uid);
      // 2. Verify admin status
      const currentUserDoc = await getDoc(doc(db, 'users', currentAdmin.uid));
      if (!currentUserDoc.exists()) {
        throw new Error("User document not found");
      }

      if (currentUserDoc.data().role !== "Admin") {
        throw new Error("Admin privileges required");
      }
  
      // 3. Create the new user
      const { user } = await createUserWithEmailAndPassword(
        auth,
        userData.email,
        userData.password
      );
  
      // 4. Immediately sign back in as admin
      await signInWithEmailAndPassword(
        auth,
        currentAdminEmail,
        currentAdminPassword
      );
  
      // 5. Create user document
      await setDoc(doc(db, 'users', user.uid), {
        email: userData.email,
        username: userData.username,
        role: userData.role,
        status: "Active",
        createdAt: serverTimestamp(),
        createdBy: currentAdmin.uid,
        address: userData.address || "",
        contactNumber: userData.contactNumber || "",
        dateJoined: serverTimestamp(),
        fullName: userData.fullName || "",
        profileImage: userData.profileImage || null,
        isMobileUser: false
      });
  
      return { success: true };
    } catch (error) {
      console.error("User creation failed:", error);
      throw error;
    }
  };
  
  const isAdmin = async () => {
    if (!auth.currentUser) return false;
    
    try {
      const docRef = doc(db, 'users', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() && docSnap.data().role === "Admin";
    } catch (error) {
      console.error("Admin check error:", error);
      return false;
    }
  };
  
  const isTechOfficer = () => {
    return currentUser?.role === 'Tech Officer';
  };

  // Update user function
  const updateUser = async (updatedUserData) => {
    try {
      if (!currentUser) {
        throw new Error("No user logged in");
      }

      // Update user in Firestore
      await updateDoc(doc(db, 'users', currentUser.uid), {
        username: updatedUserData.username
      });

      // Update local state
      setCurrentUser(prev => ({
        ...prev,
        username: updatedUserData.username
      }));

      return true;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  };

  // Google Sign In
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Add scopes if needed
      provider.addScope('profile');
      provider.addScope('email');
      
      // Set custom parameters
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        // Create new user document if it doesn't exist
        const userData = {
          email: user.email,
          username: user.displayName || user.email.split('@')[0],
          dateJoined: new Date().toISOString().split('T')[0],
          profileImage: user.photoURL,
          role: 'User',
          emailVerified: user.emailVerified
        };

        await setDoc(doc(db, 'users', user.uid), userData);
        
        // Update the current user state
        setCurrentUser({
          uid: user.uid,
          ...userData
        });
      } else {
        // Update existing user's data
        const userData = userDoc.data();
        setCurrentUser({
          uid: user.uid,
          ...userData
        });
      }

      logActivity('login', `User logged in with Google: ${user.email}`, user.email);
      return { success: true, user };
    } catch (error) {
      console.error('Google sign-in error:', error);
      let errorMessage = 'Failed to sign in with Google';
      
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in popup was closed before completing the sign-in';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Sign-in popup was cancelled';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Sign-in popup was blocked by the browser';
      }
      
      logActivity('error', logMessages.error.system(`Google login failed: ${errorMessage}`), 'anonymous');
      throw new Error(errorMessage);
    }
  };

  // Facebook Sign In
  const signInWithFacebook = async () => {
    try {
      const provider = new FacebookAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (!userDoc.exists()) {
        // Create new user document if it doesn't exist
        await setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email,
          username: result.user.displayName || result.user.email.split('@')[0],
          dateJoined: new Date().toISOString().split('T')[0],
          profileImage: result.user.photoURL,
          role: 'User'
        });
      }

      logActivity('login', `User logged in with Facebook: ${result.user.email}`, result.user.email);
      return { success: true, user: result.user };
    } catch (error) {
      logActivity('error', logMessages.error.system(`Facebook login failed: ${error.message}`), 'anonymous');
      throw error;
    }
  };

// Add this to your AuthContext provider functions
const resetPassword = async (email) => {
  try {
    // Validate email format
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error('Please enter a valid email address');
    }

    // Check if email exists in your system (optional but recommended)
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('No account found with this email address');
    }

    // Send password reset email via Firebase
    await sendPasswordResetEmail(auth, email);
    
    // Log the password reset request
    await logActivity('account', `Password reset email sent to ${email}`, email);
    
    return { success: true };
  } catch (error) {
    console.error('Password reset error:', error);
    
    // Handle specific Firebase errors
    let errorMessage = error.message;
    if (error.code === 'auth/user-not-found') {
      errorMessage = 'No account found with this email address';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many requests. Please try again later.';
    }
    
    return { 
      success: false, 
      message: errorMessage 
    };
  }
};

  const value = {
    currentUser,
    allUsers,
    signup,
    login,
    logout,
    updateEmail,
    changePassword,
    updateProfileImage,
    fetchAllUsers,
    createStaffAccount,
    isAdmin,
    isTechOfficer,
    updateUser,
    signInWithGoogle,
    signInWithFacebook,
    resetPassword,
    sendVerificationEmail,
    checkEmailVerification
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
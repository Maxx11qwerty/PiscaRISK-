// src/contexts/AuthContext.js
import { createContext, useState, useEffect, useContext, useRef } from 'react';
import { logActivity, logMessages } from '../utils/logger';
import { auth, db, firebaseConfig } from '../firebase';
import { fetchAllUsers } from '../services/accountService';
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
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, deleteDoc } from 'firebase/firestore';

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
  const suppressAuthUpdatesRef = useRef(false);


  // Somewhere in your initialization:
  useEffect(() => {
    const initialize = async () => {
      await fetchAllUsers();
    };
    initialize();
  }, []);

  // Function to fetch user data (address, contactNumber, fullName) from main user document
  const fetchUserSubcollectionData = async (userId) => {
    try {
      console.log('fetchUserSubcollectionData: Starting fetch for user:', userId);
      const userData = {};
      
      // Fetch user document directly
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userDataFromDoc = userDoc.data();
        console.log('fetchUserSubcollectionData: User document data:', userDataFromDoc);
        
        // Get data from main user document
        userData.address = userDataFromDoc.address || '';
        userData.fullName = userDataFromDoc.fullName || '';
        userData.contact = userDataFromDoc.contactNumber || '';
        
        console.log('fetchUserSubcollectionData: Extracted data:', userData);
      }
      
      return userData;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return {};
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (suppressAuthUpdatesRef.current) {
        console.log('AuthContext: Suppressing auth state update during provisioning');
        return;
      }
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

          // Get data from main user document
          const userData = userDoc.data();
          console.log('AuthContext: User document data:', userData);

          setCurrentUser({
            uid: user.uid,
            email: user.email,
            username: userData.username,
            role: userData.role,
            profileImage: userData.profileImage || null,
            dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
            emailVerified: user.emailVerified,
            // Add data from main user document
            address: userData.address || '',
            fullName: userData.fullName || '',
            contact: userData.contactNumber || ''
          });
          console.log('AuthContext: Set currentUser with data:', {
            uid: user.uid,
            email: user.email,
            username: userData.username,
            address: userData.address || '',
            fullName: userData.fullName || '',
            contact: userData.contactNumber || ''
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
      let userData = null;
      let collectionName = 'users';

      // If input is not an email (doesn't contain @), treat it as username
      if (!usernameOrEmail.includes('@')) {
        // Query both collections to find user with this username
        const usersRef = collection(db, 'users');
        const mobileUsersRef = collection(db, 'mobileUsers');
        
        // Check users collection first
        let q = query(usersRef, where('username', '==', usernameOrEmail));
        let querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          // Check mobileUsers collection
          q = query(mobileUsersRef, where('username', '==', usernameOrEmail));
          querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            collectionName = 'mobileUsers';
          }
        }
        
        if (querySnapshot.empty) {
          return { success: false, message: "Invalid username or password" };
        }

        // Get the email from the user document
        const userDoc = querySnapshot.docs[0];
        userData = userDoc.data();
        
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
      if (!userData) {
        // Try to find user document by UID in both collections
        let userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (userDoc.exists()) {
          userData = userDoc.data();
          collectionName = 'users';
        } else {
          userDoc = await getDoc(doc(db, 'mobileUsers', userCredential.user.uid));
          if (userDoc.exists()) {
            userData = userDoc.data();
            collectionName = 'mobileUsers';
          }
        }
      }
      
      if (userData) {
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
      console.error('Login error:', error);
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/invalid-credential') {
        return { 
          success: false, 
          message: "Invalid username/email or password. Please check your credentials." 
        };
      } else if (error.code === 'auth/user-not-found') {
        return { 
          success: false, 
          message: "User account not found. Please check your username/email." 
        };
      } else if (error.code === 'auth/wrong-password') {
        return { 
          success: false, 
          message: "Invalid username/email or password. Please check your credentials." 
        };
      } else if (error.code === 'auth/too-many-requests') {
        return { 
          success: false, 
          message: "Too many failed login attempts. Please try again later." 
        };
      }
      
      return { 
        success: false, 
        message: error.message || "An error occurred during login. Please try again." 
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

  // Enhanced handleLogout function that can be used across components
  const handleLogout = async (navigate) => {
    try {
      // Prevent any clicks during logout
      const logoutButton = document.querySelector('.dropdown-menu button');
      if (logoutButton) {
        logoutButton.disabled = true;
      }
      
      // Call the main logout function
      await logout();
      
      // If navigate function is provided, use it
      if (navigate && typeof navigate === 'function') {
        navigate('/login');
      }
    } catch (error) {
      console.error('Handle logout error:', error);
      // Fallback navigation
      if (navigate && typeof navigate === 'function') {
        navigate('/login');
      }
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
      console.log('=== STARTING USER CREATION (NO ADMIN PASSWORD) ===');
      suppressAuthUpdatesRef.current = true;

      // Ensure admin is logged in
      let currentAdmin = auth.currentUser || currentUser;
      if (!currentAdmin) {
        // brief wait for auth
        await new Promise(r => setTimeout(r, 500));
        currentAdmin = auth.currentUser || currentUser;
        if (!currentAdmin) throw new Error('No admin logged in');
      }

      console.log('Admin user creating account:', currentAdmin?.email);
      console.log('Creating user with data:', userData);

      const adminUID = currentAdmin.uid;

      // Create auth user via secondary app (avoid switching session)
      const secondaryName = 'admin-staff-create';
      let secondaryApp;
      let newUserUid = null;
      try {
        secondaryApp = firebase.apps?.find(a => a.name === secondaryName)
          || firebase.initializeApp(firebaseConfig, secondaryName);
        const secondaryAuth = secondaryApp.auth();
        console.log('Creating user with secondary auth...');
        const cred = await secondaryAuth.createUserWithEmailAndPassword(
          userData.email,
          userData.password
        );
        newUserUid = cred.user?.uid || null;
        console.log('User created successfully, UID:', newUserUid);
        await secondaryAuth.signOut();
        console.log('Signed out from secondary auth');
      } catch (e) {
        console.error('Secondary auth create error:', e);
        if (e.code === 'auth/email-already-in-use') {
          throw new Error('Email already exists in system');
        } else if (e.code === 'auth/weak-password') {
          throw new Error('Password is too weak');
        } else {
          throw e;
        }
      } finally {
        try { 
          if (secondaryApp) { 
            await secondaryApp.delete(); 
            console.log('Secondary app deleted');
          }
        } catch (deleteError) { 
          console.warn('Could not delete secondary app:', deleteError); 
        }
      }

      if (!newUserUid) throw new Error('Failed to retrieve new user UID');

      // Firestore permission test for admin
      console.log('Testing Firestore write permissions...');
      const testDocRef = doc(db, 'test_permission', 'test');
      try {
        await setDoc(testDocRef, { test: new Date().toISOString() });
        console.log('Firestore write permission: OK');
        await deleteDoc(testDocRef);
      } catch (permError) {
        console.error('Firestore permission error:', permError);
        throw new Error("Admin doesn't have permission to create users. Check Firestore rules.");
      }

      // Write Firestore document
      console.log('Creating Firestore document for UID:', newUserUid);
      await setDoc(doc(db, 'users', newUserUid), {
        email: userData.email,
        username: userData.username,
        role: userData.role,
        status: (userData.role === 'Admin' || userData.role === 'Tech Officer') ? 'Inactive' : (userData.status || 'Active'),
        createdAt: serverTimestamp(),
        createdBy: adminUID,
        address: userData.address || '',
        contactNumber: userData.contactNumber || '',
        dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
        fullName: userData.fullName || '',
        profileImage: userData.profileImage || null,
        isMobileUser: false
      });
      console.log('Firestore document created successfully');

      return { success: true };
    } catch (error) {
      console.error('User creation failed:', error);
      return { success: false, error: error.message };
    } finally {
      suppressAuthUpdatesRef.current = false;
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
      await updateDoc(doc(db, 'users', currentUser.uid), updatedUserData);

      // Update local state
      setCurrentUser(prev => ({
        ...prev,
        ...updatedUserData
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
      
      let userRole = 'User'; // Default role
      
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
        userRole = userData.role;
        
        // Update the current user state
        setCurrentUser({
          uid: user.uid,
          ...userData
        });
      } else {
        // Update existing user's data
        const userData = userDoc.data();
        userRole = userData.role || 'User';
        setCurrentUser({
          uid: user.uid,
          ...userData
        });
      }

      logActivity('login', `User logged in with Google: ${user.email}`, user.email, null, userRole);
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
      
      let userRole = 'User'; // Default role
      
      if (!userDoc.exists()) {
        // Create new user document if it doesn't exist
        const userData = {
          email: result.user.email,
          username: result.user.displayName || result.user.email.split('@')[0],
          dateJoined: new Date().toISOString().split('T')[0],
          profileImage: result.user.photoURL,
          role: 'User'
        };
        
        await setDoc(doc(db, 'users', result.user.uid), userData);
        userRole = userData.role;
      } else {
        // Get existing user's role
        const userData = userDoc.data();
        userRole = userData.role || 'User';
      }

      logActivity('login', `User logged in with Facebook: ${result.user.email}`, result.user.email, null, userRole);
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

  // Function to change password after admin reset
  const forcePasswordChange = async (newPassword) => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      // Import Firebase Functions
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('../firebase');
      
      const functions = getFunctions(app);
      const forcePasswordChangeFunction = httpsCallable(functions, 'forcePasswordChange');
      
      // Call the Cloud Function to change password
      const result = await forcePasswordChangeFunction({
        newPassword: newPassword
      });
      
      if (result.data.success) {
        // Log the password change
        await logActivity('account', 'Password changed after admin reset', currentUser?.username);
        return { success: true, message: result.data.message };
      } else {
        throw new Error(result.data.message || 'Failed to change password');
      }
    } catch (error) {
      console.error('Force password change error:', error);
      
      let errorMessage = error.message;
      if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/invalid-password') {
        errorMessage = 'Invalid password format.';
      }
      
      throw new Error(errorMessage);
    }
  };

  // Function to check if password change is required
  const checkPasswordChangeRequired = async () => {
    try {
      if (!auth.currentUser) {
        return { requiresChange: false };
      }

      // Import Firebase Functions
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('../firebase');
      
      const functions = getFunctions(app);
      const checkPasswordChangeFunction = httpsCallable(functions, 'checkPasswordChangeRequired');
      
      // Call the Cloud Function to check password change requirement
      const result = await checkPasswordChangeFunction({});
      
      if (result.data.success) {
        return {
          requiresChange: result.data.requiresPasswordChange,
          lastPasswordReset: result.data.lastPasswordReset,
          passwordResetBy: result.data.passwordResetBy
        };
      } else {
        console.warn('Failed to check password change requirement:', result.data);
        return { requiresChange: false };
      }
    } catch (error) {
      console.error('Check password change required error:', error);
      return { requiresChange: false };
    }
  };

  // Function to refresh current user data
  const refreshCurrentUser = async () => {
    try {
      if (!auth.currentUser) {
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        setCurrentUser({
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          username: userData.username,
          role: userData.role,
          profileImage: userData.profileImage || null,
          dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
          emailVerified: auth.currentUser.emailVerified,
          // Add data from main user document
          address: userData.address || '',
          fullName: userData.fullName || '',
          contact: userData.contactNumber || ''
        });
      }
    } catch (error) {
      console.error('Error refreshing current user:', error);
    }
  }

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
    fetchUserSubcollectionData,
    refreshCurrentUser,
    createStaffAccount,
    isAdmin,
    isTechOfficer,
    updateUser,
    signInWithGoogle,
    signInWithFacebook,
    resetPassword,
    sendVerificationEmail,
    checkEmailVerification,
    handleLogout,
    forcePasswordChange,
    checkPasswordChangeRequired
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
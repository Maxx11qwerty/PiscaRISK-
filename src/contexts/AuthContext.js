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
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  sendEmailVerification,
  reauthenticateWithCredential,
  EmailAuthProvider,
  applyActionCode
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, deleteDoc, addDoc } from 'firebase/firestore';

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
  const [isHandlingRedirect, setIsHandlingRedirect] = useState(false);
  const suppressAuthUpdatesRef = useRef(false);

  // Email verification modal state
  const [emailVerificationModal, setEmailVerificationModal] = useState({ 
    open: false, 
    email: '', 
    autoSent: false,
    tempPassword: '' // Store password temporarily for resend
  });

  const openEmailVerificationModal = (email, tempPassword = '') => {
    setEmailVerificationModal(prev => ({ 
      open: true, 
      email, 
      autoSent: prev.autoSent,
      tempPassword 
    }));
  };

  const closeEmailVerificationModal = () => {
    setEmailVerificationModal({ open: false, email: '', autoSent: false, tempPassword: '' });
  };

  const resendVerificationEmail = async () => {
    try {
      if (!emailVerificationModal.email || !emailVerificationModal.tempPassword) {
        throw new Error('No credentials available for verification');
      }
      
      // Temporarily sign in to resend verification email
      const userCredential = await signInWithEmailAndPassword(auth, emailVerificationModal.email, emailVerificationModal.tempPassword);
      
      try {
        await sendEmailVerification(userCredential.user, {
          url: window.location.origin + '/login',
          handleCodeInApp: true
        });
        
        // Sign out immediately after sending
        await signOut(auth);
        
        return { success: true, message: 'Verification email sent!' };
      } catch (verificationError) {
        // Sign out even if verification fails
        await signOut(auth);
        throw verificationError;
      }
    } catch (e) {
      return { success: false, message: e.message };
    }
  };

  // OTP and authentication state
  const [requiresOTP, setRequiresOTP] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Somewhere in your initialization:
  useEffect(() => {
    const initialize = async () => {
      await fetchAllUsers();
    };
    initialize();
  }, []);

  // Handle Google redirect results
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        // Check if we have any OAuth parameters in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const hasOAuthParams = urlParams.has('code') || urlParams.has('state') || urlParams.has('error');

        if (hasOAuthParams) {

        }
        
        const result = await getRedirectResult(auth);
        
        if (result) {

          setIsHandlingRedirect(true);
          
          // Process the redirect result
          const processResult = await processGoogleSignInResult(result);

          
          // Clear the intent and farm ID
          localStorage.removeItem('googleSignInIntent');
          localStorage.removeItem('googleSignUpFarmId');
          
          // Redirect handling is complete
          setIsHandlingRedirect(false);
          
          // Force a page reload to ensure proper state

          window.location.href = '/Homepage';
        } else {

          if (hasOAuthParams) {

          }
        }

      } catch (error) {

        setIsHandlingRedirect(false);
      }
    };

    // Add a small delay to ensure auth is initialized
    const timer = setTimeout(handleRedirectResult, 100);
    return () => clearTimeout(timer);
  }, []);


  // Function to fetch user data (address, contactNumber, fullName) from main user document
  const fetchUserSubcollectionData = async (userId) => {
    try {

      const userData = {};
      
      // Fetch user document directly
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userDataFromDoc = userDoc.data();

        
        // Get data from main user document
        userData.address = userDataFromDoc.address || '';
        userData.fullName = userDataFromDoc.fullName || '';
        userData.contact = userDataFromDoc.contactNumber || '';
        

      }
      
      return userData;
    } catch (error) {

      return {};
    }
  };

  // Generate a 4-digit OTP
  const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  // Send OTP to user's email
  const sendOTP = async (userEmail) => {
    try {
      const otpCode = generateOTP();
      const otpData = {
        code: otpCode,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        used: false
      };

      // Store OTP in Firestore
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const otpRef = collection(userRef, 'otp');
      await addDoc(otpRef, otpData);

      // In production, this would send an actual email
      // For now, we'll log it to console

      
      setOtpSent(true);
      return { success: true, otp: otpCode };
    } catch (error) {

      return { success: false, error: error.message };
    }
  };

  // Verify OTP
  const verifyOTP = async (otpCode) => {
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const otpRef = collection(userRef, 'otp');
      const otpQuery = query(
        otpRef, 
        where('code', '==', otpCode),
        where('used', '==', false)
      );
      
      const otpSnapshot = await getDocs(otpQuery);
      
      if (otpSnapshot.empty) {
        return { success: false, error: 'Invalid OTP' };
      }

      const otpDoc = otpSnapshot.docs[0];
      const otpData = otpDoc.data();

      // Check if OTP is expired
      if (otpData.expiresAt.toDate() < new Date()) {
        return { success: false, error: 'OTP expired' };
      }

      // Mark OTP as used
      await updateDoc(doc(otpRef, otpDoc.id), { used: true });

      setRequiresOTP(false);
      setOtpSent(false);
      
      return { success: true };
    } catch (error) {

      return { success: false, error: error.message };
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (suppressAuthUpdatesRef.current) {
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

          // Check if user needs OTP verification
          if (user.emailVerified && userData.status === 'active') {
            setRequiresOTP(true);
          }

          setCurrentUser({
            uid: user.uid,
            email: user.email,
            username: userData.username,
            role: userData.role,
            profileImage: userData.profileImage || null,
            dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
            emailVerified: user.emailVerified,
            status: userData.status,
            // Add data from main user document
            address: userData.address || '',
            fullName: userData.fullName || '',
            contact: userData.contactNumber || '',
            // Add farm information
            farm: userData.farm || null
          });
        }
      } else {
        setCurrentUser(null);
        setRequiresOTP(false);
        setOtpSent(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Signup function
  const signup = async (email, username, contactNumber, farmId, password) => {
    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document in Firestore with Tech Officer role and Inactive status
      const userData = {
        email,
        username,
        contactNumber,
        farm: farmId, // Store as 'farm' to match the field name used in filtering
        dateJoined: new Date().toISOString().split('T')[0],
        profileImage: null,
        role: 'tech_officer',
        status: 'inactive',
        emailVerified: false,
        createdBy: 'self',
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), userData);

      // Update profile with username
      await updateProfile(user, {
        displayName: username
      });

      // Send email verification
      await sendEmailVerification(user, {
        url: window.location.origin + '/verify-email',
        handleCodeInApp: true
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
const login = async (emailOrContact, password) => {
  try {
    let email = emailOrContact;
    let userData = null;
    let collectionName = 'users';

    // If input is not an email (doesn't contain @), treat it as contact number
    if (!emailOrContact.includes('@')) {
      // Query both collections to find user with this contact number
      const usersRef = collection(db, 'users');
      const mobileUsersRef = collection(db, 'mobileUsers');
      
      // Check users collection first for contact number
      let q = query(usersRef, where('contactNumber', '==', emailOrContact));
      let querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        // Check mobileUsers collection for contact number
        q = query(mobileUsersRef, where('contactNumber', '==', emailOrContact));
        querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          collectionName = 'mobileUsers';
        }
      }
      
      if (querySnapshot.empty) {
        return { success: false, message: "Invalid email/contact number or password" };
      }

      // Get the email from the user document
      const userDoc = querySnapshot.docs[0];
      userData = userDoc.data();
      
      // Check if account is suspended (always block suspended accounts)
      if (userData.status === 'suspended') {
        return {
          success: false,
          message: "Your account has been suspended. Please contact support for assistance."
        };
      }
      
      // Check adminActivated status first (this is the key fix)
      const roleLower = String(userData.role || '').toLowerCase();
      const isAdminActivated = roleLower === 'admin' ? true : !!userData.adminActivated;
      
      if (!isAdminActivated) {
        return { 
          success: false, 
          message: "Your account is pending admin approval. Please wait for activation." 
        };
      }
      
      // If adminActivated is true, allow the login to proceed to Firebase Auth
      // We'll check email verification after successful Firebase Auth login
      
      email = userData.email;
    } else {
      // If input is an email, we need to check adminActivated before proceeding
      // Query both collections to find user with this email
      const usersRef = collection(db, 'users');
      const mobileUsersRef = collection(db, 'mobileUsers');
      
      // Check users collection first
      let q = query(usersRef, where('email', '==', emailOrContact));
      let querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        // Check mobileUsers collection
        q = query(mobileUsersRef, where('email', '==', emailOrContact));
        querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          collectionName = 'mobileUsers';
        }
      }
      
      if (querySnapshot.empty) {
        return { success: false, message: "Invalid email/contact number or password" };
      }

      // Get the user data from the document
      const userDoc = querySnapshot.docs[0];
      userData = userDoc.data();
      
      // Check if account is suspended (always block suspended accounts)
      if (userData.status === 'suspended') {
        return {
          success: false,
          message: "Your account has been suspended. Please contact support for assistance."
        };
      }
      
      // Check adminActivated status first (this is the key fix)
      const roleLower = String(userData.role || '').toLowerCase();
      const isAdminActivated = roleLower === 'admin' ? true : !!userData.adminActivated;
      
      if (!isAdminActivated) {
        return { 
          success: false, 
          message: "Your account is pending admin approval. Please wait for activation." 
        };
      }
      
      // If adminActivated is true, allow the login to proceed to Firebase Auth
      // We'll check email verification after successful Firebase Auth login
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

      // Check if account is suspended (always block suspended accounts)
      if (userData.status === 'suspended') {
        await signOut(auth);
        return {
          success: false,
          message: "Your account has been suspended. Please contact support for assistance."
        };
      }
      
      // Allow Admin accounts to login regardless of status (except suspended)
      const roleLower = String(userData.role || '').toLowerCase();
      if (roleLower === 'admin') {
        // Auto-activate admin accounts if they're inactive
        const statusLower = String(userData.status || '').toLowerCase();
        if (statusLower === 'inactive' && userCredential.user.emailVerified) {
          const updateRef = doc(db, collectionName, userCredential.user.uid);
          await updateDoc(updateRef, {
            status: 'Active',
            lastModified: serverTimestamp()
          });
          userData.status = 'Active';
        }
      }

      // For existing users, if email not verified: trigger verification flow instead of plain error
      if (!userCredential.user.emailVerified) {
        try {
          await sendEmailVerification(userCredential.user, {
            url: window.location.origin + '/login',
            handleCodeInApp: true
          });
        } catch (e) {
        }
        await signOut(auth);
        return {
          success: false,
          code: 'show_verification_modal',
          email: email,
          password: password, // Pass password for resend functionality
          message: ''
        };
      }

      // Now handle status updates and auto-activation
      const statusLower = String(userData.status || '').toLowerCase();
      
      // Auto-activate admin accounts if they're inactive and email verified
      if (roleLower === 'admin' && statusLower === 'inactive' && userCredential.user.emailVerified) {
        const updateRef = doc(db, collectionName, userCredential.user.uid);
        await updateDoc(updateRef, {
          status: 'Active',
          emailVerified: true,
          lastModified: serverTimestamp()
        });
        userData.status = 'Active';
      }
      
      // For non-admin users with adminActivated=true and emailVerified=true, 
      // update status to Active if it's not already
      if (roleLower !== 'admin' && userData.adminActivated && userCredential.user.emailVerified && statusLower !== 'active') {
        const updateRef = doc(db, collectionName, userCredential.user.uid);
        await updateDoc(updateRef, {
          status: 'Active',
          emailVerified: true,
          lastModified: serverTimestamp()
        });
        userData.status = 'Active';
      }
    }
    
    return { success: true, user: userCredential.user };
  } catch (error) {
    
    // Handle specific Firebase Auth errors
    if (error.code === 'auth/invalid-credential') {
      return { 
        success: false, 
        message: "Invalid email/contact number or password. Please check your credentials." 
      };
    } else if (error.code === 'auth/user-not-found') {
      return { 
        success: false, 
        message: "User account not found. Please check your email/contact number." 
      };
    } else if (error.code === 'auth/wrong-password') {
      return { 
        success: false, 
        message: "Invalid email/contact number or password. Please check your credentials." 
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
      try { logActivity('logout', logMessages.logout.logoutAttempt(currentUser?.username || auth.currentUser?.email || 'Unknown')); } catch (_) {}
      // 1. Perform all cleanup first
      await signOut(auth);
      setCurrentUser(null);
      setRequiresOTP(false);
      setOtpSent(false);
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
      try { logActivity('logout', logMessages.logout.success(currentUser?.username || auth.currentUser?.email || 'Unknown'), currentUser?.username || auth.currentUser?.email || 'Unknown'); } catch (_) {}
      
    } catch (error) {
      try { logActivity('logout', logMessages.logout.logoutError(currentUser?.username || auth.currentUser?.email || 'Unknown', error.message), currentUser?.username || auth.currentUser?.email || 'Unknown'); } catch (_) {}
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
      try { logActivity('logout', logMessages.logout.success(currentUser?.username || auth.currentUser?.email || 'Unknown'), currentUser?.username || auth.currentUser?.email || 'Unknown'); } catch (_) {}
      
      // If navigate function is provided, use it
      if (navigate && typeof navigate === 'function') {
        navigate('/login');
      }
    } catch (error) {

      try { logActivity('logout', logMessages.logout.logoutError(currentUser?.username || auth.currentUser?.email || 'Unknown', error.message), currentUser?.username || auth.currentUser?.email || 'Unknown'); } catch (_) {}
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

  // Function to immediately update status after email verification
  const updateStatusAfterVerification = async () => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      // Reload user to get latest verification status
      await auth.currentUser.reload();
      
      if (auth.currentUser.emailVerified) {
        // Get user document from Firestore
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          // If status is inactive and email is verified, update to active
          if (userData.status === 'inactive') {

            
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              status: 'active',
              emailVerified: true,
              lastModified: serverTimestamp()
            });
            

            
            // Update local state
            setCurrentUser(prev => ({
              ...prev,
              emailVerified: true,
              status: 'active'
            }));
            
            return { success: true, statusUpdated: true };
          } else {

            return { success: true, statusUpdated: false };
          }
        }
      }
      
      return { success: true, statusUpdated: false };
    } catch (error) {

      throw error;
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

      // If email is now verified and status is inactive, update status to active based on role/activation
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.status === 'inactive' && auth.currentUser.emailVerified) {
          const canActivate = (userData.role === 'admin') || (userData.role === 'tech_officer' && userData.adminActivated);
          if (canActivate) {

            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              status: 'active',
              lastModified: serverTimestamp()
            });

            // Update local state
            setCurrentUser(prev => ({
              ...prev,
              emailVerified: auth.currentUser.emailVerified,
              status: 'active'
            }));
          } else {
            // Update only emailVerified locally
            setCurrentUser(prev => ({
              ...prev,
              emailVerified: auth.currentUser.emailVerified
            }));
          }
        } else {
          // Update local state with new verification status
          setCurrentUser(prev => ({
            ...prev,
            emailVerified: auth.currentUser.emailVerified
          }));
        }
      }

      return auth.currentUser.emailVerified;
    } catch (error) {

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

      throw error;
    }
  };

  
  const createStaffAccount = async (userData) => {
    try {
      suppressAuthUpdatesRef.current = true;

      // Ensure admin is logged in
      let currentAdmin = auth.currentUser || currentUser;
      if (!currentAdmin) {
        // brief wait for auth
        await new Promise(r => setTimeout(r, 500));
        currentAdmin = auth.currentUser || currentUser;
        if (!currentAdmin) throw new Error('No admin logged in');
      }



      const adminUID = currentAdmin.uid;

      // Create auth user via secondary app (avoid switching session)
      const secondaryName = 'admin-staff-create';
      let secondaryApp;
      let newUserUid = null;
      try {
        secondaryApp = firebase.apps?.find(a => a.name === secondaryName)
          || firebase.initializeApp(firebaseConfig, secondaryName);
        const secondaryAuth = secondaryApp.auth();
        const cred = await secondaryAuth.createUserWithEmailAndPassword(
          userData.email,
          userData.password
        );
        newUserUid = cred.user?.uid || null;
        await secondaryAuth.signOut();

      } catch (e) {

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
          }
        } catch (deleteError) { 
        }
      }

      if (!newUserUid) throw new Error('Failed to retrieve new user UID');

      // Firestore permission test for admin
      const testDocRef = doc(db, 'test_permission', 'test');
      try {
        await setDoc(testDocRef, { test: new Date().toISOString() });
        await deleteDoc(testDocRef);
      } catch (permError) {

        throw new Error("Admin doesn't have permission to create users. Check Firestore rules.");
      }

      // Determine target collection, canonical role and status
      const requestedRole = userData.role;
      const canonicalStatus = String(
        userData.status || (
          (requestedRole === 'Admin' || requestedRole === 'Tech Officer' || requestedRole === 'Fish Farmer')
            ? 'Inactive'
            : 'Active'
        )
      ).toLowerCase();
      let targetCollection = 'users';
      let canonicalRole = 'tech_officer';
      let isMobileUser = false;

      if (requestedRole === 'Admin') {
        targetCollection = 'users';
        canonicalRole = 'admin';
      } else if (requestedRole === 'Tech Officer') {
        targetCollection = 'users';
        canonicalRole = 'tech_officer';
      } else if (requestedRole === 'Fish Farmer') {
        // Fish Farmers belong to mobileUsers
        targetCollection = 'mobileUsers';
        canonicalRole = 'fish_farmer';
        isMobileUser = true;
      }

      await setDoc(doc(db, targetCollection, newUserUid), {
        email: userData.email,
        username: userData.username,
        role: canonicalRole,
        status: canonicalStatus,
        emailVerified: false,
        createdAt: serverTimestamp(),
        createdBy: adminUID,
        address: userData.address || '',
        contactNumber: userData.contactNumber || '',
        dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
        fullName: userData.fullName || '',
        profileImage: userData.profileImage || null,
        isMobileUser,
        // Add farm assignment if provided
        farm: userData.farm || null,
        // Admin activation flag (Firestore does not allow undefined)
        adminActivated: (requestedRole === 'Admin') ? true : false
      });

      return { success: true };
    } catch (error) {

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
      return docSnap.exists() && docSnap.data().role === "admin";
    } catch (error) {

      return false;
    }
  };
  
  const isTechOfficer = () => {
    return currentUser?.role === 'tech_officer';
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

      throw error;
    }
  };

  // Google Sign In with popup fallback to redirect
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Add scopes if needed
      provider.addScope('profile');
      provider.addScope('email');
      
      // Set custom parameters to avoid popup issues
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      // Try popup first
      try {
        const result = await signInWithPopup(auth, provider);
        return await processGoogleSignInResult(result);
      } catch (popupError) {

        
        // If popup fails due to COOP or blocking, use redirect
        if (popupError.code === 'auth/popup-closed-by-user' || 
            popupError.code === 'auth/popup-blocked' ||
            popupError.code === 'auth/cancelled-popup-request' ||
            popupError.message.includes('Cross-Origin-Opener-Policy') ||
            popupError.message.includes('COOP')) {
          
          // Store the intended action in localStorage
          localStorage.setItem('googleSignInIntent', 'signin');
          
          // Use redirect method
          await signInWithRedirect(auth, provider);
          return { 
            success: true, 
            message: 'Redirecting to Google sign-in',
            isRedirect: true 
          };
        }
        
        // Handle other specific popup errors
        if (popupError.code === 'auth/network-request-failed') {
          throw new Error('Network error occurred during Google sign-in. Please check your internet connection and try again.');
        } else if (popupError.code === 'auth/too-many-requests') {
          throw new Error('Too many sign-in attempts. Please wait a moment and try again.');
        } else if (popupError.message.includes('Content Security Policy')) {
          throw new Error('Security policy is blocking Google sign-in. Please try using a different browser or contact support.');
        }
        
        // Generic error fallback
        throw new Error(`Google sign-in failed: ${popupError.message || 'Unknown error occurred'}`);
      }
    } catch (error) {

      throw error;
    }
  };

  // Handle Google redirect result
  const handleGoogleRedirectResult = async () => {
    try {
      const result = await getRedirectResult(auth);
      if (result) {
        return await processGoogleSignInResult(result);
      }
      return null;
    } catch (error) {

      throw error;
    }
  };

  // Process Google sign-in result (shared logic for both popup and redirect)
  const processGoogleSignInResult = async (result) => {
    try {
      const user = result.user;
      
      // Check if this is a sign-up flow (indicated by googleSignUpFarmId in localStorage)
      const isSignUpFlow = localStorage.getItem('googleSignUpFarmId') !== null;
      
      // First, check if this email already exists in Firestore (for newly added admins)
      const usersRef = collection(db, 'users');
      const emailQuery = query(usersRef, where('email', '==', user.email));
      const emailSnapshot = await getDocs(emailQuery);
      
      let existingUserData = null;
      let isNewlyAddedAdmin = false;
      let existingUserDoc = null;
      
      if (!emailSnapshot.empty) {
        // Email exists in Firestore - check if it's a newly added admin
        existingUserDoc = emailSnapshot.docs[0];
        existingUserData = existingUserDoc.data();

        
        if (existingUserData.role === 'admin' && String(existingUserData.status || '').toLowerCase() === 'inactive') {
          isNewlyAddedAdmin = true;
        } else {
          // Email exists in Firestore - check the user's status
          const userStatus = String(existingUserData.status || '').toLowerCase();
          
          if (userStatus === 'inactive') {
            // User exists but is inactive - needs admin activation
            await signOut(auth);
            if (isSignUpFlow) {
              throw new Error('An account with this email already exists but is pending admin approval. Please use the login page instead.');
            } else {
              throw new Error('Your account is pending admin approval. Please wait for activation.');
            }
          } else if (userStatus === 'suspended') {
            // User is suspended
            await signOut(auth);
            throw new Error('Your account has been suspended. Please contact support for assistance.');
          } else if (userStatus === 'active') {
            // User exists and is active - should use login
            await signOut(auth);
            throw new Error('An account with this email already exists. Please use the login page instead.');
          } else {
            // Unknown status - default to login message
            await signOut(auth);
            throw new Error('An account with this email already exists. Please use the login page instead.');
          }
        }
      }
      
      // Check if user exists in Firestore by UID
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      let userRole = 'tech_officer'; // Default role for new users
      
      if (!userDoc.exists()) {
        // User doesn't exist by UID - this could be a new user or a newly added admin
        if (emailSnapshot.empty) {
          // This is a completely new user - create new account
          // Get farm ID from localStorage (set during Google sign-up)
          const farmId = localStorage.getItem('googleSignUpFarmId');
          
          const userData = {
            email: user.email,
            username: user.displayName || user.email.split('@')[0],
            dateJoined: new Date().toISOString().split('T')[0],
            profileImage: user.photoURL,
            role: 'tech_officer',
            status: 'inactive',
            emailVerified: user.emailVerified,
            farmId: farmId || null, // Include farm ID from Google sign-up
            createdAt: serverTimestamp()
          };
          
          // Clear the stored farm ID after use
          if (farmId) {
            localStorage.removeItem('googleSignUpFarmId');
          }

          await setDoc(doc(db, 'users', user.uid), userData);
          userRole = userData.role;
          
          // ALL users must verify email before accessing dashboard
          if (!user.emailVerified) {
            await signOut(auth);
            throw new Error('Please verify your email before logging in. Check your inbox for a verification link.');
          }
          
          // Do NOT auto-activate Tech Officers; require admin activation.
          // Only admins may be auto-activated on verified email.
          if (user.emailVerified && String(userData.status || '').toLowerCase() === 'inactive' && userData.role === 'admin') {
            await updateDoc(doc(db, 'users', user.uid), {
              status: 'Active',
              emailVerified: true,
              lastModified: serverTimestamp()
            });
            userData.status = 'Active';
          } else if (String(userData.status || '').toLowerCase() === 'inactive') {
            await signOut(auth);
            throw new Error('Your account is pending admin approval. Please wait for activation.');
          }
          
          // Update the current user state
          setCurrentUser({
            uid: user.uid,
            ...userData,
            farm: userData.farm || null
          });
        } else if (isNewlyAddedAdmin) {
          // This is a newly added admin trying to log in with Google
          // We need to link their Google account to the existing Firestore document
          await updateDoc(doc(db, 'users', existingUserDoc.id), {
            googleUid: user.uid,
            lastModified: serverTimestamp()
          });
          
          // Update the user document with Google profile info
          await updateDoc(doc(db, 'users', existingUserDoc.id), {
            profileImage: user.photoURL,
            lastModified: serverTimestamp()
          });
          
          userRole = existingUserData.role;
          
          // For newly added admins, they must verify their email before activation
          if (!user.emailVerified) {
            await signOut(auth);
            throw new Error('Please verify your email before logging in. Check your inbox for a verification link.');
          }
          
          // If email is verified, update status to Active
          if (user.emailVerified && String(existingUserData.status || '').toLowerCase() === 'inactive') {
            await updateDoc(doc(db, 'users', existingUserDoc.id), {
              status: 'Active',
              emailVerified: true,
              lastModified: serverTimestamp()
            });
            existingUserData.status = 'Active';
          }
          
          setCurrentUser({
            uid: existingUserDoc.id,
            ...existingUserData,
            emailVerified: user.emailVerified,
            farm: existingUserData.farm || null
          });
      } else {
          // Email exists but user is not a newly added admin
          // Check the user's status to provide appropriate message
          const userStatus = String(existingUserData.status || '').toLowerCase();
          
          if (userStatus === 'inactive') {
            // User exists but is inactive - needs admin activation
            await signOut(auth);
            throw new Error('Your account is pending admin approval. Please wait for activation.');
          } else if (userStatus === 'suspended') {
            // User is suspended
            await signOut(auth);
            throw new Error('Your account has been suspended. Please contact support for assistance.');
          } else if (userStatus === 'active') {
            // User exists and is active - should use login
            await signOut(auth);
            throw new Error('An account with this email already exists. Please use the login page instead.');
          } else {
            // Unknown status - default to login message
            await signOut(auth);
            throw new Error('An account with this email already exists. Please use the login page instead.');
          }
        }
      } else {
        // User exists by UID - this is an existing user trying to sign in
        // Update existing user's data
        const userData = userDoc.data();
        userRole = userData.role || 'tech_officer';
        

        // Check if account is suspended (always block suspended accounts)
        if (userData.status === 'suspended') {
          await signOut(auth);
          throw new Error('Your account has been suspended. Please contact support for assistance.');
        }

        // For existing users, check if they need email verification
        if (!user.emailVerified) {

          await signOut(auth);
          throw new Error('Please verify your email before logging in. Check your inbox for a verification link.');
        }

        // Handle status updates for existing users (auto-activate admins only)
        if (userData.role === 'admin' && userData.status === 'inactive' && user.emailVerified) {

          
          await updateDoc(doc(db, 'users', user.uid), {
            status: 'active',
            emailVerified: true,
            lastModified: serverTimestamp()
          });
          userData.status = 'active';
        } else if (userData.status === 'active' && user.emailVerified) {
          // Existing active user with verified email - allow access

        } else if (!userData.status || userData.status === 'pending' || userData.status === 'new') {
          // Handle legacy users without proper status

          if (userData.role === 'admin' && user.emailVerified) {
            await updateDoc(doc(db, 'users', user.uid), {
              status: 'active',
              emailVerified: true,
              lastModified: serverTimestamp()
            });

            userData.status = 'active';
          } else {
            await signOut(auth);
            throw new Error('Your account is pending admin approval. Please wait for activation.');
          }
        }
        
        setCurrentUser({
          uid: user.uid,
          ...userData,
          farm: userData.farm || null
        });
      }

      logActivity('login', `User logged in with Google: ${user.email}`, user.email, null, userRole);
      return { success: true, user };
    } catch (error) {
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
      
      let errorMessage = error.message;
      if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/invalid-password') {
        errorMessage = 'Invalid password format.';
      }
      
      throw new Error(errorMessage);
    }
  };

  // checkPasswordChangeRequired function removed - using ProfileSettings password reset instead

  // Function to migrate existing users to proper status
  const migrateExistingUser = async (userId) => {
    try {
      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      // Get user document from Firestore
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
      

        // If user has no status or legacy status, set to active if email verified
        if (!userData.status || userData.status === 'pending' || userData.status === 'new') {
          if (auth.currentUser.emailVerified) {
            await updateDoc(doc(db, 'users', userId), {
              status: 'active',
              emailVerified: true,
              lastModified: serverTimestamp()
            });
            

            
            // Update local state
            setCurrentUser(prev => ({
              ...prev,
              status: 'active',
              emailVerified: true
            }));
            
            return { success: true, statusUpdated: true, newStatus: 'active' };
          } else {
            // Email not verified, set to inactive
            await updateDoc(doc(db, 'users', userId), {
              status: 'inactive',
              emailVerified: false,
              lastModified: serverTimestamp()
            });
            

            
            // Update local state
            setCurrentUser(prev => ({
              ...prev,
              status: 'inactive',
              emailVerified: false
            }));
            
            return { success: true, statusUpdated: true, newStatus: 'inactive' };
          }
        } else if (userData.status === 'inactive' && auth.currentUser.emailVerified) {
          // Update inactive user to active if email is verified
          await updateDoc(doc(db, 'users', userId), {
            status: 'active',
            emailVerified: true,
            lastModified: serverTimestamp()
          });
          

          
          // Update local state
          setCurrentUser(prev => ({
            ...prev,
            status: 'active',
            emailVerified: true
          }));
          
          return { success: true, statusUpdated: true, newStatus: 'active' };
        } else {

          return { success: true, statusUpdated: false, currentStatus: userData.status };
        }
      }
      
      return { success: false, error: 'User document not found' };
    } catch (error) {

      throw error;
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
          status: userData.status,
          // Add data from main user document
          address: userData.address || '',
          fullName: userData.fullName || '',
          contact: userData.contactNumber || '',
          // Add farm information
          farm: userData.farm || null
        });
      }
    } catch (error) {

    }
  }

  // Function to manually activate Admin account
  const activateAdminAccount = async (email) => {
    try {

      
      // Search in users collection first
      const usersRef = collection(db, 'users');
      const emailQuery = query(usersRef, where('email', '==', email));
      const emailSnapshot = await getDocs(emailQuery);
      
      if (!emailSnapshot.empty) {
        const userDoc = emailSnapshot.docs[0];
        const userData = userDoc.data();
        
        if (userData.role === 'Admin' || userData.role === 'admin') {

          
          await updateDoc(doc(db, 'users', userDoc.id), {
            status: 'Active',
            lastModified: serverTimestamp()
          });
          

          return { success: true, message: 'Admin account activated successfully' };
        } else {
          return { success: false, message: 'Account is not an Admin account' };
        }
      }
      
      return { success: false, message: 'Admin account not found' };
    } catch (error) {

      return { success: false, message: error.message };
    }
  }

  // Function to reset Admin password
  const resetAdminPassword = async (email, newPassword) => {
    try {

      
      // Search in users collection first
      const usersRef = collection(db, 'users');
      const emailQuery = query(usersRef, where('email', '==', email));
      const emailSnapshot = await getDocs(emailQuery);
      
      if (!emailSnapshot.empty) {
        const userDoc = emailSnapshot.docs[0];
        const userData = userDoc.data();
        
        if (userData.role === 'Admin' || userData.role === 'admin') {

          
          // Use Firebase Admin SDK via Cloud Function to reset password
          try {
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const { app } = await import('../firebase');
            
            const functions = getFunctions(app);
            const adminResetPassword = httpsCallable(functions, 'adminResetPassword');
            
            const result = await adminResetPassword({
              userEmail: email,
              newPassword: newPassword
            });
            
            if (result.data.success) {

              return { success: true, message: 'Admin password reset successfully. New password: ' + newPassword };
            } else {
              throw new Error(result.data.error || 'Failed to reset password');
            }
          } catch (cloudError) {

            return { 
              success: false, 
              message: `Password reset initiated. To complete: 1) Go to Firebase Console > Authentication > Users, 2) Find user with email: ${email}, 3) Click "Edit" and set password to: ${newPassword}, 4) Save changes.`,
              manualPassword: newPassword
            };
          }
        } else {
          return { success: false, message: 'Account is not an Admin account' };
        }
      }
      
      return { success: false, message: 'Admin account not found' };
    } catch (error) {

      return { success: false, message: error.message };
    }
  }

  const value = {
    currentUser,
    allUsers,
    signup,
    login,
    logout,
    signInWithGoogle,
    handleGoogleRedirectResult,
    isHandlingRedirect,
    // email verification modal controls
    emailVerificationModal,
    openEmailVerificationModal,
    resendVerificationEmail,
    closeEmailVerificationModal,
    updateEmail,
    changePassword,
    updateProfileImage,
    fetchAllUsers,
    fetchUserSubcollectionData,
    refreshCurrentUser,
    migrateExistingUser,
    createStaffAccount,
    isAdmin,
    isTechOfficer,
    updateUser,
    resetPassword,
    sendVerificationEmail,
    checkEmailVerification,
    updateStatusAfterVerification,
    handleLogout,
    forcePasswordChange,
    activateAdminAccount,
    resetAdminPassword,
    // OTP functionality
    requiresOTP,
    otpSent,
    sendOTP,
    verifyOTP
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
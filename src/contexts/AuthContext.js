// src/contexts/AuthContext.js
import { createContext, useState, useEffect, useContext, useRef } from 'react';
import { logActivity, logMessages, isTemporaryTechOfficer, logTemporaryTechOfficerActivity } from '../utils/logger';
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
  sendPasswordResetEmail,
  sendEmailVerification,
  reauthenticateWithCredential,
  EmailAuthProvider,
  applyActionCode
} from 'firebase/auth';
import { setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, deleteDoc, addDoc, onSnapshot } from 'firebase/firestore';
import { sanitizeObjectStrings } from '../utils/sanitize';

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
  const currentUserRef = useRef(null);
  const isLoggingOutRef = useRef(false);
  const isProcessingLoginRef = useRef(false);
  const resendVerificationCooldownUntilRef = useRef(0);
  const userStatusListenerRef = useRef(null);

  // Function to set up real-time monitoring of current user's status
  const setupUserStatusListener = (userId) => {
    // Clean up existing listener
    if (userStatusListenerRef.current) {
      userStatusListenerRef.current();
      userStatusListenerRef.current = null;
    }

    if (!userId) return;

    // Watch both collections to cover web and mobile users.
    const unsubs = [];
    const watchCollection = (collectionName) => {
      const userDocRef = doc(db, collectionName, userId);
      const unsub = onSnapshot(userDocRef, (docSnapshot) => {
        if (!docSnapshot.exists()) return;
        const userData = docSnapshot.data();
        const status = String(userData.status || '').toLowerCase();

        // If user status is inactive/deleted, automatically logout.
        if (status === 'inactive' || status === 'deleted') {
          logout();
        }
      }, () => {
        // Don't logout on network errors - only on actual status changes
      });
      unsubs.push(unsub);
    };

    watchCollection('users');
    watchCollection('mobileUsers');
    userStatusListenerRef.current = () => {
      unsubs.forEach((u) => {
        try { u(); } catch (_) {}
      });
    };
  };

  // Function to clean up user status listener
  const cleanupUserStatusListener = () => {
    if (userStatusListenerRef.current) {
      userStatusListenerRef.current();
      userStatusListenerRef.current = null;
    }
  };

  // Ensure auth persistence is set before listeners/sign-in flows
  useEffect(() => {
    (async () => {
      try {
        await setPersistence(auth, indexedDBLocalPersistence);
      } catch (_) {
        try { await setPersistence(auth, browserLocalPersistence); } catch (_) {}
      }
    })();
  }, []);

  // Cross-tab authentication synchronization for Edge
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key && e.key.includes('firebase:authUser') && e.newValue) {
        // Another tab logged in, refresh auth state
        onAuthStateChanged(auth, async (user) => {
          if (user) {
            // Fetch Firestore user
            let data = null;
            try {
              let snap = await getDoc(doc(db, 'users', user.uid));
              if (snap.exists()) data = snap.data();
            } catch (e) { data = null; }
            const valid = (
              data &&
              String(data.status || '').toLowerCase() === 'active' &&
              data.phoneVerified === true &&
              user.emailVerified === true
            );
            if (valid) {
              setCurrentUser({
                ...data,
                uid: user.uid,
                email: user.email,
                emailVerified: user.emailVerified,
                phoneVerified: data.phoneVerified,
                status: data.status,
              });
            } else {
              setCurrentUser(null);
            }
          } else {
            setCurrentUser(null);
          }
          setLoading(false);
        });
      }
    };

    // Listen for storage changes (cross-tab communication)
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);


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

  // Phone verification functions
  const openPhoneVerificationModal = (phoneNumber, userId, userData) => {
    // Avoid opening multiple times (e.g., StrictMode double render or rapid calls)
    setPhoneVerificationModal(prev => {
      if (prev.open) return prev;
      return {
        open: true,
        phoneNumber,
        userId,
        userData
      };
    });
  };

  const closePhoneVerificationModal = () => {
    setPhoneVerificationModal({
      open: false,
      phoneNumber: '',
      userId: '',
      userData: null
    });
  };

  // Process email verification links (only updates Firestore if the Firebase action code was used)
  useEffect(() => {
    const processEmailVerificationLink = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const mode = params.get('mode');
        const oobCode = params.get('oobCode');
        if (mode === 'verifyEmail' && oobCode) {
          // Apply the verification code from Firebase. This marks the email as verified at the Auth level.
          await applyActionCode(auth, oobCode);
          // Reload user (if signed in) and persist to Firestore only if actually verified
          if (auth.currentUser) {
            try { await auth.currentUser.reload(); } catch (_) {}
            if (auth.currentUser.emailVerified) {
              try {
                await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                  emailVerified: true,
                  lastModified: serverTimestamp()
                });
              } catch (_) {}
              // Also reflect locally if we have state
              setCurrentUser(prev => (prev ? { ...prev, emailVerified: true } : prev));
            }
          }
          // Clean the query params from URL after processing
          const url = new URL(window.location.href);
          url.searchParams.delete('mode');
          url.searchParams.delete('oobCode');
          url.searchParams.delete('apiKey');
          window.history.replaceState({}, document.title, url.pathname + (url.search ? '?' + url.search : ''));
        }
      } catch (_) {
        // Silently ignore invalid/expired codes; UI can still prompt resend from Login
      }
    };
    processEmailVerificationLink();
  }, []);

  const handlePhoneVerificationSuccess = async (phoneAuthResult) => {
    try {
      const { userId, userData } = phoneVerificationModal;

      if (!userId) {
        throw new Error('Missing userId for phone verification.');
      }
      // Check if this is a test user (skip Firestore update for test)
      if (userId === 'test-user-id' || userId === 'real-test-user-id') {
        setCurrentUser(prev => ({ ...prev, phoneVerified: true }));
        closePhoneVerificationModal();
        return { success: true, message: 'Test phone verification successful!' };
      }
      // Update Firestore only if userId is present
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        phoneVerified: true,
        lastModified: serverTimestamp()
      });
      const updatedUserDoc = await getDoc(userRef);
      if (updatedUserDoc.exists()) {
        const updatedUserData = updatedUserDoc.data();
        setCurrentUser({
          uid: userId,
          email: userData.email || auth.currentUser?.email,
          username: updatedUserData.username,
          role: updatedUserData.role,
          profileImage: updatedUserData.profileImage || null,
          dateJoined: updatedUserData.dateJoined || new Date().toISOString().split('T')[0],
          emailVerified: true,
          status: updatedUserData.status,
          phoneVerified: true,
          address: updatedUserData.address || '',
          fullName: updatedUserData.fullName || '',
          contact: updatedUserData.contactNumber || '',
          farm: updatedUserData.farm || null
        });
      } else {
        setCurrentUser(prev => ({ ...prev, phoneVerified: true }));
      }
      closePhoneVerificationModal();
      await logActivity('phone_verification', 'Phone verified', userData.email);
      return { success: true };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error updating phone verification status:', error);
      }
      return { success: false, message: error.message || 'Failed to update phone verification status' };
    }
  };

  const resendVerificationEmail = async () => {
    try {
      // Cooldown to prevent rapid re-sends (client-side UX guard)
      const now = Date.now();
      if (now < resendVerificationCooldownUntilRef.current) {
        const secondsLeft = Math.ceil((resendVerificationCooldownUntilRef.current - now) / 1000);
        return { success: false, message: `Please wait ${secondsLeft}s before resending verification.` };
      }

      // If a user is currently signed in (e.g., TTO login was allowed), we can send directly
      if (auth.currentUser) {
        try {
          await auth.currentUser.reload();
        } catch (_) {}
        if (auth.currentUser.emailVerified) {
          return { success: false, message: 'Email is already verified' };
        }
        await sendEmailVerification(auth.currentUser, {
          url: window.location.origin + '/',
          handleCodeInApp: true
        });
        resendVerificationCooldownUntilRef.current = Date.now() + 90_000;
        return { success: true, message: 'Verification email sent! Please check your inbox (and spam folder).' };
      }

      if (!emailVerificationModal.email || !emailVerificationModal.tempPassword) {
        throw new Error('No credentials available for verification');
      }
      
      // Temporarily sign in to resend verification email
      const userCredential = await signInWithEmailAndPassword(
        auth,
        String(emailVerificationModal.email).trim(),
        String(emailVerificationModal.tempPassword).trim()
      );

      // Refresh user data and short-circuit if already verified
      try {
        await userCredential.user.reload();
      } catch (_) {}
      if (userCredential.user.emailVerified) {
        await signOut(auth);
        return { success: false, message: 'Email is already verified' };
      }

      try {
        await sendEmailVerification(userCredential.user, {
          url: window.location.origin + '/',
          handleCodeInApp: true
        });

        // Set 90s cooldown after a successful send
        resendVerificationCooldownUntilRef.current = Date.now() + 90_000;
        await signOut(auth);
        return { success: true, message: 'Verification email sent! Please check your inbox (and spam folder).' };
      } catch (error) {
        await signOut(auth);
        // Map common Firebase errors (SDK and REST) to friendly messages
        const code = error?.code || error?.response?.data?.error?.message || '';
        const map = {
          'auth/too-many-requests': 'Too many attempts. Please try again in a few minutes.',
          'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many attempts. Please try again in a few minutes.',
          'auth/user-not-found': 'User not found.',
          'EMAIL_NOT_FOUND': 'User not found.',
          'auth/wrong-password': 'Invalid credentials.',
          'INVALID_PASSWORD': 'Invalid credentials.',
          'auth/invalid-email': 'Invalid email address.',
          'INVALID_EMAIL': 'Invalid email address.',
          'INVALID_CONTINUE_URI': 'Return URL is invalid.',
          'DOMAIN_NOT_WHITELISTED': 'Return URL domain not authorized in Firebase Auth settings.'
        };
        const message = map[code] || 'Failed to send verification email. Please try again.';
        return { success: false, message };
      }
    } catch (e) {
      return { success: false, message: e.message };
    }
  };

  // OTP and authentication state
  const [requiresOTP, setRequiresOTP] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Phone verification state
  const [phoneVerificationModal, setPhoneVerificationModal] = useState({
    open: false,
    phoneNumber: '',
    userId: '',
    userData: null
  });

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
      // Auth state changed (silenced in production)
      
      if (suppressAuthUpdatesRef.current) {
        // Auth state change suppressed
        return;
      }
      
      if (isProcessingLoginRef.current) {
        // Login processing - skipping auth state change
        return;
      }
      
      // Clear logout flag when a user is detected (new login)
      if (user) {
        isLoggingOutRef.current = false;
        // User detected, cleared logout flag
      }
      
      // Enhanced cross-tab authentication detection for Edge
      const isEdge = /Edg/.test(navigator.userAgent);
      if (isEdge && user) {
        // Force reload user data in Edge to ensure proper cross-tab detection
        try {
          await user.reload();
        } catch (error) {
        }
      }
      
      // Only process login if we don't already have a current user
      if (user && !currentUserRef.current) {
        // Processing new login for user
        
        // Set a flag to prevent duplicate processing
        currentUserRef.current = { processing: true };
        
        // Reload user to get latest verification status
        await user.reload();

        // Try fetching from primary users collection first
        let userDoc = await getDoc(doc(db, 'users', user.uid));
        let userData = null;
        let collectionName = 'users';

        // If not found, try mobileUsers (e.g., fish farmers)
        if (!userDoc.exists()) {
          userDoc = await getDoc(doc(db, 'mobileUsers', user.uid));
          if (userDoc.exists()) {
            collectionName = 'mobileUsers';
          }
        }

        if (userDoc.exists()) {
          userData = userDoc.data();
          const statusLower = String(userData.status || '').toLowerCase();

          // Hard guard: deleted accounts are never allowed to keep a session
          if (statusLower === 'deleted') {
            try { await signOut(auth); } catch (_) {}
            setCurrentUser(null);
            currentUserRef.current = null;
            setRequiresOTP(false);
            setOtpSent(false);
            cleanupUserStatusListener();
            setLoading(false);
            return;
          }

          // Update Firestore with latest verification status in the correct collection
          try {
            await updateDoc(doc(db, collectionName, user.uid), {
              emailVerified: user.emailVerified,
              lastModified: serverTimestamp()
            });
          } catch (_) {}

          // Check if user needs OTP verification
          if (user.emailVerified && userData.status === 'active') {
            setRequiresOTP(true);
          }

          // Build robust currentUser payload with safe fallbacks
          const newCurrentUser = {
            uid: user.uid,
            email: userData.email || user.email,
            username: userData.username || user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
            role: userData.role,
            profileImage: userData.profileImage || null,
            dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
            emailVerified: user.emailVerified,
            status: userData.status,
            address: userData.address || '',
            fullName: userData.fullName || user.displayName || '',
            contact: userData.contactNumber || userData.contact || '',
            farm: userData.farm || userData.farmId || null,
            // TTO-specific fields
            temporaryTechOfficer: userData.temporaryTechOfficer || false,
            isTemporary: userData.isTemporary || false,
            effectiveFrom: userData.effectiveFrom || null,
            effectiveTo: userData.effectiveTo || null,
            tempTOReason: userData.tempTOReason || null,
            tempTORemarks: userData.tempTORemarks || null,
            // Additional fields that might be present
            adminActivated: userData.adminActivated || false,
            phoneVerified: userData.phoneVerified || false,
            pendingActivation: userData.pendingActivation || false,
            isMobileUser: userData.isMobileUser || false,
            createdAt: userData.createdAt || null,
            createdBy: userData.createdBy || null,
            lastModified: userData.lastModified || null,
            deactivatedBy: userData.deactivatedBy || null,
            deactivatedAt: userData.deactivatedAt || null,
            deactivationReason: userData.deactivationReason || null
          };
          setCurrentUser(newCurrentUser);
          currentUserRef.current = newCurrentUser;
          
          // Set up real-time monitoring of user status for automatic logout
          // Add delay for Edge browser to prevent race conditions
          const isEdge = /Edg/.test(navigator.userAgent);
          if (isEdge) {
            setTimeout(() => setupUserStatusListener(user.uid), 1000);
          } else {
            setupUserStatusListener(user.uid);
          }
          
          // Clear the processing flag after setting user data
          isProcessingLoginRef.current = false;
          
          // Login logging is now handled in Login.js to ensure proper username display
        }
      }
      
      if (!user && currentUserRef.current) {
        // Only process logout if we had a current user before
        setCurrentUser(null);
        currentUserRef.current = null;
        setRequiresOTP(false);
        setOtpSent(false);
        
        // Clean up user status listener
        cleanupUserStatusListener();
      }
      setLoading(false);
    });
    return () => {
      unsubscribe();
      cleanupUserStatusListener();
    };
  }, []);

  // Signup function (Farm Admin self-signup)
  const signup = async (email, username, contactNumber, farmId, password) => {
    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document in Firestore with Admin role and Inactive status
      const userData = sanitizeObjectStrings({
        email,
        username,
        contactNumber,
        farm: farmId, // Store as 'farm' to match the field name used in filtering
        dateJoined: new Date().toISOString().split('T')[0],
        profileImage: null,
        role: 'admin',
        status: 'inactive',
        emailVerified: false,
        createdBy: 'self',
        createdAt: serverTimestamp()
      });

      try {
        await setDoc(doc(db, 'users', user.uid), userData);
      } catch (e) {
        // Rollback auth user if Firestore write fails to avoid half-created accounts
        try { await user.delete(); } catch (_) {}
        throw e;
      }

      // Update profile with username
      await updateProfile(user, {
        displayName: username
      });

      // Immediately sign out and require admin activation before login
      try { await signOut(auth); } catch (_) {}

      // Log the registration
      logActivity('account', `New Admin registration: ${username}`, username);
      return { success: true, code: 'pending_activation' };
    } catch (error) {
      logActivity('error', logMessages.error.system(`Registration failed: ${error.message}`), username);
      throw error;
    }
  };

// Login function
const login = async (emailOrContact, password) => {
  try {
    const deletedAccountMessage = 'Account no longer available. Please contact the administrator.';
    // Basic client-side guards to avoid bad auth requests (prevents 400s)
    const rawEmailOrContact = String(emailOrContact || '').trim();
    const rawPassword = String(password || '').trim();

    if (!rawEmailOrContact || !rawPassword) {
      return { success: false, message: 'Please enter your email/contact and password.' };
    }
    if (rawEmailOrContact.includes('@')) {
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(rawEmailOrContact)) {
        return { success: false, message: 'Please enter a valid email address.' };
      }
    }
    if (rawPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
    }

    // Clear logout flag since user is actively trying to log in
    isLoggingOutRef.current = false;
    
    let email = rawEmailOrContact;
    let userData = null;
    let collectionName = 'users';

    // If input is not an email (doesn't contain @), treat it as contact number
    if (!rawEmailOrContact.includes('@')) {
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
      
      // Check if account is deleted/suspended (always block)
      const preAuthStatus = String(userData?.status || '').toLowerCase();
      if (preAuthStatus === 'deleted') {
        return {
          success: false,
          message: deletedAccountMessage
        };
      }
      if (preAuthStatus === 'suspended') {
        return {
          success: false,
          message: "Your account has been suspended. Please contact support for assistance."
        };
      }
      
      // Require activation: Admins must be set Active by Super Admin; others need adminActivated flag
      const roleLower = String(userData.role || '').toLowerCase();
      const isAdminActivated = roleLower === 'admin'
        ? String(userData.status || '').toLowerCase() === 'active'
        : !!userData.adminActivated;
      
      if (!isAdminActivated) {
        return { 
          success: false, 
          message: "Your account is pending tech officer approval. Please wait for activation." 
        };
      }
      
      // If adminActivated is true, allow the login to proceed to Firebase Auth
      // We'll check email verification after successful Firebase Auth login
      
      // When logging in with phone number, use the email from Firestore
      // But if email was changed, Firebase Auth still has the old email
      // We'll try the new email first, and if it fails, we'll handle it in the catch block
      email = userData.email;
    } else {
      // If input is an email, we need to check adminActivated before proceeding
      // Query both collections to find user with this email
      const usersRef = collection(db, 'users');
      const mobileUsersRef = collection(db, 'mobileUsers');
      
      // Check users collection first
      let q = query(usersRef, where('email', '==', rawEmailOrContact));
      let querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        // Check mobileUsers collection
        q = query(mobileUsersRef, where('email', '==', rawEmailOrContact));
        querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          collectionName = 'mobileUsers';
        }
      }
      
      // If not found by email, don't block yet; we'll try Firebase Auth and then fetch by UID
      if (!querySnapshot.empty) {
        // Get the user data from the document
        const userDoc = querySnapshot.docs[0];
        userData = userDoc.data();
      }
      
      // Check if account is deleted/suspended (always block)
      const preAuthStatus = String(userData?.status || '').toLowerCase();
      if (preAuthStatus === 'deleted') {
        return {
          success: false,
          message: deletedAccountMessage
        };
      }
      if (preAuthStatus === 'suspended') {
        return {
          success: false,
          message: "Your account has been suspended. Please contact support for assistance."
        };
      }
      
      // Require activation: Admins must be set Active by Super Admin; others need adminActivated flag
      const roleLower = String(userData.role || '').toLowerCase();
      const isAdminActivated = roleLower === 'admin'
        ? String(userData.status || '').toLowerCase() === 'active'
        : !!userData.adminActivated;
      
      if (!isAdminActivated) {
        return { 
          success: false, 
          message: "Your account is pending tech officer approval. Please wait for activation." 
        };
      }
      
      // If adminActivated is true, allow the login to proceed to Firebase Auth
      // We'll check email verification after successful Firebase Auth login
    }

    // Ensure durable persistence for this sign-in
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
    } catch (_) {
      try { await setPersistence(auth, browserLocalPersistence); } catch (_) {}
    }
    
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, email, rawPassword);
    } catch (loginError) {
      
      // If login fails and we're logging in with phone number, the email might have changed
      // Firebase Auth still has the old email, so we need to try the old email (previousEmail)
      if (!rawEmailOrContact.includes('@') && userData && 
          (loginError.code === 'auth/user-not-found' || loginError.code === 'auth/invalid-credential')) {
        
        // Try to login with the old email (previousEmail) if it exists
        if (userData.previousEmail) {
          try {
            userCredential = await signInWithEmailAndPassword(auth, userData.previousEmail, rawPassword);
            // If successful, update email to use the old email for the rest of the login flow
            email = userData.previousEmail;
          } catch (retryError) {
            // If old email also fails, throw the original error
            throw loginError;
          }
        } else {
          // No previous email stored, throw the original error
          // But provide a more helpful error message
          throw new Error('Your email was recently changed but the old email is not available for login. Please verify your new email address or contact support for assistance.');
        }
      } else {
        throw loginError;
      }
    }
    
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
      if (String(userData.status || '').toLowerCase() === 'deleted') {
        await signOut(auth);
        return {
          success: false,
          message: deletedAccountMessage
        };
      }

      // Check if email in Firestore matches email in Firebase Auth
      // If they don't match, user changed email but hasn't verified it yet
      const firestoreEmail = String(userData.email || '').trim().toLowerCase();
      const authEmail = String(userCredential.user.email || '').trim().toLowerCase();
      const emailsMatch = firestoreEmail !== '' && firestoreEmail === authEmail;
    
      
      // Step 1: If email is not verified, trigger email verification modal flow
      // BUT: Skip this check if emails don't match (user changed email - allow login with phone)
      if (emailsMatch && !userCredential.user.emailVerified) {
        await signOut(auth);
        return {
          success: false,
          code: 'show_verification_modal',
          email: email,
          password: password,
          message: ''
        };
      }
      
      // Ensure Firestore reflects latest emailVerified status on every successful login
      // Only update if emails match (normal case)
      if (emailsMatch) {
        try {
          const targetRef = doc(db, collectionName, userCredential.user.uid);
          await updateDoc(targetRef, {
            emailVerified: !!userCredential.user.emailVerified,
            lastModified: serverTimestamp()
          });
        } catch (_) {}
      }

      // BLOCK LOGIN if not all requirements are met:
      const statusLowerLoginCheck = String(userData.status || '').toLowerCase();
      
      // If emails don't match, user changed email but hasn't verified new one
      // In this case, allow login with phone number only (ignore email verification requirement)
      // If emails match, require both email and phone verification (normal case)
      const emailVerifiedLoginCheck = emailsMatch 
        ? !!userCredential.user.emailVerified 
        : true; // Allow login if email was changed (will be verified later)
      
      const phoneVerifiedLoginCheck = !!userData.phoneVerified;
      
      // If emails don't match (email changed), only require phone verification
      // If emails match (normal case), require both email and phone verification
      const loginRequirementsMet = emailsMatch
        ? (emailVerifiedLoginCheck && phoneVerifiedLoginCheck) // Normal case: both required
        : phoneVerifiedLoginCheck; // Email changed: only phone required
    
      
      if (statusLowerLoginCheck !== 'active' || !loginRequirementsMet) {
        if (statusLowerLoginCheck === 'deleted') {
          await signOut(auth);
          return { success: false, message: deletedAccountMessage };
        }
        // If email is verified but phone is not, trigger OTP modal instead of generic error
        if (statusLowerLoginCheck === 'active' && emailVerifiedLoginCheck && !phoneVerifiedLoginCheck) {
          await signOut(auth);
          // Build normalized +63 phone number for modal
          let phoneNumber = null;
          if (userData.contactNumber) {
            let cleanNumber = userData.contactNumber.replace(/\s/g, '');
            if (cleanNumber.startsWith('+63')) cleanNumber = cleanNumber.substring(3);
            if (cleanNumber.length === 10) phoneNumber = `+63${cleanNumber}`;
            else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) phoneNumber = `+63${cleanNumber.substring(1)}`;
            else phoneNumber = `+63${cleanNumber}`;
          }
          return {
            success: false,
            code: 'show_phone_verification',
            phoneNumber,
            userId: userCredential.user.uid,
            userData,
            message: 'Please verify your phone number to complete login'
          };
        }
        await signOut(auth);
        let errorMsg = 'Login failed: ';
        if (statusLowerLoginCheck !== 'active') errorMsg += 'Your account is not active. ';
        if (emailsMatch) {
          // Normal case: both email and phone must be verified
          if (!emailVerifiedLoginCheck) errorMsg += 'Please verify your email address before logging in. ';
          if (!phoneVerifiedLoginCheck) errorMsg += 'Please verify your phone number before logging in.';
        } else {
          // Email changed: only phone required
          if (!phoneVerifiedLoginCheck) errorMsg += 'Please verify your phone number before logging in.';
        }
        return { success: false, message: errorMsg.trim() };
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

      // When a New Main Tech Officer logs in, deactivate any existing active Tech Officer
      if (roleLower === 'new_main_tech_officer' || roleLower === 'new main tech officer') {
        try {
          const usersRef = collection(db, 'users');
          // Fetch all active users, then filter client-side for Tech Officer role variants
          const activeUsersSnap = await getDocs(query(usersRef, where('status', '==', 'Active')));
          const updates = [];
          activeUsersSnap.forEach((docSnap) => {
            const data = docSnap.data();
            const r = String(data.role || '').toLowerCase();
            const isTechOfficer = r === 'tech_officer' || r === 'tech officer';
            const isSameUser = docSnap.id === userCredential.user.uid;
            if (isTechOfficer && !isSameUser) {
              updates.push(updateDoc(doc(db, 'users', docSnap.id), {
                status: 'Inactive',
                temporarilyInactiveDueToReplacement: true,
                lastModified: serverTimestamp()
              }));
            }
          });
          if (updates.length) {
            await Promise.allSettled(updates);
          }
        } catch (_) {
          // Silently ignore deactivation errors to not block login
        }
      }

      // Check for Temporary Tech Officer restriction for main Tech Officers
      if ((roleLower === 'tech_officer' || roleLower === 'tech officer') && !userData.temporaryTechOfficer) {
        try {
          // Check if there's an active Temporary Tech Officer
          const usersRef = collection(db, 'users');
          const activeTTOQuery = query(
            usersRef, 
            where('temporaryTechOfficer', '==', true),
            where('status', '==', 'Active')
          );
          const ttoSnapshot = await getDocs(activeTTOQuery);
          
          if (!ttoSnapshot.empty) {
            const activeTTO = ttoSnapshot.docs[0].data();
            const effectiveTo = activeTTO.effectiveTo;
            
            // Allow main tech officer to login for monitoring purposes
            // Only show a warning message instead of blocking login
            if (effectiveTo) {
              const expirationDate = new Date(effectiveTo);
              const expirationString = expirationDate.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });
              
              // Set a flag to show monitoring mode message
              userData.monitoringMode = true;
              userData.tempTOExpiration = expirationString;
            }
          }
          
          // Fallback check: If the main Tech Officer has hasActiveTempReplacement flag,
          // it means there should be an active TTO, so we should allow login but show monitoring mode
          if (userData.hasActiveTempReplacement && userData.temporaryReplacementReason) {
            const effectiveTo = userData.temporaryEffectiveTo;
            if (effectiveTo) {
              const expirationDate = new Date(effectiveTo);
              const expirationString = expirationDate.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });
              
              // Set monitoring mode instead of blocking login
              userData.monitoringMode = true;
              userData.tempTOExpiration = expirationString;
            }
          }
        } catch (error) {
          // Continue with login if check fails
        }
      }

      // Check if account is deactivated (block inactive accounts) - but only after TTO check
      if (String(userData.status || '').toLowerCase() === 'inactive') {
        await signOut(auth);
        
        // Check if this is a Tech Officer who was replaced by a new Tech Officer
        const roleLower = String(userData.role || '').toLowerCase();
        const isTechOfficer = roleLower === 'tech_officer' || roleLower === 'tech officer';
        const wasReplaced = userData.temporarilyInactiveDueToReplacement === true;
        
        if (isTechOfficer && wasReplaced) {
          return {
            success: false,
            message: "Your Tech Officer account has been deactivated because a new Tech Officer has been assigned. Please contact the Tech Officer for more information."
          };
        }
        
        return {
          success: false,
          message: "This account has been deactivated by the Tech Officer. Access is no longer available."
        };
      }

      // For existing users, if email not verified: trigger verification flow instead of plain error
      if (!userCredential.user.emailVerified) {
        // Do not auto-send verification; require explicit user action from Login
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

      // Check phone verification status after email verification
      if (userCredential.user.emailVerified && !userData.phoneVerified) {
        // Sign out the user temporarily
        await signOut(auth);
        
        // Return a special code to trigger phone verification
        // Format phone number properly (remove spaces, ensure +63 prefix)
        let phoneNumber = null;
        if (userData.contactNumber) {
          let cleanNumber = userData.contactNumber.replace(/\s/g, '');
          
          // Remove any existing +63 prefix to avoid duplication
          if (cleanNumber.startsWith('+63')) {
            cleanNumber = cleanNumber.substring(3);
          }
          
          // Ensure it's 10 digits for Philippine numbers
          if (cleanNumber.length === 10) {
            phoneNumber = `+63${cleanNumber}`;
          } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
            // Remove leading 0 if present
            phoneNumber = `+63${cleanNumber.substring(1)}`;
          } else {
            phoneNumber = `+63${cleanNumber}`;
          }
        }
        
        return {
          success: false,
          code: 'show_phone_verification',
          phoneNumber: phoneNumber,
          userId: userCredential.user.uid,
          userData: userData,
          message: 'Please verify your phone number to complete login'
        };
      }
    }
    
    // Get user data for logging
    let username = 'Unknown User';
    if (userData) {
      username = userData.username || userData.email || 'Unknown User';
    }
    
    // Set flag to prevent auth state change handler from running
    isProcessingLoginRef.current = true;
    
    // Check if email in Firestore matches email in Firebase Auth
    // If they don't match, use Firestore's emailVerified status (for pending email change)
    const firestoreEmailForUser = String(userData.email || '').trim().toLowerCase();
    const authEmailForUser = String(userCredential.user.email || '').trim().toLowerCase();
    const emailsMatchForUser = firestoreEmailForUser !== '' && firestoreEmailForUser === authEmailForUser;
    
    // Use Firestore's emailVerified if emails don't match (pending email change)
    // Otherwise use Firebase Auth's emailVerified
    const finalEmailVerified = emailsMatchForUser
      ? userCredential.user.emailVerified
      : (userData.emailVerified === true);
    
    // Build the complete user object with all data
    const completeUserData = {
      uid: userCredential.user.uid,
      email: userData.email || userCredential.user.email,
      username: userData.username || userCredential.user.displayName || (userCredential.user.email ? userCredential.user.email.split('@')[0] : 'User'),
      role: userData.role,
      profileImage: userData.profileImage || null,
      dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
      emailVerified: finalEmailVerified,
      status: userData.status,
      address: userData.address || '',
      fullName: userData.fullName || userCredential.user.displayName || '',
      contact: userData.contactNumber || userData.contact || '',
      farm: userData.farm || userData.farmId || null,
      // TTO-specific fields
      temporaryTechOfficer: userData.temporaryTechOfficer || false,
      isTemporary: userData.isTemporary || false,
      effectiveFrom: userData.effectiveFrom || null,
      effectiveTo: userData.effectiveTo || null,
      tempTOReason: userData.tempTOReason || null,
      tempTORemarks: userData.tempTORemarks || null,
      // Additional fields that might be present
      adminActivated: userData.adminActivated || false,
      phoneVerified: userData.phoneVerified || false,
      pendingActivation: userData.pendingActivation || false,
      isMobileUser: userData.isMobileUser || false,
      createdAt: userData.createdAt || null,
      createdBy: userData.createdBy || null,
      lastModified: userData.lastModified || null,
      deactivatedBy: userData.deactivatedBy || null,
      deactivatedAt: userData.deactivatedAt || null,
      deactivationReason: userData.deactivationReason || null
    };
    
    // Set the current user with complete data
    setCurrentUser(completeUserData);
    currentUserRef.current = completeUserData;
    
    
    // Clear the processing flag immediately since we've set the user data
    isProcessingLoginRef.current = false;
    
    
    // Log login success with proper role identification
    if (isTemporaryTechOfficer(userData)) {
      try {
        await logTemporaryTechOfficerActivity(
          'temporaryTechOfficer',
          logMessages.temporaryTechOfficer.login(username),
          username,
          userData.role || 'temp_tech_officer'
        );
      } catch (_) {}
    } else {
      try {
        await logActivity('login', logMessages.login.success(username), username, null, userData.role);
      } catch (_) {}
    }
    
    return { success: true, user: userCredential.user, username: username };
  } catch (error) {
    // Map internal/null-status errors to a user‑friendly message
    if (error && typeof error.message === 'string' &&
        error.message.includes('Cannot read properties of null') &&
        error.message.includes('status')) {
      return {
        success: false,
        message: "We had trouble loading your account details. Please try logging in again. If the issue continues, use your phone number or contact tech officer."
      };
    }
    
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
    // Capture user info at the very beginning before any state changes
    const username = currentUser?.username || auth.currentUser?.email || 'Unknown';
    const userData = currentUser;
    
    
    try {
      // Log logout attempt with proper role identification
      if (isTemporaryTechOfficer(userData)) {
        try { 
          await logTemporaryTechOfficerActivity(
            'temporaryTechOfficer',
            logMessages.temporaryTechOfficer.logout(username),
            username,
            userData?.role || 'temp_tech_officer'
          ); 
        } catch (_) {}
      } else {
        try { logActivity('logout', logMessages.logout.logoutAttempt(username), username); } catch (_) {}
      }
      
      // 1. Suppress auth state changes during logout
      suppressAuthUpdatesRef.current = true;
      isLoggingOutRef.current = true;
      isProcessingLoginRef.current = false; // Reset login processing flag
      
      // 2. Clear state first to prevent redirects
      setCurrentUser(null);
      currentUserRef.current = null;
      setRequiresOTP(false);
      setOtpSent(false);
      
      // Clean up user status listener
      cleanupUserStatusListener();
      
      // 3. Clear all storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear cookies
      document.cookie.split(';').forEach(cookie => {
        const [name] = cookie.split('=');
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      });
  
      // 4. Service worker cleanup
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      }
      
      // 5. Sign out from Firebase last
      await signOut(auth);
      
      // 6. Re-enable auth state changes
      suppressAuthUpdatesRef.current = false;
      // Set loading to false to prevent "Loading session..." from showing after logout
      setLoading(false);
      // Keep isLoggingOutRef active until we have a real login
      // isLoggingOutRef will be cleared in the auth state listener when login is processed
      
      // Log successful logout with proper role identification
      if (isTemporaryTechOfficer(userData)) {
        try { 
          await logTemporaryTechOfficerActivity(
            'temporaryTechOfficer',
            logMessages.temporaryTechOfficer.logout(username),
            username,
            userData?.role || 'temp_tech_officer'
          ); 
        } catch (_) {}
      } else {
        try { logActivity('logout', logMessages.logout.success(username), username); } catch (_) {}
      }
      
    } catch (error) {
      try { logActivity('logout', logMessages.logout.logoutError(username, error.message), username); } catch (_) {}
      // Ensure we still clear state even if there's an error
      setCurrentUser(null);
      currentUserRef.current = null;
      setRequiresOTP(false);
      setOtpSent(false);
      
      // Clean up user status listener
      cleanupUserStatusListener();
      localStorage.clear();
      sessionStorage.clear();
      suppressAuthUpdatesRef.current = false;
      isLoggingOutRef.current = false;
      // Set loading to false even on error to prevent stuck loading screen
      setLoading(false);
    }
  };

  // Enhanced handleLogout function that can be used across components
  const handleLogout = async (navigate) => {
    // Capture user info at the very beginning before any state changes
    const username = currentUser?.username || auth.currentUser?.email || 'Unknown';
    
    try {
      // Call the main logout function
      await logout();
      
      // Use React Router navigation - this will trigger the ProtectedRoute redirect
      if (navigate && typeof navigate === 'function') {
        navigate('/', { replace: true });
      }
      
    } catch (error) {
      try { logActivity('logout', logMessages.logout.logoutError(username, error.message), username); } catch (_) {}
      
      // Fallback navigation
      if (navigate && typeof navigate === 'function') {
        navigate('/', { replace: true });
      }
    }
  };

  // Global navigation guard to prevent back navigation after logout
  useEffect(() => {
    const handlePopState = (e) => {
      // Check current user state at the time of the event
      if (!auth.currentUser) {
        // Only prevent back navigation if we're not on the login page
        if (window.location.pathname !== '/') {
          window.history.replaceState(null, '', '/');
        }
      }
    };

    // Add event listener for back/forward navigation only
    window.addEventListener('popstate', handlePopState);

    // Cleanup
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

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

      logActivity('account', `Verification email sent to ${newEmail}`, currentUser?.username || 'Unknown');
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
      // Handle token expiration gracefully
      let reloadSuccess = false;
      try {
        await auth.currentUser.reload();
        reloadSuccess = true;
      } catch (reloadError) {
        // If token expired, we'll use Firestore data instead
        if (reloadError.code === 'auth/user-token-expired') {
          // Continue with Firestore data - we'll check if email matches and use Firestore's emailVerified
        } else {
          // For other errors, rethrow
          throw reloadError;
        }
      }

      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.exists() ? (userDoc.data() || {}) : {};

      const firestoreEmail = String(userData.email || '').trim().toLowerCase();
      const authEmail = String(auth.currentUser.email || '').trim().toLowerCase();
      const emailsMatch = firestoreEmail !== '' && firestoreEmail === authEmail;

      if (!emailsMatch) {
        // Emails don't match - this means user changed their email
        // If token expired, check if there's a previousEmail (indicating email change in progress)
        if (!reloadSuccess) {
          // Token expired - check if email change is in progress
          // If previousEmail exists, it means email was changed but not verified yet
          if (userData.previousEmail) {
            setCurrentUser(prev => (prev ? { ...prev, emailVerified: false } : prev));
            return false;
          }
          // No previousEmail - use Firestore's emailVerified status
          const firestoreVerified = !!userData.emailVerified;
          setCurrentUser(prev => (prev ? { ...prev, emailVerified: firestoreVerified } : prev));
          return firestoreVerified;
        }
        
        // When emails don't match, it means user changed their email
        // Firebase Auth still has the old email until the new email is verified
        // So auth.currentUser.emailVerified is the status of the OLD email, not the new email
        // We should check if Firebase Auth email matches Firestore email (which means new email is verified)
        // OR check if auth.currentUser.email matches the Firestore email (which means Firebase Auth was updated)
        
        // Check if Firebase Auth has been updated with the new email (which happens after verification)
        // If authEmail matches firestoreEmail, then the new email is verified
        // But wait, if emails don't match, authEmail is the old email, so we can't use this
        
        // Actually, when verifyBeforeUpdateEmail is used, Firebase Auth doesn't update the email until verified
        // So if emails don't match, it means the new email is NOT verified yet
        // We should always return false when emails don't match, unless we can verify otherwise
        
        // However, there's a case where Firebase Auth might have the new email but Firestore hasn't synced
        // In that case, auth.currentUser.email would match firestoreEmail, so emailsMatch would be true
        // So if we're here (emails don't match), it means Firebase Auth still has the old email
        // Therefore, the new email is NOT verified yet
        
        // Always return false when emails don't match (email change in progress)
        // Make sure Firestore and local state stay unverified
        if (userDoc.exists() && userData.emailVerified !== false) {
          try {
            await updateDoc(userDocRef, {
              emailVerified: false,
              lastModified: serverTimestamp()
            });
          } catch (_) {}
        }

        setCurrentUser(prev => (prev ? { ...prev, emailVerified: false } : prev));
        return false;
      }

      // Emails match – safe to sync verification status
      // If token expired, use Firestore's emailVerified status
      if (!reloadSuccess) {
        // Token expired - use Firestore's emailVerified status
        const firestoreVerified = !!userData.emailVerified;
        setCurrentUser(prev => (prev ? { ...prev, emailVerified: firestoreVerified } : prev));
        return firestoreVerified;
      }

      // Token is valid - sync verification status from Firebase Auth
      await updateDoc(userDocRef, {
        emailVerified: auth.currentUser.emailVerified,
        lastModified: serverTimestamp()
      });

      if (userData.status === 'inactive' && auth.currentUser.emailVerified) {
        const canActivate = (userData.role === 'admin') || (userData.role === 'tech_officer' && userData.adminActivated);
        if (canActivate) {
          await updateDoc(userDocRef, {
            status: 'active',
            lastModified: serverTimestamp()
          });

          setCurrentUser(prev => ({
            ...prev,
            emailVerified: auth.currentUser.emailVerified,
            status: 'active'
          }));
        } else {
          setCurrentUser(prev => ({
            ...prev,
            emailVerified: auth.currentUser.emailVerified
          }));
        }
      } else {
        setCurrentUser(prev => ({
          ...prev,
          emailVerified: auth.currentUser.emailVerified
        }));
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
      
      logActivity('account', logMessages.account.passwordChanged(currentUser?.username || 'Unknown'), currentUser?.username || 'Unknown');
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

      const normalizedUsername = String(userData?.username || '').trim();
      if (!normalizedUsername) {
        throw new Error('Username is required');
      }

      // Block duplicate usernames across both collections (case-insensitive).
      // This keeps username identity unique even when roles/collections differ.
      const usernameLower = normalizedUsername.toLowerCase();
      const [usersSnap, mobileUsersSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'mobileUsers'))
      ]);
      const usernameTaken = [...usersSnap.docs, ...mobileUsersSnap.docs].some((userDoc) => {
        const existing = String(userDoc.data()?.username || '').trim().toLowerCase();
        return existing && existing === usernameLower;
      });
      if (usernameTaken) {
        throw new Error('Username already exists in system');
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
      const isTempTO = (
        userData?.temporaryTechOfficer === true ||
        userData?.isTemporary === true ||
        String(requestedRole || '').toLowerCase() === 'temporary tech officer' ||
        String(requestedRole || '').toLowerCase() === 'temp_tech_officer'
      );
      const canonicalStatus = String(
        userData.status || (
          (requestedRole === 'Admin' || requestedRole === 'Tech Officer' || requestedRole === 'Temporary Tech Officer' || requestedRole === 'Fish Farmer')
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
      } else if (requestedRole === 'Tech Officer' || String(requestedRole || '').toLowerCase() === 'tech_officer') {
        targetCollection = 'users';
        canonicalRole = 'tech_officer';
      } else if (requestedRole === 'Temporary Tech Officer' || String(requestedRole || '').toLowerCase() === 'temp_tech_officer') {
        targetCollection = 'users';
        canonicalRole = 'temp_tech_officer';
      } else if (requestedRole === 'Fish Farmer') {
        // Fish Farmers belong to mobileUsers
        targetCollection = 'mobileUsers';
        canonicalRole = 'fish_farmer';
        isMobileUser = true;
      }

      // Write document matching required field sets per role
      if (isTempTO) {
        // Temporary Tech Officer schema
        await setDoc(doc(db, targetCollection, newUserUid), sanitizeObjectStrings({
          // Common
          email: userData.email,
          username: normalizedUsername,
          role: canonicalRole,
          status: canonicalStatus,
          createdAt: serverTimestamp(),
          createdBy: adminUID,
          address: userData.address || '',
          contactNumber: userData.contactNumber || '',
          dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
          fullName: userData.fullName || '',
          profileImage: userData.profileImage || null,
          isMobileUser,
          // Activation flags
          adminActivated: false,
          emailVerified: false,
          phoneVerified: false,
          // Timestamps/last modified
          lastModified: serverTimestamp(),
          activatedAt: null,
          activatedBy: null,
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
          // TTO specifics
          temporaryTechOfficer: true,
          isTemporary: true,
          effectiveFrom: userData.effectiveFrom || null,
          effectiveTo: userData.effectiveTo || null,
          tempTOReason: userData.tempTOReason || null,
          tempTORemarks: userData.tempTORemarks || null
        }));
      } else {
        // Standard staff schema (Admin, Tech Officer, Fish Farmer)
        await setDoc(doc(db, targetCollection, newUserUid), sanitizeObjectStrings({
          address: userData.address || '',
          adminActivated: (requestedRole === 'Admin') ? true : false,
          contactNumber: userData.contactNumber || '',
          createdAt: serverTimestamp(),
          createdBy: adminUID,
          dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
          email: userData.email,
          emailVerified: false,
          farm: userData.farm || null,
          fullName: userData.fullName || '',
          isMobileUser,
          profileImage: userData.profileImage || null,
          role: canonicalRole,
          status: canonicalStatus,
          username: normalizedUsername
        }));
      }

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
      // Check users collection first
      let docRef = doc(db, 'users', auth.currentUser.uid);
      let docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const userData = docSnap.data();
        const role = String(userData.role || '').toLowerCase();
        const isTemporaryTechOfficer = userData.temporaryTechOfficer === true;
        
        // Check if user has admin privileges (can manage users)
        const hasAdminPrivileges = (
          role === "admin" ||
          role === "tech_officer" ||
          role === "new_main_tech_officer" ||
          role === "temp_tech_officer" ||
          isTemporaryTechOfficer
        );
        
        return hasAdminPrivileges;
      }
      
      // If not found in users, check mobileUsers collection
      docRef = doc(db, 'mobileUsers', auth.currentUser.uid);
      docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const userData = docSnap.data();
        const role = String(userData.role || '').toLowerCase();
        const isTemporaryTechOfficer = userData.temporaryTechOfficer === true;
        
        // Check if user has admin privileges (can manage users)
        const hasAdminPrivileges = (
          role === "admin" ||
          role === "tech_officer" ||
          role === "new_main_tech_officer" ||
          role === "temp_tech_officer" ||
          isTemporaryTechOfficer
        );
        
        return hasAdminPrivileges;
      }
      
      return false;
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
      await updateDoc(doc(db, 'users', currentUser.uid), sanitizeObjectStrings(updatedUserData));

      // Update local state
      setCurrentUser(prev => ({
        ...prev,
        ...sanitizeObjectStrings(updatedUserData)
      }));

      return true;
    } catch (error) {

      throw error;
    }
  };

  // Stubs to avoid runtime errors if UI references Google auth helpers
  const signInWithGoogle = async () => {
    return { success: false, message: 'Google sign-in is currently disabled.' };
  };
  const signUpWithGoogle = async () => {
    return { success: false, message: 'Google sign-up is currently disabled.' };
  };
  const handleGoogleRedirectResult = async () => {
    return null;
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
          email: userData.email || auth.currentUser.email,
          username: userData.username,
          role: userData.role,
          profileImage: userData.profileImage || null,
          dateJoined: userData.dateJoined || new Date().toISOString().split('T')[0],
          emailVerified: (userData.emailVerified !== undefined ? userData.emailVerified : auth.currentUser.emailVerified),
          phoneVerified: (userData.phoneVerified !== undefined ? userData.phoneVerified : false),
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
    signUpWithGoogle,
    handleGoogleRedirectResult,

    isHandlingRedirect,
    // email verification modal controls
    emailVerificationModal,
    // login processing flag
    isProcessingLoginRef,
    isLoggingOutRef,
    openEmailVerificationModal,
    resendVerificationEmail,
    closeEmailVerificationModal,
    // phone verification modal controls
    phoneVerificationModal,
    openPhoneVerificationModal,
    closePhoneVerificationModal,
    handlePhoneVerificationSuccess,
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
    verifyOTP,
    // Helper: check if a temporary tech officer is within their effective period
    isTempTechOfficerWithinEffectivePeriod: (user) => {
      if (!user || !user.temporaryTechOfficer) return false;
      const from = user.effectiveFrom ? new Date(user.effectiveFrom) : null;
      const to = user.effectiveTo ? new Date(user.effectiveTo) : null;
      const today = new Date();
      const startOk = from ? today >= new Date(from.getFullYear(), from.getMonth(), from.getDate()) : true;
      const endOk = to ? today <= new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : true;
      return startOk && endOk;
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: '#0b132b',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 40,
              height: 40,
              margin: '0 auto 12px',
              border: '4px solid rgba(255,255,255,0.25)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'pisca-spin 0.9s linear infinite'
            }} />
            <div>Loading your session…</div>
            <style>{`@keyframes pisca-spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
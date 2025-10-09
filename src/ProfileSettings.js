import React, { useState, useRef, useContext, useEffect } from "react";
import logo from "./assets/images/PISCARISK_LOGO.png";
import "./ProfileSettings.css";
import { AuthContext } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { FaCamera, FaUpload, FaTimes, FaCheck,FaUserCircle, FaUser, FaSignOutAlt, FaBars } from "react-icons/fa";
import { LiaEdit } from "react-icons/lia";
import { useNavigate } from "react-router-dom";
import { logActivity, logMessages } from './utils/logger';
import NotificationBox from './components/NotificationBox';
import Sidebar from './components/Sidebar';
import { doc, updateDoc,serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';
import { sendPasswordResetEmail, updateEmail as fbUpdateEmail, sendEmailVerification as fbSendEmailVerification } from 'firebase/auth';


export default function AccountSettings() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [tempProfileImage, setTempProfileImage] = useState(null); // For preview before confirmation
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showRemoveButton, setShowRemoveButton] = useState(false);
  const [showEmailChangeForm, setShowEmailChangeForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [showUsernameChangeForm, setShowUsernameChangeForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [showUsernameOptions, setShowUsernameOptions] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [verificationCheckInterval, setVerificationCheckInterval] = useState(null);
  const hasShownVerifySuccessRef = useRef(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [showEmailVerifyNotice, setShowEmailVerifyNotice] = useState(false);
  const mountedRef = useRef(true);
  const pendingTimersRef = useRef([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingTimersRef.current.forEach(id => clearTimeout(id));
      pendingTimersRef.current = [];
    };
  }, []);

  const safeSetTimeout = (fn, ms) => {
    const id = setTimeout(() => {
      if (!mountedRef.current) return;
      fn();
    }, ms);
    pendingTimersRef.current.push(id);
  };
  
  // Form state variables
  const [showFullNameChangeForm, setShowFullNameChangeForm] = useState(false);
  const [showAddressChangeForm, setShowAddressChangeForm] = useState(false);
  const [showContactChangeForm, setShowContactChangeForm] = useState(false);
  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);
  const [showProfileImageModal, setShowProfileImageModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newContact, setNewContact] = useState('');
  const [fullNameError, setFullNameError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [contactError, setContactError] = useState('');
  
  const {handleLogout, refreshCurrentUser } = useContext(AuthContext);

  const { 
    currentUser,
    changePassword, 
    updateProfileImage,
    sendVerificationEmail,
    checkEmailVerification 
  } = useContext(AuthContext);
  const [profileImage, setProfileImage] = useState(currentUser?.profileImage || null);
  
  // Sync local profileImage state with currentUser changes
  useEffect(() => {
    setProfileImage(currentUser?.profileImage || null);
  }, [currentUser?.profileImage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (error) setError('');
      if (success) setSuccess('');
    }, 4000);
    
    return () => clearTimeout(timer);
  }, [error, success]);
  

  
// Function to convert file to base64
const uploadImage = (file) => {
  return new Promise((resolve, reject) => {
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error(t('profileSettings.fileSizeTooLarge')));
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      reject(new Error(t('profileSettings.fileMustBeImage')));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    reader.onerror = (error) => {
      reject(new Error(t('profileSettings.errorReadingFile')));
    };
    reader.readAsDataURL(file);
  });
};

  const handleUsernameChange = () => {
    if (!newUsername.trim()) {
      setUsernameError(t('profileSettings.usernameCannotBeEmpty'));
      return;
    }
    
    // Check if the value actually changed
    if (newUsername === currentUser?.username) {
      setShowUsernameChangeForm(false);
      setNewUsername('');
      setUsernameError('');
      return; // No changes, just close editing mode
    }
    
    // Just close editing mode - changes will be saved when Save Changes is clicked
    setShowUsernameChangeForm(false);
    setUsernameError('');
  };

  const handleFullNameChange = async () => {
    if (!newFullName.trim()) {
      setFullNameError(t('profileSettings.fullNameCannotBeEmpty'));
      return;
    }
    
    // Check if the value actually changed
    if (newFullName === currentUser?.fullName) {
      setShowFullNameChangeForm(false);
      setNewFullName('');
      setFullNameError('');
      return; // No changes, just close editing mode
    }
    
    try {
      // Update in Firestore directly in main user document
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        fullName: newFullName
      });
      
      // Update local state
      setNewFullName(newFullName);
      
      logActivity('profile', `Full name updated from "${currentUser.fullName || 'Not set'}" to "${newFullName}"`, currentUser.username);
      
      // Refresh current user data to get updated values
      await refreshCurrentUser();
      
      setShowFullNameChangeForm(false);
      setFullNameError('');
      setSuccess(t('profileSettings.fullNameUpdated'));
    } catch (error) {
      setFullNameError(t('profileSettings.failedToUpdateFullName'));
      setError(t('profileSettings.failedToUpdateFullName'));
    }
  };

  const handleAddressChange = async () => {
    if (!newAddress.trim()) {
      setAddressError(t('profileSettings.addressCannotBeEmpty'));
      return;
    }
    
    // Check if the value actually changed
    if (newAddress === currentUser?.address) {
      setShowAddressChangeForm(false);
      setNewAddress('');
      setAddressError('');
      return; // No changes, just close editing mode
    }
    
    try {
      // Update in Firestore directly in main user document
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        address: newAddress
      });
      
      // Update local state
      setNewAddress(newAddress);
      
      logActivity('profile', `Address updated from "${currentUser.address || 'Not set'}" to "${newAddress}"`, currentUser.username);
      
      // Refresh current user data to get updated values
      await refreshCurrentUser();
      
      setShowAddressChangeForm(false);
      setAddressError('');
      setSuccess(t('profileSettings.addressUpdated'));
    } catch (error) {
      setAddressError(t('profileSettings.failedToUpdateAddress'));
      setError(t('profileSettings.failedToUpdateAddress'));
    }
  };

  const handleContactChange = async () => {
    if (!newContact.trim()) {
      setContactError(t('profileSettings.contactCannotBeEmpty'));
      return;
    }
    
    // Check if the value actually changed
    if (newContact === currentUser?.contact) {
      setShowContactChangeForm(false);
      setNewContact('');
      setContactError('');
      return; // No changes, just close editing mode
    }
    
    try {
      // Update in Firestore directly in main user document
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        contactNumber: newContact,
        phoneVerified: false,
        lastModified: serverTimestamp()
      });
      
      // Update local state
      setNewContact(newContact);
      
      logActivity('profile', `Contact updated from "${currentUser.contact || 'Not set'}" to "${newContact}"`, currentUser.username);
      
      // Refresh current user data to get updated values
      await refreshCurrentUser();
      
      setShowContactChangeForm(false);
      setContactError('');
      setSuccess(t('profileSettings.contactUpdated'));
    } catch (error) {
      setContactError(t('profileSettings.failedToUpdateContact'));
      setError(t('profileSettings.failedToUpdateContact'));
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail.trim()) {
      setEmailError(t('profileSettings.emailCannotBeEmpty'));
      return;
    }
    
    // Check if the value actually changed
    if (newEmail === currentUser?.email) {
      setShowEmailChangeForm(false);
      setNewEmail('');
      setEmailError('');
      return; // No changes, just close editing mode
    }
    
    try {
      // 1) Update auth user's email
      await fbUpdateEmail(auth.currentUser, newEmail);

      // 2) Update Firestore: set email and mark emailVerified false until verification
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        email: newEmail,
        emailVerified: false,
        lastModified: new Date()
      });

      // 3) Send verification email to the new address
      await fbSendEmailVerification(auth.currentUser);

      // 4) Update UI/local state and prompt user to verify
      setNewEmail(newEmail);
      logActivity('profile', `Email updated from "${currentUser.email || 'Not set'}" to "${newEmail}" (verification sent)`, currentUser.username);
      await refreshCurrentUser();
      setShowEmailChangeForm(false);
      setEmailError('');
      setSuccess(t('profileSettings.verificationEmailSentTo', { email: newEmail }));
      setShowEmailVerifyNotice(true);
      
      // Begin periodic verification checks until verified
      if (!verificationCheckInterval) {
        const interval = setInterval(handleVerificationCheck, 5000);
        setVerificationCheckInterval(interval);
      }
      
      // Avoid hard reload; rely on refreshCurrentUser and reactive state
    } catch (error) {
      let msg = t('profileSettings.failedToUpdateEmail');
      if (error?.code === 'auth/requires-recent-login') {
        msg = t('profileSettings.requiresRecentLogin');
      } else if (error?.code === 'auth/invalid-email') {
        msg = t('profileSettings.emailInvalid');
      } else if (error?.code === 'auth/email-already-in-use') {
        msg = t('profileSettings.emailInUse');
      }
      setEmailError(msg);
      setError(msg);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const imageUrl = await uploadImage(file);
        setTempProfileImage(imageUrl);
        setShowImagePreview(true);
        setShowImageOptions(false);
      } catch (error) {
        logActivity('error', logMessages.error.system(error.message), currentUser.username);
      }
    }
  };

  const handleProfileImageClick = () => {
    setShowProfileImageModal(true);
    try { 
      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      logActivity('profile', `Profile image options opened in Profile Settings`, u); 
    } catch (_) {}
  };

  const captureImage = () => {
    if (videoRef.current) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0);
        
        // Convert to base64 with better quality
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        setTempProfileImage(imageData);
        setShowImagePreview(true);
        stopCamera();
        try { 
          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
          logActivity('profile', `Photo captured from camera in Profile Settings`, u); 
        } catch (_) {}
      } catch (error) {
        setError('Failed to capture image. Please try again.');
      }
    }
  };

  const confirmImage = async () => {
    try {
      if (!tempProfileImage) {
        throw new Error('No image to save');
      }

      // First update the local state
      setProfileImage(tempProfileImage);
      
      // Then update in Firebase
      await updateProfileImage(tempProfileImage);
      
      // Log the activity
      logActivity('profile', logMessages.profile.imageUpdate(currentUser.username), currentUser.username);
      
      // Refresh current user data to sync across all components
      await refreshCurrentUser();
      
      // Clear temporary states
      setTempProfileImage(null);
      setShowImagePreview(false);
      setShowImageOptions(false);
      setShowRemoveButton(true);
      
      // Show success message
      setSuccess(t('profileSettings.profilePictureUpdated'));
    } catch (error) {
      setError(t('profileSettings.failedToSaveProfilePicture'));
      // Revert local state if save failed
      setProfileImage(currentUser?.profileImage || null);
    }
  };

  const cancelImage = () => {
    setTempProfileImage(null);
    setShowImagePreview(false);
    if (isCameraActive) {
      stopCamera();
    }
    try { 
      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      logActivity('profile', `Image preview cancelled in Profile Settings`, u); 
    } catch (_) {}
  };

  // Add effect to handle video element initialization
  useEffect(() => {
    if (isCameraActive && videoRef.current) {
      setIsCameraReady(true);
    } else {
      setIsCameraReady(false);
    }
  }, [isCameraActive, videoRef.current]);

  const openCamera = async () => {
    try {
      // First check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser');
      }

      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('profile', `Camera opened for photo capture in Profile Settings`, u); 
      } catch (_) {}

      // Set camera as active first to ensure video element is rendered
      setIsCameraActive(true);

      // Wait for video element to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Ensure video element exists
      if (!videoRef.current) {
        setIsCameraActive(false);
        throw new Error('Video element not initialized');
      }

      // List available devices first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      if (videoDevices.length === 0) {
        setIsCameraActive(false);
        throw new Error('No camera devices found');
      }

      // Try to get camera access with more specific constraints
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });

      if (!mediaStream) {
        setIsCameraActive(false);
        throw new Error('Failed to get media stream');
      }

      // Check if we got video tracks
      const videoTracks = mediaStream.getVideoTracks();
      if (videoTracks.length === 0) {
        setIsCameraActive(false);
        throw new Error('No video tracks in media stream');
      }

      // Set up video element
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play().catch(err => {
        setIsCameraActive(false);
        throw new Error('Failed to start video preview');
      });

      setStream(mediaStream);
    } catch (err) {
      let errorMessage = "Could not access camera. ";
      
      if (err.name === 'NotAllowedError') {
        errorMessage += "Camera access was denied. Please check your browser settings and ensure no other applications are using the camera.";
      } else if (err.name === 'NotFoundError') {
        errorMessage += "No camera device found. Please check if your camera is properly connected.";
      } else if (err.name === 'NotReadableError') {
        errorMessage += "Camera is already in use by another application. Please close other applications using the camera.";
      } else if (err.name === 'OverconstrainedError') {
        errorMessage += "Camera does not support the requested settings. Trying with basic settings...";
        // Try again with basic settings
        try {
          const basicStream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = basicStream;
            await videoRef.current.play();
            setStream(basicStream);
            return;
          }
        } catch (basicErr) {
          errorMessage = "Could not access camera even with basic settings. Please try again.";
        }
      } else {
        errorMessage += `Error: ${err.message}. Please try again or use file upload instead.`;
      }
      
      if (mountedRef.current) {
        setError(errorMessage);
        setShowImageOptions(false);
        setIsCameraActive(false);
      }
      
      // Automatically switch to file upload option after error
      safeSetTimeout(() => {
        setShowImageOptions(true);
      }, 3000);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraActive(false);
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('profile', `Camera closed in Profile Settings`, u); 
      } catch (_) {}
    }
  };

  const removeImage = async () => {
    try {
      // Update in Firestore directly
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        profileImage: null
      });
      
      // Update local state
      setProfileImage(null);
      setShowRemoveButton(false);
      
      // Log the activity
      logActivity('profile', `Profile picture removed by ${currentUser.username}`, currentUser.username);
      
      // Refresh current user data to sync across all components
      await refreshCurrentUser();
      
      setSuccess(t('profileSettings.profilePictureRemoved'));
    } catch (error) {
      setError(t('profileSettings.failedToRemoveProfilePicture'));
    }
  };

  const handlePasswordReset = async () => {
    try {
      setError('');
      setSuccess('');

      if (!currentUser?.email) {
        setError(t('profileSettings.noEmailForReset'));
        return;
      }

      // Send password reset email
      await sendPasswordResetEmail(auth, currentUser.email);
      
      // Log the activity
      logActivity('profile', `Password reset email sent to ${currentUser.email}`, currentUser.username);
      
      setSuccess(t('profileSettings.passwordResetEmailSent'));
    } catch (error) {
      let errorMessage = t('profileSettings.failedToSendPasswordReset');
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = t('profileSettings.userNotFound');
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = t('profileSettings.invalidEmail');
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = t('profileSettings.tooManyRequests');
      }
      
      setError(errorMessage);
    }
  };

  // Add function to handle verification check
  const handleVerificationCheck = async () => {
    try {
      setIsCheckingVerification(true);
      const isVerified = await checkEmailVerification();
      
      if (isVerified) {
        // Persist emailVerified true in Firestore and refresh
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userRef, { emailVerified: true, lastModified: serverTimestamp() });
        } catch (_) {}

        if (!mountedRef.current) return;
        setShowEmailVerifyNotice(false);
        // Prevent repeated success flashes from subsequent renders/polls
        if (!hasShownVerifySuccessRef.current) {
          if (!mountedRef.current) return;
          setSuccess(t('profileSettings.emailVerified'));
          hasShownVerifySuccessRef.current = true;
        }
        try { 
          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
          logActivity('profile', `Email verification confirmed in Profile Settings`, u); 
        } catch (_) {}

        // Clear polling and refresh user state
        if (verificationCheckInterval) {
          clearInterval(verificationCheckInterval);
          setVerificationCheckInterval(null);
        }
        await refreshCurrentUser();
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setError(t('profileSettings.failedToCheckVerification'));
    } finally {
      if (!mountedRef.current) return;
      setIsCheckingVerification(false);
    }
  };

// Add verification email sending function
const handleSendVerificationEmail = async () => {
  try {
    setIsSendingVerification(true);
    setError('');
    setSuccess('');

    try { 
      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      logActivity('profile', `Verification email sending initiated in Profile Settings`, u); 
    } catch (_) {}

    // Start checking verification status every 5 seconds
    hasShownVerifySuccessRef.current = false; // reset guard for a new verification flow
    const interval = setInterval(handleVerificationCheck, 5000);
    setVerificationCheckInterval(interval);
  
    const result = await sendVerificationEmail();
    
    if (result.success) {
      setSuccess(result.message);
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('profile', `Verification email sent successfully in Profile Settings`, u); 
      } catch (_) {}
    } else {
      setError(result.message);
    }
  } catch (error) {
    setError(t('profileSettings.failedToSendVerification'));
  } finally {
    setIsSendingVerification(false);
  }
};

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (verificationCheckInterval) {
        clearInterval(verificationCheckInterval);
      }
    };
  }, [verificationCheckInterval]);

  // Add cleanup effect
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);



  // Initialize form state with current user data when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setNewFullName(currentUser.fullName || '');
      setNewAddress(currentUser.address || '');
      setNewContact(currentUser.contact || '');
      setNewUsername(currentUser.username || '');
      setNewEmail(currentUser.email || '');
    }
  }, [currentUser]);

  // Sidebar navigation handlers
  const handleDashboardClick = () => {
    navigate('/Homepage');
  };

  const handleAccountManagementClick = () => {
    const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
    
    if (isTemporaryTechOfficer) {
      setError('⚠️ Restricted Access: Your current role as a Temporary Tech Officer does not allow access to Account Management. Please contact your Admin for assistance.');
      setTimeout(() => setError(''), 5000);
      return;
    }
    
    navigate('/AccountManagement');
  };

  const handleLogsClick = () => {
    navigate('/Logs');
  };

  const handleSidebarFeedbackClick = () => {
    navigate('/Feedback');
  };

  const handleExport = (format) => {
    setShowDownloadOptions(false);
  };

  // Function to save all changes when Save Changes button is clicked
  const handleSaveChanges = async () => {
    try {
      setError('');
      setSuccess('');
      
      const updates = {};
      let hasChanges = false;
      
      // Check for username changes
      if (newUsername && newUsername !== currentUser?.username) {
        updates.username = newUsername;
        hasChanges = true;
      }
      
      // Check for full name changes
      if (newFullName && newFullName !== currentUser?.fullName) {
        updates.fullName = newFullName;
        hasChanges = true;
      }
      
      // Check for address changes
      if (newAddress && newAddress !== currentUser?.address) {
        updates.address = newAddress;
        hasChanges = true;
      }
      
      // Check for contact changes
      if (newContact && newContact !== currentUser?.contact) {
        updates.contactNumber = newContact;
        updates.phoneVerified = false;
        hasChanges = true;
      }
      
      // Check for email changes
      if (newEmail && newEmail !== currentUser?.email) {
        updates.email = newEmail;
        hasChanges = true;
      }
      
      if (!hasChanges) {
        setSuccess(t('profileSettings.noChangesToSave'));
        return;
      }
      
      // Update in Firestore
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, updates);
      
      // Log activities for each change
      if (updates.username) {
        logActivity('profile', `Username updated from "${currentUser.username}" to "${updates.username}"`, currentUser.username);
      }
      if (updates.fullName) {
        logActivity('profile', `Full name updated from "${currentUser.fullName || 'Not set'}" to "${updates.fullName}"`, currentUser.username);
      }
      if (updates.address) {
        logActivity('profile', `Address updated from "${currentUser.address || 'Not set'}" to "${updates.address}"`, currentUser.username);
      }
      if (updates.contactNumber) {
        logActivity('profile', `Contact updated from "${currentUser.contact || 'Not set'}" to "${updates.contactNumber}"`, currentUser.username);
      }
      if (updates.email) {
        logActivity('profile', `Email updated from "${currentUser.email}" to "${updates.email}"`, currentUser.username);
      }
      
      // Refresh current user data
      await refreshCurrentUser();
      
      // Reset form states
      setNewUsername('');
      setNewFullName('');
      setNewAddress('');
      setNewContact('');
      setNewEmail('');
      setShowUsernameChangeForm(false);
      setShowFullNameChangeForm(false);
      setShowAddressChangeForm(false);
      setShowContactChangeForm(false);
      setShowEmailChangeForm(false);
      
      setSuccess(t('profileSettings.allChangesSaved'));
      
    } catch (error) {
      setError(t('profileSettings.failedToSaveChanges'));
    }
  };

  return (
    <div className="profile-settings">
      <header className="profile-header-bar">
          <div className="header-logo-container">
          <FaBars 
              className="header-hamburger-icon" 
              onClick={() => {
                if (window.innerWidth <= 1023) {
                  setSidebarOpen(!sidebarOpen);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
            />
            <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
            <div className="header-title">PiscaRISK</div>
          </div>
          <div className="header-right">
            <NotificationBox />
            <div className="user-menu">
              <button onClick={() => setShowMenu(!showMenu)}>
                {currentUser?.profileImage ? (
                  <img 
                    src={currentUser.profileImage} 
                    alt="Profile" 
                    className="user-dropdown-profile-pic" 
                  />
                ) : (
                  <FaUserCircle className="user-dropdown-icon" />
                )}
              </button>
              {showMenu && (
                <div className="header-dropdown-menu">
                  <button onClick={() => navigate("/ProfileSettings")}>
                    <FaUser className="dropdown-icon" />
                    {t('common.profile')}
                  </button>
                  <button onClick={() => handleLogout(navigate)}>
                    <FaSignOutAlt className="dropdown-icon" />
                    {t('sidebar.logout')}
                  </button> 
                </div>
              )}
            </div>
          </div>
        </header>

      <Sidebar
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        currentUser={currentUser}
        showDownloadOptions={showDownloadOptions}
        setShowDownloadOptions={setShowDownloadOptions}
        handleExport={handleExport}
        onDashboardClick={handleDashboardClick}
        onAccountManagementClick={handleAccountManagementClick}
        onLogsClick={handleLogsClick}
        onFeedbackClick={handleSidebarFeedbackClick}
        nightMode={nightMode}
        setNightMode={setNightMode}
        language={language}
      />

      {/* Error and Success Messages */}
      {error && (
        <div className="error-message visible">
          {error}
        </div>
      )}
      {success && (
        <div className="success-message visible">
          {success}
        </div>
      )}

      {/* Account Settings Box */}
      <div className="account-wrapper">
        <p className="accounts-title">{t('profileSettings.myAccount')}</p>
      </div>

      <div className="profile-settings-box">
        <div className="profile-layout">
          {/* Left Section - User Identity */}
          <div className="profile-identity-section">
            <div className="profile-avatar-container">
              <div 
                className="profile-avatar" 
                onClick={handleProfileImageClick}
                onMouseLeave={() => setShowRemoveButton(false)}
              >
                {profileImage ? (
                  <>
                    <img src={profileImage} alt="Profile" className="profile-image" />
                    {showRemoveButton && (
                      <button 
                        className="remove-image-btn" 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage();
                          setShowRemoveButton(false);
                        }}
                      >
                        <FaTimes />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="avatar-placeholder">
                    <FaUserCircle className="avatar-icon" />
                  </div>
                )}
              </div>
            </div>
            <div className="user-info-display">
              <h3 className="display-username">{currentUser?.username || t('profileSettings.defaultUsername')}</h3>
              <p className="display-email">{currentUser?.email || t('profileSettings.defaultEmail')}</p>
            </div>
          </div>

          {/* Right Section - Editable Fields */}
          <div className="profile-fields-section">
            {/* Row 1: Username and Full Name */}
            <div className="fields-row">
              <div className="profile-field">
                <label>{t('profileSettings.username')}</label>
                <div className="field-input-container">
                  <input
                    type="text"
                    value={showUsernameChangeForm ? newUsername : (currentUser?.username || '')}
                    onChange={(e) => setNewUsername(e.target.value)}
                    readOnly={!showUsernameChangeForm}
                    className={`field-input ${showUsernameChangeForm ? 'editing' : ''}`}
                    placeholder={t('profileSettings.usernamePlaceholder')}
                  />
                  <LiaEdit 
                    className="edit-icon-inside clickable-edit-icon" 
                    onClick={() => {
                      if (showUsernameChangeForm) {
                        // Save changes
                        handleUsernameChange();
                        // Remove focus from the input field
                        const input = document.querySelector('.profile-field:first-child .field-input');
                        if (input) input.blur();
                      } else {
                        // Start editing
                        setNewUsername(currentUser?.username || '');
                        setShowUsernameChangeForm(true);
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('profile', `Username editing started in Profile Settings`, u); 
                        } catch (_) {}
                      }
                    }}
                  />
                </div>
                {false && showUsernameChangeForm && (
                  <small style={{ fontSize: '0.8rem', color: '#dc3545', marginTop: '0.25rem' }}>
                    {t('profileSettings.usernameWarning')}
                  </small>
                )}
              </div>

              <div className="profile-field">
                <label>{t('profileSettings.fullName')}</label>
                <div className="field-input-container">
                  <input
                    type="text"
                    value={showFullNameChangeForm ? newFullName : (currentUser?.fullName || '')}
                    onChange={(e) => setNewFullName(e.target.value)}
                    readOnly={!showFullNameChangeForm}
                    className={`field-input ${showFullNameChangeForm ? 'editing' : ''}`}
                    placeholder={t('profileSettings.fullNamePlaceholder')}
                  />
                  <LiaEdit 
                    className="edit-icon-inside clickable-edit-icon" 
                    onClick={() => {
                      if (showFullNameChangeForm) {
                        // Save changes
                        handleFullNameChange();
                        // Remove focus from the input field
                        const input = document.querySelector('.profile-field:nth-child(2) .field-input');
                        if (input) input.blur();
                      } else {
                        // Start editing
                        setNewFullName(currentUser?.fullName || '');
                        setShowFullNameChangeForm(true);
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('profile', `Full name editing started in Profile Settings`, u); 
                        } catch (_) {}
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Address and Contact */}
            <div className="fields-row">
              <div className="profile-field">
                <label>{t('profileSettings.address')}</label>
                <div className="field-input-container">
                  <input
                    type="text"
                    value={showAddressChangeForm ? newAddress : (currentUser?.address || '')}
                    onChange={(e) => setNewAddress(e.target.value)}
                    readOnly={!showAddressChangeForm}
                    className={`field-input ${showAddressChangeForm ? 'editing' : ''}`}
                    placeholder={t('profileSettings.addressPlaceholder')}
                  />
                  <LiaEdit 
                    className="edit-icon-inside clickable-edit-icon" 
                    onClick={() => {
                      if (showAddressChangeForm) {
                        // Save changes
                        handleAddressChange();
                        // Remove focus from the input field
                        const input = document.querySelector('.profile-field:nth-child(3) .field-input');
                        if (input) input.blur();
                      } else {
                        // Start editing
                        setNewAddress(currentUser?.address || '');
                        setShowAddressChangeForm(true);
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('profile', `Address editing started in Profile Settings`, u); 
                        } catch (_) {}
                      }
                    }}
                  />
                </div>
              </div>

              <div className="profile-field">
                <label>{t('profileSettings.contact')}</label>
                <div className="field-input-container">
                  <input
                    type="text"
                    value={showContactChangeForm ? newContact : (currentUser?.contact || '')}
                    onChange={(e) => setNewContact(e.target.value)}
                    readOnly={!showContactChangeForm || (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer')}
                    className={`field-input ${showContactChangeForm ? 'editing' : ''} ${(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 'disabled-field' : ''}`}
                    placeholder={t('profileSettings.contactPlaceholder')}
                    disabled={currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer'}
                  />
                  {!(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
                    <LiaEdit 
                      className="edit-icon-inside clickable-edit-icon" 
                      onClick={() => {
                        if (showContactChangeForm) {
                          // Save changes
                          handleContactChange();
                          // Remove focus from the input field
                          const input = document.querySelector('.profile-field:nth-child(4) .field-input');
                          if (input) input.blur();
                        } else {
                          // Start editing
                          setNewContact(currentUser?.contact || '');
                          setShowContactChangeForm(true);
                          try { 
                            const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                            logActivity('profile', `Contact editing started in Profile Settings`, u); 
                          } catch (_) {}
                        }
                      }}
                    />
                  )}
                </div>
                {showContactChangeForm && (
                  <small style={{ fontSize: '0.8rem', color: '#dc3545', marginTop: '0.25rem', display: 'inline-block' }}>
                    {t('profileSettings.contactWarning')}
                  </small>
                )}
                {(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
                  <small style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '0.25rem', display: 'block' }}>
                    🔒 Contact editing disabled for temporary accounts
                  </small>
                )}
                {!showContactChangeForm && currentUser && currentUser.phoneVerified === false && (
                  <span style={{
                    display: 'inline-block',
                    marginTop: '6px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(220,53,69,0.1)',
                    color: '#dc3545',
                    fontSize: '0.75rem',
                    border: '1px solid rgba(220,53,69,0.4)'
                  }}>
                    {t('profileSettings.pendingVerification')}
                  </span>
                )}
              </div>
            </div>

            {/* Row 3: Email + Password side by side */}
            <div className="fields-row email-password-row">
              <div className="profile-field email-field">
                <label>{t('profileSettings.email')}</label>
                <div className="field-input-container">
                  <input
                    type="email"
                    value={showEmailChangeForm ? newEmail : (currentUser?.email || '')}
                    onChange={(e) => setNewEmail(e.target.value)}
                    readOnly={!showEmailChangeForm || (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer')}
                    className={`field-input ${showEmailChangeForm ? 'editing' : ''} ${(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 'disabled-field' : ''}`}
                    placeholder={t('profileSettings.emailPlaceholder')}
                    disabled={currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer'}
                  />
                  {!(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
                    <LiaEdit 
                      className="edit-icon-inside clickable-edit-icon" 
                      onClick={() => {
                        if (showEmailChangeForm) {
                          // Save changes
                          handleEmailChange();
                          // Remove focus from the input field
                          const input = document.querySelector('.profile-field:nth-child(5) .field-input');
                          if (input) input.blur();
                        } else {
                          // Start editing
                          setNewEmail(currentUser?.email || '');
                          setShowEmailChangeForm(true);
                          try { 
                            const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                            logActivity('profile', `Email editing started in Profile Settings`, u); 
                          } catch (_) {}
                        }
                      }}
                    />
                  )}
                </div>
                { showEmailChangeForm && (
                  <small style={{ fontSize: '0.8rem', color: '#dc3545', marginTop: '0.25rem' }}>
                    {t('profileSettings.usernameWarning')}
                  </small>
                )}
                {(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
                  <small style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '0.25rem', display: 'block' }}>
                    🔒 Email editing disabled for temporary accounts
                  </small>
                )}
                { (showEmailVerifyNotice || currentUser?.emailVerified === false) && (
                  <div className="verification-notice" style={{ marginTop: '8px' }}>
                    {t('profileSettings.emailUnverifiedNotice')}
                    <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
                      <button className="send-verification-btn" onClick={handleSendVerificationEmail} disabled={isSendingVerification}>
                        {isSendingVerification ? t('profileSettings.sending') : t('profileSettings.resendVerification')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="profile-field password-field">
                <label>{t('profileSettings.password')}</label>
                <div className="field-input-container">
                  <input
                    type="password"
                    value="**********"
                    readOnly
                    className="field-input"
                  />
                  <LiaEdit 
                    className="edit-icon-inside clickable-edit-icon" 
                    onClick={() => {
                      // This will open the password change functionality
                      setShowPasswordChangeForm((prev) => !prev);
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('profile', `Password change form opened in Profile Settings`, u); 
                      } catch (_) {}
                    }}
                  />
                </div>
                {showPasswordChangeForm && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <button className="change-password-btn" onClick={handlePasswordReset}>{t('profileSettings.changePassword')}</button>
                  </div>
                )}
              </div>
            </div>

            {/* Row 6: Save Changes Button - Centered (show only when any field is in edit mode) */}
            {(showUsernameChangeForm || showFullNameChangeForm || showAddressChangeForm || showContactChangeForm || showEmailChangeForm) && (
              <div className="fields-row save-changes-row">
                <div className="profile-field">
                  <button className="save-changes-btn" onClick={handleSaveChanges}>{t('profileSettings.saveChanges')}</button>
                </div>
              </div>
            )}
          </div>
        </div>



        {/* Image Options Modal */}
        {showImageOptions && !showImagePreview && (
          <div className="image-options-modal">
            <div className="image-options-content">
              <h3>{t('profileSettings.updateProfilePicture')}</h3>
              {isCameraActive ? (
                <div className="camera-preview">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className="video-preview" 
                    style={{ 
                      width: '100%', 
                      maxHeight: '300px', 
                      backgroundColor: '#000',
                      display: isCameraReady ? 'block' : 'none'
                    }}
                  />
                  {!isCameraReady && (
                    <div className="camera-loading">
                      {t('profileSettings.initializingCamera')}
                    </div>
                  )}
                  <button 
                    className="capture-btn" 
                    onClick={captureImage}
                    disabled={!isCameraReady}
                  >
                    <FaCamera /> {t('profileSettings.capture')}
                  </button>
                  <button className="cancel-btn" onClick={stopCamera}>
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <>
                  <button className="option-btn" onClick={openCamera}>
                    <FaCamera /> {t('profileSettings.takePhoto')}
                  </button>
                  <button 
                    className="option-btn" 
                    onClick={() => {
                      fileInputRef.current.click();
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('profile', `File upload option selected in Profile Settings`, u); 
                      } catch (_) {}
                    }}
                  >
                    <FaUpload /> {t('profileSettings.uploadPhoto')}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />
                  <button 
                    className="cancel-btn" 
                    onClick={() => {
                      setShowImageOptions(false);
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('profile', `Image options cancelled in Profile Settings`, u); 
                      } catch (_) {}
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Image Preview Modal */}
        {showImagePreview && (
          <div className="image-preview-modal">
            <div className="image-preview-content">
              <h3>{t('profileSettings.previewProfilePicture')}</h3>
              <div className="preview-circle">
                <img src={tempProfileImage} alt="Preview" className="preview-image" />
              </div>
              <div className="preview-actions">
                <button className="confirm-btn" onClick={confirmImage}>
                  <FaCheck /> {t('profileSettings.confirm')}
                </button>
                <button className="cancel-btn" onClick={cancelImage}>
                  <FaTimes /> {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile Image Modal */}
        {showProfileImageModal && (
          <div className="image-options-modal">
            <div className="image-options-content">
              <h3>{t('profileSettings.profilePictureOptions')}</h3>
              {profileImage ? (
                <>
                  <button className="option-btn" onClick={() => {
                    setShowProfileImageModal(false);
                    setShowImageOptions(true);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('profile', `Change picture option selected in Profile Settings`, u); 
                    } catch (_) {}
                  }}>
                    <FaUpload /> {t('profileSettings.changePicture')}
                  </button>
                  <button className="option-btn remove-btn" onClick={() => {
                    removeImage();
                    setShowProfileImageModal(false);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('profile', `Remove picture option selected in Profile Settings`, u); 
                    } catch (_) {}
                  }}>
                    <FaTimes /> {t('profileSettings.removePicture')}
                  </button>
                </>
              ) : (
                <>
                  <button className="option-btn" onClick={() => {
                    setShowProfileImageModal(false);
                    setShowImageOptions(true);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('profile', `Add picture option selected in Profile Settings`, u); 
                    } catch (_) {}
                  }}>
                    <FaUpload /> {t('profileSettings.addPicture')}
                  </button>
                </>
              )}
              <button className="cancel-btn" onClick={() => {
                setShowProfileImageModal(false);
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('profile', `Profile image modal closed in Profile Settings`, u); 
                } catch (_) {}
              }}>
                {t('profileSettings.close')}
              </button>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
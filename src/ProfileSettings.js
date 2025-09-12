import React, { useState, useRef, useContext, useEffect } from "react";
import logo from "./assets/images/PISCARISK_LOGO.png";
import "./ProfileSettings.css";
import { AuthContext } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { FaEllipsisV, FaCamera, FaUpload, FaTimes, FaCheck, FaEye, FaEyeSlash, FaUserCircle, FaUser, FaSignOutAlt, FaBars } from "react-icons/fa";
import { LiaEdit } from "react-icons/lia";
import { useNavigate } from "react-router-dom";
import { logActivity, logMessages } from './utils/logger';
import NotificationBox from './components/NotificationBox';
import Sidebar from './components/Sidebar';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';
import { sendPasswordResetEmail } from 'firebase/auth';


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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const toggleCurrentPasswordVisibility = () => setShowCurrentPassword(!showCurrentPassword);
  const toggleNewPasswordVisibility = () => setShowNewPassword(!showNewPassword);
  const toggleEmailPasswordVisibility = () => setShowEmailPassword(!showEmailPassword);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [verificationCheckInterval, setVerificationCheckInterval] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  
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
  
  const {handleLogout, refreshCurrentUser, updateUser } = useContext(AuthContext);

  const { 
    currentUser, 
    updateEmail, 
    changePassword, 
    updateProfileImage, 
    setCurrentUser,
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
      reject(new Error('File must be an image.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    reader.onerror = (error) => {
      reject(new Error('Error reading file.'));
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
      setFullNameError('Full name cannot be empty');
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
      setSuccess('Full name updated successfully!');
    } catch (error) {
      console.error('Error updating full name:', error);
      setFullNameError('Failed to update full name. Please try again.');
      setError('Failed to update full name. Please try again.');
    }
  };

  const handleAddressChange = async () => {
    if (!newAddress.trim()) {
      setAddressError('Address cannot be empty');
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
      setSuccess('Address updated successfully!');
    } catch (error) {
      console.error('Error updating address:', error);
      setAddressError('Failed to update address. Please try again.');
      setError('Failed to update address. Please try again.');
    }
  };

  const handleContactChange = async () => {
    if (!newContact.trim()) {
      setContactError('Contact cannot be empty');
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
        contactNumber: newContact
      });
      
      // Update local state
      setNewContact(newContact);
      
      logActivity('profile', `Contact updated from "${currentUser.contact || 'Not set'}" to "${newContact}"`, currentUser.username);
      
      // Refresh current user data to get updated values
      await refreshCurrentUser();
      
      setShowContactChangeForm(false);
      setContactError('');
      setSuccess('Contact updated successfully!');
    } catch (error) {
      console.error('Error updating contact:', error);
      setContactError('Failed to update contact. Please try again.');
      setError('Failed to update contact. Please try again.');
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail.trim()) {
      setEmailError('Email cannot be empty');
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
      // Update in Firestore directly (email is a main user field)
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        email: newEmail
      });
      
      // Update local state
      setNewEmail(newEmail);
      
      logActivity('profile', `Email updated from "${currentUser.email || 'Not set'}" to "${newEmail}"`, currentUser.username);
      
      // Refresh current user data to get updated values
      await refreshCurrentUser();
      
      setShowEmailChangeForm(false);
      setEmailError('');
      setSuccess('Email updated successfully!');
    } catch (error) {
      console.error('Error updating email:', error);
      setEmailError('Failed to update email. Please try again.');
      setError('Failed to update email. Please try again.');
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
        console.error('Error uploading image:', error);
      }
    }
  };

  const handleProfileImageClick = () => {
    setShowProfileImageModal(true);
  };

  const toggleRemoveButton = () => {
    if (profileImage) {
      setShowRemoveButton(!showRemoveButton);
    } else {
      setShowImageOptions(true);
    }
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
      } catch (error) {
        console.error('Error capturing image:', error);
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
      console.error('Error confirming image:', error);
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

      console.log('Available video devices:', videoDevices);

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

      console.log('Active video track:', videoTracks[0].label);

      // Set up video element
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play().catch(err => {
        console.error('Error playing video:', err);
        setIsCameraActive(false);
        throw new Error('Failed to start video preview');
      });

      setStream(mediaStream);
    } catch (err) {
      console.error("Detailed camera error:", err);
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
      
      setError(errorMessage);
      setShowImageOptions(false);
      setIsCameraActive(false);
      
      // Automatically switch to file upload option after error
      setTimeout(() => {
        setShowImageOptions(true);
      }, 3000);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraActive(false);
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
      console.error('Error removing image:', error);
      setError(t('profileSettings.failedToRemoveProfilePicture'));
    }
  };

  const handlePasswordChange = async () => {
    try {
      setError('');
      setSuccess('');

      // Validate new password
      if (newPassword.length < 6) {
        setError(t('profileSettings.passwordTooShort'));
        return;
      }

      // Proceed with password update
      const result = await changePassword(currentPassword, newPassword);
      
      if (result.success) {
        setSuccess(result.message);
        setError('');
        setCurrentPassword('');
        setNewPassword('');
      }
    } catch (err) {
      setError(err.message);
      setSuccess('');
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
      console.error('Error sending password reset email:', error);
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

  const handleUsernameClick = () => {
    setShowUsernameOptions(!showUsernameOptions);
  };

  // Add function to handle verification check
  const handleVerificationCheck = async () => {
    try {
      setIsCheckingVerification(true);
      const isVerified = await checkEmailVerification();
      
      if (isVerified) {
        // Only show success message if we haven't shown it before
        if (!verificationCheckInterval) {
          setSuccess(t('profileSettings.emailVerified'));
        }
        // Clear the interval if email is verified
        if (verificationCheckInterval) {
          clearInterval(verificationCheckInterval);
          setVerificationCheckInterval(null);
        }
      }
    } catch (error) {
      setError(t('profileSettings.failedToCheckVerification'));
    } finally {
      setIsCheckingVerification(false);
    }
  };

// Add verification email sending function
const handleSendVerificationEmail = async () => {
  try {
    setIsSendingVerification(true);
    setError('');
    setSuccess('');

    // Start checking verification status every 5 seconds
    const interval = setInterval(handleVerificationCheck, 5000);
    setVerificationCheckInterval(interval);
  
    const result = await sendVerificationEmail();
    
    if (result.success) {
      setSuccess(result.message);
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
    // Handle export functionality here if needed
    console.log(`Exporting in ${format} format`);
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
        hasChanges = true;
      }
      
      // Check for email changes
      if (newEmail && newEmail !== currentUser?.email) {
        updates.email = newEmail;
        hasChanges = true;
      }
      
      if (!hasChanges) {
        setSuccess('No changes to save.');
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
      console.error('Error saving changes:', error);
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
                      }
                    }}
                  />
                </div>
                {showUsernameChangeForm && (
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
                    readOnly={!showContactChangeForm}
                    className={`field-input ${showContactChangeForm ? 'editing' : ''}`}
                    placeholder={t('profileSettings.contactPlaceholder')}
                  />
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
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Email */}
            <div className="fields-row">
              <div className="profile-field email-field">
                <label>{t('profileSettings.email')}</label>
                <div className="field-input-container">
                  <input
                    type="email"
                    value={showEmailChangeForm ? newEmail : (currentUser?.email || '')}
                    onChange={(e) => setNewEmail(e.target.value)}
                    readOnly={!showEmailChangeForm}
                    className={`field-input ${showEmailChangeForm ? 'editing' : ''}`}
                    placeholder={t('profileSettings.emailPlaceholder')}
                  />
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
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Password */}
            <div className="fields-row">
              <div className="profile-field password-field">
                <label>{t('profileSettings.password')}</label>
                <div className="field-input-container">
                  <input
                    type="password"
                    value="******"
                    readOnly
                    className="field-input"
                  />
                  <LiaEdit 
                    className="edit-icon-inside clickable-edit-icon" 
                    onClick={() => {
                      // This will open the password change functionality
                      setShowPasswordChangeForm(true);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Row 5: Change Password Button */}
            <div className="fields-row">
              <div className="profile-field">
                <button className="change-password-btn" onClick={handlePasswordReset}>{t('profileSettings.changePassword')}</button>
              </div>
            </div>

            {/* Row 6: Save Changes Button - Centered */}
            <div className="fields-row save-changes-row">
              <div className="profile-field">
                <button className="save-changes-btn" onClick={handleSaveChanges}>{t('profileSettings.saveChanges')}</button>
              </div>
            </div>
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
                    onClick={() => fileInputRef.current.click()}
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
                    onClick={() => setShowImageOptions(false)}
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
                  }}>
                    <FaUpload /> {t('profileSettings.changePicture')}
                  </button>
                  <button className="option-btn remove-btn" onClick={() => {
                    removeImage();
                    setShowProfileImageModal(false);
                  }}>
                    <FaTimes /> {t('profileSettings.removePicture')}
                  </button>
                </>
              ) : (
                <>
                  <button className="option-btn" onClick={() => {
                    setShowProfileImageModal(false);
                    setShowImageOptions(true);
                  }}>
                    <FaUpload /> {t('profileSettings.addPicture')}
                  </button>
                </>
              )}
              <button className="cancel-btn" onClick={() => setShowProfileImageModal(false)}>
                {t('profileSettings.close')}
              </button>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
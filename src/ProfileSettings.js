import React, { useState, useRef, useContext, useEffect } from "react";
import logo from "./assets/images/PISCARISK_LOGO.png";
import "./ProfileSettings.css";
import { AuthContext } from './contexts/AuthContext';
import { FaEllipsisV, FaCamera, FaUpload, FaTimes, FaCheck, FaEye, FaEyeSlash} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { logActivity, logMessages } from './utils/logger';
import NotificationBox from './components/NotificationBox';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';


export default function AccountSettings() {
  const navigate = useNavigate();
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

  const { 
    currentUser, 
    updateEmail, 
    changePassword, 
    updateProfileImage, 
    updateUser, 
    setCurrentUser,
    sendVerificationEmail,
    checkEmailVerification 
  } = useContext(AuthContext);
  const [profileImage, setProfileImage] = useState(currentUser?.profileImage || null);
  

  useEffect(() => {
    const timer = setTimeout(() => {
      if (error) setError('');
      if (success) setSuccess('');
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [error, success]);
  
  const handleEmailChange = async (e) => {
    e.preventDefault();
    setEmailError('');
    setError('');
    setSuccess('');
  
    // Validation
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
      setEmailError('Please enter a valid email');
      return;
    }
  
    if (newEmail === currentUser?.email) {
      setEmailError('This is already your current email');
      return;
    }
  
    try {
      // First check if current email is verified
      await auth.currentUser.reload();
      
      if (!auth.currentUser.emailVerified) {
        setError('Please verify your current email before changing it');
        setSuccess('');
        return;
      }
  
      // Proceed with email update
      const result = await updateEmail(newEmail, emailCurrentPassword);
      
      if (result.success) {
        setShowEmailChangeForm(false);
        setNewEmail('');
        setEmailCurrentPassword('');
        setSuccess(result.message);
        setError('');
        
        // Start checking for verification
        const checkVerification = async () => {
          try {
            const isVerified = await checkEmailVerification();
            if (isVerified) {
              setSuccess('Email verified successfully! You can now complete the email change.');
              clearInterval(verificationInterval);
            }
          } catch (error) {
            console.error('Error checking verification:', error);
          }
        };
        
        const verificationInterval = setInterval(checkVerification, 5000);
        // Clear interval after 5 minutes
        setTimeout(() => clearInterval(verificationInterval), 300000);
      }
    } catch (err) {
      setError(err.message);
      setSuccess('');
    }
  };
  
// Function to convert file to base64
const uploadImage = (file) => {
  return new Promise((resolve, reject) => {
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('File size too large. Maximum size is 5MB.'));
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

  const handleUsernameChange = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      setUsernameError('Username cannot be empty');
      return;
    }
    try {
      // Update in Firebase and AuthContext
      await updateUser({ username: newUsername });
      
      // Update local state
      setProfileImage(prev => ({ ...prev, username: newUsername }));
      logActivity('profile', logMessages.profile.usernameChange(currentUser.username, newUsername), currentUser.username);
      
      setShowUsernameChangeForm(false);
      setNewUsername('');
      setUsernameError('');
      setSuccess('Username updated successfully!');
    } catch (error) {
      logActivity('error', logMessages.error.validation(error.message), currentUser.username);
      setUsernameError(error.message);
      setError('Failed to update username. Please try again.');
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
    if (profileImage) {
      toggleRemoveButton();
    } else {
      setShowImageOptions(true);
    }
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
      
      // Clear temporary states
      setTempProfileImage(null);
      setShowImagePreview(false);
      setShowImageOptions(false);
      setShowRemoveButton(true);
      
      // Show success message
      setSuccess('Profile picture updated successfully!');
    } catch (error) {
      console.error('Error confirming image:', error);
      setError('Failed to save profile picture. Please try again.');
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
      await updateProfileImage(null);
      logActivity('profile', logMessages.profile.imageRemove(currentUser.username), currentUser.username);
      setProfileImage(null);
      setShowRemoveButton(false);
    } catch (error) {
      logActivity('error', logMessages.error.system(error.message), currentUser.username);
      console.error('Error removing image:', error);
    }
  };

  const handlePasswordChange = async () => {
    try {
      setError('');
      setSuccess('');

      // Validate new password
      if (newPassword.length < 6) {
        setError('New password must be at least 6 characters long');
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
          setSuccess('Email verified successfully!');
        }
        // Clear the interval if email is verified
        if (verificationCheckInterval) {
          clearInterval(verificationCheckInterval);
          setVerificationCheckInterval(null);
        }
      }
    } catch (error) {
      setError('Failed to check email verification status');
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
    setError('Failed to send verification email. Please try again.');
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

  return (
    <div className="profile-settings">
      <header className="profile-header-bar">
        <div className="header-logo-container">
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRisk</div>
        </div>

        <div className="header-right">
          <NotificationBox />
          <div className="profile-menu">
            <button onClick={() => setShowMenu(!showMenu)}>
              <FaEllipsisV className="three-dot-icon" />
            </button>
            {showMenu && (
              <div className="dropdown-menu">
                <button onClick={() => navigate('/Homepage')}>Go to Homepage</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Account Settings Box */}
      <div className="account-wrapper">
        <p className="accounts-title">Account Settings</p>
      </div>

      <div className="profile-settings-box">
      <div className="profile-icon-container">
          <div 
            className="profile-icon" 
            onClick={handleProfileImageClick}
            onMouseLeave={() => setShowRemoveButton(false)} // Hide when mouse leaves
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
              <div className="circle-icon">
                <span className="icon-user">👤</span>
              </div>
            )}
          </div>
          <span className="username-label">
            <span 
              className="username-text" 
              onClick={handleUsernameClick}
              style={{ cursor: 'pointer' }}
            >
              {currentUser?.username || 'No username set'}
            </span>
            
            {showUsernameOptions && (
              <div className="username-options">
                <button 
                  className="username-option-btn"
                  onClick={() => {
                    setNewUsername(currentUser?.username || '');
                    setShowUsernameChangeForm(true);
                    setShowUsernameOptions(false);
                  }}
                >
                  Change Username
                </button>
              </div>
            )}
            
            {showUsernameChangeForm && (
              <form onSubmit={handleUsernameChange} className="username-change-form">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter new username"
                  required
                />
                {usernameError && <div className="username-error">{usernameError}</div>}
                <div className="form-buttons">
                  <button type="button" className="usernamecancel-btn" onClick={() => setShowUsernameChangeForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="usernamesubmit-btn">
                    Update
                  </button>
                </div>
              </form>
            )}
          </span>
        </div>


        {/* Image Options Modal */}
        {showImageOptions && !showImagePreview && (
          <div className="image-options-modal">
            <div className="image-options-content">
              <h3>Update Profile Picture</h3>
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
                      Initializing camera...
                    </div>
                  )}
                  <button 
                    className="capture-btn" 
                    onClick={captureImage}
                    disabled={!isCameraReady}
                  >
                    <FaCamera /> Capture
                  </button>
                  <button className="cancel-btn" onClick={stopCamera}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button className="option-btn" onClick={openCamera}>
                    <FaCamera /> Take Photo
                  </button>
                  <button 
                    className="option-btn" 
                    onClick={() => fileInputRef.current.click()}
                  >
                    <FaUpload /> Upload Photo
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
                    Cancel
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
              <h3>Preview Profile Picture</h3>
              <div className="preview-circle">
                <img src={tempProfileImage} alt="Preview" className="preview-image" />
              </div>
              <div className="preview-actions">
                <button className="confirm-btn" onClick={confirmImage}>
                  <FaCheck /> Confirm
                </button>
                <button className="cancel-btn" onClick={cancelImage}>
                  <FaTimes /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rest of your existing code... */}
        <div className="email-section">
          <h4>Email Address</h4>
          <div className="email-info">
            <span className="email-text">{currentUser?.email || 'No email registered'}</span>
            {!currentUser?.emailVerified && (
              <span className="verification-status">
                (Unverified)
                <button 
                  className="verify-btn" 
                  onClick={handleSendVerificationEmail}
                  disabled={isSendingVerification || isCheckingVerification}
                >
                  {isSendingVerification ? 'Sending...' : 'Verify Email'}
                </button>
              </span>
            )}
            <button 
              className="change-btn email-change-btn" 
              onClick={async () => {
                try {
                  // Reload user to get latest verification status
                  await auth.currentUser?.reload();
                  console.log('Verification status before change:', auth.currentUser?.emailVerified);
                  
                  if (!auth.currentUser?.emailVerified) {
                    setError('Please verify your current email before changing it');
                    return;
                  }
                  setNewEmail(currentUser?.email || '');
                  setShowEmailChangeForm(!showEmailChangeForm);
                } catch (error) {
                  console.error('Error checking verification:', error);
                  setError('Error checking email verification status');
                }
              }}
            >
              {showEmailChangeForm ? 'Cancel' : 'Change'}
            </button>
          </div>
          
          {showEmailChangeForm && (
            <form onSubmit={handleEmailChange} className="email-change-form">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter new email"
                required
              />
              <div className="password-verification">
                <input
                  type={showEmailPassword ? "text" : "password"}
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                  placeholder="Enter your password to confirm"
                  required
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={toggleEmailPasswordVisibility}
                  aria-label={showEmailPassword ? "Hide password" : "Show password"}
                >
                  {showEmailPassword ? <FaEyeSlash className="eye-icon" /> : <FaEye className="eye-icon" />}
                </button>
              </div>
              {emailError && <div className="email-error">{emailError}</div>}
              <div className="form-buttons">
                <button type="button" className="emailcancel-btn" onClick={() => setShowEmailChangeForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="emailsubmit-btn">
                  Update
                </button>
              </div>
            </form>
          )}
        </div>

        <hr className="divider" />

        <div className="password-section">
          <h4>Password</h4>
          </div>
        <div className="password-fields">
                {error && (
                <div className={`error-message ${error ? 'visible' : ''}`}>
                  {error}
                </div>
              )}
              {success && (
                <div className={`success-message ${success ? 'visible' : ''}`}>
                  {success}
                </div>
              )}
              <div className="input-group">
                <label>Current Password</label>
                <div className="currentpassword-input-wrapper">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <button 
                    type="button" 
                    className="password-toggle"
                    onClick={toggleCurrentPasswordVisibility}
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <FaEyeSlash className="eye-icon" /> : <FaEye className="eye-icon" />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label>New Password</label>
                <div className="newpassword-input-wrapper">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <button 
                    type="button" 
                    className="password-toggle"
                    onClick={toggleNewPasswordVisibility}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <FaEyeSlash className="eye-icon" /> : <FaEye className="eye-icon" />}
                  </button>
                </div>
              </div>

              <button 
                className="passconfirm-btn"
                onClick={handlePasswordChange}
                disabled={!currentPassword || !newPassword}
              >
                Confirm
              </button>
            </div>
          <a href="#" className="forgot-password">Forgot password?</a>
      </div>
    </div>
  );
}
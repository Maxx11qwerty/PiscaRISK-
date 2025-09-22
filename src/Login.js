import React, { useState, useRef, useEffect, useContext } from "react";
import { FaEye, FaEyeSlash, FaEnvelope, FaLock, FaGoogle } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next'; // Add this import
import logo from "./assets/images/PISCARISK_LOGO.png";
import { AuthContext } from './contexts/AuthContext';
import EmailVerificationModal from './components/EmailVerificationModal';
import OTPVerification from './components/OtpVerification';
import "./Login.css";
import "./Login.responsive.css";
import { logActivity } from './utils/logger';

export default function Login() {
  const { t } = useTranslation(); // Add this hook
  // Custom hook for screen size tracking
  const useScreenSize = () => {
    const [screenWidth, setScreenWidth] = useState(window.innerWidth);
    
    useEffect(() => {
      const handleResize = () => setScreenWidth(window.innerWidth);
      
      let timeoutId;
      const debouncedResize = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(handleResize, 100);
      };
      
      window.addEventListener('resize', debouncedResize);
      return () => {
        window.removeEventListener('resize', debouncedResize);
        clearTimeout(timeoutId);
      };
    }, []);
    
    return {
      width: screenWidth,
      isMobile: screenWidth < 480,
      isTablet: screenWidth < 900,
      isDesktop: screenWidth >= 1200
    };
  };

  // Use the hook
  const screen = useScreenSize();
  
  const [formData, setFormData] = useState({
    emailOrContact: "",
    password: "",
  });
  
  const { 
    currentUser,
    login, 
    signInWithGoogle, 
    resetPassword, 
    emailVerificationModal,
    openEmailVerificationModal,
    resendVerificationEmail,
    closeEmailVerificationModal,
    phoneVerificationModal,
    openPhoneVerificationModal,
    closePhoneVerificationModal,
    handlePhoneVerificationSuccess,
    isProcessingLoginRef
  } = useContext(AuthContext);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const errorTimeoutRef = useRef();
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [contactError, setContactError] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Contact number validation
  const validateContactNumber = (contact) => {
    if (!contact) return t('login.contactNumberRequired');
    // Check if it's a valid Philippine phone number (11 digits starting with 09)
    if (!/^09\d{9}$/.test(contact)) return t('login.contactNumberInvalid');
    return "";
  };

  // Phone number validation with country code
  const validatePhoneNumber = (phone) => {
    if (!phone) return 'Phone number is required';
    // Check if it starts with +63 and has 10 digits after
    if (!/^\+63\d{10}$/.test(phone)) return 'Please enter a valid Philippine phone number with country code (+63)';
    return "";
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'emailOrContact') {
      setFormData({ ...formData, [name]: value });
      // Clear any previous contact error when user types
      setContactError("");
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate contact number if it's all digits
    if (/^\d+$/.test(formData.emailOrContact)) {
      const contactError = validateContactNumber(formData.emailOrContact);
      if (contactError) {
        setError(contactError);
        return;
      }
    }
    
    try {
      const result = await login(formData.emailOrContact, formData.password);
      
      if (result.success) {
        console.log('Login successful, preparing navigation...');
        
        // Log successful login first
        try {
          const username = result.username || formData.emailOrContact;
          await logActivity('login', `User ${username} logged in successfully`, username);
        } catch (logError) {
          console.error('Failed to log login activity:', logError);
        }
        
        // Clear the login processing flag immediately
        if (isProcessingLoginRef) {
          isProcessingLoginRef.current = false;
          console.log('Cleared login processing flag');
        }
        
        // Navigate immediately without delay
        console.log('Navigating to Homepage...');
        navigate('/Homepage', { replace: true });
      } else {
        if (result.code === 'show_verification_modal') {
          setError('');
          openEmailVerificationModal(result.email, result.password);
          return;
        }
        
        if (result.code === 'show_phone_verification') {
          setError('');
          if (result.phoneNumber) {
            openPhoneVerificationModal(result.phoneNumber, result.userId, result.userData);
          } else {
            setError('Phone number not found. Please contact support.');
          }
          return;
        }
        
        if (result.code === 'auth/account-inactive') {
          setError(result.message);
        } else {
          setError(result.message || t('login.invalidCredentials'));
        }
        
        try {
          await logActivity('login', `Failed login attempt for ${formData.emailOrContact}: ${result.message}`, formData.emailOrContact);
        } catch (logError) {
          console.error('Failed to log activity:', logError);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setError(t('login.unexpectedError'));
      
      try {
        await logActivity('error', `Login system error: ${error.message}`, formData.emailOrContact);
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }
  };


  const handleGoogleLogin = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    setIsGoogleLoading(true);
    
    let result;
    try {
      result = await signInWithGoogle();
      
      if (result.isRedirect) {
        // Show a message that we're redirecting to Google
        setError('Redirecting to Google sign-in...');
        // Don't set loading to false yet, as we're redirecting
      } else if (result.success) {
        // Small delay to ensure state is updated before navigation
        setTimeout(() => {
          navigate('/Homepage');
        }, 100);
        setIsGoogleLoading(false);
      } else if (result.code === 'show_phone_verification') {
        setError('');
        if (result.phoneNumber) {
          openPhoneVerificationModal(result.phoneNumber, result.userId, result.userData);
        } else {
          setError('Phone number not found. Please contact support.');
        }
        setIsGoogleLoading(false);
      }
    } catch (error) {
      console.error('Google login error:', error);
      
      // Provide more specific error messages
      let errorMessage = t('login.failedToLoginWithGoogle');
      if (error.message.includes('cancelled')) {
        errorMessage = 'Google sign-in was cancelled. Please try again.';
      } else if (error.message.includes('popup blocked')) {
        errorMessage = 'Google sign-in popup was blocked. Please allow popups for this site and try again.';
      } else if (error.message.includes('security settings')) {
        errorMessage = 'Browser security settings are blocking Google sign-in popups. This is likely due to Cross-Origin-Opener-Policy restrictions. Please try using a different browser (Chrome, Firefox, or Edge) or disable popup blocking for this site.';
      } else if (error.message.includes('already exists')) {
        errorMessage = 'An account with this email already exists. Please use the login page instead.';
      } else if (error.message.includes('verify your email')) {
        errorMessage = 'Please verify your email before logging in. Check your inbox for a verification link.';
      } else if (error.message.includes('pending admin approval')) {
        errorMessage = 'Your account is pending admin approval. Please wait for activation.';
      } else {
        errorMessage = error.message || t('login.failedToLoginWithGoogle');
      }
      
      setError(errorMessage);
      setIsGoogleLoading(false);
    }
    
    // Clear error after 5 seconds (only if not redirecting)
    if (!result?.isRedirect) {
      setTimeout(() => {
        setError('');
      }, 5000);
    }
  };

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);


  return (
    <div className="login-container">
      {/* screen info for development */}
      {process.env.NODE_ENV === 'development' && ( 
        <div style={{
          position: 'fixed', 
          top: '10px', 
          right: '10px', 
          padding: '5px 10px', 
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 9999
        }}>
          {screen.width}px {screen.isMobile ? '(Mobile)' : screen.isTablet ? '(Tablet)' : '(Desktop)'}
        </div>
      )}
      <div className="login-wrapper">
        <div className="logo-section">
          <img src={logo} alt="PiscaRISK Logo" className="logo" />
          <h1 className="title">{t('login.title')}</h1>
        </div>
        <p className="bottom-text">{t('login.allRightsReserved')}</p>

        <div className="form-section">
          <form onSubmit={handleLogin}>
            <div className="login-fields-container">
              {/* Social Login Section*/}
              <div className="social-login-section">
                {/*
                <div className="social-login-buttons">
                  <button 
                    type="button"
                    className="social-login-button google"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleLoading}
                    title="Click to sign in with Google. Make sure to allow popups for this site."
                  >
                    <FaGoogle className="social-icon" />
                    <span className="social-login-button-text">
                      {isGoogleLoading ? 'Logging in...' : t('login.continueWithGmail')}
                    </span>
                  </button>
                </div>
                */}
              </div>
              
              {/*
              <div className="login-or-divider">
                <span className="login-or-text">{t('login.or')}</span>
              </div>
              */}

              <p className="login-text">
                {t('login.continueWithExistingAccount')}
              </p>
              <div className="rounded-line"></div>

              <div className={`login-error-message ${error && !(emailVerificationModal && emailVerificationModal.open) ? 'visible' : ''}`}>
                {emailVerificationModal && emailVerificationModal.open ? '' : error}
              </div>

              {resetMessage && (
                <div className="reset-success-message">
                  {resetMessage}
                </div>
              )}

              <div className="input-with-icon">
                <FaEnvelope className="input-icon" />
                <input
                  type="text"
                  name="emailOrContact"
                  placeholder={t('login.emailPhonePlaceholder')}
                  value={formData.emailOrContact}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>
              {contactError && (
                <div className="contact-error-message">
                  {contactError}
                </div>
              )}

              <div className="login-password-wrapper">
                <FaLock className="login-lock-icon" />
                                    <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder={t('login.passwordPlaceholder')}
                    value={formData.password}
                    onChange={handleInputChange}
                    className="login-password-input"
                    required
                  />
                <button 
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <FaEyeSlash className="login-eye-icon" />
                  ) : (
                    <FaEye className="login-eye-icon" />
                  )}
                </button>
              </div>

              <div className="login-btn-container">
                <button type="submit" className="login-btn">
                  {t('login.login')}
                </button>
              </div>

              <p className="forgot-password-text">
                <span
                  className="forgot-password-link"
                  onClick={() => navigate('/forgot-password')}
                >
                  {t('login.forgotPassword')}
                </span>
              </p>

              <p className="belowlogin-text">
                {t('login.dontHaveAccount')}{' '}
                <span
                  className="register-link"
                  onClick={() => navigate("/signup")}
                >
                  {t('login.register')}
                </span>
              </p>

            </div>
          </form>
        </div>
      </div>

      {/* Render email verification modal when needed */}
      {emailVerificationModal && emailVerificationModal.open && (
        <EmailVerificationModal
          email={emailVerificationModal.email}
          onResend={() => {
            // Trigger resend in context
            resendVerificationEmail();
          }}
          onReturn={() => {
            closeEmailVerificationModal();
            // Redirect back to login page
            setError('');
          }}
        />
      )}

      {/* Render phone verification modal when needed */}
      {phoneVerificationModal && phoneVerificationModal.open && (
        <OTPVerification
          open={phoneVerificationModal.open}
          phoneNumber={phoneVerificationModal.phoneNumber}
          onVerify={async (phoneAuthResult) => {
            try {
              const result = await handlePhoneVerificationSuccess(phoneAuthResult);
              if (result.success) {
                if (result.message && result.message.includes('Test')) {
                  // Show success message for test
                  setError('✅ Test phone verification successful! OTP system is working correctly.');
                  setTimeout(() => {
                    setError('');
                    closePhoneVerificationModal();
                  }, 3000);
                } else {
                  // Small delay to ensure state is updated before navigation
                  setTimeout(() => {
                    navigate('/Homepage');
                  }, 100);
                }
              } else {
                setError(result.message || 'Phone verification failed');
              }
            } catch (error) {
              console.error('Phone verification error:', error);
              setError('Phone verification failed. Please try again.');
            }
          }}
          onClose={() => {
            closePhoneVerificationModal();
            setError('');
          }}
        />
      )}
    </div>
  );
}
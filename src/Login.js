import React, { useState, useEffect, useContext } from "react";
import { FaEye, FaEyeSlash, FaEnvelope, FaLock } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next'; // Add this import
import logo from "./assets/images/PISCARISK_LOGO.png";
import { AuthContext } from './contexts/AuthContext';
import EmailVerificationModal from './components/EmailVerificationModal';
import OTPVerification from './components/OtpVerification';
import "./Login.css";
import "./Login.responsive.css";
import { logActivity } from './utils/logger';
import { formatUserInputPH, validatePhilippineMobile, normalizeToE164PH, stripToDigits } from './utils/phonePh';

export default function Login() {
  const { t } = useTranslation(); // Add this hook
  const devError = (...args) => {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error(...args);
    }
  };
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
    login, 
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
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [contactError, setContactError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'emailOrContact') {
      // If the user is typing a number (not email), live format and enforce 09 prefix
      const looksNumeric = /^\+?[\d\s()-]*$/.test(value) && !value.includes('@');
      if (looksNumeric) {
        const prevValue = formData.emailOrContact || '';
        const prevDigits = stripToDigits(prevValue);
        const nextFormatted = formatUserInputPH(value).value;
        const nextDigits = stripToDigits(nextFormatted);

        // Compute local-style digits to enforce 09 prefix
        let localDigits = nextDigits;
        if (nextFormatted.startsWith('+63')) {
          const after = stripToDigits(nextFormatted.slice(3));
          localDigits = after ? `0${after}` : '';
        } else if (nextDigits.startsWith('63')) {
          const after = nextDigits.slice(2);
          localDigits = after ? `0${after}` : '';
        }

        // Allow deletions; enforce prefix on insertions/expansions only
        const isDeletion = nextDigits.length < prevDigits.length;
        if (!isDeletion) {
          if ((localDigits.length === 1 && localDigits[0] !== '0') ||
              (localDigits.length >= 2 && !localDigits.startsWith('09'))) {
            // Reject this change
            setContactError("");
            return;
          }
        }

        setFormData({ ...formData, [name]: nextFormatted });
        setContactError("");
        return;
      }
      setFormData({ ...formData, [name]: value });
      setContactError("");
      return;
    }
    setFormData({ ...formData, [name]: value });
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    // If input is a phone (no @), validate and normalize to +63
    if (!formData.emailOrContact.includes('@')) {
      const phoneValidation = validatePhilippineMobile(formData.emailOrContact);
      if (!phoneValidation.valid) {
        setError(phoneValidation.message || 'Enter a valid PH mobile number.');
        setFormData({ emailOrContact: '', password: '' });
        return;
      }
      const normalized = normalizeToE164PH(formData.emailOrContact) || formData.emailOrContact;
      // Replace input with normalized phone for backend query consistency
      formData.emailOrContact = normalized;
    }
    
    try {
      setIsSubmitting(true);
      const result = await login(formData.emailOrContact, formData.password);
      
      if (result.success) {
        
        // Log successful login first
        try {
          const username = result.username || formData.emailOrContact;
          await logActivity('login', `User ${username} logged in successfully`, username);
        } catch (logError) {
          devError('Failed to log login activity:', logError);
        }
        
        // Navigate immediately - processing flag is cleared in AuthContext
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
        
        // Clear input fields on error
        setFormData({
          emailOrContact: "",
          password: "",
        });
        
        try {
          await logActivity('login', `Failed login attempt for ${formData.emailOrContact}: ${result.message}`, formData.emailOrContact);
        } catch (logError) {
          devError('Failed to log activity:', logError);
        }
      }
    } catch (error) {
      devError('Login error:', error);
      setError(t('login.unexpectedError'));
      
      // Clear input fields on unexpected error
      setFormData({
        emailOrContact: "",
        password: "",
      });
      
      try {
        await logActivity('error', `Login system error: ${error.message}`, formData.emailOrContact);
      } catch (logError) {
        devError('Failed to log activity:', logError);
      }
    }
    finally {
      setIsSubmitting(false);
    }
  };


  // (removed unused unmount cleanup for errorTimeoutRef)


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
          zIndex: 9999,
          color: 'red',
          fontWeight: 'bold',
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
                  disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                <button type="submit" className="login-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Logging in…' : t('login.login')}
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
          onResend={async () => {
            // Trigger resend in context and return the result so the modal can show feedback
            const result = await resendVerificationEmail();
            return result;
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
                  // Mark a short grace window to ignore late reCAPTCHA timeouts
                  try { window.__otpGraceUntil = Date.now() + 60000; } catch (_) {}
                  // Ensure modal is closed to unmount OTP and cleanup reCAPTCHA
                  closePhoneVerificationModal();
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
      {isSubmitting && (
        <div className="login-loading-overlay" role="status" aria-live="polite" aria-label="Logging in">
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'8px'}}>
            <div className="login-spinner" />
            <div className="login-loading-text">{t('login.loggingIn', 'Logging in…')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
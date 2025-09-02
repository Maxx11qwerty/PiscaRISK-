import React, { useState, useRef, useEffect, useContext } from "react";
import { FaEye, FaEyeSlash, FaEnvelope, FaLock, FaGoogle } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next'; // Add this import
import logo from "./assets/images/PISCARISK_LOGO.png";
import { AuthContext } from './contexts/AuthContext';
import EmailVerificationModal from './components/EmailVerificationModal';
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
    login, 
    signInWithGoogle, 
    resetPassword, 
    checkPasswordChangeRequired,
    emailVerificationModal,
    openEmailVerificationModal,
    resendVerificationEmail,
    closeEmailVerificationModal
  } = useContext(AuthContext);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const errorTimeoutRef = useRef();
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [contactError, setContactError] = useState("");

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
    if (!/^\d{11}$/.test(contact)) return t('login.contactNumberInvalid');
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
        try {
          await logActivity('login', `Successful login for ${formData.emailOrContact}`, formData.emailOrContact);
        } catch (logError) {
          console.error('Failed to log activity:', logError);
        }
        
        try {
          const result = await checkPasswordChangeRequired();
          if (result.requiresChange) {
            navigate('/Homepage');
          } else {
            navigate('/Homepage');
          }
        } catch (error) {
          console.error('Error checking password change requirements:', error);
          navigate('/Homepage');
        }
      } else {
        if (result.code === 'show_verification_modal') {
          setError('');
          openEmailVerificationModal(result.email, result.password);
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
    
    try {
      const result = await signInWithGoogle();
      if (result.success) {
        // Check if user needs to change password after admin reset
        try {
          const result = await checkPasswordChangeRequired();
          if (result.requiresChange) {
            // Navigate to homepage which will show the password change modal
            navigate('/Homepage');
          } else {
            // Normal navigation to homepage
            navigate('/Homepage');
          }
        } catch (error) {
          console.error('Error checking password change requirements:', error);
          // Fallback to normal navigation
          navigate('/Homepage');
        }
      }
          } catch (error) {
        console.error('Google login error:', error);
        setError(error.message || t('login.failedToLoginWithGoogle'));
        
        setTimeout(() => {
          setError('');
        }, 3000);
      }
  };

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const preventNavigation = (e) => {
      window.history.pushState(null, '', '/');
      if (e) e.preventDefault();
    };
    
    window.history.pushState(null, '', '/');
    window.addEventListener('popstate', preventNavigation);
    
    return () => {
      window.removeEventListener('popstate', preventNavigation);
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
              <div className="social-login-section">
                <div className="social-login-buttons">
                  <button 
                    type="button"
                    className="social-login-button google"
                    onClick={handleGoogleLogin}
                  >
                    <FaGoogle className="social-icon" />
                    <span className="social-login-button-text">{t('login.continueWithGmail')}</span>
                  </button>
                </div>
              </div>
              
              <div className="login-or-divider">
                <span className="login-or-text">{t('login.or')}</span>
              </div>
              
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
    </div>
  );
}
import React, { useState, useRef, useEffect, useContext } from "react";
import { FaEye, FaEyeSlash,FaEnvelope,FaLock, FaGoogle, FaFacebook } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import logo from "./assets/images/PISCARISK_LOGO.png";
import { AuthContext } from './contexts/AuthContext';
import "./Login.css";
import { logActivity } from './utils/logger';
import OtpVerification from './components/OtpVerification';

export default function Login() {
  const [formData, setFormData] = useState({
    usernameOrEmail: "",
    password: "",
  });
  const { login, signInWithGoogle, signInWithFacebook, resetPassword } = useContext(AuthContext);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const errorTimeoutRef = useRef();
  const [showPassword, setShowPassword] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const otpCode = "1234";

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await login(formData.usernameOrEmail, formData.password);
      
      if (result.success) {
        try {
          await logActivity('login', `Successful login for ${formData.usernameOrEmail}`, formData.usernameOrEmail);
        } catch (logError) {
          console.error('Failed to log activity:', logError);
        }
        setShowOtp(true);
      } else {
        if (result.code === 'auth/account-inactive') {
          setError(result.message);
        } else {
          setError(result.message || 'Invalid username or password');
        }
        
        try {
          await logActivity('login', `Failed login attempt for ${formData.usernameOrEmail}: ${result.message}`, formData.usernameOrEmail);
        } catch (logError) {
          console.error('Failed to log activity:', logError);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('An unexpected error occurred. Please try again.');
      
      try {
        await logActivity('error', `Login system error: ${error.message}`, formData.usernameOrEmail);
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }
  };
  
  const handleOtpVerify = () => {
    setShowOtp(false);
    navigate('/Homepage');
  };

  const handleGoogleLogin = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    
    try {
      const result = await signInWithGoogle();
      if (result.success) {
        if (result.user.emailVerified) {
          setShowOtp(true);
        } else {
          setError('Please verify your email before logging in');
        }
      }
    } catch (error) {
      console.error('Google login error:', error);
      setError(error.message || 'Failed to login with Google');
      
      setTimeout(() => {
        setError('');
      }, 3000);
    }
  };

  const handleFacebookLogin = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await signInWithFacebook();
      if (result.success) {
        setShowOtp(true);
      }
    } catch (error) {
      setError(error.message || 'Failed to login with Facebook');
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
      <div className="login-wrapper">
        <div className="logo-section">
          <img src={logo} alt="PiscaRISK Logo" className="logo" />
          <h1 className="title">PiscaRISK</h1>
        </div>
        <p className="bottom-text">All Rights Reserved</p>

        <div className="form-section">
          <form onSubmit={handleLogin}>
            
          <div className="social-login-section">
            <div className="social-login-buttons">
              <button 
                type="button"
                className="social-login-button google"
                onClick={handleGoogleLogin}
              >
                <FaGoogle className="social-icon" />
                <span className="social-login-button-text">Continue with Gmail</span>
              </button>
              <button 
                type="button"
                className="social-login-button facebook"
                onClick={handleFacebookLogin}
              >
                <FaFacebook className="social-icon" />
                <span className="social-login-button-text">Continue with Facebook</span>
              </button>
            </div>
          </div>
            <p className="login-text">
              Continue with an existing email account
            </p>
            <div className="rounded-line"></div>

            <div className={`login-error-message ${error ? 'visible' : ''}`}>
              {error}
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
              name="usernameOrEmail"
              placeholder="Username/Email"
              value={formData.usernameOrEmail}
              onChange={(e) => setFormData({ ...formData, usernameOrEmail: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div className="login-password-wrapper">
            <FaLock className="login-lock-icon" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                Login
              </button>
            </div>

            <p className="forgot-password-text">
              <span
                className="forgot-password-link"
                onClick={() => navigate('/forgot-password')}
              >
                Forgot Password?
              </span>
            </p>

            <p className="belowlogin-text">
              Don't have an account?{' '}
              <span
                className="register-link"
                onClick={() => navigate("/signup")}
              >
                Register
              </span>
            </p>
          </form>
        </div>
      </div>

      <OtpVerification
        open={showOtp}
        code={otpCode}
        onVerify={handleOtpVerify}
        onClose={() => setShowOtp(false)}
      />
    </div>
  );
}
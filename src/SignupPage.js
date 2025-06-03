import React, { useState, useEffect, useContext  } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash, FaEnvelope, FaUser, FaLock, FaGoogle, FaFacebook } from "react-icons/fa";
import logo from "./assets/images/PISCARISK_LOGO.png";
import { AuthContext } from './contexts/AuthContext';
import { logActivity, logMessages } from './utils/logger';
import "./SignupPage.css";
import OtpVerification from './components/OtpVerification';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    agree: false,
  });

  const { signup } = useContext(AuthContext);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const otpCode = "1234";
  const [success, setSuccess] = useState("");

  // Clear localStorage when component mounts (for development only)
  useEffect(() => {
    // deleting all users for testing only
    localStorage.removeItem('allUsers');
    localStorage.removeItem('userData');
    localStorage.removeItem('currentUser');
    console.log('LocalStorage cleared for development');
  }, []);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Check for empty fields
    if (!formData.email.trim() || !formData.username.trim() || !formData.password.trim() || !formData.confirmPassword.trim()) {
      const errorMsg = "All fields are required";
      setError(errorMsg);
      logActivity('error', logMessages.error.validation(errorMsg), formData.username);
      return;
    }
    // Email format validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(formData.email)) {
      const errorMsg = "Please enter a valid email address.";
      setError(errorMsg);
      logActivity('error', logMessages.error.validation(errorMsg), formData.username);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      const errorMsg = "Passwords do not match";
      setError(errorMsg);
      logActivity('error', logMessages.error.validation(errorMsg), formData.username);
      return;
    }
    if (!formData.agree) {
      const errorMsg = "You must agree to the terms and conditions";
      setError(errorMsg);
      logActivity('error', logMessages.error.validation(errorMsg), formData.username);
      return;
    }
    try {
      await signup(
        formData.email,
        formData.username,
        formData.password
      );
      logActivity('account', logMessages.account.userCreated('system', formData.username), formData.username);
      
      // Show success message about account activation
      setError('');
      setSuccess('Registration successful! Your account is pending admin approval. You will be notified once your account is activated.');
      
      // Navigate to login page after a delay
      setTimeout(() => {
        navigate("/");
      }, 3000);
    } catch (err) {
      setError(err.message);
      logActivity('error', logMessages.error.validation(err.message), formData.username);
    }
  };

  const handleRegisterGoogle = () => {
    // Implement Google login
    console.log('Google login clicked');
  };

  const handleRegisterFacebook = () => {
    // Implement Facebook login
    console.log('Facebook login clicked');
  };

  const handleOtpVerify = () => {
    setShowOtp(false);
    navigate("/");
  };

  return (
    <div className={`signup-container${showOtp ? ' otp-blur-parent' : ''}`}>
      <div className="signup-wrapper">
        <div className="logo-section">
        <img src={logo} alt="PiscaRisk Logo" className="logo" />
          <h1 className="title">PiscaRISK</h1>
        </div>
        <p className="bottom-text">
        All Rights Reserved
        </p>

        <div className="sign-form-section">
          <form onSubmit={handleSubmit}>
          <div className="social-sign-section">
            <div className="social-sign-buttons">
              <button 
                className="social-sign-button google"
                onClick={handleRegisterGoogle}
              >
                <FaGoogle className="social-icon" />
                <span className="social-sign-text">Sign in with Gmail</span>
              </button>
              <button 
                className="social-sign-button facebook"
                onClick={handleRegisterFacebook}
              >
                <FaFacebook className="social-icon" />
                <span className="social-sign-text">Sign in with Facebook</span>
              </button>
            </div>
          </div>
            <p className="sign-register-text">
            Register with your email address account
            </p>
            <div className="sign-rounded-line"></div>
            <div className={`sign-error-message ${error ? 'visible' : ''}`}> {error} </div>
            <div className="input-with-icon">
              <FaEnvelope className="input-icon" />
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="sign-input-field"
              required
            />
            </div>

            <div className="input-with-icon">
            <FaUser className="input-icon" />
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              className="sign-input-field"
              required
            />
          </div>

            <div className="signup-password-wrapper">
              <FaLock className="login-lock-icon" />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                className="signup-password-input"
                required
              />
              <button 
                type="button"
                className="signup-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <FaEyeSlash className="signup-eye-icon" />
                ) : (
                  <FaEye className="signup-eye-icon" />
                )}
              </button>
            </div>

            <div className="signup-password-wrapper">
            <FaLock className="login-lock-icon" />
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="signup-password-input"
                required
              />
              <button 
                type="button"
                className="signup-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <FaEyeSlash className="signup-eye-icon" />
                ) : (
                  <FaEye className="signup-eye-icon" />
                )}
              </button>
            </div>

            <div className="sign-checkbox-row">
              <input
                type="checkbox"
                name="agree"
                checked={formData.agree}
                onChange={handleChange}
                className="sign-checkbox"
                required
              />
              <label className="sign-terms-text">
                I agree to the{' '}
                <a href="#" className="sign-terms-link" onClick={e => { e.preventDefault(); setShowTerms(true); }}>
                  Terms and Conditions
                </a>
              </label>
            </div>

            <div className="create-btn-container">
            <button
            type="button"
            className="create-btn"
            onClick={handleSubmit} // Changed from navigate("/") to handleSubmit
          >
            Create Account
          </button>
          </div>
          
          <p className="sign-login-text">
          Already have an account?{' '}
          <span
          className="sign-login-link"
          onClick={() => navigate("/")}
        >
          Login
        </span>
        </p>

          </form>
        </div>
      </div>
      {showTerms && (
        <div className="terms-modal-overlay" onClick={() => setShowTerms(false)}>
          <div className="terms-modal" onClick={e => e.stopPropagation()}>
            <div className="terms-modal-header">
              <span>PiscaRISK's Terms and Conditions</span>
              <button className="terms-modal-close" onClick={() => setShowTerms(false)}>×</button>
            </div>
            <div className="terms-modal-content">
              <p>
                By accessing and using the PiscaRISK web application, you agree to comply with all applicable terms and conditions outlined by the platform. This web application is intended solely for authorized administrators and technical officers tasked with managing user accounts, system configurations, and reviewing operational data. You are responsible for maintaining the security of your login credentials and ensuring that any actions taken under your account are legitimate and within your authorized role. Any form of misuse, including unauthorized access, data manipulation, or system tampering, is strictly prohibited and may result in immediate suspension of access, as well as potential legal consequences. All activity within the web application may be monitored and recorded for security and audit purposes. PiscaRISK reserves the right to modify or update these terms at any time without prior notice, and continued use of the web platform constitutes acceptance of such changes.
              </p>
            </div>
            <div className="terms-modal-footer">
              <button className="terms-modal-continue" onClick={() => setShowTerms(false)}>Continue</button>
            </div>
          </div>
        </div>
      )}
      <OtpVerification 
        open={showOtp} 
        code={otpCode} 
        onVerify={handleOtpVerify}
        onClose={() => setShowOtp(false)}
      />
    </div>
  );
}

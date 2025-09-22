import React, { useState, useEffect, useContext  } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash, FaEnvelope, FaUser, FaLock, FaGoogle, FaPhone } from "react-icons/fa";
import logo from "./assets/images/PISCARISK_LOGO.png";
import { AuthContext } from './contexts/AuthContext';
import { logActivity, logMessages } from './utils/logger';
import "./SignupPage.css";
import "./SignupPage.responsive.css";
import OTPVerification from './components/OtpVerification';

export default function SignupPage() {
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
    email: "",
    username: "",
    contactNumber: "",
    farmId: "", // Add farm selection
    password: "",
    confirmPassword: "",
    agree: false,
  });

  const { signup, signInWithGoogle } = useContext(AuthContext);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const otpCode = "1234";
  const [success, setSuccess] = useState("");
  const [farms, setFarms] = useState([]);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Clear localStorage when component mounts (for development only)
  useEffect(() => {
    // deleting all users for testing only
    localStorage.removeItem('allUsers');
    localStorage.removeItem('userData');
    localStorage.removeItem('currentUser');
    // Fetch farms from Firebase
    fetchFarms();
  }, []);

  // Function to fetch farms from Firebase
  const fetchFarms = async () => {
    try {
      setLoadingFarms(true);
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      const farmsCollection = collection(db, 'farms');
      const farmsSnapshot = await getDocs(farmsCollection);
      
      const farmsList = farmsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setFarms(farmsList);
    } catch (error) {
      console.error('Error fetching farms:', error);
      setError('Failed to load farms. Please try again.');
    } finally {
      setLoadingFarms(false);
    }
  };

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
    if (!formData.email.trim() || !formData.username.trim() || !formData.contactNumber.trim() || !formData.farmId || !formData.password.trim() || !formData.confirmPassword.trim()) {
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
    // Contact number validation (11 digits)
    const contactRegex = /^\d{11}$/;
    if (!contactRegex.test(formData.contactNumber)) {
      const errorMsg = "Contact number must be exactly 11 digits.";
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
        formData.contactNumber,
        formData.farmId,
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

  const handleRegisterGoogle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    
    // Validate farm selection and terms agreement before proceeding
    if (!formData.farmId) {
      setError('Please select a farm before signing up with Google.');
      return;
    }
    
    if (!formData.agree) {
      setError('You must agree to the terms and conditions before signing up with Google.');
      return;
    }
    
    setIsGoogleLoading(true);
    
    let result;
    try {
      // Store farm selection in localStorage for use after Google sign-in
      localStorage.setItem('googleSignUpFarmId', formData.farmId);
      
      result = await signInWithGoogle();
      
      if (result.isRedirect) {
        // Show a message that we're redirecting to Google
        setError('Redirecting to Google sign-in...');
        // Don't set loading to false yet, as we're redirecting
      } else if (result.success) {
        // Navigate to homepage after successful Google sign-in
        navigate('/Homepage');
        setIsGoogleLoading(false);
      }
    } catch (error) {
      
      
      // Provide more specific error messages
      let errorMessage = 'Failed to sign up with Google';
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
        errorMessage = error.message || 'Failed to sign up with Google';
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

  const handleOtpVerify = () => {
    setShowOtp(false);
    navigate("/");
  };

  return (
    <div className={`signup-container${showOtp ? ' otp-blur-parent' : ''}`}>
      {/* screen info for development */}
      {process.env.NODE_ENV === 'development' && ( 
        <div style={{
          position: 'fixed', 
          top: '10px', 
          right: '10px', 
          background: 'rgba(0,0,0,0.8)', 
          color: 'white', 
          padding: '5px 10px', 
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 9999
        }}>
          {screen.width}px {screen.isMobile ? '(Mobile)' : screen.isTablet ? '(Tablet)' : '(Desktop)'}
        </div>
      )}
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
          {/* Social Login Section 
          <div className="social-sign-section">
            <div className="social-sign-buttons">
              <button 
                className="social-sign-button google"
                onClick={handleRegisterGoogle}
                disabled={isGoogleLoading}
                title="Click to sign up with Google. Make sure to allow popups for this site."
              >
                <FaGoogle className="social-icon" />
                <span className="social-sign-text">
                  {isGoogleLoading ? 'Sign in with Google...' : 'Sign in with Gmail'}
                </span>
              </button>
            </div>
          </div>

            <div className="or-divider">
              <span className="or-text">or</span>
            </div>
            */}

            <p className="sign-login-text">
              Create Your Account <br />
              Fill in your details to get started.
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
          <div className="input-with-icon">
            <FaPhone className="input-icon" />
            <input
              type="text"
              name="contactNumber"
              placeholder="Contact Number"
              value={formData.contactNumber}
              onChange={handleChange}
              className="sign-input-field"
              required
            />
          </div>

          <div className="farm-selection-wrapper">
            <select
              name="farmId"
              value={formData.farmId}
              onChange={handleChange}
              className="farm-select-field"
              required
            >
              <option value="">Select a Farm</option>
              {loadingFarms ? (
                <option value="" disabled>Loading farms...</option>
              ) : (
                farms.map(farm => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name} - {farm.location}
                  </option>
                ))
              )}
            </select>
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
      <OTPVerification 
        open={showOtp} 
        code={otpCode} 
        onVerify={handleOtpVerify}
        onClose={() => setShowOtp(false)}
      />
    </div>
  );
}

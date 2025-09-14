import React, { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import './OtpVerification.css';

const OTPVerification = ({ open, phoneNumber, onVerify, onClose, onResend }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [verificationId, setVerificationId] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const recaptchaVerifier = useRef(null);

  useEffect(() => {
    if (open) {
      setOtp(['', '', '', '', '', '']);
      setError('');
      setVerificationId('');
      setConfirmationResult(null);
      setRetryCount(0);
      
      // Focus first input when modal opens
      const firstInput = document.getElementById('otp-0');
      if (firstInput) firstInput.focus();
      
      // Initialize reCAPTCHA asynchronously
      initializeRecaptcha().catch(error => {
        console.error('Error in initializeRecaptcha:', error);
      });
    } else {
      // Clean up reCAPTCHA when modal closes
      if (recaptchaVerifier.current) {
        try {
          recaptchaVerifier.current.clear();
        } catch (error) {
          console.error('Error clearing reCAPTCHA:', error);
        }
        recaptchaVerifier.current = null;
      }
      
      // Clear global reCAPTCHA verifier
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (error) {
          console.error('Error clearing global reCAPTCHA:', error);
        }
        window.recaptchaVerifier = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (recaptchaVerifier.current) {
        try {
          recaptchaVerifier.current.clear();
        } catch (error) {
          console.error('Error clearing reCAPTCHA on unmount:', error);
        }
        recaptchaVerifier.current = null;
      }
      
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (error) {
          console.error('Error clearing global reCAPTCHA on unmount:', error);
        }
        window.recaptchaVerifier = null;
      }
    };
  }, [open]);

  const initializeRecaptcha = async () => {
    try {
      // Clear any existing reCAPTCHA more thoroughly
      if (recaptchaVerifier.current) {
        try {
          recaptchaVerifier.current.clear();
        } catch (clearError) {
          console.log('Error clearing reCAPTCHA:', clearError);
        }
        recaptchaVerifier.current = null;
      }
      
      // Clear global reCAPTCHA verifier
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (clearError) {
          console.log('Error clearing global reCAPTCHA:', clearError);
        }
        window.recaptchaVerifier = null;
      }
      
      // Clear the container element completely
      const container = document.getElementById('recaptcha-container');
      if (container) {
        container.innerHTML = '';
      }
      
      // Wait for DOM to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if the reCAPTCHA container exists
      if (!container) {
        console.error('reCAPTCHA container not found');
        setError('reCAPTCHA container not found. Please refresh the page.');
        return;
      }
      
      // Check if Firebase compat is available
      if (!firebase || !firebase.auth) {
        console.error('Firebase compat not properly initialized');
        setError('Firebase not ready. Please refresh the page.');
        return;
      }

      console.log('Firebase compat is ready:', {
        hasFirebase: !!firebase,
        hasAuth: !!firebase.auth,
        hasApp: !!firebase.apps?.length
      });

      // Use Firebase compat library for reCAPTCHA
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'invisible'
      });
      
      // Render the reCAPTCHA
      await window.recaptchaVerifier.render();
      
      // Store reference for cleanup
      recaptchaVerifier.current = window.recaptchaVerifier;

      console.log('reCAPTCHA verifier created successfully with compat library');
      setError(''); // Clear any previous errors
      
    } catch (error) {
      console.error('Error initializing reCAPTCHA with compat library:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // If reCAPTCHA already rendered error, try to use existing one
      if (error.message.includes('already been rendered')) {
        console.log('reCAPTCHA already rendered, attempting to use existing one');
        try {
          // Try to find existing reCAPTCHA
          const existingVerifier = window.recaptchaVerifier || recaptchaVerifier.current;
          if (existingVerifier) {
            console.log('Using existing reCAPTCHA verifier');
            recaptchaVerifier.current = existingVerifier;
            setError(''); // Clear any previous errors
            return;
          }
        } catch (existingError) {
          console.error('Error using existing reCAPTCHA:', existingError);
        }
      }
      
      setError('Failed to initialize verification. Please refresh the page.');
    }
  };

  const sendOTP = async () => {
    if (!phoneNumber) {
      setError('Phone number is required');
      return;
    }

    setIsSendingOTP(true);
    setError('');

    // Format phone number for Firebase (remove spaces and ensure proper format)
    const formattedPhoneNumber = phoneNumber.replace(/\s/g, '');
    console.log('Sending OTP to:', formattedPhoneNumber);
    console.log('Phone number length:', formattedPhoneNumber.length);
    console.log('Phone number format check:', /^\+63\d{10}$/.test(formattedPhoneNumber));

    try {
      // Check if we're in development mode and rate limited
      const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isDevelopment && retryCount > 2) {
        console.log('Development mode: Using fallback due to rate limiting');
        setVerificationId('dev-fallback');
        setError('Development mode: Use OTP "123456" for testing (rate limited).');
        return;
      }
      
      // Use Firebase compat library for phone authentication
      console.log('Using Firebase compat library for phone authentication');
      
      // Check if reCAPTCHA is ready
      if (!window.recaptchaVerifier && !recaptchaVerifier.current) {
        console.error('reCAPTCHA not ready, attempting to initialize...');
        await initializeRecaptcha();
        
        if (!window.recaptchaVerifier && !recaptchaVerifier.current) {
          setError('reCAPTCHA initialization failed. Please refresh the page and try again.');
          return;
        }
      }

      try {
        // Send OTP using Firebase compat library
        const confirmationResult = await firebase.auth().signInWithPhoneNumber(formattedPhoneNumber, window.recaptchaVerifier);
        console.log('OTP sent successfully via Firebase compat library');
        
        // Store the confirmation result for verification
        setConfirmationResult(confirmationResult);
        setVerificationId('real-verification');
        setError('');
        
      } catch (phoneError) {
        console.error('Firebase compat phone auth failed:', phoneError);
        
        // Handle specific Firebase errors
        if (phoneError.code === 'auth/too-many-requests') {
          const waitTime = Math.min(60 * Math.pow(2, retryCount), 300); // Exponential backoff, max 5 minutes
          setError(`Too many verification attempts. Please wait ${Math.ceil(waitTime/60)} minute(s) before trying again.`);
          setRetryCount(prev => prev + 1);
        } else if (phoneError.code === 'auth/invalid-phone-number') {
          setError('Invalid phone number format. Please check your number.');
        } else if (phoneError.code === 'auth/invalid-app-credential' || 
                   phoneError.code === 'auth/missing-app-credential') {
          setError('Phone authentication not properly configured. Please contact support.');
        } else if (phoneError.code === 'auth/quota-exceeded') {
          setError('SMS quota exceeded. Please try again later or contact support.');
        } else if (phoneError.message.includes('reCAPTCHA')) {
          setError('reCAPTCHA verification failed. Please refresh the page and try again.');
        } else {
          setError(`Failed to send OTP: ${phoneError.message}`);
        }
        throw phoneError;
      }

      // This code block is no longer needed since we're using the compat library above
      // Keeping it as a fallback comment for reference
    } catch (error) {
      console.error('Error sending OTP:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      
      if (error.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number format. Please include country code (e.g., +63)');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again later.');
      } else if (error.code === 'auth/internal-error') {
        setError('reCAPTCHA verification failed. Please refresh the page and try again.');
      } else if (error.code === 'auth/invalid-app-credential') {
        setError('reCAPTCHA configuration issue. This might be due to Firebase project settings. Please try again or contact support.');
      } else if (error.code === 'auth/missing-phone-number') {
        setError('Phone number is required.');
      } else if (error.code === 'auth/quota-exceeded') {
        setError('SMS quota exceeded. Please try again later.');
      } else {
        setError(`Failed to send OTP: ${error.message}`);
      }
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleInputChange = (index, value) => {
    if (value.length > 1) return; // Prevent multiple characters
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace to go to previous input
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handleSubmit = async () => {
    const otpString = otp.join('');
    
    if (otpString.length !== 6) {
      setError('Please enter a 6-digit OTP');
      return;
    }

    if (!verificationId) {
      setError('Please send OTP first');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Check if this is a development fallback verification
      if (verificationId === 'dev-fallback') {
        console.log('Using development fallback verification - checking OTP:', otpString);
        if (otpString === '123456') {
          const mockResult = {
            user: {
              uid: 'dev-user-id',
              phoneNumber: phoneNumber,
              displayName: 'Dev User'
            }
          };
          console.log('Development fallback OTP verified successfully');
          await onVerify(mockResult);
          return;
        } else {
          setError('Invalid OTP. Use 123456 for development testing.');
          setOtp(['', '', '', '', '', '']);
          const firstInput = document.getElementById('otp-0');
          if (firstInput) firstInput.focus();
          return;
        }
      }

      // All phone numbers now use real Firebase phone authentication

      // Use Firebase compat library for OTP verification
      if (confirmationResult) {
        try {
          const result = await confirmationResult.confirm(otpString);
          console.log('OTP verified successfully with Firebase compat library');
          await onVerify(result);
          return;
        } catch (error) {
          console.error('Error confirming OTP with compat library:', error);
          if (error.code === 'auth/invalid-verification-code') {
            setError('Invalid OTP. Please try again.');
          } else if (error.code === 'auth/code-expired') {
            setError('OTP has expired. Please request a new one.');
            setVerificationId('');
            setConfirmationResult(null);
          } else {
            setError('Verification failed. Please try again.');
          }
          setOtp(['', '', '', '', '', '']);
          const firstInput = document.getElementById('otp-0');
          if (firstInput) firstInput.focus();
          return;
        }
      } else {
        setError('No confirmation result available. Please send OTP again.');
        return;
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      if (error.code === 'auth/invalid-verification-code') {
        setError('Invalid OTP. Please try again.');
      } else if (error.code === 'auth/code-expired') {
        setError('OTP has expired. Please request a new one.');
        setVerificationId('');
      } else {
        setError('Verification failed. Please try again.');
      }
      setOtp(['', '', '', '', '', '']);
      // Focus first input for retry
      const firstInput = document.getElementById('otp-0');
      if (firstInput) firstInput.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setOtp(['', '', '', '', '', '']);
    setVerificationId('');
    
    // Send new OTP
    await sendOTP();
    
    const firstInput = document.getElementById('otp-0');
    if (firstInput) firstInput.focus();
  };

  if (!open) return null;

  return (
    <div className="otp-overlay">
      <div className="otp-modal">
        <div className="otp-header">
          <h3>Phone Verification</h3>
          <button className="otp-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="otp-content">
          <div className="otp-rounded-line"></div>
          <p className="otp-description">
            {verificationId 
              ? `Please enter the 6-digit verification code sent to ${phoneNumber}`
              : `Click "Send OTP" to receive a verification code on ${phoneNumber}`
            }
          </p>
          
          {error && <div className="otp-error">{error}</div>}
          
          {!verificationId && (
            <button 
              className="otp-send-btn"
              onClick={sendOTP}
              disabled={isSendingOTP}
            >
              {isSendingOTP ? 'Sending...' : 'Send OTP'}
            </button>
          )}
          
          {verificationId && (
            <>
              <div className="otp-inputs">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    id={`otp-${index}`}
                    type="text"
                    maxLength="1"
                    value={digit}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="otp-input"
                    placeholder="0"
                  />
                ))}
              </div>
              
              <button 
                className="otp-verify-btn"
                onClick={handleSubmit}
                disabled={isLoading || otp.join('').length !== 6}
              >
                {isLoading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </>
          )}
          
          <div className="otp-resend">
            <span>Didn't receive the code? </span>
            <button 
              className="otp-resend-btn"
              onClick={handleResend}
              disabled={isLoading || isSendingOTP}
            >
              Resend
            </button>
          </div>
        </div>
        
        {/* Hidden reCAPTCHA container */}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
};

export default OTPVerification; 
import React, { useState, useEffect, useRef } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { auth } from '../firebase';
import './OtpVerification.css';

const OTPVerification = ({ open, phoneNumber, onVerify, onClose, onResend }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const recaptchaVerifierRef = useRef(null);
  
  const recaptchaEnterpriseLoaded = useRef(false);

    // Load reCAPTCHA Enterprise script
    useEffect(() => {
      if (typeof window !== 'undefined' && window.grecaptcha && window.grecaptcha.enterprise) {
        recaptchaEnterpriseLoaded.current = true;
        console.log('reCAPTCHA Enterprise loaded');
      } else {
        console.log('reCAPTCHA Enterprise not loaded');
      }
    }, []);

    useEffect(() => {
      if (open) {
        setOtp(['', '', '', '', '', '']);
        setError('');
        setConfirmationResult(null);
        setRetryCount(0);
        
        setTimeout(() => {
          const firstInput = document.getElementById('otp-0');
          if (firstInput) firstInput.focus();
        }, 100);
      }
      
      return () => {
        if (recaptchaVerifierRef.current) {
          try {
            recaptchaVerifierRef.current.clear();
          } catch (error) {
            console.error('Error cleaning up reCAPTCHA:', error);
          }
        }
      };
    }, [open]);
  
    // NEW: Get reCAPTCHA Enterprise token
    const getRecaptchaToken = async () => {
      try {
        if (!window.grecaptcha || !window.grecaptcha.enterprise) {
          throw new Error('reCAPTCHA not loaded');
        }
  
        const token = await window.grecaptcha.enterprise.execute(
          '6LcfiMorAAAAANiZcyAwFAMoD0nEaH_fEvIcdV_8', 
          { action: 'SEND_OTP' }
        );
        
        return token;
      } catch (error) {
        console.error('Error getting reCAPTCHA token:', error);
        throw new Error('Security verification failed');
      }
    };

  const initializeRecaptcha = () => {
    try {
      cleanupRecaptcha();
      
      // Clear container
      const container = document.getElementById('recaptcha-container');
      if (container) {
        container.innerHTML = '';
        
        recaptchaVerifierRef.current = new firebase.auth.RecaptchaVerifier(
          'recaptcha-container',
          {
            size: 'invisible',
            callback: () => {
              console.log('reCAPTCHA solved successfully');
            },
            'expired-callback': () => {
              console.log('reCAPTCHA expired');
              setError('Verification expired. Please try again.');
            },
            // Add the site key parameter
            'sitekey': '6LcfiMorAAAAANiZcyAwFAMoD0nEaH_fEvIcdV_8'
          }
        );
        
        console.log('reCAPTCHA verifier created successfully with compat API');
      }
    } catch (error) {
      console.error('Error initializing reCAPTCHA:', error);
      // Don't show error to user yet
    }
  };

  const cleanupRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch (error) {
        console.error('Error cleaning up reCAPTCHA:', error);
      }
      recaptchaVerifierRef.current = null;
    }
  };

  const sendOTP = async () => {
    if (!phoneNumber) {
      setError('Phone number is required');
      return;
    }
  
    setIsSendingOTP(true);
    setError('');
  
    try {
      const formattedPhoneNumber = phoneNumber.replace(/\s/g, '');
      console.log('Sending OTP to:', formattedPhoneNumber);
  
      if (!/^\+63\d{10}$/.test(formattedPhoneNumber)) {
        setError('Please enter a valid Philippine phone number (+63XXXXXXXXXX)');
        return;
      }
  
      // Initialize Firebase reCAPTCHA
      cleanupRecaptcha();
      const container = document.getElementById('recaptcha-container');
      if (container) {
        container.innerHTML = '';
        
        recaptchaVerifierRef.current = new firebase.auth.RecaptchaVerifier(
          'recaptcha-container',
          {
            size: 'invisible',
            callback: () => {
              console.log('reCAPTCHA solved successfully');
            },
            'expired-callback': () => {
              console.log('reCAPTCHA expired');
              setError('Verification expired. Please try again.');
            }
          }
        );
      }
  
      // Send OTP using Firebase
      console.log('Attempting to send OTP...');
      const confirmation = await firebase.auth().signInWithPhoneNumber(
        formattedPhoneNumber,
        recaptchaVerifierRef.current
      );
  
      setConfirmationResult(confirmation);
      setError('');
      console.log('OTP sent successfully!');
  
    } catch (error) {
      console.error('Error sending OTP:', error);
      setRetryCount(prev => prev + 1);
      
      // Handle specific error cases
      switch (error.code) {
        case 'auth/invalid-phone-number':
          setError('Invalid phone number format. Please use +63XXXXXXXXXX format.');
          break;
        case 'auth/too-many-requests':
          setError('Too many attempts. Please try again later.');
          break;
        case 'auth/invalid-app-credential':
          setError('Phone authentication not configured. Please check Firebase reCAPTCHA settings.');
          break;
        case 'auth/quota-exceeded':
          setError('SMS quota exceeded. Please try again tomorrow.');
          break;
        case 'auth/argument-error':
          setError('Verification system error. Please check reCAPTCHA configuration.');
          break;
        default:
          setError(`Failed to send verification: ${error.message}`);
      }
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleSendError = (error) => {
    switch (error.code) {
      case 'auth/invalid-phone-number':
        setError('Invalid phone number format. Please use +63XXXXXXXXXX format.');
        break;
      case 'auth/too-many-requests':
        setError('Too many attempts. Please try again in 30 minutes.');
        break;
      case 'auth/invalid-app-credential':
        setError('Phone authentication not configured. Please check Firebase reCAPTCHA settings.');
        break;
      case 'auth/quota-exceeded':
        setError('SMS quota exceeded. Please try again tomorrow.');
        break;
      case 'auth/argument-error':
        setError('Verification system error. Please try again or contact support.');
        break;
      default:
        setError(error.message || 'Failed to send verification code. Please try again.');
    }
  };

  const verifyOTP = async () => {
    const otpString = otp.join('');
    
    if (otpString.length !== 6) {
      setError('Please enter a 6-digit OTP');
      return;
    }

    if (!confirmationResult) {
      setError('Please send OTP first');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Handle development fallback
      if (confirmationResult.isDevFallback) {
        if (otpString === '123456') {
          const mockResult = {
            user: {
              uid: 'dev-user-' + Date.now(),
              phoneNumber: phoneNumber,
              displayName: 'Test User'
            }
          };
          await onVerify(mockResult);
          return;
        } else {
          setError('Invalid OTP. Use 123456 for development testing.');
          return;
        }
      }

      // Real Firebase verification
      const result = await confirmationResult.confirm(otpString);
      await onVerify(result);
      
    } catch (error) {
      console.error('Error verifying OTP:', error);
      
      if (error.code === 'auth/invalid-verification-code') {
        setError('Invalid verification code. Please try again.');
      } else if (error.code === 'auth/code-expired') {
        setError('Code expired. Please request a new one.');
        setConfirmationResult(null);
      } else {
        setError('Verification failed. Please try again.');
      }
      
      // Reset OTP inputs
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => {
        const firstInput = document.getElementById('otp-0');
        if (firstInput) firstInput.focus();
      }, 100);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (index, value) => {
    if (value.length > 1) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.replace(/\D/g, ''); // Only allow digits
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      setTimeout(() => {
        const nextInput = document.getElementById(`otp-${index + 1}`);
        if (nextInput) nextInput.focus();
      }, 10);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      setTimeout(() => {
        const prevInput = document.getElementById(`otp-${index - 1}`);
        if (prevInput) prevInput.focus();
      }, 10);
    }
  };

  const handleResend = async () => {
    setError('');
    setOtp(['', '', '', '', '', '']);
    setConfirmationResult(null);
    cleanupRecaptcha();
    
    await sendOTP();
    
    setTimeout(() => {
      const firstInput = document.getElementById('otp-0');
      if (firstInput) firstInput.focus();
    }, 100);
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
            {confirmationResult 
              ? `Please enter the 6-digit verification code sent to ${phoneNumber}`
              : `Click "Send OTP" to receive a verification code on ${phoneNumber}`
            }
          </p>
          
          {error && <div className="otp-error">{error}</div>}
          
          {!confirmationResult && (
            <button 
              className="otp-send-btn"
              onClick={sendOTP}
              disabled={isSendingOTP}
            >
              {isSendingOTP ? 'Sending...' : 'Send OTP'}
            </button>
          )}
          
          {confirmationResult && (
            <>
              <div className="otp-inputs">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    id={`otp-${index}`}
                    type="text"
                    inputMode="numeric"
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
                onClick={verifyOTP}
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
        <div id="recaptcha-container" style={{ display: 'none' }}></div>
      </div>
    </div>
  );
};

export default OTPVerification;
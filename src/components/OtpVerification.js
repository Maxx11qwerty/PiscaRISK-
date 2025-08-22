import React, { useState, useEffect } from 'react';
import './OtpVerification.css';

const OTPVerification = ({ open, code, onVerify, onClose }) => {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setOtp(['', '', '', '']);
      setError('');
      // Focus first input when modal opens
      const firstInput = document.getElementById('otp-0');
      if (firstInput) firstInput.focus();
    }
  }, [open]);

  const handleInputChange = (index, value) => {
    if (value.length > 1) return; // Prevent multiple characters
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 3) {
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
    
    if (otpString.length !== 4) {
      setError('Please enter a 4-digit OTP');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Verify OTP against the provided code
      if (otpString === code) {
        await onVerify();
      } else {
        setError('Invalid OTP. Please try again.');
        setOtp(['', '', '', '']);
        // Focus first input for retry
        const firstInput = document.getElementById('otp-0');
        if (firstInput) firstInput.focus();
      }
    } catch (error) {
      setError('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = () => {
    // This would typically trigger a new OTP to be sent
    setError('');
    setOtp(['', '', '', '']);
    const firstInput = document.getElementById('otp-0');
    if (firstInput) firstInput.focus();
  };

  if (!open) return null;

  return (
    <div className="otp-overlay">
      <div className="otp-modal">
        <div className="otp-header">
          <h3>OTP Verification</h3>
          <button className="otp-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="otp-content">
          <p className="otp-description">
            Please enter the 4-digit verification code sent to your email
          </p>
          
          {error && <div className="otp-error">{error}</div>}
          
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
            disabled={isLoading || otp.join('').length !== 4}
          >
            {isLoading ? 'Verifying...' : 'Verify OTP'}
          </button>
          
          <div className="otp-resend">
            <span>Didn't receive the code? </span>
            <button 
              className="otp-resend-btn"
              onClick={handleResend}
              disabled={isLoading}
            >
              Resend
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OTPVerification; 
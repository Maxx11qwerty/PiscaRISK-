import React, { useState } from 'react';
import './OTPVerification.css';
import logo from '../assets/images/PISCARISK_LOGO.png';

const OtpVerification = ({ open, code, onVerify, onClose }) => {
  const [input, setInput] = useState(['', '', '', '']);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleChange = (e, idx) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length > 1) return;
    const newInput = [...input];
    newInput[idx] = val;
    setInput(newInput);
    setError('');
    // Move to next input
    if (val && idx < 3) {
      document.getElementById(`otp-input-${idx + 1}`).focus();
    }
  };

  const handlePaste = (e) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (paste.length === 4) {
      setInput(paste.split(''));
      setError('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const entered = input.join('');
    if (entered === code) {
      onVerify();
    } else {
      setError('Incorrect OTP. Please try again.');
    }
  };

  return (
    <div className="otp-blur-bg">
      <div className="otp-modal">
        <div className="otp-header">
          <img src={logo} alt="PiscaRISK Logo" className="otp-logo" />
          <span className="otp-title">PiscaRISK</span>
          <button className="otp-close" onClick={onClose}>×</button>
        </div>
        <div className="otp-content">
          <p className="otp-instructions">Enter the 4-digit code we sent to your registered email to continue.</p>
          <form onSubmit={handleSubmit} className="otp-form">
            <div className="otp-inputs" onPaste={handlePaste}>
              {[0,1,2,3].map(idx => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  type="text"
                  maxLength={1}
                  className="otp-input"
                  value={input[idx]}
                  onChange={e => handleChange(e, idx)}
                  autoFocus={idx === 0}
                />
              ))}
            </div>
            {error && <div className="otp-error">{error}</div>}
            <button type="submit" className="otp-submit">Verify</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default OtpVerification; 
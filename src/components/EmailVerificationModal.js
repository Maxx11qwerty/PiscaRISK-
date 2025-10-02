import React, { useState } from 'react';
import './EmailVerificationModal.css';

export default function EmailVerificationModal({ email, onResend, onReturn }) {
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  
  if (!email) return null;
  
  const handleResend = async () => {
    setIsResending(true);
    setResendMessage('');
    
    try {
      const result = await onResend();
      if (result && result.success) {
        setResendMessage('Verification email sent successfully!');
        setTimeout(() => setResendMessage(''), 3000);
      } else {
        setResendMessage(result?.message || 'Failed to send verification email');
        setTimeout(() => setResendMessage(''), 3000);
      }
    } catch (error) {
      setResendMessage('Error sending verification email');
      setTimeout(() => setResendMessage(''), 3000);
    } finally {
      setIsResending(false);
    }
  };
  
  return (
    <div className="email-verification-modal-overlay">
      <div className="email-verification-modal-content">
        <div className="email-modal-header">
          <h2>Verify your email address</h2>
          <button className="email-modal-close" onClick={onReturn}>&times;</button>
        </div>

        <div className="email-modal-body">
          <div className="email-rounded-line"></div>
          <div className="verification-text">
            <p>We have sent a verification link to <strong>{email}</strong>.</p>
            <p>Click the link to complete the verification process.</p>
            <p>You might need to check your spam folder.</p>
          </div>

          {resendMessage && (
            <div className={`resend-message ${resendMessage.includes('successfully') ? 'success' : 'error'}`}>
              {resendMessage}
            </div>
          )}
        </div>

        <div className="email-modal-actions">
          <button
            className="resend-button"
            onClick={handleResend}
            disabled={isResending}
          >
            {isResending ? 'Sending...' : 'Resend Email'}
          </button>
          <button className="return-button" onClick={onReturn}>
            Return to Site
          </button>
        </div>
      </div>
    </div>
  );
}

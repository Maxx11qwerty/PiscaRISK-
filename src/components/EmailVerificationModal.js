import React, { useState } from 'react';
import './EmailVerificationModal.css';
// Add Firebase import
import { getAuth } from 'firebase/auth';

export default function EmailVerificationModal({ email, onResend, onReturn }) {
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [checkMessage, setCheckMessage] = useState('');
  const [canCheck, setCanCheck] = useState(false);

  if (!email) return null;

  const handleResend = async () => {
    setIsResending(true);
    setResendMessage('');

    try {
      const result = await onResend();
      if (result && result.success) {
        setResendMessage('Verification email sent successfully!');
        setCanCheck(true); // Allow "I've Verified" after successful send
        setTimeout(() => setResendMessage(''), 3000);
      } else if (result?.message && result.message.toLowerCase().includes('already verified')) {
        // Close modal if already verified
        setResendMessage('Your email is already verified. Closing...');
        setTimeout(() => {
          setResendMessage('');
          onReturn();
        }, 1000);
        return;
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

  // Added: Handle the check for verification
  const handleCheckVerified = async () => {
    setCheckMessage('');
    try {
      const auth = getAuth();
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        setCheckMessage('Email verified! Redirecting...');
        setTimeout(() => {
          setCheckMessage('');
          onReturn();
        }, 750);
      } else {
        setCheckMessage('Email is still not verified. Please check your inbox and click the verification link, then try again.');
      }
    } catch(err) {
      setCheckMessage('Error checking email verification. Please try again.');
    }
  };

  return (
    <div className="email-verification-modal-overlay">
      <div className="email-verification-modal-content">
        <div className="email-modal-header">
          <h2>Verify your email address</h2>
          <button className="email-modal-close" onClick={() => { setCanCheck(false); setCheckMessage(''); setResendMessage(''); onReturn(); }}>&times;</button>
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
          {checkMessage && (
            <div className={`check-message ${checkMessage.includes('verified!') ? 'success' : 'error'}`}>
              {checkMessage}
            </div>
          )}
        </div>

        <div className="email-modal-actions">
          {/* Show 'Verify Email' until a send is attempted/success, then show 'I've Verified' */}
          {!canCheck && (
            <button
              className="resend-button"
              onClick={handleResend}
              disabled={isResending}
              type="button"
            >
              {isResending ? 'Sending...' : 'Verify Email'}
            </button>
          )}
          {/* Show this only after a successful send */}
          {canCheck && (
            <button className="check-verified-button" onClick={handleCheckVerified} type="button">
              I've Verified
            </button>
          )}
          <button className="return-button" onClick={() => { setCanCheck(false); setCheckMessage(''); setResendMessage(''); onReturn(); }} type="button">
            Return to Site
          </button>
        </div>
      </div>
    </div>
  );
}

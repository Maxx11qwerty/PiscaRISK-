import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './ForgotPassword.css';

function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const navigate = useNavigate();

  // Mobile keyboard focus fix for 360px-480px breakpoint
  useEffect(() => {
    let scrollTimeout;
    
    const handleInputFocus = (e) => {
      // Only apply on mobile devices (360px to 480px)
      if (window.innerWidth >= 360 && window.innerWidth <= 480) {
        // Add a class to the body for CSS targeting
        document.body.classList.add('mobile-input-focused');
        
        // Clear any existing timeout
        if (scrollTimeout) clearTimeout(scrollTimeout);
        
        // Use scrollIntoView with center block and error handling
        scrollTimeout = setTimeout(() => {
          try {
            e.target.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          } catch (error) {
            // Silently handle scroll errors to prevent ResizeObserver issues
            console.warn('Scroll error handled:', error);
          }
        }, 100);
      }
    };

    const handleInputBlur = (e) => {
      if (window.innerWidth >= 360 && window.innerWidth <= 480) {
        // Remove the class when input loses focus
        document.body.classList.remove('mobile-input-focused');
        
        // Clear any pending scroll timeout
        if (scrollTimeout) clearTimeout(scrollTimeout);
      }
    };

    // Add event listeners to email input field
    const emailInput = document.getElementById('email');
    if (emailInput) {
      emailInput.addEventListener('focus', handleInputFocus);
      emailInput.addEventListener('blur', handleInputBlur);
    }

    // Cleanup
    return () => {
      if (emailInput) {
        emailInput.removeEventListener('focus', handleInputFocus);
        emailInput.removeEventListener('blur', handleInputBlur);
      }
      document.body.classList.remove('mobile-input-focused');
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // Import Firebase Auth functions
      const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
      const { app } = await import('../firebase');
      
      const auth = getAuth(app);
      
      // Send password reset email
      await sendPasswordResetEmail(auth, email);
      
      setResetEmailSent(true);
      setMessage({
        text: t('forgotPassword.successMessage', { email: email }),
        type: 'success'
      });
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('Error sending password reset email:', error);
      }
      let errorMessage = t('forgotPassword.errors.failedToSend');
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = t('forgotPassword.errors.userNotFound');
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = t('forgotPassword.errors.invalidEmail');
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = t('forgotPassword.errors.tooManyRequests');
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = t('forgotPassword.errors.networkError');
      }
      
      setMessage({
        text: `Error: ${errorMessage}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/');
  };

  const handleTryAnotherEmail = () => {
    setResetEmailSent(false);
    setEmail('');
    setMessage({ text: '', type: '' });
  };

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-card">
        <h2>{t('forgotPassword.title')}</h2>
        
        {message.text && (
          <div className={`forgot-password-alert forgot-password-alert-${message.type}`}>
            {message.text}
          </div>
        )}

        {resetEmailSent ? (
          <div className="reset-email-sent-container">
            <div className="reset-email-success-message">
              <div className="success-icon">✓</div>
              <h3>{t('forgotPassword.checkYourEmail')}</h3>
              <p>{t('forgotPassword.resetLinkSent')}</p>
              <div className="forgot-password-user-email">{email}</div>
              
              <div className="email-instructions">
                <p><strong>{t('forgotPassword.whatToDoNext')}</strong></p>
                <ol>
                  <li>{t('forgotPassword.step1')}</li>
                  <li>{t('forgotPassword.step2')}</li>
                  <li>{t('forgotPassword.step3')}</li>
                </ol>
                
                <div className="spam-reminder">
                  <p><strong>{t('forgotPassword.dontSeeEmail')}</strong></p>
                  <p>{t('forgotPassword.checkSpam')}</p>
                </div>
              </div>
            </div>

            <div className="reset-email-actions">
              <button 
                onClick={handleTryAnotherEmail}
                className="forgot-password-submit-button secondary"
              >
                {t('forgotPassword.tryAnotherEmail')}
              </button>
              
              <button 
                onClick={handleBackToLogin}
                className="forgot-password-text-button"
              >
                {t('forgotPassword.backToLogin')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="forgot-password-description">
              {t('forgotPassword.description')}
            </p>

            <form onSubmit={handleSubmit}>
              <div className="forgot-password-form-group">
                <label htmlFor="email">{t('forgotPassword.emailLabel')}</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                                      placeholder={t('forgotPassword.emailPlaceholder')}
                  disabled={loading}
                />
              </div>

              <button 
                type="submit" 
                disabled={loading || !email.trim()}
                className="forgot-password-submit-button"
              >
                {loading ? t('forgotPassword.sending') : t('forgotPassword.sendResetLink')}
              </button>
            </form>

            <div className="forgot-password-back">
              <button 
                onClick={handleBackToLogin}
                className="forgot-password-text-button"
              >
                {t('forgotPassword.backToLogin')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;
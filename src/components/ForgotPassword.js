import React, { useState } from 'react';
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
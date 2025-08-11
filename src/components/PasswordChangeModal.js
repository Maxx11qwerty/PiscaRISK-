import React, { useState, useEffect } from 'react';
import { FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';
import './PasswordChangeModal.css';

const PasswordChangeModal = ({ isOpen, onClose, onPasswordChange, userInfo }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
    }
  }, [isOpen]);

  const validatePassword = (password) => {
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    return password.length >= 8 && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
  };

  const getPasswordStrength = (password) => {
    if (!password) return { score: 0, label: '', color: '' };
    
    let score = 0;
    
    // Length check
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    
    // Character variety checks
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
    
    // Determine strength level
    let label, color;
    if (score <= 2) {
      label = 'Weak';
      color = '#dc3545';
    } else if (score <= 4) {
      label = 'Fair';
      color = '#ffc107';
    } else if (score <= 5) {
      label = 'Good';
      color = '#17a2b8';
    } else {
      label = 'Strong';
      color = '#28a745';
    }
    
    return { score, label, color };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    // Validation
    if (!newPassword) {
      setErrors({ newPassword: 'New password is required' });
      return;
    }

    if (!validatePassword(newPassword)) {
      setErrors({ 
        newPassword: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.' 
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setIsLoading(true);
    try {
      await onPasswordChange(newPassword);
      onClose();
    } catch (error) {
      setErrors({ submit: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const strength = getPasswordStrength(newPassword);

  return (
    <div className="password-change-modal-overlay">
      <div className="password-change-modal">
        <div className="modal-header">
          <h2>Change Your Password</h2>
          <p className="modal-subtitle">
            Your password was recently reset by an administrator. 
            Please set a new password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="password-change-form">
          {userInfo && (
            <div className="user-info-section">
              <p><strong>Username:</strong> {userInfo.username}</p>
              <p><strong>Email:</strong> {userInfo.email}</p>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <div className="password-input-container">
              <input
                type={showPassword ? 'text' : 'password'}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={errors.newPassword ? 'input-error' : ''}
                placeholder="Enter new password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {errors.newPassword && (
              <span className="error-message">{errors.newPassword}</span>
            )}
            
            {/* Password strength indicator */}
            <div className="password-strength-indicator">
              <div className="strength-bar" style={{ width: `${strength.score * 20}%`, backgroundColor: strength.color }}></div>
              <span className="strength-label">{strength.label}</span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <div className="password-input-container">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={errors.confirmPassword ? 'input-error' : ''}
                placeholder="Confirm new password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className="error-message">{errors.confirmPassword}</span>
            )}
          </div>

          {errors.submit && (
            <div className="error-message submit-error">{errors.submit}</div>
          )}

          <div className="form-buttons">
            <button
              type="submit"
              className="change-password-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Changing Password...' : 'Change Password'}
            </button>
          </div>
        </form>

        <div className="password-requirements">
          <h4>Password Requirements:</h4>
          <ul>
            <li>At least 8 characters long</li>
            <li>Contains at least one uppercase letter (A-Z)</li>
            <li>Contains at least one lowercase letter (a-z)</li>
            <li>Contains at least one number (0-9)</li>
            <li>Contains at least one special character (!@#$%^&*)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PasswordChangeModal;

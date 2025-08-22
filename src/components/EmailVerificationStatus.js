import React, { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import './EmailVerificationStatus.css';

const EmailVerificationStatus = () => {
  const { 
    currentUser, 
    checkEmailVerification, 
    updateStatusAfterVerification,
    sendVerificationEmail,
    migrateExistingUser
  } = useContext(AuthContext);
  
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const handleCheckVerification = async () => {
    if (!currentUser) {
      setMessage('No user logged in');
      setMessageType('error');
      return;
    }

    setIsChecking(true);
    setMessage('');
    
    try {
      const isVerified = await checkEmailVerification();
      
      if (isVerified) {
        setMessage('Email is verified! Status should now be active.');
        setMessageType('success');
      } else {
        setMessage('Email is not verified yet. Please check your inbox.');
        setMessageType('warning');
      }
    } catch (error) {
      setMessage(`Error checking verification: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!currentUser) {
      setMessage('No user logged in');
      setMessageType('error');
      return;
    }

    setIsUpdating(true);
    setMessage('');
    
    try {
      const result = await updateStatusAfterVerification();
      
      if (result.statusUpdated) {
        setMessage('Status successfully updated to active!');
        setMessageType('success');
      } else {
        setMessage('Status was already active or no update needed.');
        setMessageType('info');
      }
    } catch (error) {
      setMessage(`Error updating status: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResendVerification = async () => {
    if (!currentUser) {
      setMessage('No user logged in');
      setMessageType('error');
      return;
    }

    setMessage('');
    
    try {
      await sendVerificationEmail();
      setMessage('Verification email sent! Please check your inbox.');
      setMessageType('success');
    } catch (error) {
      setMessage(`Error sending verification email: ${error.message}`);
      setMessageType('error');
    }
  };

  const handleMigrateUser = async () => {
    if (!currentUser) {
      setMessage('No user logged in');
      setMessageType('error');
      return;
    }

    setIsMigrating(true);
    setMessage('');
    
    try {
      const result = await migrateExistingUser(currentUser.uid);
      
      if (result.success && result.statusUpdated) {
        setMessage(`User successfully migrated! New status: ${result.newStatus}`);
        setMessageType('success');
      } else if (result.success) {
        setMessage(`User already has proper status: ${result.currentStatus}`);
        setMessageType('info');
      } else {
        setMessage(`Migration failed: ${result.error}`);
        setMessageType('error');
      }
    } catch (error) {
      setMessage(`Error migrating user: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsMigrating(false);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="email-verification-status">
      <h3>Email Verification Status</h3>
      
      <div className="status-info">
        <div className="status-item">
          <strong>Email:</strong> {currentUser.email}
        </div>
        <div className="status-item">
          <strong>Email Verified:</strong> 
          <span className={currentUser.emailVerified ? 'verified' : 'not-verified'}>
            {currentUser.emailVerified ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="status-item">
          <strong>Account Status:</strong> 
          <span className={`status-${currentUser.status}`}>
            {currentUser.status}
          </span>
        </div>
        <div className="status-item">
          <strong>Role:</strong> {currentUser.role}
        </div>
      </div>

      <div className="action-buttons">
        <button 
          onClick={handleCheckVerification}
          disabled={isChecking}
          className="btn btn-primary"
        >
          {isChecking ? 'Checking...' : 'Check Verification Status'}
        </button>
        
        <button 
          onClick={handleUpdateStatus}
          disabled={isUpdating || !currentUser.emailVerified}
          className="btn btn-success"
        >
          {isUpdating ? 'Updating...' : 'Update Status to Active'}
        </button>
        
        {!currentUser.emailVerified && (
          <button 
            onClick={handleResendVerification}
            className="btn btn-warning"
          >
            Resend Verification Email
          </button>
        )}
        
        <button 
          onClick={handleMigrateUser}
          disabled={isMigrating}
          className="btn btn-info"
        >
          {isMigrating ? 'Migrating...' : 'Migrate Existing User'}
        </button>
      </div>

      {message && (
        <div className={`message ${messageType}`}>
          {message}
        </div>
      )}

      <div className="help-text">
        <p><strong>How it works:</strong></p>
        <ul>
          <li>New accounts start with status "inactive" and emailVerified "false"</li>
          <li>After email verification, emailVerified becomes "true" but status stays "inactive"</li>
          <li>Status becomes "active" either during login OR when you click "Update Status to Active"</li>
          <li>Only users with status "active" can access the dashboard</li>
        </ul>
        
        <p><strong>For Existing Users:</strong></p>
        <ul>
          <li>If you were added before this system was implemented, use "Migrate Existing User"</li>
          <li>This will automatically set your status based on your email verification</li>
          <li>After migration, you can use the other buttons normally</li>
        </ul>
      </div>
    </div>
  );
};

export default EmailVerificationStatus;

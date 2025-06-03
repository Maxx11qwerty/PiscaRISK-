import React, { useState } from 'react';
import { FaUserCircle, FaEdit, FaTrash, FaSave, FaTimes } from 'react-icons/fa';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logActivity } from '../utils/logger';

const UserPopup = ({ user, onClose, onUpdate, currentUser }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState({
    ...user,
    status: user.status || 'Active'
  });
  const [message, setMessage] = useState({ text: '', type: '' });

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    
    try {
      // If it's a Firestore Timestamp
      if (dateValue && typeof dateValue.toDate === 'function') {
        return dateValue.toDate().toLocaleDateString();
      }
      // If it's a string date
      if (typeof dateValue === 'string') {
        return new Date(dateValue).toLocaleDateString();
      }
      // If it's a Date object
      if (dateValue instanceof Date) {
        return dateValue.toLocaleDateString();
      }
      return 'N/A';
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  };

  const handleSave = async () => {
    try {
      if (!editedUser.status) {
        setMessage({ text: 'Status cannot be empty', type: 'error' });
        return;
      }

      const collectionName = user.role === 'Fish Farmer' ? 'mobileUsers' : 'users';
      
      await updateDoc(doc(db, collectionName, user.id), {
        status: editedUser.status,
        lastModified: new Date().toISOString()
      });

      const updatedUser = {
        ...user,
        status: editedUser.status,
        lastModified: new Date().toISOString()
      };

      setMessage({ text: 'Status updated successfully!', type: 'success' });
      setIsEditing(false);
      onUpdate(updatedUser);
      
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      console.error('Error updating user:', error);
      setMessage({ text: error.message, type: 'error' });
    }
  };

  const handleStatusChange = (e) => {
    setEditedUser(prev => ({
      ...prev,
      status: e.target.value
    }));
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${user.username}?`)) {
      try {
        if (user.role === 'Fish Farmer') {
          await deleteDoc(doc(db, 'mobileUsers', user.id));
        } else {
          await deleteDoc(doc(db, 'users', user.id));
        }
        
        logActivity('account', `User ${user.username} deleted`, currentUser.username);
        
        onClose();
        setMessage({ text: 'User deleted successfully!', type: 'success' });
      } catch (error) {
        console.error('Error deleting user:', error);
        setMessage({ text: error.message, type: 'error' });
      }
    }
  };

  if (!user) return null;
  
  return (
    <div className="account-popup-overlay">
      <div className="account-popup-content">
        <div className="account-popup-header">
          {user.profileImage ? (
            <img 
              src={user.profileImage} 
              alt={`${user.username}'s profile`} 
              className="account-popup-user-image"
            />
          ) : (
            <FaUserCircle className="account-popup-user-icon" />
          )}
          <h2>{user.username}</h2>
          <div className="account-close-button" onClick={onClose}>
            <span className="account-close-icon">×</span>
          </div>
        </div>
        
        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="account-user-details">
          <div className="account-detail-item">
            <span className="account-detail-label">Full Name:</span>
            <span className="account-detail-value">{user.fullName}</span>
          </div>

          <div className="account-detail-item">
            <span className="account-detail-label">Address:</span>
            <span className="account-detail-value">{user.address}</span>
          </div>

          <div className="account-detail-item">
            <span className="account-detail-label">Email:</span>
            <span className="account-detail-value">{user.email}</span>
          </div>

          <div className="account-detail-item">
            <span className="account-detail-label">Contact Number:</span>
            <span className="account-detail-value">{user.contactNumber}</span>
          </div>

          <div className="account-detail-item">
            <span className="account-detail-label">Role:</span>
            <span className="account-detail-value">{user.role}</span>
          </div>

          <div className="account-detail-item">
            <span className="account-detail-label">Status:</span>
            {isEditing ? (
              <select
                value={editedUser.status}
                onChange={handleStatusChange}
                className="edit-select"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>
            ) : (
              <span className="account-detail-value">{user.status}</span>
            )}
          </div>

          <div className="account-detail-item">
            <span className="account-detail-label">Date Joined:</span>
            <span className="account-detail-value">{formatDate(user.dateJoined)}</span>
          </div>
        </div>

        <div className="popup-actions">
          {isEditing ? (
            <>
              <button className="action-button save-button" onClick={handleSave}>
                <FaSave className="button-icon" /> Save
              </button>
              <button className="action-button cancel-button" onClick={() => setIsEditing(false)}>
                <FaTimes className="button-icon" /> Cancel
              </button>
            </>
          ) : (
            <>
              <button className="action-button edit-button" onClick={() => setIsEditing(true)}>
                <FaEdit className="button-icon" /> Edit
              </button>
              <button className="action-button delete-button" onClick={handleDelete}>
                <FaTrash className="button-icon" /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserPopup; 
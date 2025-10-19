import React, { useState, useEffect } from 'react';
import { FaTimes, FaUserPlus } from 'react-icons/fa';
import './ToastNotification.css';

const ToastNotification = ({ message, type = 'info', duration = 5000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, 300); // Match CSS transition duration
  };

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FaUserPlus className="toast-icon success" />;
      case 'error':
        return <FaTimes className="toast-icon error" />;
      case 'warning':
        return <FaUserPlus className="toast-icon warning" />;
      default:
        return <FaUserPlus className="toast-icon info" />;
    }
  };

  return (
    <div className={`toast-notification ${type} ${isExiting ? 'exiting' : ''}`}>
      <div className="toast-content">
        {getIcon()}
        <span className="toast-message">{message}</span>
      </div>
      <button className="toast-close" onClick={handleClose}>
        <FaTimes />
      </button>
    </div>
  );
};

export default ToastNotification;

import React, { useState, useEffect } from 'react';
import { FaTimes, FaUserPlus } from 'react-icons/fa';
import './ToastNotification.css';

const ToastNotification = ({ message, type = 'info', duration = 5000, action = null, onClose }) => {
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

  const handleActionClick = async () => {
    if (!action) return;
    try {
      if (typeof action.onClick === 'function') {
        await action.onClick();
      }
    } finally {
      if (action.autoClose !== false && onClose) {
        onClose();
      }
    }
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
        <div className="toast-message-wrapper">
          <span className="toast-message">{message}</span>
          {action && action.label && (
            <button
              className="toast-action"
              onClick={handleActionClick}
              disabled={action.disabled}
              type="button"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
      <button className="toast-close" onClick={handleClose}>
        <FaTimes />
      </button>
    </div>
  );
};

export default ToastNotification;

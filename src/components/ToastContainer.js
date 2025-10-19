import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import ToastNotification from './ToastNotification';

const ToastContainer = () => {
  const { toasts, removeToast } = useNotifications();

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <ToastNotification
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export default ToastContainer;

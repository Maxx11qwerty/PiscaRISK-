import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [pendingActivations, setPendingActivations] = useState(0);
  const [toasts, setToasts] = useState([]);
  const { currentUser } = useAuth();

  // Check if user is a tech officer (including temporary)
  const isTechOfficer = currentUser && (
    String(currentUser.role || '').toLowerCase() === 'tech_officer' ||
    String(currentUser.role || '').toLowerCase() === 'tech officer' ||
    currentUser.temporaryTechOfficer
  );

  // Listen for new users awaiting activation
  useEffect(() => {
    if (!isTechOfficer || !currentUser) {
      setPendingActivations(0);
      return;
    }

    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('status', '==', 'Inactive'),
      where('role', 'in', ['Fish Farmer', 'fish_farmer', 'fish farmer'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingUsers = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => {
          // Only count users created in the last 30 days to avoid showing old inactive users
          const createdAt = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return createdAt > thirtyDaysAgo;
        });

      const previousCount = pendingActivations;
      const newCount = pendingUsers.length;
      
      setPendingActivations(newCount);

      // Show toast when new users are added (but not on initial load)
      if (newCount > previousCount && previousCount >= 0) {
        const newUsersCount = newCount - previousCount;
        const message = newUsersCount === 1 
          ? 'New farmer registered and is awaiting activation.'
          : `${newUsersCount} new farmers registered and are awaiting activation.`;
        
        addToast(message, 'success');
      } else if (newCount < previousCount && previousCount > 0) {
        const activatedCount = previousCount - newCount;
        const message = activatedCount === 1 
          ? 'Farmer account activated!'
          : `${activatedCount} farmer accounts activated!`;
        
        addToast(message, 'success');
      }
    }, (error) => {
      console.error('Error listening for pending activations:', error);
    });

    return () => unsubscribe();
  }, [isTechOfficer, currentUser]);

  const addToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, duration };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const addDeactivationToast = (username) => {
    const message = `You successfully deactivated ${username}'s account.`;
    addToast(message, 'success', 4000);
  };

  const addActivationToast = (username) => {
    const message = `You successfully activated ${username}'s account.`;
    addToast(message, 'success', 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const value = {
    pendingActivations,
    toasts,
    addToast,
    addDeactivationToast,
    addActivationToast,
    removeToast
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

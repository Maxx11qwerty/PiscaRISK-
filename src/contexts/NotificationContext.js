import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { sileo } from 'sileo';

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
  const [announcedInitialPending, setAnnouncedInitialPending] = useState(false);
  const suppressNextIncreaseRef = React.useRef(false);
  const suppressNextDecreaseRef = React.useRef(false);
  const [activationsClearedAt, setActivationsClearedAt] = useState(() => {
    try {
      return localStorage.getItem('activationsClearedAt') || null;
    } catch (_) {
      return null;
    }
  });

  // Determine viewer role
  const roleLower = String(currentUser?.role || '').toLowerCase();
  const hasFarm = !!(currentUser?.farm && String(currentUser.farm).trim() !== '');
  // Tech Officer family (including new main and temporary)
  const isTechOfficer = currentUser && (
    roleLower === 'tech_officer' ||
    roleLower === 'tech officer' ||
    roleLower === 'new_main_tech_officer' ||
    roleLower === 'new main tech officer' ||
    roleLower === 'temp_tech_officer' ||
    roleLower === 'temporary tech officer' ||
    currentUser.temporaryTechOfficer === true
  );
  // Admins (includes Super Admins and Farm Admins)
  const isAdmin = currentUser && roleLower === 'admin';

  // Build farm ID<->name maps to match admin farm IDs with user farm names and vice versa
  const [farmIdToName, setFarmIdToName] = useState({});
  const [farmNameToId, setFarmNameToId] = useState({});

  useEffect(() => {
    try {
      const farmsRef = collection(db, 'farms');
      const unsub = onSnapshot(farmsRef, (snap) => {
        const idToName = {};
        const nameToId = {};
        snap.docs.forEach(docSnap => {
          const data = docSnap.data() || {};
          const id = String(docSnap.id || '').trim().toLowerCase();
          const name = String(data.name || '').trim().toLowerCase();
          if (!id) return;
          if (name) {
            idToName[id] = name;
            nameToId[name] = id;
          } else {
            idToName[id] = id;
          }
        });
        setFarmIdToName(idToName);
        setFarmNameToId(nameToId);
      }, () => {});
      return () => { try { unsub && unsub(); } catch (_) {} };
    } catch (_) {
      // ignore mapping failures
    }
  }, []);

  // Listen for new users awaiting activation
  useEffect(() => {
    if (!(isTechOfficer || isAdmin) || !currentUser) {
      setPendingActivations(0);
      setAnnouncedInitialPending(false);
      return;
    }

    // Build listeners for both web users and mobile users (fish farmers)
    const usersRef = collection(db, 'users');
    const mobileUsersRef = collection(db, 'mobileUsers');

    // Base queries: include both inactive and pending (handle casing variants)
    const statusValues = ['inactive', 'Inactive', 'pending', 'Pending'];
    // Users collection (admins/techs)
    const qUsers = query(usersRef, where('status', 'in', statusValues));

    // mobileUsers collection (fish farmers)
    // Show all pending/inactive fish farmers; do not filter by farm so Farm Admins see new registrations
    const qMobile = query(mobileUsersRef, where('status', 'in', statusValues));

    let previousCount = -1; // -1 indicates initial load

    const combineAndProcess = (usersSnap, mobileSnap) => {
      // Combine docs from both collections
      const allDocs = [
        ...(usersSnap ? usersSnap.docs : []),
        ...(mobileSnap ? mobileSnap.docs : [])
      ];

      // Deduplicate users: key = username + email + farm (case-insensitive)
      const seen = new Set();
      const pendingUsers = allDocs
        .map(d => ({ id: d.id, _collection: d.ref.parent.id, ...d.data() }))
        .filter(user => {
          const role = String(user.role || '').toLowerCase();
          const roleCanonical = role.replace(/\s+/g, '_');
          if (user.hasBeenTempTechOfficer === true) return false;
          if (typeof user.tempTOHistory === 'string' && user.tempTOHistory.trim() !== '') return false;
          // Exclude explicitly deactivated users so the badge counts only newly added users
          const normalize = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : (v || '').toString().trim().toLowerCase());
          const deactivatedBy = normalize(user.deactivatedBy);
          const deactivatedAt = normalize(user.deactivatedAt);
          const deactivationReason = normalize(user.deactivationReason);
          const isExplicitlyDeactivated = (
            (deactivatedBy && deactivatedBy !== 'null') ||
            (deactivatedAt && deactivatedAt !== 'null') ||
            (deactivationReason && deactivationReason !== 'null')
          );
          if (isExplicitlyDeactivated) return false;
          // Only pending/inactive
          const status = String(user.status || '').toLowerCase();
          if (status !== 'inactive' && status !== 'pending') return false;
          // Tech Officer roles: global
          if (isTechOfficer) {
            const countable = (
              roleCanonical === 'admin' ||
              roleCanonical === 'tech_officer' ||
              roleCanonical === 'temp_tech_officer' ||
              roleCanonical === 'new_main_tech_officer' ||
              roleCanonical === 'fish_farmer'
            );
            if (!countable) return false;
          // Farm Admin: count only users whose farm matches admin's farm
          } else if (isAdmin && hasFarm) {
            if (roleCanonical !== 'fish_farmer') return false;
            const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : (v || '').toString().trim().toLowerCase());
            const userFarm = norm(user.farm);
            const adminFarm = norm(currentUser.farm);
            // farms match if: equal directly, or user name maps to admin id, or admin id maps to admin name equal to user name
            const userFarmAsId = userFarm && farmNameToId[userFarm] ? farmNameToId[userFarm] : userFarm;
            const adminFarmAsName = adminFarm && farmIdToName[adminFarm] ? farmIdToName[adminFarm] : adminFarm;
            const farmsMatch = (
              userFarm === adminFarm ||
              userFarmAsId === adminFarm ||
              userFarm === adminFarmAsName
            );
            if (!farmsMatch) return false;
          } else if (isAdmin && !hasFarm) {
            // Super Admin: count all fish farmers
            if (roleCanonical !== 'fish_farmer') return false;
          }
          // Key for deduplication
          const key = [
            String(user.username||'').trim().toLowerCase(),
            String(user.email||'').trim().toLowerCase(),
            String(user.farm||'').trim().toLowerCase()
          ].join('|');
          if (seen.has(key)) return false;
          seen.add(key + (user._collection === 'users' ? '|users' : '|mobileUsers'));
          if (user._collection === 'mobileUsers' && seen.has(key + '|users')) return false;
          return true;
        });

      const newCount = pendingUsers.length;
      setPendingActivations(newCount);

      // Show toast when new pending users appear or activations reduce the count (skip initial)
      if (previousCount >= 0) {
        if (newCount > previousCount) {
          // If a manual deactivation just happened, suppress the next increase toast once
          if (suppressNextIncreaseRef.current) {
            suppressNextIncreaseRef.current = false;
          } else {
            const diff = newCount - previousCount;
            sileo.success({
              title: 'New user',
              description: (
                <span className="sileo-toast-description">
                  {diff === 1
                    ? '1 new user is awaiting activation.'
                    : `${diff} new users are awaiting activation.`}
                </span>
              ),
              fill: '#FFFFFF', // white background
              roundness: 18,
              styles: {
                title: 'sileo-toast-title',
                description: 'sileo-toast-description',
                badge: 'sileo-toast-badge',
              },
              button: {
                title: 'View user',
                onClick: () => {
                  window.location.href = '/AccountManagement?tab=new';
                },
              },
            });
          }
        } else if (newCount < previousCount && previousCount > 0) {
          if (suppressNextDecreaseRef.current) {
            suppressNextDecreaseRef.current = false;
          } else {
            const diff = previousCount - newCount;
            const message = diff === 1
              ? 'A user account was activated.'
              : `${diff} user accounts were activated.`;
            addToast(message, 'success');
          }
        }
      } else {
        // On initial load after login: if there are pending users, always announce once
        if (!announcedInitialPending && newCount > 0) {
          sileo.info({
            title: 'New user',
            description: (
              <span className="sileo-toast-description">
                Check the Account Management page to process new users.
              </span>
            ),
            fill: '#FFFFFF', // white background
            roundness: 18,
            styles: {
              title: 'sileo-toast-title',
              description: 'sileo-toast-description',
              badge: 'sileo-toast-badge',
            },
            button: {
              title: 'View user',
              onClick: () => {
                window.location.href = '/AccountManagement?tab=new';
              },
            },
          });
          setAnnouncedInitialPending(true);
        }
      }
      previousCount = newCount;
    };

    // Subscribe to both collections and recompute when either changes
    let lastUsersSnap = null;
    let lastMobileSnap = null;

    const unsubUsers = onSnapshot(qUsers, (snap) => {
      lastUsersSnap = snap;
      combineAndProcess(lastUsersSnap, lastMobileSnap);
    }, {
    });

    const unsubMobile = onSnapshot(qMobile, (snap) => {
      lastMobileSnap = snap;
      combineAndProcess(lastUsersSnap, lastMobileSnap);
    }, {
    });

    return () => {
      try { unsubUsers && unsubUsers(); } catch (_) {}
      try { unsubMobile && unsubMobile(); } catch (_) {}
    };
  }, [isTechOfficer, currentUser, activationsClearedAt, farmIdToName, farmNameToId, announcedInitialPending]);

  const addToast = (message, type = 'info', duration = 5000, options = {}) => {
    const id = Date.now() + Math.random();
    const { action = null, onClose = null } = options || {};
    const newToast = { id, message, type, duration, action, onClose };

    setToasts(prev => [...prev, newToast]);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id, true);
      }, duration);
    }

    return id;
  };

  const addDeactivationToast = (username) => {
    sileo.info({
      title: 'User updated',
      description: (
        <span className="sileo-toast-description">
          You successfully deactivated {username}'s account.
        </span>
      ),
      fill: '#FFFFFF',
      roundness: 18,
      styles: {
        title: 'sileo-toast-title',
        description: 'sileo-toast-description',
        badge: 'sileo-toast-badge',
      },
    });
  };

  const addActivationToast = (username) => {
    sileo.success({
      title: 'User activated',
      description: (
        <span className="sileo-toast-description">
          You successfully activated {username}'s account.
        </span>
      ),
      fill: '#FFFFFF',
      roundness: 18,
      styles: {
        title: 'sileo-toast-title',
        description: 'sileo-toast-description',
        badge: 'sileo-toast-badge',
      },
    });
  };

  // Expose a way to reset the activation counter baseline
  const clearPendingActivations = () => {
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem('activationsClearedAt', nowIso);
    } catch (_) {}
    setActivationsClearedAt(nowIso);
    setPendingActivations(0);
  };

  const removeToast = (id, triggerCallback = true) => {
    setToasts(prev => {
      const toast = prev.find(item => item.id === id);
      if (triggerCallback && toast?.onClose) {
        try {
          toast.onClose();
        } catch (_) {}
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const value = {
    pendingActivations,
    toasts,
    addToast,
    addDeactivationToast,
    addActivationToast,
    clearPendingActivations,
    removeToast,
    // Expose a way for AccountManagement to suppress the next increase toast
    suppressNextActivationIncreaseToast: () => { suppressNextIncreaseRef.current = true; },
    suppressNextActivationDecreaseToast: () => { suppressNextDecreaseRef.current = true; }
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

import React, { useState, useEffect } from 'react';
import { FaUserCircle, FaSyncAlt } from 'react-icons/fa';
import { IoIosNotifications } from "react-icons/io";
import './NotificationBox.css';
import { db } from '../firebase';
import { ensureReportLog, ensureStockFeedLog, ensureFeedbackLog } from '../utils/logger';
import {
  collection, 
  query, 
  where, 
  getDocs,
  orderBy,
  limit,
  doc,
  setDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { sanitizeObjectStrings } from '../utils/sanitize';
import { getAuth } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { useRefreshFeedback } from '../hooks/useRefreshFeedback';
import RefreshStatusMessage from './RefreshStatusMessage';

// Helper functions
const extractPondId = (fishPond) => {
  if (!fishPond) return '';
  return typeof fishPond === 'string' 
    ? fishPond.split(' ').pop() || fishPond 
    : fishPond.toString();
};

const generateMessage = (report, pondId) => {
  const user = report.submitted_by || report.user || 'A user';
  const farmName = report.farm || 'Unknown Farm';
  return report.source === 'mobile'
    ? `${user} submitted a new report for Fish Pond ${pondId} from ${farmName}`
    : `${user} submitted a new report for Fish Pond ${pondId} from ${farmName}`;
};

const generateDetails = (report) => {
  return `Fish: ${report.fish_condition || 'N/A'}, Water: ${report.water_condition || 'N/A'}`;
};
const NOTIFICATION_REPORTS_LIMIT = 40;
const NOTIFICATION_FEEDBACK_LIMIT = 15;
const NOTIFICATION_LOGS_LIMIT = 30; // Increased to ensure we catch new logs
const BADGE_REPORTS_LIMIT = 25;

// Initialize with Firebase data (bounded queries — not full collection scans)
const initializeNotifications = async (options = {}) => {
  const {
    reportsLimit = NOTIFICATION_REPORTS_LIMIT,
    feedbackLimit = NOTIFICATION_FEEDBACK_LIMIT,
    logsLimit = NOTIFICATION_LOGS_LIMIT,
    includeStockFeed = true,
  } = options;
  const notifications = [];

  try {
    // Fetch reports from Firebase
    const reportsRef = collection(db, 'reports');
    const reportsQuery = query(
      reportsRef,
      orderBy('timestamp', 'desc'),
      limit(Math.max(1, reportsLimit))
    );
    const reportsSnapshot = await getDocs(reportsQuery);
    
    reportsSnapshot.docs.forEach(doc => {
      const report = doc.data();
      const pondId = report.fish_pond ? extractPondId(report.fish_pond) : '';

      try { ensureReportLog(doc.id, report); } catch (_) {}
      
      let timestamp;
      try {
        if (report.timestamp && typeof report.timestamp.toDate === 'function') {
          timestamp = report.timestamp.toDate().toISOString();
        } else if (report.timestamp instanceof Date) {
          timestamp = report.timestamp.toISOString();
        } else if (typeof report.timestamp === 'string') {
          if (!isNaN(new Date(report.timestamp).getTime())) {
            timestamp = report.timestamp;
          } else {
            throw new Error('Invalid date string');
          }
        } else {
          timestamp = new Date().toISOString();
        }
      } catch (error) {
        console.warn('Error processing timestamp, using current date:', error);
        timestamp = new Date().toISOString();
      }

      notifications.push({
        id: doc.id,
        type: 'fishpond',
        message: generateMessage(report, pondId),
        details: generateDetails(report),
        username: report.submitted_by || report.user || 'Unknown User',
        timestamp: timestamp,
        read: false,
        iconKey: "pond",
        pondId,
        farmName: report.farm || 'Unknown Farm',
        reportData: report,
        avatar: report.avatar || null,
        source: report.source || 'web'
      });
    });

    // Fetch feedback
    const feedbackRef = collection(db, 'PiscaRisk');
    const feedbackQuery = query(
      feedbackRef,
      orderBy('timestamp', 'desc'),
      limit(Math.max(1, feedbackLimit))
    );
    const feedbackSnapshot = await getDocs(feedbackQuery);

    const feedbackNotifications = await Promise.all(
      feedbackSnapshot.docs.map(async (docSnap) => {
        const feedback = docSnap.data();
        
        try { ensureFeedbackLog(docSnap.id, feedback); } catch (_) {}
        
        let timestamp;
        try {
          if (feedback.timestamp && typeof feedback.timestamp.toDate === 'function') {
            timestamp = feedback.timestamp.toDate().toISOString();
          } else if (feedback.timestamp instanceof Date) {
            timestamp = feedback.timestamp.toISOString();
          } else if (typeof feedback.timestamp === 'string') {
            const date = new Date(feedback.timestamp);
            if (!isNaN(date.getTime())) {
              timestamp = date.toISOString();
            } else {
              const dateMatch = feedback.timestamp.match(/\d{4}-\d{2}-\d{2}/);
              if (dateMatch) {
                timestamp = new Date(dateMatch[0]).toISOString();
              } else {
                throw new Error('Invalid date string format');
              }
            }
          } else {
            timestamp = new Date().toISOString();
          }
        } catch (error) {
          timestamp = new Date().toISOString();
        }

        let senderFarmId = null;
        let senderFarmName = null;
        try {
          const senderUid = feedback.uid || feedback.userId || null;
          if (senderUid) {
            const mobileUserDoc = await getDoc(doc(db, 'mobileUsers', senderUid));
            if (mobileUserDoc.exists()) {
              senderFarmId = mobileUserDoc.data().farm || null;
            } else {
              const userDoc = await getDoc(doc(db, 'users', senderUid));
              if (userDoc.exists()) {
                senderFarmId = userDoc.data().farm || null;
              }
            }
            if (senderFarmId) {
              const farmDoc = await getDoc(doc(db, 'farms', senderFarmId));
              senderFarmName = farmDoc.exists() ? (farmDoc.data().name || senderFarmId) : senderFarmId;
            }
          }
        } catch (_) {}

        return {
          id: docSnap.id,
          type: 'feedback',
          message: `${feedback.userName || feedback.user || 'A user'} submitted a feedback..`,
          username: feedback.userName || feedback.user || 'Unknown User',
          timestamp: timestamp,
          read: false,
          iconKey: "feedback",
          feedbackType: feedback.concern || 'general',
          feedbackData: feedback,
          avatar: feedback.avatar || null,
          source: feedback.source || 'web',
          farmName: senderFarmName || 'Unknown Farm',
          reportData: { ...(feedback || {}), farm: senderFarmId || null },
          senderUid: feedback.uid || feedback.userId || null
        };
      })
    );

    notifications.push(...feedbackNotifications);

    // ============================================================
    // FIXED: Fetch stock/feed logs from BOTH locations
    // ============================================================
    if (includeStockFeed) {
      try {
        // 1. Fetch from root farmerLogs collection
        const farmerLogsRef = collection(db, 'farmerLogs');
        const farmerLogsQuery = query(
          farmerLogsRef,
          orderBy('timestamp', 'desc'),
          limit(Math.max(1, logsLimit))
        );
        const farmerLogsSnapshot = await getDocs(farmerLogsQuery);
        
        // 2. Also fetch from farms/{farmId}/farmerLogs (nested)
        const farmsSnapshot = await getDocs(collection(db, 'farms'));
        const nestedLogsSnaps = await Promise.all(
          farmsSnapshot.docs.map(f => 
            getDocs(collection(db, 'farms', f.id, 'farmerLogs'))
              .then(snap => ({ farmId: f.id, snap }))
              .catch(() => ({ farmId: f.id, snap: { docs: [] } }))
          )
        );

        // Combine all log documents
        const allLogDocs = [
          ...farmerLogsSnapshot.docs,
          ...nestedLogsSnaps.flatMap(({ farmId, snap }) => 
            snap.docs.map(d => ({ 
              ...d, 
              _farm: farmId,
              data: () => ({ ...d.data(), farmId: farmId })
            }))
          )
        ];

        // Deduplicate by ID
        const uniqueLogs = new Map();
        allLogDocs.forEach(doc => {
          if (!uniqueLogs.has(doc.id)) {
            uniqueLogs.set(doc.id, doc);
          }
        });

        // Sync unlogged stock/feed logs to systemLogs
                const syncStockFeedLogsToSystemLogs = async () => {
                  const { setDoc, doc: fsDoc } = await import('firebase/firestore');
                  const { sanitizeObjectStrings } = await import('../utils/sanitize');
          
                  for (const docSnap of Array.from(uniqueLogs.values())) {
                    try {
                      const farmId = docSnap._farm;
                      const log = { ...docSnap.data(), farmId };
                      const logId = `stock_${farmId}_${docSnap.id}`;
              
                      // Check if already logged
                      const logDocRef = fsDoc(db, 'systemLogs', logId);
                      const { getDoc } = await import('firebase/firestore');
                      const existing = await getDoc(logDocRef);
                      if (existing.exists()) continue;
              
                      // Create systemLogs entry
                      const username = log.submitted_by || log.user_email || 'Unknown User';
                      const pond = log.fish_pond || 'Unknown Pond';
                      const source = (log.source || 'mobile').toString().toLowerCase();
              
                      let ts;
                      try {
                        if (log.timestamp && typeof log.timestamp.toDate === 'function') {
                          ts = log.timestamp.toDate();
                        } else if (log.timestamp instanceof Date) {
                          ts = log.timestamp;
                        } else if (typeof log.timestamp === 'string') {
                          const d = new Date(log.timestamp);
                          ts = isNaN(d.getTime()) ? new Date() : d;
                        } else if (log.timestamp && typeof log.timestamp.seconds === 'number') {
                          ts = new Date(log.timestamp.seconds * 1000);
                        } else {
                          ts = new Date();
                        }
                      } catch (_) {
                        ts = new Date();
                      }
              
                      const newLog = sanitizeObjectStrings({
                        timestamp: ts.toISOString(),
                        category: 'stock',
                        message: `Mobile user ${username} submitted a stock/feed log for ${pond}`,
                        username,
                        userRole: log.user_role || 'Unknown',
                        source: source === 'mobile' ? 'mobile' : 'web',
                        stockLogId: docSnap.id,
                        farm: farmId || null,
                        pond: pond
                      });
              
                      await setDoc(logDocRef, newLog, { merge: false });
                    } catch (e) {
                      console.error('Sync stock/feed log failed:', e);
                    }
                  }
                };
        
                // Run sync once
                await syncStockFeedLogsToSystemLogs();

                const stockFeedNotifications = await Promise.all(
                  Array.from(uniqueLogs.values()).map(async (docSnap) => {
                    let log = docSnap.data();
                    // Add farmId if from nested collection
                    if (docSnap._farm) {
                      log = { ...log, farmId: docSnap._farm };
                    }

                    try { ensureStockFeedLog(docSnap.id, log); } catch (_) {}

                    // ============================================================
                    // IMPROVED FARM RESOLUTION
            // ============================================================
            let farmId = log.farmId || log.farm || null;
            let farmNameResolved = log.farmName || log.farm || null;

            // If no farmId but has farmName, try to resolve
            if (!farmId && farmNameResolved) {
              try {
                const farmsRef = collection(db, 'farms');
                const farmQuery = query(farmsRef, where('name', '==', farmNameResolved), limit(1));
                const farmSnap = await getDocs(farmQuery);
                if (!farmSnap.empty) {
                  farmId = farmSnap.docs[0].id;
                }
              } catch (_) {}
            }

            // Try to resolve from user if still no farm
            if (!farmId) {
              try {
                const candidateUid = log.uid || log.user_id || null;
                const candidateEmail = (log.user_email || log.email || '').toLowerCase();
                
                if (candidateUid) {
                  const mobileUserDoc = await getDoc(doc(db, 'mobileUsers', candidateUid));
                  if (mobileUserDoc.exists()) {
                    farmId = mobileUserDoc.data().farm || null;
                  } else {
                    const userDoc = await getDoc(doc(db, 'users', candidateUid));
                    if (userDoc.exists()) {
                      farmId = userDoc.data().farm || null;
                    }
                  }
                }
                
                if (!farmId && candidateEmail) {
                  const usersRef = collection(db, 'mobileUsers');
                  const emailQ = query(usersRef, where('email', '==', candidateEmail), limit(1));
                  const emailSnap = await getDocs(emailQ);
                  if (!emailSnap.empty) {
                    farmId = emailSnap.docs[0].data().farm || null;
                  }
                }
              } catch (_) {}
            }

            // If farmId is actually a farm name (not an ID), resolve it to an ID
            if (farmId && !farmId.match(/^[a-zA-Z0-9]+$/i)) {
              // Looks like it might be a name, try to resolve
              try {
                const farmsRef = collection(db, 'farms');
                const farmQuery = query(farmsRef, where('name', '==', farmId), limit(1));
                const farmSnap = await getDocs(farmQuery);
                if (!farmSnap.empty) {
                  farmId = farmSnap.docs[0].id;
                }
              } catch (_) {}
            }

            // Resolve farm display name
            if (farmId && !farmNameResolved) {
              try {
                const farmDoc = await getDoc(doc(db, 'farms', farmId));
                if (farmDoc.exists()) {
                  farmNameResolved = farmDoc.data().name || farmId;
                } else {
                  farmNameResolved = farmId;
                }
              } catch (_) {
                farmNameResolved = farmId;
              }
            }

            // Final fallback
            if (!farmNameResolved) {
              farmNameResolved = log.farmName || log.farm || 'Unknown Farm';
            }

            // Timestamp normalization
            let tsIso;
            try {
              if (log.timestamp && typeof log.timestamp.toDate === 'function') {
                tsIso = log.timestamp.toDate().toISOString();
              } else if (log.timestamp instanceof Date) {
                tsIso = log.timestamp.toISOString();
              } else if (typeof log.timestamp === 'string' && !isNaN(new Date(log.timestamp).getTime())) {
                tsIso = new Date(log.timestamp).toISOString();
              } else {
                tsIso = new Date().toISOString();
              }
            } catch (_) {
              tsIso = new Date().toISOString();
            }

            const pondNumber = log.fish_pond || 'a pond';
            const submittedBy = log.submitted_by || log.username || log.user_email || 'A user';

            return {
              id: docSnap.id,
              type: 'stock-feed',
              message: `${submittedBy} submitted a stock/feed log for ${pondNumber} from ${farmNameResolved}`,
              details: `Feed: ${log.feed_brand || 'N/A'} • Amount: ${log.feed_amount ?? 'N/A'} • Cost: ${log.feed_cost ?? 'N/A'}`,
              username: submittedBy,
              timestamp: tsIso,
              read: false,
              iconKey: 'stock',
              pondId: log.fish_pond || null,
              farmName: farmNameResolved,
              reportData: { 
                ...log, 
                farm: farmId || null,
                farmId: farmId || log.farmId || log.farm,
                farmName: farmNameResolved
              },
              avatar: log.avatar || null,
              source: log.source || 'mobile'
            };
          })
        );

        notifications.push(...stockFeedNotifications);
      } catch (e) {
        console.warn('Failed to fetch stock/feed logs for notifications:', e);
      }
    }

    return notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error initializing notifications:', error);
    return [];
  }
};

// ... rest of the exports (addFishpondReportNotification, addFeedbackNotification, etc.)
// Keep everything else the same as your original file
// The NotificationBox component and its functions remain unchanged

export const addFishpondReportNotification = (pondId, reportData) => {
  const storedNotifications = localStorage.getItem('notifications');
  let notifications = storedNotifications ? JSON.parse(storedNotifications) : [];
  
  // Create notification message with farm name
  const farmName = reportData.farm || 'Unknown Farm';
  const message = reportData.source === 'mobile'
    ? `${reportData.submitted_by || reportData.user || 'A user'} submitted a new report for Fish Pond ${pondId} from ${farmName}`
    : `${reportData.submitted_by || reportData.user || 'A user'} submitted a new report for Fish Pond ${pondId} from ${farmName}`;
  
  const newNotification = {
    type: 'fishpond',
    message: message,
    username: reportData.submitted_by || reportData.user || 'Unknown User',
    timestamp: new Date().toISOString(),
    read: false,
    iconKey: "pond",
    pondId: pondId,
    farmName: farmName,
    reportData: reportData,
    avatar: reportData.avatar || null,
    source: reportData.source || 'web'
  };
  
  notifications.unshift(newNotification);
  localStorage.setItem('notifications', JSON.stringify(notifications));
  window.dispatchEvent(new Event('notifications-updated'));
};

export const addFeedbackNotification = (feedbackData) => {
  const storedNotifications = localStorage.getItem('notifications');
  let notifications = storedNotifications ? JSON.parse(storedNotifications) : [];
  
  // Format timestamp properly
  let timestamp;
  try {
    if (feedbackData.timestamp && typeof feedbackData.timestamp.toDate === 'function') {
      timestamp = feedbackData.timestamp.toDate().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Manila'
      });
    } else {
      timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Manila'
      });
    }
  } catch (error) {
    console.warn('Error formatting timestamp:', error);
    timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Manila'
    });
  }
  
  const newNotification = {
    type: 'feedback',
    message: `${feedbackData.userName || feedbackData.user || 'A user'} submitted ${feedbackData.concern || 'feedback'}: ${feedbackData.feedback?.substring(0, 50)}...`,
    details: feedbackData.feedback || 'No details',
    username: feedbackData.userName || feedbackData.user || 'Unknown User',
    timestamp: timestamp,
    read: false,
    iconKey: "feedback",
    feedbackType: feedbackData.concern || 'general',
    feedbackData: feedbackData,
    avatar: feedbackData.avatar || null,
    source: feedbackData.source || 'web'
  };
  
  notifications.unshift(newNotification);
  localStorage.setItem('notifications', JSON.stringify(notifications));
  window.dispatchEvent(new Event('notifications-updated'));
};

export const addStockFeedNotification = (pondId, stockFeedData) => {
  const storedNotifications = localStorage.getItem('notifications');
  let notifications = storedNotifications ? JSON.parse(storedNotifications) : [];
  
  // Create notification message with farm name
  const farmName = stockFeedData.farmName || stockFeedData.farm || 'Unknown Farm';
  const pondName = stockFeedData.fish_pond || pondId || 'Unknown Pond';
  const message = stockFeedData.source === 'mobile'
    ? `${stockFeedData.submitted_by || stockFeedData.username || 'A user'} submitted a stock/feed log for ${pondName} from ${farmName}`
    : `${stockFeedData.submitted_by || stockFeedData.username || 'A user'} submitted a stock/feed log for ${pondName} from ${farmName}`;
  
  // Format timestamp properly
  let timestamp;
  try {
    if (stockFeedData.timestamp && typeof stockFeedData.timestamp.toDate === 'function') {
      timestamp = stockFeedData.timestamp.toDate().toISOString();
    } else if (typeof stockFeedData.timestamp === 'string') {
      timestamp = new Date(stockFeedData.timestamp).toISOString();
    } else {
      timestamp = new Date().toISOString();
    }
  } catch (error) {
    timestamp = new Date().toISOString();
  }
  
  const newNotification = {
    type: 'stock-feed',
    message: message,
    details: `Feed: ${stockFeedData.feed_brand || 'N/A'} • Amount: ${stockFeedData.feed_amount ?? 'N/A'} • Cost: ${stockFeedData.feed_cost ?? 'N/A'}`,
    username: stockFeedData.submitted_by || stockFeedData.username || 'Unknown User',
    timestamp: timestamp,
    read: false,
    iconKey: "stock",
    pondId: pondName,
    farmName: farmName,
    reportData: stockFeedData,
    avatar: stockFeedData.avatar || null,
    source: stockFeedData.source || 'mobile'
  };
  
  notifications.unshift(newNotification);
  localStorage.setItem('notifications', JSON.stringify(notifications));
  window.dispatchEvent(new Event('notifications-updated'));
};

export const addRewardClaimNotification = (username, rewardName) => {
  const storedNotifications = localStorage.getItem('notifications');
  let notifications = storedNotifications ? JSON.parse(storedNotifications) : [];

  const newNotification = {
    type: 'reward-claim',
    message: `${username} claimed the reward: ${rewardName}`,
    username: username,
    rewardName: rewardName,
    timestamp: new Date().toISOString(),
    read: false,
    iconKey: 'reward',
  };

  notifications.unshift(newNotification);
  localStorage.setItem('notifications', JSON.stringify(notifications));
  window.dispatchEvent(new Event('notifications-updated'));
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

const removeOldNotifications = (notifications) => {
  const now = new Date().getTime();
  return notifications.filter(notification => {
    const notificationDate = new Date(notification.timestamp).getTime();
    return (now - notificationDate) <= THREE_DAYS_MS;
  });
};

const NotificationBox = ({ onOpen, onClose, externalCloseSignal }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [refreshingList, setRefreshingList] = useState(false);
  const { status: refreshMsgStatus, runRefresh, isRefreshing: isManualRefreshBusy } = useRefreshFeedback();
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Get current user from Firebase Auth
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mountedRef.current) return;
      setCurrentUser(user);
      
      // Resolve assigned farm name for current user
      if (user) {
        try {
          // Try to get user data from mobileUsers collection first
          const userDoc = await getDoc(doc(db, 'mobileUsers', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.farm) {
              const farmDoc = await getDoc(doc(db, 'farms', userData.farm));
              if (farmDoc.exists()) {
                if (!mountedRef.current) return;
                setAssignedFarmName(farmDoc.data().name || userData.farm);
              } else {
                if (!mountedRef.current) return;
                setAssignedFarmName(userData.farm);
              }
            } else {
              if (!mountedRef.current) return;
              setAssignedFarmName('');
            }
          } else {
            // Try users collection as fallback
            const userDoc2 = await getDoc(doc(db, 'users', user.uid));
            if (userDoc2.exists()) {
              const userData = userDoc2.data();
              if (userData.farm) {
                const farmDoc = await getDoc(doc(db, 'farms', userData.farm));
                if (farmDoc.exists()) {
                  setAssignedFarmName(farmDoc.data().name || userData.farm);
                } else {
                  setAssignedFarmName(userData.farm);
                }
              } else {
                setAssignedFarmName('');
              }
            } else {
              setAssignedFarmName('');
            }
          }
        } catch (error) {
          console.warn('Could not fetch user farm data:', error);
          if (!mountedRef.current) return;
          setAssignedFarmName('');
        }
      } else {
        if (!mountedRef.current) return;
        setAssignedFarmName('');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleNotificationClick = async (notification, event) => {
    // Prevent all event propagation
    event.preventDefault();
    event.stopPropagation();
    
    if (!currentUser) return;
    
    try {
      // Update read status in Firestore
      const userNotificationsRef = collection(db, 'users', currentUser.uid, 'notifications');
      const notificationRef = doc(userNotificationsRef, notification.id);
      
      await setDoc(notificationRef, sanitizeObjectStrings({
        read: true,
        lastUpdated: serverTimestamp()
      }), { merge: true });

      // Update local state
      const updatedNotifications = notifications.map(n => 
        n.id === notification.id ? { ...n, read: true } : n
      );
      if (!mountedRef.current) return;
      setNotifications(updatedNotifications);
    
      // Update unread count
      const newUnreadCount = updatedNotifications.filter(n => !n.read).length;
      if (!mountedRef.current) return;
      setUnreadCount(newUnreadCount);

      // Close the notification dropdown
      if (!mountedRef.current) return;
      setIsOpen(false);

      // Handle based on notification type
      switch (notification.type) {
        case 'fishpond':
          // Navigate to homepage and trigger modal with specific pond and farm
          if (notification.pondId) {
            // Extract pond number from the notification
            const pondNumber = parseInt(notification.pondId);
            if (!isNaN(pondNumber)) {
              const navigationState = {
                openPondModal: true,
                selectedPond: pondNumber,
                fromNotification: true,
                reportData: notification.reportData,
                farmName: notification.farmName,
                farmFilter: notification.farmName
              };
              // dev-only logs removed for production
              navigate('/Homepage', { state: navigationState });
            } else {
              if (process.env.NODE_ENV === 'development') {
                // eslint-disable-next-line no-console
                console.warn('Invalid pond number in notification:', notification.pondId);
              }
            }
          }
          break;
        case 'feedback':
          // Navigate to the feedback page with the specific feedback
          navigate('/feedback', { 
            state: { 
              feedbackData: notification.feedbackData,
              fromNotification: true 
            }
          });
          break;
        case 'stock-feed':
          // Navigate to homepage with stock-feed log data
          navigate('/Homepage', { 
            state: { 
              selectedFarmName: notification.farmName,
              farmFilter: notification.farmName,
              fromNotification: true,
              notificationData: notification
            }
          });
          break;
        default:
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.warn('Unknown notification type:', notification.type);
          }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('Error handling notification click:', error);
      }
    }
  };

  const loadNotifications = async ({ badgeOnly = false } = {}) => {
    if (!currentUser) return;

    try {
      if (!badgeOnly) setRefreshingList(true);
      const freshNotifications = await initializeNotifications(
        badgeOnly
          ? {
              reportsLimit: BADGE_REPORTS_LIMIT,
              feedbackLimit: 8,
             logsLimit: 8,
             includeStockFeed: true,
            }
          : undefined
      );
      
      // Fetch user's read status from Firestore
      const userNotificationsRef = collection(db, 'users', currentUser.uid, 'notifications');
      const userNotificationsSnapshot = await getDocs(userNotificationsRef);
      const readStatusMap = new Map();
      
      userNotificationsSnapshot.docs.forEach(doc => {
        readStatusMap.set(doc.id, doc.data().read);
      });

      // Merge notifications with read status
      let merged = freshNotifications.map(fresh => ({
        ...fresh,
        read: readStatusMap.get(fresh.id) || false
      }));

      // Apply server-side suppression: ignore notifications older than user's last cleared time
      try {
        if (currentUser?.uid) {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          const clearedAtServer = userDoc.exists() ? userDoc.data()?.notificationsClearedAt : null;
          if (clearedAtServer && clearedAtServer.toDate) {
            const clearedMs = clearedAtServer.toDate().getTime();
            merged = merged.filter(n => {
              const nMs = new Date(n.timestamp).getTime();
              return Number.isNaN(nMs) ? false : nMs > clearedMs;
            });
          }
        }
      } catch (_) {}

      // ============================================================
      // IMPROVED FARM FILTERING - Check all possible farm fields
      // ============================================================
      let filtered = merged;
      if (currentUser) {
        const normalize = (val) => (typeof val === 'string' ? val.trim().toLowerCase() : (val || '').toString().trim().toLowerCase());

        let currentUserFarmId = null;
        let currentUserFarmIdResolved = null;
        try {
          const userDoc = await getDoc(doc(db, 'mobileUsers', currentUser.uid));
          if (userDoc.exists()) {
            currentUserFarmId = userDoc.data().farm || null;
          } else {
            const userDoc2 = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc2.exists()) {
              currentUserFarmId = userDoc2.data().farm || null;
            }
          }
          
          // If currentUserFarmId looks like a name (contains spaces or special chars), resolve to ID
          if (currentUserFarmId && currentUserFarmId.match(/[\s\-]/)) {
            try {
              const farmsRef = collection(db, 'farms');
              const farmQuery = query(farmsRef, where('name', '==', currentUserFarmId), limit(1));
              const farmSnap = await getDocs(farmQuery);
              if (!farmSnap.empty) {
                currentUserFarmIdResolved = farmSnap.docs[0].id;
              }
            } catch (_) {}
          } else {
            currentUserFarmIdResolved = currentUserFarmId;
          }
        } catch (error) {
          console.warn('Could not fetch current user farm for filtering:', error);
        }

        if (currentUserFarmId || assignedFarmName) {
          const normUserFarmId = normalize(currentUserFarmIdResolved || currentUserFarmId);
          const normUserFarmName = normalize(assignedFarmName);
          const normUserFarmIdOriginal = normalize(currentUserFarmId);

          filtered = merged.filter(notification => {
            // Check all possible farm fields in the notification
            const notificationFarmName = normalize(notification.farmName);
            const notificationFarmId = normalize(notification.reportData?.farm);
            const notificationFarmId2 = normalize(notification.reportData?.farmId);
            const notificationFarmFromLog = normalize(notification.reportData?.farmName);
            
            // Also check if the log has farm data directly
            const logFarm = normalize(notification.reportData?.farm || notification.reportData?.farmId || notification.reportData?.farmName);
            
            // For stock-feed notifications, check the original log data
            const originalLogFarm = normalize(notification._originalLog?.farm || notification._originalLog?.farmId || notification._originalLog?.farmName);
            
            // Match if any normalized identity equals the user's farm
            return (
              (normUserFarmName && (
                notificationFarmName === normUserFarmName ||
                notificationFarmId === normUserFarmName ||
                notificationFarmId2 === normUserFarmName ||
                notificationFarmFromLog === normUserFarmName ||
                logFarm === normUserFarmName ||
                originalLogFarm === normUserFarmName
              )) ||
              (normUserFarmId && (
                notificationFarmName === normUserFarmId ||
                notificationFarmId === normUserFarmId ||
                notificationFarmId2 === normUserFarmId ||
                notificationFarmFromLog === normUserFarmId ||
                logFarm === normUserFarmId ||
                originalLogFarm === normUserFarmId
              )) ||
              (normUserFarmIdOriginal && (
                notificationFarmName === normUserFarmIdOriginal ||
                notificationFarmId === normUserFarmIdOriginal ||
                notificationFarmId2 === normUserFarmIdOriginal ||
                notificationFarmFromLog === normUserFarmIdOriginal ||
                logFarm === normUserFarmIdOriginal ||
                originalLogFarm === normUserFarmIdOriginal
              ))
            );
            });
        }
      }

      // Apply suppression: if user cleared, ignore items older than clearedAt until new ones arrive
      let suppressed = filtered;
      try {
        const clearedAt = localStorage.getItem('notificationsClearedAt');
        if (clearedAt) {
          const clearedMs = new Date(clearedAt).getTime();
          if (!Number.isNaN(clearedMs)) {
            suppressed = filtered.filter(n => {
              const nMs = new Date(n.timestamp).getTime();
              return Number.isNaN(nMs) ? false : nMs > clearedMs;
            });
          }
        }
      } catch (_) {}

      // Sort and clean
      const cleaned = removeOldNotifications(
        suppressed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      );

      // Update state
      if (!mountedRef.current) return;
      const newUnreadCount = cleaned.filter(n => !n.read).length;
      setUnreadCount(newUnreadCount);
      if (!badgeOnly) {
        setNotifications(cleaned);
      }
      
    } catch (error) {
      console.error('Error loading notifications:', error);
      throw error;
    } finally {
      if (!badgeOnly) setRefreshingList(false);
    }
  };

  useEffect(() => {
    if (currentUser && isOpen) {
      loadNotifications().catch(() => {});
    }
  }, [currentUser, assignedFarmName, isOpen]);

  // Lightweight badge updates (no full collection listeners)
  useEffect(() => {
    if (!currentUser) return;
    loadNotifications({ badgeOnly: true });
    const intervalId = setInterval(() => {
      loadNotifications({ badgeOnly: true });
    }, 45000);
    const onFocus = () => loadNotifications({ badgeOnly: true });
    const onLocalUpdate = () => loadNotifications({ badgeOnly: true });
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications-updated', onLocalUpdate);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications-updated', onLocalUpdate);
    };
  }, [currentUser?.uid, assignedFarmName]);

  const toggleNotifications = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !isOpen;
    setIsOpen(next);
    try {
      if (next) { onOpen && onOpen(); } else { onClose && onClose(); }
      // If opening list after a clear, drop suppression so new items can show going forward
      if (next) {
        const clearedAt = localStorage.getItem('notificationsClearedAt');
        if (clearedAt) {
          localStorage.removeItem('notificationsClearedAt');
        }
      }
    } catch (_) {}
  };

  // Close from outside (e.g., when user menu opens)
  useEffect(() => {
    if (externalCloseSignal === undefined) return;
    setIsOpen(false);
    try { onClose && onClose(); } catch (_) {}
  }, [externalCloseSignal]);

  const formatTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        // If timestamp is already in the formatted string, return it as is
        return timestamp;
      }
      
      const now = new Date();
      const diff = Math.floor((now - date) / 1000);

      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Manila'
      });
    } catch (error) {
      console.warn('Error formatting time:', error);
      return timestamp;
    }
  };

  const clearNotifications = async () => {
    setNotifications([]);
    setUnreadCount(0);
    localStorage.removeItem('notifications');
    const nowIso = new Date().toISOString();
    try {
      // Remember the time we cleared locally to prevent immediate repopulation
      localStorage.setItem('notificationsClearedAt', nowIso);
    } catch (_) {}
    try {
      // Persist suppression to Firestore so it survives logout/login and across devices
      if (currentUser?.uid) {
        await setDoc(doc(db, 'users', currentUser.uid), { notificationsClearedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) {
      // ignore server errors; local suppression still applies
    }
  };

  const getNotificationIcon = (notification) => {
    switch (notification.type) {
      case 'fishpond':
        return <FaUserCircle className="notification-type-icon" />;
      case 'feedback':
        return <FaUserCircle className="notification-type-icon" />;
      case 'stock-feed':
        return <FaUserCircle className="notification-type-icon" />;
      default:
        return <FaUserCircle className="notification-type-icon" />;
    }
  };

  return (
    <div className="notification-container" onClick={(e) => e.stopPropagation()}>
      <div className="notification-icon" onClick={toggleNotifications}>
        <IoIosNotifications />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </div>

      {isOpen && (
        <div 
          className="notification-dropdown" 
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="notification-header">
            <h3>Notifications</h3>
            <div className="notification-header-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  runRefresh(() => loadNotifications({ badgeOnly: false })).catch(() => {});
                }}
                className="refresh-notifications"
                disabled={isManualRefreshBusy || refreshingList}
                title="Refresh"
              >
                <FaSyncAlt className={(isManualRefreshBusy || refreshingList) ? 'notification-refresh-spin' : ''} />
              </button>
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearNotifications();
                }} 
                className="clear-notifications"
              >
                Clear All
              </button>
            </div>
          </div>
          <RefreshStatusMessage status={refreshMsgStatus} variant="onHeader" />
          <div className="notification-list">
            {notifications.length > 0 ? (
              notifications.map((notification, index) => (
                <div
                  key={notification.id || index}
                  className={`notification-item ${notification.read ? 'read' : 'unread'} notification-${notification.type}`}
                  onClick={(e) => handleNotificationClick(notification, e)}
                  onMouseDown={(e) => e.preventDefault()}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="notification-icon-wrapper">
                    {getNotificationIcon(notification)}
                  </div>
                  <div className="notification-content">
                    <p className="notification-message">
                      {notification.message}
                    </p>
                    <div className="notification-meta">
                      <span className="notification-user">
                        {notification.username}
                      </span>
                      <span className="notification-time">{formatTime(notification.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-notifications">No notifications yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBox;
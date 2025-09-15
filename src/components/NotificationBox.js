import React, { useState, useEffect } from 'react';
import { FaUserCircle } from 'react-icons/fa';
import { IoNotificationsOutline } from "react-icons/io5";
import './NotificationBox.css';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

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
// Initialize with Firebase data
const initializeNotifications = async () => {
  const notifications = [];

  try {
    // Fetch reports from Firebase
    const reportsRef = collection(db, 'reports');
    const reportsQuery = query(reportsRef, orderBy('timestamp', 'desc'));
    const reportsSnapshot = await getDocs(reportsQuery);
    
    reportsSnapshot.docs.forEach(doc => {
      const report = doc.data();
      const pondId = report.fish_pond ? extractPondId(report.fish_pond) : '';
      
      // Handle timestamp conversion safely
      let timestamp;
      try {
        // Check if timestamp is a Firestore Timestamp
        if (report.timestamp && typeof report.timestamp.toDate === 'function') {
          timestamp = report.timestamp.toDate().toISOString();
        } 
        // Check if it's already a Date object
        else if (report.timestamp instanceof Date) {
          timestamp = report.timestamp.toISOString();
        }
        // Check if it's already an ISO string
        else if (typeof report.timestamp === 'string') {
          // Validate it's a proper ISO string
          if (!isNaN(new Date(report.timestamp).getTime())) {
            timestamp = report.timestamp;
          } else {
            throw new Error('Invalid date string');
          }
        }
        // Fallback to current date if no valid timestamp
        else {
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
        timestamp: timestamp, // Use the processed timestamp
        read: false,
        iconKey: "pond",
        pondId,
        farmName: report.farm || 'Unknown Farm',
        reportData: report,
        avatar: report.avatar || null,
        source: report.source || 'web'
      });
    });

    // Fetch feedback from Firebase and resolve sender's farm
    const feedbackRef = collection(db, 'PiscaRisk');
    const feedbackQuery = query(feedbackRef, orderBy('timestamp', 'desc'));
    const feedbackSnapshot = await getDocs(feedbackQuery);

    const feedbackNotifications = await Promise.all(
      feedbackSnapshot.docs.map(async (docSnap) => {
        const feedback = docSnap.data();

        // Handle timestamp conversion safely for feedback
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

        // Resolve sender's farm (ID and name)
        let senderFarmId = null;
        let senderFarmName = null;
        try {
          // Feedback may store sender as uid or userId; check both
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
        } catch (_) {
          // ignore resolution errors; fall back below
        }

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
          // attach farm data for filtering
          farmName: senderFarmName || 'Unknown Farm',
          reportData: { ...(feedback || {}), farm: senderFarmId || null },
          senderUid: feedback.uid || feedback.userId || null
        };
      })
    );

    notifications.push(...feedbackNotifications);

    // Sort by timestamp (newest first)
    return notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error initializing notifications:', error);
    return [];
  }
};

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

const NotificationBox = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [assignedFarmName, setAssignedFarmName] = useState('');

  useEffect(() => {
    // Get current user from Firebase Auth
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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
                setAssignedFarmName(farmDoc.data().name || userData.farm);
              } else {
                setAssignedFarmName(userData.farm);
              }
            } else {
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
          setAssignedFarmName('');
        }
      } else {
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
      
      await setDoc(notificationRef, {
        read: true,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      // Update local state
      const updatedNotifications = notifications.map(n => 
        n.id === notification.id ? { ...n, read: true } : n
      );
      setNotifications(updatedNotifications);
    
      // Update unread count
      const newUnreadCount = updatedNotifications.filter(n => !n.read).length;
      setUnreadCount(newUnreadCount);

      // Close the notification dropdown
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
              console.log('Notification click - navigating with state:', navigationState);
              console.log('Notification data:', {
                pondId: notification.pondId,
                farmName: notification.farmName,
                reportData: notification.reportData
              });
              navigate('/Homepage', { state: navigationState });
            } else {
              console.warn('Invalid pond number in notification:', notification.pondId);
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
        default:
          console.warn('Unknown notification type:', notification.type);
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  const loadNotifications = async () => {
    if (!currentUser) return;

    try {
      // Fetch notifications from Firebase
      const freshNotifications = await initializeNotifications();
      
      // Fetch user's read status from Firestore
      const userNotificationsRef = collection(db, 'users', currentUser.uid, 'notifications');
      const userNotificationsSnapshot = await getDocs(userNotificationsRef);
      const readStatusMap = new Map();
      
      userNotificationsSnapshot.docs.forEach(doc => {
        readStatusMap.set(doc.id, doc.data().read);
      });

      // Merge notifications with read status
      const merged = freshNotifications.map(fresh => ({
        ...fresh,
        read: readStatusMap.get(fresh.id) || false
      }));

      // Apply farm filtering based on the current user's farm (ID or name)
      let filtered = merged;
      if (currentUser) {
        // helper to normalize strings safely
        const normalize = (val) => (typeof val === 'string' ? val.trim().toLowerCase() : (val || '').toString().trim().toLowerCase());

        // Get current user's farm (prefer ID from user doc); assignedFarmName is the resolved display name
        let currentUserFarmId = null;
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
        } catch (error) {
          console.warn('Could not fetch current user farm for filtering:', error);
        }

        if (currentUserFarmId || assignedFarmName) {
          const normUserFarmId = normalize(currentUserFarmId);
          const normUserFarmName = normalize(assignedFarmName);

          filtered = merged.filter(notification => {
            const notificationFarmName = normalize(notification.farmName);
            const notificationFarmId = normalize(notification.reportData?.farm);

            // Match if any normalized identity equals: name-to-name, id-to-id, id-to-name (for reports storing either)
            return (
              (normUserFarmName && notificationFarmName === normUserFarmName) ||
              (normUserFarmId && notificationFarmId === normUserFarmId) ||
              (normUserFarmId && notificationFarmName === normUserFarmId) ||
              (normUserFarmName && notificationFarmId === normUserFarmName)
            );
          });
        }
      }

      // Sort and clean
      const cleaned = removeOldNotifications(
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      );

      // Update state
      setNotifications(cleaned);
      const newUnreadCount = cleaned.filter(n => !n.read).length;
      setUnreadCount(newUnreadCount);
      
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadNotifications();
    }
  }, [currentUser, assignedFarmName]);

  const toggleNotifications = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(!isOpen);
  };

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

  const clearNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
    localStorage.removeItem('notifications');
  };

  const getNotificationIcon = (notification) => {
    switch (notification.type) {
      case 'fishpond':
        return <FaUserCircle className="notification-type-icon" />;
      case 'feedback':
        return <FaUserCircle className="notification-type-icon" />;
      default:
        return <FaUserCircle className="notification-type-icon" />;
    }
  };

  return (
    <div className="notification-container" onClick={(e) => e.stopPropagation()}>
      <div className="notification-icon" onClick={toggleNotifications}>
        <IoNotificationsOutline />
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
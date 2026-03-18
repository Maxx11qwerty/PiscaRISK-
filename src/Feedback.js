import React, { useState, useContext, useEffect } from 'react';
import './Feedback.css';
import {FaUserCircle, FaEllipsisV, FaBug, FaPalette, 
        FaLightbulb, FaTachometerAlt, FaQuestionCircle, 
        FaTimes, FaPaperPlane, FaFilter, FaSearch, FaUser, FaSignOutAlt, FaBars, FaComment} from 'react-icons/fa';
import { MdOutlineMarkChatRead, MdOutlineMarkChatUnread } from "react-icons/md";
import logo from './assets/images/PISCARISK_LOGO.png';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { logActivity, logMessages } from './utils/logger';
import { exportToCSV, exportToPDF } from './utils/exportFeedback';
import NotificationBox from './components/NotificationBox';
import Sidebar from './components/Sidebar';
import { db } from './firebase';
import { collection, query, orderBy, getDocs, where, doc, updateDoc, deleteDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { sanitizeObjectStrings, sanitizeInput } from './utils/sanitize';

const feedbackTypes = [
  { id: 'bug', label: 'Bug', icon: 'FaBug' },
  { id: 'uiux', label: 'UI/UX Issue', icon: 'FaPalette' },
  { id: 'feature request', label: 'Feature Request', icon: 'FaLightbulb' },
  { id: 'performance', label: 'Performance', icon: 'FaTachometerAlt' },
  { id: 'other', label: 'Other', icon: 'FaQuestionCircle' }
];

// Add this helper function at the top level
const formatFirestoreTimestamp = (timestamp) => {
  if (!timestamp) return null;
  
  // Handle Firestore timestamps
  if (timestamp.toDate) {
    return timestamp.toDate().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
  
  // Handle string dates (like "12/25/2024, 14:30:25")
  if (typeof timestamp === 'string') {
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      }
    } catch (error) {
    }
  }
  
  return timestamp;
};

const Feedback = () => {
  const { currentUser, handleLogout } = useContext(AuthContext);
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replies, setReplies] = useState({});
  const [searchFilter, setSearchFilter] = useState('all');
  const [showSearchFilters, setShowSearchFilters] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [isMarkingUnread, setIsMarkingUnread] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Notification close signal
  const [notificationCloseSignal, setNotificationCloseSignal] = useState(0);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [activeTab, setActiveTab] = useState('inbox');
  const [feedbackFilterValue, setFeedbackFilterValue] = useState('');
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(typeof window !== 'undefined' ? window.innerWidth <= 1023 : false);
  const navigate = useNavigate();

  // Resolve assigned farm name for current user
  useEffect(() => {
    const resolveAssignedFarmName = async () => {
      try {
        if (currentUser?.farm) {
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (farmDoc.exists()) {
            setAssignedFarmName(farmDoc.data().name || currentUser.farm);
          } else {
            setAssignedFarmName(currentUser.farm);
          }
        } else {
          setAssignedFarmName('');
        }
      } catch (e) {
        setAssignedFarmName(String(currentUser?.farm || ''));
      }
    };

    resolveAssignedFarmName();
  }, [currentUser?.farm]);

  // Fetch feedback data from Firebase
  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        setLoading(true);
        
        const feedbacksRef = collection(db, 'PiscaRisk');
        let q;
        
        // Fetch all feedback, filter by farm on client side
        if (currentUser) {
          q = query(feedbacksRef, orderBy('timestamp', 'desc'));
        } else {
          // Not authenticated - don't try to fetch
          setFeedbacks([]);
          setLoading(false);
          return;
        }

        const querySnapshot = await getDocs(q);
        
        // number of documents fetched (silenced)
        
        const fetchedFeedbacks = await Promise.all(querySnapshot.docs.map(async (snap) => {
          const data = snap.data();
          // detailed document logging removed in production
          
          // Map the concern to the correct feedback type
          const concernToType = {
            'bug': 'bug',
            'ui': 'uiux',
            'feature request': 'feature request',
            'performance': 'performance',
            'other': 'other'
          };

          // Initialize replies from Firebase data
          if (data.replies && Array.isArray(data.replies)) {
            setReplies(prev => ({
              ...prev,
              [snap.id]: data.replies
            }));
          }

          // Note: Feedback logging is handled by Cloud Function logFeedbackOnCreate
          // to avoid duplicate logs when fetching existing feedbacks
          
          // Process replies if they exist
          const processedReplies = data.replies?.map(reply => ({
            ...reply,
            date: formatFirestoreTimestamp(reply.date) || reply.date
          })) || [];

          // Fetch user farm information and role
          let userFarm = null;
          let assignedFarmName = null;
          let senderRoleRaw = null;
          const senderId = data.uid || data.userId;
          if (senderId) {
            try {
              // Try to get user data from mobileUsers collection first
              const userDoc = await getDoc(doc(db, 'mobileUsers', senderId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                userFarm = userData.farm;
                senderRoleRaw = userData.role || senderRoleRaw || 'Fish Farmer';
                if (userFarm) {
                  // Get farm name
                  const farmDoc = await getDoc(doc(db, 'farms', userFarm));
                  if (farmDoc.exists()) {
                    assignedFarmName = farmDoc.data().name || userFarm;
                  } else {
                    assignedFarmName = userFarm;
                  }
                }
              } else {
                // Try users collection as fallback
                const userDoc2 = await getDoc(doc(db, 'users', senderId));
                if (userDoc2.exists()) {
                  const userData = userDoc2.data();
                  userFarm = userData.farm;
                  senderRoleRaw = userData.role || senderRoleRaw || null;
                  if (userFarm) {
                    // Get farm name
                    const farmDoc = await getDoc(doc(db, 'farms', userFarm));
                    if (farmDoc.exists()) {
                      assignedFarmName = farmDoc.data().name || userFarm;
                    } else {
                      assignedFarmName = userFarm;
                    }
                  }
                }
              }
              // If still no farm, try to resolve via userEmail in mobileUsers
              if (!userFarm && data.userEmail) {
                try {
                  const muRef = collection(db, 'mobileUsers');
                  const muQuery = query(muRef, where('email', '==', data.userEmail));
                  const muSnap = await getDocs(muQuery);
                  if (!muSnap.empty) {
                    const muData = muSnap.docs[0].data();
                    userFarm = muData.farm;
                    senderRoleRaw = muData.role || senderRoleRaw || 'Fish Farmer';
                    if (userFarm) {
                      const farmDoc = await getDoc(doc(db, 'farms', userFarm));
                      assignedFarmName = farmDoc.exists() ? (farmDoc.data().name || userFarm) : userFarm;
                    }
                  }
                } catch (e) {
                  // ignore
                }
              }
              // sender farm resolution debug removed
            } catch (error) {
            }
          }

          return {
            id: snap.id,
            user: data.userName || 'Anonymous',
            uid: data.uid || data.userId || '',
            type: concernToType[data.concern?.toLowerCase()] || 'other',
            message: data.feedback || '',
            date: formatFirestoreTimestamp(data.timestamp),
            avatar: <FaUserCircle className="user-avatar" />,
            timestamp: data.timestamp,
            source: data.source || 'web',
            userName: data.userName || 'Anonymous',
            userRole: senderRoleRaw,
            hasResponse: data.hasResponse || false,
            lastResponseDate: formatFirestoreTimestamp(data.lastResponseDate),
            replies: processedReplies,
            status: data.status || 'active', // Add status field with default 'active'
            archivedAt: data.archivedAt || null,
            archivedBy: data.archivedBy || null,
            isRead: data.isRead !== undefined ? data.isRead : false, // Default to false (unread) if not set
            readAt: data.readAt || null,
            readBy: data.readBy || null,
            userFarm: userFarm, // Add user farm ID
            assignedFarmName: assignedFarmName // Add resolved farm name
          };
        }));

        // processed feedbacks debug removed
        setFeedbacks(fetchedFeedbacks);
      } catch (error) {
        logActivity('error', logMessages.error.database(`Error fetching feedbacks: ${error.message}`), 'System');
        setFeedbacks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFeedbacks();
  }, [currentUser]);

  // Map icon strings to actual components
  const getIconComponent = (iconName) => {
    const iconMap = {
      'FaBug': FaBug,
      'FaPalette': FaPalette,
      'FaLightbulb': FaLightbulb,
      'FaTachometerAlt': FaTachometerAlt,
      'FaQuestionCircle': FaQuestionCircle,
      'FaUserCircle': FaUserCircle
    };
    const IconComponent = iconMap[iconName];
    return IconComponent ? <IconComponent /> : null;
  };

  const handleExport = (format) => { 
    setShowDownloadOptions(false);
    
    try { 
      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      logActivity('export', logMessages.export[format === 'csv' ? 'csvDownload' : 'pdfDownload'](u, 'feedback data'), u); 
    } catch (_) {}
    
    if (format === 'csv') {
      exportToCSV(feedbacks, feedbackTypes, currentUser);
    } else if (format === 'pdf') {
      exportToPDF(feedbacks, feedbackTypes, currentUser);
    }
  };

  // Combined filtering logic
  const filteredFeedbacks = feedbacks.filter(feedback => {
    // Farm filter - apply if we have either the current user's farm ID or resolved farm name
    const hasUserFarmContext = Boolean(currentUser?.farm || assignedFarmName);
    if (hasUserFarmContext) {
      const feedbackUserFarm = feedback.userFarm;
      const feedbackUserFarmName = feedback.assignedFarmName;
      const currentUserFarmId = currentUser?.farm;
      const currentUserFarmName = assignedFarmName;

      const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : (v || '').toString().trim().toLowerCase());
      const fId = norm(feedbackUserFarm);
      const fName = norm(feedbackUserFarmName);
      const uId = norm(currentUserFarmId);
      const uName = norm(currentUserFarmName);

      const matchesFarm = (fId && (fId === uId || fId === uName)) ||
                          (fName && (fName === uId || fName === uName));

      if (!matchesFarm) {
        console.debug('Feedback filtered out by farm mismatch', {
          feedbackId: feedback.id,
          fId, fName, uId, uName,
          raw: { feedbackUserFarm, feedbackUserFarmName, currentUserFarmId, currentUserFarmName }
        });
      }

      if (!matchesFarm) {
        return false; // Skip feedback from different farms
      }
    }

    const searchTermLower = searchTerm.toLowerCase();
    const feedbackFilterLower = feedbackFilterValue.toLowerCase();
    const messageLower = (feedback.message || '').toLowerCase();
    const userLower = (feedback.userName || '').toLowerCase();
    
    // Get the feedback type label for searching
    const feedbackType = feedbackTypes.find(t => t.id === feedback.type);
    const typeLabel = feedbackType ? feedbackType.label.toLowerCase() : '';
    
    // Header search filtering
    let matchesHeaderSearch = false;
    if (searchTerm) {
      matchesHeaderSearch = messageLower.includes(searchTermLower) || 
                           userLower.includes(searchTermLower) ||
                           typeLabel.includes(searchTermLower);
    } else {
      matchesHeaderSearch = true; // If no header search, show all
    }
    
    // Feedback filter filtering
    let matchesFeedbackFilter = false;
    if (searchFilter === 'all' || !feedbackFilterValue) {
      matchesFeedbackFilter = true;
    } else if (searchFilter === 'message') {
      matchesFeedbackFilter = messageLower.includes(feedbackFilterLower);
    } else if (searchFilter === 'username') {
      matchesFeedbackFilter = userLower.includes(feedbackFilterLower);
    } else if (searchFilter === 'type') {
      matchesFeedbackFilter = typeLabel.includes(feedbackFilterLower);
    }

    // Category filtering
    const matchesCategory = activeCategory === 'All' || 
                          feedback.type === activeCategory.toLowerCase();

    // Tab filtering
    let matchesTab = true;
    if (activeTab === 'inbox') {
      // Inbox: only items without responses and not archived/resolved
      matchesTab = !feedback.hasResponse && feedback.status !== 'archived' && feedback.status !== 'resolved';
    } else if (activeTab === 'response') {
      // Response: items with responses and not archived/resolved
      matchesTab = feedback.hasResponse && feedback.status !== 'archived' && feedback.status !== 'resolved';
    } else if (activeTab === 'archive') {
      // Archive: only archived items
      matchesTab = feedback.status === 'archived';
    } else if (activeTab === 'resolved') {
      // Resolved: only resolved items
      matchesTab = feedback.status === 'resolved';
    }

    return matchesHeaderSearch && matchesFeedbackFilter && matchesCategory && matchesTab;
  });

  // Compute tab counts from the full list (respecting farm filter), not the current tab filter
  const passesFarmFilter = (feedback) => {
    const hasUserFarmContext = Boolean(currentUser?.farm || assignedFarmName);
    if (!hasUserFarmContext) return true;

    const feedbackUserFarm = feedback.userFarm;
    const feedbackUserFarmName = feedback.assignedFarmName;
    const currentUserFarmId = currentUser?.farm;
    const currentUserFarmName = assignedFarmName;

    const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : (v || '').toString().trim().toLowerCase());
    const fId = norm(feedbackUserFarm);
    const fName = norm(feedbackUserFarmName);
    const uId = norm(currentUserFarmId);
    const uName = norm(currentUserFarmName);

    const matchesFarm = (fId && (fId === uId || fId === uName)) ||
                        (fName && (fName === uId || fName === uName));

    return matchesFarm;
  };

  const inboxCount = feedbacks.filter(f => passesFarmFilter(f) && !f.hasResponse && f.status !== 'archived' && f.status !== 'resolved').length;
  const responseCount = feedbacks.filter(f => passesFarmFilter(f) && f.hasResponse && f.status !== 'archived' && f.status !== 'resolved').length;
  const archiveCount = feedbacks.filter(f => passesFarmFilter(f) && f.status === 'archived').length;

  const handleFeedbackClick = async (feedback) => {
    // If clicking on the same feedback that's already open, close it
    if (selectedFeedback && selectedFeedback.id === feedback.id) {
      setSelectedFeedback(null);
      if (isNarrow) setInboxOpen(true);
      return;
    }

    // If feedback is unread and user is admin/tech officer/new main tech officer, mark it as read
    const roleNorm = (typeof currentUser?.role === 'string' ? currentUser.role.trim().toLowerCase() : '').replace(/\s+/g, '_');
    const isPrivilegedUser = roleNorm === 'admin' || roleNorm === 'tech_officer' || roleNorm === 'new_main_tech_officer' || currentUser?.temporaryTechOfficer;
    if (!feedback.isRead && !feedback.hasResponse && isPrivilegedUser) {
      try {
        const feedbackRef = doc(db, 'PiscaRisk', feedback.id);
        await updateDoc(feedbackRef, sanitizeObjectStrings({
          isRead: true,
          readAt: new Date(),
          readBy: currentUser?.username || 'Admin'
        }));

        // Update local state
        setFeedbacks(prevFeedbacks =>
          prevFeedbacks.map(fb =>
            fb.id === feedback.id
              ? { ...fb, isRead: true, readAt: new Date(), readBy: currentUser?.username || 'Admin' }
              : fb
          )
        );

        // Update the feedback object being set as selected
        const updatedFeedback = {
          ...feedback,
          isRead: true,
          readAt: new Date(),
          readBy: currentUser?.username || 'Admin'
        };

        setSelectedFeedback(updatedFeedback);
        if (isNarrow) setInboxOpen(false);
        logActivity('feedback', `Feedback from ${feedback.userName || feedback.user || 'Anonymous'} marked as read by ${currentUser?.username || 'Admin'}`, currentUser?.username);
      } catch (error) {
        logActivity('error', `Failed to mark feedback as read: ${error.message}`, currentUser?.username);
        // If marking as read fails, still show the feedback
        setSelectedFeedback(feedback);
        if (isNarrow) setInboxOpen(false);
      }
    } else {
      // If feedback is already read or user is not admin, just show it
      setSelectedFeedback(feedback);
      if (isNarrow) setInboxOpen(false);
    }
  };

  const handleReplySubmit = async (feedbackId) => {
    if (!replyText.trim()) return;

    try {
      setIsReplying(true);
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Manila'
      });

      const adminRole = String(currentUser?.role || '').toLowerCase();
      const adminRoleDisplay = adminRole === 'temp_tech_officer' || currentUser?.temporaryTechOfficer ? 'Temporary Tech Officer'
        : adminRole === 'tech_officer' || adminRole === 'tech officer' ? 'Tech Officer'
        : adminRole === 'new_main_tech_officer' || adminRole === 'new main tech officer' ? 'Tech Officer'
        : adminRole === 'admin' ? 'Admin'
        : (adminRole || 'Admin');

      const submitterRoleRaw = selectedFeedback?.userRole || selectedFeedback?.role || selectedFeedback?.user_role || '';
      const submitterRoleNorm = String(submitterRoleRaw || '').toLowerCase();
      const submitterRoleDisplay = submitterRoleNorm === 'temp_tech_officer' || selectedFeedback?.temporaryTechOfficer ? 'Temporary Tech Officer'
        : submitterRoleNorm === 'tech_officer' || submitterRoleNorm === 'tech officer' ? 'Tech Officer'
        : submitterRoleNorm === 'admin' ? 'Admin'
        : submitterRoleNorm === 'fish_farmer' || submitterRoleNorm === 'fish farmer' ? 'Fish Farmer'
        : (submitterRoleRaw || 'Unknown');

      const newReply = {
        id: Date.now(),
        text: sanitizeInput(replyText),
        date: formattedDate,
        adminName: currentUser?.username || 'Admin',
        isAdmin: true,
        adminRole: adminRoleDisplay,
        submitterRole: submitterRoleDisplay
      };

      await updateDoc(feedbackRef, sanitizeObjectStrings({
        replies: arrayUnion(newReply),
        hasResponse: true,
        lastResponseDate: currentDate,
        isRead: true,
        readAt: currentDate,
        readBy: currentUser?.username || 'Admin'
      }));

      // Update local list state with formatted dates
      setFeedbacks(prevFeedbacks =>
        prevFeedbacks.map(feedback =>
          feedback.id === feedbackId
            ? {
                ...feedback,
                hasResponse: true,
                lastResponseDate: formattedDate,
                isRead: true,
                readAt: formattedDate,
                readBy: currentUser?.username || 'Admin',
                replies: [...(feedback.replies || []), newReply]
              }
            : feedback
        )
      );

      // Also update the currently opened detail pane immediately
      setSelectedFeedback(prev => {
        if (!prev || prev.id !== feedbackId) return prev;
        return {
          ...prev,
          hasResponse: true,
          lastResponseDate: formattedDate,
          isRead: true,
          readAt: formattedDate,
          readBy: currentUser?.username || 'Admin',
          replies: [ ...(prev.replies || []), newReply ]
        };
      });

      setReplyText('');
      logActivity('feedback', `Admin response added to feedback by ${currentUser?.username || 'Admin'}`, currentUser?.username);
    } catch (error) {
      logActivity('error', `Failed to add reply: ${error.message}`, currentUser?.username);
    } finally {
      setIsReplying(false);
    }
  };

  const closeDetailView = () => {
    setSelectedFeedback(null);
    // On mobile, also close the inbox list drawer when exiting detail view
    if (isNarrow) {
      setInboxOpen(false);
    }
    try { 
      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      logActivity('feedback', `Detail view closed in Feedback`, u); 
    } catch (_) {}
  };

  const handleArchiveFeedback = async (feedbackId) => {
    try {
      setIsArchiving(true);
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      await updateDoc(feedbackRef, sanitizeObjectStrings({
        status: 'archived',
        archivedAt: new Date(),
        archivedBy: currentUser?.username || 'Admin'
      }));
      
      // Update local state
      setFeedbacks(prevFeedbacks => 
        prevFeedbacks.map(feedback => 
          feedback.id === feedbackId 
            ? { ...feedback, status: 'archived' }
            : feedback
        )
      );

      // If the archived item is currently opened in detail while on Inbox/Response, close it
      if (selectedFeedback?.id === feedbackId) {
        if (activeTab === 'inbox' || activeTab === 'response') {
          setSelectedFeedback(null);
        } else {
          setSelectedFeedback(prev => prev ? { ...prev, status: 'archived' } : prev);
        }
      }
      
      logActivity('feedback', `Feedback archived by ${currentUser?.username || 'Admin'}`, currentUser?.username);
      setShowActions(null);
    } catch (error) {
      logActivity('error', `Failed to archive feedback: ${error.message}`, currentUser?.username);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleUnarchiveFeedback = async (feedbackId) => {
    try {
      setIsUnarchiving(true);
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      await updateDoc(feedbackRef, sanitizeObjectStrings({
        status: 'active',
        archivedAt: null,
        archivedBy: null
      }));

      // Update local state
      setFeedbacks(prevFeedbacks =>
        prevFeedbacks.map(feedback =>
          feedback.id === feedbackId
            ? { ...feedback, status: 'active' }
            : feedback
        )
      );

      // If currently viewing this archived item in Archive tab, keep it open but update status
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(prev => prev ? { ...prev, status: 'active' } : prev);
      }

      logActivity('feedback', `Feedback unarchived by ${currentUser?.username || 'Admin'}`, currentUser?.username);
      setShowActions(null);
    } catch (error) {
      logActivity('error', `Failed to unarchive feedback: ${error.message}`, currentUser?.username);
    } finally {
      setIsUnarchiving(false);
    }
  };

  const handleMarkAsRead = async (feedbackId) => {
    try {
      setIsMarkingRead(true);
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      await updateDoc(feedbackRef, sanitizeObjectStrings({
        isRead: true,
        readAt: new Date(),
        readBy: currentUser?.username || 'Admin'
      }));

      // Update local state
      setFeedbacks(prevFeedbacks =>
        prevFeedbacks.map(feedback =>
          feedback.id === feedbackId
            ? { ...feedback, isRead: true, readAt: new Date(), readBy: currentUser?.username || 'Admin' }
            : feedback
        )
      );

      // Update selected feedback if it's currently open
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(prev => prev ? { ...prev, isRead: true, readAt: new Date(), readBy: currentUser?.username || 'Admin' } : prev);
      }

      logActivity('feedback', `Feedback marked as read by ${currentUser?.username || 'Admin'}`, currentUser?.username);
    } catch (error) {
      logActivity('error', `Failed to mark feedback as read: ${error.message}`, currentUser?.username);
    } finally {
      setIsMarkingRead(false);
    }
  };

  const handleMarkAsUnread = async (feedbackId) => {
    try {
      setIsMarkingUnread(true);
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      await updateDoc(feedbackRef, sanitizeObjectStrings({
        isRead: false,
        readAt: null,
        readBy: null
      }));

      // Update local state
      setFeedbacks(prevFeedbacks =>
        prevFeedbacks.map(feedback =>
          feedback.id === feedbackId
            ? { ...feedback, isRead: false, readAt: null, readBy: null }
            : feedback
        )
      );

      // Update selected feedback if it's currently open
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(prev => prev ? { ...prev, isRead: false, readAt: null, readBy: null } : prev);
      }

      logActivity('feedback', `Feedback marked as unread by ${currentUser?.username || 'Admin'}`, currentUser?.username);
    } catch (error) {
      logActivity('error', `Failed to mark feedback as unread: ${error.message}`, currentUser?.username);
    } finally {
      setIsMarkingUnread(false);
    }
  };

  // Function to mark new feedback as unread (can be called when feedback is created)
  // Usage: Call this function after creating a new feedback document
  // Example: After adding feedback to Firebase, call markNewFeedbackAsUnread(feedbackDocId)
  const markNewFeedbackAsUnread = async (feedbackId) => {
    try {
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      await updateDoc(feedbackRef, sanitizeObjectStrings({
        isRead: false,
        readAt: null,
        readBy: null,
        hasResponse: false
      }));

      // Update local state if this feedback exists locally
      setFeedbacks(prevFeedbacks =>
        prevFeedbacks.map(feedback =>
          feedback.id === feedbackId
            ? { ...feedback, isRead: false, readAt: null, readBy: null, hasResponse: false }
            : feedback
        )
      );

      logActivity('feedback', `New feedback marked as unread: ${feedbackId}`, 'System');
    } catch (error) {
      logActivity('error', `Failed to mark new feedback as unread: ${error.message}`, 'System');
    }
  };

  // Function to ensure feedback has proper read status (useful for existing feedback without read status)
  const ensureFeedbackReadStatus = async (feedbackId) => {
    try {
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      const feedbackDoc = await getDoc(feedbackRef);
      
      if (feedbackDoc.exists()) {
        const data = feedbackDoc.data();
        
        // If feedback has no read status, mark it as unread
        if (data.isRead === undefined) {
          await updateDoc(feedbackRef, {
            isRead: false,
            readAt: null,
            readBy: null
          });
          
          // Update local state
          setFeedbacks(prevFeedbacks =>
            prevFeedbacks.map(feedback =>
              feedback.id === feedbackId
                ? { ...feedback, isRead: false, readAt: null, readBy: null }
                : feedback
            )
          );
          
          logActivity('feedback', `Existing feedback marked as unread: ${feedbackId}`, 'System');
        }
      }
    } catch (error) {
      logActivity('error', `Failed to ensure feedback read status: ${error.message}`, 'System');
    }
  };

  const handleDeleteFeedback = async (feedbackId) => {
    if (!window.confirm(t('feedback.confirmDelete'))) {
      return;
    }

    try {
      setIsDeleting(true);
      const feedbackRef = doc(db, 'PiscaRisk', feedbackId);
      await deleteDoc(feedbackRef);
      
      // Update local state
      setFeedbacks(prevFeedbacks => 
        prevFeedbacks.filter(feedback => feedback.id !== feedbackId)
      );
      
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(null);
      }
      
      logActivity('feedback', `Feedback deleted by ${currentUser?.username || 'Admin'}`, currentUser?.username);
      setShowActions(null);
    } catch (error) {
      logActivity('error', `Failed to delete feedback: ${error.message}`, currentUser?.username);
    } finally {
      setIsDeleting(false);
    }
  };

  // Sidebar navigation handlers
  const handleDashboardClick = () => {
    navigate('/Homepage');
  };

  const handleAccountManagementClick = () => {
    const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
    
    if (isTemporaryTechOfficer) {
      setErrorMessage('⚠️ Restricted Access: Your current role as a Temporary Tech Officer does not allow access to Account Management. Please contact your Admin for assistance.');
      setTimeout(() => setErrorMessage(''), 5000);
      return;
    }
    
    navigate('/AccountManagement');
  };

  const handleLogsClick = () => {
    navigate('/Logs');
  };

  const handleSidebarFeedbackClick = () => {
    // Already on feedback page
  };

  // Close all overlay UI (menus, filters, per‑message action menus) so only one can be open at a time
  const closeAllDropdowns = () => {
    setShowMenu(false);
    setShowDownloadOptions(false);
    setShowSearchFilters(false);
    setShowActions(null);
  };

  // Function to close sidebar
  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Handle sidebar toggle based on screen size
  const handleSidebarToggle = () => {
    if (window.innerWidth <= 1023) {
      // Mobile/tablet: toggle open/closed 
      setSidebarOpen(!sidebarOpen);
    } else {
      // Desktop: toggle collapsed/expanded
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  // Close sidebar/inbox when window is resized; track narrow mode
  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth <= 1023;
      setIsNarrow(narrow);
      if (!narrow) {
        setSidebarOpen(false);
        setInboxOpen(false);
      } else {
        // On mobile, ensure sidebar starts closed
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  // Close sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close if clicking inside sidebar or hamburger menu
      if (event.target.closest('.sidebar-wrapper') || event.target.closest('.header-hamburger-icon')) {
        return;
      }

      const clickedInsideManagedDropdown =
        event.target.closest('.user-menu') ||
        event.target.closest('.sidebar-export-container') ||
        event.target.closest('.feedback-filter-container') ||
        event.target.closest('.mobile-filter-container') ||
        event.target.closest('.feedback-filter-dropdown') ||
        event.target.closest('.mobile-filter-dropdown') ||
        event.target.closest('.feedback-actions') ||
        event.target.closest('.action-button') ||
        event.target.closest('.action-menu');

      if (!clickedInsideManagedDropdown) {
        closeAllDropdowns();
      }
      
      // Close sidebar if clicking elsewhere
      if (sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    // Function to handle Escape key press
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        closeAllDropdowns();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [sidebarOpen]);

  return (
    <div className={`feedback ${ (sidebarOpen || !sidebarCollapsed) ? 'sidebar-open' : '' } ${inboxOpen ? 'inbox-open' : ''} ${selectedFeedback && isNarrow ? 'detail-open' : ''} ${selectedFeedback && isNarrow ? 'mobile-detail-open' : ''}`}>
      <header className="feedback-header-bar">
        <div className="header-logo-container">
        <FaBars className="header-hamburger-icon" onClick={handleSidebarToggle} />
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">{t('login.title')}</div>
        </div>

        <div className="header-right">
          <div className="header-search-container">
            <div className="header-search-input-wrapper">
              <FaSearch className="header-search-icon" />
              <input
                type="text"
                placeholder={t('common.search')}
                className="header-search-input"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  try { 
                    const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                    logActivity('feedback', `Search performed: "${e.target.value}" in Feedback`, u); 
                  } catch (_) {}
                }}
              />
            </div>
          </div>
          
          <NotificationBox externalCloseSignal={notificationCloseSignal} />
          <div className="user-menu">
            <button onClick={() => {
              // When opening the user menu, ensure every other overlay is closed first
              setNotificationCloseSignal(prev => prev + 1); // Close notification when user menu opens
              setShowDownloadOptions(false);
              setShowSearchFilters(false);
              setShowActions(null);
              setShowMenu(prev => !prev);
            }}>
              {currentUser?.profileImage ? (
                <img 
                  src={currentUser.profileImage} 
                  alt="Profile" 
                  className="user-dropdown-profile-pic" 
                />
              ) : (
                <FaUserCircle className="user-dropdown-icon" />
              )}
            </button>
            {showMenu && (
                <div className="header-dropdown-menu">
                <button onClick={() => navigate("/ProfileSettings")}>
                  <FaUser className="dropdown-icon" />
                  {t('common.profile')}
                </button>
                <button onClick={() => handleLogout(navigate)}>
                  <FaSignOutAlt className="dropdown-icon" />
                  {t('sidebar.logout')}
                </button> 
            </div>
            )}
          </div>
        </div>
      </header>

      {/* Error Message */}
      {errorMessage && (
        <div className="error-message visible">
          {errorMessage}
        </div>
      )}

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && window.innerWidth <= 1023 && (
        <div 
          className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`}
          onClick={closeSidebar}
        />
      )}

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        currentUser={currentUser}
        showDownloadOptions={showDownloadOptions}
        setShowDownloadOptions={setShowDownloadOptions}
        handleExport={handleExport}
        onDashboardClick={handleDashboardClick}
        onAccountManagementClick={handleAccountManagementClick}
        onLogsClick={handleLogsClick}
        onFeedbackClick={handleSidebarFeedbackClick}
        nightMode={nightMode}
        setNightMode={setNightMode}
      />

      <div className="feedback-wrapper" onClick={() => {
        closeAllDropdowns();
        closeSidebar();
      }}>
        <h1 className="feedback-title">{t('feedback.title')} {t('feedback.inbox')}</h1>
      </div>

      <div className="feedback-tabs">
        <button 
          className={`feedback-tab ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('inbox');
            try { 
              const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
              logActivity('feedback', `Switched to Inbox tab in Feedback`, u); 
            } catch (_) {}
          }}
          data-count={inboxCount}
        >
          {t('feedback.inbox')}
        </button>
        <button 
          className={`feedback-tab ${activeTab === 'response' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('response');
            try { 
              const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
              logActivity('feedback', `Switched to Response tab in Feedback`, u); 
            } catch (_) {}
          }}
          data-count={responseCount}
        >
          {t('feedback.response')}
        </button>
        <button 
          className={`feedback-tab ${activeTab === 'archive' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('archive');
            try { 
              const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
              logActivity('feedback', `Switched to Archive tab in Feedback`, u); 
            } catch (_) {}
          }}
          data-count={archiveCount}
        >
          {t('feedback.archive')}
        </button>

        <div className="feedback-filter-container">
          <button 
            className="feedback-filter-btn"
            onClick={() => {
              const isOpening = !showSearchFilters;
              // When opening filters, close any other overlays (user menu, action menus, etc.)
              setShowMenu(false);
              setShowDownloadOptions(false);
              setShowActions(null);
              setShowSearchFilters(!showSearchFilters);
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('feedback', `Filter menu ${isOpening ? 'opened' : 'closed'} in Feedback`, u); 
              } catch (_) {}
            }}
          >
            <FaFilter className="filter-icon" />
            {t('common.filter')}
          </button>
          {showSearchFilters && (
            <div className="feedback-filter-dropdown">
              <div className="feedback-filter-header">
                <label>{t('feedback.category')}:</label>
                <div className="feedback-category-options">
                      <button
                        className={`feedback-category-option ${activeCategory === 'All' ? 'active' : ''}`}
                        onClick={() => {
                          closeAllDropdowns();
                          setActiveCategory('All');
                          try { 
                            const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                            logActivity('feedback', `Category filter changed to All in Feedback`, u); 
                          } catch (_) {}
                        }}
                      >
                    {t('common.all')}
                  </button>
                  {feedbackTypes.map(type => (
                    <button
                      key={type.id}
                      className={`feedback-category-option ${activeCategory === type.label ? 'active' : ''}`}
                      onClick={() => {
                        setActiveCategory(type.label);
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('feedback', `Category filter changed to ${type.label} in Feedback`, u); 
                        } catch (_) {}
                      }}
                    >
                      {getIconComponent(type.icon)}
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="feedback-filter-header">
                <label>{t('feedback.filterType')}:</label>
                <select
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('feedback', `Filter type changed to ${e.target.value} in Feedback`, u); 
                    } catch (_) {}
                  }}
                  className="feedback-filter-select"
                >
                  <option value="all">{t('common.all')}</option>
                  <option value="message">{t('feedback.message')}</option>
                  <option value="username">{t('feedback.username')}</option>
                  <option value="type">{t('feedback.type')}</option>
                </select>
              </div>
              
              {searchFilter !== 'all' && (
                <div className="feedback-filter-section">
                  <label>{t('feedback.filterValue')}:</label>
                  <input
                    type="text"
                    placeholder={t('feedback.enterFilterValue', { filterType: t(`feedback.${searchFilter}`) })}
                    value={feedbackFilterValue}
                    onChange={(e) => setFeedbackFilterValue(e.target.value)}
                    className="feedback-filter-input"
                  />
                </div>
              )}
              
              <div className="feedback-filter-actions">
                <button 
                  className="feedback-apply-filter-btn"
                  onClick={() => {
                    setShowSearchFilters(false);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('feedback', `Filter applied in Feedback`, u); 
                    } catch (_) {}
                  }}
                >
                  {t('common.apply')}
                </button>
                <button 
                  className="feedback-clear-filter-btn"
                  onClick={() => {
                    setSearchFilter('all');
                    setFeedbackFilterValue('');
                    setActiveCategory('All');
                    setShowSearchFilters(false);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('feedback', `Filter cleared in Feedback`, u); 
                    } catch (_) {}
                  }}
                >
                  {t('common.clear')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
        
      <div className="feedback-container" onClick={() => {
        closeAllDropdowns();
        closeSidebar();
      }}>
        {/* Main content area */}
        <div className={`content-area ${isNarrow ? 'narrow' : ''}`}>
          {/* Mobile toggle to open inbox drawer */}
          {isNarrow && (
            <div className="mobile-tab-row">
              <button 
                className={`mobile-tab ${activeTab === 'inbox' ? 'active' : ''}`}
                onClick={() => { setActiveTab('inbox'); setInboxOpen(true); }}
              >
                {t('feedback.inbox')}
                <span className="mobile-badge">{inboxCount}</span>
              </button>
              <button 
                className={`mobile-tab ${activeTab === 'response' ? 'active' : ''}`}
                onClick={() => { setActiveTab('response'); setInboxOpen(true); }}
              >
                {t('feedback.response')}
                <span className="mobile-badge">{responseCount}</span>
              </button>
              <button 
                className={`mobile-tab ${activeTab === 'archive' ? 'active' : ''}`}
                onClick={() => { setActiveTab('archive'); setInboxOpen(true); }}
              >
                {t('feedback.archive')}
                <span className="mobile-badge">{archiveCount}</span>
              </button>
            </div>
          )}
          {isNarrow && (
          <div className="mobile-filter-container">
            <button 
              className="mobile-filter-btn"
              onClick={(e) => {
                e.stopPropagation();
                const isOpening = !showSearchFilters;
                // When opening filters on mobile, close any other overlays
                setShowMenu(false);
                setShowDownloadOptions(false);
                setShowActions(null);
                setShowSearchFilters(!showSearchFilters);
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('feedback', `Filter menu ${isOpening ? 'opened' : 'closed'} in Feedback (mobile)`, u); 
                } catch (_) {}
              }}
            >
              <FaFilter className="filter-icon" /> {t('common.filter')}
            </button>
            {showSearchFilters && (
              <div 
                className="mobile-filter-dropdown"
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="feedback-filter-header">
                    <label>{t('feedback.category')}:</label>
                    <div className="feedback-category-options">
                      <button
                        className={`feedback-category-option ${activeCategory === 'All' ? 'active' : ''}`}
                        onClick={() => setActiveCategory('All')}
                      >
                        {t('common.all')}
                      </button>
                      {feedbackTypes.map(type => (
                        <button
                          key={type.id}
                          className={`feedback-category-option ${activeCategory === type.label ? 'active' : ''}`}
                          onClick={() => setActiveCategory(type.label)}
                        >
                          {getIconComponent(type.icon)}
                          <span>{type.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="feedback-filter-header">
                    <label>{t('feedback.filterType')}:</label>
                    <select
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="feedback-filter-select"
                    >
                      <option value="all">{t('common.all')}</option>
                      <option value="message">{t('feedback.message')}</option>
                      <option value="username">{t('feedback.username')}</option>
                      <option value="type">{t('feedback.type')}</option>
                    </select>
                  </div>

                  {searchFilter !== 'all' && (
                    <div className="feedback-filter-section">
                      <label>{t('feedback.filterValue')}:</label>
                      <input
                        type="text"
                        placeholder={t('feedback.enterFilterValue', { filterType: t(`feedback.${searchFilter}`) })}
                        value={feedbackFilterValue}
                        onChange={(e) => setFeedbackFilterValue(e.target.value)}
                        className="feedback-filter-input"
                      />
                    </div>
                  )}

                  <div className="feedback-filter-actions">
                    <button 
                      className="feedback-apply-filter-btn"
                      onClick={() => setShowSearchFilters(false)}
                    >
                      {t('common.apply')}
                    </button>
                    <button 
                      className="feedback-clear-filter-btn"
                      onClick={() => { setSearchFilter('all'); setFeedbackFilterValue(''); setActiveCategory('All'); setShowSearchFilters(false); }}
                    >
                      {t('common.clear')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className={`inbox-container ${isNarrow ? (inboxOpen ? 'open' : 'closed') : ''}`}>
            {/* Mobile close button for inbox */}
            {isNarrow && !selectedFeedback && (
              <button className="inbox-close-btn" onClick={() => setInboxOpen(false)}>
                ×
              </button>
            )}
            {loading ? (
              <div className="loading-feedback">
                <div className="loading-spinner"></div>
                <p>{t('feedback.loading')}</p>
              </div>
            ) : filteredFeedbacks.length > 0 ? (
              filteredFeedbacks.map(feedback => (
                <div 
                  key={feedback.id} 
                  className={`feedback-card ${selectedFeedback?.id === feedback.id ? 'selected' : ''} ${!feedback.isRead && !feedback.hasResponse ? 'unread' : ''}`}
                >
                  <div className="feedback-card-content" onClick={() => handleFeedbackClick(feedback)}>
                    <div className="user-avatar-container">
                      {feedback.avatar}
                      <span className="user-name">{feedback.userName || feedback.user}</span>
                      {!feedback.isRead && !feedback.hasResponse && (
                        <span className="unread-badge">
                          <FaComment /> {t('feedback.unread')}
                        </span>
                      )}
                      {feedback.hasResponse && (
                        <span className="response-badge">
                          <FaPaperPlane /> {t('feedback.responded')}
                        </span>
                      )}
                    </div>
                    <div className="feedback-content">
                      <div className="feedback-categ">
                        <span className={`feedback-type ${feedback.type.replace(' ', '-')}`}>
                          {getIconComponent(feedbackTypes.find(t => t.id === feedback.type)?.icon)}
                          {feedbackTypes.find(t => t.id === feedback.type)?.label}
                        </span>
                      </div>
                      <p className="feedback-message">{feedback.message}</p>
                    </div>
                  </div>
                    <div className="feedback-actions">
                    <span className="feedback-date">{feedback.date}</span>
                    { (() => {
                      const roleNorm = (typeof currentUser?.role === 'string' ? currentUser.role.trim().toLowerCase() : '').replace(/\s+/g, '_');
                      const isPrivileged = roleNorm === 'admin' || roleNorm === 'tech_officer' || roleNorm === 'new_main_tech_officer' || currentUser?.temporaryTechOfficer;
                      const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : (v || '').toString().trim().toLowerCase());
                      const fId = norm(feedback.userFarm);
                      const fName = norm(feedback.assignedFarmName);
                      const uId = norm(currentUser?.farm);
                      const uName = norm(assignedFarmName);
                      const sameFarm = (fId && (fId === uId || fId === uName)) || (fName && (fName === uId || fName === uName));
                      return isPrivileged || sameFarm;
                    })() && (
                      <>
                        {/* Mark as Read/Unread Icons */}
                        {feedback.isRead ? (
                          <button 
                            className="action-button unread-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsUnread(feedback.id);
                            }}
                            disabled={isMarkingUnread}
                            title={t('feedback.markAsUnread')}
                          >
                            <MdOutlineMarkChatUnread />
                          </button>
                        ) : (
                          <button 
                            className="action-button read-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(feedback.id);
                            }}
                            disabled={isMarkingRead}
                            title={t('feedback.markAsRead')}
                          >
                            <MdOutlineMarkChatRead />
                          </button>
                        )}
                        
                        <button 
                          className="action-button"
                          onClick={(e) => {
                            e.stopPropagation();
                          // When opening an action menu, close all other overlays and menus first
                          setShowMenu(false);
                          setShowDownloadOptions(false);
                          setShowSearchFilters(false);
                          setShowActions(prev => prev === feedback.id ? null : feedback.id);
                          }}
                        >
                          <FaEllipsisV />
                        </button>
                        {showActions === feedback.id && (
                          <div className="action-menu">
                            {(feedback.status === 'archived' || feedback.status === 'Archived') ? (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnarchiveFeedback(feedback.id);
                                }}
                                disabled={isUnarchiving}
                              >
                                {isUnarchiving ? t('feedback.unarchiving') : t('feedback.unarchive')}
                              </button>
                            ) : (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchiveFeedback(feedback.id);
                                }}
                                disabled={isArchiving}
                              >
                                {isArchiving ? t('feedback.archiving') : t('feedback.archive')}
                              </button>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFeedback(feedback.id);
                              }}
                              disabled={isDeleting}
                              className="delete-button"
                            >
                              {isDeleting ? t('feedback.deleting') : t('feedback.delete')}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-feedback">
                <p>{t('feedback.noFeedback')}</p>
              </div>
            )}
          </div>
          {/* Backdrop when inbox drawer is open on mobile */}
          {isNarrow && inboxOpen && (
            <div className="inbox-backdrop" onClick={() => setInboxOpen(false)} />
          )}
                      {selectedFeedback ? (
              <div className={`feedback-detail ${isNarrow ? 'mobile-open' : ''}`}>
                {/* Mobile close button for feedback detail */}
                {isNarrow && selectedFeedback && (
                  <button className="detail-close-btn" onClick={closeDetailView}>
                    ×
                  </button>
                )}
                <div className="detail-header-top">
                  <span className="feedback-date">{selectedFeedback.date}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                    { (() => {
                      const roleNorm = (typeof currentUser?.role === 'string' ? currentUser.role.trim().toLowerCase() : '').replace(/\s+/g, '_');
                      const isPrivileged = roleNorm === 'admin' || roleNorm === 'tech_officer' || roleNorm === 'new_main_tech_officer' || currentUser?.temporaryTechOfficer;
                      const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : (v || '').toString().trim().toLowerCase());
                      const fId = norm(selectedFeedback.userFarm);
                      const fName = norm(selectedFeedback.assignedFarmName);
                      const uId = norm(currentUser?.farm);
                      const uName = norm(assignedFarmName);
                      const sameFarm = (fId && (fId === uId || fId === uName)) || (fName && (fName === uId || fName === uName));
                      return isPrivileged || sameFarm;
                    })() && (
                      <>
                        {/* Mark as Read/Unread Icons */}
                        {selectedFeedback.isRead ? (
                          <button 
                            className="action-button unread-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsUnread(selectedFeedback.id);
                            }}
                            disabled={isMarkingUnread}
                            title={t('feedback.markAsUnread')}
                          >
                            <MdOutlineMarkChatUnread />
                          </button>
                        ) : (
                          <button 
                            className="action-button read-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(selectedFeedback.id);
                            }}
                            disabled={isMarkingRead}
                            title={t('feedback.markAsRead')}
                          >
                            <MdOutlineMarkChatRead />
                          </button>
                        )}
                        
                        <div style={{ position: 'relative' }}>
                          <button 
                            className="action-button"
                            onClick={(e) => {
                              e.stopPropagation();
                          // When opening detail action menu, close all other overlays and menus first
                          setShowMenu(false);
                          setShowDownloadOptions(false);
                          setShowSearchFilters(false);
                          setShowActions(prev => prev === selectedFeedback.id ? null : selectedFeedback.id);
                            }}
                          >
                            <FaEllipsisV />
                          </button>
                          {showActions === selectedFeedback.id && (
                            <div className="action-menu">
                              {(selectedFeedback.status === 'archived' || selectedFeedback.status === 'Archived') ? (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnarchiveFeedback(selectedFeedback.id);
                                    setShowActions(null);
                                  }}
                                  disabled={isUnarchiving}
                                >
                                  {isUnarchiving ? t('feedback.unarchiving') : t('feedback.unarchive')}
                                </button>
                              ) : (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArchiveFeedback(selectedFeedback.id);
                                    setShowActions(null);
                                  }}
                                  disabled={isArchiving}
                                >
                                  {isArchiving ? t('feedback.archiving') : t('feedback.archive')}
                                </button>
                              )}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFeedback(selectedFeedback.id);
                                  setShowActions(null);
                                }}
                                disabled={isDeleting}
                                className="delete-button"
                              >
                                {isDeleting ? t('feedback.deleting') : t('feedback.delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    <button className="close-detail" onClick={closeDetailView}>
                      <FaTimes />
                    </button>
                  </div>
                </div>
                
                <div className="detail-header">
                  <div className="user-avatar-container">
                    {selectedFeedback.avatar}
                    <span className="user-name">{selectedFeedback.userName || selectedFeedback.user}</span>
                  </div>
                  <div className="feedback-meta">
                    <span className={`feedback-type ${selectedFeedback.type}`}>
                      {getIconComponent(feedbackTypes.find(t => t.id === selectedFeedback.type)?.icon)}
                      {feedbackTypes.find(t => t.id === selectedFeedback.type)?.label}
                    </span>
                  </div>
                </div>

              <div className="original-message">
                <h3>{t('feedback.title')}:</h3>
                <p>{selectedFeedback.message}</p>
              </div>

              <div className="replies-container">
                <h3>{t('feedback.responses')}:</h3>
                {selectedFeedback?.replies?.length > 0 ? (
                  selectedFeedback.replies.map(reply => (
                    <div key={reply.id} className="reply-message admin-reply">
                      <div className="reply-header">
                        <FaUserCircle className="admin-avatar" />
                        <span>{reply.adminName}{reply.adminRole ? ` — ${reply.adminRole}` : ''}</span>
                        <span className="reply-date">{reply.date}</span>
                      </div>
                      <p>{reply.text}</p>
                      {reply.submitterRole && (
                        <div className="reply-meta" style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                          Submitter Role: {reply.submitterRole}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="no-replies">{t('feedback.noResponses')}</p>
                )}
              </div>

              <div className="reply-box">
                <textarea
                  placeholder={t('feedback.typeResponse')}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={isReplying}
                />
                <button 
                  className="send-reply"
                  onClick={() => handleReplySubmit(selectedFeedback.id)}
                  disabled={isReplying || !replyText.trim()}
                >
                  {isReplying ? t('feedback.sending') : <><FaPaperPlane /> {t('feedback.sendResponse')}</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="feedback-detail-placeholder">
              <div className="placeholder-content">
                <FaComment className="placeholder-icon" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Feedback;
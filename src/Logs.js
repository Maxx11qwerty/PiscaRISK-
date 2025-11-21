import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaEllipsisV, FaBars, FaSearch, FaUserCircle, FaUser, FaSignOutAlt, FaFilter, FaSync } from 'react-icons/fa';
import logo from "./assets/images/PISCARISK_LOGO.png";
import NotificationBox from './components/NotificationBox';
import { getAllLogs } from './utils/logger';
import { exportLogs } from './utils/exportLogs';
import Sidebar from './components/Sidebar';
import { db, getData } from './firebase';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';

import './Logs.css';
import './Logs-crm.css';

const Logs = () => {
  const { t } = useTranslation();
  const { currentUser, handleLogout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Sidebar UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [language, setLanguage] = useState('en');
  
  // Filter states
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedFilterType, setSelectedFilterType] = useState('All');
  const [filterValue, setFilterValue] = useState('');
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [rowActionsOpenId, setRowActionsOpenId] = useState(null);
  const [deletingLogId, setDeletingLogId] = useState(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [logToDelete, setLogToDelete] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // New filter states
  const [dateRange, setDateRange] = useState('All'); // All, Today, Yesterday, Last7Days, Last30Days, Custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [uniqueUsernames, setUniqueUsernames] = useState([]);
  
  // Notification close signal
  const [notificationCloseSignal, setNotificationCloseSignal] = useState(0);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage, setLogsPerPage] = useState(20); // Default to 20 logs per page
  
  // Decode common HTML entities for display-only rendering of sanitized log messages
  const decodeHtml = (str = '') => {
    const map = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
    };
    return String(str).replace(/(&amp;|&lt;|&gt;|&quot;|&#39;)/g, (m) => map[m] || m);
  };

  // Date range helper functions
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);

    switch (dateRange) {
      case 'Today':
        return { start: today, end: now };
      case 'Yesterday':
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { start: yesterday, end: yesterdayEnd };
      case 'Last7Days':
        return { start: last7Days, end: now };
      case 'Last30Days':
        return { start: last30Days, end: now };
      case 'Custom':
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          return { start, end };
        }
        return null;
      default:
        return null;
    }
  };

  // Helper to format role for comparison
  const normalizeRole = (role) => {
    if (!role) return '';
    const roleStr = String(role).toLowerCase().trim();
    if (roleStr === 'tech_officer' || roleStr === 'tech officer' || roleStr === 'new_main_tech_officer' || roleStr === 'new main tech officer') {
      return 'Tech Officer';
    }
    if (roleStr === 'admin' || roleStr === 'farm admin') {
      return roleStr.includes('farm') ? 'Farm Admin' : 'Admin';
    }
    if (roleStr === 'fish_farmer' || roleStr === 'fish farmer') {
      return 'Fish Farmer';
    }
    if (roleStr === 'temp_tech_officer' || roleStr === 'temporary tech officer') {
      return 'Temporary Tech Officer';
    }
    return role;
  };
  
  // Close dropdowns helper to match AccountManagement header behavior
  const closeAllDropdowns = () => {
    setShowMenu(false);
    setShowDownloadOptions(false);
    setShowFilterDropdown(false);
    setRowActionsOpenId(null);
  };

  // Close sidebar when window is resized to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1023) {
        setSidebarOpen(false);
      } else {
        // On mobile, ensure sidebar is closed when resizing
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

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

  // Close sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close if clicking inside sidebar or hamburger menu
      if (event.target.closest('.sidebar-wrapper') || event.target.closest('.header-hamburger-icon')) {
        return;
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

  // Debounce search term to avoid lagging on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Function to fetch logs - extracted to be reusable
  const fetchLogs = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      
      // Fetch active users from account management (all roles: Tech Officer, Admin, Farm Admin, Fish Farmer, Temporary Tech Officer)
      let activeUsers = [];
      try {
        const webUsers = await getData('users');
        const mobileUsers = await getData('mobileUsers');
        const allUsers = [...webUsers, ...mobileUsers];
        
        // Filter to only active users (status === 'active', case-insensitive)
        // Include ALL roles that have active status (Tech Officer, Admin, Farm Admin, Fish Farmer, Temporary Tech Officer, etc.)
        activeUsers = allUsers.filter(user => {
          if (!user || !user.username) return false;
          
          const status = String(user.status || '').toLowerCase().trim();
          
          // Check if user is explicitly deactivated (comprehensive check)
          const deactivatedBy = user.deactivatedBy && String(user.deactivatedBy).trim() !== '' && String(user.deactivatedBy).trim() !== 'null';
          const deactivatedAt = user.deactivatedAt && String(user.deactivatedAt).trim() !== '' && String(user.deactivatedAt).trim() !== 'null';
          const deactivationReason = user.deactivationReason && String(user.deactivationReason).trim() !== '' && String(user.deactivationReason).trim() !== 'null';
          const temporarilyInactive = user.temporarilyInactiveDueToReplacement === true;
          
          // Check if expired Temporary Tech Officer (similar to AccountManagement logic)
          let isExpiredTempTO = false;
          if (user.effectiveTo) {
            try {
              const effectiveToDate = new Date(user.effectiveTo);
              if (!isNaN(effectiveToDate.getTime())) {
                const now = new Date();
                const isExpired = effectiveToDate.getTime() < now.getTime();
                const hasTempTORole = String(user.role || '').toLowerCase() === 'temp_tech_officer';
                const hadTempTOFlag = user.temporaryTechOfficer === true || user.hasBeenTempTechOfficer === true || user.effectiveFrom;
                
                if (isExpired && status === 'inactive' && (hasTempTORole || hadTempTOFlag || user.effectiveFrom)) {
                  isExpiredTempTO = true;
                }
              }
            } catch (e) {
              // Ignore date parsing errors
            }
          }
          
          // If explicitly deactivated or expired temp TO, exclude
          if (deactivatedBy || deactivatedAt || deactivationReason || temporarilyInactive || isExpiredTempTO) {
            return false;
          }
          
          // Only include users with active status (check for "active" regardless of case)
          return status === 'active';
        });
        
        // Debug: Log how many active users were found
        if (allUsers.length > 0) {
        }
      } catch (userError) {
      }
      
      // Create a set of active usernames (normalized to lowercase for case-insensitive matching)
      const activeUsernamesSet = new Set();
      activeUsers.forEach(user => {
        if (user.username && user.username.trim()) {
          const trimmedUsername = user.username.trim();
          const normalizedUsername = trimmedUsername.toLowerCase();
          // Add both normalized (lowercase) and original (trimmed) versions
          activeUsernamesSet.add(normalizedUsername);
          activeUsernamesSet.add(trimmedUsername);
          // Also add email as a fallback if email matches username pattern
          if (user.email && user.email.trim()) {
            const emailLower = user.email.trim().toLowerCase();
            const emailWithoutDomain = emailLower.split('@')[0];
            if (emailWithoutDomain === normalizedUsername || emailWithoutDomain === trimmedUsername.toLowerCase()) {
              activeUsernamesSet.add(emailLower);
              activeUsernamesSet.add(emailWithoutDomain);
            }
          }
        }
      });
      
      
      // Fetch logs from Firebase
      const logs = await getAllLogs();
      
      // Filter logs to only show logs from active users
      const activeUserLogs = logs.filter(log => {
        if (!log.username || !log.username.trim()) {
          return false; // Exclude logs without username
        }
        const logUsername = log.username.trim();
        const normalizedLogUsername = logUsername.toLowerCase();
        
        // Check if log username matches any active username (case-insensitive)
        // Try exact matches first
        if (activeUsernamesSet.has(logUsername) || activeUsernamesSet.has(normalizedLogUsername)) {
          return true;
        }
        
        // Also check if log username contains any active username (partial match)
        // This helps catch cases where username format might differ slightly
        for (const activeUsername of activeUsernamesSet) {
          if (logUsername.toLowerCase().includes(activeUsername.toLowerCase()) || 
              activeUsername.toLowerCase().includes(logUsername.toLowerCase())) {
            return true;
          }
        }
        
        return false;
      });
      
      // Check for logs with invalid timestamps
      const logsWithInvalidTimestamps = activeUserLogs.filter(log => !log.timestamp);
      if (logsWithInvalidTimestamps.length > 0) {
      }
      
      // Extract unique usernames from active user logs
      const usernames = [...new Set(activeUserLogs.map(log => log.username).filter(Boolean))].sort();
      
      // If current user is a fish farmer, only show their own username
      const roleLower = String(currentUser?.role || '').toLowerCase();
      const isFishFarmer = roleLower === 'fish_farmer' || roleLower === 'fish farmer';
      
      let filteredUsernames = usernames;
      if (isFishFarmer && currentUser?.username) {
        filteredUsernames = [currentUser.username];
      }
      
      setUniqueUsernames(filteredUsernames);
      setLogs(activeUserLogs);
      setFilteredLogs(activeUserLogs);
    } catch (error) {
      setLogs([]);
      setFilteredLogs([]);
      setUniqueUsernames([]);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
      setIsRefreshing(false);
    }
  }, [currentUser]);

  // Refresh function - manually trigger refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLogs(false); // Don't show loading spinner on manual refresh
  };

  useEffect(() => {
    fetchLogs();
  }, [currentUser]);

  // Real-time listener for automatic log updates
  useEffect(() => {
    if (!currentUser) return;
    
    // Debounce rapid snapshot bursts
    let timeoutId = null;
    const scheduleRefresh = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchLogs(false); // Refresh without loading spinner
        timeoutId = null;
      }, 500); // 500ms debounce
    };

    // Listen to systemLogs collection for real-time updates
    const logsUnsub = onSnapshot(collection(db, 'systemLogs'), scheduleRefresh, (error) => {
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      try { logsUnsub && logsUnsub(); } catch (_) {}
    };
  }, [currentUser, fetchLogs]);

  useEffect(() => {
    // Filter logs based on search term and category
    let filtered = logs;
    
    // Farm filter - if current user is assigned to a farm, only show logs from users in the same farm
    const isAssignedToFarm = currentUser?.farm;
    if (isAssignedToFarm) {
      filtered = filtered.filter(log => {
        const logUserFarm = log.userFarm;
        const currentUserFarm = currentUser.farm;
        
        // Check if log user's farm matches current user's farm
        const matchesFarm = logUserFarm === currentUserFarm ||
                           logUserFarm === assignedFarmName ||
                           logUserFarm?.toLowerCase() === currentUserFarm?.toLowerCase() ||
                           logUserFarm?.toLowerCase() === assignedFarmName?.toLowerCase();
        
        return matchesFarm;
      });
    }
    
    // Date range filter
    if (dateRange !== 'All') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let dateRangeObj = null;
      
      switch (dateRange) {
        case 'Today':
          dateRangeObj = { start: today, end: now };
          break;
        case 'Yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayEnd = new Date(yesterday);
          yesterdayEnd.setHours(23, 59, 59, 999);
          dateRangeObj = { start: yesterday, end: yesterdayEnd };
          break;
        case 'Last7Days':
          const last7Days = new Date(today);
          last7Days.setDate(last7Days.getDate() - 7);
          dateRangeObj = { start: last7Days, end: now };
          break;
        case 'Last30Days':
          const last30Days = new Date(today);
          last30Days.setDate(last30Days.getDate() - 30);
          dateRangeObj = { start: last30Days, end: now };
          break;
        case 'Custom':
          if (customStartDate && customEndDate) {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            dateRangeObj = { start, end };
          }
          break;
      }
      
      if (dateRangeObj) {
        filtered = filtered.filter(log => {
          if (!log.timestamp) return false;
          try {
            const logDate = new Date(log.timestamp);
            return logDate >= dateRangeObj.start && logDate <= dateRangeObj.end;
          } catch (e) {
            return false;
          }
        });
      }
    }
    
    // Role filter
    if (selectedRole !== 'All') {
      filtered = filtered.filter(log => {
        const role = log.role;
        if (!role) return false;
        const roleStr = String(role).toLowerCase().trim();
        let normalizedLogRole = '';
        
        if (roleStr === 'tech_officer' || roleStr === 'tech officer' || roleStr === 'new_main_tech_officer' || roleStr === 'new main tech officer') {
          normalizedLogRole = 'Tech Officer';
        } else if (roleStr === 'admin' || roleStr === 'farm admin') {
          // Check if it's Farm Admin by checking log.userFarm or log.farm properties
          // This matches the display logic in the table
          if (log.userFarm || log.farm) {
            normalizedLogRole = 'Farm Admin';
          } else {
            normalizedLogRole = 'Admin';
          }
        } else if (roleStr === 'fish_farmer' || roleStr === 'fish farmer') {
          normalizedLogRole = 'Fish Farmer';
        } else if (roleStr === 'temp_tech_officer' || roleStr === 'temporary tech officer' || roleStr === 'temporarytechofficer') {
          normalizedLogRole = 'Temporary Tech Officer';
        } else {
          normalizedLogRole = role;
        }
        
        return normalizedLogRole === selectedRole;
      });
    }
    
    // Source filter
    if (selectedSource !== 'All') {
      filtered = filtered.filter(log => {
        let source = 'Web';
        if (log.isMobileUser) {
          source = 'Mobile';
        } else if (log.source) {
          source = log.source;
        }
        return source === selectedSource;
      });
    }
    
    // Search filter - apply after other filters but search across multiple fields
    // Use debouncedSearchTerm to avoid lagging on every keystroke
    if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
      const searchTermLower = debouncedSearchTerm.toLowerCase().trim();
      // Normalize search term: replace spaces with underscores and vice versa for flexible matching
      const searchTermNormalized = searchTermLower.replace(/\s+/g, '_').replace(/_/g, ' ');
      const searchTermNoSeparator = searchTermLower.replace(/[\s_]/g, '');
      
      filtered = filtered.filter(log => {
        // Search in message/details
        const message = String(log.message || '').toLowerCase();
        if (message.includes(searchTermLower)) return true;
        
        // Search in username
        const username = String(log.username || '').toLowerCase();
        if (username.includes(searchTermLower)) return true;
        
        // Search in category
        const category = String(log.category || '').toLowerCase();
        if (category.includes(searchTermLower)) return true;
        
        // Search in role - normalize role string for flexible matching (handle both "fish_farmer" and "fish farmer")
        // Also check the formatted display role to match what's shown in the table
        const role = String(log.role || '').toLowerCase().trim();
        const roleNormalized = role.replace(/_/g, ' ').replace(/\s+/g, ' ');
        const roleNoSeparator = role.replace(/[\s_]/g, '');
        
        // Get the formatted display role (matches the display logic in the table)
        let displayRole = '';
        if (role && role !== 'unknown') {
          if (role === 'temp_tech_officer' || role === 'temporary tech officer' || role === 'temporarytechofficer') {
            displayRole = 'Temporary Tech Officer';
          } else if (role === 'tech_officer' || role === 'tech officer' || role === 'new_main_tech_officer' || role === 'new main tech officer') {
            displayRole = 'Tech Officer';
          } else if (role === 'fish_farmer' || role === 'fish farmer') {
            displayRole = 'Fish Farmer';
          } else if (role === 'super_admin' || role === 'super admin') {
            displayRole = 'Super Admin';
          } else if (role === 'admin') {
            // Check if it's Farm Admin
            if (log.userFarm || log.farm) {
              displayRole = 'Farm Admin';
            } else {
              displayRole = 'Admin';
            }
          } else {
            // Format role (capitalize first letter of each word)
            displayRole = String(log.role)
              .split('_')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          }
        }
        const displayRoleLower = displayRole.toLowerCase();
        
        // Check all role variations
        if (role.includes(searchTermLower) || 
            roleNormalized.includes(searchTermLower) ||
            roleNormalized.includes(searchTermNormalized) ||
            roleNoSeparator.includes(searchTermNoSeparator) ||
            displayRoleLower.includes(searchTermLower) ||
            displayRoleLower.includes(searchTermNormalized) ||
            displayRoleLower.replace(/\s+/g, ' ').replace(/[\s_]/g, '').includes(searchTermNoSeparator)) return true;
        
        // Search in source (simplified - no expensive formatting)
        const source = log.isMobileUser ? 'mobile' : (log.source || 'web').toLowerCase();
        if (source.includes(searchTermLower)) return true;
        
        // Search in timestamp (simplified - just check the raw timestamp string)
        if (log.timestamp) {
          const timestampStr = String(log.timestamp).toLowerCase();
          if (timestampStr.includes(searchTermLower)) return true;
        }
        
        return false;
      });
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(log => log.category === selectedCategory);
    }

    // Apply custom filter
    if (selectedFilterType !== 'All' && filterValue.trim()) {
      switch (selectedFilterType) {
        case 'Category':
          filtered = filtered.filter(log => log.category?.toLowerCase().includes(filterValue.toLowerCase()));
          break;
        case 'Username':
          filtered = filtered.filter(log => log.username?.toLowerCase().includes(filterValue.toLowerCase()));
          break;
        case 'Message':
          filtered = filtered.filter(log => log.message?.toLowerCase().includes(filterValue.toLowerCase()));
          break;
        default:
          break;
      }
    }

    setFilteredLogs(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [debouncedSearchTerm, selectedCategory, logs, selectedFilterType, filterValue, currentUser?.farm, assignedFarmName, dateRange, customStartDate, customEndDate, selectedRole, selectedSource]);

  // Pagination logic
  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  // Handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    // Scroll to top of logs container
    const logsContainer = document.querySelector('.logs-container');
    if (logsContainer) {
      logsContainer.scrollTop = 0;
    }
  };

  // Handle logs per page change
  const handleLogsPerPageChange = (newLogsPerPage) => {
    setLogsPerPage(newLogsPerPage);
    setCurrentPage(1); // Reset to first page
  };

  // Row-level deletion helpers
  const canDeleteLog = (log) => {
    if (!log || !log.id) return false;
    const role = String(currentUser?.role || '').toLowerCase();
    const isTechOfficer = role === 'tech_officer' || role === 'tech officer';
    const isNewMainTechOfficer = role === 'new_main_tech_officer' || role === 'new main tech officer';
    const isAdmin = role === 'admin';
    const isFarmAdmin = isAdmin && !!currentUser?.farm;
    // Farm Admins cannot delete logs
    return Boolean((isTechOfficer || isNewMainTechOfficer || (isAdmin && !isFarmAdmin)) && log?.id);
  };

  const handleDeleteClick = (log) => {
    if (!canDeleteLog(log)) {
      setErrorMessage('Only Tech Officers and Admins (not Farm Admins) can delete logs.');
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }
    setLogToDelete(log);
    setShowDeleteConfirmModal(true);
    setRowActionsOpenId(null); // Close the actions menu
  };

  const confirmDeleteLog = async () => {
    if (!logToDelete) return;
    
    try {
      setDeletingLogId(logToDelete.id);
      setShowDeleteConfirmModal(false);
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'systemLogs', logToDelete.id));
      setLogs(prev => prev.filter(l => l.id !== logToDelete.id));
      setFilteredLogs(prev => prev.filter(l => l.id !== logToDelete.id));
      setLogToDelete(null);
    } catch (e) {
      setErrorMessage('Failed to delete log.');
      setTimeout(() => setErrorMessage(''), 4000);
    } finally {
      setDeletingLogId(null);
    }
  };

  const cancelDeleteLog = () => {
    setShowDeleteConfirmModal(false);
    setLogToDelete(null);
  };

  const categories = [
    { id: 'all', label: t('logs.categories.all_logs') },
    { id: 'login', label: t('logs.categories.login') },
    { id: 'logout', label: t('logs.categories.logout') },
    { id: 'profile', label: t('logs.categories.profile') },
    { id: 'feedback', label: t('logs.categories.feedback') },
    { id: 'error', label: t('logs.categories.error') },
    { id: 'account', label: t('logs.categories.account') },
    { id: 'reward', label: t('logs.categories.reward') },
    { id: 'export', label: t('logs.categories.export') },
    { id: 'report', label: t('logs.categories.report') }
  ];

  const formatDate = (dateString) => {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Sidebar export handler for this page
  const handleSidebarExport = (format) => {
    if (format === 'pdf') exportLogs(filteredLogs, 'pdf', currentUser);
    if (format === 'csv') exportLogs(filteredLogs, 'csv', currentUser);
    setShowDownloadOptions(false);
  };

  const getSourceType = (log) => {
    if (log.isMobileUser) {
      return 'Mobile';
    }
    if (log.source) {
      return log.source;
    }
    return 'Web';
  };

  // Extract action from log message and category
  const getActionDisplay = (log) => {
    if (!log) return 'Unknown';
    
    const message = String(log.message || '').toLowerCase();
    const category = String(log.category || '').toLowerCase();
    
    // Extract action from message patterns
    if (message.includes('logged out') || message.includes('logout')) {
      return 'Logout';
    }
    if (message.includes('logged in') || message.includes('login')) {
      return 'Login';
    }
    if (message.includes('account updated') || message.includes('updated')) {
      return 'Account Updated';
    }
    if (message.includes('password changed') || message.includes('password change')) {
      return 'Password Changed';
    }
    if (message.includes('profile') && (message.includes('updated') || message.includes('change'))) {
      return 'Profile Updated';
    }
    if (message.includes('selected') || message.includes('deselected')) {
      return 'Account';
    }
    if (message.includes('export')) {
      return 'Export';
    }
    if (message.includes('feedback')) {
      return 'Feedback';
    }
    if (message.includes('report')) {
      return 'Reports';
    }
    if (message.includes('error')) {
      return 'Error';
    }
    
    // If message doesn't give us the action, check category
    // For categories that are role names, we need to use the message
    if (category.includes('temporarytech') || category.includes('temp_tech')) {
      // For temp tech officer, extract action from message
      if (message.includes('logged out')) return 'Logout';
      if (message.includes('logged in')) return 'Login';
      if (message.includes('created')) return 'Account';
      if (message.includes('updated')) return 'Account Updated';
      // Default fallback for temp tech
      return 'Account';
    }
    
    // Standard category mapping
    const categoryMap = {
      'login': 'Login',
      'logout': 'Logout',
      'account': 'Account',
      'profile': 'Profile',
      'feedback': 'Feedback',
      'error': 'Error',
      'export': 'Export',
      'report': 'Reports',
      'reports': 'Reports',
      'reward': 'Reward',
      'phone_verification': 'Phone Verification'
    };
    
    // Check category map
    if (categoryMap[category]) {
      return categoryMap[category];
    }
    
    // Convert camelCase to readable format as fallback
    const withSpaces = category.replace(/([A-Z])/g, ' $1').trim();
    return withSpaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Role-based access for row actions
  const roleRaw = currentUser?.role || '';
  const roleLower = String(roleRaw).toLowerCase().trim();
  const roleNormalized = roleLower.replace(/_/g, ' ').replace(/\s+/g, ' ');
  
  const isTemporaryTechOfficer = !!(currentUser?.temporaryTechOfficer || roleNormalized === 'temp tech officer' || roleLower === 'temp_tech_officer');
  const isNewMainTechOfficer = roleNormalized === 'new main tech officer' || roleLower === 'new_main_tech_officer';
  const isAdmin = roleNormalized === 'admin' || roleLower === 'admin';
  const isFarmAdmin = isAdmin && !!currentUser?.farm;
  
  // Check for tech officer - handle various formats
  const isTechOfficer = roleNormalized === 'tech officer' || 
                        roleLower === 'tech_officer' || 
                        roleLower === 'tech officer' ||
                        roleRaw === 'Tech Officer';
  
  // Visible and enabled for tech officer, new main tech officer, and admins
  // NOT visible for temporary tech officer
  // Farm Admins cannot see or use delete button
  const shouldShowRowActions = (isAdmin && !isFarmAdmin) || isNewMainTechOfficer || isTechOfficer;
  const canUseRowActions = isTechOfficer || isNewMainTechOfficer || (isAdmin && !isFarmAdmin);

  return (
    <div className="logs">
      <header className={`logs-header-bar ${sidebarOpen && window.innerWidth <= 1023 ? 'blurred' : ''}`}>
        <div className="header-logo-container">
        <FaBars className="header-hamburger-icon" onClick={handleSidebarToggle} />
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRISK</div>
        </div>

        <div className="header-right">
          <NotificationBox externalCloseSignal={notificationCloseSignal} />
          <div className="user-menu">
              <button onClick={(e) => {
                e.stopPropagation(); // Prevent closing dropdowns when clicking user menu
                closeAllDropdowns(); // Close all other dropdowns first
                setNotificationCloseSignal(prev => prev + 1); // Close notification when user menu opens
                setShowMenu(!showMenu);
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
        sidebarCollapsed={sidebarCollapsed}
        currentUser={currentUser}
        showDownloadOptions={showDownloadOptions}
        setShowDownloadOptions={setShowDownloadOptions}
        handleExport={handleSidebarExport}
        onDashboardClick={() => navigate('/Homepage')}
        onAccountManagementClick={() => {
          const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
          
          if (isTemporaryTechOfficer) {
            setErrorMessage('⚠️ Restricted Access: Your current role as a Temporary Tech Officer does not allow access to Account Management. Please contact your Admin for assistance.');
            setTimeout(() => setErrorMessage(''), 5000);
            return;
          }
          
          navigate('/AccountManagement');
        }}
        onLogsClick={() => navigate('/logs')}
        onFeedbackClick={() => navigate('/Feedback')}
        nightMode={nightMode}
        setNightMode={setNightMode}
        language={language}
        setLanguage={setLanguage}
      />

      {/* Main content wrapper to offset sidebar width */}
      <div className={`main-content-wrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

      {/* Search and Filter Bar */}
      <div className={`search-filter-bar`} onClick={() => {
        closeAllDropdowns();
        closeSidebar();
      }}>
        <div className="search-container">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder={t('common.search')}
            className="search-input"
            value={searchTerm}
            onChange={(e) => {
              e.stopPropagation();
              setSearchTerm(e.target.value);
            }}
          />
        </div>
        
        <button
          className="logs-refresh-button"
          onClick={(e) => {
            e.stopPropagation();
            handleRefresh();
          }}
          title={t('logs.refresh') || 'Refresh logs'}
          disabled={isRefreshing || isLoading}
        >
          <FaSync className={`refresh-icon ${isRefreshing ? 'spinning' : ''}`} />
        </button>
        
        <div className="filter-container" style={{ position: 'relative' }}>
          <button 
            className="logs-filter-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowFilterDropdown(!showFilterDropdown);
            }}
            title={t('logs.filter_button')}
          >
            <FaFilter className="filter-icon" />
          </button>
          
          {showFilterDropdown && (
            <div className="filter-dropdown enhanced-filter-dropdown" onClick={(e) => e.stopPropagation()}>
              {/* Date Range Filter */}
              <div className="logs-filter-section">
                <label>Date Range</label>
                <select 
                  value={dateRange} 
                  onChange={(e) => {
                    e.stopPropagation();
                    setDateRange(e.target.value);
                    if (e.target.value !== 'Custom') {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }
                  }}
                  className="filter-select"
                >
                  <option value="All">All</option>
                  <option value="Today">Today</option>
                  <option value="Yesterday">Yesterday</option>
                  <option value="Last7Days">Last 7 days</option>
                  <option value="Last30Days">Last 30 days</option>
                  <option value="Custom">Custom range</option>
                </select>
              </div>

              {dateRange === 'Custom' && (
                <div className="logs-value-section">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => {
                      e.stopPropagation();
                      setCustomStartDate(e.target.value);
                    }}
                    className="filter-input date-input"
                  />
                  <label style={{ marginTop: '0.5rem' }}>End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => {
                      e.stopPropagation();
                      setCustomEndDate(e.target.value);
                    }}
                    className="filter-input date-input"
                    min={customStartDate}
                  />
                </div>
              )}

              {/* Role Filter */}
              <div className="logs-filter-section">
                <label>Role</label>
                <select 
                  value={selectedRole} 
                  onChange={(e) => {
                    e.stopPropagation();
                    setSelectedRole(e.target.value);
                  }}
                  className="filter-select"
                >
                  <option value="All">All Roles</option>
                  <option value="Tech Officer">Tech Officer</option>
                  <option value="Farm Admin">Farm Admin</option>
                  <option value="Fish Farmer">Fish Farmer</option>
                  <option value="Temporary Tech Officer">Temporary Tech Officer</option>
                </select>
              </div>

              {/* Source Filter */}
              <div className="logs-filter-section">
                <label>Source</label>
                <select 
                  value={selectedSource} 
                  onChange={(e) => {
                    e.stopPropagation();
                    setSelectedSource(e.target.value);
                  }}
                  className="filter-select"
                >
                  <option value="All">All</option>
                  <option value="Web">Web</option>
                  <option value="Mobile">Mobile</option>
                </select>
              </div>
              
              <div className="logs-filter-actions">
                <button 
                  className="logs-apply-filter-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFilterDropdown(false);
                  }}
                >
                  Apply Filters
                </button>
                <button 
                  className="logs-clear-filter-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDateRange('All');
                    setCustomStartDate('');
                    setCustomEndDate('');
                    setSelectedRole('All');
                    setSelectedSource('All');
                    setSelectedFilterType('All');
                    setFilterValue('');
                    setShowFilterDropdown(false);
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className={`crm-pagination`}>
        <div className="pagination-info">
          <span>{t('logs.pagination.showing_logs', { 
            start: indexOfFirstLog + 1, 
            end: Math.min(indexOfLastLog, filteredLogs.length), 
            total: filteredLogs.length 
          })}</span>
        </div>
        
        <div className="pagination-controls">
          <select 
            value={logsPerPage} 
            onChange={(e) => handleLogsPerPageChange(Number(e.target.value))}
            className="pagination-select"
          >
            <option value={20}>20</option>
            <option value={25}>25</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
          
          <div className="pagination-pages">
            <button 
              onClick={() => handlePageChange(1)} 
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              {t('logs.pagination.first_button')}
            </button>
            <button 
              onClick={() => handlePageChange(currentPage - 1)} 
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              {t('logs.pagination.previous_button')}
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`pagination-page ${currentPage === pageNum ? 'active' : ''}`}
                >
                  {pageNum}
                </button>
              );
            })}
            
            <button 
              onClick={() => handlePageChange(currentPage + 1)} 
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              {t('logs.pagination.next_button')}
            </button>
            <button 
              onClick={() => handlePageChange(totalPages)} 
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              {t('logs.pagination.last_button')}
            </button>
          </div>
        </div>
      </div>

      {/* CRM Table Container */}
      <div className={`crm-table-container`}>
        <div className="crm-table">
          <div className="crm-table-header">
            <div className="crm-header-cell timestamp-cell">
              {t('logs.table_headers.timestamp')}
            </div>
            <div className="crm-header-cell user-cell">
              USER
            </div>
            <div className="crm-header-cell role-cell">
              ROLE
            </div>
            <div className="crm-header-cell action-cell">
              ACTION
            </div>
            <div className="crm-header-cell details-cell">
              DETAILS
            </div>
            <div className="crm-header-cell source-cell">
              {t('logs.table_headers.source')}
            </div>
          </div>
          <div className="crm-table-body">
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', gridColumn: '1 / -1' }}>
                <div className="loading-logs">{t('logs.loading_message')}</div>
              </div>
            ) : currentLogs.length > 0 ? (
              currentLogs.map((log, index) => (
                <div key={index} className="crm-table-row" onClick={(e) => e.stopPropagation()}>
                  <div className="crm-cell timestamp-cell">
                    {log.timestamp ? (
                      <>
                        {new Date(log.timestamp).toLocaleDateString('en-US', { 
                          month: '2-digit',
                          day: '2-digit',
                          year: 'numeric'
                        })}, {new Date(log.timestamp).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: true
                        })}
                      </>
                    ) : (
                      <span style={{ color: '#dc3545', fontStyle: 'italic' }}>{t('logs.invalid_timestamp')}</span>
                    )}
                  </div>
                  <div className="crm-cell user-cell">
                    {log.username || 'Unknown User'}
                  </div>
                  <div className="crm-cell role-cell">
                    {log.role && log.role !== 'Unknown' ? (
                      (() => {
                        const roleLower = String(log.role).toLowerCase().trim();
                        if (roleLower === 'temp_tech_officer' || roleLower === 'temporary tech officer' || roleLower === 'temporarytechofficer') {
                          return 'Temporary Tech Officer';
                        } else if (roleLower === 'tech_officer' || roleLower === 'tech officer' || roleLower === 'new_main_tech_officer' || roleLower === 'new main tech officer') {
                          return 'Tech Officer';
                        } else if (roleLower === 'fish_farmer' || roleLower === 'fish farmer') {
                          return 'Fish Farmer';
                        } else if (roleLower === 'super_admin' || roleLower === 'super admin') {
                          return 'Super Admin';
                        } else if (roleLower === 'admin') {
                          // Check if it's Farm Admin
                          if (log.userFarm || log.farm) {
                            return 'Farm Admin';
                          }
                          return 'Admin';
                        } else {
                          // Return formatted role (capitalize first letter of each word)
                          return String(log.role)
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ');
                        }
                      })()
                    ) : '-'}
                  </div>
                  <div className="crm-cell action-cell">
                    <span className={`log-type ${log.category}`}>{getActionDisplay(log)}</span>
                  </div>
                  <div className="crm-cell details-cell">
                    {decodeHtml(log.message)}
                  </div>
                  <div className="crm-cell source-cell">
                    <span className={`source-badge ${getSourceType(log)}`}>
                      {getSourceType(log)}
                    </span>
                    {shouldShowRowActions ? (
                      <button
                        className="row-actions-button logs-row-actions-button"
                        title={canUseRowActions ? 'Actions' : 'Actions (disabled)'}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (canUseRowActions) {
                            setRowActionsOpenId(prev => prev === log.id ? null : log.id);
                          }
                        }}
                        disabled={!canUseRowActions}
                        style={{ 
                          marginLeft: '3px', 
                          display: 'inline-flex', 
                          visibility: 'visible',
                          opacity: 1,
                          minWidth: '22px',
                          minHeight: '22px',
                          width: '22px',
                          height: '22px',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'transparent',
                          border: 'none',
                          cursor: canUseRowActions ? 'pointer' : 'not-allowed',
                          color: canUseRowActions ? '#6b7280' : '#9ca3af',
                          padding: '3px',
                          borderRadius: '4px',
                          flexShrink: 0
                        }}
                      >
                        <FaEllipsisV style={{ fontSize: '12px' }} />
                      </button>
                    ) : null}
                    {canUseRowActions && rowActionsOpenId === log.id ? (
                      <div className="row-actions-menu">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(log); }}
                          disabled={deletingLogId === log.id}
                        >
                          {deletingLogId === log.id ? 'Deleting…' : 'Delete this log'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', gridColumn: '1 / -1' }}>
                <div className="no-logs">{t('logs.no_logs_found')}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="delete-confirm-modal-overlay logs-delete-modal-overlay" onClick={cancelDeleteLog}>
          <div className="delete-confirm-modal logs-delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header logs-delete-header">
              <h3>Confirm Deletion</h3>
              <button 
                className="close-modal-btn" 
                onClick={cancelDeleteLog}
              >
                &times;
              </button>
            </div>
            <div className="delete-confirm-body logs-delete-body">
              <p>Are you sure you want to delete this log permanently? This action cannot be undone.</p>
            </div>
            <div className="delete-confirm-actions logs-delete-actions">
              <button 
                className="cancel-btn logs-delete-cancel-btn" 
                onClick={cancelDeleteLog}
              >
                Cancel
              </button>
              <button 
                className="confirm-delete-btn logs-delete-confirm-btn" 
                onClick={confirmDeleteLog}
                disabled={deletingLogId === logToDelete?.id}
              >
                {deletingLogId === logToDelete?.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default Logs;
 
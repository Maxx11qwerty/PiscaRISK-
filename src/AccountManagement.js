import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next'; // Add this import
import './AccountManagement.css';
import logo from './assets/images/PISCARISK_LOGO.png';
import { FaUserCircle,FaUser, FaSignOutAlt, FaUserPlus, FaSearch, FaBars, FaFilter, FaUserCheck, FaCheckCircle } from 'react-icons/fa';
import { IoMdArrowDropdown } from "react-icons/io";
import { MdOutlineLockReset } from "react-icons/md";
import { RiDeleteBin6Line } from "react-icons/ri";
// removed export button icon
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import NotificationBox from './components/NotificationBox';
import UserPopup from './components/UserPopup';
import { fetchAllUsers, fetchLiveUserStatus as serviceFetchLiveUserStatus, activateTechOfficer as serviceActivateTechOfficer, activateFishFarmer as serviceActivateFishFarmer, deleteUserById as serviceDeleteUserById, checkUserLoginStatus as serviceCheckUserLoginStatus, forceLogoutUser as serviceForceLogoutUser, updateUserStatus as serviceUpdateUserStatus } from './services/accountService';
import { exportAccountToPDF, prepareAccountCSVData, handleAccountCSVExport } from './utils/exportAccounts';
import Sidebar from './components/Sidebar';
import { collection, getDocs, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { logActivity, logMessages } from './utils/logger';
import { formatUserInputPH, stripToDigits, validatePhilippineMobile, normalizeToE164PH } from './utils/phonePh';

const AccountManagement = () => {
  const { t } = useTranslation(); // Add translation hook
  const { currentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  
  // Check if user is a Temporary Tech Officer and block access
  useEffect(() => {
    const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
    
    if (isTemporaryTechOfficer) {
      navigate('/Homepage', { 
        state: { 
          errorMessage: '⚠️ Restricted Access: Your current role as a Temporary Tech Officer does not allow access to Account Management. Please contact your Admin for assistance.' 
        } 
      });
      return;
    }
  }, [currentUser, navigate]);
  
  const [isMobile, setIsMobile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [notificationCloseSignal, setNotificationCloseSignal] = useState(0);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [AccountUsers, setAccountUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { createStaffAccount, isAdmin, isTechOfficer, handleLogout, activateAdminAccount, resetAdminPassword } = useContext(AuthContext);
  const [csvFilename, setCsvFilename] = useState('piscarisk_useraccounts.csv');
  const [errors, setErrors] = useState({ email: '' });

  // Sidebar UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [language, setLanguage] = useState('en');
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);

  // Table filter states
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [selectedRole, setSelectedRole] = useState('All Roles');
  const [selectedStatus, setSelectedStatus] = useState('All Status');

  // Filter button states
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedFilterType, setSelectedFilterType] = useState('All');
  const [filterValue, setFilterValue] = useState('');

  // Export dropdown removed

  // Admin password confirmation state
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');
  const [pendingUserData, setPendingUserData] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Delete confirmation modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState(null);

  // Name sorting dropdown states
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [selectedNameSort, setSelectedNameSort] = useState('None');

  // Password reset states
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState(null);
  const [resetNotices, setResetNotices] = useState({}); // { [userId]: { text, type } }
  
  // Timer states for Temporary Tech Officers
  const [ttoTimers, setTtoTimers] = useState({}); // { [userId]: { remaining, status } }
  
  // Track if there's an active Temporary Tech Officer
  const [hasActiveTTO, setHasActiveTTO] = useState(false);
  
  // Track TTO creation mode
  const [ttoCreationMode, setTtoCreationMode] = useState(''); // 'reuse' or 'create'
  
  // Farms for assignment when creator has no assigned farm
  const [farms, setFarms] = useState([]); // { id, name }
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [assignedFarmName, setAssignedFarmName] = useState('');
  // Temporary Tech Officer: reason/remarks handled below

  // Derived UI flags (none needed here; use !currentUser?.farm inline where required)
  const farmIdToName = useMemo(() => {
    const map = {};
    for (const f of farms) {
      if (f && f.id) map[f.id] = f.name || f.id;
    }
    return map;
  }, [farms]);
  // Track if a Tech Officer already exists (global singleton)
  const hasTechOfficer = useMemo(() => {
    return AccountUsers.some(u => {
      const r = String(u?.role || '').toLowerCase();
      return r === 'tech_officer' || r === 'tech officer';
    });
  }, [AccountUsers]);

  // Auto-close the Add User form shortly after a successful creation
  useEffect(() => {
    if (showAddUserForm && message && message.type === 'success' && message.text) {
      const timer = setTimeout(() => {
        setShowAddUserForm(false);
        setMessage({ text: '', type: '' });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [message, showAddUserForm]);

  // Timer logic for Temporary Tech Officers
  useEffect(() => {
    const updateTimers = () => {
      const now = new Date();
      const newTimers = {};
      
      AccountUsers.forEach(user => {
        if ((String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) && 
            user.effectiveFrom && user.effectiveTo && 
            String(user.status || '').toLowerCase() === 'active') {
          const effectiveFrom = new Date(user.effectiveFrom);
          const effectiveTo = new Date(user.effectiveTo);
          
          // Calculate remaining time from effectiveFrom to effectiveTo
          const totalDuration = effectiveTo.getTime() - effectiveFrom.getTime();
          const elapsed = now.getTime() - effectiveFrom.getTime();
          const remaining = effectiveTo.getTime() - now.getTime();
          
          let status = 'active';
          if (remaining <= 0) {
            status = 'expired';
          } else if (remaining <= 24 * 60 * 60 * 1000) { // Less than 24 hours
            status = 'expiring';
          }
          
          newTimers[user.id] = {
            remaining: Math.max(0, remaining),
            status: status,
            totalDuration: totalDuration,
            elapsed: Math.max(0, elapsed)
          };
        }
      });
      
      setTtoTimers(newTimers);
      
      // Check if there's any active Temporary Tech Officer
      const activeTTO = AccountUsers.find(user => 
        (String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) && 
        String(user.status || '').toLowerCase() === 'active'
      );
      setHasActiveTTO(!!activeTTO);
    };

    // Update timers immediately
    updateTimers();
    
    // Update every minute
    const interval = setInterval(updateTimers, 60000);
    
    return () => clearInterval(interval);
  }, [AccountUsers]);

  // Auto-deactivate expired Temporary Tech Officers and sync main TO status
  useEffect(() => {
    const autoDeactivateExpired = async () => {
      const expiredUsers = [];
      
      Object.entries(ttoTimers).forEach(([userId, timer]) => {
        if (timer.status === 'expired') {
          const user = AccountUsers.find(u => u.id === userId);
          if (user && (String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) && user.status?.toLowerCase() === 'active') {
            expiredUsers.push(user);
          }
        }
      });

      if (expiredUsers.length > 0) {
        for (const user of expiredUsers) {
          try {
            const { updateDoc, doc } = await import('firebase/firestore');
            const { db } = await import('./firebase');
            const now = new Date();
            
            await updateDoc(doc(db, 'users', user.id), { 
              status: 'Inactive',
              lastModified: now.toISOString(),
              deactivatedBy: 'System (Auto)',
              deactivatedAt: now.toISOString(),
              deactivationReason: 'Temporary assignment expired',
              tempTORemarks: user.tempTORemarks || null,
              temporaryTechOfficer: false,
              adminActivated: false,
              emailVerified: false
            });
            
            // Log the auto-deactivation
            try {
              const adminUser = currentUser?.username || currentUser?.email || currentUser?.uid || 'System';
              logActivity('account', `Temporary Tech Officer ${user.username} automatically deactivated due to expiration`, adminUser);
            } catch (_) {}
            
            // Update local state
            setAccountUsers(prev => prev.map(u => 
              u.id === user.id ? { 
                ...u, 
                status: 'inactive',
                deactivatedBy: 'System (Auto)',
                deactivatedAt: now.toISOString(),
                deactivationReason: 'Temporary assignment expired',
                tempTORemarks: user.tempTORemarks || null,
                temporaryTechOfficer: false,
                adminActivated: false,
                emailVerified: false
              } : u
            ));

            // Reactivate main Tech Officer when Temporary Tech Officer is auto-deactivated
            try {
              const mainTO = AccountUsers.find(x => {
                const r = String(x?.role || '').toLowerCase();
                return (r === 'tech_officer' || r === 'tech officer') && !x.temporaryTechOfficer && x.temporarilyInactiveDueToTempTO;
              });
              
              if (mainTO && mainTO.id) {
                const { updateDoc, doc } = await import('firebase/firestore');
                const { db } = await import('./firebase');
                await updateDoc(doc(db, mainTO._collection || 'users', mainTO.id), {
                  status: 'Active',
                  temporarilyInactiveDueToTempTO: false,
                  temporaryReplacementReason: null,
                  temporaryEffectiveFrom: null,
                  temporaryEffectiveTo: null
                });
                
                // Update local state for main Tech Officer
                setAccountUsers(prev => prev.map(u => u.id === mainTO.id ? {
                  ...u,
                  status: 'active',
                  temporarilyInactiveDueToTempTO: false,
                  temporaryReplacementReason: null,
                  temporaryEffectiveFrom: null,
                  temporaryEffectiveTo: null
                } : u));
              }
            } catch (e) {
              console.error("Failed to reactivate main Tech Officer:", e);
            }
          } catch (error) {
            console.error(`Failed to auto-deactivate ${user.username}:`, error);
          }
        }
      }
    };

    // Also sync main TO status when there's an active TTO
    const syncMainTOStatus = async () => {
      const activeTTO = AccountUsers.find(u => 
        (String(u.role || '').toLowerCase() === 'temp_tech_officer' || u.temporaryTechOfficer === true) && 
        String(u.status || '').toLowerCase() === 'active'
      );
      
      if (activeTTO) {
        const mainTO = AccountUsers.find(x => {
          const r = String(x?.role || '').toLowerCase();
          return (r === 'tech_officer' || r === 'tech officer') && !x.temporaryTechOfficer;
        });
        
        if (mainTO && !mainTO.temporarilyInactiveDueToTempTO) {
          try {
            const { updateDoc, doc } = await import('firebase/firestore');
            const { db } = await import('./firebase');
            await updateDoc(doc(db, mainTO._collection || 'users', mainTO.id), {
              status: 'Inactive',
              temporarilyInactiveDueToTempTO: true,
              temporaryReplacementReason: activeTTO.tempTOReason || 'Temporary assignment',
              temporaryEffectiveFrom: activeTTO.effectiveFrom || null,
              temporaryEffectiveTo: activeTTO.effectiveTo || null
            });
            
            // Update local state
            setAccountUsers(prev => prev.map(u => u.id === mainTO.id ? {
              ...u,
              status: 'inactive',
              temporarilyInactiveDueToTempTO: true,
              temporaryReplacementReason: activeTTO.tempTOReason || 'Temporary assignment',
              temporaryEffectiveFrom: activeTTO.effectiveFrom || null,
              temporaryEffectiveTo: activeTTO.effectiveTo || null
            } : u));
          } catch (e) {
            console.error("Failed to sync main Tech Officer status:", e);
          }
        }
      }
    };

    autoDeactivateExpired();
    syncMainTOStatus();
  }, [ttoTimers, AccountUsers, currentUser]);

  // Removed auto-dismiss success toast for admin password resets

  useEffect(() => {
  }, [currentUser]);
  
  // Load farms list and resolve assigned farm name (if any)
  useEffect(() => {
    const loadFarms = async () => {
      try {
        const snap = await getDocs(collection(db, 'farms'));
        const list = snap.docs
          .map(d => ({ id: d.id, ...(d.data() || {}) }))
          .filter(farm => 
            farm.id !== 'WgS4mBVnPFPMGq7vfSYa' && // Exclude Rojo Hatchery
            farm.name !== 'Rojo Hatchery' &&
            farm.name !== 'Freshwater Finfish Farm' &&
            !farm.name?.toLowerCase().includes('freshwater finfish')
          );
        const sorted = list.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        setFarms(sorted);
      } catch (e) {

      }
    };

    const resolveAssignedFarmName = async () => {
      try {
        if (currentUser?.farm) {
          // Skip if user is assigned to Rojo Hatchery or Freshwater Finfish Farm
          if (currentUser.farm === 'WgS4mBVnPFPMGq7vfSYa' ||
              currentUser.farm === 'Rojo Hatchery' ||
              currentUser.farm === 'Freshwater Finfish Farm' ||
              currentUser.farm?.toLowerCase().includes('freshwater finfish')) {
            setAssignedFarmName('');
            return;
          }
          
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (farmDoc.exists()) {
            const farmData = farmDoc.data();
            const farmName = farmData.name || currentUser.farm;
            
            // Additional check for farm name
            if (farmName === 'Rojo Hatchery' ||
                farmName === 'Freshwater Finfish Farm' ||
                farmName?.toLowerCase().includes('freshwater finfish')) {
              setAssignedFarmName('');
              return;
            }
            
            setAssignedFarmName(farmName);
          } else {
            setAssignedFarmName(currentUser.farm);
          }
        } else {
          setAssignedFarmName('');
        }
      } catch (e) {
        setAssignedFarmName('');
      }
    };

    loadFarms();
    resolveAssignedFarmName();
  }, [currentUser?.farm]);

  // Removed creation mode/farm-admin selection logic

  
  const useScreenSize = () => {
    const [screenWidth, setScreenWidth] = useState(window.innerWidth);
    
    useEffect(() => {
      const handleResize = () => setScreenWidth(window.innerWidth);
      
      let timeoutId;
      const debouncedResize = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(handleResize, 100);
      };
      
      window.addEventListener('resize', debouncedResize);
      return () => {
        window.removeEventListener('resize', debouncedResize);
        clearTimeout(timeoutId);
      };
    }, []);
    
    return {
      width: screenWidth,
      isMobile: screenWidth < 480,
      isTablet: screenWidth < 900,
      isDesktop: screenWidth >= 1200
    };
  };

  // Use the hook
  const screen = useScreenSize();

  // Permissions
  const roleNormalized = String(currentUser?.role || '').toLowerCase().replace(/\s+/g, '_');
  const isAdminUser = roleNormalized === 'admin';
  const isTechOfficerRole = roleNormalized === 'tech_officer' || String(currentUser?.role || '').toLowerCase() === 'tech officer';
  const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || roleNormalized === 'temp_tech_officer';
  const canManageUsers = isAdminUser || isTechOfficerRole || isTemporaryTechOfficer;
  const isSuperAdminUser = !currentUser?.farm; // Super Admin: no farm assigned

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Close sidebar when window is resized to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1023) {
        setSidebarOpen(false);
        // Don't reset collapsed state on desktop
      } else {
        // On mobile, ensure sidebar is closed when resizing
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  // Cleanup effect to close all dropdowns when component unmounts or dependencies change
  useEffect(() => {
    return () => {
      closeAllDropdowns();
    };
  }, []);

  // Function to close all dropdowns and modals
  const closeAllDropdowns = () => {
    setShowRoleDropdown(false);
    setShowStatusDropdown(false);
    setShowNameDropdown(false);
    setShowFilterDropdown(false);
    // Note: add user form and admin password modal are NOT closed here to prevent interference

    setShowMenu(false);
  };

  // Function to close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close anything if clicking inside admin password modal or add user form
      if (event.target.closest('.admin-password-modal') || event.target.closest('.add-user-form-container')) {
        return;
      }
      
      if (!event.target.closest('.role-cell') && !event.target.closest('.status-cell') && !event.target.closest('.name-cell')) {
        setShowRoleDropdown(false);
        setShowStatusDropdown(false);
        setShowNameDropdown(false);
      }
      // export dropdown removed
      // Temporarily disabled to debug filter dropdown
      // if (!event.target.closest('.add-user-button-container')) {
      //   setShowFilterDropdown(false);
      // }
    };

    // Function to handle Escape key press
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        // Close forms first if they're open
        if (showAdminPasswordModal) {
          closeAdminPasswordModal();
        } else if (showAddUserForm) {
          handleCancelAddUser();
        } else {
          closeAllDropdowns();
        }
      }
    };

    // Function to handle window focus/blur
    const handleWindowFocus = () => {
      // Close all dropdowns when window regains focus, but not forms
      if (!showAdminPasswordModal && !showAddUserForm) {
        closeAllDropdowns();
      }
    };

    // Function to handle scroll
    const handleScroll = () => {
      // Close all dropdowns when user scrolls, but not forms
      if (!showAdminPasswordModal && !showAddUserForm) {
        closeAllDropdowns();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [showAdminPasswordModal, showAddUserForm]);

  useEffect(() => {
    fetchUsers();
    // Real-time: refresh list when users/mobileUsers change
    const unsubUsers = onSnapshot(collection(db, 'users'), () => fetchUsers());
    const unsubMobileUsers = onSnapshot(collection(db, 'mobileUsers'), () => fetchUsers());
    return () => {
      unsubUsers && unsubUsers();
      unsubMobileUsers && unsubMobileUsers();
    };
  }, []);

  const fetchUsers = async () => {
    try {
      const users = await fetchAllUsers();
      if (users.length > 0) {        
      }
      setAccountUsers(users);
    } catch (error) {
      setMessage({ text: 'Error fetching users', type: 'error' });
    }
  };

  // Normalize role values from DB to display values
  const formatRoleForDisplay = (role) => {
    if (!role) return '';
    const lower = String(role).toLowerCase();
    if (lower === 'tech_officer' || lower === 'tech officer') return 'Tech Officer';
    if (lower === 'temp_tech_officer' || lower === 'temp tech officer') return 'Temporary Tech Officer';
    if (lower === 'admin') return 'Admin';
    if (lower === 'fish_farmer' || lower === 'fish farmer') return 'Fish Farmer';
    return role;
  };

  const isInactive = (status) => {
    const result = String(status || '').toLowerCase() === 'inactive';
    return result;
  };
  const getStatusDisplay = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return 'Active';
    if (s === 'inactive') return 'Inactive';
    return status || 'Unknown';
  };

  // Helper function to format remaining time
  const formatRemainingTime = (remainingMs) => {
    if (remainingMs <= 0) return 'Expired';
    
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Helper function to format full expiration details
  const formatFullExpirationDetails = (user, timer) => {
    if (!user.effectiveFrom || !user.effectiveTo) return 'No effective period set';
    
    const effectiveFrom = new Date(user.effectiveFrom);
    const effectiveTo = new Date(user.effectiveTo);
    const now = new Date();
    const isExpired = timer.status === 'expired';
    
    const fromDate = effectiveFrom.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const toDate = effectiveTo.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const toTime = effectiveTo.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    if (isExpired) {
      return `Period: ${fromDate} - ${toDate} (Expired)`;
    } else {
      const remaining = formatRemainingTime(timer.remaining);
      return `Period: ${fromDate} - ${toDate} (${remaining} left)`;
    }
  };

  // Helper function to get timer status color
  const getTimerStatusColor = (status) => {
    switch (status) {
      case 'expired': return '#ef4444'; // Red
      case 'expiring': return '#f59e0b'; // Yellow/Orange
      case 'active': return '#10b981'; // Green
      default: return '#6b7280'; // Gray
    }
  };

  // Manual deactivate function for Temporary Tech Officers
  const handleManualDeactivateTTO = async (user) => {
    if (!canManageUsers) {
      setMessage({ text: 'Only Admins, Tech Officers, and Temporary Tech Officers can manually deactivate Temporary Tech Officers', type: 'error' });
      return;
    }

    try {
      setMessage({ text: `Deactivating ${user.username}...`, type: 'info' });
      
      const { updateDoc, doc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      const now = new Date();
      const adminUser = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      
      await updateDoc(doc(db, 'users', user.id), { 
        status: 'Inactive',
        lastModified: now.toISOString(),
        deactivatedBy: adminUser,
        deactivatedAt: now.toISOString(),
        deactivationReason: 'Manually deactivated by Admin/Tech Officer',
        tempTORemarks: user.tempTORemarks || null,
        temporaryTechOfficer: false,
        adminActivated: false,
        emailVerified: false
      });
      
      // Log the manual deactivation
      try {
        logActivity('account', `Temporary Tech Officer ${user.username} manually deactivated by Admin/Tech Officer`, adminUser);
      } catch (_) {}
      
      // Update local state
      setAccountUsers(prev => prev.map(u => 
        u.id === user.id ? { 
          ...u, 
          status: 'inactive',
          deactivatedBy: adminUser,
          deactivatedAt: now.toISOString(),
          deactivationReason: 'Manually deactivated by Admin/Tech Officer',
          tempTORemarks: user.tempTORemarks || null,
          temporaryTechOfficer: false,
          adminActivated: false,
          emailVerified: false
        } : u
      ));

      // Reactivate main Tech Officer when Temporary Tech Officer is manually deactivated
      try {
        const mainTO = AccountUsers.find(x => {
          const r = String(x?.role || '').toLowerCase();
          return (r === 'tech_officer' || r === 'tech officer') && !x.temporaryTechOfficer && x.temporarilyInactiveDueToTempTO;
        });
        
        if (mainTO && mainTO.id) {
          const { updateDoc, doc } = await import('firebase/firestore');
          const { db } = await import('./firebase');
          await updateDoc(doc(db, mainTO._collection || 'users', mainTO.id), {
            status: 'Active',
            temporarilyInactiveDueToTempTO: false,
            temporaryReplacementReason: null,
            temporaryEffectiveFrom: null,
            temporaryEffectiveTo: null
          });
          
          // Update local state for main Tech Officer
          setAccountUsers(prev => prev.map(u => u.id === mainTO.id ? {
            ...u,
            status: 'active',
            temporarilyInactiveDueToTempTO: false,
            temporaryReplacementReason: null,
            temporaryEffectiveFrom: null,
            temporaryEffectiveTo: null
          } : u));
        }
      } catch (e) {
        console.error("Failed to reactivate main Tech Officer:", e);
      }
      
      setMessage({ text: `${user.username} deactivated successfully!`, type: 'success' });
    } catch (error) {
      setMessage({ text: `Error deactivating ${user.username}: ${error.message}`, type: 'error' });
    }
  };

  const filteredUsers = AccountUsers.filter(user => {
    if (!user || !user.username) return false;
    // Exclude the currently logged-in user from the list
    if (currentUser) {
      const sameId = user.id && currentUser.uid && user.id === currentUser.uid;
      const sameEmail = user.email && currentUser.email && user.email.toLowerCase() === currentUser.email.toLowerCase();
      const sameUsername = user.username && currentUser.username && user.username.toLowerCase() === String(currentUser.username).toLowerCase();
      if (sameId || sameEmail || sameUsername) return false;
    }
    
    // Farm filter - if current user is assigned to a farm, only show users from the same farm
    const isAssignedToFarm = currentUser?.farm;
    if (isAssignedToFarm) {
      const userFarm = user.farmId || user.farm; // Check both farmId and farm fields
      const currentUserFarm = currentUser.farm;
      
      // Check if user's farm matches current user's farm
      const matchesFarm = userFarm === currentUserFarm ||
                         userFarm === assignedFarmName ||
                         userFarm?.toLowerCase() === currentUserFarm?.toLowerCase() ||
                         userFarm?.toLowerCase() === assignedFarmName?.toLowerCase();
      
      if (!matchesFarm) {
        return false; // Skip users from different farms
      }
    }
    
    // Basic search term filter
    const roleDisplay = formatRoleForDisplay(user.role);
    const matchesSearch = (
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (roleDisplay.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
    
    // Role filter
    const matchesRole = selectedRole === 'All Roles' || roleDisplay === selectedRole;
    
    // Status filter
    const matchesStatus = selectedStatus === 'All Status' || (String(user.status || '').toLowerCase() === String(selectedStatus || '').toLowerCase());
    
    // Custom filter type
    let matchesCustomFilter = true;
    if (selectedFilterType !== 'All' && filterValue.trim()) {
      switch (selectedFilterType) {
        case 'Role':
          matchesCustomFilter = user.role?.toLowerCase().includes(filterValue.toLowerCase());
          break;
        case 'Status':
          matchesCustomFilter = user.status?.toLowerCase().includes(filterValue.toLowerCase());
          break;
        case 'Name':
          matchesCustomFilter = user.username?.toLowerCase().includes(filterValue.toLowerCase()) ||
                               user.fullName?.toLowerCase().includes(filterValue.toLowerCase());
          break;
        default:
          matchesCustomFilter = true;
      }
    }
    
    return matchesSearch && matchesRole && matchesStatus && matchesCustomFilter;
  });

  // Apply sorting to filtered users
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    
    switch (selectedNameSort) {
      case 'A-Z':
        return (a.username || '').localeCompare(b.username || '');
      case 'Z-A':
        return (b.username || '').localeCompare(a.username || '');
      case 'Newest':
        // Handle different date formats and missing dates
        const dateA = a.dateJoined ? new Date(a.dateJoined) : new Date(0);
        const dateB = b.dateJoined ? new Date(b.dateJoined) : new Date(0);

        return dateB - dateA; // Newest first
      case 'Oldest':
        // Handle different date formats and missing dates
        const dateAOldest = a.dateJoined ? new Date(a.dateJoined) : new Date(0);
        const dateBOldest = b.dateJoined ? new Date(b.dateJoined) : new Date(0);

        return dateAOldest - dateBOldest; // Oldest first
      default:
        return 0; // No sorting
    }
  });

  // Pagination (exactly 5 users per page)
  const PAGE_SIZE = 5;
  const [currentPage, setCurrentPage] = useState(1);
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(window.innerWidth > 1600);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE));
  // Clamp current page if data changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (currentPage < 1) {
      setCurrentPage(1);
    }
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedUsers = useMemo(() => {
    const slice = sortedUsers.slice(startIndex, startIndex + PAGE_SIZE);
    return slice;
  }, [sortedUsers, startIndex]);

  // Debug actual DOM rows rendered to detect duplication
  useEffect(() => {
    const rows = document.querySelectorAll('.user-row');

  }, [paginatedUsers, currentPage]);

  useEffect(() => {
    // Reset to first page when filters/search change
    setCurrentPage(1);
    setShowPageNumbers(false);
  }, [searchTerm, selectedRole, selectedStatus, selectedFilterType, filterValue, selectedNameSort]);

  useEffect(() => {
    const handleResize = () => {
      setIsLargeScreen(window.innerWidth > 1600);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Enforce PH mobile 09 prefix for add user form
    if (name === 'contactNumber') {
      const prevValue = newUser.contactNumber || '';
      const prevDigits = stripToDigits(prevValue);
      const nextFormatted = formatUserInputPH(value).value;
      const nextDigits = stripToDigits(nextFormatted);

      // Compute local-style digits for enforcement
      let localDigits = nextDigits;
      if (nextFormatted.startsWith('+63')) {
        const after = stripToDigits(nextFormatted.slice(3));
        localDigits = after ? `0${after}` : '';
      } else if (nextDigits.startsWith('63')) {
        const after = nextDigits.slice(2);
        localDigits = after ? `0${after}` : '';
      }

      // Allow deletions; block insertions that violate 09 prefix
      const isDeletion = nextDigits.length < prevDigits.length;
      if (!isDeletion) {
        if ((localDigits.length === 1 && localDigits[0] !== '0') ||
            (localDigits.length >= 2 && !localDigits.startsWith('09'))) {
          return; // reject change
        }
      }

      setNewUser(prev => ({ ...prev, contactNumber: nextFormatted }));
      return;
    }

    // Special handling for role changes
    if (name === 'role') {
      const newStatus = (value === 'Tech Officer' || value === 'Temporary Tech Officer' || value === 'Admin' || value === 'Fish Farmer') ? 'Inactive' : 'Active';

      
    setNewUser(prev => ({
      ...prev,
        [name]: value,
        // Automatically set Tech Officer to inactive, others to active
        status: newStatus
    }));
    } else {
      setNewUser(prev => ({ ...prev, [name]: value }));
    }

    if (name === 'email') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      setErrors(prevErrors => ({ ...prevErrors, email: emailPattern.test(value) ? '' : 'Please enter a valid email address.' }));
    }
  };

  const [newUser, setNewUser] = useState({
    username: '',
    fullName: '',
    address: '',
    email: '',
    contactNumber: '',
    role: 'User',
    status: 'Active',
    dateJoined: new Date().toISOString().split('T')[0],
    password: '',
    effectiveFrom: '',
    effectiveTo: '',
    tempTOReason: '',
    tempTORemarks: '',
    selectedExistingTTO: ''
  });

  // Ensure Temporary Tech Officer is always Inactive until verification
  useEffect(() => {
    if (newUser.role === 'Temporary Tech Officer') {
      if (newUser.status !== 'Inactive') {
        setNewUser(prev => ({ ...prev, status: 'Inactive' }));
      }
    }
  }, [newUser.role]);

  // Show manual entry fields unless super admin selected Temporary Tech Officer with "Select farm admin" mode
  const showManualFields = true;

  // Define resetForm function
  const resetForm = () => {
    setNewUser({
      username: '',
      email: '',
      fullName: '',
      address: '',
      contactNumber: '',
      role: '',
      password: '',
      dateJoined: getTodayDate(),
      status: 'Active', // Will be updated when role is selected
      effectiveFrom: '',
      effectiveTo: '',
      tempTOReason: '',
      tempTORemarks: '',
      selectedExistingTTO: ''
    });
    setTtoCreationMode('');
  };

  const handleAddUser = async () => {
    try {
      if (!canManageUsers) {
        setMessage({ text: 'Only Admins, Tech Officers, and Temporary Tech Officers can add new users', type: 'error' });
        return;
      }
      
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `User creation attempted for ${newUser.username} (${newUser.role}) in Account Management`, u); 
      } catch (_) {}
      // Skip password validation for reuse mode since we're reusing an existing account
      if (ttoCreationMode !== 'reuse' && newUser.password.length < 6) {
        setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
        return;
      }
      // Skip username and email validation for reuse mode since we're reusing an existing account
      if (ttoCreationMode !== 'reuse' && (!newUser.username || !newUser.role || !newUser.password || !newUser.email)) {
        setMessage({ text: 'All fields are required', type: 'error' });
        return;
      }
      // Skip email validation for reuse mode since we're reusing an existing account
      if (ttoCreationMode !== 'reuse' && !/^\S+@\S+\.\S+$/.test(newUser.email)) {
        setMessage({ text: 'Please enter a valid email address', type: 'error' });
        return;
      }
      // Skip password validation for reuse mode since we're reusing an existing account
      if (ttoCreationMode !== 'reuse' && newUser.password.length < 8) {
        setMessage({ text: 'Password must be at least 8 characters', type: 'error' });
        return;
      }
      
      // Validate date
      if (!newUser.dateJoined) {
        setMessage({ text: 'Date joined is required', type: 'error' });
        return;
      }
      
      // Ensure date is in correct format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(newUser.dateJoined)) {
        setMessage({ text: 'Invalid date format. Please use YYYY-MM-DD format', type: 'error' });
        return;
      }
      
      // For Temporary Tech Officer, require effective period and validate range
      if (newUser.role === 'Temporary Tech Officer') {
        if (!newUser.effectiveFrom || !newUser.effectiveTo) {
          setMessage({ text: 'Please set Effective Period (From) and (To) for Temporary Tech Officer', type: 'error' });
          return;
        }
        const fromOk = dateRegex.test(newUser.effectiveFrom);
        const toOk = dateRegex.test(newUser.effectiveTo);
        if (!fromOk || !toOk) {
          setMessage({ text: 'Effective Period must be in YYYY-MM-DD format', type: 'error' });
          return;
        }
        if (new Date(newUser.effectiveFrom) > new Date(newUser.effectiveTo)) {
          setMessage({ text: 'Effective Period (From) must be before or equal to (To)', type: 'error' });
          return;
        }
      }
      
      // Handle reuse existing TTO account
      if (newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'reuse') {
        if (!newUser.selectedExistingTTO) {
          setMessage({ text: 'Please select an existing Temporary Tech Officer account to reuse', type: 'error' });
          return;
        }
        
        // Find the selected TTO account
        const selectedTTO = AccountUsers.find(user => user.id === newUser.selectedExistingTTO);
        if (!selectedTTO) {
          setMessage({ text: 'Selected Temporary Tech Officer account not found', type: 'error' });
          return;
        }
        
        // Update the existing TTO account with new effective period and reason
        try {
          const { updateDoc, doc } = await import('firebase/firestore');
          const { db } = await import('./firebase');
          
          await updateDoc(doc(db, 'users', selectedTTO.id), {
            effectiveFrom: newUser.effectiveFrom || null,
            effectiveTo: newUser.effectiveTo || null,
            tempTOReason: newUser.tempTOReason || null,
            tempTORemarks: newUser.tempTORemarks || null,
            lastModified: new Date().toISOString(),
            // Clear deactivation fields to show activation button instead of deactivation message
            deactivatedBy: null,
            deactivatedAt: null,
            deactivationReason: null
          });
          
          // Update local state to reflect the changes
          setAccountUsers(prev => prev.map(user => 
            user.id === selectedTTO.id 
              ? { 
                  ...user, 
                  effectiveFrom: newUser.effectiveFrom || null,
                  effectiveTo: newUser.effectiveTo || null,
                  tempTOReason: newUser.tempTOReason || null,
                  tempTORemarks: newUser.tempTORemarks || null,
                  lastModified: new Date().toISOString(),
                  // Clear deactivation fields to show activation button instead of deactivation message
                  deactivatedBy: null,
                  deactivatedAt: null,
                  deactivationReason: null
                }
              : user
          ));
          
          setMessage({ text: `Temporary Tech Officer account "${selectedTTO.username}" has been updated with new assignment details. The account is now ready for activation.`, type: 'success' });
          resetForm();
          setShowAddUserForm(false);
          return;
        } catch (error) {
          console.error('Error updating TTO account:', error);
          setMessage({ text: 'Failed to update Temporary Tech Officer account', type: 'error' });
          return;
        }
      }
      
      // Role permissions: Farm-assigned Admins can only create Fish Farmers; Super Admins (no farm) can create Admins, Tech Officers, and Temporary Tech Officers
      const allowedRoles = currentUser?.farm ? ['Fish Farmer'] : ['Admin', 'Tech Officer', 'Temporary Tech Officer'];
      if (!allowedRoles.includes(newUser.role)) {
        setMessage({ text: 'Invalid role selected', type: 'error' });
        return;
      }

      // Removed farm-admin selection requirement for Temporary Tech Officer

      setMessage({ text: 'Creating user...', type: 'info' });

      // Determine farm assignment
      // For Tech Officer or Temporary Tech Officer created by Super Admin, enforce no farm assignment
      const isCreatingTechOfficer = (newUser.role === 'Tech Officer' || newUser.role === 'Temporary Tech Officer');
      const farmForNewUser = isCreatingTechOfficer ? null : (currentUser?.farm ? currentUser.farm : selectedFarmId);
      // Super Admins: Admin requires no farm; Tech Officer requires no farm; Fish Farmer requires farm
      if (!currentUser?.farm && newUser.role === 'Fish Farmer' && !farmForNewUser) {
        setMessage({ text: 'Please select a farm for the user', type: 'error' });
        return;
      }

      // Enforce default Inactive for privileged roles (including Temporary Tech Officer)
      const enforcedStatus = (newUser.role === 'Admin' || newUser.role === 'Tech Officer' || newUser.role === 'Fish Farmer' || newUser.role === 'Temporary Tech Officer')
        ? 'Inactive'
        : newUser.status;

      // Validate email format
      const emailPattern = /^\S+@\S+\.[\S]+$/;
      if (!emailPattern.test(String(newUser.email || '').trim())) {
        setMessage({ text: 'Please enter a valid email address', type: 'error' });
        return;
      }

      // Validate and normalize contact number if provided
      let normalizedContact = newUser.contactNumber;
      if (newUser.contactNumber) {
        const phoneValidation = validatePhilippineMobile(newUser.contactNumber);
        if (!phoneValidation.valid) {
          setMessage({ text: phoneValidation.message || 'Enter a valid PH mobile number.', type: 'error' });
          return;
        }
        normalizedContact = normalizeToE164PH(newUser.contactNumber) || newUser.contactNumber;
      }

      const userData = {
        email: newUser.email,
        username: newUser.username,
        fullName: newUser.fullName,
        address: newUser.address,
        contactNumber: normalizedContact,
        // Map Temporary Tech Officer to temp_tech_officer role, with a flag
        role: (newUser.role === 'Temporary Tech Officer') ? 'temp_tech_officer' : newUser.role,
        password: newUser.password,
        dateJoined: newUser.dateJoined,
        status: enforcedStatus,
        farm: farmForNewUser || null,
        temporaryTechOfficer: newUser.role === 'Temporary Tech Officer',
        isTemporary: newUser.role === 'Temporary Tech Officer',
        ...(newUser.role === 'Temporary Tech Officer' && {
          effectiveFrom: newUser.effectiveFrom || null,
          effectiveTo: newUser.effectiveTo || null,
          tempTOReason: newUser.tempTOReason || null,
          tempTORemarks: newUser.tempTORemarks || null
        })
      };

      // Removed farm-admin pairing persistence for Temporary Tech Officer



      // Directly call createStaffAccount without admin password modal
      const result = await createStaffAccount(userData);

      if (result.success) {
        setMessage({ text: `${newUser.role} ${newUser.username} created successfully!`, type: 'success' });
        try { 
          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
          logActivity('account', `User ${newUser.username} (${newUser.role}) created successfully in Account Management`, u); 
        } catch (_) {}
        // Main Tech Officer status will only change when TTO is activated, not when created
        // Keep form open so success is visible, clear inputs for next entry
        resetForm();
        await fetchUsers();
      } else {
        setMessage({ text: `Error: ${result.error}`, type: 'error' });
      }

    } catch (error) {

      let errorMessage = error.message;
      if (error.code === 'auth/email-already-in-use') errorMessage = 'This email is already registered';
      else if (error.code === 'auth/weak-password') errorMessage = 'Password should be at least 6 characters';
      setMessage({ text: `Error: ${errorMessage}`, type: 'error' });
    }
  };

  const handleCancelAddUser = () => {
    setShowAddUserForm(false);
    setNewUser({
      username: '',
      fullName: '',
      address: '',
      email: '',
      contactNumber: '',
      role: 'User',
      status: 'Active',
      dateJoined: getTodayDate(), 
      password: ''
    });
    setMessage({ text: '', type: '' });
  };

  // Function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Function to open Add New User form with current date
  const handleOpenAddUserForm = () => {
    if (!canManageUsers) {
      setMessage({ text: 'Only Admins, Tech Officers, and Temporary Tech Officers can add new users', type: 'error' });
      return;
    }
    const todayDate = getTodayDate();

    
    setNewUser({
      username: '',
      fullName: '',
      address: '',
      email: '',
      contactNumber: '',
      // Default role depends on creator (hide Tech Officer if already exists)
      role: currentUser?.farm ? 'Fish Farmer' : (hasTechOfficer ? 'Admin' : 'Tech Officer'),
      status: 'Active', // Default status, enforced later per role
      dateJoined: todayDate,
      password: '',
        effectiveFrom: '',
        effectiveTo: '',
        tempTOReason: '',
        tempTORemarks: ''
    });
    setShowAddUserForm(true);
    setMessage({ text: '', type: '' });
    // Preselect farm if creator has assigned farm; otherwise clear selection
    if (currentUser?.farm) {
      setSelectedFarmId(currentUser.farm);
    } else {
      setSelectedFarmId('');
    }
  };

  const handleResetPassword = async (user) => {
    if (!user || !user.email) {
      setMessage({ text: 'User email not found', type: 'error' });
      return;
    }

    try {
      setResettingPasswordUserId(user.id);
      setResetNotices(prev => ({ ...prev, [user.id]: { text: `Sending password reset email...`, type: 'info' } }));
      setMessage({ text: `Sending password reset email to ${user.username}...`, type: 'info' });
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `Password reset initiated for user ${user.username} in Account Management`, u); 
      } catch (_) {}

      // Import Firebase Auth functions
      const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
      const { app } = await import('./firebase');
      
      const auth = getAuth(app);
      
      // Send password reset email
      await sendPasswordResetEmail(auth, user.email);
      
      // Keep inline notice only; global toast removed
      setResetNotices(prev => ({ ...prev, [user.id]: { text: `Email sent ✔`, type: 'success' } }));
      setTimeout(() => {
        setResetNotices(prev => {
          const next = { ...prev };
          delete next[user.id];
          return next;
        });
      }, 1000);
      
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `Password reset email sent successfully to ${user.username} in Account Management`, u); 
      } catch (_) {}

      
    } catch (error) {
      let errorMessage = 'Failed to send password reset email';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'User not found in authentication system';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many password reset attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      // Keep inline error notice only; global toast removed
      setResetNotices(prev => ({ ...prev, [user.id]: { text: `Failed to send`, type: 'error' } }));
      setTimeout(() => {
        setResetNotices(prev => {
          const next = { ...prev };
          delete next[user.id];
          return next;
        });
      }, 1500);
    } finally {
      setResettingPasswordUserId(null);
    }
  };



  // Function to activate Tech Officer accounts
  const handleActivateTechOfficer = async (user) => {
    if (formatRoleForDisplay(user.role) !== 'Tech Officer' && formatRoleForDisplay(user.role) !== 'Temporary Tech Officer') {
      setMessage({ text: 'Only Tech Officer accounts can be activated', type: 'error' });
      return;
    }

    try {
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `Tech Officer activation initiated for user ${user.username} in Account Management`, u); 
      } catch (_) {}
      // Reconcile with Firestore first
      const live = await serviceFetchLiveUserStatus(user.id);
      if (live && typeof live.status === 'string') {
        const liveStatus = live.status.toLowerCase();
        const localStatus = String(user.status || '').toLowerCase();
        if (liveStatus !== localStatus) {
          setAccountUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: liveStatus } : u));
          if (liveStatus === 'active') {
            setMessage({ text: `User ${user.username} is already Active in Firestore. UI has been updated.`, type: 'info' });
            return;
          }
        }
      }

      setMessage({ text: `Activating Tech Officer ${user.username}...`, type: 'info' });
      const result = await serviceActivateTechOfficer(user.id);
      if (!result.success) throw new Error(result.error || 'Failed to activate Tech Officer');
      
      setMessage({ text: `Tech Officer ${user.username} activated. Note: user must verify their email to become Active.`, type: 'success' });
      
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `Tech Officer ${user.username} activated successfully in Account Management`, u); 
      } catch (_) {}
      
      // Update local state (optimistic)
      setAccountUsers(prev => prev.map(u => 
        u.id === user.id ? { ...u, status: 'active', adminActivated: true, _justActivated: true } : u
      ));

      // Update Firestore to set status to Active
      try {
        const { updateDoc, doc } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        await updateDoc(doc(db, 'users', user.id), {
          status: 'Active',
          adminActivated: true,
          lastModified: new Date().toISOString()
        });
      } catch (e) {
        console.error("Failed to update Firestore status:", e);
      }

      // If this is a Temporary Tech Officer being activated, set main Tech Officer to Inactive
      if (String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) {
        try {
          const mainTO = AccountUsers.find(x => {
            const r = String(x?.role || '').toLowerCase();
            return (r === 'tech_officer' || r === 'tech officer') && !x.temporaryTechOfficer;
          });
          
          if (mainTO && mainTO.id) {
            const { updateDoc, doc } = await import('firebase/firestore');
            const { db } = await import('./firebase');
            await updateDoc(doc(db, mainTO._collection || 'users', mainTO.id), {
              status: 'Inactive',
              temporarilyInactiveDueToTempTO: true,
              temporaryReplacementReason: user.tempTOReason || 'Temporary assignment',
              temporaryEffectiveFrom: user.effectiveFrom || null,
              temporaryEffectiveTo: user.effectiveTo || null
            });
            
            // Update local state for main Tech Officer
            setAccountUsers(prev => prev.map(u => u.id === mainTO.id ? {
              ...u,
              status: 'inactive',
              temporarilyInactiveDueToTempTO: true,
              temporaryReplacementReason: user.tempTOReason || 'Temporary assignment',
              temporaryEffectiveFrom: user.effectiveFrom || null,
              temporaryEffectiveTo: user.effectiveTo || null
            } : u));
          }
        } catch (e) {
          console.error("Failed to inactivate main Tech Officer:", e);
        }
      }
      
      // Refresh users list
      await fetchUsers();
      
    } catch (error) {
      setMessage({ text: `Error activating Tech Officer: ${error.message}`, type: 'error' });
    }
  };

// Update your handleActivateFishFarmer function
const handleActivateFishFarmer = async (user) => {
  if (formatRoleForDisplay(user.role) !== 'Fish Farmer') {
    setMessage({ text: 'Only Fish Farmer accounts can be activated here', type: 'error' });
    return;
  }

  try {
    // Log activity
    const adminUser = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
    logActivity('account', `Fish Farmer activation initiated for ${user.username}`, adminUser);

    setMessage({ text: `Activating ${user.username}...`, type: 'info' });

    // Use the direct update method
    const result = await serviceActivateFishFarmer(user.id, user.email, user._collection, user.username);

    if (!result.success) {
      throw new Error(result.error || 'Activation failed');
    }

    // Wait a moment for Firestore to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify the update worked
    const liveAfter = await serviceFetchLiveUserStatus(user.id);
    
    if (liveAfter && liveAfter.status === 'active') {
      setAccountUsers(prev => prev.map(u => 
        u.id === user.id ? { ...u, status: 'active' } : u
      ));
      setMessage({ text: `${user.username} activated successfully!`, type: 'success' });
      logActivity('account', `Fish Farmer ${user.username} activated successfully`, adminUser);
    } else {
      setMessage({ 
        text: `Activation may have failed. Current status: ${liveAfter?.status || 'unknown'}`, 
        type: 'warning' 
      });
    }

    await fetchUsers();

  } catch (error) {
    setMessage({ text: `Error: ${error.message}`, type: 'error' });
    
    const adminUser = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
    logActivity('error', `Failed to activate ${user.username}: ${error.message}`, adminUser);
  }
};

  // Activate Admin accounts
  const handleActivateAdmin = async (user) => {
    const roleDisplay = formatRoleForDisplay(user.role);
    if (roleDisplay !== 'Admin') {
      setMessage({ text: 'Only Admin accounts can be activated here', type: 'error' });
      return;
    }

    // Tech Officers and Temporary Tech Officers can also activate self-registered Admins
    const isSelfRegistered = String(user.createdBy || '').toLowerCase() === 'self';
    if (isSelfRegistered && !canManageUsers) {
      setMessage({ text: 'Only Admins, Tech Officers, and Temporary Tech Officers can activate Admins registered via signup', type: 'error' });
      return;
    }

    try {
      setMessage({ text: `Activating Admin ${user.username || user.email}...`, type: 'info' });
      // Use AuthContext function
      const result = await activateAdminAccount(user.email);
      if (!result?.success) {
        throw new Error(result?.message || 'Failed to activate Admin');
      }
      setMessage({ text: `Admin ${user.username || user.email} activated successfully!`, type: 'success' });
      try {
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `Admin ${user.username || user.email} activated in Account Management`, u);
      } catch (_) {}
      await fetchUsers();
    } catch (error) {
      setMessage({ text: `Error activating Admin: ${error.message}`, type: 'error' });
    }
  };

  // Fetch live status from Firestore for reconciliation
  const fetchLiveUserStatus = async (userId) => {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      // try users first
      let userDocRef = doc(db, 'users', userId);
      let userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        return { status: String(data.status || '').toLowerCase(), collection: 'users' };
      }
      // then mobileUsers
      userDocRef = doc(db, 'mobileUsers', userId);
      userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        return { status: String(data.status || '').toLowerCase(), collection: 'mobileUsers' };
      }
      return null;
    } catch (e) {

      return null;
    }
  };


  const handleDeleteUser = async (user) => {
    if (!canManageUsers) {
      setMessage({ text: 'Only Admins, Tech Officers, and Temporary Tech Officers can delete users', type: 'error' });
      return;
    }
    // Show custom confirmation modal
    setDeleteConfirmData({
      type: 'single',
      user: user,
      message: `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`
    });
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmData) return;
    
    const { user } = deleteConfirmData;
    setShowDeleteConfirmModal(false);
    
    try {
      setMessage({ text: `Deleting user ${user.username}...`, type: 'info' });
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `User deletion initiated for ${user.username} in Account Management`, u); 
      } catch (_) {}

      // Delete user from Firebase
      const result = await deleteUserFromFirebase(user.id);
      
      if (result.success) {
        setMessage({ text: `User ${user.username} deleted successfully!`, type: 'success' });
        try { 
          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
          logActivity('account', `User ${user.username} deleted successfully in Account Management`, u); 
        } catch (_) {}
        
        // Remove user from local state
        setAccountUsers(prev => prev.filter(u => u.id !== user.id));
        
        // Remove from selected users if they were selected
        setSelectedUsers(prev => {
          const newSelected = new Set(prev);
          newSelected.delete(user.id);
          return newSelected;
        });
        
        // Reset to first page if current page becomes empty
        if (paginatedUsers.length === 1 && currentPage > 1) {
          setCurrentPage(1);
        }
        
        // Refresh users list
        await fetchUsers();
      } else {
        setMessage({ text: `Error deleting user: ${result.error}`, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: `Error deleting user: ${error.message}`, type: 'error' });
    }
    
    setDeleteConfirmData(null);
  };

  // Function to delete user from Firebase
  const deleteUserFromFirebase = async (userId) => {
    return serviceDeleteUserById(userId);
  };

  // Function to delete user from Firebase Auth via Cloud Function
  const deleteUserFromAuth = async (userEmail) => {
    // Kept for backward compatibility if referenced elsewhere
    return { success: true };
  };

  // Bulk delete selected users
  const handleBulkDelete = async () => {
    if (!canManageUsers) {
      setMessage({ text: 'Only Admins, Tech Officers, and Temporary Tech Officers can bulk delete users', type: 'error' });
      return;
    }
    if (selectedUsers.size === 0) {
      setMessage({ text: 'No users selected for deletion', type: 'error' });
      return;
    }

    const selectedUserList = filteredUsers.filter(user => selectedUsers.has(user.id));
    const userNames = selectedUserList.map(user => user.username).join(', ');
    
    // Show custom confirmation modal
    setDeleteConfirmData({
      type: 'bulk',
      userNames: userNames,
      count: selectedUsers.size,
      message: `Are you sure you want to delete ${selectedUsers.size} user(s): ${userNames}? This action cannot be undone.`
    });
    setShowDeleteConfirmModal(true);
  };

  // Bulk activate selected users (for users currently inactive)
  const handleBulkActivate = async () => {
    try {
      if (!canManageUsers) {
        setMessage({ text: 'Only Admins, Tech Officers, and Temporary Tech Officers can bulk activate users', type: 'error' });
        return;
      }
      if (selectedUsers.size === 0) {
        setMessage({ text: 'No users selected for activation', type: 'warning' });
        return;
      }

      const selectedUserList = filteredUsers.filter(user => selectedUsers.has(user.id));
      const inactiveUsers = selectedUserList.filter(u => String(u.status || '').toLowerCase() === 'inactive');
      if (inactiveUsers.length === 0) {
        setMessage({ text: 'No inactive users selected to activate', type: 'info' });
        return;
      }

      setMessage({ text: `Activating ${inactiveUsers.length} user(s)...`, type: 'info' });

      // Activate users per their role
      for (const user of inactiveUsers) {
        const roleDisplay = formatRoleForDisplay(user.role);
        if (roleDisplay === 'Tech Officer' || roleDisplay === 'Temporary Tech Officer') {
          await handleActivateTechOfficer(user);
        } else if (roleDisplay === 'Fish Farmer') {
          await handleActivateFishFarmer(user);
        } else if (roleDisplay === 'Admin') {
          await handleActivateAdmin(user);
        }
      }

      setMessage({ text: `Activated ${inactiveUsers.length} user(s) successfully`, type: 'success' });

    } catch (error) {
      setMessage({ text: `Error during bulk activate: ${error.message}`, type: 'error' });
    }
  };

  const confirmBulkDelete = async () => {
    if (!deleteConfirmData || deleteConfirmData.type !== 'bulk') return;
    
    setShowDeleteConfirmModal(false);
    
    try {
      setMessage({ text: `Deleting ${selectedUsers.size} users...`, type: 'info' });
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // Delete users one by one
      for (const userId of selectedUsers) {
        try {
          const result = await deleteUserFromFirebase(userId);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
            errors.push(result.error);
          }
        } catch (error) {
          errorCount++;
          errors.push(error.message);
        }
      }
      
      if (errorCount === 0) {
        setMessage({ text: `Successfully deleted ${successCount} users!`, type: 'success' });
      } else if (successCount > 0) {
        setMessage({ text: `Deleted ${successCount} users, but ${errorCount} failed. Check console for details.`, type: 'warning' });
      } else {
        setMessage({ text: `Failed to delete any users. Check console for details.`, type: 'error' });
      }
      
      // Clear selection
      setSelectedUsers(new Set());
      
      // Refresh users list
      await fetchUsers();
      
      // Reset to first page if needed
      if (currentPage > 1) {
        setCurrentPage(1);
      }
      
      // Log errors for debugging
      if (errors.length > 0) {
        console.error('Bulk delete errors:', errors);
      }
      
    } catch (error) {
      setMessage({ text: `Error during bulk delete: ${error.message}`, type: 'error' });
    }
    
    setDeleteConfirmData(null);
  };

  // Checkbox selection functions
  const handleSelectAll = (checked) => {
    if (checked) {
      // Select all users across ALL pages, not just current page
      const allUserIds = filteredUsers.map(user => user.id).filter(Boolean);
      setSelectedUsers(new Set(allUserIds));
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `All users selected (${allUserIds.length} users) in Account Management`, u); 
      } catch (_) {}
    } else {
      // Deselect all users across all pages
      setSelectedUsers(new Set());
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `All users deselected in Account Management`, u); 
      } catch (_) {}
    }
  };

  const handleUserSelection = (userId, checked) => {
    const newSelectedUsers = new Set(selectedUsers);
    if (checked) {
      newSelectedUsers.add(userId);
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        const user = AccountUsers.find(u => u.id === userId);
        logActivity('account', `User ${user?.username || userId} selected in Account Management`, u); 
      } catch (_) {}
    } else {
      newSelectedUsers.delete(userId);
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        const user = AccountUsers.find(u => u.id === userId);
        logActivity('account', `User ${user?.username || userId} deselected in Account Management`, u); 
      } catch (_) {}
    }
    setSelectedUsers(newSelectedUsers);
  };

  // Check if all users across all pages are selected
  const isAllSelectedAcrossAllPages = filteredUsers.length > 0 && filteredUsers.every(user => selectedUsers.has(user.id));
  const isIndeterminateAcrossAllPages = selectedUsers.size > 0 && selectedUsers.size < filteredUsers.length;
  const selectedInactiveCount = filteredUsers.filter(u => selectedUsers.has(u.id) && String(u.status || '').toLowerCase() === 'inactive').length;

  const accountCSVData = prepareAccountCSVData(AccountUsers);
  // Lightweight wrapper to support tooltips around disabled buttons (no external deps)
  const TooltipWrapper = ({ showTooltip, tooltipText, onBlockedClick, children }) => {
    const [open, setOpen] = useState(false);
    if (!showTooltip) return children;
    return (
      <span
        style={{ position: 'relative', display: 'inline-block' }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); if (typeof onBlockedClick === 'function') onBlockedClick(); }}
      >
        {open && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%) translateY(-6px)',
              background: '#111827',
              color: '#fff',
              padding: '6px 8px',
              fontSize: '12px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
              zIndex: 20
            }}
            role="tooltip"
          >
            {tooltipText}
          </div>
        )}
        {children}
      </span>
    );
  };




  // Sidebar export handler for this page
  const handleSidebarExport = (format) => {
    try {
      if (!AccountUsers || AccountUsers.length === 0) {
        setMessage({ text: 'No users data available for export', type: 'error' });
        return;
      }
      
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('export', logMessages.export[format === 'csv' ? 'csvDownload' : 'pdfDownload'](u, 'account data'), u); 
      } catch (_) {}
      
      // Ensure CSV export has data
      localStorage.setItem('currentUsers', JSON.stringify(AccountUsers));

      if (format === 'pdf') {
        exportAccountToPDF(AccountUsers, currentUser);
      } else if (format === 'csv') {
        handleAccountCSVExport(currentUser);
      }
    } finally {
      setShowDownloadOptions(false);
    }
  };

  // Admin password confirmation removed per requirement
  // const handleAdminPasswordConfirm = async () => {};

  // Function to close admin password modal
  const closeAdminPasswordModal = () => {
    setShowAdminPasswordModal(false);
    setPendingUserData(null);
    setAdminPassword('');
    setAdminPasswordError('');
    setMessage({ text: '', type: '' });
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

  return (
    <div className="account-management">
              {process.env.NODE_ENV === 'development' && ( 
        <div style={{
          position: 'fixed', 
          top: '80px', 
          right: '10px', 
          padding: '5px 10px', 
          borderRadius: '4px',
          fontSize: '20px',
          zIndex: 9999
        }}>
          {screen.width}px {screen.isMobile ? '(Mobile)' : screen.isTablet ? '(Tablet)' : '(Desktop)'}
        </div>
      )}
      <header className={`account-header-bar ${sidebarOpen && window.innerWidth <= 1023 ? 'blurred' : ''}`}>
        <div className="header-logo-container">
        <FaBars className="header-hamburger-icon" onClick={handleSidebarToggle} />
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRISK</div>
        </div>

        <div className="header-right">
        <div className="header-search-container">
              <div className="header-search-input-wrapper">
                <FaSearch className="header-search-icon" />
            <input
              type="text"
              placeholder="Search..."
                  className="header-search-input"
              value={searchTerm}
                  onChange={(e) => {
                    e.stopPropagation(); // Prevent closing dropdowns when typing in search
                    setSearchTerm(e.target.value);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Search performed: "${e.target.value}" in Account Management`, u); 
                    } catch (_) {}
                  }}
            />
          </div>
            </div>
          
          <NotificationBox 
            onOpen={() => { setShowMenu(false); }}
            externalCloseSignal={notificationCloseSignal}
          />
          <div className="user-menu">
              <button onClick={(e) => {
                e.stopPropagation(); // Prevent closing dropdowns when clicking user menu
                closeAllDropdowns(); // Close all other dropdowns first
                setNotificationCloseSignal((v) => v + 1); // Close notifications when opening user menu
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

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && window.innerWidth <= 1023 && (
        <div 
          className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`}
          onClick={() => setSidebarOpen(false)}
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
        onAccountManagementClick={() => navigate('/AccountManagement')}
        onLogsClick={() => navigate('/logs')}
        onFeedbackClick={() => navigate('/Feedback')}
        nightMode={nightMode}
        setNightMode={setNightMode}
        language={language}
        setLanguage={setLanguage}
      />
                <div className={`add-user-button-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} onClick={closeAllDropdowns}>

        
        {/* Filter Button */}
        <button 
          className="filter-button"
          onClick={(e) => {
            e.stopPropagation();
            const isOpening = !showFilterDropdown;
            setShowFilterDropdown(!showFilterDropdown);
          }}
        >
          <FaFilter className="filter-icon" />
          {t('accountManagement.filters.filter_button')}
        </button>
            
            {showFilterDropdown && (
              <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="filter-section">
                  <label>{t('accountManagement.filters.filter_type_label')}</label>
                  <select 
                    value={selectedFilterType} 
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedFilterType(e.target.value);
                    }}
                  >
                    <option value="All">{t('accountManagement.filters.all_option')}</option>
                    <option value="Role">{t('accountManagement.filters.role_option')}</option>
                    <option value="Status">{t('accountManagement.filters.status_option')}</option>
                    <option value="Name">{t('accountManagement.filters.name_option')}</option>
                  </select>
          </div>

                {selectedFilterType !== 'All' && (
                  <div className="filter-section">
                    <label>{t('accountManagement.filters.filter_value_label')}</label>
                    <input
                      type="text"
                      placeholder={t('accountManagement.filters.enter_filter_placeholder', { filterType: selectedFilterType.toLowerCase() })}
                      value={filterValue}
                      onChange={(e) => {
                        e.stopPropagation();
                        setFilterValue(e.target.value);
                      }}
                      className="filter-input"
                    />
                  </div>
                )}
                
                <div className="filter-actions">
                  <button 
                    className="apply-filter-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFilterDropdown(false);
                    }}
                  >
                    {t('accountManagement.filters.apply_button')}
                  </button>
                  <button 
                    className="clear-filter-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFilterType('All');
                      setFilterValue('');
                      setShowFilterDropdown(false);
                    }}
                  >
                    {t('accountManagement.filters.clear_button')}
          </button>
        </div>
              </div>
            )}
            
            {canManageUsers ? (
              <button className="add-user-button" onClick={(e) => {
                e.stopPropagation(); // Prevent closing dropdowns when clicking add user button
                closeAllDropdowns(); // Close all other dropdowns first
                handleOpenAddUserForm();
              }}>
                <FaUserPlus className="button-icon" />
                Add New User
              </button>
            ) : (
              <button className="add-user-button" style={{ visibility: 'hidden' }} aria-hidden="true" tabIndex={-1}>
                <FaUserPlus className="button-icon" />
                Add New User
              </button>
            )}
            
            {canManageUsers && selectedInactiveCount > 1 && (
              <button className="bulk-activate-button" onClick={(e) => {
                e.stopPropagation();
                closeAllDropdowns();
                try {
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('account', `Bulk activate initiated for ${selectedUsers.size} users in Account Management`, u);
                } catch (_) {}
                handleBulkActivate();
              }}>
                <FaCheckCircle className="button-icon" />
                Activate Selected ({selectedInactiveCount})
              </button>
            )}

            {canManageUsers && selectedUsers.size > 1 && (
              <button className="bulk-delete-button" onClick={(e) => {
                e.stopPropagation(); // Prevent closing dropdowns when clicking bulk delete button
                closeAllDropdowns(); // Close all other dropdowns first
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('account', `Bulk delete initiated for ${selectedUsers.size} users in Account Management`, u); 
                } catch (_) {}
                handleBulkDelete();
              }}>
                <RiDeleteBin6Line className="button-icon" />
                Delete Selected ({selectedUsers.size})
              </button>
            )}
          </div>
      <div className={`manage-wrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="table-header" onClick={closeAllDropdowns}>
          <div className="header-row">
            <div className="header-cell checkbox-cell">
              <input 
                type="checkbox" 
                className="select-all-checkbox"
                checked={isAllSelectedAcrossAllPages}
                ref={(input) => {
                  if (input) input.indeterminate = isIndeterminateAcrossAllPages;
                }}
                onChange={(e) => {
                  e.stopPropagation(); // Prevent closing dropdowns when clicking checkbox
                  handleSelectAll(e.target.checked);
                }}
              />
            </div>
            <div className="header-cell name-cell">
              <span>NAME</span>
              <IoMdArrowDropdown 
                className="dropdown-arrow" 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent closing dropdowns when clicking dropdown arrow
                  closeAllDropdowns(); // Close all other dropdowns first
                  setShowNameDropdown(!showNameDropdown);
                }}
              />
              {showNameDropdown && (
                <div className="dropdown-menu-name">
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedNameSort('A-Z'); 
                    setShowNameDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Sort changed to A-Z in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    A-Z (Ascending)
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedNameSort('Z-A'); 
                    setShowNameDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Sort changed to Z-A in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    Z-A (Descending)
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedNameSort('Newest'); 
                    setShowNameDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Sort changed to Newest in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    Newest First
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedNameSort('Oldest'); 
                    setShowNameDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Sort changed to Oldest in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    Oldest First
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedNameSort('None'); 
                    setShowNameDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Sort changed to None in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    No Sorting
                  </div>
                </div>
              )}
            </div>
            <div className="header-cell role-cell">
              <span>{t('accountManagement.table_headers.role')}</span>
              <IoMdArrowDropdown 
                className="dropdown-arrow" 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent closing dropdowns when clicking dropdown arrow
                  closeAllDropdowns(); // Close all other dropdowns first
                  setShowRoleDropdown(!showRoleDropdown);
                }}
              />
              {showRoleDropdown && (
                <div className="dropdown-menu-role">
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedRole('All Roles'); 
                    setShowRoleDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Role filter changed to All Roles in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    {t('accountManagement.dropdown_options.all_roles')}
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedRole('Admin'); 
                    setShowRoleDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Role filter changed to Admin in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    {t('accountManagement.dropdown_options.admin')}
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedRole('Tech Officer'); 
                    setShowRoleDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Role filter changed to Tech Officer in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    {t('accountManagement.dropdown_options.tech_officer')}
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedRole('Fish Farmer'); 
                    setShowRoleDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Role filter changed to Fish Farmer in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    {t('accountManagement.dropdown_options.fish_farmer')}
                  </div>
                </div>
              )}
            </div>
            <div className="header-cell farm-cell">
              <span>{t('accountManagement.table_headers.farm')}</span>
            </div>
            <div className="header-cell status-cell">
              <span>{t('accountManagement.table_headers.status')}</span>
              <IoMdArrowDropdown 
                className="dropdown-arrow" 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent closing dropdowns when clicking dropdown arrow
                  closeAllDropdowns(); // Close all other dropdowns first
                  setShowStatusDropdown(!showStatusDropdown);
                }}
              />
              {showStatusDropdown && (
                <div className="dropdown-menu-status">
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedStatus('All Status'); 
                    setShowStatusDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Status filter changed to All Status in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    {t('accountManagement.dropdown_options.all_status')}
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedStatus('Active'); 
                    setShowStatusDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Status filter changed to Active in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    {t('accountManagement.dropdown_options.active')}
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedStatus('Inactive'); 
                    setShowStatusDropdown(false); 
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('account', `Status filter changed to Inactive in Account Management`, u); 
                    } catch (_) {}
                  }}>
                    {t('accountManagement.dropdown_options.inactive')}
                  </div>
                </div>
              )}
            </div>
            <div className="header-cell contact-cell">
              <span>{t('accountManagement.table_headers.contact')}</span>
            </div>
            <div className="header-cell actions-cell">
              <span>{t('accountManagement.table_headers.actions')}</span>
            </div>
            <div className="header-cell joined-cell">
              <span>{t('accountManagement.table_headers.joined')}</span>
            </div>
            <div className="header-cell delete-cell">
              <span></span>
            </div>
          </div>
        </div>
      </div>
      <div className={`account-main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Global toast removed per request */}
        <div className="account-container">
        {canManageUsers && showAddUserForm && (
            <div className="add-user-form-container" onClick={(e) => e.stopPropagation()}>
              <div className="add-user-form" onClick={(e) => e.stopPropagation()}>
              <div className="form-header">
                <h3>{t('accountManagement.add_user_form.title')}</h3>
                  <button className="close-form-button" onClick={handleCancelAddUser}>&times;</button>
              </div>
                {message.text && (<div className={`message ${message.type}`}>{message.text}</div>)}
                {(newUser.role === 'Tech Officer' || newUser.role === 'Admin') && (
                  <div className="form-role-notice">
                    <div className="role-notice-icon">ℹ️</div>
                    <div className="role-notice-content">
                      <strong>{newUser.role === 'Tech Officer' ? t('accountManagement.add_user_form.tech_officer_notice_title') : 'Adding a New Admin Account Notice:'}</strong>
                      {newUser.role === 'Tech Officer' ? (
                        <p>{t('accountManagement.add_user_form.tech_officer_notice')}</p>
                      ) : (
                        <p>{
                          isAdminUser 
                            ? 'New Admin accounts are set to Inactive. The Admin must verify their email upon first login to activate the account. Until then, the status will remain Inactive.'
                            : 'New Admin accounts are set to Inactive. The new Admin must verify their email upon first login to activate the account. Until then, the status will remain Inactive.'
                        }</p>
                      )}
                    </div>
                  </div>
                )}
                {newUser.role === 'Temporary Tech Officer' && (
                  <div className="form-role-notice">
                    <div className="role-notice-icon">⚠️</div>
                    <div className="role-notice-content">
                      {ttoCreationMode === 'reuse' ? (
                        <>
                          <strong>{t('accountManagement.add_user_form.tto_reuse_notice_title')}</strong>
                          <p>{t('accountManagement.add_user_form.tto_reuse_notice_body')}</p>
                        </>
                      ) : (
                        <>
                          <strong>{t('accountManagement.add_user_form.tto_create_notice_title')}</strong>
                          <p>{t('accountManagement.add_user_form.tto_create_notice_body1')}</p>
                          <p>{t('accountManagement.add_user_form.tto_create_notice_body2')}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {newUser.role === 'Fish Farmer' && (
                  <div className="form-role-notice">
                    <div className="role-notice-icon">ℹ️</div>
                    <div className="role-notice-content">
                      <strong>Fish Farmer account requires admin activation</strong>
                      <p>After creating this user, an Admin must activate the account before it can log in.</p>
                    </div>
                  </div>
                )}
              {showManualFields && !(newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'reuse') && (
              <div className="form-row">
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.username_label')}</label>
                  <input 
                    type="text" 
                    name="username" 
                    value={newUser.username} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                                          placeholder={t('accountManagement.add_user_form.username_placeholder')}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.full_name_label')}</label>
                  <input 
                    type="text" 
                    name="fullName" 
                    value={newUser.fullName} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                                          placeholder={t('accountManagement.add_user_form.full_name_placeholder')}
                    required 
                  />
                </div>
              </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.job_position_label')}</label>
                  <select 
                    name="role" 
                    value={newUser.role} 
                    onChange={handleInputChange}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    required
                  >
                      <option value="">{t('accountManagement.add_user_form.select_position_option')}</option>
                      {currentUser?.farm ? (
                        // Farm-assigned Admins: only Fish Farmer
                        <option value="Fish Farmer">{t('accountManagement.add_user_form.fish_farmer_option')}</option>
                      ) : (
                        // Super Admins (no farm): Admin, Tech Officer (if not yet created), and Temporary Tech Officer (only if there's a Tech Officer)
                        <>
                          <option value="Admin">{t('accountManagement.add_user_form.admin_option')}</option>
                          {!hasTechOfficer && (
                            <option value="Tech Officer">{t('accountManagement.add_user_form.tech_officer_option')}</option>
                          )}
                          {hasTechOfficer && (
                            <option 
                              value="Temporary Tech Officer" 
                              disabled={hasActiveTTO}
                            >
                              {hasActiveTTO ? t('accountManagement.add_user_form.temp_tech_officer_option_already_active') : t('accountManagement.add_user_form.temp_tech_officer_option')}
                            </option>
                          )}
                        </>
                      )}
                  </select>
                </div>
                
                {/* TTO Creation Mode Selection */}
                {newUser.role === 'Temporary Tech Officer' && (
                  <div className="form-group" style={{ width: '100%' }}>
                    <label>{t('accountManagement.add_user_form.tto_creation_mode_label')}</label>
                    <select
                      name="ttoCreationMode"
                      value={ttoCreationMode}
                      onChange={(e) => setTtoCreationMode(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      required
                    >
                      <option value="">{t('accountManagement.add_user_form.tto_creation_mode_select')}</option>
                      <option value="reuse">{t('accountManagement.add_user_form.tto_creation_mode_reuse')}</option>
                      <option value="create">{t('accountManagement.add_user_form.tto_creation_mode_create')}</option>
                    </select>
                  </div>
                )}
                
                {/* For Temporary Tech Officer: reason and optional remarks */}
                {newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'create' && (
                  <>
                    <div className="form-group" style={{ width: '100%' }}>
                      <label>{t('accountManagement.add_user_form.tto_reason_label')}</label>
                      <select
                        name="tempTOReason"
                        value={newUser.tempTOReason}
                        onChange={(e) => setNewUser(prev => ({ ...prev, tempTOReason: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        required
                      >
                        <option value="">{t('accountManagement.add_user_form.tto_reason_select')}</option>
                        <option value="Vacation Leave">{t('accountManagement.add_user_form.tto_reason_vacation')}</option>
                        <option value="Sick Leave">{t('accountManagement.add_user_form.tto_reason_sick')}</option>
                        <option value="Training / Seminar">{t('accountManagement.add_user_form.tto_reason_training')}</option>
                        <option value="Personal Emergency">{t('accountManagement.add_user_form.tto_reason_emergency')}</option>
                        <option value="Other">{t('accountManagement.add_user_form.tto_reason_other')}</option>
                      </select>
                    </div>
                    {(newUser.tempTOReason === 'Other') && (
                      <div className="form-group" style={{ width: '100%' }}>
                        <label>{t('accountManagement.add_user_form.tto_remarks_label')}</label>
                        <textarea
                          name="tempTORemarks"
                          value={newUser.tempTORemarks}
                          onChange={(e) => setNewUser(prev => ({ ...prev, tempTORemarks: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => e.stopPropagation()}
                          placeholder={t('accountManagement.add_user_form.tto_remarks_placeholder')}
                          rows={3}
                        />
                      </div>
                    )}
                  </>
                )}
                
                {/* Reuse Existing TTO Account */}
                {newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'reuse' && (
                  <>
                    <div className="form-group" style={{ width: '100%' }}>
                      <label>{t('accountManagement.add_user_form.tto_select_existing_label')}</label>
                      <div style={{ position: 'relative' }}>
                        <select
                          name="selectedExistingTTO"
                          value={newUser.selectedExistingTTO || ''}
                          onChange={(e) => setNewUser(prev => ({ ...prev, selectedExistingTTO: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => e.stopPropagation()}
                          required
                          style={{ 
                            width: '100%', 
                            padding: '8px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '14px',
                            backgroundColor: 'white'
                          }}
                        >
                          <option value="">{t('accountManagement.add_user_form.tto_select_existing_placeholder')}</option>
                          {AccountUsers
                            .filter(user => 
                              (String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) &&
                              String(user.status || '').toLowerCase() === 'inactive'
                            )
                            .map(user => {
                              // Format the dates for display
                              const formatDate = (dateString) => {
                                if (!dateString) return t('accountManagement.add_user_form.tto_no_dates');
                                const date = new Date(dateString);
                                return date.toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                });
                              };
                              
                              const fromDate = formatDate(user.effectiveFrom);
                              const toDate = formatDate(user.effectiveTo);
                              const lastUsed = user.effectiveFrom && user.effectiveTo ? 
                                `${fromDate}–${toDate}` : t('accountManagement.add_user_form.tto_no_dates');
                              const reason = user.tempTOReason || t('accountManagement.add_user_form.tto_no_reason');
                              
                              return (
                                <option key={user.id} value={user.id}>
                                  {user.username} — {t('accountManagement.add_user_form.tto_last_used')} {lastUsed} ({t('accountManagement.add_user_form.tto_reason')}: {reason})
                                </option>
                              );
                            })
                          }
                        </select>
                        {/* Display selected account details below the dropdown */}
                        {newUser.selectedExistingTTO && (() => {
                          const selectedUser = AccountUsers.find(user => user.id === newUser.selectedExistingTTO);
                          if (!selectedUser) return null;
                          
                          const formatDate = (dateString) => {
                            if (!dateString) return t('accountManagement.add_user_form.tto_no_dates');
                            const date = new Date(dateString);
                            return date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            });
                          };
                          
                          const fromDate = formatDate(selectedUser.effectiveFrom);
                          const toDate = formatDate(selectedUser.effectiveTo);
                          const lastUsed = selectedUser.effectiveFrom && selectedUser.effectiveTo ? 
                            `${fromDate}–${toDate}` : t('accountManagement.add_user_form.tto_no_dates');
                          const reason = selectedUser.tempTOReason || t('accountManagement.add_user_form.tto_no_reason');
                          
                          return (
                            <div style={{
                              marginTop: '8px',
                              padding: '8px 12px',
                              backgroundColor: '#f9fafb',
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px',
                              fontSize: '14px',
                              lineHeight: '1.4'
                            }}>
                              <div style={{ fontWeight: '500', color: '#374151' }}>
                                {selectedUser.username}
                              </div>
                              <div style={{ color: '#6b7280', fontSize: '13px' }}>
                                {t('accountManagement.add_user_form.tto_last_used')} {lastUsed}
                              </div>
                              <div style={{ color: '#6b7280', fontSize: '13px' }}>
                                ({t('accountManagement.add_user_form.tto_reason')}: {reason})
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{
                        fontSize: '0.8rem',
                        color: '#6b7280',
                        marginTop: '4px',
                        fontStyle: 'italic'
                      }}>
                        {t('accountManagement.add_user_form.tto_reuse_only_inactive_note')}
                      </div>
                    </div>
                    
                    {/* Reason for Reuse */}
                    <div className="form-group" style={{ width: '100%' }}>
                      <label>{t('accountManagement.add_user_form.tto_reason_label')}</label>
                      <select
                        name="tempTOReason"
                        value={newUser.tempTOReason}
                        onChange={(e) => setNewUser(prev => ({ ...prev, tempTOReason: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        required
                      >
                        <option value="">{t('accountManagement.add_user_form.tto_reason_select')}</option>
                        <option value="Vacation Leave">{t('accountManagement.add_user_form.tto_reason_vacation')}</option>
                        <option value="Sick Leave">{t('accountManagement.add_user_form.tto_reason_sick')}</option>
                        <option value="Training / Seminar">{t('accountManagement.add_user_form.tto_reason_training')}</option>
                        <option value="Personal Emergency">{t('accountManagement.add_user_form.tto_reason_emergency')}</option>
                        <option value="Other (Specify Below)">{t('accountManagement.add_user_form.tto_reason_other_specify')}</option>
                      </select>
                    </div>
                    
                    {/* Remarks for Reuse */}
                    {newUser.tempTOReason === 'Other (Specify Below)' && (
                      <div className="form-group" style={{ width: '100%' }}>
                        <label>{t('accountManagement.add_user_form.tto_remarks_label')}</label>
                        <textarea
                          name="tempTORemarks"
                          value={newUser.tempTORemarks}
                          onChange={(e) => setNewUser(prev => ({ ...prev, tempTORemarks: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => e.stopPropagation()}
                          placeholder={t('accountManagement.add_user_form.tto_remarks_placeholder')}
                          rows={3}
                        />
                      </div>
                    )}
                  </>
                )}
                
                  <div className="form-group">
                    <label>{t('accountManagement.add_user_form.status_label')}</label>
                    {(newUser.role === 'Tech Officer' || newUser.role === 'Admin' || newUser.role === 'Fish Farmer' || newUser.role === 'Temporary Tech Officer') ? (
                      <div className="tech-officer-status-display">
                        <div className="status-display-inactive">
                          <span className="status-indicator">
                            <span className="status-dot inactive"></span>
                            <span className="status-text inactive">{t('accountManagement.add_user_form.inactive_status')}</span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <select 
                        name="status" 
                        value={newUser.status} 
                        onChange={handleInputChange} 
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        required
                      >
                        <option value="Active">{t('accountManagement.add_user_form.active_option')}</option>
                        <option value="Inactive">{t('accountManagement.add_user_form.inactive_option')}</option>
                      </select>
                    )}
                  </div>
                </div>
              {showManualFields && !(newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'reuse') && (
              <div className="form-row">
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.email_label')}</label>
                  <input 
                    type="email" 
                    name="email" 
                    value={newUser.email} 
                    onChange={handleInputChange}  
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                                          placeholder={t('accountManagement.add_user_form.email_placeholder')}
                    className={errors.email ? 'input-error' : ''}
                  />
                </div>
              </div>
              )}
              {showManualFields && !(newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'reuse') && (
              <div className="form-row">
                {/* Conditional Farm Selector */}
                {!currentUser?.farm ? (
                  <div className="form-group" style={{ width: '100%' }}>
                    <label>Farm</label>
                    {(newUser.role === 'Tech Officer' || newUser.role === 'Temporary Tech Officer') ? (
                      <input type="text" value="No farm (global access)" readOnly />
                    ) : (
                      <select
                        name="farm"
                        value={selectedFarmId}
                        onChange={(e) => setSelectedFarmId(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        required
                      >
                        <option value="">Select farm</option>
                        {farms.map(f => (
                          <option key={f.id} value={f.id}>{f.name || f.id}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="form-group" style={{ width: '100%' }}>
                    <label>Farm</label>
                    <input type="text" value={assignedFarmName || currentUser.farm} readOnly />
                  </div>
                )}
              </div>
              )}
              {newUser.role === 'Temporary Tech Officer' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Effective Period (From)</label>
                    <input 
                      type="date" 
                      name="effectiveFrom" 
                      value={newUser.effectiveFrom} 
                      onChange={handleInputChange} 
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="form-group">
                    <label>Effective Period (To)</label>
                    <input 
                      type="date" 
                      name="effectiveTo" 
                      value={newUser.effectiveTo} 
                      onChange={handleInputChange} 
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
              {showManualFields && !(newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'reuse') && (
              <div className="form-row">
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.address_label')}</label>
                  <input 
                    type="text" 
                    name="address" 
                    value={newUser.address} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                                          placeholder={t('accountManagement.add_user_form.address_placeholder')}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.contact_number_label')}</label>
                  <input 
                    type="text" 
                    name="contactNumber" 
                    value={newUser.contactNumber} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                                          placeholder={t('accountManagement.add_user_form.contact_number_placeholder')}
                  />
                </div>
              </div>
              )}
              {showManualFields && !(newUser.role === 'Temporary Tech Officer' && ttoCreationMode === 'reuse') && (
              <div className="form-row">
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.password_label')}</label>
                  <input 
                    type="password" 
                    name="password" 
                    value={newUser.password} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                                          placeholder={t('accountManagement.add_user_form.password_placeholder')}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>{t('accountManagement.add_user_form.date_joined_label')}</label>
                  <input 
                    type="date" 
                    name="dateJoined" 
                    value={newUser.dateJoined} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              )}
              <div className="form-buttons">
                  <button 
                    className="add-button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddUser();
                    }}
                  >
                  {t('accountManagement.add_user_form.add_user_button')}
                </button>
                  <button 
                    className="cancel-button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelAddUser();
                    }}
                  >
                    {t('accountManagement.add_user_form.cancel_button')}
                  </button>
                </div>
              </div>
            </div>
          )}

        <div className="user-grid-container">
            {AccountUsers.length === 0 ? (
              <div className="loading-users-message">{t('accountManagement.user_list.no_users_message', 'Loading user accounts...')}</div>
            ) : paginatedUsers.length > 0 ? (
            <>
                <div className="user-table" key={`table-${currentPage}-${startIndex}`} onClick={closeAllDropdowns}>
                  {paginatedUsers.slice(0, PAGE_SIZE)
                  .filter(user => user && user.username)
                    .map((user, index) => {
                      const reactKey = `${user._collection || 'users'}:${user.id || user.email || user.username || index}`;
                      if (!user.id && !user.email && !user.username) {
                        
                      }
                      return (
                      <div key={reactKey} className="user-row">
                        <div className="user-cell checkbox-cell">
                          <input 
                            type="checkbox" 
                            className="user-checkbox"
                            checked={selectedUsers.has(user.id)}
                            onChange={(e) => {
                              e.stopPropagation(); // Prevent closing dropdowns when clicking checkbox
                              handleUserSelection(user.id, e.target.checked);
                            }}
                          />
                        </div>
                        <div className="user-cell name-cell" data-label="User">
                          <div className="user-info">
                            {user.profileImage ? (
                              <img src={user.profileImage} alt={`${user.username}'s profile`} className="user-avatar" />
                            ) : (
                              <FaUserCircle className="user-avatar-icon" />
                            )}
                            <div className="account-management-user-details">
                              <div className="account-management-username">{user.username}</div>
                              <div className="account-management-user-email">{user.email || t('accountManagement.user_list.no_email')}</div>
                            </div>
                      </div>
                        </div>
                        <div className="user-cell role-cell" data-label="Role">
                          {(() => {
                            const roleDisplayValue = formatRoleForDisplay(user.role);
                            const roleClassValue = (roleDisplayValue || '')
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/(^-|-$)/g, '');
                            const isTempTO = String(user.role || '').toLowerCase() === 'temp_tech_officer' || !!user.temporaryTechOfficer;
                            const isDeactivated = String(user.status || '').toLowerCase() === 'inactive';
                            
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <span className={`role-badge role-${roleClassValue}`} style={isTempTO ? { whiteSpace: 'pre-line', color: '#000' } : undefined}>
                                  {isTempTO ? (<><span>Temporary</span><br /><span>Tech Officer</span></>) : (roleDisplayValue || t('accountManagement.user_list.no_role'))}
                              </span>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="user-cell farm-cell" data-label="Farm">
                          {(String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) ? (
                            <div>
                              <div>
                                {(user.tempAssignedFarmName || user.tempAssignedFarm || user.farmName || user.farm || 'N/A')}
                              </div>
                              {ttoTimers[user.id] && String(user.status || '').toLowerCase() === 'active' && (
                                <div style={{ 
                                  marginTop: 4, 
                                  fontSize: '0.75rem',
                                  color: getTimerStatusColor(ttoTimers[user.id].status),
                                  fontWeight: 'bold',
                                  lineHeight: '1.2'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>🕒</span>
                                    <span>{formatRemainingTime(ttoTimers[user.id].remaining)}</span>
                                  </div>
                                  <div style={{ 
                                    fontSize: '0.7rem', 
                                    fontWeight: 'normal', 
                                    color: '#6b7280',
                                    marginTop: '2px'
                                  }}>
                                    {formatFullExpirationDetails(user, ttoTimers[user.id])}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            user.farmName || farmIdToName[user.farmId] || farmIdToName[user.farm] || user.farmId || user.farm || 'N/A'
                          )}
                        </div>
                        <div className="user-cell status-cell" data-label="Status">
                          <div className="status-cell-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <div
                            className="status-indicator"
                              title={
                                (user.temporaryTechOfficer || String(user.role || '').toLowerCase() === 'temp_tech_officer')
                                  ? `Temporary Tech Officer - Use Deactivate TTO button to deactivate`
                                  : (canManageUsers && String(user.status || '').toLowerCase() === 'active') 
                                    ? `Click to deactivate this account (${user.username || user.email || 'User'})` 
                                    : (canManageUsers && String(user.status || '').toLowerCase() === 'inactive') 
                                      ? `Use the Activate button to activate this account (${user.username || user.email || 'User'})` 
                                      : undefined
                              }
                              aria-label={
                                (user.temporaryTechOfficer || String(user.role || '').toLowerCase() === 'temp_tech_officer')
                                  ? `Temporary Tech Officer - Use Deactivate TTO button to deactivate`
                                  : (canManageUsers && String(user.status || '').toLowerCase() === 'active') 
                                    ? `Click to deactivate this account (${user.username || user.email || 'User'})` 
                                    : (canManageUsers && String(user.status || '').toLowerCase() === 'inactive') 
                                      ? `Use the Activate button to activate this account (${user.username || user.email || 'User'})` 
                                      : undefined
                              }
                              style={{ 
                                cursor: (canManageUsers && String(user.status || '').toLowerCase() === 'active' && !user.temporaryTechOfficer && String(user.role || '').toLowerCase() !== 'temp_tech_officer') 
                                  ? 'pointer' 
                                  : 'default' 
                              }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!canManageUsers) return;
                              // Disable deactivation for Temporary Tech Officer users
                              if (user.temporaryTechOfficer || String(user.role || '').toLowerCase() === 'temp_tech_officer') return;
                              const current = String(user.status || '').toLowerCase();
                              // Only allow deactivation via click. Activation must use the Activate button.
                              if (current !== 'active') return;
                              const nextStatus = 'Inactive';
                              try {
                                // Optimistic UI update
                                setAccountUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: nextStatus.toLowerCase() } : u));
                                const result = await serviceUpdateUserStatus(
                                  user.id,
                                  nextStatus,
                                  user.role,
                                  user.collection || undefined,
                                  user.email || undefined,
                                  user.username || undefined
                                );
                                if (!result?.success) {
                                  throw new Error(result?.error || 'Failed to update status');
                                }
                                setMessage({ text: `${user.username || user.email || 'User'} status updated to ${nextStatus}.`, type: 'success' });
                                try {
                                  const adminUser = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                                  logActivity('account', `Status set to ${nextStatus} for ${user.username || user.email || user.id}`, adminUser);
                                } catch (_) {}
                              } catch (error) {
                                // Revert UI on error
                                setAccountUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: current } : u));
                                setMessage({ text: `Failed to update status: ${error.message}`, type: 'error' });
                              }
                            }}
                          >
                            <span className={`status-dot ${user.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}></span>
                            <span className={`status-text ${user.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>{getStatusDisplay(user.status)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="user-cell contact-cell" data-label="Contact">
                          {user.contactNumber || t('accountManagement.user_list.no_contact')}
                        </div>
                        <div className="user-cell actions-cell" data-label="Actions">
                          {/* Show activate button for Tech Officers (including Temporary Tech Officers) - hide for deactivated TTOs */}
                          {(formatRoleForDisplay(user.role) === 'Tech Officer' || formatRoleForDisplay(user.role) === 'Temporary Tech Officer') && isInactive(user.status) && !(user.adminActivated || user._justActivated) && !(String(user.role || '').toLowerCase() === 'temp_tech_officer' && (user.deactivatedBy || user.deactivationReason)) ? (
                            <button className="activate-tech-officer-btn" onClick={(e) => {
                              e.stopPropagation(); // Prevent closing dropdowns when clicking activate button
                              closeAllDropdowns(); // Close all other dropdowns first
                              handleActivateTechOfficer(user);
                            }}>
                              <FaUserCheck className="action-icon" />
                              {t('accountManagement.user_list.activate_button')}
                            </button>
                          ) : null}
                          {formatRoleForDisplay(user.role) === 'Fish Farmer' && isInactive(user.status) ? (
                            <button className="activate-tech-officer-btn" onClick={(e) => {
                              
                              e.stopPropagation();
                              closeAllDropdowns();
                              handleActivateFishFarmer(user);
                            }}>
                              <FaUserCheck className="action-icon" />
                              {t('accountManagement.user_list.activate_button')}
                            </button>
                          ) : null}
                          {formatRoleForDisplay(user.role) === 'Admin' && isInactive(user.status) && (
                            (() => {
                              const isSelfRegistered = String(user.createdBy || '').toLowerCase() === 'self';
                              const canActivate = isSuperAdminUser || !isSelfRegistered;
                              // Show button to all Admins (per requirement), but disable if not allowed
                              return (
                                <TooltipWrapper
                                  showTooltip={!canActivate}
                                  tooltipText={isSelfRegistered ? 'Only Admins, Tech Officers, and Temporary Tech Officers can activate this account' : 'User must login first to auto-activate'}
                                >
                                  {canActivate ? (
                                    <button className="activate-tech-officer-btn" onClick={(e) => {
                                      e.stopPropagation();
                                      closeAllDropdowns();
                                      handleActivateAdmin(user);
                                    }}>
                                      <FaUserCheck className="action-icon" />
                                      {t('accountManagement.user_list.activate_button')}
                                    </button>
                                  ) : (
                                    <button className="activate-tech-officer-btn" disabled onClick={(e) => e.stopPropagation()}>
                                      <FaUserCheck className="action-icon" />
                                      {isSelfRegistered ? t('accountManagement.user_list.activate_button') : 'Login to activate'}
                                    </button>
                                  )}
                                </TooltipWrapper>
                              );
                            })()
                          )}
                          {(String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) && String(user.status || '').toLowerCase() === 'active' && isSuperAdminUser && (
                            <button 
                              className="deactivate-tto-btn" 
                              onClick={(e) => {
                                e.stopPropagation();
                                closeAllDropdowns();
                                handleManualDeactivateTTO(user);
                              }}
                              style={{
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <RiDeleteBin6Line className="action-icon" />
                              Deactivate TTO
                            </button>
                          )}
                          {String(user.status || '').toLowerCase() === 'active' && String(user.role || '').toLowerCase() !== 'temp_tech_officer' && !user.temporaryTechOfficer && !(currentUser && (currentUser.temporaryTechOfficer || String(currentUser.role || '').toLowerCase() === 'temp_tech_officer')) && (
                            <TooltipWrapper
                              showTooltip={!canManageUsers}
                              tooltipText="You don't have permission to do this"
                              onBlockedClick={() => setMessage({ text: "You don't have permission to reset passwords", type: 'error' })}
                            >
                              <button 
                                className="reset-password-btn" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!canManageUsers) return; // Block action for non-managers
                                  closeAllDropdowns();
                                  handleResetPassword(user);
                                }}
                                disabled={!canManageUsers || resettingPasswordUserId === user.id}
                              >
                                <MdOutlineLockReset className="action-icon" />
                                {resettingPasswordUserId === user.id ? 'Sending...' : t('accountManagement.user_list.reset_password_button')}
                              </button>
                              {resetNotices[user.id]?.text && (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    fontSize: '0.85rem',
                                    color: resetNotices[user.id].type === 'success' ? '#059669' : (resetNotices[user.id].type === 'error' ? '#b91c1c' : '#6b7280')
                                  }}
                                  role="status"
                                  aria-live="polite"
                                >
                                  {resetNotices[user.id].text}
                                </span>
                              )}
                            </TooltipWrapper>
                          )}
                          {/* Show deactivation message for Temporary Tech Officers when deactivated */}
        {(String(user.role || '').toLowerCase() === 'temp_tech_officer' || user.temporaryTechOfficer) && isInactive(user.status) && (user.deactivatedBy || user.deactivationReason) && (
                            <div className="password-reset-pending">
                              <span className="pending-indicator">
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: '#dc2626',
                backgroundColor: '#fef2f2',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #fecaca',
                display: 'inline-block',
                marginTop: '4px'
              }}>
                ⚠️ Account deactivated — access disabled.
              </span>
            </span>
          </div>
        )}
                          {/* Show status messages for main Tech Officers only */}
                          {formatRoleForDisplay(user.role) === 'Tech Officer' && String(user.role || '').toLowerCase() !== 'temp_tech_officer' && !user.temporaryTechOfficer && isInactive(user.status) && (user.adminActivated || user._justActivated) && (
                            <div className="password-reset-pending">
                              <span className="pending-indicator">
                                {(() => {
                                  // Show reason message for main Tech Officers when TTO is active
                                  const hasActiveTTO = AccountUsers.some(u => 
                                    (String(u.role || '').toLowerCase() === 'temp_tech_officer' || u.temporaryTechOfficer === true) && 
                                    String(u.status || '').toLowerCase() === 'active'
                                  );
                                  
                                  if (hasActiveTTO && user.temporarilyInactiveDueToTempTO && user.temporaryReplacementReason) {
                                    return (
                                      <span style={{
                                        fontSize: '0.95rem',
                                        fontWeight: 'bold',
                                        color: '#f59e0b',
                                        backgroundColor: '#fef3c7',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #fbbf24',
                                        display: 'inline-block',
                                        marginTop: '4px'
                                      }}>
                                        ℹ️ Reason: {user.temporaryReplacementReason}
                                      </span>
                                    );
                                  }
                                  
                                  // Show regular activation message for main Tech Officers
                                  return (user.emailVerified === true || String(user.emailVerified).toLowerCase() === 'true')
                                  && (user.phoneVerified === false || String(user.phoneVerified).toLowerCase() === 'false')
                                  ? t('accountManagement.user_list.activated_by_admin_otp_notice')
                                    : t('accountManagement.user_list.activated_by_admin_notice');
                                })()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="user-cell joined-cell" data-label="Joined">
                          {user.dateJoined ? new Date(user.dateJoined).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : t('accountManagement.user_list.unknown_date')}
                        </div>
                        {canManageUsers && (
                          <div className="user-cell delete-cell" data-label="Delete">
                            <button className="delete-user-btn" onClick={(e) => {
                              e.stopPropagation(); // Prevent closing dropdowns when clicking delete button
                              closeAllDropdowns(); // Close all other dropdowns first
                              handleDeleteUser(user);
                            }}>
                              <RiDeleteBin6Line className="action-icon" />
                              {t('accountManagement.user_list.delete_button') || 'Delete'}
                            </button>
                          </div>
                        )}
                      </div>
                    );})}
                </div>
                <div className="pagination-bar" onClick={closeAllDropdowns}>
                  <button
                    className="pagination-btn"
                    disabled={currentPage === 1}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent closing dropdowns when clicking pagination buttons
                      const newPage = Math.max(1, currentPage - 1);
                      setCurrentPage(newPage);
                    }}
                  >
                    {t('accountManagement.pagination.prev_button')}
                  </button>
                  {currentPage > 1 && (
                    <div className="pagination-pages">
                      <span className="pagination-page active">{currentPage}</span>
                    </div>
                  )}
                  <button
                    className="pagination-btn"
                    disabled={currentPage === totalPages}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent closing dropdowns when clicking pagination buttons
                      if (!showPageNumbers) setShowPageNumbers(true);
                      const newPage = Math.min(totalPages, currentPage + 1);
                      setCurrentPage(newPage);
                    }}
                  >
                    {t('accountManagement.pagination.next_button')}
                  </button>
                </div>
              {selectedUser && (
                <UserPopup
                  user={selectedUser}
                  onClose={() => setSelectedUser(null)}
                  onUpdate={(updatedUser) => {
                    setSelectedUser(updatedUser);
                      setAccountUsers(prev => prev.map(u => u.username === updatedUser.username ? updatedUser : u));
                  }}
                  currentUser={currentUser}
                />
              )}
            </>
          ) : (
              <div className="loading-users-message">
                {AccountUsers.length > 0 ? 
                  t('accountManagement.user_list.no_users_match_filter', 'No users match the current filter') : 
                  t('accountManagement.user_list.loading_message', 'Loading User Accounts...')
                }
              </div>
          )}
      </div>
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="delete-confirm-modal-overlay" onClick={() => setShowDeleteConfirmModal(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <h3>Confirm Deletion</h3>
              <button 
                className="close-modal-btn" 
                onClick={() => setShowDeleteConfirmModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="delete-confirm-body">
              <p>{deleteConfirmData?.message}</p>
            </div>
            <div className="delete-confirm-actions">
              <button 
                className="cancel-btn" 
                onClick={() => setShowDeleteConfirmModal(false)}
              >
                Cancel
              </button>
              <button 
                className="confirm-delete-btn" 
                onClick={deleteConfirmData?.type === 'bulk' ? confirmBulkDelete : confirmDeleteUser}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountManagement;
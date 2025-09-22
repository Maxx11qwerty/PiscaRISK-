import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next'; // Add this import
import './AccountManagement.css';
import logo from './assets/images/PISCARISK_LOGO.png';
import { FaUserCircle,FaUser, FaSignOutAlt, FaUserPlus, FaSearch, FaBars, FaFilter, FaUserCheck } from 'react-icons/fa';
import { IoMdArrowDropdown } from "react-icons/io";
import { MdOutlineLockReset } from "react-icons/md";
import { RiDeleteBin6Line } from "react-icons/ri";
// removed export button icon
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import NotificationBox from './components/NotificationBox';
import UserPopup from './components/UserPopup';
import { fetchAllUsers, fetchLiveUserStatus as serviceFetchLiveUserStatus, activateTechOfficer as serviceActivateTechOfficer, activateFishFarmer as serviceActivateFishFarmer, deleteUserById as serviceDeleteUserById, checkUserLoginStatus as serviceCheckUserLoginStatus, forceLogoutUser as serviceForceLogoutUser } from './services/accountService';
import { exportAccountToPDF, prepareAccountCSVData, handleAccountCSVExport } from './utils/exportAccounts';
import Sidebar from './components/Sidebar';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { logActivity, logMessages } from './utils/logger';

const AccountManagement = () => {
  const { t } = useTranslation(); // Add translation hook
  const [isMobile, setIsMobile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [AccountUsers, setAccountUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { currentUser,createStaffAccount,isAdmin,isTechOfficer, handleLogout, activateAdminAccount, resetAdminPassword } = useContext(AuthContext);
  const [csvFilename, setCsvFilename] = useState('piscarisk_useraccounts.csv');
  const [errors, setErrors] = useState({ email: '' });
  const navigate = useNavigate();

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
  
  // Farms for assignment when creator has no assigned farm
  const [farms, setFarms] = useState([]); // { id, name }
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const farmIdToName = useMemo(() => {
    const map = {};
    for (const f of farms) {
      if (f && f.id) map[f.id] = f.name || f.id;
    }
    return map;
  }, [farms]);

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

  useEffect(() => {
  }, [currentUser]);
  
  // Load farms list and resolve assigned farm name (if any)
  useEffect(() => {
    const loadFarms = async () => {
      try {
        const snap = await getDocs(collection(db, 'farms'));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
        const sorted = list.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        setFarms(sorted);
      } catch (e) {

      }
    };

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

    loadFarms();
    resolveAssignedFarmName();
  }, [currentUser?.farm]);

  
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
  const isAdminUser = String(currentUser?.role || '').toLowerCase() === 'admin';

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

  const filteredUsers = AccountUsers.filter(user => {
    if (!user || !user.username) return false;
    
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
    
    // Special handling for role changes
    if (name === 'role') {
      const newStatus = (value === 'Tech Officer' || value === 'Admin' || value === 'Fish Farmer') ? 'Inactive' : 'Active';

      
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
    password: ''
  });

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
      status: 'Active' // Will be updated when role is selected
    });
  };

  const handleAddUser = async () => {
    try {
      if (!isAdminUser) {
        setMessage({ text: 'Only Admins can add new users', type: 'error' });
        return;
      }
      
      try { 
        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
        logActivity('account', `User creation attempted for ${newUser.username} (${newUser.role}) in Account Management`, u); 
      } catch (_) {}
      if (newUser.password.length < 6) {
        setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
        return;
      }
      if (!newUser.username || !newUser.role || !newUser.password || !newUser.email) {
        setMessage({ text: 'All fields are required', type: 'error' });
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(newUser.email)) {
        setMessage({ text: 'Please enter a valid email address', type: 'error' });
        return;
      }
      if (newUser.password.length < 8) {
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
      
      const allowedRoles = ['Admin', 'Tech Officer', 'Fish Farmer'];
      if (!allowedRoles.includes(newUser.role)) {
        setMessage({ text: 'Invalid role selected', type: 'error' });
        return;
      }

      setMessage({ text: 'Creating user...', type: 'info' });

      // Determine farm assignment
      const farmForNewUser = currentUser?.farm ? currentUser.farm : selectedFarmId;
      if (!currentUser?.farm && !farmForNewUser) {
        setMessage({ text: 'Please select a farm for the user', type: 'error' });
        return;
      }

      const enforcedStatus = (newUser.role === 'Admin' || newUser.role === 'Tech Officer' || newUser.role === 'Fish Farmer')
        ? 'Inactive'
        : newUser.status;

      const userData = {
        email: newUser.email,
        username: newUser.username,
        fullName: newUser.fullName,
        address: newUser.address,
        contactNumber: newUser.contactNumber,
        role: newUser.role,
        password: newUser.password,
        dateJoined: newUser.dateJoined,
        status: enforcedStatus,
        farm: farmForNewUser || null
      };



      // Directly call createStaffAccount without admin password modal
      const result = await createStaffAccount(userData);

      if (result.success) {
        setMessage({ text: `${newUser.role} ${newUser.username} created successfully!`, type: 'success' });
        try { 
          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
          logActivity('account', `User ${newUser.username} (${newUser.role}) created successfully in Account Management`, u); 
        } catch (_) {}
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
    try { 
      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      logActivity('account', `Add User form cancelled in Account Management`, u); 
    } catch (_) {}
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
    if (!isAdminUser) {
      setMessage({ text: 'Only Admins can add new users', type: 'error' });
      return;
    }
    const todayDate = getTodayDate();

    
    setNewUser({
      username: '',
      fullName: '',
      address: '',
      email: '',
      contactNumber: '',
      role: 'User',
      status: 'Active', // Default status
      dateJoined: todayDate,
      password: ''
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
      
      setMessage({ 
        text: `Password reset email sent successfully to ${user.username}! Check your email for reset instructions.`, 
        type: 'success' 
      });
      
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
      
      setMessage({ text: `Error: ${errorMessage}`, type: 'error' });
    } finally {
      setResettingPasswordUserId(null);
    }
  };



  // Function to activate Tech Officer accounts
  const handleActivateTechOfficer = async (user) => {
    if (formatRoleForDisplay(user.role) !== 'Tech Officer') {
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
        u.id === user.id ? { ...u, adminActivated: true, _justActivated: true } : u
      ));
      
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
    if (!isAdminUser) {
      setMessage({ text: 'Only Admins can delete users', type: 'error' });
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
    if (!isAdminUser) {
      setMessage({ text: 'Only Admins can bulk delete users', type: 'error' });
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

  const accountCSVData = prepareAccountCSVData(AccountUsers);



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
      <header className="account-header-bar">
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
          
          <NotificationBox />
          <div className="user-menu">
              <button onClick={(e) => {
                e.stopPropagation(); // Prevent closing dropdowns when clicking user menu
                closeAllDropdowns(); // Close all other dropdowns first
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
            try { 
              const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
              logActivity('account', `Filter menu ${isOpening ? 'opened' : 'closed'} in Account Management`, u); 
            } catch (_) {}
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
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('account', `Filter type changed to ${e.target.value} in Account Management`, u); 
                      } catch (_) {}
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
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('account', `Filter value changed to "${e.target.value}" in Account Management`, u); 
                        } catch (_) {}
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
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('account', `Filter applied in Account Management`, u); 
                      } catch (_) {}
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
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('account', `Filter cleared in Account Management`, u); 
                      } catch (_) {}
                    }}
                  >
                    {t('accountManagement.filters.clear_button')}
          </button>
        </div>
              </div>
            )}
            
            {isAdminUser ? (
              <button className="add-user-button" onClick={(e) => {
                e.stopPropagation(); // Prevent closing dropdowns when clicking add user button
                closeAllDropdowns(); // Close all other dropdowns first
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('account', `Add User form opened in Account Management`, u); 
                } catch (_) {}
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
            
            {isAdminUser && selectedUsers.size > 0 && (
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
        <div className="account-container">
        {isAdminUser && showAddUserForm && (
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
                      <strong>{newUser.role === 'Tech Officer' ? t('accountManagement.add_user_form.tech_officer_notice_title') : t('accountManagement.add_user_form.admin_notice_title')}</strong>
                      {newUser.role === 'Tech Officer' ? (
                        <p>{t('accountManagement.add_user_form.tech_officer_notice')}</p>
                      ) : (
                        <p>{t('accountManagement.add_user_form.admin_notice')}</p>
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
                                          <option value="Admin">{t('accountManagement.add_user_form.admin_option')}</option>
                      <option value="Tech Officer">{t('accountManagement.add_user_form.tech_officer_option')}</option>
                      <option value="Fish Farmer">{t('accountManagement.add_user_form.fish_farmer_option')}</option>
                  </select>
                </div>
                  <div className="form-group">
                    <label>{t('accountManagement.add_user_form.status_label')}</label>
                    {(newUser.role === 'Tech Officer' || newUser.role === 'Admin') ? (
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
              <div className="form-row">
                {/* Conditional Farm Selector */}
                {!currentUser?.farm ? (
                  <div className="form-group" style={{ width: '100%' }}>
                    <label>Farm</label>
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
                  </div>
                ) : (
                  <div className="form-group" style={{ width: '100%' }}>
                    <label>Farm</label>
                    <input type="text" value={assignedFarmName || currentUser.farm} readOnly />
                  </div>
                )}
              </div>
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
            {paginatedUsers.length > 0 ? (
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
                        <div className="user-cell name-cell">
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
                        <div className="user-cell role-cell">
                          {(() => {
                            const roleDisplayValue = formatRoleForDisplay(user.role);
                            const roleClassValue = (roleDisplayValue || '').toLowerCase().replace(' ', '-');
                            return (
                              <span className={`role-badge role-${roleClassValue}`}>
                                {roleDisplayValue || t('accountManagement.user_list.no_role')}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="user-cell farm-cell">
                          {user.farmName || farmIdToName[user.farmId] || farmIdToName[user.farm] || user.farmId || user.farm || 'N/A'}
                        </div>
                        <div className="user-cell status-cell">
                          <div className="status-indicator">
                            <span className={`status-dot ${user.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}></span>
                            <span className={`status-text ${user.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>{getStatusDisplay(user.status)}</span>
                          </div>
                        </div>
                        <div className="user-cell contact-cell">
                          {user.contactNumber || t('accountManagement.user_list.no_contact')}
                        </div>
                        <div className="user-cell actions-cell">
                          {formatRoleForDisplay(user.role) === 'Tech Officer' && isInactive(user.status) && !(user.adminActivated || user._justActivated) ? (
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
                          {String(user.status || '').toLowerCase() === 'active' && (
                            <button 
                              className="reset-password-btn" 
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent closing dropdowns when clicking reset password button
                                closeAllDropdowns(); // Close all other dropdowns first
                                handleResetPassword(user);
                              }}
                              disabled={resettingPasswordUserId === user.id}
                            >
                              <MdOutlineLockReset className="action-icon" />
                              {resettingPasswordUserId === user.id ? 'Sending...' : t('accountManagement.user_list.reset_password_button')}
                            </button>
                          )}
                          {formatRoleForDisplay(user.role) === 'Tech Officer' && isInactive(user.status) && (user.adminActivated || user._justActivated) && (
                            <div className="password-reset-pending">
                              <span className="pending-indicator">{t('accountManagement.user_list.activated_by_admin_notice')}</span>
                            </div>
                          )}
                        </div>
                        <div className="user-cell joined-cell">
                          {user.dateJoined ? new Date(user.dateJoined).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : t('accountManagement.user_list.unknown_date')}
                        </div>
                        {isAdminUser && (
                          <div className="user-cell delete-cell">
                            <button className="delete-user-btn" onClick={(e) => {
                              e.stopPropagation(); // Prevent closing dropdowns when clicking delete button
                              closeAllDropdowns(); // Close all other dropdowns first
                              handleDeleteUser(user);
                            }}>
                              <RiDeleteBin6Line className="action-icon" />
                              {t('accountManagement.user_list.delete_button')}
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
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('account', `Pagination: moved to page ${newPage} in Account Management`, u); 
                      } catch (_) {}
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
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('account', `Pagination: moved to page ${newPage} in Account Management`, u); 
                      } catch (_) {}
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
              <div className="loading-users-message">{t('accountManagement.user_list.loading_message')}</div>
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
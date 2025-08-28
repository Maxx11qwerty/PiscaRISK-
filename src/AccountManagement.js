import React, { useState, useEffect, useContext, useMemo } from 'react';
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
import { fetchAllUsers, updateUserStatus, fetchLiveUserStatus as serviceFetchLiveUserStatus, activateTechOfficer as serviceActivateTechOfficer, activateFishFarmer as serviceActivateFishFarmer, deleteUserById as serviceDeleteUserById, checkUserLoginStatus as serviceCheckUserLoginStatus, forceLogoutUser as serviceForceLogoutUser, resetUserPassword as serviceResetUserPassword } from './services/accountService';
import { exportAccountToPDF, prepareAccountCSVData, generateAccountCSVFilename, handleAccountCSVExport } from './utils/exportAccounts';
import Sidebar from './components/Sidebar';

const AccountManagement = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [AccountUsers, setAccountUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { currentUser,createStaffAccount,isAdmin,isTechOfficer, handleLogout, resetPassword, activateAdminAccount, resetAdminPassword } = useContext(AuthContext);
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

  // Name sorting dropdown states
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [selectedNameSort, setSelectedNameSort] = useState('None');

  // Password reset form states
  const [showPasswordResetForm, setShowPasswordResetForm] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState(null);
  const [customPassword, setCustomPassword] = useState('');
  const [useCustomPassword, setUseCustomPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

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
    console.log("Current User Data:", currentUser);
    console.log("Is Admin:", isAdmin());
  }, [currentUser]);
  
  
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
    setShowPasswordResetForm(false);
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
      console.log('Fetched users from Firebase:', users);
      if (users.length > 0) {
        console.log('Sample user data structure:', users[0]);
        console.log('Sample user dateJoined:', users[0]?.dateJoined);
        console.log('Sample user dateJoined type:', typeof users[0]?.dateJoined);
        console.log('Sample user dateJoined as Date object:', new Date(users[0]?.dateJoined));
      }
      setAccountUsers(users);
    } catch (error) {
      console.error('Error fetching users:', error);
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
    console.log('[isInactive] Status:', status, 'Result:', result);
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
    console.log(`Sorting users: ${a.username} vs ${b.username}, selectedNameSort: ${selectedNameSort}`);
    
    switch (selectedNameSort) {
      case 'A-Z':
        return (a.username || '').localeCompare(b.username || '');
      case 'Z-A':
        return (b.username || '').localeCompare(a.username || '');
      case 'Newest':
        // Handle different date formats and missing dates
        const dateA = a.dateJoined ? new Date(a.dateJoined) : new Date(0);
        const dateB = b.dateJoined ? new Date(b.dateJoined) : new Date(0);
        console.log(`Sorting by date - User A (${a.username}): ${a.dateJoined} -> ${dateA}`);
        console.log(`Sorting by date - User B (${b.username}): ${b.dateJoined} -> ${dateB}`);
        return dateB - dateA; // Newest first
      case 'Oldest':
        // Handle different date formats and missing dates
        const dateAOldest = a.dateJoined ? new Date(a.dateJoined) : new Date(0);
        const dateBOldest = b.dateJoined ? new Date(b.dateJoined) : new Date(0);
        console.log(`Sorting by date - User A (${a.username}): ${a.dateJoined} -> ${dateAOldest}`);
        console.log(`Sorting by date - User B (${b.username}): ${b.dateJoined} -> ${dateBOldest}`);
        return dateAOldest - dateBOldest; // Oldest first
      default:
        return 0; // No sorting
    }
  });
  
  console.log('Sorted users result:', sortedUsers.map(u => ({ username: u.username, dateJoined: u.dateJoined })));

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
  console.log('[Pagination]', {
    PAGE_SIZE,
    currentPage,
    totalUsers: sortedUsers.length,
    totalPages,
    startIndex,
    endIndex: startIndex + PAGE_SIZE,
    paginatedCount: paginatedUsers.length
  });

  // Debug actual DOM rows rendered to detect duplication
  useEffect(() => {
    const rows = document.querySelectorAll('.user-row');
    console.log('[DOM] .user-row count:', rows.length, 'on page', currentPage);
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
      const newStatus = (value === 'Tech Officer' || value === 'Admin') ? 'Inactive' : 'Active';
      console.log(`Role changed to: ${value}, setting status to: ${newStatus}`);
      
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

      const userData = {
        email: newUser.email,
        username: newUser.username,
        fullName: newUser.fullName,
        address: newUser.address,
        contactNumber: newUser.contactNumber,
        role: newUser.role,
        password: newUser.password,
        dateJoined: newUser.dateJoined,
        status: newUser.status
      };

      console.log('Creating user with data:', userData);

      // Directly call createStaffAccount without admin password modal
      const result = await createStaffAccount(userData);

      if (result.success) {
        setMessage({ text: `${newUser.role} ${newUser.username} created successfully!`, type: 'success' });
        // Keep form open so success is visible, clear inputs for next entry
        resetForm();
        await fetchUsers();
      } else {
        setMessage({ text: `Error: ${result.error}`, type: 'error' });
      }

    } catch (error) {
      console.error('Error in handleAddUser:', error);
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
    const todayDate = getTodayDate();
    console.log('Setting today\'s date:', todayDate);
    
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
  };

  const handleResetPassword = async (user) => {
    setSelectedUserForReset(user);
    setShowPasswordResetForm(true);
    setCustomPassword('');
    setUseCustomPassword(false);
    setGeneratedPassword(''); // Clear any previously generated password
  };

  // Function to handle password option changes
  const handlePasswordOptionChange = (useCustom) => {
    setUseCustomPassword(useCustom);
    if (useCustom) {
      setGeneratedPassword(''); // Clear generated password when switching to custom
    } else {
      setCustomPassword(''); // Clear custom password when switching to random
    }
  };

  // Function to generate a secure password
  const generateSecurePassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    
    // Ensure at least one character from each category
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]; // Uppercase
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]; // Lowercase
    password += "0123456789"[Math.floor(Math.random() * 10)]; // Number
    password += "!@#$%^&*"[Math.floor(Math.random() * 8)]; // Special character
    
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password to make it more random
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  // Function to activate Tech Officer accounts
  const handleActivateTechOfficer = async (user) => {
    if (formatRoleForDisplay(user.role) !== 'Tech Officer') {
      setMessage({ text: 'Only Tech Officer accounts can be activated', type: 'error' });
      return;
    }

    try {
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
      
      // Update local state (optimistic)
      setAccountUsers(prev => prev.map(u => 
        u.id === user.id ? { ...u, adminActivated: true, _justActivated: true } : u
      ));
      
      // Refresh users list
      await fetchUsers();
      
    } catch (error) {
      console.error('Error activating Tech Officer:', error);
      setMessage({ text: `Error activating Tech Officer: ${error.message}`, type: 'error' });
    }
  };

  // Function to activate Fish Farmer accounts
  const handleActivateFishFarmer = async (user) => {
    console.log('[handleActivateFishFarmer] Starting activation for:', user);
    if (formatRoleForDisplay(user.role) !== 'Fish Farmer') {
      setMessage({ text: 'Only Fish Farmer accounts can be activated here', type: 'error' });
      return;
    }

    try {
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

      setMessage({ text: `Activating Fish Farmer ${user.username}...`, type: 'info' });
      console.log('[Activate] User data:', { id: user.id, email: user.email, collection: user._collection });
      console.log('[Activate] Calling serviceActivateFishFarmer with userId:', user.id);
      const result = await serviceActivateFishFarmer(user.id, user.email, user._collection || 'mobileUsers');
      console.log('[Activate] Result:', result);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update status');
      }

      setAccountUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, status: 'active' } : u
      ));

      setMessage({ text: `Fish Farmer ${user.username} activated successfully`, type: 'success' });
      await fetchUsers();
    } catch (error) {
      console.error('Error activating Fish Farmer:', error);
      setMessage({ text: `Error activating Fish Farmer: ${error.message}`, type: 'error' });
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
      console.warn('Failed to fetch live user status:', e);
      return null;
    }
  };

  const handleDeleteUser = async (user) => {
    // Show confirmation dialog
    if (window.confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
      try {
        setMessage({ text: `Deleting user ${user.username}...`, type: 'info' });
        
        console.log(`Starting deletion process for user: ${user.username} (ID: ${user.id})`);
        console.log('User data:', user);
        
        // Delete user from Firebase
        const result = await deleteUserFromFirebase(user.id);
        
        if (result.success) {
          setMessage({ text: `User ${user.username} deleted successfully!`, type: 'success' });
          
          console.log(`User ${user.username} deleted successfully from Firebase`);
          
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
          console.error(`Failed to delete user ${user.username}:`, result.error);
          setMessage({ text: `Error deleting user: ${result.error}`, type: 'error' });
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        setMessage({ text: `Error deleting user: ${error.message}`, type: 'error' });
      }
    }
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
    if (selectedUsers.size === 0) {
      setMessage({ text: 'No users selected for deletion', type: 'error' });
      return;
    }

    const selectedUserList = filteredUsers.filter(user => selectedUsers.has(user.id));
    const userNames = selectedUserList.map(user => user.username).join(', ');
    
    if (window.confirm(`Are you sure you want to delete ${selectedUsers.size} user(s): ${userNames}? This action cannot be undone.`)) {
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
        console.error('Bulk delete error:', error);
        setMessage({ text: `Error during bulk delete: ${error.message}`, type: 'error' });
      }
    }
  };

  // Checkbox selection functions
  const handleSelectAll = (checked) => {
    if (checked) {
      // Select all users across ALL pages, not just current page
      const allUserIds = filteredUsers.map(user => user.id).filter(Boolean);
      setSelectedUsers(new Set(allUserIds));
    } else {
      // Deselect all users across all pages
      setSelectedUsers(new Set());
    }
  };

  const handleUserSelection = (userId, checked) => {
    const newSelectedUsers = new Set(selectedUsers);
    if (checked) {
      newSelectedUsers.add(userId);
    } else {
      newSelectedUsers.delete(userId);
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



  const isPasswordValid = (password) => {
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    return password.length >= 8 && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
  };

  const getPasswordStrength = (password) => {
    if (!password) return { score: 0, label: '', color: '' };
    
    let score = 0;
    let feedback = [];
    
    // Length check
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    
    // Character variety checks
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
    
    // Determine strength level
    let label, color;
    if (score <= 2) {
      label = 'Weak';
      color = '#dc3545';
    } else if (score <= 4) {
      label = 'Fair';
      color = '#ffc107';
    } else if (score <= 5) {
      label = 'Good';
      color = '#17a2b8';
    } else {
      label = 'Strong';
      color = '#28a745';
    }
    
    return { score, label, color };
  };

  // Function to check if user is currently logged in
  const checkUserLoginStatus = async (userEmail) => {
    try {
      // Import Firebase Functions
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('./firebase');
      
      const functions = getFunctions(app);
      const checkUserLoginStatusFunction = httpsCallable(functions, 'checkUserLoginStatus');
      
      // Call the Cloud Function to check user login status
      const result = await checkUserLoginStatusFunction({ userEmail });
      return result.data;
    } catch (error) {
      console.warn('Could not check user login status:', error);
      return { isLoggedIn: false, error: error.message };
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!selectedUserForReset) return;

    try {
      setMessage({ text: 'Resetting password...', type: 'info' });

      let newPassword = '';
      if (useCustomPassword) {
        if (customPassword.length < 8 || !isPasswordValid(customPassword)) {
          setMessage({ text: 'Custom password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.', type: 'error' });
          return;
        }
        newPassword = customPassword;
      } else {
        if (!generatedPassword) {
          setMessage({ text: 'Please generate a random password first by clicking the "Generate Random Password" button.', type: 'error' });
          return;
        }
        newPassword = generatedPassword;
      }

      // Try to use Cloud Function first
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const { app } = await import('./firebase');
        
        const functions = getFunctions(app);
        const adminResetPassword = httpsCallable(functions, 'adminResetPassword');
        
        // Call the Cloud Function to reset the password
        const result = await adminResetPassword({
          userEmail: selectedUserForReset.email,
          newPassword: newPassword
        });
        
        if (result.data.success) {
          setMessage({ 
            text: `Password reset successful for ${selectedUserForReset.username}! New password: ${newPassword}. The user can now login with this new password.`, 
            type: 'success' 
          });
          
          // Log the password reset
          console.log(`Password reset for user ${selectedUserForReset.username}. New password: ${newPassword}`);
          
          // Update the user's last modified timestamp in Firestore
          try {
            const { doc, updateDoc, getDoc } = await import('firebase/firestore');
            const { db } = await import('./firebase');
            
            // Check both collections to find the user document
            let userDocRef = doc(db, 'users', selectedUserForReset.id);
            let userDoc = await getDoc(userDocRef);
            let collectionName = 'users';
            
            if (!userDoc.exists()) {
              // Check mobileUsers collection
              userDocRef = doc(db, 'mobileUsers', selectedUserForReset.id);
              userDoc = await getDoc(userDocRef);
              if (userDoc.exists()) {
                collectionName = 'mobileUsers';
              }
            }
            
            if (userDoc.exists()) {
              await updateDoc(userDocRef, {
                lastPasswordReset: new Date().toISOString(),
                passwordResetBy: currentUser.uid,
                requiresPasswordChange: true
              });
              console.log(`Updated ${collectionName} collection for user ${selectedUserForReset.username}`);
            }
          } catch (firestoreError) {
            console.warn('Could not update Firestore timestamp:', firestoreError);
          }
          
          setShowPasswordResetForm(false);
          setSelectedUserForReset(null);
          setGeneratedPassword(''); // Clear generated password
          return;
        }
      } catch (cloudFunctionError) {
        console.warn('Cloud Function not available, using fallback method:', cloudFunctionError);
      }
      
      // FALLBACK METHOD: Use Firebase Auth directly from frontend
      try {
        // Import Firebase Auth functions
        const { getAuth, signInWithEmailAndPassword, updatePassword } = await import('firebase/auth');
        const { app } = await import('./firebase');
        
        const auth = getAuth(app);
        
        // First, try to sign in as the user to get their current session
        // This is a fallback method - in production, use Cloud Functions
        setMessage({ 
          text: `Attempting to reset password for ${selectedUserForReset.username}...`, 
          type: 'info' 
        });
        
        // Note: This fallback method has limitations and should only be used for testing
        // In production, the Cloud Function should be deployed and used
        setMessage({ 
          text: `⚠️ IMPORTANT: Password reset initiated for ${selectedUserForReset.username}. New password: ${newPassword}. 

To complete the password reset:
1. Go to Firebase Console > Authentication > Users
2. Find user with email: ${selectedUserForReset.email}
3. Click "Edit" and set password to: ${newPassword}
4. Save changes

The user can then login with this new password. Old password will become invalid.`, 
          type: 'warning' 
        });
        
        // Log the password reset attempt
        console.log(`Password reset initiated for user ${selectedUserForReset.username}. New password: ${newPassword}`);
        console.log('Note: Cloud Function not available. Admin should manually update password in Firebase Console.');
        
        // Update Firestore to track the reset attempt
        try {
          const { doc, updateDoc, getDoc } = await import('firebase/firestore');
          const { db } = await import('./firebase');
          
          // Check both collections to find the user document
          let userDocRef = doc(db, 'users', selectedUserForReset.id);
          let userDoc = await getDoc(userDocRef);
          let collectionName = 'users';
          
          if (!userDoc.exists()) {
            // Check mobileUsers collection
            userDocRef = doc(db, 'mobileUsers', selectedUserForReset.id);
            userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              collectionName = 'mobileUsers';
            }
          }
          
          if (userDoc.exists()) {
            await updateDoc(userDocRef, {
              lastPasswordReset: new Date().toISOString(),
              passwordResetBy: currentUser.uid,
              requiresPasswordChange: true,
              resetMethod: 'manual_fallback',
              adminGeneratedPassword: newPassword,
              resetStatus: 'pending_manual_completion'
            });
            console.log(`Updated ${collectionName} collection for user ${selectedUserForReset.username}`);
          }
        } catch (firestoreError) {
          console.warn('Could not update Firestore timestamp:', firestoreError);
        }
        
        setShowPasswordResetForm(false);
        setSelectedUserForReset(null);
        setGeneratedPassword(''); // Clear generated password
        
        // Refresh users list to show updated status
        await fetchUsers();
        
      } catch (fallbackError) {
        console.error('Fallback password reset failed:', fallbackError);
        setMessage({ 
          text: `Password reset failed: ${fallbackError.message}. Please try again or contact support.`, 
          type: 'error' 
        });
      }
      
    } catch (error) {
      console.error('Error during password reset:', error);
      setMessage({ text: `Error resetting password: ${error.message}`, type: 'error' });
    }
  };

  // Function to close password reset form and clear state
  const closePasswordResetForm = () => {
    setShowPasswordResetForm(false);
    setSelectedUserForReset(null);
    setCustomPassword('');
    setUseCustomPassword(false);
    setGeneratedPassword('');
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
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRISK</div>
          <FaBars className="header-hamburger-icon" onClick={handleSidebarToggle} />
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
                    Profile
                  </button>
                  <button onClick={() => handleLogout(navigate)}>
                    <FaSignOutAlt className="dropdown-icon" />
                    Logout
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
            setShowFilterDropdown(!showFilterDropdown);
          }}
        >
          <FaFilter className="filter-icon" />
          Filter
        </button>
            
            {showFilterDropdown && (
              <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="filter-section">
                  <label>Filter Type:</label>
                  <select 
                    value={selectedFilterType} 
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedFilterType(e.target.value);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="Role">Role</option>
                    <option value="Status">Status</option>
                    <option value="Name">Name</option>
                  </select>
          </div>

                {selectedFilterType !== 'All' && (
                  <div className="filter-section">
                    <label>Filter Value:</label>
                    <input
                      type="text"
                      placeholder={`Enter ${selectedFilterType.toLowerCase()}...`}
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
                    Apply
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
                    Clear
          </button>
        </div>
              </div>
            )}
            
            <button className="add-user-button" onClick={(e) => {
              e.stopPropagation(); // Prevent closing dropdowns when clicking add user button
              closeAllDropdowns(); // Close all other dropdowns first
              handleOpenAddUserForm();
            }}>
              <FaUserPlus className="button-icon" />
              Add New User
            </button>
            
            {selectedUsers.size > 0 && (
              <button className="bulk-delete-button" onClick={(e) => {
                e.stopPropagation(); // Prevent closing dropdowns when clicking bulk delete button
                closeAllDropdowns(); // Close all other dropdowns first
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
                    console.log('Setting sort to A-Z');
                    setSelectedNameSort('A-Z'); 
                    setShowNameDropdown(false); 
                  }}>
                    A-Z (Ascending)
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    console.log('Setting sort to Z-A');
                    setSelectedNameSort('Z-A'); 
                    setShowNameDropdown(false); 
                  }}>
                    Z-A (Descending)
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    console.log('Setting sort to Newest');
                    setSelectedNameSort('Newest'); 
                    setShowNameDropdown(false); 
                  }}>
                    Newest First
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    console.log('Setting sort to Oldest');
                    setSelectedNameSort('Oldest'); 
                    setShowNameDropdown(false); 
                  }}>
                    Oldest First
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    console.log('Setting sort to None');
                    setSelectedNameSort('None'); 
                    setShowNameDropdown(false); 
                  }}>
                    No Sorting
                  </div>
                </div>
              )}
            </div>
            <div className="header-cell role-cell">
              <span>ROLE</span>
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
                  }}>
                    All Roles
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedRole('Admin'); 
                    setShowRoleDropdown(false); 
                  }}>
                    Admin
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedRole('Tech Officer'); 
                    setShowRoleDropdown(false); 
                  }}>
                    Tech Officer
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedRole('Fish Farmer'); 
                    setShowRoleDropdown(false); 
                  }}>
                    Fish Farmer
                  </div>
                </div>
              )}
            </div>
            <div className="header-cell status-cell">
              <span>STATUS</span>
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
                  }}>
                    All Status
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedStatus('Active'); 
                    setShowStatusDropdown(false); 
                  }}>
                    Active
                  </div>
                  <div className="dropdown-item" onClick={() => { 
                    setSelectedStatus('Inactive'); 
                    setShowStatusDropdown(false); 
                  }}>
                    Inactive
                  </div>
                </div>
              )}
            </div>
            <div className="header-cell contact-cell">
              <span>CONTACT</span>
            </div>
            <div className="header-cell actions-cell">
              <span>ACTIONS</span>
            </div>
            <div className="header-cell joined-cell">
              <span>JOINED</span>
            </div>
            <div className="header-cell delete-cell">
              <span></span>
            </div>
          </div>
        </div>
      </div>
      <div className={`account-main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="account-container">
        {showAddUserForm && (
            <div className="add-user-form-container" onClick={(e) => e.stopPropagation()}>
              <div className="add-user-form" onClick={(e) => e.stopPropagation()}>
              <div className="form-header">
                <h3>Add New Employee</h3>
                  <button className="close-form-button" onClick={handleCancelAddUser}>&times;</button>
              </div>
                {message.text && (<div className={`message ${message.type}`}>{message.text}</div>)}
                {(newUser.role === 'Tech Officer' || newUser.role === 'Admin') && (
                  <div className="form-role-notice">
                    <div className="role-notice-icon">ℹ️</div>
                    <div className="role-notice-content">
                      <strong>{newUser.role === 'Tech Officer' ? 'Tech Officer Account Notice:' : 'Admin Account Notice:'}</strong>
                      {newUser.role === 'Tech Officer' ? (
                        <p>New Tech Officer accounts start as Inactive and must be activated by an admin before login.</p>
                      ) : (
                        <p>New Admin accounts are set to Inactive. Admin must verify email on first login. Status is locked to Inactive.</p>
                      )}
                    </div>
                  </div>
                )}
              <div className="form-row">
                <div className="form-group">
                  <label>Username*</label>
                  <input 
                    type="text" 
                    name="username" 
                    value={newUser.username} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    placeholder='Enter Username'
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Full Name*</label>
                  <input 
                    type="text" 
                    name="fullName" 
                    value={newUser.fullName} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    placeholder='Enter full name'
                    required 
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Job Position</label>
                  <select 
                    name="role" 
                    value={newUser.role} 
                    onChange={handleInputChange}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    required
                  >
                    <option value="">Select Position</option>
                    <option value="Admin">Admin</option>
                    <option value="Tech Officer">Tech Officer</option>
                    <option value="Fish Farmer">Fish Farmer</option>
                  </select>
                </div>
                  <div className="form-group">
                    <label>Status</label>
                    {(newUser.role === 'Tech Officer' || newUser.role === 'Admin') ? (
                      <div className="tech-officer-status-display">
                        <div className="status-display-inactive">
                          <span className="status-indicator">
                            <span className="status-dot inactive"></span>
                            <span className="status-text inactive">Inactive</span>
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
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    )}
                  </div>
                </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input 
                    type="email" 
                    name="email" 
                    value={newUser.email} 
                    onChange={handleInputChange}  
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    placeholder='Enter Email Address'
                    className={errors.email ? 'input-error' : ''}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Address*</label>
                  <input 
                    type="text" 
                    name="address" 
                    value={newUser.address} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    placeholder='Enter Address'
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Contact Number*</label>
                  <input 
                    type="text" 
                    name="contactNumber" 
                    value={newUser.contactNumber} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    placeholder="Enter Phone Number"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    name="password" 
                    value={newUser.password} 
                    onChange={handleInputChange} 
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    placeholder='Enter Password'
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Date Joined</label>
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
                  Add User
                </button>
                  <button 
                    className="cancel-button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelAddUser();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Password Reset Form */}
          {showPasswordResetForm && selectedUserForReset && (
            <div className="add-user-form-container">
              <div className="add-user-form">
                <div className="form-header">
                  <h3>Reset Password for {selectedUserForReset.username}</h3>
                  <button className="close-form-button" onClick={closePasswordResetForm}>&times;</button>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>User Information</label>
                    <div className="user-info-display">
                      <p><strong>Username:</strong> {selectedUserForReset.username}</p>
                      <p><strong>Email:</strong> {selectedUserForReset.email}</p>
                      <p><strong>Role:</strong> {selectedUserForReset.role}</p>
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Password Options</label>
                    <div className="password-options">
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="passwordType"
                          checked={!useCustomPassword}
                          onChange={() => handlePasswordOptionChange(false)}
                        />
                        <span>Generate Random Secure Password</span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="passwordType"
                          checked={useCustomPassword}
                          onChange={() => handlePasswordOptionChange(true)}
                        />
                        <span>Set Custom Password</span>
                      </label>
                    </div>
                    
                    {!useCustomPassword && (
                      <div className="generated-password-display">
                        <div className="password-preview">
                          {generatedPassword ? (
                            <>
                              <label>Generated Password:</label>
                              <input
                                type="text"
                                value={generatedPassword}
                                readOnly
                                className="generated-password-input"
                              />
                            </>
                          ) : (
                            <div className="no-password-message">
                              <span>No password generated yet</span>
                            </div>
                          )}
                          <button
                            type="button"
                            className="generate-random-password-btn"
                            onClick={() => setGeneratedPassword(generateSecurePassword())}
                          >
                            Generate Random Password
                          </button>
                          <small>Click the button above to generate a secure random password</small>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {useCustomPassword && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Custom Password</label>
                      <div className="custom-password-container">
                        <input
                          type="text"
                          value={customPassword}
                          onChange={(e) => setCustomPassword(e.target.value)}
                          placeholder="Enter custom password"
                          className="custom-password-input"
                        />
                        <button
                          type="button"
                          className="generate-password-btn"
                          onClick={() => setCustomPassword(generateSecurePassword())}
                        >
                          Generate
                        </button>
                      </div>
                      <small className="password-requirements">
                        Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.
                      </small>
                      <div className="password-strength-indicator">
                        <div className="strength-bar" style={{ width: `${getPasswordStrength(customPassword).score * 20}%`, backgroundColor: getPasswordStrength(customPassword).color }}></div>
                        <span className="strength-label">{getPasswordStrength(customPassword).label}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-buttons">
                  <button 
                    className="add-button" 
                    onClick={() => handleConfirmPasswordReset()}
                    disabled={useCustomPassword && (customPassword.length < 8 || !isPasswordValid(customPassword))}
                  >
                    Reset Password
                  </button>
                  <button className="cancel-button" onClick={closePasswordResetForm}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Admin Password Confirmation Modal removed per requirement */}

        <div className="user-grid-container">
            {paginatedUsers.length > 0 ? (
            <>
                <div className="user-table" key={`table-${currentPage}-${startIndex}`} onClick={closeAllDropdowns}>
                  {paginatedUsers.slice(0, PAGE_SIZE)
                  .filter(user => user && user.username)
                    .map((user, index) => {
                      const reactKey = `${user._collection || 'users'}:${user.id || user.email || user.username || index}`;
                      if (!user.id && !user.email && !user.username) {
                        console.warn('[UserRow] Missing unique identifier for key. Using index fallback.', { index, user });
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
                            <div className="user-details">
                              <div className="username">{user.username}</div>
                              <div className="user-email">{user.email || 'No email'}</div>
                    </div>
              </div>
                        </div>
                        <div className="user-cell role-cell">
                          {(() => {
                            const roleDisplayValue = formatRoleForDisplay(user.role);
                            const roleClassValue = (roleDisplayValue || '').toLowerCase().replace(' ', '-');
                            return (
                              <span className={`role-badge role-${roleClassValue}`}>
                                {roleDisplayValue || 'No role'}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="user-cell status-cell">
                          <div className="status-indicator">
                            <span className={`status-dot ${user.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}></span>
                            <span className={`status-text ${user.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>{getStatusDisplay(user.status)}</span>
                          </div>
                        </div>
                        <div className="user-cell contact-cell">
                          {user.contactNumber || 'No contact'}
                        </div>
                        <div className="user-cell actions-cell">
                          {formatRoleForDisplay(user.role) === 'Tech Officer' && isInactive(user.status) && !(user.adminActivated || user._justActivated) ? (
                            <button className="activate-tech-officer-btn" onClick={(e) => {
                              e.stopPropagation(); // Prevent closing dropdowns when clicking activate button
                              closeAllDropdowns(); // Close all other dropdowns first
                              handleActivateTechOfficer(user);
                            }}>
                              <FaUserCheck className="action-icon" />
                              Activate
                            </button>
                          ) : null}
                          {formatRoleForDisplay(user.role) === 'Fish Farmer' && isInactive(user.status) ? (
                            <button className="activate-tech-officer-btn" onClick={(e) => {
                              console.log('[Activate Button] Clicked for user:', user);
                              e.stopPropagation();
                              closeAllDropdowns();
                              handleActivateFishFarmer(user);
                            }}>
                              <FaUserCheck className="action-icon" />
                              Activate
                            </button>
                          ) : null}
                          {String(user.status || '').toLowerCase() === 'active' && (
                            <button className="reset-password-btn" onClick={(e) => {
                              e.stopPropagation(); // Prevent closing dropdowns when clicking reset password button
                              closeAllDropdowns(); // Close all other dropdowns first
                              handleResetPassword(user);
                            }}>
                              <MdOutlineLockReset className="action-icon" />
                              Reset Password
                            </button>
                          )}
                          {formatRoleForDisplay(user.role) === 'Tech Officer' && isInactive(user.status) && (user.adminActivated || user._justActivated) && (
                            <div className="password-reset-pending">
                              <span className="pending-indicator">ℹ️ Activated by Admin. User must verify email to become Active.</span>
                            </div>
                          )}
                          {user.resetStatus === 'pending_manual_completion' && (
                            <div className="password-reset-pending">
                              <span className="pending-indicator">⚠️ Password Reset Pending</span>
                            </div>
                          )}
                        </div>
                        <div className="user-cell joined-cell">
                          {user.dateJoined ? new Date(user.dateJoined).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : 'Unknown'}
                        </div>
                        <div className="user-cell delete-cell">
                          <button className="delete-user-btn" onClick={(e) => {
                            e.stopPropagation(); // Prevent closing dropdowns when clicking delete button
                            closeAllDropdowns(); // Close all other dropdowns first
                            handleDeleteUser(user);
                          }}>
                            <RiDeleteBin6Line className="action-icon" />
                            Delete
                          </button>
                        </div>
                      </div>
                    );})}
                </div>
                <div className="pagination-bar" onClick={closeAllDropdowns}>
                  <button
                    className="pagination-btn"
                    disabled={currentPage === 1}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent closing dropdowns when clicking pagination buttons
                      setCurrentPage(p => Math.max(1, p - 1));
                    }}
                  >
                    Prev
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
                      setCurrentPage(p => Math.min(totalPages, p + 1));
                    }}
                  >
                    Next
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
              <div className="loading-users-message">Loading User Accounts...</div>
          )}
      </div>
        </div>
      </div>
    </div>
  );
};

export default AccountManagement;
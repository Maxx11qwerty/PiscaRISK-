import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaEllipsisV, FaBars, FaSearch, FaUserCircle, FaUser, FaSignOutAlt, FaFilter } from 'react-icons/fa';
import logo from "./assets/images/PISCARISK_LOGO.png";
import NotificationBox from './components/NotificationBox';
import { getAllLogs } from './utils/logger';
import { exportLogs } from './utils/exportLogs';
import Sidebar from './components/Sidebar';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

import './Logs.css';

const Logs = () => {
  const { t } = useTranslation();
  const { currentUser, handleLogout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
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
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage, setLogsPerPage] = useState(25); // Default to 25 logs per page
  
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

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true);
        // Fetch logs from Firebase
        const logs = await getAllLogs();
        
        // Check for logs with invalid timestamps
        const logsWithInvalidTimestamps = logs.filter(log => !log.timestamp);
        if (logsWithInvalidTimestamps.length > 0) {
          console.warn(`Found ${logsWithInvalidTimestamps.length} logs with invalid timestamps:`, logsWithInvalidTimestamps);
        }
        
        setLogs(logs);
        setFilteredLogs(logs);
      } catch (error) {
        console.error('Error fetching logs:', error);
        setLogs([]);
        setFilteredLogs([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);
  

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
    
    if (searchTerm) {
      filtered = filtered.filter(log => {
        const message = log.message.toLowerCase();
        const username = log.username.toLowerCase();
        const category = log.category.toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();
        
        return message.includes(searchTermLower) ||
               username.includes(searchTermLower) ||
               category.includes(searchTermLower);
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
  }, [searchTerm, selectedCategory, logs, selectedFilterType, filterValue, currentUser?.farm, assignedFarmName]);

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
  const isAdminLike = () => {
    const role = String(currentUser?.role || '').toLowerCase();
    return role === 'super_admin' || role === 'superadmin' || role === 'admin';
  };

  // Allow row deletion regardless of log age; still require Admin/Super Admin
  const canDeleteLog = (log) => Boolean(isAdminLike() && log?.id);

  const deleteSingleLog = async (log) => {
    try {
      if (!canDeleteLog(log)) {
        setErrorMessage('Only Admin/Super Admin can delete logs older than 3 months.');
        setTimeout(() => setErrorMessage(''), 4000);
        return;
      }
      if (!window.confirm('Delete this log permanently?')) return;
      setDeletingLogId(log.id);
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'systemLogs', log.id));
      setLogs(prev => prev.filter(l => l.id !== log.id));
      setFilteredLogs(prev => prev.filter(l => l.id !== log.id));
    } catch (e) {
      setErrorMessage('Failed to delete log.');
      setTimeout(() => setErrorMessage(''), 4000);
    } finally {
      setDeletingLogId(null);
      setRowActionsOpenId(null);
    }
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

  // Role-based access for row actions
  const roleLower = String(currentUser?.role || '').toLowerCase();
  const isTemporaryTechOfficer = !!(currentUser?.temporaryTechOfficer || roleLower === 'temp_tech_officer');
  const isTechOfficer = roleLower === 'tech_officer' || roleLower === 'tech officer';
  const isAdmin = roleLower === 'admin';
  const isSuperAdmin = roleLower === 'super_admin' || (isAdmin && !currentUser?.farm);
  const isFarmAdmin = isAdmin && !!currentUser?.farm;
  // Visible for super admin (enabled), and visible but disabled for farm admin / tech officer / temp tech officer
  const shouldShowRowActions = isSuperAdmin || isFarmAdmin || isTechOfficer || isTemporaryTechOfficer;

  return (
    <div className="logs">
      <header className="logs-header-bar">
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
              placeholder={t('common.search')}
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

      <div className={`add-user-button-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} onClick={() => {
        closeAllDropdowns();
        closeSidebar();
      }}>
        {/* Filter Button */}
        <button 
          className="logs-filter-button"
          onClick={(e) => {
            e.stopPropagation();
            setShowFilterDropdown(!showFilterDropdown);
          }}
        >
          <FaFilter className="filter-icon" />
          {t('logs.filter_button')}
        </button>
        
        {showFilterDropdown && (
          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="logs-filter-section">
              <label>{t('logs.filter_type_label')}</label>
              <select 
                value={selectedFilterType} 
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedFilterType(e.target.value);
                }}
              >
                <option value="All">{t('logs.all_option')}</option>
                <option value="Category">{t('logs.category_option')}</option>
                <option value="Username">{t('logs.username_option')}</option>
                <option value="Message">{t('logs.message_option')}</option>
              </select>
            </div>

            {selectedFilterType !== 'All' && (
              <div className="logs-value-section">
                <label>{t('logs.filter_value_label')}</label>
                <input
                  type="text"
                  placeholder={t('logs.enter_filter_placeholder', { filterType: selectedFilterType })}
                  value={filterValue}
                  onChange={(e) => {
                    e.stopPropagation();
                    setFilterValue(e.target.value);
                  }}
                  className="filter-input"
                />
              </div>
            )}
            
            <div className="logs-filter-actions">
              <button 
                className="logs-apply-filter-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(false);
                }}
              >
                {t('logs.apply_button')}
              </button>
              <button 
                className="logs-clear-filter-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFilterType('All');
                  setFilterValue('');
                  setShowFilterDropdown(false);
                }}
              >
                {t('logs.clear_button')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`logs-manage-wrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="logs-table-header" onClick={() => {
          closeAllDropdowns();
          closeSidebar();
        }}>
          <div className="logs-header-row">
            <div className="header-cell time-cell">
              <span>{t('logs.table_headers.timestamp')}</span>
            </div>
            <div className="header-cell performed-cell">
              <span>{t('logs.table_headers.performed_by')}</span>
            </div>
            <div className="header-cell actions-cell">
              <span>{t('logs.table_headers.actions')}</span>
            </div>
            <div className="header-cell target-cell">
              <span>{t('logs.table_headers.action_target')}</span>
            </div>
            <div className="header-cell source-cell">
              <span>{t('logs.table_headers.source')}</span>
            </div>
          </div>
        </div>
        
        {/* Pagination Controls */}
        <div className="logs-pagination-controls">
          <div className="pagination-info">
            <span>{t('logs.pagination.showing_logs', { 
              start: indexOfFirstLog + 1, 
              end: Math.min(indexOfLastLog, filteredLogs.length), 
              total: filteredLogs.length 
            })}</span>
          </div>
          
          <div className="pagination-settings">
            <label>{t('logs.pagination.logs_per_page_label')}</label>
            <select 
              value={logsPerPage} 
              onChange={(e) => handleLogsPerPageChange(Number(e.target.value))}
              className="logs-per-page-select"
            >
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
          
          <div className="pagination-navigation">
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
            
            <span className="page-numbers">
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
                    className={`pagination-btn page-number ${currentPage === pageNum ? 'active' : ''}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </span>
            
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

      <div className={`logs-main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} onClick={() => {
        closeAllDropdowns();
        closeSidebar();
      }}>
        <div className="logs-container">
          <div className="logs-list">
            {isLoading ? (
              <div className="loading-logs">{t('logs.loading_message')}</div>
            ) : currentLogs.length > 0 ? (
              currentLogs.map((log, index) => (
                <div key={index} className="log-row" onClick={(e) => e.stopPropagation()}>
                  <div className="log-cell timestamp-cell">
                    <div className="timestamp-display">
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
                  </div>
                  <div className="log-cell performed-by-cell">
                    <div className="logs-user-info">
                      <div className="username">{log.username}</div>
                      {log.role && log.role !== 'Unknown' && (
                        <div className="user-role">
                          {log.role === 'temp_tech_officer' ? 'Temporary Tech Officer' : 
                           log.role === 'tech_officer' ? 'Tech Officer' :
                           log.role === 'super_admin' ? 'Super Admin' :
                           log.role === 'admin' ? 'Admin' :
                           log.role}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="log-cell actions-cell">
                    <span className={`log-type ${log.category}`}>{log.category}</span>
                  </div>
                  <div className="log-cell action-target-cell">
                    <div className="log-message">{log.message}</div>
                  </div>
                  <div className="log-cell source-cell" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span className={`source-badge ${getSourceType(log)}`}>
                      {getSourceType(log)}
                    </span>
                    {shouldShowRowActions && (
                      <>
                        <button
                          className="row-actions-button"
                          title={isSuperAdmin ? 'Actions' : 'Actions (disabled)'}
                          onClick={(e) => { if (!isSuperAdmin) return; e.stopPropagation(); setRowActionsOpenId(prev => prev === log.id ? null : log.id); }}
                          disabled={!isSuperAdmin}
                          style={{ background: 'transparent', border: 'none', cursor: isSuperAdmin ? 'pointer' : 'not-allowed', color: isSuperAdmin ? '#6b7280' : '#9ca3af', marginLeft: 6 }}
                        >
                          <FaEllipsisV />
                        </button>
                        {isSuperAdmin && rowActionsOpenId === log.id && (
                          <div className="row-actions-menu" style={{ position: 'absolute', right: 8, top: 24, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: 240, overflow: 'hidden', zIndex: 5 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteSingleLog(log); }}
                              disabled={deletingLogId === log.id}
                              style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer', color: '#111827' }}
                            >
                              {deletingLogId === log.id ? 'Deleting…' : 'Delete this log'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-logs">{t('logs.no_logs_found')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Logs;
 
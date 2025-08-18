import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaEllipsisV, FaBars, FaSearch, FaUserCircle, FaUser, FaSignOutAlt, FaFilter } from 'react-icons/fa';
import logo from "./assets/images/PISCARISK_LOGO.png";
import NotificationBox from './components/NotificationBox';
import { getAllLogs } from './utils/logger';
import { exportLogs } from './utils/exportLogs';
import Sidebar from './components/Sidebar';

import './Logs.css';

const Logs = () => {
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
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage, setLogsPerPage] = useState(25); // Default to 25 logs per page
  
  // Close dropdowns helper to match AccountManagement header behavior
  const closeAllDropdowns = () => {
    setShowMenu(false);
    setShowDownloadOptions(false);
    setShowFilterDropdown(false);
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
  }, [searchTerm, selectedCategory, logs, selectedFilterType, filterValue]);

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

  const categories = [
    { id: 'all', label: 'All Logs' },
    { id: 'login', label: 'Login' },
    { id: 'logout', label: 'Logout' },
    { id: 'profile', label: 'Profile' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'error', label: 'Error' },
    { id: 'account', label: 'Account' },
    { id: 'reward', label: 'Reward' },
    { id: 'export', label: 'Export' },
    { id: 'report', label: 'Reports' }
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

  return (
    <div className="logs">
      <header className="logs-header-bar">
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
        onAccountManagementClick={() => navigate('/AccountManagement')}
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
          Filter
        </button>
        
        {showFilterDropdown && (
          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="logs-filter-section">
              <label>Filter Type:</label>
              <select 
                value={selectedFilterType} 
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedFilterType(e.target.value);
                }}
              >
                <option value="All">All</option>
                <option value="Category">Category</option>
                <option value="Username">Username</option>
                <option value="Message">Message</option>
              </select>
            </div>

            {selectedFilterType !== 'All' && (
              <div className="logs-value-section">
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
            
            <div className="logs-filter-actions">
              <button 
                className="logs-apply-filter-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(false);
                }}
              >
                Apply
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
                Clear
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
              <span>TIMESTAMP</span>
            </div>
            <div className="header-cell performed-cell">
              <span>PERFORMED BY</span>
            </div>
            <div className="header-cell actions-cell">
              <span>ACTIONS</span>
            </div>
            <div className="header-cell target-cell">
              <span>ACTION TARGET</span>
            </div>
            <div className="header-cell source-cell">
              <span>SOURCE</span>
            </div>
          </div>
        </div>
        
        {/* Pagination Controls */}
        <div className="logs-pagination-controls">
          <div className="pagination-info">
            <span>Showing {indexOfFirstLog + 1}-{Math.min(indexOfLastLog, filteredLogs.length)} of {filteredLogs.length} logs</span>
          </div>
          
          <div className="pagination-settings">
            <label>Logs per page:</label>
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
              First
            </button>
            <button 
              onClick={() => handlePageChange(currentPage - 1)} 
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              Previous
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
              Next
            </button>
            <button 
              onClick={() => handlePageChange(totalPages)} 
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Last
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
              <div className="loading-logs">Loading logs...</div>
            ) : currentLogs.length > 0 ? (
              currentLogs.map((log, index) => (
                <div key={index} className="log-row">
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
                        <span style={{ color: '#dc3545', fontStyle: 'italic' }}>Invalid timestamp</span>
                      )}
                    </div>
                  </div>
                  <div className="log-cell performed-by-cell">
                    <div className="logs-user-info">
                      <div className="username">{log.username}</div>
                    </div>
                  </div>
                  <div className="log-cell actions-cell">
                    <span className={`log-type ${log.category}`}>{log.category}</span>
                  </div>
                  <div className="log-cell action-target-cell">
                    <div className="log-message">{log.message}</div>
                  </div>
                  <div className="log-cell source-cell">
                    <span className={`source-badge ${getSourceType(log)}`}>
                      {getSourceType(log)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-logs">No logs found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Logs;
 
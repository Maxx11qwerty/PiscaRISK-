import React from 'react';
import './Sidebar.css';
import { FaUserCircle, FaHome, FaClipboardList, FaComment, FaMoon, FaGlobe, FaFileExport, FaFilePdf, FaFileCsv } from 'react-icons/fa';
import { MdManageAccounts } from 'react-icons/md';

const Sidebar = ({
  sidebarOpen,
  sidebarCollapsed,
  currentUser,
  showDownloadOptions,
  setShowDownloadOptions,
  handleExport,
  onDashboardClick,
  onAccountManagementClick,
  onLogsClick,
  onFeedbackClick,
  nightMode,
  setNightMode,
  language,
  setLanguage,
}) => {
  // Determine which classes to apply based on screen size and state
  const getSidebarClasses = () => {
    const classes = ['sidebar-wrapper'];
    
    if (window.innerWidth <= 1023) {
      // Mobile/tablet: use sidebarOpen for slide in/out
      if (sidebarOpen) {
        classes.push('sidebarOpen');
      }
    } else {
      // Desktop: use sidebarCollapsed for width toggle
      if (sidebarCollapsed) {
        classes.push('collapsed');
      }
    }
    
    return classes.join(' ');
  };

  return (
    <div className={getSidebarClasses()}>
      <div className="sidebar-top">
        <div className="user-info">
          {currentUser?.profileImage ? (
            <img
              src={currentUser.profileImage}
              alt="Profile"
              className="profile-picture"
            />
          ) : (
            <FaUserCircle className="user-icon" />
          )}
          <div className="welcome-text">
            <h2>{currentUser?.username || 'User'}</h2>
            <span className="username">{currentUser?.username || 'User'}</span>
          </div>
        </div>
      </div>

      <aside className="sidebar">
        <div className="sidebar-main-nav">
          <div className="sidebar-buttons">
            <div className="sidebar-nav-item" onClick={onDashboardClick}>
              <FaHome className="sidebar-nav-icon" />
              <span>Dashboard</span>
            </div>
            <div className="sidebar-nav-item" onClick={onAccountManagementClick}>
              <MdManageAccounts className="sidebar-nav-icon" />
              <span>Accounts</span>
            </div>
            <div className="sidebar-nav-item" onClick={onLogsClick}>
              <FaClipboardList className="sidebar-nav-icon" />
              <span>Logs</span>
            </div>
            <div className="sidebar-nav-item" onClick={onFeedbackClick}>
              <FaComment className="sidebar-nav-icon" />
              <span>Feedback</span>
            </div>

            <div className="sidebar-export-container">
              <div
                className="sidebar-nav-item export-nav-item"
                onClick={() => setShowDownloadOptions(!showDownloadOptions)}
              >
                <FaFileExport className="sidebar-nav-icon" />
                <span>Export Data</span>
              </div>

              {showDownloadOptions && (
                <div className="sidebar-download-options">
                  <div
                    className="sidebar-download-option"
                    onClick={() => handleExport && handleExport('pdf')}
                  >
                    <FaFilePdf className="homeDLpdf-icon" />
                    <span>Export Data (PDF)</span>
                  </div>
                  <div
                    className="sidebar-download-option"
                    onClick={() => handleExport && handleExport('csv')}
                  >
                    <FaFileCsv className="homeDLcsv-icon" />
                    <span>Export Data (CSV)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-bottom-options">
          <div className="sidebar-nav-item" onClick={() => setLanguage(language === 'en' ? 'tl' : 'en')}>
            <FaGlobe className="sidebar-nav-icon" />
            <span>{language === 'en' ? 'Tagalog' : 'English'}</span>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  FaUserCircle, 
  FaHome, 
  FaClipboardList, 
  FaComment, 
  FaGlobe, 
  FaFileExport, 
  FaFilePdf, 
  FaFileCsv 
} from 'react-icons/fa';
import { MdManageAccounts } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import './Sidebar.css';

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
}) => {
  const { t, i18n } = useTranslation();
  const { language, setLanguage } = useLanguage();

  const formatRole = (role) => {
    if (!role) return 'User';
    const r = String(role).toLowerCase();
    if (r === 'tech_officer' || r === 'tech officer') return 'Tech Officer';
    if (r === 'fish_farmer' || r === 'fish farmer') return 'Fish Farmer';
    if (r === 'admin') return 'Admin';
    return role;
  };

  // Check if current user is Super Admin (role Admin and no farm assigned)
  const isSuperAdmin = (!currentUser?.farm) && (String(currentUser?.role || '').toLowerCase() === 'admin');

  // Update language when it changes
  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language, i18n]);

  const handleLanguageChange = () => {
    const newLanguage = language === 'en' ? 'tl' : 'en';
    setLanguage(newLanguage);
    i18n.changeLanguage(newLanguage);
  };

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
            <span className="sidebar-username" data-role={formatRole(currentUser?.role)}>
              {formatRole(currentUser?.role)}
            </span>
          </div>
        </div>
      </div>

      <aside className="sidebar">
        <div className="sidebar-main-nav">
          <div className="sidebar-buttons">
            <div className="sidebar-nav-item" onClick={onDashboardClick}>
              <FaHome className="sidebar-nav-icon" />
              <span>{t('sidebar.dashboard')}</span>
            </div>
            <div className="sidebar-nav-item" onClick={onAccountManagementClick}>
              <MdManageAccounts className="sidebar-nav-icon" />
              <span>{t('sidebar.accountManagement')}</span>
            </div>
            <div className="sidebar-nav-item" onClick={onLogsClick}>
              <FaClipboardList className="sidebar-nav-icon" />
              <span>{t('sidebar.logs')}</span>
            </div>
            {/* Feedback button - only visible to Super Admin */}
            {isSuperAdmin && (
              <div className="sidebar-nav-item" onClick={onFeedbackClick}>
                <FaComment className="sidebar-nav-icon" />
                <span>{t('sidebar.feedback')}</span>
              </div>
            )}

            <div className="sidebar-export-container">
              <div
                className="sidebar-nav-item export-nav-item"
                onClick={() => setShowDownloadOptions(!showDownloadOptions)}
              >
                <FaFileExport className="sidebar-nav-icon" />
                <span>{t('common.export')}</span>
              </div>

              {showDownloadOptions && (
                <div className="sidebar-download-options">
                  <div
                    className="sidebar-download-option"
                    onClick={() => handleExport && handleExport('pdf')}
                  >
                    <FaFilePdf className="homeDLpdf-icon" />
                    <span>{t('common.export')} (PDF)</span>
                  </div>
                  <div
                    className="sidebar-download-option"
                    onClick={() => handleExport && handleExport('csv')}
                  >
                    <FaFileCsv className="homeDLcsv-icon" />
                    <span>{t('common.export')} (CSV)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-bottom-options">
          <div className="sidebar-nav-item" onClick={handleLanguageChange}>
            <FaGlobe className="sidebar-nav-icon" />
            <span>{t(language === 'en' ? 'sidebar.english' : 'sidebar.tagalog' )}</span>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;

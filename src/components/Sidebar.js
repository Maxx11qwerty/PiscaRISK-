import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
import { useNotifications } from '../contexts/NotificationContext';
import './Sidebar.css';

const Sidebar = ({
  sidebarOpen,
  sidebarCollapsed,
  currentUser,
  showDownloadOptions,
  setShowDownloadOptions,
  onDropdownOpen,
  handleExport,
  onDashboardClick,
  onAccountManagementClick,
  onLogsClick,
  onFeedbackClick,
}) => {
  const { t, i18n } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { pendingActivations } = useNotifications();
  const location = useLocation();
  const currentPath = (location.pathname || '').toLowerCase();

  const isDashboardActive =
    currentPath === '/' ||
    currentPath === '/homepage';

  const isAccountManagementActive =
    currentPath === '/accountmanagement';

  const isLogsActive =
    currentPath === '/logs' ||
    currentPath.startsWith('/logs/');

  const isFeedbackActive =
    currentPath === '/feedback' ||
    currentPath.startsWith('/feedback/');

  const formatRole = (role) => {
    if (!role) return 'User';
    const r = String(role).toLowerCase();
    const hasFarm = !!(currentUser?.farm && String(currentUser.farm).trim() !== '');
    if (r === 'tech_officer' || r === 'tech officer') return 'Tech Officer';
    if (r === 'new_main_tech_officer' || r === 'new main tech officer') return 'Tech Officer';
    if (r === 'temp_tech_officer' || r === 'temporary tech officer') return 'Temporary Tech Officer';
    if (r === 'fish_farmer' || r === 'fish farmer') return 'Fish Farmer';
    if (r === 'admin') return hasFarm ? 'Farm Admin' : 'Admin';
    return role;
  };

  const getDisplayName = () => {
    if (!currentUser) return '';
    const fromProfile = (currentUser.username || currentUser.displayName || '').trim();
    if (fromProfile) return fromProfile;
    const email = String(currentUser.email || '').trim();
    if (email.includes('@')) return email.split('@')[0];
    return '';
  };

  // Check if current user is Super Admin (role Admin and no farm assigned)
  const isSuperAdmin = (!currentUser?.farm) && (String(currentUser?.role || '').toLowerCase() === 'admin');
  
  // Check if current user is Tech Officer, New Main Tech Officer, or Temporary Tech Officer
  const isTechOfficer = String(currentUser?.role || '').toLowerCase() === 'tech_officer' || String(currentUser?.role || '').toLowerCase() === 'tech officer';
  const isNewMainTechOfficer = String(currentUser?.role || '').toLowerCase() === 'new_main_tech_officer' || String(currentUser?.role || '').toLowerCase() === 'new main tech officer';
  const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
  const canAccessFeedback = isSuperAdmin || isTechOfficer || isNewMainTechOfficer || isTemporaryTechOfficer;

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
            <h2>{getDisplayName()}</h2>
            <span className="sidebar-username" data-role={formatRole(currentUser?.role)}>
              {formatRole(currentUser?.role)}
            </span>
          </div>
        </div>
      </div>

      <aside className="sidebar">
        <div className="sidebar-main-nav">
          <div className="sidebar-buttons">
            <div
              className={`sidebar-nav-item ${isDashboardActive ? 'active' : ''}`}
              onClick={onDashboardClick}
            >
              <FaHome className="sidebar-nav-icon" />
              <span>{t('sidebar.dashboard')}</span>
            </div>
            <div
              className={`sidebar-nav-item ${isAccountManagementActive ? 'active' : ''}`}
              onClick={onAccountManagementClick}
            >
              <div className="sidebar-nav-icon-container">
                <MdManageAccounts className="sidebar-nav-icon" />
                {pendingActivations > 0 && (
                  <span className="sidebar-notification-badge" title={`${pendingActivations} farmers awaiting activation`}>
                    {pendingActivations > 99 ? '99+' : pendingActivations}
                  </span>
                )}
              </div>
              <span>
                Account
                <br />
                Management
              </span>
            </div>
            <div
            className={`sidebar-nav-item ${isLogsActive ? 'active' : ''}`}
            onClick={onLogsClick}
            >
              <FaClipboardList className="sidebar-nav-icon" />
              <span>{t('sidebar.logs')}</span>
            </div>
            {/* Feedback button - visible to Super Admin, Tech Officer, and Temporary Tech Officer */}
            {canAccessFeedback && (
              <div
                className={`sidebar-nav-item ${isFeedbackActive ? 'active' : ''}`}
                onClick={onFeedbackClick}
              >
                <FaComment className="sidebar-nav-icon" />
                <span>{t('sidebar.feedback')}</span>
              </div>
            )}
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

import React, { useState, useEffect, useContext, useMemo } from "react";
import {FaUserCircle,FaImage,FaCloudSun,FaFish,
        FaExclamationTriangle,FaUser,FaDatabase,FaSignOutAlt,
        FaSearch,FaBars,FaCalendarAlt} from "react-icons/fa";
import { useTranslation } from 'react-i18next'; // Add this import
import logo from "./assets/images/PISCARISK_LOGO.png";
import { useNavigate, useLocation } from 'react-router-dom';
import "./Homepage.css";
import PondConditionDashboard from './components/PondConditionDashboard';
import { AuthContext } from './contexts/AuthContext';
import { fetchWeatherData } from './services/weatherService';
import { getTimeOfDay, getWeatherImage, getWeatherIcon } from './utils/weatherUtils';
import WeatherBox from './components/WeatherBox';
import WeatherDisplay from './components/WeatherDisplay';
import { exportBoxData } from './utils/exportBoxData';
import NotificationBox from './components/NotificationBox';
import ReportsChart from './components/ReportsChart';
import HarvestChart from './components/HarvestChart';
import PageTransition from './components/PageTransition';
import AnimatedModal from './components/AnimatedModal';
import PasswordChangeModal from './components/PasswordChangeModal';
import Sidebar from './components/Sidebar';
import RiskReportModal from './components/RiskReportModal';

// Import data from localStorage or use default values
const getInitialData = () => {
  return {
    users: JSON.parse(localStorage.getItem('users')) || [],
    rewards: JSON.parse(localStorage.getItem('rewards')) || [],
    AccountUsers: JSON.parse(localStorage.getItem('AccountUsers')) || [],
    feedbacks: JSON.parse(localStorage.getItem('feedbacks')) || []
  };
};

const PiscaRiskHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(); // Add translation hook
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: "",
    content: "",
    icon: null
  });
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [selectedPond, setSelectedPond] = useState(1);
  const { currentUser, handleLogout, checkPasswordChangeRequired, forcePasswordChange } = useContext(AuthContext);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [nightMode, setNightMode] = useState(false);
  const [language, setLanguage] = useState('en');
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [setPasswordChangeRequirements] = useState({
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true
  });

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
  
  const refreshWeather = async () => {
    setLoading(true);
    const data = await fetchWeatherData();
    setWeatherData(data);
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    refreshWeather();
  }, []);

  // Set initial sidebar state based on screen size
  useEffect(() => {
    const handleInitialState = () => {
      const width = window.innerWidth;
      const isStickyMobile = width >= 370 && width <= 380;

      if (width > 1023) {
        // Desktop: start with expanded sidebar
        setSidebarOpen(false);
        setSidebarCollapsed(false);
      } else {
        // Mobile: keep the sidebar open on ~375px devices
        setSidebarOpen(isStickyMobile);
        setSidebarCollapsed(false);
      }
    };

    handleInitialState();
  }, []);

  // Check for password change requirements when user logs in
  useEffect(() => {
    const checkPasswordChange = async () => {
      if (currentUser) {
        try {
          const result = await checkPasswordChangeRequired();
          if (result.requiresChange) {
            setShowPasswordChangeModal(true);
          }
        } catch (error) {
          console.error('Error checking password change requirements:', error);
        }
      }
    };

    checkPasswordChange();
  }, [currentUser, checkPasswordChangeRequired]);

  useEffect(() => {
    const storedRequirements = localStorage.getItem('passwordChangeRequirements');
    if (storedRequirements) {
      setPasswordChangeRequirements(JSON.parse(storedRequirements));
    }
  }, []);

  // Handle navigation state from notifications
  useEffect(() => {
    if (location.state?.fromNotification) {
      if (location.state.openPondModal) {
        // Set the modal content to show pond conditions
        setModalContent({
          title: "Fish Pond Condition",
          content: null,
          icon: <FaFish className="box-icon" />
        });
        // Open the modal
        setShowModal(true);
      }
      if (location.state.selectedPond) {
        setSelectedPond(location.state.selectedPond);
      }
      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event) => {
      const sidebar = document.querySelector('.sidebar-wrapper');
      const hamburger = document.querySelector('.header-hamburger-icon');
      
      // Keep sidebar open for 375px devices
      const width = window.innerWidth;
      const isStickyMobile = width >= 370 && width <= 380;

      if (isStickyMobile) {
        // Do nothing: sidebar should remain open on 375px
        return;
      }

      if (sidebarOpen && sidebar && !sidebar.contains(event.target) && !hamburger?.contains(event.target)) {
        setSidebarOpen(false);
      }
    };

    // Only add listener on mobile devices
    if (window.innerWidth <= 1023) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [sidebarOpen]);

  // Close sidebar when window is resized to desktop
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const isStickyMobile = width >= 370 && width <= 380;

      if (width > 1023) {
        setSidebarOpen(false);
        // Don't reset collapsed state on desktop
      } else {
        // On mobile: keep sidebar open on 375px devices
        setSidebarOpen(isStickyMobile ? true : false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  // Handle sidebar toggle based on screen size
  const handleSidebarToggle = () => {
    if (window.innerWidth <= 1023) {
      // Keep sidebar always open for ~375px devices
      if (window.innerWidth >= 370 && window.innerWidth <= 380) {
        setSidebarOpen(true);
        return;
      }
      // Mobile/tablet: toggle open/closed 
      setSidebarOpen(!sidebarOpen);
    } else {
      // Desktop: toggle collapsed/expanded
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  const handleExport = (format) => {
    exportBoxData({
      format,
      boxData,
      weatherData,
      selectedPond,
      lastUpdated,
      setShowDownloadOptions,
      currentUser: currentUser
    });
  }; 

  const handleLogsClick = async () => {
    if (currentUser?.role === 'Tech Officer') {
      setErrorMessage(t('common.accessDenied'));
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    navigate('/logs');
  };

  const handleAccountManagementClick = async () => {
    if (currentUser?.role === 'Tech Officer') {
      setErrorMessage(t('common.accessDenied'));
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    navigate('/AccountManagement');
  };

  const boxData = [
    {
      id: 1,
      title: t('dashboard.weatherCondition'),
      icon: <FaCloudSun className="box-icon" />,
      content: (
        <WeatherBox 
          weatherData={weatherData} 
          lastUpdated={lastUpdated}
          onRefresh={refreshWeather}
          loading={loading}
        />
      ),
      modalContent: <WeatherDisplay isModal />
    },
    {
      id: 2,
      title: t('dashboard.fishPondCondition'),
      icon: <FaFish className="box-icon" />,
      content: (selectedPond, setSelectedPond) => (
        <PondConditionDashboard 
          selectedPond={selectedPond}
          setSelectedPond={setSelectedPond}
        />
      )
    },
    {
      id: 3,
      title: t('dashboard.piscaRiskData'),
      icon: <FaDatabase className="box-icon" />,
      content: (
        <div className="coming-soon-content">
          <div className="coming-soon-badge">{t('dashboard.comingSoon')}</div>
          <p>{t('dashboard.realTimeDataDescription')}</p>
          <p>{t('dashboard.stayTunedDescription')}</p>
        </div>
      ),
      modalContent: (
        <div className="coming-soon-content modal-view">
          <div className="coming-soon-badge">{t('dashboard.comingSoon')}</div>
          <p>{t('dashboard.realTimeDataDescription')}</p>
          <p>{t('dashboard.stayTunedDescription')}</p>
          <p>{t('dashboard.optimizePerformance')}</p>
        </div>
      )
    },
    {
      id: 4,
      title: t('dashboard.riskReports'),
      icon: <FaExclamationTriangle className="box-icon" />,
      content: (
        <RiskReportModal />
      ),
    }
  ];

  const handleBoxClick = (boxId) => {
    const selectedBox = boxData.find(box => box.id === boxId);
    setModalContent({
      id: boxId, // Store the box ID for stable content rendering
      title: selectedBox.title,
      content: selectedBox.content,
      icon: selectedBox.icon
    });
    setShowModal(true); //automatic refresh the time and can refresh also the weather data
    if (boxId === 1 && (!lastUpdated || (new Date() - lastUpdated) > 60000)) {
      fetchWeatherData();
    }
  };
  const closeModal = () => setShowModal(false);

  const handlePasswordChange = async (newPassword) => {
    try {
      const result = await forcePasswordChange(newPassword);
      if (result.success) {
        setShowPasswordChangeModal(false);
        // Show success message
        setErrorMessage(t('common.passwordChangedSuccess'));
        setTimeout(() => setErrorMessage(''), 3000);
      }
    } catch (error) {
      console.error('Password change error:', error);
      setErrorMessage(`${t('common.passwordChangeFailed')}: ${error.message}`);
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  // Memoize weather modal content to prevent re-renders on language change
  const weatherModalContent = useMemo(() => {
    if (!weatherData) return null;
    
    const timeOfDay = getTimeOfDay(new Date());
    const weatherImage = getWeatherImage(weatherData);
    const weatherIconData = getWeatherIcon(weatherData.weather[0].main, new Date(), weatherData);
    const weatherIcon = weatherIconData.icon;
    const isNight = weatherIconData.isNight;
    const weatherCondition = weatherData.weather[0].main.toLowerCase();
    
    return (
      <div className="weather-main-modal">
        <div className={`weather-display-container ${timeOfDay}`}>
          <div 
            className="weather-display-background" 
            style={{ 
              backgroundImage: `url(${weatherImage})`,
              transition: 'background-image 0.3s ease-in-out'
            }}
          />
          <div className="weather-display-content">
            <div className="weather-time-info">
              <div className="location-name">
                {weatherData.locationName}
              </div>
              <div className="current-date-time">
                <div className="current-date">
                  {new Date().toLocaleDateString([], { 
                    weekday: 'long', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
                <div className="time-temp-container">
                  <div className="current-time">
                    {new Date().toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <div className="current-temp">
                    {Math.round(weatherData.main.temp)}°C
                  </div>
                </div>
              </div>
            </div>

            <img 
              src={weatherIcon} 
              alt={weatherCondition} 
              className={`weather-condition-icon ${weatherCondition.replace(/\s+/g, '-')} ${
                isNight ? 'night' : 'day'
              }`}
            />
            <p className={`weather-condition-text ${timeOfDay}`}>
              {weatherData.weather[0].description}
            </p>
          </div>
        </div>
      </div>
    );
  }, [weatherData]); // Only re-render when weather data changes, not language

  // Create stable modal content based on box ID instead of translated titles
  const getModalContent = useMemo(() => {
    return (boxId) => {
      switch (boxId) {
        case 1: // Weather Condition
          return weatherModalContent;
        case 2: // Fish Pond Condition
          return (
            <div className="pond-modal-content">
              <PondConditionDashboard 
                isModal={true} 
                selectedPond={selectedPond}
                setSelectedPond={setSelectedPond}
              />
            </div>
          );
        case 3: // PiscaRISK Data
          return (
            <div className="image-placeholder">
              <FaImage className="placeholder-icon" />
              <span>{t('dashboard.piscaRiskData')} visualization</span>
            </div>
          );
        case 4: // Risk Reports
          return (
            <div className="risk-modal-content">
              <RiskReportModal isModal={true} />
            </div>
          );
        default:
          return null;
      }
    };
  }, [weatherModalContent, selectedPond, t]);

  return (
    <PageTransition>
      <div className="homepage-container">
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
        <header className="homepage-header-bar">
          <div className="header-logo-container">
            <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
            <div className="header-title">PiscaRISK</div>
            <FaBars 
              className="header-hamburger-icon" 
              onClick={handleSidebarToggle}
            />
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
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <NotificationBox />
            <div className="user-menu">
              <button onClick={() => setShowMenu(!showMenu)}>
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

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && window.innerWidth <= 1023 && (
          <div 
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          sidebarOpen={sidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          currentUser={currentUser}
          showDownloadOptions={showDownloadOptions}
          setShowDownloadOptions={setShowDownloadOptions}
          handleExport={handleExport}
          onDashboardClick={() => navigate('/Homepage')}
          onAccountManagementClick={handleAccountManagementClick}
          onLogsClick={handleLogsClick}
          onFeedbackClick={() => navigate('/Feedback')}
          nightMode={nightMode}
          setNightMode={setNightMode}
          language={language}
          setLanguage={setLanguage}
        />

        <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          {errorMessage && (
            <div className="error-popup">
              {errorMessage}
            </div>
          )}
          <section className="dashboard">
            <div className="dashboard-top-row">
              <div className="main-box">
                <ReportsChart />
              </div>

              <div className="right-sidebar">
                <div className="pie-chart-box">
                <HarvestChart />
                </div>
                
                <div className="calendar-box">
                  <h3>{t('common.calendar')}</h3>
                  <div className="chart-placeholder">
                    <FaCalendarAlt className="chart-icon" />
                    <span>{t('dashboard.calendarView')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bottom-boxes">
              {boxData.map((box) => (
                <div
                  key={box.id}
                  className="box"
                  onClick={() => handleBoxClick(box.id)}
                >
                  {box.icon}
                  <span className="box-title">{box.title}</span>
                </div>
              ))}
            </div>
          </section>

          {showModal && (
            <AnimatedModal
              isOpen={showModal}
              onClose={closeModal}
              title={modalContent.title}
              icon={modalContent.icon}
            >
              {modalContent.id ? getModalContent(modalContent.id) : null}

              {modalContent.id !== 2 && modalContent.id !== 4 && (
                <div className="modal-text-content">
                  {typeof modalContent.content === "string"
                    ? modalContent.content.split("\n").map((line, index) => (
                        <p key={index}>{line}</p>
                      ))
                    : modalContent.content}
                </div>
              )}
            </AnimatedModal>
          )}

          {/* Password Change Modal */}
          <PasswordChangeModal
            isOpen={showPasswordChangeModal}
            onClose={() => setShowPasswordChangeModal(false)}
            onPasswordChange={handlePasswordChange}
            userInfo={currentUser}
          />
        </div>
      </div>
    </PageTransition>
  );
};

export default PiscaRiskHome;

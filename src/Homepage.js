import React, { useState, useEffect, useContext, useMemo } from "react";
import {FaUserCircle,FaImage,FaCloudSun,FaFish,
        FaExclamationTriangle,FaUser,FaDatabase,FaSignOutAlt,
        FaSearch,FaBars,FaCalendarAlt} from "react-icons/fa";
import { useTranslation } from 'react-i18next';
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
import FarmHealthGauge from './components/FarmHealthGauge';
import PondsAtRiskStackedChart from './components/PondsAtRiskStackedChart';
import { fetchRiskReportData } from './services/riskDataService';
import AnimatedModal from './components/AnimatedModal';
// PasswordChangeModal removed - using ProfileSettings password reset instead
import Sidebar from './components/Sidebar';
import RiskReportModal from './components/RiskReportModal';
import PiscaRiskData from './components/PiscaRiskData';
import ConditionInsights from './components/ConditionInsights';

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
  const [modalKey, setModalKey] = useState(0); // Key to force component remount
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
  const { currentUser, handleLogout } = useContext(AuthContext);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [nightMode, setNightMode] = useState(false);
  const [language, setLanguage] = useState('en');
  // Password change modal removed - using ProfileSettings password reset instead
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

  // Password change check removed - using ProfileSettings password reset instead

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
          id: 2, // Fish Pond Condition box ID
          title: "Fish Pond Condition",
          content: null,
          icon: <FaFish className="box-icon" />
        });
        // Open the modal
        setShowModal(true);
        console.log('Homepage opened pond modal');
      }
      if (location.state.selectedPond) {
        setSelectedPond(location.state.selectedPond);
        console.log('Homepage set selected pond:', location.state.selectedPond);
      }
      // Don't clear the navigation state immediately - let PondConditionDashboard read it first
      // The state will be cleared by PondConditionDashboard after it processes it
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
      currentUser: currentUser,
      allFarmsRiskData: allFarmsRiskData
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
  const closeModal = () => {
    setShowModal(false);
    // Reset selected pond to default when closing modal
    setSelectedPond(1);
    // Clear navigation state to ensure fresh start
    navigate('/Homepage', { replace: true, state: {} });
    // Increment modal key to force component remount on next open
    setModalKey(prev => prev + 1);
  };

  // Chart carousel state (ReportsChart default -> PondsAtRisk next)
  const [chartIndex, setChartIndex] = useState(1); // 0: Reports, 1: Ponds at Risk
  const nextChart = () => setChartIndex((prev) => (prev + 1) % 2);

  // Drilldown modal for stacked chart
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownItems, setDrilldownItems] = useState([]);
  const [allFarmsRiskData, setAllFarmsRiskData] = useState([]);

  useEffect(() => {
    // Prefetch farms risk data to power drilldowns
    (async () => {
      try {
        const farms = await fetchRiskReportData();
        setAllFarmsRiskData(Array.isArray(farms) ? farms : []);
      } catch (_) {}
    })();
  }, []);

  const openDrilldown = ({ type, farmKey, risk, farms, timeFilter, customStart, customEnd, rangeStart, rangeEnd }) => {
    let items = [];
    
    // Helper function to check if timestamp is within the selected time range
    const withinTimeRange = (timestamp) => {
      if (!rangeStart || !rangeEnd) return true; // If no range specified, show all
      
      let ms = 0;
      if (typeof timestamp === 'number') ms = timestamp;
      else if (typeof timestamp === 'string') { 
        const m = Date.parse(timestamp); 
        ms = Number.isNaN(m) ? 0 : m; 
      }
      else if (timestamp && typeof timestamp.toDate === 'function') { 
        try { ms = timestamp.toDate().getTime(); } catch (_) {} 
      }
      else if (timestamp && typeof timestamp.seconds === 'number') { 
        ms = timestamp.seconds * 1000; 
      }
      
      if (ms === 0) return false;
      const date = new Date(ms);
      return date >= rangeStart && date <= rangeEnd;
    };
    
    if (type === 'farm' && farmKey) {
      const farm = allFarmsRiskData.find(f => f.key === farmKey);
      if (farm) {
        const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
        items = preds
          .filter(p => withinTimeRange(p.timestamp)) // Filter by time range
          .map(p => {
          // Convert timestamp to readable date and time
          const getTimestamp = (ts) => {
            if (!ts) return 'Unknown time';
            let ms = 0;
            if (typeof ts === 'number') ms = ts;
            else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
            else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
            else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
            if (ms === 0) return 'Unknown time';
            return new Date(ms).toLocaleString();
          };

          return {
            pond: p.fish_pond || 'Unknown Pond',
            risk: p.risk_level || 'Normal',
            farm: farm.name,
            timestamp: getTimestamp(p.generated_timestamp || p.timestamp),
            date: getTimestamp(p.generated_timestamp || p.timestamp).split(',')[0],
            time: getTimestamp(p.generated_timestamp || p.timestamp).split(',')[1]?.trim() || 'Unknown time',
            submitted: getTimestamp(p.submitted_timestamp),
            submittedDate: getTimestamp(p.submitted_timestamp).split(',')[0],
            generated: getTimestamp(p.generated_timestamp || p.timestamp),
            generatedDate: getTimestamp(p.generated_timestamp || p.timestamp).split(',')[0],
          };
        });
        setDrilldownTitle(`Ponds at Risk — ${farm.name}`);
      }
    } else if (type === 'risk' && risk) {
      const farmKeys = Array.isArray(farms) && farms.length ? new Set(farms) : null;
      const relevantFarms = farmKeys ? allFarmsRiskData.filter(f => farmKeys.has(f.key)) : allFarmsRiskData;
      relevantFarms.forEach(f => {
        const preds = Array.isArray(f.predictions) ? f.predictions : [];
        preds
          .filter(p => withinTimeRange(p.timestamp)) // Filter by time range
          .forEach(p => {
          const lvl = (p.risk_level || 'Normal');
          if (lvl === risk) {
            // Convert timestamp to readable date and time
            const getTimestamp = (ts) => {
              if (!ts) return 'Unknown time';
              let ms = 0;
              if (typeof ts === 'number') ms = ts;
              else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
              else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
              else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
              if (ms === 0) return 'Unknown time';
              return new Date(ms).toLocaleString();
            };

            items.push({ 
              pond: p.fish_pond || 'Unknown Pond', 
              risk: lvl, 
              farm: f.name,
              timestamp: getTimestamp(p.generated_timestamp || p.timestamp),
              date: getTimestamp(p.generated_timestamp || p.timestamp).split(',')[0],
              time: getTimestamp(p.generated_timestamp || p.timestamp).split(',')[1]?.trim() || 'Unknown time',
              submitted: getTimestamp(p.submitted_timestamp),
              submittedDate: getTimestamp(p.submitted_timestamp).split(',')[0],
              generated: getTimestamp(p.generated_timestamp || p.timestamp),
              generatedDate: getTimestamp(p.generated_timestamp || p.timestamp).split(',')[0],
            });
          }
        });
      });
      setDrilldownTitle(`Ponds at ${risk} Risk`);
    }
    
    // Sort items by timestamp (latest first)
    items.sort((a, b) => {
      const getTimestamp = (item) => {
        if (!item.timestamp || item.timestamp === 'Unknown time') return 0;
        return new Date(item.timestamp).getTime();
      };
      return getTimestamp(b) - getTimestamp(a); // Descending order (latest first)
    });
    
    setDrilldownItems(items);
    setShowDrilldown(true);
  };



  // Removed memoized weather modal markup to ensure live ticking time via WeatherDisplay component

  // Create stable modal content based on box ID instead of translated titles
  const getModalContent = useMemo(() => {
    return (boxId) => {
      switch (boxId) {
        case 1: // Weather Condition (use live component so time ticks every second)
          return (
            <div className="weather-main-modal">
              <WeatherDisplay />
            </div>
          );
        case 2: // Fish Pond Condition
          return (
            <div className="pond-modal-content" key={modalKey}>
              <PondConditionDashboard 
                isModal={true} 
                selectedPond={selectedPond}
                setSelectedPond={setSelectedPond}
                navigationState={location.state}
              />
            </div>
          );
        case 3: // PiscaRISK Data
          return (
            <div className="risk-modal-content">
              <PiscaRiskData />
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
  }, [selectedPond, t, location.state, modalKey]);

  return (
    <div className="homepage-container">
        <header className="homepage-header-bar">
          <div className="header-logo-container">
          <FaBars 
              className="header-hamburger-icon" 
              onClick={handleSidebarToggle}
            />
            <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
            <div className="header-title">PiscaRISK</div>
          </div>
          <div className="header-right">
          <div className="header-search-container">
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
                {chartIndex === 0 ? (
                  <ReportsChart />
                ) : (
                  <PondsAtRiskStackedChart onDrilldown={openDrilldown} />
                )}
                <button className="next-chart-btn" onClick={nextChart} aria-label="Next chart">→</button>
              </div>

              <div className="right-sidebar">
                <div className="pie-chart-box">
                <FarmHealthGauge />
                </div>
                
                <div className="calendar-box">
                    <ConditionInsights 
                      userRole={currentUser?.role}
                      assignedFarm={currentUser?.farm}
                    />
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

          {showDrilldown && (
            <AnimatedModal
              isOpen={showDrilldown}
              onClose={() => setShowDrilldown(false)}
              title={drilldownTitle}
              icon={<FaExclamationTriangle className="box-icon" />}
            >
              <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: '0 8px' }}>
                {drilldownItems && drilldownItems.length > 0 ? (
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', fontWeight: 600, marginBottom: 8 }}>
                      <div style={{ flex: 2 }}>Pond</div>
                      <div style={{ flex: 1 }}>Risk</div>
                      <div style={{ flex: 2 }}>Farm</div>
                      <div style={{ flex: 2.2 }}>Based on data submitted</div>
                      <div style={{ flex: 2.2 }}>Prediction generated</div>
                    </div>
                    {drilldownItems.map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                        <div style={{ flex: 2 }}>{it.pond}</div>
                        <div style={{ flex: 1 }}>{it.risk}</div>
                        <div style={{ flex: 2 }}>{it.farm}</div>
                        <div style={{ flex: 2.2, fontSize: '0.9em', color: '#666' }}>{it.submittedDate || '—'}</div>
                        <div style={{ flex: 2.2, fontSize: '0.9em', color: '#666' }}>{it.generatedDate || it.date || '—'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>No data available.</div>
                )}
              </div>
            </AnimatedModal>
          )}

          {/* Password Change Modal removed - using ProfileSettings password reset instead */}
        </div>
      </div>
  );
};

export default PiscaRiskHome;
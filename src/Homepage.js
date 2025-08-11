import React, { useState, useEffect, useContext  } from "react";
import {FaUserCircle,FaPlayCircle,FaTimes,FaImage,FaCloudSun,FaFish,
        FaExclamationTriangle,FaUser,FaDatabase,FaSignOutAlt,
        FaFilePdf,FaFileCsv,FaChevronRight,FaChevronLeft,FaSearch,FaBars,
        FaHome,FaStar,FaClipboardList,FaComment,FaFileExport,FaMoon,FaGlobe,
        FaChartPie,FaCalendarAlt} from "react-icons/fa";
import { MdManageAccounts } from "react-icons/md";
import logo from "./assets/images/PISCARISK_LOGO.png";
import { useNavigate, useLocation } from 'react-router-dom';
import "./Homepage.css";
import PondConditionDashboard from './components/PondConditionDashboard';
import { AuthContext } from './contexts/AuthContext';
import { fetchWeatherData } from './services/weatherService';
import WeatherBox from './components/WeatherBox';
import WeatherDisplay from './components/WeatherDisplay';
import { exportBoxData } from './utils/exportBoxData';
import NotificationBox from './components/NotificationBox';
import ReportsChart from './components/ReportsChart';
import HarvestChart from './components/HarvestChart';
import PageTransition from './components/PageTransition';
import AnimatedModal from './components/AnimatedModal';
import PasswordChangeModal from './components/PasswordChangeModal';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar';

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
  const [showMenu, setShowMenu] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [selectedPond, setSelectedPond] = useState(1);
  const { currentUser, logout, handleLogout, checkPasswordChangeRequired, forcePasswordChange } = useContext(AuthContext);
  const [data, setData] = useState(getInitialData());
  const [errorMessage, setErrorMessage] = useState('');
  const setShowExportOptions = () => {};
  const [searchTerm, setSearchTerm] = useState('');
  const [currentChart, setCurrentChart] = useState('reports');
  const [nightMode, setNightMode] = useState(false);
  const [language, setLanguage] = useState('en');
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [passwordChangeRequirements, setPasswordChangeRequirements] = useState({
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true
  });
  
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

  const handleRewardManagementClick = async () => {
    if (currentUser?.role === 'Admin') {
      setErrorMessage('Access Denied: Only Tech Officers are allowed to access');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    navigate('/RewardManagement');
  };

  const handleLogsClick = async () => {
    if (currentUser?.role === 'Tech Officer') {
      setErrorMessage('Access Denied: Only Admins are allowed to access');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    navigate('/logs');
  };

  const handleAccountManagementClick = async () => {
    if (currentUser?.role === 'Tech Officer') {
      setErrorMessage('Access Denied: Only Admins are allowed to access');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    navigate('/AccountManagement');
  };

  const boxData = [
    {
      id: 1,
      title: "Weather Condition",
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
      title: "Fish Pond Condition",
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
      title: "PiscaRISK Data",
      icon: <FaDatabase className="box-icon" />,
      content: (
        <div className="coming-soon-content">
          <div className="coming-soon-badge">Coming Soon</div>
          <p>Real-time data weather and pond condition will appear here.</p>
          <p>Stay tuned! This section will display detailed data collected from pond reports.</p>
        </div>
      ),
      modalContent: (
        <div className="coming-soon-content modal-view">
          <div className="coming-soon-badge">Coming Soon</div>
          <p>Real-time data weather and pond condition will appear here.</p>
          <p>Stay tuned! This section will display detailed data collected from pond reports.</p>
          <p>PiscaRISK will soon provide actionable data to optimize aquaculture performance.</p>
        </div>
      )
    },
    {
      id: 4,
      title: "Risk Reports",
      icon: <FaExclamationTriangle className="box-icon" />,
      content: (
        <div className="coming-soon-content">
          <div className="coming-soon-badge">Coming Soon</div>
          <p>Risk analysis and emergency reports will be available here once the system is fully integrated.</p>
          <p>This section will highlight alerts and potential threats detected in the fish pond environment and weather.</p>
        </div>
      ),
      modalContent: (
        <div className="coming-soon-content modal-view">
          <div className="coming-soon-badge">Coming Soon</div>
          <p>Risk analysis and emergency reports will be available here once the system is fully integrated.</p>
          <p>This section will highlight alerts and potential threats detected in the fish pond environment and weather.</p>
          <p>Soon you'll see automated risk reports based on sensor data and user feedback.</p>
        </div>
      )
    }
  ];

  const handleBoxClick = (boxId) => {
    const selectedBox = boxData.find(box => box.id === boxId);
    setModalContent({
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

  const handleNextChart = () => {
    setCurrentChart(currentChart === 'reports' ? 'harvest' : 'reports');
  };

  const handlePasswordChange = async (newPassword) => {
    try {
      const result = await forcePasswordChange(newPassword);
      if (result.success) {
        setShowPasswordChangeModal(false);
        // Show success message
        setErrorMessage('Password changed successfully!');
        setTimeout(() => setErrorMessage(''), 3000);
      }
    } catch (error) {
      console.error('Password change error:', error);
      setErrorMessage(`Password change failed: ${error.message}`);
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  return (
    <PageTransition>
      <div className="homepage-container">
        <header className="homepage-header-bar">
          <div className="header-logo-container">
            <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
            <div className="header-title">PiscaRISK</div>
            <FaBars 
              className="header-hamburger-icon" 
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
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

        <div className="main-content">
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
                  <h3>Calendar</h3>
                  <div className="chart-placeholder">
                    <FaCalendarAlt className="chart-icon" />
                    <span>Calendar View</span>
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
              {modalContent.title === "Weather Condition" ? (
                <div className="weather-main-modal">
                  <WeatherDisplay 
                    isModal={true}
                    weatherData={weatherData}
                    currentTime={new Date()}
                    onRefresh={fetchWeatherData}
                  />
                </div>
              ) : modalContent.title === "Fish Pond Condition" ? (
                <div className="pond-modal-content">
                  <PondConditionDashboard 
                    isModal={true} 
                    selectedPond={selectedPond}
                    setSelectedPond={setSelectedPond}
                  />
                </div>
              ) : (
                <div className="image-placeholder">
                  <FaImage className="placeholder-icon" />
                  <span>{modalContent.title} visualization</span>
                </div>
              )}

              {modalContent.title !== "Fish Pond Condition" && (
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

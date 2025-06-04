import React, { useState, useEffect, useContext  } from "react";
import {FaUserCircle,FaPlayCircle,FaTimes,FaImage,FaCloudSun,FaFish,
        FaExclamationTriangle,FaEllipsisV,FaDatabase,
        FaFilePdf,FaFileCsv,FaChevronRight,FaChevronLeft} from "react-icons/fa";
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
  const [sidebarOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [selectedPond, setSelectedPond] = useState(1);
  const { currentUser, logout } = useContext(AuthContext);
  const [data, setData] = useState(getInitialData());
  const [errorMessage, setErrorMessage] = useState('');
  const setShowExportOptions = () => {};
  const [searchTerm, setSearchTerm] = useState('');
  const [currentChart, setCurrentChart] = useState('reports');
  
  const handleLogout = async () => {
    // Prevent any clicks during logout
    const logoutButton = document.querySelector('.dropdown-menu button');
    if (logoutButton) {
      logoutButton.disabled = true;
    }
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

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

  return (
    <div className="homepage-container">
      <header className="homepage-header-bar">
        <div className="header-logo-container">
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRISK</div>
        </div>
        <div className="header-right">
          <NotificationBox />
          <div className="logs-menu">
            <button onClick={() => setShowMenu(!showMenu)}>
              <FaEllipsisV className="three-dot-icon" />
            </button>
            {showMenu && (
              <div className="dropdown-menu">
                <button onClick={handleLogout}>Logout</button> 
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="main-content">
        {errorMessage && (
          <div className="error-popup">
            {errorMessage}
          </div>
        )}
        <div className={`sidebar-wrapper ${sidebarOpen ? "visible" : ""}`}>
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
                <h2>Welcome, {currentUser?.username || 'User'}!</h2>
                {currentUser?.username && (
                  <span className="username">{currentUser.username}</span>
                )}
              </div>
            </div>
          </div>

          <aside className="sidebar">
            <div className="sidebar-buttons">
              <button className="profile-btn" onClick={() => navigate("/ProfileSettings")}>My Profile</button>
              <button className="accountm-btn" onClick={handleAccountManagementClick}>Account Management</button>
              <button className="reward-btn" onClick={handleRewardManagementClick}>Reward Management</button>
              <button className="logs-btn" onClick={handleLogsClick}>Logs</button>
              <button className="feedback-btn"  onClick={() => navigate("/Feedback")}>Feedbacks</button>

              {/* Modified Export Button with Dropdown */}
              <div className="sidebar-export-container">
                <button 
                  className="export-btn" 
                  onClick={() => setShowDownloadOptions(!showDownloadOptions)}
                >
                  Export Data
                </button>
                
                {showDownloadOptions && (
                  <div className="sidebar-download-options">
                    <button 
                      className="homedownload-option" 
                      onClick={() => {
                        handleExport ('pdf');
                        setShowDownloadOptions(false);
                      }}
                    >
                      <FaFilePdf className="homeDL-icon" />
                      Export Box Data (PDF)
                    </button>
                    <button 
                      className="homedownload-option" 
                      onClick={() => {
                        handleExport ('csv');
                        setShowDownloadOptions(false);
                      }}
                    >
                      <FaFileCsv className="homeDL2-icon" />
                      Export Box Data (CSV)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <section className="dashboard">
          <div className="main-box">
            {currentChart === 'reports' ? <ReportsChart /> : <HarvestChart />}
            <button className="next-chart-btn" onClick={handleNextChart}>
              {currentChart === 'reports' ? <FaChevronRight /> : <FaChevronLeft />}
            </button>
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
            <div className="modal-overlay">
              <div className="modal-container">
                <button className="modal-close-btn" onClick={closeModal}>
                  <FaTimes />
                </button>
                <div className="modal-content">
                  <div className="modal-header">
                    {React.cloneElement(modalContent.icon, {
                      className: "modal-title-icon"
                    })}
                    <h2>{modalContent.title}</h2>
                  </div>

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
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default PiscaRiskHome;

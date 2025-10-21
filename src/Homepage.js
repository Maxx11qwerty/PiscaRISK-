import React, { useState, useEffect, useContext, useMemo } from "react";
import {FaUserCircle,FaCloudSun,FaFish,
        FaExclamationTriangle,FaUser,FaDatabase,FaSignOutAlt,
        FaBars} from "react-icons/fa";
import { useTranslation } from 'react-i18next';
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
import FarmHealthGauge from './components/FarmHealthGauge';
import PondsAtRiskStackedChart from './components/PondsAtRiskStackedChart';
import { fetchRiskReportData } from './services/riskDataService';
import { logMessages, logTemporaryTechOfficerActivity } from './utils/logger';
import AnimatedModal from './components/AnimatedModal';
// PasswordChangeModal removed - using ProfileSettings password reset instead
import Sidebar from './components/Sidebar';
import RiskReportModal from './components/RiskReportModal';
import PiscaRiskData from './components/PiscaRiskData';
import ConditionInsights from './components/ConditionInsights';


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
  const [chartLoading, setChartLoading] = useState(true);
  const [chartGroupMode, setChartGroupMode] = useState('farm');
  
  // Timer states for Temporary Tech Officers
  const [ttoTimers, setTtoTimers] = useState({}); // { [userId]: { remaining, status } }
  
  // Track if TTO banner has been shown for this login session
  const [ttoBannerShown, setTtoBannerShown] = useState(false);
  
  // Helper function to format remaining time
  const formatRemainingTime = (remainingMs) => {
    if (remainingMs <= 0) return 'Expired';
    
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };
  
  // Helper function to get timer status color
  const getTimerStatusColor = (status) => {
    switch (status) {
      case 'expired': return '#dc2626';
      case 'warning': return '#f59e0b';
      case 'normal': return '#059669';
      default: return '#6b7280';
    }
  };
  
  // Helper function to format full expiration details
  const formatFullExpirationDetails = (user, timer) => {
    if (!user.effectiveFrom || !user.effectiveTo) return 'No effective period set';
    
    const effectiveFrom = new Date(user.effectiveFrom);
    const effectiveTo = new Date(user.effectiveTo);
    const now = new Date();
    
    const fromDate = effectiveFrom.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    const toDate = effectiveTo.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    
    const isExpired = now > effectiveTo;
    if (isExpired) {
      return `Period: ${fromDate} - ${toDate} (Expired)`;
    } else {
      const remaining = formatRemainingTime(timer.remaining);
      return `Period: ${fromDate} - ${toDate} (${remaining} left)`;
    }
  };
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [closeNotificationsSignal, setCloseNotificationsSignal] = useState(0);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [selectedPond, setSelectedPond] = useState(1);
  const { currentUser, handleLogout } = useContext(AuthContext);
  const [errorMessage, setErrorMessage] = useState('');
  const [nightMode, setNightMode] = useState(false);
  const [language, setLanguage] = useState('en');
  
  // Check if TTO banner should be shown (only once per login session)
  useEffect(() => {
    if (!currentUser || (!currentUser.temporaryTechOfficer && String(currentUser.role || '').toLowerCase() !== 'temp_tech_officer')) {
      return;
    }
    
    // Check if banner was already shown for this login session
    const bannerKey = `tto_banner_shown_${currentUser.uid}`;
    const wasShown = sessionStorage.getItem(bannerKey);
    
    if (!wasShown) {
      setTtoBannerShown(true);
      // Mark as shown for this session
      sessionStorage.setItem(bannerKey, 'true');
    }
  }, [currentUser]);

  // Timer effect for TTO
  useEffect(() => {
    if (!currentUser || (!currentUser.temporaryTechOfficer && String(currentUser.role || '').toLowerCase() !== 'temp_tech_officer')) {
      return;
    }
    
    const updateTimer = () => {
      // Check for various possible date fields
      const effectiveTo = currentUser.effectiveTo || currentUser.temporaryEffectiveTo || currentUser.expirationDate;
      
      if (!effectiveTo) {
        return;
      }
      
      const now = new Date();
      const expirationDate = new Date(effectiveTo);
      const remaining = expirationDate.getTime() - now.getTime();
      
      let status = 'normal';
      if (remaining <= 0) {
        status = 'expired';
      } else if (remaining <= 24 * 60 * 60 * 1000) { // Less than 24 hours
        status = 'warning';
      }
      
      setTtoTimers(prev => ({
        ...prev,
        [currentUser.uid]: {
          remaining: Math.max(0, remaining),
          status: status
        }
      }));
    };
    
    // Update immediately
    updateTimer();
    
    // Update every minute
    const interval = setInterval(updateTimer, 60000);
    
    return () => clearInterval(interval);
  }, [currentUser]);
  
  // Password change modal removed - using ProfileSettings password reset instead
  const [setPasswordChangeRequirements] = useState({
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true
  });

  // removed unused useScreenSize hook and value
  
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
      }
      if (location.state.selectedPond) {
        setSelectedPond(location.state.selectedPond);
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
    if (currentUser?.role === 'Tech Officer' && currentUser?.role !== 'New Main Tech Officer') {
      setErrorMessage(t('common.accessDenied'));
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    navigate('/logs');
  };

  const handleAccountManagementClick = async () => {
    if (currentUser?.role === 'Tech Officer' && currentUser?.role !== 'New Main Tech Officer') {
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
    if (boxId === 4) {
      // Opening Risk Reports from the box -> show overview (no preselected farm)
      setModalFarmName('');
      try { sessionStorage.removeItem('riskModal.initialDateMs'); } catch (_) {}
    }
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
    // Reset any targeted farm for Risk Reports so next open shows overview
    setModalFarmName('');
    setModalDetailsFarmKey(null); // Clear the details farm key
    setModalInitialRiskLevel('all'); // Reset initial risk level
    setModalInitialPonds([]); // Reset initial pond list
    setModalInitialPond(null); // Reset initial pond
    setModalRangeStart(null); // Reset date range start
    setModalRangeEnd(null); // Reset date range end
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
  const [modalFarmName, setModalFarmName] = useState('');
  const [modalDetailsFarmKey, setModalDetailsFarmKey] = useState(null);
  const [modalInitialRiskLevel, setModalInitialRiskLevel] = useState('all');
  const [modalInitialPond, setModalInitialPond] = useState(null);
  const [modalInitialPonds, setModalInitialPonds] = useState([]);
  const [modalRangeStart, setModalRangeStart] = useState(null);
  const [modalRangeEnd, setModalRangeEnd] = useState(null);
  const [allFarmsRiskData, setAllFarmsRiskData] = useState([]);

  useEffect(() => {
    // Prefetch farms risk data to power drilldowns
    (async () => {
      try {
        const farms = await fetchRiskReportData();
        setAllFarmsRiskData(Array.isArray(farms) ? farms : []);
      } catch (_) {}
    })();
  }, [currentUser]);

  const openDrilldown = ({ type, farmKey, risk, farms, clickedFarmName, clickedRiskLevel, clickedPonds, clickDateMs, timeFilter, customStart, customEnd, rangeStart, rangeEnd }) => {
    let items = [];

    // Helper: within selected time range
    const withinTimeRange = (timestamp) => {
      if (!rangeStart || !rangeEnd) return true;
      let ms = 0;
      if (typeof timestamp === 'number') ms = timestamp;
      else if (typeof timestamp === 'string') { const m = Date.parse(timestamp); ms = Number.isNaN(m) ? 0 : m; }
      else if (timestamp && typeof timestamp.toDate === 'function') { try { ms = timestamp.toDate().getTime(); } catch (_) {} }
      else if (timestamp && typeof timestamp.seconds === 'number') { ms = timestamp.seconds * 1000; }
      if (ms === 0) return false;
      const date = new Date(ms);
      return date >= rangeStart && date <= rangeEnd;
    };

    // Helper: normalize risk like components
    const normalizeRisk = (level) => {
      if (!level || typeof level !== 'string') return 'Normal';
      const s = level.toLowerCase();
      if (s.includes('high') || s.includes('critical')) return 'High';
      if (s.includes('medium')) return 'Medium';
      if (s.includes('low')) return 'Low';
      if (s.includes('normal')) return 'Normal';
      return level.charAt(0).toUpperCase() + level.slice(1);
    };

    // Helper: pick the latest generated date within range and dedupe to latest per pond on that date
    const latestBatchPerPondForRange = (preds) => {
      // Modal uses p.timestamp consistently; mirror that here
      const inRange = preds.filter(p => withinTimeRange(p.timestamp) && p.timestamp);
      if (inRange.length === 0) return [];
      const getMs = (ts) => {
        if (!ts) return 0;
        if (typeof ts === 'number') return ts;
        if (typeof ts === 'string') { const m = Date.parse(ts); return Number.isNaN(m) ? 0 : m; }
        if (ts && typeof ts.toDate === 'function') { try { return ts.toDate().getTime(); } catch (_) { return 0; } }
        if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
        return 0;
      };
      const latestMs = Math.max(...inRange.map(p => getMs(p.timestamp)));
      const latestDateKey = new Date(latestMs).toDateString();
      const sameDay = inRange.filter(p => new Date(getMs(p.timestamp)).toDateString() === latestDateKey);
      const pondMap = new Map();
      const sev = (lvl) => {
        const s = (lvl || '').toString().toLowerCase();
        if (s.includes('high')) return 3; if (s.includes('medium')) return 2; if (s.includes('low')) return 1; return 0;
      };
      sameDay
        .sort((a, b) => getMs(b.timestamp) - getMs(a.timestamp))
        .forEach(pred => {
          const pond = (pred.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
          const existing = pondMap.get(pond);
          if (!existing) { pondMap.set(pond, pred); return; }
          const a = getMs(existing.timestamp);
          const b = getMs(pred.timestamp);
          const delta = Math.abs(b - a);
          // If exact tie, or within 60s tolerance, prefer lower severity
          if ((b === a || delta <= 60000) && sev(pred.risk_level) < sev(existing.risk_level)) {
            pondMap.set(pond, pred);
          }
        });
      return Array.from(pondMap.values());
    };

    // Helper: format timestamps
    const fmtTs = (ts) => {
      if (!ts) return 'Unknown time';
      let ms = 0;
      if (typeof ts === 'number') ms = ts;
      else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
      else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
      else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
      if (ms === 0) return 'Unknown time';
      return new Date(ms).toLocaleString();
    };

    if (type === 'farm' && farmKey) {
      const farm = allFarmsRiskData.find(f => f.key === farmKey);
      if (farm) {
        // Open RiskReportModal focused to this farm (details view)
        setModalFarmName(farm.name);
        setModalDetailsFarmKey(farmKey); // Set the farm key for details view
        setModalInitialRiskLevel('all'); // Reset to show all risk levels
        setModalInitialPonds([]); // Reset pond list
        setModalInitialPond(null); // Reset pond selection
        setModalContent({ id: 4, title: t('dashboard.riskReports'), content: null, icon: <FaExclamationTriangle className="box-icon" /> });
        setShowModal(true);
        // Persist the clicked date for RiskReportModal via sessionStorage for simplicity
        try {
          if (clickDateMs) sessionStorage.setItem('riskModal.initialDateMs', String(clickDateMs));
          // Pass preloaded farm data to speed up initial render
          sessionStorage.setItem('riskModal.initialFarmData', JSON.stringify(farm));
        } catch (_) {}
        return;
        const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
        const latestPerPond = latestBatchPerPondForRange(preds);
        items = latestPerPond.map(p => ({
          pond: p.fish_pond || 'Unknown Pond',
          risk: normalizeRisk(p.risk_level || 'Normal'),
          farm: farm.name,
          timestamp: fmtTs(p.generated_timestamp || p.timestamp),
          date: fmtTs(p.generated_timestamp || p.timestamp).split(',')[0],
          time: fmtTs(p.generated_timestamp || p.timestamp).split(',')[1]?.trim() || 'Unknown time',
          submitted: fmtTs(p.submitted_timestamp),
          submittedDate: fmtTs(p.submitted_timestamp).split(',')[0],
          generated: fmtTs(p.generated_timestamp || p.timestamp),
          generatedDate: fmtTs(p.generated_timestamp || p.timestamp).split(',')[0],
        }));
        setDrilldownTitle(`Ponds at Risk — ${farm.name}`);
      }
    } else if (type === 'risk' && risk) {
      // If a specific farm segment was clicked in risk view, open modal focused on that farm
      if (clickedFarmName) {
        // Find the farm key for the clicked farm name
        const clickedFarm = allFarmsRiskData.find(f => f.name === clickedFarmName);
        
        // Map the farm key to match the modal's farms array
        const farmKeyMapping = {
          'aquino-fish-farm': 'salmon-hatchery-facility',  // Aquino Fish Farm
          'labay-fish-farm': 'labay-fish-farm',           // Labay Fish Farm
          'maningas-fish-farm': 'blue-ocean-aquafarm',    // Maningas Fish Farm
          "vergara's-aqua-farm": 'tilapia-production-center' // Vergara's Aqua Farm
        };
        
        const mappedFarmKey = farmKeyMapping[clickedFarm?.key] || clickedFarm?.key;
      setModalFarmName(clickedFarmName);
      setModalDetailsFarmKey(mappedFarmKey); // Set the mapped farm key for details view
      setModalInitialRiskLevel(clickedRiskLevel || 'all'); // Set the specific risk level that was clicked
      setModalInitialPonds(clickedPonds || []); // Set the specific ponds that were clicked
      setModalInitialPond(null); // Reset individual pond selection
      setModalRangeStart(rangeStart); // Set the date range start
      setModalRangeEnd(rangeEnd); // Set the date range end
        setModalContent({ id: 4, title: t('dashboard.riskReports'), content: null, icon: <FaExclamationTriangle className="box-icon" /> });
        setShowModal(true);
        try {
          if (clickDateMs) sessionStorage.setItem('riskModal.initialDateMs', String(clickDateMs));
        } catch (_) {}
        return;
      }
      const farmKeys = Array.isArray(farms) && farms.length ? new Set(farms) : null;
      const relevantFarms = farmKeys ? allFarmsRiskData.filter(f => farmKeys.has(f.key)) : allFarmsRiskData;
      relevantFarms.forEach(f => {
        const preds = Array.isArray(f.predictions) ? f.predictions : [];
        const latestPerPond = latestBatchPerPondForRange(preds);
        latestPerPond.forEach(p => {
          const lvl = normalizeRisk(p.risk_level || 'Normal');
          if (lvl === risk) {
            items.push({
              pond: p.fish_pond || 'Unknown Pond',
              risk: lvl,
              farm: f.name,
              timestamp: fmtTs(p.generated_timestamp || p.timestamp),
              date: fmtTs(p.generated_timestamp || p.timestamp).split(',')[0],
              time: fmtTs(p.generated_timestamp || p.timestamp).split(',')[1]?.trim() || 'Unknown time',
              submitted: fmtTs(p.submitted_timestamp),
              submittedDate: fmtTs(p.submitted_timestamp).split(',')[0],
              generated: fmtTs(p.generated_timestamp || p.timestamp),
              generatedDate: fmtTs(p.generated_timestamp || p.timestamp).split(',')[0],
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
      return getTimestamp(b) - getTimestamp(a);
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
              <RiskReportModal 
                isModal={true} 
                initialFarmName={modalFarmName} 
                initialTimestampMs={(function(){ try { const raw = sessionStorage.getItem('riskModal.initialDateMs'); return raw ? parseInt(raw, 10) : null; } catch(_) { return null; } })()} 
                initialDetailsFarmKey={modalDetailsFarmKey}
                initialRiskLevel={modalInitialRiskLevel}
                initialPond={modalInitialPond}
                initialPonds={modalInitialPonds}
                rangeStart={modalRangeStart}
                rangeEnd={modalRangeEnd}
              />
            </div>
          );
        default:
          return null;
      }
    };
  }, [selectedPond, t, location.state, modalKey, modalFarmName, modalDetailsFarmKey, modalInitialRiskLevel, modalInitialPond, modalInitialPonds]);

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
            <NotificationBox 
              onOpen={() => setShowMenu(false)}
              externalCloseSignal={closeNotificationsSignal}
            />
            <div className="user-menu">
              <button onClick={() => { setShowMenu(!showMenu); setCloseNotificationsSignal(v => v + 1); }}>
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
            className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`}
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
            <div className="error-message visible">
              {errorMessage}
            </div>
          )}
          
          {/* Monitoring Mode Indicator for Main Tech Officer */}
          {currentUser?.monitoringMode && (
            <div className="monitoring-mode-banner">
              <div className="monitoring-mode-content">
                <div className="monitoring-mode-icon">👁️</div>
                <div className="monitoring-mode-text">
                  <div className="monitoring-mode-title">Monitoring Mode</div>
                  <div className="monitoring-mode-message">You are monitoring while a Temporary Tech Officer is active</div>
                  {currentUser?.tempTOExpiration && (
                    <div className="monitoring-expiration">
                      Temporary assignment expires: {currentUser.tempTOExpiration}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Temporary Tech Officer Floating Warning Banner */}
          {currentUser && (currentUser.temporaryTechOfficer || String(currentUser.role || '').toLowerCase() === 'temp_tech_officer') && ttoBannerShown && (
            <div className="tto-floating-banner">
              <div className="tto-floating-content">
                <div className="tto-floating-icon">⚠️</div>
                <div className="tto-floating-text">
                  <div className="tto-floating-title">Temporary Account Active</div>
                  <div className="tto-floating-message">
                    {(() => {
                      const effectiveTo = currentUser.effectiveTo || currentUser.temporaryEffectiveTo || currentUser.expirationDate;
                      if (effectiveTo) {
                        const timer = ttoTimers[currentUser.uid];
                        if (timer) {
                          return (
                            <>This account will expire in <strong style={{ color: getTimerStatusColor(timer.status) }}>
                              {formatRemainingTime(timer.remaining)}
                            </strong>.</>
                          );
                        } else {
                          const expirationDate = new Date(effectiveTo);
                          return (
                            <>This account will expire on <strong>
                              {expirationDate.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </strong>.</>
                          );
                        }
                      } else {
                        return <>This is a temporary account. <strong style={{ color: '#f59e0b' }}>Expiration date not configured.</strong></>;
                      }
                    })()}
                  </div>
                  <div className="tto-floating-subtitle">
                    {(() => {
                      const effectiveTo = currentUser.effectiveTo || currentUser.temporaryEffectiveTo || currentUser.expirationDate;
                      if (effectiveTo) {
                        const timer = ttoTimers[currentUser.uid];
                        if (timer) {
                          return (
                            <>After expiration, access will be automatically restricted. {formatFullExpirationDetails(currentUser, timer)}</>
                          );
                        } else {
                          return <>After this date, access will be automatically restricted.</>;
                        }
                      } else {
                        return (
                          <>
                            <strong>Action Required:</strong> The Super Admin needs to set an expiration date for this temporary account. 
                            Without an expiration date, this account will remain active indefinitely.
                          </>
                        );
                      }
                    })()}
                  </div>
                </div>
                <button 
                  className="tto-floating-close"
                  onClick={() => {
                    // Hide banner for this session
                    setTtoBannerShown(false);
                  }}
                  aria-label="Close warning banner"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          
          <section className="dashboard">
            <div className="dashboard-top-row">
              <div className="main-box">
                {chartIndex === 0 ? (
                  <ReportsChart />
                ) : (
                  <PondsAtRiskStackedChart onDrilldown={openDrilldown} onLoadingChange={setChartLoading} onGroupModeChange={setChartGroupMode} />
                )}
                <button className={`next-chart-btn ${chartLoading ? 'loading' : ''} ${chartGroupMode === 'risk' ? 'risk-view' : ''} ${chartIndex === 0 ? 'reports-chart' : 'ponds-chart'}`} onClick={nextChart} aria-label={chartIndex === 0 ? "Next chart" : "Previous chart"}>
                  {chartIndex === 0 ? "←" : "→"}
                </button>
              </div>

              <div className="right-sidebar">
                <div className="pie-chart-box">
                <FarmHealthGauge />
                </div>
                {/* 
                <div className="calendar-box">
                    <ConditionInsights 
                      userRole={currentUser?.role}
                      assignedFarm={currentUser?.farm}
                    />
                </div>
                */}
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
        </div>
        
      </div>
  );
};

export default PiscaRiskHome;
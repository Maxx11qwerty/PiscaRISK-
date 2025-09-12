import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, doc, orderBy, Timestamp, updateDoc } from 'firebase/firestore';
import { logActivity, logMessages } from '../utils/logger';
import { FaWater, FaFish, FaCloud, FaCalendarAlt, FaChevronDown, FaChevronRight, FaFilter, FaExclamationTriangle } from 'react-icons/fa';
import AnimatedModal from './AnimatedModal';
import { FaFileExport } from 'react-icons/fa6';
import { 
  exportFishConditionCSV, 
  exportFishConditionPDF, 
  exportFishConditionWithLogsCSV,
  exportFishConditionWithLogsPDF
} from '../utils/exportFishCondition';
import StockFeedLogs from './StockFeedLogs';
import { AuthContext } from '../contexts/AuthContext';
import './PondCondition.css';

const PondConditionDashboard = ({ isModal = false, selectedPond: propSelectedPond, setSelectedPond: propSetSelectedPond, navigationState = null }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useContext(AuthContext);
  
  console.log('PondConditionDashboard rendered with props:', {
    isModal,
    propSelectedPond,
    navigationState,
    locationState: location.state
  });
  const [selectedPond, setSelectedPond] = useState(propSelectedPond || 'all');
  const [selectedFarmId, setSelectedFarmId] = useState('all');
  const [notificationFarmFilter, setNotificationFarmFilter] = useState(null);
  const [isProcessingNotification, setIsProcessingNotification] = useState(false);
  const [pondOptions, setPondOptions] = useState([1,2,3,4,5,6,7,8,9,10]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reportFilter, setReportFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [farms, setFarms] = useState([]);
  const [reportsByFarm, setReportsByFarm] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedFarms, setExpandedFarms] = useState(new Set());
  const [openLogsModal, setOpenLogsModal] = useState(null); // { farmId, farmName }
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Ensure pond filter defaults to 'all' when opened as a modal
  useEffect(() => {
    if (isModal) {
      setSelectedPond('all');
    }
  }, [isModal]);

  // Handle navigation state from notifications
  useEffect(() => {
    const state = navigationState || location.state;
    console.log('Navigation state effect triggered:', state);
    if (state?.fromNotification) {
      console.log('Processing notification state:', {
        selectedPond: state.selectedPond,
        farmFilter: state.farmFilter,
        farmName: state.farmName
      });
      setIsProcessingNotification(true);
      if (state.selectedPond) {
        setSelectedPond(state.selectedPond);
      }
      if (state.farmFilter) {
        setNotificationFarmFilter(state.farmFilter);
        console.log('Stored notification farm filter:', state.farmFilter);
      }
      // Set a broader date filter when coming from notification to show more reports
      setReportFilter('last7days');
      console.log('Set report filter to last7days for notification');
      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }
  }, [navigationState, location.state]);

  // Handle farm filter from notification after farms are loaded
  useEffect(() => {
    console.log('Farm filter effect triggered:', {
      notificationFarmFilter,
      farmsLength: farms.length,
      farms: farms.map(f => ({ id: f.id, name: f.name }))
    });
    
    if (notificationFarmFilter && farms.length > 0) {
      // Find the farm by name and set the selectedFarmId
      const targetFarm = farms.find(farm => 
        farm.name === notificationFarmFilter || 
        farm.id === notificationFarmFilter
      );
      if (targetFarm) {
        setSelectedFarmId(targetFarm.id);
        console.log('Setting farm filter from notification:', targetFarm.name, targetFarm.id);
        // Clear the notification farm filter after applying
        setNotificationFarmFilter(null);
        // Mark notification processing as complete
        setIsProcessingNotification(false);
        console.log('Notification processing complete');
      } else {
        console.warn('Farm not found for filter:', notificationFarmFilter, 'Available farms:', farms.map(f => f.name));
        // Mark notification processing as complete even if farm not found
        setIsProcessingNotification(false);
      }
    }
  }, [farms, notificationFarmFilter]);

  // Update parent component if props are provided
  useEffect(() => {
    if (propSetSelectedPond) {
      propSetSelectedPond(selectedPond);
    }
  }, [selectedPond, propSetSelectedPond]);

  // Ensure selectedFarmId is set to user's assigned farm when available
  // But don't override if it's already set from a notification
  useEffect(() => {
    if (currentUser?.farm && !notificationFarmFilter) {
      setSelectedFarmId(currentUser.farm);
    }
  }, [currentUser?.farm, notificationFarmFilter]);


  // Monitor farms state changes
  useEffect(() => {
    console.log('Farms state changed:', farms);
    console.log('Farms state length:', farms.length);
    console.log('Farms state content:', JSON.stringify(farms, null, 2));
  }, [farms]);

  // Load farms and their reports (grouped by farm)
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        
        // Determine which farms to load based on user's farm assignment
        let farmsToLoad = [];
        
        if (currentUser?.farm && !notificationFarmFilter) {
          // User has a specific farm assigned - ONLY load that farm (unless coming from notification)
          console.log('User has assigned farm:', currentUser.farm);
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (farmDoc.exists()) {
            const farmData = farmDoc.data();
            console.log('Farm document data:', farmData);
            farmsToLoad = [{ id: farmDoc.id, ...farmData }];
            // Force the selected farm to user's assigned farm
            setSelectedFarmId(currentUser.farm);
            console.log('Loaded farm:', { id: farmDoc.id, name: farmData.name });
          } else {
            console.warn('User assigned farm not found in farms collection:', currentUser.farm);
            // Create a placeholder farm entry so the UI can still render
            farmsToLoad = [{ id: currentUser.farm, name: currentUser.farm, location: 'Assigned Farm' }];
            setSelectedFarmId(currentUser.farm);
            console.log('Created placeholder farm:', farmsToLoad[0]);
          }
        } else {
          // User has no farm assigned, is admin, or coming from notification - load all farms
          console.log('Loading all farms - user farm:', currentUser?.farm, 'notification farm filter:', notificationFarmFilter);
          const farmsSnap = await getDocs(collection(db, 'farms'));
          farmsToLoad = farmsSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
        }
        
        // Set farms state - this controls what farms are displayed in the UI
        console.log('About to set farms state with:', farmsToLoad);
        console.log('farmsToLoad length:', farmsToLoad.length);
        console.log('farmsToLoad content:', JSON.stringify(farmsToLoad, null, 2));
        setFarms(farmsToLoad);
        console.log('Farms to display:', farmsToLoad.map(f => ({ id: f.id, name: f.name })));
        console.log('Current user farm:', currentUser?.farm);

        // Fetch reports based on farm field in report data
        const nextReportsByFarm = {};
        let totalReports = [];
        
        if (currentUser?.farm) {
          // User has assigned farm - fetch reports by farm field
          console.log('Fetching reports for assigned farm:', currentUser.farm);
          
          // Try to get the farm name from the farm document
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          const farmName = farmDoc.exists() ? farmDoc.data().name : currentUser.farm;
          
          console.log('Querying reports with farm name:', farmName);
          
          // Query reports collection for reports with matching farm field
          let reportsSnapshot;
          try {
            const reportsRef = collection(db, 'reports');
            const farmQuery = query(reportsRef, where('farm', '==', farmName));
            reportsSnapshot = await getDocs(farmQuery);
            console.log(`Found ${reportsSnapshot.docs.length} reports in 'reports' collection for farm: ${farmName}`);
          } catch (error) {
            if (!reportsSnapshot) {
              console.log('No reports found in any collection for farm:', farmName);
              reportsSnapshot = { docs: [] };
            }
          }
          
                      const items = reportsSnapshot.docs.map(doc => {
              const data = doc.data();
              console.log('Processing report:', doc.id, 'for farm:', farmName, 'timestamp:', data.timestamp);

            // Normalize timestamp to Date regardless of Firestore Timestamp or stored string/number
            let normalizedDate = null;
            if (data.timestamp?.toDate) {
              normalizedDate = data.timestamp.toDate();
            } else if (typeof data.timestamp === 'number') {
              normalizedDate = new Date(data.timestamp);
            } else if (typeof data.timestamp === 'string') {
              const tryDate = new Date(data.timestamp);
              normalizedDate = isNaN(tryDate.getTime()) ? new Date() : tryDate;
            } else if (data.timestamp?.seconds) {
              normalizedDate = new Date(data.timestamp.seconds * 1000);
            } else {
              normalizedDate = new Date();
            }
            
            console.log('Normalized date for report:', doc.id, ':', normalizedDate.toDateString());

            return {
              id: doc.id,
              date: normalizedDate,
              farm: data.farm,
              pond: data.fish_pond,
              fish: data.fish_condition,
              water: data.water_condition,
              weather: data.weather,
              harvest: data.ready_for_harvest ? 'Ready' : 'Not Ready',
              notes: data.additional_notes,
              uid: data.uid,
              submittedBy: data.submitted_by,
              userRole: data.user_role,
              contact: data.user_contact,
              email: data.user_email,
              status: data.status,
              reviewedBy: data.reviewed_by || data.reviewedBy,
              reviewedAt: data.reviewed_at || data.reviewedAt,
              source: data.source || 'web',
              originalTimestamp: data.timestamp,
              __collection: 'reports'
            };
          });

          nextReportsByFarm[currentUser.farm] = { farm: { id: currentUser.farm, name: farmName }, reports: items };
          totalReports = totalReports.concat(items.map(r => ({ ...r, __farmId: currentUser.farm })));
          console.log(`Processed ${items.length} reports for farm ${farmName}`);
          
        } else {
          // User has no farm assignment - fetch all reports from all farms
          console.log('Fetching reports for all farms');
          
          for (const farm of farmsToLoad) {
            // Try both approaches: farm subcollection and reports collection
            let farmReports = [];
            
            // Only use reports collection with farm field (single source of truth)
            try {
              const reportsRef = collection(db, 'reports');
              const farmQuery = query(reportsRef, where('farm', '==', farm.name));
              const reportsSnapshot = await getDocs(farmQuery);
              const reportsFromCollection = reportsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, __collection: 'reports' }));
              console.log(`Found ${reportsFromCollection.length} reports in reports collection for ${farm.name}`);
              farmReports = reportsFromCollection;
            } catch (error) {
              console.log(`No reports collection found or error querying for ${farm.name}`);
            }
            
            const items = farmReports.map(report => {
              const data = report;
              console.log('Processing report:', data.id, 'for farm:', farm.name, 'data:', data);

              // Normalize timestamp to Date regardless of Firestore Timestamp or stored string/number
              let normalizedDate = null;
              if (data.timestamp?.toDate) {
                normalizedDate = data.timestamp.toDate();
              } else if (typeof data.timestamp === 'number') {
                normalizedDate = new Date(data.timestamp);
              } else if (typeof data.timestamp === 'string') {
                const tryDate = new Date(data.timestamp);
                normalizedDate = isNaN(tryDate.getTime()) ? new Date() : tryDate;
              } else if (data.timestamp?.seconds) {
                normalizedDate = new Date(data.timestamp.seconds * 1000);
              } else {
                normalizedDate = new Date();
              }

              return {
                id: data.id,
                date: normalizedDate,
                farm: data.farm,
                pond: data.fish_pond,
                fish: data.fish_condition,
                water: data.water_condition,
                weather: data.weather,
                harvest: data.ready_for_harvest ? 'Ready' : 'Not Ready',
                notes: data.additional_notes,
                uid: data.uid,
                submittedBy: data.submitted_by,
                userRole: data.user_role,
                contact: data.user_contact,
                email: data.user_email,
                status: data.status,
                reviewedBy: data.reviewed_by || data.reviewedBy,
                reviewedAt: data.reviewed_at || data.reviewedAt,
                source: data.source || 'web',
                originalTimestamp: data.timestamp
              };
            });

            nextReportsByFarm[farm.id] = { farm, reports: items };
            totalReports = totalReports.concat(items.map(r => ({ ...r, __farmId: farm.id })));
            console.log(`Processed ${items.length} reports for farm ${farm.name}`);
          }
        }

        // Deduplicate reports across all farms (same report might exist in multiple collections)
        const uniqueTotalReports = totalReports.filter((report, index, self) => 
          index === self.findIndex(r => r.id === report.id)
        );
        
        setReportsByFarm(nextReportsByFarm);
        setReports(uniqueTotalReports);
        console.log('Total reports loaded:', uniqueTotalReports.length, 'for farms:', farmsToLoad.map(f => f.name));
        console.log('Reports before deduplication:', totalReports.length, 'After deduplication:', uniqueTotalReports.length);
      } catch (error) {
        console.error('Error fetching reports:', error);
        logActivity('error', logMessages.error.database(`Error fetching reports: ${error.message}`), 'System');
      } finally {
        setLoading(false);
      }
    };
  
    fetchReports();
  }, [selectedPond, selectedFarmId, currentUser?.farm, notificationFarmFilter]);

  // Get and sort reports
  const allReports = [...reports].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter reports based on selected filter and pond selection
  const getFilteredReports = () => {
    console.log('=== FILTERING REPORTS ===');
    console.log('Total reports before filtering:', allReports.length);
    console.log('Selected filter:', reportFilter);
    console.log('Selected pond:', selectedPond);
    console.log('Custom date:', customDate);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const pondFilterVal = (selectedPond && selectedPond !== 'all') ? `Fish Pond ${selectedPond}` : null;
    console.log('Pond filter value:', pondFilterVal);

    let filteredResults = [];

    switch(reportFilter) {
      case 'today':
        console.log('Filtering for TODAY:', today.toDateString());
        filteredResults = allReports.filter(report => {
          const reportDate = new Date(report.date);
          const reportDateString = reportDate.toDateString();
          const matchesDate = reportDateString === today.toDateString();
          const matchesPond = !pondFilterVal || report.pond === pondFilterVal;
          console.log(`Report ${report.id}: date=${reportDateString}, pond=${report.pond}, matchesDate=${matchesDate}, matchesPond=${matchesPond}`);
          return matchesDate && matchesPond;
        });
        break;
        
      case 'last7days':
        console.log('Filtering for LAST 7 DAYS:', sevenDaysAgo.toDateString(), 'to', today.toDateString());
        filteredResults = allReports.filter(report => {
          const reportDate = new Date(report.date);
          const matchesDate = reportDate >= sevenDaysAgo;
          const matchesPond = !pondFilterVal || report.pond === pondFilterVal;
          console.log(`Report ${report.id}: date=${reportDate.toDateString()}, pond=${report.pond}, matchesDate=${matchesDate}, matchesPond=${matchesPond}`);
          return matchesDate && matchesPond;
        });
        break;
        
      case 'custom':
        if (!customDate) {
          console.log('No custom date selected');
          return [];
        }
        const selectedCustomDate = new Date(customDate);
        selectedCustomDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedCustomDate);
        nextDay.setDate(nextDay.getDate() + 1);
        console.log('Filtering for CUSTOM DATE:', selectedCustomDate.toDateString(), 'to', nextDay.toDateString());
        filteredResults = allReports.filter(report => {
          const reportDate = new Date(report.date);
          const matchesDate = reportDate >= selectedCustomDate && reportDate < nextDay;
          const matchesPond = !pondFilterVal || report.pond === pondFilterVal;
          console.log(`Report ${report.id}: date=${reportDate.toDateString()}, pond=${report.pond}, matchesDate=${matchesDate}, matchesPond=${matchesPond}`);
          return matchesDate && matchesPond;
        });
        break;
        
      default:
        console.log('No date filter applied');
        filteredResults = allReports.filter(report => {
          const matchesPond = !pondFilterVal || report.pond === pondFilterVal;
          console.log(`Report ${report.id}: pond=${report.pond}, matchesPond=${matchesPond}`);
          return matchesPond;
        });
    }
    
    console.log('Filtered results count:', filteredResults.length);
    console.log('=== END FILTERING ===');
    return filteredResults;
  };

  const filteredReports = getFilteredReports();

  const toggleExpanded = (farmId) => {
    const newExpanded = new Set(expandedFarms);
    const isExpanding = !newExpanded.has(farmId);
    if (newExpanded.has(farmId)) {
      newExpanded.delete(farmId);
    } else {
      newExpanded.add(farmId);
    }
    setExpandedFarms(newExpanded);
    try { 
      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
      const farm = farms.find(f => f.id === farmId);
      const farmName = farm?.name || 'Unknown Farm';
      logActivity('report', `Farm ${farmName} ${isExpanding ? 'expanded' : 'collapsed'} to view reports`, u); 
    } catch (_) {}
  };

  const markReportAsReviewed = async (report, farmContext) => {
    try {
      const reviewerName = currentUser?.fullName || currentUser?.displayName || currentUser?.email || currentUser?.uid || 'Unknown Reviewer';
      const reviewedAtIso = new Date().toISOString();

      // Optimistic UI update: update local states first
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'Reviewed', reviewedBy: reviewerName, reviewedAt: reviewedAtIso } : r));
      setReportsByFarm(prev => {
        const next = { ...prev };
        const group = next[farmContext?.id || farmContext] || next[report.__farmId];
        if (group) {
          group.reports = group.reports.map(r => r.id === report.id ? { ...r, status: 'Reviewed', reviewedBy: reviewerName, reviewedAt: reviewedAtIso } : r);
        }
        return next;
      });

      // Single source of truth: only update main reports collection
      const mainDocRef = doc(db, 'reports', report.id);
      const updates = [updateDoc(mainDocRef, {
        status: 'Reviewed',
        reviewed_by: reviewerName,
        reviewed_at: Timestamp.now()
      })];

      const results = await Promise.allSettled(updates);
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        // Fallback: try to find the report in 'reports' by strong identifiers (farm, pond, timestamp)
        try {
          const reportsRef = collection(db, 'reports');
          const q = query(
            reportsRef,
            where('farm', '==', report.farm || report?.farm),
            where('fish_pond', '==', report.pond || report?.pond)
          );
          const snap = await getDocs(q);
          // Try to match by timestamp equality if available
          const targetTs = report.originalTimestamp;
          let matchedDoc = null;
          if (snap && !snap.empty) {
            matchedDoc = snap.docs.find(d => {
              const data = d.data() || {};
              const ts = data.timestamp;
              if (!targetTs || !ts) return false;
              if (typeof ts?.toDate === 'function' && typeof targetTs?.toDate === 'function') {
                return ts.toDate().getTime() === targetTs.toDate().getTime();
              }
              if (ts?.seconds && targetTs?.seconds) {
                return ts.seconds === targetTs.seconds && ts.nanoseconds === targetTs.nanoseconds;
              }
              // Fallback: string/number compare
              return String(ts) === String(targetTs);
            }) || snap.docs[0];
          }

          if (matchedDoc) {
            await updateDoc(doc(db, 'reports', matchedDoc.id), {
              status: 'Reviewed',
              reviewed_by: reviewerName,
              reviewed_at: Timestamp.now()
            });
            try { logActivity('report', `Report marked as reviewed for ${report.pond || 'Unknown Pond'}`, currentUser?.username || currentUser?.email || 'Unknown'); } catch (_) {}
            return;
          }
        } catch (e) {
          // fall through to final throw
        }

        throw new Error('Failed to update report status in any known location');
      }
      try { logActivity('report', `Report marked as reviewed for ${report.pond || 'Unknown Pond'}`, currentUser?.username || currentUser?.email || 'Unknown'); } catch (_) {}
    } catch (error) {
      console.error('Failed to mark report as reviewed:', error);
      // Revert optimistic update on error
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: report.status, reviewedBy: report.reviewedBy, reviewedAt: report.reviewedAt } : r));
      setReportsByFarm(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(fid => {
          next[fid] = {
            ...next[fid],
            reports: next[fid].reports.map(r => r.id === report.id ? { ...r, status: report.status, reviewedBy: report.reviewedBy, reviewedAt: report.reviewedAt } : r)
          };
        });
        return next;
      });
    }
  };

  const getConditionIcon = (condition) => {
    if (condition?.toLowerCase().includes('good') || condition?.toLowerCase().includes('healthy')) {
      return <span className="condition-icon healthy">✓</span>;
    } else if (condition?.toLowerCase().includes('fair') || condition?.toLowerCase().includes('moderate')) {
      return <span className="condition-icon moderate">~</span>;
    } else if (condition?.toLowerCase().includes('poor') || condition?.toLowerCase().includes('unhealthy')) {
      return <span className="condition-icon poor">⚠</span>;
    }
    return <span className="condition-icon">-</span>;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else if (timestamp instanceof Date) {
        return timestamp.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        return new Date(timestamp).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Helper function to get the user's assigned farm name
  const getUserAssignedFarmName = () => {
    if (!currentUser?.farm) return null;
    
    console.log('Getting farm name for user farm ID:', currentUser.farm);
    console.log('Available farms:', farms.map(f => ({ id: f.id, name: f.name })));
    
    // First try to find in the farms array
    const farmFromArray = farms.find(f => f.id === currentUser.farm);
    if (farmFromArray) {
      console.log('Found farm in array:', farmFromArray.name);
      return farmFromArray.name;
    }
    
    // If not found in array, return the farm ID as fallback
    console.log('Farm not found in array, returning ID as fallback');
    return currentUser.farm;
  };

  // Helper function to get the count of reports for user's assigned farm
  const getAssignedFarmReportCount = () => {
    if (!currentUser?.farm) return 0;
    
    const farmReports = reportsByFarm[currentUser.farm]?.reports || [];
    return farmReports.length;
  };

  if (loading || isProcessingNotification) {
    return (
      <div className="pond-condition-container">
        <div className="loading-state">
          <FaExclamationTriangle className="loading-icon" />
          <h3>{isProcessingNotification ? 'Processing notification...' : t('pondCondition.loading_reports')}</h3>
          <p>{isProcessingNotification ? 'Setting up farm and pond filters...' : t('pondCondition.fetching_latest_data')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`pond-condition-container ${isModal ? 'modal-view' : ''}`}>
      <div className="pond-report-header">
        <div className="header-content">
          <FaWater className="header-icon" />
          <h2>{t('pondCondition.pond_condition_reports')}</h2>
          <p className="header-subtitle">
            {currentUser?.farm ? 
              `${t('pondCondition.comprehensive_overview')} - ${getUserAssignedFarmName() || 'Assigned Farm'}` : 
              t('pondCondition.comprehensive_overview')
            }
          </p>

        </div>
        
        <div className="report-summary">
          <div className="summary-item">
            <FaFish className="summary-icon" />
            <span className="summary-count">
              {currentUser?.farm ? getAssignedFarmReportCount() : allReports.length}
            </span>
            <span className="summary-label">
              {currentUser?.farm ? `${t('pondCondition.total_reports')} (${getUserAssignedFarmName()})` : t('pondCondition.total_reports')}
            </span>
          </div>
        </div>
      </div>

      <div className="filter-section">
        {!currentUser?.farm ? (
          <div className="filter-group">
            <label>{t('pondCondition.farm')}:</label>
            <select 
              value={selectedFarmId} 
              onChange={(e) => setSelectedFarmId(e.target.value)}
              className="filter-select"
            >
              <option value="all">{t('pondCondition.all_farms')}</option>
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name || t('pondCondition.unnamed_farm')}{f.location ? ` — ${f.location}` : ''}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="filter-group">
            <label>{t('pondCondition.farm')}:</label>
            <div className="assigned-farm-display">
              <span className="assigned-farm-text">
                {getUserAssignedFarmName() || 'Your Assigned Farm'}
              </span>
            </div>
          </div>
        )}
        
        <div className="filter-group">
          <label>{t('pondCondition.pond')}:</label>
          <select 
            value={selectedPond} 
            onChange={(e) => setSelectedPond(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="filter-select"
          >
            <option value="all">{t('pondCondition.all_ponds')}</option>
            {pondOptions.map(n => (
              <option key={n} value={n}>{`${t('pondCondition.pond')} ${n}`}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>{t('pondCondition.date_range')}:</label>
          <select 
            value={reportFilter} 
            onChange={(e) => setReportFilter(e.target.value)}
            className="filter-select"
          >
            <option value="today">{t('pondCondition.today')}</option>
            <option value="last7days">{t('pondCondition.last_7_days')}</option>
            <option value="custom">{t('pondCondition.custom_date')}</option>
          </select>
        </div>
        <div className="filter-group" style={{ alignSelf: 'end', position: 'relative' }}>
          <label style={{ visibility: 'hidden' }}>Export</label>
          <button
            onClick={(e) => { e.stopPropagation(); setExportMenuOpen((v) => !v); }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              color: '#1A4375',
              cursor: 'pointer',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <FaFileExport />
            <span style={{ textDecoration: 'underline' }}>Export</span>
          </button>
          {exportMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                zIndex: 5,
                minWidth: 180,
                overflow: 'hidden'
              }}
            >
              <button
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                  onClick={(e) => {
                    e.stopPropagation();
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('export', logMessages.export.csvDownload(u, 'fishpond condition data with logs'), u); 
                    } catch (_) {}
                    exportFishConditionWithLogsCSV(
                      filteredReports,
                      { farmId: selectedFarmId !== 'all' ? selectedFarmId : null, farmName: getUserAssignedFarmName(), reportFilter, customDate },
                      'fishpond_combined.csv'
                    );
                    setExportMenuOpen(false);
                  }}
              >
                Export CSV
              </button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                  onClick={(e) => {
                    e.stopPropagation();
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('export', logMessages.export.pdfDownload(u, 'fishpond condition data with logs'), u); 
                    } catch (_) {}
                    exportFishConditionWithLogsPDF(
                      filteredReports,
                      { farmId: selectedFarmId !== 'all' ? selectedFarmId : null, farmName: getUserAssignedFarmName(), reportFilter, customDate },
                      'fishpond_combined.pdf'
                    );
                    setExportMenuOpen(false);
                  }}
              >
                Export PDF
              </button>
            </div>
          )}
        </div>
        
        {reportFilter === 'custom' && (
          <div className="filter-group">
            <label>{t('pondCondition.select_date')}:</label>
            <input 
              type="date" 
              value={customDate} 
              onChange={(e) => setCustomDate(e.target.value)}
              className="filter-select"
            />
          </div>
        )}
      </div>

      <div className="farm-cards-list">
        {farms.length === 0 ? (
          <div className="no-reports">
            <FaExclamationTriangle className="no-reports-icon" />
            <h3>{t('pondCondition.no_farms_found')}</h3>
            <p>{t('pondCondition.no_farms_match_criteria')}</p>
          </div>
        ) : (
          farms
            .filter(farm => {
              console.log('Filtering farm:', farm.name, 'selectedFarmId:', selectedFarmId, 'currentUser.farm:', currentUser?.farm);
              // If selectedFarmId is set (e.g., from notification), filter by that first
              if (selectedFarmId && selectedFarmId !== 'all') {
                const matches = farm.id === selectedFarmId;
                console.log('Farm', farm.name, 'matches selectedFarmId:', matches);
                return matches;
              }
              // If user has a farm assignment, only show that farm
              if (currentUser?.farm) {
                const matches = farm.id === currentUser.farm;
                console.log('Farm', farm.name, 'matches user farm:', matches);
                return matches;
              }
              // If user has no farm assignment, show all farms
              console.log('Farm', farm.name, 'showing all farms');
              return true;
            })
            .map((farm) => {
            console.log('Rendering farm card for:', farm.id, farm.name);
            console.log('Available reportsByFarm keys:', Object.keys(reportsByFarm));
            const group = reportsByFarm[farm.id];
            console.log('Group for farm', farm.id, ':', group);
            const farmReports = group?.reports || [];
            console.log('Farm reports count:', farmReports.length);
            
            // Apply filters to farm reports
            const visibleReports = (() => {
              console.log('Filtering farm reports for farm:', farm.name);
              console.log('Total farm reports before filtering:', farmReports.length);
              console.log('Selected filter:', reportFilter);
              console.log('Selected pond:', selectedPond);
              console.log('Custom date:', customDate);
              
              const today = new Date(); today.setHours(0,0,0,0);
              const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); sevenDaysAgo.setHours(0,0,0,0);
              const pondFilterVal = (selectedPond && selectedPond !== 'all') ? `Fish Pond ${selectedPond}` : null;
              
              let filteredReports = [];
              
              switch (reportFilter) {
                case 'today':
                  console.log('Filtering for TODAY:', today.toDateString());
                  filteredReports = farmReports.filter(r => {
                    const reportDate = new Date(r.date);
                    const matchesDate = reportDate.toDateString() === today.toDateString();
                    const matchesPond = !pondFilterVal || r.pond === pondFilterVal;
                    console.log(`Report ${r.id}: date=${reportDate.toDateString()}, pond=${r.pond}, matchesDate=${matchesDate}, matchesPond=${matchesPond}`);
                    return matchesDate && matchesPond;
                  });
                  break;
                case 'last7days':
                  console.log('Filtering for LAST 7 DAYS');
                  filteredReports = farmReports.filter(r => {
                    const reportDate = new Date(r.date);
                    const matchesDate = reportDate >= sevenDaysAgo;
                    const matchesPond = !pondFilterVal || r.pond === pondFilterVal;
                    return matchesDate && matchesPond;
                  });
                  break;
                case 'custom':
                  if (!customDate) return [];
                  const d0 = new Date(customDate); d0.setHours(0,0,0,0);
                  const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
                  console.log('Filtering for CUSTOM DATE:', d0.toDateString(), 'to', d1.toDateString());
                  filteredReports = farmReports.filter(r => {
                    const reportDate = new Date(r.date);
                    const matchesDate = reportDate >= d0 && reportDate < d1;
                    const matchesPond = !pondFilterVal || r.pond === pondFilterVal;
                    return matchesDate && matchesPond;
                  });
                  break;
                default:
                  console.log('No date filter applied - showing all reports');
                  filteredReports = pondFilterVal ? farmReports.filter(r => r.pond === pondFilterVal) : farmReports;
                  console.log('Default filter - showing all reports for farm:', farm.name, 'count:', filteredReports.length);
              }
              
              console.log('Visible reports count after filtering:', filteredReports.length);
              return filteredReports;
            })();

            console.log('Visible reports for farm', farm.name, ':', visibleReports.length);
            // Show farm card even if no reports match current filter, but show message
            if (visibleReports.length === 0 && selectedFarmId !== 'all') {
              console.log('No visible reports for farm, but showing card anyway');
            }

            return (
              <div key={farm.id} className="farm-report-card">
                <div className={`farm-summary-view ${expandedFarms.has(farm.id) ? 'expanded' : ''}`} onClick={() => toggleExpanded(farm.id)}>
                  <div className="summary-content">
                    <div className="summary-title">
                      <h3 className="farm-title">
                        {farm.name || t('pondCondition.unnamed_farm')} 
                        <span className="farm-location">{farm.location ? ` — ${farm.location}` : ''}</span>
                      </h3>
                      <div className="summary-meta">
                        <span className="report-count">{visibleReports.length} {t('pondCondition.report_s')}</span>
                        <span className="timestamp">
                          <FaCalendarAlt className="time-icon" />
                          {t('pondCondition.latest')}: {visibleReports.length > 0 ? formatTimestamp(visibleReports[0].date) : t('pondCondition.no_reports')}
                        </span>
                        <button
                          className="logs-link-btn"
                          style={{ marginLeft: 8 }}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            try { 
                              const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                              logActivity('report', `View Stock & Feed Logs opened for farm ${farm.name}`, u); 
                            } catch (_) {}
                            setOpenLogsModal({ farmId: farm.id, farmName: farm.name }); 
                          }}
                        >
                          View Stock & Feed Logs
                        </button>
                      </div>
                    </div>
                    <div className="summary-indicators">
                      <div className="expand-icon">
                        {expandedFarms.has(farm.id) ? <FaChevronDown /> : <FaChevronRight />}
                      </div>
                    </div>
                  </div>
                </div>
                
                {expandedFarms.has(farm.id) && (
                  <div className="farm-detail-view">
                    {visibleReports.length === 0 ? (
                      <div className="no-reports">
                        <p>{t('pondCondition.no_reports_for_selected_filters')}</p>
                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '10px' }}>
                          Debug: Total farm reports: {farmReports.length} | Filter: {reportFilter} | Pond: {selectedPond}
                        </p>
                      </div>
                    ) : (
                      visibleReports.map((report) => (
                        <div key={report.id} className="report-detail-card" onMouseEnter={() => { try { logActivity('report', logMessages.report.reportView(currentUser?.username || 'Unknown', report.pond || 'Unknown')); } catch (_) {} }}>
                          <div className="report-header">
                            <div className="report-header-left">
                              <span className="pond-badge">{report.pond || t('pondCondition.unknown_pond')}</span>
                              <span className={`status-badge ${String(report.status||'').toLowerCase().replace(/\s+/g,'-')}`}>{report.status || '—'}</span>
                              {String(report.status || '').toLowerCase() === 'pending' && (
                                <button
                                  className="mark-reviewed-btn"
                                  onClick={(e) => { e.stopPropagation(); markReportAsReviewed(report, farm); }}
                                  title="Mark this report as reviewed"
                                >
                                  Mark as Reviewed
                                </button>
                              )}
                              <span className={`harvest-badge ${report.harvest === 'Ready' ? 'ready' : 'not-ready'}`}>{report.harvest === 'Ready' ? t('pondCondition.harvest_ready') : t('pondCondition.not_ready')}</span>
                            </div>
                            <span className="report-date">{formatTimestamp(report.date)}</span>
                          </div>
                          
                          <div className="report-content">
                            <div className="condition-grid">
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.fish_condition')}</span>
                                <span className="condition-value">
                                  {getConditionIcon(report.fish)}
                                  {report.fish || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.water_condition')}</span>
                                <span className="condition-value">
                                  {getConditionIcon(report.water)}
                                  {report.water || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.weather')}</span>
                                <span className="condition-value">
                                  <FaCloud className="weather-icon" />
                                  {report.weather || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.harvest')}</span>
                                <span className="condition-value">
                                  {report.harvest === 'Ready' ? t('pondCondition.yes') : t('pondCondition.no')}</span>
                              </div>
                            </div>
                            
                            <div className="report-meta">
                              <div className="meta-item">
                                <span className="meta-label">{t('pondCondition.submitted_by')}</span>
                                <span className="meta-value">{report.submittedBy || '—'}{report.userRole ? ` (${report.userRole})` : ''}</span>
                              </div>
                              {(report.reviewedBy || report.reviewedAt) && (
                                <div className="meta-item">
                                  <span className="meta-label">Reviewed</span>
                                  <span className="meta-value">
                                    {report.reviewedBy ? `by ${report.reviewedBy}` : ''}
                                    {report.reviewedAt ? ` on ${formatTimestamp(report.reviewedAt)}` : ''}
                                  </span>
                                </div>
                              )}
                              {report.contact || report.email ? (
                                <div className="meta-item">
                                  <span className="meta-label">{t('pondCondition.contact')}</span>
                                  <span className="meta-value">{[report.contact, report.email].filter(Boolean).join(' | ') || '—'}</span>
                                </div>
                              ) : null}
                            </div>
                            
                            {report.notes && (
                              <div className="report-notes">
                                <span className="notes-label">{t('pondCondition.additional_notes')}:</span>
                                <p className="notes-content">{report.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <AnimatedModal
        isOpen={!!openLogsModal}
        onClose={() => setOpenLogsModal(null)}
        title={openLogsModal ? `Stock & Feed Logs — ${openLogsModal.farmName || ''}` : ''}
        icon={<FaFish />}
      >
        {openLogsModal && (
          <StockFeedLogs farmId={openLogsModal.farmId} farmName={openLogsModal.farmName} />
        )}
      </AnimatedModal>
    </div>
  );
};

export default PondConditionDashboard;
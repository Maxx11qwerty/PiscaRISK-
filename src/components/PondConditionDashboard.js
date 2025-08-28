import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { logActivity, logMessages } from '../utils/logger';
import { FaWater, FaFish, FaCloud, FaCalendarAlt, FaChevronDown, FaChevronRight, FaFilter, FaExclamationTriangle } from 'react-icons/fa';
import './PondCondition.css';

const PondConditionDashboard = ({ isModal = false, selectedPond: propSelectedPond, setSelectedPond: propSetSelectedPond }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedPond, setSelectedPond] = useState(propSelectedPond || 'all');
  const [selectedFarmId, setSelectedFarmId] = useState('all');
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

  // Handle navigation state from notifications
  useEffect(() => {
    if (location.state?.fromNotification) {
      if (location.state.selectedPond) {
        setSelectedPond(location.state.selectedPond);
      }
      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Update parent component if props are provided
  useEffect(() => {
    if (propSetSelectedPond) {
      propSetSelectedPond(selectedPond);
    }
  }, [selectedPond, propSetSelectedPond]);

  // Load farms and their reports (grouped by farm)
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        // Load farms
        const farmsSnap = await getDocs(collection(db, 'farms'));
        const farmItems = farmsSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
        setFarms(farmItems);

        // For each farm, load its reports subcollection
        const nextReportsByFarm = {};
        let totalReports = [];
        for (const farm of farmItems) {
          if (selectedFarmId !== 'all' && farm.id !== selectedFarmId) continue;
          const farmReportsRef = collection(db, 'farms', farm.id, 'reports');

          const rsnap = await getDocs(farmReportsRef);
          const items = rsnap.docs.map(doc => {
            const data = doc.data();

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
              source: data.source || 'web'
            };
          });

          nextReportsByFarm[farm.id] = { farm, reports: items };
          totalReports = totalReports.concat(items.map(r => ({ ...r, __farmId: farm.id })));
        }

        setReportsByFarm(nextReportsByFarm);
        setReports(totalReports);
      } catch (error) {
        console.error('Error fetching reports:', error);
        logActivity('error', logMessages.error.database(`Error fetching reports: ${error.message}`), 'System');
      } finally {
        setLoading(false);
      }
    };
  
    fetchReports();
  }, [selectedPond, selectedFarmId]);

  // Get and sort reports
  const allReports = [...reports].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter reports based on selected filter and pond selection
  const getFilteredReports = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const pondFilterVal = (selectedPond && selectedPond !== 'all') ? `Fish Pond ${selectedPond}` : null;

    switch(reportFilter) {
      case 'today':
        return allReports.filter(report => 
          new Date(report.date).toDateString() === today.toDateString() && (!pondFilterVal || report.pond === pondFilterVal)
        );
      case 'last7days':
        return allReports.filter(report => 
          new Date(report.date) >= sevenDaysAgo && (!pondFilterVal || report.pond === pondFilterVal)
        );
      case 'custom':
        if (!customDate) return [];
        const selectedCustomDate = new Date(customDate);
        selectedCustomDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedCustomDate);
        nextDay.setDate(nextDay.getDate() + 1);
        return allReports.filter(report => {
          const reportDate = new Date(report.date);
          return reportDate >= selectedCustomDate && reportDate < nextDay && (!pondFilterVal || report.pond === pondFilterVal);
        });
      default:
        return allReports.filter(report => (!pondFilterVal || report.pond === pondFilterVal));
    }
  };

  const filteredReports = getFilteredReports();

  const toggleExpanded = (farmId) => {
    const newExpanded = new Set(expandedFarms);
    if (newExpanded.has(farmId)) {
      newExpanded.delete(farmId);
    } else {
      newExpanded.add(farmId);
    }
    setExpandedFarms(newExpanded);
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

  if (loading) {
    return (
      <div className="pond-condition-container">
        <div className="loading-state">
          <FaExclamationTriangle className="loading-icon" />
          <h3>Loading Pond Reports...</h3>
          <p>Fetching latest data from the system</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`pond-condition-container ${isModal ? 'modal-view' : ''}`}>
      <div className="pond-report-header">
        <div className="header-content">
          <FaWater className="header-icon" />
          <h2>Pond Condition Reports</h2>
          <p className="header-subtitle">Comprehensive overview of fishpond conditions and reports</p>
        </div>
        
        <div className="report-summary">
          <div className="summary-item">
            <FaFish className="summary-icon" />
            <span className="summary-count">{allReports.length}</span>
            <span className="summary-label">Total Reports</span>
          </div>
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-group">
          <label>Farm:</label>
          <select 
            value={selectedFarmId} 
            onChange={(e) => setSelectedFarmId(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Farms</option>
            {farms.map(f => (
              <option key={f.id} value={f.id}>{f.name || 'Unnamed Farm'}{f.location ? ` — ${f.location}` : ''}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Pond:</label>
          <select 
            value={selectedPond} 
            onChange={(e) => setSelectedPond(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="filter-select"
          >
            <option value="all">All Ponds</option>
            {pondOptions.map(n => (
              <option key={n} value={n}>{`Pond ${n}`}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Date Range:</label>
          <select 
            value={reportFilter} 
            onChange={(e) => setReportFilter(e.target.value)}
            className="filter-select"
          >
            <option value="today">Today</option>
            <option value="last7days">Last 7 Days</option>
            <option value="custom">Custom Date</option>
          </select>
        </div>
        
        {reportFilter === 'custom' && (
          <div className="filter-group">
            <label>Select Date:</label>
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
            <h3>No Farms Found</h3>
            <p>No farms match the current filter criteria.</p>
          </div>
        ) : (
          farms.map((farm) => {
            const group = reportsByFarm[farm.id];
            const farmReports = group?.reports || [];
            
            // Apply filters to farm reports
            const visibleReports = (() => {
              const today = new Date(); today.setHours(0,0,0,0);
              const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); sevenDaysAgo.setHours(0,0,0,0);
              const pondFilterVal = (selectedPond && selectedPond !== 'all') ? `Fish Pond ${selectedPond}` : null;
              
              switch (reportFilter) {
                case 'today':
                  return farmReports.filter(r => new Date(r.date).toDateString() === today.toDateString() && (!pondFilterVal || r.pond === pondFilterVal));
                case 'last7days':
                  return farmReports.filter(r => new Date(r.date) >= sevenDaysAgo && (!pondFilterVal || r.pond === pondFilterVal));
                case 'custom':
                  if (!customDate) return [];
                  const d0 = new Date(customDate); d0.setHours(0,0,0,0);
                  const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
                  return farmReports.filter(r => new Date(r.date) >= d0 && new Date(r.date) < d1 && (!pondFilterVal || r.pond === pondFilterVal));
                default:
                  return pondFilterVal ? farmReports.filter(r => r.pond === pondFilterVal) : farmReports;
              }
            })();

            if (visibleReports.length === 0 && selectedFarmId !== 'all') return null;

            return (
              <div key={farm.id} className="farm-report-card">
                <div className={`farm-summary-view ${expandedFarms.has(farm.id) ? 'expanded' : ''}`} onClick={() => toggleExpanded(farm.id)}>
                  <div className="summary-content">
                    <div className="summary-title">
                      <h3 className="farm-title">
                        {farm.name || 'Unnamed Farm'} 
                        <span className="farm-location">{farm.location ? ` — ${farm.location}` : ''}</span>
                      </h3>
                      <div className="summary-meta">
                        <span className="report-count">{visibleReports.length} report(s)</span>
                        <span className="timestamp">
                          <FaCalendarAlt className="time-icon" />
                          Latest: {visibleReports.length > 0 ? formatTimestamp(visibleReports[0].date) : 'No reports'}
                        </span>
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
                      <div className="no-reports">No reports for selected filters</div>
                    ) : (
                      visibleReports.map((report) => (
                        <div key={report.id} className="report-detail-card">
                          <div className="report-header">
                            <div className="report-header-left">
                              <span className="pond-badge">{report.pond || 'Unknown Pond'}</span>
                              <span className={`status-badge ${String(report.status||'').toLowerCase().replace(/\s+/g,'-')}`}>{report.status || '—'}</span>
                              <span className={`harvest-badge ${report.harvest === 'Ready' ? 'ready' : 'not-ready'}`}>{report.harvest === 'Ready' ? 'Harvest Ready' : 'Not Ready'}</span>
                            </div>
                            <span className="report-date">{formatTimestamp(report.date)}</span>
                          </div>
                          
                          <div className="report-content">
                            <div className="condition-grid">
                              <div className="condition-item">
                                <span className="condition-label">Fish Condition</span>
                                <span className="condition-value">
                                  {getConditionIcon(report.fish)}
                                  {report.fish || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">Water Condition</span>
                                <span className="condition-value">
                                  {getConditionIcon(report.water)}
                                  {report.water || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">Weather</span>
                                <span className="condition-value">
                                  <FaCloud className="weather-icon" />
                                  {report.weather || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">Harvest</span>
                                <span className="condition-value">
                                  {report.harvest === 'Ready' ? 'Yes' : 'No'}
                                </span>
                              </div>
                            </div>
                            
                            <div className="report-meta">
                              <div className="meta-item">
                                <span className="meta-label">Submitted by</span>
                                <span className="meta-value">{report.submittedBy || '—'}{report.userRole ? ` (${report.userRole})` : ''}</span>
                              </div>
                              {report.contact || report.email ? (
                                <div className="meta-item">
                                  <span className="meta-label">Contact</span>
                                  <span className="meta-value">{[report.contact, report.email].filter(Boolean).join(' | ') || '—'}</span>
                                </div>
                              ) : null}
                            </div>
                            
                            {report.notes && (
                              <div className="report-notes">
                                <span className="notes-label">Additional Notes:</span>
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
    </div>
  );
};

export default PondConditionDashboard;
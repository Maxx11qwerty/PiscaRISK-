import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { logActivity, logMessages } from '../utils/logger';
import './PondCondition.css';

const PondConditionDashboard = ({ isModal = false, selectedPond: propSelectedPond, setSelectedPond: propSetSelectedPond }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedPond, setSelectedPond] = useState(propSelectedPond || 1);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reportFilter, setReportFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // Fetch reports from Firebase
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const reportsRef = collection(db, 'reports');
        
        // Create base query with sorting
        let q = query(
          reportsRef,
          orderBy('timestamp', 'desc')
        );
  
        // Only add pond filter if a specific pond is selected (and not "all")
        if (selectedPond && selectedPond !== 'all') {
          // Convert numeric selection to "Fish Pond X" format
          const pondFilter = `Fish Pond ${selectedPond}`;
          console.log("Filtering for pond:", pondFilter);
          
          q = query(
            reportsRef,
            where('fish_pond', '==', pondFilter),
            orderBy('timestamp', 'desc')
          );
        }
  
        const querySnapshot = await getDocs(q);
        const fetchedReports = querySnapshot.docs.map(doc => {
          const data = doc.data();
          
          // Note: Report logging should happen when reports are submitted, not when fetched
          // Logging here creates duplicate entries with wrong timestamps
          
          return {
            id: doc.id,
            date: data.timestamp.toDate(),
            fish: data.fish_condition,
            water: data.water_condition,
            weather: data.weather,
            harvest: data.ready_for_harvest ? 'Ready' : 'Not Ready',
            notes: data.additional_notes,
            uid: data.uid,
            pond: data.fish_pond,
            submittedBy: data.submitted_by,
            source: data.source || 'web'
          };
        });
  
        setReports(fetchedReports);
        
        // Debug output
        console.log(`Fetched ${fetchedReports.length} reports for pond ${selectedPond}`);
        if (fetchedReports.length > 0) {
          console.log("First report pond value:", fetchedReports[0].pond);
        }
      } catch (error) {
        console.error('Error fetching reports:', error);
        logActivity('error', logMessages.error.database(`Error fetching reports: ${error.message}`), 'System');
        
        // Handle specific error for missing index
        if (error.code === 'failed-precondition') {
          console.error('Missing Firestore index. Please create a composite index for fish_pond and timestamp');
          alert('Please create a Firestore index for fish_pond and timestamp to enable pond filtering');
        }
      } finally {
        setLoading(false);
      }
    };
  
    fetchReports();
  }, [selectedPond]);
  

  // Get and sort reports
  const allReports = [...reports].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter reports based on selected filter
  const getFilteredReports = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    switch(reportFilter) {
      case 'today':
        return allReports.filter(report => 
          new Date(report.date).toDateString() === today.toDateString()
        );
      case 'last7days':
        return allReports.filter(report => 
          new Date(report.date) >= sevenDaysAgo
        );
      case 'custom':
        if (!customDate) return [];
        const selectedCustomDate = new Date(customDate);
        selectedCustomDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedCustomDate);
        nextDay.setDate(nextDay.getDate() + 1);
        return allReports.filter(report => {
          const reportDate = new Date(report.date);
          return reportDate >= selectedCustomDate && reportDate < nextDay;
        });
      default:
        return allReports;
    }
  };

  const filteredReports = getFilteredReports();

  // Group reports by date
  const groupReportsByDate = (reports) => {
    const grouped = {};
    reports.forEach(report => {
      const dateStr = new Date(report.date).toLocaleDateString();
      if (!grouped[dateStr]) {
        grouped[dateStr] = [];
      }
      grouped[dateStr].push(report);
    });
    return grouped;
  };

  const groupedReports = groupReportsByDate(filteredReports);
  const groupedDates = Object.keys(groupedReports).sort((a, b) => new Date(b) - new Date(a));

  // Get current report (most recent)
  const currentReport = allReports[0] || {};

  if (loading) {
    return <div className="loading-reports">Loading reports...</div>;
  }

  return (
    <div className={`pond-condition-container ${isModal ? 'modal-view' : ''}`}>
      <div className="pond-report-header">
        <h3>{isModal ? 'Detailed Pond Report' : 'Latest Pond Reports'}</h3>
        <div className="header-controls">
          <div className="date-selector" onClick={() => setShowDatePicker(!showDatePicker)}>
            {selectedDate.toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
          {/* Pond Selector Card */}
        <div className="pond-selector-card">
          <div className="condition-label">Select Pond</div>
          <div className="pond-options-grid">
            {/* Numeric pond options */}
            {[1,2,3,4,5,6,7,8,9,10].map(num => (
              <div 
                key={num} 
                className={`pond-option ${num === selectedPond ? 'active' : ''}`}
                onClick={() => setSelectedPond(num)}
              >
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Current Report Summary */}
        <div className="current-report-summary">
          <div className="condition-label">Current Report Summary</div>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Fish Condition</span>
              <span className={`summary-value ${currentReport.fish ? currentReport.fish.toLowerCase().replace(' ', '-') : 'no-data'}`}>
                {currentReport.fish || 'No data available'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Water Condition</span>
              <span className={`summary-value ${currentReport.water ? currentReport.water.toLowerCase().replace(' ', '-') : 'no-data'}`}>
                {currentReport.water || 'No data available'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Weather</span>
              <span className={`summary-value ${currentReport.weather ? currentReport.weather.toLowerCase().replace(' ', '-') : 'no-data'}`}>
                {currentReport.weather || 'No data available'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Harvest Status</span>
              <span className={`summary-value ${currentReport.harvest ? currentReport.harvest.toLowerCase() : 'no-data'}`}>
                {currentReport.harvest || 'No data available'}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="notes-card">
          <div className="condition-label">Additional Notes</div>
          <div className="notes-content">
            {currentReport.notes || "No notes available"}
          </div>
        </div>
      </div>

      {/* Report History */}
      <div className="pond-history">
        <div className="history-header">
          <h4>Report History for Pond {selectedPond}</h4>
          <div className="filter-container">
            <div className="report-filter-new">
              <div className="filter-dropdown-new">
                <button 
                  className="filter-toggle-new" 
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                >
                  Filter Reports
                  <span className="dropdown-arrow-new">▼</span>
                </button>

                {isDropdownOpen && (
                  <div className="filter-options-new">
                    <label className="filter-option-new">
                      <input 
                        type="radio" 
                        name="reportFilter" 
                        value="today" 
                        checked={reportFilter === 'today'}
                        onChange={() => setReportFilter('today')}
                      />
                      <span>Today's Reports</span>
                    </label>
                    <label className="filter-option-new">
                      <input 
                        type="radio" 
                        name="reportFilter" 
                        value="last7days" 
                        checked={reportFilter === 'last7days'}
                        onChange={() => setReportFilter('last7days')}
                      />
                      <span>Last 7 Days</span>
                    </label>
                    <label className="filter-option-new">
                      <input 
                        type="radio" 
                        name="reportFilter" 
                        value="custom" 
                        checked={reportFilter === 'custom'}
                        onChange={() => setReportFilter('custom')}
                      />
                      <span>Custom Date</span>
                      {reportFilter === 'custom' && (
                        <div className="custom-date-picker-new">
                          <input 
                            type="date" 
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                          />
                        </div>
                      )}
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="history-list">
          {groupedDates.length > 0 ? (
            groupedDates.map((dateStr) => (
              <div key={dateStr} className="date-group">
                <div className="date-header">
                  {new Date(dateStr).toLocaleDateString([], { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
                {groupedReports[dateStr].map((report, index) => (
                  <div key={index} className="history-item">
                    <span className="time">
                      {new Date(report.date).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <span className={`status ${report.fish.toLowerCase().replace(' ', '-')}`}>
                      Fish: {report.fish}
                    </span>
                    <span className={`status ${report.water.toLowerCase().replace(' ', '-')}`}>
                      Water: {report.water}
                    </span>
                    {report.weather && (
                      <span className={`status ${report.weather.toLowerCase().replace(' ', '-')}`}>
                        Weather: {report.weather}
                      </span>
                    )}
                    {report.harvest && (
                      <span className={`status ${report.harvest.toLowerCase()}`}>
                        Harvest: {report.harvest}
                      </span>
                    )}
                    {report.notes && (
                      <div className="report-notes">
                        <span className="notes-content">{report.notes}</span>
                      </div>
                    )}
                    {report.submittedBy && (
                      <div className="report-submitter">
                        <span className="submitter-label">Submitted by: </span>
                        <span className="submitter-name">{report.submittedBy}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="no-reports">No reports available for the selected filter</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PondConditionDashboard;
import React, { useState, useEffect } from 'react';
import { FaExclamationTriangle, FaShieldAlt, FaThermometerHalf, FaWater, FaFish, FaClock, FaExclamationCircle, FaCloudRain, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query, where, Timestamp } from 'firebase/firestore';
import './RiskReportModal.css';

const RiskReportModal = ({ isModal = false }) => {
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState('last7days');
  const [selectedPond, setSelectedPond] = useState('all');
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [reportsByUid, setReportsByUid] = useState({});
  const [feedbackByUidAndPond, setFeedbackByUidAndPond] = useState({});
  const [availableWeatherOptions, setAvailableWeatherOptions] = useState([]);

  // Fetch predictions from Firebase with date filtering
  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        setLoading(true);
        const predictionsRef = collection(db, 'predictions');
        
        // Calculate date range
        const now = new Date();
        let startDate;
        
        switch (selectedDateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'last7days':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          default:
            startDate = new Date(0); // All time
        }
        
        // Create query with date filtering
        let q = query(
          predictionsRef,
          where('timestamp', '>=', Timestamp.fromDate(startDate)),
          orderBy('timestamp', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        
        const fetchedPredictions = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            risk_level: data.risk_level,
            confidence: data.confidence,
            description: data.description,
            fish_condition: data.fish_condition,
            water_condition: data.water_condition,
            weather: data.weather,
            actions: data.actions || [],
            timestamp: data.timestamp,
            createdAt: data.createdAt,
            userId: data.userId
          };
        });
        
        setPredictions(fetchedPredictions);
        // Reset expanded items when data changes
        setExpandedItems(new Set());

        // Debug: Log the predictions data
        console.log('Predictions data:', fetchedPredictions);

        // Fetch reports in same window
        try {
          const reportsRef = collection(db, 'reports');
          const rq = query(
            reportsRef,
            where('timestamp', '>=', Timestamp.fromDate(startDate)),
            orderBy('timestamp', 'desc')
          );
          const reportSnap = await getDocs(rq);
          const rmap = {};
          reportSnap.forEach(docSnap => {
            const r = docSnap.data();
            const uid = r.uid || r.userId;
            if (!uid) return;
            const ts = r.timestamp?.toMillis?.() ? r.timestamp.toMillis() : (r.createdAt?.toMillis?.() ? r.createdAt.toMillis() : 0);
            const pondRaw = r.fish_pond || r.pond || r.fishPond || r.input_data?.fish_pond || 'Unknown Pond';
            const pondKey = normalizePondName(pondRaw);
            if (!rmap[uid]) rmap[uid] = [];
            rmap[uid].push({
              __ts: ts,
              fish_pond: pondRaw,
              fish_pond_key: pondKey,
              submitted_by: r.submitted_by || r.user_name || r.submittedBy || '',
              user_role: r.user_role || r.role || '',
              user_contact: r.user_contact || r.user_email || r.email || '',
              fish_condition: r.fish_condition || '',
              water_condition: r.water_condition || '',
              weather: r.weather || '',
              weather_source: r.weather_source || '',
              ready_for_harvest: r.ready_for_harvest,
              additional_notes: r.additional_notes || r.notes || '',
              timestamp: r.timestamp || r.createdAt
            });
          });
          // sort each uid list by recency desc
          Object.keys(rmap).forEach(uid => rmap[uid].sort((a,b) => b.__ts - a.__ts));
          setReportsByUid(rmap);
          
          // Debug: Log the reports data structure
          console.log('Reports data structure:', rmap);
          
          // Debug: Log all unique weather values found
          const allWeatherValues = new Set();
          Object.values(rmap).forEach(reports => {
            reports.forEach(report => {
              if (report.weather) {
                allWeatherValues.add(report.weather);
              }
            });
          });
          console.log('All unique weather values found in reports:', Array.from(allWeatherValues));
        } catch (err) {
          console.error('Error fetching reports:', err);
        }

        // Fetch model_feedback; link by uid + fish_pond
        try {
          const feedbackRef = collection(db, 'model_feedback');
          const fSnap = await getDocs(feedbackRef);
          const fmap = {};
          
          fSnap.forEach(docSnap => {
            const f = docSnap.data();
            const uid = f.uid || f.userId || f.user_id;
            if (!uid) return;
            
            const ts = f.timestamp?.toMillis?.() ? f.timestamp.toMillis() : 
                      (f.createdAt?.toMillis?.() ? f.createdAt.toMillis() : 0);
            
            // Debug: Log each feedback document being processed
            console.log(`Processing feedback document for user ${uid}:`, {
              is_aggregate: f.is_aggregate,
              corrected_risk_level: f.corrected_risk_level,
              has_predictions: Array.isArray(f.predictions),
              predictions_count: Array.isArray(f.predictions) ? f.predictions.length : 0
            });
            
            // Initialize user entry if not exists
            if (!fmap[uid]) fmap[uid] = {};
            
            // Store the feedback document directly (simplified approach)
            fmap[uid].__aggregate = {
              __ts: ts,
              corrected_risk_level: f.corrected_risk_level,
              diagnostics: {
                high: f.high_risk_count || f.high || 0,
                medium: f.medium_risk_count || f.medium || 0,
                low: f.low_risk_count || f.low || 0,
              },
              is_aggregate: f.is_aggregate || false,
              model_version: f.model_version || '',
              confidence: f.confidence,
            };
            
            console.log(`Created feedback entry for user ${uid}:`, fmap[uid].__aggregate);
          });
          
          setFeedbackByUidAndPond(fmap);
          
          // Debug: Log the feedback data structure
          console.log('Feedback data structure:', fmap);
        } catch (err) {
          console.error('Error fetching model_feedback:', err);
        }
        
      } catch (error) {
        console.error('Error fetching predictions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
  }, [selectedDateRange]);

  // Trigger filtering when pond selection changes
  useEffect(() => {
    console.log(`Pond selection changed to: ${selectedPond}`);
  }, [selectedPond]);

  // Debug weather filter changes
  useEffect(() => {
    if (selectedCategory !== 'all') {
      console.log(`Weather filter changed to: "${selectedCategory}"`);
      console.log(`Available weather options:`, availableWeatherOptions);
      
      // Show how many predictions match this weather
      const weatherMatches = predictions.filter(prediction => {
        const uid = prediction.userId;
        const predMs = toMillis(prediction.timestamp) || toMillis(prediction.createdAt);
        const nearestReport = findNearestReport(uid, predMs);
        
        const predictionWeather = prediction.weather?.toLowerCase() || '';
        const reportWeather = nearestReport?.weather?.toLowerCase() || '';
        const selectedLower = selectedCategory.toLowerCase();
        
        return predictionWeather === selectedLower || 
               reportWeather === selectedLower ||
               predictionWeather.includes(selectedLower) || 
               reportWeather.includes(selectedLower);
      });
      
      console.log(`Predictions matching weather "${selectedCategory}":`, weatherMatches.length);
      weatherMatches.forEach(p => {
        const uid = p.userId;
        const predMs = toMillis(p.timestamp) || toMillis(p.createdAt);
        const nearestReport = findNearestReport(uid, predMs);
        console.log(`  - ${p.id}: prediction weather="${p.weather}", report weather="${nearestReport?.weather}"`);
      });
    }
  }, [selectedCategory, predictions, availableWeatherOptions]);

  // Debug UID matching between predictions and feedback
  useEffect(() => {
    if (predictions.length > 0 && Object.keys(feedbackByUidAndPond).length > 0) {
      console.log('=== UID MATCHING DEBUG ===');
      console.log('All feedback UIDs:', Object.keys(feedbackByUidAndPond));
      console.log('Prediction UIDs:', [...new Set(predictions.map(p => p.userId))]);
      
      const predictionUid = predictions[0].userId;
      const predictionTime = toMillis(predictions[0].timestamp);
      
      console.log('First prediction:', {
        uid: predictionUid,
        time: new Date(predictionTime),
        hasFeedback: !!feedbackByUidAndPond[predictionUid]
      });
      
      if (feedbackByUidAndPond[predictionUid]) {
        console.log('Available feedback for this UID:', feedbackByUidAndPond[predictionUid]);
      }
      console.log('=== END UID DEBUG ===');
    }
  }, [predictions, feedbackByUidAndPond]);

  useEffect(() => {
    if (Object.keys(reportsByUid).length > 0) {
      const weatherSet = new Set();
      Object.values(reportsByUid).forEach(reports => {
        reports.forEach(report => {
          if (report.weather && report.weather.trim()) {
            weatherSet.add(report.weather.trim());
          }
        });
      });
      const weatherArray = Array.from(weatherSet).sort();
      setAvailableWeatherOptions(weatherArray);
      console.log('Available weather options for filter:', weatherArray);
    }
  }, [reportsByUid]);

  const toMillis = (ts) => (ts?.toMillis?.() ? ts.toMillis() : (ts instanceof Date ? ts.getTime() : null));

  // Normalize pond names to a canonical key to improve matching across sources
  const normalizePondName = (name) => {
    if (!name || typeof name !== 'string') return '';
    const trimmed = name.trim();
    // Prefer extracting a number and format as "Fish Pond <n>"
    const numMatch = trimmed.match(/(\d{1,3})/);
    if (numMatch) {
      return `Fish Pond ${parseInt(numMatch[1], 10)}`;
    }
    // Fallback to lowercase string
    return trimmed.toLowerCase();
  };

  const findNearestReport = (uid, targetMs, fishPondHintKey) => {
    const list = reportsByUid[uid];
    if (!list || !targetMs) return null;
    
    let best = null;
    let bestDiff = Infinity;
    
    for (const r of list) {
      // If fishPondHintKey is provided, only consider reports for that pond
      if (fishPondHintKey && r.fish_pond_key !== fishPondHintKey) continue;
      
      const rMs = toMillis(r.timestamp) || r.__ts;
      if (!rMs) continue;
      
      const diff = Math.abs(rMs - targetMs);
      if (diff < bestDiff) {
        best = r;
        bestDiff = diff;
      }
    }
    
    return best;
  };

  const getFeedbackFor = (uid, fishPondKey, targetMs) => {
    const byPond = feedbackByUidAndPond[uid];
    if (!byPond) {
      console.log(`No feedback found for UID: ${uid}`);
      return null;
    }

    // Prefer explicit aggregate correction for this user if present
    if (byPond.__aggregate && byPond.__aggregate.corrected_risk_level) {
      console.log(`Using aggregate correction for UID ${uid}:`, byPond.__aggregate.corrected_risk_level);
      return byPond.__aggregate;
    }

    // Otherwise, pick the most recent feedback entry
    const allFeedback = Object.values(byPond).filter(Boolean);
    if (allFeedback.length === 0) return null;

    const sortedFeedback = allFeedback.sort((a, b) => {
      const aTime = a.__ts || 0;
      const bTime = b.__ts || 0;
      return bTime - aTime; // descending order
    });

    const recentFeedback = sortedFeedback.find(f => f.corrected_risk_level) || sortedFeedback[0];
    console.log(`Using most recent feedback for ${uid}:`, recentFeedback);
    return recentFeedback;
  };

  // Function to get all predictions for a selected pond (including linked data)
  const getAllPredictionsForPond = (pondNumber) => {
    if (pondNumber === 'all') return predictions;
    
    const pondName = `Fish Pond ${pondNumber}`;
    const pondKey = normalizePondName(pondName);
    
    console.log(`Filtering for pond: ${pondName}, key: ${pondKey}`);
    console.log(`Total predictions: ${predictions.length}`);
    
    // Filter predictions by checking their linked reports
    const pondPredictions = predictions.filter(prediction => {
      const uid = prediction.userId;
      const predMs = toMillis(prediction.timestamp) || toMillis(prediction.createdAt);
      
      // Find the nearest report for this prediction
      const nearestReport = findNearestReport(uid, predMs);
      
      if (!nearestReport) {
        console.log(`No report found for prediction ${prediction.id}`);
        return false;
      }
      
      // Check if the report's fish_pond matches the selected pond
      const reportPond = nearestReport.fish_pond;
      const reportPondKey = normalizePondName(reportPond);
      
      const isMatch = reportPondKey === pondKey;
      
      if (isMatch) {
        console.log(`Pond match found: ${prediction.id} linked to report with pond: ${reportPond}`);
      }
      
      return isMatch;
    });
    
    console.log(`Predictions for pond ${pondNumber}: ${pondPredictions.length}`);
    return pondPredictions;
  };
  
  // Apply other filters to pond-filtered predictions
  const finalFilteredPredictions = getAllPredictionsForPond(selectedPond).filter(prediction => {
    const riskLevelMatch = selectedRiskLevel === 'all' || 
      prediction.risk_level === selectedRiskLevel;
    
    // Fix weather filtering to check both prediction and report weather
    let categoryMatch = selectedCategory === 'all';
    if (selectedCategory !== 'all') {
      // Get the nearest report for this prediction to check its weather
      const uid = prediction.userId;
      const predMs = toMillis(prediction.timestamp) || toMillis(prediction.createdAt);
      const nearestReport = findNearestReport(uid, predMs);
      
      // Normalize strings for strict comparison
      const predictionWeather = (prediction.weather || '').toString().trim().toLowerCase();
      const reportWeather = (nearestReport?.weather || '').toString().trim().toLowerCase();
      const selectedLower = (selectedCategory || '').toString().trim().toLowerCase();
      
      // Strict match only (avoid matching "very cloudy" when selecting "cloudy")
      categoryMatch = (predictionWeather && predictionWeather === selectedLower) ||
                      (reportWeather && reportWeather === selectedLower);
      
      // Debug logging for weather matching
      console.log(`Weather filter debug for prediction ${prediction.id}:`, {
        selectedCategory: selectedLower,
        predictionWeather,
        reportWeather,
        categoryMatch,
        uid,
        hasReport: !!nearestReport
      });
    }
    
    // Debug logging for pond filtering
    if (selectedPond !== 'all') {
      const uid = prediction.userId;
      const predMs = toMillis(prediction.timestamp) || toMillis(prediction.createdAt);
      const nearestReport = findNearestReport(uid, predMs);
      
      console.log(`Pond filter debug for prediction ${prediction.id}:`, {
        selectedPond,
        predictionUserId: uid,
        hasNearestReport: !!nearestReport,
        reportPond: nearestReport?.fish_pond,
        reportPondKey: nearestReport ? normalizePondName(nearestReport.fish_pond) : 'N/A',
        expectedPondKey: `Fish Pond ${selectedPond}`,
        matches: nearestReport ? normalizePondName(nearestReport.fish_pond) === `Fish Pond ${selectedPond}` : false
      });
    }
    
    return riskLevelMatch && categoryMatch;
  });

  const getRiskLevelColor = (level) => {
    if (level?.includes('High')) return '#dc2626';
    if (level?.includes('Medium')) return '#d97706';
    if (level?.includes('Low')) return '#059669';
    return '#6b7280';
  };

  const getWeatherIcon = (weather) => {
    if (weather?.toLowerCase().includes('rain')) return <FaCloudRain />;
    if (weather?.toLowerCase().includes('sun')) return <FaThermometerHalf />;
    if (weather?.toLowerCase().includes('cloud')) return <FaWater />;
    return <FaFish />;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    try {
      if (timestamp.toDate) {
        // Firestore timestamp
        return timestamp.toDate().toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else if (timestamp instanceof Date) {
        // Date object
        return timestamp.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        // String timestamp
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

  const getRiskCount = (level) => {
    return finalFilteredPredictions.filter(p => p.risk_level?.includes(level)).length;
  };

  const toggleExpanded = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  if (loading) {
    return (
      <div className="risk-report-container">
        <div className="loading-state">
          <FaExclamationTriangle className="loading-icon" />
          <h3>Loading Risk Predictions...</h3>
          <p>Fetching latest data from the system</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`risk-report-container ${isModal ? 'modal-view' : ''}`}>
      <div className="risk-report-header">
        <div className="header-content">
          <FaExclamationTriangle className="header-icon" />
          <h2>Risk Analysis & Predictions</h2>
          <p className="header-subtitle">Predictive risk analysis leveraging Machine Learning techniques for pond conditions.</p>
        </div>
        
        <div className="risk-summary">
          <div className="summary-item">
            <FaExclamationCircle className="summary-icon high" />
            <span className="summary-count">{getRiskCount('High')}</span>
            <span className="summary-label">High Risk</span>
          </div>
          <div className="summary-item">
            <FaExclamationCircle className="summary-icon medium" />
            <span className="summary-count">{getRiskCount('Medium')}</span>
            <span className="summary-label">Medium Risk</span>
          </div>
          <div className="summary-item">
            <FaExclamationCircle className="summary-icon low" />
            <span className="summary-count">{getRiskCount('Low')}</span>
            <span className="summary-label">Low Risk</span>
          </div>
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-group">
          <label>Date Range:</label>
          <select 
            value={selectedDateRange} 
            onChange={(e) => setSelectedDateRange(e.target.value)}
            className="filter-select"
          >
            <option value="today">Today</option>
            <option value="last7days">Last 7 Days</option>
            <option value="thisMonth">This Month</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Risk Level:</label>
          <select 
            value={selectedRiskLevel} 
            onChange={(e) => setSelectedRiskLevel(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Levels</option>
            <option value="High Risk">High Risk</option>
            <option value="Medium Risk">Medium Risk</option>
            <option value="Low Risk">Low Risk</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Weather:</label>
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Weather</option>
            {availableWeatherOptions.map((weather, index) => (
              <option key={index} value={weather}>{weather}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Pond Number:</label>
          <select 
            value={selectedPond} 
            onChange={(e) => setSelectedPond(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Ponds</option>
            <option value="1">Fish Pond 1</option>
            <option value="2">Fish Pond 2</option>
            <option value="3">Fish Pond 3</option>
            <option value="4">Fish Pond 4</option>
            <option value="5">Fish Pond 5</option>
            <option value="6">Fish Pond 6</option>
            <option value="7">Fish Pond 7</option>
            <option value="8">Fish Pond 8</option>
            <option value="9">Fish Pond 9</option>
            <option value="10">Fish Pond 10</option>
          </select>
        </div>
      </div>

      <div className="risk-reports-list">
        {finalFilteredPredictions.length > 0 ? (
          finalFilteredPredictions.map((prediction) => {
            const uid = prediction.userId;
            const predMs = toMillis(prediction.timestamp) || toMillis(prediction.createdAt);
            // Try to get pond from prediction or nearest report
            const pondFromPredRaw = prediction.fish_pond || prediction.pond || prediction.fishPond;
            const pondFromPredKey = normalizePondName(pondFromPredRaw);
            const nearestReport = findNearestReport(uid, predMs, pondFromPredKey);
            const pondNameDisplay = pondFromPredRaw || nearestReport?.fish_pond || (prediction.title?.startsWith('Fish Pond') ? prediction.title : (prediction.title ? `Fish Pond ${prediction.title}` : 'Unknown Pond'));
            const pondKey = normalizePondName(pondNameDisplay);
            const feedback = getFeedbackFor(uid, pondKey, predMs);
 
            // Debug logging
            console.log(`Prediction ${prediction.id}:`, {
              uid,
              pondKey,
              pondNameDisplay,
              foundFeedback: !!feedback,
              correctedRisk: feedback?.corrected_risk_level,
              feedbackData: feedback
            });
 
            // Enhanced debugging for feedback
            console.log('Feedback for prediction:', {
              predictionId: prediction.id,
              uid,
              pondKey,
              foundFeedback: !!feedback,
              feedbackData: feedback,
              correctedRisk: feedback?.corrected_risk_level,
              isAggregate: feedback?.is_aggregate
            });
 
            const correctedText = feedback?.corrected_risk_level || '—';
            const headerRisk = `${prediction.risk_level || 'Unknown'}${correctedText !== '—' ? ` → ${correctedText}` : ''}`;

            return (
            <div key={prediction.id} className={`risk-report-card ${prediction.risk_level?.toLowerCase().includes('high') ? 'high' : prediction.risk_level?.toLowerCase().includes('medium') ? 'medium' : 'low'}`}>
              {/* Summary View - Always Visible */}
              <div className="risk-summary-view" onClick={() => toggleExpanded(prediction.id)}>
                <div className="summary-content">
                  <div className="summary-title">
                    <h3 className="risk-title">
                      {pondNameDisplay} | Risk: {headerRisk} {getWeatherIcon(nearestReport?.weather || prediction.weather)}
                    </h3>
                    <div className="summary-meta">
                      <span className="confidence-badge">
                        {prediction.confidence}% confidence
                      </span>
                      <span className="timestamp">
                        <FaClock className="time-icon" />
                        {formatTimestamp(prediction.timestamp)}
                      </span>
                      <span className="user-badge">{nearestReport?.submitted_by || uid || 'Unknown User'}{nearestReport?.user_role ? ` (${nearestReport.user_role})` : ''}</span>
                    </div>
                    <div className="reported-conditions">
                      Water: {nearestReport?.water_condition || '—'} | Fish: {nearestReport?.fish_condition || '—'} | Weather: {nearestReport?.weather || prediction.weather || '—'}
                    </div>
                  </div>
                  <div className="summary-indicators">
                    <span 
                      className="risk-level-badge"
                      style={{ backgroundColor: getRiskLevelColor(prediction.risk_level) }}
                    >
                      {prediction.risk_level}
                    </span>
                    <div className="expand-icon">
                      {expandedItems.has(prediction.id) ? <FaChevronDown /> : <FaChevronRight />}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Detailed View - Expandable */}
              {expandedItems.has(prediction.id) && (
                <div className="risk-detail-view">
                  <div className="risk-content">
                    <div className="grid-two-cols">
                      <div className="ml-section">
                        <h4>ML Prediction</h4>
                        <div className="kv"><span>Risk Level:</span><strong>{prediction.risk_level || '—'}</strong></div>
                        <div className="kv"><span>Confidence:</span><strong>{typeof prediction.confidence === 'number' ? `${prediction.confidence}%` : (prediction.confidence || '—')}</strong></div>
                        {prediction.title && <div className="kv"><span>Title:</span><strong>{prediction.title}</strong></div>}
                        {prediction.description && (
                          <div className="kv wrap"><span>Description:</span><p>{prediction.description}</p></div>
                        )}
                        {!!prediction.actions?.length && (
                          <div className="kv wrap"><span>Actions:</span>
                            <ol className="actions-list">
                              {prediction.actions.map((a, i) => <li key={i}>{a}</li>)}
                            </ol>
                          </div>
                        )}
                      </div>
                      <div className="ml-section">
                        <h4>ML Feedback (Aggregate)</h4>
                        <div className="kv"><span>Original Risk:</span><strong>{prediction.risk_level || '—'}</strong></div>
                        <div className="kv"><span>Aggregate Correction:</span><strong>{correctedText}</strong></div>
                        {feedback?.is_aggregate !== undefined && (
                          <div className="kv"><span>Aggregated:</span><strong>{feedback.is_aggregate ? 'Yes' : 'No'}</strong></div>
                        )}
                        {feedback?.diagnostics && (
                          <div className="kv"><span>Diagnostics:</span>
                            <strong>{`High ${feedback.diagnostics.high || 0}, Medium ${feedback.diagnostics.medium || 0}, Low ${feedback.diagnostics.low || 0}`}</strong>
                          </div>
                        )}
                        {feedback?.model_version && (
                          <div className="kv"><span>Model Version:</span><strong>{feedback.model_version}</strong></div>
                        )}
                        {feedback?.confidence !== undefined && (
                          <div className="kv"><span>Final Confidence:</span><strong>{typeof feedback.confidence === 'number' ? `${feedback.confidence}%` : feedback.confidence}</strong></div>
                        )}
                      </div>
                    </div>

                    <div className="report-section">
                      <h4>Report Details</h4>
                      <div className="kv"><span>Submitted By:</span><strong>{nearestReport?.submitted_by || '—'}</strong></div>
                      <div className="kv"><span>Role:</span><strong>{nearestReport?.user_role || '—'}</strong></div>
                      <div className="kv"><span>Contact:</span><strong>{nearestReport?.user_contact || '—'}</strong></div>
                      <div className="kv"><span>Ready for Harvest:</span><strong>{nearestReport?.ready_for_harvest === true ? 'Yes' : nearestReport?.ready_for_harvest === false ? 'No' : '—'}</strong></div>
                      <div className="kv wrap"><span>Additional Notes:</span><p>{nearestReport?.additional_notes || '—'}</p></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
          })
        ) : (
          <div className="no-risks">
            <FaShieldAlt className="no-risks-icon" />
            <h3>No Predictions Found</h3>
            <p>No predictions match the current filter criteria. All systems are operating normally.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RiskReportModal;

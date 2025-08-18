import React, { useState, useEffect } from 'react';
import { FaExclamationTriangle, FaShieldAlt, FaThermometerHalf, FaWater, FaFish, FaClock, FaExclamationCircle, FaCloudRain, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query, where, Timestamp } from 'firebase/firestore';
import './RiskReportModal.css';

const RiskReportModal = ({ isModal = false }) => {
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState('last7days');
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState(new Set());

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
      } catch (error) {
        console.error('Error fetching predictions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
  }, [selectedDateRange]);

  const filteredPredictions = predictions.filter(prediction => {
    const riskLevelMatch = selectedRiskLevel === 'all' || 
      prediction.risk_level === selectedRiskLevel;
    const categoryMatch = selectedCategory === 'all' || 
      prediction.weather === selectedCategory;
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
    return predictions.filter(p => p.risk_level?.includes(level)).length;
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
            <option value="rainy">Rainy</option>
            <option value="sunny">Sunny</option>
            <option value="cloudy">Cloudy</option>
            <option value="clear">Clear</option>
          </select>
        </div>
      </div>

      <div className="risk-reports-list">
        {filteredPredictions.length > 0 ? (
          filteredPredictions.map((prediction) => (
            <div key={prediction.id} className={`risk-report-card ${prediction.risk_level?.toLowerCase().includes('high') ? 'high' : prediction.risk_level?.toLowerCase().includes('medium') ? 'medium' : 'low'}`}>
              {/* Summary View - Always Visible */}
              <div className="risk-summary-view" onClick={() => toggleExpanded(prediction.id)}>
                <div className="summary-content">
                  <div className="summary-title">
                    <h3 className="risk-title">
                      {prediction.title} {getWeatherIcon(prediction.weather)}
                    </h3>
                    <div className="summary-meta">
                      <span className="confidence-badge">
                        {prediction.confidence}% confidence
                      </span>
                      <span className="timestamp">
                        <FaClock className="time-icon" />
                        {formatTimestamp(prediction.timestamp)}
                      </span>
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
                    <div className="prediction-description">
                      <h4>Description</h4>
                      <p>{prediction.description}</p>
                    </div>
                    
                    <div className="conditions-grid">
                      <div className="condition-item">
                        <h4>Weather</h4>
                        <span className="condition-value weather">{prediction.weather}</span>
                      </div>
                      
                      <div className="condition-item">
                        <h4>Fish Condition</h4>
                        <span className={`condition-value fish ${prediction.fish_condition?.toLowerCase()}`}>
                          {prediction.fish_condition}
                        </span>
                      </div>
                      
                      <div className="condition-item">
                        <h4>Water Condition</h4>
                        <span className={`condition-value water ${prediction.water_condition?.toLowerCase()}`}>
                          {prediction.water_condition}
                        </span>
                      </div>
                    </div>
                    
                    <div className="prediction-actions">
                      <h4>Actions to Take</h4>
                      <ol className="actions-list">
                        {prediction.actions.map((action, index) => (
                          <li key={index}>{action}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
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

import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaEllipsisV, FaFilePdf, FaFileCsv, FaFileDownload } from 'react-icons/fa';
import logo from "./assets/images/PISCARISK_LOGO.png";
import NotificationBox from './components/NotificationBox';
import { getAllLogs } from './utils/logger';
import { exportLogs } from './utils/exportLogs';

import './Logs.css';

const Logs = () => {
  const { currentUser, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true);
        // Fetch logs from Firebase
        const logs = await getAllLogs();
        setLogs(logs);
        setFilteredLogs(logs);
      } catch (error) {
        console.error('Error fetching logs:', error);
        setLogs([]);
        setFilteredLogs([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  useEffect(() => {
    // Filter logs based on search term and category
    let filtered = logs;
    
    if (searchTerm) {
      filtered = filtered.filter(log => {
        const message = log.message.toLowerCase();
        const username = log.username.toLowerCase();
        const category = log.category.toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();
        
        return message.includes(searchTermLower) ||
               username.includes(searchTermLower) ||
               category.includes(searchTermLower);
      });
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(log => log.category === selectedCategory);
    }

    setFilteredLogs(filtered);
  }, [searchTerm, selectedCategory, logs]);

  const categories = [
    { id: 'all', label: 'All Logs' },
    { id: 'login', label: 'Login' },
    { id: 'logout', label: 'Logout' },
    { id: 'profile', label: 'Profile' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'error', label: 'Error' },
    { id: 'account', label: 'Account' },
    { id: 'reward', label: 'Reward' },
    { id: 'export', label: 'Export' },
    { id: 'report', label: 'Reports' }
  ];

  const formatDate = (dateString) => {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  return (
    <div className="logs">
      <header className="logs-header-bar">
        <div className="header-logo-container">
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRisk</div>
        </div>

        <div className="search-container">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Search logs..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="header-right">
          <div className="download-container">
            <button className="download-btn" onClick={() => setShowDownloadOptions(!showDownloadOptions)}>
              <FaFileDownload className="download-icon" />
              Export
            </button>
            
            {showDownloadOptions && (
              <div className="download-options">
                <button className="download-option" onClick={() => {
                  exportLogs(filteredLogs, 'pdf', currentUser);
                  setShowDownloadOptions(false);
                }}>
                  <FaFilePdf className="option-icon" />
                  PDF
                </button>
                <button className="download-option" onClick={() => {
                  exportLogs(filteredLogs, 'csv', currentUser);
                  setShowDownloadOptions(false);
                }}>
                  <FaFileCsv className="option-icon" />
                  CSV
                </button>
              </div>
            )}
          </div>
          <NotificationBox />
        <div className="logs-menu">
          <button onClick={() => setShowMenu(!showMenu)}>
            <FaEllipsisV className="three-dot-icon" />
          </button>
          {showMenu && (
            <div className="dropdown-menu">
              <button onClick={() => navigate('/Homepage')}>Go to Homepage</button> 
            </div>
          )}
          </div>
        </div>
      </header>

      <div className="logs-wrapper">
        <h1 className="logs-title">System Activity Logs</h1>
      </div>

      <div className="logs-container">
        <div className="logs-categories-container">
          <div className="logs-categories">
            {categories.map(category => (
              <button
                key={category.id}
                className={`logs-category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="logs-list">
          {isLoading ? (
            <div className="loading-logs">Loading logs...</div>
          ) : filteredLogs.length > 0 ? (
            filteredLogs.map((log, index) => (
              <div key={index} className="log-card">
                <div className="log-header">
                  <span className={`log-type ${log.category}`}>{log.category}</span>
                  <span className="log-date">{formatDate(log.timestamp)}</span>
                </div>
                <div className="log-content">
                  <div className="log-message">{log.message}</div>
                  <div className="log-user">User: {log.username}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="no-logs">No logs found</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Logs;
 
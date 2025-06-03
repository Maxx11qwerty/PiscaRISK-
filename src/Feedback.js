import React, { useState, useContext, useEffect } from 'react';
import './Feedback.css';
import {FaUserCircle, FaEllipsisV, FaBug, FaPalette, 
        FaLightbulb, FaTachometerAlt, FaQuestionCircle, 
        FaTimes, FaPaperPlane, FaFilter, FaFileDownload, FaFilePdf, FaFileCsv} from 'react-icons/fa';
import logo from './assets/images/PISCARISK_LOGO.png';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import { logActivity, logMessages } from './utils/logger';
import { exportToCSV, exportToPDF } from './utils/exportFeedback';
import NotificationBox from './components/NotificationBox';
import { db } from './firebase';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';

const feedbackTypes = [
  { id: 'bug', label: 'Bug', icon: 'FaBug' },
  { id: 'uiux', label: 'UI/UX Issue', icon: 'FaPalette' },
  { id: 'feature request', label: 'Feature Request', icon: 'FaLightbulb' },
  { id: 'performance', label: 'Performance', icon: 'FaTachometerAlt' },
  { id: 'other', label: 'Other', icon: 'FaQuestionCircle' }
];

const Feedback = () => {
  const { currentUser } = useContext(AuthContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replies, setReplies] = useState({});
  const [searchFilter, setSearchFilter] = useState('all');
  const [showSearchFilters, setShowSearchFilters] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch feedback data from Firebase
  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        setLoading(true);
        console.log('Fetching feedbacks from Firebase...');
        
        const feedbacksRef = collection(db, 'PiscaRisk');
        let q;
        
        // Set up query based on user role
        if (currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Tech Officer')) {
          // Admins and Tech Officers can see all feedback
          q = query(feedbacksRef, orderBy('timestamp', 'desc'));
        } else if (currentUser) {
          // Regular users can only see their own feedback
          q = query(
            feedbacksRef,
            where('uid', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
          );
        } else {
          // Not authenticated - don't try to fetch
          setFeedbacks([]);
          setLoading(false);
          return;
        }

        const querySnapshot = await getDocs(q);
        
        console.log('Number of documents found:', querySnapshot.docs.length);
        
        const fetchedFeedbacks = querySnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Document data:', data);
          
          // Map the concern to the correct feedback type
          const concernToType = {
            'bug': 'bug',
            'ui': 'uiux',
            'feature request': 'feature request',
            'performance': 'performance',
            'other': 'other'
          };

          // Log feedback submissions
          if (data.source === 'mobile') {
            logActivity('feedback', logMessages.feedback.mobileSubmit(data.userName || 'Anonymous', data.concern || 'feedback'), data.userName || 'Anonymous');
          } else {
            logActivity('feedback', logMessages.feedback.webSubmit(data.userName || 'Anonymous', data.concern || 'feedback'), data.userName || 'Anonymous');
          }
          
          return {
            id: doc.id,
            user: data.userName || 'Anonymous',
            uid: data.uid || '',
            type: concernToType[data.concern?.toLowerCase()] || 'other',
            message: data.feedback || '',
            date: data.timestamp ? data.timestamp.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            avatar: <FaUserCircle className="user-avatar" />,
            timestamp: data.timestamp,
            source: data.source || 'web',
            userName: data.userName || 'Anonymous'
          };
        });

        console.log('Processed feedbacks:', fetchedFeedbacks);
        setFeedbacks(fetchedFeedbacks);
      } catch (error) {
        console.error('Error fetching feedbacks:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        logActivity('error', logMessages.error.database(`Error fetching feedbacks: ${error.message}`), 'System');
        setFeedbacks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFeedbacks();
  }, [currentUser]);

  // Map icon strings to actual components
  const getIconComponent = (iconName) => {
    const iconMap = {
      'FaBug': FaBug,
      'FaPalette': FaPalette,
      'FaLightbulb': FaLightbulb,
      'FaTachometerAlt': FaTachometerAlt,
      'FaQuestionCircle': FaQuestionCircle,
      'FaUserCircle': FaUserCircle
    };
    const IconComponent = iconMap[iconName];
    return IconComponent ? <IconComponent /> : null;
  };

  const handleExport = (format) => {
    setShowDownloadOptions(false);
    
    if (format === 'csv') {
      exportToCSV(filteredFeedbacks, feedbackTypes);
    } else if (format === 'pdf') {
      exportToPDF(filteredFeedbacks, feedbackTypes);
    }
  };

  // Combined filtering logic
  const filteredFeedbacks = feedbacks.filter(feedback => {
    const searchTermLower = searchTerm.toLowerCase();
    const messageLower = (feedback.message || '').toLowerCase();
    const userLower = (feedback.userName || '').toLowerCase();
    
    // Get the feedback type label for searching
    const feedbackType = feedbackTypes.find(t => t.id === feedback.type);
    const typeLabel = feedbackType ? feedbackType.label.toLowerCase() : '';
    
    // Search filtering
    let matchesSearch = false;
    if (searchFilter === 'all') {
      matchesSearch = messageLower.includes(searchTermLower) || 
                     userLower.includes(searchTermLower) ||
                     typeLabel.includes(searchTermLower);
    } else if (searchFilter === 'message') {
      matchesSearch = messageLower.includes(searchTermLower);
    } else if (searchFilter === 'username') {
      matchesSearch = userLower.includes(searchTermLower);
    } else if (searchFilter === 'type') {
      matchesSearch = typeLabel.includes(searchTermLower);
    }

    // Category filtering
    const matchesCategory = activeCategory === 'All' || 
                          feedback.type === activeCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  const handleFeedbackClick = (feedback) => {
    setSelectedFeedback(feedback);
  };

  const handleReplySubmit = (feedbackId) => {
    if (replyText.trim()) {
      const newReply = {
        id: Date.now(),
        text: replyText,
        date: new Date().toISOString().split('T')[0],
        isAdmin: true
      };
      
      setReplies(prev => ({
        ...prev,
        [feedbackId]: [...(prev[feedbackId] || []), newReply]
      }));
      
      setReplyText('');
    }
  };

  const closeDetailView = () => {
    setSelectedFeedback(null);
  };


  return (
    <div className="feedback">
      <header className="feedback-header-bar">
        <div className="header-logo-container">
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRisk</div>
        </div>
        
        <div className="search-container">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder={
                searchFilter === 'username' ? "Search by username..." :
                searchFilter === 'message' ? "Search by message..." :
                searchFilter === 'type' ? "Search by feedback type..." :
                "Search feedbacks..."
              }
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button 
              className="search-filter-btn"
              onClick={() => setShowSearchFilters(!showSearchFilters)}
            >
              <FaFilter />
            </button>
          </div>
          
          {showSearchFilters && (
            <div className="search-filter-dropdown">
              <button
                className={`filter-option ${searchFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setSearchFilter('all');
                  setShowSearchFilters(false);
                }}
              >
                All Fields
              </button>
              <button
                className={`filter-option ${searchFilter === 'username' ? 'active' : ''}`}
                onClick={() => {
                  setSearchFilter('username');
                  setShowSearchFilters(false);
                }}
              >
                Username Only
              </button>
              <button
                className={`filter-option ${searchFilter === 'message' ? 'active' : ''}`}
                onClick={() => {
                  setSearchFilter('message');
                  setShowSearchFilters(false);
                }}
              >
                Message Only
              </button>
              <button
                className={`filter-option ${searchFilter === 'type' ? 'active' : ''}`}
                onClick={() => {
                  setSearchFilter('type');
                  setShowSearchFilters(false);
                }}
              >
                Feedback Type Only
              </button>
            </div>
          )}
        </div>

        <div className="header-right">
          <NotificationBox />
          <div className="download-container">
            <button className="download-btn" onClick={() => setShowDownloadOptions(!showDownloadOptions)}>
              <FaFileDownload className="download-icon" />
              Export
            </button>
            
            {showDownloadOptions && (
              <div className="download-options">
                <button className="download-option" onClick={() => handleExport('pdf')}>
                  <FaFilePdf className="option-icon" />
                  PDF
                </button>
                <button className="download-option" onClick={() => handleExport('csv')}>
                  <FaFileCsv className="option-icon" />
                  CSV
                </button>
              </div>
            )}
          </div>
  
          <div className="feedback-menu" onClick={() => setShowMenu(!showMenu)}>
            <FaEllipsisV className="three-dot-icon" />
            {showMenu && (
              <div className="dropdown-menu">
                <button onClick={() => navigate('/Homepage')}>Go to Homepage</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="feedback-wrapper">
        <h1 className="feedback-title">Feedback Inbox</h1>
      </div>
        
      <div className="feedback-container">
        <div className="categories-container">
          <div className="feedback-categories">
            <button 
              className={`category-btn ${activeCategory === 'All' ? 'active' : ''}`}
              onClick={() => setActiveCategory('All')}
            >
              All
            </button>
            {feedbackTypes.map(type => (
              <button
                key={type.id}
                className={`category-btn ${activeCategory === type.label ? 'active' : ''}`}
                onClick={() => setActiveCategory(type.label)}
              >
                {getIconComponent(type.icon)}
                <span className="category-label">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main content area */}
        <div className="content-area">
          <div className="inbox-container">
            {loading ? (
              <div className="loading-feedback">
                <div className="loading-spinner"></div>
                <p>Loading feedback...</p>
              </div>
            ) : filteredFeedbacks.length > 0 ? (
              filteredFeedbacks.map(feedback => (
                <div 
                  key={feedback.id} 
                  className={`feedback-card ${selectedFeedback?.id === feedback.id ? 'selected' : ''}`}
                  onClick={() => handleFeedbackClick(feedback)}
                >
                  <div className="user-avatar-container">
                    {feedback.avatar}
                    <span className="user-name">{feedback.userName || feedback.user}</span>
                  </div>
                  <div className="feedback-content">
                    <div className="feedback-categ">
                      <span className={`feedback-type ${feedback.type.replace(' ', '-')}`}>
                        {getIconComponent(feedbackTypes.find(t => t.id === feedback.type)?.icon)}
                        {feedbackTypes.find(t => t.id === feedback.type)?.label}
                      </span>
                      <span className="feedback-date">{feedback.date}</span>
                    </div>
                    <p className="feedback-message">{feedback.message}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-feedback">
                <p>No feedback found</p>
              </div>
            )}
          </div>
          {selectedFeedback && (
            <div className="feedback-detail">
              <button className="close-detail" onClick={closeDetailView}>
                <FaTimes />
              </button>
              
              <div className="detail-header">
                <div className="user-avatar-container">
                  {selectedFeedback.avatar}
                  <span className="user-name">{selectedFeedback.userName || selectedFeedback.user}</span>
                </div>
                <div className="feedback-meta">
                  <span className={`feedback-type ${selectedFeedback.type}`}>
                    {getIconComponent(feedbackTypes.find(t => t.id === selectedFeedback.type)?.icon)}
                    {feedbackTypes.find(t => t.id === selectedFeedback.type)?.label}
                  </span>
                  <span className="feedback-date">{selectedFeedback.date}</span>
                </div>
              </div>

              <div className="original-message">
                <h3>Feedback:</h3>
                <p>{selectedFeedback.message}</p>
              </div>

              <div className="replies-container">
                <h3>Responses:</h3>
                {replies[selectedFeedback.id]?.length > 0 ? (
                  replies[selectedFeedback.id].map(reply => (
                    <div key={reply.id} className="reply-message admin-reply">
                      <div className="reply-header">
                        <FaUserCircle className="admin-avatar" />
                        <span>Admin</span>
                        <span className="reply-date">{reply.date}</span>
                      </div>
                      <p>{reply.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="no-replies">No responses yet</p>
                )}
              </div>

              <div className="reply-box">
                <textarea
                  placeholder="Type your response here..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button 
                  className="send-reply"
                  onClick={() => handleReplySubmit(selectedFeedback.id)}
                >
                  <FaPaperPlane /> Send Response
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Feedback;
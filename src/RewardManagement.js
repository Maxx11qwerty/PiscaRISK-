import React, { useState, useEffect, useContext } from 'react';
import './RewardManagement.css';
import logo from './assets/images/PISCARISK_LOGO.png';
import { FaUserCircle, FaArrowRight, FaArrowLeft, FaEdit, FaTrash, FaPlus, FaEllipsisV } from 'react-icons/fa';
import { CSVLink } from 'react-csv';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import NotificationBox from './components/NotificationBox';
import { fetchAllRewards, addNewReward, updateReward, deleteReward, claimReward, fetchClaimedRewardsForUser } from './services/rewardData';
import {exportUserPointsToPDF,exportRewardsToPDF,prepareUserPointsCSVData,prepareRewardsCSVData,generateUserPointsCSVFilename,generateRewardsCSVFilename,handleUserPointsCSVExport,handleRewardsCSVExport
} from './utils/exportRewards';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { addRewardClaimNotification } from './components/NotificationBox';

const RewardManagement = () => {
  const { currentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentRewardChunkIndex, setCurrentRewardChunkIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState('userPoints');
  const [rewards, setRewards] = useState([]);
  const [users, setUsers] = useState([]);
  const [editingReward, setEditingReward] = useState(null);
  const [newReward, setNewReward] = useState({ name: '', points: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [userRole, setUserRole] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const location = useLocation();
  const chunkSize = 3;
  const [csvFilename, setCsvFilename] = useState('');
  const [claimedRewardsMap, setClaimedRewardsMap] = useState({});
  const [popupClaimedRewards, setPopupClaimedRewards] = useState([]);
  const [popupLoading, setPopupLoading] = useState(false);

  // Check user role and authorization
  useEffect(() => {
    const checkUserRole = async () => {
      if (!currentUser) {
        navigate('/login');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData.role);
          
          if (userData.role === 'Admin') {
            navigate('/Homepage', { 
              state: { 
                errorMessage: 'Admins cannot access Reward Management' 
              } 
            });
            return;
          }
          
          setIsAuthorized(userData.role === 'Tech Officer');
          if (userData.role !== 'Tech Officer') {
            navigate('/Homepage');
          }
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error('Error checking user role:', error);
        navigate('/login');
      }
    };

    checkUserRole();
  }, [currentUser, navigate]);

  // Fetch rewards and users from Firebase
  useEffect(() => {
    if (!isAuthorized) return;

    const fetchData = async () => {
      try {
        // Fetch rewards
        const rewardsData = await fetchAllRewards();
        setRewards(rewardsData);

        // Fetch users from Reward collection
        const rewardRef = collection(db, 'Reward');
        const rewardSnapshot = await getDocs(rewardRef);
        const rewardUsers = rewardSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          points: doc.data().points || 0,
          email: doc.data().userEmail || ' ',
          username: doc.data().userName || doc.data().username || 'Unknown User'
        }));

        // Auto-claim logic
        for (const user of rewardUsers) {
          for (const reward of rewardsData) {
            if ((user.points || 0) >= reward.points) {
              // Check if already claimed
              const claimId = `${user.id}_${reward.rewardId}`;
              const claimDoc = await getDoc(doc(db, 'claimedRewards', claimId));
              if (!claimDoc.exists()) {
                await claimReward(user.id, user, reward, currentUser);
                addRewardClaimNotification(user.username, reward.name);
                // Remove the reward from the UI for this user
                user.points -= reward.points;
              }
            }
          }
        }

        // Fetch claimed rewards for all users
        const claimedMap = {};
        for (const user of rewardUsers) {
          claimedMap[user.id] = await fetchClaimedRewardsForUser(user.id);
        }
        setClaimedRewardsMap(claimedMap);

        setUsers(rewardUsers);
        console.log('Fetched users from Reward collection:', rewardUsers);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [isAuthorized]);

  // Fetch claimed rewards when a user is selected
  useEffect(() => {
    const fetchPopupClaimed = async () => {
      if (selectedUser) {
        setPopupLoading(true);
        const claimed = await fetchClaimedRewardsForUser(selectedUser.id);
        setPopupClaimedRewards(claimed);
        setPopupLoading(false);
      } else {
        setPopupClaimedRewards([]);
      }
    };
    fetchPopupClaimed();
  }, [selectedUser]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isAuthorized) {
    return (
      <div className="unauthorized-container">
        {message.text && (
          <div className={`unauthorized-message ${message.type}`}>
            {message.text}
            {userRole === 'Admin' && (
              <div className="redirect-message">
                You will be redirected shortly...
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // CSV data preparation
  const userCSVData = prepareUserPointsCSVData(users);
  const rewardCSVData = prepareRewardsCSVData(rewards);

  // CSV export handlers
  const handleUserCSVExport = () => {
    const filename = generateUserPointsCSVFilename();
    setCsvFilename(filename);
    handleUserPointsCSVExport(currentUser);
  };

  const handleRewardCSVExport = () => {
    const filename = generateRewardsCSVFilename();
    setCsvFilename(filename);
    handleRewardsCSVExport(currentUser);
  };

  // Filtering logic
  const filteredUsers = users.filter(user =>
    (user?.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user?.points?.toString() || '').includes(searchTerm) ||
    (user?.obtainedReward?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const filteredRewards = rewards.filter(reward =>
    (reward?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (reward?.points?.toString() || '').includes(searchTerm)
  );

  // Pagination logic
  const userChunks = [];
  for (let i = 0; i < filteredUsers.length; i += chunkSize) {
    userChunks.push(filteredUsers.slice(i, i + chunkSize));
  }

  const rewardChunks = [];
  for (let i = 0; i < filteredRewards.length; i += chunkSize) {
    rewardChunks.push(filteredRewards.slice(i, i + chunkSize));
  }

  // Navigation handlers
  const handleNextChunk = () => {
    if (currentChunkIndex < userChunks.length - 1) {
      setCurrentChunkIndex(currentChunkIndex + 1);
    }
  };

  const handlePreviousChunk = () => {
    if (currentChunkIndex > 0) {
      setCurrentChunkIndex(currentChunkIndex - 1);
    }
  };

  const handleNextRewardChunk = () => {
    if (currentRewardChunkIndex < rewardChunks.length - 1) {
      setCurrentRewardChunkIndex(currentRewardChunkIndex + 1);
    }
  };

  const handlePreviousRewardChunk = () => {
    if (currentRewardChunkIndex > 0) {
      setCurrentRewardChunkIndex(currentRewardChunkIndex - 1);
    }
  };

  // Get current chunks
  const currentChunk = userChunks[currentChunkIndex] || [];
  const currentRewardChunk = rewardChunks[currentRewardChunkIndex] || [];

  const handleAddReward = async () => {
    if (newReward.name && newReward.points) {
      try {
        const addedReward = await addNewReward(newReward, currentUser);
        setRewards([...rewards, addedReward]);
        
        // Reset form and close it
        setNewReward({ name: '', points: '' });
        setShowAddForm(false);
        setMessage({ text: 'Reward added successfully!', type: 'success' });
      } catch (error) {
        console.error('Error adding reward:', error);
        setMessage({ text: `Failed to add reward: ${error.message}`, type: 'error' });
      }
    } else {
      setMessage({ text: 'Please fill all required fields', type: 'error' });
    }
  };

  const handleCancelAddReward = () => {
    setShowAddForm(false);
    setNewReward({ name: '', points: '' });
    setMessage({ text: '', type: '' });
  };

  const handleEditReward = (reward) => {
    setEditingReward({
      id: reward.id,
      name: reward.name,
      points: reward.points
    });
  };

  const handleUpdateReward = async () => {
    if (editingReward.name && editingReward.points) {
      const oldReward = rewards.find(r => r.id === editingReward.id);
      try {
        // Optimistically update UI first
        const updatedReward = {
          ...editingReward,
          points: parseInt(editingReward.points, 10)
        };
        setRewards(rewards.map(r => (r.id === editingReward.id ? updatedReward : r)));
        setEditingReward(null);

        // Update in Firebase
        await updateReward(editingReward.id, editingReward, oldReward, currentUser);
      } catch (error) {
        setRewards(rewards.map(r => (r.id === editingReward.id ? oldReward : r)));
        console.error('Error updating reward:', error);
        alert('Failed to update reward. Please try again.');
      }
    }
  };

  const handleDeleteReward = async (id) => {
    const rewardToDelete = rewards.find(r => r.id === id);
    try {
      // Optimistically update UI first
      setRewards(rewards.filter(reward => reward.id !== id));

      // Then update Firebase
      await deleteReward(id, rewardToDelete, currentUser);
    } catch (error) {
      setRewards([...rewards, rewardToDelete]);
      console.error('Error deleting reward:', error);
    }
  };

  // Popup component
  const UserPopup = ({ user, onClose }) => {
    return (
      <div className="popup-overlay" onClick={onClose}>
        <div className="popup-content" onClick={e => e.stopPropagation()}>
          <div className="popup-header">
            <FaUserCircle className="user-icon" />
            <h2>{user.username}</h2>
          </div>
          <div className="popup-details">
            <div className="detail-row">
              <span className="detail-label">Points:</span>
              <span className="detail-value">{user.points || 0}</span>
            </div>
          </div>
          <div className="claimed-rewards-list">
            <h3>Claimed Rewards</h3>
            {popupLoading ? (
              <div>Loading...</div>
            ) : popupClaimedRewards.length > 0 ? (
              popupClaimedRewards.map((reward, idx) => (
                <div key={idx} className="claimed-reward-item">
                  <span className="claimed-reward-name">{reward.rewardName}</span>
                  <span className="claimed-reward-date">{new Date(reward.claimedAt).toLocaleDateString()}</span>
                </div>
              ))
            ) : (
              <div className="no-claimed-rewards">No claimed rewards</div>
            )}
          </div>
          <button className="popup-close-btn" onClick={onClose}>
            Exit
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="reward-management">
      <header className="reward-header-bar">
        <div className="header-logo-container">
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRisk</div>
        </div>

        <div className="search-container">
          <input
            type="text"
            placeholder="Search..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <span className="clear-icon" onClick={() => setSearchTerm('')}>
              &times;
            </span>
          )}
        </div>

        <div className="header-right">
          <NotificationBox />
          <div className="rewards-menu">
            <button onClick={() => setShowMenu(!showMenu)}>
              <FaEllipsisV className="three-dot-icon" />
            </button>
            {showMenu && (
              <div className="dropdown-menu">
                <button onClick={() => exportUserPointsToPDF(users, currentUser)}>Export User Points to PDF</button>
                <button onClick={() => exportRewardsToPDF(rewards, currentUser)}>Export Rewards to PDF</button>
                <CSVLink 
                  data={userCSVData} 
                  filename={csvFilename}
                  className="csv-link"
                  onClick={handleUserCSVExport}
                >
                  Export User Points to CSV
                </CSVLink>
                <CSVLink 
                  data={rewardCSVData} 
                  filename={csvFilename}
                  className="csv-link"
                  onClick={handleRewardCSVExport}
                >
                  Export Rewards to CSV
                </CSVLink>
                <button onClick={() => navigate('/Homepage')}>Go to Homepage</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="reward-wrapper">
        <p className="reward-title">Reward Management</p>
      </div>

      <div className="reward-container">
        <div className="reward-tabs">
          <button
            className={`tab ${activeTab === 'userPoints' ? 'active' : ''}`}
            onClick={() => setActiveTab('userPoints')}
          >
            User Points
          </button>
          <button
            className={`tab ${activeTab === 'rewards' ? 'active' : ''}`}
            onClick={() => setActiveTab('rewards')}
          >
            Rewards
          </button>
        </div>

        {activeTab === 'userPoints' ? (
          <div className="reward-user-grid-container">
            <div className={`user-grid ${isMobile ? 'mobile-view' : ''}`}>
              {currentChunk.map((user, index) => (
                user ? (
                  <div key={user.id} className="user-card" onClick={() => { setSelectedUser(user); setIsPopupVisible(true); }}>
                    <FaUserCircle className="user-icon" />
                    <div className="user-name">{user.username}</div>
                    <div className="user-points">
                      <span className="points-value">{user.points || 0} Points</span>
                    </div>
                  </div>
                ) : (
                  <div key={`empty-${index}`} className="user-card empty-card" />
                )
              ))}
            </div>
            {isPopupVisible && selectedUser && (
              <UserPopup
                user={selectedUser}
                onClose={() => setIsPopupVisible(false)}
              />
            )}

            <div className="user-arrow-container">
              {currentChunkIndex > 0 && (
                <div onClick={handlePreviousChunk}>
                  <FaArrowLeft className="user-arrow-icon" />
                </div>
              )}
              {currentChunkIndex < userChunks.length - 1 && (
                <div onClick={handleNextChunk}>
                  <FaArrowRight className="user-arrow-icon" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rewards-management">
            <button
              className="add-reward-button"
              onClick={() => {
                setShowAddForm(true);
                setNewReward({ name: '', points: '' }); // Reset form when opening
                setMessage({ text: '', type: '' });
              }}
            >
              <FaPlus /> Add New Reward
            </button>

            {showAddForm && (
              <div className="reward-form">
                {message.text && (
                  <div className={`message ${message.type}`}>
                    {message.text}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Reward Name"
                  value={newReward.name}
                  onChange={(e) => setNewReward({ ...newReward, name: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Points Required"
                  value={newReward.points}
                  onChange={(e) => setNewReward({ ...newReward, points: e.target.value })}
                />
                <button onClick={handleAddReward}>Save</button>
                <button onClick={handleCancelAddReward}>Cancel</button>
              </div>
            )}

            {editingReward && (
              <div className="reward-form">
                <input
                  type="text"
                  value={editingReward.name}
                  onChange={(e) => setEditingReward({
                    ...editingReward,
                    name: e.target.value
                  })}
                  placeholder="Reward Name"
                />
                <input
                  type="number"
                  value={editingReward.points}
                  onChange={(e) => setEditingReward({
                    ...editingReward,
                    points: e.target.value
                  })}
                  placeholder="Points Required"
                />
                <button onClick={handleUpdateReward}>Update</button>
                <button onClick={() => setEditingReward(null)}>Cancel</button>
              </div>
            )}

            <div className="rewards-grid">
              {currentRewardChunk.map(reward => (
                <div key={reward.id} className="reward-card">
                  <div className="reward-info">
                    <h3>{reward.name}</h3>
                    <p>{reward.points} Points</p>
                  </div>
                  <div className="reward-actions">
                    <button onClick={() => handleEditReward(reward)}>
                      <FaEdit />
                    </button>
                    <button onClick={() => handleDeleteReward(reward.id)}>
                      <FaTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="reward-arrow-container">
              {currentRewardChunkIndex > 0 && (
                <div onClick={handlePreviousRewardChunk}>
                  <FaArrowLeft className="reward-arrow-icon" />
                </div>
              )}
              {currentRewardChunkIndex < rewardChunks.length - 1 && (
                <div onClick={handleNextRewardChunk}>
                  <FaArrowRight className="reward-arrow-icon" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RewardManagement;
import React, { useState, useEffect, useContext } from 'react';
import './AccountManagement.css';
import logo from './assets/images/PISCARISK_LOGO.png';
import { FaUserCircle, FaArrowRight, FaArrowLeft, FaEdit, FaTrash, FaUserPlus, FaEllipsisV, FaSave, FaTimes } from 'react-icons/fa';
import jsPDF from 'jspdf';
import { CSVLink } from 'react-csv';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import { logActivity, logMessages } from './utils/logger';
import NotificationBox from './components/NotificationBox';
import UserPopup from './components/UserPopup';
import { fetchAllUsers, addNewUser } from './services/accountService';
import { exportAccountToPDF, prepareAccountCSVData, generateAccountCSVFilename, handleAccountCSVExport } from './utils/exportAccounts';

const AccountManagement = () => {
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [AccountUsers, setAccountUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { currentUser,createStaffAccount,isAdmin,isTechOfficer } = useContext(AuthContext);
  const [csvFilename, setCsvFilename] = useState('piscarisk_useraccounts.csv');
  const [errors, setErrors] = useState({ email: '' });
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Current User Data:", currentUser);
    console.log("Is Admin:", isAdmin());
  }, [currentUser]);
  
  
  const [newUser, setNewUser] = useState({
    username: '',
    fullName: '',
    address: '',
    email: '',
    contactNumber: '',
    role: 'User',
    status: 'Active',
    dateJoined: new Date().toISOString().split('T')[0],
    password: ''
  });

    // Define resetForm function
    const resetForm = () => {
      setNewUser({
        username: '',
        email: '',
        fullName: '',
        address: '',
        contactNumber: '',
        role: '',
        password: ''
      });
    };

  const chunkSize = 3;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const users = await fetchAllUsers();
      setAccountUsers(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({ text: 'Error fetching users', type: 'error' });
    }
  };

  const filteredUsers = AccountUsers.filter(user => {
    if (!user || !user.username) return false;
    
    return (
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.role?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  });

  const AccountUserChunks = [];
  for (let i = 0; i < filteredUsers.length; i += chunkSize) {
    AccountUserChunks.push(filteredUsers.slice(i, i + chunkSize));
  }

  const AccountcurrentChunk = AccountUserChunks[currentChunkIndex] || [];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewUser(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'email') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(value)) {
        setErrors((prevErrors) => ({
          ...prevErrors,
          email: 'Please enter a valid email address.',
        }));
      } else {
        setErrors((prevErrors) => ({
          ...prevErrors,
          email: '',
        }));
      }
    }
  };

  const handleAddUser = async () => {
    try {

      if (newUser.password.length < 6) {
        setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
        return;
      }
      // Enhanced validation
      if (!newUser.username || !newUser.role || !newUser.password || !newUser.email) {
        setMessage({ text: 'All fields are required', type: 'error' });
        return;
      }
  
      if (!/^\S+@\S+\.\S+$/.test(newUser.email)) {
        setMessage({ text: 'Please enter a valid email address', type: 'error' });
        return;
      }
  
      if (newUser.password.length < 8) {
        setMessage({ text: 'Password must be at least 8 characters', type: 'error' });
        return;
      }
            // Add this validation in handleAddUser
      const allowedRoles = ['Admin', 'Tech Officer', 'Fish Farmer'];
      if (!allowedRoles.includes(newUser.role)) {
        setMessage({ text: 'Invalid role selected', type: 'error' });
        return;
      }
  
      // Show loading state
      setMessage({ text: 'Creating user...', type: 'info' });
  
      const result = await createStaffAccount({
        email: newUser.email,
        username: newUser.username,
        fullName: newUser.fullName,
        address: newUser.address,
        contactNumber: newUser.contactNumber,
        role: newUser.role,
        password: newUser.password
      });
  
      if (result.success) {
        setMessage({ text: newUser.role + ' ' + newUser.username + ' created successfully!', type: 'success' });
        resetForm(); // Now this will work
        fetchAllUsers();
      }
    } catch (error) {
      let errorMessage = error.message;
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters';
      }
      
      setMessage({ text: `Error: ${errorMessage}`, type: 'error' });
    }
  };


  const handleCancelAddUser = () => {
    setShowAddUserForm(false);
    setNewUser({
      username: '',
      fullName: '',
      address: '',
      email: '',
      contactNumber: '',
      role: 'User',
      status: 'Active',
      dateJoined: new Date().toISOString().split('T')[0],
      password: ''
    });
    setMessage({ text: '', type: '' });
  };

  const accountCSVData = prepareAccountCSVData(AccountUsers);

  const handleCSVExportClick = () => {
    const filename = generateAccountCSVFilename();
    setCsvFilename(filename);
    handleAccountCSVExport(currentUser);
  };

  return (
    <div className="account-management">
      <header className="account-header-bar">
        <div className="header-logo-container">
          <img src={logo} alt="PiscaRisk Logo" className="header-logo" />
          <div className="header-title">PiscaRisk</div>
        </div>

        <div className="header-right">
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
          <NotificationBox />
          <div className="account-menu">
            <button onClick={() => setShowMenu(!showMenu)}>
              <FaEllipsisV className="three-dot-icon" />
            </button>
            {showMenu && (
              <div className="dropdown-menu">
                <button onClick={() => exportAccountToPDF(AccountUsers, currentUser)}>Export Account Data to PDF</button>
                <CSVLink
                  data={accountCSVData}
                  filename={csvFilename}
                  className="csv-link"
                  onClick={handleCSVExportClick}
                >
                  Export Account Data to CSV
                </CSVLink>
                <button onClick={() => navigate('/Homepage')}>Go to Homepage</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="manage-wrapper">
        <p className="manage-title">Account Management</p>
      </div>

      <div className="account-container">
        <div className="add-user-container">
          <button className="add-user-button" onClick={() => setShowAddUserForm(true)}>
            <FaUserPlus className="button-icon" /> Add New User
          </button>
        </div>

        {showAddUserForm && (
          <div className="add-user-form-container">
            <div className="add-user-form">
              <div className="form-header">
                <h3>Add New Employee</h3>
                <button className="close-form-button" onClick={handleCancelAddUser}>
                  &times;
                </button>
              </div>
              
              {message.text && (
                <div className={`message ${message.type}`}>
                  {message.text}
                </div>
              )}
              
              <div className="form-row">
                <div className="form-group">
                  <label>Username*</label>
                  <input 
                    type="text" 
                    name="username" 
                    value={newUser.username} 
                    onChange={handleInputChange} 
                    placeholder='Enter Username'
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label>Full Name*</label>
                  <input 
                    type="text" 
                    name="fullName" 
                    value={newUser.fullName} 
                    onChange={handleInputChange} 
                    placeholder='Enter full name'
                    required 
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Job Position</label>
                  <select 
                    name="role" 
                    value={newUser.role} 
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Position</option>
                    <option value="Admin">Admin</option>
                    <option value="Tech Officer">Tech Officer</option>
                    <option value="Fish Farmer">Fish Farmer</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input 
                    type="email" 
                    name="email" 
                    value={newUser.email} 
                    onChange={handleInputChange}  
                    placeholder='Enter Email Address'
                    className={errors.email ? 'input-error' : ''}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Address*</label>
                  <input 
                    type="text" 
                    name="address" 
                    value={newUser.address} 
                    onChange={handleInputChange} 
                    placeholder='Enter Address'
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label>Contact Number*</label>
                  <input 
                    type="text" 
                    name="contactNumber" 
                    value={newUser.contactNumber} 
                    onChange={handleInputChange} 
                    placeholder="Enter Phone Number"
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    name="password" 
                    value={newUser.password} 
                    onChange={handleInputChange} 
                    placeholder='Enter Password'
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label>Date Joined</label>
                  <input 
                    type="date" 
                    name="dateJoined" 
                    value={newUser.dateJoined} 
                    onChange={handleInputChange} 
                  />
                </div>
              </div>
              
              <div className="form-buttons">
                <button className="add-button" onClick={handleAddUser}>
                  Add User
                </button>
                <button className="cancel-button" onClick={handleCancelAddUser}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="user-grid-container">
          {AccountUsers.length > 0 ? (
            <>
              <div className={`account-grid ${isMobile ? 'mobile-view' : ''}`}>
                {AccountcurrentChunk
                  .filter(user => user && user.username)
                  .map(user => (
                    <div key={user.id} className="account-card" onClick={() => setSelectedUser(user)}>
                      {user.profileImage ? (
                        <img 
                          src={user.profileImage} 
                          alt={`${user.username}'s profile`} 
                          className="account-image"
                        />
                      ) : (
                        <FaUserCircle className="account-icon" />
                      )}
                      <div className="account-name">{user.username}</div>
                      <div className="account-role">{user.role}</div>
                    </div>
                  ))
                }
              </div>
              
              {selectedUser && (
                <UserPopup
                  user={selectedUser}
                  onClose={() => setSelectedUser(null)}
                  onUpdate={(updatedUser) => {
                    setSelectedUser(updatedUser);
                    setAccountUsers(prev =>
                      prev.map(u => u.username === updatedUser.username ? updatedUser : u)
                    );
                  }}
                  currentUser={currentUser}
                />
              )}

              <div className="acc-arrow-container">
                {currentChunkIndex > 0 && (
                  <div onClick={() => setCurrentChunkIndex(currentChunkIndex - 1)}>
                    <FaArrowLeft className="acc-arrow-icon" />
                  </div>
                )}
                {currentChunkIndex < AccountUserChunks.length - 1 && (
                  <div onClick={() => setCurrentChunkIndex(currentChunkIndex + 1)}>
                    <FaArrowRight className="acc-arrow-icon" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="no-users-message">
              No users found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountManagement;
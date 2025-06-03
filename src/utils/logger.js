// Logger utility for system activities
import { db, getData } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

// Helper function to create a readable and unique ID
const createUniqueId = (category, timestamp) => {
  const date = new Date(timestamp);
  const dateStr = date.toISOString().split('T')[0];
  const randomPart = Math.random().toString(16).substr(2, 6).toUpperCase();
  return `${category}_${dateStr}_${randomPart}`;
};

export const logActivity = async (category, message, username) => {
  // Create log object with unique ID
  const timestamp = new Date().toISOString();
  const logsUniqueId = createUniqueId(category, timestamp);
  const newLog = {
    id: logsUniqueId,
    timestamp,
    category,
    message,
    username
  };

  try {
    // Save to Firebase
    await setDoc(doc(db, 'systemLogs', logsUniqueId), newLog);
    
    // Also keep a local copy in localStorage
    const logs = JSON.parse(localStorage.getItem('logs') || '[]');
    logs.unshift(newLog);
    // Keep only last 1000 logs to prevent localStorage from getting too full
    const trimmedLogs = logs.slice(0, 1000);
    localStorage.setItem('logs', JSON.stringify(trimmedLogs));
  } catch (error) {
    console.error('Error saving log:', error);
    // If Firebase fails, at least keep the log locally
    const logs = JSON.parse(localStorage.getItem('logs') || '[]');
    logs.unshift(newLog);
    localStorage.setItem('logs', JSON.stringify(logs.slice(0, 1000)));
  }
};

// Function to retrieve all logs from Firebase
export const getAllLogs = async () => {
  try {
    const logs = await getData('systemLogs');
    // Ensure all logs have proper username field
    const processedLogs = logs.map(log => ({
      ...log,
      username: log.username || 'Unknown User',
      message: typeof log.message === 'object' ? JSON.stringify(log.message) : String(log.message || ''),
      category: String(log.category || ''),
      timestamp: log.timestamp || new Date().toISOString()
    }));
    
    // Sort by timestamp (newest first)
    return processedLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error fetching logs from Firebase:', error);
    // Fallback to localStorage if Firebase fails
    const localLogs = JSON.parse(localStorage.getItem('logs') || '[]');
    // Process local logs similarly
    const processedLocalLogs = localLogs.map(log => ({
      ...log,
      username: log.username || 'Unknown User',
      message: typeof log.message === 'object' ? JSON.stringify(log.message) : String(log.message || ''),
      category: String(log.category || ''),
      timestamp: log.timestamp || new Date().toISOString()
    }));
    return processedLocalLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
};

// Function to retrieve logs by category
export const getLogsByCategory = async (category) => {
  try {
    const logs = await getData('systemLogs');
    return logs
      .filter(log => log.category === category)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error('Error fetching logs by category:', error);
    // Fallback to localStorage if Firebase fails
    const logs = JSON.parse(localStorage.getItem('logs') || '[]');
    return logs.filter(log => log.category === category);
  }
};

// Function to retrieve logs by username
export const getLogsByUsername = async (username) => {
  try {
    const logs = await getData('systemLogs');
    return logs
      .filter(log => log.username === username)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error('Error fetching logs by username:', error);
    // Fallback to localStorage if Firebase fails
    const logs = JSON.parse(localStorage.getItem('logs') || '[]');
    return logs.filter(log => log.username === username);
  }
};

// Predefined log messages for different activities
export const logMessages = {
  // Login related
  login: {
    success: (username) => `User ${username} logged in successfully`,
    failed: (username) => `Failed login attempt for user ${username}`,
    invalidCredentials: (username) => `Invalid credentials provided for user ${username}`,
    accountLocked: (username) => `Account locked for user ${username} due to multiple failed attempts`
  },

  // Logout related
  logout: {
    success: (username) => `User ${username} logged out successfully`,
    sessionExpired: (username) => `Session expired for user ${username}`,
    forceLogout: (username) => `User ${username} was force logged out by system`,
    inactivityLogout: (username) => `User ${username} logged out due to inactivity`,
    logoutError: (username, error) => `Error during logout for user ${username}: ${error}`,
    logoutAttempt: (username) => `User ${username} attempted to log out`,
    logoutCancelled: (username) => `User ${username} cancelled logout attempt`,
    logoutTimeout: (username) => `User ${username} logged out due to session timeout`
  },

  // Profile related
  profile: {
    update: (username) => `User ${username} updated their profile information`,
    imageUpdate: (username) => `User ${username} updated their profile picture`,
    imageRemove: (username) => `User ${username} removed their profile picture`,
    usernameChange: (username, newUsername) => `User ${username} changed their username to ${newUsername}`,
    emailChange: (username) => `User ${username} updated their email address`
  },

  // Report related
  report: {
    mobileSubmit: (username, pondId) => `Mobile user ${username} submitted a new report for Fish Pond ${pondId}`,
    webSubmit: (username, pondId) => `User ${username} submitted a new report for Fish Pond ${pondId}`,
    reportError: (username, error) => `Error during report submission by user ${username}: ${error}`,
    reportUpdate: (username, pondId) => `User ${username} updated report for Fish Pond ${pondId}`,
    reportDelete: (username, pondId) => `User ${username} deleted report for Fish Pond ${pondId}`,
    reportView: (username, pondId) => `User ${username} viewed report for Fish Pond ${pondId}`,
    reportExport: (username) => `User ${username} exported report data`,
    reportValidation: (username, error) => `Report validation error for user ${username}: ${error}`,
    reportSync: (username) => `Report data synchronized for user ${username}`,
    reportProcessing: (username, pondId) => `Processing report for Fish Pond ${pondId} submitted by ${username}`,
    reportComplete: (username, pondId) => `Report processing complete for Fish Pond ${pondId} by ${username}`
  },

  // Feedback related
  feedback: {
    create: (username) => `User ${username} submitted new feedback`,
    mobileSubmit: (username, type) => `Mobile user ${username} submitted new ${type} feedback`,
    webSubmit: (username, type) => `User ${username} submitted new ${type} feedback`,
    reply: (username, feedbackId) => `User ${username} replied to feedback ID: ${feedbackId}`,
    replyError: (username, feedbackId, error) => `Error when user ${username} tried to reply to feedback ID: ${feedbackId}. Error: ${error}`,
    delete: (username) => `User ${username} deleted feedback`,
    edit: (username, feedbackId) => `User ${username} edited feedback ID: ${feedbackId}`,
    statusChange: (username, feedbackId, newStatus) => `User ${username} changed status of feedback ID: ${feedbackId} to ${newStatus}`,
    feedbackError: (username, action, error) => `Error during feedback ${action} by user ${username}: ${error}`,
    feedbackValidation: (username, error) => `Feedback validation error for user ${username}: ${error}`,
    feedbackSync: (username) => `Feedback data synchronized for user ${username}`,
    feedbackProcessing: (username, type) => `Processing ${type} feedback submitted by ${username}`,
    feedbackComplete: (username, type) => `Feedback processing complete for ${type} by ${username}`
  },

  // Reward related
  reward: {
    pointsEarned: (username, points, reason) => `User ${username} earned ${points} points for ${reason}`,
    rewardObtained: (username, rewardName) => `User ${username} obtained reward: ${rewardName}`,
    rewardAdded: (username, rewardName) => `User ${username} added new reward: ${rewardName}`,
    rewardModified: (username, rewardName) => `User ${username} modified reward: ${rewardName}`,
    rewardDeleted: (username, rewardName) => `User ${username} deleted reward: ${rewardName}`,
    pointsUpdated: (username, points) => `User ${username} updated points to ${points}`,
    rewardAssigned: (admin, username, rewardName) => `Admin ${admin} assigned reward ${rewardName} to user ${username}`,
    rewardRemoved: (admin, username, rewardName) => `Admin ${admin} removed reward ${rewardName} from user ${username}`,
    pointsReset: (admin, username) => `Admin ${admin} reset points for user ${username}`
  },

  // Account Management related
  account: {
    userCreated: (username, newUser) => `User ${username} created new user: ${newUser}`,
    userModified: (username, targetUser) => `User ${username} modified user: ${targetUser}`,
    userDeleted: (username, targetUser) => `User ${username} deleted user: ${targetUser}`,
    roleChanged: (username, targetUser, newRole) => `User ${username} changed role of ${targetUser} to ${newRole}`,
    statusChanged: (username, targetUser, newStatus) => `User ${username} changed status of ${targetUser} to ${newStatus}`,
    passwordChanged: (admin, username) => `Admin ${admin} changed password for user ${username}`,
    emailUpdated: (admin, username) => `Admin ${admin} updated email for user ${username}`,
    contactUpdated: (admin, username) => `Admin ${admin} updated contact information for user ${username}`,
    addressUpdated: (admin, username) => `Admin ${admin} updated address for user ${username}`,
    userSuspended: (admin, username) => `Admin ${admin} suspended user ${username}`,
    userReactivated: (admin, username) => `Admin ${admin} reactivated user ${username}`
  },

  // Data Export related
  export: {
    pdfDownload: (username, dataType) => `${username} exported ${dataType} data to PDF`,
    csvDownload: (username, dataType) => `${username} exported ${dataType} data to CSV`,
    dataExport: (username, dataType) => `${username} exported ${dataType} data`,
    userDataExport: (username) => `User ${username} exported user data`,
    rewardDataExport: (username) => `User ${username} exported reward data`,
    accountDataExport: (username) => `User ${username} exported account data`,
    feedbackDataExport: (username) => `User ${username} exported feedback data`,
    weatherDataExport: (username) => `User ${username} exported weather data`,
    pondDataExport: (username) => `User ${username} exported pond data`,
    allDataExport: (username) => `User ${username} exported all system data`,
    exportStart: (username, type) => `User ${username} started exporting ${type} data`,
    exportComplete: (username, type) => `User ${username} completed exporting ${type} data`,
    exportCancelled: (username, type) => `User ${username} cancelled ${type} data export`,
    exportError: (username, type, error) => `Error during ${type} data export by user ${username}: ${error}`,
    exportProgress: (username, type, progress) => `Export progress for ${type} data by user ${username}: ${progress}%`
  },

  // Weather related
  weather: {
    fetchError: (username, city) => `Error fetching weather data for ${city} by ${username}`,
    apiError: (username, error) => `Weather API error encountered by ${username}: ${error}`,
    dataUpdate: (username, city) => `Weather data updated for ${city}`,
    forecastError: (username, city, error) => `Weather forecast error for ${city}: ${error}`,
    locationError: (username, error) => `Weather location error: ${error}`
  },

  // Fish Pond related
  pond: {
    conditionUpdate: (username, data) => `${username} updated pond conditions: ${JSON.stringify(data)}`,
    alert: (username, alert) => `${username} received pond alert: ${alert}`,
    dataError: (username, error) => `${username} encountered pond data error: ${error}`,
    thresholdExceeded: (username, parameter, value) => `Pond ${parameter} threshold exceeded: ${value}`,
    parameterUpdate: (username, parameter, value) => `User ${username} updated pond ${parameter} to ${value}`,
    alertCleared: (username, parameter) => `Alert cleared for pond ${parameter}`,
    dataSync: (username) => `Pond data synchronized for user ${username}`,
    calibrationUpdate: (username, parameter) => `User ${username} updated calibration for ${parameter}`
  },

  // Error related
  error: {
    system: (message) => `System error: ${message}`,
    network: (message) => `Network error: ${message}`,
    validation: (message) => `Validation error: ${message}`,
    database: (message) => `Database error: ${message}`,
    permission: (username, action) => `Permission error: User ${username} attempted unauthorized ${action}`,
    dataIntegrity: (message) => `Data integrity error: ${message}`,
    fileOperation: (message) => `File operation error: ${message}`,
    exportError: (username, type) => `Export error for user ${username}: Failed to export ${type} data`,
    authenticationError: (username, error) => `Authentication error for user ${username}: ${error}`,
    authorizationError: (username, action) => `Authorization error: User ${username} denied access to ${action}`,
    sessionError: (username, error) => `Session error for user ${username}: ${error}`,
    apiError: (service, error) => `${service} API error: ${error}`,
    connectionError: (username, error) => `Connection error for user ${username}: ${error}`,
    timeoutError: (operation, error) => `Timeout error during ${operation}: ${error}`,
    resourceError: (resource, error) => `Resource error for ${resource}: ${error}`,
    criticalError: (component, error) => `Critical error in ${component}: ${error}`
  }
}; 
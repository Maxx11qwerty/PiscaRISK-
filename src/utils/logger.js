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

export const logActivity = async (category, message, username, originalTimestamp = null, userRole = null) => {
  // Use the original timestamp if provided, otherwise use current time
  let timestamp;
  try {
    if (originalTimestamp) {
      // Handle Firestore Timestamp
      if (typeof originalTimestamp.toDate === 'function') {
        timestamp = originalTimestamp.toDate().toISOString();
      }
      // Handle Date object
      else if (originalTimestamp instanceof Date) {
        timestamp = originalTimestamp.toISOString();
      }
      // Handle string
      else if (typeof originalTimestamp === 'string') {
        const date = new Date(originalTimestamp);
        if (!isNaN(date.getTime())) {
          timestamp = date.toISOString();
        } else {
          throw new Error('Invalid date string');
        }
      }
      // If no valid timestamp found, use current date
      else {
        timestamp = new Date().toISOString();
      }
    } else {
      timestamp = new Date().toISOString();
    }
  } catch (error) {
    console.warn('Error processing timestamp:', error);
    timestamp = new Date().toISOString();
  }

  // Debug: Log timestamp creation for important categories
  if (category === 'export' || category === 'feedback') {
  }

  // Create log object with unique ID
  const logsUniqueId = createUniqueId(category, timestamp);
  const newLog = {
    id: logsUniqueId,
    timestamp,
    category,
    message,
    username,
    userRole: userRole || 'Unknown'
  };

  // Debug logging for timestamp issues
  if (category === 'export' || category === 'feedback') {
  }

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
    
    // Fetch user data to get roles and mobile user status from users collection
    let users = [];
    try {
      const webUsers = await getData('users');
      const mobileUsers = await getData('mobileUsers');
      users = [...webUsers, ...mobileUsers];
    } catch (userError) {
      console.warn('Could not fetch user data for roles:', userError);
    }
    
    // Create a map of username to user data for quick lookup
    const userDataMap = new Map();
    users.forEach(user => {
      if (user.username) {
        userDataMap.set(user.username, {
          role: user.user_role || user.role || 'Unknown',
          isMobileUser: user.isMobileUser || false,
          farm: user.farm || null
        });
      }
    });
    
    // Fetch reports data to get source information
    let reports = [];
    try {
      reports = await getData('reports');
    } catch (reportsError) {
      console.warn('Could not fetch reports data for source:', reportsError);
    }
    
    // Create a map of report data for source lookup
    const reportSourceMap = new Map();
    reports.forEach(report => {
      if (report.submitted_by || report.user) {
        const username = report.submitted_by || report.user;
        if (username && report.source) {
          reportSourceMap.set(username, report.source);
        }
      }
    });
    
    // Ensure all logs have proper username field and include role and source information
    const processedLogs = logs.map(log => {
      const userData = userDataMap.get(log.username);
      const reportSource = reportSourceMap.get(log.username);
      
      // Determine source: check report source first, then user mobile status
      let source = 'Web'; // Default to Web
      if (reportSource) {
        source = reportSource;
      } else if (userData && userData.isMobileUser) {
        source = 'Mobile';
      }
      
      // Validate timestamp - ensure it's a valid date string
      let validTimestamp = log.timestamp;
      if (log.timestamp) {
        try {
          const date = new Date(log.timestamp);
          if (isNaN(date.getTime())) {
            console.warn('Invalid timestamp found in log:', log.timestamp, 'for log ID:', log.id);
            validTimestamp = null; // Mark as invalid
          }
        } catch (error) {
          console.warn('Error parsing timestamp:', error, 'for log ID:', log.id);
          validTimestamp = null; // Mark as invalid
        }
      }
      
      if (logs.indexOf(log) < 3) {
      }
      
      return {
        ...log,
        username: log.username || 'Unknown User',
        message: typeof log.message === 'object' ? JSON.stringify(log.message) : String(log.message || ''),
        category: String(log.category || ''),
        timestamp: validTimestamp, // Use validated timestamp
        role: userData ? userData.role : 'Unknown',
        isMobileUser: userData ? userData.isMobileUser : false,
        source: source,
        userFarm: userData ? userData.farm : null
      };
    });
    
    // Filter out logs with invalid timestamps and sort by timestamp (newest first)
    const validLogs = processedLogs.filter(log => log.timestamp !== null);
    if (validLogs.length !== processedLogs.length) {
      console.warn(`Filtered out ${processedLogs.length - validLogs.length} logs with invalid timestamps`);
    }
    return validLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error fetching logs from Firebase:', error);
    // Fallback to localStorage if Firebase fails
    const localLogs = JSON.parse(localStorage.getItem('logs') || '[]');
    // Process local logs similarly
    const processedLocalLogs = localLogs.map(log => {
      // Validate timestamp for local logs too
      let validTimestamp = log.timestamp;
      if (log.timestamp) {
        try {
          const date = new Date(log.timestamp);
          if (isNaN(date.getTime())) {
            console.warn('Invalid timestamp found in local log:', log.timestamp);
            validTimestamp = null;
          }
        } catch (error) {
          console.warn('Error parsing local log timestamp:', error);
          validTimestamp = null;
        }
      }
      
      return {
        ...log,
        username: log.username || 'Unknown User',
        message: typeof log.message === 'object' ? JSON.stringify(log.message) : String(log.message || ''),
        category: String(log.category || ''),
        timestamp: validTimestamp,
        role: log.userRole || 'Unknown',
        isMobileUser: log.isMobileUser || false,
        source: log.source || 'Web'
      };
    });
    
    // Filter out logs with invalid timestamps and sort
    const validLocalLogs = processedLocalLogs.filter(log => log.timestamp !== null);
    if (validLocalLogs.length !== processedLocalLogs.length) {
      console.warn(`Filtered out ${processedLocalLogs.length - validLocalLogs.length} local logs with invalid timestamps`);
    }
    return validLocalLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
};

// Function to retrieve logs by category
export const getLogsByCategory = async (category) => {
  try {
    const logs = await getData('systemLogs');
    
    // Fetch user data to get roles and mobile user status from users collection
    let users = [];
    try {
      const webUsers = await getData('users');
      const mobileUsers = await getData('mobileUsers');
      users = [...webUsers, ...mobileUsers];
    } catch (userError) {
      console.warn('Could not fetch user data for roles:', userError);
    }
    
    // Create a map of username to user data for quick lookup
    const userDataMap = new Map();
    users.forEach(user => {
      if (user.username) {
        userDataMap.set(user.username, {
          role: user.user_role || user.role || 'Unknown',
          isMobileUser: user.isMobileUser || false,
          farm: user.farm || null
        });
      }
    });
    
    // Fetch reports data to get source information
    let reports = [];
    try {
      reports = await getData('reports');
    } catch (reportsError) {
      console.warn('Could not fetch reports data for source:', reportsError);
    }
    
    // Create a map of report data for source lookup
    const reportSourceMap = new Map();
    reports.forEach(report => {
      if (report.submitted_by || report.user) {
        const username = report.submitted_by || report.user;
        if (username && report.source) {
          reportSourceMap.set(username, report.source);
        }
      }
    });
    
    const filteredLogs = logs
      .filter(log => log.category === category)
      .map(log => {
        const userData = userDataMap.get(log.username);
        const reportSource = reportSourceMap.get(log.username);
        
        // Determine source: check report source first, then user mobile status
        let source = 'Web'; // Default to Web
        if (reportSource) {
          source = reportSource;
        } else if (userData && userData.isMobileUser) {
          source = 'Mobile';
        }
        
        return {
          ...log,
          role: userData ? userData.role : 'Unknown',
          isMobileUser: userData ? userData.isMobileUser : false,
          source: source
        };
      });
    
    return filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error('Error fetching logs by category:', error);
    // Fallback to localStorage if Firebase fails
    const logs = JSON.parse(localStorage.getItem('logs') || '[]');
    const filteredLogs = logs.filter(log => log.category === category);
    return filteredLogs.map(log => ({
      ...log,
      role: log.userRole || 'Unknown',
      isMobileUser: log.isMobileUser || false,
      source: log.source || 'Web'
    }));
  }
};

// Function to retrieve logs by username
export const getLogsByUsername = async (username) => {
  try {
    const logs = await getData('systemLogs');
    
    // Fetch user data to get roles and mobile user status from users collection
    let users = [];
    try {
      const webUsers = await getData('users');
      const mobileUsers = await getData('mobileUsers');
      users = [...webUsers, ...mobileUsers];
    } catch (userError) {
      console.warn('Could not fetch user data for roles:', userError);
    }
    
    // Create a map of username to user data for quick lookup
    const userDataMap = new Map();
    users.forEach(user => {
      if (user.username) {
        userDataMap.set(user.username, {
          role: user.user_role || user.role || 'Unknown',
          isMobileUser: user.isMobileUser || false,
          farm: user.farm || null
        });
      }
    });
    
    // Fetch reports data to get source information
    let reports = [];
    try {
      reports = await getData('reports');
    } catch (reportsError) {
      console.warn('Could not fetch reports data for source:', reportsError);
    }
    
    // Create a map of report data for source lookup
    const reportSourceMap = new Map();
    reports.forEach(report => {
      if (report.submitted_by || report.user) {
        const reportUsername = report.submitted_by || report.user;
        if (reportUsername && report.source) {
          reportSourceMap.set(reportUsername, report.source);
        }
      }
    });
    
    const filteredLogs = logs
      .filter(log => log.username === username)
      .map(log => {
        const userData = userDataMap.get(log.username);
        const reportSource = reportSourceMap.get(log.username);
        
        // Determine source: check report source first, then user mobile status
        let source = 'Web'; // Default to Web
        if (reportSource) {
          source = reportSource;
        } else if (userData && userData.isMobileUser) {
          source = 'Mobile';
        }
        
        return {
          ...log,
          role: userData ? userData.role : 'Unknown',
          isMobileUser: userData ? userData.isMobileUser : false,
          source: source
        };
      });
    
    return filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error('Error fetching logs by username:', error);
    // Fallback to localStorage if Firebase fails
    const logs = JSON.parse(localStorage.getItem('logs') || '[]');
    const filteredLogs = logs.filter(log => log.username === username);
    return filteredLogs.map(log => ({
      ...log,
      role: log.userRole || 'Unknown',
      isMobileUser: log.isMobileUser || false,
      source: log.source || 'Web'
    }));
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

// Function to properly log reports with their correct timestamps
export const logReportSubmission = async (reportData, username, source = 'web') => {
  try {
    // Extract the actual submission timestamp from the report data
    let submissionTimestamp = null;
    
    if (reportData.timestamp) {
      // Handle Firestore Timestamp
      if (typeof reportData.timestamp.toDate === 'function') {
        submissionTimestamp = reportData.timestamp.toDate();
      }
      // Handle Date object
      else if (reportData.timestamp instanceof Date) {
        submissionTimestamp = reportData.timestamp;
      }
      // Handle string timestamp
      else if (typeof reportData.timestamp === 'string') {
        submissionTimestamp = new Date(reportData.timestamp);
      }
      // Handle timestamp object with seconds/nanoseconds
      else if (reportData.timestamp.seconds && reportData.timestamp.nanoseconds) {
        submissionTimestamp = new Date(reportData.timestamp.seconds * 1000 + reportData.timestamp.nanoseconds / 1000000);
      }
    }
    
    // If we have a valid submission timestamp, use it; otherwise use current time
    const timestampToUse = submissionTimestamp && !isNaN(submissionTimestamp.getTime()) 
      ? submissionTimestamp 
      : new Date();
    
    // Create the appropriate log message based on source
    let logMessage;
    if (source === 'mobile') {
      logMessage = logMessages.report.mobileSubmit(username, reportData.fish_pond || reportData.pond || 'Unknown Pond');
    } else {
      logMessage = logMessages.report.webSubmit(username, reportData.fish_pond || reportData.pond || 'Unknown Pond');
    }
    
    // Log the activity with the correct timestamp
    await logActivity('report', logMessage, username, timestampToUse);
    
  } catch (error) {
    console.error('Error logging report submission:', error);
    // Fallback: log with current timestamp if there's an error
    await logActivity('report', `Report submission by ${username}`, username);
  }
};

// Function to retroactively log existing reports with correct timestamps
export const logExistingReports = async (reports) => {
  try {
   
    
    for (const report of reports) {
      if (report.timestamp && !report.logged) { // Only log if not already logged
        await logReportSubmission(report, report.submitted_by || report.user || 'Unknown User', report.source || 'web');
        
        // Mark as logged to prevent duplicate logging
        report.logged = true;
      }
    }
    
   
  } catch (error) {
    console.error('Error logging existing reports:', error);
  }
}; 

// Function to clean up incorrect report logs (use with caution)
export const cleanupIncorrectReportLogs = async () => {
  try {
   
    
    // Get all logs
    const allLogs = await getAllLogs();
    
    // Find report logs that might have incorrect timestamps
    // These are logs that were created when fetching reports instead of when submitting them
    const reportLogs = allLogs.filter(log => log.category === 'report');
    
   
    
    // For now, just log the report logs so you can manually review them
    // In a production environment, you might want to implement more sophisticated cleanup
    reportLogs.forEach(log => {
     
    });
    
   
    
  } catch (error) {
    console.error('Error during report log cleanup:', error);
  }
}; 

// Function to remove specific incorrect report logs
export const removeIncorrectReportLogs = async (logIds) => {
  try {
   
    
    // Import Firebase functions needed for deletion
    const { doc, deleteDoc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    
    let removedCount = 0;
    
    for (const logId of logIds) {
      try {
        await deleteDoc(doc(db, 'systemLogs', logId));
        removedCount++;
       
      } catch (error) {
        console.error(`Failed to remove log ${logId}:`, error);
      }
    }
    
   
    return removedCount;
    
  } catch (error) {
    console.error('Error removing incorrect report logs:', error);
    return 0;
  }
}; 

// Browser console utility function to fix report log timestamps
// Run this in the browser console to identify and fix incorrect report log timestamps
export const fixReportLogsFromConsole = async () => {
  try {

    const allLogs = await getAllLogs();
    // Find report logs
    const reportLogs = allLogs.filter(log => log.category === 'report');
    
   
    
    // Group logs by date to identify patterns
    const logsByDate = {};
    reportLogs.forEach(log => {
      const date = new Date(log.timestamp).toDateString();
      if (!logsByDate[date]) {
        logsByDate[date] = [];
      }
      logsByDate[date].push(log);
    });
    
   
    Object.keys(logsByDate).forEach(date => {
    });
    
    // Identify potentially incorrect logs (logs created today for old reports)
    const today = new Date().toDateString();
    const todayLogs = logsByDate[today] || [];
    const otherDayLogs = Object.keys(logsByDate)
      .filter(date => date !== today)
      .flatMap(date => logsByDate[date]);
    
    if (todayLogs.length > 0) {
     
      todayLogs.forEach(log => {
      });
    }
    
   
    
  } catch (error) {
    console.error('❌ Error analyzing report logs:', error);
  }
};

// Make the function available globally for console access
if (typeof window !== 'undefined') {
  window.fixReportLogsFromConsole = fixReportLogsFromConsole;
  window.removeIncorrectReportLogs = removeIncorrectReportLogs;
  window.cleanupIncorrectReportLogs = cleanupIncorrectReportLogs;
} 
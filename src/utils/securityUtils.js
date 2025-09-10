/**
 * Security utilities to prevent information disclosure and enhance application security
 */

/**
 * Sanitizes timestamps to prevent information disclosure
 * @param {any} timestamp - The timestamp to sanitize
 * @param {boolean} showRelative - Whether to show relative time instead of exact time
 * @returns {string} - Sanitized timestamp string
 */
export const sanitizeTimestamp = (timestamp, showRelative = true) => {
  if (!timestamp) return '—';
  
  try {
    let date;
    
    // Handle different timestamp formats
    if (timestamp.seconds) {
      // Firebase timestamp
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      return '—';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '—';
    }
    
    if (showRelative) {
      return getRelativeTime(date);
    } else {
      // Return a sanitized date without revealing exact time
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  } catch (error) {
    console.warn('Error sanitizing timestamp:', error);
    return '—';
  }
};

/**
 * Gets relative time string (e.g., "2 hours ago", "3 days ago")
 * @param {Date} date - The date to compare
 * @returns {string} - Relative time string
 */
const getRelativeTime = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    // For older dates, show month and year only
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    });
  }
};

/**
 * Sanitizes sensitive data from URLs
 * @param {string} url - The URL to sanitize
 * @returns {string} - Sanitized URL
 */
export const sanitizeUrl = (url) => {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth', 'session', 'sid'];
    sensitiveParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    return urlObj.toString();
  } catch (error) {
    console.warn('Error sanitizing URL:', error);
    return url;
  }
};

/**
 * Sanitizes data before storing in localStorage
 * @param {any} data - The data to sanitize
 * @returns {any} - Sanitized data
 */
export const sanitizeForStorage = (data) => {
  if (typeof data === 'string') {
    // Remove potential XSS vectors
    return data
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }
  return data;
};

/**
 * Creates a secure random string
 * @param {number} length - Length of the string
 * @returns {string} - Secure random string
 */
export const generateSecureId = (length = 16) => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Validates and sanitizes user input
 * @param {string} input - The input to validate
 * @param {string} type - The type of validation ('email', 'text', 'number')
 * @returns {string} - Sanitized input
 */
export const sanitizeInput = (input, type = 'text') => {
  if (!input || typeof input !== 'string') return '';
  
  switch (type) {
    case 'email':
      return input.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '');
    case 'number':
      return input.replace(/[^0-9.-]/g, '');
    case 'text':
    default:
      return input
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
  }
};

/**
 * Checks if the current environment is secure (HTTPS)
 * @returns {boolean} - True if secure
 */
export const isSecureContext = () => {
  return window.isSecureContext || window.location.protocol === 'https:';
};

/**
 * Logs security events (for monitoring)
 * @param {string} event - The security event
 * @param {any} data - Additional data
 */
export const logSecurityEvent = (event, data = null) => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`Security Event: ${event}`, data);
  }
  // In production, you might want to send this to a security monitoring service
};

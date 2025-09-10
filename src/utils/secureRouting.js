/**
 * Secure routing utilities to prevent sensitive information disclosure in URLs
 */

import { sanitizeUrl, sanitizeInput, logSecurityEvent } from './securityUtils';

/**
 * Sensitive parameters that should not be exposed in URLs
 */
const SENSITIVE_PARAMS = [
  'token', 'key', 'secret', 'password', 'auth', 'session', 'sid',
  'apikey', 'api_key', 'access_token', 'refresh_token', 'jwt',
  'user_id', 'userid', 'email', 'phone', 'ssn', 'credit_card',
  'private_key', 'secret_key', 'auth_token', 'session_id'
];

/**
 * Safely navigate to a route without exposing sensitive data in URL
 * @param {Function} navigate - React Router navigate function
 * @param {string} path - The path to navigate to
 * @param {Object} state - State to pass (will be stored in memory, not URL)
 * @param {Object} options - Navigation options
 */
export const secureNavigate = (navigate, path, state = {}, options = {}) => {
  try {
    // Sanitize the path
    const sanitizedPath = sanitizeInput(path, 'text');
    if (!sanitizedPath) {
      logSecurityEvent('Invalid navigation path', { path });
      return;
    }

    // Sanitize state data
    const sanitizedState = sanitizeState(state);

    // Navigate with sanitized data
    navigate(sanitizedPath, { 
      state: sanitizedState, 
      replace: options.replace || false 
    });
  } catch (error) {
    logSecurityEvent('Navigation error', { path, error: error.message });
  }
};

/**
 * Safely get location state without exposing sensitive data
 * @param {Object} location - React Router location object
 * @returns {Object} - Sanitized location state
 */
export const getSecureLocationState = (location) => {
  if (!location?.state) return {};

  try {
    return sanitizeState(location.state);
  } catch (error) {
    logSecurityEvent('Error sanitizing location state', { error: error.message });
    return {};
  }
};

/**
 * Safely get search parameters from URL
 * @param {string} search - URL search string
 * @returns {Object} - Sanitized search parameters
 */
export const getSecureSearchParams = (search) => {
  if (!search) return {};

  try {
    const urlParams = new URLSearchParams(search);
    const params = {};

    for (const [key, value] of urlParams.entries()) {
      // Skip sensitive parameters
      if (SENSITIVE_PARAMS.includes(key.toLowerCase())) {
        logSecurityEvent('Sensitive parameter detected in URL', { key });
        continue;
      }

      // Sanitize key and value
      const sanitizedKey = sanitizeInput(key, 'text');
      const sanitizedValue = sanitizeInput(value, 'text');

      if (sanitizedKey && sanitizedValue) {
        params[sanitizedKey] = sanitizedValue;
      }
    }

    return params;
  } catch (error) {
    logSecurityEvent('Error parsing search parameters', { search, error: error.message });
    return {};
  }
};

/**
 * Create a secure URL without sensitive parameters
 * @param {string} baseUrl - Base URL
 * @param {Object} params - Parameters to include
 * @returns {string} - Secure URL
 */
export const createSecureUrl = (baseUrl, params = {}) => {
  try {
    const url = new URL(baseUrl);
    
    // Add only non-sensitive parameters
    Object.entries(params).forEach(([key, value]) => {
      if (!SENSITIVE_PARAMS.includes(key.toLowerCase())) {
        const sanitizedKey = sanitizeInput(key, 'text');
        const sanitizedValue = sanitizeInput(String(value), 'text');
        
        if (sanitizedKey && sanitizedValue) {
          url.searchParams.set(sanitizedKey, sanitizedValue);
        }
      }
    });

    return url.toString();
  } catch (error) {
    logSecurityEvent('Error creating secure URL', { baseUrl, error: error.message });
    return baseUrl;
  }
};

/**
 * Sanitize state object to remove sensitive data
 * @param {Object} state - State object to sanitize
 * @returns {Object} - Sanitized state
 */
const sanitizeState = (state) => {
  if (!state || typeof state !== 'object') return {};

  const sanitized = {};
  
  Object.entries(state).forEach(([key, value]) => {
    // Skip sensitive keys
    if (SENSITIVE_PARAMS.includes(key.toLowerCase())) {
      logSecurityEvent('Sensitive state key detected', { key });
      return;
    }

    // Sanitize key
    const sanitizedKey = sanitizeInput(key, 'text');
    if (!sanitizedKey) return;

    // Sanitize value based on type
    let sanitizedValue = value;
    if (typeof value === 'string') {
      sanitizedValue = sanitizeInput(value, 'text');
    } else if (typeof value === 'object' && value !== null) {
      sanitizedValue = sanitizeState(value); // Recursively sanitize nested objects
    }

    if (sanitizedValue !== undefined && sanitizedValue !== null) {
      sanitized[sanitizedKey] = sanitizedValue;
    }
  });

  return sanitized;
};

/**
 * Check if current URL contains sensitive information
 * @returns {boolean} - True if sensitive information is detected
 */
export const hasSensitiveUrlData = () => {
  try {
    const url = new URL(window.location.href);
    
    // Check for sensitive parameters
    for (const param of SENSITIVE_PARAMS) {
      if (url.searchParams.has(param)) {
        logSecurityEvent('Sensitive parameter found in URL', { param });
        return true;
      }
    }

    // Check for sensitive data in pathname
    const pathSegments = url.pathname.split('/');
    for (const segment of pathSegments) {
      if (SENSITIVE_PARAMS.some(param => segment.toLowerCase().includes(param))) {
        logSecurityEvent('Sensitive data found in URL path', { segment });
        return true;
      }
    }

    return false;
  } catch (error) {
    logSecurityEvent('Error checking URL for sensitive data', { error: error.message });
    return false;
  }
};

/**
 * Clean current URL of sensitive parameters
 * @param {Function} navigate - React Router navigate function
 */
export const cleanSensitiveUrl = (navigate) => {
  try {
    const url = new URL(window.location.href);
    let hasSensitiveData = false;

    // Remove sensitive parameters
    SENSITIVE_PARAMS.forEach(param => {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        hasSensitiveData = true;
      }
    });

    // Navigate to cleaned URL if sensitive data was found
    if (hasSensitiveData) {
      const cleanUrl = url.pathname + (url.search ? url.search : '');
      navigate(cleanUrl, { replace: true });
      logSecurityEvent('URL cleaned of sensitive data', { originalUrl: window.location.href });
    }
  } catch (error) {
    logSecurityEvent('Error cleaning URL', { error: error.message });
  }
};

/**
 * Hook to automatically clean sensitive data from URL on component mount
 * @param {Function} navigate - React Router navigate function
 */
export const useSecureUrl = (navigate) => {
  // This would typically be used in a useEffect
  return () => {
    if (hasSensitiveUrlData()) {
      cleanSensitiveUrl(navigate);
    }
  };
};

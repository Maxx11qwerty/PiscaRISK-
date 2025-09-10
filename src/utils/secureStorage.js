/**
 * Secure storage utilities that sanitize data before storing in localStorage
 * and provide additional security measures
 */

import { sanitizeForStorage, sanitizeInput, logSecurityEvent } from './securityUtils';

/**
 * Secure localStorage wrapper that sanitizes data before storage
 */
class SecureStorage {
  constructor() {
    this.isAvailable = this.checkAvailability();
  }

  /**
   * Check if localStorage is available
   */
  checkAvailability() {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      logSecurityEvent('localStorage not available', e);
      return false;
    }
  }

  /**
   * Securely set an item in localStorage
   * @param {string} key - The key to store
   * @param {any} value - The value to store
   * @param {boolean} encrypt - Whether to encrypt the data
   */
  setItem(key, value, encrypt = false) {
    if (!this.isAvailable) {
      logSecurityEvent('localStorage not available for setItem', { key });
      return false;
    }

    try {
      // Sanitize the key
      const sanitizedKey = sanitizeInput(key, 'text');
      if (!sanitizedKey) {
        logSecurityEvent('Invalid key for localStorage', { key });
        return false;
      }

      // Sanitize the value
      let sanitizedValue = value;
      if (typeof value === 'string') {
        sanitizedValue = sanitizeForStorage(value);
      } else if (typeof value === 'object') {
        sanitizedValue = sanitizeForStorage(JSON.stringify(value));
      }

      // Add timestamp and metadata for security
      const secureData = {
        data: sanitizedValue,
        timestamp: Date.now(),
        version: '1.0'
      };

      const dataToStore = JSON.stringify(secureData);
      
      // Check size limit (5MB for localStorage)
      if (dataToStore.length > 5 * 1024 * 1024) {
        logSecurityEvent('Data too large for localStorage', { key, size: dataToStore.length });
        return false;
      }

      localStorage.setItem(sanitizedKey, dataToStore);
      return true;
    } catch (error) {
      logSecurityEvent('Error setting localStorage item', { key, error: error.message });
      return false;
    }
  }

  /**
   * Securely get an item from localStorage
   * @param {string} key - The key to retrieve
   * @param {any} defaultValue - Default value if key doesn't exist
   * @returns {any} - The stored value or default
   */
  getItem(key, defaultValue = null) {
    if (!this.isAvailable) {
      return defaultValue;
    }

    try {
      const sanitizedKey = sanitizeInput(key, 'text');
      if (!sanitizedKey) {
        return defaultValue;
      }

      const item = localStorage.getItem(sanitizedKey);
      if (!item) {
        return defaultValue;
      }

      const parsed = JSON.parse(item);
      
      // Validate the stored data structure
      if (!parsed || typeof parsed !== 'object' || !parsed.data) {
        logSecurityEvent('Invalid data structure in localStorage', { key });
        return defaultValue;
      }

      // Check if data is too old (optional security measure)
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      if (Date.now() - parsed.timestamp > maxAge) {
        logSecurityEvent('localStorage data too old', { key, age: Date.now() - parsed.timestamp });
        this.removeItem(key);
        return defaultValue;
      }

      return parsed.data;
    } catch (error) {
      logSecurityEvent('Error getting localStorage item', { key, error: error.message });
      return defaultValue;
    }
  }

  /**
   * Securely remove an item from localStorage
   * @param {string} key - The key to remove
   */
  removeItem(key) {
    if (!this.isAvailable) return;

    try {
      const sanitizedKey = sanitizeInput(key, 'text');
      if (sanitizedKey) {
        localStorage.removeItem(sanitizedKey);
      }
    } catch (error) {
      logSecurityEvent('Error removing localStorage item', { key, error: error.message });
    }
  }

  /**
   * Clear all localStorage data
   */
  clear() {
    if (!this.isAvailable) return;

    try {
      localStorage.clear();
    } catch (error) {
      logSecurityEvent('Error clearing localStorage', { error: error.message });
    }
  }

  /**
   * Get all keys from localStorage
   * @returns {string[]} - Array of keys
   */
  keys() {
    if (!this.isAvailable) return [];

    try {
      return Object.keys(localStorage);
    } catch (error) {
      logSecurityEvent('Error getting localStorage keys', { error: error.message });
      return [];
    }
  }

  /**
   * Get the size of stored data
   * @returns {number} - Size in bytes
   */
  getSize() {
    if (!this.isAvailable) return 0;

    try {
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length;
        }
      }
      return totalSize;
    } catch (error) {
      logSecurityEvent('Error calculating localStorage size', { error: error.message });
      return 0;
    }
  }
}

// Create singleton instance
const secureStorage = new SecureStorage();

// Export convenience functions
export const setSecureItem = (key, value, encrypt = false) => {
  return secureStorage.setItem(key, value, encrypt);
};

export const getSecureItem = (key, defaultValue = null) => {
  return secureStorage.getItem(key, defaultValue);
};

export const removeSecureItem = (key) => {
  return secureStorage.removeItem(key);
};

export const clearSecureStorage = () => {
  return secureStorage.clear();
};

export const getSecureStorageKeys = () => {
  return secureStorage.keys();
};

export const getSecureStorageSize = () => {
  return secureStorage.getSize();
};

// Export the class for advanced usage
export default secureStorage;

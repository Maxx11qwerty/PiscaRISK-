// Server-side sanitization utility for Cloud Functions
// Sanitizes user input to prevent XSS attacks

/**
 * Sanitizes a single input string by escaping HTML entities
 * @param {string} input - The input string to sanitize
 * @returns {string} - The sanitized string
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Recursively sanitizes all string values in an object
 * @param {Object} obj - The object to sanitize
 * @returns {Object} - The sanitized object
 */
function sanitizeObjectStrings(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectStrings(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObjectStrings(value);
    }
    return sanitized;
  }
  
  return obj;
}

module.exports = {
  sanitizeInput,
  sanitizeObjectStrings
};

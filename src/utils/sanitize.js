// sanitize.js (or wherever your functions live)
export function sanitizeInput(input = '') {
    const str = String(input);
    return str
      .replace(/&/g, '&amp;') // must be first
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  export function sanitizeObjectStrings(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key in out) {
      if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
      const val = out[key];
    if (val === undefined) { out[key] = ''; continue; }
    if (typeof val === 'string') out[key] = sanitizeInput(val);
    }
    return out;
  }
  

// Utilities for Philippine mobile numbers
// All helpers are pure and side-effect free.

// Valid PH mobile prefixes (first 3 digits after 0 or +63)
const VALID_PREFIXES = new Set([
  '905','906','907','908','909','910','912','915','916','917','918','919','920','921','922','923','924','925','926','927','928','929','930','931','932','933','934','935','936','937','938','939','940','942','943','944','945','946','947','948','949','950','951','952','953','954','955','956','957','958','959','960','961','962','963','964','965','966','967','968','969','970','971','972','973','974','975','976','977','978','979','980','981','982','983','984','985','986','987','988','989','990','991','992','993','994','995','996','997','998','999'
]);

export function stripToDigits(input = '') {
  return String(input).replace(/\D+/g, '');
}

// Returns +63XXXXXXXXXX if possible, else null
export function normalizeToE164PH(input = '') {
  const raw = String(input).trim();
  if (!raw) return null;

  // Remove spaces, dashes, parentheses
  let digits = stripToDigits(raw);

  // Handle leading +63 or 63 or 0 patterns
  if (raw.startsWith('+63')) {
    // Already in +63; ensure length 12 total (+63 + 10 digits)
    digits = stripToDigits(raw.slice(3));
  } else if (raw.startsWith('63')) {
    digits = stripToDigits(raw.slice(2));
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Now digits should be 10 for PH mobile
  if (digits.length !== 10) return null;

  // Validate mobile prefix (first 3 of 09 or +63)
  const prefix = digits.slice(0, 3);
  if (!VALID_PREFIXES.has(prefix)) return null;

  return `+63${digits}`;
}

// Formats partial user input progressively, showing +63 when starts with 0 or 09
// Returns { value, caretOffset? } where value is formatted string to display
export function formatUserInputPH(input = '') {
  const raw = String(input);
  // If user typed just '0' or '09', show +63 immediately
  if (raw === '0' || raw === '09') {
    return { value: '+63' };
  }

  // If starts with 09... convert to +63 and keep remaining digits
  if (/^09\d{0,9}$/.test(raw)) {
    return { value: `+63${raw.slice(2)}` };
  }

  // If starts with 0 and more digits but not matching 09 strictly, still convert to +63 and drop the leading 0
  if (/^0\d+$/.test(raw)) {
    return { value: `+63${raw.slice(1)}` };
  }

  // If starts with +63, keep as is but limit to +63 plus up to 10 digits
  if (raw.startsWith('+63')) {
    const digits = stripToDigits(raw.slice(3)).slice(0, 10);
    return { value: `+63${digits}` };
  }

  // If user types plain digits (up to 11), try to guide to +63
  const onlyDigits = stripToDigits(raw);
  if (onlyDigits.length === 0) return { value: '' };

  // If 11 digits starting with 09, convert
  if (/^09\d{9}$/.test(raw) || /^09\d{9}$/.test(onlyDigits)) {
    return { value: `+63${onlyDigits.slice(1)}` };
  }

  // If 10 digits (likely already without leading 0), prefix +63
  if (/^\d{10}$/.test(onlyDigits)) {
    return { value: `+63${onlyDigits}` };
  }

  // Otherwise, keep digits, but if begins with 63, transform to +63
  if (onlyDigits.startsWith('63')) {
    const digits = onlyDigits.slice(2, 12);
    return { value: `+63${digits}` };
  }

  // Default: return raw stripped to digits (limit 11)
  return { value: onlyDigits.slice(0, 11) };
}

export function validatePhilippineMobile(input = '') {
  const normalized = normalizeToE164PH(input);
  if (!normalized) {
    return { valid: false, message: 'Enter a valid PH mobile number (e.g., +63917XXXXXXX).' };
  }
  return { valid: true, value: normalized };
}

export function displayHintForPH(input = '') {
  // Returns guidance text or empty string
  const raw = String(input);
  if (!raw) return '';
  const normalized = normalizeToE164PH(raw);
  if (normalized) return '';
  // Provide progressive hints
  if (/^0$/.test(raw) || /^09$/.test(raw)) return 'Philippine numbers use +63. Example: +63917XXXXXXX';
  if (/^\+63$/.test(raw)) return 'Add 10 more digits after +63.';
  const onlyDigits = stripToDigits(raw);
  if (onlyDigits.length < 10) return 'Mobile numbers are 11 digits locally or +63 plus 10 digits.';
  return 'Check the prefix and length. Example: +63917XXXXXXX';
}

export const __TEST_ONLY__ = { VALID_PREFIXES };



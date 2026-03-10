'use strict';

const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript\s*:/gi,
  /on(?:error|load|click|mouse\w+|key\w+|focus|blur)\s*=/gi,
  /eval\s*\(/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*['"]?\s*javascript/gi,
];

function containsXSS(str) {
  if (typeof str !== 'string') return false;
  return DANGEROUS_PATTERNS.some((p) => p.test(str));
}

function deepSanitize(value, depth = 0) {
  if (depth > 10) return value;

  if (typeof value === 'string') {
    if (containsXSS(value)) {
      throw new SanitizationError('Potentially malicious input detected');
    }
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepSanitize(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      clean[key] = deepSanitize(val, depth + 1);
    }
    return clean;
  }

  return value;
}

class SanitizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SanitizationError';
    this.statusCode = 400;
  }
}

function sanitizeInput(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = deepSanitize(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = deepSanitize(req.query);
    }
    next();
  } catch (err) {
    if (err instanceof SanitizationError) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: err.message },
      });
    }
    next(err);
  }
}

function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => !req.body[f]);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: `Required: ${missing.join(', ')}` },
      });
    }
    next();
  };
}

function validateEmail(field = 'email') {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (req, res, next) => {
    const value = req.body[field];
    if (value && !EMAIL_RE.test(value)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: `Invalid email format in ${field}` },
      });
    }
    next();
  };
}

module.exports = { sanitizeInput, requireFields, validateEmail, containsXSS };

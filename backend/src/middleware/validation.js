function validateRequired(fields) {
  return (req, res, next) => {
    const missing = fields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: missing
      });
    }

    next();
  };
}

function validateEmail(field = 'email') {
  return (req, res, next) => {
    const email = req.body[field];
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: 'Invalid email format',
          field
        });
      }
    }
    next();
  };
}

function validatePhone(field = 'phone') {
  return (req, res, next) => {
    const phone = req.body[field];
    if (phone) {
      const phoneRegex = /^\+?[1-9]\d{6,14}$/;
      if (!phoneRegex.test(phone.replace(/[\s-]/g, ''))) {
        return res.status(400).json({
          error: 'Invalid phone format. Use international format like +1234567890',
          field
        });
      }
    }
    next();
  };
}

function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      let value = obj[key];
      if (typeof value === 'string') {
        value = value.trim();
        value = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      } else if (typeof value === 'object') {
        value = sanitize(value);
      }
      sanitized[key] = value;
    }
    return sanitized;
  };

  req.body = sanitize(req.body);
  next();
}

module.exports = {
  validateRequired,
  validateEmail,
  validatePhone,
  sanitizeInput
};

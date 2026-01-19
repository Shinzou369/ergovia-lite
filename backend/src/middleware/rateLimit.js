const { RATE_LIMITS } = require('../config/constants');

const requestCounts = new Map();

function rateLimiter(options = {}) {
  const windowMs = options.windowMs || RATE_LIMITS.WINDOW_MS;
  const maxRequests = options.maxRequests || RATE_LIMITS.MAX_REQUESTS;

  return (req, res, next) => {
    const key = req.clientId || req.ip;
    const now = Date.now();

    if (!requestCounts.has(key)) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const record = requestCounts.get(key);

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter
      });
    }

    record.count++;
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 60000);

module.exports = { rateLimiter };

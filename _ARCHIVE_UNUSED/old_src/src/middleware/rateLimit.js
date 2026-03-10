'use strict';

const { logger } = require('../lib/logger');

class TokenBucket {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.buckets = new Map();
    this._cleanup = setInterval(() => this._prune(), 60_000);
    this._cleanup.unref();
  }

  consume(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }

    if (bucket.count >= this.max) {
      return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }

    bucket.count++;
    return { allowed: true, remaining: this.max - bucket.count };
  }

  _prune() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now > bucket.resetAt) this.buckets.delete(key);
    }
  }

  destroy() {
    clearInterval(this._cleanup);
    this.buckets.clear();
  }
}

function createRateLimiter(config) {
  const bucket = new TokenBucket({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
  });

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const result = bucket.consume(key);

    if (!result.allowed) {
      logger.warn('Rate limit exceeded', { ip: key });
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: result.retryAfter },
      });
    }

    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    next();
  };
}

module.exports = { createRateLimiter, TokenBucket };

'use strict';

const { logger } = require('../lib/logger');

function requestTimer(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    if (durationMs > 5000) {
      logger.warn('Slow request', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      });
    }
  });

  next();
}

module.exports = { requestTimer };

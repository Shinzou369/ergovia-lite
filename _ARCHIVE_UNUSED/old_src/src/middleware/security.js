'use strict';

const helmet = require('helmet');

function securityHeaders(config) {
  const helmetMiddleware = helmet({
    contentSecurityPolicy: config.isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", config.n8n.baseUrl].filter(Boolean),
      },
    } : false,
    crossOriginEmbedderPolicy: false,
  });

  return (req, res, next) => {
    helmetMiddleware(req, res, () => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.removeHeader('X-Powered-By');
      next();
    });
  };
}

function corsHandler(config) {
  const allowed = new Set(config.cors.origins);

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowed.size === 0 || allowed.has(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');

    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

module.exports = { securityHeaders, corsHandler };

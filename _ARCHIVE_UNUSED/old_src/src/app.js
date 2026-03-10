'use strict';

const express = require('express');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { getConfig } = require('./config/env');
const { securityHeaders, corsHandler } = require('./middleware/security');
const { createRateLimiter } = require('./middleware/rateLimit');
const { sanitizeInput } = require('./middleware/validate');
const { errorHandler, notFoundHandler } = require('./lib/errors');
const { logger } = require('./lib/logger');
const { requestTimer } = require('./middleware/requestLog');
const { createN8NClient } = require('./services/n8n');

const { createSystemRoutes } = require('./routes/system');
const { createETFRoutes } = require('./routes/etf');
const { createClientRoutes } = require('./routes/client');
const { createChatRoutes } = require('./routes/chat');
const { createPageRoutes } = require('./routes/pages');

function createApp(databases) {
  const config = getConfig();
  const app = express();
  const n8nClient = createN8NClient(config);

  // ─── Trust proxy (for rate limiting behind reverse proxy) ───
  app.set('trust proxy', 1);

  // ─── Request logging & timing ───
  app.use(requestTimer);
  if (config.nodeEnv !== 'test') {
    app.use(morgan('short', {
      stream: { write: (msg) => logger.info(msg.trim()) },
      skip: (req) => req.url === '/health',
    }));
  }

  // ─── Security ───
  app.use(securityHeaders(config));
  app.use(corsHandler(config));

  // ─── Body parsing ───
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());

  // ─── Input sanitization ───
  app.use(sanitizeInput);

  // ─── Sessions ───
  app.use(session({
    store: new FileStore({
      path: path.resolve(__dirname, '../sessions'),
      ttl: 7 * 24 * 60 * 60,
      retries: 2,
      logFn: () => {},
    }),
    secret: config.session.secret,
    name: 'sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.isProduction,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: config.session.maxAge,
    },
  }));

  // ─── Rate limiting on API routes ───
  const limiter = createRateLimiter(config);
  app.use('/api/', limiter);
  app.use('/chat', limiter);

  // ─── Static files (before routes for performance) ───
  app.use(express.static(path.resolve(__dirname, '../public'), {
    maxAge: config.isProduction ? '1d' : 0,
    etag: true,
  }));

  // ─── API Routes ───
  const deps = { databases, n8nClient, config };

  app.use(createSystemRoutes(deps));
  app.use('/api/etf', createETFRoutes(deps));
  app.use('/api', createClientRoutes(deps));
  app.use('/chat', createChatRoutes(deps));

  // ─── Auth routes (existing module) ───
  try {
    const { router: localAuthRouter, setDatabase } = require('../routes/localAuthRoutes');
    if (databases.etfDb) setDatabase(databases.etfDb);
    app.use('/api/auth', localAuthRouter);
  } catch (err) {
    logger.warn('Local auth routes not loaded', { error: err.message });
  }

  // ─── Proxy router (existing module) ───
  try {
    const proxyRouter = require('../proxy/router');
    app.use('/v1', proxyRouter);
  } catch (err) {
    logger.warn('Proxy router not loaded', { error: err.message });
  }

  // ─── Backend (Prismity) routes ───
  mountBackendRoutes(app);

  // ─── Page routes (clean URLs, HTML serving) ───
  app.use(createPageRoutes());

  // ─── Error handling ───
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function mountBackendRoutes(app) {
  const routeMap = {
    '/api/backend/auth': '../backend/src/routes/auth',
    '/api/backend/onboarding': '../backend/src/routes/onboarding',
    '/api/backend/control-panel': '../backend/src/routes/controlPanel',
    '/api/backend/health': '../backend/src/routes/health',
    '/api/backend/admin': '../backend/src/routes/admin',
  };

  for (const [mountPath, modulePath] of Object.entries(routeMap)) {
    try {
      app.use(mountPath, require(modulePath));
    } catch (err) {
      logger.warn(`Backend route not loaded: ${mountPath}`, { error: err.message });
    }
  }
}

module.exports = { createApp };

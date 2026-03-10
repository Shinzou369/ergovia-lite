'use strict';

const { logger } = require('../lib/logger');

const REQUIRED = [
  { key: 'OPENAI_API_KEY', desc: 'OpenAI API key for chat and workflow AI' },
];

const RECOMMENDED = [
  { key: 'SESSION_SECRET', desc: 'Session encryption key (min 32 chars)' },
  { key: 'N8N_BASE_URL', desc: 'N8N instance URL for workflow management' },
  { key: 'N8N_API_KEY', desc: 'N8N API key for workflow CRUD' },
  { key: 'DATABASE_URL', desc: 'PostgreSQL connection string' },
  { key: 'JWT_SECRET', desc: 'JWT signing key for backend auth' },
  { key: 'CREDENTIAL_ENCRYPTION_KEY', desc: 'AES-256 key for credential storage' },
];

function validateEnv() {
  const missing = REQUIRED.filter((v) => !process.env[v.key]);
  const unset = RECOMMENDED.filter((v) => !process.env[v.key]);

  if (unset.length > 0) {
    logger.warn('Recommended env vars not set (some features disabled)', {
      vars: unset.map((v) => v.key),
    });
  }

  if (missing.length > 0) {
    const msg = missing.map((v) => `  ${v.key} — ${v.desc}`).join('\n');
    if (process.env.NODE_ENV === 'production') {
      logger.fatal(`Missing required env vars:\n${msg}`);
      process.exit(1);
    }
    logger.warn(`Missing required env vars (non-production):\n${msg}`);
  }
}

function getConfig() {
  const n8nUrl = normalizeUrl(process.env.N8N_BASE_URL || '');
  return Object.freeze({
    port: parseInt(process.env.PORT, 10) || 5000,
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',

    session: {
      secret: process.env.SESSION_SECRET || 'dev-only-secret-change-in-production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },

    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },

    n8n: {
      baseUrl: n8nUrl,
      apiKey: process.env.N8N_API_KEY || '',
      enabled: !!(n8nUrl && process.env.N8N_API_KEY),
    },

    db: {
      url: process.env.DATABASE_URL || '',
    },

    jwt: {
      secret: process.env.JWT_SECRET || 'dev-jwt-secret',
      expiresIn: '7d',
    },

    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    },

    cors: {
      origins: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
        : [],
    },
  });
}

function normalizeUrl(url) {
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url.replace(/\/+$/, '');
}

module.exports = { validateEnv, getConfig };

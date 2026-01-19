const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

const SENSITIVE_KEYS = ['password', 'secret', 'token', 'api_key', 'apikey', 'credential', 'authorization'];

function scrubMeta(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const scrubbed = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(s => lowerKey.includes(s))) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object') {
      scrubbed[key] = scrubMeta(obj[key]);
    } else {
      scrubbed[key] = obj[key];
    }
  }
  
  return scrubbed;
}

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const scrubbedMeta = scrubMeta(meta);
  const metaStr = Object.keys(scrubbedMeta).length > 0 ? ` ${JSON.stringify(scrubbedMeta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

const logger = {
  error: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', message, meta));
    }
  },

  warn: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', message, meta));
    }
  },

  info: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', message, meta));
    }
  },

  debug: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, meta));
    }
  },

  provisioning: (clientId, step, status, details = {}) => {
    logger.info(`[PROVISIONING] ${clientId} - ${step}: ${status}`, details);
  }
};

module.exports = logger;

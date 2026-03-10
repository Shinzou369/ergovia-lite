'use strict';

const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const SENSITIVE_KEYS = /key|secret|token|password|authorization|credential/i;

function redact(obj, depth = 0) {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  const clean = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(key) && typeof value === 'string') {
      clean[key] = value.length > 8 ? value.slice(0, 4) + '****' : '****';
    } else if (typeof value === 'object') {
      clean[key] = redact(value, depth + 1);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function format(level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (meta && Object.keys(meta).length > 0) {
    entry.meta = redact(meta);
  }
  return JSON.stringify(entry);
}

function log(level, message, meta = {}) {
  if (LEVELS[level] > CURRENT_LEVEL) return;
  const line = format(level, message, meta);
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

const logger = {
  fatal: (msg, meta) => log('fatal', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};

module.exports = { logger };

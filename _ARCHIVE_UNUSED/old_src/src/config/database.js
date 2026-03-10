'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { logger } = require('../lib/logger');

const ETF_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'client',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS etf_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    industry TEXT,
    taskforce_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS etf_deployments (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    n8n_workflow_id TEXT,
    workflow_name TEXT,
    taskforce_type TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    config_data TEXT,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES etf_clients(id)
  )`,
  `CREATE TABLE IF NOT EXISTS etf_client_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES etf_clients(id)
  )`,
  `CREATE TABLE IF NOT EXISTS etf_error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack TEXT,
    user_agent TEXT,
    url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    tokens_limit INTEGER DEFAULT 50000,
    reset_date TEXT,
    last_used DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS client_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT UNIQUE NOT NULL,
    business_name TEXT NOT NULL,
    greeting TEXT,
    webhook_secret TEXT,
    openai_project_key TEXT,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    whatsapp_number TEXT,
    timezone TEXT DEFAULT 'America/New_York',
    settings TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
];

function openSqlite(filepath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filepath, (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initETFDatabase(filepath) {
  const db = await openSqlite(filepath);
  for (const sql of ETF_SCHEMA) {
    await runSql(db, sql);
  }
  logger.info('ETF database initialized', { path: filepath });
  return db;
}

async function initTaskforceDatabase(filepath) {
  const db = await openSqlite(filepath);
  await runSql(db, `CREATE TABLE IF NOT EXISTS health_check (id INTEGER PRIMARY KEY, timestamp TEXT)`);
  logger.info('Taskforce database initialized', { path: filepath });
  return db;
}

async function connectDatabases() {
  const basePath = path.resolve(__dirname, '../../');
  const taskforceDb = await initTaskforceDatabase(path.join(basePath, 'taskforce.db'));
  const etfDb = await initETFDatabase(path.join(basePath, 'etf_data.db'));
  return { taskforceDb, etfDb, runSql, getSql, allSql };
}

function closeDatabases({ taskforceDb, etfDb }) {
  return new Promise((resolve) => {
    let closed = 0;
    const done = () => { if (++closed >= 2) resolve(); };
    taskforceDb.close(done);
    etfDb.close(done);
  });
}

module.exports = { connectDatabases, closeDatabases, runSql, getSql, allSql };

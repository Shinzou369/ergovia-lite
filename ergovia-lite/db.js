const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);

// Initialize database tables
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT NOT NULL UNIQUE,
      assigned_to_client INTEGER DEFAULT 0,
      client_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      assigned_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS deployed_workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      trigger_tag TEXT,
      is_active INTEGER DEFAULT 1,
      deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deployment_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      deployed_count INTEGER DEFAULT 0,
      total_count INTEGER DEFAULT 0,
      assigned_api_key TEXT,
      last_deployed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credential_type TEXT NOT NULL,
      n8n_credential_id TEXT NOT NULL,
      credential_name TEXT,
      client_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      workflows_updated TEXT,
      error_details TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      read INTEGER DEFAULT 0,
      action_link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS v2_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed initial deployment status
  const status = db.prepare('SELECT * FROM deployment_status WHERE id = 1').get();
  if (!status) {
    db.prepare('INSERT INTO deployment_status (id, status) VALUES (1, ?)').run('not_deployed');
  }

  console.log('Database initialized successfully');
}

// ============================================
// CLIENT DATA
// ============================================

function getClientData(section) {
  const row = db.prepare('SELECT data FROM client_data WHERE section = ?').get(section);
  return row ? JSON.parse(row.data) : null;
}

function getAllClientData() {
  const rows = db.prepare('SELECT section, data FROM client_data').all();
  const result = {};
  for (const row of rows) {
    result[row.section] = JSON.parse(row.data);
  }
  return result;
}

function saveClientData(section, data) {
  db.prepare(`
    INSERT INTO client_data (section, data, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(section) DO UPDATE SET data = ?, updated_at = CURRENT_TIMESTAMP
  `).run(section, JSON.stringify(data), JSON.stringify(data));
}

function resetClientData() {
  db.exec('DELETE FROM client_data');
  db.exec('DELETE FROM deployed_workflows');
  db.exec('DELETE FROM client_credentials');
  db.exec('UPDATE deployment_status SET status = ?, deployed_count = 0, assigned_api_key = NULL WHERE id = 1');
  db.prepare('UPDATE deployment_status SET status = ? WHERE id = 1').run('not_deployed');
  db.exec('DELETE FROM activity_log');
}

function isOnboardingComplete() {
  const required = ['owner', 'property', 'guestAccess'];
  for (const section of required) {
    if (!getClientData(section)) return false;
  }
  return true;
}

// ============================================
// API BANK
// ============================================

function addApiKey(apiKey) {
  try {
    db.prepare('INSERT INTO api_bank (api_key) VALUES (?)').run(apiKey);
    return true;
  } catch (error) {
    return false; // Key already exists
  }
}

function getAvailableApiKey() {
  return db.prepare('SELECT * FROM api_bank WHERE assigned_to_client = 0 LIMIT 1').get();
}

function assignApiKey(apiKeyId, clientName) {
  db.prepare(`
    UPDATE api_bank
    SET assigned_to_client = 1, client_name = ?, assigned_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(clientName, apiKeyId);
}

function getAssignedApiKey() {
  return db.prepare('SELECT * FROM api_bank WHERE assigned_to_client = 1 LIMIT 1').get();
}

function releaseApiKey(apiKeyId) {
  db.prepare(`
    UPDATE api_bank
    SET assigned_to_client = 0, client_name = NULL, assigned_at = NULL
    WHERE id = ?
  `).run(apiKeyId);
}

function getAllApiKeys() {
  return db.prepare('SELECT id, assigned_to_client, client_name, created_at, assigned_at FROM api_bank').all();
}

function deleteApiKey(apiKeyId) {
  const key = db.prepare('SELECT * FROM api_bank WHERE id = ?').get(apiKeyId);
  if (!key) return { success: false, error: 'Key not found' };
  if (key.assigned_to_client) return { success: false, error: 'Cannot delete assigned key. Release it first.' };
  db.prepare('DELETE FROM api_bank WHERE id = ?').run(apiKeyId);
  return { success: true };
}

function deleteAllApiKeys() {
  const assigned = db.prepare('SELECT COUNT(*) as count FROM api_bank WHERE assigned_to_client = 1').get();
  db.exec('DELETE FROM api_bank');
  return { success: true, deleted: 'all', hadAssigned: assigned.count > 0 };
}

// ============================================
// DEPLOYED WORKFLOWS
// ============================================

function saveDeployedWorkflow(workflow) {
  db.prepare(`
    INSERT INTO deployed_workflows (filename, workflow_id, workflow_name, trigger_tag, is_active)
    VALUES (?, ?, ?, ?, ?)
  `).run(workflow.filename, workflow.workflowId, workflow.name, workflow.triggerTag, workflow.active ? 1 : 0);
}

function saveDeployedWorkflows(workflows) {
  const insert = db.prepare(`
    INSERT INTO deployed_workflows (filename, workflow_id, workflow_name, trigger_tag, is_active)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const w of items) {
      insert.run(w.filename, w.workflowId, w.name, w.triggerTag, w.active ? 1 : 0);
    }
  });

  insertMany(workflows);
}

function getDeployedWorkflows() {
  return db.prepare('SELECT * FROM deployed_workflows ORDER BY id').all();
}

function clearDeployedWorkflows() {
  db.exec('DELETE FROM deployed_workflows');
}

// ============================================
// DEPLOYMENT STATUS
// ============================================

function getDeploymentStatus() {
  return db.prepare('SELECT * FROM deployment_status WHERE id = 1').get();
}

function updateDeploymentStatus(status, deployedCount, totalCount, assignedApiKey) {
  db.prepare(`
    UPDATE deployment_status
    SET status = ?, deployed_count = ?, total_count = ?, assigned_api_key = ?, last_deployed_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(status, deployedCount, totalCount, assignedApiKey);
}

// ============================================
// ACTIVITY LOG
// ============================================

function logActivity(action, details) {
  db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)').run(action, details);
}

function getRecentActivity(limit = 10) {
  return db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit);
}

// ============================================
// CLIENT CREDENTIALS (n8n credentials per client)
// ============================================

function saveClientCredential(credentialType, n8nCredentialId, credentialName, clientName) {
  db.prepare(`
    INSERT INTO client_credentials (credential_type, n8n_credential_id, credential_name, client_name)
    VALUES (?, ?, ?, ?)
  `).run(credentialType, n8nCredentialId, credentialName, clientName);
}

function saveClientCredentials(credentials, clientName) {
  const insert = db.prepare(`
    INSERT INTO client_credentials (credential_type, n8n_credential_id, credential_name, client_name)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const [type, cred] of Object.entries(items)) {
      if (cred && cred.id) {
        insert.run(type, cred.id, cred.name || `${type} - ${clientName}`, clientName);
      }
    }
  });

  insertMany(credentials);
}

function getClientCredentials() {
  return db.prepare('SELECT * FROM client_credentials ORDER BY id').all();
}

function getClientCredentialsByType(credentialType) {
  return db.prepare('SELECT * FROM client_credentials WHERE credential_type = ?').get(credentialType);
}

function clearClientCredentials() {
  db.exec('DELETE FROM client_credentials');
}

// ============================================
// SYNC LOG
// ============================================

function logSync(syncType, status, workflowsUpdated, errorDetails) {
  db.prepare(`
    INSERT INTO sync_log (sync_type, status, workflows_updated, error_details)
    VALUES (?, ?, ?, ?)
  `).run(syncType, status, JSON.stringify(workflowsUpdated), errorDetails || null);
}

function getLastSync() {
  return db.prepare('SELECT * FROM sync_log WHERE status = ? ORDER BY synced_at DESC LIMIT 1').get('success');
}

function getRecentSyncs(limit = 10) {
  return db.prepare('SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT ?').all(limit);
}

// ============================================
// USERS (Authentication)
// ============================================

function createUser(username, email, passwordHash) {
  try {
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username, email, passwordHash);
    return { success: true, userId: result.lastInsertRowid };
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return { success: false, error: 'Username or email already exists' };
    }
    return { success: false, error: error.message };
  }
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserById(id) {
  return db.prepare('SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?').get(id);
}

function updateLastLogin(userId) {
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
}

function getUserCount() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
}

// ============================================
// NOTIFICATIONS (Persistent)
// ============================================

function addNotification(notification) {
  const id = notification.id || 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  try {
    db.prepare(`
      INSERT OR IGNORE INTO notifications (notification_id, type, title, message, action_link)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, notification.type || 'info', notification.title, notification.message || '', notification.actionLink || null);
    return id;
  } catch (error) {
    console.error('addNotification error:', error.message);
    return null;
  }
}

function getNotifications(unreadOnly = false) {
  if (unreadOnly) {
    return db.prepare('SELECT * FROM notifications WHERE read = 0 ORDER BY created_at DESC').all();
  }
  return db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').all();
}

function markNotificationRead(notificationId) {
  const result = db.prepare('UPDATE notifications SET read = 1 WHERE notification_id = ?').run(notificationId);
  return result.changes > 0;
}

function markAllNotificationsRead() {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
  return true;
}

function getUnreadNotificationCount() {
  return db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get().count;
}

// ============================================
// V2 SETTINGS (Persistent local settings)
// ============================================

function getV2Setting(section) {
  const row = db.prepare('SELECT data FROM v2_settings WHERE section = ?').get(section);
  return row ? JSON.parse(row.data) : null;
}

function saveV2Setting(section, data) {
  db.prepare(`
    INSERT INTO v2_settings (section, data, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(section) DO UPDATE SET data = ?, updated_at = CURRENT_TIMESTAMP
  `).run(section, JSON.stringify(data), JSON.stringify(data));
}

function getAllV2Settings() {
  const rows = db.prepare('SELECT section, data FROM v2_settings').all();
  const result = {};
  for (const row of rows) {
    result[row.section] = JSON.parse(row.data);
  }
  return result;
}

module.exports = {
  initDb,
  // Client data
  getClientData,
  getAllClientData,
  saveClientData,
  resetClientData,
  isOnboardingComplete,
  // API Bank
  addApiKey,
  getAvailableApiKey,
  assignApiKey,
  getAssignedApiKey,
  releaseApiKey,
  getAllApiKeys,
  deleteApiKey,
  deleteAllApiKeys,
  // Deployed workflows
  saveDeployedWorkflow,
  saveDeployedWorkflows,
  getDeployedWorkflows,
  clearDeployedWorkflows,
  // Deployment status
  getDeploymentStatus,
  updateDeploymentStatus,
  // Activity
  logActivity,
  getRecentActivity,
  // Client credentials
  saveClientCredential,
  saveClientCredentials,
  getClientCredentials,
  getClientCredentialsByType,
  clearClientCredentials,
  // Sync log
  logSync,
  getLastSync,
  getRecentSyncs,
  // Users (auth)
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  updateLastLogin,
  getUserCount,
  // Notifications (persistent)
  addNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  // V2 Settings (persistent)
  getV2Setting,
  saveV2Setting,
  getAllV2Settings,
};

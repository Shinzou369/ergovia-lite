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
  clearClientCredentials
};

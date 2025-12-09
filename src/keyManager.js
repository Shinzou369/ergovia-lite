const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const KEY_PREFIX = 'sk-ergovia-';

function generateApiKey() {
  const randomPart = crypto.randomBytes(32).toString('hex').substring(0, 32);
  return `${KEY_PREFIX}${randomPart}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function initializeClientTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        clientId TEXT PRIMARY KEY,
        clientName TEXT NOT NULL,
        apiKeyHash TEXT NOT NULL UNIQUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        usageTokensInput INTEGER DEFAULT 0,
        usageTokensOutput INTEGER DEFAULT 0,
        lastUsedAt DATETIME
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function createClient(db, clientName) {
  return new Promise((resolve, reject) => {
    const clientId = uuidv4();
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    db.run(
      `INSERT INTO clients (clientId, clientName, apiKeyHash) VALUES (?, ?, ?)`,
      [clientId, clientName, apiKeyHash],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ clientId, apiKey, clientName });
        }
      }
    );
  });
}

function validateApiKey(db, apiKey) {
  return new Promise((resolve, reject) => {
    if (!apiKey || !apiKey.startsWith(KEY_PREFIX)) {
      resolve(null);
      return;
    }

    const apiKeyHash = hashApiKey(apiKey);

    db.get(
      `SELECT clientId, clientName, usageTokensInput, usageTokensOutput FROM clients WHERE apiKeyHash = ?`,
      [apiKeyHash],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

function getAllClients(db) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT clientId, clientName, createdAt, usageTokensInput, usageTokensOutput, lastUsedAt FROM clients ORDER BY createdAt DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function getClientById(db, clientId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT clientId, clientName, createdAt, usageTokensInput, usageTokensOutput, lastUsedAt FROM clients WHERE clientId = ?`,
      [clientId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function resetClientKey(db, clientId) {
  return new Promise((resolve, reject) => {
    const newApiKey = generateApiKey();
    const newApiKeyHash = hashApiKey(newApiKey);

    db.run(
      `UPDATE clients SET apiKeyHash = ? WHERE clientId = ?`,
      [newApiKeyHash, clientId],
      function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error('Client not found'));
        } else {
          resolve({ clientId, apiKey: newApiKey });
        }
      }
    );
  });
}

function deleteClient(db, clientId) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM clients WHERE clientId = ?`,
      [clientId],
      function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error('Client not found'));
        } else {
          resolve({ success: true, clientId });
        }
      }
    );
  });
}

function updateClientUsage(db, clientId, promptTokens, completionTokens) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE clients SET 
        usageTokensInput = usageTokensInput + ?,
        usageTokensOutput = usageTokensOutput + ?,
        lastUsedAt = datetime('now')
      WHERE clientId = ?`,
      [promptTokens, completionTokens, clientId],
      function(err) {
        if (err) reject(err);
        else resolve({ success: true });
      }
    );
  });
}

module.exports = {
  generateApiKey,
  hashApiKey,
  initializeClientTable,
  createClient,
  validateApiKey,
  getAllClients,
  getClientById,
  resetClientKey,
  deleteClient,
  updateClientUsage,
  KEY_PREFIX
};

function initializeUsageTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clientId TEXT NOT NULL,
        model TEXT NOT NULL,
        promptTokens INTEGER DEFAULT 0,
        completionTokens INTEGER DEFAULT 0,
        totalTokens INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(clientId) REFERENCES clients(clientId)
      )
    `, (err) => {
      if (err) reject(err);
      else {
        db.run(`CREATE INDEX IF NOT EXISTS idx_usage_client ON usage_logs(clientId)`, (indexErr) => {
          if (indexErr) console.warn('Could not create index:', indexErr.message);
          resolve();
        });
      }
    });
  });
}

function logUsage(db, clientId, model, promptTokens, completionTokens) {
  return new Promise((resolve, reject) => {
    const totalTokens = promptTokens + completionTokens;

    db.run(
      `INSERT INTO usage_logs (clientId, model, promptTokens, completionTokens, totalTokens) VALUES (?, ?, ?, ?, ?)`,
      [clientId, model, promptTokens, completionTokens, totalTokens],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

function getClientUsageLogs(db, clientId, limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM usage_logs WHERE clientId = ? ORDER BY timestamp DESC LIMIT ?`,
      [clientId, limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function getUsageSummary(db, clientId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        COUNT(*) as totalRequests,
        SUM(promptTokens) as totalPromptTokens,
        SUM(completionTokens) as totalCompletionTokens,
        SUM(totalTokens) as totalTokens
      FROM usage_logs WHERE clientId = ?`,
      [clientId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0 });
      }
    );
  });
}

module.exports = {
  initializeUsageTable,
  logUsage,
  getClientUsageLogs,
  getUsageSummary
};

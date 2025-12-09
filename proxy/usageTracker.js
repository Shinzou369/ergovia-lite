const { loadDB, saveDB } = require('./keyManager');

function addUsage(apiKey, tokens) {
  const db = loadDB();

  if (!db.usage[apiKey]) {
    db.usage[apiKey] = 0;
  }

  db.usage[apiKey] += tokens;
  saveDB(db);
}

function getUsage(apiKey) {
  const db = loadDB();
  return db.usage[apiKey] || 0;
}

module.exports = {
  addUsage,
  getUsage
};

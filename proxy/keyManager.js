const fs = require('fs');

const DB_FILE = './tokens.json';

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ clients: {}, usage: {} }, null, 2));
}

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function createClientKey(clientName) {
  const db = loadDB();
  const newKey = "sk-ergovia-" + Math.random().toString(36).substring(2, 15);

  db.clients[newKey] = {
    id: clientName,
    createdAt: Date.now()
  };

  saveDB(db);
  return newKey;
}

function validateKey(key) {
  const db = loadDB();
  return db.clients[key] || null;
}

module.exports = {
  loadDB,
  saveDB,
  createClientKey,
  validateKey
};

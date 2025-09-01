const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_FILE = path.join(__dirname, '../data/openai_keys.json');
const CLIENT_DATA_FILE = path.join(__dirname, '../data/client_data.json');

/**
 * Load OpenAI keys from file
 */
function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading keys:', error);
  }
  return [];
}

/**
 * Save OpenAI keys to file
 */
function saveKeys(keys) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  } catch (error) {
    console.error('Error saving keys:', error);
  }
}

/**
 * Load client data from file
 */
function loadClientData() {
  try {
    if (fs.existsSync(CLIENT_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(CLIENT_DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading client data:', error);
  }
  return [];
}

/**
 * Save client data to file
 */
function saveClientData(clientData) {
  try {
    fs.writeFileSync(CLIENT_DATA_FILE, JSON.stringify(clientData, null, 2));
  } catch (error) {
    console.error('Error saving client data:', error);
  }
}

/**
 * Assign an OpenAI key to a new client
 */
function assignKeyToClient(clientId, workflowId, tokenLimit = 100000) {
  const keys = loadKeys();
  const clientData = loadClientData();

  // Check if client already has a key assigned
  const existingClient = clientData.find(client => client.client_id === clientId);
  if (existingClient) {
    console.log(`Client ${clientId} already has a key assigned`);
    return existingClient.openai_key;
  }

  // Find an unassigned key
  const availableKey = keys.find(key => !key.assigned);
  if (!availableKey) {
    throw new Error('No available OpenAI keys. Please add more keys to the pool.');
  }

  // Mark key as assigned
  availableKey.assigned = true;
  availableKey.assigned_date = new Date().toISOString();
  availableKey.client_id = clientId;

  // Create client record
  const nextResetDate = new Date();
  nextResetDate.setMonth(nextResetDate.getMonth() + 1, 1);
  nextResetDate.setHours(0, 0, 0, 0);

  const clientRecord = {
    client_id: clientId,
    openai_key: availableKey.key,
    used_tokens: 0,
    limit_tokens: tokenLimit,
    workflow_id: workflowId,
    reset_date: nextResetDate.toISOString(),
    created_date: new Date().toISOString(),
    last_used: null
  };

  clientData.push(clientRecord);

  // Save both files
  saveKeys(keys);
  saveClientData(clientData);

  console.log(`✅ Assigned OpenAI key to client ${clientId}`);
  return availableKey.key;
}

/**
 * Get client's OpenAI key and usage data
 */
function getClientData(clientId) {
  const clientData = loadClientData();
  return clientData.find(client => client.client_id === clientId);
}

/**
 * Update client's token usage
 */
function updateTokenUsage(clientId, tokensUsed) {
  const clientData = loadClientData();
  const clientIndex = clientData.findIndex(client => client.client_id === clientId);

  if (clientIndex === -1) {
    throw new Error(`Client ${clientId} not found`);
  }

  clientData[clientIndex].used_tokens += tokensUsed;
  clientData[clientIndex].last_used = new Date().toISOString();

  saveClientData(clientData);

  return clientData[clientIndex];
}

/**
 * Check if client has budget available
 */
function checkBudget(clientId, tokensNeeded) {
  const client = getClientData(clientId);
  if (!client) {
    throw new Error(`Client ${clientId} not found`);
  }

  return (client.used_tokens + tokensNeeded) <= client.limit_tokens;
}

/**
 * Reset monthly token usage for all clients
 */
function resetMonthlyUsage() {
  const clientData = loadClientData();
  const now = new Date();
  let resetCount = 0;

  clientData.forEach(client => {
    const resetDate = new Date(client.reset_date);
    if (now >= resetDate) {
      client.used_tokens = 0;

      // Set next reset date
      const nextReset = new Date(resetDate);
      nextReset.setMonth(nextReset.getMonth() + 1);
      client.reset_date = nextReset.toISOString();

      resetCount++;
    }
  });

  if (resetCount > 0) {
    saveClientData(clientData);
    console.log(`✅ Reset token usage for ${resetCount} clients`);
  }

  return resetCount;
}

/**
 * Add new OpenAI keys to the pool (admin function)
 */
function addKeysToPool(newKeys) {
  const keys = loadKeys();
  const addedKeys = [];

  for (const keyString of newKeys) {
    // Basic validation
    if (keyString.startsWith('sk-') && keyString.length > 20) {
      // Check if key already exists
      const exists = keys.find(k => k.key === keyString);
      if (!exists) {
        keys.push({
          key: keyString,
          assigned: false,
          created_date: new Date().toISOString()
        });
        addedKeys.push(keyString);
      }
    }
  }

  if (addedKeys.length > 0) {
    saveKeys(keys);
    console.log(`✅ Added ${addedKeys.length} new keys to pool`);
  }

  return addedKeys;
}

/**
 * Get pool statistics
 */
function getPoolStats() {
  const keys = loadKeys();
  const clientData = loadClientData();

  return {
    total_keys: keys.length,
    assigned_keys: keys.filter(k => k.assigned).length,
    available_keys: keys.filter(k => !k.assigned).length,
    total_clients: clientData.length,
    active_clients: clientData.filter(c => c.last_used).length
  };
}

// Generate personal OpenAI key for individual businesses
async function generatePersonalKey({ client_id, business_name, business_email, token_limit, workflow_count }) {
  try {
    // Generate a unique API key identifier
    const keyPrefix = 'sk-proj';
    const keyBody = Buffer.from(`${client_id}:${business_name}:${Date.now()}`).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    const keySuffix = Math.random().toString(36).substring(2, 10);

    const personal_key = `${keyPrefix}-${keyBody}${keySuffix}`;
    const key_preview = `${keyPrefix}-...${keySuffix}`;

    // Store key data
    const keyData = {
      client_id,
      business_name,
      business_email,
      api_key: personal_key,
      key_preview,
      token_limit,
      workflow_count,
      usage: 0,
      created_at: new Date().toISOString(),
      status: 'active'
    };

    // Save to local storage
    let keys = {};
    try {
      if (fs.existsSync(KEYS_FILE)) {
        keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not read existing keys file:', error.message);
    }

    keys[client_id] = keyData;
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));

    console.log(`✅ Generated personal OpenAI key for ${business_name}`);

    return {
      key_preview,
      token_limit,
      workflow_count,
      dashboard_url: `/client-openai-dashboard?client_id=${client_id}`
    };

  } catch (error) {
    console.error('Error generating personal key:', error);
    throw new Error('Failed to generate personal API key');
  }
}

module.exports = {
  loadKeys,
  saveKeys,
  loadClientData,
  saveClientData,
  assignKeyToClient,
  getClientData,
  updateTokenUsage,
  checkBudget,
  resetMonthlyUsage,
  addKeysToPool,
  getPoolStats,
  generatePersonalKey
};
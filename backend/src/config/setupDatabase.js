const db = require('./database');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

async function setupDatabase() {
  try {
    logger.info('Checking database setup...');

    const schemaPath = path.join(__dirname, '../models/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    await db.query(schema);
    logger.info('Database schema applied successfully');

    const tablesResult = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    logger.info('Database tables ready', { 
      tables: tablesResult.rows.map(r => r.table_name) 
    });

    return true;
  } catch (error) {
    logger.error('Database setup failed', { error: error.message });
    throw error;
  }
}

async function createClientAccount(clientData) {
  const {
    email,
    password,
    businessName,
    ownerName,
    ownerPhone,
    subdomain
  } = clientData;

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const passwordHash = await bcrypt.hash(password, 12);

  await db.query(`
    INSERT INTO clients (
      client_id, business_name, subdomain, owner_name, owner_email, 
      owner_phone, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
    ON CONFLICT (client_id) DO NOTHING
  `, [clientId, businessName, subdomain, ownerName, email, ownerPhone]);

  await db.query(`
    INSERT INTO client_credentials (
      client_id, credential_type, credential_name, credential_data
    ) VALUES ($1, 'password', 'login', $2)
    ON CONFLICT (client_id, credential_type, credential_name) 
    DO UPDATE SET credential_data = $2
  `, [clientId, JSON.stringify({ hash: passwordHash })]);

  logger.info('Client account created', { clientId, email });

  return { clientId, email };
}

async function getClientByEmail(email) {
  const result = await db.query(`
    SELECT c.*, cc.credential_data as password_data
    FROM clients c
    LEFT JOIN client_credentials cc ON c.client_id = cc.client_id 
      AND cc.credential_type = 'password'
    WHERE c.owner_email = $1
  `, [email]);

  return result.rows[0] || null;
}

async function verifyClientPassword(email, password) {
  const client = await getClientByEmail(email);
  if (!client || !client.password_data) {
    return null;
  }

  const passwordData = typeof client.password_data === 'string' 
    ? JSON.parse(client.password_data) 
    : client.password_data;

  const isValid = await bcrypt.compare(password, passwordData.hash);
  if (!isValid) {
    return null;
  }

  return client;
}

async function checkOnboardingStatus(clientId) {
  const settingsResult = await db.query(`
    SELECT section FROM client_settings 
    WHERE client_id = $1
  `, [clientId]);

  const completedSections = settingsResult.rows.map(r => r.section);

  const requiredSections = ['owner', 'business', 'ai'];
  const hasRequiredSettings = requiredSections.every(s => completedSections.includes(s));

  return {
    needsOnboarding: !hasRequiredSettings,
    completedSections,
    hasRequiredSettings,
    currentStep: !completedSections.includes('owner') ? 1 :
                 !completedSections.includes('business') ? 2 :
                 !completedSections.includes('ai') ? 3 : 0
  };
}

async function createSupportTicket(ticketData) {
  const {
    clientId,
    ticketType,
    severity = 'normal',
    title,
    description,
    errorDetails
  } = ticketData;

  const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  await db.query(`
    INSERT INTO support_tickets (
      ticket_id, client_id, ticket_type, severity, title, description, error_details, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
  `, [ticketId, clientId, ticketType, severity, title, description, JSON.stringify(errorDetails || {})]);

  logger.info('Support ticket created', { ticketId, ticketType, severity });

  return { ticketId };
}

async function assignApiKeyToClient(clientId, keyType) {
  const availableKey = await db.query(`
    SELECT id, api_key FROM api_key_bank 
    WHERE key_type = $1 AND is_assigned = false AND is_active = true
    ORDER BY created_at ASC LIMIT 1
  `, [keyType]);

  if (availableKey.rows.length === 0) {
    return null;
  }

  const key = availableKey.rows[0];

  await db.query(`
    UPDATE api_key_bank 
    SET is_assigned = true, assigned_to_client = $1, assigned_at = NOW()
    WHERE id = $2
  `, [clientId, key.id]);

  logger.info('API key assigned to client', { clientId, keyType });

  return { keyId: key.id, apiKey: key.api_key };
}

async function getClientApiKey(clientId, keyType) {
  const result = await db.query(`
    SELECT api_key FROM api_key_bank 
    WHERE assigned_to_client = $1 AND key_type = $2 AND is_active = true
  `, [clientId, keyType]);

  return result.rows[0]?.api_key || null;
}

module.exports = {
  setupDatabase,
  createClientAccount,
  getClientByEmail,
  verifyClientPassword,
  checkOnboardingStatus,
  createSupportTicket,
  assignApiKeyToClient,
  getClientApiKey
};

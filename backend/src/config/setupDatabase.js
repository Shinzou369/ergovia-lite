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
  const [settingsResult, workflowsResult] = await Promise.all([
    db.query(`
      SELECT section FROM client_settings 
      WHERE client_id = $1
    `, [clientId]),
    db.query(`
      SELECT COUNT(*) as count FROM deployed_workflows 
      WHERE client_id = $1
    `, [clientId])
  ]);

  const completedSections = settingsResult.rows.map(r => r.section);
  const workflowCount = parseInt(workflowsResult.rows[0]?.count || 0);

  const requiredSections = ['owner', 'business', 'credentials'];
  const hasRequiredSettings = requiredSections.every(s => completedSections.includes(s));
  const hasWorkflows = workflowCount > 0;

  return {
    needsOnboarding: !hasRequiredSettings || !hasWorkflows,
    completedSections,
    hasRequiredSettings,
    hasWorkflows,
    workflowCount,
    currentStep: !completedSections.includes('owner') ? 1 :
                 !completedSections.includes('business') ? 2 :
                 !completedSections.includes('credentials') ? 3 :
                 !hasWorkflows ? 4 : 0
  };
}

module.exports = {
  setupDatabase,
  createClientAccount,
  getClientByEmail,
  verifyClientPassword,
  checkOnboardingStatus
};

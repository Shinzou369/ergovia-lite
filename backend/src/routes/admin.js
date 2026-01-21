const express = require('express');
const router = express.Router();
const { createClientAccount, getClientByEmail } = require('../config/setupDatabase');
const logger = require('../utils/logger');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'prismity-admin-2026';

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers['x-admin-key'];
  
  if (adminKey === ADMIN_SECRET || authHeader === `Bearer ${ADMIN_SECRET}`) {
    return next();
  }
  
  return res.status(401).json({ error: 'Unauthorized' });
}

router.post('/clients', authenticateAdmin, async (req, res) => {
  try {
    const { email, password, businessName, ownerName, ownerPhone, subdomain } = req.body;

    if (!email || !password || !businessName || !ownerName) {
      return res.status(400).json({ 
        error: 'Missing required fields: email, password, businessName, ownerName' 
      });
    }

    const existing = await getClientByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Client with this email already exists' });
    }

    const subdomainValue = subdomain || businessName.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 30);

    const result = await createClientAccount({
      email,
      password,
      businessName,
      ownerName,
      ownerPhone: ownerPhone || '',
      subdomain: subdomainValue
    });

    res.status(201).json({
      success: true,
      message: 'Client account created successfully',
      client: {
        clientId: result.clientId,
        email: result.email,
        subdomain: subdomainValue
      }
    });

  } catch (error) {
    logger.error('Failed to create client', { error: error.message });
    res.status(500).json({ error: 'Failed to create client account' });
  }
});

router.get('/clients', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const result = await db.query(`
      SELECT client_id, business_name, owner_email, owner_name, status, created_at
      FROM clients
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      clients: result.rows
    });

  } catch (error) {
    logger.error('Failed to list clients', { error: error.message });
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

router.get('/clients/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { clientId } = req.params;

    const [clientResult, settingsResult, workflowsResult] = await Promise.all([
      db.query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
      db.query('SELECT section, data FROM client_settings WHERE client_id = $1', [clientId]),
      db.query('SELECT * FROM deployed_workflows WHERE client_id = $1', [clientId])
    ]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    });

    res.json({
      success: true,
      client: clientResult.rows[0],
      settings,
      workflows: workflowsResult.rows
    });

  } catch (error) {
    logger.error('Failed to get client details', { error: error.message });
    res.status(500).json({ error: 'Failed to get client details' });
  }
});

module.exports = router;

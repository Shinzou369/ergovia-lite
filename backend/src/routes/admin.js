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

router.get('/api-bank', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { keyType, showAssigned } = req.query;

    let query = 'SELECT id, key_type, label, is_assigned, assigned_to_client, assigned_at, is_active, usage_count, created_at FROM api_key_bank';
    const params = [];

    if (keyType) {
      query += ' WHERE key_type = $1';
      params.push(keyType);
    }

    if (showAssigned === 'false') {
      query += params.length ? ' AND is_assigned = false' : ' WHERE is_assigned = false';
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      keys: result.rows,
      summary: {
        total: result.rows.length,
        assigned: result.rows.filter(k => k.is_assigned).length,
        available: result.rows.filter(k => !k.is_assigned && k.is_active).length
      }
    });
  } catch (error) {
    logger.error('Failed to list API keys', { error: error.message });
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

router.post('/api-bank', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { keyType, apiKey, label } = req.body;

    if (!keyType || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields: keyType, apiKey' });
    }

    const validTypes = ['openai', 'telegram', 'whatsapp', 'twilio', 'stripe', 'sendgrid'];
    if (!validTypes.includes(keyType)) {
      return res.status(400).json({ error: `Invalid key type. Must be one of: ${validTypes.join(', ')}` });
    }

    const result = await db.query(`
      INSERT INTO api_key_bank (key_type, api_key, label, is_assigned, is_active)
      VALUES ($1, $2, $3, false, true)
      RETURNING id, key_type, label, created_at
    `, [keyType, apiKey, label || `${keyType}-key-${Date.now()}`]);

    logger.info('API key added to bank', { keyType, label });

    res.status(201).json({
      success: true,
      message: 'API key added to bank',
      key: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to add API key', { error: error.message });
    res.status(500).json({ error: 'Failed to add API key' });
  }
});

router.post('/api-bank/:keyId/assign', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { keyId } = req.params;
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'Missing clientId' });
    }

    const keyResult = await db.query('SELECT * FROM api_key_bank WHERE id = $1', [keyId]);
    if (keyResult.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    if (keyResult.rows[0].is_assigned) {
      return res.status(400).json({ error: 'API key is already assigned' });
    }

    await db.query(`
      UPDATE api_key_bank 
      SET is_assigned = true, assigned_to_client = $1, assigned_at = NOW()
      WHERE id = $2
    `, [clientId, keyId]);

    logger.info('API key assigned to client', { keyId, clientId });

    res.json({
      success: true,
      message: 'API key assigned to client'
    });
  } catch (error) {
    logger.error('Failed to assign API key', { error: error.message });
    res.status(500).json({ error: 'Failed to assign API key' });
  }
});

router.post('/api-bank/:keyId/unassign', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { keyId } = req.params;

    await db.query(`
      UPDATE api_key_bank 
      SET is_assigned = false, assigned_to_client = NULL, assigned_at = NULL
      WHERE id = $1
    `, [keyId]);

    logger.info('API key unassigned', { keyId });

    res.json({ success: true, message: 'API key unassigned' });
  } catch (error) {
    logger.error('Failed to unassign API key', { error: error.message });
    res.status(500).json({ error: 'Failed to unassign API key' });
  }
});

router.delete('/api-bank/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { keyId } = req.params;

    await db.query('DELETE FROM api_key_bank WHERE id = $1', [keyId]);

    logger.info('API key deleted from bank', { keyId });

    res.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    logger.error('Failed to delete API key', { error: error.message });
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

router.get('/tickets', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { status, severity } = req.query;

    let query = `
      SELECT t.*, c.business_name, c.owner_email 
      FROM support_tickets t
      LEFT JOIN clients c ON t.client_id = c.client_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    if (severity) {
      params.push(severity);
      query += ` AND t.severity = $${params.length}`;
    }

    query += ' ORDER BY t.created_at DESC LIMIT 100';

    const result = await db.query(query, params);

    res.json({
      success: true,
      tickets: result.rows,
      summary: {
        total: result.rows.length,
        open: result.rows.filter(t => t.status === 'open').length,
        critical: result.rows.filter(t => t.severity === 'critical').length
      }
    });
  } catch (error) {
    logger.error('Failed to list tickets', { error: error.message });
    res.status(500).json({ error: 'Failed to list tickets' });
  }
});

router.patch('/tickets/:ticketId', authenticateAdmin, async (req, res) => {
  try {
    const db = require('../config/database');
    const { ticketId } = req.params;
    const { status, assignedTo, resolutionNotes } = req.body;

    const updates = [];
    const params = [ticketId];

    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
      if (status === 'resolved') {
        updates.push('resolved_at = NOW()');
      }
    }

    if (assignedTo) {
      params.push(assignedTo);
      updates.push(`assigned_to = $${params.length}`);
    }

    if (resolutionNotes) {
      params.push(resolutionNotes);
      updates.push(`resolution_notes = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push('updated_at = NOW()');

    await db.query(`
      UPDATE support_tickets SET ${updates.join(', ')} WHERE ticket_id = $1
    `, params);

    logger.info('Ticket updated', { ticketId, status });

    res.json({ success: true, message: 'Ticket updated' });
  } catch (error) {
    logger.error('Failed to update ticket', { error: error.message });
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

module.exports = router;

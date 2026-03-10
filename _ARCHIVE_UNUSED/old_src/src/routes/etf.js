'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { logger } = require('../lib/logger');
const { requireFields } = require('../middleware/validate');
const { deployWorkflows, extractTaskforceType } = require('../services/workflow');

function createETFRoutes({ databases, n8nClient }) {
  const router = Router();
  const { etfDb, runSql, getSql, allSql } = databases;

  // Get available PET workflow templates
  router.get('/templates', async (req, res) => {
    if (!n8nClient) return res.status(503).json({ success: false, error: { code: 'N8N_DISABLED', message: 'N8N not configured' } });

    try {
      const workflows = await n8nClient.getWorkflows();
      const list = workflows.data || workflows;

      const petWorkflows = (Array.isArray(list) ? list : []).filter((wf) => {
        const tags = wf.tags || [];
        return tags.some((t) => (typeof t === 'string' ? t : t?.name || '').toLowerCase() === 'pet');
      });

      const templates = petWorkflows.map((wf) => ({
        id: wf.id,
        name: wf.name,
        active: wf.active,
        tags: wf.tags || [],
        taskforce_type: extractTaskforceType(wf.name, wf.tags),
      }));

      res.json({ success: true, data: templates });
    } catch (err) {
      logger.error('Fetch templates failed', { error: err.message });
      res.status(500).json({ success: false, error: { code: 'TEMPLATE_ERROR', message: 'Failed to fetch templates' } });
    }
  });

  // Deploy workflows for a client
  router.post('/deploy', async (req, res) => {
    if (!n8nClient) return res.status(503).json({ success: false, error: { code: 'N8N_DISABLED', message: 'N8N not configured' } });

    try {
      const { client_data, config_data = {}, template_ids } = req.body;

      if (!client_data?.name) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_DATA', message: 'client_data.name is required' } });
      }

      // Resolve template IDs
      let workflowIds;
      if (req.body.template_id === 'pet_clinic_test' || req.body.test_mode) {
        const workflows = await n8nClient.getWorkflows();
        const list = workflows.data || workflows;
        workflowIds = (Array.isArray(list) ? list : [])
          .filter((wf) => (wf.tags || []).some((t) => (typeof t === 'string' ? t : t?.name || '').toLowerCase() === 'pet'))
          .map((wf) => wf.id);
      } else {
        workflowIds = Array.isArray(template_ids) ? template_ids : [template_ids].filter(Boolean);
      }

      if (workflowIds.length === 0) {
        return res.status(400).json({ success: false, error: { code: 'NO_TEMPLATES', message: 'No template IDs provided' } });
      }

      // Deploy
      const { results, errors, idMappings } = await deployWorkflows(n8nClient, workflowIds, config_data, client_data);

      // Tag with client identifier
      const clientTag = `PET[${client_data.name}]`;
      for (const r of results.filter((r) => r.success)) {
        try { await n8nClient.tagWorkflow(r.newId, [clientTag]); } catch {}
      }

      // Persist to DB
      const clientId = uuidv4();
      await runSql(etfDb,
        `INSERT OR IGNORE INTO etf_clients (id, name, email, company, industry, taskforce_type) VALUES (?, ?, ?, ?, ?, ?)`,
        [clientId, client_data.name, client_data.email || '', client_data.name, 'Pet Clinic', 'dental']
      );

      for (const r of results.filter((r) => r.success)) {
        await runSql(etfDb,
          `INSERT INTO etf_deployments (id, client_id, template_id, n8n_workflow_id, workflow_name, taskforce_type, config_data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), clientId, r.originalId, r.newId, r.name, 'general', JSON.stringify(config_data)]
        );
      }

      const activated = results.filter((r) => r.activation === 'activated').length;
      const failed = errors.length + results.filter((r) => r.activation === 'failed').length;

      res.json({
        success: true,
        data: {
          clientId,
          workflows: results,
          summary: { total: results.length, activated, failed, errors: errors.length },
          tag: clientTag,
        },
      });
    } catch (err) {
      logger.error('Deploy failed', { error: err.message, client: req.body.client_data?.name });
      res.status(500).json({ success: false, error: { code: 'DEPLOY_ERROR', message: err.message } });
    }
  });

  // Stats
  router.get('/stats', async (req, res) => {
    try {
      const row = await getSql(etfDb, `
        SELECT
          (SELECT COUNT(*) FROM etf_clients) as total_clients,
          (SELECT COUNT(*) FROM etf_deployments WHERE status = 'active') as active_deployments,
          (SELECT COUNT(*) FROM etf_deployments WHERE deployed_at > datetime('now', '-30 days')) as monthly_deployments
      `);
      res.json({ success: true, data: { ...row, estimated_revenue: (row.active_deployments || 0) * 30 } });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'STATS_ERROR', message: 'Failed to fetch stats' } });
    }
  });

  // Test N8N connection
  router.get('/test-n8n', async (req, res) => {
    if (!n8nClient) return res.status(503).json({ success: false, error: { code: 'N8N_DISABLED', message: 'N8N not configured' } });
    try {
      const result = await n8nClient.testConnection();
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'N8N_ERROR', message: err.message } });
    }
  });

  // Client deployments by email
  router.get('/client-deployments', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, error: { code: 'MISSING_EMAIL', message: 'Email required' } });

    try {
      const clients = await allSql(etfDb, `SELECT * FROM etf_clients WHERE email = ?`, [email]);
      if (clients.length === 0) return res.json({ success: true, data: { deployments: [] } });

      const ids = clients.map((c) => c.id);
      const placeholders = ids.map(() => '?').join(',');
      const deployments = await allSql(etfDb, `
        SELECT d.*, c.name as client_name, c.email as client_email
        FROM etf_deployments d JOIN etf_clients c ON d.client_id = c.id
        WHERE d.client_id IN (${placeholders})
        ORDER BY d.deployed_at DESC
      `, ids);

      res.json({ success: true, data: { deployments } });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch deployments' } });
    }
  });

  // Validate Telegram credentials
  router.post('/validate-telegram-credentials', requireFields('telegram_bot_token', 'telegram_chat_id'), async (req, res) => {
    const { telegram_bot_token, telegram_chat_id } = req.body;

    if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(telegram_bot_token)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid bot token format' } });
    }

    try {
      const response = await axios.get(`https://api.telegram.org/bot${telegram_bot_token}/getMe`);
      if (!response.data.ok) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_CREDS', message: 'Telegram rejected the token' } });
      }
      res.json({ success: true, data: { bot: response.data.result } });
    } catch {
      res.status(400).json({ success: false, error: { code: 'TELEGRAM_ERROR', message: 'Failed to validate token' } });
    }
  });

  // Client config by ID
  router.get('/client-config/:clientId', async (req, res) => {
    try {
      const row = await getSql(etfDb,
        `SELECT config_data FROM etf_deployments WHERE client_id = ? ORDER BY deployed_at DESC LIMIT 1`,
        [req.params.clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Client not found' } });
      res.json({ success: true, data: { config: JSON.parse(row.config_data || '{}'), clientId: req.params.clientId } });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch config' } });
    }
  });

  // Client history
  router.get('/client-history/:clientId', async (req, res) => {
    try {
      const rows = await allSql(etfDb,
        `SELECT * FROM etf_client_history WHERE client_id = ? ORDER BY timestamp DESC LIMIT 50`,
        [req.params.clientId]
      );
      res.json({ success: true, data: { history: rows } });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch history' } });
    }
  });

  // Log errors from client
  router.post('/log-error', async (req, res) => {
    const { client_id, error_type, error_message, stack, user_agent, url } = req.body;
    if (!error_type || !error_message) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_DATA', message: 'error_type and error_message required' } });
    }

    try {
      await runSql(etfDb,
        `INSERT INTO etf_error_logs (client_id, error_type, error_message, stack, user_agent, url) VALUES (?, ?, ?, ?, ?, ?)`,
        [client_id || null, error_type, error_message, stack || null, user_agent || null, url || null]
      );
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: { code: 'LOG_ERROR', message: 'Failed to log error' } });
    }
  });

  return router;
}

module.exports = { createETFRoutes };

'use strict';

const { Router } = require('express');
const OpenAI = require('openai');
const { logger } = require('../lib/logger');
const { requireAuth } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');

function createClientRoutes({ databases, config }) {
  const router = Router();
  const { etfDb, runSql, getSql, allSql } = databases;

  const openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;

  // Multi-tenant: Get client config (called by N8N workflows)
  router.get('/mt/client/:clientId', async (req, res) => {
    try {
      const row = await getSql(etfDb,
        `SELECT client_id, business_name, greeting, timezone, settings, status
         FROM client_configs WHERE client_id = ? AND status = 'active'`,
        [req.params.clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Client not found' } });

      const settings = row.settings ? JSON.parse(row.settings) : {};
      res.json({
        success: true,
        data: {
          clientId: row.client_id,
          businessName: row.business_name,
          greeting: row.greeting || `Welcome to ${row.business_name}!`,
          timezone: row.timezone,
          settings,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch client' } });
    }
  });

  // Multi-tenant: List clients
  router.get('/mt/clients', async (req, res) => {
    try {
      const rows = await allSql(etfDb,
        `SELECT client_id, business_name, status, created_at FROM client_configs ORDER BY created_at DESC`
      );
      res.json({ success: true, data: { clients: rows } });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch clients' } });
    }
  });

  // Multi-tenant: Create client
  router.post('/mt/client', requireFields('client_id', 'business_name'), async (req, res) => {
    const { client_id, business_name, greeting, timezone, settings } = req.body;

    try {
      await runSql(etfDb,
        `INSERT INTO client_configs (client_id, business_name, greeting, timezone, settings) VALUES (?, ?, ?, ?, ?)`,
        [client_id, business_name, greeting || `Welcome to ${business_name}!`, timezone || 'America/New_York', settings ? JSON.stringify(settings) : null]
      );
      res.json({ success: true, data: { clientId: client_id } });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Client ID already exists' } });
      }
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to create client' } });
    }
  });

  // Multi-tenant: Lookup by bot ID
  router.get('/mt/client-by-bot/:botId', async (req, res) => {
    try {
      const row = await getSql(etfDb,
        `SELECT client_id, business_name, greeting, timezone, settings
         FROM client_configs WHERE telegram_bot_token LIKE ? AND status = 'active'`,
        [`${req.params.botId}:%`]
      );
      if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No client for this bot' } });

      res.json({ success: true, data: { ...row, settings: row.settings ? JSON.parse(row.settings) : {} } });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch client' } });
    }
  });

  // Multi-tenant: Lookup by chat ID
  router.get('/mt/client-by-chat/:chatId', async (req, res) => {
    try {
      const row = await getSql(etfDb,
        `SELECT client_id, business_name, greeting, timezone, settings
         FROM client_configs WHERE telegram_chat_id = ? AND status = 'active'`,
        [req.params.chatId]
      );
      if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No client for this chat' } });

      res.json({ success: true, data: { ...row, settings: row.settings ? JSON.parse(row.settings) : {} } });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch client' } });
    }
  });

  // Chat completions (AI proxy with budget)
  router.post('/ask-gpt', requireAuth, async (req, res) => {
    if (!openai) return res.status(503).json({ success: false, error: { code: 'AI_DISABLED', message: 'OpenAI not configured' } });

    try {
      const { messages, model = 'gpt-4o-mini' } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'messages array required' } });
      }

      const completion = await openai.chat.completions.create({
        model,
        messages,
        max_tokens: 2000,
      });

      res.json({
        success: true,
        data: {
          message: completion.choices[0]?.message,
          usage: completion.usage,
        },
      });
    } catch (err) {
      logger.error('OpenAI request failed', { error: err.message });
      res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: 'AI request failed' } });
    }
  });

  return router;
}

module.exports = { createClientRoutes };

'use strict';

const { Router } = require('express');
const { logger } = require('../lib/logger');

function createSystemRoutes({ databases }) {
  const router = Router();
  const { taskforceDb, etfDb, getSql } = databases;

  router.get('/health', async (req, res) => {
    const checks = { server: 'healthy', uptime: process.uptime() };

    try {
      await getSql(taskforceDb, "SELECT 1");
      checks.taskforceDb = 'healthy';
    } catch {
      checks.taskforceDb = 'unhealthy';
    }

    try {
      await getSql(etfDb, "SELECT 1");
      checks.etfDb = 'healthy';
    } catch {
      checks.etfDb = 'unhealthy';
    }

    const allHealthy = checks.taskforceDb === 'healthy' && checks.etfDb === 'healthy';
    res.status(allHealthy ? 200 : 503).json(checks);
  });

  router.get('/api/system/status', async (req, res) => {
    try {
      const status = {
        server: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
        },
        databases: {},
        config: {
          n8nConfigured: !!(process.env.N8N_BASE_URL && process.env.N8N_API_KEY),
          openaiConfigured: !!process.env.OPENAI_API_KEY,
          environment: process.env.NODE_ENV || 'development',
        },
      };

      try {
        const row = await getSql(taskforceDb, "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'");
        status.databases.taskforce = { status: 'healthy', tables: row.count };
      } catch (err) {
        status.databases.taskforce = { status: 'error', error: err.message };
      }

      try {
        const row = await getSql(etfDb, "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'");
        status.databases.etf = { status: 'healthy', tables: row.count };
      } catch (err) {
        status.databases.etf = { status: 'error', error: err.message };
      }

      res.json({ success: true, data: status });
    } catch (err) {
      logger.error('Status check failed', { error: err.message });
      res.status(500).json({ success: false, error: { code: 'STATUS_ERROR', message: 'Failed to get status' } });
    }
  });

  return router;
}

module.exports = { createSystemRoutes };

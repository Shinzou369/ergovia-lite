const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {}
  };

  try {
    await db.query('SELECT 1');
    health.services.database = 'ok';
  } catch (error) {
    health.services.database = 'error';
    health.status = 'degraded';
  }

  health.services.memory = {
    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
  };

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

router.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

module.exports = router;

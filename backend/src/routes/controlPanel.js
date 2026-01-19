const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateClient } = require('../middleware/auth');
const { validateRequired, sanitizeInput } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

router.post('/settings',
  authenticateClient,
  sanitizeInput,
  validateRequired(['section', 'data']),
  async (req, res) => {
    try {
      const { section, data } = req.body;
      const clientId = req.clientId;

      await db.query(`
        INSERT INTO client_settings (client_id, section, data)
        VALUES ($1, $2, $3)
        ON CONFLICT (client_id, section) 
        DO UPDATE SET data = $3, updated_at = NOW()
      `, [clientId, section, JSON.stringify(data)]);

      res.json({ success: true, message: 'Settings saved' });

    } catch (error) {
      logger.error('Failed to save settings', { error: error.message });
      res.status(500).json({ error: 'Failed to save settings' });
    }
  }
);

router.get('/settings',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { section } = req.query;

      let query = 'SELECT section, data FROM client_settings WHERE client_id = $1';
      const params = [clientId];

      if (section) {
        query += ' AND section = $2';
        params.push(section);
      }

      const result = await db.query(query, params);

      const settings = {};
      result.rows.forEach(row => {
        settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      });

      res.json({ success: true, settings });

    } catch (error) {
      logger.error('Failed to get settings', { error: error.message });
      res.status(500).json({ error: 'Failed to get settings' });
    }
  }
);

router.get('/dashboard',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;

      const [clientResult, serverResult, statsResult, tasksResult, bookingsResult] = await Promise.all([
        db.query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
        db.query('SELECT * FROM client_servers WHERE client_id = $1', [clientId]),
        db.query(`
          SELECT 
            (SELECT COUNT(*) FROM deployed_workflows WHERE client_id = $1 AND is_active = true) as active_workflows,
            (SELECT COUNT(*) FROM deployed_workflows WHERE client_id = $1) as total_workflows
        `, [clientId]),
        db.query(`
          SELECT * FROM client_settings WHERE client_id = $1 AND section = 'tasks'
        `, [clientId]),
        db.query(`
          SELECT * FROM client_settings WHERE client_id = $1 AND section = 'bookings'
        `, [clientId])
      ]);

      const client = clientResult.rows[0];
      const server = serverResult.rows[0];
      const stats = statsResult.rows[0];

      res.json({
        success: true,
        owner: {
          name: client?.owner_name,
          email: client?.owner_email,
          businessName: client?.business_name
        },
        server: {
          domain: server?.domain,
          status: server?.server_status,
          nocodbUrl: server?.nocodb_url,
          lastHealthCheck: server?.last_health_check
        },
        stats: {
          activeWorkflows: parseInt(stats?.active_workflows) || 0,
          totalWorkflows: parseInt(stats?.total_workflows) || 0,
          activeBookings: 0,
          activeConversations: 0,
          monthlyRevenue: 0
        },
        tasks: tasksResult.rows[0]?.data || [],
        upcomingBookings: bookingsResult.rows[0]?.data || []
      });

    } catch (error) {
      logger.error('Failed to get dashboard data', { error: error.message });
      res.status(500).json({ error: 'Failed to get dashboard data' });
    }
  }
);

router.get('/properties',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;
      
      const result = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'properties'
      `, [clientId]);

      const properties = result.rows[0]?.data || [];

      res.json({ success: true, properties });

    } catch (error) {
      logger.error('Failed to get properties', { error: error.message });
      res.status(500).json({ error: 'Failed to get properties' });
    }
  }
);

router.post('/properties',
  authenticateClient,
  sanitizeInput,
  validateRequired(['property']),
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const property = req.body.property;

      const result = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'properties'
      `, [clientId]);

      let properties = result.rows[0]?.data || [];
      
      const existingIndex = properties.findIndex(p => p.id === property.id);
      if (existingIndex >= 0) {
        properties[existingIndex] = { ...properties[existingIndex], ...property };
      } else {
        property.id = property.id || `prop_${Date.now()}`;
        properties.push(property);
      }

      await db.query(`
        INSERT INTO client_settings (client_id, section, data)
        VALUES ($1, 'properties', $2)
        ON CONFLICT (client_id, section)
        DO UPDATE SET data = $2, updated_at = NOW()
      `, [clientId, JSON.stringify(properties)]);

      res.json({ success: true, property });

    } catch (error) {
      logger.error('Failed to save property', { error: error.message });
      res.status(500).json({ error: 'Failed to save property' });
    }
  }
);

router.delete('/properties/:propertyId',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { propertyId } = req.params;

      const result = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'properties'
      `, [clientId]);

      let properties = result.rows[0]?.data || [];
      properties = properties.filter(p => p.id !== propertyId);

      await db.query(`
        UPDATE client_settings SET data = $1, updated_at = NOW()
        WHERE client_id = $2 AND section = 'properties'
      `, [JSON.stringify(properties), clientId]);

      res.json({ success: true, message: 'Property deleted' });

    } catch (error) {
      logger.error('Failed to delete property', { error: error.message });
      res.status(500).json({ error: 'Failed to delete property' });
    }
  }
);

router.get('/notifications',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;

      const result = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'notifications'
      `, [clientId]);

      const notifications = result.rows[0]?.data || [];

      res.json({ success: true, notifications });

    } catch (error) {
      logger.error('Failed to get notifications', { error: error.message });
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }
);

router.post('/notifications/read',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { notificationId, markAll } = req.body;

      const result = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'notifications'
      `, [clientId]);

      let notifications = result.rows[0]?.data || [];

      if (markAll) {
        notifications = notifications.map(n => ({ ...n, read: true }));
      } else if (notificationId) {
        notifications = notifications.map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        );
      }

      await db.query(`
        UPDATE client_settings SET data = $1, updated_at = NOW()
        WHERE client_id = $2 AND section = 'notifications'
      `, [JSON.stringify(notifications), clientId]);

      res.json({ success: true });

    } catch (error) {
      logger.error('Failed to mark notification read', { error: error.message });
      res.status(500).json({ error: 'Failed to update notification' });
    }
  }
);

router.get('/tasks',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;

      const result = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'tasks'
      `, [clientId]);

      const tasks = (result.rows[0]?.data || []).filter(t => t.status === 'pending');

      res.json({ success: true, tasks });

    } catch (error) {
      logger.error('Failed to get tasks', { error: error.message });
      res.status(500).json({ error: 'Failed to get tasks' });
    }
  }
);

router.post('/tasks/:taskId/complete',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { taskId } = req.params;

      const result = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'tasks'
      `, [clientId]);

      let tasks = result.rows[0]?.data || [];
      tasks = tasks.map(t => 
        t.id === taskId ? { ...t, status: 'completed', completedAt: new Date().toISOString() } : t
      );

      await db.query(`
        UPDATE client_settings SET data = $1, updated_at = NOW()
        WHERE client_id = $2 AND section = 'tasks'
      `, [JSON.stringify(tasks), clientId]);

      res.json({ success: true, message: 'Task completed' });

    } catch (error) {
      logger.error('Failed to complete task', { error: error.message });
      res.status(500).json({ error: 'Failed to complete task' });
    }
  }
);

router.get('/bookings',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;

      const [bookingsResult, propertiesResult] = await Promise.all([
        db.query(`SELECT data FROM client_settings WHERE client_id = $1 AND section = 'bookings'`, [clientId]),
        db.query(`SELECT data FROM client_settings WHERE client_id = $1 AND section = 'properties'`, [clientId])
      ]);

      res.json({
        success: true,
        bookings: bookingsResult.rows[0]?.data || [],
        properties: propertiesResult.rows[0]?.data || []
      });

    } catch (error) {
      logger.error('Failed to get bookings', { error: error.message });
      res.status(500).json({ error: 'Failed to get bookings' });
    }
  }
);

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateClient } = require('../middleware/auth');
const { validateRequired, sanitizeInput } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');
const N8NClient = require('../services/n8n/client');
const WorkflowDeployer = require('../services/n8n/deployer');
const { createSupportTicket, getClientApiKey } = require('../config/setupDatabase');

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

      const [clientResult, serverResult, settingsResult, tasksResult, bookingsResult, activityResult] = await Promise.all([
        db.query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
        db.query('SELECT * FROM client_servers WHERE client_id = $1', [clientId]),
        db.query('SELECT section, data FROM client_settings WHERE client_id = $1', [clientId]),
        db.query(`SELECT * FROM client_settings WHERE client_id = $1 AND section = 'tasks'`, [clientId]),
        db.query(`SELECT * FROM client_settings WHERE client_id = $1 AND section = 'bookings'`, [clientId]),
        db.query(`SELECT * FROM client_settings WHERE client_id = $1 AND section = 'activity'`, [clientId])
      ]);

      const client = clientResult.rows[0];
      const server = serverResult.rows[0];

      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      });

      const alerts = [];

      if (!settings.business?.name) {
        alerts.push({
          type: 'warning',
          title: 'Complete Your Profile',
          message: 'Please complete your business information in Settings'
        });
      }

      const tasks = tasksResult.rows[0]?.data || [];
      const pendingTasks = tasks.filter(t => t.status === 'pending');
      const bookings = bookingsResult.rows[0]?.data || [];
      const activeBookings = bookings.filter(b => new Date(b.checkOut) > new Date());
      const activity = activityResult.rows[0]?.data || [];

      res.json({
        success: true,
        owner: {
          name: settings.owner?.name || client?.owner_name,
          email: settings.owner?.email || client?.owner_email,
          businessName: settings.business?.name || client?.business_name
        },
        stats: {
          activeBookings: activeBookings.length,
          pendingTasks: pendingTasks.length,
          messagesHandled: 0,
          monthlyRevenue: 0
        },
        alerts,
        tasks: pendingTasks.slice(0, 5),
        upcomingBookings: activeBookings.slice(0, 5),
        activity: activity.slice(0, 10)
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

router.get('/workflows/test-connection',
  authenticateClient,
  async (req, res) => {
    try {
      const n8nUrl = process.env.N8N_BASE_URL;
      const n8nApiKey = process.env.N8N_API_KEY;

      if (!n8nUrl || !n8nApiKey) {
        return res.status(500).json({ 
          success: false, 
          error: 'n8n not configured. Please set N8N_BASE_URL and N8N_API_KEY.' 
        });
      }

      const n8nClient = new N8NClient(n8nUrl, n8nApiKey);
      const workflows = await n8nClient.getWorkflows();

      res.json({
        success: true,
        message: 'Connection successful',
        workflowCount: Array.isArray(workflows) ? workflows.length : 0
      });

    } catch (error) {
      logger.error('n8n connection test failed', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to connect to n8n: ' + error.message });
    }
  }
);

router.get('/workflows',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;

      const result = await db.query(`
        SELECT * FROM deployed_workflows WHERE client_id = $1 ORDER BY workflow_number
      `, [clientId]);

      res.json({
        success: true,
        workflows: result.rows.map(row => ({
          id: row.n8n_workflow_id,
          number: row.workflow_number,
          name: row.workflow_name,
          active: row.is_active,
          lastExecution: row.last_execution,
          executionCount: row.execution_count
        }))
      });

    } catch (error) {
      logger.error('Failed to get workflows', { error: error.message });
      res.status(500).json({ error: 'Failed to get workflows' });
    }
  }
);

router.post('/workflows/deploy',
  authenticateClient,
  rateLimiter({ maxRequests: 5, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { activate = true } = req.body;

      const n8nUrl = process.env.N8N_BASE_URL;
      const n8nApiKey = process.env.N8N_API_KEY;

      if (!n8nUrl || !n8nApiKey) {
        return res.status(500).json({ 
          success: false, 
          error: 'n8n not configured. Please set N8N_BASE_URL and N8N_API_KEY.' 
        });
      }

      const [clientResult, settingsResult] = await Promise.all([
        db.query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
        db.query('SELECT section, data FROM client_settings WHERE client_id = $1', [clientId])
      ]);

      const client = clientResult.rows[0];
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      });

      const serverResult = await db.query('SELECT * FROM client_servers WHERE client_id = $1', [clientId]);
      const server = serverResult.rows[0];

      const config = {
        businessName: settings.business?.name || client.business_name,
        propertyName: settings.business?.propertyName || client.business_name,
        ownerEmail: settings.owner?.email || client.owner_email,
        ownerPhone: settings.owner?.phone || client.owner_phone || '',
        ownerTelegram: settings.credentials?.telegramChatId || client.telegram_chat_id || '',
        openaiApiKey: settings.credentials?.openaiApiKey || process.env.OPENAI_API_KEY || '',
        telegramBotToken: settings.credentials?.telegramBotToken || '',
        whatsappApiKey: settings.credentials?.whatsappApiKey || '',
        dbHost: server?.server_ip || 'localhost',
        dbPort: '5432',
        dbName: server?.db_name || `client_${clientId}`,
        dbUser: server?.db_user || clientId,
        dbPassword: server?.db_password || '',
        subdomain: client.subdomain,
        domain: server?.domain || `${client.subdomain}.prismity.ai`
      };

      const n8nClient = new N8NClient(n8nUrl, n8nApiKey);
      const deployer = new WorkflowDeployer(n8nClient);

      const result = await deployer.deployAllWorkflows(config);

      for (const workflow of result.workflows) {
        if (workflow.success) {
          await db.query(`
            INSERT INTO deployed_workflows (client_id, workflow_number, workflow_name, n8n_workflow_id, is_active)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (client_id, workflow_number)
            DO UPDATE SET workflow_name = $3, n8n_workflow_id = $4, is_active = $5, updated_at = NOW()
          `, [clientId, result.workflows.indexOf(workflow) + 1, workflow.name, workflow.id, workflow.active]);
        }
      }

      res.json({
        success: true,
        message: `Deployed ${result.successful} of ${result.total} workflows`,
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        workflows: result.workflows
      });

    } catch (error) {
      logger.error('Failed to deploy workflows', { error: error.message });
      res.status(500).json({ error: 'Failed to deploy workflows: ' + error.message });
    }
  }
);

router.post('/workflows/deploy-single',
  authenticateClient,
  sanitizeInput,
  validateRequired(['workflowNumber']),
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { workflowNumber, activate = true } = req.body;

      const n8nUrl = process.env.N8N_BASE_URL;
      const n8nApiKey = process.env.N8N_API_KEY;

      if (!n8nUrl || !n8nApiKey) {
        return res.status(500).json({ 
          success: false, 
          error: 'n8n not configured.' 
        });
      }

      const [clientResult, settingsResult] = await Promise.all([
        db.query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
        db.query('SELECT section, data FROM client_settings WHERE client_id = $1', [clientId])
      ]);

      const client = clientResult.rows[0];
      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      });

      const serverResult = await db.query('SELECT * FROM client_servers WHERE client_id = $1', [clientId]);
      const server = serverResult.rows[0];

      const config = {
        businessName: settings.business?.name || client.business_name,
        propertyName: settings.business?.propertyName || client.business_name,
        ownerEmail: settings.owner?.email || client.owner_email,
        ownerPhone: settings.owner?.phone || client.owner_phone || '',
        ownerTelegram: settings.credentials?.telegramChatId || client.telegram_chat_id || '',
        openaiApiKey: settings.credentials?.openaiApiKey || process.env.OPENAI_API_KEY || '',
        telegramBotToken: settings.credentials?.telegramBotToken || '',
        whatsappApiKey: settings.credentials?.whatsappApiKey || '',
        subdomain: client.subdomain,
        dbHost: server?.server_ip || 'localhost',
        dbPort: '5432',
        dbName: server?.db_name || `client_${clientId}`,
        dbUser: server?.db_user || clientId,
        dbPassword: server?.db_password || '',
        domain: server?.domain || `${client.subdomain}.prismity.ai`
      };

      const n8nClient = new N8NClient(n8nUrl, n8nApiKey);
      const deployer = new WorkflowDeployer(n8nClient);

      const workflowFiles = await deployer.listAvailableWorkflows();
      
      if (workflowNumber < 1 || workflowNumber > workflowFiles.length) {
        return res.status(400).json({ error: `Invalid workflow number. Must be 1-${workflowFiles.length}` });
      }

      const filename = workflowFiles[workflowNumber - 1];
      const result = await deployer.deployWorkflow(filename, config, { 
        activate, 
        tag: config.businessName.replace(/\s+/g, '_') 
      });

      await db.query(`
        INSERT INTO deployed_workflows (client_id, workflow_number, workflow_name, n8n_workflow_id, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (client_id, workflow_number)
        DO UPDATE SET workflow_name = $3, n8n_workflow_id = $4, is_active = $5, updated_at = NOW()
      `, [clientId, workflowNumber, result.name, result.id, result.active]);

      res.json({
        success: true,
        message: `Deployed workflow: ${result.name}`,
        workflow: result
      });

    } catch (error) {
      logger.error('Failed to deploy single workflow', { error: error.message });
      res.status(500).json({ error: 'Failed to deploy workflow: ' + error.message });
    }
  }
);

router.get('/workflows/available',
  authenticateClient,
  async (req, res) => {
    try {
      const n8nUrl = process.env.N8N_BASE_URL;
      const n8nApiKey = process.env.N8N_API_KEY;

      if (!n8nUrl || !n8nApiKey) {
        return res.status(500).json({ success: false, error: 'n8n not configured' });
      }

      const n8nClient = new N8NClient(n8nUrl, n8nApiKey);
      const deployer = new WorkflowDeployer(n8nClient);
      const workflowFiles = await deployer.listAvailableWorkflows();

      res.json({
        success: true,
        workflows: workflowFiles.map((filename, index) => ({
          number: index + 1,
          filename,
          name: filename.replace('.json', '').replace(/_/g, ' ')
        }))
      });

    } catch (error) {
      logger.error('Failed to list available workflows', { error: error.message });
      res.status(500).json({ error: 'Failed to list workflows' });
    }
  }
);

router.post('/workflows/redeploy',
  authenticateClient,
  sanitizeInput,
  rateLimiter({ maxRequests: 10, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { workflowNumbers } = req.body;

      const n8nUrl = process.env.N8N_BASE_URL;
      const n8nApiKey = process.env.N8N_API_KEY;

      if (!n8nUrl || !n8nApiKey) {
        return res.status(500).json({ success: false, error: 'n8n not configured' });
      }

      const [clientResult, settingsResult, deployedResult] = await Promise.all([
        db.query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
        db.query('SELECT section, data FROM client_settings WHERE client_id = $1', [clientId]),
        db.query('SELECT * FROM deployed_workflows WHERE client_id = $1', [clientId])
      ]);

      const client = clientResult.rows[0];
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      });

      const serverResult = await db.query('SELECT * FROM client_servers WHERE client_id = $1', [clientId]);
      const server = serverResult.rows[0];

      const config = {
        businessName: settings.business?.name || client.business_name,
        propertyName: settings.business?.propertyName || client.business_name,
        ownerEmail: settings.owner?.email || client.owner_email,
        ownerPhone: settings.owner?.phone || client.owner_phone || '',
        ownerTelegram: settings.credentials?.telegramChatId || client.telegram_chat_id || '',
        openaiApiKey: settings.credentials?.openaiApiKey || process.env.OPENAI_API_KEY || '',
        telegramBotToken: settings.credentials?.telegramBotToken || '',
        dbHost: server?.server_ip || 'localhost',
        dbPort: '5432',
        dbName: server?.db_name || `client_${clientId}`,
        dbUser: server?.db_user || clientId,
        dbPassword: server?.db_password || '',
        subdomain: client.subdomain,
        domain: server?.domain || `${client.subdomain}.prismity.ai`
      };

      const n8nClient = new N8NClient(n8nUrl, n8nApiKey);
      const deployer = new WorkflowDeployer(n8nClient);
      const workflowFiles = await deployer.listAvailableWorkflows();

      const workflowsToRedeploy = workflowNumbers || 
        deployedResult.rows.map(r => r.workflow_number);

      const results = [];

      for (const workflowNum of workflowsToRedeploy) {
        const existingWorkflow = deployedResult.rows.find(r => r.workflow_number === workflowNum);
        
        if (existingWorkflow?.n8n_workflow_id) {
          try {
            await n8nClient.deleteWorkflow(existingWorkflow.n8n_workflow_id);
            logger.info('Deleted old workflow', { workflowId: existingWorkflow.n8n_workflow_id });
          } catch (deleteError) {
            logger.warn('Could not delete old workflow', { error: deleteError.message });
          }
        }

        if (workflowNum < 1 || workflowNum > workflowFiles.length) {
          results.push({ number: workflowNum, success: false, error: 'Invalid workflow number' });
          continue;
        }

        try {
          const filename = workflowFiles[workflowNum - 1];
          const result = await deployer.deployWorkflow(filename, config, { 
            activate: existingWorkflow?.is_active ?? true,
            tag: config.businessName.replace(/\s+/g, '_') 
          });

          await db.query(`
            INSERT INTO deployed_workflows (client_id, workflow_number, workflow_name, n8n_workflow_id, is_active)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (client_id, workflow_number)
            DO UPDATE SET workflow_name = $3, n8n_workflow_id = $4, is_active = $5, updated_at = NOW()
          `, [clientId, workflowNum, result.name, result.id, result.active]);

          results.push({ number: workflowNum, success: true, name: result.name, id: result.id });
        } catch (deployError) {
          results.push({ number: workflowNum, success: false, error: deployError.message });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        success: true,
        message: `Redeployed ${successful} of ${results.length} workflows`,
        successful,
        failed,
        results
      });

    } catch (error) {
      logger.error('Failed to redeploy workflows', { error: error.message });
      res.status(500).json({ error: 'Failed to redeploy workflows: ' + error.message });
    }
  }
);

router.post('/workflows/:workflowId/toggle',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { workflowId } = req.params;
      const { active } = req.body;

      const n8nUrl = process.env.N8N_BASE_URL;
      const n8nApiKey = process.env.N8N_API_KEY;

      if (!n8nUrl || !n8nApiKey) {
        return res.status(500).json({ success: false, error: 'n8n not configured' });
      }

      const existingResult = await db.query(
        'SELECT * FROM deployed_workflows WHERE client_id = $1 AND n8n_workflow_id = $2',
        [clientId, workflowId]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      const n8nClient = new N8NClient(n8nUrl, n8nApiKey);

      if (active) {
        await n8nClient.activateWorkflow(workflowId);
      } else {
        await n8nClient.deactivateWorkflow(workflowId);
      }

      await db.query(
        'UPDATE deployed_workflows SET is_active = $1, updated_at = NOW() WHERE client_id = $2 AND n8n_workflow_id = $3',
        [active, clientId, workflowId]
      );

      res.json({
        success: true,
        message: `Workflow ${active ? 'activated' : 'deactivated'}`,
        active
      });

    } catch (error) {
      logger.error('Failed to toggle workflow', { error: error.message });
      res.status(500).json({ error: 'Failed to toggle workflow: ' + error.message });
    }
  }
);

router.post('/support/ticket',
  authenticateClient,
  sanitizeInput,
  validateRequired(['title', 'description']),
  rateLimiter({ maxRequests: 10, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    try {
      const clientId = req.clientId;
      const { title, description, category } = req.body;

      const result = await createSupportTicket({
        clientId,
        ticketType: category || 'general',
        severity: 'normal',
        title,
        description,
        errorDetails: { userAgent: req.headers['user-agent'] }
      });

      res.json({
        success: true,
        message: 'Your support request has been submitted. We will get back to you shortly.',
        ticketId: result.ticketId
      });

    } catch (error) {
      logger.error('Failed to create support ticket', { error: error.message });
      res.status(500).json({ error: 'Failed to submit support request. Please try again.' });
    }
  }
);

router.get('/support/tickets',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;

      const result = await db.query(`
        SELECT ticket_id, ticket_type, title, status, created_at, resolved_at
        FROM support_tickets
        WHERE client_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [clientId]);

      res.json({
        success: true,
        tickets: result.rows.map(row => ({
          id: row.ticket_id,
          type: row.ticket_type,
          title: row.title,
          status: row.status,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at
        }))
      });

    } catch (error) {
      logger.error('Failed to get support tickets', { error: error.message });
      res.status(500).json({ error: 'Failed to get support requests' });
    }
  }
);

router.post('/onboarding/complete',
  authenticateClient,
  async (req, res) => {
    try {
      const clientId = req.clientId;
      
      const [clientResult, serverResult, settingsResult] = await Promise.all([
        db.query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
        db.query('SELECT * FROM client_servers WHERE client_id = $1', [clientId]),
        db.query('SELECT section, data FROM client_settings WHERE client_id = $1', [clientId])
      ]);

      if (clientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      
      const client = clientResult.rows[0];
      const server = serverResult.rows[0];
      
      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      });

      await db.query(`
        INSERT INTO client_settings (client_id, section, data)
        VALUES ($1, 'credentials', $2)
        ON CONFLICT (client_id, section) 
        DO UPDATE SET data = $2, updated_at = NOW()
      `, [clientId, JSON.stringify({ autoAssigned: true, completedAt: new Date().toISOString() })]);

      await db.query(`
        INSERT INTO client_settings (client_id, section, data)
        VALUES ($1, 'onboarding', $2)
        ON CONFLICT (client_id, section) 
        DO UPDATE SET data = $2, updated_at = NOW()
      `, [clientId, JSON.stringify({ completed: true, completedAt: new Date().toISOString() })]);

      await db.query('UPDATE clients SET status = $1 WHERE client_id = $2', ['active', clientId]);

      const n8nUrl = process.env.N8N_BASE_URL;
      const n8nApiKey = process.env.N8N_API_KEY;

      let workflowDeploymentResult = { 
        success: false, 
        message: 'Automation system not configured. Contact support to enable workflows.',
        skipped: true 
      };

      if (n8nUrl && n8nApiKey) {
        try {
          const assignedKey = await getClientApiKey(clientId, 'openai');
          
          const dbHost = server?.server_ip || process.env.PGHOST || 'localhost';
          const dbPort = server?.db_port || process.env.PGPORT || '5432';
          const dbName = server?.db_name || `client_${clientId.substring(0, 20)}`;
          const dbUser = server?.db_user || clientId.substring(0, 20);
          const dbPassword = server?.db_password || '';

          const config = {
            businessName: client.business_name || 'Property Manager',
            propertyName: settings.business?.name || client.business_name || 'Property',
            ownerPhone: settings.owner?.phone || client.owner_phone || '',
            ownerEmail: settings.owner?.email || client.owner_email || '',
            ownerTelegram: client.telegram_chat_id || '',
            openaiApiKey: assignedKey?.api_key || process.env.OPENAI_API_KEY || '',
            telegramBotToken: '',
            whatsappApiKey: '',
            dbHost: dbHost,
            dbPort: dbPort,
            dbName: dbName,
            dbUser: dbUser,
            dbPassword: dbPassword,
            subdomain: client.subdomain,
            domain: server?.domain || `${client.subdomain}.prismity.ai`
          };

          const n8nClient = new N8NClient(n8nUrl, n8nApiKey);
          const deployer = new WorkflowDeployer(n8nClient);
          const workflowFiles = await deployer.listAvailableWorkflows();

          const coreWorkflowNames = [
            'Workflow_00_',
            'Workflow_01_',
            'Workflow_02_',
            'Workflow_03_',
            'Workflow_04_'
          ];
          
          const results = [];

          for (let i = 0; i < coreWorkflowNames.length; i++) {
            const workflowNumber = i + 1;
            const prefix = coreWorkflowNames[i];
            const filename = workflowFiles.find(f => f.startsWith(prefix));
            
            if (!filename) {
              logger.warn('Core workflow not found', { prefix, clientId });
              results.push({ number: workflowNumber, success: false, error: `Workflow ${prefix} not found` });
              continue;
            }

            const existingCheck = await db.query(
              'SELECT n8n_workflow_id FROM deployed_workflows WHERE client_id = $1 AND workflow_number = $2',
              [clientId, workflowNumber]
            );
            
            if (existingCheck.rows.length > 0) {
              results.push({ number: workflowNumber, success: true, name: filename, skipped: true });
              continue;
            }
            
            try {
              const result = await deployer.deployWorkflow(filename, config, { 
                activate: true,
                tag: `client_${client.subdomain}` 
              });

              await db.query(`
                INSERT INTO deployed_workflows (client_id, workflow_number, workflow_name, n8n_workflow_id, is_active)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (client_id, workflow_number)
                DO UPDATE SET workflow_name = $3, n8n_workflow_id = $4, is_active = $5, updated_at = NOW()
              `, [clientId, workflowNumber, result.name, result.id, result.active]);

              results.push({ number: workflowNumber, success: true, name: result.name });
            } catch (deployError) {
              logger.error('Failed to deploy workflow', { 
                workflowNum: workflowNumber, 
                filename, 
                clientId,
                error: deployError.message 
              });
              results.push({ number: workflowNumber, success: false, error: deployError.message });
            }
          }

          const successful = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success).length;
          
          workflowDeploymentResult = {
            success: successful > 0,
            message: failed > 0 
              ? `Deployed ${successful} workflows, ${failed} failed. Some features may be limited.`
              : `Successfully deployed ${successful} automation workflows`,
            deployed: successful,
            failed: failed,
            total: coreWorkflowNames.length,
            details: results
          };

          logger.info('Onboarding workflows deployment completed', { clientId, results: workflowDeploymentResult });

        } catch (deploymentError) {
          logger.error('Workflow deployment failed during onboarding', { 
            clientId,
            error: deploymentError.message,
            stack: deploymentError.stack 
          });
          workflowDeploymentResult = { 
            success: false, 
            message: 'Workflow deployment failed: ' + deploymentError.message,
            canRetry: true 
          };
        }
      }

      res.json({
        success: true,
        message: 'Onboarding completed successfully',
        workflowDeployment: workflowDeploymentResult
      });

    } catch (error) {
      logger.error('Failed to complete onboarding', { error: error.message });
      res.status(500).json({ error: 'Failed to complete onboarding' });
    }
  }
);

module.exports = router;

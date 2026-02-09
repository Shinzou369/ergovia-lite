const express = require('express');
const router = express.Router();
const ProvisioningOrchestrator = require('../services/provisioning/orchestrator');
const { validateRequired, validateEmail, validatePhone, sanitizeInput } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

const orchestrator = new ProvisioningOrchestrator();

router.post('/start',
  rateLimiter({ maxRequests: 10, windowMs: 60 * 60 * 1000 }),
  sanitizeInput,
  validateRequired(['businessName', 'ownerName', 'ownerEmail']),
  validateEmail('ownerEmail'),
  async (req, res) => {
    try {
      const clientData = {
        businessName: req.body.businessName,
        ownerName: req.body.ownerName,
        ownerEmail: req.body.ownerEmail,
        ownerPhone: req.body.ownerPhone,
        preferredPlatform: req.body.preferredPlatform || 'telegram',
        telegramChatId: req.body.telegramChatId,
        whatsappNumber: req.body.whatsappNumber,
        telegramBotToken: req.body.telegramBotToken,
        openaiApiKey: req.body.openaiApiKey,
        serverType: req.body.serverType,
        location: req.body.location
      };

      const { jobId, clientId, subdomain } = await orchestrator.createProvisioningJob(clientData);

      clientData.subdomain = subdomain;
      clientData.clientId = clientId;

      orchestrator.runProvisioning(jobId, clientId, clientData)
        .then(result => {
          logger.info('Provisioning completed successfully', { jobId, clientId });
        })
        .catch(error => {
          logger.error('Provisioning failed', { jobId, clientId, error: error.message });
        });

      res.status(202).json({
        success: true,
        message: 'Provisioning started',
        jobId,
        clientId,
        subdomain,
        estimatedTime: '5-10 minutes',
        statusUrl: `/api/onboarding/status/${jobId}`
      });

    } catch (error) {
      logger.error('Failed to start onboarding', { error: error.message });
      res.status(500).json({ error: 'Failed to start onboarding', details: error.message });
    }
  }
);

router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await orchestrator.getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId: status.job_id,
      clientId: status.client_id,
      status: status.status,
      currentStep: status.current_step,
      progressPercent: status.progress_percent,
      message: status.status_message,
      stepsCompleted: status.steps_completed,
      error: status.error_message,
      businessName: status.business_name,
      domain: status.domain,
      serverIp: status.server_ip,
      startedAt: status.started_at,
      completedAt: status.completed_at
    });

  } catch (error) {
    logger.error('Failed to get job status', { error: error.message });
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const info = await orchestrator.getClientInfo(clientId);

    if (!info) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({
      clientId: info.client_id,
      businessName: info.business_name,
      subdomain: info.subdomain,
      status: info.status,
      domain: info.domain,
      serverIp: info.server_ip,
      nocodbUrl: info.nocodb_url,
      createdAt: info.created_at,
      activatedAt: info.activated_at
    });

  } catch (error) {
    logger.error('Failed to get client info', { error: error.message });
    res.status(500).json({ error: 'Failed to get client info' });
  }
});

router.get('/status/:jobId/stream', async (req, res) => {
  const { jobId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendUpdate = async () => {
    const status = await orchestrator.getJobStatus(jobId);
    if (status) {
      res.write(`data: ${JSON.stringify({
        status: status.status,
        step: status.current_step,
        percent: status.progress_percent,
        message: status.status_message
      })}\n\n`);

      if (status.status === 'completed' || status.status === 'failed') {
        res.end();
        return;
      }
    }
  };

  const interval = setInterval(sendUpdate, 2000);
  sendUpdate();

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ─── Callback endpoint for automated deployment script ───
// Called by scripts/deploy-n8n.js when a new n8n server is ready
router.post('/callback',
  async (req, res) => {
    try {
      const provisioningSecret = req.headers['x-provisioning-secret'];

      // Verify the request is from our deployment script
      if (provisioningSecret !== process.env.PROVISIONING_SECRET) {
        logger.warn('Invalid provisioning callback attempt', {
          ip: req.ip
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { clientId, status, serverData } = req.body;

      if (!clientId || !serverData) {
        return res.status(400).json({ error: 'Missing clientId or serverData' });
      }

      logger.info('Received provisioning callback', {
        clientId,
        status,
        n8nUrl: serverData.n8nUrl
      });

      // Save the n8n credentials to the database
      await orchestrator.updateClientServer(clientId, {
        serverId: serverData.serverId,
        serverIp: serverData.serverIp,
        n8nUrl: serverData.n8nUrl,
        n8nApiKey: serverData.n8nApiKey,
        n8nAdminUser: serverData.adminUser,
        n8nAdminPassword: serverData.adminPassword,
        status: status,
      });

      logger.info('Client server credentials saved', { clientId });

      // Optionally trigger workflow deployment now that n8n is ready
      if (status === 'completed' && serverData.n8nApiKey) {
        logger.info('n8n ready with API key, can deploy workflows', { clientId });
        // orchestrator.deployClientWorkflows(clientId) could be called here
      }

      res.json({
        success: true,
        message: 'Callback received and processed',
        clientId
      });

    } catch (error) {
      logger.error('Callback processing failed', { error: error.message });
      res.status(500).json({ error: 'Callback processing failed' });
    }
  }
);

// ─── Manual trigger for deploying n8n to a new server ───
router.post('/deploy-n8n',
  rateLimiter({ maxRequests: 5, windowMs: 60 * 60 * 1000 }),
  sanitizeInput,
  validateRequired(['clientId', 'subdomain']),
  async (req, res) => {
    try {
      const { clientId, subdomain, clientName } = req.body;

      logger.info('Manual n8n deployment requested', { clientId, subdomain });

      // Dynamically import and run the deployment
      const { deployN8NForClient } = require('../../../scripts/deploy-n8n');

      // Run async - don't wait for completion
      deployN8NForClient({ clientId, subdomain, clientName: clientName || subdomain })
        .then(result => {
          logger.info('Manual deployment completed', { clientId, n8nUrl: result.n8nUrl });
        })
        .catch(error => {
          logger.error('Manual deployment failed', { clientId, error: error.message });
        });

      res.status(202).json({
        success: true,
        message: 'Deployment started',
        clientId,
        subdomain,
        estimatedTime: '5-10 minutes',
      });

    } catch (error) {
      logger.error('Failed to start deployment', { error: error.message });
      res.status(500).json({ error: 'Failed to start deployment' });
    }
  }
);

module.exports = router;

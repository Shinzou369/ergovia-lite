require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const n8nService = require('./services/n8n');
const v2Data = require('./services/v2-data');
const auth = require('./services/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Initialize database
db.initDb();

// Seed initial welcome notification if none exist
if (db.getNotifications().length === 0) {
  db.addNotification({
    type: 'system',
    title: 'Welcome to Ergovia Lite',
    message: 'Your AI-powered vacation property management system is ready to configure.',
  });
}

// ============================================
// STATIC FILE SERVING WITH AUTH PROTECTION
// ============================================

// Public files (no auth required)
const PUBLIC_PATHS = ['/login.html', '/favicon.ico', '/api/auth/'];

// Serve login.html without auth
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Protect all other HTML pages — redirect to login if no valid session
app.use((req, res, next) => {
  // Skip API routes (handled by requireAuth middleware per-route)
  if (req.path.startsWith('/api/')) return next();

  // Skip public paths and static assets (css, js, fonts, images)
  if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) return next();
  if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i.test(req.path)) return next();

  // For HTML pages, check if setup is needed (no users yet)
  const userCount = db.getUserCount();
  if (userCount === 0 && req.path !== '/login.html') {
    // First-time setup — let them through to login page which has register
    return res.redirect('/login.html');
  }

  // All other pages served normally — frontend JS handles auth check
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Load n8n config from DB if env vars are missing
n8nService.loadConfigFromDb(db);

// Helper: Get PostgreSQL connection details from environment
function getPostgresConfig() {
  const config = {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT || '5432',
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL || 'disable'
  };

  // Check if required fields are present
  const isConfigured = !!(config.host && config.database && config.user && config.password);
  return { ...config, isConfigured };
}

// ============================================
// ROUTES
// ============================================

// Redirect root to dashboard or onboarding
app.get('/', (req, res) => {
  const userCount = db.getUserCount();
  if (userCount === 0) {
    return res.redirect('/login.html');
  }
  if (db.isOnboardingComplete()) {
    res.redirect('/v2/dashboard.html');
  } else {
    res.redirect('/onboarding.html');
  }
});

// ============================================
// AUTH API
// ============================================

// Register (first user setup or admin creating accounts)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Username, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    // Only allow registration if no users exist (first-time setup)
    // OR if the request comes from an authenticated admin
    const userCount = db.getUserCount();
    if (userCount > 0) {
      // Check for admin auth
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, error: 'Registration closed. Only admins can create new accounts.' });
      }
      const decoded = auth.verifyToken(authHeader.substring(7));
      if (!decoded || decoded.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin access required to create new accounts.' });
      }
    }

    const passwordHash = await auth.hashPassword(password);
    const result = db.createUser(username, email, passwordHash);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const user = db.getUserById(result.userId);
    const token = auth.generateToken(user);
    db.updateLastLogin(user.id);
    db.logActivity('user_registered', `New user: ${username}`);

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    // Find user by username or email
    const user = db.getUserByUsername(username) || db.getUserByEmail(username);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const validPassword = await auth.comparePassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = auth.generateToken(user);
    db.updateLastLogin(user.id);
    db.logActivity('user_login', `User logged in: ${user.username}`);

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify token (check if still valid)
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ success: false, error: 'No token provided' });
  }

  const decoded = auth.verifyToken(authHeader.substring(7));
  if (!decoded) {
    return res.json({ success: false, error: 'Invalid or expired token' });
  }

  const user = db.getUserById(decoded.id);
  if (!user) {
    return res.json({ success: false, error: 'User not found' });
  }

  res.json({
    success: true,
    valid: true,
    user: { id: user.id, username: user.username, email: user.email, role: user.role }
  });
});

// Check if setup is needed (no users yet)
app.get('/api/auth/status', (req, res) => {
  const userCount = db.getUserCount();
  res.json({
    success: true,
    setupRequired: userCount === 0,
    hasUsers: userCount > 0
  });
});

// ============================================
// PROTECT ALL API ROUTES (except auth)
// ============================================
app.use('/api', (req, res, next) => {
  // Skip auth routes
  if (req.path.startsWith('/auth/')) return next();

  // If no users exist yet (first-time setup), allow all API access
  const userCount = db.getUserCount();
  if (userCount === 0) return next();

  // Require auth for everything else
  auth.requireAuth(req, res, next);
});

// ============================================
// CLIENT DATA API
// ============================================

// Get all client data
app.get('/api/client', (req, res) => {
  try {
    const data = db.getAllClientData();
    const isComplete = db.isOnboardingComplete();
    const deploymentStatus = db.getDeploymentStatus();
    res.json({
      success: true,
      data,
      onboardingComplete: isComplete,
      deploymentStatus: deploymentStatus?.status || 'not_deployed'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific section
app.get('/api/client/:section', (req, res) => {
  try {
    const data = db.getClientData(req.params.section);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save client data (single section) - also updates all deployed workflows
app.post('/api/client/:section', async (req, res) => {
  try {
    db.saveClientData(req.params.section, req.body);
    db.logActivity('data_saved', `Section: ${req.params.section}`);

    // Check if workflows are deployed - if so, update them all
    const deployedWorkflows = db.getDeployedWorkflows();
    if (deployedWorkflows.length > 0) {
      const clientData = db.getAllClientData();
      const assignedKey = db.getAssignedApiKey();

      if (assignedKey && n8nService.isConfigured()) {
        console.log(`Updating ${deployedWorkflows.length} workflows with new data...`);
        const updateResult = await n8nService.updateAllWorkflows(
          deployedWorkflows,
          clientData,
          assignedKey.api_key
        );

        if (updateResult.success) {
          db.logActivity('workflows_updated', `Updated ${updateResult.updated} workflows`);
        } else {
          console.error('Some workflows failed to update:', updateResult);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save all client data (from onboarding)
app.post('/api/client', async (req, res) => {
  try {
    // 1. Save to SQLite (local state)
    for (const [section, data] of Object.entries(req.body)) {
      db.saveClientData(section, data);
    }
    db.logActivity('onboarding_completed', 'All sections saved');

    // 2. Bridge to PostgreSQL (so n8n workflows can read contact data)
    const ownerData = req.body.owner;
    const propertyData = req.body.property;

    if (ownerData) {
      try {
        await v2Data.saveOwner(ownerData);
        console.log('[onboarding] Owner saved to PostgreSQL');
      } catch (pgErr) {
        console.error('[onboarding] PostgreSQL saveOwner failed (non-fatal):', pgErr.message);
      }
    }

    if (propertyData) {
      const propertyId = propertyData.propertyId || propertyData.property_id;
      if (propertyId) {
        try {
          await v2Data.savePropertyContacts(propertyId, {
            owner_telegram: (ownerData && ownerData.telegramChatId) || propertyData.ownerTelegram || '',
            owner_phone: (ownerData && ownerData.ownerPhone) || '',
            owner_email: (ownerData && ownerData.ownerEmail) || '',
            owner_name: (ownerData && ownerData.ownerName) || '',
            preferred_platform: (ownerData && ownerData.primaryPlatform) || 'telegram',
          });
          console.log('[onboarding] Property contacts saved to PostgreSQL for', propertyId);
        } catch (pgErr) {
          console.error('[onboarding] PostgreSQL savePropertyContacts failed (non-fatal):', pgErr.message);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset all data (including workflows and credentials in n8n)
app.post('/api/client/reset', async (req, res) => {
  try {
    // Delete workflows from n8n first
    const deployedWorkflows = db.getDeployedWorkflows();
    if (deployedWorkflows.length > 0 && n8nService.isConfigured()) {
      console.log(`Deleting ${deployedWorkflows.length} workflows from n8n...`);
      await n8nService.deleteAllWorkflows(deployedWorkflows);
    }

    // Delete credentials from n8n
    const storedCredentials = db.getClientCredentials();
    if (storedCredentials.length > 0 && n8nService.isConfigured()) {
      console.log(`Deleting ${storedCredentials.length} credentials from n8n...`);
      const credentialIds = {};
      for (const cred of storedCredentials) {
        credentialIds[cred.credential_type] = cred.n8n_credential_id;
      }
      await n8nService.deleteClientCredentials(credentialIds);
    }

    // Release any assigned API key
    const assignedKey = db.getAssignedApiKey();
    if (assignedKey) {
      db.releaseApiKey(assignedKey.id);
    }

    // Reset database (including client_credentials table)
    db.resetClientData();
    db.logActivity('data_reset', 'All client data cleared');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DEPLOYMENT API - Deploy ALL Workflows
// ============================================

// Get deployment status
app.get('/api/deployment', (req, res) => {
  try {
    const status = db.getDeploymentStatus();
    const workflows = db.getDeployedWorkflows();
    const assignedKey = db.getAssignedApiKey();

    res.json({
      success: true,
      status: status?.status || 'not_deployed',
      deployedCount: status?.deployed_count || 0,
      totalCount: status?.total_count || 0,
      hasApiKey: !!assignedKey,
      workflows: workflows.map(w => ({
        name: w.workflow_name,
        triggerTag: w.trigger_tag,
        active: !!w.is_active
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Deploy ALL workflows for client
app.post('/api/deploy', async (req, res) => {
  try {
    console.log('=== DEPLOYMENT STARTED ===');

    // Check if already deployed
    const currentStatus = db.getDeploymentStatus();
    console.log('Current status:', currentStatus?.status);
    if (currentStatus?.status === 'deployed') {
      return res.status(400).json({
        success: false,
        error: 'Workflows already deployed. Reset first to redeploy.'
      });
    }

    // Check onboarding complete
    const onboardingOk = db.isOnboardingComplete();
    console.log('Onboarding complete:', onboardingOk);
    if (!onboardingOk) {
      return res.status(400).json({
        success: false,
        error: 'Please complete onboarding before deploying automations.'
      });
    }

    // Check n8n configured
    const n8nOk = n8nService.isConfigured();
    console.log('n8n configured:', n8nOk);
    console.log('n8n URL:', process.env.N8N_URL || 'NOT SET');
    console.log('n8n API Key:', process.env.N8N_API_KEY ? 'SET' : 'NOT SET');
    if (!n8nOk) {
      return res.status(400).json({
        success: false,
        error: 'n8n not configured. Set N8N_URL and N8N_API_KEY in environment/secrets.'
      });
    }

    // Get an API key from the bank
    let apiKey = db.getAssignedApiKey();
    console.log('Already assigned key:', !!apiKey);
    if (!apiKey) {
      apiKey = db.getAvailableApiKey();
      console.log('Available key from bank:', !!apiKey);
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'No OpenAI API keys in bank. Go to /admin.html to add one first.'
        });
      }

      // Assign the key to this client
      const clientData = db.getAllClientData();
      const clientName = clientData.property?.propertyName || clientData.owner?.ownerName || 'Client';
      db.assignApiKey(apiKey.id, clientName);
      console.log('Assigned key to:', clientName);
    }

    // Get all client data
    const clientData = db.getAllClientData();
    const clientName = clientData.property?.propertyName || clientData.owner?.ownerName || 'Client';
    console.log('Client data sections:', Object.keys(clientData));

    // Update status to deploying
    db.updateDeploymentStatus('deploying', 0, 25, apiKey.api_key);

    // ============================================
    // STEP 1: Create client credentials in n8n
    // ============================================
    console.log('\n--- Creating client credentials in n8n ---');
    console.log('Enabled platforms:', clientData.owner?.enabledPlatforms);
    console.log('Integrations data:', JSON.stringify(clientData.integrations, null, 2));

    // Create platform credentials (Telegram, WhatsApp, Twilio)
    const clientCredentials = await n8nService.createClientCredentials(clientData, clientName);

    // Create OpenAI credential from the assigned API Bank key
    console.log('\n--- Creating OpenAI credential from API Bank ---');
    const openaiResult = await n8nService.createOpenAICredential(apiKey.api_key, clientName);
    if (openaiResult) {
      // Now returns { id, type } object
      clientCredentials.openai = openaiResult.id;
      console.log(`OpenAI credential created: ${openaiResult.id} (type: ${openaiResult.type})`);
    }

    // Create PostgreSQL credential from environment variables (auto-create)
    console.log('\n--- Creating PostgreSQL credential ---');
    const postgresConfig = getPostgresConfig();
    if (postgresConfig.isConfigured) {
      const postgresResult = await n8nService.createPostgresCredential(postgresConfig, clientName);
      if (postgresResult) {
        // Now returns { id, type } object
        clientCredentials.postgres = postgresResult.id;
        console.log(`PostgreSQL credential created: ${postgresResult.id} (type: ${postgresResult.type})`);
      }
    } else {
      console.log('PostgreSQL not configured in environment variables - workflows may fail!');
    }

    // Save all credentials to database for cleanup later
    db.clearClientCredentials();
    for (const [type, credId] of Object.entries(clientCredentials)) {
      if (credId) {
        db.saveClientCredential(type, credId, `${clientName} - ${type}`, clientName);
      }
    }
    if (Object.keys(clientCredentials).length > 0) {
      db.logActivity('credentials_created', `Created ${Object.keys(clientCredentials).length} n8n credentials`);
    }

    // Developer credentials (now auto-created, email still from env)
    const developerCredentials = {
      postgres: clientCredentials.postgres || null,
      openai: clientCredentials.openai || null,
      email: process.env.N8N_EMAIL_CREDENTIAL_ID || null
    };

    console.log('\n--- Credential Summary ---');
    console.log('Client credentials:', clientCredentials);
    console.log('Developer credentials:', developerCredentials);

    // ============================================
    // STEP 2: Deploy all workflows with credentials
    // Uses ordered deployment with ID resolution
    // ============================================
    console.log('\n--- Deploying workflows (ordered with ID resolution) ---');
    const result = await n8nService.deployAllWorkflowsWithIdResolution(clientData, apiKey.api_key, clientCredentials, developerCredentials);
    console.log('Deployment result:', { success: result.success, deployed: result.deployed, failed: result.failed });
    if (result.workflowIdMap) {
      console.log('Workflow ID Map:', result.workflowIdMap);
    }

    if (result.success || result.deployed > 0) {
      // Save deployed workflows to database
      db.clearDeployedWorkflows();
      db.saveDeployedWorkflows(result.workflows);

      // Update status
      db.updateDeploymentStatus('deployed', result.deployed, result.total, apiKey.api_key);
      db.logActivity('deployment_complete', `Deployed ${result.deployed}/${result.total} workflows`);

      console.log('=== DEPLOYMENT COMPLETE ===');
      res.json({
        success: true,
        message: `Successfully deployed ${result.deployed} workflows`,
        deployed: result.deployed,
        failed: result.failed,
        total: result.total,
        credentialsCreated: Object.keys(clientCredentials).length
      });
    } else {
      db.updateDeploymentStatus('failed', 0, result.total, apiKey.api_key);
      console.log('=== DEPLOYMENT FAILED ===');
      console.log('Error:', result.error);
      console.log('Results:', JSON.stringify(result.results, null, 2));

      // Get first error for display
      const firstError = result.results?.find(r => !r.success)?.error || result.error || 'Unknown error';

      res.status(500).json({
        success: false,
        error: `Deployment failed: ${firstError}`,
        deployed: result.deployed || 0,
        failed: result.failed || 0,
        details: result.results
      });
    }
  } catch (error) {
    console.error('=== DEPLOYMENT ERROR ===', error);
    db.updateDeploymentStatus('failed', 0, 0, null);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Undeploy all workflows
app.post('/api/undeploy', async (req, res) => {
  try {
    const deployedWorkflows = db.getDeployedWorkflows();
    const storedCredentials = db.getClientCredentials();

    if (deployedWorkflows.length === 0 && storedCredentials.length === 0) {
      return res.json({ success: true, message: 'No workflows or credentials to undeploy' });
    }

    if (n8nService.isConfigured()) {
      // Delete workflows from n8n
      if (deployedWorkflows.length > 0) {
        console.log(`Undeploying ${deployedWorkflows.length} workflows...`);
        await n8nService.deleteAllWorkflows(deployedWorkflows);
      }

      // Delete credentials from n8n
      if (storedCredentials.length > 0) {
        console.log(`Deleting ${storedCredentials.length} credentials from n8n...`);
        const credentialIds = {};
        for (const cred of storedCredentials) {
          credentialIds[cred.credential_type] = cred.n8n_credential_id;
        }
        await n8nService.deleteClientCredentials(credentialIds);
        db.logActivity('credentials_deleted', `Deleted ${storedCredentials.length} n8n credentials`);
      }
    }

    // Release API key
    const assignedKey = db.getAssignedApiKey();
    if (assignedKey) {
      db.releaseApiKey(assignedKey.id);
    }

    // Clear deployment data
    db.clearDeployedWorkflows();
    db.clearClientCredentials();
    db.updateDeploymentStatus('not_deployed', 0, 0, null);
    db.logActivity('workflows_undeployed', `Removed ${deployedWorkflows.length} workflows`);

    res.json({
      success: true,
      message: `Undeployed ${deployedWorkflows.length} workflows and ${storedCredentials.length} credentials`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CREDENTIAL CREATION (Separate from Deploy)
// ============================================

// Create credentials only (without deploying workflows)
app.post('/api/credentials/create', async (req, res) => {
  try {
    console.log('=== CREDENTIAL CREATION STARTED ===');

    // Check onboarding complete
    const onboardingOk = db.isOnboardingComplete();
    console.log('Onboarding complete:', onboardingOk);
    if (!onboardingOk) {
      return res.status(400).json({
        success: false,
        error: 'Please complete onboarding before creating credentials.'
      });
    }

    // Check n8n configured
    const n8nOk = n8nService.isConfigured();
    console.log('n8n configured:', n8nOk);
    if (!n8nOk) {
      return res.status(400).json({
        success: false,
        error: 'n8n not configured. Set N8N_URL and N8N_API_KEY in environment/secrets.'
      });
    }

    // Get all client data
    const clientData = db.getAllClientData();
    const clientName = clientData.property?.propertyName || clientData.owner?.ownerName || 'Client';

    console.log('\n--- Client Data Summary ---');
    console.log('Client name:', clientName);
    console.log('Enabled platforms:', clientData.owner?.enabledPlatforms);
    console.log('Primary platform:', clientData.owner?.primaryPlatform);
    console.log('Integrations:', JSON.stringify(clientData.integrations, null, 2));

    // Create platform credentials in n8n (Telegram, WhatsApp, Twilio)
    console.log('\n--- Creating platform credentials in n8n ---');
    const clientCredentials = await n8nService.createClientCredentials(clientData, clientName);

    // Track skipped credentials with reasons
    const skippedCredentials = [];

    // Create OpenAI credential from API Bank (if available)
    console.log('\n--- Creating OpenAI credential ---');
    let apiKey = db.getAssignedApiKey();
    if (!apiKey) {
      apiKey = db.getAvailableApiKey();
      if (apiKey) {
        db.assignApiKey(apiKey.id, clientName);
        console.log('Assigned API key from bank to:', clientName);
      }
    }

    if (apiKey) {
      const openaiResult = await n8nService.createOpenAICredential(apiKey.api_key, clientName);
      if (openaiResult) {
        // Now returns { id, type } object
        clientCredentials.openai = openaiResult.id;
        console.log(`OpenAI credential created: ${openaiResult.id} (type: ${openaiResult.type})`);
      } else {
        skippedCredentials.push({ type: 'openai', reason: 'n8n API returned error when creating credential. Check server logs for details.' });
      }
    } else {
      console.log('No OpenAI API key available in bank - skipping');
      skippedCredentials.push({ type: 'openai', reason: 'No API key in bank. Go to /admin.html and add an OpenAI API key first.' });
    }

    // Create PostgreSQL credential from environment variables (auto-create)
    console.log('\n--- Creating PostgreSQL credential ---');
    const postgresConfig = getPostgresConfig();
    console.log('PostgreSQL config check:', {
      host: postgresConfig.host ? 'SET' : 'NOT SET',
      database: postgresConfig.database ? 'SET' : 'NOT SET',
      user: postgresConfig.user ? 'SET' : 'NOT SET',
      password: postgresConfig.password ? 'SET' : 'NOT SET',
      isConfigured: postgresConfig.isConfigured
    });

    if (postgresConfig.isConfigured) {
      const postgresResult = await n8nService.createPostgresCredential(postgresConfig, clientName);
      if (postgresResult) {
        // Now returns { id, type } object
        clientCredentials.postgres = postgresResult.id;
        console.log(`PostgreSQL credential created: ${postgresResult.id} (type: ${postgresResult.type})`);
      } else {
        skippedCredentials.push({ type: 'postgres', reason: 'n8n API returned error when creating credential. Check server logs for details.' });
      }
    } else {
      console.log('PostgreSQL not configured in environment variables - skipping');
      const missing = [];
      if (!postgresConfig.host) missing.push('POSTGRES_HOST');
      if (!postgresConfig.database) missing.push('POSTGRES_DATABASE');
      if (!postgresConfig.user) missing.push('POSTGRES_USER');
      if (!postgresConfig.password) missing.push('POSTGRES_PASSWORD');
      skippedCredentials.push({ type: 'postgres', reason: `Missing environment variables: ${missing.join(', ')}. Check your .env file.` });
    }

    console.log('\n--- Creation Results ---');
    console.log('Credentials created:', JSON.stringify(clientCredentials, null, 2));
    console.log('Skipped credentials:', JSON.stringify(skippedCredentials, null, 2));

    // Save credentials to database for tracking
    db.clearClientCredentials();
    for (const [type, credId] of Object.entries(clientCredentials)) {
      if (credId) {
        db.saveClientCredential(type, credId, `${clientName} - ${type}`, clientName);
      }
    }
    if (Object.keys(clientCredentials).length > 0) {
      db.logActivity('credentials_created', `Created ${Object.keys(clientCredentials).length} n8n credentials`);
    }

    // Get developer credentials status
    const developerCredentials = {
      postgres: clientCredentials.postgres ? 'created' : (postgresConfig.isConfigured ? 'configured' : 'not_set'),
      email: process.env.N8N_EMAIL_CREDENTIAL_ID ? 'configured' : 'not_set'
    };

    console.log('=== CREDENTIAL CREATION COMPLETE ===\n');

    // Build response message
    let message = `Created ${Object.keys(clientCredentials).length} credentials in n8n`;
    if (skippedCredentials.length > 0) {
      message += `. Skipped ${skippedCredentials.length}: ${skippedCredentials.map(s => s.type).join(', ')}`;
    }

    res.json({
      success: true,
      message,
      clientCredentials: Object.keys(clientCredentials).map(type => ({
        type,
        credentialId: clientCredentials[type],
        status: 'created'
      })),
      skippedCredentials,
      developerCredentials,
      summary: {
        telegramCreated: !!clientCredentials.telegram,
        whatsappCreated: !!clientCredentials.whatsapp,
        twilioCreated: !!clientCredentials.twilio,
        openaiCreated: !!clientCredentials.openai,
        postgresCreated: !!clientCredentials.postgres,
        emailConfigured: !!process.env.N8N_EMAIL_CREDENTIAL_ID
      }
    });
  } catch (error) {
    console.error('=== CREDENTIAL CREATION ERROR ===', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current credentials status
app.get('/api/credentials/status', (req, res) => {
  try {
    const clientData = db.getAllClientData();
    const storedCredentials = db.getClientCredentials();
    const enabledPlatforms = clientData.owner?.enabledPlatforms || [];
    const integrations = clientData.integrations || {};
    const assignedKey = db.getAssignedApiKey();
    const availableKeys = db.getAllApiKeys().filter(k => !k.assigned_to_client);
    const postgresConfig = getPostgresConfig();

    // Check if PostgreSQL credential was created
    const postgresCredential = storedCredentials.find(c => c.credential_type === 'postgres');

    res.json({
      success: true,
      enabledPlatforms,
      storedCredentials: storedCredentials.map(c => ({
        type: c.credential_type,
        credentialId: c.n8n_credential_id,
        name: c.credential_name,
        createdAt: c.created_at
      })),
      integrationStatus: {
        telegram: {
          enabled: enabledPlatforms.includes('telegram'),
          hasToken: !!integrations.telegramBotToken
        },
        whatsapp: {
          enabled: enabledPlatforms.includes('whatsapp'),
          hasToken: !!integrations.whatsappAccessToken
        },
        twilio: {
          enabled: enabledPlatforms.includes('sms'),
          hasCredentials: !!(integrations.twilioAccountSid && integrations.twilioAuthToken)
        },
        openai: {
          hasAssignedKey: !!assignedKey,
          availableInBank: availableKeys.length > 0
        },
        postgres: {
          isConfigured: postgresConfig.isConfigured,
          isCreated: !!postgresCredential,
          host: postgresConfig.host ? `${postgresConfig.host.substring(0, 20)}...` : null
        }
      },
      developerCredentials: {
        postgres: postgresConfig.isConfigured,
        postgresCreated: !!postgresCredential,
        email: !!process.env.N8N_EMAIL_CREDENTIAL_ID
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// API BANK MANAGEMENT (Admin/Developer Use)
// ============================================

// Get all API keys status (masked)
app.get('/api/admin/apibank', (req, res) => {
  try {
    const keys = db.getAllApiKeys();
    res.json({
      success: true,
      keys: keys.map(k => ({
        id: k.id,
        keyPreview: `sk-...${k.api_key ? k.api_key.slice(-4) : '****'}`,
        assigned: !!k.assigned_to_client,
        clientName: k.client_name || null,
        assignedAt: k.assigned_at || null,
        createdAt: k.created_at
      })),
      available: keys.filter(k => !k.assigned_to_client).length,
      total: keys.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new API key to bank
app.post('/api/admin/apibank', (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.status(400).json({ success: false, error: 'Invalid API key format' });
    }

    const added = db.addApiKey(apiKey);
    if (added) {
      db.logActivity('apikey_added', 'New OpenAI API key added to bank');
      res.json({ success: true, message: 'API key added to bank' });
    } else {
      res.status(400).json({ success: false, error: 'API key already exists' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a specific API key from bank (POST for proxy compatibility)
app.post('/api/admin/apibank/delete/:id', (req, res) => {
  try {
    const result = db.deleteApiKey(parseInt(req.params.id));
    if (result.success) {
      db.logActivity('apikey_deleted', `API key #${req.params.id} removed from bank`);
      res.json({ success: true, message: 'API key deleted' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete ALL API keys from bank (POST for proxy compatibility)
app.post('/api/admin/apibank/deleteall', (req, res) => {
  try {
    const result = db.deleteAllApiKeys();
    db.logActivity('apikey_bank_cleared', 'All API keys removed from bank');
    res.json({ success: true, message: 'All API keys deleted', ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// AUTOMATION SERVICES STATUS
// (Client-friendly view - no n8n details)
// ============================================

// Get services status for client dashboard
app.get('/api/services/status', (req, res) => {
  try {
    const deployment = db.getDeploymentStatus();
    const workflows = db.getDeployedWorkflows();

    // Group by trigger type for client-friendly display
    const serviceGroups = {
      'Guest Communication': workflows.filter(w =>
        w.trigger_tag === 'Message-Trigger' || w.workflow_name?.includes('Guest')
      ).length,
      'Booking Management': workflows.filter(w =>
        w.workflow_name?.includes('Booking') || w.workflow_name?.includes('Availability')
      ).length,
      'Property Operations': workflows.filter(w =>
        w.workflow_name?.includes('Cleaning') || w.workflow_name?.includes('Maintenance') || w.workflow_name?.includes('Inventory')
      ).length,
      'Monitoring & Reports': workflows.filter(w =>
        w.workflow_name?.includes('Summary') || w.workflow_name?.includes('Analytics') || w.workflow_name?.includes('Monitor')
      ).length
    };

    res.json({
      success: true,
      deployed: deployment?.status === 'deployed',
      activeCount: workflows.filter(w => w.is_active).length,
      totalCount: workflows.length,
      serviceGroups
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ACTIVITY LOG API
// ============================================

app.get('/api/activity', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const activity = db.getRecentActivity(limit);
    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SYSTEM STATUS API
// ============================================

app.get('/api/status', async (req, res) => {
  try {
    const onboardingComplete = db.isOnboardingComplete();
    const deployment = db.getDeploymentStatus();
    const workflows = db.getDeployedWorkflows();
    const assignedKey = db.getAssignedApiKey();

    // Test n8n connection (don't expose details to client)
    let automationStatus = 'configured';
    if (!n8nService.isConfigured()) {
      automationStatus = 'not_configured';
    } else {
      const test = await n8nService.testConnection();
      automationStatus = test.success ? 'connected' : 'error';
    }

    res.json({
      success: true,
      status: {
        onboardingComplete,
        deploymentStatus: deployment?.status || 'not_deployed',
        activeWorkflows: workflows.filter(w => w.is_active).length,
        totalWorkflows: workflows.length,
        hasApiKey: !!assignedKey,
        automationStatus // 'configured', 'not_configured', 'connected', 'error'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// N8N TEST ENDPOINT (for troubleshooting)
// ============================================

app.get('/api/test-n8n', async (req, res) => {
  try {
    console.log('\n=== Testing n8n connection ===');
    console.log('URL:', process.env.N8N_URL || 'NOT SET');
    console.log('API Key:', process.env.N8N_API_KEY ? 'SET' : 'NOT SET');

    if (!n8nService.isConfigured()) {
      return res.json({
        success: false,
        error: 'n8n not configured',
        config: {
          url: process.env.N8N_URL || 'NOT SET',
          apiKey: process.env.N8N_API_KEY ? 'SET' : 'NOT SET'
        }
      });
    }

    const result = await n8nService.testConnection();
    console.log('Test result:', result);

    res.json({
      success: result.success,
      error: result.error,
      workflowCount: result.workflowCount,
      config: {
        url: process.env.N8N_URL,
        apiKey: 'SET (hidden)'
      }
    });
  } catch (error) {
    console.error('n8n test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List available credential types in n8n (for debugging)
app.get('/api/test-n8n/credential-types', async (req, res) => {
  try {
    console.log('\n=== Listing n8n credential types ===');

    if (!n8nService.isConfigured()) {
      return res.json({
        success: false,
        error: 'n8n not configured'
      });
    }

    const result = await n8nService.listCredentialTypes();
    console.log('Result:', result);

    res.json(result);
  } catch (error) {
    console.error('Error listing credential types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test creating a single credential type (for debugging)
app.post('/api/test-n8n/test-credential', async (req, res) => {
  try {
    const { type, name, data } = req.body;

    if (!type || !name || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, name, data'
      });
    }

    console.log('\n=== Testing credential creation ===');
    console.log('Type:', type);
    console.log('Name:', name);
    console.log('Data keys:', Object.keys(data));

    if (!n8nService.isConfigured()) {
      return res.json({
        success: false,
        error: 'n8n not configured'
      });
    }

    const result = await n8nService.createCredential(type, name, data);
    console.log('Result:', result);

    // If successful, immediately delete it (this is just a test)
    if (result.success && result.credentialId) {
      console.log('Deleting test credential:', result.credentialId);
      await n8nService.deleteCredential(result.credentialId);
      result.deletedAfterTest = true;
    }

    res.json(result);
  } catch (error) {
    console.error('Error testing credential:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DEBUG ENDPOINT (for troubleshooting)
// ============================================

app.get('/api/debug', (req, res) => {
  try {
    const onboardingComplete = db.isOnboardingComplete();
    const deployment = db.getDeploymentStatus();
    const assignedKey = db.getAssignedApiKey();
    const availableKeys = db.getAllApiKeys();

    res.json({
      success: true,
      debug: {
        // Environment
        n8nUrl: process.env.N8N_URL ? `${process.env.N8N_URL.substring(0, 30)}...` : 'NOT SET',
        n8nApiKey: process.env.N8N_API_KEY ? 'SET (hidden)' : 'NOT SET',
        n8nConfigured: n8nService.isConfigured(),

        // Onboarding
        onboardingComplete,

        // Deployment
        deploymentStatus: deployment?.status || 'not_deployed',

        // API Bank
        totalKeysInBank: availableKeys.length,
        availableKeys: availableKeys.filter(k => !k.assigned_to_client).length,
        hasAssignedKey: !!assignedKey,

        // Checklist
        canDeploy: {
          onboardingOk: onboardingComplete,
          n8nConfigured: n8nService.isConfigured(),
          hasApiKey: availableKeys.length > 0 || !!assignedKey,
          notAlreadyDeployed: deployment?.status !== 'deployed'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DEVELOPER CONFIG STATUS
// ============================================

app.get('/api/admin/config', (req, res) => {
  try {
    const postgresConfig = getPostgresConfig();

    res.json({
      success: true,
      config: {
        N8N_URL: {
          set: !!process.env.N8N_URL,
          description: 'n8n instance URL',
          required: true
        },
        N8N_API_KEY: {
          set: !!process.env.N8N_API_KEY,
          description: 'n8n API key',
          required: true
        },
        POSTGRES_HOST: {
          set: !!process.env.POSTGRES_HOST,
          description: 'PostgreSQL host (auto-creates credential in n8n)',
          required: true
        },
        POSTGRES_DATABASE: {
          set: !!process.env.POSTGRES_DATABASE,
          description: 'PostgreSQL database name',
          required: true
        },
        POSTGRES_USER: {
          set: !!process.env.POSTGRES_USER,
          description: 'PostgreSQL username',
          required: true
        },
        POSTGRES_PASSWORD: {
          set: !!process.env.POSTGRES_PASSWORD,
          description: 'PostgreSQL password',
          required: true
        },
        POSTGRES_CONFIGURED: {
          set: postgresConfig.isConfigured,
          description: 'All PostgreSQL settings configured',
          required: true
        },
        N8N_EMAIL_CREDENTIAL_ID: {
          set: !!process.env.N8N_EMAIL_CREDENTIAL_ID,
          description: 'Email SMTP credential ID in n8n (optional)',
          required: false
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// V2 API - PREMIUM DASHBOARD
// ============================================

// v2Data already required at top of file

// Dashboard data (all-in-one endpoint)
app.get('/api/v2/dashboard', async (req, res) => {
  try {
    const data = await v2Data.getDashboardData();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stats only
app.get('/api/v2/stats', async (req, res) => {
  try {
    const stats = await v2Data.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Settings - GET all or specific section
app.get('/api/v2/settings', async (req, res) => {
  try {
    const section = req.query.section || null;
    const data = await v2Data.getSettings(section);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Settings - POST save section
app.post('/api/v2/settings', async (req, res) => {
  try {
    const { section, data } = req.body;
    if (!section) {
      return res.status(400).json({ success: false, error: 'Section is required' });
    }
    const result = await v2Data.saveSettings(section, data);

    // Determine if this change needs a workflow sync
    const syncSections = { credentials: 'credentials', ai: 'system-prompt', owner: 'workflows' };
    const needsSync = !!syncSections[section];
    const syncCategory = syncSections[section] || null;

    res.json({ ...result, needsSync, syncCategory });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Activate (trigger deployment)
app.post('/api/v2/activate', async (req, res) => {
  try {
    const result = await v2Data.activate(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Properties - GET all
app.get('/api/v2/properties', async (req, res) => {
  try {
    const properties = await v2Data.getProperties();
    res.json({ success: true, properties });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Properties - GET single
app.get('/api/v2/properties/:id', async (req, res) => {
  try {
    const property = await v2Data.getProperty(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }
    res.json({ success: true, property });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Properties - POST create/update
app.post('/api/v2/properties', async (req, res) => {
  try {
    const isUpdate = !!req.body.id;
    const result = await v2Data.saveProperty(req.body);
    // Flag that workflows need sync when editing an existing property
    if (isUpdate && result.success) {
      result.needsSync = true;
      result.syncCategory = 'workflows';
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Properties - DELETE
app.delete('/api/v2/properties/:id', async (req, res) => {
  try {
    const result = await v2Data.deleteProperty(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bookings - GET
app.get('/api/v2/bookings', async (req, res) => {
  try {
    const { propertyId, startDate, endDate } = req.query;
    const bookings = await v2Data.getBookings(propertyId, startDate, endDate);
    res.json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bookings - POST (create new booking)
app.post('/api/v2/bookings', async (req, res) => {
  try {
    const result = await v2Data.createBooking(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bookings - PUT (update existing booking)
app.put('/api/v2/bookings/:id', async (req, res) => {
  try {
    const result = await v2Data.updateBooking(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bookings - DELETE (cancel booking)
app.delete('/api/v2/bookings/:id', async (req, res) => {
  try {
    const result = await v2Data.cancelBooking(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tasks - GET
app.get('/api/v2/tasks', async (req, res) => {
  try {
    const status = req.query.status || null;
    const tasks = await v2Data.getTasks(status);
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tasks - Complete
app.post('/api/v2/tasks/complete', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) {
      return res.status(400).json({ success: false, error: 'Task ID is required' });
    }
    const result = await v2Data.completeTask(taskId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifications - GET (now SQLite-backed)
app.get('/api/v2/notifications', (req, res) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const rows = db.getNotifications(unreadOnly);
    const notifications = rows.map(n => ({
      id: n.notification_id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: !!n.read,
      actionLink: n.action_link,
      createdAt: n.created_at,
    }));
    const unreadCount = db.getUnreadNotificationCount();
    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifications - Mark read (now SQLite-backed)
app.post('/api/v2/notifications/read', (req, res) => {
  try {
    const { notificationId, markAll } = req.body;
    if (markAll) {
      db.markAllNotificationsRead();
      res.json({ success: true });
    } else if (notificationId) {
      const found = db.markNotificationRead(notificationId);
      res.json({ success: found, error: found ? undefined : 'Notification not found' });
    } else {
      return res.status(400).json({ success: false, error: 'Notification ID or markAll flag required' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset to demo data (for testing)
app.post('/api/v2/reset-demo', async (req, res) => {
  try {
    const result = await v2Data.resetToDemo();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Seed demo data (properties + bookings)
app.post('/api/v2/seed', async (req, res) => {
  try {
    const result = await v2Data.seedDemoData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WORKFLOW SYNC ROUTES
// ============================================

// Sync all workflow variables to live n8n
app.post('/api/v2/sync/workflows', async (req, res) => {
  try {
    if (!n8nService.isConfigured()) {
      return res.status(400).json({ success: false, error: 'n8n not configured' });
    }

    const deployedWorkflows = db.getDeployedWorkflows();
    if (deployedWorkflows.length === 0) {
      return res.status(400).json({ success: false, error: 'No deployed workflows found' });
    }

    // Gather current client data from all sources
    const clientData = db.getAllClientData();
    const assignedKey = db.getAssignedApiKey();
    const apiKey = assignedKey ? assignedKey.api_key : '';

    const result = await n8nService.syncAllWorkflowVariables(clientData, apiKey, deployedWorkflows);

    // Log the sync
    const updatedNames = result.results.filter(r => r.success).map(r => r.workflow);
    db.logSync('full', result.success ? 'success' : 'partial', updatedNames,
      result.success ? null : result.results.filter(r => !r.success).map(r => `${r.workflow}: ${r.error}`).join('; ')
    );
    db.logActivity('sync_workflows', `Synced ${result.synced}/${result.total} workflows`);

    res.json(result);
  } catch (error) {
    db.logSync('full', 'failed', [], error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync just the AI system prompt in WF1
app.post('/api/v2/sync/system-prompt', async (req, res) => {
  try {
    const { systemPrompt, pricingRules } = req.body;
    if (!systemPrompt) {
      return res.status(400).json({ success: false, error: 'systemPrompt is required' });
    }

    // Find WF1 in deployed workflows
    const deployedWorkflows = db.getDeployedWorkflows();
    const wf1 = deployedWorkflows.find(w => w.workflow_name.includes('AI Gateway') || w.filename.includes('WF1'));
    if (!wf1) {
      return res.status(400).json({ success: false, error: 'WF1 AI Gateway not found in deployed workflows' });
    }

    // Build the full system prompt with date prefix
    let fullPrompt = systemPrompt;

    // Append pricing rules if provided
    if (pricingRules) {
      fullPrompt += `\n\n## Custom Pricing Rules\n${pricingRules}`;
    }

    // Patch the AI Agent node in WF1
    const result = await n8nService.patchWorkflowNodes(wf1.workflow_id, [
      { nodeId: 'ai-agent', path: 'parameters.options.systemMessage', value: fullPrompt }
    ]);

    // Save the prompt locally for future reference
    db.saveClientData('systemPrompt', { systemPrompt, pricingRules, lastSynced: new Date().toISOString() });
    db.logSync('system-prompt', result.success ? 'success' : 'failed', ['WF1: AI Gateway'], result.error || null);
    db.logActivity('sync_system_prompt', 'Updated AI system prompt');

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a specific n8n credential and sync across workflows
app.post('/api/v2/sync/credentials', async (req, res) => {
  try {
    const { type, data } = req.body;
    if (!type || !data) {
      return res.status(400).json({ success: false, error: 'type and data are required' });
    }

    // Map credential types to n8n types and data format
    const credMap = {
      telegram: { n8nType: 'telegramApi', format: (d) => ({ accessToken: d.botToken || d.accessToken }) },
      openai: { n8nType: 'openAiApi', format: (d) => ({ apiKey: d.apiKey, header: false }) },
      twilio: { n8nType: 'twilioApi', format: (d) => ({ accountSid: d.accountSid, authToken: d.authToken }) },
    };

    const mapping = credMap[type];
    if (!mapping) {
      return res.status(400).json({ success: false, error: `Unknown credential type: ${type}. Supported: ${Object.keys(credMap).join(', ')}` });
    }

    // Get old credential ID from SQLite
    const existingCred = db.getClientCredentialsByType(type);
    const oldCredId = existingCred ? existingCred.n8n_credential_id : null;

    // Replace credential in n8n
    const replaceResult = await n8nService.replaceCredential(
      oldCredId,
      mapping.n8nType,
      `${type.charAt(0).toUpperCase() + type.slice(1)} - Client`,
      mapping.format(data)
    );

    if (!replaceResult.success) {
      return res.status(500).json(replaceResult);
    }

    // Update SQLite with new credential ID
    if (existingCred) {
      const dbInst = require('better-sqlite3')(path.join(__dirname, 'data.db'));
      dbInst.prepare('UPDATE client_credentials SET n8n_credential_id = ? WHERE credential_type = ?')
        .run(replaceResult.newCredentialId, type);
      dbInst.close();
    } else {
      db.saveClientCredential(type, replaceResult.newCredentialId, replaceResult.name, 'Client');
    }

    // Sync new credential ID across all deployed workflows
    const deployedWorkflows = db.getDeployedWorkflows();
    if (oldCredId && deployedWorkflows.length > 0) {
      await n8nService.syncCredentialAcrossWorkflows(oldCredId, replaceResult.newCredentialId, type, deployedWorkflows);
    }

    db.logSync('credentials', 'success', [`${type} credential`], null);
    db.logActivity('sync_credential', `Updated ${type} credential in n8n`);

    res.json({ success: true, credentialId: replaceResult.newCredentialId, type });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get sync status
app.get('/api/v2/sync/status', async (req, res) => {
  try {
    const lastSync = db.getLastSync();
    const recentSyncs = db.getRecentSyncs(5);
    const deployedWorkflows = db.getDeployedWorkflows();
    const savedPrompt = db.getClientData('systemPrompt');
    const n8nConfig = db.getClientData('n8n_config');

    res.json({
      success: true,
      lastSync: lastSync ? {
        type: lastSync.sync_type,
        at: lastSync.synced_at,
        workflows: JSON.parse(lastSync.workflows_updated || '[]')
      } : null,
      recentSyncs: recentSyncs.map(s => ({
        type: s.sync_type,
        status: s.status,
        at: s.synced_at,
        error: s.error_details
      })),
      deployedCount: deployedWorkflows.length,
      systemPrompt: savedPrompt || null,
      n8nConfigured: n8nService.isConfigured(),
      n8nUrl: n8nService.baseUrl || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Connect to n8n instance (saves config to DB, tests connection, auto-imports workflows)
app.post('/api/v2/n8n/connect', async (req, res) => {
  try {
    const { n8nUrl, apiKey } = req.body;
    if (!n8nUrl || !apiKey) {
      return res.status(400).json({ success: false, error: 'n8n URL and API Key are required' });
    }

    // Configure the n8n service with the provided credentials
    n8nService.configure(n8nUrl, apiKey);

    // Test connection
    const test = await n8nService.testConnection();
    if (!test.success) {
      return res.status(400).json({ success: false, error: test.error || 'Connection failed' });
    }

    // Save config to database for persistence across restarts
    db.saveClientData('n8n_config', { url: n8nUrl, apiKey: apiKey });

    // Auto-import active workflows
    const listResult = await n8nService.listWorkflows();
    let importedCount = 0;

    // Strip [V4], [M1], [v2] etc. tag prefixes from workflow names
    const stripTag = (name) => name.replace(/^\[.*?\]\s*/, '');

    if (listResult.success) {
      const validPrefixes = ['SUB:', 'WF1:', 'WF2:', 'WF3:', 'WF4:', 'WF5:', 'WF6:', 'WF7:', 'WF8:'];
      const ergoviaWorkflows = (listResult.workflows || []).filter(wf => {
        const cleanName = stripTag(wf.name);
        return validPrefixes.some(p => cleanName.startsWith(p));
      });

      if (ergoviaWorkflows.length > 0) {
        const filenameMap = {
          'SUB: Universal Messenger': 'SUB_Universal_Messenger.json',
          'SUB: Owner & Staff Notifier': 'SUB_Owner_Staff_Notifier.json',
          'WF1: AI Gateway - Unified Entry Point': 'WF1_AI_Gateway.json',
          'WF2: Offer Conflict Manager': 'WF2_Offer_Conflict_Manager.json',
          'WF3: Calendar Manager': 'WF3_Calendar_Manager.json',
          'WF4: Payment Processor': 'WF4_Payment_Processor.json',
          'WF5: Property Operations': 'WF5_Property_Operations.json',
          'WF6: Daily Automations': 'WF6_Daily_Automations.json',
          'WF7: Integration Hub': 'WF7_Integration_Hub.json',
          'WF8: Safety & Screening': 'WF8_Safety_Screening.json',
        };
        const workflowEntries = ergoviaWorkflows.map(wf => {
          const cleanName = stripTag(wf.name);
          return {
            filename: filenameMap[cleanName] || `${cleanName.replace(/[^a-zA-Z0-9]/g, '_')}.json`,
            workflowId: wf.id,
            name: cleanName,
            triggerTag: cleanName.startsWith('SUB') ? 'Sub-Workflow' : 'Imported',
            active: wf.active
          };
        });
        db.clearDeployedWorkflows();
        db.saveDeployedWorkflows(workflowEntries);
        importedCount = workflowEntries.length;
      }
    }

    res.json({
      success: true,
      message: `Connected! Found ${importedCount} workflows.`,
      workflows: importedCount,
      n8nUrl: n8nService.baseUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import live workflows from n8n into the control panel database
// This registers existing active workflows so sync features can manage them
app.post('/api/v2/sync/import', async (req, res) => {
  try {
    if (!n8nService.isConfigured()) {
      return res.status(400).json({ success: false, error: 'n8n not configured' });
    }

    // Fetch all workflows from n8n
    const response = await n8nService.listWorkflows();
    if (!response.success) {
      return res.status(500).json({ success: false, error: response.error || 'Failed to list workflows' });
    }

    // Strip [V4], [M1], [v2] etc. tag prefixes from workflow names
    const stripTag = (name) => name.replace(/^\[.*?\]\s*/, '');

    // Filter to Ergovia workflows matching our naming convention (active or inactive)
    const validPrefixes = ['SUB:', 'WF1:', 'WF2:', 'WF3:', 'WF4:', 'WF5:', 'WF6:', 'WF7:', 'WF8:'];
    const ergoviaWorkflows = (response.workflows || []).filter(wf => {
      const cleanName = stripTag(wf.name);
      return validPrefixes.some(p => cleanName.startsWith(p));
    });

    if (ergoviaWorkflows.length === 0) {
      return res.json({ success: false, error: 'No Ergovia workflows found on n8n' });
    }

    // Map to filename convention
    const filenameMap = {
      'SUB: Universal Messenger': 'SUB_Universal_Messenger.json',
      'SUB: Owner & Staff Notifier': 'SUB_Owner_Staff_Notifier.json',
      'WF1: AI Gateway - Unified Entry Point': 'WF1_AI_Gateway.json',
      'WF2: Offer Conflict Manager': 'WF2_Offer_Conflict_Manager.json',
      'WF3: Calendar Manager': 'WF3_Calendar_Manager.json',
      'WF4: Payment Processor': 'WF4_Payment_Processor.json',
      'WF5: Property Operations': 'WF5_Property_Operations.json',
      'WF6: Daily Automations': 'WF6_Daily_Automations.json',
      'WF7: Integration Hub': 'WF7_Integration_Hub.json',
      'WF8: Safety & Screening': 'WF8_Safety_Screening.json',
    };

    // Build workflow entries for database (use clean names without tag prefix)
    const workflowEntries = ergoviaWorkflows.map(wf => {
      const cleanName = stripTag(wf.name);
      return {
        filename: filenameMap[cleanName] || `${cleanName.replace(/[^a-zA-Z0-9]/g, '_')}.json`,
        workflowId: wf.id,
        name: cleanName,
        triggerTag: cleanName.startsWith('SUB') ? 'Sub-Workflow' : 'Imported',
        active: wf.active
      };
    });

    // Clear existing and save new
    db.clearDeployedWorkflows();
    db.saveDeployedWorkflows(workflowEntries);

    db.logActivity('workflows_imported', `Imported ${workflowEntries.length} live workflows from n8n`);

    res.json({
      success: true,
      imported: workflowEntries.length,
      workflows: workflowEntries.map(w => ({ name: w.name, id: w.workflowId }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 404 HANDLER (Return JSON not HTML)
// ============================================

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: `API endpoint not found: ${req.originalUrl}` });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== Ergovia Lite Server Started ===`);
  console.log(`Port: ${PORT}`);
  console.log(`n8n URL: ${process.env.N8N_URL || 'NOT SET'}`);
  console.log(`n8n API Key: ${process.env.N8N_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`n8n configured: ${n8nService.isConfigured()}`);
  console.log(`===================================\n`);
});

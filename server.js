require('dotenv').config();
const express = require("express");
const path = require("path");
const OpenAI = require('openai');
const session = require("express-session");
const FileStore = require('session-file-store')(session);
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// ========================================
// ETF Integration - N8N Configuration
// ========================================
let N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n-app-gvq5.onrender.com';

// Ensure URL has proper protocol
if (N8N_BASE_URL && !N8N_BASE_URL.startsWith('http://') && !N8N_BASE_URL.startsWith('https://')) {
  N8N_BASE_URL = 'https://' + N8N_BASE_URL;
}

const N8N_API_KEY = process.env.N8N_API_KEY || '';

// N8N API Helper Class
class N8NApiClient {
  constructor(config) {
    this.baseURL = config.baseURL;
    this.auth = config.auth || {};

    // Validate base URL
    if (!this.baseURL || this.baseURL === '') {
      throw new Error('N8N_BASE_URL is not configured');
    }

    try {
      new URL(this.baseURL);
    } catch (urlError) {
      throw new Error(`Invalid N8N_BASE_URL: ${this.baseURL}`);
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const fullUrl = `${this.baseURL}/api/v1${endpoint}`;
      console.log(`Making N8N API request: ${method} ${fullUrl}`);

      const config = {
        method,
        url: fullUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': N8N_API_KEY
        },
        timeout: 10000
      };

      if (data) config.data = data;
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('N8N API Error Details:', {
        url: `${this.baseURL}/api/v1${endpoint}`,
        method,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error(`N8N API Error: ${error.response?.status || error.message}`);
    }
  }

  async getWorkflows() { return await this.makeRequest('GET', '/workflows'); }
  async getWorkflow(id) { return await this.makeRequest('GET', `/workflows/${id}`); }
  async createWorkflow(workflowData) { return await this.makeRequest('POST', '/workflows', workflowData); }
  async activateWorkflow(id) { return await this.makeRequest('POST', `/workflows/${id}/activate`); }

  // Create or get tag first, then update workflow with tags
  async createTag(tagName) {
    try {
      // First check if tag already exists
      const tagsResponse = await this.makeRequest('GET', '/tags');
      const tags = Array.isArray(tagsResponse) ? tagsResponse : (tagsResponse.data || []);
      const existingTag = tags.find(tag => tag.name === tagName);

      if (existingTag) {
        console.log(`✅ Tag "${tagName}" already exists`);
        return existingTag;
      }

      // Tag doesn't exist, create it
      console.log(`🔄 Creating new tag: "${tagName}"`);
      return await this.makeRequest('POST', '/tags', { name: tagName });
    } catch (error) {
      console.error(`❌ Error with tag "${tagName}":`, error.message);
      throw error;
    }
  }

  async updateWorkflowTags(workflowId, tags) {
    // N8N API requires array of tag objects: [{"id": "tagId1"}, {"id": "tagId2"}]
    // First, we need to get the actual tag objects from N8N
    const tagObjects = [];

    for (const tag of Array.isArray(tags) ? tags : []) {
      let tagName;
      if (typeof tag === 'string') {
        tagName = tag;
      } else if (typeof tag === 'object' && tag.name) {
        tagName = tag.name;
      } else {
        tagName = String(tag);
      }

      // Get the tag with its ID from N8N
      try {
        const tagsResponse = await this.makeRequest('GET', '/tags');
        const allTags = Array.isArray(tagsResponse) ? tagsResponse : (tagsResponse.data || []);
        const existingTag = allTags.find(t => t.name === tagName);

        if (existingTag && existingTag.id) {
          tagObjects.push({ id: existingTag.id });
          console.log(`✅ Found tag "${tagName}" with ID: ${existingTag.id}`);
        } else {
          console.warn(`⚠️ Tag "${tagName}" not found or missing ID`);
        }
      } catch (error) {
        console.error(`❌ Error getting tag "${tagName}":`, error.message);
      }
    }

    console.log(`🏷️ Applying tag objects to workflow ${workflowId}:`, tagObjects);
    // Send tag objects as array of objects with id property
    return await this.makeRequest('PUT', `/workflows/${workflowId}/tags`, tagObjects);
  }

  // Helper method to check if workflow can be activated
  async canActivateWorkflow(workflowId) {
    try {
      const workflow = await this.getWorkflow(workflowId);
      const nodes = workflow.nodes || [];

      // Check for trigger, poller, or webhook nodes
      const hasTriggerNode = nodes.some(node => {
        const nodeType = node.type?.toLowerCase() || '';
        return (
          nodeType.includes('trigger') ||
          nodeType.includes('webhook') ||
          nodeType.includes('poller') ||
          nodeType.includes('manual') ||
          nodeType.includes('cron') ||
          nodeType.includes('interval')
        );
      });

      return hasTriggerNode;
    } catch (error) {
      console.warn(`⚠️ Could not check activation eligibility for workflow ${workflowId}`);
      return false;
    }
  }
}

// Validate N8N configuration and exit if critical vars missing
if (!N8N_BASE_URL) {
  console.error('❌ N8N_BASE_URL environment variable is not set');
  console.error('ETF functionality will be disabled');
}
if (!N8N_API_KEY) {
  console.error('❌ N8N_API_KEY environment variable is not set');
  console.error('ETF functionality will be disabled');
}

const n8nClient = new N8NApiClient({ baseURL: N8N_BASE_URL });

const app = express();

// Initialize SQLite database
const db = new sqlite3.Database('./taskforce.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

// ========================================
// ETF Database Setup
// ========================================
function initETFDatabase() {
  const etfDB = new sqlite3.Database('etf_data.db');

  // Clients table
  etfDB.run(`
    CREATE TABLE IF NOT EXISTS etf_clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      industry TEXT,
      taskforce_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Deployments table
  etfDB.run(`
    CREATE TABLE IF NOT EXISTS etf_deployments (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      n8n_workflow_id TEXT,
      workflow_name TEXT,
      taskforce_type TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      config_data TEXT,
      deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES etf_clients(id)
    )
  `);

  // Client credentials table
  etfDB.run(`
    CREATE TABLE IF NOT EXISTS etf_client_credentials (
      client_id TEXT PRIMARY KEY,
      credentials_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES etf_clients(id)
    )
  `);

  console.log('ETF Database initialized');
  return etfDB;
}

const etfDB = initETFDatabase();

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_ID', 
  'GOOGLE_CLIENT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file or environment configuration');
}

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Passport configuration
passport.serializeUser((user, done) => {
  done(null, user);
});


// Daily subscription check to handle expired subscriptions
function checkExpiredSubscriptions() {
  const users = loadUsers();
  const now = new Date();
  let updatedAny = false;

  Object.keys(users).forEach(userId => {
    const user = users[userId];

    // Check if monthly subscription has expired
    if (user.subscriptionType === 'monthly' && 
        user.subscriptionExpiresAt && 
        user.isPremium && 
        user.subscriptionStatus === 'active') {

      const expirationDate = new Date(user.subscriptionExpiresAt);

      if (now > expirationDate) {
        console.log('🕐 Expiring subscription for user:', user.email, 'Expired at:', expirationDate);

        user.isPremium = false;
        user.subscriptionStatus = 'expired';
        user.subscriptionEndDate = now.toISOString();
        updatedAny = true;
      }
    }
  });

  if (updatedAny) {
    saveUsers(users);
    console.log('✅ Daily subscription check completed - expired subscriptions updated');
  }
}

// Run subscription check every 24 hours
setInterval(checkExpiredSubscriptions, 24 * 60 * 60 * 1000);

// Run check on server start
setTimeout(checkExpiredSubscriptions, 5000);


passport.deserializeUser((user, done) => {
  done(null, user);
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://ergovia-ai.com/auth/google/callback"
  //callbackURL: "/auth/google/callback"
},
(accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

app.use(session({
  store: new FileStore({
    path: './sessions',
    retries: 2,
    factor: 1,
    minTimeout: 50,
    maxTimeout: 100,
    logFn: function() {} // Disable logging to avoid spam
  }),
  secret: process.env.SESSION_SECRET || (() => {
    console.warn('⚠️ SESSION_SECRET not set! Using fallback. Set SESSION_SECRET environment variable for production.');
    return 'ergovia-ai-stable-secret-key-2024-production';
  })(),
  resave: false,
  saveUninitialized: false,
  rolling: false, // Don't reset expiry on activity to maintain stable sessions
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for better persistence
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware to track session issues
app.use((req, res, next) => {
  if (req.session && req.sessionID) {
    console.log('Session Debug:', {
      sessionID: req.sessionID.substring(0, 8) + '...',
      authenticated: req.isAuthenticated(),
      userEmail: req.user?.emails?.[0]?.value || 'none'
    });
  }
  next();
});

// Security and parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Clean URL middleware - redirect .html to clean URLs
app.use((req, res, next) => {
  if (req.path.endsWith('.html') && req.path !== '/index.html') {
    const cleanPath = req.path.slice(0, -5); // Remove .html
    return res.redirect(301, cleanPath);
  }
  next();
});

// Clean URL routing - serve .html files for clean URLs
app.get('/:page', (req, res, next) => {
  const page = req.params.page;

  // Only handle simple page names (no special characters or paths)
  if (!/^[a-zA-Z0-9-_]+$/.test(page)) {
    return next();
  }

  const htmlFile = path.join(__dirname, 'public', `${page}.html`);

  // Check if the HTML file exists
  require('fs').access(htmlFile, require('fs').constants.F_OK, (err) => {
    if (!err) {
      return res.sendFile(htmlFile);
    }
    // If file doesn't exist, continue to next middleware
    next();
  });
});

// Handle trailing slash - redirect to clean URL
app.use((req, res, next) => {
  if (req.path.endsWith('/') && req.path.length > 1) {
    const cleanPath = req.path.slice(0, -1);
    return res.redirect(301, cleanPath);
  }
  next();
});

// Serve static files
app.use(express.static('public'));

// Taskforce onboarding routes - redirect to ETF onboard with type
app.get('/taskforce/pet-clinic', (req, res) => {
  res.redirect('/etf-onboard?type=pet-clinic');
});

app.get('/taskforce/gym', (req, res) => {
  res.redirect('/etf-onboard?type=gym');
});

app.get('/taskforce/contractors', (req, res) => {
  res.redirect('/etf-onboard?type=contractors');
});

app.get('/taskforce/tutoring', (req, res) => {
  res.redirect('/etf-onboard?type=tutoring');
});

app.get('/taskforce/massage', (req, res) => {
  res.redirect('/etf-onboard?type=massage');
});

// ========================================
// ETF Routes
// ========================================

// ETF Onboarding page - requires authentication
app.get('/etf-onboard', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login?redirect=/etf-onboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'etf-onboard.html'));
});

// ETF Admin dashboard - requires authentication
app.get('/etf-admin', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login?redirect=/etf-admin');
  }
  res.sendFile(path.join(__dirname, 'public', 'etf-admin.html'));
});

// Client Dashboard - requires authentication
app.get('/client-dashboard', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login?redirect=/client-dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'client-dashboard.html'));
});

// Get available templates from n8n
app.get('/api/etf/templates', async (req, res) => {
  try {
    const workflows = await n8nClient.getWorkflows();

    // Filter workflows with "PET" tag specifically (active AND inactive)
    const templates = workflows.data ? 
      workflows.data.filter(workflow => {
        const workflowTags = workflow.tags || [];
        // Check if workflow has "PET" tag (case insensitive)
        const hasPetTag = Array.isArray(workflowTags) && workflowTags.some(tag => {
          if (typeof tag === 'string') {
            return tag.toLowerCase().includes('pet');
          } else if (tag && typeof tag === 'object' && tag.name) {
            // Handle N8N tag objects with name property
            return tag.name.toLowerCase().includes('pet');
          }
          return false;
        });
        return hasPetTag; // No active status filter - include ALL PET workflows
      }).map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        description: `ETF automation workflow: ${workflow.name}`,
        taskforce_type: 'pet-clinic', // Pet clinics are categorized as pet-clinic
        tags: workflow.tags || [],
        active: workflow.active,
        config_fields: analyzeWorkflowConfig(workflow),
        created_at: workflow.createdAt,
        updated_at: workflow.updatedAt
      })) : [];

    console.log(`Found ${templates.length} PET workflows (active and inactive)`);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching ETF templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Deploy ETF workflow for client - requires authentication
app.post('/api/etf/deploy', requireAuth, async (req, res) => {
  try {
    let { client_data, config_data, template_id } = req.body;

    // Find ALL PET workflows for duplication
    console.log('🔍 Searching for ALL PET workflows to duplicate...');

    const workflows = await n8nClient.getWorkflows();
    const petWorkflows = workflows.data ? 
      workflows.data.filter(workflow => {
        const workflowTags = workflow.tags || [];
        return Array.isArray(workflowTags) && workflowTags.some(tag => {
          if (typeof tag === 'string') {
            return tag.toLowerCase().includes('pet');
          } else if (tag && typeof tag === 'object' && tag.name) {
            // Handle N8N tag objects with name property
            return tag.name.toLowerCase().includes('pet');
          }
          return false;
        });
        // No active status filter - include ALL PET workflows (active and inactive)
      }) : [];

    if (petWorkflows.length === 0) {
      throw new Error('No PET workflows found. Please ensure your N8N workflows have "PET" tags.');
    }

    console.log(`✅ Found ${petWorkflows.length} PET workflows to duplicate`);

    const duplicatedWorkflows = [];
    const client_id = uuidv4();
    const workflowMappings = {}; // Track original -> new workflow ID mappings

    // First pass: Create all workflows and build mapping
    console.log('🔄 Phase 1: Creating workflow copies...');
    for (const petWorkflow of petWorkflows) {
      try {
        console.log(`🚀 Creating workflow copy: ${petWorkflow.name} (ID: ${petWorkflow.id})`);

        // Get the template workflow from N8N
        const originalWorkflow = await n8nClient.getWorkflow(petWorkflow.id);

        // Create clean workflow data - exclude ALL read-only properties including tags
        const personalizedWorkflow = {
          name: `[${client_data.name}] ${originalWorkflow.name}`,
          nodes: personalizeWorkflowNodes(originalWorkflow.nodes || [], config_data, client_data),
          connections: originalWorkflow.connections || {},
          settings: originalWorkflow.settings || {},
          staticData: originalWorkflow.staticData || {},
          active: originalWorkflow.active || false // Preserve active status
          // Explicitly exclude: id, active, versionId, createdAt, updatedAt, tags, etc.
        };

        // Create new workflow first
        const newWorkflow = await n8nClient.createWorkflow(personalizedWorkflow);
        console.log(`✅ Workflow created with ID: ${newWorkflow.id}`);

        // Store mapping for second pass
        workflowMappings[petWorkflow.id] = newWorkflow.id;

        duplicatedWorkflows.push({
          original_id: petWorkflow.id,
          original_name: petWorkflow.name,
          new_id: newWorkflow.id,
          new_name: newWorkflow.name,
          original_active: originalWorkflow.active
        });

      } catch (workflowError) {
        console.error(`❌ Failed to create workflow ${petWorkflow.name}:`, workflowError.message);
      }
    }

    // Second pass: Update workflow connections and apply tags
    console.log('🔄 Phase 2: Updating connections and applying tags...');
    for (const duplicatedWF of duplicatedWorkflows) {
      
       

        try {
          // Get the original workflow to update connections
          const originalWorkflow = await n8nClient.getWorkflow(duplicatedWF.original_id);
          const updatedWorkflow = await n8nClient.getWorkflow(duplicatedWF.new_id);

          // Update workflow connections with new IDs
          const updatedNodes = personalizeWorkflowNodes(
            originalWorkflow.nodes || [], 
            config_data, 
            client_data, 
            workflowMappings
          );

          // Update the workflow with corrected connections
          const workflowUpdate = {
            name: updatedWorkflow.name,
            nodes: updatedNodes,
            connections: originalWorkflow.connections || {},
            settings: originalWorkflow.settings || {},
            staticData: originalWorkflow.staticData || {}
          };

          await n8nClient.makeRequest('PUT', `/workflows/${duplicatedWF.new_id}`, workflowUpdate);
          console.log(`✅ Updated connections for workflow ${duplicatedWF.new_id}`);

          // Add tag to the workflow using the correct API format
          try {
            const tagName = `PET[${client_data.name}]`;

            // Ensure tag exists first
            await n8nClient.createTag(tagName);

            // Apply tag using the working format (array of tag name strings)
            await n8nClient.updateWorkflowTags(duplicatedWF.new_id, [{ name: tagName }]);
            console.log(`✅ Tag "${tagName}" added to workflow ${duplicatedWF.new_id}`);
          } catch (tagError) {
            console.warn(`⚠️ Could not add tag to workflow ${duplicatedWF.new_id}: ${tagError.message}`);
          }

          // Preserve activation status from original workflow
          try {
            if (duplicatedWF.original_active) {
              const canActivate = await n8nClient.canActivateWorkflow(duplicatedWF.new_id);
              if (canActivate) {
                await n8nClient.activateWorkflow(duplicatedWF.new_id);
                console.log(`✅ Workflow ${duplicatedWF.new_id} activated (preserving original status)`);
              } else {
                console.log(`ℹ️ Workflow ${duplicatedWF.new_id} skipped activation (no trigger node)`);
              }
            } else {
              console.log(`ℹ️ Workflow ${duplicatedWF.new_id} kept inactive (preserving original status)`);
            }
          } catch (activationError) {
            console.warn(`⚠️ Could not activate workflow ${duplicatedWF.new_id}: ${activationError.message}`);
          }

          // Save deployment record
          const deployment_id = uuidv4();
          await new Promise((resolve, reject) => {
            etfDB.run(
              `INSERT INTO etf_deployments (id, client_id, template_id, n8n_workflow_id, workflow_name, taskforce_type, config_data) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [deployment_id, client_id, petWorkflow.id, newWorkflow.id, newWorkflow.name, 
               'general', JSON.stringify(config_data)],
              (err) => err ? reject(err) : resolve()
            );
          });

          duplicatedWorkflows.push({
            original_id: petWorkflow.id,
            original_name: petWorkflow.name,
            new_id: newWorkflow.id,
            new_name: newWorkflow.name,
            deployment_id: deployment_id
          });

        } catch (workflowError) {
          console.error(`❌ Failed to duplicate workflow ${petWorkflow.name}:`, workflowError.message);
          // Continue with other workflows instead of failing completely
        }
    }

    // Insert client record (only once for all workflows)
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT INTO etf_clients (id, name, email, company, industry, taskforce_type) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [client_id, client_data.name, client_data.email, client_data.name, 
         'General', 'general'],
        (err) => err ? reject(err) : resolve()
      );
    });

    if (duplicatedWorkflows.length === 0) {
      throw new Error('Failed to duplicate any PET workflows');
    }

    res.json({
      success: true,
      client_id: client_id,
      duplicated_workflows: duplicatedWorkflows,
      total_duplicated: duplicatedWorkflows.length,
      message: `Successfully duplicated ${duplicatedWorkflows.length} PET workflows for ${client_data.name}`
    });

  } catch (error) {
    console.error('Workflow duplication error:', {
      message: error.message,
      client: req.body.client_data?.name,
      timestamp: new Date().toISOString()
    });

    // Provide specific error messages based on error type
    let userMessage = 'Workflow duplication failed';
    if (error.message.includes('N8N_BASE_URL')) {
      userMessage = 'ETF service configuration error';
    } else if (error.message.includes('N8N_API_KEY')) {
      userMessage = 'ETF service authentication error';
    } else if (error.message.includes('No PET workflows found')) {
      userMessage = 'No PET workflows found';
    } else if (error.message.includes('timeout')) {
      userMessage = 'ETF service timeout - please try again';
    }

    res.status(500).json({ 
      error: userMessage, 
      details: error.message,
      success: false 
    });
  }
});

// Get ETF stats
app.get('/api/etf/stats', (req, res) => {
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM etf_clients) as total_clients,
      (SELECT COUNT(*) FROM etf_deployments WHERE status = 'active') as active_deployments,
      (SELECT COUNT(*) FROM etf_deployments WHERE deployed_at > datetime('now', '-30 days')) as monthly_deployments
  `;

  etfDB.get(sql, (err, row) => {
    if (err) {
      console.error('ETF stats query error:', err);
      res.status(500).json({ error: 'Failed to fetch stats' });
      return;
    }

    // Calculate estimated monthly revenue ($30 per active deployment)
    const estimatedRevenue = (row.active_deployments || 0) * 30;

    res.json({
      ...row,
      estimated_monthly_revenue: estimatedRevenue
    });
  });
});

// Test n8n connection
app.get('/api/etf/test-n8n', async (req, res) => {
  try {
    const workflows = await n8nClient.getWorkflows();
    res.json({ 
      success: true, 
      message: 'N8N connection successful',
      workflow_count: workflows.data ? workflows.data.length : 0
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'N8N connection failed',
      error: error.message 
    });
  }
});

// Debug endpoint to list all workflows with their tags
app.get('/api/etf/debug/workflows', async (req, res) => {
  try {
    const workflows = await n8nClient.getWorkflows();

    const workflowList = workflows.data ? 
      workflows.data.map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        tags: workflow.tags || [],
        hasPetTag: Array.isArray(workflow.tags) && workflow.tags.some(tag => {
          if (typeof tag === 'string') {
            return tag.toLowerCase().includes('pet');
          } else if (tag && typeof tag === 'object' && tag.name) {
            // Handle N8N tag objects with name property
            return tag.name.toLowerCase().includes('pet');
          }
          return false;
        })
      })) : [];

    const petWorkflows = workflowList.filter(w => w.hasPetTag);
    const activePetWorkflows = petWorkflows.filter(w => w.active);
    const inactivePetWorkflows = petWorkflows.filter(w => !w.active);

    res.json({
      success: true,
      total_workflows: workflowList.length,
      pet_workflows: {
        total: petWorkflows.length,
        active: activePetWorkflows.length,
        inactive: inactivePetWorkflows.length,
        list: petWorkflows
      },
      all_workflows: workflowList
    });
  } catch (error) {
    console.error('Error fetching workflow debug info:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test endpoint for creating tags
app.post('/api/etf/test-create-tag', async (req, res) => {
  try {
    const { tagName } = req.body;

    if (!tagName) {
      return res.status(400).json({
        success: false,
        error: 'Tag name is required'
      });
    }

    console.log(`🧪 Testing tag creation for: "${tagName}"`);

    // Test the createTag method
    const result = await n8nClient.createTag(tagName);

    res.json({
      success: true,
      message: `Tag "${tagName}" created successfully`,
      tag: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test tag creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Check server logs for full error details'
    });
  }
});

// Test endpoint for listing tags
app.get('/api/etf/list-tags', async (req, res) => {
  try {
    console.log('🧪 Testing tag listing...');

    const tagsResponse = await n8nClient.makeRequest('GET', '/tags');
    const tags = Array.isArray(tagsResponse) ? tagsResponse : (tagsResponse.data || []);

    res.json({
      success: true,
      total_tags: tags.length,
      tags: tags,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test tag listing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint for applying tags to workflows
app.post('/api/etf/test-apply-tags', async (req, res) => {
  try {
    const { workflowId, tags } = req.body;

    if (!workflowId || !tags) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID and tags are required'
      });
    }

    console.log(`🧪 Testing tag application to workflow ${workflowId}:`, tags);

    // Test the updateWorkflowTags method
    const result = await n8nClient.updateWorkflowTags(workflowId, tags);

    res.json({
      success: true,
      message: `Tags applied to workflow ${workflowId}`,
      result: result,
      applied_tags: tags,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test tag application error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      workflow_id: req.body.workflowId,
      attempted_tags: req.body.tags
    });
  }
});

// Test endpoint using direct N8N API format
app.post('/api/etf/test-direct-n8n-format', async (req, res) => {
  try {
    const { workflowId, tagIds } = req.body;

    if (!workflowId || !tagIds || !Array.isArray(tagIds)) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID and tagIds array are required'
      });
    }

    console.log(`🧪 Testing direct N8N API format for workflow ${workflowId}:`, tagIds);

    // Test direct N8N API call with correct format
    const result = await n8nClient.makeRequest('PUT', `/workflows/${workflowId}/tags`, { tagIds });

    res.json({
      success: true,
      message: `Tags applied directly to workflow ${workflowId}`,
      result: result,
      applied_tag_ids: tagIds,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Direct N8N API test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      workflow_id: req.body.workflowId,
      attempted_tag_ids: req.body.tagIds
    });
  }
});

// Client Dashboard APIs - requires authentication
app.get('/api/etf/client/dashboard', requireAuth, async (req, res) => {
  try {
    // In a real implementation, you'd get client ID from authentication
    const clientId = req.query.client_id || 'demo-client';

    // Get client credentials
    const credentials = await new Promise((resolve, reject) => {
      etfDB.get(
        'SELECT * FROM etf_client_credentials WHERE client_id = ?',
        [clientId],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    // Get client workflows
    const workflows = await new Promise((resolve, reject) => {
      etfDB.all(
        'SELECT * FROM etf_deployments WHERE client_id = ?',
        [clientId],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    // Get workflow details from N8N
    const workflowDetails = [];
    for (const deployment of workflows) {
      try {
        const workflow = await n8nClient.getWorkflow(deployment.n8n_workflow_id);
        workflowDetails.push({
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          updatedAt: workflow.updatedAt
        });
      } catch (error) {
        console.warn(`Could not fetch workflow ${deployment.n8n_workflow_id}`);
      }
    }

    res.json({
      success: true,
      credentials: credentials ? JSON.parse(credentials.credentials_data || '{}') : null,
      workflows: workflowDetails
    });
  } catch (error) {
    console.error('Client dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/etf/client/credentials', requireAuth, async (req, res) => {
  try {
    const { credentials } = req.body;
    const clientId = req.query.client_id || 'demo-client';

    // Save credentials to database
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT OR REPLACE INTO etf_client_credentials (client_id, credentials_data, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [clientId, JSON.stringify(credentials)],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Update all client workflows with new credentials
    const deployments = await new Promise((resolve, reject) => {
      etfDB.all(
        'SELECT n8n_workflow_id FROM etf_deployments WHERE client_id = ?',
        [clientId],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    // Update each workflow with new credentials
    for (const deployment of deployments) {
      try {
        const workflow = await n8nClient.getWorkflow(deployment.n8n_workflow_id);
        const updatedNodes = workflow.nodes.map(node => ({
          ...node,
          parameters: personalizeParameters(node.parameters, credentials, { name: clientId })
        }));

        await n8nClient.makeRequest('PUT', `/workflows/${deployment.n8n_workflow_id}`, {
          ...workflow,
          nodes: updatedNodes
        });
      } catch (error) {
        console.warn(`Could not update workflow ${deployment.n8n_workflow_id}:`, error.message);
      }
    }

    res.json({ success: true, message: 'Credentials updated successfully' });
  } catch (error) {
    console.error('Update credentials error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/etf/client/workflow/:workflowId/:action', requireAuth, async (req, res) => {
  try {
    const { workflowId, action } = req.params;

    if (action === 'activate') {
      await n8nClient.activateWorkflow(workflowId);
    } else if (action === 'deactivate') {
      await n8nClient.makeRequest('POST', `/workflows/${workflowId}/deactivate`);
    }

    res.json({ success: true, message: `Workflow ${action}d successfully` });
  } catch (error) {
    console.error(`Workflow ${action} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Workflow scanning and auto-placeholder conversion
app.get('/api/etf/scan-workflow/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const workflow = await n8nClient.getWorkflow(workflowId);

    const placeholders = extractPlaceholders(workflow);
    const convertedWorkflow = convertToPlaceholders(workflow, placeholders);

    res.json({
      success: true,
      original_workflow: workflow,
      detected_placeholders: placeholders,
      converted_workflow: convertedWorkflow
    });
  } catch (error) {
    console.error('Workflow scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/etf/auto-convert-placeholders/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { conversionRules } = req.body;

    const workflow = await n8nClient.getWorkflow(workflowId);
    const convertedWorkflow = autoConvertPlaceholders(workflow, conversionRules);

    // Update the workflow
    await n8nClient.makeRequest('PUT', `/workflows/${workflowId}`, convertedWorkflow);

    res.json({
      success: true,
      message: 'Workflow converted to use placeholders',
      converted_items: conversionRules.length
    });
  } catch (error) {
    console.error('Auto-convert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint to try both tag formats
app.post('/api/etf/test-both-formats', async (req, res) => {
  try {
    const { workflowId } = req.body;

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID is required'
      });
    }

    const testResults = {
      workflow_id: workflowId,
      tests: []
    };

    // Test 1: String array format
    console.log('🧪 Testing string array format...');
    try {
      const stringTags = ['TEST_STRING_FORMAT'];
      await n8nClient.updateWorkflowTags(workflowId, stringTags);
      testResults.tests.push({
        format: 'string_array',
        input: stringTags,
        status: 'success',
        message: 'String array format worked'
      });
    } catch (error) {
      testResults.tests.push({
        format: 'string_array',
        input: ['TEST_STRING_FORMAT'],
        status: 'failed',
        error: error.message
      });
    }

    // Test 2: Object array format
    console.log('🧪 Testing object array format...');
    try {
      const objectTags = [{ name: 'TEST_OBJECT_FORMAT' }];
      await n8nClient.updateWorkflowTags(workflowId, objectTags);
      testResults.tests.push({
        format: 'object_array',
        input: objectTags,
        status: 'success',
        message: 'Object array format worked'
      });
    } catch (error) {
      testResults.tests.push({
        format: 'object_array',
        input: [{ name: 'TEST_OBJECT_FORMAT' }],
        status: 'failed',
        error: error.message
      });
    }

    // Test 3: Mixed format
    console.log('🧪 Testing mixed format...');
    try {
      const mixedTags = ['TEST_MIXED_STRING', { name: 'TEST_MIXED_OBJECT' }];
      await n8nClient.updateWorkflowTags(workflowId, mixedTags);
      testResults.tests.push({
        format: 'mixed_array',
        input: mixedTags,
        status: 'success',
        message: 'Mixed format worked'
      });
    } catch (error) {
      testResults.tests.push({
        format: 'mixed_array',
        input: ['TEST_MIXED_STRING', { name: 'TEST_MIXED_OBJECT' }],
        status: 'failed',
        error: error.message
      });
    }

    const successCount = testResults.tests.filter(t => t.status === 'success').length;

    res.json({
      success: successCount > 0,
      message: `${successCount}/${testResults.tests.length} tag formats worked`,
      results: testResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test both formats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Middleware to check if user has premium access
function requirePremium(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Get user ID from authenticated user (Google OAuth uses 'id' field)
  const userId = req.user.id;
  const userEmail = req.user.emails?.[0]?.value;
  const users = readUsersFileSync();

  // Try to find user by Google ID first, then by email
  let userRecord = users[userId];
  if (!userRecord && userEmail) {
    userRecord = Object.values(users).find(u => u.email === userEmail);
  }

  console.log('Premium check - User ID:', userId, 'Email:', userEmail, 'User record found:', !!userRecord);

  if (!userRecord) {
    console.log('❌ No user record found for:', userEmail || userId);
    return res.status(403).json({ error: 'Premium access required' });
  }

  // Check subscription expiration for monthly subscribers
  if (userRecord.subscriptionType === 'monthly' && userRecord.subscriptionExpiresAt) {
    const now = new Date();
    const expirationDate = new Date(userRecord.subscriptionExpiresAt);

    if (now > expirationDate) {
      console.log('❌ Subscription expired for user:', userEmail, 'Expired at:', expirationDate);

      // Update user record to reflect expired status
      userRecord.isPremium = false;
      userRecord.subscriptionStatus = 'expired';
      users[userId] = userRecord;
      saveUsers(users);

      return res.status(403).json({ 
        error: 'Subscription expired', 
        message: 'Your monthly subscription has expired. Please renew to continue using premium features.',
        expirationDate: expirationDate.toISOString()
      });
    }
  }

  // Check if user has active premium access
  const hasValidSubscription = userRecord.isPremium && 
    (userRecord.subscriptionStatus === 'active' || userRecord.hasUnlimitedAccess);

  if (!hasValidSubscription) {
    console.log('❌ Premium access denied for user:', userEmail || userId, 
                'Premium:', userRecord.isPremium, 'Status:', userRecord.subscriptionStatus);
    return res.status(403).json({ error: 'Premium access required' });
  }

  console.log('✅ Premium access granted for user:', userEmail);
  next();
}

function readUsersFileSync() {
  try {
    const data = fs.readFileSync('users.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

app.get('/api/taskforce/clients', requireAuth, (req, res) => {
  const userId = req.user.googleId;

  db.all('SELECT * FROM taskforce_clients WHERE user_id = ? ORDER BY created_at DESC', 
    [userId], (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch clients' });
      }
      res.json(rows);
    });
});

// Get specific taskforce client
app.get('/api/taskforce/clients/:clientId', requireAuth, (req, res) => {
  const { clientId } = req.params;
  const userId = req.user.googleId;

  db.get('SELECT * FROM taskforce_clients WHERE id = ? AND user_id = ?', 
    [clientId, userId], (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch client' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Client not found' });
      }
      res.json(row);
    });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Lemon Squeezy webhook endpoint
app.post('/webhook/lemonsqueezy', express.raw({type: 'application/json'}), (req, res) => {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('Missing LEMONSQUEEZY_WEBHOOK_SECRET');
      return res.status(400).send('Webhook secret not configured');
    }

    // Verify webhook signature
    const signature = req.headers['x-signature'];
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(req.body, 'utf8').digest('hex');

    if (signature !== digest) {
      console.error('Invalid webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(req.body.toString());
    console.log('Lemon Squeezy webhook received:', event.meta.event_name);

    // Handle subscription created/updated
    if (event.meta.event_name === 'subscription_created' || 
        event.meta.event_name === 'subscription_updated') {

      const subscription = event.data;
      const customerEmail = subscription.attributes.user_email;

      if (subscription.attributes.status === 'active') {
        // Find user by email and activate premium
        const users = loadUsers();
        const userKey = Object.keys(users).find(key => 
          users[key].email === customerEmail
        );

        if (userKey) {
          const now = new Date();
          const subscriptionType = subscription.attributes.variant_name?.toLowerCase().includes('monthly') ? 'monthly' : 'yearly';

          // Calculate expiration date for monthly subscriptions
          let expirationDate = null;
          if (subscriptionType === 'monthly') {
            expirationDate = new Date(now);
            expirationDate.setMonth(expirationDate.getMonth() + 1);
          }

          users[userKey].isPremium = true;
          users[userKey].subscriptionId = subscription.id;
          users[userKey].subscriptionStatus = 'active';
          users[userKey].subscriptionType = subscriptionType;
          users[userKey].upgradeDate = now.toISOString();
          users[userKey].subscriptionStartDate = now.toISOString();

          if (expirationDate) {
            users[userKey].subscriptionExpiresAt = expirationDate.toISOString();
          }

          // Renew date for next billing cycle
          if (subscription.attributes.renews_at) {
            users[userKey].nextRenewalDate = subscription.attributes.renews_at;
          }

          saveUsers(users);

          console.log('✅ Premium activated for user:', customerEmail, 'Type:', subscriptionType, 'Expires:', expirationDate?.toISOString());
        } else {
          console.log('⚠️ User not found for email:', customerEmail);
        }
      }
    }

    // Handle subscription renewal
    if (event.meta.event_name === 'subscription_payment_success') {
      const subscription = event.data;
      const customerEmail = subscription.attributes.user_email;

      const users = loadUsers();
      const userKey = Object.keys(users).find(key => 
        users[key].email === customerEmail
      );

      if (userKey && users[userKey].subscriptionType === 'monthly') {
        // Extend subscription for another month
        const now = new Date();
        const newExpirationDate = new Date(now);
        newExpirationDate.setMonth(newExpirationDate.getMonth() + 1);

        users[userKey].subscriptionExpiresAt = newExpirationDate.toISOString();
        users[userKey].subscriptionStatus = 'active';
        users[userKey].isPremium = true;
        users[userKey].lastRenewalDate = now.toISOString();

        if (subscription.attributes.renews_at) {
          users[userKey].nextRenewalDate = subscription.attributes.renews_at;
        }

        saveUsers(users);
        console.log('✅ Subscription renewed for user:', customerEmail, 'New expiration:', newExpirationDate.toISOString());
      }
    }

    // Handle subscription cancelled/expired
    if (event.meta.event_name === 'subscription_cancelled' || 
        event.meta.event_name === 'subscription_expired') {

      const subscription = event.data;
      const customerEmail = subscription.attributes.user_email;

      // Find user and deactivate premium
      const users = loadUsers();
      const userKey = Object.keys(users).find(key => 
        users[key].email === customerEmail
      );

      if (userKey) {
        users[userKey].isPremium = false;
        users[userKey].subscriptionStatus = subscription.attributes.status;
        users[userKey].subscriptionEndDate = new Date().toISOString();
        saveUsers(users);

        console.log('❌ Premium deactivated for user:', customerEmail);
      }
    }

    // Handle failed payments
    if (event.meta.event_name === 'subscription_payment_failed') {
      const subscription = event.data;
      const customerEmail = subscription.attributes.user_email;

      const users = loadUsers();
      const userKey = Object.keys(users).find(key => 
        users[key].email === customerEmail
      );

      if (userKey) {
        users[userKey].subscriptionStatus = 'past_due';
        users[userKey].lastFailedPayment = new Date().toISOString();
        saveUsers(users);

        console.log('⚠️ Payment failed for user:', customerEmail);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Chat endpoint with thread and system message support
// Helper function to get API configuration based on model
function getAPIConfig(model) {
  const isDeepSeek = model === "deepseek-chat";
  return {
    apiKey: isDeepSeek ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY,
    apiUrl: isDeepSeek ? "https://api.deepseek.com/v1/chat/completions" : "https://api.openai.com/v1/chat/completions"
  };
}

app.post('/chat', requirePremium, async (req, res) => {
  try {
    const { messages, model, system, thread_id } = req.body;
    const selectedModel = model || "gpt-3.5-turbo";

    // Input validation
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages must be an array' });
    }

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Messages array cannot be empty' });
    }

    // Validate message format
    const invalidMessage = messages.find(msg => 
      !msg.role || !msg.content || typeof msg.content !== 'string'
    );

    if (invalidMessage) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const finalMessages = [];
    if (system) {
      finalMessages.push({ role: 'system', content: system });
    }
    finalMessages.push(...messages);

    const { apiKey, apiUrl } = getAPIConfig(selectedModel);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: finalMessages,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();

    // Increment prompt count for authenticated users
    if (req.isAuthenticated()) {
      incrementUserPromptCount(req.user.id);
    }

    res.json({
      message: data.choices[0].message,
      thread_id,
      model: selectedModel
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Error processing your request' });
  }
});

// User storage functions
const usersFile = 'users.json';
const threadsFile = 'user_threads.json';

// Reusable validation functions
function validateUserData(userData) {
  const errors = [];
  if (!userData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
    errors.push('Valid email is required');
  }
  if (!userData.preferredFirstName || userData.preferredFirstName.trim().length < 1) {
    errors.push('First name is required');
  }
  if (!userData.preferredLastName || userData.preferredLastName.trim().length < 1) {
    errors.push('Last name is required');
  }
  return errors;
}

function sanitizeUserInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().substring(0, 100); // Limit length and trim whitespace
}

function loadUsers() {
  try {
    if (fs.existsSync(usersFile)) {
      return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Error saving users:', err);
  }
}

function loadUserThreads() {
  try {
    if (fs.existsSync(threadsFile)) {
      return JSON.parse(fs.readFileSync(threadsFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading user threads:', err);
  }
  return {};
}

function saveUserThreads(userThreads) {
  try {
    fs.writeFileSync(threadsFile, JSON.stringify(userThreads, null, 2));
  } catch (err) {
    console.error('Error saving user threads:', err);
  }
}

function getUserThreads(userId) {
  const userThreads = loadUserThreads();
  return userThreads[userId] || [];
}

function saveThreadsForUser(userId, threads) {
  const userThreads = loadUserThreads();
  userThreads[userId] = threads;
  saveUserThreads(userThreads);
}

function findUserByEmail(email) {
  const users = loadUsers();
  return Object.values(users).find(user => user.email === email);
}

function saveUser(userData) {
  const users = loadUsers();
  users[userData.googleId] = userData;
  saveUsers(users);
}

// Google OAuth routes with proper account selection
app.get("/auth/google",
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    prompt: 'select_account'
  })
);

// Separate signup route with forced account selection
app.get("/auth/google/signup",
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    prompt: 'select_account consent'
  })
);

// Separate login route with account selection
app.get("/auth/google/login",
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    prompt: 'select_account'
  })
);

app.get("/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login-failed"
  }),
  (req, res) => {
    if (req.user) {
      const userEmail = req.user.emails?.[0]?.value;
      const existingUser = findUserByEmail(userEmail);

      // Check if this was a signup or login request
      const authIntent = req.session.authIntent || 'login';

      // Clear the auth intent after use
      delete req.session.authIntent;

      if (authIntent === 'signup') {
        if (existingUser) {
          // User already exists, show option to login instead
          return res.redirect('/account-exists');
        } else {
          // New user, redirect to complete signup
          return res.redirect('/complete-signup');
        }
      } else {
        // Login flow
        if (existingUser) {
          return res.redirect('/confirm-login');
        } else {
          // No account exists, redirect to signup
          return res.redirect('/no-account');
        }
      }
    }
    res.redirect('/login-failed');
  }
);

// Set auth intent and clear any existing session
app.get('/set-auth-intent/:type', (req, res) => {
  // Clear any existing authentication
  req.logout(() => {
    req.session.destroy((err) => {
      // Create new session with auth intent
      req.session = req.sessionStore.createSession(req, {});
      req.session.authIntent = req.params.type;

      if (req.params.type === 'signup') {
        res.redirect('/auth/google/signup');
      } else {
        res.redirect('/auth/google/login');
      }
    });
  });
});

app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

// API endpoint to get user profile data
app.get("/api/profile", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // First check session for user data, then fallback to saved data
  let userData = req.user.savedUserData;
  if (!userData) {
    const userEmail = req.user.emails?.[0]?.value;
    userData = findUserByEmail(userEmail);
  }

  res.json({
    name: req.user.displayName,
    email: req.user.emails?.[0]?.value,
    picture: req.user.photos?.[0]?.value,
    id: req.user.id,
    preferredFirstName: userData?.preferredFirstName || req.user.preferredFirstName || null,
    preferredLastName: userData?.preferredLastName || req.user.preferredLastName || null,
    isComplete: userData?.isComplete || req.user.isComplete || false
  });
});

// Check authentication status endpoint
app.get("/api/auth/status", (req, res) => {
  console.log('Auth status check - isAuthenticated:', req.isAuthenticated());
  console.log('Session data:', req.session?.passport?.user ? 'Session exists' : 'No session');

  if (!req.isAuthenticated()) {
    return res.json({ authenticated: false, user: null });
  }

  // First check session for user data, then fallback to saved data
  let userData = req.user.savedUserData;
  if (!userData) {
    const userEmail = req.user.emails?.[0]?.value;
    userData = findUserByEmail(userEmail);
    console.log('Found user data by email:', userEmail, !!userData);
  }

  const userResponse = {
    name: req.user.displayName,
    email: req.user.emails?.[0]?.value,
    picture: req.user.photos?.[0]?.value,
    preferredFirstName: userData?.preferredFirstName || req.user.preferredFirstName || null,
    preferredLastName: userData?.preferredLastName || req.user.preferredLastName || null,
    isComplete: userData?.isComplete || req.user.isComplete || false,
    isPremium: userData?.isPremium || false,
    hasUnlimitedAccess: userData?.hasUnlimitedAccess || false,
    subscriptionType: userData?.subscriptionType || null,
    subscriptionStatus: userData?.subscriptionStatus || null,
    subscriptionExpiresAt: userData?.subscriptionExpiresAt || null,
    nextRenewalDate: userData?.nextRenewalDate || null
  };

  console.log('✅ Auth status response:', userResponse.email, 'Premium:', userResponse.isPremium);

  res.json({ 
    authenticated: true,
    user: userResponse
  });
});

// Get user profile
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.googleId;
    const users = await readUsersFile();
    const user = users[userId];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Get user threads
app.get('/api/threads', requireAuth, async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.user.id;
  const threads = getUserThreads(userId);
  res.json({ threads });
});

// Check user authentication status
app.get('/api/user/status', (req, res) => {
  res.json({ 
    isAuthenticated: req.isAuthenticated(),
    user: req.user || null 
  });
});

// Token usage management
const tokenUsageFile = 'token_usage.json';

function loadTokenUsage() {
  try {
    if (fs.existsSync(tokenUsageFile)) {
      return JSON.parse(fs.readFileSync(tokenUsageFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading token usage:', err);
  }
  return {};
}

function saveTokenUsage(tokenUsage) {
  try {
    fs.writeFileSync(tokenUsageFile, JSON.stringify(tokenUsage, null, 2));
  } catch (err) {
    console.error('Error saving token usage:', err);
  }
}

function getUserTokenUsage(userId) {
  const tokenUsage = loadTokenUsage();
  return tokenUsage[userId] || { tokens: 0, prompts: 0 };
}

function updateUserTokenUsage(userId, usage) {
  const tokenUsage = loadTokenUsage();
  tokenUsage[userId] = usage;
  saveTokenUsage(tokenUsage);
}

function incrementUserPromptCount(userId) {
  const tokenUsage = loadTokenUsage();
  const currentUsage = tokenUsage[userId] || { tokens: 0, prompts: 0 };
  currentUsage.prompts = (currentUsage.prompts || 0) + 1;
  tokenUsage[userId] = currentUsage;
  saveTokenUsage(tokenUsage);
}

// Token usage API endpoints
app.get("/api/token-usage", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.user.id;
  const usage = getUserTokenUsage(userId);

  // Handle both old format (number) and new format (object)
  if (typeof usage === 'number') {
    res.json({ usage: { tokens: usage, prompts: 0 } });
  } else {
    res.json({ usage });
  }
});

app.post("/api/token-usage", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.user.id;
  const { usage } = req.body;

  updateUserTokenUsage(userId, usage);
  res.json({ success: true, usage });
});

app.post("/api/token-usage/increment", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.user.id;
  const currentUsage = getUserTokenUsage(userId);

  // Handle both old format (number) and new format (object)
  let newUsage;
  if (typeof currentUsage === 'number') {
    newUsage = { tokens: currentUsage + 1, prompts: 0 };
  } else {
    newUsage = { 
      tokens: (currentUsage.tokens || 0) + 1, 
      prompts: currentUsage.prompts || 0 
    };
  }

  updateUserTokenUsage(userId, newUsage);
  res.json({ success: true, usage: newUsage });
});

app.post("/api/token-usage/increment-prompt", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.user.id;
  incrementUserPromptCount(userId);
  const currentUsage = getUserTokenUsage(userId);

  res.json({ success: true, usage: currentUsage });
});

app.post("/api/threads", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.user.id;
  const { threads } = req.body;

  if (!Array.isArray(threads)) {
    return res.status(400).json({ error: "Threads must be an array" });
  }

  saveThreadsForUser(userId, threads);
  res.json({ success: true });
});

app.delete("/api/threads/:threadId", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.user.id;
  const threadId = parseInt(req.params.threadId);

  let threads = getUserThreads(userId);
  threads = threads.filter(thread => thread.id !== threadId);

  saveThreadsForUser(userId, threads);
  res.json({ success: true });
});

// Complete signup route
app.post("/api/complete-signup", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" });
  }

  const { firstName, lastName } = req.body;
  const sanitizedFirstName = sanitizeUserInput(firstName);
  const sanitizedLastName = sanitizeUserInput(lastName);

  const validationErrors = validateUserData({
    email: req.user.emails?.[0]?.value,
    preferredFirstName: sanitizedFirstName,
    preferredLastName: sanitizedLastName
  });

  if (validationErrors.length > 0) {
    return res.status(400).json({ 
      error: "Validation failed", 
      code: "VALIDATION_ERROR",
      details: validationErrors 
    });
  }

  const userData = {
    googleId: req.user.id,
    email: req.user.emails?.[0]?.value,
    googleName: req.user.displayName,
    profilePicture: req.user.photos?.[0]?.value,
    preferredFirstName: firstName,
    preferredLastName: lastName,
    createdAt: new Date().toISOString(),
    isComplete: true
  };

  // Save user data to persistent storage
  saveUser(userData);

  // Update the session user object with complete profile data
  req.user.preferredFirstName = firstName;
  req.user.preferredLastName = lastName;
  req.user.isComplete = true;
  req.user.savedUserData = userData;

  // Ensure session is marked as modified to trigger save
  req.session.passport.user = req.user;

  // Force session save before responding
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).json({ error: "Session save failed" });
    }

    console.log('✅ New User Signup:', {
      name: `${firstName} ${lastName}`,
      email: userData.email,
      id: userData.googleId,
      timestamp: userData.createdAt
    });

    res.json({ 
      success: true, 
      message: "Signup completed successfully",
      user: {
        name: `${firstName} ${lastName}`,
        email: userData.email,
        picture: userData.profilePicture,
        preferredFirstName: firstName,
        preferredLastName: lastName,
        isComplete: true
      }
    });
  });
});

// Confirm login route
app.post("/api/confirm-login", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userEmail = req.user.emails?.[0]?.value;
  const existingUser = findUserByEmail(userEmail);

  if (!existingUser) {
    return res.status(404).json({ error: "User not found" });
  }

  // Load user data into session for consistent access
  req.user.preferredFirstName = existingUser.preferredFirstName;
  req.user.preferredLastName = existingUser.preferredLastName;
  req.user.isComplete = existingUser.isComplete;
  req.user.savedUserData = existingUser;

  // Store user session data properly
  req.session.user = {
    googleId: existingUser.googleId,
    email: existingUser.email,
    isPremium: existingUser.isPremium,
    hasUnlimitedAccess: existingUser.hasUnlimitedAccess
  };

  console.log('✅ User Login:', {
    name: `${existingUser.preferredFirstName} ${existingUser.preferredLastName}`,
    email: existingUser.email,
    id: existingUser.googleId,
    isPremium: existingUser.isPremium,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, message: "Login confirmed" });
});

// Serve signup and login pages
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

app.get("/complete-signup", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/signup");
  }
  res.sendFile(path.join(__dirname, "public", "complete-signup.html"));
});

app.get("/confirm-login", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/signup");
  }
  res.sendFile(path.join(__dirname, "public", "confirm-login.html"));
});

// Account exists route (for signup attempts with existing accounts)
app.get("/account-exists", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/signup");
  }
  res.sendFile(path.join(__dirname, "public", "account-exists.html"));
});

// No account route (for login attempts without accounts)
app.get("/no-account", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public", "no-account.html"));
});

// Login failed route
app.get("/login-failed", (req, res) => {
  res.redirect("/?error=auth_failed");
});

// Serve login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve token dashboard
app.get("/token-dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "token-dashboard.html"));
});

// Model configuration endpoints
const modelConfigFile = 'model_config.json';

app.post('/save-model-config', (req, res) => {
  try {
    const fs = require('fs');
    fs.writeFileSync(modelConfigFile, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving model config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

app.get('/model-config', (req, res) => {
  try {
    const fs = require('fs');
    if (fs.existsSync(modelConfigFile)) {
      const config = JSON.parse(fs.readFileSync(modelConfigFile, 'utf8'));
      res.json(config);
    } else {
      res.json({
        model_triggers: {
          "gpt-4-turbo": ["complex", "detailed", "thorough", "comprehensive", "advanced"],
          "gpt-4": ["longer", "extensive", "elaborate", "in-depth", "complete"],
          "gpt-3.5-turbo": ["quick", "simple", "basic", "fast", "brief"],
          "deepseek-chat": ["deeper", "creative", "deep", "innovative", "alternative"]
        },
        default_model: "gpt-3.5-turbo"
      });
    }
  } catch (error) {
    console.error('Error loading model config:', error);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// User profile endpoint
app.get('/api/user/profile', requireAuth, (req, res) => {
  try {
    const users = loadUsers();
    const user = users[req.session.user.googleId];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Taskforce onboarding routes
app.get('/taskforce/:type/onboard', requireAuth, (req, res) => {
  const { type } = req.params;

  // Validate taskforce type
  const validTypes = ['dental', 'gym', 'contractor', 'tutoring', 'massage'];
  if (!validTypes.includes(type)) {
    return res.status(404).send('Taskforce type not found');
  }

  // For now, redirect to main dashboard with a message
  // In the future, this would load a specific onboarding flow
  res.redirect(`/?template=${type}&action=onboard`);
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ========================================
// ETF Helper Functions
// ========================================

function extractPlaceholders(workflow) {
  const placeholders = new Set();
  const commonPatterns = [
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, // Email addresses
    /\b\d{3}-\d{3}-\d{4}\b/g, // Phone numbers
    /\bhttps?:\/\/[^\s]+/g, // URLs
    /\bapi[_-]?key[_-]?\w*/gi, // API keys
    /\b[A-Z][a-zA-Z\s]+(Clinic|Gym|Center|Company|Corp|LLC|Inc)\b/g, // Business names
  ];

  function scanObject(obj, path = '') {
    if (typeof obj === 'string') {
      // Check for hardcoded values that should be placeholders
      commonPatterns.forEach((pattern, index) => {
        const matches = obj.match(pattern);
        if (matches) {
          matches.forEach(match => {
            let placeholderName;
            switch (index) {
              case 0: placeholderName = '{{CLIENT_EMAIL}}'; break;
              case 1: placeholderName = '{{CLIENT_PHONE}}'; break;
              case 2: placeholderName = '{{CLIENT_WEBHOOK_URL}}'; break;
              case 3: placeholderName = '{{CLIENT_API_KEY}}'; break;
              case 4: placeholderName = '{{BUSINESS_NAME}}'; break;
              default: placeholderName = '{{CLIENT_DATA}}';
            }
            placeholders.add({
              path: path,
              original: match,
              placeholder: placeholderName,
              pattern: pattern.source
            });
          });
        }
      });
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        scanObject(item, `${path}[${index}]`);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        scanObject(value, path ? `${path}.${key}` : key);
      });
    }
  }

  // Scan workflow nodes for hardcoded values
  if (workflow.nodes) {
    workflow.nodes.forEach((node, index) => {
      scanObject(node, `nodes[${index}]`);
    });
  }

  return Array.from(placeholders);
}

function convertToPlaceholders(workflow, placeholders) {
  const convertedWorkflow = JSON.parse(JSON.stringify(workflow));

  function replaceInObject(obj) {
    if (typeof obj === 'string') {
      let result = obj;
      placeholders.forEach(placeholder => {
        const regex = new RegExp(placeholder.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        result = result.replace(regex, placeholder.placeholder);
      });
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(replaceInObject);
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj = {};
      Object.entries(obj).forEach(([key, value]) => {
        newObj[key] = replaceInObject(value);
      });
      return newObj;
    }
    return obj;
  }

  convertedWorkflow.nodes = replaceInObject(convertedWorkflow.nodes);
  return convertedWorkflow;
}

function autoConvertPlaceholders(workflow, conversionRules) {
  const convertedWorkflow = JSON.parse(JSON.stringify(workflow));

  function replaceInObject(obj) {
    if (typeof obj === 'string') {
      let result = obj;
      conversionRules.forEach(rule => {
        const regex = new RegExp(rule.find, 'g');
        result = result.replace(regex, rule.replace);
      });
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(replaceInObject);
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj = {};
      Object.entries(obj).forEach(([key, value]) => {
        newObj[key] = replaceInObject(value);
      });
      return newObj;
    }
    return obj;
  }

  convertedWorkflow.nodes = replaceInObject(convertedWorkflow.nodes);
  return convertedWorkflow;
}

function extractTaskforceType(workflowName, workflowTags = []) {
  const name = workflowName.toLowerCase();
  const tags = Array.isArray(workflowTags) ? workflowTags.map(tag => {
    if (typeof tag === 'string') {
      return tag.toLowerCase();
    } else if (tag && typeof tag === 'object' && tag.name) {
      return tag.name.toLowerCase();
    }
    return '';
  }).join(' ') : '';

  // Check tags first for more accurate classification
  if (tags.includes('veterinary') || tags.includes('pet') || tags.includes('animal')) return 'pet-clinic';
  if (tags.includes('dental') || tags.includes('clinic')) return 'dental';
  if (tags.includes('gym') || tags.includes('fitness') || tags.includes('workout')) return 'gym';
  if (tags.includes('contractor') || tags.includes('hvac') || tags.includes('plumbing')) return 'contractors';
  if (tags.includes('tutor') || tags.includes('education') || tags.includes('academic')) return 'tutoring';
  if (tags.includes('massage') || tags.includes('spa') || tags.includes('wellness')) return 'massage';

  // Fallback to name-based detection
  if (name.includes('dental') || name.includes('clinic')) return 'dental';
  if (name.includes('gym') || name.includes('fitness')) return 'gym';
  if (name.includes('contractor') || name.includes('hvac')) return 'contractors';
  if (name.includes('tutor') || name.includes('education')) return 'tutoring';
  if (name.includes('massage') || name.includes('spa')) return 'massage';

  return 'general';
}

function analyzeWorkflowConfig(workflow) {
  // Extract tags from N8N workflow metadata
  const workflowTags = workflow.tags || [];
  const workflowNotes = workflow.notes || '';
  const customFields = [];

  // Parse custom fields from workflow tags or notes
  workflowTags.forEach(tag => {
    // Check for custom field definitions in tags like "field:appointment_types"
    if (tag.startsWith('field:')) {
      const fieldKey = tag.replace('field:', '');
      customFields.push({
        key: fieldKey,
        label: fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'textarea',
        required: false
      });
    }

    // Check for specific pet clinic tags
    if (tag.includes('veterinary') || tag.includes('pet') || tag.includes('animal')) {
      customFields.push(
        { key: 'clinic_hours', label: 'Clinic Hours', type: 'textarea', placeholder: 'Mon-Fri: 8AM-6PM, Sat: 9AM-3PM' },
        { key: 'services_offered', label: 'Services Offered', type: 'textarea', placeholder: 'Vaccinations, Surgery, Dental Care, Emergency' },
        { key: 'emergency_hours', label: 'Emergency Hours', type: 'text', placeholder: 'After hours emergency contact' }
      );
    }
  });

  // Standard configuration fields for all ETF workflows
  const standardFields = [
    { key: 'business_name', label: 'Business Name', type: 'text', required: true },
    { key: 'business_email', label: 'Business Email', type: 'email', required: true },
    { key: 'business_phone', label: 'Business Phone', type: 'tel', required: true },
    { key: 'support_email', label: 'Support Email', type: 'email', required: false }
  ];

  // Combine standard fields with custom fields from tags
  return [...standardFields, ...customFields];
}

function personalizeWorkflowNodes(nodes, configData, clientData, workflowMappings = {}) {
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.map(node => {
    // Create clean node object with only essential fields
    const personalizedNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      typeVersion: node.typeVersion || 1,
      position: node.position || [0, 0],
      parameters: personalizeParameters(node.parameters || {}, configData, clientData, workflowMappings)
    };

    // Add optional fields if they exist and are allowed (exclude read-only fields)
    if (node.credentials) personalizedNode.credentials = node.credentials;
    if (node.webhookId) personalizedNode.webhookId = node.webhookId;
    if (node.disabled !== undefined) personalizedNode.disabled = node.disabled;
    if (node.continueOnFail !== undefined) personalizedNode.continueOnFail = node.continueOnFail;
    if (node.alwaysOutputData !== undefined) personalizedNode.alwaysOutputData = node.alwaysOutputData;
    if (node.executeOnce !== undefined) personalizedNode.executeOnce = node.executeOnce;
    if (node.retryOnFail !== undefined) personalizedNode.retryOnFail = node.retryOnFail;
    if (node.maxTries !== undefined) personalizedNode.maxTries = node.maxTries;
    if (node.waitBetweenTries !== undefined) personalizedNode.waitBetweenTries = node.waitBetweenTries;
    if (node.notes) personalizedNode.notes = node.notes;
    if (node.notesInFlow !== undefined) personalizedNode.notesInFlow = node.notesInFlow;

    return personalizedNode;
  });
}

function personalizeParameters(parameters, configData, clientData, workflowMappings = {}) {
  const substitutions = {
    '{{CLIENT_NAME}}': clientData.name || '',
    '{{CLIENT_EMAIL}}': clientData.email || '',
    '{{CLIENT_COMPANY}}': clientData.company || clientData.name || '',
    '{{CLIENT_PHONE}}': clientData.phone || '',
    '{{BUSINESS_NAME}}': configData.business_name || clientData.name || '',
    '{{BUSINESS_EMAIL}}': configData.business_email || clientData.email || '',
    '{{BUSINESS_PHONE}}': configData.business_phone || clientData.phone || '',
    '{{SUPPORT_EMAIL}}': configData.support_email || clientData.email || '',
    // Add API credentials placeholders
    '{{CLIENT_API_KEY}}': configData.client_api_key || '',
    '{{CLIENT_DATABASE_URL}}': configData.client_database_url || '',
    '{{CLIENT_WEBHOOK_URL}}': configData.client_webhook_url || ''
  };

  function replaceInObject(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      let result = obj;
      Object.entries(substitutions).forEach(([placeholder, value]) => {
        const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
        result = result.replace(regex, value);
      });
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(replaceInObject);
    } else if (typeof obj === 'object') {
      const newObj = {};
      Object.entries(obj).forEach(([key, value]) => {
        newObj[key] = replaceInObject(value);
      });
      return newObj;
    }
    return obj;
  }

  return replaceInObject(parameters || {});
}

function extractWebhookUrl(nodes) {
  const webhookNodes = nodes.filter(node => node.type === 'n8n-nodes-base.webhook');
  if (webhookNodes.length > 0) {
    const webhookPath = webhookNodes[0].parameters?.path || '';
    return `${N8N_BASE_URL}/webhook${webhookPath}`;
  }
  return null;
}

// Start server
const port = process.env.PORT || 3000;
console.log(`Server is running on port ${port}`);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});

async function readUsersFile() {
  try {
    const data = await fs.promises.readFile('users.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users file:', error);
    return {};
  }
}
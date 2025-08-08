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
const { countTokens, countConversationTokens } = require('./utils/tokenCounter');
const { 
  assignKeyToClient, 
  getClientData, 
  updateTokenUsage, 
  checkBudget,
  addKeysToPool,
  getPoolStats 
} = require('./utils/keyManager');
const { initScheduler } = require('./utils/scheduler');

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
      const errorDetails = {
        url: `${this.baseURL}/api/v1${endpoint}`,
        method,
        error: error.response?.data || error.message,
        status: error.response?.status,
        timestamp: new Date().toISOString()
      };
      console.error('N8N API Error Details:', errorDetails);

      // Provide more specific error messages based on status codes
      if (error.response?.status === 401) {
        throw new Error('N8N API Authentication failed - check API key');
      } else if (error.response?.status === 404) {
        throw new Error('N8N API endpoint not found');
      } else if (error.response?.status >= 500) {
        throw new Error('N8N API server error - service may be unavailable');
      } else {
        throw new Error(`N8N API Error: ${error.response?.status || error.message}`);
      }
    }
  }

  async getWorkflows() { return await this.makeRequest('GET', '/workflows'); }
  async getWorkflow(id) { return await this.makeRequest('GET', `/workflows/${id}`); }
  async createWorkflow(workflowData) { return await this.makeRequest('POST', '/workflows', workflowData); }
  async updateWorkflow(id, workflowData) { return await this.makeRequest('PUT', `/workflows/${id}`, workflowData); }
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
      // Handle 409 conflict errors specifically (tag already exists)
      if (error.message.includes('409') || error.message.includes('already exists')) {
        console.log(`✅ Tag "${tagName}" created by another process (409 conflict resolved)`);
        // Try to fetch the existing tag
        try {
          const tagsResponse = await this.makeRequest('GET', '/tags');
          const tags = Array.isArray(tagsResponse) ? tagsResponse : (tagsResponse.data || []);
          const existingTag = tags.find(tag => tag.name === tagName);
          return existingTag || { name: tagName, id: null };
        } catch (fetchError) {
          return { name: tagName, id: null };
        }
      }
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

  // Client history table for tracking changes
  etfDB.run(`
    CREATE TABLE IF NOT EXISTS etf_client_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES etf_clients(id)
    )
  `);

  console.log('ETF Database initialized');
  return etfDB;
}

const etfDB = initETFDatabase();

// Initialize monthly token reset scheduler
initScheduler();

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
    if (process.env.NODE_ENV !== 'development') {
      console.warn('⚠️ SESSION_SECRET not set! Using fallback. Set SESSION_SECRET environment variable for production.');
    }
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

// Taskforce onboarding routes - redirect all to ETF onboarding
app.get('/taskforce/pet-clinic/onboard', (req, res) => {
  res.redirect('/etf-onboard?type=dental');
});

app.get('/taskforce/gym/onboard', (req, res) => {
  res.redirect('/etf-onboard?type=gym');
});

app.get('/taskforce/contractors/onboard', (req, res) => {
  res.redirect('/etf-onboard?type=contractors');
});

app.get('/taskforce/tutoring/onboard', (req, res) => {
  res.redirect('/etf-onboard?type=tutoring');
});

app.get('/taskforce/massage/onboard', (req, res) => {
  res.redirect('/etf-onboard?type=massage');
});

// ========================================
// ETF Routes
// ========================================

// ETF Onboarding page
app.get('/etf-onboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'etf-onboard.html'));
});

// ETF Admin dashboard
app.get('/etf-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'etf-admin.html'));
});

// Credential routes removed - files deleted

// Credential Design Documentation
app.get('/credential-design-doc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'credential-design-doc.html'));
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
            return tag.toLowerCase() === 'pet';
          } else if (tag && typeof tag === 'object' && tag.name) {
            // Handle N8N tag objects with name property
            return tag.name.toLowerCase() === 'pet';
          }
          return false;
        });
        return hasPetTag; // No active status filter - include ALL PET workflows
      }).map(workflow => {
        const workflowAnalysis = analyzeWorkflowConfig(workflow);
        return {
          id: workflow.id,
          name: workflow.name,
          description: `ETF automation workflow: ${workflow.name}`,
          taskforce_type: 'dental', // Pet clinics are categorized as dental
          tags: workflow.tags || [],
          active: workflow.active,
          config_fields: workflowAnalysis.fields || [],
          prompt_instructions: workflowAnalysis.promptInstructions || '',
          credentials_required: workflowAnalysis.credentialsRequired || [],
          created_at: workflow.createdAt,
          updated_at: workflow.updatedAt
        };
      }) : [];

    console.log(`Found ${templates.length} PET workflows (active and inactive)`);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching ETF templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Deploy ETF workflow for client (temporarily without auth for testing)
app.post('/api/etf/deploy', async (req, res) => {
  try {
    console.log('📋 ETF Deploy request received:', JSON.stringify(req.body, null, 2));

    let { client_data, config_data, template_ids } = req.body; // Changed template_id to template_ids to handle multiple

    // Validate required data
    if (!client_data || !client_data.name) {
      console.error('❌ Validation failed: Missing client data');
      return res.status(400).json({
        success: false,
        error: 'Client data with name is required',
        details: 'Missing or invalid client_data.name'
      });
    }

    // Check N8N configuration
    if (!N8N_BASE_URL || !N8N_API_KEY) {
      console.error('❌ N8N configuration missing');
      return res.status(500).json({
        success: false,
        error: 'ETF service not configured',
        details: 'N8N_BASE_URL or N8N_API_KEY not set'
      });
    }

    if (!config_data) {
      config_data = {}; // Provide default empty config
    }

    console.log('📋 Processing deployment request:', {
      clientName: client_data.name,
      configKeys: Object.keys(config_data).length
    });

    // Auto-create Google Sheets if Google OAuth is connected
    let createdSheets = {};
    const hasGoogleOAuth = req.session?.google_access_token || config_data.google_access_token;

    if (hasGoogleOAuth) {
      console.log('🔗 Google OAuth detected, creating required Google Sheets...');
      try {
        createdSheets = await createRequiredGoogleSheets(client_data, req.session?.google_access_token || config_data.google_access_token);

        // Update config_data with created sheet IDs
        Object.assign(config_data, createdSheets);
        console.log('✅ Created Google Sheets:', Object.keys(createdSheets));
      } catch (sheetError) {
        console.warn('⚠️ Could not auto-create Google Sheets:', sheetError.message);
        // Continue with deployment even if sheet creation fails
      }
    }

    // Test N8N connection first
    try {
      console.log('🔍 Testing N8N connection...');
      const testResponse = await n8nClient.getWorkflows();
      console.log('✅ N8N connection successful');
    } catch (connectionError) {
      console.error('❌ N8N connection failed:', connectionError.message);
      return res.status(500).json({
        success: false,
        error: 'Cannot connect to N8N service',
        details: connectionError.message
      });
    }

    // Handle test mode - use actual PET workflows when template_id is "pet_clinic_test"
    let templateIds;
    
    if (template_id === 'pet_clinic_test' || req.body.test_mode) {
      console.log('🧪 Test mode detected - fetching all available PET workflows');
      
      // Get all PET workflows for test deployment
      try {
        const workflows = await n8nClient.getWorkflows();
        const petWorkflows = workflows.data ? 
          workflows.data.filter(workflow => {
            const workflowTags = workflow.tags || [];
            return Array.isArray(workflowTags) && workflowTags.some(tag => {
              if (typeof tag === 'string') {
                return tag.toLowerCase() === 'pet';
              } else if (tag && typeof tag === 'object' && tag.name) {
                return tag.name.toLowerCase() === 'pet';
              }
              return false;
            });
          }).map(w => w.id) : [];
        
        if (petWorkflows.length === 0) {
          throw new Error('No PET workflows found in N8N for test deployment');
        }
        
        templateIds = petWorkflows;
        console.log(`🧪 Using ${templateIds.length} PET workflows for test: ${templateIds.join(', ')}`);
        
      } catch (error) {
        throw new Error(`Failed to fetch PET workflows for test: ${error.message}`);
      }
    } else {
      // Production mode - use provided template_ids
      templateIds = Array.isArray(template_ids) ? template_ids : [template_ids].filter(Boolean);
      
      if (templateIds.length === 0) {
        throw new Error('No template IDs provided for deployment.');
      }
    }

    console.log(`🔍 Found ${templateIds.length} specified PET workflows to duplicate`);

    const duplicatedWorkflows = [];
    const client_id = uuidv4();

    // Personalize workflows, handling inter-workflow dependencies
    const personalizationResult = await personalizeMultipleWorkflows(templateIds, configData, clientData);

    if (personalizationResult.errors.length > 0) {
      console.warn(`⚠️ Some workflows had errors during personalization:`, personalizationResult.errors);
    }

    // Tag all successfully created workflows with a client identifier
    const clientTag = `PET[${clientData.name}]`;
    
    // Create credentials for this client
    const credentialMappings = {};
    
    // Create Google Services credential (Gmail SMTP, Sheets, Calendar)
    if (req.session?.google_access_token) {
      const googleCredentialId = await createN8NCredential(
        clientData.email, 
        {
          access_token: req.session.google_access_token,
          refresh_token: req.session.google_refresh_token
        }, 
        { name: clientData.name, email: clientData.email }
      );
      
      if (googleCredentialId.success) {
        credentialMappings['googleSheetsOAuth2Api'] = googleCredentialId.credentialId;
        credentialMappings['googleCalendarOAuth2Api'] = googleCredentialId.credentialId;
        
        // Create Gmail SMTP credential
        const gmailCredentialId = await createGmailSMTPCredential(
          clientData.email,
          req.session.google_access_token,
          req.session.google_refresh_token,
          clientTag
        );
        if (gmailCredentialId) {
          credentialMappings['gmailOAuth2'] = gmailCredentialId;
        }
      }
    }
    
    // Create Calendly OAuth credential (when ready)
    const calendlyCredentialId = await createCalendlyOAuthCredential(clientTag);
    if (calendlyCredentialId) {
      credentialMappings['calendlyOAuth2Api'] = calendlyCredentialId;
    }

    for (const result of personalizationResult.results) {
      if (result.success) {
        try {
          await n8nClient.updateWorkflowTags(result.newId, [{ name: clientTag }]);
          console.log(`🏷️ Tagged workflow ${result.newId} with "${clientTag}"`);
          
          // Apply credentials to this workflow
          await applyCredentialsToWorkflow(result.newId, credentialMappings);
        } catch (tagError) {
          console.warn(`⚠️ Could not tag workflow ${result.newId}:`, tagError.message);
        }
      }
    }

    // Log the workflow dependency mappings
    console.log(`\n🔗 Inter-workflow Dependencies Resolved:`);
    console.log(`   Original templates now reference personalized workflows`);
    console.log(`   Example: If template referenced "WF3", it now references "[${clientData.name}] WF3"`);
    if (personalizationResult.workflowIdMappings) {
      Object.entries(personalizationResult.workflowIdMappings).forEach(([original, personalized]) => {
        console.log(`   ${original} → ${personalized}`);
      });
    }

    // Generate OpenAI API key for this client
    let openaiKeyGenerated = false;
    try {
      const assignedKey = assignKeyToClient(client_id, templateIds[0] || 'multiple_workflows', 100000);
      console.log(`✅ Auto-generated OpenAI key for client ${client_id}`);
      openaiKeyGenerated = true;
    } catch (keyError) {
      console.warn(`⚠️ Could not auto-generate OpenAI key for client ${client_id}:`, keyError.message);
    }

    // Save deployment records and attempt activation for each personalized workflow
    for (const result of personalizationResult.results) {
      if (!result.success) {
        duplicatedWorkflows.push({
          original_id: result.originalId,
          original_name: `(Error fetching original workflow: ${result.error})`,
          new_id: null,
          new_name: null,
          deployment_id: null,
          activation_status: 'failed_creation',
          activation_error: result.error
        });
        continue;
      }

      try {
        const newWorkflowId = result.newId;
        const newWorkflowName = result.name;

        // Save deployment record
        const deployment_id = uuidv4();
        await new Promise((resolve, reject) => {
          etfDB.run(
            `INSERT INTO etf_deployments (id, client_id, template_id, n8n_workflow_id, workflow_name, taskforce_type, config_data) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [deployment_id, client_id, result.originalId, newWorkflowId, newWorkflowName, 
             'general', JSON.stringify(config_data)],
            (err) => err ? reject(err) : resolve()
          );
        });

        // Track activation status for summary
        let activationStatus = 'activated';
        let activationError = null;

        // Check if workflow can be activated before attempting activation
        try {
          const canActivate = await n8nClient.canActivateWorkflow(newWorkflowId);
          if (canActivate) {
            // Try to activate workflow
            await n8nClient.activateWorkflow(newWorkflowId);
            console.log(`✅ Workflow ${newWorkflowId} activated successfully`);
          } else {
            console.log(`ℹ️ Workflow ${newWorkflowId} skipped activation (no trigger node)`);
            activationStatus = 'no_trigger';
          }
        } catch (activationError_caught) {
          console.warn(`⚠️ Could not activate workflow ${newWorkflowId}: ${activationError_caught.message}`);

          activationStatus = 'failed';
          activationError = activationError_caught.message;

          // Log specific error types for debugging
          if (activationError.includes('credentials')) {
            console.log(`📝 Note: Workflow ${newWorkflowId} needs credentials to be configured before activation`);
            activationStatus = 'needs_credentials';
          } else if (activationError.includes('cron')) {
            console.log(`📝 Note: Workflow ${newWorkflowId} has invalid cron expression - needs manual fix`);
            activationStatus = 'invalid_cron';
          } else if (activationError.includes('trim')) {
            console.log(`📝 Note: Workflow ${newWorkflowId} has configuration issues - needs manual review`);
            activationStatus = 'config_error';
          }
        }

        duplicatedWorkflows.push({
          original_id: result.originalId,
          original_name: result.name,
          new_id: newWorkflowId,
          new_name: newWorkflowName,
          deployment_id: deployment_id,
          activation_status: activationStatus,
          activation_error: activationError
        });

      } catch (workflowError) {
        console.error(`❌ Failed to process personalized workflow ${result.newId}:`, workflowError.message);
        duplicatedWorkflows.push({
          original_id: result.originalId,
          original_name: result.name,
          new_id: result.newId,
          new_name: result.name,
          deployment_id: null,
          activation_status: 'processing_error',
          activation_error: workflowError.message
        });
      }
    }

    // Insert client record (only once for all workflows) with proper email association
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT OR IGNORE INTO etf_clients (id, name, email, company, industry, taskforce_type) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [client_id, client_data.name, client_data.email || 'unknown@example.com', client_data.name, 
         'Pet Clinic', 'dental'],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Log the initial deployment to history
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT INTO etf_client_history (client_id, action, details, timestamp)
         VALUES (?, ?, ?, ?)`,
        [client_id, 'Initial Deployment', `Deployed ${duplicatedWorkflows.length} workflows for ${client_data.name}`, new Date().toISOString()],
        (err) => err ? reject(err) : resolve()
      );
    });

    if (duplicatedWorkflows.length === 0) {
      throw new Error('Failed to create or process any workflows.');
    }

    // Count activation statuses for summary
    const activatedCount = duplicatedWorkflows.filter(w => 
      w.activation_status === 'activated'
    ).length;
    const needsCredentialsCount = duplicatedWorkflows.filter(w => 
      w.activation_status === 'needs_credentials'
    ).length;
    const noTriggerCount = duplicatedWorkflows.filter(w => 
      w.activation_status === 'no_trigger'
    ).length;
    const failedCount = duplicatedWorkflows.filter(w => 
      w.activation_status === 'failed' || w.activation_status === 'processing_error' || w.activation_status === 'failed_creation'
    ).length;

    res.json({
      success: true,
      client_id: client_id,
      duplicated_workflows: duplicatedWorkflows,
      total_processed: duplicatedWorkflows.length,
      activated_workflows: activatedCount,
      workflows_needing_credentials: needsCredentialsCount,
      workflows_with_no_trigger: noTriggerCount,
      failed_workflows: failedCount,
      tag_applied: clientTag,
      openai_key_generated: openaiKeyGenerated,
      message: `Successfully processed ${duplicatedWorkflows.length} workflows for ${clientData.name}. ${activatedCount} activated, ${needsCredentialsCount} need credentials, ${failedCount} failed.${openaiKeyGenerated ? ' Personal OpenAI key generated.' : ''}`
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
    } else if (error.message.includes('No template IDs provided')) {
      userMessage = 'No workflows selected for deployment';
    } else if (error.message.includes('Failed to create or process any workflows')) {
      userMessage = 'Failed to deploy any selected workflows';
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
            return tag.toLowerCase() === 'pet';
          } else if (tag && typeof tag === 'object' && tag.name) {
            // Handle N8N tag objects with name property
            return tag.name.toLowerCase() === 'pet';
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

// Test Telegram credentials endpoint
app.post('/api/etf/test-telegram-credentials', async (req, res) => {
  try {
    const { bot_token, chat_id } = req.body;

    if (!bot_token || !chat_id) {
      return res.status(400).json({ error: 'Bot token and chat ID are required' });
    }

    // Test the credentials by sending a test message
    const testUrl = `https://api.telegram.org/bot${bot_token}/sendMessage`;
    const testResponse = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat_id,
        text: '🧪 ETF Credential Test - Your Telegram bot is working correctly!'
      })
    });

    const testResult = await testResponse.json();

    if (testResult.ok) {
      res.json({ 
        success: true,        message: 'Credentials validated successfully!',
        bot_info: testResult.result 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid credentials or chat ID',
        details: testResult.description 
      });
    }
  } catch (error) {
    console.error('❌ Telegram credential test failed:', error);
    res.status(500).json({ error: 'Failed to test credentials' });
  }
});

// Create Telegram credentials in N8N
app.post('/api/etf/create-telegram-credentials', async (req, res) => {
  try {
    const { telegram_bot_token, credential_name } = req.body;

    console.log('🔑 Creating Telegram credentials in N8N...');

    const credentialData = {
      name: credential_name || `Telegram Bot - ${new Date().toISOString().split('T')[0]}`,
      type: "telegramApi",
      data: {
        accessToken: telegram_bot_token
      }
    };

    console.log('Making N8N API request: POST', `${N8N_BASE_URL}/api/v1/credentials`);

    const response = await fetch(`${N8N_BASE_URL}/api/v1/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      },
      body: JSON.stringify(credentialData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ N8N credential creation failed:', response.status, errorText);
      throw new Error(`N8N API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Telegram credentials created successfully:', result.id);

    res.json({
      success: true,
      credential_id: result.id,
      credential_name: result.name
    });

  } catch (error) {
    console.error('❌ Failed to create Telegram credentials:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create credentials',
      details: error.message 
    });
  }
});

// Validate Telegram credentials
app.post('/api/etf/validate-telegram-credentials', async (req, res) => {
  try {
    const { telegram_bot_token, telegram_chat_id } = req.body;

    if (!telegram_bot_token || !telegram_chat_id) {
      return res.status(400).json({
        success: false,
        error: 'Both telegram_bot_token and telegram_chat_id are required'
      });
    }

    // Basic format validation
    if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(telegram_bot_token)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bot token format'
      });
    }

    if (!/^-?\d+$/.test(telegram_chat_id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid chat ID format'
      });
    }

    // Test the bot token by making a call to Telegram API
    try {
      const response = await axios.get(`https://api.telegram.org/bot${telegram_bot_token}/getMe`);

      if (!response.data.ok) {
        return res.status(400).json({
          success: false,
          error: 'Invalid bot token - Telegram API rejected it'
        });
      }

      const botInfo = response.data.result;

      res.json({
        success: true,
        message: 'Telegram credentials validated successfully',
        bot_info: {
          name: botInfo.first_name,
          username: botInfo.username,
          can_join_groups: botInfo.can_join_groups,
          can_read_all_group_messages: botInfo.can_read_all_group_messages
        }
      });

    } catch (telegramError) {
      console.error('Telegram API validation error:', telegramError.message);
      res.status(400).json({
        success: false,
        error: 'Failed to validate bot token with Telegram API'
      });
    }

  } catch (error) {
    console.error('Credential validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during validation'
    });
  }
});

// ETF Client Control Panel API endpoints

// Get client deployments by email
app.get('/api/etf/client-deployments', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Get client by email
    const clientSql = `SELECT * FROM etf_clients WHERE email = ?`;

    etfDB.all(clientSql, [email], (err, clients) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch client data' });
      }

      if (clients.length === 0) {
        return res.json({ deployments: [] });
      }

      // Get deployments for these clients
      const clientIds = clients.map(c => c.id);
      const deploymentSql = `
        SELECT 
          etf_deployments.*,
          etf_clients.name as client_name,
          etf_clients.email as client_email,
          (SELECT COUNT(*) FROM etf_deployments d2 WHERE d2.client_id = etf_deployments.client_id) as total_workflows
        FROM etf_deployments 
        JOIN etf_clients ON etf_deployments.client_id = etf_clients.id
        WHERE etf_deployments.client_id IN (${clientIds.map(() => '?').join(',')})
        ORDER BY etf_deployments.deployed_at DESC
      `;

      etfDB.all(deploymentSql, clientIds, (err, deployments) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch deployments' });
        }

        // Group by client for easier handling
        const groupedDeployments = [];
        const clientMap = new Map();

        deployments.forEach(deployment => {
          if (!clientMap.has(deployment.client_id)) {
            clientMap.set(deployment.client_id, {
              client_id: deployment.client_id,
              client_name: deployment.client_name,
              client_email: deployment.client_email,
              created_at: deployment.deployed_at,
              total_workflows: deployment.total_workflows,
              workflows: []
            });
            groupedDeployments.push(clientMap.get(deployment.client_id));
          }

          clientMap.get(deployment.client_id).workflows.push({
            deployment_id: deployment.id,
            workflow_name: deployment.workflow_name,
            n8n_workflow_id: deployment.n8n_workflow_id,
            status: deployment.status,
            deployed_at: deployment.deployed_at
          });
        });

        res.json({ deployments: groupedDeployments });
      });
    });

  } catch (error) {
    console.error('Error fetching client deployments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get client configuration
app.get('/api/etf/client-config/:clientId', (req, res) => {
  const { clientId } = req.params;

  const sql = `
    SELECT config_data 
    FROM etf_deployments 
    WHERE client_id = ? 
    ORDER BY deployed_at DESC 
    LIMIT 1
  `;

  etfDB.get(sql, [clientId], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ 
      config: row.config_data,
      client_id: clientId 
    });
  });
});

// Get client workflows
app.get('/api/etf/client-workflows/:clientId', (req, res) => {
  const { clientId } = req.params;

  const sql = `
    SELECT 
      id,
      template_id,
      n8n_workflow_id,
      workflow_name,
      status,
      deployed_at
    FROM etf_deployments 
    WHERE client_id = ?
    ORDER BY deployed_at DESC
  `;

  etfDB.all(sql, [clientId], (err, workflows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch workflows' });
    }

    // Add N8N URLs to workflows
    const workflowsWithUrls = workflows.map(workflow => ({
      ...workflow,
      n8n_url: `${N8N_BASE_URL}/workflow/${workflow.n8n_workflow_id}`
    }));

    res.json({ workflows: workflowsWithUrls });
  });
});

// Update client configuration
app.post('/api/etf/update-client-config/:clientId', (req, res) => {
  const { clientId } = req.params;
  const { config, changes } = req.body;

  if (!config) {
    return res.status(400).json({ error: 'Configuration data is required' });
  }

  // Start transaction
  etfDB.serialize(() => {
    etfDB.run('BEGIN TRANSACTION');

    // Update all deployments for this client with new config
    const updateSql = `
      UPDATE etf_deployments 
      SET config_data = ?
      WHERE client_id = ?
    `;

    etfDB.run(updateSql, [JSON.stringify(config), clientId], function(err) {
      if (err) {
        console.error('Error updating config:', err);
        etfDB.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to update configuration' });
      }

      // Log the change to history
      if (changes && Object.keys(changes).length > 0) {
        const changeDetails = Object.entries(changes).map(([field, change]) => 
          `${field}: "${change.old}" → "${change.new}"`
        ).join(', ');

        const historySql = `
          INSERT INTO etf_client_history (client_id, action, details, timestamp)
          VALUES (?, ?, ?, ?)
        `;

        etfDB.run(historySql, [
          clientId,
          'Configuration Updated',
          `Updated ${Object.keys(changes).length} fields: ${changeDetails}`,
          new Date().toISOString()
        ], (historyErr) => {
          if (historyErr) {
            console.warn('Failed to log change history:', historyErr);
          }

          etfDB.run('COMMIT');
          console.log(`✅ Configuration updated for client ${clientId}`);

          res.json({
            success: true,
            message: 'Configuration updated successfully',
            changes_applied: Object.keys(changes).length
          });
        });
      } else {
        etfDB.run('COMMIT');
        res.json({
          success: true,
          message: 'Configuration updated successfully',
          changes_applied: 0
        });
      }
    });
  });
});

// Get client change history
app.get('/api/etf/client-history/:clientId', (req, res) => {
  const { clientId } = req.params;

  const sql = `
    SELECT action, details, timestamp
    FROM etf_client_history 
    WHERE client_id = ?
    ORDER BY timestamp DESC
    LIMIT 50
  `;

  etfDB.all(sql, [clientId], (err, history) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch change history' });
    }

    res.json({ history: history || [] });
  });
});

// ETF Client Panel route
app.get('/etf-client-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'etf-client-panel.html'));
});

// Test endpoint to personalize the Telegram workflow
app.post('/api/etf/test-personalize-telegram', async (req, res) => {
  try {
    const workflowId = 'N0r2q9lHBESKEnwA'; // The Telegram workflow ID

    // Sample client data for Pet Clinic
    const clientData = {
      name: 'Happy Paws Veterinary Clinic',
      email: 'info@happypaws.com',
      phone: '+1-555-123-4567'
    };

    // Sample configuration data with Telegram credentials
    const configData = {
      business_name: 'Happy Paws Veterinary Clinic',
      business_email: 'info@happypaws.com',
      business_phone: '+1-555-123-4567',
      pet_clinic_name: 'Happy Paws Veterinary Clinic',
      clinic_address: '123 Pet Street, Animal City, AC 12345',
      clinic_hours: 'Mon-Fri: 8AM-6PM, Sat: 9AM-3PM, Sun: Emergency Only',
      emergency_contact: '+1-555-EMERGENCY',
      services_offered: 'Vaccinations, Surgery, Dental Care, Emergency Services, Grooming',
      telegram_bot_token: 'YOUR_BOT_TOKEN_HERE',
      telegram_chat_id: 'YOUR_CHAT_ID_HERE',
      clinic_phone: '+1-555-123-4567',
      clinic_email: 'info@happypaws.com'
    };

    console.log(`🧪 Testing personalization of Telegram workflow ${workflowId}`);

    // Get the original workflow
    const originalWorkflow = await n8nClient.getWorkflow(workflowId);

    // Personalize the workflow nodes
    const personalizedNodes = personalizeWorkflowNodes(
      originalWorkflow.nodes || [], 
      configData, 
      clientData
    );

    // Create personalized workflow data
    const personalizedWorkflow = {
      name: `[${clientData.name}] ${originalWorkflow.name}`,
      nodes: personalizedNodes,
      connections: originalWorkflow.connections || {},
      settings: originalWorkflow.settings || {},
      staticData: originalWorkflow.staticData || {}
    };

    // Create the new workflow
    const newWorkflow = await n8nClient.createWorkflow(personalizedWorkflow);
    console.log(`✅ Personalized workflow created with ID: ${newWorkflow.id}`);

    // Add tag to identify it as a personalized Pet Clinic workflow
    try {
      const tagName = `PET[${clientData.name}]`;
      await n8nClient.createTag(tagName);
      await n8nClient.updateWorkflowTags(newWorkflow.id, [{ name: tagName }]);
      console.log(`✅ Tag "${tagName}" added to workflow ${newWorkflow.id}`);
    } catch (tagError) {
      console.warn(`⚠️ Could not add tag: ${tagError.message}`);
    }

    // Try to activate the workflow
    try {
      const canActivate = await n8nClient.canActivateWorkflow(newWorkflow.id);
      if (canActivate) {
        await n8nClient.activateWorkflow(newWorkflow.id);
        console.log(`✅ Workflow ${newWorkflow.id} activated successfully`);
      } else {
        console.log(`ℹ️ Workflow ${newWorkflow.id} cannot be activated (no trigger node)`);
      }
    } catch (activationError) {
      console.warn(`⚠️ Could not activate workflow: ${activationError.message}`);
    }

    res.json({
      success: true,
      message: `Telegram workflow personalized for ${clientData.name}`,
      original_workflow: {
        id: workflowId,
        name: originalWorkflow.name
      },
      personalized_workflow: {
        id: newWorkflow.id,
        name: newWorkflow.name,
        url: `${N8N_BASE_URL}/workflow/${newWorkflow.id}`
      },
      personalization_applied: {
        client_data: clientData,
        config_data: configData,
        placeholders_replaced: Object.keys(personalizeParameters({}, configData, clientData)).length
      },
      next_steps: [
        'Update Telegram Bot Token with your actual bot token',
        'Set the correct Telegram Chat ID',
        'Review and test the workflow in N8N',
        'Activate the workflow when ready'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Telegram workflow personalization error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Check server logs for full error details'
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

// ========================================
// OpenAI Key Budget System
// ========================================

// Generate OpenAI key for client when workflow is duplicated
app.post('/api/client/generate-openai-key', async (req, res) => {
  try {
    const { client_id, workflow_id, token_limit } = req.body;

    if (!client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required'
      });
    }

    console.log(`🔑 Generating OpenAI key for client: ${client_id}`);

    const apiKey = assignKeyToClient(client_id, workflow_id, token_limit || 100000);

    res.json({
      success: true,
      message: 'OpenAI API key assigned successfully',
      client_id: client_id,
      key_assigned: true,
      token_limit: token_limit || 100000,
      key_preview: apiKey.substring(0, 7) + '...' + apiKey.slice(-4)
    });

  } catch (error) {
    console.error('❌ Error generating OpenAI key:', error);
    
    if (error.message.includes('No available OpenAI keys')) {
      return res.status(503).json({
        success: false,
        error: 'No available API keys. Please contact administrator.',
        details: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate OpenAI key',
      details: error.message
    });
  }
});

// Client GPT endpoint - uses their assigned key and tracks usage
app.post('/api/client/ask-gpt', async (req, res) => {
  try {
    const { client_id, prompt, messages, model } = req.body;

    if (!client_id || (!prompt && !messages)) {
      return res.status(400).json({
        error: 'Client ID and prompt/messages are required'
      });
    }

    // Get client data
    const clientData = getClientData(client_id);
    if (!clientData) {
      return res.status(404).json({
        error: 'Client not found. Please generate an OpenAI key first.'
      });
    }

    // Count tokens for the request
    let inputTokens = 0;
    if (messages && Array.isArray(messages)) {
      inputTokens = countConversationTokens(messages);
    } else if (prompt) {
      inputTokens = countTokens(prompt);
    }

    // Check if client has budget for this request (estimate)
    const estimatedTokens = inputTokens + 500; // Add buffer for response
    if (!checkBudget(client_id, estimatedTokens)) {
      return res.status(429).json({
        error: 'Monthly token limit reached',
        usage: {
          used_tokens: clientData.used_tokens,
          limit_tokens: clientData.limit_tokens,
          percentage: Math.round((clientData.used_tokens / clientData.limit_tokens) * 100)
        }
      });
    }

    const selectedModel = model || 'gpt-3.5-turbo';
    const clientApiKey = clientData.openai_key;

    // Prepare messages for OpenAI
    let finalMessages = [];
    if (messages && Array.isArray(messages)) {
      finalMessages = messages;
    } else if (prompt) {
      finalMessages = [{ role: 'user', content: prompt }];
    }

    // Make request to OpenAI using client's assigned key
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientApiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: finalMessages,
        max_tokens: 1500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const responseMessage = data.choices[0].message;

    // Count response tokens and update usage
    const outputTokens = countTokens(responseMessage.content);
    const totalTokensUsed = inputTokens + outputTokens;

    // Update client's token usage
    const updatedClientData = updateTokenUsage(client_id, totalTokensUsed);

    console.log(`📊 Client ${client_id} used ${totalTokensUsed} tokens (${updatedClientData.used_tokens}/${updatedClientData.limit_tokens} total)`);

    res.json({
      message: responseMessage,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokensUsed,
        used_tokens: updatedClientData.used_tokens,
        limit_tokens: updatedClientData.limit_tokens,
        percentage: Math.round((updatedClientData.used_tokens / updatedClientData.limit_tokens) * 100)
      },
      model: selectedModel
    });

  } catch (error) {
    console.error('❌ Client GPT request failed:', error);
    res.status(500).json({
      error: 'Failed to process GPT request',
      details: error.message
    });
  }
});

// Get client's token usage
app.get('/api/client/usage/:client_id', (req, res) => {
  try {
    const { client_id } = req.params;
    const clientData = getClientData(client_id);

    if (!clientData) {
      return res.status(404).json({
        error: 'Client not found'
      });
    }

    const percentage = Math.round((clientData.used_tokens / clientData.limit_tokens) * 100);

    res.json({
      client_id: client_id,
      used_tokens: clientData.used_tokens,
      limit_tokens: clientData.limit_tokens,
      percentage: percentage,
      reset_date: clientData.reset_date,
      last_used: clientData.last_used,
      status: percentage >= 100 ? 'limit_reached' : percentage >= 80 ? 'warning' : 'ok'
    });

  } catch (error) {
    console.error('❌ Error fetching usage:', error);
    res.status(500).json({
      error: 'Failed to fetch usage data',
      details: error.message
    });
  }
});

// Admin endpoints for key management
app.post('/api/admin/openai-keys', (req, res) => {
  try {
    const { keys } = req.body;

    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({
        error: 'Keys array is required'
      });
    }

    const addedKeys = addKeysToPool(keys);

    res.json({
      success: true,
      message: `Added ${addedKeys.length} keys to pool`,
      added_keys: addedKeys.length,
      key_previews: addedKeys.map(key => key.substring(0, 7) + '...' + key.slice(-4))
    });

  } catch (error) {
    console.error('❌ Error adding keys:', error);
    res.status(500).json({
      error: 'Failed to add keys',
      details: error.message
    });
  }
});

// Get OpenAI key pool statistics
app.get('/api/admin/pool-stats', (req, res) => {
  try {
    const stats = getPoolStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching pool stats:', error);
    res.status(500).json({
      error: 'Failed to fetch pool statistics',
      details: error.message
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

// Create Google credentials in N8N
app.post('/api/etf/create-google-credential', async (req, res) => {
  try {
    const { name, type, data } = req.body;

    if (!name || !type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Name, type, and data are required'
      });
    }

    console.log('🔑 Creating Google credential:', { name, type });

    // Validate Google credential types
    const validGoogleTypes = [
      'googleSheetsOAuth2Api',
      'googleDriveOAuth2Api', 
      'googleCalendarOAuth2Api',
      'googleApi'
    ];

    if (!validGoogleTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid Google credential type. Valid types: ${validGoogleTypes.join(', ')}`
      });
    }

    // Create credential data structure
    const credentialData = {
      name: name,
      type: type,
      data: data
    };

    console.log('Making N8N API request: POST', `${N8N_BASE_URL}/api/v1/credentials`);

    const response = await fetch(`${N8N_BASE_URL}/api/v1/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      },
      body: JSON.stringify(credentialData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ N8N credential creation failed:', response.status, errorText);

      let errorMessage = `N8N API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('✅ Google credential created successfully:', result.id);

    res.json({
      success: true,
      credential: {
        id: result.id,
        name: result.name,
        type: result.type,
        createdAt: result.createdAt || new Date().toISOString()
      },
      message: `Google credential "${name}" created successfully`
    });

  } catch (error) {
    console.error('❌ Failed to create Google credential:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create credential',
      details: error.message 
    });
  }
});

// List all Google credentials
app.get('/api/etf/list-google-credentials', async (req, res) => {
  try {
    console.log('📋 Listing Google credentials...');

    const response = await fetch(`${N8N_BASE_URL}/api/v1/credentials`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`N8N API error: ${response.status}`);
    }

    const result = await response.json();
    const credentials = Array.isArray(result) ? result : (result.data || []);

    // Filter for Google-related credentials
    const googleCredentials = credentials.filter(cred => {
      const type = cred.type?.toLowerCase() || '';
      return type.includes('google') || 
             type.includes('sheets') || 
             type.includes('drive') || 
             type.includes('calendar');
    });

    console.log(`✅ Found ${googleCredentials.length} Google credentials`);

    res.json({
      success: true,
      total: googleCredentials.length,
      credentials: googleCredentials.map(cred => ({
        id: cred.id,
        name: cred.name,
        type: cred.type,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      }))
    });

  } catch (error) {
    console.error('❌ Failed to list Google credentials:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list credentials',
      details: error.message 
    });
  }
});

// Google OAuth test callback endpoint
app.get('/auth/google/oauth-test-callback', (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/test-google-oauth?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    return res.redirect(`/test-google-oauth?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`);
  }

  res.redirect('/test-google-oauth?error=no_code_received');
});

// Test Google credential access
app.post('/api/etf/test-google-credential/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    if (!credentialId) {
      return res.status(400).json({
        success: false,
        error: 'Credential ID is required'
      });
    }

    console.log('🧪 Testing Google credential:', credentialId);

    // Get credential details
    const response = await fetch(`${N8N_BASE_URL}/api/v1/credentials/${credentialId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`N8N API error: ${response.status}`);
    }

    const credential = await response.json();

    res.json({
      success: true,
      credential: {
        id: credential.id,
        name: credential.name,
        type: credential.type,
        createdAt: credential.createdAt
      },
      message: `Credential ${credential.name} is accessible`,
      test_status: 'accessible'
    });

  } catch (error) {
    console.error('❌ Failed to test Google credential:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test credential',
      details: error.message 
    });
  }
});

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
  if (!req.session.user) { // Changed from !req.user to !req.session.user
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Middleware to check if user has premium access
function requirePremium(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // First check session for user data, then fallback to saved data
  let userData = req.user.savedUserData;
  if (!userData) {
    const userEmail = req.user.emails?.[0]?.value;
    userData = findUserByEmail(userEmail);
  }

  console.log('Premium check - User ID:', req.user.id, 'Email:', req.user.emails?.[0]?.value, 'User record found:', !!userData);

  if (!userData) {
    console.log('❌ No user record found for:', req.user.emails?.[0]?.value || req.user.id);
    return res.status(403).json({ error: 'Premium access required' });
  }

  // Check subscription expiration for monthly subscribers
  if (userData.subscriptionType === 'monthly' && userData.subscriptionExpiresAt) {
    const now = new Date();
    const expirationDate = new Date(userData.subscriptionExpiresAt);

    if (now > expirationDate) {
      console.log('❌ Subscription expired for user:', userData.email, 'Expired at:', expirationDate);

      // Update user record to reflect expired status
      userData.isPremium = false;
      userData.subscriptionStatus = 'expired';
      
      // Update the session and savedUserData if available
      if (req.user.savedUserData) {
        req.user.savedUserData.isPremium = false;
        req.user.savedUserData.subscriptionStatus = 'expired';
      }
      if (req.session.user) {
        req.session.user.isPremium = false;
        req.session.user.subscriptionStatus = 'expired';
      }

      // Save updated user data
      saveUser(userData);

      return res.status(403).json({ 
        error: 'Subscription expired', 
        message: 'Your monthly subscription has expired. Please renew to continue using premium features.',
        expirationDate: expirationDate.toISOString()
      });
    }
  }

  // Check if user has active premium access
  const hasValidSubscription = userData.isPremium && 
    (userData.subscriptionStatus === 'active' || userData.hasUnlimitedAccess);

  if (!hasValidSubscription) {
    console.log('❌ Premium access denied for user:', userData.email || req.user.id, 
                'Premium:', userData.isPremium, 'Status:', userData.subscriptionStatus);
    return res.status(403).json({ error: 'Premium access required' });
  }

  console.log('✅ Premium access granted for user:', userData.email);
  next();
}



app.get('/api/taskforce/clients', requireAuth, (req, res) => {
  const userId = req.user.id; // Use req.user.id for authenticated user ID

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
  const userId = req.user.id; // Use req.user.id for authenticated user ID

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
  console.log('🏥 Health check requested');
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Debug endpoint
app.get('/debug', (req, res) => {
  console.log('🐛 Debug endpoint requested');
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    env: {
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      REPL_SLUG: process.env.REPL_SLUG,
      REPL_OWNER: process.env.REPL_OWNER
    }
  });
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

// Enhanced Credential Management API

// Get all user credentials
app.get("/api/credentials", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userEmail = req.user.emails?.[0]?.value;
  if (!userEmail) {
    return res.status(400).json({ error: "User email not found" });
  }

  // Load user's credentials from secure storage
  const userCredentials = loadUserCredentials(userEmail);

  // Return credential status without sensitive data
  const credentialStatus = {};
  Object.keys(userCredentials).forEach(service => {
    const cred = userCredentials[service];
    credentialStatus[service] = {
      status: cred.isValid ? 'connected' : 'needs-auth',
      name: cred.name || null,
      connectedAt: cred.connectedAt || null,
      lastTested: cred.lastTested || null
    };
  });

  res.json(credentialStatus);
});

// Save API key credential
app.post("/api/credentials/:service/api-key", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { service } = req.params;
  const { apiKey, name } = req.body;
  const userEmail = req.user.emails?.[0]?.value;

  if (!apiKey) {
    return res.status(400).json({ error: "API key is required" });
  }

  try {
    // Encrypt and store the credential
    const encryptedKey = encryptCredential(apiKey);
    saveUserCredential(userEmail, service, {
      type: 'api-key',
      encryptedKey,
      name: name || `${service} API`,
      connectedAt: new Date().toISOString(),
      isValid: true
    });

    res.json({ 
      success: true, 
      message: `${service} credential saved successfully`,
      status: 'connected'
    });
  } catch (error) {
    console.error('Error saving credential:', error);
    res.status(500).json({ error: "Failed to save credential" });
  }
});

// Test credential connection
app.post("/api/credentials/:service/test", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { service } = req.params;
  const userEmail = req.user.emails?.[0]?.value;

  try {
    const credential = getUserCredential(userEmail, service);
    if (!credential) {
      return res.status(404).json({ error: "Credential not found" });
    }

    // Test the credential based on service type
    testCredentialConnection(service, credential)
      .then(isValid => {
        // Update credential validity
        updateCredentialValidity(userEmail, service, isValid);

        res.json({ 
          success: true, 
          isValid,
          message: isValid ? 'Connection test successful' : 'Connection test failed',
          testedAt: new Date().toISOString()
        });
      })
      .catch(error => {
        console.error('Credential test error:', error);
        res.status(500).json({ error: "Test failed" });
      });
  } catch (error) {
    console.error('Error testing credential:', error);
    res.status(500).json({ error: "Failed to test credential" });
  }
});

// Delete credential
app.delete("/api/credentials/:service", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { service } = req.params;
  const userEmail = req.user.emails?.[0]?.value;

  try {
    deleteUserCredential(userEmail, service);
    res.json({ 
      success: true, 
      message: `${service} credential deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({ error: "Failed to delete credential" });
  }
});

// OAuth credential callback handler
app.get("/api/credentials/:service/oauth/callback", (req, res) => {
  // This would handle OAuth callbacks for different services
  const { service } = req.params;
  const { code, state } = req.query;

  if (!req.isAuthenticated()) {
    return res.redirect('/login?error=not_authenticated');
  }

  // Handle OAuth token exchange based on service
  handleOAuthCallback(service, code, req.user.emails?.[0]?.value)
    .then(credential => {
      res.redirect(`/workflow-builder?credential_added=${service}`);
    })
    .catch(error => {
      console.error('OAuth callback error:', error);
      res.redirect(`/workflow-builder?error=oauth_failed`);
    });
});

// Helper functions for credential management
function loadUserCredentials(userEmail) {
  // In production, this would load from secure database
  const fs = require('fs');
  const path = './user_credentials.json';

  try {
    if (fs.existsSync(path)) {
      const data = JSON.parse(fs.readFileSync(path, 'utf8'));
      return data[userEmail] || {};
    }
  } catch (error) {
    console.error('Error loading credentials:', error);
  }

  return {};
}

function saveUserCredential(userEmail, service, credential) {
  const fs = require('fs');
  const path = './user_credentials.json';

  let data = {};
  try {
    if (fs.existsSync(path)) {
      data = JSON.parse(fs.readFileSync(path, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading credentials file:', error);
  }

  if (!data[userEmail]) {
    data[userEmail] = {};
  }

  data[userEmail][service] = credential;

  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving credentials:', error);
    throw error;
  }
}

function getUserCredential(userEmail, service) {
  const credentials = loadUserCredentials(userEmail);
  return credentials[service] || null;
}

function deleteUserCredential(userEmail, service) {
  const fs = require('fs');
  const path = './user_credentials.json';

  try {
    if (fs.existsSync(path)) {
      const data = JSON.parse(fs.readFileSync(path, 'utf8'));
      if (data[userEmail] && data[userEmail][service]) {
        delete data[userEmail][service];
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
      }
    }
  } catch (error) {
    console.error('Error deleting credential:', error);
    throw error;
  }
}

function encryptCredential(value) {
  // In production, use proper encryption
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = process.env.ENCRYPTION_KEY || 'fallback-key-32-characters-long';
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipher(algorithm, key);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptCredential(encryptedValue) {
  // In production, use proper decryption
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = process.env.ENCRYPTION_KEY || 'fallback-key-32-characters-long';

  const [ivHex, encrypted] = encryptedValue.split(':');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipher(algorithm, key);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

async function testCredentialConnection(service, credential) {
  // Mock credential testing - in production, make actual API calls
  const testPromises = {
    openai: () => testOpenAIKey(decryptCredential(credential.encryptedKey)),
    google: () => testGoogleCredential(credential),
    slack: () => testSlackCredential(credential),
    // Add more services as needed
  };

  const testFunction = testPromises[service];
  if (!testFunction) {
    throw new Error(`No test function for service: ${service}`);
  }

  return await testFunction();
}

async function testOpenAIKey(apiKey) {
  // Mock OpenAI test - in production, make actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(apiKey && apiKey.length > 10);
    }, 1000);
  });
}

async function testGoogleCredential(credential) {
  // Mock Google test
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), 500);
  });
}

async function testSlackCredential(credential) {
  // Mock Slack test
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), 750);
  });
}

function updateCredentialValidity(userEmail, service, isValid) {
  const credentials = loadUserCredentials(userEmail);
  if (credentials[service]) {
    credentials[service].isValid = isValid;
    credentials[service].lastTested = new Date().toISOString();

    // Save back to storage
    const fs = require('fs');
    const path = './user_credentials.json';

    let data = {};
    try {
      if (fs.existsSync(path)) {
        data = JSON.parse(fs.readFileSync(path, 'utf8'));
      }
    } catch (error) {
      console.error('Error reading credentials file:', error);
    }

    data[userEmail] = credentials;

    try {
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error updating credential:', error);
    }
  }
}

async function handleOAuthCallback(service, code, userEmail) {
  // Mock OAuth handling - in production, exchange code for tokens
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const credential = {
        type: 'oauth',
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        name: `${service} Account`,
        connectedAt: new Date().toISOString(),
        isValid: true
      };

      saveUserCredential(userEmail, service, credential);
      resolve(credential);
    }, 1000);
  });
}

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
  const tokenUsage = loadUsage();
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
    const user = users[req.session.user.googleId]; // Access googleId from session

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
// OAuth Flows for Multiple Services (n8n Credentials)
// ========================================

// Google OAuth Flow
app.post('/api/auth/google-n8n-oauth', (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in session for verification with callback to ensure it's saved
    req.session.n8nOAuthState = state;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session storage failed' });
      }

      // Use current domain for OAuth redirect
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const redirectUri = `${protocol}://${host}/api/auth/google-n8n-callback`;

      console.log('🔐 OAuth initiated with state:', state);
      console.log('🔗 Redirect URI:', redirectUri);

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive')}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${state}`;

      res.json({ authUrl });
    });
  } catch (error) {
    console.error('Error initiating Google OAuth for n8n:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

app.get('/api/auth/google-n8n-callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    console.log('🔄 OAuth callback received:', { 
      hasCode: !!code, 
      hasState: !!state, 
      error: error,
      sessionState: req.session.n8nOAuthState 
    });

    if (error) {
      console.error('Google OAuth error:', error);
      return res.redirect('/etf-onboard?error=oauth_denied');
    }

    if (!code || !state) {
      console.error('Missing OAuth parameters:', { code: !!code, state: !!state });
      return res.redirect('/etf-onboard?error=missing_params');
    }

    // Verify state parameter
    const sessionState = req.session.n8nOAuthState;
    if (!sessionState) {
      console.error('No session state found');
      return res.redirect('/etf-onboard?error=session_expired');
    }

    if (state !== sessionState) {
      console.error('State mismatch:', { received: state, expected: sessionState });
      return res.redirect('/etf-onboard?error=invalid_state');
    }

    console.log('✅ State validation passed');

    // Use dynamic redirect URI to match the request
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const redirectUri = `${protocol}://${host}/api/auth/google-n8n-callback`;

    console.log('🔗 Using redirect URI:', redirectUri);

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      throw new Error('Failed to obtain access token');
    }

    console.log('✅ Token exchange successful');

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const userInfo = await userInfoResponse.json();
    console.log('✅ User info retrieved:', userInfo.email);

    // Store tokens in session for automatic sheet creation
    req.session.google_access_token = tokenData.access_token;
    req.session.google_refresh_token = tokenData.refresh_token;
    req.session.google_user_email = userInfo.email;

    // Create n8n credential
    const credentialResult = await createN8NCredential(userInfo.email, tokenData, userInfo);

    if (credentialResult.success) {
      // Store credential ID in session as well
      req.session.google_credential_id = credentialResult.credentialId;

      // Clear OAuth state
      delete req.session.n8nOAuthState;
      req.session.save();

      console.log('✅ Google OAuth flow completed successfully');
      res.redirect('/etf-onboard?google_connected=true');
    } else {
      throw new Error('Failed to create n8n credential');
    }

  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    res.redirect('/etf-onboard?error=oauth_failed');
  }
});

// Facebook OAuth Flow
app.post('/api/auth/facebook-oauth', (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');

    req.session.facebookOAuthState = state;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session storage failed' });
      }

      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const redirectUri = `${protocol}://${host}/api/auth/facebook-callback`;

      const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${process.env.FACEBOOK_APP_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('pages_manage_posts,pages_read_engagement,pages_manage_metadata')}&` +
        `state=${state}`;

      res.json({ authUrl });
    });
  } catch (error) {
    console.error('Error initiating Facebook OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate Facebook OAuth flow' });
  }
});

app.get('/api/auth/facebook-callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('Facebook OAuth error:', error);
      return res.redirect('/etf-onboard?error=facebook_oauth_denied');
    }

    if (!code || !state || state !== req.session.facebookOAuthState) {
      return res.redirect('/etf-onboard?error=facebook_invalid_state');
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const redirectUri = `${protocol}://${host}/api/auth/facebook-callback`;

    // Exchange code for access token
    const tokenResponse = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.access_token) {
      req.session.facebook_access_token = tokenData.access_token;
      req.session.facebook_connected = true;
      delete req.session.facebookOAuthState;

      console.log('✅ Facebook OAuth completed successfully');
      res.redirect('/etf-onboard?facebook_connected=true');
    } else {
      throw new Error('Failed to obtain Facebook access token');
    }
  } catch (error) {
    console.error('Error in Facebook OAuth callback:', error);
    res.redirect('/etf-onboard?error=facebook_oauth_failed');
  }
});

// Slack OAuth Flow
app.post('/api/auth/slack-oauth', (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');

    req.session.slackOAuthState = state;

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session storage failed' });
      }

      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const redirectUri = `${protocol}://${host}/api/auth/slack-callback`;

      const authUrl = `https://slack.com/oauth/v2/authorize?` +
        `client_id=${process.env.SLACK_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent('chat:write,channels:read,users:read')}&` +
        `state=${state}`;

      res.json({ authUrl });
    });
  } catch (error) {
    console.error('Error initiating Slack OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate Slack OAuth flow' });
  }
});

app.get('/api/auth/slack-callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect('/etf-onboard?error=slack_oauth_denied');
    }

    if (!code || !state || state !== req.session.slackOAuthState) {
      return res.redirect('/etf-onboard?error=slack_invalid_state');
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const redirectUri = `${protocol}://${host}/api/auth/slack-callback`;

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.ok && tokenData.access_token) {
      req.session.slack_access_token = tokenData.access_token;
      req.session.slack_team_name = tokenData.team?.name || 'Slack Team';
      req.session.slack_connected = true;
      delete req.session.slackOAuthState;

      console.log('✅ Slack OAuth completed successfully');
      res.redirect('/etf-onboard?slack_connected=true');
    } else {
      throw new Error('Failed to obtain Slack access token');
    }
  } catch (error) {
    console.error('Error in Slack OAuth callback:', error);
    res.redirect('/etf-onboard?error=slack_oauth_failed');
  }
});

// GitHub OAuth Flow
app.post('/api/auth/github-oauth', (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');

    req.session.githubOAuthState = state;

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session storage failed' });
      }

      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const redirectUri = `${protocol}://${host}/api/auth/github-callback`;

      const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${process.env.GITHUB_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent('repo,user')}&` +
        `state=${state}`;

      res.json({ authUrl });
    });
  } catch (error) {
    console.error('Error initiating GitHub OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate GitHub OAuth flow' });
  }
});

app.get('/api/auth/github-callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect('/etf-onboard?error=github_oauth_denied');
    }

    if (!code || !state || state !== req.session.githubOAuthState) {
      return res.redirect('/etf-onboard?error=github_invalid_state');
    }

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.access_token) {
      req.session.github_access_token = tokenData.access_token;
      req.session.github_connected = true;
      delete req.session.githubOAuthState;

      console.log('✅ GitHub OAuth completed successfully');
      res.redirect('/etf-onboard?github_connected=true');
    } else {
      throw new Error('Failed to obtain GitHub access token');
    }
  } catch (error) {
    console.error('Error in GitHub OAuth callback:', error);
    res.redirect('/etf-onboard?error=github_oauth_failed');
  }
});

async function createN8NCredential(userEmail, tokenData, userInfo) {
  try {
    if (!N8N_BASE_URL || !N8N_API_KEY) {
      throw new Error('N8N configuration missing');
    }

    // Create Google Sheets OAuth2 credential which is more commonly used in N8N workflows
    const credentialData = {
      name: `Google Sheets - ${userInfo.name} (${userEmail})`,
      type: 'googleSheetsOAuth2Api',
      data: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        oauthTokenData: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || '',
          scope: tokenData.scope || 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
          token_type: tokenData.token_type || 'Bearer'
        }
      }
    };

    console.log('Creating n8n credential for:', userEmail);
    console.log('Credential data structure:', JSON.stringify(credentialData, null, 2));

    const response = await fetch(`${N8N_BASE_URL}/api/v1/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      },
      body: JSON.stringify(credentialData)
    });

    const result = await response.json();

    if (response.ok && result.id) {
      // Try to store credential ID in user's record
      try {
        if (fs.existsSync('./users.json')) {
          const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
          const userKey = Object.keys(users).find(key => users[key].email === userEmail);
          if (userKey) {
            users[userKey].n8nGoogleCredentialId = result.id;
            fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
          }
        }
      } catch (fileError) {
        console.warn('Could not save credential ID to user record:', fileError.message);
      }

      console.log(`Successfully created n8n Google Sheets credential for ${userEmail}:`, result.id);
      return { success: true, credentialId: result.id, credentialType: 'googleSheetsOAuth2Api' };
    } else {
      console.error('N8N API response error:', result);
      throw new Error(`N8N API error: ${result.message || JSON.stringify(result)}`);
    }

  } catch (error) {
    console.error('Error creating n8n credential:', error);
    return { success: false, error: error.message };
  }
}

// ========================================
// ETF Helper Functions
// ========================================

// Auto-create required Google Sheets for pet clinic workflows
async function createRequiredGoogleSheets(clientData, accessToken) {
  const createdSheets = {};
  const clinicName = clientData.name || 'Pet Clinic';

  console.log('📊 Creating Google Sheets for:', clinicName);

  // Define required sheets with their structures
  const sheetsToCreate = [
    {
      key: 'appointments_sheet_id',
      name: `${clinicName} - Appointments`,
      headers: ['Date', 'Time', 'Customer Name', 'Customer Email', 'Customer Phone', 'Pet Name', 'Pet Type', 'Service', 'Veterinarian', 'Status', 'Notes', 'Created', 'Source']
    },
    {
      key: 'master_sheet_id', 
      name: `${clinicName} - Master Tracking`,
      headers: ['Date', 'Time', 'Customer Name', 'Customer Email', 'Customer Phone', 'Pet Name', 'Pet Type', 'Service', 'Veterinarian', 'Status', 'Notes', 'Created', 'Source', 'Appointment ID', 'Follow-up Date']
    },
    {
      key: 'staff_sheet_id',
      name: `${clinicName} - Staff Database`,
      headers: ['Staff ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Position', 'Department', 'Hire Date', 'Status', 'Notes', 'Training Completed', 'Certifications']
    },
    {
      key: 'inventory_sheet_id',
      name: `${clinicName} - Inventory`,
      headers: ['Item ID', 'Item Name', 'Category', 'Current Stock', 'Minimum Stock', 'Unit Cost', 'Supplier', 'Last Ordered', 'Expiry Date', 'Status', 'Notes']
    },
    {
      key: 'medical_records_sheet_id',
      name: `${clinicName} - Medical Records`,
      headers: ['Record ID', 'Pet Name', 'Owner Name', 'Owner Email', 'Date', 'Visit Type', 'Veterinarian', 'Diagnosis', 'Treatment', 'Medications', 'Follow-up Required', 'Notes']
    },
    {
      key: 'prescription_sheet_id',
      name: `${clinicName} - Prescriptions`,
      headers: ['Prescription ID', 'Pet Name', 'Owner Name', 'Owner Phone', 'Medication', 'Dosage', 'Instructions', 'Prescribed Date', 'Veterinarian', 'Status', 'Refills Remaining']
    },
    {
      key: 'archive_sheet_id',
      name: `${clinicName} - Archive`,
      headers: ['Archive Date', 'Original Sheet', 'Record Type', 'Record ID', 'Customer Name', 'Pet Name', 'Service Date', 'Archived By', 'Reason', 'Original Data']
    },
    {
      key: 'social_media_sheet_id',
      name: `${clinicName} - Social Media Log`,
      headers: ['Post Date', 'Platform', 'Content Type', 'Content', 'Engagement', 'Reach', 'Posted By', 'Campaign', 'Status', 'Notes']
    }
  ];

  for (const sheet of sheetsToCreate) {
    try {
      console.log(`📄 Creating sheet: ${sheet.name}`);

      // Create new spreadsheet
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: sheet.name
          },
          sheets: [{
            properties: {
              title: 'Data'
            }
          }]
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw new Error(`Failed to create sheet: ${error}`);
      }

      const newSheet = await createResponse.json();
      createdSheets[sheet.key] = newSheet.spreadsheetId;

      console.log(`✅ Created sheet "${sheet.name}" with ID: ${newSheet.spreadsheetId}`);

      // Add headers to the sheet
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSheet.spreadsheetId}/values/Data!A1:${String.fromCharCode(64 + sheet.headers.length)}1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [sheet.headers]
        })
      });

      // Format headers (make them bold)
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSheet.spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: sheet.headers.length
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  },
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.9
                  }
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)'
            }
          }]
        })
      });

      console.log(`📊 Added headers to sheet: ${sheet.name}`);

    } catch (error) {
      console.error(`❌ Failed to create sheet ${sheet.name}:`, error.message);
      // Continue with next sheet instead of failing completely
    }
  }

  return createdSheets;
}

// Create Gmail SMTP credential in N8N
async function createGmailSMTPCredential(userEmail, accessToken, refreshToken, clientTag) {
  try {
    console.log('📧 Creating Gmail SMTP credential for:', userEmail);

    const credentialData = {
      name: `Gmail SMTP - ${clientTag}`,
      type: 'gmailOAuth2',
      data: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        oauthTokenData: {
          access_token: accessToken,
          refresh_token: refreshToken,
          scope: 'https://www.googleapis.com/auth/gmail.send',
          token_type: 'Bearer'
        }
      }
    };

    const response = await fetch(`${N8N_BASE_URL}/api/v1/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      },
      body: JSON.stringify(credentialData)
    });

    if (!response.ok) {
      throw new Error(`Gmail SMTP credential creation failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Created Gmail SMTP credential: ${result.id}`);
    return result.id;

  } catch (error) {
    console.error('❌ Failed to create Gmail SMTP credential:', error);
    return null;
  }
}

// Create Calendly OAuth credential (placeholder for when OAuth is ready)
async function createCalendlyOAuthCredential(clientTag) {
  try {
    console.log('📅 Creating Calendly OAuth credential for:', clientTag);

    const credentialData = {
      name: `Calendly OAuth - ${clientTag}`,
      type: 'calendlyOAuth2Api',
      data: {
        clientId: process.env.CALENDLY_CLIENT_ID || 'your_calendly_client_id',
        clientSecret: process.env.CALENDLY_CLIENT_SECRET || 'your_calendly_client_secret',
        // OAuth flow would populate these
        oauthTokenData: {
          access_token: 'placeholder_access_token',
          refresh_token: 'placeholder_refresh_token',
          token_type: 'Bearer'
        }
      }
    };

    const response = await fetch(`${N8N_BASE_URL}/api/v1/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      },
      body: JSON.stringify(credentialData)
    });

    if (!response.ok) {
      throw new Error(`Calendly OAuth credential creation failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Created Calendly OAuth credential: ${result.id}`);
    return result.id;

  } catch (error) {
    console.error('❌ Failed to create Calendly OAuth credential:', error);
    return null;
  }
}

// Apply credentials to duplicated workflow
async function applyCredentialsToWorkflow(workflowId, credentialMappings) {
  try {
    console.log(`🔑 Applying credentials to workflow ${workflowId}`);

    // Get the workflow
    const workflow = await n8nClient.getWorkflow(workflowId);
    
    // Update nodes with credentials
    const updatedNodes = workflow.nodes.map(node => {
      if (node.credentials) {
        Object.keys(node.credentials).forEach(credType => {
          if (credentialMappings[credType]) {
            node.credentials[credType] = {
              id: credentialMappings[credType],
              name: `Auto-assigned - ${credType}`
            };
          }
        });
      }
      return node;
    });

    // Update the workflow
    await n8nClient.updateWorkflow(workflowId, {
      ...workflow,
      nodes: updatedNodes
    });

    console.log(`✅ Applied credentials to workflow ${workflowId}`);
    return true;

  } catch (error) {
    console.error(`❌ Failed to apply credentials to workflow ${workflowId}:`, error);
    return false;
  }
}

function generatePromptInstructions(workflow) {
  console.log('🔍 Analyzing workflow for automatic prompt instructions:', workflow.name);

  const instructions = [];
  const configFields = [];
  const credentials = [];
  const nodes = workflow.nodes || [];

  // Track detected placeholders and services
  const detectedPlaceholders = new Set();
  const detectedServices = new Set();

  // Analyze each node for placeholders and credentials
  nodes.forEach(node => {
    const nodeStr = JSON.stringify(node);

    // Detect credential requirements
    if (node.credentials) {
      Object.keys(node.credentials).forEach(credType => {
        if (credType.includes('telegram')) {
          detectedServices.add('telegram');
          credentials.push({
            service: 'telegram',
            type: 'bot_token',
            label: 'Telegram Bot Token',
            description: 'Create a bot with @BotFather on Telegram',
            required: true
          });
          credentials.push({
            service: 'telegram',
            type: 'chat_id', 
            label: 'Telegram Chat ID',
            description: 'Your Telegram chat ID or group ID',
            required: true
          });
        }

        if (credType.includes('google') || credType.includes('gmail')) {
          detectedServices.add('google');
          credentials.push({
            service: 'google',
            type: 'oauth',
            label: 'Google Services (Gmail, Sheets, Calendar)',
            description: 'Connect your Google account via OAuth for Gmail SMTP, Sheets, and Calendar',
            required: true
          });
        }

        if (credType.includes('calendly')) {
          detectedServices.add('calendly');
          credentials.push({
            service: 'calendly',
            type: 'oauth',
            label: 'Calendly OAuth',
            description: 'Connect your Calendly account via OAuth',
            required: true
          });
        }

        if (credType.includes('openai')) {
          detectedServices.add('openai');
          credentials.push({
            service: 'openai',
            type: 'api_key',
            label: 'OpenAI API Key',
            description: 'Get your API key from OpenAI platform',
            required: true
          });
        }

        if (credType.includes('slack')) {
          detectedServices.add('slack');
          credentials.push({
            service: 'slack',
            type: 'bot_token',
            label: 'Slack Bot Token',
            description: 'Create a Slack app and get bot token',
            required: false
          });
        }

        if (credType.includes('facebook')) {
          detectedServices.add('facebook');
          credentials.push({
            service: 'facebook',
            type: 'access_token',
            label: 'Facebook Access Token',
            description: 'Manual token for Facebook social media posting',
            required: false
          });
        }

        if (credType.includes('twitter') || credType.includes('x')) {
          detectedServices.add('twitter');
          credentials.push({
            service: 'twitter',
            type: 'api_key',
            label: 'Twitter/X API Keys',
            description: 'Manual API keys for Twitter/X social media posting',
            required: false
          });
        }
      });
    }

    // Detect placeholder patterns in node parameters
    const placeholderPatterns = [
      /\{\{CLINIC_NAME\}\}/g,
      /\{\{CLINIC_ADDRESS\}\}/g, 
      /\{\{CLINIC_PHONE\}\}/g,
      /\{\{CLINIC_EMAIL\}\}/g,
      /\{\{CLINIC_HOURS\}\}/g,
      /\{\{SERVICES_OFFERED\}\}/g,
      /\{\{EMERGENCY_CONTACT\}\}/g,
      /\{\{VETERINARIAN_NAMES\}\}/g,
      /\{\{PRIMARY_VETERINARIAN\}\}/g,
      /\{\{TELEGRAM_BOT_TOKEN\}\}/g,
      /\{\{TELEGRAM_CHAT_ID\}\}/g,
      /\{\{BUSINESS_NAME\}\}/g,
      /\{\{BUSINESS_EMAIL\}\}/g,
      /\{\{BUSINESS_PHONE\}\}/g,
      /\{\{WEBSITE_URL\}\}/g,
      /\{\{BOOKING_URL\}\}/g,
      /\{\{CALENDLY_URL\}\}/g
    ];

    placeholderPatterns.forEach(pattern => {
      const matches = nodeStr.match(pattern);
      if (matches) {
        matches.forEach(match => {
          detectedPlaceholders.add(match);
        });
      }
    });
  });

  // Generate config fields based on detected placeholders
  Array.from(detectedPlaceholders).forEach(placeholder => {
    const key = placeholder.replace(/\{\{|\}\}/g, '').toLowerCase();

    switch (key) {
      case 'clinic_name':
        configFields.push({
          key: 'clinic_name',
          label: 'Clinic Name',
          type: 'text',
          required: true,
          placeholder: 'Happy Paws Veterinary Clinic'
        });
        break;
      case 'clinic_address':
        configFields.push({
          key: 'clinic_address',
          label: 'Clinic Address',
          type: 'textarea',
          required: true,
          placeholder: '123 Pet Street, Animal City, AC 12345'
        });
        break;
      case 'clinic_hours':
        configFields.push({
          key: 'clinic_hours',
          label: 'Clinic Hours',
          type: 'textarea',
          required: true,
          placeholder: 'Mon-Fri: 8AM-6PM, Sat: 9AM-3PM, Sun: Emergency Only'
        });
        break;
      case 'services_offered':
        configFields.push({
          key: 'services_offered',
          label: 'Services Offered',
          type: 'textarea',
          required: true,
          placeholder: 'Vaccinations, Surgery, Dental Care, Emergency Services, Grooming'
        });
        break;
      case 'emergency_contact':
        configFields.push({
          key: 'emergency_contact',
          label: 'Emergency Contact',
          type: 'tel',
          required: true,
          placeholder: '+1-555-EMERGENCY'
        });
        break;
      case 'veterinarian_names':
        configFields.push({
          key: 'veterinarian_names',
          label: 'Veterinarians (one per line)',
          type: 'textarea',
          required: true,
          placeholder: 'Dr. Sarah Johnson\nDr. Michael Chen\nDr. Emily Rodriguez'
        });
        break;
      case 'primary_veterinarian':
        configFields.push({
          key: 'primary_veterinarian',
          label: 'Primary Veterinarian',
          type: 'text',
          required: true,
          placeholder: 'Dr. Sarah Johnson'
        });
        break;
      case 'calendly_url':
        configFields.push({
          key: 'calendly_url',
          label: 'Calendly Scheduling URL',
          type: 'url',
          required: false,
          placeholder: 'https://calendly.com/your-clinic'
        });
        break;
      case 'telegram_bot_token':
        configFields.push({
          key: 'telegram_bot_token',
          label: 'Telegram Bot Token',
          type: 'password',
          required: true,
          placeholder: 'Your bot token from @BotFather'
        });
        break;
      case 'telegram_chat_id':
        configFields.push({
          key: 'telegram_chat_id',
          label: 'Telegram Chat ID',
          type: 'text',
          required: true,
          placeholder: 'Your chat ID or group ID'
        });
        break;
      case 'website_url':
        configFields.push({
          key: 'website_url',
          label: 'Website URL',
          type: 'url',
          required: false,
          placeholder: 'https://yourwebsite.com'
        });
        break;
      case 'booking_url':
        configFields.push({
          key: 'booking_url',
          label: 'Booking URL',
          type: 'url',
          required: false,
          placeholder: 'https://booking.yourwebsite.com'
        });
        break;
    }
  });

  // Generate instructions based on detected services and placeholders
  instructions.push('This workflow has been automatically analyzed. Please provide the following information:');

  if (detectedServices.has('telegram')) {
    instructions.push('• Set up Telegram Bot: Create a bot with @BotFather and get your bot token and chat ID');
  }

  if (detectedServices.has('google')) {
    instructions.push('• Connect Google Account: You\'ll need to authorize access to Google services');
  }

  if (detectedPlaceholders.size > 0) {
    instructions.push(`• Configure ${detectedPlaceholders.size} business-specific fields detected in the workflow`);
  }

  if (detectedServices.has('openai')) {
    instructions.push('• Provide OpenAI API Key: Get your API key from platform.openai.com');
  }

  console.log(`✅ Generated instructions for ${detectedPlaceholders.size} placeholders and ${detectedServices.size} services`);

  return {
    instructions: instructions.join('\n'),
    configFields: configFields,
    credentialsRequired: credentials.filter((c, index, self) => 
      index === self.findIndex(t => (t.service === c.service && t.type === c.type))
    ) // Remove duplicate credentials
  };
}

function escapeRegExp(string) {
  if (typeof string !== 'string') {
    return '';
  }
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special characters for regex
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
  if (tags.includes('veterinary') || tags.includes('pet') || tags.includes('animal')) return 'dental';
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

  return 'general'; // Default fallback
}

function analyzeWorkflowConfig(workflow) {
  // Generate automatic prompt instructions based on workflow content
  const promptInstructions = generatePromptInstructions(workflow);

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
    if (tag.includes('veterinary') || tag.includes('pet') || tag.includes('clinic')) {
      customFields.push(
        { key: 'clinic_hours', label: 'Clinic Hours', type: 'textarea', placeholder: 'Mon-Fri: 8AM-6PM, Sat: 9AM-3PM' },
        { key: 'services_offered', label: 'Services Offered', type: 'textarea', placeholder: 'Vaccinations, Surgery, Dental Care, Emergency' },
        { key: 'emergency_hours', label: 'Emergency Hours', type: 'text', placeholder: 'After hours emergency contact' }
      );
    }
  });

  // Get automatically detected fields from workflow analysis
  const autoDetectedFields = promptInstructions.configFields || [];

  // Standard configuration fields for all ETF workflows
  const standardFields = [
    { key: 'business_name', label: 'Business Name', type: 'text', required: true },
    { key: 'business_email', label: 'Business Email', type: 'email', required: true },
    { key: 'business_phone', label: 'Business Phone', type: 'tel', required: true },
    { key: 'support_email', label: 'Support Email', type: 'email', required: false }
  ];

  // Combine all fields and remove duplicates
  const allFields = [...standardFields, ...customFields, ...autoDetectedFields];
  const uniqueFields = allFields.filter((field, index, self) => 
    index === self.findIndex(f => f.key === field.key)
  );

  return {
    fields: uniqueFields,
    promptInstructions: promptInstructions.instructions,
    credentialsRequired: promptInstructions.credentials
  };
}

function personalizeWorkflowNodes(nodes, configData, clientData, workflowIdMappings = {}) {
  return nodes.map(node => {
    let personalizedNode = JSON.parse(JSON.stringify(node));

    // Personalize node parameters
    if (personalizedNode.parameters) {
      let paramString = JSON.stringify(personalizedNode.parameters);

      // Replace workflow ID references with personalized workflow IDs
      Object.entries(workflowIdMappings).forEach(([templateId, personalizedId]) => {
        const regex = new RegExp(`"${templateId}"`, 'g');
        paramString = paramString.replace(regex, `"${personalizedId}"`);
      });

      const personalizedParamString = personalizeString(paramString, configData, clientData);
      personalizedNode.parameters = JSON.parse(personalizedParamString);
    }

    // Personalize node name
    if (personalizedNode.name) {
      personalizedNode.name = personalizeString(personalizedNode.name, configData, clientData);
    }

    // Personalize credentials reference
    if (personalizedNode.credentials) {
      Object.keys(personalizedNode.credentials).forEach(credType => {
        if (personalizedNode.credentials[credType].name) {
          personalizedNode.credentials[credType].name = personalizeString(
            personalizedNode.credentials[credType].name, 
            configData, 
            clientData
          );
        }
      });
    }

    return personalizedNode;
  });
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

const server = app.listen(port, '0.0.0.0', (err) => {
  if (err) {
    console.error('❌ Server failed to start:', err);
    return;
  }

  console.log(`🚀 Server is running on port ${port}`);
  console.log(`🌐 External access: Available on 0.0.0.0:${port}`);
  console.log(`📍 Local URL: http://localhost:${port}`);
  console.log(`🔗 Replit URL: https://${process.env.REPL_SLUG || 'your-repl'}.${process.env.REPL_OWNER || 'your-username'}.repl.co`);

  // Test basic route
  console.log('🧪 Testing server health...');
  setTimeout(() => {
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      console.log(`✅ Health check status: ${res.statusCode}`);
    });

    req.on('error', (err) => {
      console.log(`⚠️ Health check failed: ${err.message}`);
    });

    req.end();
  }, 1000);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Placeholder function for personalizeString, assuming it exists elsewhere
function personalizeString(str, configData, clientData) {
  // This function should replace placeholders like {{BUSINESS_NAME}} with actual data
  // For example:
  if (typeof str !== 'string') return str;

  let personalizedStr = str;

  // Combine configData and clientData for easier access
  const allData = { ...clientData, ...configData };

  // Process veterinarian names array
  const veterinarianNames = allData.veterinarian_names ? 
    allData.veterinarian_names.split('\n').filter(name => name.trim()) : [];
  const primaryVeterinarian = allData.primary_veterinarian || veterinarianNames[0] || '';

  // Iterate over common placeholders, add more as needed
  const placeholders = {
    '{{BUSINESS_NAME}}': allData.business_name || allData.clinic_name || allData.name || '',
    '{{BUSINESS_EMAIL}}': allData.business_email || allData.clinic_email || allData.email || '',
    '{{BUSINESS_PHONE}}': allData.business_phone || allData.clinic_phone || allData.phone || '',
    '{{CLINIC_NAME}}': allData.clinic_name || allData.business_name || allData.name || '',
    '{{CLINIC_PHONE}}': allData.clinic_phone || allData.business_phone || allData.phone || '',
    '{{CLINIC_EMAIL}}': allData.clinic_email || allData.business_email || allData.email || '',
    '{{CLIENT_NAME}}': allData.name || '',
    '{{CLIENT_EMAIL}}': allData.email || '',
    '{{CLIENT_PHONE}}': allData.phone || '',
    '{{WEBSITE_URL}}': allData.website_url || '',
    '{{BOOKING_URL}}': allData.booking_url || '',
    '{{CALENDLY_URL}}': allData.calendly_url || '',
    '{{VETERINARIAN_NAMES}}': veterinarianNames.join(', ') || '',
    '{{PRIMARY_VETERINARIAN}}': primaryVeterinarian,
    '{{EMERGENCY_CONTACT}}': allData.emergency_contact || allData.business_phone || '',
    '{{TELEGRAM_BOT_TOKEN}}': allData.telegram_bot_token || '',
    '{{TELEGRAM_CHAT_ID}}': allData.telegram_chat_id || ''
  };

  Object.entries(placeholders).forEach(([placeholder, value]) => {
    if (value !== null && value !== undefined) {
      const regex = new RegExp(escapeRegExp(placeholder), 'g');
      personalizedStr = personalizedStr.replace(regex, value);
    }
  });

  return personalizedStr;
}


// --- Helper function for personalizing multiple workflows ---
async function personalizeMultipleWorkflows(workflowIds, configData, clientData) {
  const results = [];
  const errors = [];
  const workflowIdMappings = {}; // Map original IDs to new personalized IDs

  // First pass: Create all workflows without inter-workflow dependencies
  for (const workflowId of workflowIds) {
    try {
      console.log(`🔄 Creating base workflow for ${workflowId}...`);

      // Get the original workflow
      const originalWorkflow = await n8nClient.getWorkflow(workflowId);

      // Create personalized workflow data (without dependencies resolved yet)
      const personalizedWorkflow = {
        name: `[${clientData.name}] ${originalWorkflow.name}`,
        nodes: originalWorkflow.nodes || [],
        connections: originalWorkflow.connections || {},
        settings: originalWorkflow.settings || {},
        staticData: originalWorkflow.staticData || {},
        tags: originalWorkflow.tags || []
      };

      // Create the new workflow
      const newWorkflow = await n8nClient.createWorkflow(personalizedWorkflow);
      console.log(`✅ Created base workflow: ${newWorkflow.id} - ${newWorkflow.name}`);

      // Store the mapping
      workflowIdMappings[workflowId] = newWorkflow.id;

      results.push({
        originalId: workflowId,
        newId: newWorkflow.id,
        name: newWorkflow.name,
        success: true
      });

    } catch (error) {
      console.error(`❌ Error creating base workflow ${workflowId}:`, error.message);
      errors.push({
        originalId: workflowId,
        error: error.message,
        success: false
      });
    }
  }

  // Second pass: Update all workflows with proper dependencies and personalization
  for (const result of results) {
    if (!result.success) continue;

    try {
      console.log(`🔗 Updating workflow dependencies for ${result.newId}...`);

      // Get the original workflow again
      const originalWorkflow = await n8nClient.getWorkflow(result.originalId);

      // Personalize the workflow nodes with dependency mappings
      const personalizedNodes = personalizeWorkflowNodes(
        originalWorkflow.nodes || [], 
        configData, 
        clientData,
        workflowIdMappings
      );

      // Update the workflow with personalized nodes
      const updateData = {
        name: `[${clientData.name}] ${originalWorkflow.name}`,
        nodes: personalizedNodes,
        connections: originalWorkflow.connections || {},
        settings: originalWorkflow.settings || {},
        staticData: originalWorkflow.staticData || {}
      };

      await n8nClient.updateWorkflow(result.newId, updateData);
      console.log(`✅ Updated workflow dependencies: ${result.newId}`);

    } catch (error) {
      console.error(`❌ Error updating workflow dependencies ${result.newId}:`, error.message);
      // Mark as error but don't remove from results since workflow was created
      result.dependencyError = error.message;
    }
  }

  console.log(`\n📋 Workflow ID Mappings:`);
  Object.entries(workflowIdMappings).forEach(([original, personalized]) => {
    console.log(`   ${original} → ${personalized}`);
  });

  return { results, errors, workflowIdMappings };
}
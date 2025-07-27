
// ========================================
// ETF Integration Code for Your Server
// Add these sections to your existing server.js file
// ========================================

const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ========================================
// N8N Configuration
// ========================================
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n-app-gvq5.onrender.com';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

// N8N API Helper Class
class N8NApiClient {
  constructor(config) {
    this.baseURL = config.baseURL;
    this.auth = config.auth || {};
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}/api/v1${endpoint}`,
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
      console.error('N8N API Error:', error.response?.data || error.message);
      throw new Error(`N8N API Error: ${error.response?.status || error.message}`);
    }
  }

  async getWorkflows() { return await this.makeRequest('GET', '/workflows'); }
  async getWorkflow(id) { return await this.makeRequest('GET', `/workflows/${id}`); }
  async createWorkflow(workflowData) { return await this.makeRequest('POST', '/workflows', workflowData); }
  async activateWorkflow(id) { return await this.makeRequest('POST', `/workflows/${id}/activate`); }
}

const n8nClient = new N8NApiClient({ baseURL: N8N_BASE_URL });

// ========================================
// ETF Database Setup
// ========================================

// Initialize ETF database tables
function initETFDatabase() {
  const db = new sqlite3.Database('etf_data.db');
  
  // Clients table
  db.run(`
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
  db.run(`
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

  console.log('ETF Database initialized');
  return db;
}

const etfDB = initETFDatabase();

// ========================================
// ETF Routes - Add these to your app
// ========================================

// ETF Onboarding page
app.get('/etf-onboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'etf-onboard.html'));
});

// ETF Admin dashboard
app.get('/etf-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'etf-admin.html'));
});

// Get available templates from n8n
app.get('/api/etf/templates', async (req, res) => {
  try {
    const workflows = await n8nClient.getWorkflows();
    
    // Filter active workflows as templates
    const templates = workflows.data ? 
      workflows.data.filter(workflow => workflow.active === true).map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        description: `ETF automation workflow: ${workflow.name}`,
        taskforce_type: extractTaskforceType(workflow.name),
        config_fields: analyzeWorkflowConfig(workflow),
        created_at: workflow.createdAt,
        updated_at: workflow.updatedAt
      })) : [];

    res.json(templates);
  } catch (error) {
    console.error('Error fetching ETF templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Deploy ETF workflow for client
app.post('/api/etf/deploy', async (req, res) => {
  try {
    const { client_data, config_data, template_id } = req.body;

    console.log(`🚀 Deploying ETF workflow for ${client_data.name}`);

    // Get the template workflow
    const originalWorkflow = await n8nClient.getWorkflow(template_id);

    // Create personalized workflow
    const personalizedWorkflow = {
      ...originalWorkflow,
      name: `[${client_data.name}] ${originalWorkflow.name}`,
      id: undefined, // Remove ID to create new workflow
      nodes: personalizeWorkflowNodes(originalWorkflow.nodes, config_data, client_data)
    };

    // Create and activate new workflow
    const newWorkflow = await n8nClient.createWorkflow(personalizedWorkflow);
    await n8nClient.activateWorkflow(newWorkflow.id);

    // Save client and deployment records
    const client_id = uuidv4();
    const deployment_id = uuidv4();

    // Insert client
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT INTO etf_clients (id, name, email, company, industry, taskforce_type) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [client_id, client_data.name, client_data.email, client_data.company || client_data.name, 
         client_data.industry || 'Not specified', client_data.taskforce_type || 'general'],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Insert deployment
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT INTO etf_deployments (id, client_id, template_id, n8n_workflow_id, workflow_name, taskforce_type, config_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [deployment_id, client_id, template_id, newWorkflow.id, newWorkflow.name, 
         client_data.taskforce_type || 'general', JSON.stringify(config_data)],
        (err) => err ? reject(err) : resolve()
      );
    });

    res.json({
      success: true,
      workflow_id: newWorkflow.id,
      workflow_name: newWorkflow.name,
      client_id: client_id,
      deployment_id: deployment_id,
      message: `ETF automation deployed successfully for ${client_data.name}`,
      webhook_url: extractWebhookUrl(personalizedWorkflow.nodes)
    });

  } catch (error) {
    console.error('ETF deployment error:', error);
    res.status(500).json({ error: 'Deployment failed', details: error.message });
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

// ========================================
// Helper Functions
// ========================================

function extractTaskforceType(workflowName) {
  const name = workflowName.toLowerCase();
  if (name.includes('dental') || name.includes('clinic')) return 'dental';
  if (name.includes('gym') || name.includes('fitness')) return 'gym';
  if (name.includes('contractor') || name.includes('hvac')) return 'contractors';
  if (name.includes('tutor') || name.includes('education')) return 'tutoring';
  if (name.includes('massage') || name.includes('spa')) return 'massage';
  return 'general';
}

function analyzeWorkflowConfig(workflow) {
  // Standard configuration fields for all ETF workflows
  return [
    { key: 'business_name', label: 'Business Name', type: 'text', required: true },
    { key: 'business_email', label: 'Business Email', type: 'email', required: true },
    { key: 'business_phone', label: 'Business Phone', type: 'tel', required: true },
    { key: 'support_email', label: 'Support Email', type: 'email', required: false }
  ];
}

function personalizeWorkflowNodes(nodes, configData, clientData) {
  return nodes.map(node => {
    const personalizedNode = { ...node };
    
    // Replace placeholders in node parameters
    if (personalizedNode.parameters) {
      personalizedNode.parameters = personalizeParameters(
        personalizedNode.parameters, 
        configData, 
        clientData
      );
    }
    
    return personalizedNode;
  });
}

function personalizeParameters(parameters, configData, clientData) {
  const substitutions = {
    '{{CLIENT_NAME}}': clientData.name,
    '{{CLIENT_EMAIL}}': clientData.email,
    '{{CLIENT_COMPANY}}': clientData.company || clientData.name,
    '{{CLIENT_PHONE}}': clientData.phone || '',
    '{{BUSINESS_NAME}}': configData.business_name || clientData.name,
    '{{BUSINESS_EMAIL}}': configData.business_email || clientData.email,
    '{{BUSINESS_PHONE}}': configData.business_phone || '',
    '{{SUPPORT_EMAIL}}': configData.support_email || clientData.email,
    ...configData
  };

  function replaceInObject(obj) {
    if (typeof obj === 'string') {
      let result = obj;
      Object.entries(substitutions).forEach(([placeholder, value]) => {
        result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value || '');
      });
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(replaceInObject);
    } else if (obj && typeof obj === 'object') {
      const newObj = {};
      Object.entries(obj).forEach(([key, value]) => {
        newObj[key] = replaceInObject(value);
      });
      return newObj;
    }
    return obj;
  }

  return replaceInObject({ ...parameters });
}

function extractWebhookUrl(nodes) {
  const webhookNodes = nodes.filter(node => node.type === 'n8n-nodes-base.webhook');
  if (webhookNodes.length > 0) {
    const webhookPath = webhookNodes[0].parameters?.path || '';
    return `${N8N_BASE_URL}/webhook${webhookPath}`;
  }
  return null;
}

// Export for use
module.exports = {
  N8NApiClient,
  n8nClient,
  etfDB,
  initETFDatabase,
  personalizeWorkflowNodes
};


// ETF Integration Code for Your PRISMITY server.js
// Add these sections to your existing server.js file

// ========================================
// N8N API Configuration (Add after your existing requires)
// ========================================
const axios = require('axios');

// N8N Configuration
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
// ETF Database Setup (Add after your existing DB setup)
// ========================================
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
// ETF Routes (Add to your existing routes)
// ========================================

// Taskforce-specific onboarding routes
app.get('/taskforce/:type/onboard', (req, res) => {
  const taskforceType = req.params.type;
  res.sendFile(path.join(__dirname, 'public', 'taskforce-onboard.html'));
});

// Get active workflows for specific taskforce
app.get('/api/taskforce/:type/templates', async (req, res) => {
  try {
    const taskforceType = req.params.type;
    const workflows = await n8nClient.getWorkflows();
    
    // Filter workflows by taskforce type (based on workflow name patterns)
    const taskforceWorkflows = workflows.data ? 
      workflows.data.filter(workflow => 
        workflow.active === true && 
        workflow.name.toLowerCase().includes(taskforceType.toLowerCase())
      ) : [];

    const templates = taskforceWorkflows.map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      description: `${taskforceType} automation workflow`,
      taskforce_type: taskforceType,
      config_fields: analyzeWorkflowForTaskforce(workflow, taskforceType),
      created_at: workflow.createdAt,
      updated_at: workflow.updatedAt
    }));

    res.json(templates);
  } catch (error) {
    console.error('Error fetching taskforce templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Deploy personalized workflow for client
app.post('/api/taskforce/:type/deploy', async (req, res) => {
  try {
    const taskforceType = req.params.type;
    const { client_data, config_data, template_id } = req.body;

    console.log(`Deploying ${taskforceType} workflow for ${client_data.name}`);

    // Get the template workflow
    const originalWorkflow = await n8nClient.getWorkflow(template_id);

    // Create personalized workflow
    const personalizedWorkflow = {
      ...originalWorkflow,
      name: `${originalWorkflow.name} - ${client_data.name}`,
      id: undefined, // Remove ID to create new workflow
      nodes: personalizeWorkflowNodes(originalWorkflow.nodes, config_data, client_data, taskforceType)
    };

    // Create and activate new workflow
    const newWorkflow = await n8nClient.createWorkflow(personalizedWorkflow);
    await n8nClient.activateWorkflow(newWorkflow.id);

    // Save client and deployment records
    const client_id = generateId();
    const deployment_id = generateId();

    // Insert client
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT INTO etf_clients (id, name, email, company, industry, taskforce_type) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [client_id, client_data.name, client_data.email, client_data.company || client_data.name, 
         client_data.industry || taskforceType, taskforceType],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Insert deployment
    await new Promise((resolve, reject) => {
      etfDB.run(
        `INSERT INTO etf_deployments (id, client_id, template_id, n8n_workflow_id, workflow_name, taskforce_type, config_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [deployment_id, client_id, template_id, newWorkflow.id, newWorkflow.name, taskforceType, JSON.stringify(config_data)],
        (err) => err ? reject(err) : resolve()
      );
    });

    res.json({
      success: true,
      workflow_id: newWorkflow.id,
      workflow_name: newWorkflow.name,
      client_id: client_id,
      deployment_id: deployment_id,
      message: `${taskforceType} automation deployed successfully for ${client_data.name}`
    });

  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ error: 'Deployment failed', details: error.message });
  }
});

// ========================================
// Helper Functions
// ========================================

function generateId() {
  return require('crypto').randomUUID();
}

function analyzeWorkflowForTaskforce(workflow, taskforceType) {
  const commonFields = [
    { key: 'business_name', label: 'Business Name', type: 'text', required: true },
    { key: 'business_email', label: 'Business Email', type: 'email', required: true },
    { key: 'business_phone', label: 'Business Phone', type: 'tel', required: true }
  ];

  // Taskforce-specific fields
  const taskforceFields = {
    'dental': [
      { key: 'practice_name', label: 'Practice Name', type: 'text', required: true },
      { key: 'appointment_booking_url', label: 'Appointment Booking URL', type: 'url', required: false }
    ],
    'gym': [
      { key: 'gym_name', label: 'Gym Name', type: 'text', required: true },
      { key: 'membership_system', label: 'Membership System', type: 'text', required: false }
    ],
    'contractors': [
      { key: 'service_type', label: 'Service Type', type: 'select', options: ['Plumbing', 'HVAC', 'Electrical'], required: true },
      { key: 'service_area', label: 'Service Area', type: 'text', required: true }
    ],
    'tutoring': [
      { key: 'center_name', label: 'Center Name', type: 'text', required: true },
      { key: 'subjects_offered', label: 'Subjects Offered', type: 'text', required: true }
    ],
    'massage': [
      { key: 'clinic_name', label: 'Clinic Name', type: 'text', required: true },
      { key: 'services_offered', label: 'Services Offered', type: 'text', required: true }
    ]
  };

  return [...commonFields, ...(taskforceFields[taskforceType.toLowerCase()] || [])];
}

function personalizeWorkflowNodes(nodes, configData, clientData, taskforceType) {
  return nodes.map(node => {
    const personalizedNode = { ...node };
    
    // Replace placeholders in node parameters
    if (personalizedNode.parameters) {
      personalizedNode.parameters = personalizeParameters(
        personalizedNode.parameters, 
        configData, 
        clientData,
        taskforceType
      );
    }
    
    return personalizedNode;
  });
}

function personalizeParameters(parameters, configData, clientData, taskforceType) {
  const substitutions = {
    '{{CLIENT_NAME}}': clientData.name,
    '{{CLIENT_EMAIL}}': clientData.email,
    '{{CLIENT_COMPANY}}': clientData.company || clientData.name,
    '{{CLIENT_PHONE}}': clientData.phone || '',
    '{{TASKFORCE_TYPE}}': taskforceType,
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

// Export functions for use (if using modules)
module.exports = {
  N8NApiClient,
  n8nClient,
  etfDB,
  analyzeWorkflowForTaskforce,
  personalizeWorkflowNodes
};

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class N8NService {
  constructor() {
    // Auto-add https:// if missing
    let baseUrl = process.env.N8N_URL || '';
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    this.baseUrl = baseUrl;
    this.apiKey = process.env.N8N_API_KEY;
    this.postgresCredentialId = process.env.N8N_POSTGRES_CREDENTIAL_ID;

    // Log configuration status
    console.log('N8N Service initialized:');
    console.log('  - URL:', this.baseUrl || 'NOT SET');
    console.log('  - API Key:', this.apiKey ? 'SET' : 'NOT SET');

    // Trigger type tags for workflow categorization (optimized 9-workflow structure)
    this.triggerTags = {
      'AI-Gateway': ['WF1'],
      'AI-Agent': ['WF2'],
      'Scheduled': ['WF3', 'WF6', 'WF7'],
      'Payment': ['WF4'],
      'Operations': ['WF5'],
      'Safety': ['WF8'],
      'Sub-Workflow': ['SUB']
    };

    // Optimized workflow files (10 workflows - V4 production set)
    this.allWorkflows = [
      'SUB_Universal_Messenger.json',    // Sub-workflow must deploy first for ExecuteWorkflow references
      'SUB_Owner_Staff_Notifier.json',   // Owner/staff notification sub-workflow
      'WF1_AI_Gateway.json',             // Entry point - routes all incoming messages
      'WF2_Offer_Conflict_Manager.json', // Offer conflict detection and resolution
      'WF3_Calendar_Manager.json',       // Calendar sync and availability
      'WF4_Payment_Processor.json',      // Payment handling
      'WF5_Property_Operations.json',    // Maintenance, cleaning, vendors
      'WF6_Daily_Automations.json',      // Morning/evening/weekly reports
      'WF7_Integration_Hub.json',        // iCal sync, external platforms
      'WF8_Safety_Screening.json'        // Emergency handling, guest screening, watchdog
    ];

    // Fixed credential IDs used in optimized workflows
    // These must match the IDs in the workflow JSON files
    this.credentialIds = {
      postgres: 'postgres-cred',
      openai: 'openai-cred',
      telegram: 'telegram-cred',
      whatsapp: 'whatsapp-cred',
      twilio: 'twilio-cred',
      stripe: 'stripe-cred'  // Not used for now
    };

    // Platform-specific node types for disabling unused platforms
    this.platformNodeTypes = {
      telegram: [
        'n8n-nodes-base.telegramTrigger',
        'n8n-nodes-base.telegram'
      ],
      whatsapp: [
        'n8n-nodes-base.whatsAppTrigger',
        'n8n-nodes-base.whatsApp',
        'n8n-nodes-base.whatsAppBusinessCloud'
      ],
      sms: [
        'n8n-nodes-base.twilioTrigger',
        'n8n-nodes-base.twilio'
      ]
    };
  }

  isConfigured() {
    return !!(this.baseUrl && this.apiKey);
  }

  // Dynamically update n8n connection at runtime (from UI or DB)
  configure(url, apiKey) {
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    // Strip trailing slashes
    this.baseUrl = (url || '').replace(/\/+$/, '');
    this.apiKey = apiKey || '';
    console.log('N8N Service reconfigured:');
    console.log('  - URL:', this.baseUrl || 'NOT SET');
    console.log('  - API Key:', this.apiKey ? 'SET' : 'NOT SET');
  }

  // Load n8n config from SQLite if env vars are missing
  loadConfigFromDb(dbModule) {
    if (this.isConfigured()) {
      console.log('N8N: Already configured from env vars');
      return;
    }
    try {
      const savedConfig = dbModule.getClientData('n8n_config');
      if (savedConfig && savedConfig.url && savedConfig.apiKey) {
        this.configure(savedConfig.url, savedConfig.apiKey);
        console.log('N8N: Config loaded from database');
      }
    } catch (err) {
      console.error('N8N: Failed to load config from DB:', err.message);
    }
  }

  // ============================================
  // CREDENTIAL MANAGEMENT
  // ============================================

  // Create a credential in n8n
  async createCredential(type, name, data) {
    if (!this.isConfigured()) {
      throw new Error('n8n not configured');
    }

    const payload = { type, name, data };
    console.log(`    [n8n API] POST /api/v1/credentials`);
    console.log(`    Payload:`, JSON.stringify(payload, null, 2));

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/credentials`,
        payload,
        {
          headers: {
            'X-N8N-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      console.log(`    Success! Credential ID: ${response.data.id}`);
      return { success: true, credentialId: response.data.id, name: response.data.name };
    } catch (error) {
      const errorData = error.response?.data;
      console.error(`    FAILED to create credential ${name}:`);
      console.error(`    Status: ${error.response?.status}`);
      console.error(`    Response:`, JSON.stringify(errorData, null, 2));
      return {
        success: false,
        error: errorData?.message || error.message,
        details: errorData
      };
    }
  }

  // List available credential types in n8n (for debugging)
  async listCredentialTypes() {
    if (!this.isConfigured()) {
      return { success: false, error: 'n8n not configured' };
    }

    try {
      // Try to get credential types - this endpoint may vary by n8n version
      const response = await axios.get(
        `${this.baseUrl}/api/v1/credential-types`,
        {
          headers: { 'X-N8N-API-KEY': this.apiKey },
          timeout: 10000
        }
      );
      return { success: true, types: response.data };
    } catch (error) {
      console.log(`  Could not list credential types: ${error.response?.status || error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Delete a credential from n8n
  async deleteCredential(credentialId) {
    if (!this.isConfigured()) {
      return { success: false, error: 'n8n not configured' };
    }

    try {
      await axios.delete(
        `${this.baseUrl}/api/v1/credentials/${credentialId}`,
        {
          headers: { 'X-N8N-API-KEY': this.apiKey }
        }
      );
      return { success: true };
    } catch (error) {
      console.error(`Failed to delete credential ${credentialId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Create all credentials for a client based on their selected platforms
  async createClientCredentials(clientData, clientName) {
    const credentials = {};
    const integrations = clientData.integrations || {};
    const enabledPlatforms = clientData.owner?.enabledPlatforms || [];

    console.log(`Creating credentials for ${clientName}...`);
    console.log(`Enabled platforms: ${enabledPlatforms.join(', ')}`);

    // Telegram credential
    if (enabledPlatforms.includes('telegram') && integrations.telegramBotToken) {
      console.log('  Creating Telegram credential...');
      const result = await this.createCredential(
        'telegramApi',
        `Telegram Bot - ${clientName}`,
        { accessToken: integrations.telegramBotToken }
      );
      if (result.success) {
        credentials.telegram = result.credentialId;
        console.log(`  Telegram credential created: ${result.credentialId}`);
      } else {
        console.error(`  Failed to create Telegram credential: ${result.error}`);
      }
    }

    // WhatsApp credential
    if (enabledPlatforms.includes('whatsapp') && integrations.whatsappAccessToken) {
      console.log('  Creating WhatsApp credential...');
      const result = await this.createCredential(
        'whatsAppBusinessCloudApi',
        `WhatsApp Business - ${clientName}`,
        {
          accessToken: integrations.whatsappAccessToken,
          phoneNumberId: integrations.whatsappPhoneNumberId || '',
          businessAccountId: integrations.whatsappBusinessAccountId || ''
        }
      );
      if (result.success) {
        credentials.whatsapp = result.credentialId;
        console.log(`  WhatsApp credential created: ${result.credentialId}`);
      } else {
        console.error(`  Failed to create WhatsApp credential: ${result.error}`);
      }
    }

    // Twilio credential
    if (enabledPlatforms.includes('sms') && integrations.twilioAccountSid && integrations.twilioAuthToken) {
      console.log('  Creating Twilio credential...');
      const result = await this.createCredential(
        'twilioApi',
        `Twilio SMS - ${clientName}`,
        {
          accountSid: integrations.twilioAccountSid,
          authToken: integrations.twilioAuthToken
        }
      );
      if (result.success) {
        credentials.twilio = result.credentialId;
        console.log(`  Twilio credential created: ${result.credentialId}`);
      } else {
        console.error(`  Failed to create Twilio credential: ${result.error}`);
      }
    }

    console.log(`Credentials created: ${JSON.stringify(credentials)}`);
    return credentials;
  }

  // Fetch credential schema from n8n to understand required fields
  async getCredentialSchema(credentialType) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/credentials/schema/${credentialType}`,
        {
          headers: { 'X-N8N-API-KEY': this.apiKey },
          timeout: 10000
        }
      );
      return response.data;
    } catch (error) {
      console.log(`  Could not fetch schema for ${credentialType}:`, error.response?.status);
      return null;
    }
  }

  // Create OpenAI credential from API Bank key
  // Schema: apiKey (required), header (boolean) controls if headerName/headerValue are required
  // Must explicitly set header:false to skip the header fields requirement
  async createOpenAICredential(apiKey, clientName) {
    if (!apiKey) {
      console.log('  No OpenAI API key provided, skipping credential creation');
      return null;
    }

    console.log('  Creating OpenAI credential...');
    console.log(`  API Key preview: sk-...${apiKey.slice(-4)}`);

    // Must explicitly set header:false to make the if/then/else evaluate correctly
    console.log('  Creating openAiApi with header:false');
    const result = await this.createCredential(
      'openAiApi',
      `OpenAI - ${clientName}`,
      {
        apiKey: apiKey,
        header: false
      }
    );

    if (result.success) {
      console.log(`  OpenAI credential created: ${result.credentialId}`);
      return { id: result.credentialId, type: 'openAiApi' };
    } else {
      console.error(`  Failed to create OpenAI credential: ${result.error}`);
      return null;
    }
  }

  // Create PostgreSQL credential
  // Schema: sshTunnel (boolean) controls if ssh* fields are required
  // Must explicitly set sshTunnel:false to skip SSH fields requirement
  // Must explicitly set allowUnauthorizedCerts:false to include ssl field
  async createPostgresCredential(connectionDetails, clientName) {
    console.log('  Creating PostgreSQL credential...');
    console.log(`  Host: ${connectionDetails.host}`);
    console.log(`  Database: ${connectionDetails.database}`);
    console.log(`  User: ${connectionDetails.user}`);
    console.log(`  Port: ${connectionDetails.port}`);
    console.log(`  SSL: ${connectionDetails.ssl || 'allow'}`);

    // Map SSL mode to n8n expected values
    let sslMode = connectionDetails.ssl || 'allow';
    const validSslModes = ['disable', 'allow', 'require'];
    if (!validSslModes.includes(sslMode)) {
      sslMode = 'allow';
    }

    // Must explicitly set sshTunnel:false to make the if/then/else evaluate correctly
    // Must set allowUnauthorizedCerts:false to include ssl field
    console.log('  Creating postgres with sshTunnel:false and allowUnauthorizedCerts:false');
    const result = await this.createCredential(
      'postgres',
      `PostgreSQL - ${clientName}`,
      {
        host: connectionDetails.host,
        database: connectionDetails.database,
        user: connectionDetails.user,
        password: connectionDetails.password,
        port: parseInt(connectionDetails.port, 10) || 5432,
        ssl: sslMode,
        allowUnauthorizedCerts: false,
        sshTunnel: false
      }
    );

    if (result.success) {
      console.log(`  PostgreSQL credential created: ${result.credentialId}`);
      return { id: result.credentialId, type: 'postgres' };
    } else {
      console.error(`  Failed to create PostgreSQL credential: ${result.error}`);
      return null;
    }
  }

  // Delete all credentials for a client
  async deleteClientCredentials(credentialIds) {
    const results = [];

    for (const [platform, credentialId] of Object.entries(credentialIds)) {
      if (credentialId) {
        console.log(`  Deleting ${platform} credential: ${credentialId}`);
        const result = await this.deleteCredential(credentialId);
        results.push({ platform, credentialId, ...result });
      }
    }

    return {
      success: results.every(r => r.success),
      deleted: results.filter(r => r.success).length,
      results
    };
  }

  // Inject credential IDs into workflow nodes
  // The optimized workflows use placeholder IDs like 'postgres-cred', 'openai-cred', etc.
  // This method replaces those placeholders with actual credential IDs
  injectCredentialIds(workflow, clientCredentials, developerCredentials = {}) {
    if (!workflow.nodes) return workflow;

    // Map placeholder IDs to actual credential IDs
    // Placeholders in workflow JSON files: postgres-cred, openai-cred, telegram-cred, whatsapp-cred, twilio-cred
    const credentialIdMapping = {
      'postgres-cred': developerCredentials.postgres,
      'openai-cred': developerCredentials.openai,
      'telegram-cred': clientCredentials.telegram,
      'whatsapp-cred': clientCredentials.whatsapp,
      'twilio-cred': clientCredentials.twilio,
      'stripe-cred': developerCredentials.stripe  // Not used for now
    };

    let injectedCount = 0;

    workflow.nodes = workflow.nodes.map(node => {
      if (node.credentials) {
        // Iterate through all credential types on this node
        for (const [credKey, credValue] of Object.entries(node.credentials)) {
          if (credValue && credValue.id) {
            const placeholderId = credValue.id;
            const actualId = credentialIdMapping[placeholderId];
            if (actualId) {
              node.credentials[credKey] = {
                ...credValue,
                id: actualId
              };
              injectedCount++;
              console.log(`      Replaced ${placeholderId} -> ${actualId} in node "${node.name}"`);
            }
          }
        }
      }
      return node;
    });

    if (injectedCount > 0) {
      console.log(`    Injected ${injectedCount} credential IDs`);
    }

    return workflow;
  }

  // Disable nodes for platforms not in enabledPlatforms array
  disableUnusedPlatformNodes(workflow, enabledPlatforms) {
    if (!workflow.nodes || !enabledPlatforms || enabledPlatforms.length === 0) {
      return workflow;
    }

    // Default to all platforms if not specified
    const enabled = enabledPlatforms.length > 0 ? enabledPlatforms : ['telegram', 'whatsapp', 'sms'];

    let disabledCount = 0;

    workflow.nodes = workflow.nodes.map(node => {
      // Check if this node belongs to a disabled platform
      for (const [platform, nodeTypes] of Object.entries(this.platformNodeTypes)) {
        if (!enabled.includes(platform) && nodeTypes.includes(node.type)) {
          console.log(`    Disabling ${platform} node: ${node.name}`);
          disabledCount++;
          return { ...node, disabled: true };
        }
      }
      return node;
    });

    if (disabledCount > 0) {
      console.log(`    Disabled ${disabledCount} nodes for unused platforms`);
    }

    return workflow;
  }

  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, error: 'n8n not configured. Check N8N_URL and N8N_API_KEY environment variables.' };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': this.apiKey },
        timeout: 10000
      });
      return { success: true, workflowCount: response.data.data?.length || 0 };
    } catch (error) {
      console.error('n8n connection test failed:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  // List all workflows from n8n
  async listWorkflows() {
    if (!this.isConfigured()) {
      return { success: false, error: 'n8n not configured' };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/workflows?limit=250`, {
        headers: { 'X-N8N-API-KEY': this.apiKey },
        timeout: 15000
      });
      const workflows = (response.data.data || []).map(wf => ({
        id: wf.id,
        name: wf.name,
        active: wf.active,
        createdAt: wf.createdAt,
        updatedAt: wf.updatedAt
      }));
      return { success: true, workflows };
    } catch (error) {
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  // Get trigger tag for a workflow (optimized workflow naming: WF1, WF2, SUB, etc.)
  getTriggerTag(filename) {
    // Match WF1, WF2, SUB patterns
    const wfMatch = filename.match(/^(WF\d+|SUB)/);
    if (!wfMatch) return 'Other';

    const prefix = wfMatch[1];
    for (const [tag, workflows] of Object.entries(this.triggerTags)) {
      if (workflows.includes(prefix)) {
        return tag;
      }
    }
    return 'Other';
  }

  // Load workflow template from file
  loadWorkflowTemplate(filename) {
    const workflowPath = path.join(__dirname, '..', 'workflows', filename);
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow template not found: ${filename}`);
    }
    const content = fs.readFileSync(workflowPath, 'utf8');
    return JSON.parse(content);
  }

  // Build replacements map from client data
  buildReplacements(clientData, assignedApiKey) {
    const owner = clientData.owner || {};
    const property = clientData.property || {};
    const guestAccess = clientData.guestAccess || {};
    const integrations = clientData.integrations || {};
    const calendars = clientData.calendars || {};

    return {
      // Owner info
      '<__PLACEHOLDER_VALUE__Property Owner Name__>': owner.ownerName || '',
      '<__PLACEHOLDER_VALUE__Property Owner ID__>': owner.telegramChatId || owner.ownerPhone || '',
      '<__PLACEHOLDER_VALUE__Owner Telegram/Phone ID__>': owner.telegramChatId || owner.ownerPhone || '',
      '<__PLACEHOLDER_VALUE__From Email Address__>': owner.ownerEmail || '',

      // Primary platform (for routing and fallback)
      // This is the main platform the owner uses - used for Switch node routing
      'primary_platform': owner.primaryPlatform || 'telegram',

      // Manager info
      '<__PLACEHOLDER_VALUE__Manager Name__>': integrations.managerName || owner.ownerName || '',
      '<__PLACEHOLDER_VALUE__Manager Platform (sms/whatsapp/telegram)__>': integrations.managerPlatform || owner.primaryPlatform || 'telegram',
      '<__PLACEHOLDER_VALUE__Manager Contact (phone/chat ID)__>': integrations.managerContact || owner.telegramChatId || owner.ownerPhone || '',

      // Communication channels
      '<__PLACEHOLDER_VALUE__Twilio_From_Phone_Number__>': integrations.twilioPhoneNumber || '',
      '<__PLACEHOLDER_VALUE__Twilio_WhatsApp_From_Number__>': integrations.twilioWhatsAppNumber || '',
      '<__PLACEHOLDER_VALUE__Twilio Phone Number__>': integrations.twilioPhoneNumber || '',
      '<__PLACEHOLDER_VALUE__Twilio From Phone Number__>': integrations.twilioPhoneNumber || '',
      '<__PLACEHOLDER_VALUE__Twilio SMS Number__>': integrations.twilioPhoneNumber || '',
      '<__PLACEHOLDER_VALUE__WhatsApp Phone Number ID__>': integrations.whatsappPhoneNumberId || '',

      // Platform preferences - using primaryPlatform as the main choice
      '<__PLACEHOLDER_VALUE__telegram or whatsapp__>': owner.primaryPlatform || 'telegram',
      '<__PLACEHOLDER_VALUE__Booking contact platform (telegram or whatsapp)__>': owner.primaryPlatform || 'telegram',
      '<__PLACEHOLDER_VALUE__Booking contact chat ID or phone number__>': owner.telegramChatId || owner.ownerPhone || '',
      '<__PLACEHOLDER_VALUE__Booking Contact Phone Number__>': owner.ownerPhone || '',
      '<__PLACEHOLDER_VALUE__Booking Contact Platform (telegram or whatsapp)__>': owner.primaryPlatform || 'telegram',
      '<__PLACEHOLDER_VALUE__Booking Contact Chat ID (for Telegram)__>': owner.telegramChatId || '',

      // API Keys - OpenAI comes from API Bank, assigned by developer
      '<__PLACEHOLDER_VALUE__OpenAI API Key__>': assignedApiKey || '',
      '<__PLACEHOLDER_VALUE__Eventbrite API Token__>': integrations.eventbriteApiToken || '',
      '<__PLACEHOLDER_VALUE__OpenWeatherMap API Key__>': integrations.openWeatherMapApiKey || '',

      // Credential IDs
      '{{ POSTGRES_CREDENTIAL_ID }}': this.postgresCredentialId || '',

      // Property info
      '<__PLACEHOLDER_VALUE__Property Name__>': property.propertyName || '',
      '<__PLACEHOLDER_VALUE__Property Address__>': property.propertyAddress || '',

      // Guest access
      '<__PLACEHOLDER_VALUE__Check In Time__>': guestAccess.checkInTime || '15:00',
      '<__PLACEHOLDER_VALUE__Check Out Time__>': guestAccess.checkOutTime || '11:00',
      '<__PLACEHOLDER_VALUE__Door Code__>': guestAccess.doorCode || '',
      '<__PLACEHOLDER_VALUE__WiFi Network__>': guestAccess.wifiNetwork || '',
      '<__PLACEHOLDER_VALUE__WiFi Password__>': guestAccess.wifiPassword || '',

      // Calendars
      '<__PLACEHOLDER_VALUE__Airbnb Calendar URL__>': calendars.airbnbCalendarUrl || '',
      '<__PLACEHOLDER_VALUE__VRBO Calendar URL__>': calendars.vrboCalendarUrl || '',
      '<__PLACEHOLDER_VALUE__Booking Calendar URL__>': calendars.bookingCalendarUrl || ''
    };
  }

  // Replace placeholders and $env variables in workflow with client data
  // The optimized workflows use $env.VAR_NAME syntax for some variables
  // We replace the entire expression with the actual value since each client has different values
  personalizeWorkflow(workflow, clientData, assignedApiKey, webhookUrls = {}) {
    let workflowStr = JSON.stringify(workflow);

    const integrations = clientData.integrations || {};

    // For optimized workflows: Replace n8n expression with actual values
    // Pattern: "={{ $env.VAR_NAME }}" -> "actualValue"
    const envReplacements = {
      '={{ $env.TWILIO_PHONE_NUMBER }}': integrations.twilioPhoneNumber || '',
      '={{ $env.APP_URL }}': process.env.APP_URL || 'https://your-app-url.com'
    };

    // Apply env replacements
    for (const [pattern, value] of Object.entries(envReplacements)) {
      workflowStr = workflowStr.split(pattern).join(value);
    }

    // Legacy placeholder replacements (for any remaining old-style placeholders)
    const replacements = this.buildReplacements(clientData, assignedApiKey);

    // Add webhook URLs (populated after first pass deployment)
    const webhookReplacements = {
      '<__PLACEHOLDER_VALUE__Availability_Checker_Webhook_URL__>': webhookUrls.availability || '',
      '<__PLACEHOLDER_VALUE__Guest Journey Scheduler Webhook URL__>': webhookUrls.guestJourney || '',
      '<__PLACEHOLDER_VALUE__Calendar Sync Reminder Webhook URL__>': webhookUrls.calendarSync || '',
      '<__PLACEHOLDER_VALUE__Cleaning Scheduler Webhook URL__>': webhookUrls.cleaning || '',
      '<__PLACEHOLDER_VALUE__Inventory Predictor Webhook URL__>': webhookUrls.inventory || '',
      '<__PLACEHOLDER_VALUE__Task Completed Webhook URL__>': webhookUrls.taskCompleted || '',
      '<__PLACEHOLDER_VALUE__Property Status Update Webhook URL__>': webhookUrls.propertyStatus || '',
      '<__PLACEHOLDER_VALUE__Send Guest Message Webhook URL__>': webhookUrls.guestMessage || '',
      '<__PLACEHOLDER_VALUE__Maintenance Ticket Creator Webhook URL__>': webhookUrls.maintenance || '',
      '<__PLACEHOLDER_VALUE__Property details URL__>': webhookUrls.propertyDetails || '',
      '<__PLACEHOLDER_VALUE__URL to task dashboard for contacts__>': webhookUrls.taskDashboard || ''
    };

    // Apply all legacy replacements
    for (const [placeholder, value] of Object.entries({ ...replacements, ...webhookReplacements })) {
      workflowStr = workflowStr.split(placeholder).join(value);
    }

    // Replace hardcoded n8n URLs with user's n8n URL
    workflowStr = workflowStr.replace(/https:\/\/bybless\.app\.n8n\.cloud/g, this.baseUrl || '');

    return JSON.parse(workflowStr);
  }

  // Create or get tag in n8n
  async getOrCreateTag(tagName) {
    try {
      // First, try to find existing tag
      const listResponse = await axios.get(`${this.baseUrl}/api/v1/tags`, {
        headers: { 'X-N8N-API-KEY': this.apiKey }
      });

      const existingTag = listResponse.data.data?.find(t => t.name === tagName);
      if (existingTag) {
        return existingTag.id;
      }

      // Create new tag
      const createResponse = await axios.post(
        `${this.baseUrl}/api/v1/tags`,
        { name: tagName },
        {
          headers: {
            'X-N8N-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      return createResponse.data.id;
    } catch (error) {
      console.error(`Failed to create/get tag ${tagName}:`, error.message);
      return null;
    }
  }

  // Deploy a single workflow to n8n with tags
  async deployWorkflow(workflow, clientName, triggerTag) {
    if (!this.isConfigured()) {
      throw new Error('n8n not configured');
    }

    // Use original workflow name (no client prefix)
    const workflowName = workflow.name;

    // Clean nodes - remove webhookIds and other properties n8n doesn't accept on creation
    const cleanedNodes = (workflow.nodes || []).map(node => {
      const cleanNode = { ...node };
      delete cleanNode.webhookId;
      return cleanNode;
    });

    // Build clean workflow object with only the fields n8n API accepts
    const cleanWorkflow = {
      name: workflowName,
      nodes: cleanedNodes,
      connections: workflow.connections || {},
      settings: workflow.settings || {}
    };

    // Only include staticData if it exists and is not empty
    if (workflow.staticData && Object.keys(workflow.staticData).length > 0) {
      cleanWorkflow.staticData = workflow.staticData;
    }

    try {
      // Create workflow
      const response = await axios.post(
        `${this.baseUrl}/api/v1/workflows`,
        cleanWorkflow,
        {
          headers: {
            'X-N8N-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const workflowId = response.data.id;

      // Add tags
      const clientTagId = await this.getOrCreateTag(clientName);
      const triggerTagId = await this.getOrCreateTag(triggerTag);

      const tagIds = [clientTagId, triggerTagId].filter(Boolean);
      if (tagIds.length > 0) {
        await axios.put(
          `${this.baseUrl}/api/v1/workflows/${workflowId}/tags`,
          tagIds.map(id => ({ id })),
          {
            headers: {
              'X-N8N-API-KEY': this.apiKey,
              'Content-Type': 'application/json'
            }
          }
        );
      }

      return { success: true, workflowId, name: workflowName };
    } catch (error) {
      console.error('Deploy workflow error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        name: workflowName
      };
    }
  }

  // Activate a workflow in n8n
  async activateWorkflow(workflowId) {
    try {
      // Use POST to /activate endpoint (universally supported across n8n versions)
      try {
        await axios.post(
          `${this.baseUrl}/api/v1/workflows/${workflowId}/activate`,
          {},
          {
            headers: {
              'X-N8N-API-KEY': this.apiKey,
              'Content-Type': 'application/json'
            }
          }
        );
        return { success: true };
      } catch (postErr) {
        // Fallback: PUT with active flag (works on older n8n versions)
        const getResult = await this.getWorkflow(workflowId);
        if (!getResult.success) throw postErr;
        const clean = this.cleanWorkflowForApi(getResult.workflow);
        await axios.put(
          `${this.baseUrl}/api/v1/workflows/${workflowId}`,
          { ...clean, active: true },
          {
            headers: {
              'X-N8N-API-KEY': this.apiKey,
              'Content-Type': 'application/json'
            }
          }
        );
        return { success: true };
      }
    } catch (error) {
      console.error('Activate workflow error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  async deactivateWorkflow(workflowId) {
    try {
      try {
        await axios.post(
          `${this.baseUrl}/api/v1/workflows/${workflowId}/deactivate`,
          {},
          {
            headers: {
              'X-N8N-API-KEY': this.apiKey,
              'Content-Type': 'application/json'
            }
          }
        );
        return { success: true };
      } catch (postErr) {
        // Fallback: PUT with active: false
        const getResult = await this.getWorkflow(workflowId);
        if (!getResult.success) throw postErr;
        const clean = this.cleanWorkflowForApi(getResult.workflow);
        await axios.put(
          `${this.baseUrl}/api/v1/workflows/${workflowId}`,
          { ...clean, active: false },
          {
            headers: {
              'X-N8N-API-KEY': this.apiKey,
              'Content-Type': 'application/json'
            }
          }
        );
        return { success: true };
      }
    } catch (error) {
      console.error('Deactivate workflow error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Clean workflow for n8n API (only include accepted fields)
  cleanWorkflowForApi(workflow) {
    const cleanedNodes = (workflow.nodes || []).map(node => {
      const cleanNode = { ...node };
      delete cleanNode.webhookId;
      return cleanNode;
    });

    const clean = {
      name: workflow.name,
      nodes: cleanedNodes,
      connections: workflow.connections || {},
      settings: workflow.settings || {}
    };

    if (workflow.staticData && Object.keys(workflow.staticData).length > 0) {
      clean.staticData = workflow.staticData;
    }

    return clean;
  }

  // Update a workflow in n8n (for variable updates)
  async updateWorkflow(workflowId, workflow) {
    try {
      // Clean workflow before update
      const cleanWorkflow = this.cleanWorkflowForApi(workflow);

      // Remove read-only fields that newer n8n versions reject
      delete cleanWorkflow.active;
      delete cleanWorkflow.id;

      // Deactivate first via dedicated endpoint
      await this.deactivateWorkflow(workflowId);

      // PUT the updated workflow (without active/id fields)
      await axios.put(
        `${this.baseUrl}/api/v1/workflows/${workflowId}`,
        cleanWorkflow,
        {
          headers: {
            'X-N8N-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      // Reactivate
      await this.activateWorkflow(workflowId);

      return { success: true };
    } catch (error) {
      console.error('Update workflow error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Delete a workflow from n8n
  async deleteWorkflow(workflowId) {
    try {
      await axios.delete(
        `${this.baseUrl}/api/v1/workflows/${workflowId}`,
        {
          headers: { 'X-N8N-API-KEY': this.apiKey }
        }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Helper function to add delay between API calls (prevents rate limiting)
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Deploy ALL optimized workflows for a client (9 workflows total)
  async deployAllWorkflows(clientData, assignedApiKey, clientCredentials = {}, developerCredentials = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'n8n not configured. Check N8N_URL and N8N_API_KEY.',
        deployed: 0,
        failed: 0,
        total: 0,
        workflows: [],
        results: []
      };
    }

    // First test the connection
    console.log('\n=== Testing n8n connection before deployment ===');
    console.log('URL:', this.baseUrl);
    const testResult = await this.testConnection();
    if (!testResult.success) {
      console.error('n8n connection test FAILED:', testResult.error);
      return {
        success: false,
        error: `n8n connection failed: ${testResult.error}`,
        deployed: 0,
        failed: this.allWorkflows.length,
        total: this.allWorkflows.length,
        workflows: [],
        results: [{ filename: 'connection_test', success: false, error: testResult.error }]
      };
    }
    console.log('n8n connection OK. Existing workflows:', testResult.workflowCount);

    const clientName = clientData.property?.propertyName || clientData.owner?.ownerName || 'Client';
    const results = [];
    const deployedWorkflows = [];

    // Get enabled platforms from client data (default to all if not specified)
    const enabledPlatforms = clientData.owner?.enabledPlatforms || ['telegram', 'whatsapp', 'sms'];
    const primaryPlatform = clientData.owner?.primaryPlatform || enabledPlatforms[0] || 'telegram';

    console.log(`\n=== Deploying ${this.allWorkflows.length} workflows for: ${clientName} ===`);
    console.log(`Enabled platforms: ${enabledPlatforms.join(', ')}`);
    console.log(`Primary platform: ${primaryPlatform}`);
    console.log(`Client credentials: ${JSON.stringify(clientCredentials)}`);
    console.log(`Developer credentials: ${JSON.stringify(developerCredentials)}\n`);

    // Delay between workflow deployments to avoid rate limiting (in ms)
    const DEPLOYMENT_DELAY = 2000; // 2 seconds between each workflow

    for (let i = 0; i < this.allWorkflows.length; i++) {
      const filename = this.allWorkflows[i];

      // Add delay between deployments (skip first one)
      if (i > 0) {
        console.log(`  Waiting ${DEPLOYMENT_DELAY/1000}s to avoid rate limiting...`);
        await this.sleep(DEPLOYMENT_DELAY);
      }
      try {
        console.log(`--- ${filename} ---`);

        // Load template
        const template = this.loadWorkflowTemplate(filename);
        console.log(`  Loaded: ${template.name}`);

        // Get trigger tag
        const triggerTag = this.getTriggerTag(filename);

        // Personalize workflow with client data
        let personalized = this.personalizeWorkflow(template, clientData, assignedApiKey);

        // Disable nodes for platforms the client hasn't enabled
        personalized = this.disableUnusedPlatformNodes(personalized, enabledPlatforms);

        // Inject credential IDs into workflow nodes
        personalized = this.injectCredentialIds(personalized, clientCredentials, developerCredentials);

        // Deploy
        const result = await this.deployWorkflow(personalized, clientName, triggerTag);

        if (result.success) {
          console.log(`  Created: ID=${result.workflowId}`);

          // Activate
          const activateResult = await this.activateWorkflow(result.workflowId);
          console.log(`  Activated: ${activateResult.success ? 'YES' : 'NO - ' + activateResult.error}`);

          deployedWorkflows.push({
            filename,
            workflowId: result.workflowId,
            name: result.name,
            triggerTag,
            active: activateResult.success
          });

          results.push({ filename, success: true, workflowId: result.workflowId, active: activateResult.success });
        } else {
          console.error(`  FAILED: ${result.error}`);
          results.push({ filename, success: false, error: result.error });
        }
      } catch (error) {
        console.error(`  EXCEPTION: ${error.message}`);
        results.push({ filename, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\n=== Deployment Summary ===`);
    console.log(`Succeeded: ${successCount} / ${this.allWorkflows.length}`);
    console.log(`Failed: ${failCount}`);
    if (failCount > 0) {
      console.log('\nFailed workflows:');
      results.filter(r => !r.success).forEach(r => console.log(`  - ${r.filename}: ${r.error}`));
    }
    console.log('========================\n');

    return {
      success: failCount === 0,
      deployed: successCount,
      failed: failCount,
      total: this.allWorkflows.length,
      workflows: deployedWorkflows,
      results
    };
  }

  // Update all deployed workflows with new client data
  async updateAllWorkflows(deployedWorkflows, clientData, assignedApiKey) {
    const results = [];

    for (const deployed of deployedWorkflows) {
      try {
        // Load fresh template
        const template = this.loadWorkflowTemplate(deployed.filename);

        // Personalize with new data
        const personalized = this.personalizeWorkflow(template, clientData, assignedApiKey);

        // Keep the existing name
        personalized.name = deployed.name;

        // Update in n8n
        const result = await this.updateWorkflow(deployed.workflowId, personalized);
        results.push({ workflowId: deployed.workflowId, success: result.success, error: result.error });
      } catch (error) {
        results.push({ workflowId: deployed.workflowId, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount === results.length,
      updated: successCount,
      failed: results.length - successCount,
      results
    };
  }

  // Delete all workflows for a client
  async deleteAllWorkflows(deployedWorkflows) {
    const results = [];

    for (const deployed of deployedWorkflows) {
      const result = await this.deleteWorkflow(deployed.workflowId);
      results.push({ workflowId: deployed.workflowId, ...result });
    }

    return {
      success: results.every(r => r.success),
      deleted: results.filter(r => r.success).length,
      results
    };
  }

  // ============================================
  // ORDERED DEPLOYMENT WITH ID RESOLUTION
  // ============================================

  // Define workflow deployment order based on dependencies
  // Each workflow lists the workflows it references (dependencies)
  getWorkflowDependencyOrder() {
    return [
      // Layer 1: No dependencies - deploy first
      { filename: 'SUB_Universal_Messenger.json', name: 'SUB: Universal Messenger', dependencies: [] },
      { filename: 'SUB_Owner_Staff_Notifier.json', name: 'SUB: Owner & Staff Notifier', dependencies: [] },

      // Layer 2: Depends on SUB(s)
      { filename: 'WF3_Calendar_Manager.json', name: 'WF3: Calendar Manager', dependencies: ['SUB: Universal Messenger'] },
      { filename: 'WF4_Payment_Processor.json', name: 'WF4: Payment Processor', dependencies: ['SUB: Universal Messenger'] },
      { filename: 'WF5_Property_Operations.json', name: 'WF5: Property Operations', dependencies: ['SUB: Universal Messenger', 'SUB: Owner & Staff Notifier'] },
      { filename: 'WF6_Daily_Automations.json', name: 'WF6: Daily Automations', dependencies: ['SUB: Owner & Staff Notifier'] },
      { filename: 'WF8_Safety_Screening.json', name: 'WF8: Safety & Screening', dependencies: ['SUB: Owner & Staff Notifier'] },

      // Layer 3: Depends on WF3 + SUB Notifier
      { filename: 'WF7_Integration_Hub.json', name: 'WF7: Integration Hub', dependencies: ['WF3: Calendar Manager', 'SUB: Owner & Staff Notifier'] },

      // Layer 4: Depends on SUB
      { filename: 'WF2_Offer_Conflict_Manager.json', name: 'WF2: Offer Conflict Manager', dependencies: ['SUB: Universal Messenger'] },

      // Layer 5: Gateway depends on all specialized workflows
      { filename: 'WF1_AI_Gateway.json', name: 'WF1: AI Gateway - Unified Entry Point', dependencies: ['SUB: Universal Messenger', 'WF2: Offer Conflict Manager', 'WF3: Calendar Manager', 'WF4: Payment Processor', 'WF5: Property Operations', 'WF8: Safety & Screening'] }
    ];
  }

  // Inject actual workflow IDs into workflow references
  // Replaces workflow name values with actual n8n workflow IDs
  // Handles three modes:
  //   - "list" or "name": value is a workflow name like "WF2: Offer Conflict Manager"
  //   - "id": value is a stale/incorrect ID that needs replacement
  //   - missing workflowId: node has no workflowId param, matched by node name
  injectWorkflowIds(workflow, workflowIdMap) {
    if (!workflow.nodes) {
      console.log('    WARNING: No nodes in workflow, skipping ID injection');
      return workflow;
    }

    console.log(`    Injecting workflow IDs. Map has ${Object.keys(workflowIdMap).length} entries:`, Object.keys(workflowIdMap));

    let injectedCount = 0;
    let warningCount = 0;
    const knownIds = Object.values(workflowIdMap);

    workflow.nodes = workflow.nodes.map(node => {
      // Check for executeWorkflow nodes (both regular and tool versions)
      if (node.type === 'n8n-nodes-base.executeWorkflow' ||
          node.type === '@n8n/n8n-nodes-langchain.toolWorkflow') {

        const workflowRef = node.parameters?.workflowId;

        // Case 1: No workflowId parameter at all - match by node name
        if (!workflowRef) {
          const matchedName = this._matchNodeToWorkflowName(node.name, workflowIdMap);
          if (matchedName) {
            const actualId = workflowIdMap[matchedName];
            node.parameters = node.parameters || {};
            node.parameters.workflowId = {
              __rl: true,
              mode: 'id',
              value: actualId
            };
            injectedCount++;
            console.log(`      ✓ Injected (missing ref): "${matchedName}" -> ${actualId} in node "${node.name}"`);
          } else {
            warningCount++;
            console.log(`      ✗ WARNING: No workflowId and could not match node "${node.name}"`);
          }
          return node;
        }

        if (!workflowRef.__rl) return node;

        // Case 2: mode is "list" or "name" with a workflow name as value
        if ((workflowRef.mode === 'list' || workflowRef.mode === 'name') && workflowRef.value) {
          let referencedWorkflowName = workflowRef.value;

          // Strip __WF_ID:...__  placeholder wrapper if present
          const placeholderMatch = referencedWorkflowName.match(/^__WF_ID:(.+)__$/);
          if (placeholderMatch) {
            referencedWorkflowName = placeholderMatch[1];
          }

          // Skip if already an ID (not a name) - IDs don't contain colons or spaces
          if (!referencedWorkflowName.includes(':') && !referencedWorkflowName.includes(' ')) {
            console.log(`      Skipping "${referencedWorkflowName}" - already looks like an ID`);
            return node;
          }

          const actualId = workflowIdMap[referencedWorkflowName];

          if (actualId) {
            // Update to use actual workflow ID
            // IMPORTANT: mode must be 'id' (not 'list') when using actual workflow ID
            node.parameters.workflowId = {
              __rl: true,
              mode: 'id',
              value: actualId
            };
            injectedCount++;
            console.log(`      ✓ Injected: "${referencedWorkflowName}" -> ${actualId} (mode: id) in node "${node.name}"`);
          } else {
            warningCount++;
            console.log(`      ✗ WARNING: No ID found for "${referencedWorkflowName}" in node "${node.name}"`);
            console.log(`        Available in map: ${JSON.stringify(Object.keys(workflowIdMap))}`);
          }
        }
        // Case 3: mode is "id" with a stale/unknown ID - replace if not a known deployed ID
        else if (workflowRef.mode === 'id' && workflowRef.value) {
          if (!knownIds.includes(workflowRef.value)) {
            // This ID doesn't match any workflow we just deployed - it's stale
            const matchedName = this._matchNodeToWorkflowName(node.name, workflowIdMap);
            if (matchedName) {
              const actualId = workflowIdMap[matchedName];
              node.parameters.workflowId = {
                __rl: true,
                mode: 'id',
                value: actualId
              };
              injectedCount++;
              console.log(`      ✓ Replaced stale ID: "${workflowRef.value}" -> ${actualId} (matched "${matchedName}") in node "${node.name}"`);
            } else {
              warningCount++;
              console.log(`      ✗ WARNING: Stale ID "${workflowRef.value}" in node "${node.name}" - could not match to deployed workflow`);
            }
          } else {
            console.log(`      ○ ID "${workflowRef.value}" already correct in node "${node.name}"`);
          }
        }
      }
      return node;
    });

    console.log(`    Injection complete: ${injectedCount} injected, ${warningCount} warnings`);

    return workflow;
  }

  // Match a tool/execute node name to a workflow name in the deployed ID map
  // Uses keyword matching from common node naming patterns
  _matchNodeToWorkflowName(nodeName, workflowIdMap) {
    const nodeNameKeywords = {
      'booking': 'WF2: Offer Conflict Manager',
      'offer': 'WF2: Offer Conflict Manager',
      'conflict': 'WF2: Offer Conflict Manager',
      'calendar': 'WF3: Calendar Manager',
      'payment': 'WF4: Payment Processor',
      'property': 'WF5: Property Operations',
      'operations': 'WF5: Property Operations',
      'maintenance': 'WF5: Property Operations',
      'emergency': 'WF8: Safety & Screening',
      'safety': 'WF8: Safety & Screening',
      'screening': 'WF8: Safety & Screening',
      'messenger': 'SUB: Universal Messenger',
      'send message': 'SUB: Universal Messenger',
      'send fallback': 'SUB: Universal Messenger',
      'call sub': 'SUB: Universal Messenger',
      'notifier': 'SUB: Owner & Staff Notifier',
      'notify owner': 'SUB: Owner & Staff Notifier',
      'staff notif': 'SUB: Owner & Staff Notifier',
      'daily': 'WF6: Daily Automations',
      'integration': 'WF7: Integration Hub'
    };

    const lowerName = nodeName.toLowerCase();
    for (const [keyword, workflowName] of Object.entries(nodeNameKeywords)) {
      if (lowerName.includes(keyword) && workflowIdMap[workflowName]) {
        return workflowName;
      }
    }
    return null;
  }

  // Deploy all workflows in dependency order with ID resolution
  // This creates workflows in the correct order, capturing IDs as we go
  // and injecting them into subsequent workflows that reference them
  async deployAllWorkflowsWithIdResolution(clientData, assignedApiKey, clientCredentials = {}, developerCredentials = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'n8n not configured. Check N8N_URL and N8N_API_KEY.',
        deployed: 0,
        failed: 0,
        total: 0,
        workflows: [],
        results: []
      };
    }

    // Test connection first
    console.log('\n=== Testing n8n connection before ordered deployment ===');
    const testResult = await this.testConnection();
    if (!testResult.success) {
      console.error('n8n connection test FAILED:', testResult.error);
      return {
        success: false,
        error: `n8n connection failed: ${testResult.error}`,
        deployed: 0,
        failed: 0,
        total: 0,
        workflows: [],
        results: []
      };
    }
    console.log('n8n connection OK. Existing workflows:', testResult.workflowCount);

    const clientName = clientData.property?.propertyName || clientData.owner?.ownerName || 'Client';
    const enabledPlatforms = clientData.owner?.enabledPlatforms || ['telegram', 'whatsapp', 'sms'];

    const deploymentOrder = this.getWorkflowDependencyOrder();
    const results = [];
    const deployedWorkflows = [];

    // Map to track workflow name -> actual n8n ID
    const workflowIdMap = {};

    console.log(`\n=== ORDERED DEPLOYMENT: ${deploymentOrder.length} workflows for: ${clientName} ===`);
    console.log(`Enabled platforms: ${enabledPlatforms.join(', ')}`);
    console.log('Deployment order:');
    deploymentOrder.forEach((wf, i) => console.log(`  ${i + 1}. ${wf.name}`));
    console.log('');

    const DEPLOYMENT_DELAY = 2000; // 2 seconds between deployments

    for (let i = 0; i < deploymentOrder.length; i++) {
      const workflowDef = deploymentOrder[i];
      const filename = workflowDef.filename;

      // Add delay between deployments (skip first)
      if (i > 0) {
        console.log(`  Waiting ${DEPLOYMENT_DELAY/1000}s...`);
        await this.sleep(DEPLOYMENT_DELAY);
      }

      try {
        console.log(`\n--- [${i + 1}/${deploymentOrder.length}] ${filename} ---`);
        console.log(`  Dependencies: ${workflowDef.dependencies.length > 0 ? workflowDef.dependencies.join(', ') : 'none'}`);

        // Check if all dependencies have been deployed
        const missingDeps = workflowDef.dependencies.filter(dep => !workflowIdMap[dep]);
        if (missingDeps.length > 0) {
          console.error(`  ERROR: Missing dependencies: ${missingDeps.join(', ')}`);
          results.push({ filename, success: false, error: `Missing dependencies: ${missingDeps.join(', ')}` });
          continue;
        }

        // Load template
        const template = this.loadWorkflowTemplate(filename);
        console.log(`  Loaded: ${template.name}`);

        // Get trigger tag
        const triggerTag = this.getTriggerTag(filename);

        // Personalize with client data
        let personalized = this.personalizeWorkflow(template, clientData, assignedApiKey);

        // Disable unused platform nodes
        personalized = this.disableUnusedPlatformNodes(personalized, enabledPlatforms);

        // Inject credential IDs (postgres, openai, telegram, etc.)
        personalized = this.injectCredentialIds(personalized, clientCredentials, developerCredentials);

        // IMPORTANT: Inject actual workflow IDs for references
        personalized = this.injectWorkflowIds(personalized, workflowIdMap);

        // Deploy to n8n
        const result = await this.deployWorkflow(personalized, clientName, triggerTag);

        if (result.success) {
          console.log(`  Created: ID=${result.workflowId}`);

          // Store the mapping: workflow name -> actual ID
          workflowIdMap[workflowDef.name] = result.workflowId;
          console.log(`  Registered: "${workflowDef.name}" -> ${result.workflowId}`);

          // Activate workflow
          const activateResult = await this.activateWorkflow(result.workflowId);
          console.log(`  Activated: ${activateResult.success ? 'YES' : 'NO - ' + activateResult.error}`);

          // For SUB workflows, add extra delay to ensure n8n registers them as published
          // before dependent workflows try to reference them
          if (filename.startsWith('SUB')) {
            console.log(`  Waiting 3s for SUB workflow to be fully registered...`);
            await this.sleep(3000);
          }

          deployedWorkflows.push({
            filename,
            workflowId: result.workflowId,
            name: result.name,
            originalName: workflowDef.name,
            triggerTag,
            active: activateResult.success
          });

          results.push({
            filename,
            success: true,
            workflowId: result.workflowId,
            active: activateResult.success,
            name: workflowDef.name
          });
        } else {
          console.error(`  FAILED: ${result.error}`);
          results.push({ filename, success: false, error: result.error });
        }
      } catch (error) {
        console.error(`  EXCEPTION: ${error.message}`);
        results.push({ filename, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\n=== ORDERED DEPLOYMENT SUMMARY ===`);
    console.log(`Succeeded: ${successCount} / ${deploymentOrder.length}`);
    console.log(`Failed: ${failCount}`);
    console.log('\nWorkflow ID Map:');
    for (const [name, id] of Object.entries(workflowIdMap)) {
      console.log(`  "${name}" -> ${id}`);
    }
    if (failCount > 0) {
      console.log('\nFailed workflows:');
      results.filter(r => !r.success).forEach(r => console.log(`  - ${r.filename}: ${r.error}`));
    }
    console.log('==================================\n');

    return {
      success: failCount === 0,
      deployed: successCount,
      failed: failCount,
      total: deploymentOrder.length,
      workflows: deployedWorkflows,
      workflowIdMap,
      results
    };
  }
  // ============================================
  // LIVE WORKFLOW SYNC (patch running workflows)
  // ============================================

  // Fetch a workflow from n8n by ID
  async getWorkflow(workflowId) {
    if (!this.isConfigured()) {
      return { success: false, error: 'n8n not configured' };
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/workflows/${workflowId}`,
        {
          headers: { 'X-N8N-API-KEY': this.apiKey },
          timeout: 15000
        }
      );
      return { success: true, workflow: response.data };
    } catch (error) {
      console.error(`Failed to get workflow ${workflowId}:`, error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Patch specific nodes in a live workflow
  // patches: [{ nodeId: 'ai-agent', path: 'parameters.options.systemMessage', value: '...' }]
  async patchWorkflowNodes(workflowId, patches) {
    const getResult = await this.getWorkflow(workflowId);
    if (!getResult.success) return getResult;

    const workflow = getResult.workflow;
    let patchCount = 0;

    for (const patch of patches) {
      const node = workflow.nodes.find(n => n.id === patch.nodeId || n.name === patch.nodeId);
      if (!node) {
        console.warn(`  Node "${patch.nodeId}" not found in workflow ${workflowId}`);
        continue;
      }

      // Navigate to nested path and set value
      const parts = patch.path.split('.');
      let target = node;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]]) target[parts[i]] = {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = patch.value;
      patchCount++;
    }

    if (patchCount === 0) {
      return { success: true, message: 'No patches applied (nodes not found)' };
    }

    const updateResult = await this.updateWorkflow(workflowId, workflow);
    return {
      ...updateResult,
      patchedNodes: patchCount
    };
  }

  // Update an n8n credential (delete old + create new, since n8n API doesn't support PATCH on credentials)
  async replaceCredential(oldCredentialId, type, name, data) {
    console.log(`  Replacing credential ${oldCredentialId} (${type})...`);

    // Create the new credential first
    const createResult = await this.createCredential(type, name, data);
    if (!createResult.success) {
      return { success: false, error: `Failed to create new credential: ${createResult.error}` };
    }

    // Delete old credential
    if (oldCredentialId) {
      await this.deleteCredential(oldCredentialId);
    }

    console.log(`  Credential replaced: ${oldCredentialId} -> ${createResult.credentialId}`);
    return {
      success: true,
      oldCredentialId,
      newCredentialId: createResult.credentialId,
      name: createResult.name
    };
  }

  // Sync all workflow variables to live n8n workflows
  // Uses deployed workflow IDs from SQLite, re-personalizes, and PUTs back
  async syncAllWorkflowVariables(clientData, assignedApiKey, deployedWorkflows) {
    if (!this.isConfigured()) {
      return { success: false, error: 'n8n not configured' };
    }

    const results = [];
    console.log('\n==== SYNC WORKFLOW VARIABLES ====');
    console.log(`Syncing ${deployedWorkflows.length} workflows...`);

    for (const deployed of deployedWorkflows) {
      const { workflow_id, workflow_name, filename } = deployed;
      console.log(`\n  Syncing: ${workflow_name} (${workflow_id})`);

      try {
        // 1. Get current live workflow from n8n
        const getResult = await this.getWorkflow(workflow_id);
        if (!getResult.success) {
          results.push({ workflow: workflow_name, success: false, error: getResult.error });
          continue;
        }

        const liveWorkflow = getResult.workflow;

        // 2. Re-personalize: replace placeholders in the live workflow
        const personalized = this.personalizeWorkflow(liveWorkflow, clientData, assignedApiKey);

        // 3. PUT updated workflow back
        const updateResult = await this.updateWorkflow(workflow_id, personalized);
        results.push({ workflow: workflow_name, success: updateResult.success, error: updateResult.error });

        if (updateResult.success) {
          console.log(`  ✓ ${workflow_name} synced`);
        } else {
          console.log(`  ✗ ${workflow_name} failed: ${updateResult.error}`);
        }

        // Rate limiting
        await this.sleep(1500);
      } catch (error) {
        console.error(`  Error syncing ${workflow_name}:`, error.message);
        results.push({ workflow: workflow_name, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\n==== SYNC COMPLETE: ${successCount} OK, ${failCount} FAILED ====\n`);

    return {
      success: failCount === 0,
      synced: successCount,
      failed: failCount,
      total: deployedWorkflows.length,
      results
    };
  }

  // Update credentials in all deployed workflows that reference an old credential ID
  async syncCredentialAcrossWorkflows(oldCredentialId, newCredentialId, credentialType, deployedWorkflows) {
    const results = [];

    for (const deployed of deployedWorkflows) {
      const getResult = await this.getWorkflow(deployed.workflow_id);
      if (!getResult.success) continue;

      const workflow = getResult.workflow;
      let updated = false;

      for (const node of workflow.nodes) {
        if (!node.credentials) continue;
        for (const [key, cred] of Object.entries(node.credentials)) {
          if (cred.id === oldCredentialId) {
            node.credentials[key] = { ...cred, id: newCredentialId };
            updated = true;
          }
        }
      }

      if (updated) {
        const updateResult = await this.updateWorkflow(deployed.workflow_id, workflow);
        results.push({ workflow: deployed.workflow_name, success: updateResult.success });
        await this.sleep(1500);
      }
    }

    return results;
  }
}

module.exports = new N8NService();

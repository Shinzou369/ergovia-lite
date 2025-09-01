
const { assignKeyToClient, getClientData, addKeysToPool, getPoolStats } = require('./keyManager');
const crypto = require('crypto');

/**
 * Auto-generate OpenAI API key for user with complete setup
 */
class AutoKeyGenerator {
  constructor() {
    this.keyPrefix = 'sk-ergovia-';
    this.keyLength = 51; // Standard OpenAI key length
  }

  /**
   * Generate a realistic-looking API key for testing/demo purposes
   * In production, this would interface with OpenAI's key generation API
   */
  generateDemoKey() {
    const randomPart = crypto.randomBytes(20).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 40);
    
    return `${this.keyPrefix}${randomPart}`;
  }

  /**
   * Auto-setup complete OpenAI access for a new client
   */
  async setupClientOpenAI(clientData, options = {}) {
    const {
      tokenLimit = 100000, // 100K tokens per month default
      workflowId = 'auto-generated',
      autoActivate = true
    } = options;

    try {
      console.log(`🔑 Setting up OpenAI access for: ${clientData.name || clientData.email}`);

      // Generate client ID if not provided
      const clientId = clientData.client_id || this.generateClientId(clientData);

      // Check if client already has a key
      const existingClient = getClientData(clientId);
      if (existingClient) {
        console.log(`✅ Client ${clientId} already has OpenAI access`);
        return {
          success: true,
          existing: true,
          client_id: clientId,
          key_preview: this.maskKey(existingClient.openai_key),
          usage: {
            used: existingClient.used_tokens,
            limit: existingClient.limit_tokens,
            percentage: Math.round((existingClient.used_tokens / existingClient.limit_tokens) * 100)
          }
        };
      }

      // Check pool availability and add keys if needed
      const poolStats = getPoolStats();
      if (poolStats.available_keys === 0) {
        console.log('🔄 No available keys, generating new ones...');
        await this.replenishKeyPool();
      }

      // Assign key to client
      const assignedKey = assignKeyToClient(clientId, workflowId, tokenLimit);

      // Create usage tracking entry
      const clientSetup = {
        client_id: clientId,
        business_name: clientData.name || clientData.business_name || 'Unknown Business',
        business_email: clientData.email || clientData.business_email,
        setup_date: new Date().toISOString(),
        token_limit: tokenLimit,
        auto_generated: true,
        workflow_integration: autoActivate
      };

      console.log(`✅ OpenAI access configured for ${clientSetup.business_name}`);

      return {
        success: true,
        client_id: clientId,
        key_preview: this.maskKey(assignedKey),
        token_limit: tokenLimit,
        setup_details: clientSetup,
        dashboard_url: `/api/client/usage/${clientId}`,
        integration_ready: autoActivate
      };

    } catch (error) {
      console.error('❌ Failed to setup OpenAI access:', error);
      return {
        success: false,
        error: error.message,
        client_id: clientData.client_id || null
      };
    }
  }

  /**
   * Generate unique client ID based on business data
   */
  generateClientId(clientData) {
    const identifier = clientData.email || clientData.business_email || clientData.name || 'unknown';
    const hash = crypto.createHash('md5').update(identifier).digest('hex');
    return `client-${hash.substring(0, 8)}-${Date.now().toString(36)}`;
  }

  /**
   * Mask API key for display purposes
   */
  maskKey(key) {
    if (!key || key.length < 8) return 'sk-***...***';
    return `${key.substring(0, 7)}...${key.slice(-4)}`;
  }

  /**
   * Replenish the key pool with demo keys
   * In production, this would interface with OpenAI's API
   */
  async replenishKeyPool(count = 5) {
    console.log(`🔄 Replenishing key pool with ${count} new keys...`);
    
    const newKeys = [];
    for (let i = 0; i < count; i++) {
      newKeys.push(this.generateDemoKey());
    }

    const added = addKeysToPool(newKeys);
    console.log(`✅ Added ${added.length} keys to pool`);

    return added;
  }

  /**
   * Check if automatic key generation is available
   */
  canGenerateKey() {
    const poolStats = getPoolStats();
    return poolStats.available_keys > 0 || this.canReplenishPool();
  }

  /**
   * Check if we can replenish the pool
   */
  canReplenishPool() {
    // In production, check if we have access to OpenAI's key generation API
    // For demo purposes, always return true
    return true;
  }

  /**
   * Get client's usage dashboard data
   */
  getClientDashboard(clientId) {
    const clientData = getClientData(clientId);
    if (!clientData) {
      return { error: 'Client not found' };
    }

    const percentage = Math.round((clientData.used_tokens / clientData.limit_tokens) * 100);
    const resetDate = new Date(clientData.reset_date);
    const daysUntilReset = Math.ceil((resetDate - new Date()) / (1000 * 60 * 60 * 24));

    return {
      client_id: clientId,
      business_name: clientData.business_name || 'Business',
      usage: {
        used_tokens: clientData.used_tokens,
        limit_tokens: clientData.limit_tokens,
        percentage: percentage,
        remaining: clientData.limit_tokens - clientData.used_tokens
      },
      status: percentage >= 100 ? 'limit_reached' : 
              percentage >= 80 ? 'warning' : 'healthy',
      reset_info: {
        next_reset: resetDate.toISOString(),
        days_until_reset: Math.max(0, daysUntilReset)
      },
      key_preview: this.maskKey(clientData.openai_key),
      last_used: clientData.last_used,
      created_date: clientData.created_date
    };
  }

  /**
   * Generate comprehensive setup for ETF client
   */
  async setupETFClientOpenAI(etfClientData, workflowIds = []) {
    try {
      // Extract business info from ETF client data
      const businessData = {
        name: etfClientData.business_name || etfClientData.clinic_name || etfClientData.name,
        email: etfClientData.business_email || etfClientData.clinic_email || etfClientData.email,
        client_id: etfClientData.client_id || this.generateClientId(etfClientData)
      };

      // Calculate token limit based on number of workflows
      const baseLimit = 50000; // 50K base
      const perWorkflowLimit = 25000; // 25K per additional workflow
      const calculatedLimit = baseLimit + (workflowIds.length * perWorkflowLimit);

      console.log(`📊 Calculated token limit: ${calculatedLimit} for ${workflowIds.length} workflows`);

      // Setup OpenAI access
      const setupResult = await this.setupClientOpenAI(businessData, {
        tokenLimit: calculatedLimit,
        workflowId: workflowIds.join(','),
        autoActivate: true
      });

      if (setupResult.success) {
        // Add ETF-specific tracking
        setupResult.etf_integration = {
          workflow_count: workflowIds.length,
          workflow_ids: workflowIds,
          estimated_monthly_usage: Math.round(calculatedLimit * 0.7), // 70% usage estimation
          setup_type: 'etf_automated'
        };
      }

      return setupResult;

    } catch (error) {
      console.error('❌ ETF OpenAI setup failed:', error);
      return {
        success: false,
        error: error.message,
        etf_client: etfClientData.name || 'Unknown'
      };
    }
  }
}

module.exports = { AutoKeyGenerator };

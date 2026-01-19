const axios = require('axios');
const logger = require('../../utils/logger');

class N8NClient {
  constructor(baseUrl, apiKey = null, credentials = null) {
    let normalizedUrl = baseUrl.replace(/\/$/, '');
    if (normalizedUrl && !normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    this.baseUrl = normalizedUrl;
    this.apiKey = apiKey;
    this.credentials = credentials;
    
    const headers = { 'Content-Type': 'application/json' };
    
    if (apiKey) {
      headers['X-N8N-API-KEY'] = apiKey;
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers,
      auth: credentials ? {
        username: credentials.username,
        password: credentials.password
      } : undefined
    });
  }

  async getWorkflows() {
    try {
      const response = await this.client.get('/api/v1/workflows');
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Failed to get workflows', { error: error.message });
      throw error;
    }
  }

  async getWorkflow(workflowId) {
    try {
      const response = await this.client.get(`/api/v1/workflows/${workflowId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get workflow', { workflowId, error: error.message });
      throw error;
    }
  }

  async createWorkflow(workflowData) {
    try {
      const response = await this.client.post('/api/v1/workflows', workflowData);
      logger.info('Workflow created', { name: workflowData.name, id: response.data.id });
      return response.data;
    } catch (error) {
      logger.error('Failed to create workflow', { 
        name: workflowData.name, 
        error: error.response?.data || error.message 
      });
      throw error;
    }
  }

  async updateWorkflow(workflowId, workflowData) {
    try {
      const response = await this.client.put(`/api/v1/workflows/${workflowId}`, workflowData);
      return response.data;
    } catch (error) {
      logger.error('Failed to update workflow', { workflowId, error: error.message });
      throw error;
    }
  }

  async activateWorkflow(workflowId) {
    try {
      const response = await this.client.post(`/api/v1/workflows/${workflowId}/activate`);
      logger.info('Workflow activated', { workflowId });
      return response.data;
    } catch (error) {
      logger.error('Failed to activate workflow', { workflowId, error: error.message });
      throw error;
    }
  }

  async deactivateWorkflow(workflowId) {
    try {
      const response = await this.client.post(`/api/v1/workflows/${workflowId}/deactivate`);
      return response.data;
    } catch (error) {
      logger.error('Failed to deactivate workflow', { workflowId, error: error.message });
      throw error;
    }
  }

  async deleteWorkflow(workflowId) {
    try {
      await this.client.delete(`/api/v1/workflows/${workflowId}`);
      logger.info('Workflow deleted', { workflowId });
      return true;
    } catch (error) {
      logger.error('Failed to delete workflow', { workflowId, error: error.message });
      throw error;
    }
  }

  async createCredential(credentialData) {
    try {
      const response = await this.client.post('/api/v1/credentials', credentialData);
      logger.info('Credential created', { name: credentialData.name, type: credentialData.type });
      return response.data;
    } catch (error) {
      logger.error('Failed to create credential', { 
        name: credentialData.name, 
        error: error.response?.data || error.message 
      });
      throw error;
    }
  }

  async getCredentials() {
    try {
      const response = await this.client.get('/api/v1/credentials');
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Failed to get credentials', { error: error.message });
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.client.get('/healthz');
      return true;
    } catch (error) {
      try {
        await this.getWorkflows();
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  async triggerWebhook(webhookPath, data = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/webhook/${webhookPath}`, data);
      return response.data;
    } catch (error) {
      logger.error('Failed to trigger webhook', { webhookPath, error: error.message });
      throw error;
    }
  }
}

module.exports = N8NClient;

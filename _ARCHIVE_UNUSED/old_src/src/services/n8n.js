'use strict';

const axios = require('axios');
const { logger } = require('../lib/logger');

class N8NClient {
  constructor({ baseUrl, apiKey }) {
    if (!baseUrl) throw new Error('N8N baseUrl is required');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.http = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': apiKey,
      },
    });
  }

  async request(method, endpoint, data = null) {
    try {
      const response = await this.http({ method, url: endpoint, data });
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data || err.message;

      logger.error('N8N API error', { method, endpoint, status, detail });

      const messages = {
        401: 'N8N authentication failed — check API key',
        404: 'N8N endpoint not found',
        409: 'N8N resource conflict',
      };

      throw new N8NError(
        messages[status] || `N8N error: ${status || err.message}`,
        status,
        detail
      );
    }
  }

  // Workflows
  async getWorkflows() { return this.request('GET', '/workflows'); }
  async getWorkflow(id) { return this.request('GET', `/workflows/${id}`); }
  async createWorkflow(data) { return this.request('POST', '/workflows', data); }
  async updateWorkflow(id, data) { return this.request('PUT', `/workflows/${id}`, data); }
  async activateWorkflow(id) { return this.request('POST', `/workflows/${id}/activate`); }
  async deactivateWorkflow(id) { return this.request('POST', `/workflows/${id}/deactivate`); }

  // Tags
  async getTags() {
    const res = await this.request('GET', '/tags');
    return Array.isArray(res) ? res : (res.data || []);
  }

  async findOrCreateTag(name) {
    const tags = await this.getTags();
    const existing = tags.find((t) => t.name === name);
    if (existing) return existing;

    try {
      return await this.request('POST', '/tags', { name });
    } catch (err) {
      if (err.status === 409) {
        const refreshed = await this.getTags();
        return refreshed.find((t) => t.name === name) || { name, id: null };
      }
      throw err;
    }
  }

  async tagWorkflow(workflowId, tagNames) {
    const tagObjects = [];
    for (const name of tagNames) {
      const tag = await this.findOrCreateTag(name);
      if (tag?.id) tagObjects.push({ id: tag.id });
    }
    if (tagObjects.length === 0) return null;
    return this.request('PUT', `/workflows/${workflowId}/tags`, tagObjects);
  }

  // Credentials
  async createCredential(data) { return this.request('POST', '/credentials', data); }

  // Activation check
  async canActivate(workflowId) {
    try {
      const wf = await this.getWorkflow(workflowId);
      const nodes = wf.nodes || [];
      return nodes.some((n) => {
        const type = (n.type || '').toLowerCase();
        return /trigger|webhook|poller|cron|interval|schedule/.test(type);
      });
    } catch {
      return false;
    }
  }

  // Connection test
  async testConnection() {
    const workflows = await this.getWorkflows();
    const list = workflows.data || workflows;
    return { connected: true, workflowCount: Array.isArray(list) ? list.length : 0 };
  }
}

class N8NError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'N8NError';
    this.status = status;
    this.detail = detail;
  }
}

function createN8NClient(config) {
  if (!config.n8n.enabled) {
    logger.warn('N8N not configured — workflow features disabled');
    return null;
  }
  return new N8NClient({ baseUrl: config.n8n.baseUrl, apiKey: config.n8n.apiKey });
}

module.exports = { N8NClient, N8NError, createN8NClient };

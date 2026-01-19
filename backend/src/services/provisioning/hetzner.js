const axios = require('axios');
const logger = require('../../utils/logger');
const { HETZNER } = require('../../config/constants');

class HetznerService {
  constructor(apiToken) {
    this.apiToken = apiToken || process.env.HETZNER_API_TOKEN;
    this.baseUrl = 'https://api.hetzner.cloud/v1';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async createServer(options) {
    const {
      name,
      serverType = HETZNER.DEFAULT_SERVER_TYPE,
      location = HETZNER.DEFAULT_LOCATION,
      image = HETZNER.DEFAULT_IMAGE,
      sshKeys = [],
      userData = null
    } = options;

    logger.info('Creating Hetzner server', { name, serverType, location });

    try {
      const response = await this.client.post('/servers', {
        name,
        server_type: serverType,
        location,
        image,
        ssh_keys: sshKeys,
        user_data: userData,
        start_after_create: true
      });

      const server = response.data.server;
      const rootPassword = response.data.root_password;

      logger.info('Server created successfully', { 
        serverId: server.id, 
        ip: server.public_net.ipv4.ip 
      });

      return {
        serverId: server.id,
        ip: server.public_net.ipv4.ip,
        rootPassword,
        status: server.status
      };
    } catch (error) {
      logger.error('Failed to create Hetzner server', { 
        error: error.response?.data || error.message 
      });
      throw new Error(`Hetzner server creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getServer(serverId) {
    try {
      const response = await this.client.get(`/servers/${serverId}`);
      return response.data.server;
    } catch (error) {
      logger.error('Failed to get server', { serverId, error: error.message });
      throw error;
    }
  }

  async waitForServerReady(serverId, maxWaitMs = 120000) {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < maxWaitMs) {
      const server = await this.getServer(serverId);
      
      if (server.status === 'running') {
        logger.info('Server is ready', { serverId });
        return server;
      }

      logger.debug('Waiting for server...', { serverId, status: server.status });
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Server ${serverId} did not become ready within ${maxWaitMs}ms`);
  }

  async deleteServer(serverId) {
    logger.info('Deleting Hetzner server', { serverId });
    
    try {
      await this.client.delete(`/servers/${serverId}`);
      logger.info('Server deleted successfully', { serverId });
      return true;
    } catch (error) {
      logger.error('Failed to delete server', { serverId, error: error.message });
      throw error;
    }
  }

  async listServers(labelSelector = null) {
    try {
      const params = labelSelector ? { label_selector: labelSelector } : {};
      const response = await this.client.get('/servers', { params });
      return response.data.servers;
    } catch (error) {
      logger.error('Failed to list servers', { error: error.message });
      throw error;
    }
  }

  async addServerLabel(serverId, labels) {
    try {
      await this.client.put(`/servers/${serverId}`, { labels });
      return true;
    } catch (error) {
      logger.error('Failed to add server labels', { serverId, error: error.message });
      throw error;
    }
  }

  getEstimatedMonthlyCost(serverType = HETZNER.DEFAULT_SERVER_TYPE) {
    const prices = {
      'cx11': 4.15,
      'cx21': 5.83,
      'cx31': 10.59,
      'cx41': 18.92,
      'cx51': 35.58
    };
    return prices[serverType] || prices['cx21'];
  }
}

module.exports = HetznerService;

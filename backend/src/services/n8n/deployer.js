const fs = require('fs').promises;
const path = require('path');
const N8NClient = require('./client');
const logger = require('../../utils/logger');

class WorkflowDeployer {
  constructor(n8nClient) {
    this.n8n = n8nClient;
    this.workflowsPath = path.join(__dirname, '../../../../workflows_postgresql');
  }

  async loadWorkflowTemplate(filename) {
    const filePath = path.join(this.workflowsPath, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  async listAvailableWorkflows() {
    const files = await fs.readdir(this.workflowsPath);
    return files
      .filter(f => f.endsWith('.json') && !f.includes('SUB') && !f.includes('MASTER'))
      .sort();
  }

  cleanWorkflowForN8N(workflow) {
    const cleanNodes = (workflow.nodes || []).map(node => {
      const cleanNode = { ...node };
      delete cleanNode.id;
      delete cleanNode.webhookId;
      return cleanNode;
    });
    
    return {
      name: workflow.name,
      nodes: cleanNodes,
      connections: workflow.connections || {},
      settings: workflow.settings || {},
      staticData: workflow.staticData || null
    };
  }

  replacePlaceholders(workflow, config) {
    let workflowStr = JSON.stringify(workflow);
    
    const replacements = {
      '{{PROPERTY_NAME}}': config.propertyName || 'Property',
      '{{OWNER_PHONE}}': config.ownerPhone || '',
      '{{OWNER_EMAIL}}': config.ownerEmail || '',
      '{{OWNER_TELEGRAM}}': config.ownerTelegram || '',
      '{{OPENAI_API_KEY}}': config.openaiApiKey || '',
      '{{TELEGRAM_BOT_TOKEN}}': config.telegramBotToken || '',
      '{{WHATSAPP_API_KEY}}': config.whatsappApiKey || '',
      '{{DB_HOST}}': config.dbHost || 'localhost',
      '{{DB_PORT}}': config.dbPort || '5432',
      '{{DB_NAME}}': config.dbName || '',
      '{{DB_USER}}': config.dbUser || '',
      '{{DB_PASSWORD}}': config.dbPassword || '',
      '{{BUSINESS_NAME}}': config.businessName || 'Property Manager',
      '{{SUBDOMAIN}}': config.subdomain || '',
      '{{DOMAIN}}': config.domain || ''
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      workflowStr = workflowStr.split(placeholder).join(value);
    }

    return JSON.parse(workflowStr);
  }

  async deployWorkflow(filename, config, options = {}) {
    const { activate = true, tag = null } = options;

    logger.info('Deploying workflow', { filename });

    const template = await this.loadWorkflowTemplate(filename);
    let workflow = this.replacePlaceholders(template, config);
    workflow = this.cleanWorkflowForN8N(workflow);

    const createdWorkflow = await this.n8n.createWorkflow(workflow);

    if (tag) {
      try {
        const tagObj = await this.n8n.createTag(tag);
        if (tagObj && tagObj.id) {
          await this.n8n.updateWorkflowTags(createdWorkflow.id, [tagObj]);
        }
      } catch (tagError) {
        logger.warn('Could not apply tag to workflow', { workflowId: createdWorkflow.id, error: tagError.message });
      }
    }

    if (activate) {
      await this.n8n.activateWorkflow(createdWorkflow.id);
    }

    return {
      id: createdWorkflow.id,
      name: workflow.name,
      active: activate
    };
  }

  async deployAllWorkflows(config, progressCallback = null) {
    const workflowFiles = await this.listAvailableWorkflows();
    const results = [];
    const tag = config.businessName?.replace(/\s+/g, '_') || 'deployed';

    for (let i = 0; i < workflowFiles.length; i++) {
      const filename = workflowFiles[i];
      
      try {
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: workflowFiles.length,
            filename,
            status: 'deploying'
          });
        }

        const result = await this.deployWorkflow(filename, config, { tag });
        results.push({ filename, ...result, success: true });

        logger.info('Workflow deployed', { 
          filename, 
          id: result.id,
          progress: `${i + 1}/${workflowFiles.length}` 
        });
      } catch (error) {
        logger.error('Failed to deploy workflow', { filename, error: error.message });
        results.push({ filename, success: false, error: error.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info('Deployment complete', { successful, failed, total: workflowFiles.length });

    return {
      total: workflowFiles.length,
      successful,
      failed,
      workflows: results
    };
  }

  async createPostgresCredential(config) {
    const credentialData = {
      name: `postgres_${config.subdomain}`,
      type: 'postgres',
      data: {
        host: config.dbHost || 'localhost',
        port: parseInt(config.dbPort) || 5432,
        database: config.dbName,
        user: config.dbUser,
        password: config.dbPassword,
        ssl: false
      }
    };

    return await this.n8n.createCredential(credentialData);
  }

  async createTelegramCredential(config) {
    if (!config.telegramBotToken) return null;

    const credentialData = {
      name: `telegram_${config.subdomain}`,
      type: 'telegramApi',
      data: {
        accessToken: config.telegramBotToken
      }
    };

    return await this.n8n.createCredential(credentialData);
  }

  async setupAllCredentials(config) {
    const credentials = {};

    try {
      credentials.postgres = await this.createPostgresCredential(config);
    } catch (error) {
      logger.error('Failed to create Postgres credential', { error: error.message });
    }

    try {
      credentials.telegram = await this.createTelegramCredential(config);
    } catch (error) {
      logger.error('Failed to create Telegram credential', { error: error.message });
    }

    return credentials;
  }
}

module.exports = WorkflowDeployer;

const db = require('../../config/database');
const HetznerService = require('./hetzner');
const StackInstaller = require('./installer');
const SSHService = require('./ssh');
const N8NClient = require('../n8n/client');
const WorkflowDeployer = require('../n8n/deployer');
const logger = require('../../utils/logger');
const { generateSecurePassword, generateApiKey, generateSubdomain, generateCustomerId, encrypt } = require('../../utils/crypto');
const { PROVISIONING_STATUS, HETZNER, STACK_PORTS } = require('../../config/constants');
const fs = require('fs').promises;
const path = require('path');

class ProvisioningOrchestrator {
  constructor() {
    this.hetzner = new HetznerService();
  }

  async createProvisioningJob(clientData) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const clientId = clientData.clientId || generateCustomerId();
    const subdomain = generateSubdomain(clientData.businessName);

    await db.query(`
      INSERT INTO clients (client_id, business_name, subdomain, owner_name, owner_email, owner_phone, 
                          preferred_platform, telegram_chat_id, whatsapp_number, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
    `, [
      clientId,
      clientData.businessName,
      subdomain,
      clientData.ownerName,
      clientData.ownerEmail,
      clientData.ownerPhone,
      clientData.preferredPlatform || 'telegram',
      clientData.telegramChatId,
      clientData.whatsappNumber
    ]);

    await db.query(`
      INSERT INTO provisioning_jobs (job_id, client_id, status, current_step, started_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [jobId, clientId, PROVISIONING_STATUS.PENDING, 'initializing']);

    return { jobId, clientId, subdomain };
  }

  async updateJobStatus(jobId, status, step, progressPercent, message = null, error = null) {
    const stepsCompleted = await db.query(
      'SELECT steps_completed FROM provisioning_jobs WHERE job_id = $1',
      [jobId]
    );
    
    let steps = stepsCompleted.rows[0]?.steps_completed || [];
    if (step && !steps.includes(step)) {
      steps.push(step);
    }

    await db.query(`
      UPDATE provisioning_jobs 
      SET status = $1, current_step = $2, progress_percent = $3, 
          status_message = $4, error_message = $5, steps_completed = $6,
          completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE NULL END
      WHERE job_id = $7
    `, [status, step, progressPercent, message, error, JSON.stringify(steps), jobId]);
  }

  async runProvisioning(jobId, clientId, clientData, progressCallback = null) {
    const domain = `${clientData.subdomain}.prismity.ai`;
    let serverInfo = null;

    try {
      await this.updateJobStatus(jobId, PROVISIONING_STATUS.CREATING_SERVER, 'creating_server', 5, 'Creating Hetzner server...');
      if (progressCallback) progressCallback({ step: 'creating_server', percent: 5 });

      const serverName = `prismity-${clientData.subdomain}`;
      serverInfo = await this.hetzner.createServer({
        name: serverName,
        serverType: clientData.serverType || HETZNER.DEFAULT_SERVER_TYPE,
        location: clientData.location || HETZNER.DEFAULT_LOCATION
      });

      await db.query(`
        INSERT INTO client_servers (client_id, hetzner_server_id, server_ip, server_type, location, domain, root_password)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [clientId, serverInfo.serverId, serverInfo.ip, 
          clientData.serverType || HETZNER.DEFAULT_SERVER_TYPE,
          clientData.location || HETZNER.DEFAULT_LOCATION,
          domain, encrypt(serverInfo.rootPassword)]);

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.CREATING_SERVER, 'waiting_server', 10, 'Waiting for server to be ready...');
      if (progressCallback) progressCallback({ step: 'waiting_server', percent: 10 });

      await this.hetzner.waitForServerReady(serverInfo.serverId);

      const ssh = new SSHService();
      await ssh.waitForSSH(serverInfo.ip, serverInfo.rootPassword, 30, 10000);

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.INSTALLING_STACK, 'installing_stack', 20, 'Installing Docker, PostgreSQL, and base packages...');
      if (progressCallback) progressCallback({ step: 'installing_stack', percent: 20 });

      const installer = new StackInstaller(serverInfo.ip, serverInfo.rootPassword);
      await installer.connect();

      await installer.installBasePackages();
      await this.updateJobStatus(jobId, PROVISIONING_STATUS.INSTALLING_STACK, 'installing_docker', 30, 'Installing Docker...');
      if (progressCallback) progressCallback({ step: 'installing_docker', percent: 30 });

      await installer.installDocker();
      await this.updateJobStatus(jobId, PROVISIONING_STATUS.INSTALLING_STACK, 'installing_postgresql', 40, 'Installing PostgreSQL...');
      if (progressCallback) progressCallback({ step: 'installing_postgresql', percent: 40 });

      await installer.installPostgreSQL();

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.CREATING_DATABASE, 'creating_database', 50, 'Creating database and applying schema...');
      if (progressCallback) progressCallback({ step: 'creating_database', percent: 50 });

      const dbName = `prismity_${clientData.subdomain.replace(/-/g, '_')}`;
      const dbUser = `user_${clientData.subdomain.replace(/-/g, '_').substring(0, 20)}`;
      const dbPassword = generateSecurePassword(32);

      await installer.createDatabase(dbName, dbUser, dbPassword);

      const schemaPath = path.join(__dirname, '../../../../database/schema.sql');
      const schemaSQL = await fs.readFile(schemaPath, 'utf-8');
      await installer.applySchema(dbName, dbUser, dbPassword, schemaSQL);

      await db.query(`
        UPDATE client_servers SET db_name = $1, db_user = $2, db_password = $3 WHERE client_id = $4
      `, [dbName, dbUser, encrypt(dbPassword), clientId]);

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.INSTALLING_STACK, 'installing_n8n', 60, 'Installing n8n...');
      if (progressCallback) progressCallback({ step: 'installing_n8n', percent: 60 });

      const n8nPassword = generateSecurePassword(24);
      await installer.installN8N(domain, n8nPassword);
      
      const n8nApiKey = generateApiKey();
      await db.query(`
        UPDATE client_servers SET n8n_admin_password = $1, n8n_api_key = $2 WHERE client_id = $3
      `, [encrypt(n8nPassword), encrypt(n8nApiKey), clientId]);

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.CONFIGURING_NOCODB, 'installing_nocodb', 70, 'Installing NocoDB...');
      if (progressCallback) progressCallback({ step: 'installing_nocodb', percent: 70 });

      const nocodbResult = await installer.installNocoDB(domain, dbUser, dbPassword, dbName);
      await db.query(`
        UPDATE client_servers SET nocodb_url = $1 WHERE client_id = $2
      `, [nocodbResult.nocodbUrl, clientId]);

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.INSTALLING_STACK, 'installing_authelia', 75, 'Installing Authelia...');
      if (progressCallback) progressCallback({ step: 'installing_authelia', percent: 75 });

      const autheliaResult = await installer.installAuthelia(domain);
      await db.query(`
        UPDATE client_servers SET authelia_admin_password = $1 WHERE client_id = $2
      `, [encrypt(autheliaResult.autheliaPassword), clientId]);

      installer.disconnect();

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.DEPLOYING_WORKFLOWS, 'deploying_workflows', 80, 'Deploying 24 automation workflows...');
      if (progressCallback) progressCallback({ step: 'deploying_workflows', percent: 80 });

      const n8nClient = new N8NClient(`https://${domain}`, null, {
        username: 'admin',
        password: n8nPassword
      });

      const deployer = new WorkflowDeployer(n8nClient);

      await deployer.setupAllCredentials({
        subdomain: clientData.subdomain,
        dbHost: 'localhost',
        dbPort: '5432',
        dbName,
        dbUser,
        dbPassword,
        telegramBotToken: clientData.telegramBotToken,
        openaiApiKey: clientData.openaiApiKey
      });

      const deploymentConfig = {
        businessName: clientData.businessName,
        subdomain: clientData.subdomain,
        domain,
        ownerPhone: clientData.ownerPhone,
        ownerEmail: clientData.ownerEmail,
        ownerTelegram: clientData.telegramChatId,
        dbHost: 'localhost',
        dbPort: '5432',
        dbName,
        dbUser,
        dbPassword,
        telegramBotToken: clientData.telegramBotToken,
        openaiApiKey: clientData.openaiApiKey
      };

      const deploymentResult = await deployer.deployAllWorkflows(deploymentConfig, (progress) => {
        const percent = 80 + Math.floor((progress.current / progress.total) * 15);
        this.updateJobStatus(jobId, PROVISIONING_STATUS.DEPLOYING_WORKFLOWS, 
          `deploying_workflow_${progress.current}`, percent, 
          `Deploying workflow ${progress.current}/${progress.total}: ${progress.filename}`);
        if (progressCallback) progressCallback({ step: 'deploying_workflows', percent, workflow: progress.filename });
      });

      for (const workflow of deploymentResult.workflows) {
        if (workflow.success) {
          await db.query(`
            INSERT INTO deployed_workflows (client_id, workflow_number, workflow_name, n8n_workflow_id, is_active)
            VALUES ($1, $2, $3, $4, $5)
          `, [clientId, parseInt(workflow.filename.split('_')[0]) || 0, workflow.name, workflow.id, true]);
        }
      }

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.COMPLETED, 'completed', 100, 'Provisioning complete!');
      if (progressCallback) progressCallback({ step: 'completed', percent: 100 });

      await db.query(`
        UPDATE clients SET status = 'active', activated_at = NOW() WHERE client_id = $1
      `, [clientId]);

      await db.query(`
        UPDATE client_servers SET server_status = 'running' WHERE client_id = $1
      `, [clientId]);

      return {
        success: true,
        clientId,
        domain,
        serverIp: serverInfo.ip,
        nocodb: nocodbResult.nocodbUrl,
        authelia: autheliaResult.autheliaUrl,
        workflowsDeployed: deploymentResult.successful
      };

    } catch (error) {
      logger.error('Provisioning failed', { jobId, clientId, error: error.message });

      await this.updateJobStatus(jobId, PROVISIONING_STATUS.FAILED, 'error', 0, null, error.message);

      await db.query(`
        UPDATE clients SET status = 'failed' WHERE client_id = $1
      `, [clientId]);

      throw error;
    }
  }

  async getJobStatus(jobId) {
    const result = await db.query(`
      SELECT j.*, c.business_name, c.subdomain, s.server_ip, s.domain
      FROM provisioning_jobs j
      JOIN clients c ON j.client_id = c.client_id
      LEFT JOIN client_servers s ON j.client_id = s.client_id
      WHERE j.job_id = $1
    `, [jobId]);

    return result.rows[0] || null;
  }

  async getClientInfo(clientId) {
    const result = await db.query(`
      SELECT c.*, s.*
      FROM clients c
      LEFT JOIN client_servers s ON c.client_id = s.client_id
      WHERE c.client_id = $1
    `, [clientId]);

    return result.rows[0] || null;
  }
}

module.exports = ProvisioningOrchestrator;

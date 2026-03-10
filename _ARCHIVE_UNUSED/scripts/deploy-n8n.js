#!/usr/bin/env node
'use strict';

/**
 * Automated n8n Deployment Script
 *
 * Usage:
 *   node scripts/deploy-n8n.js --client "acme-corp" --domain "acme.ergovia-ai.com"
 *
 * Or programmatically:
 *   const { deployN8NForClient } = require('./scripts/deploy-n8n');
 *   const result = await deployN8NForClient({ clientId: 'xxx', subdomain: 'acme' });
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const { NodeSSH } = require('node-ssh');

// ─── Configuration ───
const CONFIG = {
  hetzner: {
    apiToken: process.env.HETZNER_API_TOKEN,
    serverType: 'cx22',        // 2 vCPU, 4GB RAM, €4.85/mo
    location: 'nbg1',          // Nuremberg
    image: 'ubuntu-24.04',
  },
  n8n: {
    port: 5678,
    timezone: 'UTC',
  },
  baseDomain: process.env.BASE_DOMAIN || 'ergovia-ai.com',
  callbackUrl: process.env.ERGOVIA_CALLBACK_URL || 'http://localhost:5000/api/backend/onboarding/callback',
};

// ─── Utilities ───
function generatePassword(length = 24) {
  return crypto.randomBytes(length).toString('base64').slice(0, length).replace(/[+/=]/g, 'x');
}

function log(step, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, step, message, ...data }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Hetzner API ───
class HetznerClient {
  constructor(token) {
    this.client = axios.create({
      baseURL: 'https://api.hetzner.cloud/v1',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async createServer(name, options = {}) {
    log('hetzner', 'Creating server', { name });

    const response = await this.client.post('/servers', {
      name,
      server_type: options.serverType || CONFIG.hetzner.serverType,
      location: options.location || CONFIG.hetzner.location,
      image: options.image || CONFIG.hetzner.image,
      start_after_create: true,
    });

    return {
      serverId: response.data.server.id,
      ip: response.data.server.public_net.ipv4.ip,
      rootPassword: response.data.root_password,
    };
  }

  async waitForServer(serverId, maxWait = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const response = await this.client.get(`/servers/${serverId}`);
      if (response.data.server.status === 'running') {
        log('hetzner', 'Server is running', { serverId });
        return response.data.server;
      }
      await sleep(5000);
    }
    throw new Error('Server did not start in time');
  }

  async deleteServer(serverId) {
    await this.client.delete(`/servers/${serverId}`);
    log('hetzner', 'Server deleted', { serverId });
  }
}

// ─── SSH Installer ───
async function installN8N(ip, rootPassword, options) {
  const ssh = new NodeSSH();
  const { subdomain, adminPassword, encryptionKey } = options;
  const domain = `${subdomain}.${CONFIG.baseDomain}`;

  log('ssh', 'Connecting to server', { ip });

  // Wait for SSH to be available
  let connected = false;
  for (let i = 0; i < 12; i++) {
    try {
      await ssh.connect({
        host: ip,
        username: 'root',
        password: rootPassword,
        readyTimeout: 10000,
      });
      connected = true;
      break;
    } catch (err) {
      log('ssh', 'Waiting for SSH...', { attempt: i + 1 });
      await sleep(10000);
    }
  }

  if (!connected) {
    throw new Error('Could not connect via SSH');
  }

  log('ssh', 'Connected, installing packages');

  // Install Docker
  await ssh.execCommand('curl -fsSL https://get.docker.com | sh', { cwd: '/' });
  await ssh.execCommand('systemctl enable docker && systemctl start docker', { cwd: '/' });

  log('ssh', 'Docker installed');

  // Install Caddy for automatic SSL
  await ssh.execCommand(`
    apt-get update && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update && apt-get install -y caddy
  `, { cwd: '/' });

  log('ssh', 'Caddy installed');

  // Create n8n docker-compose
  const composeContent = `
services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=${domain}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - WEBHOOK_URL=https://${domain}/
      - GENERIC_TIMEZONE=${CONFIG.n8n.timezone}
      - N8N_ENCRYPTION_KEY=${encryptionKey}
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${adminPassword}
      - N8N_SECURE_COOKIE=true
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
`;

  await ssh.execCommand('mkdir -p /opt/n8n', { cwd: '/' });
  await ssh.execCommand(`cat > /opt/n8n/docker-compose.yml << 'EOFCOMPOSE'
${composeContent}
EOFCOMPOSE`, { cwd: '/' });

  // Start n8n
  await ssh.execCommand('cd /opt/n8n && docker compose up -d', { cwd: '/' });
  log('ssh', 'n8n container started');

  // Configure Caddy for reverse proxy with auto-SSL
  const caddyConfig = `
${domain} {
    reverse_proxy localhost:5678
}
`;

  await ssh.execCommand(`cat > /etc/caddy/Caddyfile << 'EOFCADDY'
${caddyConfig}
EOFCADDY`, { cwd: '/' });

  await ssh.execCommand('systemctl restart caddy', { cwd: '/' });
  log('ssh', 'Caddy configured with SSL');

  // Configure firewall
  await ssh.execCommand(`
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
  `, { cwd: '/' });

  log('ssh', 'Firewall configured');

  ssh.dispose();
  return { domain, n8nUrl: `https://${domain}` };
}

// ─── n8n API Key Generation ───
async function generateN8NApiKey(n8nUrl, adminUser, adminPassword, keyName) {
  log('n8n', 'Waiting for n8n to be ready', { url: n8nUrl });

  // Wait for n8n to be accessible
  let ready = false;
  for (let i = 0; i < 24; i++) {
    try {
      await axios.get(`${n8nUrl}/healthz`, { timeout: 5000 });
      ready = true;
      break;
    } catch (err) {
      await sleep(5000);
    }
  }

  if (!ready) {
    log('n8n', 'n8n not responding, API key must be created manually');
    return null;
  }

  log('n8n', 'n8n is ready, creating API key');

  // Login to get session
  const loginResponse = await axios.post(`${n8nUrl}/rest/login`, {
    email: adminUser,
    password: adminPassword,
  }, {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  });

  const cookies = loginResponse.headers['set-cookie'];

  // Create API key
  const apiKeyResponse = await axios.post(`${n8nUrl}/rest/api-keys`, {
    label: keyName,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies.join('; '),
    },
  });

  const apiKey = apiKeyResponse.data.data.apiKey;
  log('n8n', 'API key created successfully');

  return apiKey;
}

// ─── Callback to Ergovia/Prismity ───
async function notifyErgovia(clientId, serverData) {
  log('callback', 'Notifying Ergovia of new n8n instance', { clientId });

  try {
    await axios.post(CONFIG.callbackUrl, {
      clientId,
      status: 'completed',
      serverData: {
        serverId: serverData.serverId,
        serverIp: serverData.ip,
        n8nUrl: serverData.n8nUrl,
        n8nApiKey: serverData.n8nApiKey,
        adminUser: 'admin',
        adminPassword: serverData.adminPassword,
      },
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Provisioning-Secret': process.env.PROVISIONING_SECRET,
      },
    });

    log('callback', 'Ergovia notified successfully');
  } catch (err) {
    log('callback', 'Failed to notify Ergovia', { error: err.message });
    // Don't throw - the server is still created, just notification failed
  }
}

// ─── Main Deployment Function ───
async function deployN8NForClient(options) {
  const {
    clientId,
    clientName,
    subdomain,
  } = options;

  const serverName = `n8n-${subdomain}`;
  const adminPassword = generatePassword(24);
  const encryptionKey = generatePassword(32);

  log('deploy', 'Starting deployment', { clientId, subdomain, serverName });

  const hetzner = new HetznerClient(CONFIG.hetzner.apiToken);

  try {
    // Step 1: Create Hetzner server
    const server = await hetzner.createServer(serverName);
    log('deploy', 'Server created', { serverId: server.serverId, ip: server.ip });

    // Step 2: Wait for server to be ready
    await hetzner.waitForServer(server.serverId);

    // Step 3: Install n8n via SSH
    const { n8nUrl } = await installN8N(server.ip, server.rootPassword, {
      subdomain,
      adminPassword,
      encryptionKey,
    });

    // Step 4: Generate n8n API key
    let n8nApiKey = null;
    try {
      n8nApiKey = await generateN8NApiKey(n8nUrl, 'admin', adminPassword, `prismity-${clientId}`);
    } catch (err) {
      log('deploy', 'Could not auto-generate API key', { error: err.message });
    }

    // Step 5: Notify Ergovia backend
    const result = {
      clientId,
      subdomain,
      serverId: server.serverId,
      ip: server.ip,
      n8nUrl,
      n8nApiKey,
      adminUser: 'admin',
      adminPassword,
      encryptionKey,
      status: 'completed',
    };

    await notifyErgovia(clientId, result);

    log('deploy', 'Deployment completed successfully', {
      n8nUrl,
      hasApiKey: !!n8nApiKey,
    });

    return result;

  } catch (error) {
    log('deploy', 'Deployment failed', { error: error.message });
    throw error;
  }
}

// ─── CLI Interface ───
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
n8n Deployment Script

Usage:
  node scripts/deploy-n8n.js --client <client-id> --subdomain <subdomain>

Options:
  --client     Client ID (required)
  --subdomain  Subdomain for n8n (required) - will be {subdomain}.ergovia-ai.com
  --name       Client name (optional)

Environment Variables:
  HETZNER_API_TOKEN      Your Hetzner Cloud API token
  BASE_DOMAIN            Base domain (default: ergovia-ai.com)
  ERGOVIA_CALLBACK_URL   URL to notify when deployment is complete

Example:
  node scripts/deploy-n8n.js --client abc123 --subdomain acme-corp
    `);
    process.exit(0);
  }

  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const clientId = getArg('client');
  const subdomain = getArg('subdomain');
  const clientName = getArg('name') || subdomain;

  if (!clientId || !subdomain) {
    console.error('Error: --client and --subdomain are required');
    process.exit(1);
  }

  if (!CONFIG.hetzner.apiToken) {
    console.error('Error: HETZNER_API_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    const result = await deployN8NForClient({ clientId, clientName, subdomain });

    console.log('\n========================================');
    console.log('  DEPLOYMENT COMPLETE');
    console.log('========================================\n');
    console.log(`  n8n URL:        ${result.n8nUrl}`);
    console.log(`  Admin User:     admin`);
    console.log(`  Admin Password: ${result.adminPassword}`);
    console.log(`  API Key:        ${result.n8nApiKey || '(create manually in n8n settings)'}`);
    console.log(`  Server IP:      ${result.ip}`);
    console.log(`  Server ID:      ${result.serverId}`);
    console.log('\n========================================\n');

    // Output JSON for programmatic use
    if (args.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for programmatic use
module.exports = { deployN8NForClient, HetznerClient };

/**
 * deploy-alignment-updates.js
 * Deploys ALL workflows to n8n with [V4] prefix.
 * Handles both create (new) and update (existing) safely.
 *
 * Usage: node scripts/deploy-alignment-updates.js
 * Must be run from /opt/ergovia-lite/ on the server
 */
require('dotenv').config();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const N8N_BASE = process.env.N8N_URL || 'http://116.203.115.12:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error('ERROR: N8N_API_KEY not set in .env');
  process.exit(1);
}

function n8nRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + '/api/v1/' + endpoint);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    };
    const reqBody = body ? JSON.stringify(body) : undefined;
    if (reqBody) options.headers['Content-Length'] = Buffer.byteLength(reqBody);
    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

async function getAllWorkflows() {
  const resp = await n8nRequest('GET', 'workflows?limit=100');
  if (resp.status !== 200) throw new Error(`Failed to list workflows: ${resp.status}`);
  return resp.body.data || [];
}

async function deployWorkflow(jsonPath) {
  const wfJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  // Always deploy with [V4] prefix
  const v4Name = wfJson.name.startsWith('[V4]') ? wfJson.name : `[V4] ${wfJson.name}`;

  console.log(`\n📋 Deploying: ${v4Name}`);

  const allWorkflows = await getAllWorkflows();
  const existing = allWorkflows.find(w => w.name === v4Name);

  const payload = {
    name: v4Name,
    nodes: wfJson.nodes,
    connections: wfJson.connections,
    settings: wfJson.settings || { executionOrder: 'v1' },
  };

  if (existing) {
    console.log(`   Found existing ID: ${existing.id} — updating...`);

    // Deactivate first to avoid "Cannot publish" errors
    await n8nRequest('POST', `workflows/${existing.id}/deactivate`);
    await new Promise(r => setTimeout(r, 500));

    const resp = await n8nRequest('PUT', `workflows/${existing.id}`, payload);
    if (resp.status === 200) {
      console.log(`   ✅ Updated`);
      await tryActivate(existing.id);
    } else if (resp.status === 404) {
      // Workflow was deleted between list and update — create fresh
      console.log(`   ⚠️  ID not found (deleted), creating fresh...`);
      await createWorkflow(payload);
    } else {
      console.error(`   ❌ Update failed (${resp.status}): ${JSON.stringify(resp.body).substring(0, 200)}`);
    }
  } else {
    console.log(`   Not found — creating new...`);
    await createWorkflow(payload);
  }

  await new Promise(r => setTimeout(r, 2000));
}

async function createWorkflow(payload) {
  const resp = await n8nRequest('POST', 'workflows', payload);
  if (resp.status === 200 || resp.status === 201) {
    const newId = resp.body.id;
    console.log(`   ✅ Created with ID: ${newId}`);
    await tryActivate(newId);
  } else {
    console.error(`   ❌ Create failed (${resp.status}): ${JSON.stringify(resp.body).substring(0, 200)}`);
  }
}

async function tryActivate(id) {
  const resp = await n8nRequest('POST', `workflows/${id}/activate`);
  if (resp.status === 200) {
    console.log(`   ✅ Activated`);
  } else {
    const msg = resp.body?.message || JSON.stringify(resp.body);
    console.log(`   ⚠️  Auto-activate failed: ${msg.substring(0, 120)}`);
    console.log(`   👉 Open n8n UI → fix Execute Workflow node references → activate manually`);
  }
}

async function main() {
  console.log('=== ERGOVIA Full Workflow Deployment ===');
  console.log(`n8n: ${N8N_BASE}`);
  console.log(`API Key: ${N8N_API_KEY ? N8N_API_KEY.substring(0, 20) + '...' : 'NOT SET'}\n`);

  const dir = path.join(__dirname, '../workflows/v4');

  // Deploy order: SUBs first, then WF2-WF8, WF1 last (WF1 depends on all others)
  const deployOrder = [
    'SUB_Universal_Messenger.json',
    'SUB_Owner_Staff_Notifier.json',
    'WF2_Offer_Conflict_Manager.json',
    'WF3_Calendar_Manager.json',
    'WF4_Payment_Processor.json',
    'WF5_Property_Operations.json',
    'WF6_Daily_Automations.json',
    'WF7_Integration_Hub.json',
    'WF8_Safety_Screening.json',
    'WF1_AI_Gateway.json',  // last — depends on WF2-WF8
  ];

  for (const file of deployOrder) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }
    await deployWorkflow(filePath);
  }

  console.log('\n=== Deployment complete ===');
  console.log('Next: Open n8n UI and verify [V4] workflows are listed and active.');
  console.log('If activation failed, fix Execute Workflow node references to use [V4] names.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

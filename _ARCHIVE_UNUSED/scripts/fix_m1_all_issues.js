/**
 * Fix ALL M1 Workflow Issues
 *
 * 1. WF1: Fix Telegram credential (zVeqOWyNYVpJzxn2 → 6ltptOrFLUaZzC1C)
 * 2. WF1: Fix WhatsApp node missing textBody
 * 3. WF1: Activate WF1
 * 4. ALL: Fix WhatsApp phoneNumberId (add $env. prefix)
 * 5. WF0: Fix hardcoded forward URL
 * 6. WF3: Fix hardcoded closing-conversation URL
 */

const https = require('https');

const N8N_URL = 'https://n8n.ergovia-ai.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcxOTEwMTk3fQ.oX7JSmVnvb0LlX_m-nLk4xm1U18avBQ88DAdMoMYOM0';

const CORRECT_TELEGRAM_CRED = { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' };

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, N8N_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// M1 Workflow IDs
const WORKFLOWS = {
  WF0: '9DVVyNM7MLBfLZxM',
  WF1: 'Uiu7iYqYRkVBI1qr',
  WF2: 'AuYchJhChKipbGSw',
  WF3: '5QI4Fk2z0WL4p9Pl',
  WF5: '1elN5Sq7hGa093wJ',
  WF6: 'GlZgQB8OnJXbdLBp',
  WF7: 'f6P8rc9VsiCC9vp4'
};

async function getWorkflow(id) {
  return apiCall('GET', '/api/v1/workflows/' + id);
}

async function updateWorkflow(id, wf) {
  // n8n PUT requires name, nodes, connections, settings
  const body = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' }
  };
  return apiCall('PUT', '/api/v1/workflows/' + id, body);
}

async function activateWorkflow(id) {
  return apiCall('POST', '/api/v1/workflows/' + id + '/activate');
}

async function main() {
  console.log('=== M1 Workflow Fixes ===\n');
  let totalFixes = 0;

  // ─────────────────────────────────────────────
  // FIX 1: WF1 — Fix Telegram credential + WhatsApp textBody
  // ─────────────────────────────────────────────
  console.log('--- Fix 1: WF1 Telegram credential + WhatsApp ---');
  const wf1 = await getWorkflow(WORKFLOWS.WF1);
  let wf1Changed = false;

  for (const node of wf1.nodes) {
    // Fix Telegram credential
    if (node.credentials && node.credentials.telegramApi) {
      const cred = node.credentials.telegramApi;
      if (cred.id !== CORRECT_TELEGRAM_CRED.id) {
        console.log('  [WF1] Fixing Telegram cred on node "' + node.name + '": ' + cred.id + ' → ' + CORRECT_TELEGRAM_CRED.id);
        node.credentials.telegramApi = CORRECT_TELEGRAM_CRED;
        wf1Changed = true;
        totalFixes++;
      }
    }

    // Fix WhatsApp phoneNumberId + add textBody
    if (node.type === 'n8n-nodes-base.whatsApp') {
      const params = node.parameters;
      // Fix phoneNumberId
      if (params.phoneNumberId && !params.phoneNumberId.includes('$env.')) {
        const oldVal = params.phoneNumberId;
        params.phoneNumberId = '={{ $env.WHATSAPP_PHONE_NUMBER_ID || "" }}';
        console.log('  [WF1] Fixed WhatsApp phoneNumberId on "' + node.name + '": ' + oldVal + ' → $env.WHATSAPP_PHONE_NUMBER_ID');
        wf1Changed = true;
        totalFixes++;
      }
      // Add textBody if missing
      if (!params.textBody) {
        // For WF1 content generator, the post text comes from previous node
        params.textBody = '={{ $json.post_text || $json.content_text || "" }}';
        console.log('  [WF1] Added missing textBody to WhatsApp node "' + node.name + '"');
        wf1Changed = true;
        totalFixes++;
      }
    }
  }

  if (wf1Changed) {
    const result = await updateWorkflow(WORKFLOWS.WF1, wf1);
    console.log('  [WF1] Updated: ' + (result.id ? 'OK' : JSON.stringify(result).substring(0, 200)));
    await sleep(2000);
  }

  // Activate WF1
  console.log('  [WF1] Activating...');
  const activateResult = await activateWorkflow(WORKFLOWS.WF1);
  if (activateResult.active === true) {
    console.log('  [WF1] Activated successfully!');
    totalFixes++;
  } else {
    console.log('  [WF1] Activation result: ' + JSON.stringify(activateResult).substring(0, 200));
  }
  await sleep(2000);

  // ─────────────────────────────────────────────
  // FIX 2: Fix WhatsApp phoneNumberId in WF2, WF5, WF6, WF7
  // ─────────────────────────────────────────────
  console.log('\n--- Fix 2: WhatsApp phoneNumberId across WF2, WF5, WF6, WF7 ---');
  const whatsappWFs = ['WF2', 'WF5', 'WF6', 'WF7'];

  for (const wfName of whatsappWFs) {
    const wf = await getWorkflow(WORKFLOWS[wfName]);
    let changed = false;

    for (const node of wf.nodes) {
      if (node.type === 'n8n-nodes-base.whatsApp' || (node.parameters && node.parameters.phoneNumberId)) {
        const params = node.parameters;
        if (params.phoneNumberId && !params.phoneNumberId.includes('$env.')) {
          const oldVal = params.phoneNumberId;
          params.phoneNumberId = '={{ $env.WHATSAPP_PHONE_NUMBER_ID || "" }}';
          console.log('  [' + wfName + '] Fixed phoneNumberId on "' + node.name + '"');
          changed = true;
          totalFixes++;
        }
      }
    }

    if (changed) {
      const result = await updateWorkflow(WORKFLOWS[wfName], wf);
      console.log('  [' + wfName + '] Updated: ' + (result.id ? 'OK' : JSON.stringify(result).substring(0, 200)));
    } else {
      console.log('  [' + wfName + '] No WhatsApp fixes needed');
    }
    await sleep(1500);
  }

  // ─────────────────────────────────────────────
  // FIX 3: WF0 — Fix hardcoded forward URL
  // ─────────────────────────────────────────────
  console.log('\n--- Fix 3: WF0 hardcoded forward URL ---');
  const wf0 = await getWorkflow(WORKFLOWS.WF0);
  let wf0Changed = false;

  for (const node of wf0.nodes) {
    if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters && node.parameters.url) {
      const oldUrl = node.parameters.url;
      if (oldUrl.includes('n8n.ergovia-ai.com') && !oldUrl.includes('$env.')) {
        // Replace hardcoded domain with environment variable
        // Keep the path intact, just make the base dynamic
        node.parameters.url = '={{ ($env.N8N_WEBHOOK_BASE_URL || "https://n8n.ergovia-ai.com") + "/webhook/marketing/telegram-webhook" }}';
        console.log('  [WF0] Fixed forward URL on "' + node.name + '"');
        wf0Changed = true;
        totalFixes++;
      }
    }
  }

  if (wf0Changed) {
    const result = await updateWorkflow(WORKFLOWS.WF0, wf0);
    console.log('  [WF0] Updated: ' + (result.id ? 'OK' : JSON.stringify(result).substring(0, 200)));
  }
  await sleep(1500);

  // ─────────────────────────────────────────────
  // FIX 4: WF3 — Fix hardcoded closing-conversation URL
  // ─────────────────────────────────────────────
  console.log('\n--- Fix 4: WF3 hardcoded closing-conversation URL ---');
  const wf3 = await getWorkflow(WORKFLOWS.WF3);
  let wf3Changed = false;

  for (const node of wf3.nodes) {
    if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters && node.parameters.url) {
      const url = node.parameters.url;
      if (url.includes('closing-conversation') && url.includes('n8n.ergovia-ai.com') && !url.includes('$env.')) {
        node.parameters.url = '={{ ($env.N8N_WEBHOOK_BASE_URL || "https://n8n.ergovia-ai.com") + "/webhook/marketing/closing-conversation" }}';
        console.log('  [WF3] Fixed closing-conversation URL on "' + node.name + '"');
        wf3Changed = true;
        totalFixes++;
      }
    }
  }

  if (wf3Changed) {
    const result = await updateWorkflow(WORKFLOWS.WF3, wf3);
    console.log('  [WF3] Updated: ' + (result.id ? 'OK' : JSON.stringify(result).substring(0, 200)));
  }

  console.log('\n=== Total fixes applied: ' + totalFixes + ' ===');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

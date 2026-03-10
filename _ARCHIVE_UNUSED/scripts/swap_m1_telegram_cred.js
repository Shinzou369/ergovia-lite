/**
 * Swap Telegram credential across ALL M1 workflows
 * Old: [Client] Telegram Bot (6ltptOrFLUaZzC1C)
 * New: M1 Marketing Telegram Bot (bJzFidfDtovqrjeL)
 */

const https = require('https');

const N8N_URL = 'https://n8n.ergovia-ai.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcxOTEwMTk3fQ.oX7JSmVnvb0LlX_m-nLk4xm1U18avBQ88DAdMoMYOM0';

const NEW_CRED = { id: 'bJzFidfDtovqrjeL', name: 'M1 Marketing Telegram Bot' };

const M1_WORKFLOWS = {
  'M1 WF0': '9DVVyNM7MLBfLZxM',
  'M1 WF1': 'Uiu7iYqYRkVBI1qr',
  'M1 WF2': 'AuYchJhChKipbGSw',
  'M1 WF3': '5QI4Fk2z0WL4p9Pl',
  'M1 WF4': 'DaJyv2gI73cMIdqI',
  'M1 WF5': '1elN5Sq7hGa093wJ',
  'M1 WF6': 'GlZgQB8OnJXbdLBp',
  'M1 WF7': 'f6P8rc9VsiCC9vp4'
};

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, N8N_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Swapping Telegram Credential in ALL M1 Workflows ===');
  console.log('New credential: ' + NEW_CRED.name + ' (' + NEW_CRED.id + ')\n');

  let totalSwaps = 0;

  for (const [label, wfId] of Object.entries(M1_WORKFLOWS)) {
    const wf = await apiCall('GET', '/api/v1/workflows/' + wfId);
    if (!wf.nodes) {
      console.log('[' + label + '] ERROR: Could not fetch workflow');
      continue;
    }

    let changed = false;
    for (const node of wf.nodes) {
      // Swap telegramApi credential
      if (node.credentials && node.credentials.telegramApi) {
        const old = node.credentials.telegramApi;
        if (old.id !== NEW_CRED.id) {
          node.credentials.telegramApi = NEW_CRED;
          console.log('  [' + label + '] Swapped on "' + node.name + '" (' + old.id + ' → ' + NEW_CRED.id + ')');
          changed = true;
          totalSwaps++;
        }
      }

      // Also check for telegramTrigger nodes (WF0 uses Telegram Trigger)
      if (node.type === 'n8n-nodes-base.telegramTrigger' && node.credentials && node.credentials.telegramApi) {
        const old = node.credentials.telegramApi;
        if (old.id !== NEW_CRED.id) {
          node.credentials.telegramApi = NEW_CRED;
          console.log('  [' + label + '] Swapped trigger on "' + node.name + '" (' + old.id + ' → ' + NEW_CRED.id + ')');
          changed = true;
          totalSwaps++;
        }
      }
    }

    if (changed) {
      const result = await apiCall('PUT', '/api/v1/workflows/' + wfId, {
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: wf.settings || { executionOrder: 'v1' }
      });
      console.log('  [' + label + '] Updated: ' + (result.id ? 'OK' : JSON.stringify(result).substring(0, 200)));
    } else {
      console.log('  [' + label + '] No Telegram nodes to swap');
    }

    await sleep(1500);
  }

  console.log('\n=== Done. Total credential swaps: ' + totalSwaps + ' ===');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });

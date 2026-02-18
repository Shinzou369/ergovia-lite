/**
 * Check all workflow statuses, then activate V4 workflows
 */
const http = require('http');

const N8N_URL = 'http://116.203.115.12:5678';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwMDE2MjA0fQ.MjLv7Jf9YKSUfvS8gJVSvsah1hulXRszsirmZ63Rc5c';

const V4_IDS = [
  'MWFSKpUCpYfFzDTr', // SUB: Universal Messenger
  'SV80ObHW5jp7mOhL', // SUB: Owner & Staff Notifier
  'tvSLRSiOmNdkEfA2', // WF1: AI Gateway
  'XnhCywT7s1ttYFvr', // WF2: Offer Conflict Manager
  'FDZAlqrvOW4RUGHq', // WF3: Calendar Manager
  'iaBWaaIjFUrzBcon', // WF4: Payment Processor
  'fIVtVj3tFzUKYgoN', // WF5: Property Operations
  'kohspAO4n8msHAFQ', // WF6: Daily Automations
  '3wN9FArGC9GgEcOz', // WF7: Integration Hub
  'gNn1OeCXspbOYg6K', // WF8: Safety & Screening
];

function apiCall(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, N8N_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON from ${urlPath}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${urlPath}`)); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Step 1: List all workflows
  console.log('=== CURRENT WORKFLOW STATUS ===\n');
  const res = await apiCall('/api/v1/workflows?limit=50');
  const wfs = res.data || [];

  for (const wf of wfs.sort((a, b) => a.name.localeCompare(b.name))) {
    const status = wf.active ? 'ACTIVE  ' : 'INACTIVE';
    const isV4 = V4_IDS.includes(wf.id);
    const tag = isV4 ? ' [V4]' : '';
    console.log(`  ${status}  ${wf.name} (${wf.id})${tag}`);
  }
  console.log(`\nTotal: ${wfs.length} workflows`);

  // Step 2: Activate V4 workflows
  console.log('\n=== ACTIVATING V4 WORKFLOWS ===\n');

  let activated = 0;
  let alreadyActive = 0;
  let errors = 0;

  for (const id of V4_IDS) {
    const wf = wfs.find(w => w.id === id);
    const name = wf ? wf.name : id;

    if (wf && wf.active) {
      console.log(`  SKIP (already active): ${name}`);
      alreadyActive++;
      continue;
    }

    try {
      await apiCall(`/api/v1/workflows/${id}/activate`, 'POST');
      console.log(`  ACTIVATED: ${name}`);
      activated++;
      await delay(2000); // Rate limit between activations
    } catch (err) {
      console.error(`  ERROR activating ${name}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`  Activated: ${activated}`);
  console.log(`  Already active: ${alreadyActive}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total V4: ${V4_IDS.length}`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

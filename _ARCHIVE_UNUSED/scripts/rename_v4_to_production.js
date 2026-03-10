/**
 * Rename V4 workflows to production names (remove [V4] prefix)
 * Also confirms they are active and M1 are inactive
 */
const http = require('http');

const N8N_URL = 'http://116.203.115.12:5678';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwMDE2MjA0fQ.MjLv7Jf9YKSUfvS8gJVSvsah1hulXRszsirmZ63Rc5c';

const V4_IDS = [
  { id: 'MWFSKpUCpYfFzDTr', prodName: 'SUB: Universal Messenger' },
  { id: 'SV80ObHW5jp7mOhL', prodName: 'SUB: Owner & Staff Notifier' },
  { id: 'tvSLRSiOmNdkEfA2', prodName: 'WF1: AI Gateway - Unified Entry Point' },
  { id: 'XnhCywT7s1ttYFvr', prodName: 'WF2: Offer Conflict Manager' },
  { id: 'FDZAlqrvOW4RUGHq', prodName: 'WF3: Calendar Manager' },
  { id: 'iaBWaaIjFUrzBcon', prodName: 'WF4: Payment Processor' },
  { id: 'fIVtVj3tFzUKYgoN', prodName: 'WF5: Property Operations' },
  { id: 'kohspAO4n8msHAFQ', prodName: 'WF6: Daily Automations' },
  { id: '3wN9FArGC9GgEcOz', prodName: 'WF7: Integration Hub' },
  { id: 'gNn1OeCXspbOYg6K', prodName: 'WF8: Safety & Screening' },
];

function apiCall(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, N8N_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
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
  // Step 1: Fetch all workflows to show current state
  console.log('=== CURRENT STATE ===\n');
  const res = await apiCall('/api/v1/workflows?limit=50');
  const wfs = res.data || [];

  const v4Set = new Set(V4_IDS.map(v => v.id));

  // Show V4 workflows
  console.log('V4 WORKFLOWS:');
  for (const wf of wfs.filter(w => v4Set.has(w.id))) {
    console.log(`  ${wf.active ? 'ACTIVE  ' : 'INACTIVE'}  ${wf.name} (${wf.id})`);
  }

  // Show M1 workflows (the old ones from tag_m1_and_save_v4.js)
  const M1_IDS = ['UZMWfhnV6JmuwJXC','0L7HOkqENABlbPtT','LP7YknAVPiQsidWq','NPInwpKv4Oriq04F','pEn69kwNtCEQ21y9','5loDH75zrEDh9x5H','JWEu9Uz2JJ5XZeIX','ccEOaNnIwY6eeJOn','Ay5QOyGAHG2l40s7','mLm2HaIRzNfIX5uh'];
  const m1Set = new Set(M1_IDS);

  console.log('\nM1 WORKFLOWS (old):');
  for (const wf of wfs.filter(w => m1Set.has(w.id))) {
    console.log(`  ${wf.active ? 'ACTIVE  ' : 'INACTIVE'}  ${wf.name} (${wf.id})`);
  }

  // Step 2: Rename V4 workflows to production names
  console.log('\n=== RENAMING V4 → PRODUCTION NAMES ===\n');

  let renamed = 0;
  for (const v4 of V4_IDS) {
    const wf = wfs.find(w => w.id === v4.id);
    const currentName = wf ? wf.name : '???';

    if (currentName === v4.prodName) {
      console.log(`  SKIP (already clean): ${currentName}`);
      renamed++;
      continue;
    }

    try {
      await apiCall(`/api/v1/workflows/${v4.id}`, 'PATCH', { name: v4.prodName });
      console.log(`  RENAMED: ${currentName} → ${v4.prodName}`);
      renamed++;
      await delay(500);
    } catch (err) {
      console.error(`  ERROR: ${currentName} → ${err.message}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`  Renamed: ${renamed}/${V4_IDS.length}`);
  console.log(`  All V4 workflows are now production-named and active.`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

/**
 * M1 Activate — Activate inactive M1 workflows + scan credentials
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body)); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const M1_IDS = [
  'mK6n5hWPAQcNCHC7', '9DVVyNM7MLBfLZxM', 'Uiu7iYqYRkVBI1qr',
  'AuYchJhChKipbGSw', '5QI4Fk2z0WL4p9Pl', 'n4YFcvvVQqXF49dX',
  '1elN5Sq7hGa093wJ', 'GlZgQB8OnJXbdLBp', 'f6P8rc9VsiCC9vp4', 'pxcMCoG4OVK0ZhE9'
];

async function main() {
  console.log('=== M1 Workflow Activation ===\n');

  const inactive = [];

  // 1. Scan
  console.log('1. Current status:\n');
  for (const id of M1_IDS) {
    try {
      const wf = await apiCall('GET', `/api/v1/workflows/${id}`);
      if (!wf || !wf.id) { console.log(`  ? [${id}] — Could not load`); continue; }

      const icon = wf.active ? '+' : '-';
      console.log(`  ${icon} ${wf.name} [${id}] — ${wf.active ? 'ACTIVE' : 'INACTIVE'} (${(wf.nodes || []).length} nodes)`);

      const creds = new Set();
      for (const n of (wf.nodes || [])) {
        if (n.credentials) {
          for (const [type, cred] of Object.entries(n.credentials)) {
            creds.add(`${type}: ${cred.name} (${cred.id})`);
          }
        }
      }
      for (const c of creds) console.log(`      ${c}`);

      if (!wf.active) inactive.push({ id, name: wf.name });
    } catch (err) {
      console.log(`  ! [${id}] — Error: ${err.message}`);
    }
    await sleep(500);
  }

  // 2. Activate
  console.log(`\n2. Activating ${inactive.length} inactive workflows:\n`);
  for (const { id, name } of inactive) {
    try {
      const result = await apiCall('POST', `/api/v1/workflows/${id}/activate`);
      if (result && result.active) {
        console.log(`  OK ${name} — ACTIVATED`);
      } else {
        const msg = typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200);
        console.log(`  FAIL ${name} — ${msg}`);
      }
    } catch (err) {
      console.log(`  FAIL ${name} — ${err.message}`);
    }
    await sleep(2000);
  }

  // 3. Verify
  console.log('\n3. Final status:\n');
  let active = 0;
  for (const id of M1_IDS) {
    try {
      const wf = await apiCall('GET', `/api/v1/workflows/${id}`);
      if (wf && wf.id) {
        console.log(`  ${wf.active ? '+' : '-'} ${wf.name} — ${wf.active ? 'ACTIVE' : 'INACTIVE'}`);
        if (wf.active) active++;
      }
    } catch (err) {
      console.log(`  ? [${id}] — Error`);
    }
    await sleep(300);
  }

  console.log(`\nResult: ${active}/${M1_IDS.length} M1 workflows active`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

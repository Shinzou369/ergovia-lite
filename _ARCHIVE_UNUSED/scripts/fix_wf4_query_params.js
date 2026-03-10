/**
 * Fix WF4: "there is no parameter $1"
 *
 * Root cause: I added = prefix to SQL queries containing $1/$2,
 * which puts them in Expression mode. n8n then interprets $1 as an
 * n8n variable (like $now, $json) instead of a PostgreSQL parameter.
 *
 * Fix: Remove = prefix from queries that use $1/$2 parameterized queries.
 * Only queries with {{ }} expressions need the = prefix.
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF4_ID = 'iaBWaaIjFUrzBcon';

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

async function main() {
  console.log('=== Fix WF4: Remove = prefix from parameterized queries ===\n');

  const wf4 = await apiCall('GET', `/api/v1/workflows/${WF4_ID}`);
  console.log(`Loaded: ${wf4.name} (${wf4.nodes.length} nodes)\n`);

  let fixes = 0;

  for (const node of wf4.nodes) {
    const q = node.parameters?.query;
    if (!q || typeof q !== 'string') continue;

    // If query starts with = AND contains $1 or $2 (PostgreSQL params),
    // remove the = prefix — it breaks parameterized queries
    if (q.startsWith('=') && /\$\d+/.test(q)) {
      node.parameters.query = q.substring(1);
      console.log(`\u2713 ${node.name}: Removed = prefix (has $1/$2 params)`);
      fixes++;
    } else if (q.startsWith('=') && !q.includes('{{')) {
      // Also remove = from queries that don't need expression mode
      node.parameters.query = q.substring(1);
      console.log(`\u2713 ${node.name}: Removed unnecessary = prefix`);
      fixes++;
    } else {
      console.log(`  ${node.name}: OK (no change needed)`);
    }
  }

  // Deploy
  console.log(`\nDeploying ${fixes} fixes...`);
  await apiCall('POST', `/api/v1/workflows/${WF4_ID}/deactivate`);
  await sleep(1500);

  const result = await apiCall('PUT', `/api/v1/workflows/${WF4_ID}`, {
    name: wf4.name, nodes: wf4.nodes, connections: wf4.connections,
    settings: wf4.settings || {}, staticData: wf4.staticData || null
  });

  if (result.id) {
    console.log('Updated! Nodes:', result.nodes.length);
  } else {
    console.error('FAILED:', JSON.stringify(result).substring(0, 300));
    return;
  }
  await sleep(1000);

  const act = await apiCall('POST', `/api/v1/workflows/${WF4_ID}/activate`);
  console.log('Active:', act.active);

  console.log(`\n=== DONE: ${fixes} queries fixed ===`);
  console.log('\nLesson: NEVER add = prefix to queries using $1/$2 PostgreSQL parameters.');
  console.log('The = prefix makes n8n interpret $1 as an n8n variable, not a SQL parameter.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

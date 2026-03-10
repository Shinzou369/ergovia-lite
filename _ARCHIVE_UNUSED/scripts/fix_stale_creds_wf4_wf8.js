const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const CORRECT = {
  postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' },
  openAiApi: { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
  telegramApi: { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' }
};
const STALE_IDS = ['sjaI08GtPbON8TLX', 'sCKJDGWd6f8LxAw1', 'm5CO4ySXIhlnUNcp'];

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fixWorkflow(id, label) {
  const { data: wf } = await apiCall('GET', '/api/v1/workflows/' + id);
  console.log('\n' + label + ': ' + wf.name + ' (' + wf.nodes.length + ' nodes)');
  let fixed = 0;
  for (const node of wf.nodes) {
    if (!node.credentials) continue;
    for (const [type, cred] of Object.entries(node.credentials)) {
      if (STALE_IDS.includes(cred.id) && CORRECT[type]) {
        const old = cred.name;
        node.credentials[type] = CORRECT[type];
        console.log('  Fixed: "' + node.name + '" ' + type + ' (' + old + ' -> ' + CORRECT[type].name + ')');
        fixed++;
      }
    }
  }
  if (fixed === 0) { console.log('  No stale credentials.'); return true; }

  await apiCall('POST', '/api/v1/workflows/' + id + '/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/' + id, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 300));
    await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
    return false;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
  console.log('  ' + label + ': SUCCESS (' + fixed + ' fixed)');
  return true;
}

async function main() {
  await fixWorkflow('5loDH75zrEDh9x5H', 'WF4');
  await sleep(2000);
  await fixWorkflow('mLm2HaIRzNfIX5uh', 'WF8');

  // Final audit
  console.log('\n=== FINAL AUDIT - ALL 9 WORKFLOWS ===\n');
  const all = [
    ['UZMWfhnV6JmuwJXC', 'SUB'], ['LP7YknAVPiQsidWq', 'WF1'], ['NPInwpKv4Oriq04F', 'WF2'],
    ['pEn69kwNtCEQ21y9', 'WF3'], ['5loDH75zrEDh9x5H', 'WF4'], ['JWEu9Uz2JJ5XZeIX', 'WF5'],
    ['ccEOaNnIwY6eeJOn', 'WF6'], ['Ay5QOyGAHG2l40s7', 'WF7'], ['mLm2HaIRzNfIX5uh', 'WF8']
  ];
  let allClean = true;
  for (const [wfId, label] of all) {
    const { data: wf } = await apiCall('GET', '/api/v1/workflows/' + wfId);
    let stale = 0;
    for (const n of wf.nodes) {
      if (n.credentials) {
        for (const [type, cred] of Object.entries(n.credentials)) {
          if (STALE_IDS.includes(cred.id)) {
            stale++;
            console.log('    STALE: ' + label + ' / "' + n.name + '" ' + type + ' = ' + cred.id);
          }
        }
      }
    }
    console.log('  ' + label.padEnd(4) + ' | ' + wf.nodes.length + ' nodes | active=' + wf.active + ' | ' +
      (stale === 0 ? 'CLEAN' : stale + ' STALE'));
    if (stale > 0) allClean = false;
  }
  console.log('\n  ALL CREDENTIALS: ' + (allClean ? 'CLEAN' : 'STILL HAS STALE'));
}

main().catch(console.error);

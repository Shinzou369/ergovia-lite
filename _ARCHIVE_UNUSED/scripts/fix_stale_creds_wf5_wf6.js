const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const CORRECT_PG = { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' };
const CORRECT_OAI = { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' };
const CORRECT_TG = { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' };
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

async function fixCredentials(id, label) {
  const { data: wf } = await apiCall('GET', '/api/v1/workflows/' + id);
  console.log('\n' + label + ': ' + wf.name + ' (' + wf.nodes.length + ' nodes)');

  let fixed = 0;
  for (const node of wf.nodes) {
    if (!node.credentials) continue;
    for (const [type, cred] of Object.entries(node.credentials)) {
      if (STALE_IDS.includes(cred.id)) {
        const oldName = cred.name;
        if (type === 'postgres') {
          node.credentials[type] = CORRECT_PG;
        } else if (type === 'openAiApi') {
          node.credentials[type] = CORRECT_OAI;
        } else if (type === 'telegramApi') {
          node.credentials[type] = CORRECT_TG;
        }
        console.log('  Fixed: "' + node.name + '" ' + type + ' (' + oldName + ' → ' + node.credentials[type].name + ')');
        fixed++;
      }
    }
  }

  if (fixed === 0) {
    console.log('  No stale credentials found.');
    return true;
  }

  console.log('  Fixed ' + fixed + ' credentials. Uploading...');
  await apiCall('POST', '/api/v1/workflows/' + id + '/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/' + id, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status);
    await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
    return false;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
  console.log('  ' + label + ': SUCCESS');
  return true;
}

async function main() {
  console.log('=== FIXING STALE CREDENTIALS ===\n');

  await fixCredentials('ccEOaNnIwY6eeJOn', 'WF6');
  await sleep(2000);
  await fixCredentials('JWEu9Uz2JJ5XZeIX', 'WF5');
  await sleep(2000);

  // Verify all 9 workflows for stale creds
  console.log('\n=== FULL CREDENTIAL AUDIT ===\n');
  const workflows = [
    ['UZMWfhnV6JmuwJXC', 'SUB'],
    ['LP7YknAVPiQsidWq', 'WF1'],
    ['NPInwpKv4Oriq04F', 'WF2'],
    ['pEn69kwNtCEQ21y9', 'WF3'],
    ['5loDH75zrEDh9x5H', 'WF4'],
    ['JWEu9Uz2JJ5XZeIX', 'WF5'],
    ['ccEOaNnIwY6eeJOn', 'WF6'],
    ['Ay5QOyGAHG2l40s7', 'WF7'],
    ['mLm2HaIRzNfIX5uh', 'WF8']
  ];

  for (const [wfId, label] of workflows) {
    const { data: wf } = await apiCall('GET', '/api/v1/workflows/' + wfId);
    let stale = 0;
    for (const n of wf.nodes) {
      if (n.credentials) {
        for (const [type, cred] of Object.entries(n.credentials)) {
          if (STALE_IDS.includes(cred.id)) stale++;
        }
      }
    }
    console.log('  ' + label + ' (' + wf.nodes.length + ' nodes, active=' + wf.active + '): ' +
      (stale === 0 ? 'CLEAN' : stale + ' STALE'));
  }
}

main().catch(console.error);

const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
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

async function main() {
  // Fix 1: SUB credential mismatch
  console.log('=== Fix SUB: Universal Messenger credential ===');
  const { data: sub } = await apiCall('GET', '/api/v1/workflows/UZMWfhnV6JmuwJXC');
  let subChanged = false;

  for (const node of sub.nodes) {
    if (node.credentials) {
      for (const [type, cred] of Object.entries(node.credentials)) {
        if (cred.id === 'sjaI08GtPbON8TLX') {
          console.log('  Fixing ' + node.name + ': sjaI08GtPbON8TLX -> BWlLUMKn64aZsHi8');
          node.credentials[type] = { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' };
          subChanged = true;
        }
      }
    }
  }

  if (subChanged) {
    await apiCall('POST', '/api/v1/workflows/UZMWfhnV6JmuwJXC/deactivate');
    await sleep(1000);
    const update = await apiCall('PUT', '/api/v1/workflows/UZMWfhnV6JmuwJXC', {
      name: sub.name, nodes: sub.nodes, connections: sub.connections,
      settings: sub.settings, staticData: sub.staticData
    });
    console.log('  Upload: ' + (update.status === 200 ? 'OK' : 'FAILED ' + update.status));
    await sleep(1000);
    const act = await apiCall('POST', '/api/v1/workflows/UZMWfhnV6JmuwJXC/activate');
    console.log('  Activate: ' + (act.status === 200 ? 'OK' : 'FAILED'));
  } else {
    console.log('  No change needed');
  }

  // Fix 2: Activate WF1
  console.log('\n=== Activate WF1 ===');
  const act1 = await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
  console.log('  WF1 activate: ' + (act1.status === 200 ? 'OK' : 'FAILED ' + act1.status));

  // Verify all 3 are active
  console.log('\n=== Verify all workflows active ===');
  const ids = { WF1: 'LP7YknAVPiQsidWq', WF2: 'NPInwpKv4Oriq04F', SUB: 'UZMWfhnV6JmuwJXC' };
  for (const [name, id] of Object.entries(ids)) {
    const { data: w } = await apiCall('GET', '/api/v1/workflows/' + id);
    console.log('  ' + name + ': ' + (w.active ? 'ACTIVE' : 'INACTIVE'));
  }

  // Re-save SUB template with fixed credential
  if (subChanged) {
    console.log('\n=== Re-saving SUB template with fixed credential ===');
    const { data: subFixed } = await apiCall('GET', '/api/v1/workflows/UZMWfhnV6JmuwJXC');
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '..', 'ergovia-lite', 'workflows', 'SUB_Universal_Messenger.json');
    fs.writeFileSync(filePath, JSON.stringify(subFixed, null, 2));
    console.log('  Saved: ' + filePath);
  }
}

main().catch(console.error);

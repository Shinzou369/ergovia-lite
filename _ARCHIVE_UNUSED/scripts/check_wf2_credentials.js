const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // List all credentials
  console.log('=== Available Credentials ===');
  const creds = await apiCall('GET', '/api/v1/credentials');
  const credList = Array.isArray(creds.data) ? creds.data : (creds.data.data || []);
  console.log('  Raw response keys:', Object.keys(creds.data));
  for (const c of credList) {
    console.log('  id=' + c.id + '  name="' + c.name + '"  type=' + c.type);
  }

  // Check WF2 nodes for credential references
  console.log('\n=== WF2 Credential Usage ===');
  const { data: wf } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
  for (const node of wf.nodes) {
    if (node.credentials) {
      for (const [type, cred] of Object.entries(node.credentials)) {
        console.log('  node="' + node.name + '" (' + node.type + ')  cred_type=' + type + '  id=' + cred.id + '  name="' + cred.name + '"');
      }
    }
  }

  // Check WF1 too
  console.log('\n=== WF1 Credential Usage ===');
  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  for (const node of wf1.nodes) {
    if (node.credentials) {
      for (const [type, cred] of Object.entries(node.credentials)) {
        console.log('  node="' + node.name + '" (' + node.type + ')  cred_type=' + type + '  id=' + cred.id + '  name="' + cred.name + '"');
      }
    }
  }
}

main().catch(console.error);

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
  const { data: wf } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');

  // Find Save Conversation nodes
  for (const node of wf.nodes) {
    if (node.name.toLowerCase().includes('save conversation')) {
      console.log('=== ' + node.name + ' (id: ' + node.id + ') ===');
      console.log('Type: ' + node.type);
      console.log('Parameters: ' + JSON.stringify(node.parameters, null, 2));
      console.log('');
    }
  }

  // Also show Save Competing Deal node (same pattern likely)
  for (const node of wf.nodes) {
    if (node.name.toLowerCase().includes('save competing') || node.name.toLowerCase().includes('save conflict')) {
      console.log('=== ' + node.name + ' (id: ' + node.id + ') ===');
      console.log('Type: ' + node.type);
      console.log('Parameters: ' + JSON.stringify(node.parameters, null, 2));
      console.log('');
    }
  }
}

main().catch(console.error);

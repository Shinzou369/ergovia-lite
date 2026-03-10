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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const wf = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');

  const codeNodes = ['normalize-input', 'merge-customer', 'calculate-cost', 'budget-exhausted', 'prepare-alert'];
  const otherNodes = ['budget-gate', 'alert-needed', 'send-response-safety', 'send-fallback', 'log-activity'];

  for (const node of wf.nodes) {
    if (codeNodes.includes(node.id)) {
      console.log(`\n========== "${node.name}" (${node.id}) ==========`);
      console.log(node.parameters.jsCode || node.parameters.code || 'NO CODE');
    }
    if (otherNodes.includes(node.id)) {
      console.log(`\n========== "${node.name}" (${node.id}) ==========`);
      console.log(JSON.stringify(node.parameters, null, 2).substring(0, 800));
    }
  }
}

main().catch(console.error);

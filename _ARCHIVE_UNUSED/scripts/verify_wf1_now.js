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
  console.log(`Workflow: ${wf.name}`);
  console.log(`Active: ${wf.active}`);
  console.log(`Updated: ${wf.updatedAt}`);
  console.log();

  // Check ALL budget-related nodes
  const targetIds = ['get-customer-id', 'check-budget', 'log-api-cost', 'save-alert'];
  for (const node of wf.nodes) {
    if (targetIds.includes(node.id) || (node.type?.includes('postgres') && node.parameters?.query?.includes('$1'))) {
      console.log(`Node: "${node.name}" (id: ${node.id})`);
      console.log(`  Full parameters: ${JSON.stringify(node.parameters, null, 2).substring(0, 500)}`);
      console.log();
    }
  }
}

main().catch(console.error);

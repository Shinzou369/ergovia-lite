const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname, method,
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
  // WF1 - examine all param nodes in detail
  const wf1 = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');

  console.log('=== WF1 Connections ===');
  console.log(JSON.stringify(wf1.connections, null, 2));

  console.log('\n=== WF1 Nodes with $1 params (full details) ===');
  const paramNodes = ['get-customer-id', 'check-budget', 'log-api-cost', 'save-alert'];
  for (const node of wf1.nodes) {
    if (paramNodes.includes(node.id)) {
      console.log(`\n--- ${node.name} (${node.id}) ---`);
      console.log(JSON.stringify(node.parameters, null, 2));
    }
  }

  // WF6 - check budget nodes
  const wf6 = await apiCall('GET', '/api/v1/workflows/ccEOaNnIwY6eeJOn');
  console.log('\n\n=== WF6 Budget Check Nodes (full details) ===');
  const budgetNodes = ['check-budget-morning', 'check-budget-evening', 'check-budget-weekly'];
  for (const node of wf6.nodes) {
    if (budgetNodes.includes(node.id)) {
      console.log(`\n--- ${node.name} (${node.id}) ---`);
      console.log(JSON.stringify(node.parameters, null, 2));
    }
  }

  // SUB - log messaging cost
  const sub = await apiCall('GET', '/api/v1/workflows/UZMWfhnV6JmuwJXC');
  console.log('\n\n=== SUB Log Messaging Cost (full details) ===');
  for (const node of sub.nodes) {
    if (node.id === 'log-messaging-cost') {
      console.log(JSON.stringify(node.parameters, null, 2));
    }
  }

  // Also check SUB node connections
  console.log('\n=== SUB Connections ===');
  console.log(JSON.stringify(sub.connections, null, 2));
}

main().catch(console.error);

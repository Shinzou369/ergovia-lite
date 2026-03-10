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
  // WF1 - check Normalize Input, Merge Customer ID, Calculate AI Cost, Prepare Alert
  const wf1 = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  const inspect = ['Normalize Input', 'Merge Customer ID', 'Calculate AI Cost', 'Prepare Alert', 'Budget Exhausted Response', 'Send Fallback Response'];

  console.log('=== WF1 Key Nodes ===');
  for (const node of wf1.nodes) {
    if (inspect.includes(node.name)) {
      console.log(`\n--- ${node.name} (${node.id}) ---`);
      console.log(`Type: ${node.type}`);
      console.log(`Params: ${JSON.stringify(node.parameters, null, 2)}`);
    }
  }

  // SUB - check Normalize Input, Calculate WhatsApp Cost, Calculate SMS Cost, Has Messaging Cost?
  const sub = await apiCall('GET', '/api/v1/workflows/UZMWfhnV6JmuwJXC');
  const subInspect = ['Normalize Input', 'Calculate WhatsApp Cost', 'Calculate SMS Cost', 'Has Messaging Cost?', 'Log Telegram Result'];

  console.log('\n\n=== SUB Key Nodes ===');
  for (const node of sub.nodes) {
    if (subInspect.includes(node.name)) {
      console.log(`\n--- ${node.name} (${node.id}) ---`);
      console.log(`Type: ${node.type}`);
      console.log(`Params: ${JSON.stringify(node.parameters, null, 2)}`);
    }
  }
}

main().catch(console.error);

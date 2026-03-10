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
  // 1. Get WF1 "Get Customer ID" node (BROKEN)
  const wf1 = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  const brokenNode = wf1.nodes.find(n => n.name === 'Get Customer ID');
  console.log('=== BROKEN NODE: WF1 / Get Customer ID ===');
  console.log(JSON.stringify(brokenNode, null, 2));

  // 2. Get a WORKING node from WF4 for comparison (e.g. "Get Property & Owner")
  const wf4 = await apiCall('GET', '/api/v1/workflows/5loDH75zrEDh9x5H');
  const workingNode = wf4.nodes.find(n => n.name === 'Get Property & Owner');
  console.log('\n\n=== WORKING NODE: WF4 / Get Property & Owner ===');
  console.log(JSON.stringify(workingNode, null, 2));

  // 3. Also check WF6 budget check node (uses options.queryParameters like my fix)
  const wf6 = await apiCall('GET', '/api/v1/workflows/ccEOaNnIwY6eeJOn');
  const wf6Node = wf6.nodes.find(n => n.name === 'Check Budget (Morning)');
  console.log('\n\n=== WF6 / Check Budget (Morning) - same format as my fix ===');
  console.log(JSON.stringify(wf6Node, null, 2));

  // 4. Also compare WF1 Check Budget
  const checkBudget = wf1.nodes.find(n => n.name === 'Check Budget');
  console.log('\n\n=== WF1 / Check Budget ===');
  console.log(JSON.stringify(checkBudget, null, 2));
}

main().catch(console.error);

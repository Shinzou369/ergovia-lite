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
  const allWf = await apiCall('GET', '/api/v1/workflows');

  for (const wfInfo of allWf.data) {
    const wf = await apiCall('GET', `/api/v1/workflows/${wfInfo.id}`);
    let hasParam = false;

    for (const node of wf.nodes || []) {
      const query = node.parameters?.query || '';
      if (!query.includes('$1')) continue;

      if (!hasParam) {
        console.log(`\n========== ${wf.name} (${wfInfo.id}) ==========`);
        hasParam = true;
      }

      const qp = node.parameters?.additionalFields?.queryParameters
        || node.parameters?.options?.queryParameters
        || 'NONE';

      console.log(`\nNode: "${node.name}" (id: ${node.id})`);
      console.log(`  Query: ${query}`);
      console.log(`  QueryParams: ${qp}`);
      console.log(`  Full params keys: ${Object.keys(node.parameters).join(', ')}`);
    }
  }
}

main().catch(console.error);

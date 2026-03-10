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
  // WF1
  const wf1 = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log('=== WF1 PostgreSQL Nodes ===');
  for (const node of wf1.nodes) {
    if (node.type?.includes('postgres')) {
      console.log(`\nNode: "${node.name}" (id: ${node.id})`);
      console.log(`  Query: ${node.parameters?.query || 'N/A'}`);
      console.log(`  Cred: ${JSON.stringify(node.credentials?.postgres)}`);
    }
  }

  // WF6 - check budget queries
  const wf6 = await apiCall('GET', '/api/v1/workflows/ccEOaNnIwY6eeJOn');
  console.log('\n\n=== WF6 PostgreSQL Nodes ===');
  for (const node of wf6.nodes) {
    if (node.type?.includes('postgres')) {
      console.log(`\nNode: "${node.name}" (id: ${node.id})`);
      console.log(`  Query: ${node.parameters?.query || 'N/A'}`);
      console.log(`  Cred: ${JSON.stringify(node.credentials?.postgres)}`);
    }
  }

  // SUB - check log messaging cost
  const sub = await apiCall('GET', '/api/v1/workflows/UZMWfhnV6JmuwJXC');
  console.log('\n\n=== SUB PostgreSQL Nodes ===');
  for (const node of sub.nodes) {
    if (node.type?.includes('postgres')) {
      console.log(`\nNode: "${node.name}" (id: ${node.id})`);
      console.log(`  Query: ${node.parameters?.query || 'N/A'}`);
      console.log(`  Cred: ${JSON.stringify(node.credentials?.postgres)}`);
    }
  }
}

main().catch(console.error);

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
  // Check all workflow statuses
  const { data: all } = await apiCall('GET', '/api/v1/workflows');
  console.log('=== Current Workflow Status ===');
  for (const wf of all.data) {
    console.log(`  ${wf.active ? 'ACTIVE  ' : 'INACTIVE'} | ${wf.name} (${wf.id})`);
  }

  // Re-activate WF1 if needed
  const wf1 = all.data.find(w => w.id === 'LP7YknAVPiQsidWq');
  if (wf1 && !wf1.active) {
    console.log('\nRe-activating WF1...');
    const result = await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
    console.log(`  Status: ${result.status === 200 ? 'ACTIVATED' : 'FAILED (' + result.status + ')'}`);
  } else {
    console.log('\nWF1 already active.');
  }

  // Final check
  const { data: final } = await apiCall('GET', '/api/v1/workflows');
  console.log('\n=== Final Status ===');
  for (const wf of final.data) {
    console.log(`  ${wf.active ? 'ACTIVE  ' : 'INACTIVE'} | ${wf.name}`);
  }
}

main().catch(console.error);

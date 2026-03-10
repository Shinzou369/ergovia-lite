const https = require('https');
const fs = require('fs');
const path = require('path');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
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

const WORKFLOWS = {
  'LP7YknAVPiQsidWq': 'WF1_AI_Gateway.json',
  'UZMWfhnV6JmuwJXC': 'SUB_Universal_Messenger.json'
};

async function main() {
  const outDir = path.resolve(__dirname, '..', 'ergovia-lite', 'workflows');

  for (const [wfId, filename] of Object.entries(WORKFLOWS)) {
    console.log(`Downloading ${wfId}...`);
    const wf = await apiCall('GET', `/api/v1/workflows/${wfId}`);

    // Save the full workflow JSON
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, JSON.stringify(wf, null, 2));
    console.log(`  Saved: ${outPath}`);
    console.log(`  Name: ${wf.name}`);
    console.log(`  Nodes: ${wf.nodes.length}`);
    console.log(`  Active: ${wf.active}`);
    console.log();
  }

  console.log('Done. Both templates saved as local checkpoints.');
}

main().catch(console.error);

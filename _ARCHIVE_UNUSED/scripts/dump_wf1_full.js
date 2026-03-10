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

  // Save full JSON
  const fs = require('fs');
  fs.writeFileSync('scripts/wf1_full.json', JSON.stringify(wf, null, 2));
  console.log('Saved full WF1 to scripts/wf1_full.json');

  // Print node summary with connections
  console.log(`\n=== WF1: ${wf.name} (${wf.nodes.length} nodes) ===\n`);

  // Print all nodes with key params
  for (const node of wf.nodes) {
    console.log(`[${node.id}] "${node.name}" (${node.type})`);
    if (node.type.includes('telegram')) {
      const chatId = node.parameters?.chatId || node.parameters?.additionalFields?.chatId || 'N/A';
      console.log(`  chatId: ${JSON.stringify(chatId)}`);
    }
    if (node.type.includes('if')) {
      const conds = node.parameters?.conditions;
      console.log(`  conditions: ${JSON.stringify(conds)?.substring(0, 200)}`);
    }
    if (node.type.includes('set') || node.type.includes('code')) {
      const vals = node.parameters?.assignments?.assignments || node.parameters?.jsCode;
      if (vals) console.log(`  values: ${JSON.stringify(vals)?.substring(0, 200)}`);
    }
    if (node.type.includes('merge')) {
      console.log(`  mode: ${node.parameters?.mode}`);
    }
  }

  // Print connections
  console.log('\n=== CONNECTIONS ===\n');
  for (const [fromNode, outputs] of Object.entries(wf.connections || {})) {
    for (const [outputType, connections] of Object.entries(outputs)) {
      for (let i = 0; i < connections.length; i++) {
        for (const conn of connections[i]) {
          const label = connections.length > 1 ? ` [output ${i}]` : '';
          console.log(`"${fromNode}"${label} → "${conn.node}"`);
        }
      }
    }
  }
}

main().catch(console.error);

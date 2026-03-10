const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
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
  const sub = await apiCall('GET', '/api/v1/workflows/UZMWfhnV6JmuwJXC');

  console.log('=== SUB: Universal Messenger — Full Inspection ===\n');
  console.log('Nodes: ' + sub.nodes.length);
  console.log('');

  for (const node of sub.nodes) {
    console.log('--- ' + node.name + ' ---');
    console.log('  Type: ' + node.type);
    console.log('  TypeVersion: ' + node.typeVersion);
    console.log('  Position: ' + JSON.stringify(node.position));
    if (node.credentials) {
      console.log('  Credentials: ' + JSON.stringify(node.credentials));
    }
    if (node.parameters) {
      const params = node.parameters;
      // Show code
      if (params.jsCode) {
        console.log('  Code:');
        console.log(params.jsCode);
      }
      // Show expressions/values for telegram, http, etc.
      if (params.chatId) console.log('  chatId: ' + params.chatId);
      if (params.text) console.log('  text: ' + params.text);
      if (params.from) console.log('  from: ' + params.from);
      if (params.to) console.log('  to: ' + params.to);
      if (params.body) console.log('  body: ' + params.body);
      if (params.operation) console.log('  operation: ' + params.operation);
      if (params.resource) console.log('  resource: ' + params.resource);
      if (params.conditions) console.log('  conditions: ' + JSON.stringify(params.conditions, null, 2));
      if (params.rules) console.log('  rules: ' + JSON.stringify(params.rules, null, 2));
      if (params.query) console.log('  query: ' + params.query);
      if (params.options) console.log('  options: ' + JSON.stringify(params.options));
      // For switch/if nodes
      if (params.mode) console.log('  mode: ' + params.mode);
      if (params.value1) console.log('  value1: ' + params.value1);
      if (params.value2) console.log('  value2: ' + params.value2);
    }
    console.log('');
  }

  // Connections
  console.log('=== CONNECTIONS ===\n');
  for (const [fromNode, outputs] of Object.entries(sub.connections)) {
    if (!outputs.main) continue;
    for (let i = 0; i < outputs.main.length; i++) {
      if (!outputs.main[i] || outputs.main[i].length === 0) continue;
      for (const conn of outputs.main[i]) {
        const label = outputs.main.length > 1 ? ' [out' + i + ']' : '';
        console.log('  "' + fromNode + '"' + label + ' → "' + conn.node + '"');
      }
    }
  }

  // Also check: what does "Send Alert" in WF3 pass to SUB?
  console.log('\n=== WF3: What "Send Alert" sends to SUB ===\n');
  const wf3 = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  const sendAlert = wf3.nodes.find(n => n.name === 'Send Alert');
  if (sendAlert) {
    console.log('  Type: ' + sendAlert.type);
    console.log('  Parameters: ' + JSON.stringify(sendAlert.parameters, null, 2));
  }

  // Also check Generate Alert (what it outputs)
  const genAlert = wf3.nodes.find(n => n.name === 'Generate Alert');
  if (genAlert) {
    console.log('\n  Generate Alert type: ' + genAlert.type);
    console.log('  Parameters: ' + JSON.stringify(genAlert.parameters, null, 2));
  }
}

main().catch(console.error);

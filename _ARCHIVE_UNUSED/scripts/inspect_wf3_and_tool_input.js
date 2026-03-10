const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname, method: 'GET',
      headers: { 'X-N8N-API-KEY': API_KEY }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // WF1: Calendar Manager Tool input config
  const wf1 = await apiCall('/api/v1/workflows/LP7YknAVPiQsidWq');
  const calTool = wf1.nodes.find(n => n.id === 'tool-calendar');
  console.log('=== WF1: Calendar Manager Tool ===');
  console.log(JSON.stringify(calTool.parameters, null, 2));

  // WF3: Full credential audit
  const wf3 = await apiCall('/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('\n=== WF3: Credentials ===');
  for (const node of wf3.nodes) {
    if (node.credentials) {
      for (const [type, cred] of Object.entries(node.credentials)) {
        const bad = cred.id === 'sjaI08GtPbON8TLX' ? ' *** BAD ***' : '';
        console.log('  "' + node.name + '" → ' + cred.id + ' (' + cred.name + ')' + bad);
      }
    }
  }

  // WF3: Trigger node (what inputs it expects)
  const trigger = wf3.nodes.find(n => n.type.includes('executeWorkflowTrigger'));
  console.log('\n=== WF3: Trigger Node ===');
  console.log(JSON.stringify(trigger.parameters, null, 2));

  // WF3: Prepare Parameters code (to see what it reads from input)
  const prepParams = wf3.nodes.find(n => n.name === 'Prepare Parameters');
  if (prepParams) {
    console.log('\n=== WF3: Prepare Parameters code ===');
    console.log(prepParams.parameters.jsCode || prepParams.parameters.code || '(no code)');
  }

  // WF3: All node names for flow understanding
  console.log('\n=== WF3: All nodes ===');
  for (const n of wf3.nodes) {
    const shortType = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'LC:');
    console.log('  ' + n.name + ' (' + shortType + ')');
  }

  // WF3: Postgres query nodes
  console.log('\n=== WF3: Postgres queries ===');
  for (const n of wf3.nodes) {
    if (n.type.includes('postgres') && n.parameters.query) {
      console.log('\n  "' + n.name + '":');
      console.log('    ' + n.parameters.query.replace(/\n/g, '\n    '));
    }
  }
}

main().catch(console.error);

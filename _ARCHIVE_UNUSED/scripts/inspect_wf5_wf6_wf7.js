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

async function inspectWorkflow(id, label) {
  const wf = await apiCall('/api/v1/workflows/' + id);
  console.log('\n' + '='.repeat(60));
  console.log(label + ': ' + wf.name + ' (' + wf.nodes.length + ' nodes, active=' + wf.active + ')');
  console.log('='.repeat(60));

  // All nodes
  console.log('\n  NODES:');
  for (const n of wf.nodes) {
    const shortType = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'LC:');
    const cred = n.credentials ? Object.keys(n.credentials).join(',') : '-';
    console.log('    ' + n.id + ' | "' + n.name + '" (' + shortType + ') [cred: ' + cred + ']');
  }

  // Connections
  console.log('\n  CONNECTIONS:');
  for (const [fromNode, outputs] of Object.entries(wf.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let i = 0; i < outputArrays.length; i++) {
        if (!Array.isArray(outputArrays[i])) continue;
        for (const conn of outputArrays[i]) {
          const typeLabel = connType === 'main' ? '[out' + i + ']' : '[' + connType + ']';
          console.log('    ' + fromNode + ' ' + typeLabel + ' -> ' + conn.node);
        }
      }
    }
  }

  // Trigger/cron nodes
  console.log('\n  TRIGGERS:');
  for (const n of wf.nodes) {
    if (n.type.includes('trigger') || n.type.includes('cron') || n.type.includes('schedule')) {
      console.log('    ' + n.name + ' (' + n.type + ')');
      console.log('    params: ' + JSON.stringify(n.parameters));
    }
  }

  // Code nodes
  console.log('\n  CODE NODES:');
  for (const n of wf.nodes) {
    if (n.type.includes('code') || n.type.includes('Code')) {
      const code = n.parameters.jsCode || n.parameters.code || '';
      console.log('    "' + n.name + '" (' + code.length + ' chars):');
      // Show first 200 chars
      console.log('      ' + code.substring(0, 300).replace(/\n/g, '\n      '));
      console.log('      ...');
    }
  }

  // SQL queries
  console.log('\n  SQL QUERIES:');
  for (const n of wf.nodes) {
    if (n.parameters && n.parameters.query) {
      console.log('    "' + n.name + '":');
      console.log('      ' + n.parameters.query.substring(0, 400).replace(/\n/g, '\n      '));
    }
  }

  return wf;
}

async function main() {
  await inspectWorkflow('JWEu9Uz2JJ5XZeIX', 'WF5: Property Operations');
  await inspectWorkflow('ccEOaNnIwY6eeJOn', 'WF6: Daily Automations');
  await inspectWorkflow('Ay5QOyGAHG2l40s7', 'WF7: Integration Hub');
}

main().catch(console.error);

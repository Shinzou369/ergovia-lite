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
  // WF2's sub-tool workflow IDs
  const subToolIds = {
    'Dy8U5M0OkarS5Pj2': 'WF2 → Check Availability Tool',
    'Kk8NKtJiYBzpOofK': 'WF2 → Get Property Details Tool',
    'Ku5DBasVYC4PlTbI': 'WF2 → Create Booking Tool',
  };

  // Check if these are standalone or overlap with WF3/WF4
  console.log('=== WF2 SUB-TOOL WORKFLOWS ===\n');
  for (const [id, label] of Object.entries(subToolIds)) {
    try {
      const wf = await apiCall('/api/v1/workflows/' + id);
      console.log(label);
      console.log('  ID: ' + id);
      console.log('  Name: ' + wf.name);
      console.log('  Nodes: ' + wf.nodes.length);
      console.log('  Active: ' + wf.active);
      console.log('  Node list:');
      for (const n of wf.nodes) {
        const shortType = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'LC:');
        console.log('    - ' + n.name + ' (' + shortType + ')');
      }
      // Show any postgres queries
      for (const n of wf.nodes) {
        if (n.type.includes('postgres') && n.parameters.query) {
          console.log('  Query in "' + n.name + '":');
          console.log('    ' + n.parameters.query.substring(0, 200).replace(/\n/g, '\n    '));
        }
        if (n.type.includes('code')) {
          const code = n.parameters.jsCode || n.parameters.code || '';
          if (code.length > 0) {
            console.log('  Code in "' + n.name + '" (' + code.length + ' chars):');
            console.log('    ' + code.substring(0, 200).replace(/\n/g, '\n    '));
          }
        }
      }
      console.log('');
    } catch (e) {
      console.log(label + ': ERROR - ' + e.message);
    }
  }

  // Now show WF3 for comparison
  console.log('=== WF3: Calendar Manager (for comparison) ===\n');
  const wf3 = await apiCall('/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('  Name: ' + wf3.name);
  console.log('  Nodes: ' + wf3.nodes.length);
  console.log('  Node list:');
  for (const n of wf3.nodes) {
    const shortType = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'LC:');
    console.log('    - ' + n.name + ' (' + shortType + ')');
  }
  for (const n of wf3.nodes) {
    if (n.type.includes('postgres') && n.parameters.query) {
      console.log('  Query in "' + n.name + '":');
      console.log('    ' + n.parameters.query.substring(0, 250).replace(/\n/g, '\n    '));
    }
    if (n.type.includes('code')) {
      const code = n.parameters.jsCode || n.parameters.code || '';
      if (code.length > 0) {
        console.log('  Code in "' + n.name + '" (' + code.length + ' chars):');
        console.log('    ' + code.substring(0, 250).replace(/\n/g, '\n    '));
      }
    }
  }

  // Show WF4 for comparison
  console.log('\n=== WF4: Payment Processor (for comparison) ===\n');
  const wf4 = await apiCall('/api/v1/workflows/5loDH75zrEDh9x5H');
  console.log('  Name: ' + wf4.name);
  console.log('  Nodes: ' + wf4.nodes.length);
  console.log('  Node list:');
  for (const n of wf4.nodes) {
    const shortType = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'LC:');
    console.log('    - ' + n.name + ' (' + shortType + ')');
  }
  for (const n of wf4.nodes) {
    if (n.type.includes('code')) {
      const code = n.parameters.jsCode || n.parameters.code || '';
      if (code.length > 0 && n.name.toLowerCase().includes('return')) {
        console.log('  Code in "' + n.name + '" (' + code.length + ' chars):');
        console.log('    ' + code.substring(0, 250).replace(/\n/g, '\n    '));
      }
    }
  }
}

main().catch(console.error);

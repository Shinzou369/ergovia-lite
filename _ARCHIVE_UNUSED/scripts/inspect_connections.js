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

function printConnections(wf, label) {
  console.log('=== ' + label + ' CONNECTIONS ===');
  for (const [fromNode, outputs] of Object.entries(wf.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let outIdx = 0; outIdx < outputArrays.length; outIdx++) {
        if (!Array.isArray(outputArrays[outIdx])) continue;
        for (const conn of outputArrays[outIdx]) {
          const typeLabel = connType === 'main' ? '' : ' [' + connType + ']';
          console.log('  ' + fromNode + typeLabel + ' -> ' + conn.node);
        }
      }
    }
  }
}

async function main() {
  const wf1 = await apiCall('/api/v1/workflows/LP7YknAVPiQsidWq');
  printConnections(wf1, 'WF1');

  // WF1 AI Agent tool connections
  console.log('\n=== WF1 AI Agent Tool Nodes ===');
  for (const [fromNode, outputs] of Object.entries(wf1.connections)) {
    if (outputs.ai_tool) {
      for (const conns of outputs.ai_tool) {
        if (!Array.isArray(conns)) continue;
        for (const c of conns) {
          console.log('  ' + fromNode + ' --ai_tool--> ' + c.node);
        }
      }
    }
  }

  // Send Message Tool details
  const messengerTool = wf1.nodes.find(n => n.id === 'tool-messenger');
  if (messengerTool) {
    console.log('\n=== Send Message Tool ===');
    console.log('  workflowId: ' + JSON.stringify(messengerTool.parameters.workflowId));
    console.log('  description: ' + (messengerTool.parameters.description || 'none').substring(0, 150));
  }

  // WF2
  console.log('\n');
  const wf2 = await apiCall('/api/v1/workflows/NPInwpKv4Oriq04F');
  printConnections(wf2, 'WF2');

  // WF2 SUB-calling nodes
  console.log('\n=== WF2 executeWorkflow nodes (call SUB) ===');
  for (const node of wf2.nodes) {
    if (node.type === 'n8n-nodes-base.executeWorkflow') {
      console.log('  id=' + node.id + '  name="' + node.name + '"');
      console.log('    workflowId=' + JSON.stringify(node.parameters.workflowId));
    }
  }

  // WF2 return-result nodes code
  console.log('\n=== WF2 Return Result nodes ===');
  for (const node of wf2.nodes) {
    if (node.id === 'return-result' || node.id === 'return-result-competing') {
      const code = node.parameters.jsCode || node.parameters.code || '';
      console.log('  ' + node.id + ' (' + node.name + '):');
      console.log('    ' + code.replace(/\n/g, '\n    '));
    }
  }

  // Check WF3-WF8 for executeWorkflow nodes
  console.log('\n=== WF3-WF8: checking for SUB calls ===');
  const others = [
    { id: 'pEn69kwNtCEQ21y9', name: 'WF3' },
    { id: '5loDH75zrEDh9x5H', name: 'WF4' },
    { id: 'JWEu9Uz2JJ5XZeIX', name: 'WF5' },
    { id: 'ccEOaNnIwY6eeJOn', name: 'WF6' },
    { id: 'Ay5QOyGAHG2l40s7', name: 'WF7' },
    { id: 'mLm2HaIRzNfIX5uh', name: 'WF8' },
  ];
  for (const wfInfo of others) {
    const wf = await apiCall('/api/v1/workflows/' + wfInfo.id);
    const subCalls = wf.nodes.filter(n => n.type === 'n8n-nodes-base.executeWorkflow');
    if (subCalls.length > 0) {
      console.log('  ' + wfInfo.name + ': ' + subCalls.length + ' executeWorkflow node(s)');
      for (const n of subCalls) {
        console.log('    "' + n.name + '" workflowId=' + JSON.stringify(n.parameters.workflowId));
      }
    } else {
      console.log('  ' + wfInfo.name + ': no SUB calls');
    }
  }
}

main().catch(console.error);

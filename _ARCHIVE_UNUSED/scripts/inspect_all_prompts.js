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

const WORKFLOWS = [
  { id: 'LP7YknAVPiQsidWq', name: 'WF1' },
  { id: 'NPInwpKv4Oriq04F', name: 'WF2' },
  { id: 'pEn69kwNtCEQ21y9', name: 'WF3' },
  { id: '5loDH75zrEDh9x5H', name: 'WF4' },
  { id: 'JWEu9Uz2JJ5XZeIX', name: 'WF5' },
  { id: 'mLm2HaIRzNfIX5uh', name: 'WF8' },
];

async function main() {
  for (const wfInfo of WORKFLOWS) {
    const wf = await apiCall('/api/v1/workflows/' + wfInfo.id);
    console.log('\n' + '='.repeat(70));
    console.log('  ' + wfInfo.name + ': ' + wf.name + ' (' + wf.nodes.length + ' nodes)');
    console.log('='.repeat(70));

    for (const node of wf.nodes) {
      // AI Agent nodes - show system prompt
      if (node.type.includes('agent')) {
        console.log('\n  [AI AGENT] ' + node.name + ' (id: ' + node.id + ')');
        const prompt = node.parameters.text || node.parameters.systemMessage || '';
        console.log('  System Message:');
        console.log('    ' + (prompt || '(empty)').substring(0, 500).replace(/\n/g, '\n    '));
        if (prompt.length > 500) console.log('    ... (truncated, ' + prompt.length + ' chars total)');
      }

      // Tool nodes in WF1 - show descriptions
      if (node.type.includes('toolWorkflow')) {
        console.log('\n  [TOOL] ' + node.name + ' (id: ' + node.id + ')');
        console.log('    workflowId: ' + JSON.stringify(node.parameters.workflowId));
        console.log('    description: ' + (node.parameters.description || '(none)').substring(0, 300));
      }

      // toolCode nodes
      if (node.type.includes('toolCode')) {
        console.log('\n  [TOOL-CODE] ' + node.name + ' (id: ' + node.id + ')');
        console.log('    description: ' + (node.parameters.description || '(none)').substring(0, 200));
      }

      // Return/result code nodes (in WF2-WF8)
      if (wfInfo.name !== 'WF1' && node.type.includes('code') &&
          (node.name.toLowerCase().includes('return') || node.name.toLowerCase().includes('result') ||
           node.name.toLowerCase().includes('format response') || node.name.toLowerCase().includes('format result'))) {
        const code = node.parameters.jsCode || node.parameters.code || '';
        console.log('\n  [RETURN NODE] ' + node.name + ' (id: ' + node.id + ')');
        console.log('    code:');
        console.log('      ' + code.substring(0, 400).replace(/\n/g, '\n      '));
      }

      // executeWorkflowTrigger - show what inputs it expects
      if (node.type.includes('executeWorkflowTrigger')) {
        console.log('\n  [TRIGGER] ' + node.name + ' (id: ' + node.id + ')');
        if (node.parameters.inputSource === 'passthrough') {
          console.log('    Input: passthrough (receives all data from caller)');
        } else {
          console.log('    Parameters: ' + JSON.stringify(node.parameters).substring(0, 300));
        }
      }
    }
  }
}

main().catch(console.error);

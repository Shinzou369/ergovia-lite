const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = { hostname: url.hostname, path: url.pathname, method: 'GET', headers: { 'X-N8N-API-KEY': API_KEY } };
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
  const wf3 = await apiCall('/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('WF3: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)\n');

  // All nodes with types and positions
  console.log('=== ALL NODES ===');
  for (const n of wf3.nodes) {
    const shortType = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'LC:');
    console.log('  ' + n.id.padEnd(20) + ' | "' + n.name + '" (' + shortType + ') pos=' + JSON.stringify(n.position));
  }

  // All connections (detailed)
  console.log('\n=== ALL CONNECTIONS ===');
  for (const [fromNode, outputs] of Object.entries(wf3.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let i = 0; i < outputArrays.length; i++) {
        if (!Array.isArray(outputArrays[i]) || outputArrays[i].length === 0) continue;
        for (const conn of outputArrays[i]) {
          const label = connType === 'main' ? 'out' + i : connType;
          console.log('  "' + fromNode + '" [' + label + '] --> "' + conn.node + '"');
        }
      }
    }
  }

  // Trigger node
  const trigger = wf3.nodes.find(n => n.type.includes('executeWorkflowTrigger'));
  console.log('\n=== TRIGGER ===');
  console.log(JSON.stringify(trigger.parameters, null, 2));

  // Prepare Parameters
  const prep = wf3.nodes.find(n => n.name === 'Prepare Parameters');
  if (prep) {
    console.log('\n=== Prepare Parameters (full code) ===');
    console.log(prep.parameters.jsCode || prep.parameters.code || '(no code)');
  }

  // Get Properties query
  const getProps = wf3.nodes.find(n => n.name === 'Get Properties');
  if (getProps) {
    console.log('\n=== Get Properties (full query) ===');
    console.log(getProps.parameters.query);
  }

  // Loop Properties
  const loop = wf3.nodes.find(n => n.name === 'Loop Properties');
  if (loop) {
    console.log('\n=== Loop Properties ===');
    console.log('Type: ' + loop.type);
    console.log('Params: ' + JSON.stringify(loop.parameters));
  }

  // Get Property Bookings
  const getBook = wf3.nodes.find(n => n.name === 'Get Property Bookings');
  if (getBook) {
    console.log('\n=== Get Property Bookings (full query) ===');
    console.log(getBook.parameters.query);
    console.log('alwaysOutputData: ' + getBook.alwaysOutputData);
  }

  // Detect Conflicts
  const detect = wf3.nodes.find(n => n.name === 'Detect Conflicts');
  if (detect) {
    console.log('\n=== Detect Conflicts (full code) ===');
    console.log(detect.parameters.jsCode || detect.parameters.code || '(no code)');
  }

  // Has Conflicts?
  const hasConf = wf3.nodes.find(n => n.name && n.name.includes('Has Conflicts'));
  if (hasConf) {
    console.log('\n=== Has Conflicts? ===');
    console.log('Type: ' + hasConf.type);
    console.log('Params: ' + JSON.stringify(hasConf.parameters, null, 2));
  }

  // Merge Results
  const merge = wf3.nodes.find(n => n.name === 'Merge Results');
  if (merge) {
    console.log('\n=== Merge Results ===');
    console.log('Type: ' + merge.type);
    console.log('Params: ' + JSON.stringify(merge.parameters));
  }

  // Format Response
  const format = wf3.nodes.find(n => n.name && (n.name.includes('Format') || n.name.includes('Return') || n.name.includes('Result')));
  if (format) {
    console.log('\n=== ' + format.name + ' ===');
    console.log('Type: ' + format.type);
    const code = format.parameters.jsCode || format.parameters.code || '';
    if (code) console.log(code);
    else console.log('Params: ' + JSON.stringify(format.parameters, null, 2));
  }

  // All remaining nodes not yet shown
  const shown = ['When Called by Other Workflow', 'Prepare Parameters', 'Get Properties', 'Loop Properties',
    'Get Property Bookings', 'Detect Conflicts'];
  console.log('\n=== OTHER NODES ===');
  for (const n of wf3.nodes) {
    if (shown.includes(n.name) || (n.name.includes('Has Conflicts'))) continue;
    if (n.name === (merge || {}).name || n.name === (format || {}).name) continue;
    const code = n.parameters.jsCode || n.parameters.code || n.parameters.query || '';
    if (code) {
      console.log('\n  "' + n.name + '" (' + n.type.replace('n8n-nodes-base.', '') + '):');
      console.log('  ' + code.substring(0, 500).replace(/\n/g, '\n  '));
    }
  }
}

main().catch(console.error);

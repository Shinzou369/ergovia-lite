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
  // WF6 details
  const wf6 = await apiCall('/api/v1/workflows/ccEOaNnIwY6eeJOn');

  // Route Automation switch
  const routeNode = wf6.nodes.find(n => n.name === 'Route Automation');
  console.log('=== WF6: Route Automation (switch) ===');
  console.log(JSON.stringify(routeNode.parameters, null, 2));
  console.log('\nPosition:', JSON.stringify(routeNode.position));

  // Determine Automation code (full)
  const detNode = wf6.nodes.find(n => n.name === 'Determine Automation');
  console.log('\n=== WF6: Determine Automation (full code) ===');
  console.log(detNode.parameters.jsCode || detNode.parameters.code);
  console.log('\nPosition:', JSON.stringify(detNode.position));

  // Get Morning Data full SQL
  const morningNode = wf6.nodes.find(n => n.name === 'Get Morning Data');
  console.log('\n=== WF6: Get Morning Data (full SQL) ===');
  console.log(morningNode.parameters.query);
  console.log('\nPosition:', JSON.stringify(morningNode.position));

  // Template Morning full code
  const tmplNode = wf6.nodes.find(n => n.name === 'Template Morning');
  console.log('\n=== WF6: Template Morning (full code) ===');
  console.log(tmplNode.parameters.jsCode || tmplNode.parameters.code);

  // Send Reports node (executeWorkflow)
  const sendNode = wf6.nodes.find(n => n.name === 'Send Reports');
  console.log('\n=== WF6: Send Reports (params) ===');
  console.log(JSON.stringify(sendNode.parameters, null, 2));
  console.log('Position:', JSON.stringify(sendNode.position));

  // Log Execution node
  const logNode = wf6.nodes.find(n => n.name === 'Log Execution');
  console.log('\n=== WF6: Log Execution (params) ===');
  console.log(JSON.stringify(logNode.parameters, null, 2));
  console.log('Position:', JSON.stringify(logNode.position));

  // Merge Outputs
  const mergeNode = wf6.nodes.find(n => n.name === 'Merge Outputs');
  console.log('\n=== WF6: Merge Outputs (params) ===');
  console.log(JSON.stringify(mergeNode.parameters, null, 2));
  console.log('Position:', JSON.stringify(mergeNode.position));

  // All positions for layout planning
  console.log('\n=== WF6: All Node Positions ===');
  for (const n of wf6.nodes) {
    console.log('  ' + n.name + ': ' + JSON.stringify(n.position));
  }

  // WF5 details
  const wf5 = await apiCall('/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  const routeOp = wf5.nodes.find(n => n.name === 'Route Operation');
  console.log('\n=== WF5: Route Operation (switch) ===');
  console.log(JSON.stringify(routeOp.parameters, null, 2));
  console.log('Position:', JSON.stringify(routeOp.position));

  const normNode = wf5.nodes.find(n => n.name === 'Normalize Input');
  console.log('\n=== WF5: Normalize Input (full code) ===');
  console.log(normNode.parameters.jsCode || normNode.parameters.code);

  console.log('\n=== WF5: All Node Positions ===');
  for (const n of wf5.nodes) {
    console.log('  ' + n.name + ': ' + JSON.stringify(n.position));
  }

  // WF5 Schedule Cleaning
  const schedNode = wf5.nodes.find(n => n.name === 'Schedule Cleaning');
  console.log('\n=== WF5: Schedule Cleaning (full SQL) ===');
  console.log(JSON.stringify(schedNode.parameters, null, 2));

  // WF7 all positions + credentials used
  const wf7 = await apiCall('/api/v1/workflows/Ay5QOyGAHG2l40s7');
  console.log('\n=== WF7: All Node Positions ===');
  for (const n of wf7.nodes) {
    const creds = n.credentials ? JSON.stringify(n.credentials) : '-';
    console.log('  ' + n.name + ': ' + JSON.stringify(n.position) + ' creds: ' + creds);
  }
}

main().catch(console.error);

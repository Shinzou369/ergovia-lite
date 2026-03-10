const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // 1. Download WF2
  console.log('Downloading WF2...');
  const { data: wf2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
  console.log(`  ${wf2.nodes.length} nodes`);

  // First, let me check all the code nodes to understand data flow
  console.log('\n=== Key Code Nodes ===');
  const codeNodes = ['Prepare Context', 'Prepare Competing Context', 'Prepare Owner Notification'];
  for (const node of wf2.nodes) {
    if (codeNodes.includes(node.name) || node.name.includes('Prepare')) {
      console.log(`\n--- ${node.name} (${node.id}) ---`);
      console.log(`Type: ${node.type}`);
      if (node.parameters?.jsCode) {
        console.log(`Code: ${node.parameters.jsCode.substring(0, 500)}`);
      }
    }
  }

  // Check connections to understand data flow
  console.log('\n\n=== Connections to Target Nodes ===');
  const targetNodes = [
    'Load Conversation Context',
    'Check Competing Offers',
    'Process Accept Decision',
    'Update Conflict Resolved',
    'Process Decline All',
    'Process Hold Request'
  ];

  for (const [sourceName, conns] of Object.entries(wf2.connections)) {
    for (const mainConns of (conns.main || [])) {
      for (const conn of mainConns) {
        if (targetNodes.includes(conn.node)) {
          console.log(`  ${sourceName} → ${conn.node}`);
        }
      }
    }
  }

  // 2. Now fix each node
  console.log('\n\n=== Fixing WF2 Parameter Bindings ===');
  let changeCount = 0;

  for (const node of wf2.nodes) {
    // Load Conversation Context: WHERE c.contact_id = $1
    // Source: "When Called by Other Workflow" → data has sender_id
    if (node.id === 'load-context' || node.name === 'Load Conversation Context') {
      console.log(`  Fixing "${node.name}"...`);
      node.parameters.options = node.parameters.options || {};
      node.parameters.options.queryParameters = '={{ [$json.sender_id] }}';
      changeCount++;
    }

    // Check Competing Offers: $1=property_id, $2=check_in, $3=check_out, $4=contact_id
    // Source: "Prepare Context" code node
    if (node.id === 'check-competing' || node.name === 'Check Competing Offers') {
      console.log(`  Fixing "${node.name}"...`);
      node.parameters.options = node.parameters.options || {};
      node.parameters.options.queryParameters = '={{ [$json.property_id, $json.detected_check_in, $json.detected_check_out, $json.contact_id] }}';
      changeCount++;
    }

    // Process Accept Decision: $1=deal_id
    // Source: "Route Owner Decision" (switch) → data should have deal_id from owner callback
    if (node.id === 'process-accept' || node.name === 'Process Accept Decision') {
      console.log(`  Fixing "${node.name}"...`);
      node.parameters.options = node.parameters.options || {};
      node.parameters.options.queryParameters = '={{ [$json.deal_id] }}';
      changeCount++;
    }

    // Update Conflict Resolved: $1=deal_id, $2=property_id, $3=check_in_date
    // Source: "Notify Declined Guests" → data should still carry deal context
    if (node.id === 'update-conflict-resolved' || node.name === 'Update Conflict Resolved') {
      console.log(`  Fixing "${node.name}"...`);
      node.parameters.options = node.parameters.options || {};
      node.parameters.options.queryParameters = '={{ [$json.deal_id || $json.accepted?.deal_id, $json.property_id || $json.accepted?.property_id, $json.check_in_date || $json.accepted?.check_in_date] }}';
      changeCount++;
    }

    // Process Decline All: $1=property_id, $2=check_in_date
    // Source: "Route Owner Decision" (switch, decline_all route)
    if (node.id === 'process-decline-all' || node.name === 'Process Decline All') {
      console.log(`  Fixing "${node.name}"...`);
      node.parameters.options = node.parameters.options || {};
      node.parameters.options.queryParameters = '={{ [$json.property_id, $json.check_in_date] }}';
      changeCount++;
    }

    // Process Hold Request: $1=property_id, $2=check_in_date
    // Source: "Route Owner Decision" (switch, hold route)
    if (node.id === 'process-hold' || node.name === 'Process Hold Request') {
      console.log(`  Fixing "${node.name}"...`);
      node.parameters.options = node.parameters.options || {};
      node.parameters.options.queryParameters = '={{ [$json.property_id, $json.check_in_date] }}';
      changeCount++;
    }
  }

  console.log(`\n  Total nodes fixed: ${changeCount}`);

  if (changeCount === 0) {
    console.log('  No changes needed. Exiting.');
    return;
  }

  // 3. Deactivate
  console.log('\n  Deactivating WF2...');
  await apiCall('POST', '/api/v1/workflows/NPInwpKv4Oriq04F/deactivate');
  await sleep(1000);

  // 4. Upload
  console.log('  Uploading fixed WF2...');
  const updateBody = {
    name: wf2.name,
    nodes: wf2.nodes,
    connections: wf2.connections,
    settings: wf2.settings,
    staticData: wf2.staticData
  };
  const update = await apiCall('PUT', '/api/v1/workflows/NPInwpKv4Oriq04F', updateBody);
  console.log(`  Update status: ${update.status}`);
  if (update.status !== 200) {
    console.log(`  Error: ${JSON.stringify(update.data).substring(0, 500)}`);
    // Try to reactivate
    await apiCall('POST', '/api/v1/workflows/NPInwpKv4Oriq04F/activate');
    return;
  }
  await sleep(1000);

  // 5. Activate
  console.log('  Activating WF2...');
  const act = await apiCall('POST', '/api/v1/workflows/NPInwpKv4Oriq04F/activate');
  console.log(`  Activate status: ${act.status}`);
  if (act.status !== 200) {
    console.log(`  Error: ${JSON.stringify(act.data).substring(0, 500)}`);
  } else {
    console.log('  WF2 activated successfully!');
  }
}

main().catch(console.error);

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
  // 1. Check what workflows exist
  const allWf = await apiCall('GET', '/api/v1/workflows');
  console.log('=== All Workflows ===');
  for (const wf of allWf.data.data) {
    console.log(`  ${wf.id}: ${wf.name} (active: ${wf.active})`);
  }

  // 2. Download WF2 and find all sub-workflow references
  const { data: wf2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
  console.log('\n=== WF2 Execute Workflow Nodes ===');
  const staleNodes = [];
  for (const node of wf2.nodes) {
    if (node.type === 'n8n-nodes-base.executeWorkflow') {
      const wfId = node.parameters?.workflowId?.value || node.parameters?.workflowId;
      console.log(`\n  Node: "${node.name}" (${node.id})`);
      console.log(`  References: ${wfId}`);
      console.log(`  Full params: ${JSON.stringify(node.parameters, null, 2)}`);
      if (wfId === 'k5NvzzTi72RdMRSO') {
        staleNodes.push(node);
      }
    }
  }

  if (staleNodes.length === 0) {
    console.log('\nNo stale references found.');
    return;
  }

  // 3. Fix stale references - these should all point to SUB: Universal Messenger
  console.log(`\n=== Fixing ${staleNodes.length} stale references ===`);
  const SUB_ID = 'UZMWfhnV6JmuwJXC';

  for (const node of staleNodes) {
    console.log(`  Fixing "${node.name}": k5NvzzTi72RdMRSO → ${SUB_ID}`);
    if (typeof node.parameters.workflowId === 'object') {
      node.parameters.workflowId.value = SUB_ID;
      if (node.parameters.workflowId.cachedResultName) {
        node.parameters.workflowId.cachedResultName = 'SUB: Universal Messenger';
      }
      if (node.parameters.workflowId.cachedResultUrl) {
        node.parameters.workflowId.cachedResultUrl = `/workflow/${SUB_ID}`;
      }
    } else {
      node.parameters.workflowId = SUB_ID;
    }
  }

  // 4. Update WF2
  console.log('\n  Uploading fixed WF2...');
  const updateBody = {
    name: wf2.name,
    nodes: wf2.nodes,
    connections: wf2.connections,
    settings: wf2.settings,
    staticData: wf2.staticData
  };
  const update = await apiCall('PUT', `/api/v1/workflows/NPInwpKv4Oriq04F`, updateBody);
  console.log(`  Update status: ${update.status}`);
  if (update.status !== 200) {
    console.log(`  Error: ${JSON.stringify(update.data).substring(0, 500)}`);
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

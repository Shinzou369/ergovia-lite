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

const WF2_ID = 'NPInwpKv4Oriq04F';
const NODE_ID = 'check-competing-offers'; // correct full ID

async function main() {
  console.log('=== Fix WF2 "Check Competing Offers" node ===\n');

  // Download WF2
  const { data: wf } = await apiCall('GET', `/api/v1/workflows/${WF2_ID}`);
  console.log(`Downloaded: ${wf.name} (${wf.nodes.length} nodes)`);

  // Find the node
  const node = wf.nodes.find(n => n.id === NODE_ID);
  if (!node) {
    console.log(`ERROR: Node with id "${NODE_ID}" not found!`);
    console.log('Available Postgres nodes:');
    for (const n of wf.nodes) {
      if (n.type && n.type.includes('postgres')) {
        console.log(`  id="${n.id}" name="${n.name}"`);
      }
    }
    return;
  }

  console.log(`Found: "${node.name}" (id: ${node.id})`);
  console.log(`  Current additionalFields: ${JSON.stringify(node.parameters.additionalFields || {})}`);
  console.log(`  Current options.queryParameters: ${node.parameters.options?.queryParameters || 'none'}`);

  // Apply the fix using additionalFields format (proven to persist)
  node.parameters.additionalFields = node.parameters.additionalFields || {};
  node.parameters.additionalFields.queryParameters = '={{ { "parameters": [$json.property_id, $json.detected_check_in, $json.detected_check_out, $json.contact_id] } }}';

  // Remove from options if present (old format that may not work)
  if (node.parameters.options?.queryParameters) {
    delete node.parameters.options.queryParameters;
    console.log('  Removed options.queryParameters');
  }

  console.log(`  Set additionalFields.queryParameters`);

  // Deactivate
  console.log('\nDeactivating WF2...');
  await apiCall('POST', `/api/v1/workflows/${WF2_ID}/deactivate`);
  await sleep(1000);

  // Update
  console.log('Uploading...');
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  };
  const update = await apiCall('PUT', `/api/v1/workflows/${WF2_ID}`, updateBody);
  if (update.status !== 200) {
    console.log(`ERROR: Update failed (${update.status}): ${JSON.stringify(update.data).substring(0, 300)}`);
    await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  // Verify persistence
  console.log('Verifying persistence...');
  const { data: verified } = await apiCall('GET', `/api/v1/workflows/${WF2_ID}`);
  const vNode = verified.nodes.find(n => n.id === NODE_ID);
  if (vNode) {
    const hasAF = !!vNode.parameters?.additionalFields?.queryParameters;
    const hasOpt = !!vNode.parameters?.options?.queryParameters;
    console.log(`  "${vNode.name}": additionalFields=${hasAF}, options=${hasOpt}`);
    if (hasAF) {
      console.log(`  VALUE: ${vNode.parameters.additionalFields.queryParameters}`);
      console.log('  PERSISTED OK');
    } else {
      console.log('  WARNING: additionalFields did NOT persist!');
    }
  }

  // Activate
  console.log('\nActivating WF2...');
  const act = await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
  if (act.status === 200) {
    console.log('ACTIVATED successfully');
  } else {
    console.log(`WARNING: Activate returned ${act.status}: ${JSON.stringify(act.data).substring(0, 200)}`);
  }

  // Final comprehensive check of ALL WF2 parameterized nodes
  console.log('\n=== Final WF2 Parameterized Query Status ===');
  for (const n of verified.nodes) {
    if (n.type && n.type.includes('postgres') && n.parameters?.query?.includes('$1')) {
      const hasAF = !!n.parameters?.additionalFields?.queryParameters;
      const hasOpt = !!n.parameters?.options?.queryParameters;
      const status = hasAF ? 'OK (additionalFields)' : hasOpt ? 'WARN (options only)' : 'MISSING';
      console.log(`  [${status}] "${n.name}" (${n.id})`);
    }
  }
}

main().catch(console.error);

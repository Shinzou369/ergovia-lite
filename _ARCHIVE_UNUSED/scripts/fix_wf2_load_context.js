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

async function main() {
  console.log('=== Fix WF2 Load Conversation Context query ===\n');

  const { data: wf } = await apiCall('GET', `/api/v1/workflows/${WF2_ID}`);
  console.log(`Downloaded: ${wf.name} (${wf.nodes.length} nodes)`);

  const node = wf.nodes.find(n => n.id === 'load-context');
  if (!node) { console.log('ERROR: load-context node not found!'); return; }

  console.log(`\nOLD query:\n${node.parameters.query}\n`);

  // Fix: only reference columns that actually exist in the tables
  node.parameters.query = `=SELECT
  c.conversation_id,
  c.contact_id,
  c.property_id,
  c.conversation_stage,
  c.conversation_history,
  c.collected_data,
  c.channel,
  c.updated_at,
  p.property_name,
  p.base_price,
  p.max_guests,
  p.bedrooms,
  p.address,
  p.owner_name,
  p.owner_contact,
  p.settings
FROM conversations c
LEFT JOIN property_configurations p ON c.property_id = p.property_id
WHERE c.contact_id = '{{ $json.sender_id }}'
ORDER BY c.updated_at DESC
LIMIT 1`;

  console.log(`NEW query:\n${node.parameters.query}\n`);

  // Remove any leftover queryParameters
  if (node.parameters.additionalFields?.queryParameters) {
    delete node.parameters.additionalFields.queryParameters;
  }
  if (node.parameters.options?.queryParameters) {
    delete node.parameters.options.queryParameters;
  }

  // Deactivate → Update → Activate
  console.log('Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF2_ID}/deactivate`);
  await sleep(1000);

  console.log('Uploading...');
  const updateBody = {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  };
  const update = await apiCall('PUT', `/api/v1/workflows/${WF2_ID}`, updateBody);
  if (update.status !== 200) {
    console.log(`ERROR: ${update.status} - ${JSON.stringify(update.data).substring(0, 300)}`);
    await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  // Verify
  const { data: v } = await apiCall('GET', `/api/v1/workflows/${WF2_ID}`);
  const vNode = v.nodes.find(n => n.id === 'load-context');
  const hasPropertyType = vNode?.parameters?.query?.includes('property_type');
  const hasAmenities = vNode?.parameters?.query?.includes('amenities');
  console.log(`\nVerify: has property_type = ${hasPropertyType} (should be false)`);
  console.log(`Verify: has amenities = ${hasAmenities} (should be false)`);

  console.log('\nActivating...');
  const act = await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
  console.log(act.status === 200 ? 'ACTIVATED ✓' : `FAILED (${act.status})`);
}

main().catch(console.error);

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
  console.log('=== Fix Booking Agent Tool in WF1 ===\n');

  const { data: wf } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log(`Downloaded: ${wf.name} (${wf.nodes.length} nodes)`);

  const tool = wf.nodes.find(n => n.id === 'tool-booking');
  if (!tool) {
    console.log('ERROR: tool-booking node not found!');
    return;
  }

  console.log(`\nBEFORE:`);
  console.log(`  workflowId: ${JSON.stringify(tool.parameters.workflowId)}`);
  console.log(`  source: ${tool.parameters.source}`);
  console.log(`  workflowInputs: ${JSON.stringify(tool.parameters.workflowInputs)?.substring(0, 100)}`);

  // Set the full tool configuration
  tool.parameters = {
    description: "Handle booking inquiries, availability questions, property information requests, check-in/check-out instructions. Use this for general guest questions about staying at properties.",
    workflowId: {
      __rl: true,
      mode: "id",
      value: "NPInwpKv4Oriq04F"
    },
    workflowInputs: {
      mappingMode: "defineBelow",
      value: {
        query: "={{ $fromAI('query', 'The booking question or request from the guest') }}",
        sender_id: "={{ $('Merge Customer ID').item.json.sender_id }}",
        sender_name: "={{ $('Merge Customer ID').item.json.sender_name }}",
        channel: "={{ $('Merge Customer ID').item.json.channel }}",
        customer_id: "={{ $('Merge Customer ID').item.json.customer_id }}"
      },
      matchingColumns: [],
      schema: [
        { id: "query", displayName: "query", type: "string", required: true },
        { id: "sender_id", displayName: "sender_id", type: "string", required: true },
        { id: "sender_name", displayName: "sender_name", type: "string", required: false },
        { id: "channel", displayName: "channel", type: "string", required: true },
        { id: "customer_id", displayName: "customer_id", type: "string", required: false }
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: true
    }
  };

  console.log(`\nAFTER:`);
  console.log(`  workflowId: NPInwpKv4Oriq04F (WF2: AI Booking Agent)`);
  console.log(`  inputs: query ($fromAI), sender_id, sender_name, channel, customer_id`);

  // Deactivate → Update → Activate
  console.log('\nDeactivating...');
  await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/deactivate');
  await sleep(1000);

  console.log('Uploading...');
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  };
  const update = await apiCall('PUT', '/api/v1/workflows/LP7YknAVPiQsidWq', updateBody);
  if (update.status !== 200) {
    console.log(`ERROR: ${update.status} - ${JSON.stringify(update.data).substring(0, 300)}`);
    await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  // Verify
  console.log('\nVerifying...');
  const { data: verified } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  const vTool = verified.nodes.find(n => n.id === 'tool-booking');
  const wfId = vTool?.parameters?.workflowId?.value;
  const inputs = vTool?.parameters?.workflowInputs?.value;
  const schema = vTool?.parameters?.workflowInputs?.schema;

  console.log(`  workflowId: ${wfId} ${wfId === 'NPInwpKv4Oriq04F' ? '✓' : '✗'}`);
  console.log(`  Input fields: ${inputs ? Object.keys(inputs).join(', ') : 'NONE'}`);
  console.log(`  Schema fields: ${schema ? schema.map(s => s.id).join(', ') : 'NONE'}`);
  console.log(`  Has customer_id: ${inputs?.customer_id ? '✓' : '✗'}`);

  // Activate
  console.log('\nActivating...');
  const act = await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
  console.log(act.status === 200 ? 'ACTIVATED ✓' : `FAILED (${act.status})`);
}

main().catch(console.error);

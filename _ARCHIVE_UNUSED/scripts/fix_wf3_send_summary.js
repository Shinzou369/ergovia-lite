const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
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

// New Build Sync Summary code — with empty recipient guard
const BUILD_SYNC_SUMMARY_CODE = `// Build daily sync summary after all properties processed
// Safely get conflict results (may not exist if no properties)
let allResults = [];
try {
  allResults = $('Detect Conflicts').all();
} catch(e) {
  // No properties were processed, Detect Conflicts never ran
}

// Get owner contact from DB query
const ownerData = $('Get Owner Contact').first().json;

// GUARD: If no recipient (no owner chat_id configured), skip sending
if (!ownerData.recipient) {
  console.log('No owner recipient configured — skipping sync summary notification');
  return [];
}

// Count properties from the loop input
let propertyCount = 0;
try {
  propertyCount = $input.all().length;
} catch(e) {}

let totalConflicts = 0;
const conflictProperties = [];

for (const item of allResults) {
  const r = item.json;
  if (r.has_conflicts) {
    totalConflicts += r.conflicts.length;
    conflictProperties.push(r.property_name);
  }
}

const now = new Date();
const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const dateStr = now.toISOString().split('T')[0];

let message = '📅 *Daily Calendar Sync Complete*\\n';
message += '\\n🕐 ' + dateStr + ' at ' + timeStr;
message += '\\n🏠 Properties scanned: ' + propertyCount;

if (propertyCount === 0) {
  message += '\\n\\n_No active properties configured yet._';
} else if (totalConflicts > 0) {
  message += '\\n⚠️ Conflicts found: ' + totalConflicts;
  message += '\\n📍 Affected: ' + conflictProperties.join(', ');
  message += '\\n\\n_Individual alerts were sent above._';
} else {
  message += '\\n✅ No booking conflicts detected';
}

return [{
  json: {
    channel: ownerData.channel || 'telegram',
    recipient: ownerData.recipient,
    message: message,
    owner_name: ownerData.owner_name || 'Owner'
  }
}];`;

async function main() {
  console.log('=== FIX: WF3 Send Sync Summary — pass recipient + guard empty ===\n');

  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('Downloaded: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)');

  // FIX 1: Build Sync Summary — guard against empty recipient
  const buildNode = wf3.nodes.find(n => n.name === 'Build Sync Summary');
  console.log('\n1. Fixing Build Sync Summary (guard empty recipient)...');
  console.log('   Old code length: ' + buildNode.parameters.jsCode.length);
  buildNode.parameters.jsCode = BUILD_SYNC_SUMMARY_CODE;
  console.log('   New code length: ' + buildNode.parameters.jsCode.length);

  // FIX 2: Send Sync Summary — add sender_id mapping for recipient
  const sendNode = wf3.nodes.find(n => n.name === 'Send Sync Summary');
  console.log('\n2. Fixing Send Sync Summary (add sender_id = recipient)...');
  console.log('   Old mappings:', JSON.stringify(sendNode.parameters.workflowInputs.value));

  sendNode.parameters.workflowInputs.value = {
    channel: '={{ $json.channel }}',
    sender_id: '={{ $json.recipient }}',
    input: '={{ $json.message }}'
  };

  console.log('   New mappings:', JSON.stringify(sendNode.parameters.workflowInputs.value));

  // Deploy
  console.log('\n3. Deploying...');
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/pEn69kwNtCEQ21y9', {
    name: wf3.name, nodes: wf3.nodes, connections: wf3.connections,
    settings: wf3.settings, staticData: wf3.staticData
  });
  if (res.status !== 200) {
    console.log('   ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');

  console.log('   DEPLOYED & ACTIVATED');
  console.log('\n=== FIX SUMMARY ===');
  console.log('  1. Build Sync Summary: returns [] when no recipient → Send Sync Summary skips (no input)');
  console.log('  2. Send Sync Summary: now passes sender_id=$json.recipient to SUB → Telegram gets chat_id');
  console.log('  3. Current test owner has chat_id="test-chat-id" — not a real Telegram ID');
  console.log('     Once a real Telegram chat_id is set in owners table, notifications will work');
}

main().catch(console.error);

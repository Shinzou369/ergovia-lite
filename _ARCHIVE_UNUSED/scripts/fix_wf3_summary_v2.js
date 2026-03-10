const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const CORRECT_PG = { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' };

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

async function main() {
  console.log('=== WF3: FIX SUMMARY — OWNER CONTACT + ERROR HANDLING ===\n');

  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('Downloaded: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)');

  // ============================================================
  // STEP 1: Add "Get Owner Contact" postgres node
  // Queries the owner's contact info so we know WHERE to send
  // Chain: Loop [done] → Get Owner Contact → Build Summary → Send Summary
  // ============================================================
  const getOwnerContact = {
    id: 'get-owner-contact',
    name: 'Get Owner Contact',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [1168, -16],
    parameters: {
      operation: 'executeQuery',
      query: `SELECT
  COALESCE(o.owner_chat_id, p.owner_telegram, p.owner_contact) as recipient,
  COALESCE(o.preferred_platform, 'telegram') as channel,
  COALESCE(o.owner_name, p.owner_name, 'Owner') as owner_name
FROM (SELECT 1) dummy
LEFT JOIN owners o ON true
LEFT JOIN property_configurations p ON p.property_status = 'active'
ORDER BY o.owner_id NULLS LAST, p.property_name
LIMIT 1`,
      options: {}
    },
    credentials: { postgres: CORRECT_PG }
  };
  wf3.nodes.push(getOwnerContact);
  console.log('  Added: Get Owner Contact (postgres query)');

  // ============================================================
  // STEP 2: Fix "Build Sync Summary" code — try/catch for
  // $('Detect Conflicts') and use owner contact from DB
  // ============================================================
  const summaryNode = wf3.nodes.find(n => n.name === 'Build Sync Summary');
  summaryNode.position = [1392, -16];
  summaryNode.parameters.jsCode = `// Build daily sync summary after all properties processed
// Safely get conflict results (may not exist if no properties)
let allResults = [];
try {
  allResults = $('Detect Conflicts').all();
} catch(e) {
  // No properties were processed, Detect Conflicts never ran
}

// Get owner contact from DB query
const ownerData = $('Get Owner Contact').first().json;

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
    recipient: ownerData.recipient || '',
    message: message,
    owner_name: ownerData.owner_name || 'Owner'
  }
}];`;

  console.log('  Updated: Build Sync Summary (try/catch + owner contact from DB)');

  // ============================================================
  // STEP 3: Rewire connections
  // Old: Loop [done] → Build Sync Summary → Send Sync Summary
  // New: Loop [done] → Get Owner Contact → Build Sync Summary → Send Sync Summary
  // ============================================================

  // Loop Properties [done] → Get Owner Contact
  wf3.connections['Loop Properties'].main[1] = [
    { node: 'Get Owner Contact', type: 'main', index: 0 }
  ];

  // Get Owner Contact → Build Sync Summary
  wf3.connections['Get Owner Contact'] = {
    main: [[{ node: 'Build Sync Summary', type: 'main', index: 0 }]]
  };

  // Build Sync Summary → Send Sync Summary (already exists, verify)
  if (!wf3.connections['Build Sync Summary']) {
    wf3.connections['Build Sync Summary'] = {
      main: [[{ node: 'Send Sync Summary', type: 'main', index: 0 }]]
    };
  }

  console.log('  Rewired: Loop [done] → Get Owner Contact → Build Summary → Send Summary');

  // ============================================================
  // STEP 4: Upload
  // ============================================================
  console.log('\n  Uploading WF3...');
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/pEn69kwNtCEQ21y9', {
    name: wf3.name, nodes: wf3.nodes, connections: wf3.connections,
    settings: wf3.settings, staticData: wf3.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');

  // ============================================================
  // VERIFY
  // ============================================================
  const { data: v3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('\n  VERIFIED: ' + v3.name + ' (' + v3.nodes.length + ' nodes, active=' + v3.active + ')');

  // Trace done path
  const done1 = v3.connections['Loop Properties']?.main?.[1]?.[0]?.node || '?';
  const done2 = v3.connections['Get Owner Contact']?.main?.[0]?.[0]?.node || '?';
  const done3 = v3.connections['Build Sync Summary']?.main?.[0]?.[0]?.node || '?';
  console.log('\n  DONE PATH: Loop [done] → ' + done1 + ' → ' + done2 + ' → ' + done3);

  console.log('\n  === HOW OWNER CONTACT WORKS ===');
  console.log('  1. "Get Owner Contact" queries DB for owner_chat_id + preferred_platform');
  console.log('  2. "Build Sync Summary" reads that contact and builds the message');
  console.log('  3. "Send Sync Summary" calls SUB with { channel, recipient, message }');
  console.log('  4. SUB routes to Telegram/WhatsApp/SMS based on channel');
  console.log('');
  console.log('  REQUIREMENT: The owners table needs at least one row:');
  console.log('    INSERT INTO owners (owner_id, owner_name, owner_chat_id, preferred_platform)');
  console.log('    VALUES (gen_random_uuid(), \'Your Name\', \'TELEGRAM_CHAT_ID\', \'telegram\');');
  console.log('');
  console.log('  OR property_configurations needs owner_telegram or owner_contact set.');
}

main().catch(console.error);

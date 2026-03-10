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

async function main() {
  console.log('=== FIX: WF1 ↔ WF3 Harmony — Tool Integration ===\n');

  // ============================================
  // PART 1: Fix WF1 Calendar Manager Tool inputs
  // ============================================
  console.log('PART 1: Fix WF1 Calendar Manager Tool inputs\n');

  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log('  Downloaded WF1: ' + wf1.name + ' (' + wf1.nodes.length + ' nodes)');

  const calTool = wf1.nodes.find(n => n.name === 'Calendar Manager Tool');
  console.log('  Found: Calendar Manager Tool');
  console.log('  Current inputs: ' + JSON.stringify(calTool.parameters.workflowInputs?.value || {}));

  // Set proper $fromAI inputs so WF1's AI Agent passes dates to WF3
  calTool.parameters.workflowInputs = {
    mappingMode: "defineBelow",
    value: {
      property_id: "={{ $fromAI('property_id', 'The property ID to check availability for. Leave empty to check all properties.', 'string', '') }}",
      check_in_date: "={{ $fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format', 'string', '') }}",
      check_out_date: "={{ $fromAI('check_out_date', 'Check-out date in YYYY-MM-DD format', 'string', '') }}",
      num_guests: "={{ $fromAI('num_guests', 'Number of guests. Optional.', 'string', '') }}"
    },
    matchingColumns: [],
    schema: [
      { id: "property_id", displayName: "property_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "check_in_date", displayName: "check_in_date", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "check_out_date", displayName: "check_out_date", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "num_guests", displayName: "num_guests", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }
    ],
    attemptToConvertTypes: false,
    convertFieldsToString: true
  };

  console.log('  NEW inputs: property_id, check_in_date, check_out_date, num_guests (via $fromAI)');

  // Deploy WF1
  console.log('\n  Deploying WF1...');
  await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/deactivate');
  await sleep(1500);
  let res = await apiCall('PUT', '/api/v1/workflows/LP7YknAVPiQsidWq', {
    name: wf1.name, nodes: wf1.nodes, connections: wf1.connections,
    settings: wf1.settings, staticData: wf1.staticData
  });
  if (res.status !== 200) {
    console.log('  WF1 ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 300));
    await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
  console.log('  WF1 DEPLOYED & ACTIVATED');

  // ============================================
  // PART 2: Fix WF3 done path — return data, not send via SUB
  // ============================================
  console.log('\n\nPART 2: Fix WF3 done path — return data instead of SUB\n');

  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('  Downloaded WF3: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)');

  // Remove nodes: Send Sync Summary, Get Owner Contact
  const nodesToRemove = ['Send Sync Summary', 'Get Owner Contact'];
  for (const name of nodesToRemove) {
    const idx = wf3.nodes.findIndex(n => n.name === name);
    if (idx !== -1) {
      wf3.nodes.splice(idx, 1);
      console.log('  Removed: ' + name);
    }
  }

  // Remove connections FROM removed nodes
  delete wf3.connections['Send Sync Summary'];
  delete wf3.connections['Get Owner Contact'];

  // Fix Build Sync Summary code — return clean JSON data (not Telegram message)
  const buildNode = wf3.nodes.find(n => n.name === 'Build Sync Summary');
  buildNode.parameters.jsCode = `// Build daily sync summary — returns data (tool output or cron log)
// Safely get conflict results (may not exist if no properties)
let allResults = [];
try {
  allResults = $('Detect Conflicts').all();
} catch(e) {
  // No properties were processed, Detect Conflicts never ran
}

let propertyCount = 0;
try {
  propertyCount = $input.all().length;
} catch(e) {}

let totalConflicts = 0;
const conflictDetails = [];

for (const item of allResults) {
  const r = item.json;
  if (r.has_conflicts) {
    totalConflicts += r.conflicts.length;
    conflictDetails.push({
      property: r.property_name,
      property_id: r.property_id,
      conflicts: r.conflicts
    });
  }
}

return [{
  json: {
    status: 'SUCCESS',
    action: 'calendar_sync',
    timestamp: new Date().toISOString(),
    properties_scanned: propertyCount,
    total_conflicts: totalConflicts,
    conflict_details: conflictDetails,
    summary: propertyCount === 0
      ? 'No active properties configured yet.'
      : totalConflicts > 0
        ? totalConflicts + ' booking conflict(s) found across ' + conflictDetails.length + ' properties. Individual alerts have been sent.'
        : 'All ' + propertyCount + ' properties synced — no booking conflicts detected.'
  }
}];`;

  console.log('  Updated Build Sync Summary (returns clean JSON, no messaging format)');

  // Rewire: Loop Properties [done] → Build Sync Summary (direct, no Get Owner Contact)
  if (wf3.connections['Loop Properties']) {
    const loopConns = wf3.connections['Loop Properties'].main;
    // out1 = done path, was pointing to Get Owner Contact, now point to Build Sync Summary
    if (loopConns[1]) {
      loopConns[1] = [{ node: 'Build Sync Summary', type: 'main', index: 0 }];
      console.log('  Rewired: Loop Properties [done] → Build Sync Summary');
    }
  }

  // Remove connection from Build Sync Summary → Send Sync Summary (it's now the last node)
  delete wf3.connections['Build Sync Summary'];
  console.log('  Build Sync Summary is now the terminal node (returns to WF1 or logs for cron)');

  console.log('\n  Final node count: ' + wf3.nodes.length);
  console.log('  Nodes: ' + wf3.nodes.map(n => n.name).join(', '));

  // Deploy WF3
  console.log('\n  Deploying WF3...');
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/deactivate');
  await sleep(1500);
  res = await apiCall('PUT', '/api/v1/workflows/pEn69kwNtCEQ21y9', {
    name: wf3.name, nodes: wf3.nodes, connections: wf3.connections,
    settings: wf3.settings, staticData: wf3.staticData
  });
  if (res.status !== 200) {
    console.log('  WF3 ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');
  console.log('  WF3 DEPLOYED & ACTIVATED');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n\n=== HARMONY FIX SUMMARY ===');
  console.log('');
  console.log('WF1 Changes:');
  console.log('  Calendar Manager Tool now passes: property_id, check_in_date, check_out_date, num_guests');
  console.log('  AI Agent uses $fromAI() to extract dates from guest conversation');
  console.log('');
  console.log('WF3 Changes:');
  console.log('  Removed: Send Sync Summary (was calling SUB to send Telegram messages)');
  console.log('  Removed: Get Owner Contact (no longer needed)');
  console.log('  Updated: Build Sync Summary now returns clean JSON data');
  console.log('  Rewired: Loop [done] → Build Sync Summary (terminal — returns to caller)');
  console.log('');
  console.log('Data Flow:');
  console.log('  Guest asks "Is Feb 14-16 available?"');
  console.log('  → WF1 AI Agent calls Calendar Manager Tool(check_in=2026-02-14, check_out=2026-02-16)');
  console.log('  → WF3 Prepare Parameters: is_availability_check = true');
  console.log('  → Check Availability (PostgreSQL) → Format Availability Response');
  console.log('  → Returns JSON to WF1 AI Agent → Agent responds to guest');
  console.log('');
  console.log('  Daily 6 AM cron:');
  console.log('  → WF3 Prepare Parameters: is_availability_check = false');
  console.log('  → Get Properties → Loop → Detect Conflicts → [done] → Build Sync Summary');
  console.log('  → Summary logged in execution history (no external messages)');
}

main().catch(console.error);

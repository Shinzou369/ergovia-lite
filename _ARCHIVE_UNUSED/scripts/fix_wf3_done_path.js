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
  console.log('=== WF3: FIX DONE PATH — ADD SYNC SUMMARY ===\n');

  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('Downloaded: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)');

  // ============================================================
  // STEP 1: Remove the misconfigured Merge Results node
  // ============================================================
  const mergeIdx = wf3.nodes.findIndex(n => n.name === 'Merge Results');
  if (mergeIdx !== -1) {
    wf3.nodes.splice(mergeIdx, 1);
    delete wf3.connections['Merge Results'];
    console.log('  Removed: Merge Results (dead-end merge node)');
  }

  // ============================================================
  // STEP 2: Add "Build Sync Summary" code node
  // Collects results from the loop and builds a summary message
  // ============================================================
  const buildSummary = {
    id: 'build-sync-summary',
    name: 'Build Sync Summary',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1392, -16],  // Same position as old Merge Results
    parameters: {
      jsCode: `// Build daily sync summary after all properties processed
const allResults = $('Detect Conflicts').all();
const properties = $input.all();

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
message += '\\n🏠 Properties scanned: ' + properties.length;

if (totalConflicts > 0) {
  message += '\\n⚠️ Conflicts found: ' + totalConflicts;
  message += '\\n📍 Affected: ' + conflictProperties.join(', ');
  message += '\\n\\n_Individual alerts were sent above._';
} else {
  message += '\\n✅ No booking conflicts detected';
}

return [{
  json: {
    channel: 'telegram',
    recipient_type: 'owner',
    recipient_id: 'owner',
    message_type: 'sync_summary',
    message: message,
    subject: 'Daily Calendar Sync Summary'
  }
}];`
    }
  };
  wf3.nodes.push(buildSummary);
  console.log('  Added: Build Sync Summary (code node)');

  // ============================================================
  // STEP 3: Add "Send Sync Summary" — calls SUB to deliver
  // ============================================================
  const sendSummary = {
    id: 'send-sync-summary',
    name: 'Send Sync Summary',
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1.2,
    position: [1616, -16],
    parameters: {
      workflowId: { value: 'UZMWfhnV6JmuwJXC' },
      mode: 'each'
    }
  };
  wf3.nodes.push(sendSummary);
  console.log('  Added: Send Sync Summary (calls SUB)');

  // ============================================================
  // STEP 4: Rewire connections
  // ============================================================

  // Loop Properties [done] → Build Sync Summary (replaces → Merge Results)
  wf3.connections['Loop Properties'].main[1] = [
    { node: 'Build Sync Summary', type: 'main', index: 0 }
  ];

  // Build Sync Summary → Send Sync Summary
  wf3.connections['Build Sync Summary'] = {
    main: [[{ node: 'Send Sync Summary', type: 'main', index: 0 }]]
  };

  console.log('  Rewired: Loop Properties [done] → Build Sync Summary → Send Sync Summary');

  // ============================================================
  // STEP 5: Upload
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

  // Trace the done path
  const doneConns = v3.connections['Loop Properties']?.main?.[1];
  const doneTarget = doneConns?.[0]?.node || '(nothing)';
  const summaryConns = v3.connections['Build Sync Summary']?.main?.[0];
  const summaryTarget = summaryConns?.[0]?.node || '(nothing)';

  console.log('\n  === DONE PATH ===');
  console.log('  Loop Properties [done] → ' + doneTarget + ' → ' + summaryTarget);

  console.log('\n  === FULL WF3 PATHS ===');
  console.log('');
  console.log('  PATH A — AVAILABILITY CHECK (tool for WF1):');
  console.log('    Trigger → Prepare → IF [true] → Check Availability → Format Response → (return to WF1)');
  console.log('');
  console.log('  PATH B — DAILY SYNC (6AM cron):');
  console.log('    Daily 6AM → Prepare → IF [false] → Get Properties → Loop →');
  console.log('      [items] → Get Bookings → Detect Conflicts → Has Conflicts?');
  console.log('        [yes] → Log → Generate Alert → Send Alert → back to Loop');
  console.log('        [no]  → Continue Loop → back to Loop');
  console.log('      [done]  → Build Sync Summary → Send Sync Summary (via SUB)');
}

main().catch(console.error);

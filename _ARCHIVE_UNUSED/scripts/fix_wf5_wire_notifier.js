const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

const WF5_ID = 'JWEu9Uz2JJ5XZeIX';
const SUB_NOTIFIER_ID = '0L7HOkqENABlbPtT';

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
  console.log('=== FIX: WF5 — Wire Send Notification to SUB Notifier ===\n');

  // ============================================
  // 1. Download live WF5 and inspect
  // ============================================
  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/' + WF5_ID);
  console.log('Downloaded WF5: ' + wf5.name + ' (' + wf5.nodes.length + ' nodes)');
  console.log('\nCurrent nodes:');
  wf5.nodes.forEach(n => {
    const flags = [];
    if (n.disabled) flags.push('DISABLED');
    console.log('  ' + n.name.padEnd(30) + ' [' + n.position + '] ' + flags.join(' '));
  });

  console.log('\nCurrent connections:');
  Object.entries(wf5.connections).forEach(([from, conn]) => {
    if (conn.main) conn.main.forEach((outputs, i) => {
      if (outputs.length) outputs.forEach(o => console.log('  ' + from + '[' + i + '] -> ' + o.node));
      else console.log('  ' + from + '[' + i + '] -> (empty)');
    });
  });

  // ============================================
  // 2. Find key nodes by NAME (live IDs are UUIDs)
  // ============================================
  const findNode = (name) => wf5.nodes.find(n => n.name === name);

  const sendNotif = findNode('Send Notification');
  const returnResult = findNode('Return Result');
  const aiMaint = findNode('AI Maintenance Handler');
  const schedClean = findNode('Schedule Cleaning');
  const updateTicket = findNode('Update Ticket Status');
  const getProperty = findNode('Get Property Details');
  const normalizeInput = findNode('Normalize Input');

  if (!sendNotif) { console.log('\nERROR: Send Notification node not found!'); return; }
  if (!returnResult) { console.log('\nERROR: Return Result node not found!'); return; }

  console.log('\nKey nodes found:');
  console.log('  Send Notification: ' + sendNotif.id + ' disabled=' + !!sendNotif.disabled);
  console.log('  Return Result:     ' + returnResult.id);

  // ============================================
  // 3. Add "Build Notification" Code node (if missing)
  // ============================================
  let buildNotif = findNode('Build Notification');
  if (!buildNotif) {
    console.log('\n--- Adding Build Notification node ---');

    const jsCode = `// Build notification message for owner
// SUB: Owner & Staff Notifier resolves the contact info from DB
const normalizeData = $('Normalize Input').item.json;
const opType = normalizeData.type;

// Get the operation result from whichever operation node ran
let operationResult = {};
try {
  if (opType === 'maintenance') operationResult = $('AI Maintenance Handler').item.json;
  else if (opType === 'cleaning') operationResult = $('Schedule Cleaning').item.json;
  else if (opType === 'vendor_update') operationResult = $('Update Ticket Status').item.json;
} catch(e) { operationResult = {}; }

// Build human-readable notification message
let message = '';
if (opType === 'maintenance') {
  const aiOutput = operationResult.output || operationResult.text || JSON.stringify(operationResult).substring(0, 200);
  message = '\\u{1F527} Maintenance alert: ' + aiOutput;
} else if (opType === 'cleaning') {
  const date = operationResult.scheduled_date || new Date().toISOString().split('T')[0];
  const time = operationResult.scheduled_time || '14:00';
  message = '\\u{1F9F9} Cleaning scheduled for ' + date + ' at ' + time;
} else if (opType === 'vendor_update') {
  const ticketId = operationResult.ticket_id || normalizeData.ticket_id || 'N/A';
  const newStatus = operationResult.status || 'updated';
  message = '\\u{1F4CB} Ticket ' + ticketId + ': status changed to ' + newStatus;
}

return {
  property_id: normalizeData.property_id || '',
  event_type: opType,
  message: message,
  notify: 'owner',
  recipient_id: '',
  customer_id: normalizeData.customer_id || '',
  _operation_result: operationResult
};`;

    buildNotif = {
      parameters: { mode: "runOnceForEachItem", jsCode: jsCode },
      id: "build-notif-" + Date.now().toString(36),
      name: "Build Notification",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [640, 480]
    };

    wf5.nodes.push(buildNotif);
    console.log('  Added at position [640, 480]');
  } else {
    console.log('\n--- Build Notification already exists (id: ' + buildNotif.id + ') ---');
  }

  // ============================================
  // 4. Update Send Notification node
  // ============================================
  console.log('\n--- Updating Send Notification ---');

  // Enable it
  delete sendNotif.disabled;
  console.log('  Enabled (was disabled)');

  // Point to SUB: Owner & Staff Notifier
  sendNotif.parameters.workflowId = {
    __rl: true,
    mode: "list",
    value: SUB_NOTIFIER_ID,
    cachedResultName: "SUB: Owner & Staff Notifier",
    cachedResultUrl: "/workflow/" + SUB_NOTIFIER_ID
  };
  console.log('  Target: SUB: Owner & Staff Notifier (ID: ' + SUB_NOTIFIER_ID + ')');

  // Update workflowInputs to 6-field schema for SUB Notifier
  sendNotif.parameters.workflowInputs = {
    mappingMode: "defineBelow",
    value: {
      property_id: "={{ $json.property_id }}",
      event_type: "={{ $json.event_type }}",
      message: "={{ $json.message }}",
      notify: "={{ $json.notify }}",
      recipient_id: "={{ $json.recipient_id }}",
      customer_id: "={{ $json.customer_id }}"
    },
    matchingColumns: [],
    schema: [
      { id: "property_id", displayName: "property_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "event_type", displayName: "event_type", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "message", displayName: "message", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "notify", displayName: "notify", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "recipient_id", displayName: "recipient_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "customer_id", displayName: "customer_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }
    ],
    attemptToConvertTypes: false,
    convertFieldsToString: true
  };
  console.log('  Inputs: property_id, event_type, message, notify, recipient_id, customer_id');

  // Add continueOnFail so notification errors don't break the return path
  sendNotif.continueOnFail = true;
  console.log('  continueOnFail: true');

  // ============================================
  // 5. Update Return Result to extract operation data
  // ============================================
  console.log('\n--- Updating Return Result ---');
  if (returnResult) {
    returnResult.parameters.jsCode = `// Return operation result to calling workflow (WF1)
// For notifiable paths: extract _operation_result from Build Notification
// For property_details path: pass through directly
try {
  const buildResult = $('Build Notification').item.json;
  if (buildResult && buildResult._operation_result) {
    return buildResult._operation_result;
  }
} catch(e) {
  // Build Notification didn't run (property_details path)
}
return $input.item.json;`;
    console.log('  Updated code to extract _operation_result');
  }

  // ============================================
  // 6. Rebuild connections
  // ============================================
  console.log('\n--- Rebuilding connections ---');

  // Start from the existing connections, then patch
  const conn = wf5.connections;

  // Wire the 3 operation result nodes -> Build Notification
  if (aiMaint) {
    conn['AI Maintenance Handler'] = {
      main: [[{ node: "Build Notification", type: "main", index: 0 }]]
    };
    console.log('  AI Maintenance Handler -> Build Notification');
  }
  if (schedClean) {
    conn['Schedule Cleaning'] = {
      main: [[{ node: "Build Notification", type: "main", index: 0 }]]
    };
    console.log('  Schedule Cleaning -> Build Notification');
  }
  if (updateTicket) {
    conn['Update Ticket Status'] = {
      main: [[{ node: "Build Notification", type: "main", index: 0 }]]
    };
    console.log('  Update Ticket Status -> Build Notification');
  }

  // Build Notification -> Send Notification
  conn['Build Notification'] = {
    main: [[{ node: "Send Notification", type: "main", index: 0 }]]
  };
  console.log('  Build Notification -> Send Notification');

  // Send Notification -> Return Result
  conn['Send Notification'] = {
    main: [[{ node: "Return Result", type: "main", index: 0 }]]
  };
  console.log('  Send Notification -> Return Result');

  // Get Property Details -> Return Result (no notification, informational only)
  if (getProperty) {
    conn['Get Property Details'] = {
      main: [[{ node: "Return Result", type: "main", index: 0 }]]
    };
    console.log('  Get Property Details -> Return Result (no notification)');
  }

  // Remove stale connections to old Get Owner Contact if present
  delete conn['Get Owner Contact'];

  // ============================================
  // 7. Deploy
  // ============================================
  console.log('\nDeploying WF5...');
  await apiCall('POST', '/api/v1/workflows/' + WF5_ID + '/deactivate');
  await sleep(1500);

  const res = await apiCall('PUT', '/api/v1/workflows/' + WF5_ID, {
    name: wf5.name, nodes: wf5.nodes, connections: conn,
    settings: wf5.settings, staticData: wf5.staticData
  });

  if (res.status !== 200) {
    console.log('ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/' + WF5_ID + '/activate');
    return;
  }

  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/' + WF5_ID + '/activate');
  console.log('WF5 deployed & activated');

  // ============================================
  // 8. Verify
  // ============================================
  console.log('\n--- Verification ---');
  const { data: verify } = await apiCall('GET', '/api/v1/workflows/' + WF5_ID);

  const vBuild = verify.nodes.find(n => n.name === 'Build Notification');
  const vSend = verify.nodes.find(n => n.name === 'Send Notification');
  console.log('  Build Notification: ' + (vBuild ? 'EXISTS' : 'MISSING'));
  console.log('  Send Notification:  ' + (vSend ? 'EXISTS, disabled=' + !!vSend.disabled + ', target=' + vSend.parameters?.workflowId?.value : 'MISSING'));

  // Check connections
  const vConn = verify.connections;
  const checkConn = (from) => {
    const c = vConn[from];
    if (c && c.main && c.main[0] && c.main[0].length) return c.main[0].map(o => o.node).join(', ');
    return '(none)';
  };
  console.log('  AI Maintenance Handler -> ' + checkConn('AI Maintenance Handler'));
  console.log('  Schedule Cleaning -> ' + checkConn('Schedule Cleaning'));
  console.log('  Update Ticket Status -> ' + checkConn('Update Ticket Status'));
  console.log('  Build Notification -> ' + checkConn('Build Notification'));
  console.log('  Send Notification -> ' + checkConn('Send Notification'));
  console.log('  Get Property Details -> ' + checkConn('Get Property Details'));
  console.log('  Total nodes: ' + verify.nodes.length);

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n========================================');
  console.log(' WF5 NOTIFICATION WIRING — COMPLETE');
  console.log('========================================');
  console.log('');
  console.log('Added:   Build Notification (Code) — builds message per operation type');
  console.log('Updated: Send Notification — calls SUB: Owner & Staff Notifier (' + SUB_NOTIFIER_ID + ')');
  console.log('Updated: Return Result — extracts operation result for WF1');
  console.log('');
  console.log('Flow:');
  console.log('  [maintenance] AI Maintenance Handler -> Build Notification -> Send Notification -> Return Result');
  console.log('  [cleaning]    Schedule Cleaning      -> Build Notification -> Send Notification -> Return Result');
  console.log('  [vendor]      Update Ticket Status   -> Build Notification -> Send Notification -> Return Result');
  console.log('  [details]     Get Property Details   -> Return Result (no notification)');
}

main().catch(console.error);

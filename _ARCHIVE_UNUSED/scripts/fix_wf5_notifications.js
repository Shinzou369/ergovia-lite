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
  console.log('=== FIX: WF5 Property Operations — Notification Wiring ===\n');

  // ============================================
  // 1. Download current WF5
  // ============================================
  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5:', wf5.name, '(' + wf5.nodes.length + ' nodes)');

  // Log current connections for reference
  console.log('\nCurrent connections from operation nodes:');
  const aiMaintConn = wf5.connections['AI Maintenance Handler'];
  const schedCleanConn = wf5.connections['Schedule Cleaning'];
  const updateTicketConn = wf5.connections['Update Ticket Status'];
  const sendNotifConn = wf5.connections['Send Notification'];
  const getPropConn = wf5.connections['Get Property Details'];
  console.log('  AI Maintenance Handler →', aiMaintConn?.main?.[0]?.map(c => c.node).join(', ') || '(none)');
  console.log('  Schedule Cleaning →', schedCleanConn?.main?.[0]?.map(c => c.node).join(', ') || '(none)');
  console.log('  Update Ticket Status →', updateTicketConn?.main?.[0]?.map(c => c.node).join(', ') || '(none)');
  console.log('  Send Notification →', sendNotifConn?.main?.[0]?.map(c => c.node).join(', ') || '(none)');
  console.log('  Get Property Details →', getPropConn?.main?.[0]?.map(c => c.node).join(', ') || '(none)');

  // ============================================
  // 2. Add "Get Owner Contact" Postgres node
  // ============================================
  console.log('\n--- Adding: Get Owner Contact (Postgres) ---');

  const getOwnerContactNode = {
    parameters: {
      operation: "executeQuery",
      query: "SELECT property_name, owner_name, owner_phone, owner_email, owner_telegram, customer_id,\n       COALESCE(settings->>'preferred_platform', 'telegram') AS preferred_platform\nFROM property_configurations\nWHERE property_id = '{{ $('Normalize Input').item.json.property_id }}'\nLIMIT 1",
      options: {}
    },
    id: "get-owner-contact",
    name: "Get Owner Contact",
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [1200, 160],
    alwaysOutputData: true,
    credentials: {
      postgres: {
        id: "sjaI08GtPbON8TLX",
        name: "PostgreSQL - Client"
      }
    }
  };

  console.log('  Query: SELECT owner contact info from property_configurations');
  console.log('  Uses property_id from Normalize Input');
  console.log('  alwaysOutputData: true (ensures chain continues even with 0 rows)');

  // ============================================
  // 3. Add "Build Notification" Code node
  // ============================================
  console.log('\n--- Adding: Build Notification (Code) ---');

  const buildNotificationCode = [
    '// Build notification payload for property owner',
    'const normalizeData = $(\'Normalize Input\').item.json;',
    'const opType = normalizeData.type;',
    'const ownerData = $input.item.json; // From Get Owner Contact',
    '',
    '// Get the operation result from whichever operation node ran',
    'let operationResult = {};',
    'try {',
    '  if (opType === \'maintenance\') {',
    '    operationResult = $(\'AI Maintenance Handler\').item.json;',
    '  } else if (opType === \'cleaning\') {',
    '    operationResult = $(\'Schedule Cleaning\').item.json;',
    '  } else if (opType === \'vendor_update\') {',
    '    operationResult = $(\'Update Ticket Status\').item.json;',
    '  }',
    '} catch(e) {',
    '  operationResult = {};',
    '}',
    '',
    '// If no owner data found, skip notification (return empty fields)',
    'if (!ownerData || !ownerData.property_name) {',
    '  return {',
    '    channel: \'\', sender_id: \'\', input: \'\', customer_id: \'\',',
    '    _operation_result: operationResult',
    '  };',
    '}',
    '',
    'const propName = ownerData.property_name;',
    '',
    '// Build human-readable notification message based on operation type',
    'let message = \'\';',
    'if (opType === \'maintenance\') {',
    '  const aiOutput = operationResult.output || operationResult.text || JSON.stringify(operationResult).substring(0, 200);',
    '  message = \'\\u{1F527} Maintenance alert at \' + propName + \': \' + aiOutput;',
    '} else if (opType === \'cleaning\') {',
    '  const date = operationResult.scheduled_date || new Date().toISOString().split(\'T\')[0];',
    '  const time = operationResult.scheduled_time || \'14:00\';',
    '  message = \'\\u{1F9F9} Cleaning scheduled at \' + propName + \' for \' + date + \' at \' + time;',
    '} else if (opType === \'vendor_update\') {',
    '  const ticketId = operationResult.ticket_id || normalizeData.ticket_id || \'N/A\';',
    '  const newStatus = operationResult.status || \'updated\';',
    '  message = \'\\u{1F4CB} Ticket \' + ticketId + \' at \' + propName + \': status changed to \' + newStatus;',
    '}',
    '',
    '// Determine notification channel based on owner preferences',
    '// Priority: preferred_platform → telegram → whatsapp fallback',
    'const preferred = ownerData.preferred_platform || \'telegram\';',
    'let channel = \'\';',
    'let senderId = \'\';',
    '',
    'if (preferred === \'telegram\' && ownerData.owner_telegram) {',
    '  channel = \'telegram\';',
    '  senderId = ownerData.owner_telegram;',
    '} else if (ownerData.owner_phone) {',
    '  channel = \'whatsapp\';',
    '  senderId = ownerData.owner_phone;',
    '} else if (ownerData.owner_telegram) {',
    '  channel = \'telegram\';',
    '  senderId = ownerData.owner_telegram;',
    '}',
    '',
    '// If no contact info at all, channel/senderId stay empty',
    '// Send Notification has continueOnFail=true so it won\'t break the chain',
    '',
    'const customerId = ownerData.customer_id || normalizeData.customer_id || \'\';',
    '',
    'return {',
    '  channel,',
    '  sender_id: senderId,',
    '  input: message,',
    '  customer_id: customerId,',
    '  _operation_result: operationResult',
    '};'
  ].join('\n');

  const buildNotificationNode = {
    parameters: {
      mode: "runOnceForEachItem",
      jsCode: buildNotificationCode
    },
    id: "build-notification",
    name: "Build Notification",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1400, 160]
  };

  console.log('  Reads operation type from Normalize Input');
  console.log('  Gets operation result from the specific operation node that ran');
  console.log('  Looks up owner contact from Get Owner Contact output');
  console.log('  Builds message: maintenance (wrench), cleaning (broom), vendor (clipboard)');
  console.log('  Channel priority: preferred_platform → telegram → whatsapp fallback');
  console.log('  Passes through _operation_result for Return Result');

  // ============================================
  // 4. Add new nodes to workflow (remove existing if re-running)
  // ============================================
  wf5.nodes = wf5.nodes.filter(n =>
    n.id !== 'get-owner-contact' && n.id !== 'build-notification'
  );
  wf5.nodes.push(getOwnerContactNode, buildNotificationNode);
  console.log('\nTotal nodes after adding:', wf5.nodes.length);

  // ============================================
  // 5. Update Send Notification — map all 4 fields + continueOnFail
  // ============================================
  console.log('\n--- Updating: Send Notification ---');

  const sendNotif = wf5.nodes.find(n => n.id === 'send-notification' || n.name === 'Send Notification');
  if (sendNotif) {
    // Move position to accommodate new upstream nodes
    sendNotif.position = [1600, 160];

    // Add continueOnFail so errors don't break the return path
    sendNotif.continueOnFail = true;

    // Update workflowInputs to map all 4 fields from Build Notification
    sendNotif.parameters.workflowInputs.value = {
      channel: "={{ $json.channel }}",
      sender_id: "={{ $json.sender_id }}",
      input: "={{ $json.input }}",
      customer_id: "={{ $json.customer_id }}"
    };

    console.log('  Position: [1600, 160]');
    console.log('  continueOnFail: true (side effect — must not block return path)');
    console.log('  workflowInputs.value: maps all 4 fields from Build Notification');
    console.log('    channel    ← $json.channel');
    console.log('    sender_id  ← $json.sender_id');
    console.log('    input      ← $json.input (notification message)');
    console.log('    customer_id ← $json.customer_id');
  } else {
    console.log('  WARNING: Send Notification node not found!');
  }

  // ============================================
  // 6. Update Return Result — extract operation result, not SUB output
  // ============================================
  console.log('\n--- Updating: Return Result ---');

  const returnResult = wf5.nodes.find(n => n.id === 'return-result' || n.name === 'Return Result');
  if (returnResult) {
    returnResult.position = [1800, 400];
    returnResult.parameters.jsCode = [
      '// Return the operation result to calling workflow (WF1)',
      '// For notifiable paths: extract _operation_result from Build Notification',
      '// For property_details path: pass through directly from Get Property Details',
      'try {',
      '  const buildResult = $(\'Build Notification\').item.json;',
      '  if (buildResult && buildResult._operation_result) {',
      '    return buildResult._operation_result;',
      '  }',
      '} catch(e) {',
      '  // Build Notification didn\'t run (property_details path) — fall through',
      '}',
      'return $input.item.json;'
    ].join('\n');

    console.log('  Position: [1800, 400]');
    console.log('  Code: tries to get _operation_result from Build Notification');
    console.log('  Falls back to $input.item.json for property_details path');
  } else {
    console.log('  WARNING: Return Result node not found!');
  }

  // ============================================
  // 7. Rebuild connections
  // ============================================
  console.log('\n--- Rebuilding connections ---');

  wf5.connections = {
    // Entry points → Normalize Input
    "When Called by Other Workflow": {
      main: [[{ node: "Normalize Input", type: "main", index: 0 }]]
    },
    "Callback Handler": {
      main: [[{ node: "Normalize Input", type: "main", index: 0 }]]
    },

    // Normalize → Route
    "Normalize Input": {
      main: [[{ node: "Route Operation", type: "main", index: 0 }]]
    },

    // Route Operation: 4 branches
    //   [0] maintenance → AI Maintenance Handler
    //   [1] cleaning → Get Today's Checkouts
    //   [2] vendor_update → Update Ticket Status
    //   [3] property_details → Get Property Details
    "Route Operation": {
      main: [
        [{ node: "AI Maintenance Handler", type: "main", index: 0 }],
        [{ node: "Get Today's Checkouts", type: "main", index: 0 }],
        [{ node: "Update Ticket Status", type: "main", index: 0 }],
        [{ node: "Get Property Details", type: "main", index: 0 }]
      ]
    },

    // AI sub-nodes for Maintenance Handler
    "Maintenance Model": {
      ai_languageModel: [[{ node: "AI Maintenance Handler", type: "ai_languageModel", index: 0 }]]
    },
    "Create Ticket Tool": {
      ai_tool: [[{ node: "AI Maintenance Handler", type: "ai_tool", index: 0 }]]
    },

    // Cleaning path: Get Checkouts → Schedule Cleaning
    "Get Today's Checkouts": {
      main: [[{ node: "Schedule Cleaning", type: "main", index: 0 }]]
    },

    // === NEW: All 3 operation results → Get Owner Contact ===
    "AI Maintenance Handler": {
      main: [[{ node: "Get Owner Contact", type: "main", index: 0 }]]
    },
    "Schedule Cleaning": {
      main: [[{ node: "Get Owner Contact", type: "main", index: 0 }]]
    },
    "Update Ticket Status": {
      main: [[{ node: "Get Owner Contact", type: "main", index: 0 }]]
    },

    // === NEW: Notification chain ===
    "Get Owner Contact": {
      main: [[{ node: "Build Notification", type: "main", index: 0 }]]
    },
    "Build Notification": {
      main: [[{ node: "Send Notification", type: "main", index: 0 }]]
    },
    "Send Notification": {
      main: [[{ node: "Return Result", type: "main", index: 0 }]]
    },

    // Property details path: direct to Return Result (no notification)
    "Get Property Details": {
      main: [[{ node: "Return Result", type: "main", index: 0 }]]
    }
  };

  console.log('  Entry → Normalize Input → Route Operation');
  console.log('  Route[0] maintenance → AI Maintenance Handler → Get Owner Contact');
  console.log('  Route[1] cleaning   → Get Checkouts → Schedule Cleaning → Get Owner Contact');
  console.log('  Route[2] vendor     → Update Ticket Status → Get Owner Contact');
  console.log('  Get Owner Contact → Build Notification → Send Notification → Return Result');
  console.log('  Route[3] details    → Get Property Details → Return Result (no notification)');

  // ============================================
  // 8. Deploy
  // ============================================
  console.log('\n\nDeploying WF5...');
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/deactivate');
  console.log('  Deactivated');
  await sleep(1500);

  const res = await apiCall('PUT', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX', {
    name: wf5.name,
    nodes: wf5.nodes,
    connections: wf5.connections,
    settings: wf5.settings,
    staticData: wf5.staticData
  });

  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    console.log('\n  Re-activating original workflow...');
    await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
    return;
  }

  console.log('  PUT succeeded (status ' + res.status + ')');
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
  console.log('  Activated');

  // ============================================
  // 9. Summary
  // ============================================
  console.log('\n\n========================================');
  console.log('  WF5 NOTIFICATION FIX — COMPLETE');
  console.log('========================================\n');
  console.log('Added 2 new nodes:');
  console.log('  1. Get Owner Contact (Postgres)');
  console.log('     - Queries property_configurations for owner_telegram, owner_phone, preferred_platform');
  console.log('     - Uses property_id from Normalize Input');
  console.log('     - alwaysOutputData ensures chain continues even if property not found');
  console.log('');
  console.log('  2. Build Notification (Code)');
  console.log('     - Reads operation type + result + owner contact');
  console.log('     - Builds human-readable notification:');
  console.log('       maintenance: "🔧 Maintenance alert at [Property]: [details]"');
  console.log('       cleaning:    "🧹 Cleaning scheduled at [Property] for [date] at [time]"');
  console.log('       vendor:      "📋 Ticket [ID] at [Property]: status → [new_status]"');
  console.log('     - Determines channel: telegram (preferred) → whatsapp (fallback)');
  console.log('     - Passes through _operation_result for Return Result');
  console.log('');
  console.log('Updated 2 existing nodes:');
  console.log('  3. Send Notification');
  console.log('     - Now maps all 4 SUB fields: channel, sender_id, input, customer_id');
  console.log('     - continueOnFail: true (side effect, must not block return path)');
  console.log('');
  console.log('  4. Return Result');
  console.log('     - Extracts _operation_result from Build Notification (for notifiable ops)');
  console.log('     - Falls back to $input.item.json (for property_details path)');
  console.log('');
  console.log('Flow:');
  console.log('  [maintenance/cleaning/vendor] → Get Owner Contact → Build Notification → Send Notification → Return Result');
  console.log('  [property_details]            → Get Property Details → Return Result (no notification)');
  console.log('');
  console.log('Skip notification when:');
  console.log('  - Operation is property_details (informational, no owner notify needed)');
  console.log('  - No owner contact info found (empty channel/sender_id, SUB fails gracefully)');
}

main().catch(console.error);

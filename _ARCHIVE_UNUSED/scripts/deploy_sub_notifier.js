const https = require('https');
const fs = require('fs');
const path = require('path');

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

// ============================================================
// SUB: Owner & Staff Notifier — Workflow Definition
// ============================================================

function buildNotifierWorkflow() {
  // --- Node: Trigger ---
  const trigger = {
    parameters: {
      workflowInputs: {
        values: [
          { name: "property_id" },
          { name: "event_type" },
          { name: "message" },
          { name: "notify" },
          { name: "recipient_id" },
          { name: "customer_id" }
        ]
      }
    },
    id: "notifier-trigger",
    name: "When Executed by Another Workflow",
    type: "n8n-nodes-base.executeWorkflowTrigger",
    typeVersion: 1.1,
    position: [0, 176]
  };

  // --- Node: Normalize Input ---
  const normalizeCode = [
    '// Set defaults for all input fields',
    'const input = $input.item.json;',
    'return {',
    '  property_id: input.property_id || \'\',',
    '  event_type: input.event_type || \'general\',',
    '  message: input.message || input.input || \'\',',
    '  notify: (input.notify || \'owner\').toLowerCase(),',
    '  recipient_id: input.recipient_id || \'\',',
    '  customer_id: input.customer_id || \'\'',
    '};'
  ].join('\n');

  const normalizeInput = {
    parameters: { mode: "runOnceForEachItem", jsCode: normalizeCode },
    id: "notifier-normalize",
    name: "Normalize Input",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [224, 176]
  };

  // --- Node: Resolve Recipients (Postgres UNION query) ---
  const resolveQuery = [
    'SELECT * FROM (',
    '  SELECT',
    '    owner_name AS name,',
    '    owner_telegram AS telegram_id,',
    '    owner_phone AS phone,',
    '    owner_email AS email,',
    "    COALESCE(settings->>'preferred_platform', 'telegram') AS preferred_channel,",
    '    property_name,',
    "    'owner' AS resolved_type",
    '  FROM property_configurations',
    "  WHERE property_id = '{{ $json.property_id }}'",
    '',
    '  UNION ALL',
    '',
    '  SELECT',
    '    cleaner_name, telegram_id, phone, email,',
    "    'telegram', NULL, 'cleaner'",
    '  FROM cleaners',
    "  WHERE cleaner_id = '{{ $json.recipient_id }}'",
    "    AND status = 'active'",
    "    AND '{{ $json.recipient_id }}' != ''",
    '',
    '  UNION ALL',
    '',
    '  SELECT',
    '    name, telegram_id, phone, email,',
    "    'telegram', NULL, 'vendor'",
    '  FROM vendors',
    "  WHERE vendor_id = '{{ $json.recipient_id }}'",
    "    AND status = 'active'",
    "    AND '{{ $json.recipient_id }}' != ''",
    ') recipients',
    "WHERE resolved_type = '{{ $json.notify }}'",
    "   OR '{{ $json.notify }}' = 'all'"
  ].join('\n');

  const resolveRecipients = {
    parameters: { operation: "executeQuery", query: resolveQuery, options: {} },
    id: "notifier-resolve",
    name: "Resolve Recipients",
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [448, 176],
    alwaysOutputData: true,
    credentials: {
      postgres: { id: "BWlLUMKn64aZsHi8", name: "[Client] PostgreSQL" }
    }
  };

  // --- Node: Build Delivery (Code) ---
  const buildDeliveryCode = [
    '// Determine delivery channel for each resolved recipient',
    "const input = $('Normalize Input').item.json;",
    'const recipient = $input.item.json; // From Resolve Recipients',
    '',
    '// No recipient found — skip silently',
    'if (!recipient || !recipient.name) {',
    "  return { channel: 'skip', reason: 'No recipient found for ' + input.notify };",
    '}',
    '',
    '// Determine channel based on preferred + available contact info',
    "const preferred = (recipient.preferred_channel || 'telegram').toLowerCase();",
    "let channel = '';",
    "let contactId = '';",
    '',
    "if (preferred === 'telegram' && recipient.telegram_id) {",
    "  channel = 'telegram';",
    '  contactId = recipient.telegram_id;',
    "} else if (preferred === 'whatsapp' && recipient.phone) {",
    "  channel = 'whatsapp';",
    '  contactId = recipient.phone;',
    '} else if (recipient.telegram_id) {',
    "  channel = 'telegram';",
    '  contactId = recipient.telegram_id;',
    '} else if (recipient.phone) {',
    "  channel = 'whatsapp';",
    '  contactId = recipient.phone;',
    '} else {',
    "  return { channel: 'skip', reason: 'No contact info for ' + recipient.name };",
    '}',
    '',
    'return {',
    '  channel,',
    '  recipient: contactId,',
    '  recipient_name: recipient.name,',
    '  recipient_type: recipient.resolved_type,',
    '  message: input.message,',
    '  event_type: input.event_type,',
    '  property_id: input.property_id,',
    "  property_name: recipient.property_name || '',",
    "  customer_id: input.customer_id || '',",
    '  timestamp: new Date().toISOString()',
    '};'
  ].join('\n');

  const buildDelivery = {
    parameters: { mode: "runOnceForEachItem", jsCode: buildDeliveryCode },
    id: "notifier-build",
    name: "Build Delivery",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [672, 176]
  };

  // --- Node: Route by Channel (Switch) ---
  function makeCondition(value, outputKey) {
    return {
      conditions: {
        options: { caseSensitive: false, leftValue: "", typeValidation: "loose" },
        conditions: [{
          leftValue: "={{ $json.channel }}",
          rightValue: value,
          operator: { type: "string", operation: "equals" }
        }],
        combinator: "and"
      },
      renameOutput: true,
      outputKey
    };
  }

  const routeChannel = {
    parameters: {
      rules: {
        values: [
          makeCondition("telegram", "telegram"),
          makeCondition("whatsapp", "whatsapp"),
          makeCondition("sms", "sms")
        ]
      },
      options: { fallbackOutput: "extra" } // skip/unknown → fallback
    },
    id: "notifier-route",
    name: "Route by Channel",
    type: "n8n-nodes-base.switch",
    typeVersion: 3.2,
    position: [896, 144]
  };

  // --- Node: Send Telegram ---
  const sendTelegram = {
    parameters: {
      chatId: "={{ $('Build Delivery').item.json.recipient }}",
      text: "={{ $('Build Delivery').item.json.message }}",
      replyMarkup: "none",
      forceReply: {},
      inlineKeyboard: { rows: [] },
      replyKeyboardOptions: {},
      replyKeyboardRemove: {},
      additionalFields: { appendAttribution: false, parse_mode: "HTML" }
    },
    id: "notifier-send-telegram",
    name: "Send Telegram",
    type: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    position: [1120, -96],
    credentials: {
      telegramApi: { id: "6ltptOrFLUaZzC1C", name: "[Client] Telegram Bot" }
    }
  };

  // --- Node: Log Telegram Result ---
  const logTelegramCode = [
    "const normalized = $('Build Delivery').item.json;",
    'const result = $input.item.json;',
    'return {',
    '  success: true,',
    "  channel: 'telegram',",
    '  recipient: normalized.recipient,',
    '  recipient_name: normalized.recipient_name,',
    '  recipient_type: normalized.recipient_type,',
    '  message_id: result.message_id || result.result?.message_id,',
    '  event_type: normalized.event_type,',
    '  property_id: normalized.property_id,',
    '  customer_id: normalized.customer_id,',
    '  cost_usd: 0.00,',
    "  cost_type: 'free'",
    '};'
  ].join('\n');

  const logTelegram = {
    parameters: { mode: "runOnceForEachItem", jsCode: logTelegramCode },
    id: "notifier-log-telegram",
    name: "Log Telegram Result",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1344, -96]
  };

  // --- Node: Send WhatsApp (disabled) ---
  const sendWhatsApp = {
    parameters: {
      operation: "send",
      recipientPhoneNumber: "={{ $('Build Delivery').item.json.recipient }}",
      textBody: "={{ $('Build Delivery').item.json.message }}",
      additionalFields: {}
    },
    id: "notifier-send-whatsapp",
    name: "Send WhatsApp",
    type: "n8n-nodes-base.whatsApp",
    typeVersion: 1.1,
    position: [1120, 96],
    disabled: true
  };

  // --- Node: Log WhatsApp Cost ---
  const logWhatsAppCode = [
    "const normalized = $('Build Delivery').item.json;",
    'const result = $input.item.json;',
    'return {',
    '  success: true,',
    "  channel: 'whatsapp',",
    '  recipient: normalized.recipient,',
    '  recipient_name: normalized.recipient_name,',
    '  recipient_type: normalized.recipient_type,',
    '  message_id: result.messages?.[0]?.id || result.message_id,',
    '  event_type: normalized.event_type,',
    '  property_id: normalized.property_id,',
    '  customer_id: normalized.customer_id,',
    '  cost_usd: 0.005,',
    "  cost_type: 'twilio_whatsapp'",
    '};'
  ].join('\n');

  const logWhatsApp = {
    parameters: { mode: "runOnceForEachItem", jsCode: logWhatsAppCode },
    id: "notifier-log-whatsapp",
    name: "Log WhatsApp Cost",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1344, 96]
  };

  // --- Node: Send SMS (disabled) ---
  const sendSMS = {
    parameters: {
      to: "={{ $('Build Delivery').item.json.recipient }}",
      message: "={{ $('Build Delivery').item.json.message }}",
      options: {}
    },
    id: "notifier-send-sms",
    name: "Send SMS",
    type: "n8n-nodes-base.twilio",
    typeVersion: 1,
    position: [1120, 384],
    credentials: {
      twilioApi: { id: "twilio-cred", name: "Twilio" }
    },
    disabled: true
  };

  // --- Node: Log SMS Cost ---
  const logSMSCode = [
    "const normalized = $('Build Delivery').item.json;",
    'const result = $input.item.json;',
    'const costUsd = result.price ? Math.abs(parseFloat(result.price)) : 0.0079;',
    'return {',
    '  success: true,',
    "  channel: 'sms',",
    '  recipient: normalized.recipient,',
    '  recipient_name: normalized.recipient_name,',
    '  recipient_type: normalized.recipient_type,',
    '  message_id: result.sid || result.message_sid,',
    '  event_type: normalized.event_type,',
    '  property_id: normalized.property_id,',
    '  customer_id: normalized.customer_id,',
    '  cost_usd: costUsd,',
    "  cost_type: 'twilio_sms'",
    '};'
  ].join('\n');

  const logSMS = {
    parameters: { mode: "runOnceForEachItem", jsCode: logSMSCode },
    id: "notifier-log-sms",
    name: "Log SMS Cost",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1344, 384]
  };

  // --- Node: Merge Results ---
  const mergeResults = {
    parameters: { mode: "combine", combineBy: "combineAll", options: {} },
    id: "notifier-merge",
    name: "Merge Results",
    type: "n8n-nodes-base.merge",
    typeVersion: 3,
    position: [1568, 96]
  };

  // --- Node: Has Messaging Cost? (IF) ---
  const hasCost = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            id: "has-cost",
            leftValue: "={{ $json.cost_usd }}",
            rightValue: 0,
            operator: { type: "number", operation: "gt" }
          },
          {
            id: "has-customer",
            leftValue: "={{ $json.customer_id }}",
            rightValue: "",
            operator: { type: "string", operation: "notEmpty" }
          }
        ],
        combinator: "and"
      },
      options: {}
    },
    id: "notifier-check-cost",
    name: "Has Messaging Cost?",
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position: [1792, 96]
  };

  // --- Node: Log Messaging Cost (Postgres) ---
  const logCost = {
    parameters: {
      operation: "executeQuery",
      query: "=SELECT * FROM log_api_usage('{{ $json.customer_id }}'::uuid, '{{ $json.channel === \"sms\" ? \"twilio\" : ($json.channel === \"whatsapp\" ? \"twilio\" : \"telegram\") }}', '{{ $json.channel }}', 'send_notification', 0::int, 0::int, {{ $json.cost_usd }}::decimal, 'SUB: Owner & Staff Notifier', '{{ $json.event_type }}', '{{ $execution.id }}')",
      options: {}
    },
    id: "notifier-log-cost",
    name: "Log Messaging Cost",
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [2016, -48],
    credentials: {
      postgres: { id: "BWlLUMKn64aZsHi8", name: "[Client] PostgreSQL" }
    }
  };

  // --- Node: Format Response ---
  const formatResponseCode = [
    '// Format final response for the calling workflow',
    'const input = $input.item.json;',
    'return {',
    '  success: input.success !== false,',
    "  channel: input.channel || 'unknown',",
    '  recipient: input.recipient || null,',
    '  recipient_name: input.recipient_name || null,',
    '  recipient_type: input.recipient_type || null,',
    '  event_type: input.event_type || null,',
    '  property_id: input.property_id || null,',
    '  messageId: input.message_id || null,',
    '  cost_tracked: (input.cost_usd || 0) > 0,',
    '  timestamp: new Date().toISOString()',
    '};'
  ].join('\n');

  const formatResponse = {
    parameters: { mode: "runOnceForEachItem", jsCode: formatResponseCode },
    id: "notifier-response",
    name: "Format Response",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [2240, 176]
  };

  // --- Assemble ---
  const nodes = [
    trigger, normalizeInput, resolveRecipients, buildDelivery,
    routeChannel,
    sendTelegram, logTelegram,
    sendWhatsApp, logWhatsApp,
    sendSMS, logSMS,
    mergeResults, hasCost, logCost, formatResponse
  ];

  const connections = {
    "When Executed by Another Workflow": {
      main: [[{ node: "Normalize Input", type: "main", index: 0 }]]
    },
    "Normalize Input": {
      main: [[{ node: "Resolve Recipients", type: "main", index: 0 }]]
    },
    "Resolve Recipients": {
      main: [[{ node: "Build Delivery", type: "main", index: 0 }]]
    },
    "Build Delivery": {
      main: [[{ node: "Route by Channel", type: "main", index: 0 }]]
    },
    "Route by Channel": {
      main: [
        [{ node: "Send Telegram", type: "main", index: 0 }],
        [{ node: "Send WhatsApp", type: "main", index: 0 }],
        [{ node: "Send SMS", type: "main", index: 0 }],
        [{ node: "Format Response", type: "main", index: 0 }] // fallback/skip
      ]
    },
    "Send Telegram": {
      main: [[{ node: "Log Telegram Result", type: "main", index: 0 }]]
    },
    "Log Telegram Result": {
      main: [[{ node: "Merge Results", type: "main", index: 0 }]]
    },
    "Send WhatsApp": {
      main: [[{ node: "Log WhatsApp Cost", type: "main", index: 0 }]]
    },
    "Log WhatsApp Cost": {
      main: [[{ node: "Merge Results", type: "main", index: 0 }]]
    },
    "Send SMS": {
      main: [[{ node: "Log SMS Cost", type: "main", index: 0 }]]
    },
    "Log SMS Cost": {
      main: [[{ node: "Merge Results", type: "main", index: 0 }]]
    },
    "Merge Results": {
      main: [[{ node: "Has Messaging Cost?", type: "main", index: 0 }]]
    },
    "Has Messaging Cost?": {
      main: [
        [{ node: "Log Messaging Cost", type: "main", index: 0 }],  // true → log cost
        [{ node: "Format Response", type: "main", index: 0 }]       // false → skip to response
      ]
    },
    "Log Messaging Cost": {
      main: [[{ node: "Format Response", type: "main", index: 0 }]]
    }
  };

  return {
    name: "SUB: Owner & Staff Notifier",
    nodes,
    connections,
    settings: {
      executionOrder: "v1",
      callerPolicy: "workflowsFromSameOwner",
      availableInMCP: false
    },
    staticData: null
  };
}

// ============================================================
// Main Deployment
// ============================================================

async function main() {
  console.log('========================================');
  console.log(' DEPLOY: SUB Owner & Staff Notifier');
  console.log('========================================\n');

  // ============================================
  // PART 1: Create SUB Notifier workflow
  // ============================================
  console.log('--- Part 1: Create SUB: Owner & Staff Notifier ---\n');

  const notifierDef = buildNotifierWorkflow();
  console.log('Workflow definition: ' + notifierDef.nodes.length + ' nodes');

  const createRes = await apiCall('POST', '/api/v1/workflows', notifierDef);
  if (createRes.status !== 200 && createRes.status !== 201) {
    console.log('ERROR creating workflow: ' + createRes.status);
    console.log(JSON.stringify(createRes.data).substring(0, 500));
    return;
  }

  const notifierId = createRes.data.id;
  console.log('Created: ID = ' + notifierId);
  console.log('Name: ' + createRes.data.name);

  await sleep(1500);
  const activateRes = await apiCall('POST', '/api/v1/workflows/' + notifierId + '/activate');
  if (activateRes.status === 200) {
    console.log('Activated successfully');
  } else {
    console.log('WARNING: Activation returned ' + activateRes.status);
  }

  // Add tags: "Client" + "Sub-Workflow"
  await sleep(500);
  await apiCall('PUT', '/api/v1/workflows/' + notifierId, {
    ...notifierDef,
    tags: [
      { id: "OKLSzMJzAZ0oQPQn", name: "Client" },
      { id: "S1No1aOoGQFCywsd", name: "Sub-Workflow" }
    ]
  });
  console.log('Tagged: Client, Sub-Workflow');

  // Save local copy
  const localPath = path.join(__dirname, '..', 'ergovia-lite', 'workflows', 'SUB_Owner_Staff_Notifier.json');
  const fullWorkflow = { ...createRes.data };
  fs.writeFileSync(localPath, JSON.stringify(fullWorkflow, null, 2));
  console.log('Saved local copy: ergovia-lite/workflows/SUB_Owner_Staff_Notifier.json');

  // ============================================
  // PART 2: Update WF5 to use the new SUB Notifier
  // ============================================
  console.log('\n--- Part 2: Update WF5 to use SUB Notifier ---\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5: ' + wf5.name + ' (' + wf5.nodes.length + ' nodes)');

  // 2a. Remove "Get Owner Contact" node (SUB Notifier handles this now)
  const beforeCount = wf5.nodes.length;
  wf5.nodes = wf5.nodes.filter(n => n.id !== 'get-owner-contact' && n.name !== 'Get Owner Contact');
  console.log('Removed "Get Owner Contact" node (' + beforeCount + ' → ' + wf5.nodes.length + ' nodes)');

  // 2b. Simplify "Build Notification" — only builds message, no owner lookup
  const buildNotif = wf5.nodes.find(n => n.id === 'build-notification' || n.name === 'Build Notification');
  if (buildNotif) {
    buildNotif.position = [1200, 160];
    buildNotif.parameters.jsCode = [
      '// Build notification message for owner (SUB Notifier resolves contact info)',
      "const normalizeData = $('Normalize Input').item.json;",
      'const opType = normalizeData.type;',
      '',
      '// Get the operation result from whichever operation node ran',
      'let operationResult = {};',
      'try {',
      "  if (opType === 'maintenance') operationResult = $('AI Maintenance Handler').item.json;",
      "  else if (opType === 'cleaning') operationResult = $('Schedule Cleaning').item.json;",
      "  else if (opType === 'vendor_update') operationResult = $('Update Ticket Status').item.json;",
      '} catch(e) { operationResult = {}; }',
      '',
      '// Build human-readable notification message',
      "let message = '';",
      "if (opType === 'maintenance') {",
      '  const aiOutput = operationResult.output || operationResult.text || JSON.stringify(operationResult).substring(0, 200);',
      "  message = '\\u{1F527} Maintenance alert: ' + aiOutput;",
      "} else if (opType === 'cleaning') {",
      "  const date = operationResult.scheduled_date || new Date().toISOString().split('T')[0];",
      "  const time = operationResult.scheduled_time || '14:00';",
      "  message = '\\u{1F9F9} Cleaning scheduled for ' + date + ' at ' + time;",
      "} else if (opType === 'vendor_update') {",
      "  const ticketId = operationResult.ticket_id || normalizeData.ticket_id || 'N/A';",
      "  const newStatus = operationResult.status || 'updated';",
      "  message = '\\u{1F4CB} Ticket ' + ticketId + ': status changed to ' + newStatus;",
      '}',
      '',
      '// Output for SUB Notifier + pass through operation result for Return Result',
      'return {',
      "  property_id: normalizeData.property_id || '',",
      '  event_type: opType,',
      '  message: message,',
      "  notify: 'owner',",
      "  recipient_id: '',",
      "  customer_id: normalizeData.customer_id || '',",
      '  _operation_result: operationResult',
      '};'
    ].join('\n');
    console.log('Updated "Build Notification" — message-only (no owner lookup)');
  } else {
    console.log('WARNING: Build Notification node not found');
  }

  // 2c. Update "Send Notification" to call SUB Notifier
  const sendNotif = wf5.nodes.find(n => n.id === 'send-notification' || n.name === 'Send Notification');
  if (sendNotif) {
    sendNotif.position = [1400, 160];
    sendNotif.continueOnFail = true;

    // Point to new SUB Notifier workflow
    sendNotif.parameters.workflowId = {
      __rl: true,
      mode: "list",
      value: notifierId,
      cachedResultName: "SUB: Owner & Staff Notifier",
      cachedResultUrl: "/workflow/" + notifierId
    };

    // Update workflowInputs to the 6-field schema
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

    console.log('Updated "Send Notification" → calls SUB Notifier (ID: ' + notifierId + ')');
    console.log('  workflowInputs: property_id, event_type, message, notify, recipient_id, customer_id');
  } else {
    console.log('WARNING: Send Notification node not found');
  }

  // 2d. Update Return Result position
  const returnResult = wf5.nodes.find(n => n.id === 'return-result' || n.name === 'Return Result');
  if (returnResult) {
    returnResult.position = [1600, 400];
    // Keep the existing code that extracts _operation_result
    console.log('Updated "Return Result" position to [1600, 400]');
  }

  // 2e. Rebuild WF5 connections (remove Get Owner Contact from chain)
  wf5.connections = {
    "When Called by Other Workflow": {
      main: [[{ node: "Normalize Input", type: "main", index: 0 }]]
    },
    "Callback Handler": {
      main: [[{ node: "Normalize Input", type: "main", index: 0 }]]
    },
    "Normalize Input": {
      main: [[{ node: "Route Operation", type: "main", index: 0 }]]
    },
    "Route Operation": {
      main: [
        [{ node: "AI Maintenance Handler", type: "main", index: 0 }],
        [{ node: "Get Today's Checkouts", type: "main", index: 0 }],
        [{ node: "Update Ticket Status", type: "main", index: 0 }],
        [{ node: "Get Property Details", type: "main", index: 0 }]
      ]
    },
    "Maintenance Model": {
      ai_languageModel: [[{ node: "AI Maintenance Handler", type: "ai_languageModel", index: 0 }]]
    },
    "Create Ticket Tool": {
      ai_tool: [[{ node: "AI Maintenance Handler", type: "ai_tool", index: 0 }]]
    },
    "Get Today's Checkouts": {
      main: [[{ node: "Schedule Cleaning", type: "main", index: 0 }]]
    },
    // Operations → Build Notification (no more Get Owner Contact in between)
    "AI Maintenance Handler": {
      main: [[{ node: "Build Notification", type: "main", index: 0 }]]
    },
    "Schedule Cleaning": {
      main: [[{ node: "Build Notification", type: "main", index: 0 }]]
    },
    "Update Ticket Status": {
      main: [[{ node: "Build Notification", type: "main", index: 0 }]]
    },
    // Notification chain
    "Build Notification": {
      main: [[{ node: "Send Notification", type: "main", index: 0 }]]
    },
    "Send Notification": {
      main: [[{ node: "Return Result", type: "main", index: 0 }]]
    },
    // Property details → Return Result (no notification)
    "Get Property Details": {
      main: [[{ node: "Return Result", type: "main", index: 0 }]]
    }
  };

  console.log('Rebuilt WF5 connections (removed Get Owner Contact from chain)');

  // 2f. Deploy WF5
  console.log('\nDeploying WF5...');
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/deactivate');
  await sleep(1500);

  const wf5Res = await apiCall('PUT', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX', {
    name: wf5.name, nodes: wf5.nodes, connections: wf5.connections,
    settings: wf5.settings, staticData: wf5.staticData
  });

  if (wf5Res.status !== 200) {
    console.log('ERROR deploying WF5: ' + wf5Res.status);
    console.log(JSON.stringify(wf5Res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
    return;
  }

  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
  console.log('WF5 deployed & activated');

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n========================================');
  console.log(' DEPLOYMENT COMPLETE');
  console.log('========================================\n');

  console.log('NEW WORKFLOW: SUB: Owner & Staff Notifier');
  console.log('  ID: ' + notifierId);
  console.log('  URL: https://n8n.ergovia-ai.com/workflow/' + notifierId);
  console.log('  Nodes: ' + notifierDef.nodes.length);
  console.log('  Status: Active');
  console.log('');
  console.log('  Inputs:');
  console.log('    property_id  — which property (required)');
  console.log('    event_type   — maintenance, cleaning, vendor_update, etc.');
  console.log('    message      — notification text (required)');
  console.log('    notify       — "owner" (default), "cleaner", "vendor", "all"');
  console.log('    recipient_id — specific cleaner_id/vendor_id (for cleaner/vendor)');
  console.log('    customer_id  — for cost tracking');
  console.log('');
  console.log('  Resolves contacts from DB:');
  console.log('    owner   → property_configurations (owner_telegram, owner_phone)');
  console.log('    cleaner → cleaners table (telegram_id, phone)');
  console.log('    vendor  → vendors table (telegram_id, phone)');
  console.log('');
  console.log('  Channels: Telegram (active), WhatsApp (disabled), SMS (disabled)');
  console.log('  Cost tracking: logs to api_usage_logs for WhatsApp/SMS');
  console.log('');
  console.log('UPDATED: WF5 Property Operations');
  console.log('  Removed: Get Owner Contact (Postgres) — SUB Notifier handles this');
  console.log('  Updated: Build Notification — message-only, no owner lookup');
  console.log('  Updated: Send Notification → calls SUB Notifier (ID: ' + notifierId + ')');
  console.log('');
  console.log('  New WF5 flow:');
  console.log('    [maintenance/cleaning/vendor] → Build Notification → Send Notification → Return Result');
  console.log('    [property_details]            → Get Property Details → Return Result');
  console.log('');
  console.log('NEXT STEPS:');
  console.log('  Migrate WF6 (Daily Automations) to use SUB Notifier for owner briefings');
  console.log('  Migrate WF2 (Offer Conflict Manager) for owner decision notifications');
  console.log('  Migrate WF4/WF8 for payment/security alerts');
}

main().catch(console.error);

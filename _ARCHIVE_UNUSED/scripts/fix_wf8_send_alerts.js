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
  console.log('=== FIX: WF8 Send Alerts — paired item data error ===\n');

  const { data: wf8 } = await apiCall('GET', '/api/v1/workflows/mLm2HaIRzNfIX5uh');
  console.log('Downloaded WF8: ' + wf8.nodes.length + ' nodes');

  // Dump current state
  console.log('\nAll nodes:');
  wf8.nodes.forEach(n => console.log('  - ' + n.name + ' (' + n.type.split('.').pop() + ')'));

  // ============================================
  // FIX 1: Analyze Watchdog Results — return proper items WITH pairedItem + include SUB fields
  // ============================================
  console.log('\n--- FIX 1: Analyze Watchdog Results — proper return format ---');
  const analyzeNode = wf8.nodes.find(n => n.name === 'Analyze Watchdog Results');
  if (analyzeNode) {
    analyzeNode.parameters.jsCode = `// Analyze watchdog results and generate alerts
const checks = $input.all().map(i => i.json);
const alerts = [];

for (const check of checks) {
  const count = parseInt(check.count || 0);
  if (count > 0) {
    alerts.push({
      type: check.check_type,
      count: count,
      severity: (check.check_type || '').includes('maintenance') ? 'high' : 'medium',
      message: count + ' ' + (check.check_type || 'issue').replace(/_/g, ' ') + ' detected'
    });
  }
}

const totalIssues = alerts.reduce((sum, a) => sum + a.count, 0);

// Build alert message for notification
let alertMessage = '';
if (alerts.length === 0) {
  alertMessage = 'Watchdog: All systems healthy. No issues detected.';
} else {
  alertMessage = 'Watchdog Alert — ' + totalIssues + ' issue(s) found:\\n\\n';
  for (const a of alerts) {
    const marker = a.severity === 'high' ? '[HIGH]' : '[WARN]';
    alertMessage += marker + ' ' + a.message + '\\n';
  }
  alertMessage += '\\nReview your dashboard for details.';
}

// Return with ALL fields Send Alerts needs (so it can use $json only)
return [{
  json: {
    total_issues: Number(totalIssues),
    alerts: alerts,
    alert_count: Number(alerts.length),
    alert_message: alertMessage,
    check_time: new Date().toISOString(),
    status: totalIssues > 0 ? 'issues_found' : 'all_clear',
    severity: alerts.some(a => a.severity === 'high') ? 'high' : 'medium',
    // Include fields for Send Alerts (SUB) — watchdog has no specific recipient
    channel: 'telegram',
    sender_id: '',
    customer_id: ''
  },
  pairedItem: { item: 0 }
}];`;

    console.log('  Returns [{json: {...}, pairedItem: {item: 0}}] format');
    console.log('  Includes channel/sender_id/customer_id for Send Alerts');
  }

  // ============================================
  // FIX 2: Send Alerts — use ONLY $json (no cross-node references)
  // ============================================
  console.log('\n--- FIX 2: Send Alerts — use $json only ---');
  const sendNode = wf8.nodes.find(n => n.name === 'Send Alerts');
  if (sendNode) {
    console.log('  Current inputs: ' + JSON.stringify(sendNode.parameters.workflowInputs?.value || {}));

    sendNode.parameters.workflowInputs = {
      mappingMode: "defineBelow",
      value: {
        channel: "={{ $json.channel || 'telegram' }}",
        sender_id: "={{ $json.sender_id || $json.recipient_id || '' }}",
        input: "={{ $json.alert_message || $json.message || 'System alert' }}",
        customer_id: "={{ $json.customer_id || '' }}"
      },
      matchingColumns: [],
      schema: [
        { id: "channel", displayName: "channel", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
        { id: "sender_id", displayName: "sender_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
        { id: "input", displayName: "input", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
        { id: "customer_id", displayName: "customer_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: true
    };

    console.log('  FIXED: Uses only $json.* (no $("Node Name") cross-references)');
    console.log('  Avoids paired item data errors completely');
  }

  // ============================================
  // FIX 3: Normalize Event — include SUB fields in output for all paths
  // ============================================
  console.log('\n--- FIX 3: Normalize Event — include SUB fields ---');
  const normalizeNode = wf8.nodes.find(n => n.name === 'Normalize Event');
  if (normalizeNode) {
    normalizeNode.parameters.jsCode = `// Normalize input from WF1 tool call, watchdog trigger, or webhook
const input = $input.item.json;

let event = {
  event_type: 'unknown',
  // Fields for Send Alerts (SUB) — every path must include these
  channel: 'telegram',
  sender_id: '',
  customer_id: '',
  // Event data
  property_id: null,
  owner_telegram: null,
  data: {},
  message: ''
};

// Emergency — from WF1 tool call
if (input.event_type === 'emergency' || input.category === 'EMERGENCY') {
  event.event_type = 'emergency';
  event.channel = input.channel || 'telegram';
  event.sender_id = input.sender_id || '';
  event.customer_id = input.customer_id || '';
  event.property_id = input.property_id;
  event.message = input.message_text || input.issue_description || '';
  event.data = {
    message: event.message,
    sender_id: input.sender_id,
    channel: input.channel,
    property_id: input.property_id,
    guest_name: input.sender_name || input.guest_name || 'Guest'
  };
}
// Screening — from WF1 or booking flow
else if (input.event_type === 'screening' || input.guest_email || input.booking_id) {
  event.event_type = 'screening';
  event.channel = input.channel || 'system';
  event.sender_id = input.sender_id || '';
  event.customer_id = input.customer_id || '';
  event.property_id = input.property_id;
  event.data = {
    guest_name: input.guest_name || '',
    guest_email: input.guest_email || '',
    guest_phone: input.guest_phone || '',
    booking_id: input.booking_id || '',
    check_in_date: input.check_in_date || '',
    property_id: input.property_id || ''
  };
}
// Watchdog — scheduled system check (no specific recipient)
else {
  event.event_type = 'watchdog';
  event.channel = 'system';
  event.sender_id = '';
  event.customer_id = '';
  event.data = { triggered_at: new Date().toISOString() };
}

return event;`;
    console.log('  All paths output: channel, sender_id, customer_id');
  }

  // ============================================
  // FIX 4: Return Result — also use $json only
  // ============================================
  console.log('\n--- FIX 4: Return Result — safe references ---');
  const returnNode = wf8.nodes.find(n => n.name === 'Return Result');
  if (returnNode) {
    returnNode.parameters.jsCode = `// Return clear result to WF1 AI Agent
// Use $input.item.json (previous node) — avoid cross-node $('Name') references
const result = $input.item.json;

const response = {
  success: true,
  event_type: result.event_type || 'unknown',
  timestamp: new Date().toISOString()
};

if (result.event_type === 'emergency' || result.emergency_type) {
  response.emergency_type = result.emergency_type || 'unknown';
  response.severity = result.severity || 'high';
  response.message = 'Emergency reported and logged. ';
  if (result.emergency_type) {
    response.message += 'Type: ' + result.emergency_type + ', Severity: ' + result.severity + '. ';
  }
  response.message += 'The property owner has been notified. If life-threatening, call emergency services (911) immediately.';
} else if (result.event_type === 'screening' || result.screening_result) {
  response.screening_result = result.screening_result || result.decision || 'PENDING';
  response.risk_level = result.risk_level || 'unknown';
  response.flags = result.flags || [];
  response.message = 'Guest screening complete. Result: ' + response.screening_result + ', Risk: ' + response.risk_level + '.';
} else if (result.event_type === 'watchdog' || result.total_issues !== undefined) {
  response.total_issues = Number(result.total_issues || 0);
  response.alerts = result.alerts || [];
  response.message = result.alert_message || 'Watchdog check complete — ' + response.total_issues + ' issue(s).';
} else {
  response.message = 'Event processed.';
  response.data = result;
}

return response;`;
    console.log('  Uses $input.item.json only — no cross-node references');
  }

  // ============================================
  // FIX 5: Has Issues? — ensure looseTypeValidation
  // ============================================
  console.log('\n--- FIX 5: Has Issues? — type validation ---');
  const hasIssuesNode = wf8.nodes.find(n => n.name === 'Has Issues?');
  if (hasIssuesNode) {
    if (!hasIssuesNode.parameters.options) {
      hasIssuesNode.parameters.options = {};
    }
    hasIssuesNode.parameters.options.looseTypeValidation = true;
    console.log('  looseTypeValidation enabled');
  }

  // ============================================
  // Deploy
  // ============================================
  console.log('\n\nDeploying WF8...');
  await apiCall('POST', '/api/v1/workflows/mLm2HaIRzNfIX5uh/deactivate');
  await sleep(2000);
  const res = await apiCall('PUT', '/api/v1/workflows/mLm2HaIRzNfIX5uh', {
    name: wf8.name, nodes: wf8.nodes, connections: wf8.connections,
    settings: wf8.settings, staticData: wf8.staticData
  });
  console.log('Deploy status: ' + res.status);
  if (res.status !== 200) {
    console.log('ERROR: ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/mLm2HaIRzNfIX5uh/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/mLm2HaIRzNfIX5uh/activate');
  console.log('WF8 DEPLOYED & ACTIVATED');

  console.log('\n=== SUMMARY ===');
  console.log('ROOT CAUSE: Code nodes return plain objects without pairedItem metadata.');
  console.log('When Send Alerts uses $("Normalize Event").item.json, n8n can\'t trace');
  console.log('the item lineage through Code nodes → "paired item data unavailable".');
  console.log('');
  console.log('FIX: All nodes now use $json or $input.item.json only (no cross-node refs).');
  console.log('Each node includes ALL fields the next node needs in its output.');
  console.log('');
  console.log('Changes:');
  console.log('  1. Analyze Watchdog: returns [{json:{...}, pairedItem:{item:0}}] + SUB fields');
  console.log('  2. Send Alerts: uses $json.channel, $json.sender_id, $json.input only');
  console.log('  3. Normalize Event: includes channel/sender_id/customer_id in ALL paths');
  console.log('  4. Return Result: uses $input.item.json only');
  console.log('  5. Has Issues?: looseTypeValidation enabled');
}

main().catch(console.error);

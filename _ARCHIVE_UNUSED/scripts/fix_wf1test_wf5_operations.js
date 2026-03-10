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
  console.log('=== FIX: TEST WF1 + WF5 Property Operations ===\n');

  // ============================================
  // PART 1: Fix TEST WF1 — add operation_type to Property Operations Tool
  // ============================================
  console.log('PART 1: Fix TEST WF1 Property Operations Tool\n');

  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/VuCX2W6ifXmjmEgj');
  console.log('  Downloaded: ' + wf1.name + ' (' + wf1.nodes.length + ' nodes)');

  const propTool = wf1.nodes.find(n => n.name === 'Property Operations Tool');
  console.log('  Found: Property Operations Tool');
  console.log('  Old inputs:', Object.keys(propTool.parameters.workflowInputs?.value || {}).join(', '));

  // Add operation_type via $fromAI and update description
  propTool.parameters.description = "Handle property operations: maintenance reports, issue tracking, cleaning requests, vendor coordination. Use when a guest reports a problem or needs operational support. You MUST classify the operation_type: 'maintenance' for broken/damaged items, AC, plumbing, electrical issues; 'cleaning' for cleaning requests, towels, sheets, dirty rooms; 'property_details' for property info, amenities, rules, check-in instructions. Returns ticket numbers, issue categories, and resolution info.";

  propTool.parameters.workflowInputs = {
    mappingMode: "defineBelow",
    value: {
      operation_type: "={{ $fromAI('operation_type', 'The type of operation. Must be one of: maintenance, cleaning, property_details. Use maintenance for broken/damaged items, AC, plumbing, electrical. Use cleaning for cleaning requests, towels, sheets. Use property_details for property info questions.', 'string', 'maintenance') }}",
      issue_description: "={{ $fromAI('issue_description', 'Description of the maintenance issue or operational request') }}",
      property_id: "={{ $fromAI('property_id', 'The property ID where the issue is') }}",
      sender_id: "={{ $('Merge Customer ID').item.json.sender_id }}",
      channel: "={{ $('Merge Customer ID').item.json.channel }}",
      customer_id: "={{ $('Merge Customer ID').item.json.customer_id }}"
    },
    matchingColumns: [],
    schema: [
      { id: "operation_type", displayName: "operation_type", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "issue_description", displayName: "issue_description", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "property_id", displayName: "property_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "sender_id", displayName: "sender_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "channel", displayName: "channel", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" },
      { id: "customer_id", displayName: "customer_id", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }
    ],
    attemptToConvertTypes: false,
    convertFieldsToString: true
  };

  console.log('  NEW inputs: operation_type, issue_description, property_id, sender_id, channel, customer_id');
  console.log('  AI Agent will classify: maintenance | cleaning | property_details');

  // Deploy TEST WF1
  console.log('\n  Deploying TEST WF1...');
  await apiCall('POST', '/api/v1/workflows/VuCX2W6ifXmjmEgj/deactivate');
  await sleep(1500);
  let res = await apiCall('PUT', '/api/v1/workflows/VuCX2W6ifXmjmEgj', {
    name: wf1.name, nodes: wf1.nodes, connections: wf1.connections,
    settings: wf1.settings, staticData: wf1.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 300));
    await apiCall('POST', '/api/v1/workflows/VuCX2W6ifXmjmEgj/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/VuCX2W6ifXmjmEgj/activate');
  console.log('  TEST WF1 DEPLOYED & ACTIVATED');

  // ============================================
  // PART 2: Fix WF5 — trigger schema + Normalize Input
  // ============================================
  console.log('\n\nPART 2: Fix WF5 Property Operations\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('  Downloaded: ' + wf5.name + ' (' + wf5.nodes.length + ' nodes)');

  // Fix trigger schema
  const trigger = wf5.nodes.find(n => n.type.includes('executeWorkflowTrigger'));
  console.log('\n  Fixing trigger schema...');
  trigger.parameters.jsonExample = JSON.stringify({
    operation_type: "maintenance",
    issue_description: "AC not working in the bedroom",
    property_id: "PROP-001",
    sender_id: "123456789",
    channel: "telegram",
    customer_id: "uuid-here"
  }, null, 2);
  console.log('  Added: operation_type, issue_description to trigger schema');

  // Fix Normalize Input
  const normNode = wf5.nodes.find(n => n.name === 'Normalize Input');
  console.log('\n  Fixing Normalize Input...');

  normNode.parameters.jsCode = `// Normalize input from WF1 tool call, webhook, or callback
const input = $input.item.json;

let operation = {
  type: 'unknown',
  property_id: null,
  ticket_id: null,
  vendor_id: null,
  action: null,
  data: {}
};

// === PRIMARY: WF1 tool call with operation_type ===
if (input.operation_type) {
  operation.type = input.operation_type;
  operation.property_id = input.property_id;
  operation.data = {
    issue_description: input.issue_description || '',
    message: input.issue_description || input.message_text || '',
    sender_id: input.sender_id,
    channel: input.channel,
    customer_id: input.customer_id
  };
}
// From routed message (maintenance report, owner action)
else if (input.category) {
  operation.type = input.category === 'MAINTENANCE_REPORT' ? 'maintenance' : 'owner_action';
  operation.property_id = input.property_id;
  operation.data = {
    message: input.message_text,
    sender_id: input.sender_id,
    channel: input.channel
  };
}
// Legacy direct API call with operation field
else if (input.operation) {
  operation.type = input.operation;
  operation.property_id = input.property_id;
  operation.data = {
    issue_description: input.issue_description || '',
    sender_id: input.sender_id,
    channel: input.channel
  };
}
// Telegram callback
else if (input.callback_query) {
  const callbackData = input.callback_query.data || '';
  const parts = callbackData.split('_');
  operation.type = parts[0];
  operation.ticket_id = parts[1];
  operation.action = parts[2] || 'confirm';
  operation.data.callback_from = input.callback_query.from;
}
// Vendor status update
else if (input.ticket_id || input.status) {
  operation.type = 'vendor_update';
  operation.ticket_id = input.ticket_id;
  operation.data = {
    status: input.status,
    notes: input.notes,
    photos: input.photos
  };
}
// Cleaning completion report
else if (input.cleaning_id || input.schedule_id) {
  operation.type = 'cleaning_complete';
  operation.property_id = input.property_id;
  operation.data = {
    schedule_id: input.schedule_id || input.cleaning_id,
    notes: input.notes || '',
    issues: input.issues || [],
    completed_by: input.completed_by || input.cleaner_id
  };
}
// Task digest request
else if (input.request_type === 'task_digest') {
  operation.type = 'task_digest';
  operation.property_id = input.property_id;
}
// FALLBACK: if issue_description exists but no type, default to maintenance
else if (input.issue_description) {
  operation.type = 'maintenance';
  operation.property_id = input.property_id;
  operation.data = {
    issue_description: input.issue_description,
    message: input.issue_description,
    sender_id: input.sender_id,
    channel: input.channel,
    customer_id: input.customer_id
  };
}

return operation;`;

  console.log('  Updated Normalize Input:');
  console.log('    1. Primary: reads operation_type from WF1 tool call');
  console.log('    2. Passes issue_description + sender_id + channel in data');
  console.log('    3. Fallback: if issue_description exists but no type → maintenance');

  // Deploy WF5
  console.log('\n  Deploying WF5...');
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/deactivate');
  await sleep(1500);
  res = await apiCall('PUT', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX', {
    name: wf5.name, nodes: wf5.nodes, connections: wf5.connections,
    settings: wf5.settings, staticData: wf5.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
  console.log('  WF5 DEPLOYED & ACTIVATED');

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n=== FIX SUMMARY ===');
  console.log('');
  console.log('TEST WF1 (VuCX2W6ifXmjmEgj):');
  console.log('  Property Operations Tool now sends operation_type via $fromAI()');
  console.log('  AI Agent classifies: maintenance | cleaning | property_details');
  console.log('  Description guides the AI on which type to pick');
  console.log('');
  console.log('WF5 (JWEu9Uz2JJ5XZeIX):');
  console.log('  Trigger schema: added operation_type + issue_description');
  console.log('  Normalize Input: WF1 tool call is now PRIMARY path');
  console.log('  Passes issue_description, sender_id, channel into data object');
  console.log('  Fallback: issue_description with no type → defaults to maintenance');
  console.log('');
  console.log('Flow: Guest says "AC is broken"');
  console.log('  → TEST WF1 Agent: operation_type=maintenance, issue_description="AC is broken"');
  console.log('  → WF5 Normalize: type=maintenance');
  console.log('  → Route Operation: maintenance → AI Maintenance Handler → ticket → result');
  console.log('');
  console.log('NOTE: OG WF1 (LP7YknAVPiQsidWq) was NOT modified');
}

main().catch(console.error);

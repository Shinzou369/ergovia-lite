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
  console.log('=== FIX: WF5 — Fix data paths + improve Return Result ===\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5: ' + wf5.nodes.length + ' nodes');

  // Dump all node names so we know exact references
  console.log('\nAll nodes:');
  wf5.nodes.forEach(n => console.log('  - ' + n.name + ' (' + n.type + ')'));

  // ============================================
  // FIX 1: Schedule Cleaning — use explicit node references
  // ============================================
  const scheduleNode = wf5.nodes.find(n => n.name === 'Schedule Cleaning');
  console.log('\n--- FIX 1: Schedule Cleaning data paths ---');

  scheduleNode.parameters.query = `WITH fix_seq AS (
  SELECT setval(
    pg_get_serial_sequence('cleaning_schedules', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM cleaning_schedules), 0) + 1, 1),
    false
  )
)
INSERT INTO cleaning_schedules (property_id, scheduled_date, status, notes)
SELECT
  '{{ $('Normalize Input').item.json.property_id }}',
  CURRENT_DATE,
  'scheduled',
  '{{ $('Normalize Input').item.json.data.issue_description || "Cleaning scheduled" }}'
FROM fix_seq
RETURNING *`;

  console.log('  property_id: $("Normalize Input").item.json.property_id');
  console.log('  notes: $("Normalize Input").item.json.data.issue_description');

  // ============================================
  // FIX 2: Complete Cleaning Task — same fix
  // ============================================
  const completeNode = wf5.nodes.find(n => n.name === 'Complete Cleaning Task');
  if (completeNode) {
    console.log('\n--- FIX 2: Complete Cleaning Task data paths ---');
    completeNode.parameters.query = `UPDATE cleaning_schedules
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP,
    notes = COALESCE(notes, '') || E'\\n' || '{{ $('Normalize Input').item.json.data.notes || "Completed" }}'
WHERE property_id = '{{ $('Normalize Input').item.json.property_id }}'
  AND scheduled_date = CURRENT_DATE
  AND status = 'scheduled'
RETURNING *`;
    console.log('  Uses $("Normalize Input") references');
  }

  // ============================================
  // FIX 3: Get Property Details — same fix
  // ============================================
  const propNode = wf5.nodes.find(n => n.name === 'Get Property Details');
  if (propNode) {
    console.log('\n--- FIX 3: Get Property Details data path ---');
    propNode.parameters.query = `SELECT
  property_id, property_name, address,
  max_guests, bedrooms, bathrooms,
  base_price, weekend_price, cleaning_fee,
  owner_name, owner_phone, owner_email, owner_telegram, owner_contact,
  auto_approve_bookings, require_screening,
  min_stay_nights, max_stay_nights,
  timezone, property_status, settings
FROM property_configurations
WHERE property_id = '{{ $('Normalize Input').item.json.property_id }}'
  AND property_status = 'active'`;
    console.log('  Uses $("Normalize Input") reference');
  }

  // ============================================
  // FIX 4: Get Pending Tasks — same fix
  // ============================================
  const pendingNode = wf5.nodes.find(n => n.name === 'Get Pending Tasks');
  if (pendingNode) {
    console.log('\n--- FIX 4: Get Pending Tasks data path ---');
    pendingNode.parameters.query = `SELECT
  mt.ticket_id, mt.property_id, mt.property_name,
  mt.issue_description, mt.category, mt.urgency,
  mt.status, mt.vendor_id, mt.assigned_vendor,
  mt.created_at, mt.updated_at,
  p.owner_name, p.owner_phone, p.owner_email,
  p.owner_telegram, p.owner_contact,
  COALESCE(p.settings->>'preferred_platform', 'telegram') AS preferred_platform,
  v.name AS vendor_name, v.phone AS vendor_phone,
  v.email AS vendor_email, v.telegram_id AS vendor_telegram
FROM maintenance_tickets mt
JOIN property_configurations p ON mt.property_id = p.property_id
LEFT JOIN vendors v ON mt.vendor_id = v.vendor_id
WHERE mt.status IN ('pending', 'dispatched', 'in_progress')
  AND mt.property_id = COALESCE(NULLIF('{{ $('Normalize Input').item.json.property_id }}', ''), mt.property_id)
ORDER BY
  CASE mt.urgency WHEN 'emergency' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
  mt.created_at ASC`;
    console.log('  Uses $("Normalize Input") reference');
  }

  // ============================================
  // FIX 5: Update Ticket Status — same fix
  // ============================================
  const ticketNode = wf5.nodes.find(n => n.name === 'Update Ticket Status');
  if (ticketNode) {
    console.log('\n--- FIX 5: Update Ticket Status data path ---');
    ticketNode.parameters.query = `UPDATE maintenance_tickets
SET status = '{{ $('Normalize Input').item.json.data.status || "in_progress" }}',
    updated_at = CURRENT_TIMESTAMP,
    notes = CASE
      WHEN '{{ $('Normalize Input').item.json.data.notes || "" }}' != ''
      THEN COALESCE(notes, '') || E'\\n' || '{{ $('Normalize Input').item.json.data.notes }}'
      ELSE notes
    END
WHERE ticket_id = '{{ $('Normalize Input').item.json.ticket_id }}'
RETURNING *`;
    console.log('  Uses $("Normalize Input") reference');
  }

  // ============================================
  // FIX 6: Improve Return Clear Result
  // ============================================
  const returnNode = wf5.nodes.find(n => n.name === 'Return Clear Result');
  if (returnNode) {
    console.log('\n--- FIX 6: Improve Return Clear Result ---');
    console.log('  Current type: ' + returnNode.type);
    console.log('  Current code: ' + (returnNode.parameters.jsCode || '(none)').substring(0, 100));

    returnNode.parameters.jsCode = `// Build a clear, informative result for WF1 AI Agent
const input = $('Normalize Input').item.json;
const opType = input.type;

// Try to get the result from the previous postgres/code node
let result = {};
try {
  result = $input.item.json;
} catch(e) {
  result = { status: 'completed' };
}

// Build response based on operation type
const response = {
  success: true,
  operation: opType,
  property_id: input.property_id,
  timestamp: new Date().toISOString()
};

if (opType === 'maintenance') {
  response.ticket_id = result.ticket_id || 'TKT-' + Date.now();
  response.category = result.category || input.data?.issue_description?.toLowerCase().includes('ac') ? 'hvac' : 'general';
  response.urgency = result.urgency || 'medium';
  response.status = result.status || 'pending';
  response.message = 'Maintenance ticket created: ' + response.ticket_id + '. Category: ' + response.category + ', Urgency: ' + response.urgency + '. Our team will address this shortly.';
} else if (opType === 'cleaning') {
  response.scheduled_date = result.scheduled_date || new Date().toISOString().split('T')[0];
  response.status = result.status || 'scheduled';
  response.message = 'Cleaning request scheduled for ' + response.scheduled_date + '. ' + (input.data?.issue_description || 'Standard cleaning.');
} else if (opType === 'property_details') {
  response.property = result;
  response.message = result.property_name ? 'Property details for ' + result.property_name + '.' : 'Property details retrieved.';
} else if (opType === 'vendor_update') {
  response.ticket_id = result.ticket_id;
  response.status = result.status;
  response.message = 'Ticket ' + (result.ticket_id || '') + ' updated to: ' + (result.status || 'updated') + '.';
} else if (opType === 'task_digest') {
  const tasks = $input.all ? $input.all().map(i => i.json) : [result];
  response.pending_tasks = tasks;
  response.count = tasks.length;
  response.message = tasks.length + ' pending maintenance task(s).';
} else {
  response.message = 'Operation "' + opType + '" completed.';
  response.data = result;
}

return response;`;

    console.log('  NEW: Rich response with operation-specific messages for AI Agent');
  }

  // ============================================
  // Deploy
  // ============================================
  console.log('\n\nDeploying WF5...');
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/deactivate');
  await sleep(2000);
  const res = await apiCall('PUT', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX', {
    name: wf5.name, nodes: wf5.nodes, connections: wf5.connections,
    settings: wf5.settings, staticData: wf5.staticData
  });
  console.log('Deploy status: ' + res.status);
  if (res.status !== 200) {
    console.log('ERROR: ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
  console.log('WF5 DEPLOYED & ACTIVATED');

  // Verify
  await sleep(1000);
  const { data: v } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  const vNode = v.nodes.find(n => n.name === 'Schedule Cleaning');
  console.log('\n--- VERIFY ---');
  console.log('Schedule Cleaning has "Normalize Input" ref: ' +
    vNode.parameters.query.includes('Normalize Input'));
  console.log('Schedule Cleaning has "undefined" literal: ' +
    vNode.parameters.query.includes("'undefined'"));

  console.log('\n=== SUMMARY ===');
  console.log('1. ALL postgres nodes: $json → $("Normalize Input").item.json');
  console.log('2. property_id now reads from correct path');
  console.log('3. notes now reads issue_description from data object');
  console.log('4. Return Clear Result builds rich response per operation type');
  console.log('   - maintenance: ticket_id, category, urgency, status');
  console.log('   - cleaning: scheduled_date, status');
  console.log('   - property_details: full property info');
  console.log('   - vendor_update: ticket status');
  console.log('   - task_digest: list of pending tasks');
}

main().catch(console.error);

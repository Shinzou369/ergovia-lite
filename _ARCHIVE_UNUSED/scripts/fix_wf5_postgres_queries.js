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
  console.log('=== FIX: WF5 Property Operations — All PostgreSQL Queries ===\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5: ' + wf5.name + ' (' + wf5.nodes.length + ' nodes)');

  // Find all postgres nodes
  const pgNodes = wf5.nodes.filter(n => n.type && n.type.includes('postgres'));
  console.log('\nPostgreSQL nodes found: ' + pgNodes.length);
  pgNodes.forEach(n => {
    const q = n.parameters.query || '(empty)';
    console.log('  - ' + n.name + ': ' + q.substring(0, 80).replace(/\n/g, ' ') + '...');
  });

  // ============================================
  // FIX 1: Get Today's Checkouts
  // Problem: p.cleaning_vendor_id doesn't exist, v.vendor_name/vendor_phone/vendor_email wrong
  // Fix: Remove vendor join, use correct columns from property_configurations
  // ============================================
  const checkoutsNode = wf5.nodes.find(n => n.name === "Get Today's Checkouts");
  if (checkoutsNode) {
    console.log('\n--- FIX 1: Get Today\'s Checkouts ---');
    console.log('  OLD query: ' + (checkoutsNode.parameters.query || '(empty)').substring(0, 120).replace(/\n/g, ' '));

    checkoutsNode.parameters.query = `SELECT
  b.booking_id, b.guest_name, b.guest_phone, b.guest_email,
  b.property_id, b.check_in_date, b.check_out_date,
  b.booking_status, b.guests, b.total_amount, b.notes,
  p.property_name, p.address, p.owner_name, p.owner_phone,
  p.owner_email, p.owner_telegram, p.owner_contact,
  p.cleaning_fee
FROM bookings b
JOIN property_configurations p ON b.property_id = p.property_id
WHERE b.check_out_date = CURRENT_DATE
  AND b.booking_status = 'confirmed'
ORDER BY b.property_id`;

    console.log('  NEW: Removed vendor join, uses correct property_configurations columns');
    console.log('  Returns: booking details + property owner contact info');
  } else {
    console.log('\n  WARNING: "Get Today\'s Checkouts" node not found');
  }

  // ============================================
  // FIX 2: Schedule Cleaning
  // Problem: Empty query
  // Fix: INSERT into cleaning_tasks (not cleaning_schedules — that table doesn't exist)
  // ============================================
  const scheduleNode = wf5.nodes.find(n => n.name === 'Schedule Cleaning');
  if (scheduleNode) {
    console.log('\n--- FIX 2: Schedule Cleaning ---');
    console.log('  OLD query: ' + (scheduleNode.parameters.query || '(empty)'));

    scheduleNode.parameters.query = `INSERT INTO cleaning_tasks (
  task_id, property_id, property_name,
  scheduled_date, scheduled_time,
  status, task_type, notes
) VALUES (
  'CLN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6),
  '{{ $json.property_id }}',
  '{{ $json.property_name }}',
  CURRENT_DATE,
  '{{ $json.scheduled_time || "14:00" }}',
  'scheduled',
  '{{ $json.task_type || "checkout_cleaning" }}',
  '{{ $json.notes || "Auto-scheduled after guest checkout" }}'
)
RETURNING *`;

    console.log('  NEW: INSERT into cleaning_tasks table (not cleaning_schedules)');
    console.log('  Auto-generates task_id, defaults to checkout_cleaning type');
  } else {
    console.log('\n  WARNING: "Schedule Cleaning" node not found');
  }

  // ============================================
  // FIX 3: Update Ticket Status
  // Problem: Verify maintenance_tickets columns match
  // ============================================
  const ticketNode = wf5.nodes.find(n => n.name === 'Update Ticket Status');
  if (ticketNode) {
    console.log('\n--- FIX 3: Update Ticket Status ---');
    console.log('  OLD query: ' + (ticketNode.parameters.query || '(empty)').substring(0, 120).replace(/\n/g, ' '));

    ticketNode.parameters.query = `UPDATE maintenance_tickets
SET status = '{{ $json.new_status || "in_progress" }}',
    updated_at = CURRENT_TIMESTAMP,
    vendor_id = COALESCE('{{ $json.vendor_id }}', vendor_id),
    assigned_vendor = COALESCE('{{ $json.assigned_vendor }}', assigned_vendor),
    notes = CASE
      WHEN '{{ $json.notes }}' != ''
      THEN COALESCE(notes, '') || E'\\n' || '{{ $json.notes }}'
      ELSE notes
    END
WHERE ticket_id = '{{ $json.ticket_id }}'
RETURNING *`;

    console.log('  NEW: Uses correct maintenance_tickets columns');
    console.log('  Updates: status, vendor_id, assigned_vendor, notes');
  } else {
    console.log('\n  WARNING: "Update Ticket Status" node not found');
  }

  // ============================================
  // FIX 4: Get Property Details
  // Problem: Should be OK (SELECT *), but verify
  // ============================================
  const propDetailsNode = wf5.nodes.find(n => n.name === 'Get Property Details');
  if (propDetailsNode) {
    console.log('\n--- FIX 4: Get Property Details ---');
    console.log('  OLD query: ' + (propDetailsNode.parameters.query || '(empty)').substring(0, 120).replace(/\n/g, ' '));

    // Ensure it's a clean, safe query
    propDetailsNode.parameters.query = `SELECT
  property_id, property_name, address,
  max_guests, bedrooms, bathrooms,
  base_price, weekend_price, cleaning_fee,
  owner_name, owner_phone, owner_email, owner_telegram, owner_contact,
  auto_approve_bookings, require_screening,
  min_stay_nights, max_stay_nights,
  timezone, property_status, settings
FROM property_configurations
WHERE property_id = '{{ $json.property_id }}'
  AND property_status = 'active'`;

    console.log('  NEW: Explicit column list (avoids missing column errors)');
  } else {
    console.log('\n  WARNING: "Get Property Details" node not found');
  }

  // ============================================
  // FIX 5: Complete Cleaning Task
  // Problem: p.preferred_platform doesn't exist in live DB
  // Fix: Use owner_telegram or settings JSONB
  // ============================================
  const completeCleanNode = wf5.nodes.find(n => n.name === 'Complete Cleaning Task');
  if (completeCleanNode) {
    console.log('\n--- FIX 5: Complete Cleaning Task ---');
    console.log('  OLD query: ' + (completeCleanNode.parameters.query || '(empty)').substring(0, 120).replace(/\n/g, ' '));

    completeCleanNode.parameters.query = `UPDATE cleaning_tasks
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP,
    completion_notes = '{{ $json.notes || "" }}',
    actual_duration = {{ $json.actual_duration || 0 }},
    checklist_score = {{ $json.checklist_score || 0 }}
WHERE task_id = '{{ $json.task_id }}'
  OR (property_id = '{{ $json.property_id }}'
      AND scheduled_date = CURRENT_DATE
      AND status = 'scheduled')
RETURNING *,
  (SELECT owner_telegram FROM property_configurations WHERE property_id = cleaning_tasks.property_id) AS owner_telegram,
  (SELECT owner_name FROM property_configurations WHERE property_id = cleaning_tasks.property_id) AS owner_name,
  (SELECT COALESCE(settings->>'preferred_platform', 'telegram') FROM property_configurations WHERE property_id = cleaning_tasks.property_id) AS preferred_platform`;

    console.log('  NEW: Uses cleaning_tasks (not cleaning_schedules)');
    console.log('  Returns owner_telegram + preferred_platform from settings JSONB');
  } else {
    console.log('\n  WARNING: "Complete Cleaning Task" node not found');
  }

  // ============================================
  // FIX 6: Get Pending Tasks
  // Problem: p.preferred_platform doesn't exist, may reference wrong table
  // Fix: Use correct columns and table
  // ============================================
  const pendingNode = wf5.nodes.find(n => n.name === 'Get Pending Tasks');
  if (pendingNode) {
    console.log('\n--- FIX 6: Get Pending Tasks ---');
    console.log('  OLD query: ' + (pendingNode.parameters.query || '(empty)').substring(0, 120).replace(/\n/g, ' '));

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
  AND mt.property_id = COALESCE(NULLIF('{{ $json.property_id }}', ''), mt.property_id)
ORDER BY
  CASE mt.urgency
    WHEN 'emergency' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  mt.created_at ASC`;

    console.log('  NEW: Correct vendor columns (v.name, v.phone, v.email)');
    console.log('  preferred_platform from settings JSONB with fallback');
    console.log('  Orders by urgency priority');
  } else {
    console.log('\n  WARNING: "Get Pending Tasks" node not found');
  }

  // ============================================
  // Deploy WF5
  // ============================================
  console.log('\n\nDeploying WF5...');
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX', {
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
  console.log('WF5 DEPLOYED & ACTIVATED');

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n=== FIX SUMMARY ===');
  console.log('');
  console.log('Fixed 6 PostgreSQL nodes in WF5 Property Operations:');
  console.log('');
  console.log('1. Get Today\'s Checkouts:');
  console.log('   REMOVED: p.cleaning_vendor_id (doesn\'t exist)');
  console.log('   REMOVED: vendor JOIN with wrong column names');
  console.log('   ADDED: correct owner contact columns from property_configurations');
  console.log('');
  console.log('2. Schedule Cleaning:');
  console.log('   WAS: empty query');
  console.log('   NOW: INSERT INTO cleaning_tasks (correct table — "cleaning_schedules" doesn\'t exist)');
  console.log('   Auto-generates task_id, defaults to checkout_cleaning');
  console.log('');
  console.log('3. Update Ticket Status:');
  console.log('   Fixed to use correct maintenance_tickets columns');
  console.log('   Updates: status, vendor_id, assigned_vendor, notes');
  console.log('');
  console.log('4. Get Property Details:');
  console.log('   Changed from SELECT * to explicit column list');
  console.log('   Avoids errors from missing columns (property_type, amenities, etc.)');
  console.log('');
  console.log('5. Complete Cleaning Task:');
  console.log('   REMOVED: p.preferred_platform (doesn\'t exist in live DB)');
  console.log('   USES: settings JSONB for preferred_platform with \'telegram\' fallback');
  console.log('   USES: cleaning_tasks table (not cleaning_schedules)');
  console.log('');
  console.log('6. Get Pending Tasks:');
  console.log('   FIXED: v.vendor_name → v.name, v.vendor_phone → v.phone, v.vendor_email → v.email');
  console.log('   FIXED: p.preferred_platform → settings JSONB with fallback');
  console.log('   Added urgency-based ordering');
  console.log('');
  console.log('Key schema facts:');
  console.log('  - cleaning_schedules table DOES NOT EXIST — use cleaning_tasks');
  console.log('  - property_configurations: NO cleaning_vendor_id, NO preferred_platform in live DB');
  console.log('  - vendors: columns are name/phone/email (not vendor_name/vendor_phone/vendor_email)');
}

main().catch(console.error);

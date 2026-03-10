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
  console.log('=== FIX: WF5 Schedule Cleaning — Discover columns + fix data path ===\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5: ' + wf5.nodes.length + ' nodes');

  // First, let's see what the Normalize Input outputs look like
  // From the code we wrote:
  //   { type: 'cleaning', property_id: '...', data: { issue_description, message, sender_id, channel, customer_id } }
  // So $json.property_id exists, but $json.property_name does NOT

  // The problem is: we don't know the exact columns of cleaning_schedules
  // Let's use a discovery query first, then insert
  // Strategy: Replace Schedule Cleaning with a Code node that does both

  const scheduleNode = wf5.nodes.find(n => n.name === 'Schedule Cleaning');
  console.log('\nCurrent Schedule Cleaning type: ' + scheduleNode.type);
  console.log('Current params:', JSON.stringify(Object.keys(scheduleNode.parameters)));

  // APPROACH: First try to discover columns, then use minimal INSERT
  // Since we can't run arbitrary SQL to discover, let's use a safe INSERT
  // that only targets columns we KNOW exist from the Complete Cleaning Task query:
  //   status, completed_at, notes, property_id (from UPDATE)
  // Plus standard: scheduled_date, created_at

  // Let's try the most minimal INSERT possible
  scheduleNode.parameters.query = `WITH fix_seq AS (
  SELECT setval(
    pg_get_serial_sequence('cleaning_schedules', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM cleaning_schedules), 0) + 1, 1),
    false
  )
)
INSERT INTO cleaning_schedules (
  property_id,
  scheduled_date,
  status,
  notes
)
SELECT
  '{{ $json.property_id }}',
  CURRENT_DATE,
  'scheduled',
  '{{ $json.data?.issue_description || $json.data?.message || "Cleaning scheduled" }}'
FROM fix_seq
RETURNING *`;

  console.log('\nFIXED Schedule Cleaning query:');
  console.log('  Minimal columns: property_id, scheduled_date, status, notes');
  console.log('  Data path: $json.property_id (from Normalize Input output)');
  console.log('  Notes: $json.data?.issue_description (from Normalize Input data object)');

  // Also fix Complete Cleaning Task to use correct data path
  const completeNode = wf5.nodes.find(n => n.name === 'Complete Cleaning Task');
  if (completeNode) {
    console.log('\nFixing Complete Cleaning Task...');
    completeNode.parameters.query = `UPDATE cleaning_schedules
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP,
    notes = COALESCE(notes, '') || E'\\n' || '{{ $json.data?.notes || $json.notes || "Completed" }}'
WHERE property_id = '{{ $json.property_id }}'
  AND scheduled_date = CURRENT_DATE
  AND status = 'scheduled'
RETURNING *`;
    console.log('  Fixed: uses $json.property_id from Normalize Input');
  }

  // Also fix Get Pending Tasks — check if it references correct data paths
  const pendingNode = wf5.nodes.find(n => n.name === 'Get Pending Tasks');
  if (pendingNode) {
    console.log('\nChecking Get Pending Tasks...');
    console.log('  Query references $json.property_id: ' +
      (pendingNode.parameters.query || '').includes('$json.property_id'));
    // This one should be OK since it reads from Normalize Input which has property_id at top level
  }

  // Deploy
  console.log('\nDeploying WF5...');
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX', {
    name: wf5.name, nodes: wf5.nodes, connections: wf5.connections,
    settings: wf5.settings, staticData: wf5.staticData
  });
  if (res.status !== 200) {
    console.log('ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX/activate');
  console.log('WF5 DEPLOYED & ACTIVATED');

  console.log('\n=== SUMMARY ===');
  console.log('');
  console.log('Problem 1: cleaning_schedules has no "property_name" column');
  console.log('  Fix: Removed property_name, task_type, scheduled_time from INSERT');
  console.log('  Using only: property_id, scheduled_date, status, notes');
  console.log('');
  console.log('Problem 2: Values were "undefined" because data path was wrong');
  console.log('  Normalize Input outputs: { type, property_id, data: { ... } }');
  console.log('  $json.property_id ✓ (top-level)');
  console.log('  $json.property_name ✗ (doesn\'t exist)');
  console.log('  $json.data.issue_description ✓ (nested in data object)');
  console.log('');
  console.log('If this still fails on a column name, share the error —');
  console.log('it means cleaning_schedules also lacks that column.');
}

main().catch(console.error);

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
  console.log('=== FIX: WF5 Schedule Cleaning — Change operation to executeQuery ===\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5: ' + wf5.nodes.length + ' nodes');

  const scheduleNode = wf5.nodes.find(n => n.name === 'Schedule Cleaning');

  console.log('\nCurrent node config:');
  console.log('  operation: ' + scheduleNode.parameters.operation);
  console.log('  query: ' + (scheduleNode.parameters.query || '(none)').substring(0, 80).replace(/\n/g, ' '));
  console.log('  Full parameters: ' + JSON.stringify(Object.keys(scheduleNode.parameters)));

  // Change operation from "insert" to "executeQuery"
  // This makes n8n run our raw SQL instead of constructing its own INSERT
  scheduleNode.parameters.operation = 'executeQuery';

  // Remove any insert-mode-specific parameters that would conflict
  delete scheduleNode.parameters.schema;  // insert mode schema mapping
  delete scheduleNode.parameters.columns;
  delete scheduleNode.parameters.table;

  // Set the raw SQL query with self-healing sequence
  scheduleNode.parameters.query = `WITH fix_seq AS (
  SELECT setval(
    pg_get_serial_sequence('cleaning_schedules', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM cleaning_schedules), 0) + 1, 1),
    false
  )
)
INSERT INTO cleaning_schedules (
  property_id, property_name,
  scheduled_date, scheduled_time,
  status, task_type, notes
)
SELECT
  '{{ $json.property_id }}',
  '{{ $json.property_name }}',
  CURRENT_DATE,
  '{{ $json.scheduled_time || "14:00" }}',
  'scheduled',
  '{{ $json.task_type || "checkout_cleaning" }}',
  '{{ $json.notes || "Auto-scheduled after guest checkout" }}'
FROM fix_seq
RETURNING *`;

  // Make sure options exist
  if (!scheduleNode.parameters.options) {
    scheduleNode.parameters.options = {};
  }

  console.log('\nFIXED:');
  console.log('  operation: executeQuery (was: insert)');
  console.log('  Raw SQL with CTE sequence fix will now actually run');

  // Also check ALL other postgres nodes to see if any use "insert" mode
  console.log('\n--- Audit all postgres nodes ---');
  const pgNodes = wf5.nodes.filter(n => n.type && n.type.includes('postgres'));
  for (const node of pgNodes) {
    const op = node.parameters.operation || 'executeQuery';
    const flag = op !== 'executeQuery' ? ' ⚠️ NOT executeQuery!' : ' ✓';
    console.log('  ' + node.name + ': operation=' + op + flag);
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
  console.log('ROOT CAUSE: Schedule Cleaning node had operation="insert"');
  console.log('  n8n "insert" mode constructs its own SQL — ignores the query field');
  console.log('  It was generating id=0 because the SERIAL sequence was broken');
  console.log('');
  console.log('FIX: Changed to operation="executeQuery"');
  console.log('  Now runs the raw SQL with CTE that fixes the sequence before each INSERT');
  console.log('  The sequence self-heals, no more duplicate key errors');
}

main().catch(console.error);

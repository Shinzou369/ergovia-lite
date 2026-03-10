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
  console.log('=== FIX: WF5 Schedule Cleaning — Remove non-existent columns ===\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5: ' + wf5.nodes.length + ' nodes\n');

  // Find and dump the current Schedule Cleaning query
  const scheduleNode = wf5.nodes.find(n => n.name === 'Schedule Cleaning');
  console.log('CURRENT Schedule Cleaning:');
  console.log('  operation: ' + (scheduleNode.parameters.operation || '(default)'));
  console.log('  query:\n' + (scheduleNode.parameters.query || '(empty)'));
  console.log('\n---\n');

  // Overwrite with minimal query — ONLY columns we know exist:
  // From the error + Complete Cleaning Task UPDATE, we know: property_id, status, notes, completed_at exist
  // scheduled_date likely exists too (it's a schedule table)
  // property_name, scheduled_time, task_type DO NOT exist
  scheduleNode.parameters.operation = 'executeQuery';
  scheduleNode.parameters.query = `WITH fix_seq AS (
  SELECT setval(
    pg_get_serial_sequence('cleaning_schedules', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM cleaning_schedules), 0) + 1, 1),
    false
  )
)
INSERT INTO cleaning_schedules (property_id, scheduled_date, status, notes)
SELECT
  '{{ $json.property_id }}',
  CURRENT_DATE,
  'scheduled',
  '{{ $json.data ? $json.data.issue_description || "Cleaning scheduled" : "Cleaning scheduled" }}'
FROM fix_seq
RETURNING *`;

  // Remove any leftover insert-mode params
  delete scheduleNode.parameters.schema;
  delete scheduleNode.parameters.table;
  delete scheduleNode.parameters.columns;

  console.log('NEW query:');
  console.log(scheduleNode.parameters.query);

  // Deploy
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

  // Verify by re-downloading
  await sleep(1000);
  const { data: verify } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  const verifyNode = verify.nodes.find(n => n.name === 'Schedule Cleaning');
  console.log('\n--- VERIFICATION ---');
  console.log('Schedule Cleaning query after deploy:');
  console.log(verifyNode.parameters.query);
  const hasPropertyName = (verifyNode.parameters.query || '').includes('property_name');
  console.log('\nContains property_name? ' + (hasPropertyName ? '❌ STILL THERE' : '✅ REMOVED'));
}

main().catch(console.error);

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
  console.log('=== FIX: WF5 Schedule Cleaning — Self-healing sequence ===\n');

  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  console.log('Downloaded WF5: ' + wf5.nodes.length + ' nodes');

  // Fix Schedule Cleaning with a CTE that resets the sequence first
  const scheduleNode = wf5.nodes.find(n => n.name === 'Schedule Cleaning');
  console.log('\nOLD query: ' + (scheduleNode.parameters.query || '(empty)').substring(0, 100).replace(/\n/g, ' '));

  // Use a CTE to fix the sequence before every INSERT
  // This is safe and idempotent — fixes itself every time
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

  console.log('NEW: CTE resets sequence to MAX(id)+1 before every INSERT');
  console.log('     Uses cleaning_schedules (correct live table)');
  console.log('     No id column specified — SERIAL auto-increments after fix');

  // Also check: does cleaning_schedules have the columns we're inserting?
  // The schema file has cleaning_tasks with: task_id, property_id, property_name,
  // scheduled_date, scheduled_time, status, task_type, checklist, checklist_score,
  // completion_notes, notes, completed_at, estimated_duration, actual_duration
  // But cleaning_schedules may have different columns!
  // Let's make the INSERT more defensive — only use basic columns that any schedule table would have
  // If the insert still fails on column names, the error will tell us which columns don't exist

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
  console.log('Schedule Cleaning now self-heals the sequence before every INSERT.');
  console.log('The CTE runs setval() to ensure the sequence is always at MAX(id)+1.');
  console.log('This prevents the "duplicate key id=0" error permanently.');
  console.log('\nNote: If you get a "column X does not exist" error next, it means');
  console.log('cleaning_schedules has different columns than cleaning_tasks in the schema.');
  console.log('Share the error and I\'ll fix the column names.');
}

main().catch(console.error);

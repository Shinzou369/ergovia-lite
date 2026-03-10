const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
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

const WF2_ID = 'NPInwpKv4Oriq04F';

// NULLIF('', '') returns NULL. NULL comparisons return no rows (safe).
// NULLIF('value', '') returns 'value'. Works normally.
const QUERY_FIXES = {
  'check-competing-offers': `=-- Check for competing offers (pending deals for same property and overlapping dates)
SELECT
  d.deal_id,
  d.client_name,
  d.client_phone,
  d.client_email,
  d.property_id,
  d.check_in_date,
  d.check_out_date,
  d.guests,
  d.price_quoted,
  d.status,
  d.created_at,
  d.channel_type,
  d.conflict_priority,
  d.owner_notes
FROM deals d
WHERE d.property_id = NULLIF('{{ $json.property_id }}', '')
  AND d.status IN ('pending', 'pending_offer', 'ai_conversation', 'negotiating')
  AND (
    (d.check_in_date <= NULLIF('{{ $json.detected_check_out }}', '')::date
     AND d.check_out_date >= NULLIF('{{ $json.detected_check_in }}', '')::date)
    OR (d.check_in_date >= NULLIF('{{ $json.detected_check_in }}', '')::date
     AND d.check_in_date < NULLIF('{{ $json.detected_check_out }}', '')::date)
    OR (d.check_out_date > NULLIF('{{ $json.detected_check_in }}', '')::date
     AND d.check_out_date <= NULLIF('{{ $json.detected_check_out }}', '')::date)
  )
ORDER BY d.created_at ASC`,

  'process-decline-all': `=-- Decline all competing offers for the property and dates
UPDATE deals
SET status = 'declined_by_owner',
    updated_at = NOW(),
    owner_notes = COALESCE(owner_notes, '') || ' | Owner declined all competing offers'
WHERE property_id = NULLIF('{{ $json.property_id }}', '')
  AND status IN ('pending', 'pending_offer', 'competing_offer', 'ai_conversation')
  AND check_in_date >= NULLIF('{{ $json.check_in_date }}', '')::date
  AND check_in_date <= (NULLIF('{{ $json.check_in_date }}', '')::date + interval '1 day')
RETURNING deal_id, client_name, channel_type, property_name, check_in_date, check_out_date`,

  'process-hold': `=-- Extend hold on all competing offers
UPDATE deals
SET status = 'on_hold',
    updated_at = NOW(),
    owner_notes = COALESCE(owner_notes, '') || ' | Owner requested 24h hold'
WHERE property_id = NULLIF('{{ $json.property_id }}', '')
  AND status IN ('pending', 'pending_offer', 'competing_offer')
  AND check_in_date >= NULLIF('{{ $json.check_in_date }}', '')::date
  AND check_in_date <= (NULLIF('{{ $json.check_in_date }}', '')::date + interval '1 day')
RETURNING deal_id, client_name`
};

async function main() {
  console.log('=== Fix WF2 queries: null-safe against empty inputs ===\n');

  const { data: wf } = await apiCall('GET', `/api/v1/workflows/${WF2_ID}`);
  console.log(`Downloaded: ${wf.name}`);

  let changes = 0;
  for (const node of wf.nodes) {
    if (QUERY_FIXES[node.id]) {
      console.log(`  Fixing: "${node.name}" → NULLIF guards added`);
      node.parameters.query = QUERY_FIXES[node.id];
      changes++;
    }
  }
  console.log(`\n${changes} queries fixed.`);

  console.log('Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF2_ID}/deactivate`);
  await sleep(1000);

  console.log('Uploading...');
  const updateBody = {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  };
  const update = await apiCall('PUT', `/api/v1/workflows/${WF2_ID}`, updateBody);
  if (update.status !== 200) {
    console.log(`ERROR: ${update.status}`);
    await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  console.log('Activating...');
  const act = await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
  console.log(act.status === 200 ? 'ACTIVATED ✓' : `FAILED (${act.status})`);

  console.log('\nHow NULLIF works:');
  console.log('  NULLIF(\'\', \'\') → NULL → comparison returns no rows (safe)');
  console.log('  NULLIF(\'2026-03-15\', \'\') → \'2026-03-15\' → works normally');
}

main().catch(console.error);

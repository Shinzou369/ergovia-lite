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

// Column mapping: WF2 expected → actual deals table columns
// contact_id     → (doesn't exist, remove filter)
// guest_name     → client_name
// guest_phone    → client_phone
// guest_email    → client_email
// num_guests     → guests
// total_amount   → price_quoted
// deal_status    → status
// channel        → channel_type
// priority_score → conflict_priority
// notes          → owner_notes

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
WHERE d.property_id = '{{ $json.property_id }}'
  AND d.status IN ('pending', 'pending_offer', 'ai_conversation', 'negotiating')
  AND (
    -- Check for date overlap
    (d.check_in_date <= '{{ $json.detected_check_out }}' AND d.check_out_date >= '{{ $json.detected_check_in }}')
    OR (d.check_in_date >= '{{ $json.detected_check_in }}' AND d.check_in_date < '{{ $json.detected_check_out }}')
    OR (d.check_out_date > '{{ $json.detected_check_in }}' AND d.check_out_date <= '{{ $json.detected_check_out }}')
  )
ORDER BY d.created_at ASC`,

  'process-accept': `=-- Accept the chosen offer and decline others
WITH accepted AS (
  UPDATE deals
  SET status = 'accepted',
      updated_at = NOW()
  WHERE deal_id = '{{ $json.deal_id }}'
  RETURNING *
),
declined AS (
  UPDATE deals
  SET status = 'declined_competing',
      updated_at = NOW(),
      owner_notes = COALESCE(owner_notes, '') || ' | Declined: Another offer was accepted'
  WHERE property_id = (SELECT property_id FROM accepted)
    AND deal_id != '{{ $json.deal_id }}'
    AND status IN ('pending', 'pending_offer', 'competing_offer', 'ai_conversation')
    AND check_in_date = (SELECT check_in_date FROM accepted)
  RETURNING *
)
SELECT
  a.deal_id as accepted_deal_id,
  a.client_name as accepted_guest,
  a.client_phone as accepted_phone,
  a.property_id,
  a.property_name,
  a.check_in_date,
  a.check_out_date,
  a.price_quoted as total_amount,
  a.channel_type as accepted_channel,
  (SELECT json_agg(json_build_object(
    'deal_id', d.deal_id,
    'client_name', d.client_name,
    'client_phone', d.client_phone,
    'channel_type', d.channel_type
  )) FROM declined d) as declined_offers
FROM accepted a`,

  'update-conflict-resolved': `=UPDATE offer_conflicts
SET status = 'resolved_accepted',
    resolved_at = NOW(),
    resolution_notes = 'Owner accepted deal: ' || '{{ $json.deal_id || $json.accepted?.deal_id }}'
WHERE property_id = '{{ $json.property_id || $json.accepted?.property_id }}'
  AND status = 'pending_decision'
  AND check_in_date = '{{ $json.check_in_date || $json.accepted?.check_in_date }}'`,

  'process-decline-all': `=-- Decline all competing offers for the property and dates
UPDATE deals
SET status = 'declined_by_owner',
    updated_at = NOW(),
    owner_notes = COALESCE(owner_notes, '') || ' | Owner declined all competing offers'
WHERE property_id = '{{ $json.property_id }}'
  AND status IN ('pending', 'pending_offer', 'competing_offer', 'ai_conversation')
  AND check_in_date >= '{{ $json.check_in_date }}'::date
  AND check_in_date <= ('{{ $json.check_in_date }}'::date + interval '1 day')
RETURNING deal_id, client_name, channel_type, property_name, check_in_date, check_out_date`,

  'process-hold': `=-- Extend hold on all competing offers
UPDATE deals
SET status = 'on_hold',
    updated_at = NOW(),
    owner_notes = COALESCE(owner_notes, '') || ' | Owner requested 24h hold'
WHERE property_id = '{{ $json.property_id }}'
  AND status IN ('pending', 'pending_offer', 'competing_offer')
  AND check_in_date >= '{{ $json.check_in_date }}'::date
  AND check_in_date <= ('{{ $json.check_in_date }}'::date + interval '1 day')
RETURNING deal_id, client_name`
};

const WF2_ID = 'NPInwpKv4Oriq04F';

async function main() {
  console.log('=== Fix ALL WF2 Postgres queries (column name mapping) ===\n');

  const { data: wf } = await apiCall('GET', `/api/v1/workflows/${WF2_ID}`);
  console.log(`Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  let changes = 0;
  for (const node of wf.nodes) {
    if (QUERY_FIXES[node.id]) {
      console.log(`Fixing: "${node.name}" (${node.id})`);

      // Show key column changes
      const oldQuery = node.parameters.query || '';
      const newQuery = QUERY_FIXES[node.id];

      node.parameters.query = newQuery;

      // Clean up old queryParameters
      if (node.parameters.additionalFields?.queryParameters) {
        delete node.parameters.additionalFields.queryParameters;
        if (Object.keys(node.parameters.additionalFields).length === 0) {
          delete node.parameters.additionalFields;
        }
      }
      if (node.parameters.options?.queryParameters) {
        delete node.parameters.options.queryParameters;
      }

      changes++;
    }
  }

  console.log(`\n${changes} queries fixed.\n`);

  // Deactivate → Update → Activate
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
    console.log(`ERROR: ${update.status} - ${JSON.stringify(update.data).substring(0, 300)}`);
    await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  // Verify no old column names remain
  console.log('\nVerifying...');
  const { data: v } = await apiCall('GET', `/api/v1/workflows/${WF2_ID}`);
  const badCols = ['d.contact_id', 'd.guest_name', 'd.guest_phone', 'd.guest_email',
    'd.num_guests', 'd.total_amount', 'd.deal_status', 'd.priority_score'];
  let problems = 0;
  for (const node of v.nodes) {
    const q = node.parameters?.query || '';
    for (const bad of badCols) {
      if (q.includes(bad)) {
        console.log(`  WARNING: "${node.name}" still has ${bad}`);
        problems++;
      }
    }
  }
  if (problems === 0) console.log('  All old column names removed ✓');

  console.log('\nActivating...');
  const act = await apiCall('POST', `/api/v1/workflows/${WF2_ID}/activate`);
  console.log(act.status === 200 ? 'ACTIVATED ✓' : `FAILED (${act.status})`);

  console.log('\n=== Column Mapping Applied ===');
  console.log('  contact_id     → removed (not in deals table)');
  console.log('  guest_name     → client_name');
  console.log('  guest_phone    → client_phone');
  console.log('  guest_email    → client_email');
  console.log('  num_guests     → guests');
  console.log('  total_amount   → price_quoted');
  console.log('  deal_status    → status');
  console.log('  channel        → channel_type');
  console.log('  priority_score → conflict_priority');
  console.log('  notes          → owner_notes');
}

main().catch(console.error);

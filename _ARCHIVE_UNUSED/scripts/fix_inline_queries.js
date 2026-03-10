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

// ============================================================
// INLINE QUERY REWRITES - Replace $1/$2/etc with {{ expressions }}
// ============================================================

const QUERY_REWRITES = {
  // === WF1: AI Gateway ===
  'LP7YknAVPiQsidWq': {
    'get-customer-id': `=SELECT pc.customer_id FROM property_configurations pc JOIN conversations c ON pc.property_id = c.property_id WHERE c.contact_id = '{{ $json.sender_id }}' LIMIT 1`,

    'check-budget': `=SELECT * FROM check_budget_available('{{ $json.customer_id }}'::uuid)`,

    'log-api-cost': `=SELECT * FROM log_api_usage('{{ $json.customer_id }}'::uuid, 'openai', 'gpt-4o-mini', 'chat', {{ $json.cost_calculation.input_tokens }}::int, {{ $json.cost_calculation.output_tokens }}::int, {{ $json.cost_calculation.cost_usd }}::decimal, 'WF1: AI Gateway', 'AI Agent', '{{ $execution.id }}')`,

    'save-alert': `=INSERT INTO api_budget_alerts (customer_id, month_year, alert_type, usage_at_alert, notification_sent) VALUES ('{{ $json.customer_id }}'::uuid, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), '{{ $json.alert_type }}', (SELECT used_amount FROM api_usage_budget WHERE customer_id = '{{ $json.customer_id }}'::uuid AND month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM')), true)`
  },

  // === WF2: AI Booking Agent ===
  'NPInwpKv4Oriq04F': {
    'load-context': `=SELECT
  c.conversation_id,
  c.contact_id,
  c.property_id,
  c.conversation_stage,
  c.conversation_history,
  c.collected_data,
  c.updated_at,
  p.property_name,
  p.property_type,
  p.base_price,
  p.max_guests,
  p.bedrooms,
  p.amenities,
  p.house_rules,
  p.check_in_time,
  p.check_out_time,
  p.location_description,
  p.owner_name,
  p.owner_contact,
  p.preferred_platform
FROM conversations c
LEFT JOIN property_configurations p ON c.property_id = p.property_id
WHERE c.contact_id = '{{ $json.sender_id }}'
ORDER BY c.updated_at DESC
LIMIT 1`,

    'check-competing-offers': `=-- Check for competing offers (pending deals for same property and overlapping dates)
SELECT
  d.deal_id,
  d.contact_id,
  d.guest_name,
  d.guest_phone,
  d.guest_email,
  d.property_id,
  d.check_in_date,
  d.check_out_date,
  d.num_guests,
  d.total_amount,
  d.deal_status,
  d.created_at,
  d.channel,
  d.priority_score,
  d.notes
FROM deals d
WHERE d.property_id = '{{ $json.property_id }}'
  AND d.deal_status IN ('pending', 'pending_offer', 'ai_conversation', 'negotiating')
  AND d.contact_id != '{{ $json.contact_id }}'
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
  SET deal_status = 'accepted',
      updated_at = NOW()
  WHERE deal_id = '{{ $json.deal_id }}'
  RETURNING *
),
declined AS (
  UPDATE deals
  SET deal_status = 'declined_competing',
      updated_at = NOW(),
      notes = COALESCE(notes, '') || ' | Declined: Another offer was accepted'
  WHERE property_id = (SELECT property_id FROM accepted)
    AND deal_id != '{{ $json.deal_id }}'
    AND deal_status IN ('pending', 'pending_offer', 'competing_offer', 'ai_conversation')
    AND check_in_date = (SELECT check_in_date FROM accepted)
  RETURNING *
)
SELECT
  a.deal_id as accepted_deal_id,
  a.guest_name as accepted_guest,
  a.guest_phone as accepted_phone,
  a.contact_id as accepted_contact,
  a.property_id,
  a.property_name,
  a.check_in_date,
  a.check_out_date,
  a.total_amount,
  a.channel as accepted_channel,
  (SELECT json_agg(json_build_object(
    'deal_id', d.deal_id,
    'guest_name', d.guest_name,
    'guest_phone', d.guest_phone,
    'contact_id', d.contact_id,
    'channel', d.channel
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
SET deal_status = 'declined_by_owner',
    updated_at = NOW(),
    notes = COALESCE(notes, '') || ' | Owner declined all competing offers'
WHERE property_id = '{{ $json.property_id }}'
  AND deal_status IN ('pending', 'pending_offer', 'competing_offer', 'ai_conversation')
  AND check_in_date >= '{{ $json.check_in_date }}'::date
  AND check_in_date <= ('{{ $json.check_in_date }}'::date + interval '1 day')
RETURNING deal_id, guest_name, contact_id, channel, property_name, check_in_date, check_out_date`,

    'process-hold': `=-- Extend hold on all competing offers
UPDATE deals
SET deal_status = 'on_hold',
    updated_at = NOW(),
    notes = COALESCE(notes, '') || ' | Owner requested 24h hold'
WHERE property_id = '{{ $json.property_id }}'
  AND deal_status IN ('pending', 'pending_offer', 'competing_offer')
  AND check_in_date >= '{{ $json.check_in_date }}'::date
  AND check_in_date <= ('{{ $json.check_in_date }}'::date + interval '1 day')
RETURNING deal_id, guest_name`
  },

  // === SUB: Universal Messenger ===
  'UZMWfhnV6JmuwJXC': {
    'log-messaging-cost': `=SELECT * FROM log_api_usage('{{ $json.customer_id }}'::uuid, '{{ $json.channel === "sms" ? "twilio" : ($json.channel === "whatsapp" ? "twilio" : "telegram") }}', '{{ $json.channel }}', 'send_message', 0::int, 0::int, {{ $json.cost_usd }}::decimal, 'SUB: Universal Messenger', 'Send Message', '{{ $execution.id }}')`
  },

  // === WF6: Daily Automations ===
  'ccEOaNnIwY6eeJOn': {
    'check-budget-morning': `=SELECT * FROM check_budget_available('{{ $json.customer_id }}'::uuid)`,
    'check-budget-evening': `=SELECT * FROM check_budget_available('{{ $json.customer_id }}'::uuid)`,
    'check-budget-weekly': `=SELECT * FROM check_budget_available('{{ $json.customer_id }}'::uuid)`
  }
};

async function fixWorkflow(wfId, nodeRewrites) {
  const { data: wf } = await apiCall('GET', `/api/v1/workflows/${wfId}`);
  console.log(`\n========== ${wf.name} (${wfId}) ==========`);

  let changed = false;
  for (const node of wf.nodes) {
    const newQuery = nodeRewrites[node.id];
    if (!newQuery) continue;

    console.log(`  "${node.name}" (${node.id})`);
    console.log(`    OLD query (first 80): ${(node.parameters.query || '').substring(0, 80)}...`);

    // Replace the query with inline expressions
    node.parameters.query = newQuery;

    // Remove queryParameters from additionalFields (no longer needed)
    if (node.parameters.additionalFields?.queryParameters) {
      delete node.parameters.additionalFields.queryParameters;
      // Remove additionalFields if empty
      if (Object.keys(node.parameters.additionalFields).length === 0) {
        delete node.parameters.additionalFields;
      }
    }
    // Also remove from options if present
    if (node.parameters.options?.queryParameters) {
      delete node.parameters.options.queryParameters;
    }

    console.log(`    NEW query (first 80): ${newQuery.substring(0, 80)}...`);
    console.log(`    Cleared queryParameters bindings`);
    changed = true;
  }

  if (!changed) {
    console.log('  No changes needed.');
    return true;
  }

  // Deactivate → Update → Activate
  console.log('  Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${wfId}/deactivate`);
  await sleep(1000);

  console.log('  Uploading...');
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  };
  const update = await apiCall('PUT', `/api/v1/workflows/${wfId}`, updateBody);
  if (update.status !== 200) {
    console.log(`  ERROR: Update failed (${update.status}): ${JSON.stringify(update.data).substring(0, 300)}`);
    await apiCall('POST', `/api/v1/workflows/${wfId}/activate`);
    return false;
  }
  await sleep(1000);

  // Verify
  console.log('  Verifying...');
  const { data: verified } = await apiCall('GET', `/api/v1/workflows/${wfId}`);
  let allOk = true;
  for (const nodeId of Object.keys(nodeRewrites)) {
    const vNode = verified.nodes.find(n => n.id === nodeId);
    if (vNode) {
      const q = vNode.parameters.query || '';
      const startsWithEquals = q.startsWith('=');
      const hasNoPlaceholders = !q.match(/\$\d+/);
      const hasExpressions = q.includes('{{ ');
      const ok = startsWithEquals && hasNoPlaceholders && hasExpressions;
      console.log(`    "${vNode.name}": starts_with_= ${startsWithEquals}, no_$N ${hasNoPlaceholders}, has_{{ ${hasExpressions} → ${ok ? 'OK' : 'PROBLEM!'}`);
      if (!ok) allOk = false;
    }
  }

  console.log('  Activating...');
  const act = await apiCall('POST', `/api/v1/workflows/${wfId}/activate`);
  if (act.status === 200) {
    console.log('  ACTIVATED');
  } else {
    console.log(`  WARNING: Activate returned ${act.status}`);
  }

  return allOk;
}

async function main() {
  console.log('=== REWRITING QUERIES: $1/$2 → inline {{ expressions }} ===');
  console.log('This eliminates the need for queryParameters entirely.\n');

  const results = {};
  for (const [wfId, nodeRewrites] of Object.entries(QUERY_REWRITES)) {
    results[wfId] = await fixWorkflow(wfId, nodeRewrites);
    await sleep(2000);
  }

  console.log('\n\n=== RESULTS ===');
  for (const [wfId, ok] of Object.entries(results)) {
    console.log(`  ${wfId}: ${ok ? 'OK' : 'PROBLEM'}`);
  }

  // Quick check: any remaining $1 in affected workflows
  console.log('\n=== REMAINING $1 CHECK ===');
  for (const wfId of Object.keys(QUERY_REWRITES)) {
    const { data: wf } = await apiCall('GET', `/api/v1/workflows/${wfId}`);
    for (const node of wf.nodes) {
      const q = node.parameters?.query || '';
      if (q.includes('$1')) {
        console.log(`  WARNING: ${wf.name} / "${node.name}" still has $1!`);
      }
    }
  }
  console.log('  Done.');
}

main().catch(console.error);

/**
 * Fix WF6: Daily Automations (ccEOaNnIwY6eeJOn)
 *
 * Issues found and fixed:
 * 1. preferred_platform column doesn't exist → use COALESCE(settings->>'preferred_platform','telegram')
 * 2. Send Reports SUB call uses wrong field names (recipient/message → sender_id/input + customer_id)
 * 3. Stale credential sweep (sjaI08GtPbON8TLX → correct IDs)
 * 4. Log Execution uses insert mode but automation_log exists — OK, just verify columns
 * 5. Code nodes output "recipient" but SUB expects "sender_id" — fix in Send Reports mapping
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'ccEOaNnIwY6eeJOn';

const CORRECT_POSTGRES = { id: 'BWlLUMKn64aZsHi8', name: 'Ergovia PostgreSQL' };
const CORRECT_OPENAI = { id: 'slpbr7aUaU6fqTfw', name: 'OpenAI' };
const STALE_CRED_ID = 'sjaI08GtPbON8TLX';

const changes = [];

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + apiPath);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  changes.push(msg);
  console.log('  ✓ ' + msg);
}

async function main() {
  console.log('=== Fixing WF6: Daily Automations ===\n');
  console.log('1. Downloading live workflow...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR: Could not download workflow. Response:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── STEP 1: Fix stale credentials on ALL nodes ───
  console.log('2. Scanning credentials...');
  for (const node of wf.nodes) {
    if (!node.credentials) continue;

    // Fix stale postgres credentials
    if (node.credentials.postgres?.id === STALE_CRED_ID) {
      node.credentials.postgres = { ...CORRECT_POSTGRES };
      log(`[${node.name}] Fixed stale PostgreSQL credential`);
    }

    // Fix stale OpenAI credentials
    if (node.credentials.openAiApi?.id === STALE_CRED_ID) {
      node.credentials.openAiApi = { ...CORRECT_OPENAI };
      log(`[${node.name}] Fixed stale OpenAI credential`);
    }
    if (node.credentials.openAi?.id === STALE_CRED_ID) {
      node.credentials.openAi = { ...CORRECT_OPENAI };
      log(`[${node.name}] Fixed stale OpenAI credential`);
    }

    // Normalize credential names (remove [Client] prefix)
    for (const [key, val] of Object.entries(node.credentials)) {
      if (val?.name?.startsWith('[Client] ')) {
        const cleanName = val.name.replace('[Client] ', '');
        node.credentials[key] = { id: val.id, name: cleanName };
        log(`[${node.name}] Cleaned credential name: "${val.name}" → "${cleanName}"`);
      }
    }
  }

  // ─── STEP 2: Fix "Get Morning Data" query ───
  console.log('\n3. Fixing SQL queries...');
  const morningNode = wf.nodes.find(n => n.name === 'Get Morning Data');
  if (morningNode) {
    // Replace p.preferred_platform with COALESCE from settings
    // Also fix GROUP BY
    morningNode.parameters.query = `SELECT
  p.property_id,
  p.property_name,
  p.owner_name,
  p.owner_contact,
  COALESCE(p.settings->>'preferred_platform', 'telegram') AS preferred_platform,
  p.customer_id,
  COUNT(DISTINCT CASE WHEN b.check_in_date = CURRENT_DATE THEN b.booking_id END) as checkins_today,
  COUNT(DISTINCT CASE WHEN b.check_out_date = CURRENT_DATE THEN b.booking_id END) as checkouts_today,
  COUNT(DISTINCT CASE WHEN mt.status IN ('new', 'in_progress') THEN mt.ticket_id END) as open_tickets,
  (SELECT COUNT(*) FROM manual_tasks WHERE status IN ('pending', 'in_progress')
    AND related_property_id = p.property_id) as pending_tasks,
  (SELECT COUNT(*) FROM conversations WHERE is_active = true
    AND property_id = p.property_id
    AND updated_at < NOW() - INTERVAL '4 hours'
    AND COALESCE(followup_exhausted, false) = false) as stale_conversations,
  (SELECT COUNT(*) FROM scheduled_messages WHERE status = 'pending'
    AND property_id = p.property_id
    AND scheduled_time <= NOW() + INTERVAL '24 hours') as upcoming_messages
FROM property_configurations p
LEFT JOIN bookings b ON p.property_id = b.property_id
  AND b.booking_status = 'confirmed'
  AND (b.check_in_date = CURRENT_DATE OR b.check_out_date = CURRENT_DATE)
LEFT JOIN maintenance_tickets mt ON p.property_id = mt.property_id
  AND mt.status IN ('new', 'in_progress')
WHERE p.property_status = 'active'
GROUP BY p.property_id, p.property_name, p.owner_name, p.owner_contact, p.settings, p.customer_id`;
    log('[Get Morning Data] Replaced p.preferred_platform with COALESCE(settings->>...) + fixed GROUP BY');
  }

  // ─── STEP 3: Fix "Get Evening Data" query ───
  const eveningNode = wf.nodes.find(n => n.name === 'Get Evening Data');
  if (eveningNode) {
    eveningNode.parameters.query = `SELECT
  p.property_id,
  p.property_name,
  p.owner_contact,
  COALESCE(p.settings->>'preferred_platform', 'telegram') AS preferred_platform,
  p.customer_id,
  b.booking_id,
  b.guest_name,
  b.check_in_date,
  cs.status as cleaning_status,
  cs.completed_at as cleaning_completed
FROM property_configurations p
JOIN bookings b ON p.property_id = b.property_id
  AND b.check_in_date = CURRENT_DATE
  AND b.booking_status = 'confirmed'
LEFT JOIN cleaning_schedules cs ON b.booking_id = cs.booking_id
WHERE p.property_status = 'active'`;
    log('[Get Evening Data] Replaced p.preferred_platform with COALESCE(settings->>...)');
  }

  // ─── STEP 4: Fix "Get Weekly Data" query ───
  const weeklyNode = wf.nodes.find(n => n.name === 'Get Weekly Data');
  if (weeklyNode) {
    weeklyNode.parameters.query = `SELECT
  p.property_id,
  p.property_name,
  p.owner_contact,
  COALESCE(p.settings->>'preferred_platform', 'telegram') AS preferred_platform,
  p.customer_id,
  COUNT(b.booking_id) as total_bookings,
  SUM(b.total_amount) as total_revenue,
  AVG(EXTRACT(DAY FROM b.check_out_date - b.check_in_date)) as avg_stay_length,
  COUNT(CASE WHEN b.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_bookings_week
FROM property_configurations p
LEFT JOIN bookings b ON p.property_id = b.property_id
  AND b.booking_status = 'confirmed'
  AND b.created_at >= CURRENT_DATE - INTERVAL '30 days'
WHERE p.property_status = 'active'
GROUP BY p.property_id, p.property_name, p.owner_contact, p.settings, p.customer_id`;
    log('[Get Weekly Data] Replaced p.preferred_platform with COALESCE(settings->>...) + fixed GROUP BY');
  }

  // ─── STEP 5: Fix "Get Last Month Summary" query ───
  const lastMonthNode = wf.nodes.find(n => n.name === 'Get Last Month Summary');
  if (lastMonthNode) {
    // pc.preferred_platform doesn't exist on property_configurations,
    // use c.preferred_platform (from customers table) or COALESCE from settings
    lastMonthNode.parameters.query = `SELECT
  c.id as customer_id,
  c.name as customer_name,
  pc.owner_contact,
  COALESCE(pc.settings->>'preferred_platform', c.preferred_platform, 'telegram') AS preferred_platform,
  b.used_amount as last_month_usage,
  b.monthly_budget
FROM customers c
JOIN property_configurations pc ON c.id = pc.customer_id
JOIN api_usage_budget b ON c.id = b.customer_id
WHERE b.month_year = TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM')
GROUP BY c.id, c.name, pc.owner_contact, pc.settings, c.preferred_platform, b.used_amount, b.monthly_budget`;
    log('[Get Last Month Summary] Replaced pc.preferred_platform with COALESCE(settings->>,customers.preferred_platform)');
  }

  // ─── STEP 6: Fix "Nightly Maintenance" query ───
  const nightlyNode = wf.nodes.find(n => n.name === 'Nightly Maintenance');
  if (nightlyNode) {
    nightlyNode.parameters.query = `WITH chat_cleanup AS (
  DELETE FROM n8n_chat_histories
  WHERE created_at < NOW() - INTERVAL '30 days' RETURNING 1
), log_cleanup AS (
  DELETE FROM automation_log
  WHERE executed_at < NOW() - INTERVAL '90 days' RETURNING 1
), msg_cleanup AS (
  DELETE FROM scheduled_messages
  WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '30 days' RETURNING 1
)
SELECT
  p.owner_contact,
  COALESCE(p.settings->>'preferred_platform', 'telegram') AS preferred_platform,
  p.property_name,
  p.customer_id,
  (SELECT COUNT(*) FROM chat_cleanup) as chat_rows_cleaned,
  (SELECT COUNT(*) FROM log_cleanup) as log_rows_cleaned,
  (SELECT COUNT(*) FROM msg_cleanup) as msgs_cleaned,
  (SELECT COUNT(*) FROM bookings WHERE booking_status = 'confirmed' AND check_out_date >= CURRENT_DATE) as active_bookings,
  (SELECT COALESCE(SUM(total_amount), 0) FROM bookings WHERE created_at >= date_trunc('month', CURRENT_DATE)) as mtd_revenue,
  (SELECT COUNT(*) FROM deals WHERE status IN ('inquiry', 'negotiation')) as active_deals,
  (SELECT COUNT(*) FROM maintenance_tickets WHERE status IN ('new', 'in_progress')) as open_tickets,
  (SELECT COUNT(*) FROM cleaning_schedules WHERE status = 'scheduled') as pending_cleanings
FROM property_configurations p
WHERE p.property_status = 'active'
ORDER BY p.property_name
LIMIT 1`;
    log('[Nightly Maintenance] Replaced p.preferred_platform with COALESCE(settings->>...)');
  }

  // ─── STEP 7: Fix "Log Execution" — switch to executeQuery for safety ───
  console.log('\n4. Fixing Log Execution node...');
  const logNode = wf.nodes.find(n => n.name === 'Log Execution');
  if (logNode) {
    // automation_log exists with columns: id, log_id, automation_type, executed_at, properties_processed, status, error_message, created_at
    // Switch to executeQuery with self-healing INSERT
    logNode.parameters = {
      operation: 'executeQuery',
      query: `WITH fix_seq AS (
  SELECT setval(
    pg_get_serial_sequence('automation_log', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM automation_log), 0) + 1, 1),
    false
  )
)
INSERT INTO automation_log (log_id, automation_type, executed_at, properties_processed, status)
SELECT
  'auto_' || EXTRACT(EPOCH FROM NOW())::bigint,
  '{{ $('Determine Automation').item.json.automation_type }}',
  NOW(),
  {{ $json.length || 1 }},
  'completed'
FROM fix_seq
RETURNING *`,
      options: {}
    };
    // Keep schema if present for n8n UI
    delete logNode.parameters.schema;
    delete logNode.parameters.table;
    delete logNode.parameters.columns;
    log('[Log Execution] Switched from insert to executeQuery with self-healing sequence');
  }

  // ─── STEP 8: Fix "Send Reports" SUB call ───
  // SUB expects: channel, sender_id, input, customer_id
  // Current mapping uses: channel, recipient, message
  console.log('\n5. Fixing Send Reports SUB call...');
  const sendNode = wf.nodes.find(n => n.name === 'Send Reports');
  if (sendNode) {
    sendNode.parameters.workflowInputs = {
      mappingMode: 'defineBelow',
      value: {
        channel: "={{ $json.channel || $json.preferred_platform || 'telegram' }}",
        sender_id: "={{ $json.recipient || $json.owner_contact || '' }}",
        input: "={{ $json.report_text || $json.text || $json.message || 'Report' }}",
        customer_id: "={{ $json.customer_id || '' }}"
      },
      schema: [
        { id: 'channel', displayName: 'Channel', type: 'string', required: true },
        { id: 'sender_id', displayName: 'Sender ID', type: 'string', required: true },
        { id: 'input', displayName: 'Input', type: 'string', required: true },
        { id: 'customer_id', displayName: 'Customer ID', type: 'string', required: true }
      ]
    };
    log('[Send Reports] Fixed SUB field mapping: recipient→sender_id, message→input, added customer_id');
  }

  // ─── STEP 9: Deploy ───
  console.log('\n6. Deploying fixed workflow...');

  // Deactivate
  console.log('   Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  await sleep(1500);

  // Update
  console.log('   Updating...');
  const updateResult = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  });

  if (updateResult.id) {
    console.log('   Update successful!');
  } else {
    console.error('   Update failed:', JSON.stringify(updateResult).substring(0, 300));
    return;
  }
  await sleep(1000);

  // Reactivate
  console.log('   Reactivating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  if (activateResult.active) {
    console.log('   Workflow is now ACTIVE!\n');
  } else {
    console.log('   Activation response:', JSON.stringify(activateResult).substring(0, 200));
  }

  // ─── Summary ───
  console.log('═══════════════════════════════════════');
  console.log(`SUMMARY: ${changes.length} changes applied to WF6`);
  console.log('═══════════════════════════════════════');
  for (const c of changes) {
    console.log('  • ' + c);
  }
  console.log('\nWF6 fix complete!');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

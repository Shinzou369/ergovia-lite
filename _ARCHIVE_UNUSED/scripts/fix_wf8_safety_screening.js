/**
 * Fix WF8: Safety & Screening (mLm2HaIRzNfIX5uh)
 *
 * Issues found and fixed:
 * 1. Log Security Event uses insert mode into security_log — TABLE DOES NOT EXIST
 *    → Switch to executeQuery with CREATE TABLE IF NOT EXISTS + INSERT
 * 2. Send Alerts SUB call uses wrong field names (recipient/message → sender_id/input + customer_id)
 * 3. Stale credential sweep
 * 4. Watchdog query — verified correct against live schema, added overdue_cleanings check
 * 5. Trigger schema — expanded to include screening fields
 * 6. Analyze Watchdog Results — added alert_message field for SUB
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'mLm2HaIRzNfIX5uh';

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
  console.log('=== Fixing WF8: Safety & Screening ===\n');
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

    if (node.credentials.postgres?.id === STALE_CRED_ID) {
      node.credentials.postgres = { ...CORRECT_POSTGRES };
      log(`[${node.name}] Fixed stale PostgreSQL credential`);
    }
    if (node.credentials.openAiApi?.id === STALE_CRED_ID) {
      node.credentials.openAiApi = { ...CORRECT_OPENAI };
      log(`[${node.name}] Fixed stale OpenAI credential`);
    }
    if (node.credentials.openAi?.id === STALE_CRED_ID) {
      node.credentials.openAi = { ...CORRECT_OPENAI };
      log(`[${node.name}] Fixed stale OpenAI credential`);
    }

    // Clean [Client] prefix
    for (const [key, val] of Object.entries(node.credentials)) {
      if (val?.name?.startsWith('[Client] ')) {
        const cleanName = val.name.replace('[Client] ', '');
        node.credentials[key] = { id: val.id, name: cleanName };
        log(`[${node.name}] Cleaned credential name: "${val.name}" → "${cleanName}"`);
      }
    }
  }

  // ─── STEP 2: Fix "Log Security Event" — table doesn't exist ───
  console.log('\n3. Fixing Log Security Event...');
  const logNode = wf.nodes.find(n => n.name === 'Log Security Event');
  if (logNode) {
    // security_log table does NOT exist in the live DB.
    // Switch to executeQuery with CREATE TABLE IF NOT EXISTS + INSERT
    logNode.parameters = {
      operation: 'executeQuery',
      query: "CREATE TABLE IF NOT EXISTS security_log (\n  id SERIAL PRIMARY KEY,\n  log_id VARCHAR(100) UNIQUE,\n  event_type VARCHAR(50),\n  severity VARCHAR(20) DEFAULT 'info',\n  details JSONB,\n  property_id VARCHAR(100),\n  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP\n);\n\nINSERT INTO security_log (log_id, event_type, severity, details, property_id)\nVALUES (\n  'sec_' || EXTRACT(EPOCH FROM NOW())::bigint,\n  '{{ $(\"Normalize Event\").item.json.event_type }}',\n  '{{ $json.severity || \"info\" }}',\n  '{{ JSON.stringify($json).replace(/\\'/g, \"''\") }}'::jsonb,\n  '{{ $(\"Normalize Event\").item.json.data.property_id || \"\" }}'\n)\nRETURNING *",
      options: {}
    };
    log('[Log Security Event] Switched from insert to executeQuery: CREATE TABLE IF NOT EXISTS + INSERT (security_log doesn\'t exist)');
  }

  // ─── STEP 3: Fix "Send Alerts" SUB call ───
  console.log('\n4. Fixing Send Alerts SUB call...');
  const sendNode = wf.nodes.find(n => n.name === 'Send Alerts');
  if (sendNode) {
    sendNode.parameters.workflowInputs = {
      mappingMode: 'defineBelow',
      value: {
        channel: "={{ $('Normalize Event').item.json.channel || $('Normalize Event').item.json.data.channel || $json.preferred_platform || 'telegram' }}",
        sender_id: "={{ $('Normalize Event').item.json.sender_id || $('Normalize Event').item.json.data.sender_id || $json.owner_contact || '' }}",
        input: "={{ $json.alert_message || $json.message || $json.output || 'Alert from property safety system' }}",
        customer_id: "={{ $('Normalize Event').item.json.customer_id || '' }}"
      },
      schema: [
        { id: 'channel', displayName: 'Channel', type: 'string', required: true },
        { id: 'sender_id', displayName: 'Sender ID', type: 'string', required: true },
        { id: 'input', displayName: 'Input', type: 'string', required: true },
        { id: 'customer_id', displayName: 'Customer ID', type: 'string', required: true }
      ]
    };
    log('[Send Alerts] Fixed SUB field mapping: recipient→sender_id, message→input, added customer_id');
  }

  // ─── STEP 4: Fix Watchdog query — add overdue_cleanings check ───
  console.log('\n5. Verifying Watchdog query...');
  const watchdogNode = wf.nodes.find(n => n.name === 'Run Watchdog Checks');
  if (watchdogNode) {
    watchdogNode.parameters.query = `SELECT
  'stale_bookings' as check_type,
  COUNT(*) as count
FROM bookings
WHERE booking_status = 'pending_payment'
  AND created_at < NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
  'stuck_conversations' as check_type,
  COUNT(*) as count
FROM conversations
WHERE conversation_stage NOT IN ('completed', 'cancelled')
  AND updated_at < NOW() - INTERVAL '4 hours'
UNION ALL
SELECT
  'unresponded_maintenance' as check_type,
  COUNT(*) as count
FROM maintenance_tickets
WHERE status = 'new'
  AND created_at < NOW() - INTERVAL '2 hours'
  AND urgency IN ('high', 'emergency')
UNION ALL
SELECT
  'overdue_cleanings' as check_type,
  COUNT(*) as count
FROM cleaning_schedules
WHERE status = 'scheduled'
  AND scheduled_date < CURRENT_DATE`;
    log('[Run Watchdog Checks] Added overdue_cleanings check to watchdog query');
  }

  // ─── STEP 5: Expand trigger schema ───
  console.log('\n6. Verifying trigger schema...');
  const triggerNode = wf.nodes.find(n => n.name === 'When Called by Other Workflow');
  if (triggerNode) {
    const expandedExample = {
      event_type: "emergency",
      channel: "telegram",
      sender_id: "123456789",
      customer_id: "uuid-here",
      property_id: "prop-123",
      message_text: "Help! Locked out!",
      booking_id: "",
      guest_name: "",
      guest_email: "",
      guest_phone: "",
      check_in_date: "",
      category: "EMERGENCY"
    };
    triggerNode.parameters.jsonExample = JSON.stringify(expandedExample, null, 2);
    log('[When Called by Other Workflow] Expanded trigger schema to include screening + emergency fields');
  }

  // ─── STEP 6: Fix Analyze Watchdog Results — add alert_message ───
  console.log('\n7. Fixing Analyze Watchdog Results...');
  const analyzeNode = wf.nodes.find(n => n.name === 'Analyze Watchdog Results');
  if (analyzeNode) {
    analyzeNode.parameters.jsCode = `// Analyze watchdog results and generate alerts
const checks = $input.all().map(i => i.json);
const alerts = [];

for (const check of checks) {
  if (parseInt(check.count) > 0) {
    alerts.push({
      type: check.check_type,
      count: parseInt(check.count),
      severity: check.check_type.includes('emergency') ? 'high' : 'medium',
      message: check.count + ' ' + check.check_type.replace(/_/g, ' ') + ' detected'
    });
  }
}

const totalIssues = alerts.reduce((sum, a) => sum + a.count, 0);

// Build alert message for SUB notification
let alertMessage = 'Watchdog Report\\n\\n';
if (alerts.length === 0) {
  alertMessage += 'All systems healthy. No issues detected.';
} else {
  alertMessage += totalIssues + ' issue(s) found:\\n\\n';
  for (const a of alerts) {
    const marker = a.severity === 'high' ? '[HIGH]' : '[WARN]';
    alertMessage += marker + ' ' + a.message + '\\n';
  }
  alertMessage += '\\nPlease review your dashboard for details.';
}

return {
  alerts: alerts,
  total_issues: totalIssues,
  alert_message: alertMessage,
  check_time: new Date().toISOString(),
  status: alerts.length > 0 ? 'issues_found' : 'healthy',
  severity: alerts.some(a => a.severity === 'high') ? 'high' : 'medium'
};`;
    log('[Analyze Watchdog Results] Added alert_message field for SUB notification');
  }

  // ─── STEP 7: Deploy ───
  console.log('\n8. Deploying fixed workflow...');

  console.log('   Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  await sleep(1500);

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

  console.log('   Reactivating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  if (activateResult.active) {
    console.log('   Workflow is now ACTIVE!\n');
  } else {
    console.log('   Activation response:', JSON.stringify(activateResult).substring(0, 200));
  }

  // ─── Summary ───
  console.log('═══════════════════════════════════════');
  console.log(`SUMMARY: ${changes.length} changes applied to WF8`);
  console.log('═══════════════════════════════════════');
  for (const c of changes) {
    console.log('  • ' + c);
  }
  console.log('\nWF8 fix complete!');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

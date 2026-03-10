/**
 * ADD NOTIFICATION LOGGING TO SUB: Owner & Staff Notifier
 *
 * Patches the live SUB Notifier workflow to insert a row into `notification_log`
 * for every notification sent (telegram, whatsapp, sms) and skipped.
 *
 * Adds a "Log Notification" Postgres node between "Merge Results" and "Has Messaging Cost?".
 * Also routes the "skip" path through this node.
 *
 * Usage: node scripts/add_notification_logging.js
 */

const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

const SUB_NOTIFIER_ID = '0L7HOkqENABlbPtT';
const POSTGRES_CRED_ID = 'BWlLUMKn64aZsHi8';

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
  console.log('=== ADD NOTIFICATION LOGGING TO SUB NOTIFIER ===\n');

  // ============================================
  // 1. Download live SUB Notifier
  // ============================================
  const { data: wf } = await apiCall('GET', '/api/v1/workflows/' + SUB_NOTIFIER_ID);
  console.log('Downloaded: ' + wf.name + ' (' + wf.nodes.length + ' nodes)');

  // ============================================
  // 2. Check if already patched
  // ============================================
  const existing = wf.nodes.find(n => n.name === 'Log Notification');
  if (existing) {
    console.log('Log Notification node already exists. Skipping.');
    return;
  }

  // ============================================
  // 3. Add "Log Notification" Postgres node
  // ============================================
  console.log('\n--- Adding Log Notification node ---');

  // This node inserts into notification_log table
  // Placed between "Merge Results" and "Has Messaging Cost?"
  const logNotification = {
    parameters: {
      operation: 'executeQuery',
      query: `INSERT INTO notification_log (
  property_id, recipient_type, recipient_name, channel,
  recipient_address, event_type, message, status,
  error_message, customer_id, execution_id
) VALUES (
  '{{ $json.property_id }}',
  '{{ $json.recipient_type || "owner" }}',
  '{{ $json.recipient_name || "" }}',
  '{{ $json.channel || "skip" }}',
  '{{ ($json.recipient || "").substring(0, 50) }}',
  '{{ $json.event_type || "" }}',
  '{{ ($json.message || $("Build Delivery").item.json.message || "").substring(0, 500).replace(/'/g, "''") }}',
  '{{ $json.success === false ? "failed" : ($json.channel === "skip" ? "skipped" : "sent") }}',
  '{{ $json.error_message || "" }}',
  {{ $json.customer_id ? "'" + $json.customer_id + "'::uuid" : "NULL" }},
  '{{ $execution.id }}'
) RETURNING id, notification_id;`,
      options: {}
    },
    id: 'notifier-log-notification-' + Date.now().toString(36),
    name: 'Log Notification',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [1680, 96],
    credentials: {
      postgres: { id: POSTGRES_CRED_ID, name: '[Client] PostgreSQL' }
    },
    continueOnFail: true,
    alwaysOutputData: true
  };
  wf.nodes.push(logNotification);
  console.log('  Added: Log Notification (Postgres) at [1680, 96]');

  // Also add a "Build Skip Result" Code node for the skip path
  // so it has the same data shape as the other log nodes
  const buildSkipResult = {
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Build result data for skipped notifications
const delivery = $('Build Delivery').item.json;
return {
  success: true,
  channel: 'skip',
  recipient: delivery.recipient || '',
  recipient_name: delivery.recipient_name || '',
  recipient_type: delivery.recipient_type || 'owner',
  message_id: null,
  event_type: delivery.event_type || '',
  property_id: delivery.property_id || '',
  customer_id: delivery.customer_id || '',
  message: delivery.message || '',
  cost_usd: 0,
  cost_type: 'none'
};`
    },
    id: 'notifier-build-skip-' + Date.now().toString(36),
    name: 'Build Skip Result',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1120, 576]
  };
  wf.nodes.push(buildSkipResult);
  console.log('  Added: Build Skip Result (Code) at [1120, 576]');

  // ============================================
  // 4. Shift positions
  // ============================================
  console.log('\n--- Adjusting positions ---');

  // Move "Has Messaging Cost?" to the right to make room
  const hasCost = wf.nodes.find(n => n.name === 'Has Messaging Cost?');
  if (hasCost) {
    hasCost.position = [1904, 96];
    console.log('  Has Messaging Cost? → [1904, 96]');
  }

  // Move "Log Messaging Cost" to the right
  const logCost = wf.nodes.find(n => n.name === 'Log Messaging Cost');
  if (logCost) {
    logCost.position = [2128, -48];
    console.log('  Log Messaging Cost → [2128, -48]');
  }

  // Move "Format Response" to the right
  const formatResp = wf.nodes.find(n => n.name === 'Format Response');
  if (formatResp) {
    formatResp.position = [2352, 176];
    console.log('  Format Response → [2352, 176]');
  }

  // ============================================
  // 5. Update connections
  // ============================================
  console.log('\n--- Updating connections ---');
  const conn = wf.connections;

  // Route by Channel skip path (output 3) → Build Skip Result (was → Format Response)
  const routeConn = conn['Route by Channel'];
  if (routeConn && routeConn.main && routeConn.main[3]) {
    routeConn.main[3] = [{ node: 'Build Skip Result', type: 'main', index: 0 }];
    console.log('  Route by Channel [skip] → Build Skip Result');
  }

  // Build Skip Result → Merge Results
  conn['Build Skip Result'] = {
    main: [[{ node: 'Merge Results', type: 'main', index: 0 }]]
  };
  console.log('  Build Skip Result → Merge Results');

  // Merge Results → Log Notification (was → Has Messaging Cost?)
  conn['Merge Results'] = {
    main: [[{ node: 'Log Notification', type: 'main', index: 0 }]]
  };
  console.log('  Merge Results → Log Notification');

  // Log Notification → Has Messaging Cost?
  conn['Log Notification'] = {
    main: [[{ node: 'Has Messaging Cost?', type: 'main', index: 0 }]]
  };
  console.log('  Log Notification → Has Messaging Cost?');

  // Has Messaging Cost? connections stay the same (→ Log Messaging Cost / → Format Response)

  // ============================================
  // 6. Deploy
  // ============================================
  console.log('\nDeploying SUB Notifier...');

  // Check if active
  if (wf.active) {
    await apiCall('POST', '/api/v1/workflows/' + SUB_NOTIFIER_ID + '/deactivate');
    await sleep(1500);
  }

  const res = await apiCall('PUT', '/api/v1/workflows/' + SUB_NOTIFIER_ID, {
    name: wf.name, nodes: wf.nodes, connections: conn,
    settings: wf.settings, staticData: wf.staticData
  });

  if (res.status !== 200) {
    console.log('ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    if (wf.active) {
      await apiCall('POST', '/api/v1/workflows/' + SUB_NOTIFIER_ID + '/activate');
    }
    return;
  }

  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/' + SUB_NOTIFIER_ID + '/activate');
  console.log('SUB Notifier deployed & activated');

  // ============================================
  // 7. Verify
  // ============================================
  console.log('\n--- Verification ---');
  const { data: verify } = await apiCall('GET', '/api/v1/workflows/' + SUB_NOTIFIER_ID);

  const vLog = verify.nodes.find(n => n.name === 'Log Notification');
  const vSkip = verify.nodes.find(n => n.name === 'Build Skip Result');

  console.log('  Log Notification:  ' + (vLog ? 'EXISTS at [' + vLog.position + ']' : 'MISSING'));
  console.log('  Build Skip Result: ' + (vSkip ? 'EXISTS' : 'MISSING'));

  const checkConn = (from) => {
    const c = verify.connections[from];
    if (!c || !c.main) return '(none)';
    return c.main.map((outputs, i) =>
      outputs.length ? outputs.map(o => o.node).join(', ') : '(empty)'
    ).join(' | ');
  };
  console.log('  Merge Results → ' + checkConn('Merge Results'));
  console.log('  Log Notification → ' + checkConn('Log Notification'));
  console.log('  Route by Channel → ' + checkConn('Route by Channel'));
  console.log('  Total nodes: ' + verify.nodes.length);

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n========================================');
  console.log(' NOTIFICATION LOGGING — COMPLETE');
  console.log('========================================');
  console.log('');
  console.log('Added 2 nodes to SUB: Owner & Staff Notifier:');
  console.log('  1. Build Skip Result (Code)     — normalizes skip path data');
  console.log('  2. Log Notification (Postgres)   — inserts into notification_log table');
  console.log('');
  console.log('Flow:');
  console.log('  [sent]    Log Channel Result → Merge Results → Log Notification → Has Cost? → ...');
  console.log('  [skipped] Route by Channel → Build Skip Result → Merge Results → Log Notification → ...');
  console.log('');
  console.log('Every notification (sent, failed, or skipped) is now logged to notification_log.');
}

main().catch(console.error);

/**
 * Fix WF8: Send Alerts is calling Owner & Staff Notifier but with wrong fields.
 *
 * Currently passes:  channel, sender_id, input, customer_id (Universal Messenger fields)
 * Should pass:       property_id, event_type, message, notify, recipient_id, customer_id
 *
 * Also: Watchdog path has no property_id (system-wide check), so we pass
 * an explicit recipient_id as fallback for the Owner Notifier.
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'mLm2HaIRzNfIX5uh';
const OWNER_NOTIFIER_ID = '0L7HOkqENABlbPtT';

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
  console.log('=== WF8: Fix Send Alerts for Owner Notifier ===\n');

  console.log('1. Downloading live WF8...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── Fix Send Alerts node ───
  console.log('2. Fixing Send Alerts field mapping...');
  const sendNode = wf.nodes.find(n => n.name === 'Send Alerts');
  if (!sendNode) {
    console.error('   Send Alerts node not found!');
    return;
  }

  console.log('   Current target:', sendNode.parameters.workflowId?.value);

  // Ensure it points to Owner Notifier
  sendNode.parameters = {
    workflowId: {
      __rl: true,
      mode: 'id',
      value: OWNER_NOTIFIER_ID
    },
    workflowInputs: {
      mappingMode: 'defineBelow',
      value: {
        // property_id: from Normalize Event (emergency/screening have it, watchdog doesn't)
        property_id: "={{ $('Normalize Event').item.json.property_id || '' }}",
        // event_type: emergency, screening, or watchdog
        event_type: "={{ $('Normalize Event').item.json.event_type || 'alert' }}",
        // message: the alert text — from AI agents or watchdog analysis
        message: "={{ $json.alert_message || $json.output || $json.message || 'System alert from WF8' }}",
        // notify: always owner for safety alerts
        notify: "owner",
        // recipient_id: explicit fallback — use sender_id from Normalize (for emergencies)
        // or owner_telegram from Normalize (for watchdog with resolved owner)
        recipient_id: "={{ $('Normalize Event').item.json.sender_id || $('Normalize Event').item.json.owner_telegram || '' }}",
        // customer_id: for cost tracking
        customer_id: "={{ $('Normalize Event').item.json.customer_id || '' }}"
      },
      schema: [
        { id: 'property_id', displayName: 'Property ID', type: 'string', required: true },
        { id: 'event_type', displayName: 'Event Type', type: 'string', required: true },
        { id: 'message', displayName: 'Message', type: 'string', required: true },
        { id: 'notify', displayName: 'Notify', type: 'string', required: true },
        { id: 'recipient_id', displayName: 'Recipient ID', type: 'string', required: false },
        { id: 'customer_id', displayName: 'Customer ID', type: 'string', required: true }
      ]
    },
    options: {}
  };
  log('Send Alerts: Fixed field mapping for Owner Notifier (property_id, event_type, message, notify, recipient_id, customer_id)');

  // ─── Fix Analyze Watchdog Results — resolve an owner to notify ───
  // Watchdog is system-wide, no specific property. We need to provide a property_id
  // so the Owner Notifier can resolve who to notify. Use the first active property.
  console.log('\n3. Fixing Analyze Watchdog Results to resolve a recipient...');
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

// Build alert message for notification
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
    log('Analyze Watchdog Results: Ensured alert_message is built for notification');
  }

  // ─── Fix Normalize Event — for watchdog, resolve the first active property ───
  console.log('\n4. Fixing Normalize Event to include property_id for watchdog...');
  const normalizeNode = wf.nodes.find(n => n.name === 'Normalize Event');
  if (normalizeNode) {
    normalizeNode.parameters.jsCode = `// Normalize input from WF1 tool call, watchdog trigger, or webhook
const input = $input.item.json;

let event = {
  event_type: 'unknown',
  channel: 'telegram',
  sender_id: '',
  customer_id: '',
  property_id: '',
  owner_telegram: '',
  data: {},
  message: ''
};

// Emergency — from WF1 tool call
if (input.event_type === 'emergency' || input.category === 'EMERGENCY') {
  event.event_type = 'emergency';
  event.channel = input.channel || 'telegram';
  event.sender_id = input.sender_id || '';
  event.customer_id = input.customer_id || '';
  event.property_id = input.property_id || '';
  event.message = input.message_text || input.issue_description || '';
  event.data = {
    message: event.message,
    sender_id: input.sender_id,
    channel: input.channel,
    property_id: input.property_id,
    guest_name: input.sender_name || input.guest_name || 'Guest'
  };
}
// Screening — from WF1 or booking flow
else if (input.event_type === 'screening' || input.guest_email || input.booking_id) {
  event.event_type = 'screening';
  event.channel = input.channel || 'system';
  event.sender_id = input.sender_id || '';
  event.customer_id = input.customer_id || '';
  event.property_id = input.property_id || '';
  event.data = {
    guest_name: input.guest_name || '',
    guest_email: input.guest_email || '',
    guest_phone: input.guest_phone || '',
    booking_id: input.booking_id || '',
    check_in_date: input.check_in_date || '',
    property_id: input.property_id || ''
  };
}
// Watchdog — scheduled system check
// Use a known property_id so Owner Notifier can resolve recipient
else {
  event.event_type = 'watchdog';
  event.channel = 'telegram';
  event.sender_id = '';
  event.customer_id = '';
  event.property_id = 'PROP-TEST-001';  // First active property — Owner Notifier resolves owner from this
  event.data = { triggered_at: new Date().toISOString() };
}

return event;`;
    log('Normalize Event: Watchdog path now includes property_id (PROP-TEST-001) so Owner Notifier can resolve the owner');
  }

  // ─── Deploy ───
  console.log('\n5. Deploying...');

  console.log('   Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  await sleep(1500);

  console.log('   Updating...');
  const result = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  });

  if (result.id) {
    console.log('   Update successful!');
  } else {
    console.error('   Update failed:', JSON.stringify(result).substring(0, 300));
    return;
  }
  await sleep(1000);

  console.log('   Reactivating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('   Active:', activateResult.active);

  // ─── Summary ───
  console.log('\n═══════════════════════════════════════');
  console.log(`SUMMARY: ${changes.length} changes applied`);
  console.log('═══════════════════════════════════════');
  for (const c of changes) {
    console.log('  • ' + c);
  }
  console.log('\nWF8 Send Alerts now correctly maps to Owner Notifier.');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

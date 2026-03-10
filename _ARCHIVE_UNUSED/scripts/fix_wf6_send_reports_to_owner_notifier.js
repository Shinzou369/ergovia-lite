/**
 * Fix WF6: Change "Send Reports" from SUB Universal Messenger to SUB Owner & Staff Notifier
 *
 * SUB: Owner & Staff Notifier (0L7HOkqENABlbPtT) expects:
 *   property_id  - auto-resolves owner contact from property_configurations
 *   event_type   - type of notification (morning_report, evening_report, etc.)
 *   message      - the message text
 *   notify       - "owner" or "staff"
 *   recipient_id - optional explicit recipient override
 *   customer_id  - customer UUID for cost tracking
 *
 * This is better for WF6 because the automations are for owners/staff,
 * and the notifier auto-resolves contacts from the property config.
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'ccEOaNnIwY6eeJOn';
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
  console.log('=== WF6: Switching Send Reports to SUB Owner & Staff Notifier ===\n');

  console.log('1. Downloading live WF6...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── Find and update Send Reports node ───
  console.log('2. Updating Send Reports node...');
  const sendNode = wf.nodes.find(n => n.name === 'Send Reports');
  if (!sendNode) {
    console.error('ERROR: Send Reports node not found!');
    return;
  }

  // Show current config
  console.log('   Current target: ' + (sendNode.parameters.workflowId?.value || sendNode.parameters.workflowId));

  // Change to Owner & Staff Notifier
  sendNode.parameters = {
    workflowId: {
      __rl: true,
      mode: 'id',
      value: OWNER_NOTIFIER_ID
    },
    workflowInputs: {
      mappingMode: 'defineBelow',
      value: {
        // property_id: auto-resolves owner contact
        property_id: "={{ $json.property_id || '' }}",
        // event_type: maps from the automation type (morning_check → morning_report, etc.)
        event_type: "={{ ($json.automation_type || $('Determine Automation').item.json.automation_type || 'report').replace('_check', '_report').replace('_reset', '_report') }}",
        // message: the actual report text
        message: "={{ $json.report_text || $json.text || $json.message || 'Automated report' }}",
        // notify: always owner for these daily automations
        notify: "owner",
        // recipient_id: fallback explicit recipient if property lookup fails
        recipient_id: "={{ $json.recipient || $json.owner_contact || '' }}",
        // customer_id: for cost tracking
        customer_id: "={{ $json.customer_id || '' }}"
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
  log('Send Reports: Changed from SUB Universal Messenger (UZMWfhnV6JmuwJXC) → SUB Owner & Staff Notifier (0L7HOkqENABlbPtT)');
  log('Send Reports: Mapped fields: property_id, event_type, message, notify=owner, recipient_id (fallback), customer_id');

  // ─── Also update the code nodes to pass property_id through ───
  // The code nodes (Template Morning, Template Evening, Template Weekly, Prepare Reset Message, Nightly Report)
  // need to include property_id in their output for the Owner Notifier to resolve contacts.
  console.log('\n3. Ensuring code nodes pass property_id...');

  const templateMorning = wf.nodes.find(n => n.name === 'Template Morning');
  if (templateMorning) {
    const code = templateMorning.parameters.jsCode || '';
    if (!code.includes('property_id')) {
      templateMorning.parameters.jsCode = code.replace(
        /return \{/,
        'return {\n  property_id: data.property_id,'
      );
      log('Template Morning: Added property_id to output');
    }
  }

  const templateEvening = wf.nodes.find(n => n.name === 'Template Evening');
  if (templateEvening) {
    const code = templateEvening.parameters.jsCode || '';
    if (!code.includes('property_id')) {
      templateEvening.parameters.jsCode = code.replace(
        /return \{/,
        'return {\n  property_id: data.property_id,'
      );
      log('Template Evening: Added property_id to output');
    }
  }

  const templateWeekly = wf.nodes.find(n => n.name === 'Template Weekly');
  if (templateWeekly) {
    const code = templateWeekly.parameters.jsCode || '';
    if (!code.includes('property_id')) {
      templateWeekly.parameters.jsCode = code.replace(
        /return \{/,
        'return {\n  property_id: data.property_id,'
      );
      log('Template Weekly: Added property_id to output');
    }
  }

  const prepareReset = wf.nodes.find(n => n.name === 'Prepare Reset Message');
  if (prepareReset) {
    const code = prepareReset.parameters.jsCode || '';
    if (!code.includes('property_id')) {
      prepareReset.parameters.jsCode = code.replace(
        /return \{/,
        'return {\n  property_id: data.property_id || "",'
      );
      log('Prepare Reset Message: Added property_id to output');
    }
  }

  const nightlyReport = wf.nodes.find(n => n.name === 'Nightly Report');
  if (nightlyReport) {
    const code = nightlyReport.parameters.jsCode || '';
    if (!code.includes('property_id')) {
      nightlyReport.parameters.jsCode = code.replace(
        /return \{/,
        'return {\n  property_id: d.property_id || "",'
      );
      log('Nightly Report: Added property_id to output');
    }
  }

  // Also check the LLM-generated paths — Generate Morning Brief, Generate Evening Update, Generate Weekly Report
  // These chainLlm nodes output { text: "..." } — the downstream Merge combines with Template outputs.
  // The property_id is available in the Template nodes, so Merge should carry it through.

  // ─── Deploy ───
  console.log('\n4. Deploying...');

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
  console.log('\nDone! WF6 Send Reports now uses SUB Owner & Staff Notifier.');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

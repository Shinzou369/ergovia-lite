const https = require('https');
const fs = require('fs');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const BASE = 'https://n8n.ergovia-ai.com';

// Canonical credential IDs (consolidate to these)
const CANONICAL_CREDS = {
  postgres: { id: 'sjaI08GtPbON8TLX', name: 'PostgreSQL - Client' },
  openAiApi: { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
  telegramApi: { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' }
};

// OLD credential IDs to replace
const OLD_CREDS = {
  'BWlLUMKn64aZsHi8': 'postgres',     // [Client] PostgreSQL → PostgreSQL - Client
  'sCKJDGWd6f8LxAw1': 'openAiApi',     // OpenAI - Client → [Client] OpenAI
  'm5CO4ySXIhlnUNcp': 'telegramApi'    // Telegram Bot - Client → [Client] Telegram Bot
};

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const changes = [];

function logChange(workflow, node, field, oldVal, newVal) {
  changes.push({ workflow, node, field, old: oldVal, new: newVal });
  console.log(`  [CHANGE] ${workflow} / ${node}: ${field}`);
  console.log(`    OLD: ${oldVal}`);
  console.log(`    NEW: ${newVal}`);
}

// Fix credential IDs across all nodes in a workflow
function fixCredentials(wfName, nodes) {
  let changed = false;
  for (const node of nodes) {
    if (!node.credentials) continue;
    for (const [credType, credInfo] of Object.entries(node.credentials)) {
      const oldType = OLD_CREDS[credInfo.id];
      if (oldType) {
        const canonical = CANONICAL_CREDS[oldType];
        logChange(wfName, node.name, `credential ${credType}`,
          `${credInfo.id} (${credInfo.name})`,
          `${canonical.id} (${canonical.name})`);
        node.credentials[credType] = { id: canonical.id, name: canonical.name };
        changed = true;
      }
    }
  }
  return changed;
}

// Fix WF1 parameterized queries
function fixWF1Queries(nodes) {
  let changed = false;

  for (const node of nodes) {
    // Get Customer ID: needs sender_id from Normalize Input
    if (node.id === 'get-customer-id') {
      if (!node.parameters.options?.queryParameters) {
        node.parameters.options = node.parameters.options || {};
        node.parameters.options.queryParameters = '={{ [$json.sender_id] }}';
        logChange('WF1', node.name, 'queryParameters', 'MISSING', '={{ [$json.sender_id] }}');
        changed = true;
      }
    }

    // Check Budget: needs customer_id from Merge Customer ID
    if (node.id === 'check-budget') {
      if (!node.parameters.options?.queryParameters) {
        node.parameters.options = node.parameters.options || {};
        node.parameters.options.queryParameters = '={{ [$json.customer_id] }}';
        logChange('WF1', node.name, 'queryParameters', 'MISSING', '={{ [$json.customer_id] }}');
        changed = true;
      }
    }

    // Log API Cost: needs 10 params from Calculate AI Cost
    if (node.id === 'log-api-cost') {
      if (!node.parameters.options?.queryParameters) {
        node.parameters.options = node.parameters.options || {};
        node.parameters.options.queryParameters = "={{ [$json.customer_id, 'openai', 'gpt-4o-mini', 'chat', $json.cost_calculation.input_tokens, $json.cost_calculation.output_tokens, $json.cost_calculation.cost_usd, 'WF1: AI Gateway', 'AI Agent', $execution.id] }}";
        logChange('WF1', node.name, 'queryParameters', 'MISSING', '={{ [customer_id, openai, gpt-4o-mini, chat, tokens..., cost, wf_name, node_name, exec_id] }}');
        changed = true;
      }
    }

    // Save Alert Record: needs customer_id and alert_type from Prepare Alert
    if (node.id === 'save-alert') {
      if (!node.parameters.options?.queryParameters) {
        node.parameters.options = node.parameters.options || {};
        node.parameters.options.queryParameters = '={{ [$json.customer_id, $json.alert_type] }}';
        logChange('WF1', node.name, 'queryParameters', 'MISSING', '={{ [$json.customer_id, $json.alert_type] }}');
        changed = true;
      }
    }
  }

  return changed;
}

// Fix SUB parameterized queries
function fixSUBQueries(nodes) {
  let changed = false;

  for (const node of nodes) {
    // Log Messaging Cost: needs 10 params
    if (node.id === 'log-messaging-cost') {
      if (!node.parameters.options?.queryParameters) {
        node.parameters.options = node.parameters.options || {};
        // Data comes from the cost calculation nodes: customer_id, channel, cost_usd, cost_type
        node.parameters.options.queryParameters = "={{ [$json.customer_id, $json.channel === 'sms' ? 'twilio' : ($json.channel === 'whatsapp' ? 'twilio' : 'telegram'), $json.channel, 'send_message', 0, 0, $json.cost_usd, 'SUB: Universal Messenger', 'Send Message', $execution.id] }}";
        logChange('SUB', node.name, 'queryParameters', 'MISSING', '={{ [customer_id, provider, model, operation, 0, 0, cost_usd, wf_name, node_name, exec_id] }}');
        changed = true;
      }
    }
  }

  return changed;
}

async function fixWorkflow(wfName, wfId, customFixer) {
  console.log(`\n========== Fixing ${wfName} (${wfId}) ==========`);

  // 1. Download workflow
  const { status, data: wf } = await apiCall('GET', `/api/v1/workflows/${wfId}`);
  if (status !== 200) {
    console.log(`  ERROR: Failed to download (${status})`);
    return false;
  }
  console.log(`  Downloaded: ${wf.nodes.length} nodes`);

  // 2. Apply credential fixes
  const credChanged = fixCredentials(wfName, wf.nodes);

  // 3. Apply custom fixes (query params, etc.)
  let customChanged = false;
  if (customFixer) {
    customChanged = customFixer(wf.nodes);
  }

  if (!credChanged && !customChanged) {
    console.log(`  No changes needed.`);
    return true;
  }

  // 4. Deactivate
  console.log(`  Deactivating...`);
  const deact = await apiCall('POST', `/api/v1/workflows/${wfId}/deactivate`);
  if (deact.status !== 200) {
    console.log(`  WARNING: Deactivate returned ${deact.status}: ${JSON.stringify(deact.data)}`);
  }
  await sleep(1000);

  // 5. Update - send the required fields for PUT
  console.log(`  Uploading fixed workflow...`);
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  };
  const update = await apiCall('PUT', `/api/v1/workflows/${wfId}`, updateBody);
  if (update.status !== 200) {
    console.log(`  ERROR: Update failed (${update.status}): ${JSON.stringify(update.data).substring(0, 500)}`);
    // Re-activate even if update failed
    await apiCall('POST', `/api/v1/workflows/${wfId}/activate`);
    return false;
  }
  console.log(`  Updated successfully.`);
  await sleep(1000);

  // 6. Reactivate
  console.log(`  Activating...`);
  const act = await apiCall('POST', `/api/v1/workflows/${wfId}/activate`);
  if (act.status !== 200) {
    console.log(`  WARNING: Activate returned ${act.status}: ${JSON.stringify(act.data)}`);
  }
  console.log(`  ${wfName} DONE.`);
  return true;
}

async function main() {
  console.log('=== Ergovia Lite Workflow Fix Script ===\n');
  console.log('Canonical credentials:');
  for (const [type, cred] of Object.entries(CANONICAL_CREDS)) {
    console.log(`  ${type}: ${cred.id} (${cred.name})`);
  }

  const results = {};

  // Fix WF1 (critical - has query param issues + cred changes)
  results.WF1 = await fixWorkflow('WF1', 'LP7YknAVPiQsidWq', fixWF1Queries);
  await sleep(2000);

  // Fix SUB (has query param issue)
  results.SUB = await fixWorkflow('SUB', 'UZMWfhnV6JmuwJXC', fixSUBQueries);
  await sleep(2000);

  // Fix remaining workflows (credential consolidation only)
  const credOnlyWorkflows = {
    WF2: 'NPInwpKv4Oriq04F',
    WF3: 'pEn69kwNtCEQ21y9',
    WF4: '5loDH75zrEDh9x5H',
    WF5: 'JWEu9Uz2JJ5XZeIX',
    WF7: 'Ay5QOyGAHG2l40s7',
    WF8: 'mLm2HaIRzNfIX5uh'
  };

  for (const [name, id] of Object.entries(credOnlyWorkflows)) {
    results[name] = await fixWorkflow(name, id, null);
    await sleep(2000);
  }

  // WF6 - should need no changes but let's verify
  results.WF6 = await fixWorkflow('WF6', 'ccEOaNnIwY6eeJOn', null);

  // Summary
  console.log('\n\n========== SUMMARY ==========');
  for (const [name, success] of Object.entries(results)) {
    console.log(`  ${name}: ${success ? 'OK' : 'FAILED'}`);
  }

  console.log(`\n  Total changes: ${changes.length}`);

  // Save change log
  fs.writeFileSync('change_log.json', JSON.stringify(changes, null, 2));
  console.log('  Change log saved to change_log.json');
}

main().catch(console.error);

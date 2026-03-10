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

// Use the PROVEN format: additionalFields.queryParameters with { "parameters": [...] }
// This is what WF4 uses and it works.
const FIXES = {
  // WF1: AI Gateway
  'LP7YknAVPiQsidWq': {
    'get-customer-id': {
      name: 'Get Customer ID',
      queryParameters: '={{ { "parameters": [$json.sender_id] } }}'
    },
    'check-budget': {
      name: 'Check Budget',
      queryParameters: '={{ { "parameters": [$json.customer_id] } }}'
    },
    'log-api-cost': {
      name: 'Log API Cost',
      queryParameters: '={{ { "parameters": [$json.customer_id, "openai", "gpt-4o-mini", "chat", $json.cost_calculation.input_tokens, $json.cost_calculation.output_tokens, $json.cost_calculation.cost_usd, "WF1: AI Gateway", "AI Agent", $execution.id] } }}'
    },
    'save-alert': {
      name: 'Save Alert Record',
      queryParameters: '={{ { "parameters": [$json.customer_id, $json.alert_type] } }}'
    }
  },
  // WF2: AI Booking Agent
  'NPInwpKv4Oriq04F': {
    'load-context': {
      name: 'Load Conversation Context',
      queryParameters: '={{ { "parameters": [$json.sender_id] } }}'
    },
    'check-competing': {
      name: 'Check Competing Offers',
      queryParameters: '={{ { "parameters": [$json.property_id, $json.detected_check_in, $json.detected_check_out, $json.contact_id] } }}'
    },
    'process-accept': {
      name: 'Process Accept Decision',
      queryParameters: '={{ { "parameters": [$json.deal_id] } }}'
    },
    'update-conflict-resolved': {
      name: 'Update Conflict Resolved',
      queryParameters: '={{ { "parameters": [$json.deal_id || $json.accepted?.deal_id, $json.property_id || $json.accepted?.property_id, $json.check_in_date || $json.accepted?.check_in_date] } }}'
    },
    'process-decline-all': {
      name: 'Process Decline All',
      queryParameters: '={{ { "parameters": [$json.property_id, $json.check_in_date] } }}'
    },
    'process-hold': {
      name: 'Process Hold Request',
      queryParameters: '={{ { "parameters": [$json.property_id, $json.check_in_date] } }}'
    }
  },
  // SUB: Universal Messenger
  'UZMWfhnV6JmuwJXC': {
    'log-messaging-cost': {
      name: 'Log Messaging Cost',
      queryParameters: '={{ { "parameters": [$json.customer_id, $json.channel === "sms" ? "twilio" : ($json.channel === "whatsapp" ? "twilio" : "telegram"), $json.channel, "send_message", 0, 0, $json.cost_usd, "SUB: Universal Messenger", "Send Message", $execution.id] } }}'
    }
  },
  // WF6: Daily Automations - also fix these since they use options format
  'ccEOaNnIwY6eeJOn': {
    'check-budget-morning': {
      name: 'Check Budget (Morning)',
      queryParameters: '={{ { "parameters": [$json.customer_id] } }}'
    },
    'check-budget-evening': {
      name: 'Check Budget (Evening)',
      queryParameters: '={{ { "parameters": [$json.customer_id] } }}'
    },
    'check-budget-weekly': {
      name: 'Check Budget (Weekly)',
      queryParameters: '={{ { "parameters": [$json.customer_id] } }}'
    }
  }
};

async function fixWorkflow(wfId, nodeFixes) {
  const { data: wf } = await apiCall('GET', `/api/v1/workflows/${wfId}`);
  const wfName = wf.name;
  console.log(`\n========== ${wfName} (${wfId}) ==========`);

  let changed = false;
  for (const node of wf.nodes) {
    const fix = nodeFixes[node.id];
    if (!fix) continue;

    console.log(`  Fixing "${node.name}" (${node.id})...`);

    // Use additionalFields.queryParameters (proven format)
    node.parameters.additionalFields = node.parameters.additionalFields || {};
    node.parameters.additionalFields.queryParameters = fix.queryParameters;

    // Remove from options if it was there (our previous failed attempt)
    if (node.parameters.options?.queryParameters) {
      delete node.parameters.options.queryParameters;
    }

    console.log(`    → additionalFields.queryParameters = ${fix.queryParameters.substring(0, 80)}...`);
    changed = true;
  }

  if (!changed) {
    console.log('  No changes needed.');
    return true;
  }

  // Deactivate
  console.log('  Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${wfId}/deactivate`);
  await sleep(1000);

  // Update
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

  // Verify the fix persisted
  console.log('  Verifying persistence...');
  const { data: verified } = await apiCall('GET', `/api/v1/workflows/${wfId}`);
  let allPersisted = true;
  for (const nodeId of Object.keys(nodeFixes)) {
    const vNode = verified.nodes.find(n => n.id === nodeId);
    if (vNode) {
      const hasAdditional = !!vNode.parameters?.additionalFields?.queryParameters;
      const hasOptions = !!vNode.parameters?.options?.queryParameters;
      const persisted = hasAdditional || hasOptions;
      console.log(`    ${vNode.name}: additionalFields=${hasAdditional}, options=${hasOptions} → ${persisted ? 'PERSISTED' : 'LOST!'}`);
      if (!persisted) allPersisted = false;
    }
  }

  // Activate
  console.log('  Activating...');
  const act = await apiCall('POST', `/api/v1/workflows/${wfId}/activate`);
  if (act.status !== 200) {
    console.log(`  WARNING: Activate returned ${act.status}: ${JSON.stringify(act.data).substring(0, 300)}`);
  } else {
    console.log(`  ACTIVATED.`);
  }

  return allPersisted;
}

async function main() {
  console.log('=== Fixing ALL parameterized queries with additionalFields format ===\n');

  const results = {};
  for (const [wfId, nodeFixes] of Object.entries(FIXES)) {
    results[wfId] = await fixWorkflow(wfId, nodeFixes);
    await sleep(2000);
  }

  console.log('\n\n=== RESULTS ===');
  for (const [wfId, success] of Object.entries(results)) {
    console.log(`  ${wfId}: ${success ? 'OK - persisted' : 'FAILED - not persisted'}`);
  }
}

main().catch(console.error);

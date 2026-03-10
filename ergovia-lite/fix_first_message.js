const http = require('http');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyODU4NzQxfQ.qkP1qoSqw5g5uRx6au6C1HY_DWhop6NSXZQVkbIKxNU';
const WF1_ID = 'LMkR7as0CSGDtjbE';

function apiReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '116.203.115.12', port: 5678, path: '/api/v1/' + path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}) }
    };
    const req = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, b: JSON.parse(d) }); } catch { resolve({ s: res.statusCode, b: d }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const { s, b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);
  if (s !== 200) { console.error('Failed to fetch WF1:', s); return; }
  console.log('Fetched:', wf.name, '| Nodes:', wf.nodes.length);

  // ── 1. Find key nodes ─────────────────────────────────────────────────────
  const budgetNode   = wf.nodes.find(n => n.name === 'Budget Available?');
  const agentNode    = wf.nodes.find(n => n.name === 'AI Agent');
  const payToolNode  = wf.nodes.find(n => n.name === 'Payment Processor Tool');

  if (!budgetNode || !agentNode) { console.error('Missing key nodes'); return; }

  console.log('Budget Available? pos:', budgetNode.position);
  console.log('AI Agent pos:', agentNode.position);

  // ── 2. Show current Budget Available? connections ─────────────────────────
  const conns = wf.connections;
  const budgetConns = conns['Budget Available?']?.main || [];
  console.log('\nBudget Available? connections:');
  budgetConns.forEach((outputs, i) => {
    (outputs || []).forEach(t => console.log(`  [out${i}] → ${t.node}`));
  });

  // ── 3. Find which output index of Budget Available? goes to AI Agent ───────
  let budgetToAgentIdx = -1;
  budgetConns.forEach((outputs, i) => {
    if ((outputs || []).some(t => t.node === 'AI Agent')) budgetToAgentIdx = i;
  });
  if (budgetToAgentIdx === -1) { console.error('Budget Available? → AI Agent connection not found'); return; }
  console.log('\nBudget Available? → AI Agent is at output index:', budgetToAgentIdx);

  // ── 4. Add new nodes ──────────────────────────────────────────────────────
  // Position between Budget Available? and AI Agent
  const checkPos = [budgetNode.position[0] + 224, budgetNode.position[1]];
  const prepPos  = [budgetNode.position[0] + 448, budgetNode.position[1]];

  const checkMsgCountNode = {
    id: 'check-msg-count-001',
    name: 'Check Message Count',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: checkPos,
    credentials: { postgres: { id: 'BWlLUMKn64aZsHi8', name: 'Postgres account' } },
    parameters: {
      operation: 'executeQuery',
      query: 'SELECT COUNT(*) as msg_count FROM n8n_chat_histories WHERE session_id = $1',
      additionalFields: {},
      options: {},
      values: [{ type: 'string', value: '={{ $json.sender_id }}' }]
    }
  };

  const prepareAIInputNode = {
    id: 'prepare-ai-input-001',
    name: 'Prepare AI Input',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: prepPos,
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Merge Check Message Count result back with the full data from Merge Customer ID
const mergeData = $('Merge Customer ID').item.json;
const msgCount = parseInt($input.item.json.msg_count ?? 0);

if (msgCount === 0) {
  // First message ever — override what the AI sees
  // Hide the booking request so AI can't process it, force welcome only
  return {
    ...mergeData,
    message_text: '[FIRST_MESSAGE_OVERRIDE] This guest is messaging for the very first time. ' +
      'You MUST send ONLY this exact welcome message and nothing else: ' +
      '"Hey there! 👋 Welcome! I would love to have your name so I can address you properly?" ' +
      'Do NOT call any tool. Do NOT process any booking or dates.',
    is_first_message: true,
    msg_count: msgCount
  };
}

return {
  ...mergeData,
  is_first_message: false,
  msg_count: msgCount
};`
    }
  };

  wf.nodes.push(checkMsgCountNode);
  wf.nodes.push(prepareAIInputNode);
  console.log('\nAdded nodes: Check Message Count, Prepare AI Input');

  // ── 5. Rewire connections ─────────────────────────────────────────────────
  // Budget Available?[budgetToAgentIdx] → Check Message Count (remove AI Agent)
  conns['Budget Available?'].main[budgetToAgentIdx] =
    (conns['Budget Available?'].main[budgetToAgentIdx] || [])
      .filter(t => t.node !== 'AI Agent');
  conns['Budget Available?'].main[budgetToAgentIdx].push(
    { node: 'Check Message Count', type: 'main', index: 0 }
  );

  // Check Message Count → Prepare AI Input
  conns['Check Message Count'] = {
    main: [[{ node: 'Prepare AI Input', type: 'main', index: 0 }]]
  };

  // Prepare AI Input → AI Agent
  conns['Prepare AI Input'] = {
    main: [[{ node: 'AI Agent', type: 'main', index: 0 }]]
  };

  console.log('Rewired: Budget Available? → Check Message Count → Prepare AI Input → AI Agent');

  // ── 6. Update AI Agent text expression → reference Prepare AI Input ────────
  if (agentNode.parameters?.text) {
    const oldText = agentNode.parameters.text;
    agentNode.parameters.text = "={{ $('Prepare AI Input').item.json.message_text }}";
    console.log('\nAI Agent text updated:');
    console.log('  Old:', oldText);
    console.log('  New:', agentNode.parameters.text);
  }

  // ── 7. Fix Payment Processor Tool — remove 4th $fromAI() param ────────────
  if (payToolNode) {
    const val = payToolNode.parameters.workflowInputs.value;
    // Rebuild with 3-parameter $fromAI() only
    payToolNode.parameters.workflowInputs.value = {
      property_id:    "={{ $fromAI('property_id',   'The property ID for the booking') }}",
      booking_id:     "={{ $fromAI('booking_id',    'The booking ID if already created') }}",
      guest_name:     "={{ $fromAI('guest_name',    'The guest full name') }}",
      guest_email:    "={{ $fromAI('guest_email',   'The guest email address') }}",
      guest_phone:    "={{ $fromAI('guest_phone',   'The guest phone number') }}",
      check_in_date:  "={{ $fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format') }}",
      check_out_date: "={{ $fromAI('check_out_date','Check-out date in YYYY-MM-DD format') }}",
      num_guests:     "={{ $fromAI('num_guests',    'Number of guests') }}",
      total_amount:   "={{ $fromAI('total_amount',  'Total booking amount') }}",
      currency:       "={{ $fromAI('currency',      'Currency code e.g. USD') }}",
      channel:        "={{ $('Merge Customer ID').item.json.channel }}",
      sender_id:      "={{ $('Merge Customer ID').item.json.sender_id }}",
      customer_id:    "={{ $('Merge Customer ID').item.json.customer_id }}"
    };
    console.log('\nPayment Processor Tool: removed 4th $fromAI() argument ✓');
  }

  // ── 8. Save ───────────────────────────────────────────────────────────────
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s: putS, b: putB } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  if (putS === 200) {
    console.log('\n✓ [LIVE] WF1 saved and reactivated');
    console.log('\nNew flow: Budget Available? → Check Message Count → Prepare AI Input → AI Agent');
    console.log('First messages will now be intercepted before reaching AI.');
  } else {
    console.error(`\n✗ PUT failed: ${putS}`);
    console.error(JSON.stringify(putB).slice(0, 500));
  }
})();

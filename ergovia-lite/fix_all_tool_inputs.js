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

function schemaField(id, type = 'string') {
  return { id, displayName: id, required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type };
}

(async () => {
  const { b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CALENDAR MANAGER TOOL — add dates + context inputs
  // ─────────────────────────────────────────────────────────────────────────────
  const calNode = wf.nodes.find(n => n.name === 'Calendar Manager Tool');
  if (calNode) {
    calNode.parameters.workflowInputs.value = {
      check_in_date:  "={{ $fromAI('check_in_date',  'Check-in date YYYY-MM-DD. Pass empty string when just listing all available properties.') }}",
      check_out_date: "={{ $fromAI('check_out_date', 'Check-out date YYYY-MM-DD. Pass empty string when just listing all available properties.') }}",
      customer_id:    "={{ $('Merge Customer ID').item.json.customer_id }}",
      property_id:    "={{ $('Merge Customer ID').item.json.property_id }}",
      sender_id:      "={{ $('Normalize Input').item.json.sender_id }}",
      channel:        "={{ $('Normalize Input').item.json.channel }}"
    };
    calNode.parameters.workflowInputs.schema = [
      schemaField('check_in_date'),
      schemaField('check_out_date'),
      schemaField('customer_id'),
      schemaField('property_id'),
      schemaField('sender_id'),
      schemaField('channel')
    ];
    calNode.parameters.workflowInputs.convertFieldsToString = true;
    console.log('✓ Calendar Manager Tool — inputs wired');
  } else { console.warn('✗ Calendar Manager Tool not found'); }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. OFFER CONFLICT CHECKER — add $fromAI dates + context inputs
  // ─────────────────────────────────────────────────────────────────────────────
  const offerNode = wf.nodes.find(n => n.name === 'Offer Conflict Checker');
  if (offerNode) {
    offerNode.parameters.workflowInputs.value = {
      check_in_date:  "={{ $fromAI('check_in_date',  'Guest check-in date YYYY-MM-DD') }}",
      check_out_date: "={{ $fromAI('check_out_date', 'Guest check-out date YYYY-MM-DD') }}",
      property_id:    "={{ $('Merge Customer ID').item.json.property_id }}",
      customer_id:    "={{ $('Merge Customer ID').item.json.customer_id }}",
      sender_id:      "={{ $('Normalize Input').item.json.sender_id }}",
      sender_name:    "={{ $('Normalize Input').item.json.sender_name || '' }}",
      channel:        "={{ $('Normalize Input').item.json.channel }}"
    };
    offerNode.parameters.workflowInputs.schema = [
      schemaField('check_in_date'),
      schemaField('check_out_date'),
      schemaField('property_id'),
      schemaField('customer_id'),
      schemaField('sender_id'),
      schemaField('sender_name'),
      schemaField('channel')
    ];
    offerNode.parameters.workflowInputs.convertFieldsToString = false;
    console.log('✓ Offer Conflict Checker — inputs wired');
  } else { console.warn('✗ Offer Conflict Checker not found'); }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PROPERTY OPERATIONS TOOL — add $fromAI fields + context
  // ─────────────────────────────────────────────────────────────────────────────
  const propOpsNode = wf.nodes.find(n => n.name === 'Property Operations Tool');
  if (propOpsNode) {
    propOpsNode.parameters.workflowInputs.value = {
      operation_type:    "={{ $fromAI('operation_type',    'Type of operation: maintenance, cleaning, issue_report, vendor_request') }}",
      issue_description: "={{ $fromAI('issue_description', 'Full description of the issue or request from the guest') }}",
      property_id:       "={{ $('Merge Customer ID').item.json.property_id }}",
      customer_id:       "={{ $('Merge Customer ID').item.json.customer_id }}",
      sender_id:         "={{ $('Normalize Input').item.json.sender_id }}",
      channel:           "={{ $('Normalize Input').item.json.channel }}"
    };
    propOpsNode.parameters.workflowInputs.schema = [
      schemaField('operation_type'),
      schemaField('issue_description'),
      schemaField('property_id'),
      schemaField('customer_id'),
      schemaField('sender_id'),
      schemaField('channel')
    ];
    propOpsNode.parameters.workflowInputs.convertFieldsToString = true;
    console.log('✓ Property Operations Tool — inputs wired');
  } else { console.warn('✗ Property Operations Tool not found'); }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. EMERGENCY HANDLER TOOL — add $fromAI fields + context
  // ─────────────────────────────────────────────────────────────────────────────
  const emergNode = wf.nodes.find(n => n.name === 'Emergency Handler Tool');
  if (emergNode) {
    emergNode.parameters.workflowInputs.value = {
      event_type:   "={{ $fromAI('event_type',   'Emergency type: fire, medical, break_in, gas_leak, flooding, structural_damage') }}",
      category:     "={{ $fromAI('category',     'Severity category based on guest description') }}",
      message_text: "={{ $('Merge Customer ID').item.json.message_text }}",
      property_id:  "={{ $('Merge Customer ID').item.json.property_id }}",
      customer_id:  "={{ $('Merge Customer ID').item.json.customer_id }}",
      sender_id:    "={{ $('Normalize Input').item.json.sender_id }}",
      channel:      "={{ $('Normalize Input').item.json.channel }}",
      booking_id:   '',
      guest_name:   '',
      guest_email:  '',
      guest_phone:  '',
      check_in_date:''
    };
    emergNode.parameters.workflowInputs.schema = [
      schemaField('event_type'),
      schemaField('category'),
      schemaField('message_text'),
      schemaField('property_id'),
      schemaField('customer_id'),
      schemaField('sender_id'),
      schemaField('channel'),
      schemaField('booking_id'),
      schemaField('guest_name'),
      schemaField('guest_email'),
      schemaField('guest_phone'),
      schemaField('check_in_date')
    ];
    emergNode.parameters.workflowInputs.convertFieldsToString = true;
    console.log('✓ Emergency Handler Tool — inputs wired');
  } else { console.warn('✗ Emergency Handler Tool not found'); }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. PAYMENT PROCESSOR TOOL — re-enable + update description
  // ─────────────────────────────────────────────────────────────────────────────
  const ppNode = wf.nodes.find(n => n.name === 'Payment Processor Tool');
  if (ppNode) {
    // Re-enable
    delete ppNode.disabled;
    // Update description to match the actual 4-field schema (no email/phone)
    ppNode.parameters.description =
      'Create a booking and generate a payment link. ONLY call this tool when ALL THREE GATE CONDITIONS are met: ' +
      '(1) You have the guest\'s name from Stage 2. ' +
      '(2) Calendar Manager was already called and returned the total price. ' +
      '(3) The guest EXPLICITLY said YES to booking — confirmed with no question mark in their message. ' +
      'Required fields you must provide: guest_name, check_in_date (YYYY-MM-DD), check_out_date (YYYY-MM-DD), total_amount (from Calendar Manager). ' +
      'Do NOT call for pricing questions, availability checks, or any message containing a "?".';
    console.log('✓ Payment Processor Tool — re-enabled + description updated');
  } else { console.warn('✗ Payment Processor Tool not found'); }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SYSTEM MESSAGE — strengthen Stage 6 pre-call checklist
  // ─────────────────────────────────────────────────────────────────────────────
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (agentNode) {
    let sys = agentNode.parameters.options.systemMessage;

    // Replace Stage 6 section to add explicit pre-call checklist
    const OLD_S6_TRIGGER =
`STAGE 6: BOOKING CONFIRMATION
─────────────────────────────
TRIGGER: Guest EXPLICITLY confirms they want to book — e.g., "yes", "let's do it", "book it", "I'm ready", "sure, proceed". This is NOT triggered by questions about dates, "check again", or availability requests.`;

    const NEW_S6_TRIGGER =
`STAGE 6: BOOKING CONFIRMATION
─────────────────────────────
TRIGGER: Guest EXPLICITLY confirms they want to book — e.g., "yes", "let's do it", "book it", "I'm ready", "sure, proceed".
NOT triggered by: questions (any "?"), "check again", availability requests, pricing questions, or "yes, what properties..." type messages.

BEFORE calling any tool in Stage 6 — answer all three:
□ Do I have the guest's name from Stage 2? (If NO → go back to Stage 2)
□ Did I call Calendar Manager and receive a total price? (If NO → go back to Stage 4+5)
□ Did the guest say YES to THAT specific price with no question in the same message? (If NO → stay in Stage 4+5)
Only proceed if all three are YES.`;

    if (sys.includes(OLD_S6_TRIGGER)) {
      sys = sys.replace(OLD_S6_TRIGGER, NEW_S6_TRIGGER);
      console.log('✓ Stage 6 pre-call checklist added');
    } else {
      console.warn('✗ Stage 6 trigger text not found — skipping');
    }

    agentNode.parameters.options.systemMessage = sys;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Save
  // ─────────────────────────────────────────────────────────────────────────────
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s, b } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  if (s === 200) {
    console.log('\n✓ All fixes saved — WF1 reactivated');
  } else {
    console.error(`\n✗ Save failed: HTTP ${s}`);
    if (b?.message) console.error('Error:', b.message);
  }
})();

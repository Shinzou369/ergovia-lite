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
  const { b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);

  // ── FIX 1: System message — add "?" block to Payment Processor Gate ──────────
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agentNode) { console.error('AI Agent node not found'); return; }

  let sys = agentNode.parameters.options.systemMessage;

  const OLD_OVERRIDE = `⛔ OVERRIDE: If the guest's message contains "check again", "check for me", "is it available", "check availability", or any date-related question → call Calendar Manager instead. Do NOT call Payment Processor.`;
  const NEW_OVERRIDE = `⛔ OVERRIDE — Any of these → do NOT call Payment Processor:
- Message contains a "?" (question mark) — the guest is asking a question, not confirming a booking
- Message contains "check again", "check for me", "is it available", "check availability"
- Message asks about properties, dates, or availability
When any of the above is true → call Calendar Manager Tool instead.`;

  if (sys.includes(OLD_OVERRIDE)) {
    sys = sys.replace(OLD_OVERRIDE, NEW_OVERRIDE);
    agentNode.parameters.options.systemMessage = sys;
    console.log('✓ Fix 1: Payment Processor Gate "?" override added');
  } else {
    console.warn('✗ Fix 1: Override text not found — skipping');
  }

  // ── FIX 2: Payment Processor Tool — reduce to 4 $fromAI() fields ─────────────
  const ppNode = wf.nodes.find(n => n.name === 'Payment Processor Tool');
  if (!ppNode) { console.error('Payment Processor Tool node not found'); return; }

  ppNode.parameters.workflowInputs.value = {
    property_id:   "={{ $('Merge Customer ID').item.json.property_id }}",
    booking_id:    '',
    guest_name:    "={{ $fromAI('guest_name',    'Full name of the guest') }}",
    guest_email:   '',
    guest_phone:   '',
    check_in_date: "={{ $fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format') }}",
    check_out_date:"={{ $fromAI('check_out_date','Check-out date in YYYY-MM-DD format') }}",
    num_guests:    '1',
    total_amount:  "={{ $fromAI('total_amount',  'Total price as returned by Calendar Manager') }}",
    currency:      'USD'
  };
  console.log('✓ Fix 2: Payment Processor Tool reduced to 4 $fromAI() fields');

  // ── Save ──────────────────────────────────────────────────────────────────────
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  console.log(s === 200 ? '\n✓ Done — WF1 saved and reactivated' : `\n✗ Failed: HTTP ${s}`);
})();

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

function apply(sys, label, oldStr, newStr) {
  if (sys.includes(oldStr)) {
    console.log(`✓ ${label}`);
    return sys.replace(oldStr, newStr);
  }
  console.warn(`✗ ${label} — text not found, skipping`);
  return sys;
}

(async () => {
  const { b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);
  const agent = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agent) { console.error('AI Agent not found'); return; }

  let sys = agent.parameters.options.systemMessage;
  console.log('System message length before:', sys.length);

  // ── C1: Remove standalone BOOKING ORDER section ───────────────────────────────
  sys = apply(sys, 'C1: Remove standalone BOOKING ORDER section',
    `══════════════════════════════════════════════════════════
BOOKING ORDER – MANDATORY
═════════════════════════════════════\uFFFD════════════════════

1. Calendar Manager (check availability)
2. Offer Conflict Checker (check competing offers)
3. Payment Processor (create booking + payment link)

Never skip steps.
Never confirm booking without conflict check.
Never send payment link without conflict check returning CLEAR.

`,
    ``
  );

  // ── C2: Remove circular Step 0 from Stage 6 BOOKING ORDER, renumber ──────────
  sys = apply(sys, 'C2: Remove circular Step 0, renumber Stage 6 BOOKING ORDER',
    `BOOKING ORDER — MANDATORY (Never skip steps):
0. Confirm Calendar Manager was already called (Stage 4+5). If not → call it first.
1. Call Offer Conflict Checker (check if other guests are competing)
2. If CLEAR → Call Payment Processor (create booking + payment link)
3. If COMPETING → Tell guest the owner is reviewing multiple offers`,
    `BOOKING ORDER — MANDATORY:
1. Call Offer Conflict Checker (check if other guests are competing)
2. If CLEAR → Call Payment Processor (create booking + payment link)
3. If COMPETING → Tell guest the owner is reviewing multiple offers`
  );

  // ── C3a: Remove duplicate DATE RULE line ──────────────────────────────────────
  sys = apply(sys, 'C3a: Remove duplicate "NEVER guess" DATE RULE line',
    `- NEVER guess or calculate a day name. Only copy names exactly as written in the calendar above.\n`,
    ``
  );

  // ── C3b: Add DATE LOOKUP priority note after the first occurrence ─────────────
  sys = apply(sys, 'C3b: Add DATE LOOKUP priority clarification',
    `- NEVER calculate or guess day names manually — this causes errors. Only use names from the 60-day calendar.`,
    `- NEVER calculate or guess day names manually — this causes errors. Only use names from the 60-day calendar.
- Priority for day names: If a [DATE LOOKUP: ...] block appears at the start of the guest's message, use those values first (server-computed, 100% accurate). Otherwise use the 60-Day Calendar below.`
  );

  // ── C4: Fix error message — add question mark ─────────────────────────────────
  sys = apply(sys, 'C4: Fix error message to comply with one-question-mark rule',
    `If a tool returns an error: tell the guest "I hit a brief technical issue, give me just a moment."`,
    `If a tool returns an error: tell the guest "I hit a brief technical issue — could you give me just a moment?"`
  );

  // ── C5: Fix Calendar Manager description ─────────────────────────────────────
  sys = apply(sys, 'C5: Broaden Calendar Manager tool description',
    `1. Calendar Manager — Check availability for specific dates`,
    `1. Calendar Manager — Check availability for specific dates, OR call without dates to list all available properties`
  );

  // ── C6: Simplify FIRST MESSAGE RULE to reference Stage 1 ─────────────────────
  sys = apply(sys, 'C6: Simplify FIRST MESSAGE RULE to reference Stage 1',
    `If the conversation history has ZERO previous messages from this guest:
→ Your ONLY response is: "Hey there! 👋 Welcome! I would love to have your name so I can address you properly?"
→ Do NOT call any tool.
→ Do NOT process any booking details, dates, or requests.
→ Ignore everything except returning that exact welcome message.
This cannot be skipped regardless of what the guest says in their first message.`,
    `If the conversation history has ZERO previous messages from this guest, apply Stage 1 (Welcome) from the Conversation Flow Engine below. It cannot be skipped regardless of what the guest says.`
  );

  console.log('System message length after:', sys.length);

  agent.parameters.options.systemMessage = sys;

  // ── Save ─────────────────────────────────────────────────────────────────────
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  console.log(s === 200 ? '\n✓ All 6 contradictions fixed — WF1 saved and reactivated' : `\n✗ Failed: HTTP ${s}`);
})();

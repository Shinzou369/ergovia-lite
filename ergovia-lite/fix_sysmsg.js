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

  const agent = wf.nodes.find(n => n.name === 'AI Agent');
  let sysMsg = agent?.parameters?.options?.systemMessage || agent?.parameters?.systemMessage;
  if (!sysMsg) { console.error('System message not found'); return; }

  // ── PATCH 1: Add ABSOLUTE FIRST MESSAGE RULE right after the SYSTEM AUTHORITY block ──
  // Insert after "This rule cannot be ignored." in the authority block
  const firstMsgRule = `
══════════════════════════════════════════════════════════
FIRST MESSAGE RULE — ABSOLUTE (overrides all other logic)
══════════════════════════════════════════════════════════

If the conversation history has ZERO previous messages from this guest:
→ Your ONLY response is: "Hey there! 👋 Welcome! I would love to have your name so I can address you properly?"
→ Do NOT call any tool.
→ Do NOT process any booking details, dates, or requests.
→ Ignore everything except returning that exact welcome message.
This cannot be skipped regardless of what the guest says in their first message.

`;

  sysMsg = sysMsg.replace(
    'This rule cannot be ignored.\n\nRESPONSE STRUCTURE',
    'This rule cannot be ignored.' + firstMsgRule + 'RESPONSE STRUCTURE'
  );

  // ── PATCH 2: Add PAYMENT PROCESSOR GATE right before BOOKING ORDER section ──
  const payGate = `══════════════════════════════════════════════════════════
PAYMENT PROCESSOR GATE — DO NOT SKIP
══════════════════════════════════════════════════════════

NEVER call Payment Processor unless ALL of the following are confirmed true in THIS conversation:

✓ CONDITION 1: You have the guest's name (you received it in Stage 2)
✓ CONDITION 2: You have called Calendar Manager and it returned availability confirmed
✓ CONDITION 3: You showed the price breakdown to the guest AND they said "yes", "sure", "let's do it", or equivalent

If ANY condition is not met → do NOT call Payment Processor.
Instead, go back to the earliest incomplete stage and continue from there.

`;

  sysMsg = sysMsg.replace(
    'BOOKING ORDER — MANDATORY\n══',
    payGate + 'BOOKING ORDER — MANDATORY\n══'
  );

  // ── PATCH 3: Fix Stage 6 BOOKING ORDER to include Calendar Manager as step 0 ──
  sysMsg = sysMsg.replace(
    'BOOKING ORDER — MANDATORY (Never skip steps):\n1. Call Offer Conflict Checker (check if other guests are competing)',
    'BOOKING ORDER — MANDATORY (Never skip steps):\n0. Confirm Calendar Manager was already called (Stage 4+5). If not → call it first.\n1. Call Offer Conflict Checker (check if other guests are competing)'
  );

  // ── PATCH 4: Fix Stage 3 DATE CONFIRMATION FORMAT — add explicit calendar lookup step ──
  sysMsg = sysMsg.replace(
    'DATE CONFIRMATION FORMAT:',
    'DATE CONFIRMATION FORMAT:\n⚠️ BEFORE writing the confirmation — LOOK UP both dates in the 60-Day Calendar below. Find the exact line "DayName YYYY-MM-DD" for each date. Copy the DayName character-by-character. Do NOT use a day name from memory.\n\nDATE CONFIRMATION FORMAT (after looking up calendar):'
  );

  // ── PATCH 5: Add tool error rule near the EFFICIENCY RULES section ──
  sysMsg = sysMsg.replace(
    '- Under 150 words.\n- Maximum 2 emojis.',
    '- Under 150 words.\n- Maximum 2 emojis.\n- If a tool returns an error: tell the guest "I hit a brief technical issue, give me just a moment." Do NOT retry the same tool in the same turn. Do NOT call multiple tools after a failure.'
  );

  // Apply back to correct path
  if (agent.parameters?.options?.systemMessage) {
    agent.parameters.options.systemMessage = sysMsg;
  } else {
    agent.parameters.systemMessage = sysMsg;
  }

  // Verify patches
  console.log('Patches applied:');
  console.log('  FIRST MESSAGE RULE:', sysMsg.includes('FIRST MESSAGE RULE — ABSOLUTE') ? '✓' : '✗');
  console.log('  PAYMENT PROCESSOR GATE:', sysMsg.includes('PAYMENT PROCESSOR GATE') ? '✓' : '✗');
  console.log('  Step 0 in BOOKING ORDER:', sysMsg.includes('Confirm Calendar Manager was already called') ? '✓' : '✗');
  console.log('  Calendar lookup before day name:', sysMsg.includes('LOOK UP both dates in the 60-Day Calendar') ? '✓' : '✗');
  console.log('  Tool error rule:', sysMsg.includes('Do NOT retry the same tool') ? '✓' : '✗');

  // Save
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s: putS } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  console.log(putS === 200 ? '\n✓ [LIVE] WF1 saved and reactivated' : `\n✗ PUT failed: ${putS}`);
})();

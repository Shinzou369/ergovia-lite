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
  const agent = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agent) { console.error('AI Agent node not found'); return; }

  let sys = agent.parameters.options.systemMessage;
  console.log('System message length before:', sys.length);

  // ── FIX 1: Tighten Stage 6 TRIGGER ──────────────────────────────────────────
  const old1 = `STAGE 6: BOOKING CONFIRMATION
─────────────────────────────
TRIGGER: Guest agrees to price OR says they want to book`;
  const new1 = `STAGE 6: BOOKING CONFIRMATION
─────────────────────────────
TRIGGER: Guest EXPLICITLY confirms they want to book — e.g., "yes", "let's do it", "book it", "I'm ready", "sure, proceed". This is NOT triggered by questions about dates, "check again", or availability requests.`;

  if (sys.includes(old1)) {
    sys = sys.replace(old1, new1);
    console.log('✓ Fix 1 applied: Stage 6 TRIGGER tightened');
  } else {
    console.warn('✗ Fix 1: Stage 6 TRIGGER text not found — skipping');
  }

  // ── FIX 2: Add "check again" case to Stage Detection ─────────────────────────
  const old2 = `□ Price revealed and accepted → STAGE 6 (Booking)`;
  const new2 = `□ Guest asks to "check again", "re-check", "check availability", or mentions dates with a question → STAGE 4+5 (re-run Calendar Manager)
□ Price revealed and guest explicitly agrees to book → STAGE 6 (Booking)`;

  if (sys.includes(old2)) {
    sys = sys.replace(old2, new2);
    console.log('✓ Fix 2 applied: "check again" case added to Stage Detection');
  } else {
    console.warn('✗ Fix 2: Stage Detection text not found — skipping');
  }

  // ── FIX 3: Add override block in Payment Processor Gate ──────────────────────
  const old3 = `NEVER call Payment Processor unless ALL of the following are confirmed true in THIS conversation:`;
  const new3 = `NEVER call Payment Processor unless ALL of the following are confirmed true in THIS conversation:

⛔ OVERRIDE: If the guest's message contains "check again", "check for me", "is it available", "check availability", or any date-related question → call Calendar Manager instead. Do NOT call Payment Processor.`;

  if (sys.includes(old3)) {
    sys = sys.replace(old3, new3);
    console.log('✓ Fix 3 applied: Payment Processor Gate override added');
  } else {
    console.warn('✗ Fix 3: Payment Processor Gate text not found — skipping');
  }

  console.log('System message length after:', sys.length);

  agent.parameters.options.systemMessage = sys;

  // Save
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

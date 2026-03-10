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
  console.log('Fetched:', wf.name);

  // ── FIX 1: Merge Customer ID — expand calendar loop 14 → 60 ───────────────
  const mergeNode = wf.nodes.find(n => n.name === 'Merge Customer ID');
  if (!mergeNode) { console.error('Merge Customer ID node not found'); return; }

  const oldCode = mergeNode.parameters.jsCode;
  console.log('\nMerge Customer ID loop (current):');
  const loopMatch = oldCode.match(/for \(let i = 0; i < \d+; i\+\+\)/);
  console.log(' ', loopMatch?.[0] ?? '(not found)');

  // Replace 14 with 60 in the calendar loop
  const newCode = oldCode.replace(
    /for \(let i = 0; i < 14; i\+\+\)/,
    'for (let i = 0; i < 60; i++)'
  );

  if (newCode === oldCode) {
    console.log('✗ Loop replacement failed — pattern not matched. Searching for any loop...');
    const allLoops = oldCode.match(/for \(let i = 0; i < \d+; i\+\+\)/g);
    console.log('  Found loops:', allLoops);
    return;
  }

  mergeNode.parameters.jsCode = newCode;
  console.log('  → Changed to: for (let i = 0; i < 60; i++) ✓');

  // ── FIX 2: AI Agent system message ────────────────────────────────────────
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agentNode) { console.error('AI Agent node not found'); return; }

  const sysMsgPath = agentNode.parameters?.systemMessage ? 'systemMessage' : 'options.systemMessage';
  let sysMsg = agentNode.parameters?.systemMessage || agentNode.parameters?.options?.systemMessage;

  if (!sysMsg) { console.error('System message not found'); return; }

  // a) "14-Day Calendar" → "60-Day Calendar"
  sysMsg = sysMsg.replace(/14-Day Calendar/g, '60-Day Calendar');

  // b) Update system message heading reference
  sysMsg = sysMsg.replace(/14-day calendar/g, '60-day calendar');

  // c) Replace the DATE RULES block with stronger version
  // Find and replace the "If a date cannot be found" rule
  sysMsg = sysMsg
    .replace(
      /- If a date cannot be found in the calendar, ask the guest to clarify\./,
      '- If the guest mentions dates BEYOND the 60-day calendar, respond exactly: "Those dates are outside my visible calendar. Could you confirm your exact check-in and check-out dates so I can look them up?"\n- NEVER guess or calculate a day name. Only copy names exactly as written in the calendar above.'
    );

  // d) Also strengthen the "Never calculate day names manually" rule
  sysMsg = sysMsg.replace(
    '- Never calculate day names manually.',
    '- NEVER calculate or guess day names manually — this causes errors. Only use names from the 60-day calendar.'
  );

  // Apply back
  if (agentNode.parameters.systemMessage) {
    agentNode.parameters.systemMessage = sysMsg;
  } else {
    agentNode.parameters.options.systemMessage = sysMsg;
  }

  // Verify changes
  console.log('\nSystem message changes:');
  console.log('  "60-Day Calendar" present:', sysMsg.includes('60-Day Calendar'));
  console.log('  "60-day calendar" present:', sysMsg.includes('60-day calendar'));
  console.log('  Hard boundary rule present:', sysMsg.includes('Those dates are outside my visible calendar'));
  console.log('  NEVER calculate rule updated:', sysMsg.includes('NEVER calculate or guess day names manually'));

  // ── Save ──────────────────────────────────────────────────────────────────
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s: putS } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  console.log(putS === 200
    ? '\n✓ [LIVE] WF1 saved and reactivated — calendar is now 60 days'
    : `\n✗ PUT failed: ${putS}`);
})();

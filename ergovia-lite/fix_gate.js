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
  let sysMsg = agent?.parameters?.options?.systemMessage || agent?.parameters?.systemMessage;

  // Show what's around BOOKING ORDER
  const idx = sysMsg.indexOf('BOOKING ORDER');
  console.log('=== Text around BOOKING ORDER ===');
  console.log(JSON.stringify(sysMsg.slice(idx - 80, idx + 100)));

  // The gate already has "MANDATORY" in the heading after our last fix
  // Insert the gate block right before the "BOOKING ORDER — MANDATORY" heading
  const gateBlock = `\n══════════════════════════════════════════════════════════\nPAYMENT PROCESSOR GATE — DO NOT SKIP\n══════════════════════════════════════════════════════════\n\nNEVER call Payment Processor unless ALL of the following are confirmed true in THIS conversation:\n\n✓ CONDITION 1: You have the guest's name (you received it in Stage 2)\n✓ CONDITION 2: You have called Calendar Manager and it returned availability confirmed\n✓ CONDITION 3: You showed the price breakdown AND the guest said "yes", "sure", "let's do it", or equivalent\n\nIf ANY condition is not met → do NOT call Payment Processor. Go back to the earliest incomplete stage.\n\n`;

  // Find BOOKING ORDER and insert before it
  const bookingIdx = sysMsg.indexOf('BOOKING ORDER — MANDATORY');
  if (bookingIdx === -1) {
    console.log('BOOKING ORDER — MANDATORY not found, searching for BOOKING ORDER...');
    const idx2 = sysMsg.indexOf('BOOKING ORDER');
    console.log('Found at:', idx2, '| text:', JSON.stringify(sysMsg.slice(idx2, idx2+50)));
  } else {
    sysMsg = sysMsg.slice(0, bookingIdx) + gateBlock + sysMsg.slice(bookingIdx);
    console.log('\nGate inserted before BOOKING ORDER ✓');
    console.log('PAYMENT PROCESSOR GATE present:', sysMsg.includes('PAYMENT PROCESSOR GATE'));

    if (agent.parameters?.options?.systemMessage) agent.parameters.options.systemMessage = sysMsg;
    else agent.parameters.systemMessage = sysMsg;

    await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
    await sleep(600);
    const { s } = await apiReq('PUT', `workflows/${WF1_ID}`, {
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings, staticData: wf.staticData
    });
    await sleep(600);
    await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });
    console.log(s === 200 ? '✓ WF1 saved and reactivated' : `✗ PUT failed: ${s}`);
  }
})();

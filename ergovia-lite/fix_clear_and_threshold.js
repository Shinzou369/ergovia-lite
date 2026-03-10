const http = require('http');
const { Client } = require('pg');
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
  // ── FIX 1: Clear ALL corrupted chat history ────────────────────────────────
  console.log('=== FIX 1: Clear n8n_chat_histories ===');
  const pg = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026',
    ssl: false, connectionTimeoutMillis: 5000
  });
  await pg.connect();
  const before = await pg.query('SELECT session_id, COUNT(*) as cnt FROM n8n_chat_histories GROUP BY session_id');
  console.log('Before:', before.rows);
  const del = await pg.query('DELETE FROM n8n_chat_histories');
  console.log(`✓ Deleted ${del.rowCount} rows`);
  await pg.end();

  // ── FIX 2: Update Prepare AI Input — raise threshold to < 3 ──────────────
  console.log('\n=== FIX 2: Update Prepare AI Input threshold ===');
  const { b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);

  const prepNode = wf.nodes.find(n => n.name === 'Prepare AI Input');
  if (!prepNode) { console.error('Prepare AI Input not found'); return; }

  // Raise threshold: treat as first message if fewer than 3 rows in history
  // (single failed executions might save 1-2 rows — don't let that block welcome)
  prepNode.parameters.jsCode = `// Merge Check Message Count result with Merge Customer ID data
const mergeData = $('Merge Customer ID').item.json;
const msgCount = parseInt($input.item.json.msg_count ?? 0);

// Treat as first message if < 3 rows in history.
// A single failed execution can save 1-2 rows — we don't want that
// to block the welcome message. A real ongoing conversation has 3+.
if (msgCount < 3) {
  return {
    ...mergeData,
    message_text: '[FIRST_MESSAGE_OVERRIDE] This guest is messaging for the very first time (or starting fresh). ' +
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
};`;

  console.log('Threshold updated: msg_count < 3 = first message ✓');

  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });
  console.log(s === 200 ? '✓ WF1 saved and reactivated' : `✗ Failed: ${s}`);

  console.log('\nDone. Test again — history is clean.');
})();

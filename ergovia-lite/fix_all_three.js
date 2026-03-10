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
  // ── FIX 1: Clear chat history ─────────────────────────────────────────────
  console.log('=== FIX 1: Clear n8n_chat_histories ===');
  const pg = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026',
    ssl: false, connectionTimeoutMillis: 6000
  });

  try {
    await pg.connect();
    const existing = await pg.query('SELECT session_id, COUNT(*) as msgs FROM n8n_chat_histories GROUP BY session_id');
    console.log('Sessions before clear:', existing.rows);
    const del = await pg.query('DELETE FROM n8n_chat_histories');
    console.log(`✓ Deleted ${del.rowCount} rows — all chat history cleared`);
    await pg.end();
  } catch (err) {
    console.log('✗ PostgreSQL unreachable from Windows:', err.message);
    console.log('  → Run on server: psql -U ergovia_user -d ergovia_db -c "DELETE FROM n8n_chat_histories;"');
  }

  // ── FIX 2 & 3: Patch WF1 ─────────────────────────────────────────────────
  console.log('\n=== FIX 2 & 3: Patch WF1 ===');
  const { s, b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);
  if (s !== 200) { console.error('Failed to fetch WF1:', s); return; }

  // Fix system message — remove "Calculate Price" from AVAILABLE TOOLS list
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (agentNode?.parameters?.systemMessage) {
    const before = agentNode.parameters.systemMessage;
    agentNode.parameters.systemMessage = before
      .replace(/\n4\. Calculate Price[^\n]*/, '')
      .replace('5. Property Operations', '4. Property Operations')
      .replace('6. Emergency Handler', '5. Emergency Handler');
    const removed = !agentNode.parameters.systemMessage.includes('Calculate Price');
    console.log('Calculate Price removed from system message:', removed ? '✓' : '✗ (not found, may already be gone)');
  }

  // Fix Calendar Manager Tool description
  const calNode = wf.nodes.find(n => n.name === 'Calendar Manager Tool');
  if (calNode) {
    calNode.parameters.description =
      '=Check property availability for specific dates, show pricing, AND list all available properties. ' +
      'To check availability + price for a stay: pass check_in_date and check_out_date in YYYY-MM-DD format. ' +
      'To list all available properties (when guest asks "what properties do you have", "what do you offer", or similar — NO dates needed): ' +
      'call this tool WITHOUT any dates — do NOT pass check_in_date or check_out_date. ' +
      'IMPORTANT: Today is {{ $(\'Merge Customer ID\').item.json.today }}. Dates must be on or after today. ' +
      'This tool handles all pricing calculations — never use Calculate Price tool separately.';
    console.log('Calendar Manager Tool description updated ✓');
  }

  // Save WF1
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s: putS } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  if (putS === 200) {
    console.log('✓ WF1 saved and reactivated');
  } else {
    console.error(`✗ WF1 PUT failed: ${putS}`);
  }

  console.log('\n=== DONE ===');
})();

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
  // Clear chat history
  const pg = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026',
    ssl: false, connectionTimeoutMillis: 5000
  });
  await pg.connect();
  const del = await pg.query('DELETE FROM n8n_chat_histories');
  console.log(`✓ Cleared ${del.rowCount} chat history rows`);
  await pg.end();

  // Fetch WF1
  const { b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);
  console.log('Fetched:', wf.name, '| Nodes before:', wf.nodes.length);

  // Remove the two nodes
  wf.nodes = wf.nodes.filter(n => n.name !== 'Check Message Count' && n.name !== 'Prepare AI Input');
  console.log('Nodes after removal:', wf.nodes.length);

  // Fix connections: Budget Available? → AI Agent directly (remove the middle nodes)
  const conns = wf.connections;

  // Remove orphaned connection entries
  delete conns['Check Message Count'];
  delete conns['Prepare AI Input'];

  // Restore: Budget Available?[out0] → AI Agent
  if (conns['Budget Available?']?.main?.[0]) {
    conns['Budget Available?'].main[0] = conns['Budget Available?'].main[0]
      .filter(t => t.node !== 'Check Message Count' && t.node !== 'AI Agent');
    conns['Budget Available?'].main[0].push({ node: 'AI Agent', type: 'main', index: 0 });
  }
  console.log('Restored: Budget Available? → AI Agent');

  // Restore AI Agent text expression to Merge Customer ID
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (agentNode?.parameters) {
    agentNode.parameters.text = "={{ $('Merge Customer ID').item.json.message_text }}";
    console.log('Restored AI Agent text → Merge Customer ID');
  }

  // Save
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  console.log(s === 200 ? '\n✓ Done — flow restored to Budget Available? → AI Agent directly' : `\n✗ Failed: ${s}`);
})();

const http = require('http');
const { Client } = require('pg');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyODU4NzQxfQ.qkP1qoSqw5g5uRx6au6C1HY_DWhop6NSXZQVkbIKxNU';

function apiReq(method, path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '116.203.115.12', port: 5678, path: '/api/v1/' + path, method,
      headers: { 'X-N8N-API-KEY': API_KEY }
    };
    const req = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.end();
  });
}

(async () => {
  // 1. Check Chat Memory node sessionKey
  const wf = await apiReq('GET', 'workflows/LMkR7as0CSGDtjbE');
  const memNode = wf.nodes.find(n => n.type && n.type.includes('memoryPostgresChat'));
  console.log('=== Chat Memory node ===');
  console.log('Name:', memNode?.name);
  console.log('Parameters:', JSON.stringify(memNode?.parameters, null, 2));

  // 2. Check what's actually in n8n_chat_histories
  const pg = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026',
    ssl: false, connectionTimeoutMillis: 5000
  });
  await pg.connect();

  const rows = await pg.query('SELECT session_id, COUNT(*) as cnt FROM n8n_chat_histories GROUP BY session_id ORDER BY cnt DESC');
  console.log('\n=== n8n_chat_histories sessions (current) ===');
  console.log(rows.rows);

  // Show a sample message to see format
  const sample = await pg.query('SELECT session_id, message FROM n8n_chat_histories LIMIT 3');
  console.log('\n=== Sample rows ===');
  sample.rows.forEach(r => console.log('session_id:', r.session_id, '| message:', JSON.stringify(r.message).slice(0, 120)));

  await pg.end();
})();

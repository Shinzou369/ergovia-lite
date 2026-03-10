require('dotenv').config();
const https = require('https');
function apiReq(method, endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com/api/v1/' + endpoint);
    const opts = { hostname: url.hostname, port: 443, path: url.pathname + url.search, method, headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY } };
    const r = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })); });
    r.on('error', reject); r.end();
  });
}
async function main() {
  const list = await apiReq('GET', 'workflows?limit=200');
  const wf1 = (list.body.data || []).find(w => w.name === '[LIVE] WF1: AI Gateway - Unified Entry Point');
  if (!wf1) { console.log('WF1 not found'); return; }
  console.log('ID:', wf1.id);
  const full = await apiReq('GET', 'workflows/' + wf1.id);
  const nodes = full.body.nodes || [];
  const conns = full.body.connections || {};
  console.log('\nAll nodes (' + nodes.length + '):');
  nodes.forEach((n, i) => {
    console.log(i+1 + '.', n.name, '|', n.type, '| pos:', n.position);
  });
  console.log('\nConnections (outgoing):');
  Object.entries(conns).forEach(([src, c]) => {
    (c.main || []).forEach((slot, idx) => {
      (slot || []).forEach(t => console.log(' ', src, '→', t.node));
    });
  });
}
main().catch(console.error);

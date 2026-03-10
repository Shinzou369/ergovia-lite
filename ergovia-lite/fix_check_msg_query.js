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
  const checkNode = wf.nodes.find(n => n.name === 'Check Message Count');
  if (!checkNode) { console.error('Check Message Count not found'); return; }

  // Fix: embed sender_id directly in the query via n8n expression
  // Remove the values array (not supported in executeQuery), use expression in query
  checkNode.parameters = {
    operation: 'executeQuery',
    query: "=SELECT COUNT(*) as msg_count FROM n8n_chat_histories WHERE session_id = '{{ $json.sender_id }}'",
    additionalFields: {},
    options: {}
  };

  console.log('Fixed query:', checkNode.parameters.query);

  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });
  console.log(s === 200 ? '✓ Fixed and reactivated' : `✗ Failed: ${s}`);
})();

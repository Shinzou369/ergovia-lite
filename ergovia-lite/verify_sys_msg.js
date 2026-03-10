const http = require('http');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyODU4NzQxfQ.qkP1qoSqw5g5uRx6au6C1HY_DWhop6NSXZQVkbIKxNU';

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
  const { b: wf } = await apiReq('GET', 'workflows/LMkR7as0CSGDtjbE');
  const agent = wf.nodes.find(n => n.name === 'AI Agent');

  // Find where system message actually lives
  const sysMsg = agent?.parameters?.systemMessage
    || agent?.parameters?.options?.systemMessage
    || null;

  const path = agent?.parameters?.systemMessage ? 'parameters.systemMessage'
    : agent?.parameters?.options?.systemMessage ? 'parameters.options.systemMessage'
    : 'NOT FOUND';

  console.log('System message path:', path);
  console.log('Contains "Calculate Price":', sysMsg?.includes('Calculate Price'));
  console.log('Contains "4. Calculate Price":', sysMsg?.includes('4. Calculate Price'));

  // Find the AVAILABLE TOOLS section
  const toolsIdx = sysMsg?.indexOf('AVAILABLE TOOLS');
  if (toolsIdx !== -1) {
    console.log('\nAVAILABLE TOOLS section:');
    console.log(sysMsg.slice(toolsIdx, toolsIdx + 400));
  }

  // If Calculate Price is still there, fix it now
  if (sysMsg?.includes('Calculate Price')) {
    console.log('\n→ Fixing now...');

    let fixed = sysMsg
      .replace(/\n4\. Calculate Price[^\n]*/g, '')
      .replace('5. Property Operations', '4. Property Operations')
      .replace('6. Emergency Handler', '5. Emergency Handler');

    if (agent.parameters.systemMessage) {
      agent.parameters.systemMessage = fixed;
    } else {
      agent.parameters.options.systemMessage = fixed;
    }

    await apiReq('PATCH', 'workflows/LMkR7as0CSGDtjbE', { active: false });
    await sleep(500);
    const { s } = await apiReq('PUT', 'workflows/LMkR7as0CSGDtjbE', {
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings, staticData: wf.staticData
    });
    await sleep(500);
    await apiReq('PATCH', 'workflows/LMkR7as0CSGDtjbE', { active: true });
    console.log(s === 200 ? '✓ Calculate Price removed from system message' : `✗ Failed: ${s}`);
  } else {
    console.log('\n✓ Calculate Price already absent from system message');
  }
})();

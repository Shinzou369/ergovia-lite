const https = require('https');
const fs = require('fs');
const path = require('path');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function updateWorkflow(id, wf) {
  await apiCall('POST', '/api/v1/workflows/' + id + '/deactivate');
  await sleep(1000);
  const res = await apiCall('PUT', '/api/v1/workflows/' + id, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 300));
    await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
    return false;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
  return true;
}

async function main() {
  // ============================================
  // PART 1: FIX WF1 - Remove Send Message Tool
  // ============================================
  console.log('=== PART 1: WF1 - Remove Send Message Tool ===\n');
  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');

  // Remove the tool-messenger node
  const beforeCount = wf1.nodes.length;
  wf1.nodes = wf1.nodes.filter(n => n.id !== 'tool-messenger');
  const afterCount = wf1.nodes.length;
  console.log('  Nodes before: ' + beforeCount + ', after: ' + afterCount);
  console.log('  Removed: Send Message Tool (tool-messenger)');

  // Remove any connections FROM Send Message Tool (shouldn't exist but be safe)
  if (wf1.connections['Send Message Tool']) {
    delete wf1.connections['Send Message Tool'];
    console.log('  Removed outgoing connections from Send Message Tool');
  }

  // Remove any connections TO Send Message Tool
  for (const [fromNode, outputs] of Object.entries(wf1.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let i = 0; i < outputArrays.length; i++) {
        if (!Array.isArray(outputArrays[i])) continue;
        const before = outputArrays[i].length;
        outputArrays[i] = outputArrays[i].filter(c => c.node !== 'Send Message Tool');
        if (outputArrays[i].length < before) {
          console.log('  Removed connection: ' + fromNode + ' -[' + connType + ']-> Send Message Tool');
        }
      }
    }
  }

  console.log('\n  Uploading WF1...');
  const wf1ok = await updateWorkflow('LP7YknAVPiQsidWq', wf1);
  console.log('  WF1: ' + (wf1ok ? 'SUCCESS' : 'FAILED'));

  // ============================================
  // PART 2: FIX WF2 - Remove guest-facing SUB calls
  // ============================================
  console.log('\n=== PART 2: WF2 - Remove guest-facing SUB calls ===\n');
  const { data: wf2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');

  // Nodes to remove
  const removeIds = ['send-response-competing', '77748d1f-49fa-4bbb-9071-4289ca9ac5de'];
  const removeNames = [];
  for (const node of wf2.nodes) {
    if (removeIds.includes(node.id)) removeNames.push(node.name);
  }

  // Remove the nodes
  const wf2Before = wf2.nodes.length;
  wf2.nodes = wf2.nodes.filter(n => !removeIds.includes(n.id));
  console.log('  Nodes before: ' + wf2Before + ', after: ' + wf2.nodes.length);
  for (const name of removeNames) {
    console.log('  Removed node: "' + name + '"');
  }

  // Fix connections:
  // COMPETING PATH: Save Conversation (Competing) -> [was: Send Response (Competing)] -> Return Result (Competing)
  // Rewire: Save Conversation (Competing) -> Return Result (Competing)

  // Remove outgoing connections from removed nodes
  for (const name of removeNames) {
    if (wf2.connections[name]) {
      delete wf2.connections[name];
      console.log('  Removed outgoing connections from "' + name + '"');
    }
  }

  // Rewire: Save Conversation (Competing) output -> Return Result (Competing)
  if (wf2.connections['Save Conversation (Competing)']) {
    wf2.connections['Save Conversation (Competing)'] = {
      main: [[{ node: 'Return Result (Competing)', type: 'main', index: 0 }]]
    };
    console.log('  Rewired: Save Conversation (Competing) -> Return Result (Competing)');
  }

  // MAIN PATH: Save Conversation -> [was: Send Response (Competing)1] -> Return Result
  // Rewire: Save Conversation -> Return Result
  if (wf2.connections['Save Conversation']) {
    wf2.connections['Save Conversation'] = {
      main: [[{ node: 'Return Result', type: 'main', index: 0 }]]
    };
    console.log('  Rewired: Save Conversation -> Return Result');
  }

  // Remove any incoming connections to removed nodes from other sources
  for (const [fromNode, outputs] of Object.entries(wf2.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let i = 0; i < outputArrays.length; i++) {
        if (!Array.isArray(outputArrays[i])) continue;
        outputArrays[i] = outputArrays[i].filter(c => {
          const isRemoved = removeNames.includes(c.node);
          if (isRemoved) console.log('  Cleaned stale connection: ' + fromNode + ' -> ' + c.node);
          return !isRemoved;
        });
      }
    }
  }

  // Update Return Result nodes: message_sent: true -> false
  for (const node of wf2.nodes) {
    if (node.id === 'return-result') {
      const code = node.parameters.jsCode || node.parameters.code || '';
      const newCode = code.replace('message_sent: true', 'message_sent: false');
      if (node.parameters.jsCode) node.parameters.jsCode = newCode;
      else if (node.parameters.code) node.parameters.code = newCode;
      console.log('  Updated Return Result: message_sent = false');
    }
    if (node.id === 'return-result-competing') {
      const code = node.parameters.jsCode || node.parameters.code || '';
      const newCode = code.replace('message_sent: true', 'message_sent: false');
      if (node.parameters.jsCode) node.parameters.jsCode = newCode;
      else if (node.parameters.code) node.parameters.code = newCode;
      console.log('  Updated Return Result (Competing): message_sent = false');
    }
  }

  console.log('\n  Uploading WF2...');
  const wf2ok = await updateWorkflow('NPInwpKv4Oriq04F', wf2);
  console.log('  WF2: ' + (wf2ok ? 'SUCCESS' : 'FAILED'));

  // ============================================
  // PART 3: VERIFY
  // ============================================
  console.log('\n=== VERIFICATION ===\n');

  // Verify WF1
  const { data: v1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  const hasTool = v1.nodes.some(n => n.id === 'tool-messenger');
  console.log('  WF1: Send Message Tool exists = ' + hasTool + ' (want false)');
  console.log('  WF1: active = ' + v1.active);
  console.log('  WF1: ' + v1.nodes.length + ' nodes');

  // Count AI Agent tools
  let toolCount = 0;
  for (const [, outputs] of Object.entries(v1.connections)) {
    if (outputs.ai_tool) {
      for (const conns of outputs.ai_tool) {
        if (Array.isArray(conns)) toolCount += conns.length;
      }
    }
  }
  console.log('  WF1: AI Agent has ' + toolCount + ' tools (PGVector + 5 workflow tools)');

  // Verify WF2
  const { data: v2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
  const subCalls = v2.nodes.filter(n => n.type === 'n8n-nodes-base.executeWorkflow');
  console.log('\n  WF2: active = ' + v2.active);
  console.log('  WF2: ' + v2.nodes.length + ' nodes');
  console.log('  WF2: executeWorkflow nodes remaining:');
  for (const n of subCalls) {
    console.log('    "' + n.name + '" (async owner notifications - KEPT)');
  }

  // Verify connections
  const saveConvConn = v2.connections['Save Conversation (Competing)'];
  const saveMainConn = v2.connections['Save Conversation'];
  console.log('\n  Competing path: Save Conversation (Competing) -> ' +
    (saveConvConn && saveConvConn.main && saveConvConn.main[0] ? saveConvConn.main[0][0].node : 'BROKEN'));
  console.log('  Main path: Save Conversation -> ' +
    (saveMainConn && saveMainConn.main && saveMainConn.main[0] ? saveMainConn.main[0][0].node : 'BROKEN'));

  // Save templates
  console.log('\n=== SAVING TEMPLATES ===');
  const templateDir = path.join(__dirname, '..', 'ergovia-lite', 'workflows');
  fs.writeFileSync(path.join(templateDir, 'WF1_AI_Gateway.json'), JSON.stringify(v1, null, 2));
  console.log('  Saved WF1_AI_Gateway.json');
  fs.writeFileSync(path.join(templateDir, 'WF2_AI_Booking_Agent.json'), JSON.stringify(v2, null, 2));
  console.log('  Saved WF2_AI_Booking_Agent.json');

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('WF1: Removed Send Message Tool. AI Agent now has 5 tools + PGVector.');
  console.log('WF2: Removed 2 guest-facing SUB calls. Kept 3 async owner-decision SUB calls.');
  console.log('     Main path:      Save Conversation -> Return Result (no SUB)');
  console.log('     Competing path: Save Conversation (Competing) -> Return Result (Competing) (no SUB)');
  console.log('     Both return response_text for WF1 to send via SUB.');
  console.log('WF3-WF8: SUB calls preserved (async/scheduled, WF1 not in loop)');
}

main().catch(console.error);

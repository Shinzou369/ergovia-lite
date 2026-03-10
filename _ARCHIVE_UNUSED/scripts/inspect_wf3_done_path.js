const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const wf3 = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');

  console.log('=== WF3 DONE PATH ANALYSIS ===\n');

  // 1. Merge Results node details
  const mergeNode = wf3.nodes.find(n => n.name === 'Merge Results');
  console.log('--- Merge Results ---');
  console.log('  Type: ' + mergeNode.type);
  console.log('  TypeVersion: ' + mergeNode.typeVersion);
  console.log('  Position: ' + JSON.stringify(mergeNode.position));
  console.log('  Parameters: ' + JSON.stringify(mergeNode.parameters, null, 2));

  // 2. What connects TO Merge Results
  console.log('\n--- What feeds INTO Merge Results ---');
  for (const [fromNode, outputs] of Object.entries(wf3.connections)) {
    if (!outputs.main) continue;
    for (let i = 0; i < outputs.main.length; i++) {
      if (!outputs.main[i]) continue;
      for (const conn of outputs.main[i]) {
        if (conn.node === 'Merge Results') {
          console.log('  "' + fromNode + '" [out' + i + '] → Merge Results');
        }
      }
    }
  }

  // 3. What connects FROM Merge Results
  console.log('\n--- What comes AFTER Merge Results ---');
  const mrConns = wf3.connections['Merge Results'];
  if (!mrConns || !mrConns.main) {
    console.log('  NOTHING — dead end');
  } else {
    for (let i = 0; i < mrConns.main.length; i++) {
      if (!mrConns.main[i] || mrConns.main[i].length === 0) continue;
      for (const conn of mrConns.main[i]) {
        console.log('  [out' + i + '] → "' + conn.node + '"');
      }
    }
  }

  // 4. Loop Properties details
  const loopNode = wf3.nodes.find(n => n.name === 'Loop Properties');
  console.log('\n--- Loop Properties ---');
  console.log('  Type: ' + loopNode.type);
  console.log('  Parameters: ' + JSON.stringify(loopNode.parameters, null, 2));

  // 5. Full loop path (what happens INSIDE the loop)
  console.log('\n--- DAILY SYNC LOOP PATH ---');
  const traceFrom = (nodeName, depth) => {
    if (depth > 10) return;
    const conns = wf3.connections[nodeName];
    if (!conns || !conns.main) { console.log('  '.repeat(depth + 1) + '(end)'); return; }
    for (let i = 0; i < conns.main.length; i++) {
      if (!conns.main[i] || conns.main[i].length === 0) continue;
      for (const conn of conns.main[i]) {
        const label = conns.main.length > 1 ? ' [out' + i + ']' : '';
        console.log('  '.repeat(depth + 1) + '→' + label + ' "' + conn.node + '"');
        if (conn.node !== 'Loop Properties') traceFrom(conn.node, depth + 1);
        else console.log('  '.repeat(depth + 2) + '(back to loop)');
      }
    }
  };

  console.log('  "Loop Properties"');
  traceFrom('Loop Properties', 1);

  // 6. Detect Conflicts code (what data does it produce?)
  const detectNode = wf3.nodes.find(n => n.name === 'Detect Conflicts');
  if (detectNode) {
    console.log('\n--- Detect Conflicts Code ---');
    console.log(detectNode.parameters.jsCode || '(no code)');
  }

  // 7. Prepare Parameters code (how is_availability_check is set)
  const prepNode = wf3.nodes.find(n => n.name === 'Prepare Parameters');
  if (prepNode) {
    console.log('\n--- Prepare Parameters Code ---');
    console.log(prepNode.parameters.jsCode || '(no code)');
  }
}

main().catch(console.error);

const https = require('https');
const { Client } = require('pg');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname, method: 'GET',
      headers: { 'X-N8N-API-KEY': API_KEY }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // 1. Get actual property_configurations columns
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();
  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns " +
    "WHERE table_name = 'property_configurations' ORDER BY ordinal_position"
  );
  console.log('=== property_configurations COLUMNS ===');
  for (const c of cols.rows) {
    console.log('  ' + c.column_name + ' (' + c.data_type + ')');
  }

  // Also check bookings table columns
  const bookCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns " +
    "WHERE table_name = 'bookings' ORDER BY ordinal_position"
  );
  console.log('\n=== bookings COLUMNS ===');
  for (const c of bookCols.rows) {
    console.log('  ' + c.column_name + ' (' + c.data_type + ')');
  }
  await client.end();

  // 2. Get WF3 connections
  const wf3 = await apiCall('/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('\n=== WF3 CONNECTIONS ===');
  for (const [fromNode, outputs] of Object.entries(wf3.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let i = 0; i < outputArrays.length; i++) {
        if (!Array.isArray(outputArrays[i])) continue;
        for (const conn of outputArrays[i]) {
          const typeLabel = connType === 'main' ? '[out' + i + ']' : '[' + connType + ']';
          console.log('  ' + fromNode + ' ' + typeLabel + ' → ' + conn.node);
        }
      }
    }
  }

  // 3. Show Detect Conflicts code
  const detectNode = wf3.nodes.find(n => n.name === 'Detect Conflicts');
  if (detectNode) {
    console.log('\n=== Detect Conflicts code ===');
    console.log(detectNode.parameters.jsCode || detectNode.parameters.code || '(no code)');
  }

  // 4. Show Continue Loop connections and what connects TO it
  console.log('\n=== Continue Loop analysis ===');
  const continueNode = wf3.nodes.find(n => n.id === 'continue-loop');
  if (continueNode) {
    console.log('  Node type: ' + continueNode.type);
    console.log('  Outgoing: ' + JSON.stringify(wf3.connections['Continue Loop'] || 'none'));
  }
  // What connects TO Loop Properties (the splitInBatches)?
  for (const [fromNode, outputs] of Object.entries(wf3.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (const conns of outputArrays) {
        if (!Array.isArray(conns)) continue;
        for (const c of conns) {
          if (c.node === 'Loop Properties') {
            console.log('  → Loop Properties input from: ' + fromNode + ' [' + connType + ']');
          }
        }
      }
    }
  }

  // 5. Show Merge Results node
  const mergeNode = wf3.nodes.find(n => n.name === 'Merge Results');
  if (mergeNode) {
    console.log('\n=== Merge Results ===');
    console.log('  type: ' + mergeNode.type);
    console.log('  params: ' + JSON.stringify(mergeNode.parameters));
  }
}

main().catch(console.error);

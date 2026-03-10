/**
 * Inspect V4 WF1 (Calculate Price Tool) and V4 WF4 (Payment Processor)
 * Also fetch execution 851 for context
 */

const https = require('https');
const { Client } = require('pg');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.end();
  });
}

async function main() {
  // 1. Get V4 WF1 - Calculate Price Tool
  console.log('=== V4 WF1: Calculate Price Tool ===\n');
  const wf1 = await apiCall('GET', '/api/v1/workflows/tvSLRSiOmNdkEfA2');

  const calcTool = wf1.nodes.find(n => n.name === 'Calculate Price Tool');
  if (calcTool) {
    console.log('Type:', calcTool.type);
    console.log('Parameters:');
    console.log(JSON.stringify(calcTool.parameters, null, 2));
  }

  // 2. Get V4 WF4 - Payment Processor (full workflow)
  console.log('\n=== V4 WF4: Payment Processor ===\n');
  const wf4 = await apiCall('GET', '/api/v1/workflows/iaBWaaIjFUrzBcon');
  console.log('Name:', wf4.name);
  console.log('Nodes:', wf4.nodes?.length);
  console.log('Active:', wf4.active);

  // List all nodes
  console.log('\nNodes:');
  for (const n of (wf4.nodes || [])) {
    console.log('  ' + n.name + ' (' + n.type + ')');
  }

  // Find nodes with SQL queries referencing num_guests
  for (const n of (wf4.nodes || [])) {
    const params = JSON.stringify(n.parameters || {});
    if (params.includes('num_guests')) {
      console.log('\n  >>> Node "' + n.name + '" references num_guests:');
      if (n.parameters.query) {
        console.log('  Query:', n.parameters.query.substring(0, 500));
      }
      if (n.parameters.operation) {
        console.log('  Operation:', n.parameters.operation);
      }
      // Check for column mappings
      if (n.parameters.columns) {
        console.log('  Columns:', JSON.stringify(n.parameters.columns));
      }
      if (n.parameters.fieldsUi) {
        console.log('  FieldsUI:', JSON.stringify(n.parameters.fieldsUi));
      }
    }
  }

  // 3. Check Payment Processor Tool node in WF1
  console.log('\n=== WF1: Payment Processor Tool node ===\n');
  const payTool = wf1.nodes.find(n => n.name === 'Payment Processor Tool');
  if (payTool) {
    console.log('Type:', payTool.type);
    console.log('Parameters:', JSON.stringify(payTool.parameters, null, 2).substring(0, 1000));
  }

  // 4. Check execution 851
  console.log('\n=== Execution 851 ===\n');
  const exec = await apiCall('GET', '/api/v1/executions/851?includeData=true');
  if (exec.data?.resultData?.runData) {
    const runData = exec.data.resultData.runData;

    // AI Agent metadata - what did it pass to the tools?
    if (runData['AI Agent']) {
      const meta = runData['AI Agent'][0]?.metadata;
      if (meta?.subNodeExecutionData) {
        console.log('AI Agent tool calls:');
        const actions = meta.subNodeExecutionData.actions || [];
        for (const a of actions) {
          console.log('  Tool:', a.action?.nodeName);
          console.log('  Input:', JSON.stringify(a.action?.input));
        }
        // Check previous requests too
        const prev = meta.subNodeExecutionData.metadata?.previousRequests || [];
        for (const p of prev) {
          console.log('  Prev tool:', p.action?.tool);
          console.log('  Prev input:', JSON.stringify(p.action?.toolInput));
        }
      }
    }
  }

  // 5. Check bookings table schema
  console.log('\n=== Bookings table schema ===\n');
  const pg = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await pg.connect();

  const cols = await pg.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'bookings'
    ORDER BY ordinal_position
  `);
  console.log('bookings columns:');
  for (const c of cols.rows) {
    console.log('  ' + c.column_name + ' (' + c.data_type + ')' + (c.is_nullable === 'NO' ? ' NOT NULL' : '') + (c.column_default ? ' DEFAULT ' + c.column_default : ''));
  }

  await pg.end();
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

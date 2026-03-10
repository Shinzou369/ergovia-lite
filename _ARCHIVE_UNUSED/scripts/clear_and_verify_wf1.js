/**
 * 1. Verify V3 date fix is deployed in V4 WF1
 * 2. Clear chat memory for the test user so old wrong answers don't persist
 * 3. Check latest execution to see if dates were computed
 */

const https = require('https');
const { Client } = require('pg');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'tvSLRSiOmNdkEfA2';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // ═══ STEP 1: Verify the fix is deployed ═══
  console.log('=== STEP 1: Verify V3 date fix is deployed ===\n');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);

  const mergeNode = wf.nodes.find(n => n.name === 'Merge Customer ID');
  if (mergeNode) {
    const code = mergeNode.parameters.jsCode || '';
    const hasCalendar = code.includes('calendarLines');
    const hasToday = code.includes('today_full');
    const hasYear = code.includes('today_year');
    console.log('Merge Customer ID:');
    console.log('  Has calendar computation:', hasCalendar);
    console.log('  Has today_full:', hasToday);
    console.log('  Has today_year:', hasYear);
    if (!hasCalendar) {
      console.log('  \u274C FIX NOT DEPLOYED! Code node missing date computation');
      console.log('  Code preview:', code.substring(0, 200));
    } else {
      console.log('  \u2713 Date computation is present');
    }
  }

  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (agentNode) {
    const sysMsg = agentNode.parameters?.options?.systemMessage || '';
    const hasCalRef = sysMsg.includes('.calendar');
    const hasTodayRef = sysMsg.includes('.today');
    const hasNow = sysMsg.includes('$now');
    console.log('\nAI Agent system prompt:');
    console.log('  References .calendar:', hasCalRef);
    console.log('  References .today:', hasTodayRef);
    console.log('  Uses $now (broken):', hasNow);
    if (hasNow) {
      console.log('  \u274C Still using $now expressions (these don\'t resolve!)');
    }
    if (hasCalRef && hasTodayRef && !hasNow) {
      console.log('  \u2713 Uses simple field references (should work)');
    }
  }

  console.log('\nWorkflow active:', wf.active);

  // ═══ STEP 2: Check latest execution ═══
  console.log('\n=== STEP 2: Check latest execution ===\n');
  const execs = await apiCall('GET', `/api/v1/executions?workflowId=${WF_ID}&limit=3`);
  const execList = execs.data || [];

  for (const e of execList) {
    console.log(`Execution ${e.id}: ${e.status} at ${e.stoppedAt}`);
  }

  if (execList.length > 0) {
    const latest = await apiCall('GET', `/api/v1/executions/${execList[0].id}?includeData=true`);
    if (latest.data?.resultData?.runData?.['Merge Customer ID']) {
      const mergeOut = latest.data.resultData.runData['Merge Customer ID'][0]?.data?.main?.[0]?.[0]?.json;
      console.log('\nMerge Customer ID output from latest execution:');
      console.log('  today:', mergeOut?.today);
      console.log('  today_full:', mergeOut?.today_full);
      console.log('  today_year:', mergeOut?.today_year);
      console.log('  calendar (first 200 chars):', (mergeOut?.calendar || 'NOT PRESENT').substring(0, 200));

      if (!mergeOut?.today) {
        console.log('\n  \u274C Date fields are MISSING from output!');
        console.log('  Full output keys:', Object.keys(mergeOut || {}));
      } else {
        console.log('\n  \u2713 Date fields present — fix IS deployed');
      }
    }

    // Check what the AI passed to Calendar Manager
    if (latest.data?.resultData?.runData?.['AI Agent']) {
      const agentMeta = latest.data.resultData.runData['AI Agent'][0]?.metadata;
      console.log('\nAI Agent metadata:', JSON.stringify(agentMeta).substring(0, 500));
    }
  }

  // ═══ STEP 3: Clear chat memory ═══
  console.log('\n=== STEP 3: Clear chat memory ===\n');

  const pg = new Client({
    host: '116.203.115.12',
    port: 5432,
    database: 'ergovia_db',
    user: 'ergovia_user',
    password: 'ergovia_secure_2026'
  });

  try {
    await pg.connect();
    console.log('Connected to PostgreSQL');

    // Check if chat_memory table exists
    const tableCheck = await pg.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE '%chat%' OR table_name LIKE '%memory%'
    `);
    console.log('Memory-related tables:', tableCheck.rows.map(r => r.table_name));

    if (tableCheck.rows.length > 0) {
      for (const row of tableCheck.rows) {
        const tableName = row.table_name;
        const count = await pg.query(`SELECT COUNT(*) FROM "${tableName}"`);
        console.log(`  ${tableName}: ${count.rows[0].count} rows`);

        // Show sample
        const sample = await pg.query(`SELECT * FROM "${tableName}" LIMIT 2`);
        if (sample.rows.length > 0) {
          console.log(`  Sample columns: ${Object.keys(sample.rows[0]).join(', ')}`);
          console.log(`  Sample:`, JSON.stringify(sample.rows[0]).substring(0, 300));
        }
      }
    }
  } catch (err) {
    console.log('DB error:', err.message);
  } finally {
    await pg.end();
  }

  // Also check: n8n might store chat memory internally, not in PostgreSQL
  // The Chat Memory node in the workflow uses a specific memory type
  const chatMemNode = wf.nodes.find(n => n.name === 'Chat Memory');
  if (chatMemNode) {
    console.log('\nChat Memory node type:', chatMemNode.type);
    console.log('Chat Memory params:', JSON.stringify(chatMemNode.parameters, null, 2));
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

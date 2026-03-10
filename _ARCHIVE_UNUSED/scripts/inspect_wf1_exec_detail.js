const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(path) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: 'GET', headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' } };
    const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const exec = await apiCall('/api/v1/executions/613?includeData=true');
  const runData = exec.data.resultData.runData;

  // 1. Merge Customer ID output
  console.log('=== Merge Customer ID OUTPUT ===');
  const mergeOut = runData['Merge Customer ID'][0].data.main[0][0].json;
  console.log(JSON.stringify(mergeOut, null, 2));

  // 2. AI Agent - check if we can see the resolved system prompt
  console.log('\n=== AI Agent ===');
  const agentRun = runData['AI Agent'][0];

  // Output
  const agentOut = agentRun.data.main[0][0].json;
  console.log('Output:', JSON.stringify(agentOut).substring(0, 500));

  // Check executionData for metadata
  if (agentRun.executionData) {
    console.log('\nExecutionData:', JSON.stringify(agentRun.executionData).substring(0, 500));
  }

  // Check metadata
  if (agentRun.metadata) {
    console.log('\nMetadata:', JSON.stringify(agentRun.metadata).substring(0, 500));
  }

  // 3. Calendar Manager Tool
  console.log('\n=== Calendar Manager Tool ===');
  if (runData['Calendar Manager Tool']) {
    const calRuns = runData['Calendar Manager Tool'];
    for (let i = 0; i < calRuns.length; i++) {
      const out = calRuns[i].data.main[0][0].json;
      console.log(`Call ${i+1}:`, JSON.stringify(out).substring(0, 500));

      // Check input data
      const inputData = calRuns[i].inputData;
      if (inputData) {
        console.log(`Input ${i+1}:`, JSON.stringify(inputData).substring(0, 500));
      }
    }
  }

  // 4. Check the workflow data - does the system prompt have $now or resolved values?
  console.log('\n=== Workflow systemMessage (stored) ===');
  const wfData = exec.workflowData;
  if (wfData) {
    const agent = wfData.nodes.find(n => n.name === 'AI Agent');
    if (agent) {
      const sysMsg = agent.parameters?.options?.systemMessage || '';
      // Show first 500 chars to see if $now expressions are stored or resolved
      console.log(sysMsg.substring(0, 800));
      console.log('\n...\n');
      // Check if it contains literal $now or resolved dates
      const hasNow = sysMsg.includes('$now');
      const hasLiteralDate = /202\d-\d{2}-\d{2}/.test(sysMsg);
      console.log('Contains $now expressions:', hasNow);
      console.log('Contains literal dates:', hasLiteralDate);
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

/**
 * Inspect a recent V4 WF1 execution to see:
 * 1. Did $now expressions resolve in the system prompt?
 * 2. What dates did the AI pass to Calendar Manager?
 * 3. What did Merge Customer ID output?
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + apiPath);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Fetching recent executions for V4 WF1...\n');

  // Get all recent executions (any status)
  const execs = await apiCall('GET', '/api/v1/executions?workflowId=tvSLRSiOmNdkEfA2&limit=5');
  const execList = execs.data || execs;

  if (!execList || execList.length === 0) {
    console.log('No executions found!');
    return;
  }

  console.log('Recent executions:');
  for (const e of execList) {
    console.log(`  ${e.id} - ${e.status} - ${e.stoppedAt || 'running'}`);
  }

  // Get the most recent one
  const latestId = execList[0].id;
  console.log(`\nFetching execution ${latestId}...\n`);

  const exec = await apiCall('GET', '/api/v1/executions/' + latestId);

  if (!exec.data || !exec.data.resultData) {
    console.log('No result data. Keys:', Object.keys(exec));
    return;
  }

  const nodeResults = exec.data.resultData.runData;
  const nodeNames = Object.keys(nodeResults);
  console.log('Nodes that ran:', nodeNames.join(', '));

  // Check Merge Customer ID output
  if (nodeResults['Merge Customer ID']) {
    const mergeRun = nodeResults['Merge Customer ID'][0];
    const mergeOutput = mergeRun.data?.main?.[0]?.[0]?.json;
    console.log('\n=== Merge Customer ID output ===');
    console.log(JSON.stringify(mergeOutput, null, 2));
  }

  // Check AI Agent
  if (nodeResults['AI Agent']) {
    const agentRun = nodeResults['AI Agent'][0];

    // Output
    const agentOutput = agentRun.data?.main?.[0]?.[0]?.json;
    console.log('\n=== AI Agent output ===');
    console.log(JSON.stringify(agentOutput, null, 2).substring(0, 1000));

    // Check if there's metadata about the resolved system prompt
    // In n8n, the resolved parameters might be in executionData
    if (agentRun.executionData) {
      console.log('\n=== AI Agent executionData keys ===');
      console.log(Object.keys(agentRun.executionData));
    }
  }

  // Check what the Calendar Manager Tool received
  // In toolWorkflow nodes, the input comes from the AI's tool call
  if (nodeResults['Calendar Manager Tool']) {
    const calRuns = nodeResults['Calendar Manager Tool'];
    console.log(`\n=== Calendar Manager Tool (${calRuns.length} calls) ===`);
    for (let i = 0; i < calRuns.length; i++) {
      const calRun = calRuns[i];
      const calOutput = calRun.data?.main?.[0]?.[0]?.json;
      console.log(`Call ${i + 1} output:`, JSON.stringify(calOutput).substring(0, 800));
    }
  }

  // Also check if there are sub-execution details
  // The tool calls made by the AI are usually visible in the agent output
  if (nodeResults['AI Agent']) {
    const agentRun = nodeResults['AI Agent'][0];
    const allOutputs = agentRun.data?.main?.[0];
    if (allOutputs && allOutputs.length > 0) {
      const firstOutput = allOutputs[0].json;
      // Check for tool call info in the output
      if (firstOutput.steps || firstOutput.intermediateSteps) {
        console.log('\n=== AI Agent intermediate steps ===');
        const steps = firstOutput.steps || firstOutput.intermediateSteps;
        console.log(JSON.stringify(steps, null, 2).substring(0, 2000));
      }
    }
  }
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

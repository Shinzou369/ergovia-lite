const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
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
  const exec = await apiCall('GET', '/api/v1/executions/120');
  console.log('=== Execution 120 ===');
  console.log(`Status: ${exec.status}`);
  console.log(`Workflow: ${exec.workflowId}`);
  console.log(`Started: ${exec.startedAt}`);
  console.log(`Finished: ${exec.stoppedAt}`);

  // Find the error node
  if (exec.data?.resultData?.runData) {
    for (const [nodeName, runs] of Object.entries(exec.data.resultData.runData)) {
      for (const run of runs) {
        if (run.error) {
          console.log(`\nERROR in node: "${nodeName}"`);
          console.log(`  Message: ${run.error.message}`);
          if (run.error.description) console.log(`  Description: ${run.error.description}`);
          if (run.error.stack) console.log(`  Stack (first 300): ${run.error.stack.substring(0, 300)}`);
        }
      }
    }
  }

  // Also show last error from the execution metadata
  if (exec.data?.resultData?.error) {
    console.log(`\nTop-level error: ${exec.data.resultData.error.message}`);
  }
}

main().catch(console.error);

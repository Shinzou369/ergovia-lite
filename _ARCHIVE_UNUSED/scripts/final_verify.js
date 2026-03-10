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
  // Check ALL workflows for parameterized queries
  const allWf = await apiCall('GET', '/api/v1/workflows');

  console.log('=== COMPREHENSIVE PARAMETERIZED QUERY CHECK ===\n');

  let issueCount = 0;
  let okCount = 0;

  for (const wfInfo of allWf.data) {
    const wf = await apiCall('GET', `/api/v1/workflows/${wfInfo.id}`);

    for (const node of wf.nodes || []) {
      const query = node.parameters?.query || '';
      if (!query.includes('$1')) continue;

      // Check ALL possible locations for queryParameters
      const hasOptions = !!node.parameters?.options?.queryParameters;
      const hasAdditionalFields = !!node.parameters?.additionalFields?.queryParameters;
      const hasTopLevel = !!node.parameters?.queryParameters;

      const hasBinding = hasOptions || hasAdditionalFields || hasTopLevel;

      const status = hasBinding ? 'OK' : 'MISSING BINDING';
      if (hasBinding) okCount++; else issueCount++;

      console.log(`[${status}] ${wf.name} / "${node.name}"`);
      if (hasOptions) console.log(`  → options.queryParameters: ${node.parameters.options.queryParameters.substring(0, 80)}...`);
      if (hasAdditionalFields) console.log(`  → additionalFields.queryParameters: ${node.parameters.additionalFields.queryParameters.substring(0, 80)}...`);
      if (!hasBinding) {
        console.log(`  → Query: ${query.substring(0, 100)}...`);
        console.log(`  → All param keys: ${Object.keys(node.parameters).join(', ')}`);
        if (node.parameters.options) console.log(`  → options keys: ${Object.keys(node.parameters.options).join(', ')}`);
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Properly bound: ${okCount}`);
  console.log(`  Missing binding: ${issueCount}`);

  // Check all workflows are active
  console.log('\n=== WORKFLOW STATUS ===');
  for (const wf of allWf.data) {
    console.log(`  ${wf.active ? 'ACTIVE  ' : 'INACTIVE'} | ${wf.name}`);
  }

  // Check recent executions for any new errors
  console.log('\n=== RECENT EXECUTIONS (last 5) ===');
  const execs = await apiCall('GET', '/api/v1/executions?limit=5');
  for (const exec of execs.data || []) {
    console.log(`  ${exec.id} | ${exec.status} | ${exec.workflowId} | ${new Date(exec.startedAt).toISOString()}`);
  }
}

main().catch(console.error);

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
  // 1. Check all workflows are active
  const allWf = await apiCall('GET', '/api/v1/workflows');
  console.log('=== Workflow Status ===');
  let allActive = true;
  for (const wf of allWf.data) {
    const status = wf.active ? 'ACTIVE' : 'INACTIVE';
    if (!wf.active) allActive = false;
    console.log(`  ${status} | ${wf.id} | ${wf.name}`);
  }
  console.log(allActive ? '\n  ALL WORKFLOWS ACTIVE' : '\n  WARNING: Some workflows inactive!');

  // 2. Check for remaining $1 params without queryParameters
  console.log('\n=== Parameterized Query Check ===');
  const ids = allWf.data.map(w => w.id);
  for (const id of ids) {
    const wf = await apiCall('GET', `/api/v1/workflows/${id}`);
    for (const node of wf.nodes || []) {
      const query = node.parameters?.query || '';
      if (query.includes('$1') && !node.parameters?.options?.queryParameters) {
        console.log(`  PROBLEM: ${wf.name} / ${node.name}: Has $1 but no queryParameters!`);
        console.log(`    Query: ${query.substring(0, 100)}...`);
      }
    }
  }
  console.log('  Check complete.');

  // 3. Check for stale workflow references
  console.log('\n=== Stale Workflow Reference Check ===');
  const validIds = new Set(ids);
  for (const id of ids) {
    const wf = await apiCall('GET', `/api/v1/workflows/${id}`);
    for (const node of wf.nodes || []) {
      if (node.type === 'n8n-nodes-base.executeWorkflow') {
        const refId = node.parameters?.workflowId?.value || node.parameters?.workflowId;
        if (refId && !validIds.has(refId)) {
          console.log(`  PROBLEM: ${wf.name} / ${node.name}: References non-existent workflow ${refId}`);
        }
      }
    }
  }
  console.log('  Check complete.');

  // 4. Check credential consistency
  console.log('\n=== Credential Consistency Check ===');
  const credUsage = {};
  for (const id of ids) {
    const wf = await apiCall('GET', `/api/v1/workflows/${id}`);
    for (const node of wf.nodes || []) {
      if (node.credentials) {
        for (const [type, info] of Object.entries(node.credentials)) {
          const key = `${type}:${info.id}`;
          if (!credUsage[key]) credUsage[key] = { name: info.name, count: 0, workflows: [] };
          credUsage[key].count++;
          if (!credUsage[key].workflows.includes(wf.name)) credUsage[key].workflows.push(wf.name);
        }
      }
    }
  }
  for (const [key, info] of Object.entries(credUsage)) {
    console.log(`  ${key} (${info.name}): ${info.count} usages across ${info.workflows.length} workflows`);
  }

  // 5. Check for twilio-cred placeholder
  console.log('\n=== Twilio Placeholder Check ===');
  for (const id of ids) {
    const wf = await apiCall('GET', `/api/v1/workflows/${id}`);
    for (const node of wf.nodes || []) {
      if (node.credentials) {
        for (const [type, info] of Object.entries(node.credentials)) {
          if (info.id === 'twilio-cred') {
            console.log(`  ${wf.name} / ${node.name}: Uses placeholder twilio-cred`);
          }
        }
      }
    }
  }

  // 6. Check recent executions
  console.log('\n=== Recent Executions ===');
  const execs = await apiCall('GET', '/api/v1/executions?limit=10');
  for (const exec of execs.data || []) {
    const time = new Date(exec.startedAt).toLocaleString();
    console.log(`  ${exec.id} | ${exec.status.padEnd(7)} | ${exec.workflowId} | ${exec.mode} | ${time}`);
  }
}

main().catch(console.error);

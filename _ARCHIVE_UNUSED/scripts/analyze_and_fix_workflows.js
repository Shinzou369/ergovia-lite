const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const BASE = 'https://n8n.ergovia-ai.com';

const WORKFLOW_IDS = {
  SUB: 'UZMWfhnV6JmuwJXC',
  WF1: 'LP7YknAVPiQsidWq',
  WF2: 'NPInwpKv4Oriq04F',
  WF3: 'pEn69kwNtCEQ21y9',
  WF4: '5loDH75zrEDh9x5H',
  WF5: 'JWEu9Uz2JJ5XZeIX',
  WF6: 'ccEOaNnIwY6eeJOn',
  WF7: 'Ay5QOyGAHG2l40s7',
  WF8: 'mLm2HaIRzNfIX5uh'
};

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Download all workflows
  console.log('=== Downloading all workflows ===');
  const workflows = {};
  for (const [name, id] of Object.entries(WORKFLOW_IDS)) {
    const wf = await apiCall('GET', `/api/v1/workflows/${id}`);
    workflows[name] = wf;
    console.log(`  ${name} (${id}): ${wf.nodes?.length || 0} nodes`);
  }

  // Analyze credential usage
  console.log('\n=== Credential Usage Analysis ===');
  const credMap = {};
  for (const [wfName, wf] of Object.entries(workflows)) {
    for (const node of (wf.nodes || [])) {
      if (node.credentials) {
        for (const [credType, credInfo] of Object.entries(node.credentials)) {
          const key = `${credType}:${credInfo.id}:${credInfo.name}`;
          if (!credMap[key]) credMap[key] = [];
          credMap[key].push(`${wfName}/${node.name}`);
        }
      }
    }
  }
  for (const [key, users] of Object.entries(credMap)) {
    console.log(`\n  ${key}:`);
    users.forEach(u => console.log(`    - ${u}`));
  }

  // Check for the WF1 Check Budget query issue
  console.log('\n=== WF1 Check Budget Node Analysis ===');
  const wf1 = workflows.WF1;
  const checkBudgetNode = wf1.nodes.find(n => n.id === 'check-budget' || n.name === 'Check Budget');
  if (checkBudgetNode) {
    console.log(`  Node: ${checkBudgetNode.name}`);
    console.log(`  Query: ${checkBudgetNode.parameters?.query}`);
    console.log(`  Has $1 param: ${checkBudgetNode.parameters?.query?.includes('$1')}`);
  }

  // Check SUB for twilio-cred placeholder
  console.log('\n=== Twilio Credential Check ===');
  for (const [wfName, wf] of Object.entries(workflows)) {
    for (const node of (wf.nodes || [])) {
      if (node.credentials) {
        for (const [credType, credInfo] of Object.entries(node.credentials)) {
          if (credInfo.id === 'twilio-cred' || credInfo.name?.includes('twilio') || credInfo.name?.includes('Twilio')) {
            console.log(`  ${wfName}/${node.name}: ${credType} = ${credInfo.id} (${credInfo.name})`);
          }
        }
      }
    }
  }
}

main().catch(console.error);

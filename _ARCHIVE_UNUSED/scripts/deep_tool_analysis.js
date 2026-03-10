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
  const wf1 = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');

  // 1. Show full tool node parameters from WF1
  const toolNodes = wf1.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.toolWorkflow');

  console.log('=== TOOL NODE CONFIGURATIONS IN WF1 ===\n');
  for (const tool of toolNodes) {
    console.log(`── "${tool.name}" (${tool.id}) ──`);
    console.log(JSON.stringify(tool.parameters, null, 2));
    console.log();
  }

  // 2. For each target workflow, find ALL $json references across ALL nodes
  const workflows = {
    'pEn69kwNtCEQ21y9': 'WF3: Calendar Manager',
    '5loDH75zrEDh9x5H': 'WF4: Payment Processor',
    'JWEu9Uz2JJ5XZeIX': 'WF5: Property Operations',
    'mLm2HaIRzNfIX5uh': 'WF8: Safety & Screening',
    'UZMWfhnV6JmuwJXC': 'SUB: Universal Messenger',
    'NPInwpKv4Oriq04F': 'WF2: AI Booking Agent',
  };

  for (const [wfId, wfLabel] of Object.entries(workflows)) {
    const wf = await apiCall('GET', `/api/v1/workflows/${wfId}`);
    console.log(`\n════════════════════════════════════════`);
    console.log(`${wfLabel} (${wfId})`);
    console.log(`════════════════════════════════════════`);

    // Find trigger node and what connects to it
    const trigger = wf.nodes.find(n => n.type.includes('executeWorkflowTrigger'));
    if (trigger) {
      console.log(`\nTrigger: "${trigger.name}"`);
      console.log(`  Parameters: ${JSON.stringify(trigger.parameters)}`);

      // Find nodes directly connected FROM the trigger
      const triggerConns = wf.connections[trigger.name];
      if (triggerConns) {
        for (const [type, outputs] of Object.entries(triggerConns)) {
          for (const conns of outputs) {
            for (const conn of conns) {
              console.log(`  → connects to: "${conn.node}"`);
            }
          }
        }
      }
    }

    // Scan ALL nodes for $json references (these are the inputs needed)
    console.log(`\nAll $json field references across workflow:`);
    const allRefs = new Map();
    for (const node of wf.nodes) {
      const params = JSON.stringify(node.parameters || {});
      const code = node.parameters?.jsCode || '';
      const fullText = params + ' ' + code;

      // Match $json.fieldName, $input.item.json.fieldName
      const matches = fullText.match(/\$json\.[\w.]+/g) || [];
      const inputMatches = fullText.match(/\$input\.item\.json\.[\w.]+/g) || [];

      for (const m of [...matches, ...inputMatches]) {
        if (!allRefs.has(m)) allRefs.set(m, []);
        allRefs.get(m).push(node.name);
      }
    }

    // Show only refs from trigger-adjacent nodes (likely the actual inputs)
    for (const [ref, nodes] of [...allRefs.entries()].sort()) {
      console.log(`  ${ref} — used in: ${[...new Set(nodes)].join(', ')}`);
    }
  }
}

main().catch(console.error);

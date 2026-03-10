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
  // Get WF1
  const wf1 = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');

  // Find all tool nodes
  const toolNodes = wf1.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.toolWorkflow');

  console.log(`=== AI Agent Tools in WF1 (${toolNodes.length} tools) ===\n`);

  for (const tool of toolNodes) {
    const wfId = tool.parameters.workflowId?.value || tool.parameters.workflowId;
    console.log(`────────────────────────────────────────`);
    console.log(`TOOL: "${tool.name}" (id: ${tool.id})`);
    console.log(`  Tool Name (AI sees): ${tool.parameters.name}`);
    console.log(`  Description: ${tool.parameters.description}`);
    console.log(`  Calls Workflow: ${wfId}`);

    // Download the target workflow to find its trigger/input expectations
    if (wfId && !wfId.includes('placeholder')) {
      try {
        const targetWf = await apiCall('GET', `/api/v1/workflows/${wfId}`);
        console.log(`  Workflow Name: ${targetWf.name}`);
        console.log(`  Workflow Nodes: ${targetWf.nodes.length}`);
        console.log(`  Active: ${targetWf.active}`);

        // Find the Execute Workflow Trigger (entry point for sub-workflows)
        const trigger = targetWf.nodes.find(n =>
          n.type === 'n8n-nodes-base.executeWorkflowTrigger' ||
          n.type === '@n8n/n8n-nodes-langchain.executeWorkflowTrigger'
        );

        if (trigger) {
          console.log(`  Trigger Node: "${trigger.name}" (${trigger.type})`);
          // Check for defined input schema
          const schema = trigger.parameters?.workflowInputs?.schema ||
                         trigger.parameters?.inputSchema ||
                         trigger.parameters?.schema;
          if (schema) {
            console.log(`  INPUT SCHEMA:`);
            for (const field of schema) {
              console.log(`    - ${field.id || field.name} (${field.type || 'string'})${field.required ? ' [REQUIRED]' : ''}`);
            }
          } else {
            console.log(`  INPUT SCHEMA: not defined (accepts $json from caller)`);
          }
        } else {
          console.log(`  Trigger: No executeWorkflowTrigger found`);
        }

        // Also check first Code node after trigger for what fields it reads
        const firstCode = targetWf.nodes.find(n =>
          n.type === 'n8n-nodes-base.code' &&
          n.parameters?.jsCode?.includes('$input') || n.parameters?.jsCode?.includes('$json')
        );
        if (firstCode) {
          // Extract field references from the code
          const code = firstCode.parameters.jsCode || '';
          const jsonRefs = [...new Set(code.match(/\$json\.(\w+)/g) || [])];
          const inputRefs = [...new Set(code.match(/\$input\.item\.json\.(\w+)/g) || [])];
          const allRefs = [...jsonRefs, ...inputRefs];
          if (allRefs.length > 0) {
            console.log(`  Fields used in "${firstCode.name}":`);
            for (const ref of allRefs) {
              console.log(`    - ${ref}`);
            }
          }
        }

        // Also check for any Postgres nodes that reference input fields
        const pgNodes = targetWf.nodes.filter(n => n.type?.includes('postgres'));
        const inputFieldsFromPg = new Set();
        for (const pg of pgNodes) {
          const query = pg.parameters?.query || '';
          const matches = query.match(/\$json\.(\w+)/g) || [];
          matches.forEach(m => inputFieldsFromPg.add(m));
          const matches2 = query.match(/\$\('([^']+)'\)/g) || [];
        }
        if (inputFieldsFromPg.size > 0) {
          console.log(`  Fields referenced in Postgres queries:`);
          for (const ref of inputFieldsFromPg) {
            console.log(`    - ${ref}`);
          }
        }

      } catch (err) {
        console.log(`  ERROR loading workflow: ${err.message}`);
      }
    } else {
      console.log(`  Workflow: PLACEHOLDER (not deployed)`);
    }

    console.log();
  }
}

main().catch(console.error);

const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname, method,
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

const workflows = [
  ['UZMWfhnV6JmuwJXC', 'SUB'],
  ['LP7YknAVPiQsidWq', 'WF1'],
  ['NPInwpKv4Oriq04F', 'WF2'],
  ['pEn69kwNtCEQ21y9', 'WF3'],
  ['5loDH75zrEDh9x5H', 'WF4'],
  ['JWEu9Uz2JJ5XZeIX', 'WF5'],
  ['ccEOaNnIwY6eeJOn', 'WF6'],
  ['Ay5QOyGAHG2l40s7', 'WF7'],
  ['mLm2HaIRzNfIX5uh', 'WF8']
];

async function main() {
  console.log('=== FULL CLIENT VARIABLE AUDIT — ALL 9 WORKFLOWS ===\n');

  for (const [id, label] of workflows) {
    const wf = await apiCall('GET', '/api/v1/workflows/' + id);
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║ ' + label + ': ' + wf.name + ' (' + wf.nodes.length + ' nodes)');
    console.log('╚══════════════════════════════════════════════════╝');

    for (const node of wf.nodes) {
      const p = node.parameters || {};

      // 1. Credentials used
      if (node.credentials) {
        for (const [type, cred] of Object.entries(node.credentials)) {
          console.log('  [CREDENTIAL] "' + node.name + '" uses ' + type + ' = ' + cred.name + ' (' + cred.id + ')');
        }
      }

      // 2. SQL queries (find table/column references)
      if (p.query) {
        console.log('  [SQL] "' + node.name + '":');
        // Extract table names
        const tables = new Set();
        const tableMatches = p.query.matchAll(/(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/gi);
        for (const m of tableMatches) tables.add(m[1]);
        if (tables.size > 0) console.log('    Tables: ' + [...tables].join(', '));

        // Extract expression placeholders
        const exprs = [...p.query.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map(m => m[1].trim());
        if (exprs.length > 0) console.log('    Input expressions: ' + exprs.join(' | '));
      }

      // 3. Code nodes (find $json, $input, $() references)
      if (p.jsCode) {
        console.log('  [CODE] "' + node.name + '":');
        // Find $json.xxx references
        const jsonRefs = new Set();
        const jsonMatches = p.jsCode.matchAll(/\$json\.(\w+)/g);
        for (const m of jsonMatches) jsonRefs.add(m[1]);
        if (jsonRefs.size > 0) console.log('    $json fields: ' + [...jsonRefs].join(', '));

        // Find input.xxx references
        const inputRefs = new Set();
        const inputMatches = p.jsCode.matchAll(/input\.(\w+)/g);
        for (const m of inputMatches) inputRefs.add(m[1]);
        if (inputRefs.size > 0) console.log('    input fields: ' + [...inputRefs].join(', '));

        // Find $('NodeName') references
        const nodeRefs = new Set();
        const nodeMatches = p.jsCode.matchAll(/\$\(['"]([^'"]+)['"]\)/g);
        for (const m of nodeMatches) nodeRefs.add(m[1]);
        if (nodeRefs.size > 0) console.log('    Node refs: ' + [...nodeRefs].join(', '));
      }

      // 4. Telegram chatId
      if (p.chatId) console.log('  [TELEGRAM] "' + node.name + '" chatId: ' + p.chatId);

      // 5. Twilio to/from
      if (p.to) console.log('  [TWILIO] "' + node.name + '" to: ' + p.to);
      if (p.from) console.log('  [TWILIO] "' + node.name + '" from: ' + p.from);

      // 6. HTTP/webhook URLs
      if (p.url) console.log('  [URL] "' + node.name + '" url: ' + p.url);

      // 7. LLM prompts (find field references)
      if (p.text) {
        const promptExprs = [...String(p.text).matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map(m => m[1].trim());
        if (promptExprs.length > 0) console.log('  [PROMPT] "' + node.name + '" uses: ' + promptExprs.join(' | '));
      }

      // 8. $fromAI() tool parameters
      if (p.description || p.toolDescription) {
        const desc = p.description || p.toolDescription || '';
        console.log('  [TOOL] "' + node.name + '" desc: ' + desc.substring(0, 120));
      }

      // 9. executeWorkflow inputs
      if (p.workflowInputs?.value) {
        const inputs = p.workflowInputs.value;
        if (typeof inputs === 'object') {
          for (const [key, val] of Object.entries(inputs)) {
            console.log('  [WF_INPUT] "' + node.name + '" ' + key + ' = ' + val);
          }
        }
      }

      // 10. Switch/IF conditions
      if (p.conditions?.conditions) {
        for (const c of p.conditions.conditions) {
          if (c.leftValue) console.log('  [CONDITION] "' + node.name + '" checks: ' + c.leftValue);
        }
      }
      if (p.rules?.values) {
        for (const r of p.rules.values) {
          const conds = r.conditions?.conditions || [];
          for (const c of conds) {
            if (c.leftValue) console.log('  [SWITCH] "' + node.name + '" route: ' + c.leftValue + ' = ' + (c.rightValue || ''));
          }
        }
      }
    }
    console.log('');
  }
}

main().catch(console.error);

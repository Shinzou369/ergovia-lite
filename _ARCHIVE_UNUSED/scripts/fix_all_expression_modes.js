/**
 * Fix ALL V4 AI Agent systemMessage fields to use Expression mode
 *
 * Root cause: When deploying via API, we set systemMessage as a plain string.
 * In n8n, expression-mode values must start with "=" prefix.
 * Without it, {{ }} blocks are treated as literal text, not evaluated.
 *
 * Also: Add date confirmation behavior to WF1's system prompt.
 *
 * Scans all active V4 workflows for nodes with systemMessage containing {{ }}
 * and adds the "=" prefix if missing.
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

const changes = [];

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Recursively find all string values containing {{ }} and add = prefix if missing
function fixExpressions(obj, path = '') {
  if (typeof obj === 'string') {
    if (obj.includes('{{') && !obj.startsWith('=')) {
      return { fixed: true, value: '=' + obj, path };
    }
    return { fixed: false, value: obj, path };
  }
  if (Array.isArray(obj)) {
    let anyFixed = false;
    const result = obj.map((item, i) => {
      const r = fixExpressions(item, `${path}[${i}]`);
      if (r.fixed) anyFixed = true;
      return r.fixed ? r.value : item;
    });
    return { fixed: anyFixed, value: result, path };
  }
  if (obj && typeof obj === 'object') {
    let anyFixed = false;
    const result = { ...obj };
    for (const [key, val] of Object.entries(obj)) {
      const r = fixExpressions(val, `${path}.${key}`);
      if (r.fixed) {
        anyFixed = true;
        result[key] = r.value;
        changes.push(`  Fixed: ${path}.${key}`);
      }
    }
    return { fixed: anyFixed, value: result, path };
  }
  return { fixed: false, value: obj, path };
}

async function main() {
  console.log('=== Fix Expression Mode on ALL V4 Workflow AI Agent Nodes ===\n');

  // Get all workflows
  const all = await apiCall('GET', '/api/v1/workflows');
  const workflows = all.data || all;

  // Filter V4 workflows
  const v4Workflows = workflows.filter(w => w.name.includes('[V4]'));
  console.log(`Found ${v4Workflows.length} V4 workflows:\n`);
  for (const w of v4Workflows) {
    console.log(`  ${w.active ? '[ACTIVE]  ' : '[INACTIVE]'} ${w.name} (${w.id})`);
  }

  // Process each V4 workflow
  for (const wfMeta of v4Workflows) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Processing: ${wfMeta.name} (${wfMeta.id})`);
    console.log('─'.repeat(60));

    const wf = await apiCall('GET', `/api/v1/workflows/${wfMeta.id}`);
    if (!wf.nodes) {
      console.log('  ERROR: Could not fetch workflow');
      continue;
    }

    let workflowChanged = false;
    changes.length = 0;

    // Find all nodes with parameters containing {{ }} expressions
    for (const node of wf.nodes) {
      const params = node.parameters;
      if (!params) continue;

      // Check systemMessage specifically
      const sysMsg = params.options?.systemMessage;
      if (sysMsg && typeof sysMsg === 'string' && sysMsg.includes('{{') && !sysMsg.startsWith('=')) {
        console.log(`  Node: "${node.name}" (${node.type})`);
        console.log(`    systemMessage has {{ }} but NO = prefix -> FIXING`);
        params.options.systemMessage = '=' + sysMsg;
        changes.push(`${node.name}: systemMessage -> Expression mode`);
        workflowChanged = true;
      } else if (sysMsg && sysMsg.startsWith('=')) {
        console.log(`  Node: "${node.name}" - systemMessage already in Expression mode \u2713`);
      }

      // Check text/prompt parameters
      if (params.text && typeof params.text === 'string' && params.text.includes('{{') && !params.text.startsWith('=')) {
        console.log(`  Node: "${node.name}" - text param has {{ }} but NO = prefix -> FIXING`);
        params.text = '=' + params.text;
        changes.push(`${node.name}: text -> Expression mode`);
        workflowChanged = true;
      }

      // Check description in tool nodes
      if (params.description && typeof params.description === 'string' && params.description.includes('{{') && !params.description.startsWith('=')) {
        console.log(`  Node: "${node.name}" - description has {{ }} but NO = prefix -> FIXING`);
        params.description = '=' + params.description;
        changes.push(`${node.name}: description -> Expression mode`);
        workflowChanged = true;
      }

      // Check prompt in AI nodes
      if (params.prompt && typeof params.prompt === 'string' && params.prompt.includes('{{') && !params.prompt.startsWith('=')) {
        console.log(`  Node: "${node.name}" - prompt has {{ }} but NO = prefix -> FIXING`);
        params.prompt = '=' + params.prompt;
        changes.push(`${node.name}: prompt -> Expression mode`);
        workflowChanged = true;
      }

      // Check jsCode should NOT have = prefix (it's actual code, not an expression)
      // Skip jsCode

      // Check any other parameter with {{ }}
      for (const [key, val] of Object.entries(params)) {
        if (key === 'jsCode' || key === 'options') continue; // already handled options above
        if (typeof val === 'string' && val.includes('{{') && !val.startsWith('=') && !val.includes('function') && !val.includes('const ') && !val.includes('return ')) {
          console.log(`  Node: "${node.name}" - ${key} has {{ }} but NO = prefix -> FIXING`);
          params[key] = '=' + val;
          changes.push(`${node.name}: ${key} -> Expression mode`);
          workflowChanged = true;
        }
      }

      // Check nested options for other expression fields
      if (params.options && typeof params.options === 'object') {
        for (const [key, val] of Object.entries(params.options)) {
          if (key === 'systemMessage') continue; // already handled
          if (typeof val === 'string' && val.includes('{{') && !val.startsWith('=')) {
            console.log(`  Node: "${node.name}" - options.${key} has {{ }} but NO = prefix -> FIXING`);
            params.options[key] = '=' + val;
            changes.push(`${node.name}: options.${key} -> Expression mode`);
            workflowChanged = true;
          }
        }
      }
    }

    if (workflowChanged) {
      console.log(`\n  Deploying ${changes.length} fixes...`);

      // Deactivate if active
      if (wf.active) {
        await apiCall('POST', `/api/v1/workflows/${wfMeta.id}/deactivate`);
        await sleep(1500);
      }

      const result = await apiCall('PUT', `/api/v1/workflows/${wfMeta.id}`, {
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: wf.settings || {},
        staticData: wf.staticData || null
      });

      if (result.id) {
        console.log('  Update successful! Nodes:', result.nodes.length);
      } else {
        console.error('  Update FAILED:', JSON.stringify(result).substring(0, 300));
        continue;
      }
      await sleep(1000);

      // Reactivate if was active
      if (wf.active) {
        await apiCall('POST', `/api/v1/workflows/${wfMeta.id}/activate`);
        console.log('  Reactivated');
      }

      for (const c of changes) {
        console.log('  \u2022 ' + c);
      }
    } else {
      console.log('  No fixes needed - all expressions already in correct mode');
    }

    await sleep(500);
  }

  console.log('\n\n=== DONE ===');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

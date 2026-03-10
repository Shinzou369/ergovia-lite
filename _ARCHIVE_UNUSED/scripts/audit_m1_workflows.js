/**
 * Audit M1 Workflows on n8n.ergovia-ai.com
 *
 * Checks:
 * - All workflows and their tags/status
 * - Identify M1 (non-V4) workflows
 * - Credentials used
 * - Node types and counts
 * - Placeholders / variables that need control panel
 * - Efficiency analysis
 */

const https = require('https');
const fs = require('fs');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== M1 Workflow Audit ===\n');

  // Get all workflows
  const allWfs = await apiCall('GET', '/api/v1/workflows?limit=100');
  const workflows = allWfs.data || [];

  console.log(`Total workflows: ${workflows.length}\n`);

  // Categorize
  const v4 = workflows.filter(w => w.name.includes('[V4]'));
  const m1 = workflows.filter(w => w.tags?.some(t => t.name === 'M1') || w.name.includes('[M1]'));
  const other = workflows.filter(w => !w.name.includes('[V4]') && !w.tags?.some(t => t.name === 'M1') && !w.name.includes('[M1]'));

  console.log('=== ALL WORKFLOWS ===');
  console.log(`V4 workflows: ${v4.length}`);
  console.log(`M1 tagged/named: ${m1.length}`);
  console.log(`Other: ${other.length}\n`);

  // List all
  console.log('Full list:');
  for (const w of workflows.sort((a,b) => a.name.localeCompare(b.name))) {
    const tags = (w.tags || []).map(t => t.name).join(', ');
    console.log(`  ${w.active ? '●' : '○'} ${w.name} [${w.id}] ${tags ? '(' + tags + ')' : ''}`);
  }

  // Now get full details for each non-V4 workflow (M1 candidates)
  console.log('\n\n=== DETAILED M1 WORKFLOW ANALYSIS ===\n');

  const nonV4 = workflows.filter(w => !w.name.includes('[V4]'));

  const allCredentials = new Map();
  const allPlaceholders = [];

  for (const wSummary of nonV4) {
    await sleep(500); // rate limit
    const w = await apiCall('GET', `/api/v1/workflows/${wSummary.id}`);

    console.log(`${'─'.repeat(60)}`);
    console.log(`${w.active ? '●' : '○'} ${w.name}`);
    console.log(`  ID: ${w.id}`);
    console.log(`  Tags: ${(w.tags || []).map(t => t.name).join(', ') || 'none'}`);
    console.log(`  Active: ${w.active}`);
    console.log(`  Nodes: ${w.nodes.length}`);

    // Node type breakdown
    const typeCount = {};
    for (const n of w.nodes) {
      const t = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'AI:');
      typeCount[t] = (typeCount[t] || 0) + 1;
    }
    console.log('  Node types:');
    for (const [t, c] of Object.entries(typeCount).sort((a,b) => b[1] - a[1])) {
      console.log(`    ${t}: ${c}`);
    }

    // Credentials
    const creds = new Set();
    for (const n of w.nodes) {
      if (n.credentials) {
        for (const [type, cred] of Object.entries(n.credentials)) {
          creds.add(`${type}: ${cred.name} (${cred.id})`);
          allCredentials.set(cred.id, { type, name: cred.name, workflows: [...(allCredentials.get(cred.id)?.workflows || []), w.name] });
        }
      }
    }
    if (creds.size > 0) {
      console.log('  Credentials:');
      for (const c of creds) console.log(`    ${c}`);
    }

    // Find placeholders/variables in parameters
    const placeholders = [];
    function scanNode(node) {
      const params = JSON.stringify(node.parameters || {});

      // Look for common placeholder patterns
      const patterns = [
        // {{ expressions }}
        ...Array.from(params.matchAll(/\{\{\s*\$[^}]+\}\}/g)).map(m => m[0]),
        // Hardcoded URLs
        ...Array.from(params.matchAll(/(https?:\/\/[^\s"'\\]+)/g)).map(m => m[0]),
        // Credential references
        ...Array.from(params.matchAll(/\[Client\][^"']*/g)).map(m => m[0]),
        // API keys / tokens in plain text
        ...Array.from(params.matchAll(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"][^'"]+['"]/gi)).map(m => m[0]),
      ];

      // Look for hardcoded values that should be variables
      const hardcoded = [];
      if (params.includes('116.203.115.12')) hardcoded.push('Hardcoded IP: 116.203.115.12');
      if (params.includes('ergovia-ai.com')) hardcoded.push('Hardcoded domain: ergovia-ai.com');
      if (params.includes('ergovia_db')) hardcoded.push('Hardcoded DB name');
      if (params.includes('6573358279')) hardcoded.push('Hardcoded Telegram chat ID');

      // System prompts / AI instructions
      if (node.type.includes('langchain') || node.type.includes('openAi')) {
        if (node.parameters.systemMessage || node.parameters.text || node.parameters.prompt) {
          const prompt = node.parameters.systemMessage || node.parameters.text || node.parameters.prompt || '';
          if (prompt.length > 100) {
            placeholders.push({
              node: node.name,
              type: 'AI_PROMPT',
              preview: prompt.substring(0, 150) + '...',
              length: prompt.length
            });
          }
        }
      }

      // SQL queries with table names
      if (node.parameters.query) {
        const tables = Array.from(node.parameters.query.matchAll(/(?:FROM|INTO|UPDATE|JOIN)\s+(\w+)/gi)).map(m => m[1]);
        if (tables.length > 0) {
          placeholders.push({
            node: node.name,
            type: 'SQL_TABLES',
            tables: [...new Set(tables)]
          });
        }
      }

      // Webhook paths
      if (node.type.includes('webhook') && node.parameters.path) {
        placeholders.push({
          node: node.name,
          type: 'WEBHOOK_PATH',
          path: node.parameters.path
        });
      }

      if (hardcoded.length > 0) {
        placeholders.push({
          node: node.name,
          type: 'HARDCODED',
          values: hardcoded
        });
      }
    }

    for (const n of w.nodes) scanNode(n);

    if (placeholders.length > 0) {
      console.log('  Variables/Placeholders:');
      for (const p of placeholders) {
        if (p.type === 'AI_PROMPT') {
          console.log(`    [AI PROMPT] ${p.node}: ${p.length} chars - "${p.preview}"`);
        } else if (p.type === 'SQL_TABLES') {
          console.log(`    [SQL] ${p.node}: tables ${p.tables.join(', ')}`);
        } else if (p.type === 'WEBHOOK_PATH') {
          console.log(`    [WEBHOOK] ${p.node}: /${p.path}`);
        } else if (p.type === 'HARDCODED') {
          for (const v of p.values) console.log(`    [HARDCODED] ${p.node}: ${v}`);
        }
      }
      allPlaceholders.push({ workflow: w.name, id: w.id, items: placeholders });
    }

    // Efficiency notes
    const efficiency = [];
    if (w.nodes.length > 30) efficiency.push(`High node count (${w.nodes.length})`);
    if (w.nodes.filter(n => n.type.includes('code')).length > 10) efficiency.push(`Many code nodes (${w.nodes.filter(n => n.type.includes('code')).length})`);
    if (!w.active) efficiency.push('INACTIVE');

    // Check for duplicate/redundant nodes
    const names = w.nodes.map(n => n.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) efficiency.push(`Duplicate node names: ${dupes.join(', ')}`);

    if (efficiency.length > 0) {
      console.log('  Efficiency:');
      for (const e of efficiency) console.log(`    ⚠ ${e}`);
    }
  }

  // ─── Credentials Summary ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log('CREDENTIALS SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  for (const [id, cred] of allCredentials) {
    console.log(`  ${cred.name} (${cred.type}, ID: ${id})`);
    console.log(`    Used by: ${[...new Set(cred.workflows)].join(', ')}`);
  }

  // ─── Control Panel Variables Summary ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log('CONTROL PANEL VARIABLES NEEDED');
  console.log(`${'═'.repeat(60)}`);

  const varCategories = {
    'AI Prompts': [],
    'Webhook Paths': [],
    'Database Tables': [],
    'Hardcoded Values': [],
    'Credentials': []
  };

  for (const wp of allPlaceholders) {
    for (const p of wp.items) {
      if (p.type === 'AI_PROMPT') varCategories['AI Prompts'].push(`${wp.workflow} → ${p.node}`);
      if (p.type === 'WEBHOOK_PATH') varCategories['Webhook Paths'].push(`${wp.workflow} → ${p.node}: /${p.path}`);
      if (p.type === 'SQL_TABLES') varCategories['Database Tables'].push(`${wp.workflow} → ${p.node}: ${p.tables.join(', ')}`);
      if (p.type === 'HARDCODED') varCategories['Hardcoded Values'].push(`${wp.workflow} → ${p.node}: ${p.values.join('; ')}`);
    }
  }

  for (const [cat, items] of Object.entries(varCategories)) {
    if (items.length > 0) {
      console.log(`\n  ${cat}:`);
      for (const item of items) console.log(`    - ${item}`);
    }
  }

  // Save full data
  const report = {
    timestamp: new Date().toISOString(),
    total_workflows: workflows.length,
    v4_count: v4.length,
    non_v4_count: nonV4.length,
    credentials: Object.fromEntries(allCredentials),
    placeholders: allPlaceholders
  };

  fs.writeFileSync('scripts/m1_audit_report.json', JSON.stringify(report, null, 2));
  console.log('\n\nFull report saved to scripts/m1_audit_report.json');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

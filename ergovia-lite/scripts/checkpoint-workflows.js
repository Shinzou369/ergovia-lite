/**
 * checkpoint-workflows.js
 * Pulls all [V4] workflows from live n8n and saves them locally.
 * Then compares them to the files in workflows/v4/ and shows differences.
 * Run from: cd ergovia-lite && node scripts/checkpoint-workflows.js
 */
require('dotenv').config();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const N8N_BASE = process.env.N8N_URL || 'http://116.203.115.12:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) { console.error('N8N_API_KEY not set in .env'); process.exit(1); }

// Where to save live copies
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const checkpointDir = path.join(__dirname, '..', 'workflows', `v4-checkpoint-${timestamp}`);
const localDir = path.join(__dirname, '..', 'workflows', 'v4');

function n8nReq(method, endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + '/api/v1/' + endpoint);
    const isHttps = url.protocol === 'https:';
    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    };
    const req = (isHttps ? https : http).request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getFullWorkflow(id) {
  const r = await n8nReq('GET', `workflows/${id}`);
  if (r.status !== 200) throw new Error(`Failed to get ${id}: ${r.status}`);
  return r.body;
}

function safeFileName(name) {
  // e.g. "WF1: AI Gateway - Unified Entry Point" -> "WF1_AI_Gateway.json"
  return name
    .replace(/^\[V4\]\s*/, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
    .trim() + '.json';
}

function countNodes(wf) {
  return (wf.nodes || []).length;
}

function getNodeNames(wf) {
  return (wf.nodes || []).map(n => n.name).sort();
}

async function main() {
  console.log('=== Ergovia Workflow Checkpoint ===');
  console.log(`Connecting to: ${N8N_BASE}\n`);

  // 1. List all [V4] workflows
  const list = await n8nReq('GET', 'workflows?limit=200');
  if (list.status !== 200) throw new Error('Cannot list workflows: ' + list.status);

  const v4Workflows = (list.body.data || []).filter(w => w.name.startsWith('[V4] '));
  console.log(`Found ${v4Workflows.length} [V4] workflows on live n8n\n`);

  // 2. Create checkpoint folder
  fs.mkdirSync(checkpointDir, { recursive: true });
  console.log(`Saving live copies to: workflows/v4-checkpoint-${timestamp}/\n`);

  // 3. Pull full definition for each and save
  const liveWorkflows = {};
  for (const wf of v4Workflows) {
    try {
      const full = await getFullWorkflow(wf.id);
      const fileName = safeFileName(wf.name);
      const savePath = path.join(checkpointDir, fileName);
      fs.writeFileSync(savePath, JSON.stringify(full, null, 2));
      liveWorkflows[wf.name] = full;
      console.log(`  ✅ Saved: ${wf.name}  (${countNodes(full)} nodes)`);
    } catch (err) {
      console.log(`  ❌ Failed: ${wf.name} — ${err.message}`);
    }
  }

  // 4. Compare to local v4/ files
  console.log('\n=== Comparison: Live vs Local Files ===\n');

  const localFiles = fs.readdirSync(localDir).filter(f => f.endsWith('.json'));
  const localWorkflows = {};
  for (const f of localFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(localDir, f), 'utf8'));
      localWorkflows[data.name] = data;
    } catch {}
  }

  // Build a combined list of all workflow base names
  const allNames = new Set();
  for (const name of Object.keys(liveWorkflows)) allNames.add(name);
  for (const name of Object.keys(localWorkflows)) allNames.add('[V4] ' + name);

  let differences = 0;

  for (const liveName of Object.keys(liveWorkflows)) {
    const baseName = liveName.slice(5); // strip "[V4] "
    const live = liveWorkflows[liveName];
    const local = localWorkflows[baseName] || localWorkflows[liveName];

    if (!local) {
      console.log(`  [NEW ON SERVER] ${liveName} — not in local files`);
      differences++;
      continue;
    }

    const liveNodes = getNodeNames(live);
    const localNodes = getNodeNames(local);
    const liveCount = countNodes(live);
    const localCount = countNodes(local);

    const addedNodes = liveNodes.filter(n => !localNodes.includes(n));
    const removedNodes = localNodes.filter(n => !liveNodes.includes(n));

    const liveActive = live.active;
    const localActive = local.active;

    const hasPlaceholders = JSON.stringify(local).includes('__WF_ID:');
    const liveFixed = !JSON.stringify(live).includes('__WF_ID:');

    if (addedNodes.length || removedNodes.length || liveCount !== localCount) {
      console.log(`  [CHANGED] ${liveName}`);
      console.log(`    Nodes: local=${localCount}, live=${liveCount}`);
      if (addedNodes.length) console.log(`    Added on server:   ${addedNodes.join(', ')}`);
      if (removedNodes.length) console.log(`    Removed on server: ${removedNodes.join(', ')}`);
      differences++;
    } else if (hasPlaceholders && liveFixed) {
      console.log(`  [FIXED]  ${liveName} — placeholders replaced with real IDs on server`);
      differences++;
    } else {
      console.log(`  [SAME]   ${liveName} — ${liveCount} nodes, no structural changes`);
    }

    // Check activation status
    if (liveActive !== localActive) {
      console.log(`    Status: local=${localActive ? 'active' : 'inactive'}, live=${liveActive ? 'active' : 'inactive'}`);
    }
  }

  // Local files not on server
  for (const localName of Object.keys(localWorkflows)) {
    const liveName = '[V4] ' + localName;
    if (!liveWorkflows[liveName] && !liveWorkflows[localName]) {
      console.log(`  [LOCAL ONLY] ${localName} — not found on live n8n`);
      differences++;
    }
  }

  console.log(`\n${differences === 0 ? '✅ All workflows match.' : `⚠️  ${differences} difference(s) found.`}`);
  console.log(`\nCheckpoint saved to: ergovia-lite/workflows/v4-checkpoint-${timestamp}/`);
  console.log('These are your live workflow backups. Safe to use as templates.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

/**
 * fix-and-activate.js
 * 1. Deletes old non-[V4] workflows that have a [V4] counterpart
 * 2. Deletes duplicate [V4] workflows (keeps the most recently updated one)
 * 3. Replaces __WF_ID:XXX__ placeholders with actual n8n workflow IDs
 * 4. Activates all [V4] workflows in correct order
 */
require('dotenv').config();
const https = require('https');
const http = require('http');

const N8N_BASE = process.env.N8N_URL || 'http://116.203.115.12:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) { console.error('ERROR: N8N_API_KEY not set'); process.exit(1); }

function n8nReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + '/api/v1/' + endpoint);
    const isHttps = url.protocol === 'https:';
    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    };
    const rb = body ? JSON.stringify(body) : undefined;
    if (rb) opts.headers['Content-Length'] = Buffer.byteLength(rb);
    const req = (isHttps ? https : http).request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (rb) req.write(rb);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== Fix & Activate All [V4] Workflows ===\n');

  // ── 1. List all workflows ─────────────────────────────────────────────────
  const listResp = await n8nReq('GET', 'workflows?limit=200');
  if (listResp.status !== 200) throw new Error('Cannot list workflows: ' + listResp.status);
  const all = listResp.body.data || [];
  console.log(`Total workflows in n8n: ${all.length}`);

  // ── 2. Separate [V4] from old, detect duplicates ──────────────────────────
  // v4Best: baseName -> the one to KEEP (highest updatedAt)
  const v4Best = {};
  const v4Dupes = []; // extras to delete

  for (const wf of all) {
    if (!wf.name.startsWith('[V4] ')) continue;
    const base = wf.name.slice(5);
    if (!v4Best[base]) {
      v4Best[base] = wf;
    } else {
      // Keep whichever was updated more recently
      const existing = v4Best[base];
      if (new Date(wf.updatedAt) > new Date(existing.updatedAt)) {
        v4Dupes.push(existing);
        v4Best[base] = wf;
      } else {
        v4Dupes.push(wf);
      }
    }
  }

  const oldWorkflows = all.filter(wf => !wf.name.startsWith('[V4] ') && v4Best[wf.name]);

  console.log(`\n[V4] workflows to keep: ${Object.keys(v4Best).length}`);
  for (const [base, wf] of Object.entries(v4Best)) {
    console.log(`  [V4] ${base} → ID: ${wf.id}`);
  }

  // ── 3. Delete duplicates ──────────────────────────────────────────────────
  if (v4Dupes.length) {
    console.log(`\n--- Deleting ${v4Dupes.length} duplicate [V4] workflow(s) ---`);
    for (const wf of v4Dupes) {
      await n8nReq('POST', `workflows/${wf.id}/deactivate`);
      await sleep(300);
      const r = await n8nReq('DELETE', `workflows/${wf.id}`);
      console.log(`  ${r.status < 300 ? '✅' : '❌'} Deleted duplicate "${wf.name}" (${wf.id})`);
      await sleep(300);
    }
  }

  // ── 4. Delete old non-[V4] counterparts ──────────────────────────────────
  if (oldWorkflows.length) {
    console.log(`\n--- Deleting ${oldWorkflows.length} old (non-[V4]) workflow(s) ---`);
    for (const wf of oldWorkflows) {
      await n8nReq('POST', `workflows/${wf.id}/deactivate`);
      await sleep(300);
      const r = await n8nReq('DELETE', `workflows/${wf.id}`);
      console.log(`  ${r.status < 300 ? '✅' : '❌'} Deleted old "${wf.name}" (${wf.id})`);
      await sleep(300);
    }
  }

  // ── 5. Build name→ID lookup for placeholder replacement ──────────────────
  // Keys: both "[V4] SUB: Universal Messenger" and "SUB: Universal Messenger"
  const nameToId = {};
  for (const [base, wf] of Object.entries(v4Best)) {
    nameToId[base] = wf.id;             // e.g. "SUB: Universal Messenger"
    nameToId[`[V4] ${base}`] = wf.id;  // e.g. "[V4] SUB: Universal Messenger"
  }

  // ── 6. Fix __WF_ID:XXX__ placeholders in every [V4] workflow ─────────────
  console.log('\n--- Fixing Execute Workflow node references ---');

  for (const [base, wfMeta] of Object.entries(v4Best)) {
    const full = await n8nReq('GET', `workflows/${wfMeta.id}`);
    if (full.status !== 200) { console.log(`  ⚠️  Cannot get ${wfMeta.id}`); continue; }
    const wf = full.body;

    let changed = false;
    for (const node of (wf.nodes || [])) {
      if (node.type !== 'n8n-nodes-base.executeWorkflow') continue;
      const wfId = node.parameters?.workflowId;
      if (!wfId) continue;

      // Handle both object form {"__rl":true,"value":"__WF_ID:..."} and plain string
      const raw = (typeof wfId === 'object' ? wfId.value : wfId) || '';
      if (!String(raw).startsWith('__WF_ID:')) continue;

      const refName = String(raw).replace(/^__WF_ID:/, '').replace(/__$/, '');
      const targetId = nameToId[refName];

      if (targetId) {
        console.log(`  [V4] ${base} / "${node.name}": "${refName}" → ${targetId}`);
        if (typeof node.parameters.workflowId === 'object') {
          node.parameters.workflowId.value = targetId;
          node.parameters.workflowId.mode = 'id';
        } else {
          node.parameters.workflowId = targetId;
        }
        changed = true;
      } else {
        console.log(`  ⚠️  [V4] ${base} / "${node.name}": unknown ref "${refName}"`);
      }
    }

    if (changed) {
      const upd = await n8nReq('PUT', `workflows/${wfMeta.id}`, {
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: wf.settings || { executionOrder: 'v1' },
      });
      console.log(`  ${upd.status === 200 ? '✅ Saved' : '❌ Save failed (' + upd.status + ')'}: [V4] ${base}`);
    } else {
      console.log(`  — No changes needed: [V4] ${base}`);
    }
    await sleep(500);
  }

  // ── 7. Activate in correct order ─────────────────────────────────────────
  console.log('\n--- Activating [V4] workflows ---');

  const activateOrder = [
    'SUB: Universal Messenger',
    'SUB: Owner & Staff Notifier',
    'WF2: Offer Conflict Manager',
    'WF3: Calendar Manager',
    'WF5: Property Operations',
    'WF6: Daily Automations',
    'WF7: Integration Hub',
    'WF4: Payment Processor',
    'WF8: Safety & Screening',
    'WF1: AI Gateway - Unified Entry Point',
  ];

  // Add any workflows not in the explicit order at the end
  for (const base of Object.keys(v4Best)) {
    if (!activateOrder.includes(base)) activateOrder.push(base);
  }

  for (const base of activateOrder) {
    if (!v4Best[base]) continue;
    const { id, name } = v4Best[base];
    await sleep(600);
    const r = await n8nReq('POST', `workflows/${id}/activate`);
    if (r.status === 200) {
      console.log(`  ✅ Activated: ${name}`);
    } else {
      const msg = (r.body?.message || JSON.stringify(r.body)).substring(0, 160);
      console.log(`  ⚠️  Failed: ${name}\n     ${msg}`);
    }
  }

  console.log('\n=== Complete ===');
  console.log('Run a smoke test or send a Telegram message to verify WF1 is live.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

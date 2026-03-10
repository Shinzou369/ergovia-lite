/**
 * v4-to-live.js
 *
 * Full pipeline:
 * 1. Pull V4 credential bindings (they work on this server)
 * 2. Archive all [V4] workflows
 * 3. Create [LIVE] copies of [V6] workflows using V4 credential bindings
 * 4. Activate [LIVE] in correct order (SUBs → WF2-WF8 → WF1)
 * 5. Archive all [V6] workflows
 * 6. Save [V6] JSONs locally to workflows/v6/
 */
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const N8N_HOST = 'n8n.ergovia-ai.com';

function apiReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://' + N8N_HOST + '/api/v1/' + endpoint);
    const rb = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
    };
    if (rb) opts.headers['Content-Length'] = Buffer.byteLength(rb);
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (rb) r.write(rb);
    r.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// Activation order: SUBs first, WF1 absolutely last
const ACTIVATE_ORDER = [
  'SUB: Universal Messenger',
  'SUB: Owner & Staff Notifier',
  'Payment Confirmation Webhook',
  'WF2: Offer Conflict Manager',
  'WF3: Calendar Manager',
  'WF5: Property Operations',
  'WF6: Daily Automations',
  'WF7: Integration Hub',
  'WF8: Safety & Screening',
  'WF4: Payment Processor',
  'WF1: AI Gateway - Unified Entry Point',
];

function baseName(name) {
  return name.replace(/^\[(V4|V6|LIVE)\]\s*/i, '');
}

// Extract credential bindings from a workflow's nodes
function extractCredBindings(wf) {
  const map = {}; // credType -> {id, name}
  (wf.nodes || []).forEach(n => {
    if (n.credentials) {
      Object.entries(n.credentials).forEach(([type, val]) => {
        if (val && val.id) map[type] = { id: val.id, name: val.name };
      });
    }
  });
  return map;
}

// Apply V4 credential bindings into V6 nodes
function applyCredBindings(nodes, credMap) {
  return nodes.map(n => {
    if (!n.credentials) return n;
    const newCreds = {};
    Object.entries(n.credentials).forEach(([type, val]) => {
      if (credMap[type]) {
        newCreds[type] = { id: credMap[type].id, name: credMap[type].name };
      } else {
        newCreds[type] = val; // keep as-is if no V4 mapping exists
      }
    });
    return { ...n, credentials: newCreds };
  });
}

async function main() {
  console.log('=== Ergovia: V6 → [LIVE] Pipeline ===\n');

  // 1. List all workflows
  const list = await apiReq('GET', 'workflows?limit=200');
  const all = list.body.data || [];

  const v4wfs = all.filter(w => w.name.startsWith('[V4]'));
  const v6wfs = all.filter(w => w.name.startsWith('[V6]'));
  console.log('Found:', v4wfs.length, 'V4 workflows,', v6wfs.length, 'V6 workflows\n');

  // 2. Pull full V4 workflows and build credential map
  console.log('--- Building credential map from V4 ---');
  const v4CredMap = {}; // baseName -> credMap
  for (const wf of v4wfs) {
    const r = await apiReq('GET', 'workflows/' + wf.id);
    if (r.status === 200) {
      const bn = baseName(wf.name);
      v4CredMap[bn] = extractCredBindings(r.body);
      const credTypes = Object.keys(v4CredMap[bn]);
      if (credTypes.length) console.log('  V4', bn, '→', credTypes.join(', '));
    }
    await delay(200);
  }

  // Build a global credential map (union of all V4 creds)
  const globalCredMap = {};
  Object.values(v4CredMap).forEach(cm => Object.assign(globalCredMap, cm));
  console.log('\nGlobal credential types found:', Object.keys(globalCredMap).join(', '));

  // 3. Pull full V6 workflows
  console.log('\n--- Pulling V6 workflows ---');
  const v6Full = {};
  for (const wf of v6wfs) {
    const r = await apiReq('GET', 'workflows/' + wf.id);
    if (r.status === 200) {
      v6Full[wf.id] = r.body;
      console.log('  Got:', wf.name, '(' + (r.body.nodes || []).length + ' nodes)');
    }
    await delay(200);
  }

  // 4. Save V6 locally BEFORE making any changes
  const localDir = path.join(__dirname, '..', 'workflows', 'v6');
  fs.mkdirSync(localDir, { recursive: true });
  console.log('\n--- Saving V6 locally to workflows/v6/ ---');
  for (const wf of v6wfs) {
    const full = v6Full[wf.id];
    if (!full) continue;
    const safeName = baseName(wf.name).replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60) + '.json';
    const savePath = path.join(localDir, safeName);
    fs.writeFileSync(savePath, JSON.stringify(full, null, 2));
    console.log('  Saved:', safeName);
  }

  // 5. Archive all V4
  console.log('\n--- Archiving V4 workflows ---');
  for (const wf of v4wfs) {
    // Deactivate first
    await apiReq('POST', 'workflows/' + wf.id + '/deactivate');
    await delay(200);
    // Archive via PUT with full body
    const r = await apiReq('GET', 'workflows/' + wf.id);
    if (r.status === 200) {
      const full = r.body;
      const put = await apiReq('PUT', 'workflows/' + wf.id, {
        name: full.name,
        nodes: full.nodes,
        connections: full.connections,
        settings: full.settings || {},
        isArchived: true,
      });
      if (put.status === 200) console.log('  Archived:', wf.name);
      else console.log('  WARN: could not archive', wf.name, put.status);
    }
    await delay(300);
  }

  // 6. Create [LIVE] copies from V6, with V4 credential bindings applied
  console.log('\n--- Creating [LIVE] workflows from V6 ---');
  const liveIds = {}; // baseName -> new live id

  for (const wf of v6wfs) {
    const full = v6Full[wf.id];
    if (!full) { console.log('  SKIP (no data):', wf.name); continue; }

    const bn = baseName(wf.name);
    const liveName = '[LIVE] ' + bn;

    // Apply credential bindings from V4 (per-workflow first, then global fallback)
    const credMap = Object.assign({}, globalCredMap, v4CredMap[bn] || {});
    const patchedNodes = applyCredBindings(full.nodes || [], credMap);

    // Also fix any Execute Workflow references — will fix after all [LIVE] created
    const body = {
      name: liveName,
      nodes: patchedNodes,
      connections: full.connections || {},
      settings: full.settings || { executionOrder: 'v1' },
    };

    const create = await apiReq('POST', 'workflows', body);
    if (create.status === 200) {
      liveIds[bn] = create.body.id;
      console.log('  Created:', liveName, '→ ID:', create.body.id);
    } else {
      console.log('  FAILED:', liveName, create.status, JSON.stringify(create.body).substring(0, 150));
    }
    await delay(500);
  }

  // 7. Fix Execute Workflow cross-references in [LIVE] workflows
  console.log('\n--- Fixing cross-references in [LIVE] workflows ---');
  for (const [bn, liveId] of Object.entries(liveIds)) {
    const r = await apiReq('GET', 'workflows/' + liveId);
    if (r.status !== 200) continue;
    const wf = r.body;
    let changed = false;

    for (const node of (wf.nodes || [])) {
      if (node.type !== 'n8n-nodes-base.executeWorkflow') continue;
      const wfIdField = node.parameters && node.parameters.workflowId;
      if (!wfIdField) continue;
      const refVal = typeof wfIdField === 'object' ? wfIdField.value : wfIdField;
      if (!refVal) continue;

      // Find if this references a V6 ID → map to LIVE ID
      const referencedV6 = v6wfs.find(w => w.id === refVal);
      if (referencedV6) {
        const refBase = baseName(referencedV6.name);
        const newId = liveIds[refBase];
        if (newId) {
          if (typeof wfIdField === 'object') {
            node.parameters.workflowId.value = newId;
          } else {
            node.parameters.workflowId = newId;
          }
          console.log('  Fixed ref in', bn, ':', node.name, '→', refBase, '(' + newId + ')');
          changed = true;
        }
      }

      // Also fix any V4 references
      const referencedV4 = v4wfs.find(w => w.id === refVal);
      if (referencedV4) {
        const refBase = baseName(referencedV4.name);
        const newId = liveIds[refBase];
        if (newId) {
          if (typeof wfIdField === 'object') {
            node.parameters.workflowId.value = newId;
          } else {
            node.parameters.workflowId = newId;
          }
          console.log('  Fixed V4 ref in', bn, ':', node.name, '→', refBase, '(' + newId + ')');
          changed = true;
        }
      }
    }

    if (changed) {
      const put = await apiReq('PUT', 'workflows/' + liveId, {
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: wf.settings || {},
      });
      if (put.status === 200) console.log('  Saved fixes for:', bn);
      else console.log('  WARN: save failed for', bn, put.status);
      await delay(300);
    }
  }

  // 8. Activate [LIVE] in correct order
  console.log('\n--- Activating [LIVE] workflows ---');
  for (const orderName of ACTIVATE_ORDER) {
    const liveId = liveIds[orderName];
    if (!liveId) {
      console.log('  SKIP (not found):', orderName);
      continue;
    }
    await delay(500);
    const act = await apiReq('POST', 'workflows/' + liveId + '/activate');
    if (act.status === 200) {
      console.log('  Activated: [LIVE]', orderName);
    } else {
      const msg = (act.body && act.body.message ? act.body.message : JSON.stringify(act.body)).substring(0, 180);
      console.log('  WARNING: [LIVE]', orderName, '-', msg);
    }
  }

  // 9. Archive V6
  console.log('\n--- Archiving V6 workflows (keep as templates) ---');
  for (const wf of v6wfs) {
    await apiReq('POST', 'workflows/' + wf.id + '/deactivate');
    await delay(200);
    const r = await apiReq('GET', 'workflows/' + wf.id);
    if (r.status === 200) {
      const full = r.body;
      const put = await apiReq('PUT', 'workflows/' + wf.id, {
        name: full.name,
        nodes: full.nodes,
        connections: full.connections,
        settings: full.settings || {},
        isArchived: true,
      });
      if (put.status === 200) console.log('  Archived:', wf.name);
      else console.log('  WARN:', wf.name, put.status);
    }
    await delay(300);
  }

  // 10. Final status
  console.log('\n=== Done! Final Status ===');
  const finalList = await apiReq('GET', 'workflows?limit=200');
  const finalAll = finalList.body.data || [];
  const live = finalAll.filter(w => w.name.startsWith('[LIVE]'));
  console.log('\n[LIVE] workflows (' + live.length + '):');
  live.forEach(w => console.log(' ', w.active ? '✅' : '❌', w.name));
  console.log('\nV6 saved locally to: ergovia-lite/workflows/v6/');
  console.log('V4 and V6 archived in n8n (accessible under Archives tab).');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

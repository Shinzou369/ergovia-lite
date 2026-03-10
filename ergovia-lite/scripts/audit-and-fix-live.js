/**
 * audit-and-fix-live.js
 * Full audit + fix of all [LIVE] workflows:
 *   1. Ensures every credential node uses the 3 approved working credentials
 *   2. Ensures every Execute Workflow node points to a [LIVE] workflow (not V4/V6)
 *   3. Deactivates → saves → reactivates any workflow that needed fixing
 */
require('dotenv').config();
const https = require('https');

const N8N_HOST = 'n8n.ergovia-ai.com';

// ── The 3 approved working credentials ──────────────────────────────────────
const APPROVED_CREDS = {
  // Credential type → { id, name }
  postgres:           { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' },
  memoryPostgresChat: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' },
  openAiApi:          { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
  lmChatOpenAi:       { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
  telegramApi:        { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' },
  // Twilio stays as-is (no replacement provided)
};
// ────────────────────────────────────────────────────────────────────────────

function apiReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://' + N8N_HOST + '/api/v1/' + endpoint);
    const rb = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' },
    };
    if (rb) opts.headers['Content-Length'] = Buffer.byteLength(rb);
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch  { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (rb) r.write(rb);
    r.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== Full Audit & Fix of [LIVE] Workflows ===\n');

  // Get all workflows
  const list = await apiReq('GET', 'workflows?limit=200');
  const all = list.body.data || [];

  const liveWfs = all.filter(w => w.name.startsWith('[LIVE]'));
  const v4Wfs   = all.filter(w => w.name.startsWith('[V4]'));
  const v6Wfs   = all.filter(w => w.name.startsWith('[V6]'));

  console.log(`Found ${liveWfs.length} [LIVE], ${v4Wfs.length} [V4], ${v6Wfs.length} [V6] workflows\n`);

  // Build [LIVE] name → id map (for cross-reference fixing)
  const liveIdMap = {}; // baseName → id
  liveWfs.forEach(w => {
    const base = w.name.replace(/^\[LIVE\]\s*/, '');
    liveIdMap[base] = w.id;
  });

  // Build stale-id → live-id map (V4 + V6 IDs that should become LIVE IDs)
  const staleToLive = {};
  [...v4Wfs, ...v6Wfs].forEach(w => {
    const base = w.name.replace(/^\[(V4|V6)\]\s*/i, '');
    if (liveIdMap[base]) staleToLive[w.id] = { liveId: liveIdMap[base], liveName: '[LIVE] ' + base };
  });

  let totalCredFixes = 0;
  let totalRefFixes  = 0;

  // Process each [LIVE] workflow
  for (const wf of liveWfs) {
    console.log(`─── ${wf.name} ───`);
    const r = await apiReq('GET', 'workflows/' + wf.id);
    if (r.status !== 200) { console.log('  Cannot GET — skipping'); continue; }
    const full = r.body;

    let credFixes = 0;
    let refFixes  = 0;
    const issues  = [];

    for (const node of (full.nodes || [])) {
      // ── 1. Fix credentials ──────────────────────────────────────────────
      if (node.credentials) {
        const newCreds = {};
        for (const [type, val] of Object.entries(node.credentials)) {
          const approved = APPROVED_CREDS[type];
          if (approved) {
            if (!val || !val.id || val.id !== approved.id) {
              newCreds[type] = approved;
              issues.push(`  🔑 Fixed cred on "${node.name}": ${type} → ${approved.id}`);
              credFixes++;
            } else {
              newCreds[type] = val; // already correct
            }
          } else {
            newCreds[type] = val; // unknown type — keep as-is
          }
        }
        node.credentials = newCreds;
      } else {
        // Node has NO credentials object — check if it needs one based on node type
        const needsCred = {
          'n8n-nodes-base.telegram':        'telegramApi',
          'n8n-nodes-base.telegramTrigger': 'telegramApi',
          '@n8n/n8n-nodes-langchain.lmChatOpenAi': 'lmChatOpenAi',
          '@n8n/n8n-nodes-langchain.memoryPostgresChat': 'memoryPostgresChat',
          'n8n-nodes-base.postgres':        'postgres',
          'n8n-nodes-base.openAi':          'openAiApi',
        };
        const credType = needsCred[node.type];
        if (credType && APPROVED_CREDS[credType]) {
          node.credentials = { [credType]: APPROVED_CREDS[credType] };
          issues.push(`  🔑 Injected cred on "${node.name}" (${node.type}): ${credType}`);
          credFixes++;
        }
      }

      // ── 2. Fix Execute Workflow cross-references ─────────────────────────
      if (node.type === 'n8n-nodes-base.executeWorkflow' && node.parameters) {
        const wfIdParam = node.parameters.workflowId;
        if (!wfIdParam) continue;

        const refId = typeof wfIdParam === 'object' ? wfIdParam.value : wfIdParam;
        if (!refId) continue;

        const replacement = staleToLive[refId];
        if (replacement) {
          if (typeof wfIdParam === 'object') {
            node.parameters.workflowId.value = replacement.liveId;
            node.parameters.workflowId.mode  = 'id';
          } else {
            node.parameters.workflowId = replacement.liveId;
          }
          issues.push(`  🔗 Fixed ref in "${node.name}": was ${refId} → ${replacement.liveId} (${replacement.liveName})`);
          refFixes++;
        }
      }
    }

    if (issues.length === 0) {
      console.log('  ✅ All credentials and references OK — no changes needed');
      console.log('');
      await delay(150);
      continue;
    }

    issues.forEach(i => console.log(i));
    console.log(`  → ${credFixes} credential fix(es), ${refFixes} reference fix(es)`);

    // Deactivate → save → reactivate
    await apiReq('POST', 'workflows/' + wf.id + '/deactivate');
    await delay(300);

    const put = await apiReq('PUT', 'workflows/' + wf.id, {
      name: full.name,
      nodes: full.nodes,
      connections: full.connections,
      settings: full.settings || {},
    });

    if (put.status === 200) {
      console.log('  💾 Saved');
    } else {
      console.log('  ❌ Save failed:', put.status, JSON.stringify(put.body).substring(0, 150));
      console.log('');
      continue;
    }

    await delay(400);

    const act = await apiReq('POST', 'workflows/' + wf.id + '/activate');
    if (act.status === 200) {
      console.log('  ⚡ Reactivated');
    } else {
      const msg = act.body && act.body.message ? act.body.message : JSON.stringify(act.body);
      console.log('  ⚠️  Activation:', msg.substring(0, 200));
    }

    totalCredFixes += credFixes;
    totalRefFixes  += refFixes;
    console.log('');
    await delay(400);
  }

  // Final summary
  console.log('═══════════════════════════════════════');
  console.log(`Total credential fixes: ${totalCredFixes}`);
  console.log(`Total reference fixes:  ${totalRefFixes}`);

  console.log('\n=== Final [LIVE] Activation Status ===');
  const finalList = await apiReq('GET', 'workflows?limit=200');
  const finalLive = (finalList.body.data || []).filter(w => w.name.startsWith('[LIVE]'));
  finalLive.sort((a, b) => a.name.localeCompare(b.name));
  finalLive.forEach(w => console.log(w.active ? '  ✅' : '  ❌', w.name, w.active ? '' : '← NEEDS ATTENTION'));
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

/**
 * inject-live-creds.js
 * Injects missing credential objects into [LIVE] WF1, WF4, WF5
 * by copying them from the V4 equivalents node-by-node.
 */
require('dotenv').config();
const https = require('https');

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

// Confirmed IDs from debug output
const PAIRS = [
  { liveName: '[LIVE] WF1: AI Gateway - Unified Entry Point', liveId: 'LMkR7as0CSGDtjbE', v4Name: '[V4] WF1: AI Gateway - Unified Entry Point' },
  { liveName: '[LIVE] WF4: Payment Processor',                liveId: 'UZyrXbwQRO5tTBvf', v4Name: '[V4] WF4: Payment Processor' },
  { liveName: '[LIVE] WF5: Property Operations',              liveId: 'EmQTeZuvhA2CQxzr', v4Name: '[V4] WF5: Property Operations' },
];

async function main() {
  // Get V4 IDs from live list
  const list = await apiReq('GET', 'workflows?limit=200');
  const all = list.body.data || [];

  for (const pair of PAIRS) {
    console.log('\n--- Processing:', pair.liveName, '---');

    const v4Entry = all.find(w => w.name === pair.v4Name);
    if (!v4Entry) { console.log('  V4 not found:', pair.v4Name); continue; }

    // Get both full workflows
    const [liveR, v4R] = await Promise.all([
      apiReq('GET', 'workflows/' + pair.liveId),
      apiReq('GET', 'workflows/' + v4Entry.id),
    ]);

    if (liveR.status !== 200) { console.log('  Cannot get LIVE workflow'); continue; }
    if (v4R.status !== 200)   { console.log('  Cannot get V4 workflow'); continue; }

    const liveWf = liveR.body;
    const v4Wf   = v4R.body;

    // Build V4 node map by name
    const v4NodeMap = {};
    (v4Wf.nodes || []).forEach(n => { v4NodeMap[n.name] = n; });

    let fixed = 0;

    // For each node in LIVE, if credentials missing but V4 has them → inject
    for (const node of (liveWf.nodes || [])) {
      const v4Node = v4NodeMap[node.name];
      if (!v4Node || !v4Node.credentials) continue;

      const liveCredKeys = node.credentials ? Object.keys(node.credentials) : [];
      if (liveCredKeys.length > 0) continue; // already has credentials

      // Inject V4 credentials
      node.credentials = JSON.parse(JSON.stringify(v4Node.credentials));
      fixed++;
      console.log('  Injected creds into:', node.name, '→', Object.keys(node.credentials).join(', '));
    }

    if (fixed === 0) {
      console.log('  No nodes needed credential injection.');
      continue;
    }

    // Save updated workflow
    const put = await apiReq('PUT', 'workflows/' + pair.liveId, {
      name: liveWf.name,
      nodes: liveWf.nodes,
      connections: liveWf.connections,
      settings: liveWf.settings || {},
    });

    if (put.status === 200) {
      console.log('  Saved (' + fixed + ' nodes fixed)');
    } else {
      console.log('  SAVE FAILED:', put.status, JSON.stringify(put.body).substring(0, 150));
      continue;
    }

    await delay(500);

    // Activate
    const act = await apiReq('POST', 'workflows/' + pair.liveId + '/activate');
    if (act.status === 200) {
      console.log('  Activated:', pair.liveName);
    } else {
      const msg = act.body && act.body.message ? act.body.message : JSON.stringify(act.body);
      console.log('  Activation result:', msg.substring(0, 200));
    }

    await delay(400);
  }

  // Final status check
  console.log('\n=== Final [LIVE] Status ===');
  const finalList = await apiReq('GET', 'workflows?limit=200');
  const live = (finalList.body.data || []).filter(w => w.name.startsWith('[LIVE]'));
  live.sort((a, b) => a.name.localeCompare(b.name));
  live.forEach(w => console.log(w.active ? '  ✅' : '  ❌', w.name));
}

main().catch(err => console.error('Fatal:', err.message));

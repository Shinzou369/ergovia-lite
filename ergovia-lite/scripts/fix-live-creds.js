/**
 * fix-live-creds.js
 * Finds exactly which nodes have missing credentials in [LIVE] WF1, WF4, WF5
 * and fixes them using V4 credential IDs.
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

// IDs of the failing [LIVE] workflows
const FAILING = [
  { id: 'LMkR7as0CSGDtjbE', name: '[LIVE] WF1: AI Gateway' },
  { id: 'UZyrXbwQRO5tTBvf', name: '[LIVE] WF4: Payment Processor' },
  { id: 'EmQTeZuvhA2CQxzr', name: '[LIVE] WF5: Property Operations' },
];

// V4 equivalents to get working credential IDs from
const V4_REFS = [
  { id: 'AfzP3g1vIUNcSL8c', name: '[V4] WF1' },
  { id: 'rCPfpFB6mkv3P6zp', name: '[V4] WF4' }, // will look up dynamically
];

async function main() {
  // First, get all workflows to find V4 IDs dynamically
  const list = await apiReq('GET', 'workflows?limit=200');
  const all = list.body.data || [];
  const v4wfs = all.filter(w => w.name.startsWith('[V4]'));

  // Build global credential map from ALL V4 workflows
  console.log('Building credential map from V4...');
  const globalCredMap = {};
  for (const wf of v4wfs) {
    const r = await apiReq('GET', 'workflows/' + wf.id);
    if (r.status !== 200) continue;
    (r.body.nodes || []).forEach(n => {
      if (n.credentials) {
        Object.entries(n.credentials).forEach(([type, val]) => {
          if (val && val.id) {
            globalCredMap[type] = { id: val.id, name: val.name || type };
          }
        });
      }
    });
    await delay(150);
  }
  console.log('Credential types from V4:', Object.keys(globalCredMap).join(', '));
  console.log('Full map:', JSON.stringify(globalCredMap, null, 2));

  // Now fix each failing [LIVE] workflow
  for (const wf of FAILING) {
    console.log('\n--- Fixing:', wf.name, '---');
    const r = await apiReq('GET', 'workflows/' + wf.id);
    if (r.status !== 200) { console.log('Cannot GET:', wf.name); continue; }
    const full = r.body;

    let fixed = 0;
    const problematicNodes = [];

    for (const node of (full.nodes || [])) {
      if (!node.credentials) continue;
      let nodeFixed = false;

      const newCreds = {};
      for (const [type, val] of Object.entries(node.credentials)) {
        if (!val || !val.id) {
          // Missing credential ID — apply from global map
          if (globalCredMap[type]) {
            newCreds[type] = globalCredMap[type];
            console.log('  Fixed node:', node.name, '| type:', type, '→', globalCredMap[type].id);
            nodeFixed = true;
            fixed++;
          } else {
            console.log('  UNKNOWN cred type:', type, 'in node:', node.name);
            newCreds[type] = val;
            problematicNodes.push(node.name + ' (' + type + ')');
          }
        } else {
          newCreds[type] = val; // already has ID
        }
      }
      node.credentials = newCreds;
    }

    if (fixed === 0 && problematicNodes.length === 0) {
      console.log('  No missing credentials found — checking all nodes...');
      (full.nodes || []).forEach(n => {
        if (n.credentials) {
          Object.entries(n.credentials).forEach(([type, val]) => {
            console.log('   Node:', n.name, '| type:', type, '| id:', val && val.id ? val.id : 'MISSING');
          });
        }
      });
    }

    // Save fixed workflow
    if (fixed > 0 || problematicNodes.length === 0) {
      const put = await apiReq('PUT', 'workflows/' + wf.id, {
        name: full.name,
        nodes: full.nodes,
        connections: full.connections,
        settings: full.settings || {},
      });
      if (put.status === 200) {
        console.log('  Saved', wf.name, '(' + fixed + ' credentials fixed)');
      } else {
        console.log('  SAVE FAILED:', put.status, JSON.stringify(put.body).substring(0, 150));
      }
      await delay(300);

      // Try to activate
      const act = await apiReq('POST', 'workflows/' + wf.id + '/activate');
      if (act.status === 200) {
        console.log('  Activated:', wf.name);
      } else {
        const msg = act.body && act.body.message ? act.body.message : JSON.stringify(act.body);
        console.log('  Activation warning:', msg.substring(0, 200));
      }
    }

    if (problematicNodes.length) {
      console.log('  Still needs manual credential assignment:', problematicNodes.join(', '));
    }
    await delay(400);
  }
}

main().catch(err => console.error('Fatal:', err.message));

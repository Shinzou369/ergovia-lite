/**
 * Fix WF6: Remove broken Merge Outputs node
 *
 * Problem: Merge Outputs uses mode "combine" which needs TWO inputs.
 * All 6 source nodes feed into input 0 only — input 1 never receives data.
 * In combine mode, this means the Merge blocks and produces null output.
 *
 * Fix: Remove the Merge node entirely and connect the 6 sources
 * directly to Send Reports (same pattern as Prepare Reset Message
 * and Nightly Report which already bypass Merge and work fine).
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'ccEOaNnIwY6eeJOn';

const changes = [];

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + apiPath);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  changes.push(msg);
  console.log('  ✓ ' + msg);
}

async function main() {
  console.log('=== WF6: Remove broken Merge Outputs node ===\n');

  console.log('1. Downloading live WF6...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── Step 1: Identify nodes that feed INTO Merge Outputs ───
  console.log('2. Analyzing connections...');
  const mergeInputSources = [];
  for (const [src, conns] of Object.entries(wf.connections)) {
    for (const group of (conns.main || [])) {
      for (const c of group) {
        if (c.node === 'Merge Outputs') {
          mergeInputSources.push(src);
          console.log(`   ${src} → Merge Outputs (will rewire to Send Reports)`);
        }
      }
    }
  }

  // ─── Step 2: Remove Merge Outputs node ───
  console.log('\n3. Removing Merge Outputs node...');
  const mergeIdx = wf.nodes.findIndex(n => n.name === 'Merge Outputs');
  if (mergeIdx === -1) {
    console.error('   Merge Outputs node not found!');
    return;
  }
  wf.nodes.splice(mergeIdx, 1);
  log('Removed Merge Outputs node from workflow');

  // ─── Step 3: Remove Merge Outputs connections (outgoing) ───
  delete wf.connections['Merge Outputs'];
  log('Removed Merge Outputs outgoing connections');

  // ─── Step 4: Rewire sources to Send Reports directly ───
  console.log('\n4. Rewiring connections...');
  for (const src of mergeInputSources) {
    if (!wf.connections[src]) continue;

    // Find and replace connections that pointed to Merge Outputs
    for (const group of (wf.connections[src].main || [])) {
      for (let i = group.length - 1; i >= 0; i--) {
        if (group[i].node === 'Merge Outputs') {
          group[i] = {
            node: 'Send Reports',
            type: 'main',
            index: 0
          };
          log(`Rewired: ${src} → Send Reports (was → Merge Outputs)`);
        }
      }
    }
  }

  // ─── Step 5: Verify final connection state ───
  console.log('\n5. Verifying final connections into Send Reports...');
  for (const [src, conns] of Object.entries(wf.connections)) {
    for (const group of (conns.main || [])) {
      for (const c of group) {
        if (c.node === 'Send Reports') {
          console.log(`   ${src} → Send Reports ✓`);
        }
      }
    }
  }

  // ─── Step 6: Deploy ───
  console.log('\n6. Deploying...');

  console.log('   Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  await sleep(1500);

  console.log('   Updating...');
  const result = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  });

  if (result.id) {
    console.log('   Update successful! Nodes: ' + result.nodes.length);
  } else {
    console.error('   Update failed:', JSON.stringify(result).substring(0, 300));
    return;
  }
  await sleep(1000);

  console.log('   Reactivating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('   Active:', activateResult.active);

  // ─── Summary ───
  console.log('\n═══════════════════════════════════════');
  console.log(`SUMMARY: ${changes.length} changes applied`);
  console.log('═══════════════════════════════════════');
  for (const c of changes) {
    console.log('  • ' + c);
  }

  console.log('\nFlow is now:');
  console.log('  Morning path:  Budget OK? → Generate Morning Brief  → Send Reports');
  console.log('                 Budget OK? → Template Morning        → Send Reports');
  console.log('  Evening path:  Budget OK? → Generate Evening Update → Send Reports');
  console.log('                 Budget OK? → Template Evening        → Send Reports');
  console.log('  Weekly path:   Budget OK? → Generate Weekly Report  → Send Reports');
  console.log('                 Budget OK? → Template Weekly         → Send Reports');
  console.log('  Monthly path:  Prepare Reset Message                → Send Reports');
  console.log('  Nightly path:  Nightly Report                      → Send Reports');
  console.log('\n(Merge Outputs removed — no longer blocking the pipeline)');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

require('dotenv').config();
const https = require('https');

function apiReq(method, endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com/api/v1/' + endpoint);
    const opts = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

function getNodeTypes(wf) {
  return [...new Set((wf.nodes || []).map(n => n.type))].sort();
}

function getTriggerNodes(wf) {
  return (wf.nodes || []).filter(n =>
    n.type.includes('trigger') || n.type.includes('webhook') || n.type.includes('schedule')
  ).map(n => n.name);
}

function getCredentialNames(wf) {
  const creds = new Set();
  (wf.nodes || []).forEach(n => {
    if (n.credentials) {
      Object.entries(n.credentials).forEach(([type, val]) => {
        creds.add(type + ' → ' + (val.name || val.id || 'unknown'));
      });
    }
  });
  return [...creds].sort();
}

function hasCredentialGaps(wf) {
  return (wf.nodes || []).some(n => {
    if (!n.credentials) return false;
    return Object.values(n.credentials).some(c => !c.id && !c.name);
  });
}

async function main() {
  const list = await apiReq('GET', 'workflows?limit=200');
  const all = list.body.data || [];

  const v4 = all.filter(w => w.name.startsWith('[V4]'));
  const v6 = all.filter(w => w.name.startsWith('[V6]'));

  console.log('=== V4 vs V6 Side-by-Side Comparison ===\n');
  console.log('V4 workflow count:', v4.length);
  console.log('V6 workflow count:', v6.length);
  console.log('');

  // Map by base name (strip prefix)
  const v4map = {};
  v4.forEach(w => { v4map[w.name.replace(/^\[V4\]\s*/, '')] = w; });
  const v6map = {};
  v6.forEach(w => { v6map[w.name.replace(/^\[V6\]\s*/, '')] = w; });

  const allNames = new Set([...Object.keys(v4map), ...Object.keys(v6map)]);

  for (const name of [...allNames].sort()) {
    const wv4 = v4map[name];
    const wv6 = v6map[name];
    console.log('───────────────────────────────────────────────');
    console.log('Workflow:', name);

    if (!wv4) { console.log('  V4: NOT PRESENT'); }
    if (!wv6) { console.log('  V6: NOT PRESENT'); }
    if (!wv4 || !wv6) { console.log(''); continue; }

    // Get full details
    const [fv4, fv6] = await Promise.all([
      apiReq('GET', 'workflows/' + wv4.id),
      apiReq('GET', 'workflows/' + wv6.id),
    ]);
    const fw4 = fv4.body;
    const fw6 = fv6.body;

    const n4 = (fw4.nodes || []).length;
    const n6 = (fw6.nodes || []).length;
    const nodeDiff = n6 - n4;

    console.log('  Nodes:    V4=' + n4 + '  V6=' + n6 + (nodeDiff !== 0 ? '  (V6 has ' + (nodeDiff > 0 ? '+' : '') + nodeDiff + ')' : '  (same count)'));
    console.log('  Active:   V4=' + wv4.active + '  V6=' + wv6.active);
    console.log('  Archived: V4=' + (wv4.isArchived || false) + '  V6=' + (wv6.isArchived || false));

    const t4 = getTriggerNodes(fw4);
    const t6 = getTriggerNodes(fw6);
    if (JSON.stringify(t4) !== JSON.stringify(t6)) {
      console.log('  Triggers: V4=[' + t4.join(', ') + ']');
      console.log('            V6=[' + t6.join(', ') + ']');
    } else {
      console.log('  Triggers: same (' + t4.join(', ') + ')');
    }

    // Nodes only in V6
    const v4NodeNames = (fw4.nodes || []).map(n => n.name);
    const v6NodeNames = (fw6.nodes || []).map(n => n.name);
    const newInV6 = v6NodeNames.filter(n => !v4NodeNames.includes(n));
    const removedInV6 = v4NodeNames.filter(n => !v6NodeNames.includes(n));
    if (newInV6.length) console.log('  New in V6: ' + newInV6.join(', '));
    if (removedInV6.length) console.log('  Removed in V6: ' + removedInV6.join(', '));

    const credGap4 = hasCredentialGaps(fw4);
    const credGap6 = hasCredentialGaps(fw6);
    if (credGap6) console.log('  ⚠️  V6 has missing/unset credentials');
    if (!credGap6 && !credGap4) console.log('  Credentials: both OK');

    console.log('');
    await delay(200);
  }

  console.log('=== Summary ===');
  console.log('V4 workflows only in V4 (not in V6):', [...allNames].filter(n => v4map[n] && !v6map[n]).join(', ') || 'none');
  console.log('V6 workflows only in V6 (not in V4):', [...allNames].filter(n => !v4map[n] && v6map[n]).join(', ') || 'none');
  const credIssues = v6.filter(w => w.name).map(w => w.name);
  console.log('\nV6 activation status:');
  v6.sort((a,b) => a.name.localeCompare(b.name)).forEach(w => {
    const status = w.active ? '✅ Active' : '❌ Inactive';
    console.log('  ' + status + '  ' + w.name);
  });
}

main().catch(err => console.error('Fatal:', err.message));

require('dotenv').config();
const http = require('http');
function req(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL('http://116.203.115.12:5678/api/v1/' + endpoint);
    const r = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET', headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }); r.on('error', reject); r.end();
  });
}
req('workflows?limit=200').then(r => {
  const wfs = r.data || [];
  const archived = wfs.filter(w => w.isArchived === true);
  console.log('=== ALL ARCHIVED WORKFLOWS (' + archived.length + ' total) ===\n');

  // Group by version prefix
  const groups = {};
  archived.forEach(w => {
    const match = w.name.match(/^\[(V\d+|v\d+)\]/i);
    const group = match ? match[1].toUpperCase() : 'NO PREFIX';
    if (!groups[group]) groups[group] = [];
    groups[group].push(w);
  });

  Object.keys(groups).sort().forEach(g => {
    console.log('[' + g + '] — ' + groups[g].length + ' workflow(s):');
    groups[g].forEach(w => console.log('  ID:', w.id, '| Name:', w.name));
    console.log('');
  });

  // Check specifically for any V4 label
  const v4archived = archived.filter(w => w.name.toLowerCase().includes('v4'));
  console.log('=== Workflows with "V4" anywhere in the name ===');
  if (v4archived.length === 0) {
    console.log('  None found.');
  } else {
    v4archived.forEach(w => console.log('  ID:', w.id, '| Name:', w.name));
  }
}).catch(console.error);

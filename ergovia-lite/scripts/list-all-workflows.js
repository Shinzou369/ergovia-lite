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
  console.log('Total workflows:', wfs.length);
  const v4 = wfs.filter(w => w.name.startsWith('[V4]'));
  const other = wfs.filter(w => !w.name.startsWith('[V4]'));
  console.log('\n[V4] workflows (' + v4.length + '):');
  v4.forEach(w => console.log(' ', w.id, '|', w.name, '| active:', w.active, '| archived:', w.isArchived));
  console.log('\nOther workflows (' + other.length + '):');
  other.forEach(w => console.log(' ', w.id, '|', w.name, '| active:', w.active, '| archived:', w.isArchived));
}).catch(console.error);

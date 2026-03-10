require('dotenv').config();
const http = require('http');
const KEY = process.env.N8N_API_KEY;
const r = http.request({hostname:'116.203.115.12',port:5678,path:'/api/v1/workflows?limit=200',method:'GET',headers:{'X-N8N-API-KEY':KEY}}, res => {
  let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
    const wfs = JSON.parse(d).data || [];
    const live  = wfs.filter(w => w.name.startsWith('[LIVE]'));
    const v4    = wfs.filter(w => w.name.startsWith('[V4]'));
    const v6    = wfs.filter(w => w.name.startsWith('[V6]'));
    const other = wfs.filter(w => {
      const n = w.name;
      return !n.startsWith('[LIVE]') && !n.startsWith('[V4]') && !n.startsWith('[V6]');
    });
    console.log('LIVE:', live.length, '| V4:', v4.length, '| V6:', v6.length, '| Other:', other.length);
    console.log('Total active:', wfs.filter(w=>w.active).length, '| Total:', wfs.length);
    if (other.length) {
      console.log('\nOther workflows:');
      other.forEach(w => console.log(' ', w.active ? '[ON]' : '[off]', w.name));
    }
    if (v4.length) console.log('\nV4 still present (not archived):', v4.map(w=>w.name).join(', ').slice(0,120));
    if (v6.length) console.log('V6 still present (not archived):', v6.map(w=>w.name).join(', ').slice(0,120));
  });
}); r.on('error',e=>console.error(e.message)); r.end();

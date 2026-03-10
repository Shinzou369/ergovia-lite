/**
 * debug-live-creds.js
 * Shows exactly which nodes need credentials in LIVE WF1/WF4/WF5
 */
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
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject); r.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// IDs confirmed from previous script
const TARGETS = [
  { liveId: 'LMkR7as0CSGDtjbE', v4Id: 'AfzP3g1vIUNcSL8c', name: 'WF1' },
  { liveId: 'UZyrXbwQRO5tTBvf', v4Id: null, name: 'WF4' },
  { liveId: 'EmQTeZuvhA2CQxzr', v4Id: null, name: 'WF5' },
];

async function main() {
  // Get all workflows to find V4 IDs for WF4 and WF5
  const list = await apiReq('GET', 'workflows?limit=200');
  const all = (list.body.data || list.body || []);
  console.log('Total workflows found:', all.length);

  const v4WF4 = all.find(w => w.name === '[V4] WF4: Payment Processor');
  const v4WF5 = all.find(w => w.name === '[V4] WF5: Property Operations');
  if (v4WF4) TARGETS[1].v4Id = v4WF4.id;
  if (v4WF5) TARGETS[2].v4Id = v4WF5.id;

  for (const target of TARGETS) {
    console.log('\n====', target.name, '====');

    const liveR = await apiReq('GET', 'workflows/' + target.liveId);
    const liveNodes = liveR.body.nodes || [];
    console.log('LIVE nodes:', liveNodes.length);

    let v4Nodes = [];
    if (target.v4Id) {
      const v4R = await apiReq('GET', 'workflows/' + target.v4Id);
      v4Nodes = v4R.body.nodes || [];
      console.log('V4 nodes:', v4Nodes.length);
    }

    const v4NodeMap = {};
    v4Nodes.forEach(n => v4NodeMap[n.name] = n);

    // Print all nodes with their credential status
    liveNodes.forEach(n => {
      const liveCreds = n.credentials ? Object.entries(n.credentials) : [];
      const v4Creds = v4NodeMap[n.name] && v4NodeMap[n.name].credentials
        ? Object.entries(v4NodeMap[n.name].credentials) : [];

      if (liveCreds.length > 0 || v4Creds.length > 0) {
        const status = liveCreds.length === 0 ? '❌ MISSING' : '✅';
        console.log(status, n.name, '|', n.type.split('.').pop());
        liveCreds.forEach(([type, val]) => {
          console.log('   LIVE:', type, '→ id:', val ? val.id : 'NULL', 'name:', val ? val.name : 'NULL');
        });
        if (liveCreds.length === 0 && v4Creds.length > 0) {
          v4Creds.forEach(([type, val]) => {
            console.log('   V4  :', type, '→ id:', val ? val.id : 'NULL', 'name:', val ? val.name : 'NULL');
          });
        }
      }
    });

    await delay(300);
  }
}

main().catch(err => console.error('Fatal:', err.message));

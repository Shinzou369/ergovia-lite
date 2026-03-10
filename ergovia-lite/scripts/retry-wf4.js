require('dotenv').config();
const https = require('https');

function apiReq(method, endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com/api/v1/' + endpoint);
    const opts = {
      hostname: url.hostname,
      port: 443,
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

async function main() {
  // Retry WF4 (WF7 is now active)
  console.log('Retrying WF4: Payment Processor...');
  const wf4 = await apiReq('POST', 'workflows/ufEMxTqG9G3Xu7uR/activate');
  console.log('WF4:', wf4.status === 200 ? 'Activated OK' : 'FAILED: ' + JSON.stringify(wf4.body).substring(0, 200));

  // Check WF1 and WF5 status
  console.log('\nChecking WF1 status...');
  const wf1 = await apiReq('GET', 'workflows/8IEpGXUsuikWk1CM');
  if (wf1.status === 200) {
    console.log('WF1 active:', wf1.body.active);
    const noCredNodes = (wf1.body.nodes || []).filter(n => {
      const creds = n.credentials;
      return creds && Object.values(creds).some(c => !c.id);
    });
    if (noCredNodes.length) console.log('  Nodes missing credentials:', noCredNodes.map(n => n.name).join(', '));
  }
}

main().catch(err => console.error('Fatal:', err.message));

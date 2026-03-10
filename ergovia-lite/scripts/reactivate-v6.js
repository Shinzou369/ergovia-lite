require('dotenv').config();
const http = require('https');

function apiReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com/api/v1/' + endpoint);
    const rb = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
    };
    if (rb) opts.headers['Content-Length'] = Buffer.byteLength(rb);
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (rb) r.write(rb);
    r.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// V6 workflows — SUBs first, WF1 absolutely last
const v6 = [
  { id: 'KNE9fQCug6kblKt7', name: 'SUB: Universal Messenger' },
  { id: 'PJW347afVrkbPvyR', name: 'SUB: Owner & Staff Notifier' },
  { id: 'VwlpcjbT2e1TImdk', name: 'WF2: Offer Conflict Manager' },
  { id: 'BfGRX3qC6hlVBDTA', name: 'WF3: Calendar Manager' },
  { id: 'ufEMxTqG9G3Xu7uR', name: 'WF4: Payment Processor' },
  { id: 'CPWfe3zlpdGVp16w', name: 'WF5: Property Operations' },
  { id: 'eFerDAYGeETz3Ahe', name: 'WF6: Daily Automations' },
  { id: 'btD6BZXCkQ9nmeqN', name: 'WF7: Integration Hub' },
  { id: 'B6QrfXRjrECh34i0', name: 'WF8: Safety & Screening' },
  { id: 'j1ieQAwOyye2cPYD', name: 'Payment Confirmation Webhook' },
  { id: '8IEpGXUsuikWk1CM', name: 'WF1: AI Gateway' },
];

async function main() {
  console.log('=== Step 1: Unarchiving all V6 workflows ===');
  for (const wf of v6) {
    const patch = await apiReq('PATCH', 'workflows/' + wf.id, { isArchived: false });
    if (patch.status === 200) {
      console.log('  Unarchived:', wf.name);
    } else {
      console.log('  FAILED unarchive', wf.name, patch.status, JSON.stringify(patch.body).substring(0, 100));
    }
    await delay(300);
  }

  console.log('\n=== Step 2: Activating V6 workflows ===');
  for (const wf of v6) {
    const act = await apiReq('POST', 'workflows/' + wf.id + '/activate');
    if (act.status === 200) {
      console.log('  Activated:', wf.name);
    } else {
      const msg = (act.body && act.body.message ? act.body.message : JSON.stringify(act.body)).substring(0, 150);
      console.log('  WARNING:', wf.name, '-', msg);
    }
    await delay(500);
  }

  console.log('\nDone! V6 workflows are live.');
}

main().catch(err => console.error('Fatal:', err.message));

require('dotenv').config();
const https = require('https');

function apiReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com/api/v1/' + endpoint);
    const rb = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' },
    };
    if (rb) opts.headers['Content-Length'] = Buffer.byteLength(rb);
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (rb) r.write(rb);
    r.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// Approved credentials
const APPROVED = {
  postgres:           { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' },
  memoryPostgresChat: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' },
  openAiApi:          { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
  lmChatOpenAi:       { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
  telegramApi:        { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' },
};

const WF1_ID = 'LMkR7as0CSGDtjbE';

async function main() {
  // Get WF1
  const r = await apiReq('GET', 'workflows/' + WF1_ID);
  const wf = r.body;
  console.log('WF1 nodes:', wf.nodes.length, '| currently active:', wf.active);

  // Print all nodes with credentials
  console.log('\nAll nodes with credentials:');
  wf.nodes.forEach(n => {
    if (n.credentials && Object.keys(n.credentials).length > 0) {
      Object.entries(n.credentials).forEach(([type, val]) => {
        const ok = APPROVED[type] && val && val.id === APPROVED[type].id;
        console.log(ok ? ' ✅' : ' ⚠️ ', n.name, '|', type, '→', val ? val.id : 'NULL');
      });
    }
  });

  // Find any nodes that have a credential TYPE from APPROVED but wrong/missing ID
  let fixed = 0;
  wf.nodes.forEach(n => {
    if (!n.credentials) return;
    Object.entries(n.credentials).forEach(([type, val]) => {
      if (APPROVED[type] && (!val || !val.id || val.id !== APPROVED[type].id)) {
        n.credentials[type] = APPROVED[type];
        console.log('Fixed:', n.name, type);
        fixed++;
      }
    });
  });

  // Also check nodes that need twilio credential — keep existing or skip
  console.log('\nNodes with NO credentials (checking for Telegram Trigger / Twilio):');
  wf.nodes.forEach(n => {
    if (!n.credentials || Object.keys(n.credentials).length === 0) {
      if (n.type.includes('telegram') || n.type.includes('twilio') || n.type.includes('postgres') || n.type.includes('openAi') || n.type.includes('lmChat') || n.type.includes('memory')) {
        console.log(' ⚠️ ', n.name, '| type:', n.type);
      }
    }
  });

  // Save
  console.log('\nSaving WF1...');
  const put = await apiReq('PUT', 'workflows/' + WF1_ID, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  });
  console.log('Save status:', put.status);
  if (put.status !== 200) { console.log('Error:', JSON.stringify(put.body).substring(0,200)); return; }

  await delay(500);

  // Try to activate
  console.log('Activating WF1...');
  const act = await apiReq('POST', 'workflows/' + WF1_ID + '/activate');
  if (act.status === 200) {
    console.log('✅ WF1 Activated!');
  } else {
    console.log('❌ Failed:', JSON.stringify(act.body));
  }
}

main().catch(err => console.error('Fatal:', err.message));

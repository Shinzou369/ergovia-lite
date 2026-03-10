const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const { Client } = require('pg');

function apiCall(method, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // 1. Check what Get Properties node queries
  const wf3 = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  const getProps = wf3.nodes.find(n => n.name === 'Get Properties');
  console.log('=== Get Properties Node ===');
  console.log('  Type: ' + getProps.type);
  console.log('  Query: ' + (getProps.parameters.query || '(no query)'));
  console.log('  Credentials: ' + JSON.stringify(getProps.credentials));

  // 2. Check property_configurations table schema
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  console.log('\n=== property_configurations columns ===');
  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'property_configurations' ORDER BY ordinal_position"
  );
  for (const c of cols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // 3. Check if any properties exist and what owner_contact looks like
  console.log('\n=== Active Properties (owner_contact & preferred_platform) ===');
  const props = await client.query(
    "SELECT property_id, property_name, owner_name, owner_email, owner_phone, property_status, settings FROM property_configurations WHERE property_status = 'active' LIMIT 5"
  );
  for (const p of props.rows) {
    console.log('  ' + p.property_name + ' | status=' + p.property_status);
    console.log('    owner: ' + p.owner_name + ' | email: ' + p.owner_email + ' | phone: ' + p.owner_phone);
    if (p.settings) {
      try {
        const s = typeof p.settings === 'string' ? JSON.parse(p.settings) : p.settings;
        console.log('    settings.preferred_platform: ' + (s.preferred_platform || 'not set'));
        console.log('    settings.owner_contact: ' + (s.owner_contact || s.telegram_chat_id || s.owner_telegram || 'not set'));
        console.log('    settings keys: ' + Object.keys(s).join(', '));
      } catch(e) {
        console.log('    settings: ' + String(p.settings).substring(0, 200));
      }
    }
  }

  // 4. Also check if there's an owner_settings or system_settings table
  console.log('\n=== Tables with "owner" or "setting" in name ===');
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%owner%' OR table_name LIKE '%setting%') ORDER BY table_name"
  );
  for (const t of tables.rows) console.log('  ' + t.table_name);

  await client.end();
}

main().catch(console.error);

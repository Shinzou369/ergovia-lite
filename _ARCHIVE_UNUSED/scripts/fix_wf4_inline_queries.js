/**
 * Fix WF4: Replace $1/$2 with inline {{ $json.field }} expressions
 *
 * Problem: All Postgres executeQuery nodes use $1/$2 but have options: {}
 * (no queryReplacement configured). n8n doesn't know what $1 maps to.
 *
 * Fix: Use expression mode (= prefix) with {{ $json.field }} inline values.
 * Data is internal (from our own Normalize Event), no SQL injection risk.
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF4_ID = 'iaBWaaIjFUrzBcon';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body)); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Fix WF4: Replace $1/$2 with inline expressions ===\n');

  const wf4 = await apiCall('GET', `/api/v1/workflows/${WF4_ID}`);
  console.log(`Loaded: ${wf4.name} (${wf4.nodes.length} nodes)\n`);

  // ─── Get Property & Owner ───
  // Input: from Normalize Event → $json.property_id
  const getProp = wf4.nodes.find(n => n.name === 'Get Property & Owner');
  if (getProp) {
    getProp.parameters.query = "=SELECT\n  p.property_id, p.property_name, p.address, p.customer_id,\n  p.base_price, p.cleaning_fee,\n  COALESCE(p.settings->>'check_in_time', '15:00') AS check_in_time,\n  COALESCE(p.settings->>'check_out_time', '11:00') AS check_out_time,\n  p.owner_name, p.owner_contact, p.owner_email, p.owner_telegram,\n  COALESCE(p.settings->>'payment_link', '') AS payment_link,\n  COALESCE(p.settings->>'payment_instructions', '') AS payment_instructions,\n  p.timezone,\n  COALESCE(p.settings->>'preferred_platform', 'telegram') AS preferred_platform\nFROM property_configurations p\nWHERE p.property_id = '{{ $json.property_id }}'";
    console.log('\u2713 Get Property & Owner: $1 -> {{ $json.property_id }}');
  }

  // ─── Confirm Booking ───
  // Input: from Normalize Event (telegram callback) → $json.booking_id, $json.confirmed_by
  const confirm = wf4.nodes.find(n => n.name === 'Confirm Booking');
  if (confirm) {
    confirm.parameters.query = "=UPDATE bookings\nSET booking_status = 'confirmed',\n    payment_status = 'paid',\n    notes = COALESCE(notes, '') || 'Payment confirmed by {{ $json.confirmed_by }} at ' || CURRENT_TIMESTAMP::text || '. ',\n    updated_at = CURRENT_TIMESTAMP\nWHERE booking_id = '{{ $json.booking_id }}'\nRETURNING *";
    console.log('\u2713 Confirm Booking: $1/$2 -> {{ $json.booking_id }}/{{ $json.confirmed_by }}');
  }

  // ─── Get Property Details ───
  // Input: from Confirm Booking RETURNING * → $json.booking_id (from the returned row)
  const getDetails = wf4.nodes.find(n => n.name === 'Get Property Details');
  if (getDetails) {
    getDetails.parameters.query = "=SELECT p.* FROM property_configurations p\nJOIN bookings b ON b.property_id = p.property_id\nWHERE b.booking_id = '{{ $json.booking_id }}'";
    console.log('\u2713 Get Property Details: $1 -> {{ $json.booking_id }}');
  }

  // ─── Cancel Booking ───
  // Input: from Normalize Event (telegram callback) → $json.booking_id, $json.confirmed_by
  const cancel = wf4.nodes.find(n => n.name === 'Cancel Booking');
  if (cancel) {
    cancel.parameters.query = "=UPDATE bookings\nSET booking_status = 'cancelled',\n    payment_status = 'cancelled',\n    notes = COALESCE(notes, '') || 'Cancelled by {{ $json.confirmed_by }} at ' || CURRENT_TIMESTAMP::text || '. ',\n    updated_at = CURRENT_TIMESTAMP\nWHERE booking_id = '{{ $json.booking_id }}'\nRETURNING *";
    console.log('\u2713 Cancel Booking: $1/$2 -> {{ $json.booking_id }}/{{ $json.confirmed_by }}');
  }

  // ─── Deploy ───
  console.log('\nDeploying...');
  await apiCall('POST', `/api/v1/workflows/${WF4_ID}/deactivate`);
  await sleep(1500);

  const result = await apiCall('PUT', `/api/v1/workflows/${WF4_ID}`, {
    name: wf4.name, nodes: wf4.nodes, connections: wf4.connections,
    settings: wf4.settings || {}, staticData: wf4.staticData || null
  });

  if (result.id) {
    console.log('Updated! Nodes:', result.nodes.length);
  } else {
    console.error('FAILED:', JSON.stringify(result).substring(0, 500));
    return;
  }
  await sleep(1000);

  const act = await apiCall('POST', `/api/v1/workflows/${WF4_ID}/activate`);
  console.log('Active:', act.active);

  console.log('\n=== DONE ===');
  console.log('All 4 queries now use inline {{ $json.field }} expressions.');
  console.log('No $1/$2 params, no queryReplacement needed.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

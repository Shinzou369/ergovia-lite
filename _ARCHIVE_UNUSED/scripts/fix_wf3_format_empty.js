const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== FIX: Format Availability Response — handle empty DB ===\n');

  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('Downloaded: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)');

  const formatNode = wf3.nodes.find(n => n.name === 'Format Availability Response');
  console.log('  Found: Format Availability Response');
  console.log('  Old code length: ' + formatNode.parameters.jsCode.length + ' chars');

  formatNode.parameters.jsCode = `// Format availability check response for WF1 AI Agent
const items = $input.all();
const params = $('Prepare Parameters').item.json;

// Filter out empty objects from "always output data" (no rows returned)
const validItems = items.filter(item => item.json.property_id);

// If no properties found at all, return early with clear message
if (validItems.length === 0) {
  const nightsRequested = Math.ceil(
    (new Date(params.check_out_date) - new Date(params.check_in_date)) / (1000 * 60 * 60 * 24)
  );
  return [{
    json: {
      status: 'SUCCESS',
      check_in: params.check_in_date,
      check_out: params.check_out_date,
      nights: nightsRequested,
      total_properties: 0,
      available_count: 0,
      unavailable_count: 0,
      properties: [],
      summary: 'No properties configured yet. Please add properties in the control panel first.'
    }
  }];
}

const results = validItems.map(item => {
  const p = item.json;
  const nightsRequested = Math.ceil(
    (new Date(params.check_out_date) - new Date(params.check_in_date)) / (1000 * 60 * 60 * 24)
  );

  // Check minimum stay
  const minStay = p.min_stay_nights || 1;
  const meetsMinStay = nightsRequested >= minStay;

  // available comes from the SQL CASE WHEN EXISTS query (true = no overlapping bookings)
  const isAvailable = p.available === true;

  let reason = null;
  if (!isAvailable) reason = 'dates_booked';
  else if (!meetsMinStay) reason = 'min_stay_' + minStay + '_nights';

  return {
    property_id: p.property_id,
    property_name: p.property_name,
    address: p.address || '',
    available: isAvailable && meetsMinStay,
    reason_unavailable: (isAvailable && meetsMinStay) ? null : reason,
    base_price: parseFloat(p.base_price || 0),
    weekend_price: parseFloat(p.weekend_price || 0),
    cleaning_fee: parseFloat(p.cleaning_fee || 0),
    max_guests: p.max_guests || 0,
    bedrooms: p.bedrooms || 0,
    bathrooms: p.bathrooms || 0,
    min_stay_nights: minStay,
    conflicting_bookings: p.conflicting_bookings || [],
    total_upcoming_bookings: parseInt(p.total_upcoming_bookings || 0)
  };
});

const available = results.filter(r => r.available);
const unavailable = results.filter(r => !r.available);
const nightsRequested = Math.ceil(
  (new Date(params.check_out_date) - new Date(params.check_in_date)) / (1000 * 60 * 60 * 24)
);

return [{
  json: {
    status: 'SUCCESS',
    check_in: params.check_in_date,
    check_out: params.check_out_date,
    nights: nightsRequested,
    total_properties: results.length,
    available_count: available.length,
    unavailable_count: unavailable.length,
    properties: results,
    summary: available.length > 0
      ? available.length + ' propert' + (available.length === 1 ? 'y' : 'ies') +
        ' available for ' + params.check_in_date + ' to ' + params.check_out_date +
        ' (' + nightsRequested + ' night' + (nightsRequested === 1 ? '' : 's') + ')'
      : results.length > 0
        ? 'No properties available for ' + params.check_in_date + ' to ' + params.check_out_date +
          ' — all ' + results.length + ' propert' + (results.length === 1 ? 'y is' : 'ies are') + ' booked'
        : 'No properties configured yet'
  }
}];`;

  console.log('  New code length: ' + formatNode.parameters.jsCode.length + ' chars');

  // Upload
  console.log('\n  Uploading...');
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/pEn69kwNtCEQ21y9', {
    name: wf3.name, nodes: wf3.nodes, connections: wf3.connections,
    settings: wf3.settings, staticData: wf3.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');

  console.log('  DEPLOYED & ACTIVATED');

  console.log('\n  === FIX SUMMARY ===');
  console.log('  BEFORE: [{}] from empty DB → treated as 1 unavailable property → "dates_booked"');
  console.log('  AFTER:  [{}] from empty DB → filtered out (no property_id) → "No properties configured yet"');
  console.log('');
  console.log('  Three possible outcomes now:');
  console.log('    1. No properties in DB     → "No properties configured yet"');
  console.log('    2. Properties exist, booked → "No properties available — all X are booked"');
  console.log('    3. Properties exist, free   → "X properties available for DATE to DATE"');
}

main().catch(console.error);

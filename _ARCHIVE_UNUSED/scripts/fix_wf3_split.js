const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const CORRECT_PG = { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' };

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
  console.log('=== WF3: SPLIT INTO AVAILABILITY CHECK + DAILY SYNC ===\n');

  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('Downloaded: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)');

  // ============================================================
  // NEW NODE 1: Is Availability Check? (IF node)
  // Branches BEFORE Get Properties
  // ============================================================
  const checkType = {
    id: 'check-type',
    name: 'Is Availability Check?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [336, 264],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          id: 'avail-check',
          leftValue: '={{ $json.is_availability_check }}',
          rightValue: true,
          operator: { type: 'boolean', operation: 'true' }
        }],
        combinator: 'and'
      },
      options: {}
    }
  };
  wf3.nodes.push(checkType);
  console.log('  Added: Is Availability Check? (IF node)');

  // ============================================================
  // NEW NODE 2: Check Availability (Postgres - direct query)
  // Fast path: query properties + overlapping bookings in ONE query
  // ============================================================
  const checkAvail = {
    id: 'check-availability',
    name: 'Check Availability',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [560, 100],
    parameters: {
      operation: 'executeQuery',
      query: `=SELECT
  p.property_id, p.property_name, p.address, p.base_price, p.weekend_price,
  p.cleaning_fee, p.max_guests, p.bedrooms, p.bathrooms,
  p.min_stay_nights, p.max_stay_nights, p.settings,
  CASE WHEN EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.property_id = p.property_id
    AND b.booking_status IN ('confirmed', 'pending')
    AND b.check_in_date < '{{ $json.check_out_date }}'::date
    AND b.check_out_date > '{{ $json.check_in_date }}'::date
  ) THEN false ELSE true END as available,
  (SELECT json_agg(json_build_object(
    'booking_id', b.booking_id, 'guest_name', b.guest_name,
    'check_in', b.check_in_date, 'check_out', b.check_out_date,
    'status', b.booking_status
  )) FROM bookings b
  WHERE b.property_id = p.property_id
  AND b.booking_status IN ('confirmed', 'pending')
  AND b.check_in_date < '{{ $json.check_out_date }}'::date
  AND b.check_out_date > '{{ $json.check_in_date }}'::date
  ) as conflicting_bookings,
  (SELECT COUNT(*) FROM bookings b
  WHERE b.property_id = p.property_id
  AND b.booking_status IN ('confirmed', 'pending')
  AND b.check_out_date >= CURRENT_DATE
  ) as total_upcoming_bookings
FROM property_configurations p
WHERE p.property_status = 'active'
  AND (p.property_id = '{{ $json.property_id }}' OR '{{ $json.property_id }}' = '' OR '{{ $json.property_id }}' = 'null')
ORDER BY p.property_name`,
      options: {}
    },
    credentials: { postgres: CORRECT_PG }
  };
  wf3.nodes.push(checkAvail);
  console.log('  Added: Check Availability (fast direct query)');

  // ============================================================
  // NEW NODE 3: Format Availability Response (code)
  // Structures the result for WF1's AI Agent
  // ============================================================
  const formatAvail = {
    id: 'format-availability',
    name: 'Format Availability Response',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [784, 100],
    parameters: {
      jsCode: `// Format availability check response for WF1 AI Agent
const items = $input.all();
const params = $('Prepare Parameters').item.json;

const results = items.map(item => {
  const p = item.json;
  const nightsRequested = Math.ceil(
    (new Date(params.check_out_date) - new Date(params.check_in_date)) / (1000 * 60 * 60 * 24)
  );

  // Check minimum stay
  const minStay = p.min_stay_nights || 1;
  const meetsMinStay = nightsRequested >= minStay;

  return {
    property_id: p.property_id,
    property_name: p.property_name,
    address: p.address || '',
    available: p.available && meetsMinStay,
    reason_unavailable: !p.available ? 'dates_booked' : (!meetsMinStay ? 'min_stay_' + minStay + '_nights' : null),
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
      : 'No properties available for ' + params.check_in_date + ' to ' + params.check_out_date
  }
}];`
    }
  };
  wf3.nodes.push(formatAvail);
  console.log('  Added: Format Availability Response (structured for WF1)');

  // ============================================================
  // REWIRE CONNECTIONS
  // ============================================================

  // Old: Prepare Parameters → Get Properties
  // New: Prepare Parameters → Is Availability Check?
  //        [true]  → Check Availability → Format Response (returns to WF1)
  //        [false] → Get Properties → Loop (existing daily sync)

  // 1. Prepare Parameters → Is Availability Check? (replaces old connection)
  wf3.connections['Prepare Parameters'] = {
    main: [[{ node: 'Is Availability Check?', type: 'main', index: 0 }]]
  };

  // 2. Is Availability Check? → [true: out0] Check Availability, [false: out1] Get Properties
  wf3.connections['Is Availability Check?'] = {
    main: [
      [{ node: 'Check Availability', type: 'main', index: 0 }],
      [{ node: 'Get Properties', type: 'main', index: 0 }]
    ]
  };

  // 3. Check Availability → Format Availability Response
  wf3.connections['Check Availability'] = {
    main: [[{ node: 'Format Availability Response', type: 'main', index: 0 }]]
  };

  // 4. Format Availability Response → (no connection - implicit return to calling workflow)
  // In n8n, when a toolWorkflow ends without explicit return, the last node's output IS the return

  // 5. Move Get Properties position to make room for the branch
  const getProps = wf3.nodes.find(n => n.name === 'Get Properties');
  if (getProps) getProps.position = [560, 400];

  console.log('  Rewired: Prepare Parameters → IF → [availability path / daily sync path]');

  // ============================================================
  // VERIFY CONNECTIONS
  // ============================================================
  console.log('\n  === FINAL CONNECTION MAP ===');
  for (const [fromNode, outputs] of Object.entries(wf3.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let i = 0; i < outputArrays.length; i++) {
        if (!Array.isArray(outputArrays[i]) || outputArrays[i].length === 0) continue;
        for (const conn of outputArrays[i]) {
          const label = connType === 'main' ? 'out' + i : connType;
          console.log('    "' + fromNode + '" [' + label + '] --> "' + conn.node + '"');
        }
      }
    }
  }

  // ============================================================
  // UPLOAD
  // ============================================================
  console.log('\n  Uploading WF3...');
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

  // ============================================================
  // VERIFY
  // ============================================================
  const { data: v3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('\n  VERIFIED: ' + v3.name + ' (' + v3.nodes.length + ' nodes, active=' + v3.active + ')');
  console.log('  Nodes: ' + v3.nodes.map(n => n.name).join(', '));

  console.log('\n' + '='.repeat(60));
  console.log('WF3 NOW HAS TWO PATHS:');
  console.log('');
  console.log('  PATH A — AVAILABILITY CHECK (tool for WF1):');
  console.log('    Trigger → Prepare → IF [true] → Check Availability → Format Response');
  console.log('    Returns: {available, properties, prices, summary}');
  console.log('');
  console.log('  PATH B — DAILY SYNC (6AM cron):');
  console.log('    Daily 6AM → Prepare → IF [false] → Get Properties → Loop → Detect Conflicts');
  console.log('    Sends alerts for any booking conflicts found');
  console.log('='.repeat(60));
}

main().catch(console.error);

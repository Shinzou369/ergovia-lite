const https = require('https');
const fs = require('fs');
const path = require('path');
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

async function updateWorkflow(id, wf) {
  await apiCall('POST', '/api/v1/workflows/' + id + '/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/' + id, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  if (res.status !== 200) {
    console.log('  ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
    return false;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
  return true;
}

async function main() {
  const templateDir = path.join(__dirname, '..', 'ergovia-lite', 'workflows');

  // ============================================================
  // PART 1: FIX WF3
  // ============================================================
  console.log('=== PART 1: FIX WF3 ===\n');
  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('Downloaded: ' + wf3.name + ' (' + wf3.nodes.length + ' nodes)');

  // Fix 1: Get Properties query — correct columns, inline expressions
  const getProps = wf3.nodes.find(n => n.name === 'Get Properties');
  if (getProps) {
    getProps.parameters.query = "=SELECT " +
      "p.property_id, p.property_name, p.address, p.base_price, p.weekend_price, " +
      "p.cleaning_fee, p.max_guests, p.bedrooms, p.bathrooms, " +
      "p.owner_contact, p.owner_name, p.owner_phone, p.owner_telegram, " +
      "p.calendar_url, p.calendar_sync_enabled, p.min_stay_nights, p.max_stay_nights, " +
      "p.settings " +
      "FROM property_configurations p " +
      "WHERE p.property_status = 'active' " +
      "AND (p.property_id = '{{ $json.property_id }}' OR '{{ $json.property_id }}' = '' OR '{{ $json.property_id }}' = 'null') " +
      "ORDER BY p.property_name";
    // Remove any queryParameters
    if (getProps.parameters.options) delete getProps.parameters.options.queryParameters;
    if (getProps.parameters.additionalFields) delete getProps.parameters.additionalFields;
    console.log('  Fixed: "Get Properties" — correct columns + inline expressions');
  }

  // Fix 2: Get Property Bookings query — correct columns, inline expressions
  const getBookings = wf3.nodes.find(n => n.name === 'Get Property Bookings');
  if (getBookings) {
    getBookings.parameters.query = "=SELECT " +
      "booking_id, guest_name, guest_phone, guest_email, property_name, " +
      "check_in_date, check_out_date, booking_status, guests, " +
      "total_amount, platform, channel_type " +
      "FROM bookings " +
      "WHERE property_id = '{{ $json.property_id }}' " +
      "AND booking_status IN ('confirmed', 'pending') " +
      "AND check_out_date >= '{{ $('Prepare Parameters').item.json.date_range_start }}'::date " +
      "AND check_in_date <= '{{ $('Prepare Parameters').item.json.date_range_end }}'::date " +
      "ORDER BY check_in_date";
    if (getBookings.parameters.options) delete getBookings.parameters.options.queryParameters;
    if (getBookings.parameters.additionalFields) delete getBookings.parameters.additionalFields;
    // Set alwaysOutputData so empty results don't break the loop
    getBookings.alwaysOutputData = true;
    console.log('  Fixed: "Get Property Bookings" — correct columns + inline expressions + alwaysOutputData');
  }

  // Fix 3: Update Detect Conflicts code — external_platform → platform
  const detectConflicts = wf3.nodes.find(n => n.name === 'Detect Conflicts');
  if (detectConflicts) {
    let code = detectConflicts.parameters.jsCode || detectConflicts.parameters.code || '';
    code = code.replace(/external_platform/g, 'platform');
    code = code.replace(/booking\.external_booking_id/g, 'booking.booking_id');
    if (detectConflicts.parameters.jsCode) detectConflicts.parameters.jsCode = code;
    else if (detectConflicts.parameters.code) detectConflicts.parameters.code = code;
    console.log('  Fixed: "Detect Conflicts" — external_platform → platform');
  }

  // Fix 4: Log Conflicts query — check if it uses $1 params
  const logConflicts = wf3.nodes.find(n => n.name === 'Log Conflicts');
  if (logConflicts && logConflicts.parameters.query) {
    console.log('  Log Conflicts current query: ' + logConflicts.parameters.query.substring(0, 100));
  }

  console.log('\n  Uploading WF3...');
  const wf3ok = await updateWorkflow('pEn69kwNtCEQ21y9', wf3);
  console.log('  WF3: ' + (wf3ok ? 'SUCCESS' : 'FAILED'));

  await sleep(2000);

  // ============================================================
  // PART 2: FIX WF1 — Add Calendar Tool inputs + Remove PGVector
  // ============================================================
  console.log('\n=== PART 2: FIX WF1 ===\n');
  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log('Downloaded: ' + wf1.name + ' (' + wf1.nodes.length + ' nodes)');

  // Fix 1: Add input schema to Calendar Manager Tool
  const calTool = wf1.nodes.find(n => n.id === 'tool-calendar');
  if (calTool) {
    calTool.parameters.workflowInputs = {
      mappingMode: 'defineBelow',
      value: {
        property_id: "={{ $fromAI('property_id', 'The property ID to check. Use empty string to check all properties.', 'string', '') }}",
        check_in_date: "={{ $fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format', 'string', '') }}",
        check_out_date: "={{ $fromAI('check_out_date', 'Check-out date in YYYY-MM-DD format', 'string', '') }}"
      },
      matchingColumns: [],
      schema: [
        { id: 'property_id', displayName: 'property_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'check_in_date', displayName: 'check_in_date', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'check_out_date', displayName: 'check_out_date', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false }
      ]
    };
    console.log('  Added: Calendar Manager Tool input schema (property_id, check_in_date, check_out_date)');
  }

  // Fix 2: Also add input schema to Offer Conflict Checker
  const conflictTool = wf1.nodes.find(n => n.name === 'Offer Conflict Checker');
  if (conflictTool) {
    conflictTool.parameters.workflowInputs = {
      mappingMode: 'defineBelow',
      value: {
        property_id: "={{ $fromAI('property_id', 'The property ID to check for competing offers', 'string', '') }}",
        check_in_date: "={{ $fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format', 'string', '') }}",
        check_out_date: "={{ $fromAI('check_out_date', 'Check-out date in YYYY-MM-DD format', 'string', '') }}",
        sender_id: "={{ $('Merge Customer ID').item.json.sender_id }}",
        sender_name: "={{ $('Merge Customer ID').item.json.sender_name }}",
        channel: "={{ $('Merge Customer ID').item.json.channel }}",
        customer_id: "={{ $('Merge Customer ID').item.json.customer_id }}"
      },
      matchingColumns: [],
      schema: [
        { id: 'property_id', displayName: 'property_id', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'check_in_date', displayName: 'check_in_date', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'check_out_date', displayName: 'check_out_date', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'sender_id', displayName: 'sender_id', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'sender_name', displayName: 'sender_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false }
      ]
    };
    console.log('  Updated: Offer Conflict Checker input schema');
  }

  // Fix 3: Remove PGVector node
  const pgvectorNode = wf1.nodes.find(n => n.id === 'vector-store');
  if (pgvectorNode) {
    const embeddingsNode = wf1.nodes.find(n => n.id === 'embeddings');

    // Remove both PGVector and OpenAI Embeddings nodes
    const removeIds = ['vector-store', 'embeddings'];
    wf1.nodes = wf1.nodes.filter(n => !removeIds.includes(n.id));
    console.log('  Removed: Context Retrieval (PGVector) node');
    console.log('  Removed: OpenAI Embeddings node');

    // Remove connections
    const removeNames = ['Context Retrieval (PGVector)', 'OpenAI Embeddings'];
    for (const name of removeNames) {
      if (wf1.connections[name]) {
        delete wf1.connections[name];
      }
    }
    // Remove incoming connections to these nodes
    for (const [fromNode, outputs] of Object.entries(wf1.connections)) {
      for (const [connType, outputArrays] of Object.entries(outputs)) {
        if (!Array.isArray(outputArrays)) continue;
        for (let i = 0; i < outputArrays.length; i++) {
          if (!Array.isArray(outputArrays[i])) continue;
          outputArrays[i] = outputArrays[i].filter(c => !removeNames.includes(c.node));
        }
      }
    }
  }

  console.log('\n  Uploading WF1...');
  const wf1ok = await updateWorkflow('LP7YknAVPiQsidWq', wf1);
  console.log('  WF1: ' + (wf1ok ? 'SUCCESS' : 'FAILED'));

  // ============================================================
  // PART 3: VERIFY & SAVE
  // ============================================================
  console.log('\n=== PART 3: VERIFY & SAVE ===\n');

  const { data: v3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('WF3: ' + v3.name + ' (' + v3.nodes.length + ' nodes, active=' + v3.active + ')');
  // Verify queries don't have $1
  for (const n of v3.nodes) {
    if (n.parameters.query && n.parameters.query.includes('$1')) {
      console.log('  WARNING: "' + n.name + '" still has $1!');
    }
  }
  // Verify no bad columns
  const getPropsV = v3.nodes.find(n => n.name === 'Get Properties');
  if (getPropsV && getPropsV.parameters.query) {
    const hasBad = ['ical_import_urls', 'airbnb_calendar_url', 'vrbo_calendar_url', 'preferred_platform']
      .some(c => getPropsV.parameters.query.includes(c));
    console.log('  Get Properties bad columns: ' + (hasBad ? 'STILL PRESENT' : 'FIXED'));
  }

  const { data: v1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log('\nWF1: ' + v1.name + ' (' + v1.nodes.length + ' nodes, active=' + v1.active + ')');
  const hasPGVector = v1.nodes.some(n => n.id === 'vector-store');
  console.log('  PGVector: ' + (hasPGVector ? 'STILL EXISTS' : 'REMOVED'));
  // List tools
  const tools = [];
  for (const [name, outputs] of Object.entries(v1.connections)) {
    if (outputs.ai_tool) tools.push(name);
  }
  console.log('  Tools: ' + tools.join(', '));
  // Verify Calendar Manager has inputs
  const calV = v1.nodes.find(n => n.id === 'tool-calendar');
  if (calV) {
    const inputs = Object.keys(calV.parameters.workflowInputs.value || {});
    console.log('  Calendar Manager inputs: ' + inputs.join(', '));
  }

  // Save templates
  fs.writeFileSync(path.join(templateDir, 'WF1_AI_Gateway.json'), JSON.stringify(v1, null, 2));
  fs.writeFileSync(path.join(templateDir, 'WF3_Calendar_Manager.json'), JSON.stringify(v3, null, 2));
  console.log('\n  Saved: WF1_AI_Gateway.json');
  console.log('  Saved: WF3_Calendar_Manager.json');

  console.log('\n' + '='.repeat(50));
  console.log('  ALL FIXES APPLIED');
  console.log('='.repeat(50));
}

main().catch(console.error);

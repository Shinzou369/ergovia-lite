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
  console.log('=== FIX: WF2 Offer Conflict Manager — Accept WF1 inputs ===\n');

  const { data: wf2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
  console.log('Downloaded WF2: ' + wf2.name + ' (' + wf2.nodes.length + ' nodes)');

  // ============================================
  // FIX 1: Update trigger schema to accept WF1's fields
  // ============================================
  const trigger = wf2.nodes.find(n => n.type.includes('executeWorkflowTrigger'));
  console.log('\n1. Fixing trigger schema...');
  console.log('   Old jsonExample:', trigger.parameters.jsonExample);

  trigger.parameters.jsonExample = JSON.stringify({
    property_id: "PROP-001",
    check_in_date: "2026-02-14",
    check_out_date: "2026-02-20",
    sender_id: "123456789",
    sender_name: "Guest",
    channel: "telegram",
    customer_id: "00000000-0000-0000-0000-000000000001"
  }, null, 2);

  console.log('   NEW jsonExample: property_id, check_in_date, check_out_date, sender_id, sender_name, channel, customer_id');

  // ============================================
  // FIX 2: Update Prepare Context to read WF1 fields directly
  // ============================================
  const prepCtx = wf2.nodes.find(n => n.name === 'Prepare Context');
  console.log('\n2. Fixing Prepare Context code...');

  prepCtx.parameters.jsCode = `// Merge incoming data with loaded context
const input = $('When Called by Other Workflow').item.json;
const context = $input.item.json;

let conversationHistory = [];
try {
  conversationHistory = context.conversation_history ? JSON.parse(context.conversation_history) : [];
} catch (e) {
  conversationHistory = [];
}

let collectedData = {};
try {
  collectedData = context.collected_data ? JSON.parse(context.collected_data) : {};
} catch (e) {
  collectedData = {};
}

// Use WF1's explicit fields first, fall back to context/regex
let checkIn = input.check_in_date || collectedData.check_in || null;
let checkOut = input.check_out_date || collectedData.check_out || null;
const propertyId = input.property_id || context.property_id || null;

// Fallback: try regex extraction from message text if dates not provided
if (!checkIn || !checkOut) {
  const message = input.message_text || input.query || '';
  const datePattern = /(\\d{4}-\\d{2}-\\d{2})/g;
  const foundDates = message.match(datePattern) || [];
  if (!checkIn && foundDates[0]) checkIn = foundDates[0];
  if (!checkOut && foundDates[1]) checkOut = foundDates[1];
}

return {
  // Session info
  conversation_id: context.conversation_id || \`conv_\${Date.now()}\`,
  contact_id: input.sender_id,
  channel: input.channel,

  // Current message
  user_message: input.message_text || input.query || '',
  is_callback: input.is_callback || false,
  callback_data: input.callback_data || null,

  // Conversation state
  stage: context.conversation_stage || 'greeting',
  history: conversationHistory,
  collected: collectedData,

  // Property info — prefer WF1 input, then DB context
  property_id: propertyId,
  property_name: context.property_name || null,
  property_type: context.property_type || null,
  base_price: context.base_price || null,
  max_guests: context.max_guests || null,
  amenities: context.amenities || null,
  house_rules: context.house_rules || null,
  check_in_time: context.check_in_time || '15:00',
  check_out_time: context.check_out_time || '11:00',
  owner_name: context.owner_name || null,
  owner_contact: context.owner_contact || null,
  preferred_platform: context.preferred_platform || 'telegram',

  // Dates for competing offer check — from WF1 input
  detected_check_in: checkIn,
  detected_check_out: checkOut,

  // AI context
  ai_category: input.category || 'BOOKING_INQUIRY',
  ai_confidence: input.confidence || 0.8,
  suggested_response: input.suggested_response || null
};`;

  console.log('   Updated: reads check_in_date, check_out_date, property_id from WF1 input directly');
  console.log('   Fallback: regex from message_text if dates not provided');

  // ============================================
  // Deploy
  // ============================================
  console.log('\n3. Deploying WF2...');
  await apiCall('POST', '/api/v1/workflows/NPInwpKv4Oriq04F/deactivate');
  await sleep(1500);
  const res = await apiCall('PUT', '/api/v1/workflows/NPInwpKv4Oriq04F', {
    name: wf2.name, nodes: wf2.nodes, connections: wf2.connections,
    settings: wf2.settings, staticData: wf2.staticData
  });
  if (res.status !== 200) {
    console.log('   ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/NPInwpKv4Oriq04F/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/NPInwpKv4Oriq04F/activate');
  console.log('   WF2 DEPLOYED & ACTIVATED');

  // ============================================
  // Summary
  // ============================================
  console.log('\n=== FIX SUMMARY ===');
  console.log('');
  console.log('ROOT CAUSE:');
  console.log('  WF2 trigger schema only defined: query, sender_id, sender_name, channel, customer_id');
  console.log('  WF1 sends: property_id, check_in_date, check_out_date, sender_id, sender_name, channel, customer_id');
  console.log('  → property_id, check_in_date, check_out_date were DROPPED by n8n (not in schema)');
  console.log('');
  console.log('FIX 1 - Trigger schema updated:');
  console.log('  Added: property_id, check_in_date, check_out_date to jsonExample');
  console.log('');
  console.log('FIX 2 - Prepare Context updated:');
  console.log('  Reads input.check_in_date and input.check_out_date directly from WF1');
  console.log('  Reads input.property_id directly from WF1');
  console.log('  Regex extraction only as fallback');
  console.log('');
  console.log('Expected result:');
  console.log('  Return Clear Result will show: property_id, detected_check_in, detected_check_out = actual values');
}

main().catch(console.error);

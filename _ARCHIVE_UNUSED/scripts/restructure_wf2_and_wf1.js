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
  // PART 1: RESTRUCTURE WF2 — Remove AI Agent, add CLEAR path
  // ============================================================
  console.log('=== PART 1: RESTRUCTURE WF2 ===\n');
  const { data: wf2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
  console.log('Downloaded: ' + wf2.name + ' (' + wf2.nodes.length + ' nodes)');

  // Nodes to remove
  const removeIds = [
    'ai-agent', 'openai-chat', 'memory',
    'tool-availability', 'tool-property', 'tool-pricing', 'tool-booking',
    'process-response', 'save-context', 'return-result'
  ];

  const removedNames = [];
  for (const id of removeIds) {
    const node = wf2.nodes.find(n => n.id === id);
    if (node) removedNames.push(node.name);
  }

  // Remove nodes
  const beforeCount = wf2.nodes.length;
  wf2.nodes = wf2.nodes.filter(n => !removeIds.includes(n.id));
  console.log('  Removed ' + (beforeCount - wf2.nodes.length) + ' nodes:');
  for (const name of removedNames) console.log('    - ' + name);

  // Add new "Return Clear Result" node
  const clearResultNode = {
    parameters: {
      jsCode: `// No competing offers — return CLEAR status to WF1
const context = $('Detect Competing Offers').item.json;

return {
  status: 'CLEAR',
  competing_offers: false,
  offers_count: 0,
  message: 'No competing offers found. Safe to proceed with booking.',
  property_id: context.property_id,
  property_name: context.property_name,
  detected_check_in: context.detected_check_in,
  detected_check_out: context.detected_check_out,
  conversation_id: context.conversation_id,
  contact_id: context.contact_id,
  channel: context.channel,
  stage: context.stage,
  collected: context.collected
};`
    },
    id: 'return-clear-result',
    name: 'Return Clear Result',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1700, 260]  // Position near where AI Agent was
  };
  wf2.nodes.push(clearResultNode);
  console.log('  Added: "Return Clear Result" node');

  // Update Return Result (Competing) to include status field
  const retComp = wf2.nodes.find(n => n.id === 'return-result-competing');
  if (retComp) {
    retComp.parameters.jsCode = `// Return result for competing offer flow
return {
  status: 'COMPETING',
  competing_offers: true,
  conflict_id: $('Format Owner Notification').item.json.conflict_record.conflict_id,
  offers_count: $('Detect Competing Offers').item.json.competing_count,
  owner_notified: true,
  response_text: $('Prepare Guest Response (Competing)').item.json.response_text,
  message: 'Competing offers detected. Owner has been notified and will make a decision.'
};`;
    console.log('  Updated: "Return Result (Competing)" with status field');
  }

  // Remove all connections FROM removed nodes
  for (const name of removedNames) {
    if (wf2.connections[name]) {
      delete wf2.connections[name];
    }
  }

  // Remove all connections TO removed nodes
  for (const [fromNode, outputs] of Object.entries(wf2.connections)) {
    for (const [connType, outputArrays] of Object.entries(outputs)) {
      if (!Array.isArray(outputArrays)) continue;
      for (let i = 0; i < outputArrays.length; i++) {
        if (!Array.isArray(outputArrays[i])) continue;
        outputArrays[i] = outputArrays[i].filter(c => !removedNames.includes(c.node));
      }
    }
  }

  // Rewire: Has Competing Offers? NO path → Return Clear Result
  // Currently: main[0] = YES → Format Owner Notification, main[1] = NO → (was AI Agent)
  wf2.connections['Has Competing Offers?'] = {
    main: [
      [{ node: 'Format Owner Notification', type: 'main', index: 0 }],  // YES
      [{ node: 'Return Clear Result', type: 'main', index: 0 }]          // NO
    ]
  };
  console.log('  Rewired: Has Competing Offers? NO → Return Clear Result');

  // Rename workflow
  wf2.name = 'WF2: Offer Conflict Manager';
  console.log('  Renamed: "WF2: Offer Conflict Manager"');

  console.log('\n  Uploading WF2...');
  const wf2ok = await updateWorkflow('NPInwpKv4Oriq04F', wf2);
  console.log('  WF2: ' + (wf2ok ? 'SUCCESS' : 'FAILED'));

  await sleep(2000);

  // ============================================================
  // PART 2: UPDATE WF1 — Rename tool, update prompt
  // ============================================================
  console.log('\n=== PART 2: UPDATE WF1 ===\n');
  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log('Downloaded: ' + wf1.name + ' (' + wf1.nodes.length + ' nodes)');

  // Rename Booking Agent Tool → Offer Conflict Checker
  const bookingTool = wf1.nodes.find(n => n.id === 'tool-booking');
  if (bookingTool) {
    bookingTool.name = 'Offer Conflict Checker';
    bookingTool.parameters.description = 'ALWAYS call this BEFORE confirming any booking. Checks if there are competing offers from other guests for the same property and dates. Returns either CLEAR (safe to proceed with booking via Payment Processor) or COMPETING (owner notified, guest must wait). Pass the property_id and detected check-in/check-out dates.';
    console.log('  Renamed: "Booking Agent Tool" → "Offer Conflict Checker"');
    console.log('  Updated description');
  }

  // Add Calculate Price Tool as a code tool
  const calcPriceNode = {
    parameters: {
      name: 'calculate_price',
      description: 'Calculate total price for a stay. Input: check_in_date, check_out_date, price_per_night, cleaning_fee (optional), discount_percent (optional). Returns total price breakdown.',
      jsCode: `// Calculate total price for a vacation rental stay
const checkIn = new Date($fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format'));
const checkOut = new Date($fromAI('check_out_date', 'Check-out date in YYYY-MM-DD format'));
const pricePerNight = parseFloat($fromAI('price_per_night', 'Price per night in USD', 'number', '150'));
const cleaningFee = parseFloat($fromAI('cleaning_fee', 'One-time cleaning fee', 'number', '50'));
const discountPercent = parseFloat($fromAI('discount_percent', 'Discount percentage', 'number', '0'));

const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

if (nights <= 0) {
  return { error: true, message: 'Invalid dates: check-out must be after check-in' };
}

const subtotal = nights * pricePerNight;
const discount = subtotal * (discountPercent / 100);
const totalBeforeFees = subtotal - discount;
const serviceFee = Math.round(totalBeforeFees * 0.12 * 100) / 100; // 12% service fee
const total = totalBeforeFees + cleaningFee + serviceFee;

// Weekly discount auto-apply
let weeklyDiscount = 0;
if (nights >= 7 && discountPercent === 0) {
  weeklyDiscount = subtotal * 0.10; // 10% weekly discount
}

const finalTotal = total - weeklyDiscount;

return {
  nights: nights,
  price_per_night: pricePerNight,
  subtotal: Math.round(subtotal * 100) / 100,
  weekly_discount: Math.round(weeklyDiscount * 100) / 100,
  custom_discount: Math.round(discount * 100) / 100,
  cleaning_fee: cleaningFee,
  service_fee: serviceFee,
  total: Math.round(finalTotal * 100) / 100,
  currency: 'USD',
  check_in: checkIn.toISOString().split('T')[0],
  check_out: checkOut.toISOString().split('T')[0]
};`
    },
    id: 'tool-calculate-price',
    name: 'Calculate Price Tool',
    type: '@n8n/n8n-nodes-langchain.toolCode',
    typeVersion: 1.1,
    position: [980, 660]
  };
  wf1.nodes.push(calcPriceNode);
  console.log('  Added: "Calculate Price Tool" (code tool)');

  // Connect Calculate Price Tool to AI Agent
  wf1.connections['Calculate Price Tool'] = {
    ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
  };
  console.log('  Connected: Calculate Price Tool → AI Agent');

  // Update AI Agent system prompt with new role descriptions
  const wf1Agent = wf1.nodes.find(n => n.id === 'ai-agent');
  wf1Agent.parameters.options.systemMessage = `You are the main AI concierge for a vacation rental business. You are the ONLY one who communicates with guests — your tools are your back-office team that return data to you.

## How You Work
1. Read the guest's message and determine their intent
2. Call the right tool(s) to get data
3. Use the returned data to craft YOUR friendly response
4. Keep responses concise (under 150 words)

## Your Tools (return DATA, not messages):

### Offer Conflict Checker
ALWAYS call this BEFORE confirming any booking. Checks if other guests are competing for the same dates.
- Returns CLEAR → safe to proceed with booking
- Returns COMPETING → owner is deciding between offers, tell guest to wait

### Calendar Manager
Check property availability for specific dates. Use when guest asks about dates or availability.
- Returns: available dates, pricing, conflicts, alternative dates

### Payment Processor
Create bookings and payment links. Use AFTER confirming availability and no conflicts.
- Returns: booking ID, payment link, transaction status

### Calculate Price
Calculate total cost for a stay with fees and discounts.
- Returns: price breakdown (nightly rate, nights, cleaning fee, service fee, discounts, total)

### Property Operations
Handle maintenance reports, property issues, cleaning requests.
- Returns: ticket info, issue category, urgency level

### Emergency Handler
ONLY for urgent safety emergencies (fire, medical, break-in, gas leak, flooding).
- Returns: emergency assessment, responder info, immediate action instructions

## Booking Flow (follow this order):
1. Guest asks about dates → Calendar Manager (check availability)
2. Dates available → Calculate Price (get total)
3. Guest wants to book → Offer Conflict Checker (check for competing offers)
4. No conflicts → Payment Processor (create booking + payment link)

## Response Guidelines
- Never expose raw JSON or data to the guest
- Paraphrase tool results naturally
- Use emojis sparingly (1-2 per message max)
- Always end with a clear next step or question
- If a tool errors, apologize and offer alternatives
- For emergencies, lead with safety instructions immediately`;

  console.log('  Updated: AI Agent system prompt with booking flow order');

  // Update Offer Conflict Checker connection name in connections
  if (wf1.connections['Booking Agent Tool']) {
    wf1.connections['Offer Conflict Checker'] = wf1.connections['Booking Agent Tool'];
    delete wf1.connections['Booking Agent Tool'];
    console.log('  Renamed connection: "Booking Agent Tool" → "Offer Conflict Checker"');
  }

  console.log('\n  Uploading WF1...');
  const wf1ok = await updateWorkflow('LP7YknAVPiQsidWq', wf1);
  console.log('  WF1: ' + (wf1ok ? 'SUCCESS' : 'FAILED'));

  // ============================================================
  // PART 3: VERIFY & SAVE TEMPLATES
  // ============================================================
  console.log('\n=== PART 3: VERIFY & SAVE ===\n');

  const { data: v1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  const { data: v2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');

  // Verify WF2
  console.log('WF2: ' + v2.name);
  console.log('  Nodes: ' + v2.nodes.length);
  console.log('  Active: ' + v2.active);
  const hasAI = v2.nodes.some(n => n.type.includes('agent'));
  console.log('  Has AI Agent: ' + hasAI + ' (want false)');
  const hasClear = v2.nodes.some(n => n.id === 'return-clear-result');
  console.log('  Has Return Clear Result: ' + hasClear + ' (want true)');

  // Show WF2 flow
  console.log('  Flow paths:');
  const compCheck = v2.connections['Has Competing Offers?'];
  if (compCheck && compCheck.main) {
    console.log('    YES → ' + (compCheck.main[0] && compCheck.main[0][0] ? compCheck.main[0][0].node : 'BROKEN'));
    console.log('    NO  → ' + (compCheck.main[1] && compCheck.main[1][0] ? compCheck.main[1][0].node : 'BROKEN'));
  }

  // Verify WF1
  console.log('\nWF1: ' + v1.name);
  console.log('  Nodes: ' + v1.nodes.length);
  console.log('  Active: ' + v1.active);
  // List tools
  let toolNames = [];
  for (const [nodeName, outputs] of Object.entries(v1.connections)) {
    if (outputs.ai_tool) toolNames.push(nodeName);
  }
  console.log('  AI Agent tools: ' + toolNames.join(', '));

  // Save templates
  fs.writeFileSync(path.join(templateDir, 'WF1_AI_Gateway.json'), JSON.stringify(v1, null, 2));
  console.log('\n  Saved: WF1_AI_Gateway.json');
  fs.writeFileSync(path.join(templateDir, 'WF2_Offer_Conflict_Manager.json'), JSON.stringify(v2, null, 2));
  console.log('  Saved: WF2_Offer_Conflict_Manager.json');

  // Remove old WF2 template name
  const oldFile = path.join(templateDir, 'WF2_AI_Booking_Agent.json');
  if (fs.existsSync(oldFile)) {
    fs.unlinkSync(oldFile);
    console.log('  Removed old: WF2_AI_Booking_Agent.json');
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('  RESTRUCTURE COMPLETE');
  console.log('='.repeat(60));
  console.log('\nWF2 (Offer Conflict Manager):');
  console.log('  - Removed: AI Agent + 4 dead sub-tools + 3 main-path nodes (10 total)');
  console.log('  - Added: Return Clear Result node');
  console.log('  - Kept: Competing offers path + Owner decision callback');
  console.log('  - New flow: entry → load context → check competing → CLEAR or COMPETING');
  console.log('\nWF1 (AI Gateway):');
  console.log('  - Renamed: "Booking Agent Tool" → "Offer Conflict Checker"');
  console.log('  - Added: "Calculate Price Tool" (code tool)');
  console.log('  - Updated: System prompt with booking flow order');
  console.log('  - Tools: Conflict Checker, Calendar, Payment, Price Calc, Ops, Emergency, PGVector');
}

main().catch(console.error);

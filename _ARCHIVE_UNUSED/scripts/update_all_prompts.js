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
    console.log('  ERROR uploading: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 300));
    await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
    return false;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/' + id + '/activate');
  return true;
}

// ============================================================
// NEW PROMPTS
// ============================================================

const WF1_SYSTEM_PROMPT = `You are the main AI concierge for a vacation rental business. You are the ONLY one who communicates with guests — your tools are your back-office team.

## How You Work
1. Read the guest's message and determine their intent
2. Call the right tool(s) to get data
3. Use the tool's returned data to craft YOUR response to the guest
4. Be warm, professional, and concise (under 150 words)

## Your Tools (they return DATA, not messages):
- **Booking Agent**: Booking inquiries, availability, property info, check-in/out details. Returns availability status, pricing, booking confirmations, property details.
- **Calendar Manager**: Check specific date availability across properties. Returns dates, pricing, alternatives if dates are taken.
- **Payment Processor**: Payment links, payment status, refunds. Returns links, transaction data, amounts.
- **Property Operations**: Maintenance reports, property issues, cleaning. Returns ticket info, categories, urgency levels.
- **Emergency Handler**: ONLY for urgent safety emergencies (fire, medical, break-in, gas leak, flooding). Returns emergency assessment, responder contacts, immediate instructions.

## Response Guidelines
- Never expose raw JSON or data structures to the guest
- Paraphrase tool results naturally into conversational language
- Use emojis sparingly (1-2 per message max)
- Always end with a clear next step or question
- If a tool returns an error or empty data, apologize briefly and offer to help another way
- For emergencies, lead with safety instructions immediately`;

const WF1_TOOL_DESCRIPTIONS = {
  'tool-booking': 'Handle all booking-related queries. Use this when the guest asks about availability, property details, pricing, booking a stay, check-in/check-out instructions, or any reservation question. Returns structured booking data for you to relay to the guest.',
  'tool-calendar': 'Check property calendar availability for specific dates. Use when guest mentions specific travel dates or asks about date ranges. Returns availability status, pricing per night, and alternative dates if requested dates are unavailable.',
  'tool-payment': 'Handle payment operations: create payment links, check payment status, process refunds, answer pricing questions. Returns payment links, transaction status, and financial data.',
  'tool-operations': 'Handle property operations: maintenance reports, issue tracking, cleaning requests, vendor coordination. Use when a guest reports a problem or needs operational support. Returns ticket numbers, issue categories, and resolution info.',
  'tool-emergency': 'ONLY for genuine safety or security emergencies: fire, medical emergency, break-in, gas leak, flooding, structural damage. Returns emergency assessment, severity, responder info, and immediate action instructions. Do NOT use for complaints or minor issues.'
};

const WF2_SYSTEM_PROMPT = `You are a booking data processor for a vacation rental business. You are called as a tool by the main AI concierge.

## Your Role
- Process booking-related queries using your sub-tools
- Return STRUCTURED DATA — never write customer-facing messages
- The main concierge will use your data to craft the guest response

## Your Sub-Tools
- check_availability: Check property availability for specific dates
- get_property_details: Get property info, amenities, rules
- calculate_price: Calculate total pricing with fees and discounts
- create_booking_hold: Create a temporary booking and payment link

## What You Return
Always respond with clear, structured information like:
- "AVAILABILITY: [property] is available [dates] at $X/night, total $Y for Z nights"
- "UNAVAILABLE: [property] booked [dates]. Nearest available: [alt dates]"
- "BOOKING_CREATED: ID [id], total $X, payment link: [url], expires [time]"
- "PROPERTY_INFO: [name], [type], [max_guests] guests, amenities: [list], check-in: [time]"
- "PRICE_QUOTE: $X/night x Y nights = $Z, cleaning fee $A, total $B"

## Rules
- Use tools to look up real data — never fabricate availability or pricing
- If data is missing, say what data you need: "NEED_INFO: check-in date, check-out date, number of guests"
- Include all relevant numbers, dates, and IDs in your response
- Be factual and complete — the concierge needs accurate data to inform the guest`;

const WF2_TEXT_PROMPT = `Process this booking query and return structured data.

## Query
{{ $json.user_message || 'General booking inquiry' }}

## Guest Context
- Name: {{ $json.collected.guest_name || 'Not provided' }}
- Dates: {{ $json.collected.check_in || 'TBD' }} to {{ $json.collected.check_out || 'TBD' }}
- Guests: {{ $json.collected.guests || 'TBD' }}
- Stage: {{ $json.stage || 'new' }}

## Property Context
- Property: {{ $json.property_name || 'Not specified' }}
- ID: {{ $json.property_id || 'None' }}
- Base Price: \${{ $json.base_price || 'unknown' }}/night
- Max Guests: {{ $json.max_guests || 'unknown' }}

Use your tools to gather data, then return a structured summary.`;

const WF5_SYSTEM_PROMPT = `You are a property maintenance data processor. You are called as a tool by the main AI concierge.

## Your Role
- Analyze maintenance reports and create tickets using your tools
- Return STRUCTURED DATA — never write customer-facing messages
- The main concierge will use your data to respond to the guest

## What You Determine
1. Issue category: plumbing, electrical, hvac, appliance, structural, other
2. Urgency level: emergency, high, medium, low
3. Brief technical description

## What You Return
- "TICKET_CREATED: #[id], category: [cat], urgency: [level], description: [desc]"
- "ESCALATED: [reason], owner notified: yes/no, ETA: [time]"
- Include property_id and reporter info in your response

Report: {{ $json.data.message }}
Property ID: {{ $json.property_id }}
Reporter: {{ $json.data.sender_id }}

Analyze and create the maintenance ticket.`;

const WF8_EMERGENCY_PROMPT = `You are an emergency assessment processor. You are called as a tool by the main AI concierge.

## Your Role
- Assess emergency situations and determine appropriate response
- Return STRUCTURED DATA — never write customer-facing messages
- The main concierge will use your data to respond to the guest with safety instructions

## What You Determine
1. Emergency type: fire, medical, security, utility, natural_disaster, lockout, other
2. Severity: critical, high, medium
3. Required responders: 911, owner, maintenance, security
4. Immediate actions the guest should take

## What You Return
- "EMERGENCY_ASSESSMENT: type=[type], severity=[level]"
- "RESPONDERS: [list of who has been/should be notified]"
- "IMMEDIATE_ACTIONS: [numbered list of what guest should do NOW]"
- "CONTACTS: emergency=[number], owner=[number], maintenance=[number]"

Message: {{ $json.data.message }}
Property ID: {{ $json.data.property_id }}
Channel: {{ $json.data.channel }}

Assess this emergency and provide structured response data.`;

const WF8_SCREENING_PROMPT = `You are a guest screening data processor. You are called as a tool by the system.

## Your Role
- Review booking requests and perform risk assessment
- Return STRUCTURED DATA with a clear decision

## What You Assess
1. Contact information validity (name, email, phone provided?)
2. Booking timing (same-day = higher risk, advance = lower risk)
3. Any red flags in the request

## What You Return
- "SCREENING_RESULT: [APPROVE|FLAG_FOR_REVIEW|REJECT]"
- "RISK_LEVEL: [low|medium|high]"
- "REASONING: [brief explanation]"
- "FLAGS: [list any concerns, or 'none']"

Guest Name: {{ $json.data.guest_name }}
Email: {{ $json.data.guest_email }}
Phone: {{ $json.data.guest_phone }}
Check-in Date: {{ $json.data.check_in_date }}
Property: {{ $json.data.property_id }}

Perform the screening assessment.`;

// ============================================================
// APPLY CHANGES
// ============================================================

async function main() {
  const templateDir = path.join(__dirname, '..', 'ergovia-lite', 'workflows');

  // ===== WF1 =====
  console.log('=== UPDATING WF1: AI Gateway ===');
  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');

  const wf1Agent = wf1.nodes.find(n => n.id === 'ai-agent');
  // Update system prompt
  wf1Agent.parameters.options.systemMessage = WF1_SYSTEM_PROMPT;
  console.log('  Updated AI Agent system prompt (' + WF1_SYSTEM_PROMPT.length + ' chars)');

  // Update tool descriptions
  for (const node of wf1.nodes) {
    if (WF1_TOOL_DESCRIPTIONS[node.id]) {
      node.parameters.description = WF1_TOOL_DESCRIPTIONS[node.id];
      console.log('  Updated tool description: ' + node.name);
    }
  }

  const wf1ok = await updateWorkflow('LP7YknAVPiQsidWq', wf1);
  console.log('  WF1: ' + (wf1ok ? 'SUCCESS' : 'FAILED'));
  if (wf1ok) {
    const { data: v1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
    fs.writeFileSync(path.join(templateDir, 'WF1_AI_Gateway.json'), JSON.stringify(v1, null, 2));
    console.log('  Saved template: WF1_AI_Gateway.json');
  }

  await sleep(2000);

  // ===== WF2 =====
  console.log('\n=== UPDATING WF2: AI Booking Agent ===');
  const { data: wf2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');

  const wf2Agent = wf2.nodes.find(n => n.id === 'ai-agent');
  // Update text (user input prompt with context)
  wf2Agent.parameters.text = WF2_TEXT_PROMPT;
  // Update system message
  wf2Agent.parameters.options.systemMessage = WF2_SYSTEM_PROMPT;
  console.log('  Updated AI Booking Agent text prompt (' + WF2_TEXT_PROMPT.length + ' chars)');
  console.log('  Updated AI Booking Agent system prompt (' + WF2_SYSTEM_PROMPT.length + ' chars)');

  const wf2ok = await updateWorkflow('NPInwpKv4Oriq04F', wf2);
  console.log('  WF2: ' + (wf2ok ? 'SUCCESS' : 'FAILED'));
  if (wf2ok) {
    const { data: v2 } = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
    fs.writeFileSync(path.join(templateDir, 'WF2_AI_Booking_Agent.json'), JSON.stringify(v2, null, 2));
    console.log('  Saved template: WF2_AI_Booking_Agent.json');
  }

  await sleep(2000);

  // ===== WF5 =====
  console.log('\n=== UPDATING WF5: Property Operations ===');
  const { data: wf5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');

  const wf5Agent = wf5.nodes.find(n => n.id === 'ai-maintenance');
  if (wf5Agent) {
    wf5Agent.parameters.systemMessage = WF5_SYSTEM_PROMPT;
    console.log('  Updated AI Maintenance Handler prompt (' + WF5_SYSTEM_PROMPT.length + ' chars)');
  }

  const wf5ok = await updateWorkflow('JWEu9Uz2JJ5XZeIX', wf5);
  console.log('  WF5: ' + (wf5ok ? 'SUCCESS' : 'FAILED'));
  if (wf5ok) {
    const { data: v5 } = await apiCall('GET', '/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
    fs.writeFileSync(path.join(templateDir, 'WF5_Property_Operations.json'), JSON.stringify(v5, null, 2));
    console.log('  Saved template: WF5_Property_Operations.json');
  }

  await sleep(2000);

  // ===== WF8 =====
  console.log('\n=== UPDATING WF8: Safety & Screening ===');
  const { data: wf8 } = await apiCall('GET', '/api/v1/workflows/mLm2HaIRzNfIX5uh');

  const wf8Emergency = wf8.nodes.find(n => n.id === 'ai-emergency');
  if (wf8Emergency) {
    wf8Emergency.parameters.systemMessage = WF8_EMERGENCY_PROMPT;
    console.log('  Updated AI Emergency Handler prompt (' + WF8_EMERGENCY_PROMPT.length + ' chars)');
  }

  const wf8Screening = wf8.nodes.find(n => n.id === 'ai-screening');
  if (wf8Screening) {
    wf8Screening.parameters.systemMessage = WF8_SCREENING_PROMPT;
    console.log('  Updated AI Screening Agent prompt (' + WF8_SCREENING_PROMPT.length + ' chars)');
  }

  const wf8ok = await updateWorkflow('mLm2HaIRzNfIX5uh', wf8);
  console.log('  WF8: ' + (wf8ok ? 'SUCCESS' : 'FAILED'));
  if (wf8ok) {
    const { data: v8 } = await apiCall('GET', '/api/v1/workflows/mLm2HaIRzNfIX5uh');
    fs.writeFileSync(path.join(templateDir, 'WF8_Safety_Screening.json'), JSON.stringify(v8, null, 2));
    console.log('  Saved template: WF8_Safety_Screening.json');
  }

  // ===== WF3 & WF4: No AI Agents, save templates as-is =====
  console.log('\n=== WF3 & WF4: No AI Agents (code-only workflows) ===');
  const { data: v3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  fs.writeFileSync(path.join(templateDir, 'WF3_Calendar_Manager.json'), JSON.stringify(v3, null, 2));
  console.log('  WF3: Saved template (no prompt changes needed - code-only workflow)');

  const { data: v4 } = await apiCall('GET', '/api/v1/workflows/5loDH75zrEDh9x5H');
  fs.writeFileSync(path.join(templateDir, 'WF4_Payment_Processor.json'), JSON.stringify(v4, null, 2));
  console.log('  WF4: Saved template (no prompt changes needed - code-only workflow)');

  // Also save WF6, WF7
  const { data: v6 } = await apiCall('GET', '/api/v1/workflows/ccEOaNnIwY6eeJOn');
  fs.writeFileSync(path.join(templateDir, 'WF6_Daily_Automations.json'), JSON.stringify(v6, null, 2));
  console.log('  WF6: Saved template (independent - cron-triggered)');

  const { data: v7 } = await apiCall('GET', '/api/v1/workflows/Ay5QOyGAHG2l40s7');
  fs.writeFileSync(path.join(templateDir, 'WF7_Integration_Hub.json'), JSON.stringify(v7, null, 2));
  console.log('  WF7: Saved template (independent - integration sync)');

  // ===== SUMMARY =====
  console.log('\n' + '='.repeat(60));
  console.log('  ALL UPDATES COMPLETE');
  console.log('='.repeat(60));
  console.log('\nPrompt Updates:');
  console.log('  WF1 AI Agent: New concierge system prompt + 5 tool descriptions');
  console.log('  WF2 AI Booking Agent: Data-processor prompt (no customer messages)');
  console.log('  WF3 Calendar Manager: No AI Agent (code-only) - no changes');
  console.log('  WF4 Payment Processor: No AI Agent (code-only) - no changes');
  console.log('  WF5 Maintenance Handler: Data-processor prompt');
  console.log('  WF8 Emergency Handler: Data-processor prompt');
  console.log('  WF8 Screening Agent: Data-processor prompt');
  console.log('\nTemplates Saved:');
  console.log('  WF1_AI_Gateway.json');
  console.log('  WF2_AI_Booking_Agent.json');
  console.log('  WF3_Calendar_Manager.json');
  console.log('  WF4_Payment_Processor.json');
  console.log('  WF5_Property_Operations.json');
  console.log('  WF6_Daily_Automations.json');
  console.log('  WF7_Integration_Hub.json');
  console.log('  WF8_Safety_Screening.json');
  console.log('  SUB_Universal_Messenger.json (saved earlier)');
  console.log('\n  ALL 9 WORKFLOW TEMPLATES SAVED');
}

main().catch(console.error);

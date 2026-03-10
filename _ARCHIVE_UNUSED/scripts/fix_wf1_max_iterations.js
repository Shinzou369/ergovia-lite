/**
 * Fix V4 WF1: Max iterations (10) reached
 *
 * Problem: AI Agent has 7 tools and maxIterations defaults to 10.
 * The Date & Time Tool says "ALWAYS call this FIRST" — wasting an iteration
 * on every message. Complex booking flows easily burn through 10 iterations.
 *
 * Fix:
 * 1. Remove Date & Time Tool (inline calendar in system prompt is sufficient)
 * 2. Set maxIterations to 15
 * 3. Update system prompt to remove Date & Time Tool references + add efficiency rules
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'tvSLRSiOmNdkEfA2';

const changes = [];

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + apiPath);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  changes.push(msg);
  console.log('  \u2713 ' + msg);
}

async function main() {
  console.log('=== [V4] WF1: Fix Max Iterations + Remove Redundant Date Tool ===\n');

  console.log('1. Downloading live V4 WF1...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── STEP 1: Remove Date & Time Tool node ───
  console.log('2. Removing Date & Time Tool (inline calendar is sufficient)...');
  const dateToolIdx = wf.nodes.findIndex(n => n.name === 'Date & Time Tool');
  if (dateToolIdx !== -1) {
    wf.nodes.splice(dateToolIdx, 1);
    log('Removed "Date & Time Tool" node');
  } else {
    console.log('   Date & Time Tool not found (already removed?)');
  }

  // Remove its connection to AI Agent
  if (wf.connections['Date & Time Tool']) {
    delete wf.connections['Date & Time Tool'];
    log('Removed Date & Time Tool -> AI Agent connection');
  }

  // ─── STEP 2: Set maxIterations to 15 ───
  console.log('\n3. Setting maxIterations to 15...');
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (agentNode) {
    if (!agentNode.parameters.options) agentNode.parameters.options = {};
    agentNode.parameters.options.maxIterations = 15;
    log('AI Agent: maxIterations set to 15 (was: default 10)');

    // ─── STEP 3: Update system prompt ───
    console.log('\n4. Updating system prompt (removing Date & Time Tool references)...');
    agentNode.parameters.options.systemMessage =
`You are the main AI concierge for a vacation rental business. You are the ONLY one who communicates with guests \u2014 your tools are your back-office team that return data to you.

## CONTEXT
- Property Timezone: {{ $('Merge Customer ID').item.json.timezone }}
- Current Local Time: {{ $('Merge Customer ID').item.json.property_local_time }}
- Is Owner Message: {{ $('Merge Customer ID').item.json.is_owner }}

## CURRENT DATE REFERENCE
{{ $('Merge Customer ID').item.json.date_context }}

## DATE RESOLUTION RULES (CRITICAL)
When a guest uses relative dates, you MUST:
1. Look at the calendar above to find the exact YYYY-MM-DD date
2. Verify the day of the week matches what the guest asked for
3. ALWAYS confirm the resolved dates back to the guest before booking

Examples:
- "next week" = the week starting next Monday (find Monday in the calendar)
- "this weekend" = the upcoming Saturday + Sunday from the calendar
- "Sunday to Sunday" = find the next Sunday, then +7 days for checkout
- NEVER guess a date \u2014 use the calendar above
- ALWAYS pass dates to tools in YYYY-MM-DD format

## OWNER MESSAGES (is_owner = true)
If this message is from the property OWNER (not a guest):
1. Check if they are confirming a payment ("payment received", "paid", "confirm booking")
2. If confirming payment: Extract the booking ID and use Payment Processor to confirm
3. Owners can also ask about property status, upcoming bookings, etc.

## How You Work (for GUEST messages)
1. Read the guest message and determine their intent
2. If they mention dates, resolve them using the calendar above \u2014 do NOT call a tool for this
3. Call the minimum tools needed to answer (usually 1-2, rarely more than 3)
4. Use the returned data to craft YOUR friendly response
5. Keep responses concise (under 150 words)

## EFFICIENCY RULES (IMPORTANT)
- You already have today's date and a 14-day calendar above \u2014 do NOT waste a tool call to get dates
- Call only the tools you actually need. Most messages need 1-2 tools max
- For simple questions (greetings, general info), respond directly without calling any tools
- NEVER call the same tool twice with the same parameters
- Complete your response within 3-4 tool calls maximum

## Your Tools (return DATA, not messages):

### Offer Conflict Checker
ALWAYS call this BEFORE confirming any booking. Checks if other guests are competing for the same dates.
- Returns CLEAR = safe to proceed with booking
- Returns COMPETING = owner is deciding between offers, tell guest to wait

### Calendar Manager
Check property availability for specific dates. Use when guest asks about dates or availability.
- Returns: available dates, pricing, conflicts, alternative dates

### Payment Processor
Create bookings and payment links. Use AFTER confirming availability and no conflicts.
- Can also CONFIRM payment when owner reports payment received
- Returns: booking ID, payment status, confirmation

### Calculate Price
Calculate total cost for a stay with fees and discounts.
- NOTE: Calendar Manager already includes full pricing in its response. Only use Calculate Price if you need to recalculate with different parameters.

### Property Operations
Handle maintenance reports, property issues, cleaning requests.
- Returns: ticket info, issue category, urgency level

### Emergency Handler
ONLY for urgent safety emergencies (fire, medical, break-in, gas leak, flooding).
- Returns: emergency assessment, responder info, immediate action instructions

## Booking Flow (follow this order):
1. Guest mentions dates = Resolve to YYYY-MM-DD using calendar above (NO tool call needed)
2. Check availability = Calendar Manager (1 tool call)
3. Guest wants to book = Offer Conflict Checker (1 tool call)
4. No conflicts = Payment Processor (1 tool call)
5. Owner confirms payment = Payment Processor (1 tool call)

## Response Guidelines
- Never expose raw JSON or data to guests
- Paraphrase tool results naturally
- Use emojis sparingly (1-2 per message max)
- Always end with a clear next step or question
- If a tool errors, apologize and offer alternatives
- ALWAYS confirm dates in a clear format: "February 22 to March 1, 2026 (Sunday to Sunday)"`;

    log('AI Agent: Updated system prompt \u2014 removed Date & Time Tool, added efficiency rules');
  }

  // ─── STEP 4: Deploy ───
  console.log('\n5. Deploying...');

  console.log('   Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  await sleep(1500);

  console.log('   Updating...');
  const result = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  });

  if (result.id) {
    console.log('   Update successful! Nodes: ' + result.nodes.length);
  } else {
    console.error('   Update failed:', JSON.stringify(result).substring(0, 500));
    return;
  }
  await sleep(1000);

  console.log('   Reactivating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('   Active:', activateResult.active);

  // ─── Summary ───
  console.log('\n=======================================');
  console.log(`SUMMARY: ${changes.length} changes applied to V4 WF1`);
  console.log('=======================================');
  for (const c of changes) {
    console.log('  \u2022 ' + c);
  }

  console.log('\nBefore: 7 tools, maxIterations=10 (default), Date & Time Tool always called first');
  console.log('After:  6 tools, maxIterations=15, dates resolved from inline calendar (no tool call)');
  console.log('\nTypical booking flow now uses ~3-4 iterations instead of 5-6.');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

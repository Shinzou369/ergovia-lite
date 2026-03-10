/**
 * Fix V4 WF1 Dates — V3: Code Node + Simple Expressions
 *
 * Root cause: $now.plus({days:N}).toFormat() expressions in systemMessage
 * DON'T resolve — the AI sees literal {{ $now... }} text and falls back to
 * its training data (2024 dates).
 *
 * Proof: Execution 613 shows AI passed check_in_date:"2024-02-14" to Calendar Manager.
 * Merge Customer ID has NO date fields (I removed them in V2 fix).
 *
 * Fix approach:
 * 1. Add a dedicated "Build Date Context" Code node AFTER Merge Customer ID
 *    that computes today + 14-day calendar in plain JavaScript
 * 2. System prompt uses SIMPLE expressions: {{ $json.today }} {{ $json.calendar }}
 *    (these are basic field references — proven to work in n8n)
 * 3. Also inject today's date into Calendar Manager Tool description
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
  console.log('=== [V4] WF1: Fix Dates V3 — Code Node + Simple Expressions ===\n');

  console.log('1. Downloading live V4 WF1...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── STEP 1: Update Merge Customer ID to compute dates ───
  // Instead of adding a new node, compute dates directly in the existing Merge Customer ID
  console.log('2. Updating Merge Customer ID with date computation...');
  const mergeNode = wf.nodes.find(n => n.name === 'Merge Customer ID');
  if (!mergeNode) {
    console.error('Merge Customer ID not found!');
    return;
  }

  mergeNode.parameters.jsCode = `// Merge customer_id + property context + DATE CONTEXT
const normalized = $('Normalize Input').item.json;
const customerResult = $input.item.json;

const customerId = customerResult?.customer_id || '00000000-0000-0000-0000-000000000001';
const timezone = customerResult?.timezone || 'Asia/Manila';

const isOwner = (customerResult?.owner_telegram === normalized.sender_id) ||
                (customerResult?.owner_contact === normalized.sender_id);

// ══════ DATE CONTEXT (computed here, referenced in system prompt) ══════
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const today = yyyy + '-' + mm + '-' + dd;
const dayName = days[now.getDay()];
const monthName = months[now.getMonth()];

// Build 14-day calendar
const calendarLines = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(now.getTime() + i * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = y + '-' + m + '-' + day;
  const dn = days[d.getDay()];
  let label = '';
  if (i === 0) label = ' <-- TODAY';
  else if (i === 1) label = ' <-- TOMORROW';
  calendarLines.push(dateStr + ' ' + dn + label);
}

const calendar = calendarLines.join('\\n');
const todayFull = dayName + ', ' + monthName + ' ' + now.getDate() + ', ' + yyyy;

return {
  ...normalized,
  customer_id: customerId,
  property_id: customerResult?.property_id || null,
  property_name: customerResult?.property_name || null,
  timezone: timezone,
  is_owner: isOwner,
  today: today,
  today_full: todayFull,
  today_year: String(yyyy),
  today_day: dayName,
  calendar: calendar
};`;

  log('Merge Customer ID: Added date computation — today, today_full, today_year, calendar (14-day)');

  // ─── STEP 2: Update system prompt with SIMPLE expression references ───
  console.log('\n3. Updating AI Agent system prompt...');
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agentNode) {
    console.error('AI Agent not found!');
    return;
  }

  // Use ONLY simple expressions: {{ $('Merge Customer ID').item.json.fieldName }}
  // These are basic field references — proven to work in n8n
  const ref = "$('Merge Customer ID').item.json";

  agentNode.parameters.options.systemMessage =
`You are the main AI concierge for a vacation rental business. You communicate with guests — your tools are your back-office team.

## CONTEXT
- Property: {{ ${ref}.property_name }}
- Timezone: {{ ${ref}.timezone }}
- Is Owner: {{ ${ref}.is_owner }}

## TODAY'S DATE (READ THIS — THIS IS THE REAL DATE)
Today is {{ ${ref}.today_full }} ({{ ${ref}.today }}).
The current year is {{ ${ref}.today_year }}.

## 14-DAY CALENDAR
{{ ${ref}.calendar }}

## CRITICAL DATE RULES
1. The ONLY correct dates are in the calendar above. DO NOT use any other dates.
2. The current year is {{ ${ref}.today_year }} — NEVER use 2024 or any other year.
3. "tomorrow" = the line marked TOMORROW in the calendar above
4. "next Sunday" = find the next Sunday AFTER today in the calendar
5. "next week" = the week starting with the next Monday in the calendar
6. ALWAYS resolve dates to YYYY-MM-DD using the calendar BEFORE calling any tool
7. ALWAYS confirm resolved dates with the guest before booking
8. If a date would be BEFORE {{ ${ref}.today }}, it is WRONG — find the next occurrence

## OWNER MESSAGES (is_owner = true)
If from the OWNER: check if confirming payment, or asking about property/bookings.

## How You Work
1. Read the message and determine intent
2. Resolve dates using the CALENDAR above (no tool call needed for dates)
3. Call 1-2 tools max to get data
4. Respond in under 150 words

## EFFICIENCY
- Dates are in the calendar — no tool call needed for date resolution
- 1-2 tool calls per message, max 3 for complex booking flows
- Greetings and simple questions need no tools
- Never call the same tool twice with same parameters

## Tools:

### Calendar Manager
Check availability. Pass check_in_date and check_out_date in YYYY-MM-DD format.
IMPORTANT: Both dates must be {{ ${ref}.today }} or later. Never pass a past date.

### Offer Conflict Checker
Call BEFORE confirming a booking. Returns CLEAR or COMPETING.

### Payment Processor
Create bookings after confirming availability + no conflicts. Also confirms owner payments.

### Calculate Price
Recalculate pricing (Calendar Manager already includes pricing — only use for recalculation).

### Property Operations
Maintenance, issues, cleaning requests.

### Emergency Handler
ONLY for emergencies: fire, medical, break-in, gas leak, flooding.

## Booking Flow:
1. Guest mentions dates = resolve using CALENDAR above to YYYY-MM-DD
2. Calendar Manager (check availability)
3. Offer Conflict Checker (check for competing offers)
4. Payment Processor (create booking)

## Response Rules
- Never expose JSON to guests
- 1-2 emojis max
- End with next step or question
- Confirm dates as: "February 22 to March 1, {{ ${ref}.today_year }} (Sunday to Sunday)"`;

  log('AI Agent: System prompt uses simple $() expressions for all dates');
  log('AI Agent: Calendar injected via {{ $("Merge Customer ID").item.json.calendar }}');

  // ─── STEP 3: Update Calendar Manager Tool description to include today's date ───
  console.log('\n4. Updating Calendar Manager Tool description...');
  const calTool = wf.nodes.find(n => n.name === 'Calendar Manager Tool');
  if (calTool) {
    // Check what description format the tool uses
    console.log('   Tool type:', calTool.type);
    console.log('   Current description:', (calTool.parameters.description || '').substring(0, 100));

    // For toolWorkflow, the description tells the AI what the tool does
    if (calTool.parameters.description !== undefined) {
      calTool.parameters.description = 'Check property availability for specific dates. Pass check_in_date and check_out_date in YYYY-MM-DD format. IMPORTANT: Today is {{ ' + ref + '.today }}. Both dates MUST be on or after today. Never pass a date before {{ ' + ref + '.today }}.';
      log('Calendar Manager Tool: Description now includes today date reference');
    }
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
  console.log('SUMMARY: ' + changes.length + ' changes applied to V4 WF1');
  console.log('=======================================');
  for (const c of changes) {
    console.log('  \u2022 ' + c);
  }

  console.log('\nApproach: Dates computed in JavaScript Code node (reliable),');
  console.log('referenced via simple {{ $("Merge Customer ID").item.json.field }} expressions.');
  console.log('No $now.plus().toFormat() chains (which may not resolve in systemMessage).');
  console.log('\nTest: Send "Can I book tomorrow until next week?"');
  console.log('Expected: AI reads calendar, resolves to 2026-02-18 to 2026-02-24');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

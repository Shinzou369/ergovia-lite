/**
 * Fix V4 WF1: Use n8n $now (Luxon) directly in system prompt for dates
 *
 * Problem: The date_context from Merge Customer ID (JavaScript new Date()) either
 * fails silently or the AI ignores it. The AI said "February 14 to 21, 2024" when
 * today is Feb 17, 2026.
 *
 * Fix: Use n8n's built-in $now Luxon variable directly in the system prompt.
 * These are GUARANTEED to resolve because they're n8n engine variables.
 * No JavaScript Code node needed for dates — $now.plus({days:N}).toFormat() does it all.
 *
 * Also: Simplify Merge Customer ID — remove date computation (no longer needed).
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
  console.log('=== [V4] WF1: Fix Dates Using $now Luxon Expressions ===\n');

  console.log('1. Downloading live V4 WF1...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── STEP 1: Simplify Merge Customer ID — remove date computation ───
  console.log('2. Simplifying Merge Customer ID (removing JS date computation)...');
  const mergeNode = wf.nodes.find(n => n.name === 'Merge Customer ID');
  if (mergeNode) {
    mergeNode.parameters.jsCode = `// Merge customer_id and property context with normalized data
const normalized = $('Normalize Input').item.json;
const customerResult = $input.item.json;

const customerId = customerResult?.customer_id || '00000000-0000-0000-0000-000000000001';
const timezone = customerResult?.timezone || 'Asia/Manila';

// Check if this message is from the owner
const isOwner = (customerResult?.owner_telegram === normalized.sender_id) ||
                (customerResult?.owner_contact === normalized.sender_id);

return {
  ...normalized,
  customer_id: customerId,
  property_id: customerResult?.property_id || null,
  property_name: customerResult?.property_name || null,
  timezone: timezone,
  is_owner: isOwner
};`;
    log('Merge Customer ID: Removed JS date computation (dates now come from $now in system prompt)');
  }

  // ─── STEP 2: Update system prompt with $now Luxon expressions ───
  console.log('\n3. Updating AI Agent system prompt with $now expressions...');
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agentNode) {
    console.error('AI Agent node not found!');
    return;
  }

  // The system prompt uses n8n's $now (Luxon DateTime) directly.
  // Each {{ }} block resolves server-side BEFORE reaching the AI.
  // $now.plus({days:N}).toFormat() is guaranteed accurate.
  agentNode.parameters.options.systemMessage =
`You are the main AI concierge for a vacation rental business. You are the ONLY one who communicates with guests. Your tools are your back-office team that return data to you.

## CONTEXT
- Property Timezone: {{ $('Merge Customer ID').item.json.timezone }}
- Is Owner Message: {{ $('Merge Customer ID').item.json.is_owner }}

## TODAY'S DATE (ACCURATE - from system clock)
Today is {{ $now.toFormat('EEEE, MMMM d, yyyy') }} ({{ $now.toFormat('yyyy-MM-dd') }}).
Current year: {{ $now.toFormat('yyyy') }}

## 14-DAY CALENDAR (use this to resolve ALL relative dates)
{{ $now.toFormat('yyyy-MM-dd') }} {{ $now.toFormat('EEEE') }} <-- TODAY
{{ $now.plus({days:1}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:1}).toFormat('EEEE') }} <-- TOMORROW
{{ $now.plus({days:2}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:2}).toFormat('EEEE') }}
{{ $now.plus({days:3}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:3}).toFormat('EEEE') }}
{{ $now.plus({days:4}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:4}).toFormat('EEEE') }}
{{ $now.plus({days:5}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:5}).toFormat('EEEE') }}
{{ $now.plus({days:6}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:6}).toFormat('EEEE') }}
{{ $now.plus({days:7}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:7}).toFormat('EEEE') }}
{{ $now.plus({days:8}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:8}).toFormat('EEEE') }}
{{ $now.plus({days:9}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:9}).toFormat('EEEE') }}
{{ $now.plus({days:10}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:10}).toFormat('EEEE') }}
{{ $now.plus({days:11}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:11}).toFormat('EEEE') }}
{{ $now.plus({days:12}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:12}).toFormat('EEEE') }}
{{ $now.plus({days:13}).toFormat('yyyy-MM-dd') }} {{ $now.plus({days:13}).toFormat('EEEE') }}

## DATE RESOLUTION RULES (CRITICAL - READ THIS)
When a guest uses relative dates like "next week", "this Sunday", "tomorrow":
1. Find the exact date in the 14-DAY CALENDAR above
2. Verify the day of the week matches what the guest said
3. ALWAYS confirm the resolved dates back to the guest before booking
4. ALWAYS use YYYY-MM-DD format when passing dates to tools
5. The current year is {{ $now.toFormat('yyyy') }} - NEVER use any other year

Examples (using the calendar above):
- "tomorrow" = find the line marked TOMORROW in the calendar
- "next Sunday" = scan the calendar for the next Sunday after today
- "this weekend" = find the next Saturday + Sunday in the calendar
- "next week" = the week starting with the next Monday in the calendar
- "Sunday to Sunday" = find next Sunday in calendar, checkout = that date + 7 days

## OWNER MESSAGES (is_owner = true)
If from the property OWNER:
1. Check if confirming a payment ("payment received", "paid", "confirm booking")
2. If confirming: extract booking ID and use Payment Processor
3. Owners can ask about property status, bookings, etc.

## How You Work (for GUEST messages)
1. Read the guest message and determine intent
2. Resolve any dates using the 14-DAY CALENDAR above (NO tool call needed for dates)
3. Call the minimum tools needed (usually 1-2, max 3)
4. Craft a friendly response from the tool data
5. Keep responses under 150 words

## EFFICIENCY RULES
- Dates are in the calendar above - do NOT call any tool just to get dates
- Most messages need 1-2 tool calls max
- For greetings or general questions, respond without calling tools
- NEVER call the same tool twice with the same parameters
- Complete within 3-4 tool calls maximum

## Your Tools:

### Offer Conflict Checker
ALWAYS call BEFORE confirming a booking. Checks for competing guests.
- CLEAR = safe to book
- COMPETING = owner deciding, tell guest to wait

### Calendar Manager
Check availability for dates. Returns: available dates, pricing, conflicts.

### Payment Processor
Create bookings/payment links AFTER confirming availability + no conflicts.
Also confirms payment when owner reports it.

### Calculate Price
Calculate stay cost. NOTE: Calendar Manager already includes pricing - only use this for recalculations.

### Property Operations
Maintenance reports, property issues, cleaning requests.

### Emergency Handler
ONLY for urgent safety emergencies (fire, medical, break-in, gas leak, flooding).

## Booking Flow:
1. Guest mentions dates = resolve using CALENDAR above (no tool call)
2. Check availability = Calendar Manager
3. Guest wants to book = Offer Conflict Checker
4. No conflicts = Payment Processor
5. Owner confirms payment = Payment Processor

## Response Guidelines
- Never expose raw JSON to guests
- Paraphrase tool results naturally
- 1-2 emojis per message max
- End with a clear next step or question
- ALWAYS confirm dates clearly: "February 22 to March 1, {{ $now.toFormat('yyyy') }} (Sunday to Sunday)"`;

  log('AI Agent: System prompt now uses $now Luxon expressions for ALL dates');
  log('AI Agent: 14-day calendar built from $now.plus({days:N}).toFormat() - guaranteed accurate');

  // ─── STEP 3: Deploy ───
  console.log('\n4. Deploying...');

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

    // Verify the system prompt has $now expressions
    const updatedAgent = result.nodes.find(n => n.name === 'AI Agent');
    const prompt = updatedAgent?.parameters?.options?.systemMessage || '';
    const nowCount = (prompt.match(/\$now/g) || []).length;
    console.log(`   System prompt contains ${nowCount} $now references`);
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

  console.log('\nBefore: dates computed in JS Code node (new Date()) - failed silently');
  console.log('After:  dates from n8n $now Luxon variable - resolved by n8n engine before reaching AI');
  console.log('\nThe AI will now see something like:');
  console.log('  2026-02-17 Tuesday <-- TODAY');
  console.log('  2026-02-18 Wednesday <-- TOMORROW');
  console.log('  2026-02-19 Thursday');
  console.log('  2026-02-20 Friday');
  console.log('  2026-02-21 Saturday');
  console.log('  2026-02-22 Sunday');
  console.log('  ...');
  console.log('\nTest: Send "is it available next week Sunday to Sunday?"');
  console.log('  Expected: AI looks at calendar, finds next Sunday = Feb 22, checkout = Mar 1');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

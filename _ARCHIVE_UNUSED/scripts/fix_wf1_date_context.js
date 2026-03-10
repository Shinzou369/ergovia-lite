/**
 * Fix [V4] WF1: AI Gateway — Date awareness
 *
 * Problem: System prompt tells AI to "ALWAYS call Date & Time tool first"
 * but that tool WAS NEVER CREATED. The AI tries, fails silently, and hallucinates dates.
 * Result: "Sunday to Sunday next week" → Feb 26-Mar 5 (Thursdays, not Sundays).
 *
 * Fix:
 * 1. Create the missing "Date & Time" toolCode node with full calendar context
 * 2. Wire it to the AI Agent as an ai_tool
 * 3. Also inject a 14-day calendar into Merge Customer ID → system prompt
 *    (safety net so the AI always has dates even without calling the tool)
 * 4. Tighten the system prompt date instructions
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
  console.log('  ✓ ' + msg);
}

async function main() {
  console.log('=== [V4] WF1: Add Date & Time Tool + Calendar Context ===\n');

  console.log('1. Downloading live V4 WF1...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── STEP 1: Create the missing Date & Time toolCode node ───
  console.log('2. Creating Date & Time tool...');

  // Find AI Agent position to place the tool nearby
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  const calcPriceTool = wf.nodes.find(n => n.name === 'Calculate Price Tool');
  const toolPos = calcPriceTool ? [calcPriceTool.position[0], calcPriceTool.position[1] + 150] : [800, 800];

  const dateTimeTool = {
    parameters: {
      name: 'get_current_date_time',
      description: 'Get the current date, time, day of week, and a 14-day calendar. ALWAYS call this FIRST before interpreting any relative date like "tomorrow", "next week", "this Sunday", "next Friday", etc. No input needed.',
      jsCode: `// Return current date/time with full calendar context
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const now = new Date();
const todayStr = now.toISOString().split('T')[0];
const dayOfWeek = days[now.getDay()];

// Build 14-day calendar
const calendar = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(now);
  d.setDate(d.getDate() + i);
  const dateStr = d.toISOString().split('T')[0];
  const dayName = days[d.getDay()];
  const label = i === 0 ? ' ← TODAY' : i === 1 ? ' ← TOMORROW' : '';
  calendar.push(dayName.padEnd(10) + dateStr + label);
}

// Find next occurrence of each day
function nextDay(targetDay) {
  const d = new Date(now);
  const target = days.indexOf(targetDay);
  let ahead = target - d.getDay();
  if (ahead <= 0) ahead += 7;
  d.setDate(d.getDate() + ahead);
  return d.toISOString().split('T')[0];
}

return {
  current_date: todayStr,
  current_day: dayOfWeek,
  current_time: now.toTimeString().split(' ')[0],
  next_sunday: nextDay('Sunday'),
  next_monday: nextDay('Monday'),
  next_friday: nextDay('Friday'),
  next_saturday: nextDay('Saturday'),
  calendar_14_days: calendar.join('\\n'),
  usage_hint: 'Use this calendar to resolve relative dates. "next Sunday" = ' + nextDay('Sunday') + '. "this weekend" = ' + nextDay('Saturday') + ' to ' + nextDay('Sunday') + '.'
};`
    },
    id: 'tool-date-time',
    name: 'Date & Time Tool',
    type: '@n8n/n8n-nodes-langchain.toolCode',
    typeVersion: 1,
    position: toolPos
  };

  wf.nodes.push(dateTimeTool);
  log('Created "Date & Time Tool" toolCode node');

  // ─── STEP 2: Wire it to AI Agent ───
  console.log('\n3. Wiring Date & Time Tool to AI Agent...');
  wf.connections['Date & Time Tool'] = {
    ai_tool: [[{
      node: 'AI Agent',
      type: 'ai_tool',
      index: 0
    }]]
  };
  log('Connected Date & Time Tool → AI Agent (ai_tool)');

  // ─── STEP 3: Update Merge Customer ID to inject calendar into context ───
  console.log('\n4. Adding calendar context to Merge Customer ID...');
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

// Get current time in property timezone
const now = new Date();
const propertyTime = now.toLocaleString('en-US', { timeZone: timezone });

// ── Build date context for system prompt ──
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const todayStr = now.toISOString().split('T')[0];
const dayOfWeek = days[now.getDay()];
const monthName = months[now.getMonth()];

// 14-day calendar
const calendar = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(now);
  d.setDate(d.getDate() + i);
  const dateStr = d.toISOString().split('T')[0];
  const dayName = days[d.getDay()];
  const label = i === 0 ? ' ← TODAY' : i === 1 ? ' ← TOMORROW' : '';
  calendar.push(dayName.padEnd(10) + dateStr + label);
}

// Next occurrence of key days
function nextDay(targetDay) {
  const d = new Date(now);
  const target = days.indexOf(targetDay);
  let ahead = target - d.getDay();
  if (ahead <= 0) ahead += 7;
  d.setDate(d.getDate() + ahead);
  return d.toISOString().split('T')[0];
}

const dateContext =
  'Today: ' + dayOfWeek + ', ' + monthName + ' ' + now.getDate() + ', ' + now.getFullYear() + ' (' + todayStr + ')\\n' +
  'Next Sunday: ' + nextDay('Sunday') + '\\n' +
  'Next Monday: ' + nextDay('Monday') + '\\n' +
  'Next Friday: ' + nextDay('Friday') + '\\n' +
  'Next Saturday: ' + nextDay('Saturday') + '\\n\\n' +
  'Upcoming 14 days:\\n' + calendar.join('\\n');

return {
  ...normalized,
  customer_id: customerId,
  property_id: customerResult?.property_id || null,
  property_name: customerResult?.property_name || null,
  timezone: timezone,
  property_local_time: propertyTime,
  is_owner: isOwner,
  date_context: dateContext,
  today_date: todayStr,
  today_day: dayOfWeek
};`;
    log('Merge Customer ID: Added 14-day calendar + next-day references to output');
  }

  // ─── STEP 4: Update system prompt to include inline calendar ───
  console.log('\n5. Updating AI Agent system prompt...');
  if (agentNode) {
    agentNode.parameters.options.systemMessage = `You are the main AI concierge for a vacation rental business. You are the ONLY one who communicates with guests — your tools are your back-office team that return data to you.

## CONTEXT
- Property Timezone: {{ $('Merge Customer ID').item.json.timezone }}
- Current Local Time: {{ $('Merge Customer ID').item.json.property_local_time }}
- Is Owner Message: {{ $('Merge Customer ID').item.json.is_owner }}

## CURRENT DATE REFERENCE
{{ $('Merge Customer ID').item.json.date_context }}

## DATE RESOLUTION RULES (CRITICAL — READ CAREFULLY)
You have a **Date & Time Tool** — call it to verify dates. But you also have the calendar above as a quick reference.

When a guest uses relative dates, you MUST:
1. Look at the 14-day calendar above to find the exact YYYY-MM-DD date
2. Cross-check that the day of the week matches what the guest asked for
3. ALWAYS confirm the resolved dates back to the guest before booking

Examples:
- "next week" → the week starting next Monday (find Monday in the calendar)
- "this weekend" → the upcoming Saturday + Sunday from the calendar
- "Sunday to Sunday" → find the next Sunday, then +7 days for checkout
- "next Friday" → find the next Friday in the calendar
- NEVER guess a date without verifying it against the calendar
- ALWAYS pass dates to tools in YYYY-MM-DD format

## OWNER MESSAGES (is_owner = true)
If this message is from the property OWNER (not a guest):
1. Check if they're confirming a payment (phrases like "payment received", "paid", "got the payment", "confirm booking")
2. If confirming payment: Extract the booking ID if mentioned and use Payment Processor to confirm
3. Owners can also ask about their property status, upcoming bookings, etc.

## How You Work (for GUEST messages)
1. Read the guest's message and determine their intent
2. If they mention dates, resolve them using the calendar above
3. Call the right tool(s) to get data
4. Use the returned data to craft YOUR friendly response
5. Keep responses concise (under 150 words)

## Your Tools (return DATA, not messages):

### Date & Time Tool
Returns the current date, time, and a 14-day calendar. Call this if you need to verify any date calculation.

### Offer Conflict Checker
ALWAYS call this BEFORE confirming any booking. Checks if other guests are competing for the same dates.
- Returns CLEAR → safe to proceed with booking
- Returns COMPETING → owner is deciding between offers, tell guest to wait

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
- Returns: price breakdown (nightly rate, nights, cleaning fee, service fee, discounts, total)

### Property Operations
Handle maintenance reports, property issues, cleaning requests.
- Returns: ticket info, issue category, urgency level

### Emergency Handler
ONLY for urgent safety emergencies (fire, medical, break-in, gas leak, flooding).
- Returns: emergency assessment, responder info, immediate action instructions

## Booking Flow (follow this order):
1. Guest mentions dates → Resolve to YYYY-MM-DD using calendar above
2. Check availability → Calendar Manager
3. Guest wants to book → Offer Conflict Checker (check for competing offers)
4. No conflicts → Payment Processor (create booking + send payment info)
5. Owner confirms payment → Payment Processor (confirm booking)

## Response Guidelines
- Never expose raw JSON or data to guests
- Paraphrase tool results naturally
- Use emojis sparingly (1-2 per message max)
- Always end with a clear next step or question
- If a tool errors, apologize and offer alternatives
- For emergencies, lead with safety instructions immediately
- ALWAYS confirm dates back in a clear format: "February 22 to March 1, 2026 (Sunday to Sunday)"`;

    log('AI Agent: Updated system prompt — added inline calendar reference + tightened date resolution rules');
  }

  // ─── STEP 5: Deploy ───
  console.log('\n6. Deploying...');

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
  console.log('\n═══════════════════════════════════════');
  console.log(`SUMMARY: ${changes.length} changes applied to V4 WF1`);
  console.log('═══════════════════════════════════════');
  for (const c of changes) {
    console.log('  • ' + c);
  }

  console.log('\nThe AI now has TWO sources of date truth:');
  console.log('  1. Inline calendar in system prompt (always visible, no tool call needed)');
  console.log('  2. Date & Time Tool (can call explicitly to double-check)');
  console.log('\nTest: Send "is the property available next week Sunday to Sunday?"');
  console.log('  Expected: AI resolves Feb 22 → Mar 1, 2026 (actual Sundays)');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

/**
 * Fix V4 WF1: AI says wrong day names (Friday for Thursday)
 *
 * The calendar data is correct but the AI guesses day names instead of reading them.
 * Fix: Make calendar format more explicit + tell AI to COPY day names, not compute them.
 * Also: Add convenience fields (tomorrow_full, next_sunday, etc.) so AI can copy-paste.
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'tvSLRSiOmNdkEfA2';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== V4 WF1: Fix Day-of-Week Names ===\n');

  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  console.log(`Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── Update Merge Customer ID: better calendar format + convenience fields ───
  const mergeNode = wf.nodes.find(n => n.name === 'Merge Customer ID');

  mergeNode.parameters.jsCode = `// Merge customer_id + property context + DATE CONTEXT
const normalized = $('Normalize Input').item.json;
const customerResult = $input.item.json;

const customerId = customerResult?.customer_id || '00000000-0000-0000-0000-000000000001';
const timezone = customerResult?.timezone || 'Asia/Manila';

const isOwner = (customerResult?.owner_telegram === normalized.sender_id) ||
                (customerResult?.owner_contact === normalized.sender_id);

// ══════ DATE CONTEXT ══════
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

// Build 14-day calendar with clear day-date pairs
const calendarLines = [];
const dateMap = {}; // dayName -> first occurrence date string

for (let i = 0; i < 14; i++) {
  const d = new Date(now.getTime() + i * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = y + '-' + m + '-' + day;
  const dn = days[d.getDay()];
  const mn = months[d.getMonth()];

  // Formatted as: "Thursday 2026-02-19 (February 19)"
  let label = '';
  if (i === 0) label = '  <-- TODAY';
  else if (i === 1) label = '  <-- TOMORROW';

  calendarLines.push(dn + ' ' + dateStr + ' (' + mn + ' ' + d.getDate() + ')' + label);

  // Track "next" occurrences of each day name (skip today)
  if (i > 0 && !dateMap[dn]) {
    dateMap[dn] = dn + ', ' + mn + ' ' + d.getDate() + ', ' + y + ' (' + dateStr + ')';
  }
}

const calendar = calendarLines.join('\\n');
const todayFull = dayName + ', ' + monthName + ' ' + now.getDate() + ', ' + yyyy;

// Tomorrow convenience field
const tmrw = new Date(now.getTime() + 86400000);
const tmrwDay = days[tmrw.getDay()];
const tmrwMonth = months[tmrw.getMonth()];
const tmrwStr = tmrw.getFullYear() + '-' + String(tmrw.getMonth()+1).padStart(2,'0') + '-' + String(tmrw.getDate()).padStart(2,'0');
const tomorrowFull = tmrwDay + ', ' + tmrwMonth + ' ' + tmrw.getDate() + ', ' + tmrw.getFullYear() + ' (' + tmrwStr + ')';

// Next occurrence of each day (for "next Sunday", "next Monday" etc.)
const nextDays = Object.entries(dateMap).map(([d, v]) => '  next ' + d + ' = ' + v).join('\\n');

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
  tomorrow_full: tomorrowFull,
  next_days: nextDays,
  calendar: calendar
};`;

  console.log('Updated Merge Customer ID:');
  console.log('  - Calendar format: "Thursday 2026-02-19 (February 19)"');
  console.log('  - Added tomorrow_full convenience field');
  console.log('  - Added next_days lookup (next Sunday = ..., next Monday = ...)');

  // ─── Update system prompt ───
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  const ref = "$('Merge Customer ID').item.json";

  agentNode.parameters.options.systemMessage =
`=You are the main AI concierge for a vacation rental business. You communicate with guests — your tools are your back-office team.

## CONTEXT
- Property: {{ ${ref}.property_name }}
- Timezone: {{ ${ref}.timezone }}
- Is Owner: {{ ${ref}.is_owner }}

## TODAY'S DATE
Today is {{ ${ref}.today_full }} ({{ ${ref}.today }}).
Tomorrow is {{ ${ref}.tomorrow_full }}.
Current year: {{ ${ref}.today_year }}.

## QUICK DAY LOOKUP
{{ ${ref}.next_days }}

## 14-DAY CALENDAR (each line = DayName YYYY-MM-DD (Month Day))
{{ ${ref}.calendar }}

## DATE RULES
1. Use ONLY the dates from the calendar above. NEVER invent dates.
2. Current year is {{ ${ref}.today_year }} — never use 2024 or any past year.
3. When you say a day name, COPY IT from the calendar line. Do NOT guess day names.
4. "tomorrow" = the TOMORROW line in the calendar.
5. "next Sunday/Monday/etc." = use the QUICK DAY LOOKUP above.
6. Always pass YYYY-MM-DD dates to tools.
7. Dates before {{ ${ref}.today }} are invalid.

## DATE CONFIRMATION (DO THIS BEFORE CHECKING AVAILABILITY)
When a guest uses relative dates like "tomorrow", "next week", "Sunday to Sunday":
1. Find the matching dates in the calendar
2. COPY the day name and date from the calendar line — do NOT compute day names yourself
3. Confirm with the guest:
   "Just to confirm — you'd like to check in on [DayName], [Month] [Day] and check out on [DayName], [Month] [Day], {{ ${ref}.today_year }}? Let me check availability!"
4. Then call Calendar Manager with the YYYY-MM-DD dates

If the guest gives exact dates (e.g. "February 22 to March 1"), skip confirmation and check directly.

## OWNER MESSAGES (is_owner = true)
If from the OWNER: check if confirming payment, or asking about property/bookings.

## How You Work
1. Read message, determine intent
2. If dates mentioned: find in calendar, confirm with guest (copy day names from calendar)
3. Call 1-2 tools max
4. Respond in under 150 words

## EFFICIENCY
- 1-2 tool calls per message, max 3
- Greetings need no tools
- Never call same tool twice with same params

## Tools:

### Calendar Manager
Check availability. Pass check_in_date and check_out_date as YYYY-MM-DD.
Both dates must be on or after {{ ${ref}.today }}.

### Offer Conflict Checker
Call BEFORE confirming a booking. Returns CLEAR or COMPETING.

### Payment Processor
Create bookings after availability confirmed + no conflicts. Confirms owner payments.

### Calculate Price
Recalculate pricing (Calendar Manager already includes pricing).

### Property Operations
Maintenance, issues, cleaning requests.

### Emergency Handler
ONLY for emergencies: fire, medical, break-in, gas leak, flooding.

## Booking Flow:
1. Guest mentions dates = find in calendar, confirm with guest
2. Calendar Manager (check availability)
3. Offer Conflict Checker
4. Payment Processor

## Response Rules
- Never expose JSON
- 1-2 emojis max
- End with next step or question`;

  console.log('\nUpdated system prompt:');
  console.log('  - "COPY day name from calendar — do NOT compute"');
  console.log('  - Quick day lookup section (next Sunday = ..., etc.)');
  console.log('  - tomorrow_full field for easy reference');

  // ─── Deploy ───
  console.log('\nDeploying...');
  if (wf.active) {
    await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
    await sleep(1500);
  }

  const result = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  });

  if (result.id) {
    console.log('Update successful! Nodes:', result.nodes.length);
  } else {
    console.error('Update FAILED:', JSON.stringify(result).substring(0, 300));
    return;
  }
  await sleep(1000);

  console.log('Activating...');
  const act = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('Active:', act.active);

  console.log('\n=== DONE ===');
  console.log('\nCalendar format now looks like:');
  console.log('  Wednesday 2026-02-18 (February 18)  <-- TODAY');
  console.log('  Thursday 2026-02-19 (February 19)  <-- TOMORROW');
  console.log('  Friday 2026-02-20 (February 20)');
  console.log('  ...');
  console.log('\nQuick day lookup:');
  console.log('  next Thursday = Thursday, February 19, 2026 (2026-02-19)');
  console.log('  next Sunday = Sunday, February 22, 2026 (2026-02-22)');
  console.log('  ...');
  console.log('\nThe AI is told to COPY day names from the calendar, not compute them.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

/**
 * Update V4 WF1 system prompt:
 * 1. Add date confirmation/clarification behavior
 * 2. Ensure systemMessage is in Expression mode (= prefix)
 * 3. Reactivate the workflow
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
  console.log('=== V4 WF1: Add Date Confirmation + Reactivate ===\n');

  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  console.log(`Downloaded: ${wf.name} (${wf.nodes.length} nodes, active: ${wf.active})\n`);

  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  const ref = "$('Merge Customer ID').item.json";

  // System prompt with = prefix for Expression mode, date confirmation behavior
  agentNode.parameters.options.systemMessage =
`=You are the main AI concierge for a vacation rental business. You communicate with guests — your tools are your back-office team.

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
3. "tomorrow" = the line marked TOMORROW in the calendar above.
4. "next Sunday" = find the next Sunday AFTER today in the calendar.
5. "next week" = the week starting with the next Monday in the calendar.
6. ALWAYS resolve dates to YYYY-MM-DD using the calendar BEFORE calling any tool.
7. If a date would be BEFORE {{ ${ref}.today }}, it is WRONG — find the next occurrence.

## DATE CONFIRMATION (ALWAYS DO THIS)
When a guest mentions dates, you MUST confirm them BEFORE checking availability:
1. Resolve the dates using the calendar above
2. Reply with something like: "Just to confirm — you'd like to stay from [Day], [Month] [Date] to [Day], [Month] [Date], {{ ${ref}.today_year }}? Let me check availability for you!"
3. Then call Calendar Manager with the resolved YYYY-MM-DD dates
4. If the guest corrects you, re-resolve using the calendar

Exception: If the guest already gives exact dates (e.g., "February 22 to March 1"), skip confirmation and check availability directly.

## OWNER MESSAGES (is_owner = true)
If from the OWNER: check if confirming payment, or asking about property/bookings.

## How You Work
1. Read the message and determine intent
2. If dates are mentioned, resolve using CALENDAR above and confirm with guest
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
1. Guest mentions dates = resolve using CALENDAR, confirm with guest
2. Calendar Manager (check availability)
3. Offer Conflict Checker (check for competing offers)
4. Payment Processor (create booking)

## Response Rules
- Never expose JSON to guests
- 1-2 emojis max
- End with next step or question
- Confirm dates as: "February 22 to March 1, {{ ${ref}.today_year }} (Sunday to Sunday)"`;

  console.log('Updated system prompt with:');
  console.log('  - = prefix for Expression mode');
  console.log('  - Date confirmation behavior (confirm before checking availability)');
  console.log('  - Exception: skip confirmation if guest gives exact dates\n');

  // Also ensure Calendar Manager Tool description has = prefix
  const calTool = wf.nodes.find(n => n.name === 'Calendar Manager Tool');
  if (calTool && calTool.parameters.description && !calTool.parameters.description.startsWith('=')) {
    calTool.parameters.description = '=' + calTool.parameters.description;
    console.log('Calendar Manager Tool: Added = prefix to description');
  }

  // Deploy
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

  // Always activate
  console.log('Activating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('Active:', activateResult.active);

  console.log('\n=== DONE ===');
  console.log('Date confirmation behavior added.');
  console.log('Test: Send "Can I book next week Sunday to Sunday?"');
  console.log('Expected: AI confirms "Sunday Feb 22 to Sunday Mar 1, 2026?" then checks availability');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

/**
 * Update WF1 (AI Gateway) - Add Property Context to AI
 *
 * This script updates the live V4 WF1 workflow via n8n API to:
 * 1. Expand Get Customer ID SQL to fetch all property details
 * 2. Update Merge Customer ID to pass property info through
 * 3. Add PROPERTY DETAILS section to the AI Agent system prompt
 *
 * The AI concierge will then know address, pricing, amenities, house rules,
 * description, photos, etc. — everything needed to sell the property.
 */

const https = require('https');

const N8N_URL = 'https://n8n.ergovia-ai.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwMDE2MjA0fQ.MjLv7Jf9YKSUfvS8gJVSvsah1hulXRszsirmZ63Rc5c';
const WF1_ID = 'tvSLRSiOmNdkEfA2';

// ─── HTTP helper ───────────────────────────────────────
function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, N8N_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── New SQL for Get Customer ID ───────────────────────
// Expands from 6 fields to all property details the AI needs
const NEW_GET_CUSTOMER_SQL = `=SELECT
  pc.customer_id,
  pc.property_id,
  pc.property_name,
  pc.timezone,
  pc.owner_telegram,
  pc.owner_contact,
  pc.address,
  pc.location_description,
  pc.bedrooms,
  pc.bathrooms,
  pc.max_guests,
  pc.base_price,
  pc.weekend_price,
  pc.cleaning_fee,
  pc.min_stay_nights,
  pc.max_stay_nights,
  pc.property_status,
  pc.settings
FROM property_configurations pc
LEFT JOIN conversations c ON pc.property_id = c.property_id
WHERE c.contact_id = '{{ $json.sender_id }}'
   OR pc.owner_telegram = '{{ $json.sender_id }}'
   OR pc.owner_contact = '{{ $json.sender_id }}'
LIMIT 1`;

// ─── New Merge Customer ID code ────────────────────────
// Passes all property details through to downstream nodes
const NEW_MERGE_CODE = `// Merge customer_id + property context + DATE CONTEXT + PROPERTY DETAILS
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
const dateMap = {};

for (let i = 0; i < 14; i++) {
  const d = new Date(now.getTime() + i * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = y + '-' + m + '-' + day;
  const dn = days[d.getDay()];
  const mn = months[d.getMonth()];

  let label = '';
  if (i === 0) label = '  <-- TODAY';
  else if (i === 1) label = '  <-- TOMORROW';

  calendarLines.push(dn + ' ' + dateStr + ' (' + mn + ' ' + d.getDate() + ')' + label);

  if (i > 0 && !dateMap[dn]) {
    dateMap[dn] = dn + ', ' + mn + ' ' + d.getDate() + ', ' + y + ' (' + dateStr + ')';
  }
}

const calendar = calendarLines.join('\\n');
const todayFull = dayName + ', ' + monthName + ' ' + now.getDate() + ', ' + yyyy;

const tmrw = new Date(now.getTime() + 86400000);
const tmrwDay = days[tmrw.getDay()];
const tmrwMonth = months[tmrw.getMonth()];
const tmrwStr = tmrw.getFullYear() + '-' + String(tmrw.getMonth()+1).padStart(2,'0') + '-' + String(tmrw.getDate()).padStart(2,'0');
const tomorrowFull = tmrwDay + ', ' + tmrwMonth + ' ' + tmrw.getDate() + ', ' + tmrw.getFullYear() + ' (' + tmrwStr + ')';

const nextDays = Object.entries(dateMap).map(([d, v]) => '  next ' + d + ' = ' + v).join('\\n');

// ══════ PROPERTY DETAILS ══════
const settings = customerResult?.settings || {};
const amenitiesRaw = settings.amenities || [];
const amenitiesList = Array.isArray(amenitiesRaw)
  ? (typeof amenitiesRaw[0] === 'object'
      ? Object.entries(amenitiesRaw[0] || {}).filter(([k,v]) => v).map(([k]) => k).join(', ')
      : amenitiesRaw.join(', '))
  : String(amenitiesRaw);

const propertyType = settings.property_type || 'property';
const checkInTime = settings.check_in_time || '15:00';
const checkOutTime = settings.check_out_time || '11:00';
const houseRules = settings.house_rules || '';
const photos = settings.photos || '';
const notes = settings.notes || '';

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
  calendar: calendar,
  // Property details for AI system prompt
  prop_address: customerResult?.address || 'Not set',
  prop_description: customerResult?.location_description || '',
  prop_type: propertyType,
  prop_bedrooms: customerResult?.bedrooms || 0,
  prop_bathrooms: customerResult?.bathrooms || 0,
  prop_max_guests: customerResult?.max_guests || 0,
  prop_base_price: customerResult?.base_price || 0,
  prop_weekend_price: customerResult?.weekend_price || 0,
  prop_cleaning_fee: customerResult?.cleaning_fee || 0,
  prop_min_stay: customerResult?.min_stay_nights || 1,
  prop_max_stay: customerResult?.max_stay_nights || 30,
  prop_check_in_time: checkInTime,
  prop_check_out_time: checkOutTime,
  prop_amenities: amenitiesList,
  prop_house_rules: houseRules,
  prop_photos: photos,
  prop_notes: notes,
};`;

// ─── New AI Agent system prompt ────────────────────────
// Adds PROPERTY DETAILS section so the AI knows everything about the property
const NEW_SYSTEM_PROMPT = `=You are the main AI concierge for a vacation rental business. You communicate with guests — your tools are your back-office team.

## CONTEXT
- Property: {{ $('Merge Customer ID').item.json.property_name }}
- Timezone: {{ $('Merge Customer ID').item.json.timezone }}
- Is Owner: {{ $('Merge Customer ID').item.json.is_owner }}

## PROPERTY DETAILS
- Address: {{ $('Merge Customer ID').item.json.prop_address }}
- Type: {{ $('Merge Customer ID').item.json.prop_type }} | Bedrooms: {{ $('Merge Customer ID').item.json.prop_bedrooms }} | Bathrooms: {{ $('Merge Customer ID').item.json.prop_bathrooms }} | Max Guests: {{ $('Merge Customer ID').item.json.prop_max_guests }}
- Pricing: \${{ $('Merge Customer ID').item.json.prop_base_price }}/night (weekends: \${{ $('Merge Customer ID').item.json.prop_weekend_price }}) + \${{ $('Merge Customer ID').item.json.prop_cleaning_fee }} cleaning fee
- Stay: min {{ $('Merge Customer ID').item.json.prop_min_stay }} nights, max {{ $('Merge Customer ID').item.json.prop_max_stay }} nights
- Check-in: {{ $('Merge Customer ID').item.json.prop_check_in_time }} | Check-out: {{ $('Merge Customer ID').item.json.prop_check_out_time }}
- Amenities: {{ $('Merge Customer ID').item.json.prop_amenities }}
- House Rules: {{ $('Merge Customer ID').item.json.prop_house_rules }}
- Description: {{ $('Merge Customer ID').item.json.prop_description }}
- Photos: {{ $('Merge Customer ID').item.json.prop_photos }}
- Notes: {{ $('Merge Customer ID').item.json.prop_notes }}

Use these details to answer guest questions about the property. Share photos when guests ask to see the place. Mention amenities, pricing, and house rules naturally in conversation.

## TODAY'S DATE
Today is {{ $('Merge Customer ID').item.json.today_full }} ({{ $('Merge Customer ID').item.json.today }}).
Tomorrow is {{ $('Merge Customer ID').item.json.tomorrow_full }}.
Current year: {{ $('Merge Customer ID').item.json.today_year }}.

## QUICK DAY LOOKUP
{{ $('Merge Customer ID').item.json.next_days }}

## 14-DAY CALENDAR (each line = DayName YYYY-MM-DD (Month Day))
{{ $('Merge Customer ID').item.json.calendar }}

## DATE RULES
1. Use ONLY the dates from the calendar above. NEVER invent dates.
2. Current year is {{ $('Merge Customer ID').item.json.today_year }} — never use 2024 or any past year.
3. When you say a day name, COPY IT from the calendar line. Do NOT guess day names.
4. "tomorrow" = the TOMORROW line in the calendar.
5. "next Sunday/Monday/etc." = use the QUICK DAY LOOKUP above.
6. Always pass YYYY-MM-DD dates to tools.
7. Dates before {{ $('Merge Customer ID').item.json.today }} are invalid.

## DATE CONFIRMATION (DO THIS BEFORE CHECKING AVAILABILITY)
When a guest uses relative dates like "tomorrow", "next week", "Sunday to Sunday":
1. Find the matching dates in the calendar
2. COPY the day name and date from the calendar line — do NOT compute day names yourself
3. Confirm with the guest:
   "Just to confirm — you'd like to check in on [DayName], [Month] [Day] and check out on [DayName], [Month] [Day], {{ $('Merge Customer ID').item.json.today_year }}? Let me check availability!"
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
Both dates must be on or after {{ $('Merge Customer ID').item.json.today }}.

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

// ─── Main ──────────────────────────────────────────────
async function main() {
  console.log('=== Update WF1: Add Property Context to AI ===\n');

  // 1. Fetch current WF1
  console.log('1. Fetching WF1...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF1_ID}`);
  console.log(`   Got ${wf.nodes.length} nodes`);

  // 2. Update Get Customer ID SQL
  const getCustomer = wf.nodes.find(n => n.name === 'Get Customer ID');
  if (!getCustomer) throw new Error('Get Customer ID node not found');

  const oldQuery = getCustomer.parameters.query;
  getCustomer.parameters.query = NEW_GET_CUSTOMER_SQL;
  console.log('2. Updated Get Customer ID SQL');
  console.log(`   Old fields: customer_id, property_id, property_name, timezone, owner_telegram, owner_contact`);
  console.log(`   New fields: + address, location_description, bedrooms, bathrooms, max_guests, base_price, weekend_price, cleaning_fee, min_stay_nights, max_stay_nights, property_status, settings`);

  // 3. Update Merge Customer ID code
  const merge = wf.nodes.find(n => n.name === 'Merge Customer ID');
  if (!merge) throw new Error('Merge Customer ID node not found');

  merge.parameters.jsCode = NEW_MERGE_CODE;
  console.log('3. Updated Merge Customer ID code');
  console.log('   Added: prop_address, prop_description, prop_type, prop_bedrooms, prop_bathrooms,');
  console.log('          prop_max_guests, prop_base_price, prop_weekend_price, prop_cleaning_fee,');
  console.log('          prop_min_stay, prop_max_stay, prop_check_in_time, prop_check_out_time,');
  console.log('          prop_amenities, prop_house_rules, prop_photos, prop_notes');

  // 4. Update AI Agent system prompt
  const agent = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agent) throw new Error('AI Agent node not found');

  const oldPromptLen = (agent.parameters.options?.systemMessage || '').length;
  if (!agent.parameters.options) agent.parameters.options = {};
  agent.parameters.options.systemMessage = NEW_SYSTEM_PROMPT;
  console.log('4. Updated AI Agent system prompt');
  console.log(`   Old length: ${oldPromptLen} chars`);
  console.log(`   New length: ${NEW_SYSTEM_PROMPT.length} chars`);
  console.log('   Added: PROPERTY DETAILS section with address, type, pricing, amenities, etc.');

  // 5. PUT updated workflow back to n8n
  console.log('\n5. Saving to n8n...');
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  };

  const result = await apiCall('PUT', `/api/v1/workflows/${WF1_ID}`, updateBody);
  console.log(`   SUCCESS! Workflow "${result.name}" updated (${result.nodes.length} nodes)`);
  console.log(`   Active: ${result.active}`);

  // 6. Verify
  console.log('\n6. Verifying...');
  const verify = await apiCall('GET', `/api/v1/workflows/${WF1_ID}`);
  const vGetCust = verify.nodes.find(n => n.name === 'Get Customer ID');
  const vMerge = verify.nodes.find(n => n.name === 'Merge Customer ID');
  const vAgent = verify.nodes.find(n => n.name === 'AI Agent');

  const sqlHasAddress = vGetCust.parameters.query.includes('pc.address');
  const mergeHasProps = vMerge.parameters.jsCode.includes('prop_address');
  const promptHasProps = vAgent.parameters.options.systemMessage.includes('PROPERTY DETAILS');

  console.log(`   Get Customer ID SQL has address field: ${sqlHasAddress ? 'YES' : 'NO'}`);
  console.log(`   Merge Customer ID has prop_ fields:    ${mergeHasProps ? 'YES' : 'NO'}`);
  console.log(`   AI Agent prompt has PROPERTY DETAILS:  ${promptHasProps ? 'YES' : 'NO'}`);

  if (sqlHasAddress && mergeHasProps && promptHasProps) {
    console.log('\n=== ALL VERIFIED! Property context is live in V4 WF1. ===');
  } else {
    console.log('\n=== WARNING: Some verifications failed! ===');
  }
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});

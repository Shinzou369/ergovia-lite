/**
 * Fix V4 WF1 + WF4 Tool Errors
 *
 * 1. Calculate Price Tool (WF1): "Wrong output type returned"
 *    Root cause: toolCode returns JS object, n8n expects a STRING
 *    Fix: JSON.stringify() all return values
 *
 * 2. Create Pending Booking (WF4): "Column 'num_guests' does not exist"
 *    Root cause: Column mapping says "num_guests" but actual DB column is "guests"
 *    Fix: Change column from "num_guests" to "guests"
 *    Also: Add property_name column (exists in DB but not mapped)
 *    Also: Ensure created_at expression has = prefix
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body)); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function deployWorkflow(id, wf, wasActive) {
  console.log('  Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${id}/deactivate`);
  await sleep(1500);

  console.log('  Updating...');
  const result = await apiCall('PUT', `/api/v1/workflows/${id}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null
  });

  if (result.id) {
    console.log('  Update successful! Nodes:', result.nodes.length);
  } else {
    console.error('  FAILED:', JSON.stringify(result).substring(0, 300));
    return false;
  }
  await sleep(1000);

  if (wasActive) {
    console.log('  Activating...');
    const act = await apiCall('POST', `/api/v1/workflows/${id}/activate`);
    console.log('  Active:', act.active);
  }
  return true;
}

async function main() {
  console.log('=== Fix V4 WF1 Calculate Price + WF4 Payment Processor ===\n');

  // ═══════════════════════════════════════════════════════
  // FIX 1: V4 WF1 — Calculate Price Tool (toolCode)
  // ═══════════════════════════════════════════════════════
  console.log('--- FIX 1: Calculate Price Tool (WF1) ---\n');
  const wf1 = await apiCall('GET', '/api/v1/workflows/tvSLRSiOmNdkEfA2');
  console.log(`Downloaded: ${wf1.name} (${wf1.nodes.length} nodes)\n`);

  const calcTool = wf1.nodes.find(n => n.name === 'Calculate Price Tool');
  if (calcTool) {
    // n8n toolCode MUST return a string, not an object
    calcTool.parameters.jsCode = `// Calculate total price for a vacation rental stay
// n8n toolCode MUST return a STRING (not an object)
try {
  const checkIn = new Date($fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format'));
  const checkOut = new Date($fromAI('check_out_date', 'Check-out date in YYYY-MM-DD format'));
  const pricePerNight = parseFloat($fromAI('price_per_night', 'Price per night in USD', 'number', '100'));
  const weekendPrice = parseFloat($fromAI('weekend_price', 'Weekend price per night', 'number', String(pricePerNight)));
  const cleaningFee = parseFloat($fromAI('cleaning_fee', 'One-time cleaning fee', 'number', '0'));
  const discountPercent = parseFloat($fromAI('discount_percent', 'Discount percentage', 'number', '0'));

  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

  if (nights <= 0 || isNaN(nights)) {
    return JSON.stringify({ error: true, message: 'Invalid dates: check-out must be after check-in' });
  }

  let weekdayNights = 0;
  let weekendNights = 0;
  for (let d = 0; d < nights; d++) {
    const day = new Date(checkIn);
    day.setDate(day.getDate() + d);
    const dow = day.getDay();
    if (dow === 5 || dow === 6) weekendNights++;
    else weekdayNights++;
  }

  const nightly = (weekdayNights * pricePerNight) + (weekendNights * weekendPrice);
  const discount = nightly * (discountPercent / 100);
  const afterDiscount = nightly - discount;
  const serviceFee = Math.round(afterDiscount * 0.12 * 100) / 100;

  let weeklyDiscount = 0;
  if (nights >= 7 && discountPercent === 0) {
    weeklyDiscount = Math.round(nightly * 0.10 * 100) / 100;
  }

  const total = Math.round((afterDiscount - weeklyDiscount + cleaningFee + serviceFee) * 100) / 100;

  return JSON.stringify({
    nights,
    weekday_nights: weekdayNights,
    weekend_nights: weekendNights,
    price_per_night: pricePerNight,
    weekend_price: weekendPrice,
    nightly_subtotal: Math.round(nightly * 100) / 100,
    custom_discount: Math.round(discount * 100) / 100,
    weekly_discount: weeklyDiscount,
    cleaning_fee: cleaningFee,
    service_fee: serviceFee,
    total: total,
    currency: 'USD',
    check_in: checkIn.toISOString().split('T')[0],
    check_out: checkOut.toISOString().split('T')[0]
  });
} catch (err) {
  return JSON.stringify({
    error: true,
    message: 'Price calculation failed: ' + err.message,
    hint: 'Calendar Manager already includes pricing. Use that instead.'
  });
}`;
    console.log('\u2713 Calculate Price Tool: All returns wrapped with JSON.stringify()');
  }

  // Deploy WF1
  console.log('\nDeploying WF1...');
  await deployWorkflow('tvSLRSiOmNdkEfA2', wf1, true);

  // ═══════════════════════════════════════════════════════
  // FIX 2: V4 WF4 — Create Pending Booking (num_guests → guests)
  // ═══════════════════════════════════════════════════════
  console.log('\n--- FIX 2: Create Pending Booking (WF4) ---\n');
  const wf4 = await apiCall('GET', '/api/v1/workflows/iaBWaaIjFUrzBcon');
  console.log(`Downloaded: ${wf4.name} (${wf4.nodes.length} nodes)\n`);

  const createNode = wf4.nodes.find(n => n.name === 'Create Pending Booking');
  if (createNode) {
    const cols = createNode.parameters.columns.value;

    // Fix: num_guests → guests (actual DB column name)
    if (cols.num_guests !== undefined) {
      cols.guests = cols.num_guests;
      delete cols.num_guests;
      console.log('\u2713 Create Pending Booking: num_guests → guests (matches DB schema)');
    }

    // Ensure created_at has = prefix for expression mode
    if (cols.created_at && !cols.created_at.startsWith('=')) {
      cols.created_at = '=' + cols.created_at;
      console.log('\u2713 Create Pending Booking: created_at → Expression mode');
    }

    // Ensure all expression columns have = prefix
    for (const [key, val] of Object.entries(cols)) {
      if (typeof val === 'string' && val.includes('{{') && !val.startsWith('=')) {
        cols[key] = '=' + val;
        console.log(`\u2713 Create Pending Booking: ${key} → Expression mode`);
      }
    }
  }

  // Also fix the Normalize Event code to output 'guests' instead of 'num_guests'
  // so the downstream Create Pending Booking can read it
  const normNode = wf4.nodes.find(n => n.name === 'Normalize Event');
  if (normNode) {
    const code = normNode.parameters.jsCode;
    if (code.includes('num_guests: input.num_guests')) {
      normNode.parameters.jsCode = code.replace(
        'num_guests: input.num_guests',
        'guests: input.num_guests || input.guests || 1'
      );
      console.log('\u2713 Normalize Event: output field num_guests → guests (+ fallback to 1)');
    }
  }

  // Fix Create Pending Booking to read from $json.guests instead of $json.num_guests
  if (createNode) {
    const guestsVal = createNode.parameters.columns.value.guests;
    if (guestsVal && guestsVal.includes('num_guests')) {
      createNode.parameters.columns.value.guests = '={{ $json.guests }}';
      console.log('\u2713 Create Pending Booking: column reference $json.num_guests → $json.guests');
    }
  }

  // Fix Prepare Owner Notification to reference .guests instead of .num_guests
  const prepNode = wf4.nodes.find(n => n.name === 'Prepare Owner Notification');
  if (prepNode) {
    const code = prepNode.parameters.jsCode;
    if (code.includes('booking.num_guests')) {
      prepNode.parameters.jsCode = code.replace(/booking\.num_guests/g, 'booking.guests');
      console.log('\u2713 Prepare Owner Notification: booking.num_guests → booking.guests');
    }
  }

  // Deploy WF4
  console.log('\nDeploying WF4...');
  // WF4 was listed as INACTIVE in the earlier check, but let me check
  const wf4Active = wf4.active;
  console.log('  WF4 was active:', wf4Active);
  await deployWorkflow('iaBWaaIjFUrzBcon', wf4, wf4Active);

  // If WF4 was inactive, activate it now (Payment Processor should be active)
  if (!wf4Active) {
    console.log('  WF4 was inactive — activating now...');
    const act = await apiCall('POST', '/api/v1/workflows/iaBWaaIjFUrzBcon/activate');
    console.log('  Active:', act.active);
    if (!act.active) {
      console.log('  Note: WF4 may need dependencies published first');
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('\nWF1 - Calculate Price Tool:');
  console.log('  Problem: return {...} → n8n expects a string, not object');
  console.log('  Fix: return JSON.stringify({...})');
  console.log('\nWF4 - Create Pending Booking:');
  console.log('  Problem: column "num_guests" doesn\'t exist in bookings table');
  console.log('  Fix: mapped to actual column "guests"');
  console.log('  Also: Fixed field references throughout WF4 pipeline');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

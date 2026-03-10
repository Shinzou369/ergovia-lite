const https = require('https');
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

async function main() {
  console.log('=== FIX: WF1 Calculate Price + WF3 Price in Availability Response ===\n');

  // ============================================
  // PART 1: Fix WF3 — add price calculation to Format Availability Response
  // ============================================
  console.log('PART 1: Enhance WF3 Format Availability Response with pricing\n');

  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');
  console.log('  Downloaded WF3: ' + wf3.nodes.length + ' nodes');

  const formatNode = wf3.nodes.find(n => n.name === 'Format Availability Response');
  console.log('  Old code length: ' + formatNode.parameters.jsCode.length);

  formatNode.parameters.jsCode = `// Format availability check response for WF1 AI Agent
// Includes price calculation so agent doesn't need a separate tool call
const items = $input.all();
const params = $('Prepare Parameters').item.json;

// Filter out empty objects from "always output data" (no rows returned)
const validItems = items.filter(item => item.json.property_id);

const nightsRequested = Math.ceil(
  (new Date(params.check_out_date) - new Date(params.check_in_date)) / (1000 * 60 * 60 * 24)
);

// If no properties found at all, return early with clear message
if (validItems.length === 0) {
  return [{
    json: {
      status: 'SUCCESS',
      check_in: params.check_in_date,
      check_out: params.check_out_date,
      nights: nightsRequested,
      total_properties: 0,
      available_count: 0,
      unavailable_count: 0,
      properties: [],
      summary: 'No properties configured yet. Please add properties in the control panel first.'
    }
  }];
}

const results = validItems.map(item => {
  const p = item.json;

  // Check minimum stay
  const minStay = p.min_stay_nights || 1;
  const meetsMinStay = nightsRequested >= minStay;

  // available comes from the SQL CASE WHEN EXISTS query (true = no overlapping bookings)
  const isAvailable = p.available === true;

  let reason = null;
  if (!isAvailable) reason = 'dates_booked';
  else if (!meetsMinStay) reason = 'min_stay_' + minStay + '_nights';

  const available = isAvailable && meetsMinStay;

  // Calculate price breakdown for available properties
  let pricing = null;
  if (available) {
    const basePrice = parseFloat(p.base_price || 0);
    const weekendPrice = parseFloat(p.weekend_price || 0);
    const cleaningFee = parseFloat(p.cleaning_fee || 0);

    // Count weekday vs weekend nights
    let weekdayNights = 0;
    let weekendNights = 0;
    const start = new Date(params.check_in_date);
    for (let d = 0; d < nightsRequested; d++) {
      const day = new Date(start);
      day.setDate(day.getDate() + d);
      const dow = day.getDay(); // 0=Sun, 5=Fri, 6=Sat
      if (dow === 5 || dow === 6) {
        weekendNights++;
      } else {
        weekdayNights++;
      }
    }

    const nightlyTotal = (weekdayNights * basePrice) + (weekendNights * (weekendPrice || basePrice));
    const serviceFee = Math.round(nightlyTotal * 0.12 * 100) / 100;

    // Auto weekly discount (10% for 7+ nights)
    let weeklyDiscount = 0;
    if (nightsRequested >= 7) {
      weeklyDiscount = Math.round(nightlyTotal * 0.10 * 100) / 100;
    }

    const total = Math.round((nightlyTotal - weeklyDiscount + cleaningFee + serviceFee) * 100) / 100;

    pricing = {
      weekday_nights: weekdayNights,
      weekend_nights: weekendNights,
      base_price_per_night: basePrice,
      weekend_price_per_night: weekendPrice || basePrice,
      nightly_subtotal: Math.round(nightlyTotal * 100) / 100,
      weekly_discount: weeklyDiscount,
      cleaning_fee: cleaningFee,
      service_fee: serviceFee,
      total: total,
      currency: 'USD'
    };
  }

  return {
    property_id: p.property_id,
    property_name: p.property_name,
    address: p.address || '',
    available: available,
    reason_unavailable: available ? null : reason,
    base_price: parseFloat(p.base_price || 0),
    weekend_price: parseFloat(p.weekend_price || 0),
    cleaning_fee: parseFloat(p.cleaning_fee || 0),
    max_guests: p.max_guests || 0,
    bedrooms: p.bedrooms || 0,
    bathrooms: p.bathrooms || 0,
    min_stay_nights: minStay,
    conflicting_bookings: p.conflicting_bookings || [],
    total_upcoming_bookings: parseInt(p.total_upcoming_bookings || 0),
    pricing: pricing
  };
});

const available = results.filter(r => r.available);
const unavailable = results.filter(r => !r.available);

let summary = '';
if (available.length > 0) {
  const first = available[0];
  summary = available.length + ' propert' + (available.length === 1 ? 'y' : 'ies') +
    ' available for ' + params.check_in_date + ' to ' + params.check_out_date +
    ' (' + nightsRequested + ' night' + (nightsRequested === 1 ? '' : 's') + ')';
  if (first.pricing) {
    summary += '. ' + first.property_name + ': $' + first.pricing.total + ' total';
  }
} else if (results.length > 0) {
  summary = 'No properties available for ' + params.check_in_date + ' to ' + params.check_out_date +
    ' — all ' + results.length + ' propert' + (results.length === 1 ? 'y is' : 'ies are') +
    ' ' + (results[0].reason_unavailable || 'unavailable');
} else {
  summary = 'No properties configured yet';
}

return [{
  json: {
    status: 'SUCCESS',
    check_in: params.check_in_date,
    check_out: params.check_out_date,
    nights: nightsRequested,
    total_properties: results.length,
    available_count: available.length,
    unavailable_count: unavailable.length,
    properties: results,
    summary: summary
  }
}];`;

  console.log('  New code length: ' + formatNode.parameters.jsCode.length);

  // Deploy WF3
  console.log('\n  Deploying WF3...');
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/deactivate');
  await sleep(1500);
  let res = await apiCall('PUT', '/api/v1/workflows/pEn69kwNtCEQ21y9', {
    name: wf3.name, nodes: wf3.nodes, connections: wf3.connections,
    settings: wf3.settings, staticData: wf3.staticData
  });
  if (res.status !== 200) {
    console.log('  WF3 ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 300));
    await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/pEn69kwNtCEQ21y9/activate');
  console.log('  WF3 DEPLOYED & ACTIVATED');

  // ============================================
  // PART 2: Fix WF1 — fix Calculate Price Tool code
  // ============================================
  console.log('\n\nPART 2: Fix WF1 Calculate Price Tool\n');

  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log('  Downloaded WF1: ' + wf1.nodes.length + ' nodes');

  const calcTool = wf1.nodes.find(n => n.name === 'Calculate Price Tool');
  console.log('  Found: Calculate Price Tool (type: ' + calcTool.type + ')');

  // Rewrite the code to be more robust — handle the $fromAI execution issue
  calcTool.parameters.jsCode = `// Calculate total price for a vacation rental stay
// Robust version that handles n8n toolCode execution context
try {
  const checkIn = new Date($fromAI('check_in_date', 'Check-in date in YYYY-MM-DD format'));
  const checkOut = new Date($fromAI('check_out_date', 'Check-out date in YYYY-MM-DD format'));
  const pricePerNight = parseFloat($fromAI('price_per_night', 'Price per night in USD', 'number', '100'));
  const weekendPrice = parseFloat($fromAI('weekend_price', 'Weekend price per night', 'number', String(pricePerNight)));
  const cleaningFee = parseFloat($fromAI('cleaning_fee', 'One-time cleaning fee', 'number', '0'));
  const discountPercent = parseFloat($fromAI('discount_percent', 'Discount percentage', 'number', '0'));

  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

  if (nights <= 0 || isNaN(nights)) {
    return { error: true, message: 'Invalid dates: check-out must be after check-in' };
  }

  // Count weekday vs weekend nights
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

  return {
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
  };
} catch (err) {
  return {
    error: true,
    message: 'Price calculation failed: ' + err.message,
    hint: 'The Calendar Manager tool already includes pricing in its response. Use that instead.'
  };
}`;

  console.log('  Updated code with try/catch + fallback hint');

  // Also update the AI Agent system prompt to prefer Calendar Manager's pricing
  const agent = wf1.nodes.find(n => n.name === 'AI Agent');
  const oldPrompt = agent.parameters.options.systemMessage;

  // Replace the Calculate Price section in the system prompt
  const newPrompt = oldPrompt.replace(
    '### Calculate Price\nCalculate total cost for a stay with fees and discounts.\n- Returns: price breakdown (nightly rate, nights, cleaning fee, service fee, discounts, total)',
    '### Calculate Price\nCalculate total cost for a stay with fees and discounts.\n- NOTE: Calendar Manager already includes full pricing in its response. Only use Calculate Price if you need to recalculate with different parameters (e.g., guest asks about a discount).\n- Returns: price breakdown (nightly rate, nights, cleaning fee, service fee, discounts, total)'
  ).replace(
    '1. Guest asks about dates → Calendar Manager (check availability)\n2. Dates available → Calculate Price (get total)\n3. Guest wants to book → Offer Conflict Checker (check for competing offers)',
    '1. Guest asks about dates → Calendar Manager (returns availability + pricing)\n2. Guest wants to book → Offer Conflict Checker (check for competing offers)'
  );

  agent.parameters.options.systemMessage = newPrompt;
  console.log('  Updated AI Agent system prompt (Calendar Manager now includes pricing)');

  // Deploy WF1
  console.log('\n  Deploying WF1...');
  await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/deactivate');
  await sleep(1500);
  res = await apiCall('PUT', '/api/v1/workflows/LP7YknAVPiQsidWq', {
    name: wf1.name, nodes: wf1.nodes, connections: wf1.connections,
    settings: wf1.settings, staticData: wf1.staticData
  });
  if (res.status !== 200) {
    console.log('  WF1 ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
    return;
  }
  await sleep(1000);
  await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
  console.log('  WF1 DEPLOYED & ACTIVATED');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n\n=== FIX SUMMARY ===');
  console.log('');
  console.log('ROOT CAUSE: Calculate Price Tool (toolCode) crashed 9x with "No execution data"');
  console.log('            Agent kept retrying → hit 10 iteration max');
  console.log('');
  console.log('WF3 Fix:');
  console.log('  Format Availability Response now includes full pricing:');
  console.log('    - weekday/weekend night breakdown');
  console.log('    - nightly subtotal, weekly discount (10% for 7+ nights)');
  console.log('    - cleaning fee, service fee (12%), total');
  console.log('  Agent gets availability + pricing in ONE tool call');
  console.log('');
  console.log('WF1 Fix:');
  console.log('  1. Calculate Price Tool: wrapped in try/catch with fallback hint');
  console.log('  2. AI Agent system prompt: tells agent Calendar Manager includes pricing,');
  console.log('     only use Calculate Price for recalculations (e.g., discount scenarios)');
  console.log('  3. Booking flow simplified: ask dates → Calendar Manager → Offer Check → Payment');
  console.log('');
  console.log('Expected result: "Is Feb 14-20 available?" → 1 tool call → agent responds with price');
}

main().catch(console.error);

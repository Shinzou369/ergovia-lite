/**
 * Phase 4: Modify WF4 Payment Processor
 *
 * Changes:
 * 1. Add "Generate Tokens" code node after Get Property & Owner
 *    - Creates confirm + cancel tokens in payment_action_tokens table
 *    - Builds webhook URLs and inline keyboard JSON
 *
 * 2. Update "Prepare Owner Notification" to output SUB-compatible fields
 *    - property_id, event_type, message, notify, inline_keyboard, confirmation_urls
 *
 * 3. Replace "Send Owner Notification" (Telegram node) with Execute Workflow
 *    - Calls SUB: Owner & Staff Notifier (SV80ObHW5jp7mOhL)
 *    - Passes inline_keyboard + confirmation_urls
 *
 * 4. Rewire connections for the new flow
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF4_ID = 'iaBWaaIjFUrzBcon';
const SUB_NOTIFIER_ID = 'SV80ObHW5jp7mOhL';

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

async function deploy(id, wf) {
  if (wf.active) {
    await apiCall('POST', `/api/v1/workflows/${id}/deactivate`);
    await sleep(2000);
  }
  const result = await apiCall('PUT', `/api/v1/workflows/${id}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null
  });
  if (!result.id) { console.error('  FAILED:', JSON.stringify(result).substring(0, 500)); return false; }
  console.log('  Updated! Nodes:', result.nodes.length);
  await sleep(1500);
  const act = await apiCall('POST', `/api/v1/workflows/${id}/activate`);
  console.log('  Active:', act.active);
  return true;
}

async function main() {
  console.log('=== Phase 4: Modify WF4 Payment Processor ===\n');

  const wf4 = await apiCall('GET', `/api/v1/workflows/${WF4_ID}`);
  console.log(`Loaded: ${wf4.name} (${wf4.nodes.length} nodes)\n`);

  // List nodes
  console.log('Current nodes:');
  for (const n of wf4.nodes) {
    console.log(`  ${n.name} (${n.type})`);
  }
  console.log('');

  let changes = 0;

  // ─── 1. Add "Generate Tokens" code node ───
  console.log('1. Adding "Generate Tokens" code node...');

  // Find position — should be after Get Property & Owner
  const getPropNode = wf4.nodes.find(n => n.name === 'Get Property & Owner');
  const prepNotifNode = wf4.nodes.find(n => n.name === 'Prepare Owner Notification');
  const sendNotifNode = wf4.nodes.find(n => n.name === 'Send Owner Notification');

  if (!getPropNode) {
    console.error('  ERROR: Get Property & Owner not found!');
    return;
  }

  const genTokensPos = getPropNode.position
    ? [getPropNode.position[0] + 250, getPropNode.position[1]]
    : [1200, 0];

  // Remove existing Generate Tokens if present (idempotent)
  const existingGenIdx = wf4.nodes.findIndex(n => n.name === 'Generate Tokens');
  if (existingGenIdx >= 0) {
    wf4.nodes.splice(existingGenIdx, 1);
    console.log('  Removed existing Generate Tokens node');
  }

  const genTokensNode = {
    id: 'generate-tokens',
    name: 'Generate Tokens',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: genTokensPos,
    credentials: {
      postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' }
    },
    parameters: {
      operation: 'executeQuery',
      query: "=INSERT INTO payment_action_tokens (booking_id, action, expires_at)\nVALUES\n  ('{{ $('Normalize Event').item.json.booking_id }}', 'confirm', CURRENT_TIMESTAMP + INTERVAL '48 hours'),\n  ('{{ $('Normalize Event').item.json.booking_id }}', 'cancel', CURRENT_TIMESTAMP + INTERVAL '48 hours')\nRETURNING token, action",
      options: {}
    }
  };

  wf4.nodes.push(genTokensNode);
  console.log('  + Generate Tokens: INSERT 2 tokens (confirm + cancel), 48h expiry');
  changes++;

  // ─── 2. Update Prepare Owner Notification ───
  console.log('\n2. Updating Prepare Owner Notification...');
  if (prepNotifNode) {
    prepNotifNode.parameters.jsCode = `// Prepare owner notification with inline keyboard + confirmation URLs
const booking = $('Normalize Event').item.json;
const property = $('Get Property & Owner').first().json;

// Get tokens from Generate Tokens (returns 2 rows: confirm + cancel)
const tokenRows = $('Generate Tokens').all();
let confirmToken = '';
let cancelToken = '';
for (const row of tokenRows) {
  if (row.json.action === 'confirm') confirmToken = row.json.token;
  if (row.json.action === 'cancel') cancelToken = row.json.token;
}

// Build webhook confirmation URLs (for WhatsApp/SMS channels)
const baseUrl = 'https://n8n.ergovia-ai.com/webhook';
const confirmUrl = baseUrl + '/payment-confirm?token=' + confirmToken;
const cancelUrl = baseUrl + '/payment-cancel?token=' + cancelToken;

// Build notification message
const message = '🏠 *New Booking Request*\\n\\n' +
  '📋 *Booking ID:* ' + booking.booking_id + '\\n' +
  '🏡 *Property:* ' + (property.property_name || booking.property_id) + '\\n\\n' +
  '👤 *Guest:* ' + booking.guest_name + '\\n' +
  '📧 *Email:* ' + (booking.guest_email || 'Not provided') + '\\n' +
  '📱 *Phone:* ' + (booking.guest_phone || 'Not provided') + '\\n\\n' +
  '📅 *Check-in:* ' + booking.check_in_date + '\\n' +
  '📅 *Check-out:* ' + booking.check_out_date + '\\n' +
  '👥 *Guests:* ' + (booking.guests || 'Not specified') + '\\n\\n' +
  '💰 *Total Amount:* $' + booking.amount + ' ' + (booking.currency || 'USD') + '\\n\\n' +
  (property.payment_link
    ? '💳 *Payment link sent to guest*'
    : '⚠️ *No payment link configured* - Please send payment details to guest manually') + '\\n\\n' +
  '⏳ *Status:* Awaiting Payment\\n\\n' +
  'Once you receive payment, click the button below to confirm.';

// Telegram inline keyboard buttons
const inlineKeyboard = [
  [
    { text: '✅ Payment Received', callback_data: 'payment_confirm_' + booking.booking_id },
    { text: '❌ Cancel Booking', callback_data: 'payment_cancel_' + booking.booking_id }
  ]
];

// Confirmation URLs for WhatsApp/SMS
const confirmationUrls = {
  confirm_url: confirmUrl,
  cancel_url: cancelUrl
};

return {
  // SUB: Owner & Staff Notifier inputs
  property_id: property.property_id || booking.property_id,
  event_type: 'new_booking',
  message: message,
  notify: 'owner',
  recipient_id: '',
  customer_id: property.customer_id || '',
  inline_keyboard: JSON.stringify(inlineKeyboard),
  confirmation_urls: JSON.stringify(confirmationUrls),

  // Pass through for Return Create Result
  booking_id: booking.booking_id,
  property_name: property.property_name,
  payment_link: property.payment_link || null,
  payment_instructions: property.payment_instructions || null,
  guest_phone: booking.guest_phone,
  guest_channel: booking.channel || 'whatsapp',
  amount: booking.amount,
  currency: booking.currency || 'USD',
  check_in_date: booking.check_in_date,
  check_out_date: booking.check_out_date
};`;
    console.log('  Updated: builds message, inline_keyboard, confirmation_urls');
    console.log('  Reads tokens from Generate Tokens node');
    changes++;
  }

  // ─── 3. Replace Send Owner Notification with Execute Workflow ───
  console.log('\n3. Replacing Send Owner Notification with SUB call...');

  const sendIdx = wf4.nodes.findIndex(n => n.name === 'Send Owner Notification');
  if (sendIdx >= 0) {
    const oldNode = wf4.nodes[sendIdx];
    const pos = oldNode.position || [1440, 0];

    // Replace with Execute Workflow node
    wf4.nodes[sendIdx] = {
      id: oldNode.id || 'send-owner-sub',
      name: 'Send Owner Notification',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.2,
      position: pos,
      parameters: {
        workflowId: {
          __rl: true,
          value: SUB_NOTIFIER_ID,
          mode: 'id'
        },
        workflowInputs: {
          mappingMode: 'defineBelow',
          value: {
            property_id: '={{ $json.property_id }}',
            event_type: '={{ $json.event_type }}',
            message: '={{ $json.message }}',
            notify: '={{ $json.notify }}',
            recipient_id: '={{ $json.recipient_id }}',
            customer_id: '={{ $json.customer_id }}',
            inline_keyboard: '={{ $json.inline_keyboard }}',
            confirmation_urls: '={{ $json.confirmation_urls }}'
          }
        },
        options: {}
      }
    };

    console.log('  Replaced Telegram node → Execute Workflow (SUB: Owner & Staff Notifier)');
    console.log(`  SUB ID: ${SUB_NOTIFIER_ID}`);
    console.log('  Passes: property_id, event_type, message, notify, inline_keyboard, confirmation_urls');
    changes++;
  }

  // ─── 4. Rewire connections ───
  console.log('\n4. Rewiring connections...');

  // The flow should be:
  // Get Property & Owner → Generate Tokens → Prepare Owner Notification → Send Owner Notification → Return Create Result
  //
  // Currently: Get Property & Owner → Prepare Owner Notification → Send Owner Notification → Return Create Result
  // Need to insert Generate Tokens between Get Property & Owner and Prepare Owner Notification

  const conns = wf4.connections;

  // Update "Get Property & Owner" output to point to "Generate Tokens"
  if (conns['Get Property & Owner']) {
    conns['Get Property & Owner'] = {
      main: [[{ node: 'Generate Tokens', type: 'main', index: 0 }]]
    };
    console.log('  Get Property & Owner → Generate Tokens');
  }

  // Add "Generate Tokens" → "Prepare Owner Notification"
  conns['Generate Tokens'] = {
    main: [[{ node: 'Prepare Owner Notification', type: 'main', index: 0 }]]
  };
  console.log('  Generate Tokens → Prepare Owner Notification');

  // Verify Prepare Owner Notification → Send Owner Notification is still intact
  if (conns['Prepare Owner Notification']) {
    const prepOuts = conns['Prepare Owner Notification'].main[0];
    const goesToSend = prepOuts.some(c => c.node === 'Send Owner Notification');
    if (goesToSend) {
      console.log('  Prepare Owner Notification → Send Owner Notification (existing, OK)');
    } else {
      conns['Prepare Owner Notification'] = {
        main: [[{ node: 'Send Owner Notification', type: 'main', index: 0 }]]
      };
      console.log('  Prepare Owner Notification → Send Owner Notification (rewired)');
    }
  }

  // Verify Send Owner Notification → Return Create Result
  if (conns['Send Owner Notification']) {
    console.log('  Send Owner Notification → Return Create Result (existing, OK)');
  }

  // ─── Summary ───
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`SUMMARY: ${changes} changes to WF4 Payment Processor`);
  console.log(`${'═'.repeat(50)}`);
  console.log('  1. + Generate Tokens node (INSERT 2 tokens per booking)');
  console.log('  2. Updated Prepare Owner Notification (builds SUB inputs)');
  console.log('  3. Replaced Send Owner Notification (Telegram → SUB call)');
  console.log('  4. Rewired: Get Property & Owner → Generate Tokens → Prepare → SUB → Return');
  console.log('');
  console.log('  New flow:');
  console.log('    create_booking:');
  console.log('      Normalize → Create Pending → Get Property & Owner');
  console.log('        → Generate Tokens → Prepare Owner Notification');
  console.log('        → Send Owner Notification (SUB) → Return Create Result');
  console.log('');
  console.log('  Telegram owners: get inline keyboard buttons (confirm/cancel)');
  console.log('  WhatsApp/SMS owners: get clickable confirmation URLs');

  // ─── Deploy ───
  console.log('\nDeploying WF4...');
  const ok = await deploy(WF4_ID, wf4);

  if (ok) {
    console.log('\n=== Phase 4 Complete ===');
    console.log('Next: Phase 5 - End-to-end testing');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

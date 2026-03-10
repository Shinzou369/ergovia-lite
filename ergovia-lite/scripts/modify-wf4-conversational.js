/**
 * modify-wf4-conversational.js
 *
 * Modifies [LIVE] WF4: Payment Processor to:
 *
 *  CHANGE 1: Replace inline keyboard owner notification with conversational text.
 *            Owner is told to reply "payment received for {booking_id}" or
 *            "cancel booking {booking_id}" instead of tapping buttons.
 *
 *  CHANGE 2: Insert a new PostgreSQL node AFTER "Get Property & Owner" to create
 *            a row in payment_tasks for Control Panel visibility.
 *
 * Run: node scripts/modify-wf4-conversational.js
 */

require('dotenv').config();
const http = require('http');

const N8N_BASE = 'http://116.203.115.12:5678/api/v1';
const WF4_ID = 'UZyrXbwQRO5tTBvf';
const PG_CRED = { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' };

function apiReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + '/' + endpoint);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': process.env.N8N_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function main() {
  console.log('=== Modify WF4: Conversational Payment Notification ===\n');

  // 1. Fetch WF4
  const res = await apiReq('GET', `workflows/${WF4_ID}`);
  if (res.status !== 200) {
    console.error('Failed to fetch WF4:', res.status, JSON.stringify(res.body));
    process.exit(1);
  }
  const wf = res.body;
  let nodes = wf.nodes || [];
  let connections = wf.connections || {};

  // ─── CHANGE 1: Replace inline keyboard in "Prepare Owner Notification" ──────

  console.log('CHANGE 1: Replacing inline keyboard with conversational message...');
  nodes = nodes.map(n => {
    if (n.name !== 'Prepare Owner Notification') return n;

    const newCode = `// Prepare conversational owner notification (no inline buttons)
const booking = $('Normalize Event').item.json;
const property = $('Get Property & Owner').first().json;

const bookingId = booking.booking_id;
const guestName = booking.guest_name;
const checkIn  = booking.check_in_date;
const checkOut = booking.check_out_date;
const amount   = booking.amount || 0;
const currency = booking.currency || 'USD';
const propName = property.property_name || booking.property_id;

// Conversational message — owner replies with text commands
const message =
  '🏠 *New Payment Pending*\\n\\n' +
  '📋 Booking: ' + bookingId + '\\n' +
  '🏡 Property: ' + propName + '\\n' +
  '👤 Guest: ' + guestName + '\\n' +
  '📅 ' + checkIn + ' → ' + checkOut + '\\n' +
  '💰 Amount: $' + amount + ' ' + currency + '\\n\\n' +
  'Payment details have been sent to the guest.\\n\\n' +
  '⏳ When you receive the payment, please reply:\\n' +
  '"payment received for ' + bookingId + '"\\n\\n' +
  'To cancel, reply:\\n' +
  '"cancel booking ' + bookingId + '"';

return {
  // SUB: Owner & Staff Notifier inputs
  property_id: property.property_id || booking.property_id,
  event_type: 'new_booking',
  message: message,
  notify: 'owner',
  recipient_id: '',
  customer_id: property.customer_id || '',
  inline_keyboard: '',          // no buttons
  confirmation_urls: '{}',

  // Pass through for downstream nodes
  booking_id: bookingId,
  property_name: propName,
  payment_link: property.payment_link || null,
  payment_instructions: property.payment_instructions || null,
  guest_phone: booking.guest_phone,
  guest_channel: booking.channel || 'telegram',
  amount: amount,
  currency: currency,
  check_in_date: checkIn,
  check_out_date: checkOut,
  guest_name: guestName,
  customer_id: property.customer_id || '',
  property_id: property.property_id || booking.property_id,
};`;

    return {
      ...n,
      parameters: { ...n.parameters, jsCode: newCode },
    };
  });
  console.log('  Done.');

  // ─── CHANGE 2: Insert "Create Payment Task" Postgres node ────────────────────

  console.log('\nCHANGE 2: Adding "Create Payment Task" node...');

  // Check if node already exists
  const existing = nodes.find(n => n.name === 'Create Payment Task');
  if (existing) {
    console.log('  Node already exists — skipping insert.');
  } else {
    // Find "Get Property & Owner" to position relative to it
    const refNode = nodes.find(n => n.name === 'Get Property & Owner');
    const prepNode = nodes.find(n => n.name === 'Prepare Owner Notification');

    if (!refNode) {
      console.error('  "Get Property & Owner" node not found — skipping.');
    } else {
      const newNode = {
        id: 'payment-task-insert-node',
        name: 'Create Payment Task',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [
          (refNode.position[0] + (prepNode ? prepNode.position[0] : refNode.position[0] + 240)) / 2,
          refNode.position[1] + 80,
        ],
        parameters: {
          operation: 'executeQuery',
          query: `INSERT INTO payment_tasks (
  booking_id, customer_id, property_id, guest_name,
  amount, currency, check_in_date, check_out_date, status
) VALUES (
  '{{ $json.booking_id }}',
  '{{ $json.customer_id }}',
  '{{ $json.property_id }}',
  '{{ $json.guest_name }}',
  {{ $json.amount }},
  '{{ $json.currency }}',
  '{{ $json.check_in_date }}',
  '{{ $json.check_out_date }}',
  'pending'
) ON CONFLICT DO NOTHING
RETURNING id`,
          options: {},
        },
        credentials: { postgres: PG_CRED },
      };

      nodes.push(newNode);
      console.log('  Node added at position:', newNode.position);

      // Wire: Prepare Owner Notification → Create Payment Task (parallel, not blocking)
      // The payment task insert runs AFTER Prepare Owner Notification
      // We keep the existing connection Prepare → Send Owner Notification intact
      // and add Prepare → Create Payment Task as an additional output
      if (prepNode) {
        const prepConns = connections[prepNode.name] || {};
        const mainOutputs = (prepConns.main || [[]]);
        // Add Create Payment Task as second branch from Prepare Owner Notification
        if (mainOutputs.length < 2) {
          mainOutputs.push([{ node: 'Create Payment Task', type: 'main', index: 0 }]);
        } else {
          mainOutputs[1] = [{ node: 'Create Payment Task', type: 'main', index: 0 }];
        }
        connections[prepNode.name] = { ...prepConns, main: mainOutputs };
        console.log('  Wired: Prepare Owner Notification → Create Payment Task (branch 2)');
      }
    }
  }

  // ─── Push updated workflow ────────────────────────────────────────────────────

  const putPayload = {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null,
  };

  const putRes = await apiReq('PUT', `workflows/${WF4_ID}`, putPayload);
  if (putRes.status !== 200) {
    console.error('\nERROR pushing workflow. Status:', putRes.status);
    console.error(JSON.stringify(putRes.body, null, 2));
    process.exit(1);
  }

  console.log('\n=== Done ===');
  console.log('\nChanges applied to WF4:');
  console.log('  1. Owner notification is now conversational (no inline buttons)');
  console.log('  2. Each new booking creates a payment_tasks row for Control Panel');
  console.log('\nNext step: run "node scripts/create-payment-handler.js" to deploy the');
  console.log('Telegram handler that processes "payment received for BK123" replies.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

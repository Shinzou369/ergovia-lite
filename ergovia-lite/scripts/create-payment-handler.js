/**
 * create-payment-handler.js
 *
 * Creates a new n8n workflow: "[LIVE] Payment Telegram Handler"
 *
 * This workflow intercepts owner Telegram text messages and handles:
 *   "payment received for BK123" → double-tap CONFIRM flow
 *   "cancel booking BK123"       → double-tap DECLINE flow
 *   "CONFIRM BK123"              → executes booking confirmation
 *   "DECLINE BK123"              → executes booking cancellation
 *
 * The double-tap prevents accidental confirmations.
 *
 * IMPORTANT: This workflow shares the Telegram trigger with WF1.
 * In n8n, only ONE workflow can hold the Telegram webhook trigger at a time.
 * Solution: WF1 uses a Telegram Trigger node. This workflow needs to be called
 * FROM WF1 as a sub-workflow (executeWorkflow) when WF1 detects a payment command.
 *
 * Alternatively, deploy as a standalone workflow if you use a SECOND bot token.
 *
 * This script creates the workflow for use as a sub-workflow called by WF1.
 *
 * Run: node scripts/create-payment-handler.js
 */

require('dotenv').config();
const http = require('http');

const N8N_BASE = 'http://116.203.115.12:5678/api/v1';
const CREDS = {
  postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' },
  openAi:   { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
  telegram: { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' },
};
const WF_NAME = '[LIVE] SUB: Payment Telegram Handler';

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

// The workflow definition
const workflow = {
  name: WF_NAME,
  active: true,
  nodes: [
    // ── Trigger: called from WF1 as sub-workflow ─────────────────────────────
    {
      id: 'trigger',
      name: 'When Called by Other Workflow',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1,
      position: [0, 300],
      parameters: {},
    },

    // ── Parse the incoming message ────────────────────────────────────────────
    {
      id: 'parse-msg',
      name: 'Parse Message Intent',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 300],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `// Parse incoming Telegram message for payment commands
const item = $input.first().json;

// Support two input formats:
// 1. Direct: { text, chat_id, from_username }
// 2. From WF1 normalized: { message_text, chat_id, sender_id }
const text = (item.text || item.message_text || '').trim();
const chatId = item.chat_id || item.sender_id || '';
const fromUser = item.from_username || item.sender_name || 'owner';

// Pattern: "payment received for BK123"
const confirmMatch = text.match(/payment\\s+received\\s+for\\s+([A-Za-z0-9_-]+)/i);
// Pattern: "cancel booking BK123"
const cancelMatch = text.match(/cancel\\s+booking\\s+([A-Za-z0-9_-]+)/i);
// Pattern: "CONFIRM BK123" (second tap)
const doConfirmMatch = text.match(/^CONFIRM\\s+([A-Za-z0-9_-]+)$/i);
// Pattern: "DECLINE BK123" (second tap)
const doDeclineMatch = text.match(/^DECLINE\\s+([A-Za-z0-9_-]+)$/i);

let intent = 'unknown';
let bookingId = null;

if (doConfirmMatch) { intent = 'do_confirm'; bookingId = doConfirmMatch[1].toUpperCase(); }
else if (doDeclineMatch) { intent = 'do_decline'; bookingId = doDeclineMatch[1].toUpperCase(); }
else if (confirmMatch) { intent = 'ask_confirm'; bookingId = confirmMatch[1].toUpperCase(); }
else if (cancelMatch) { intent = 'ask_cancel'; bookingId = cancelMatch[1].toUpperCase(); }

return [{ json: { intent, booking_id: bookingId, chat_id: chatId, from_user: fromUser, original_text: text } }];`,
      },
    },

    // ── Route by intent ───────────────────────────────────────────────────────
    {
      id: 'route-intent',
      name: 'Route by Intent',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3,
      position: [440, 300],
      parameters: {
        mode: 'rules',
        rules: {
          values: [
            { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.intent }}', operator: { type: 'string', operation: 'equals' }, rightValue: 'ask_confirm' }] } },
            { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.intent }}', operator: { type: 'string', operation: 'equals' }, rightValue: 'ask_cancel' }] } },
            { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.intent }}', operator: { type: 'string', operation: 'equals' }, rightValue: 'do_confirm' }] } },
            { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.intent }}', operator: { type: 'string', operation: 'equals' }, rightValue: 'do_decline' }] } },
          ],
        },
        fallbackOutput: 'none',
      },
    },

    // ── Branch 0: ask_confirm — look up booking, send first-tap reminder ─────
    {
      id: 'lookup-for-confirm',
      name: 'Lookup Booking (Confirm)',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.5,
      position: [660, 80],
      parameters: {
        operation: 'executeQuery',
        query: `SELECT pt.booking_id, pt.guest_name, pt.amount, pt.currency,
  pt.check_in_date, pt.check_out_date, pt.id AS task_id
FROM payment_tasks pt
WHERE pt.booking_id = '{{ $json.booking_id }}' AND pt.status = 'pending'
LIMIT 1`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },

    {
      id: 'send-confirm-reminder',
      name: 'Send Confirm Reminder',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [880, 80],
      parameters: {
        chatId: '={{ $("Route by Intent").item.json.chat_id }}',
        text: '=⚠️ *Confirmation Required*\n\nYou are about to confirm payment for:\n📋 Booking: {{ $json.booking_id }}\n👤 Guest: {{ $json.guest_name }}\n💰 Amount: \${{ $json.amount }} {{ $json.currency }}\n\n⚠️ *Reminder*: The system will now assume you have received the customer\'s payment.\n\nIf you have received the payment, please reply:\n"CONFIRM {{ $json.booking_id }}"\n\nTo go back, reply anything else.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },

    // ── Branch 1: ask_cancel — look up booking, send first-tap warning ────────
    {
      id: 'lookup-for-cancel',
      name: 'Lookup Booking (Cancel)',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.5,
      position: [660, 260],
      parameters: {
        operation: 'executeQuery',
        query: `SELECT pt.booking_id, pt.guest_name, pt.id AS task_id
FROM payment_tasks pt
WHERE pt.booking_id = '{{ $json.booking_id }}' AND pt.status = 'pending'
LIMIT 1`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },

    {
      id: 'send-cancel-warning',
      name: 'Send Cancel Warning',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [880, 260],
      parameters: {
        chatId: '={{ $("Route by Intent").item.json.chat_id }}',
        text: '=⚠️ *Warning*\n\nYou are about to DECLINE this booking:\n📋 Booking: {{ $json.booking_id }}\n👤 Guest: {{ $json.guest_name }}\n\n⚠️ The system will recognize that you or the client has decided to not proceed. The system will no longer pursue this client.\n\nIf you want to proceed with cancellation, reply:\n"DECLINE {{ $json.booking_id }}"\n\nTo go back, reply anything else.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },

    // ── Branch 2: do_confirm — execute booking confirmation ──────────────────
    {
      id: 'execute-confirm',
      name: 'Execute Confirmation',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.5,
      position: [660, 440],
      parameters: {
        operation: 'executeQuery',
        query: `UPDATE payment_tasks SET status = 'confirmed', decision_channel = 'telegram',
  decided_by = '{{ $json.from_user }}', decided_at = NOW(), updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}' AND status = 'pending'
RETURNING booking_id, guest_name, amount, currency;`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },

    {
      id: 'confirm-booking-db',
      name: 'Confirm Booking in DB',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.5,
      position: [880, 440],
      parameters: {
        operation: 'executeQuery',
        query: `UPDATE bookings SET booking_status = 'confirmed', payment_status = 'paid',
  updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}'`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },

    {
      id: 'send-confirmed-msg',
      name: 'Send Confirmed Message',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [1100, 440],
      parameters: {
        chatId: '={{ $("Route by Intent").item.json.chat_id }}',
        text: '=✅ *Payment Confirmed*\n\nBooking {{ $json.booking_id }} for {{ $json.guest_name }} has been confirmed.\nA confirmation has been sent to the guest.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },

    // ── Branch 3: do_decline — execute booking cancellation ─────────────────
    {
      id: 'execute-decline',
      name: 'Execute Decline',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.5,
      position: [660, 620],
      parameters: {
        operation: 'executeQuery',
        query: `UPDATE payment_tasks SET status = 'declined', decision_channel = 'telegram',
  decided_by = '{{ $json.from_user }}', decided_at = NOW(), updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}' AND status = 'pending'
RETURNING booking_id, guest_name;`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },

    {
      id: 'cancel-booking-db',
      name: 'Cancel Booking in DB',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.5,
      position: [880, 620],
      parameters: {
        operation: 'executeQuery',
        query: `UPDATE bookings SET booking_status = 'cancelled', payment_status = 'cancelled',
  updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}'`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },

    {
      id: 'send-declined-msg',
      name: 'Send Declined Message',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [1100, 620],
      parameters: {
        chatId: '={{ $("Route by Intent").item.json.chat_id }}',
        text: '=❌ *Booking Cancelled*\n\nBooking {{ $json.booking_id }} for {{ $json.guest_name }} has been cancelled.\nThe guest will be notified.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },
  ],

  connections: {
    'When Called by Other Workflow': {
      main: [[{ node: 'Parse Message Intent', type: 'main', index: 0 }]],
    },
    'Parse Message Intent': {
      main: [[{ node: 'Route by Intent', type: 'main', index: 0 }]],
    },
    'Route by Intent': {
      main: [
        [{ node: 'Lookup Booking (Confirm)', type: 'main', index: 0 }],   // branch 0: ask_confirm
        [{ node: 'Lookup Booking (Cancel)', type: 'main', index: 0 }],    // branch 1: ask_cancel
        [{ node: 'Execute Confirmation', type: 'main', index: 0 }],       // branch 2: do_confirm
        [{ node: 'Execute Decline', type: 'main', index: 0 }],            // branch 3: do_decline
      ],
    },
    'Lookup Booking (Confirm)': {
      main: [[{ node: 'Send Confirm Reminder', type: 'main', index: 0 }]],
    },
    'Lookup Booking (Cancel)': {
      main: [[{ node: 'Send Cancel Warning', type: 'main', index: 0 }]],
    },
    'Execute Confirmation': {
      main: [[{ node: 'Confirm Booking in DB', type: 'main', index: 0 }]],
    },
    'Confirm Booking in DB': {
      main: [[{ node: 'Send Confirmed Message', type: 'main', index: 0 }]],
    },
    'Execute Decline': {
      main: [[{ node: 'Cancel Booking in DB', type: 'main', index: 0 }]],
    },
    'Cancel Booking in DB': {
      main: [[{ node: 'Send Declined Message', type: 'main', index: 0 }]],
    },
  },
};

async function main() {
  console.log('=== Create Payment Telegram Handler ===\n');

  // Check if it already exists
  const list = await apiReq('GET', 'workflows?limit=200');
  const existing = (list.body.data || []).find(w => w.name === WF_NAME);

  let wfId;
  if (existing) {
    console.log(`Workflow "${WF_NAME}" already exists (ID: ${existing.id}) — updating...`);
    const putRes = await apiReq('PUT', `workflows/${existing.id}`, {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: {},
      staticData: null,
    });
    if (putRes.status !== 200) {
      console.error('Failed to update:', putRes.status, JSON.stringify(putRes.body));
      process.exit(1);
    }
    wfId = existing.id;
    console.log('Updated successfully.');
  } else {
    console.log(`Creating "${WF_NAME}"...`);
    const createRes = await apiReq('POST', 'workflows', {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: {},
      staticData: null,
    });
    if (createRes.status !== 200 && createRes.status !== 201) {
      console.error('Failed to create:', createRes.status, JSON.stringify(createRes.body));
      process.exit(1);
    }
    wfId = createRes.body.id;
    console.log(`Created with ID: ${wfId}`);
  }

  console.log('\n=== Done ===');
  console.log('\nWorkflow ID:', wfId);
  console.log('\nThis workflow is a SUB-workflow called from WF1.');
  console.log('You need to add a payment command detector to WF1 that calls this');
  console.log('workflow when the owner sends: "payment received for ..." or "cancel booking ..."');
  console.log('\nWF1 integration: In WF1 "Normalize Event" code, detect payment commands');
  console.log('and route to an executeWorkflow node that calls this workflow ID:', wfId);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

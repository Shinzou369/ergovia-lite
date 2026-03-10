/**
 * patch-payment-commands.js
 *
 * Patches WF4 and WF1 so payment text commands flow through WF4 directly,
 * no standalone sub-workflow needed.
 *
 * WF4 changes:
 *   1. Fix Normalize Event — event_type was hardcoded 'create_booking', now passes through
 *   2. Add 4 new branches to Route by Event:
 *      ask_confirm → Lookup task → Telegram reminder to owner
 *      ask_cancel  → Lookup task → Telegram warning to owner
 *      do_confirm  → Update bookings + payment_tasks → Telegram reply to owner
 *      do_decline  → Update bookings + payment_tasks → Telegram reply to owner
 *
 * WF1 changes:
 *   3. Insert before Get Customer ID:
 *      Is Payment Command? (IF) → TRUE: Build Payment Event (Code) → Call WF4 Direct (executeWorkflow)
 *                                → FALSE: Get Customer ID (existing, unchanged)
 *
 * Also deletes the standalone [LIVE] SUB: Payment Telegram Handler if it exists.
 *
 * Run: node scripts/patch-payment-commands.js
 */

require('dotenv').config();
const http = require('http');

const N8N = 'http://116.203.115.12:5678/api/v1';
const KEY = process.env.N8N_API_KEY;
const WF4_ID = 'UZyrXbwQRO5tTBvf';
const WF1_ID = 'LMkR7as0CSGDtjbE';
const SUB_WF_NAME = '[LIVE] SUB: Payment Telegram Handler';
const CREDS = {
  postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' },
  telegram: { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' },
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function apiReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N + '/' + path);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port || 80,
      path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json',
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Patch Payment Commands into WF4 + WF1 ===\n');

  const [wf4Res, wf1Res, listRes] = await Promise.all([
    apiReq('GET', 'workflows/' + WF4_ID),
    apiReq('GET', 'workflows/' + WF1_ID),
    apiReq('GET', 'workflows?limit=200'),
  ]);

  if (wf4Res.status !== 200) { console.error('Failed to fetch WF4:', wf4Res.status); process.exit(1); }
  if (wf1Res.status !== 200) { console.error('Failed to fetch WF1:', wf1Res.status); process.exit(1); }

  const wf4 = wf4Res.body;
  const wf1 = wf1Res.body;

  // ═══════════════════════════════════════════════════════════════════════
  //  PATCH WF4
  // ═══════════════════════════════════════════════════════════════════════

  console.log('--- Patching WF4 ---');
  let wf4Nodes = [...wf4.nodes];
  let wf4Conn  = JSON.parse(JSON.stringify(wf4.connections));

  // ── Fix 1: Normalize Event — pass through event_type instead of hardcoding ──
  console.log('Fix 1: Normalize Event — pass event_type through');
  wf4Nodes = wf4Nodes.map(n => {
    if (n.name !== 'Normalize Event') return n;
    const fixed = n.parameters.jsCode.replace(
      "event_type: 'create_booking',",
      "event_type: input.event_type || 'create_booking',"
    );
    return { ...n, parameters: { ...n.parameters, jsCode: fixed } };
  });

  // ── Fix 2: Route by Event — add 4 new branches ────────────────────────────
  console.log('Fix 2: Route by Event — add ask_confirm, ask_cancel, do_confirm, do_decline');
  wf4Nodes = wf4Nodes.map(n => {
    if (n.name !== 'Route by Event') return n;
    const existing = n.parameters.rules.values;
    const newRules = [
      {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{ leftValue: '={{ $json.event_type }}', rightValue: 'ask_confirm', operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        renameOutput: true, outputKey: 'ask_confirm',
      },
      {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{ leftValue: '={{ $json.event_type }}', rightValue: 'ask_cancel', operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        renameOutput: true, outputKey: 'ask_cancel',
      },
      {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{ leftValue: '={{ $json.event_type }}', rightValue: 'do_confirm', operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        renameOutput: true, outputKey: 'do_confirm',
      },
      {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{ leftValue: '={{ $json.event_type }}', rightValue: 'do_decline', operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        renameOutput: true, outputKey: 'do_decline',
      },
    ];
    return {
      ...n,
      parameters: { ...n.parameters, rules: { values: [...existing, ...newRules] } },
    };
  });

  // ── Fix 3: Add 8 new nodes for the 4 branches ─────────────────────────────
  console.log('Fix 3: Adding Lookup + Telegram nodes for each new branch');

  // Positions: stacked below existing Cancel Booking row (y=592)
  const newNodes = [
    // ask_confirm: Lookup task → send reminder
    {
      id: 'lookup-ask-confirm', name: 'Lookup For Confirm',
      type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [672, 800],
      parameters: {
        operation: 'executeQuery',
        query: "SELECT booking_id, guest_name, amount, currency FROM payment_tasks WHERE booking_id = '{{ $json.booking_id }}' AND status = 'pending' LIMIT 1",
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },
    {
      id: 'reply-ask-confirm', name: 'Reply Ask Confirm',
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [896, 800],
      parameters: {
        chatId: '={{ $("Normalize Event").item.json.owner_chat_id }}',
        text: '=\u26a0\ufe0f *Confirmation Required*\n\nYou are about to confirm payment for:\n\ud83d\udccb Booking: {{ $json.booking_id }}\n\ud83d\udc64 Guest: {{ $json.guest_name }}\n\ud83d\udcb0 Amount: ${{ $json.amount }} {{ $json.currency }}\n\n\u26a0\ufe0f *Reminder*: The system will now assume you have received the customer\'s payment.\n\nIf you have received the payment, please reply:\n"CONFIRM {{ $json.booking_id }}"\n\nTo go back, reply anything else.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },

    // ask_cancel: Lookup task → send warning
    {
      id: 'lookup-ask-cancel', name: 'Lookup For Cancel',
      type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [672, 1000],
      parameters: {
        operation: 'executeQuery',
        query: "SELECT booking_id, guest_name FROM payment_tasks WHERE booking_id = '{{ $json.booking_id }}' AND status = 'pending' LIMIT 1",
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },
    {
      id: 'reply-ask-cancel', name: 'Reply Ask Cancel',
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [896, 1000],
      parameters: {
        chatId: '={{ $("Normalize Event").item.json.owner_chat_id }}',
        text: '=\u26a0\ufe0f *Warning*\n\nYou are about to DECLINE this booking:\n\ud83d\udccb Booking: {{ $json.booking_id }}\n\ud83d\udc64 Guest: {{ $json.guest_name }}\n\n\u26a0\ufe0f The system will recognize that you or the client has decided to not proceed. The system will no longer pursue this client.\n\nIf you want to proceed with cancellation, reply:\n"DECLINE {{ $json.booking_id }}"\n\nTo go back, reply anything else.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },

    // do_confirm: DB update → Telegram reply to owner
    {
      id: 'db-do-confirm', name: 'DB Confirm Payment',
      type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [672, 1200],
      parameters: {
        operation: 'executeQuery',
        query: `UPDATE payment_tasks SET status = 'confirmed', decision_channel = 'telegram',
  decided_by = '{{ $json.sender_name }}', decided_at = NOW(), updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}' AND status = 'pending';
UPDATE bookings SET booking_status = 'confirmed', payment_status = 'paid', updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}';
SELECT '{{ $json.booking_id }}' AS booking_id`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },
    {
      id: 'reply-do-confirm', name: 'Reply Do Confirm',
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [896, 1200],
      parameters: {
        chatId: '={{ $("Normalize Event").item.json.owner_chat_id }}',
        text: '=\u2705 *Payment Confirmed*\n\nBooking {{ $("Normalize Event").item.json.booking_id }} has been confirmed and marked as paid.\nThe booking is now active.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },

    // do_decline: DB update → Telegram reply to owner
    {
      id: 'db-do-decline', name: 'DB Decline Payment',
      type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [672, 1400],
      parameters: {
        operation: 'executeQuery',
        query: `UPDATE payment_tasks SET status = 'declined', decision_channel = 'telegram',
  decided_by = '{{ $json.sender_name }}', decided_at = NOW(), updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}' AND status = 'pending';
UPDATE bookings SET booking_status = 'cancelled', payment_status = 'cancelled', updated_at = NOW()
WHERE booking_id = '{{ $json.booking_id }}';
SELECT '{{ $json.booking_id }}' AS booking_id`,
        options: {},
      },
      credentials: { postgres: CREDS.postgres },
    },
    {
      id: 'reply-do-decline', name: 'Reply Do Decline',
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [896, 1400],
      parameters: {
        chatId: '={{ $("Normalize Event").item.json.owner_chat_id }}',
        text: '=\u274c *Booking Cancelled*\n\nBooking {{ $("Normalize Event").item.json.booking_id }} has been cancelled.',
        additionalFields: { parse_mode: 'Markdown' },
      },
      credentials: { telegramApi: CREDS.telegram },
    },
  ];

  // Add new nodes (skip if already present by name)
  const existingNames = new Set(wf4Nodes.map(n => n.name));
  for (const node of newNodes) {
    if (!existingNames.has(node.name)) wf4Nodes.push(node);
  }

  // ── Fix 4: Wire the new branches into connections ──────────────────────────
  const routeMain = wf4Conn['Route by Event'].main;
  // branches 3–6: ask_confirm, ask_cancel, do_confirm, do_decline
  if (routeMain.length < 4) routeMain.push([{ node: 'Lookup For Confirm', type: 'main', index: 0 }]);
  if (routeMain.length < 5) routeMain.push([{ node: 'Lookup For Cancel',  type: 'main', index: 0 }]);
  if (routeMain.length < 6) routeMain.push([{ node: 'DB Confirm Payment', type: 'main', index: 0 }]);
  if (routeMain.length < 7) routeMain.push([{ node: 'DB Decline Payment', type: 'main', index: 0 }]);

  wf4Conn['Lookup For Confirm'] = { main: [[{ node: 'Reply Ask Confirm', type: 'main', index: 0 }]] };
  wf4Conn['Lookup For Cancel']  = { main: [[{ node: 'Reply Ask Cancel',  type: 'main', index: 0 }]] };
  wf4Conn['DB Confirm Payment'] = { main: [[{ node: 'Reply Do Confirm',  type: 'main', index: 0 }]] };
  wf4Conn['DB Decline Payment'] = { main: [[{ node: 'Reply Do Decline',  type: 'main', index: 0 }]] };

  // Push WF4
  const wf4Put = await apiReq('PUT', 'workflows/' + WF4_ID, {
    name: wf4.name, nodes: wf4Nodes, connections: wf4Conn,
    settings: wf4.settings || {}, staticData: wf4.staticData || null,
  });
  if (wf4Put.status !== 200) {
    console.error('WF4 push failed:', wf4Put.status, JSON.stringify(wf4Put.body).slice(0, 400));
    process.exit(1);
  }
  console.log('WF4 updated successfully.\n');

  // ═══════════════════════════════════════════════════════════════════════
  //  PATCH WF1
  // ═══════════════════════════════════════════════════════════════════════

  console.log('--- Patching WF1 ---');
  let wf1Nodes = [...wf1.nodes];
  let wf1Conn  = JSON.parse(JSON.stringify(wf1.connections));

  // Check if already patched
  if (wf1Nodes.find(n => n.name === 'Is Payment Command?')) {
    console.log('WF1 already patched — skipping WF1 changes.');
  } else {
    // Get Is Voice? position to place new nodes nearby
    const isVoice = wf1Nodes.find(n => n.name === 'Is Voice?');
    const getCustomerId = wf1Nodes.find(n => n.name === 'Get Customer ID');
    const baseX = (isVoice.position[0] + getCustomerId.position[0]) / 2;
    const baseY = isVoice.position[1];

    // New nodes
    const wf1NewNodes = [
      {
        id: 'is-payment-command', name: 'Is Payment Command?',
        type: 'n8n-nodes-base.if', typeVersion: 2, position: [baseX, baseY],
        parameters: {
          conditions: {
            options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
            combinator: 'or',
            conditions: [
              { leftValue: '={{ $json.message_text }}', operator: { type: 'string', operation: 'contains' }, rightValue: 'payment received for' },
              { leftValue: '={{ $json.message_text }}', operator: { type: 'string', operation: 'contains' }, rightValue: 'cancel booking ' },
              { leftValue: '={{ $json.message_text }}', operator: { type: 'string', operation: 'startsWith' }, rightValue: 'CONFIRM ' },
              { leftValue: '={{ $json.message_text }}', operator: { type: 'string', operation: 'startsWith' }, rightValue: 'DECLINE ' },
            ],
          },
        },
      },
      {
        id: 'build-payment-event', name: 'Build Payment Event',
        type: 'n8n-nodes-base.code', typeVersion: 2, position: [baseX + 224, baseY - 200],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `// Parse payment command text into WF4 event
const item = $input.first().json;
const text = item.message_text || '';
const chatId = item.sender_id || '';
const senderName = item.sender_name || 'owner';

let eventType = null;
let bookingId = null;

const confirmMatch  = text.match(/payment\\s+received\\s+for\\s+([A-Za-z0-9_-]+)/i);
const cancelMatch   = text.match(/cancel\\s+booking\\s+([A-Za-z0-9_-]+)/i);
const doConfirmMatch = text.match(/^CONFIRM\\s+([A-Za-z0-9_-]+)/i);
const doDeclineMatch = text.match(/^DECLINE\\s+([A-Za-z0-9_-]+)/i);

if (doConfirmMatch)  { eventType = 'do_confirm'; bookingId = doConfirmMatch[1].toUpperCase(); }
else if (doDeclineMatch) { eventType = 'do_decline'; bookingId = doDeclineMatch[1].toUpperCase(); }
else if (confirmMatch)   { eventType = 'ask_confirm'; bookingId = confirmMatch[1].toUpperCase(); }
else if (cancelMatch)    { eventType = 'ask_cancel';  bookingId = cancelMatch[1].toUpperCase(); }

if (!eventType) return [];   // shouldn't happen, but safe fallback

return [{ json: {
  event_type: eventType,
  booking_id: bookingId,
  owner_chat_id: chatId,
  sender_name: senderName,
} }];`,
        },
      },
      {
        id: 'call-wf4-direct', name: 'Call WF4 Direct',
        type: 'n8n-nodes-base.executeWorkflow', typeVersion: 2, position: [baseX + 448, baseY - 200],
        parameters: {
          workflowId: { __rl: true, value: WF4_ID, mode: 'id' },
          options: { waitForSubWorkflow: false },
        },
      },
    ];

    for (const node of wf1NewNodes) wf1Nodes.push(node);

    // Rewire: Is Voice? FALSE → Is Payment Command? (was → Get Customer ID)
    wf1Conn['Is Voice?'].main[1] = [{ node: 'Is Payment Command?', type: 'main', index: 0 }];

    // Is Payment Command? TRUE → Build Payment Event
    // Is Payment Command? FALSE → Get Customer ID
    wf1Conn['Is Payment Command?'] = {
      main: [
        [{ node: 'Build Payment Event', type: 'main', index: 0 }],  // true
        [{ node: 'Get Customer ID',      type: 'main', index: 0 }],  // false
      ],
    };
    wf1Conn['Build Payment Event'] = {
      main: [[{ node: 'Call WF4 Direct', type: 'main', index: 0 }]],
    };

    const wf1Put = await apiReq('PUT', 'workflows/' + WF1_ID, {
      name: wf1.name, nodes: wf1Nodes, connections: wf1Conn,
      settings: wf1.settings || {}, staticData: wf1.staticData || null,
    });
    if (wf1Put.status !== 200) {
      console.error('WF1 push failed:', wf1Put.status, JSON.stringify(wf1Put.body).slice(0, 400));
      process.exit(1);
    }
    console.log('WF1 updated successfully.\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DELETE standalone sub-workflow (no longer needed)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('--- Cleanup: delete standalone Payment Telegram Handler ---');
  const subWf = (listRes.body.data || []).find(w => w.name === SUB_WF_NAME);
  if (subWf) {
    const delRes = await apiReq('DELETE', 'workflows/' + subWf.id);
    if (delRes.status === 200 || delRes.status === 204) {
      console.log('Deleted:', SUB_WF_NAME, '(' + subWf.id + ')');
    } else {
      console.warn('Could not delete (status ' + delRes.status + ') — delete manually in n8n UI');
    }
  } else {
    console.log('Not found — nothing to delete.');
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n=== Done ===\n');
  console.log('WF4 changes:');
  console.log('  ✓ Normalize Event: event_type now passes through (not hardcoded)');
  console.log('  ✓ Route by Event: 4 new branches (ask_confirm, ask_cancel, do_confirm, do_decline)');
  console.log('  ✓ 8 new nodes: Lookup + Telegram reply for each branch');
  console.log('\nWF1 changes:');
  console.log('  ✓ Is Payment Command? IF — intercepts before AI');
  console.log('  ✓ Build Payment Event Code — parses booking_id + event_type');
  console.log('  ✓ Call WF4 Direct — executeWorkflow to WF4');
  console.log('\nFlow summary:');
  console.log('  Owner: "payment received for BK123"');
  console.log('    → WF1 intercepts → WF4 ask_confirm → reminder sent back to owner');
  console.log('  Owner: "CONFIRM BK123"');
  console.log('    → WF1 intercepts → WF4 do_confirm → DB updated → owner reply');
  console.log('  Owner: "cancel booking BK123"');
  console.log('    → WF1 intercepts → WF4 ask_cancel → warning sent back to owner');
  console.log('  Owner: "DECLINE BK123"');
  console.log('    → WF1 intercepts → WF4 do_decline → DB updated → owner reply');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

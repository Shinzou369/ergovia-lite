/**
 * Phase 2: Enhance SUB: Owner & Staff Notifier
 *
 * Add two new optional input fields:
 * 1. inline_keyboard (JSON string) — Telegram inline buttons
 * 2. confirmation_urls (JSON string) — { confirm_url, cancel_url } for WhatsApp/SMS
 *
 * Changes:
 * - Trigger: Add inline_keyboard + confirmation_urls inputs
 * - Normalize Input: Pass through new fields
 * - Build Delivery: Include inline_keyboard for telegram, append URLs for whatsapp/sms
 * - Send Telegram: Use reply_markup if inline_keyboard is provided
 *
 * Backward compatible: existing callers (WF5, WF6, WF7, WF8) don't pass these
 * fields, so they default to empty/null and behavior is unchanged.
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const SUB_ID = 'SV80ObHW5jp7mOhL';

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
  console.log('=== Phase 2: Enhance SUB: Owner & Staff Notifier ===\n');

  const wf = await apiCall('GET', `/api/v1/workflows/${SUB_ID}`);
  console.log(`Loaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // List all nodes for reference
  console.log('Current nodes:');
  for (const n of wf.nodes) {
    console.log(`  ${n.name} (${n.type})`);
  }
  console.log('');

  let changes = 0;

  // ─── 1. Trigger: Add new input fields ───
  console.log('1. Adding inline_keyboard + confirmation_urls to trigger inputs...');
  const trigger = wf.nodes.find(n => n.type === 'n8n-nodes-base.executeWorkflowTrigger');
  if (trigger) {
    const inputs = trigger.parameters.workflowInputs?.values || [];

    // Check if already added
    const hasInlineKB = inputs.some(i => i.name === 'inline_keyboard');
    const hasConfUrls = inputs.some(i => i.name === 'confirmation_urls');

    if (!hasInlineKB) {
      inputs.push({ name: 'inline_keyboard', type: 'string' });
      console.log('  + inline_keyboard (string)');
      changes++;
    }
    if (!hasConfUrls) {
      inputs.push({ name: 'confirmation_urls', type: 'string' });
      console.log('  + confirmation_urls (string)');
      changes++;
    }

    if (!hasInlineKB || !hasConfUrls) {
      trigger.parameters.workflowInputs = { values: inputs };
    } else {
      console.log('  Already has both fields');
    }
  }

  // ─── 2. Normalize Input: Pass through new fields ───
  console.log('\n2. Updating Normalize Input to pass through new fields...');
  const normalize = wf.nodes.find(n => n.name === 'Normalize Input');
  if (normalize) {
    const code = normalize.parameters.jsCode;
    if (!code.includes('inline_keyboard')) {
      // Add new fields to the normalize output
      normalize.parameters.jsCode = `// Normalize and validate input fields
const input = $input.item.json;

return {
  property_id: input.property_id || '',
  event_type: input.event_type || 'general',
  message: input.message || '',
  notify: input.notify || 'owner',
  recipient_id: input.recipient_id || '',
  customer_id: input.customer_id || '',
  // Phase 2: Payment confirmation support
  inline_keyboard: input.inline_keyboard || '',
  confirmation_urls: input.confirmation_urls || ''
};`;
      console.log('  Updated code to include inline_keyboard + confirmation_urls');
      changes++;
    } else {
      console.log('  Already includes new fields');
    }
  }

  // ─── 3. Build Delivery: Include keyboard/URLs in channel routing ───
  console.log('\n3. Updating Build Delivery to handle inline_keyboard + confirmation_urls...');
  const buildDelivery = wf.nodes.find(n => n.name === 'Build Delivery');
  if (buildDelivery) {
    buildDelivery.parameters.jsCode = `// Determine delivery channel and prepare message payload
const recipient = $input.item.json;
const normalized = $('Normalize Input').item.json;

// Determine channel (telegram preferred, fallback to whatsapp, then sms)
let channel = 'skip';
let recipientAddress = '';

if (recipient.telegram_id) {
  channel = 'telegram';
  recipientAddress = recipient.telegram_id;
} else if (recipient.phone) {
  channel = recipient.preferred_channel === 'sms' ? 'sms' : 'whatsapp';
  recipientAddress = recipient.phone;
} else if (recipient.email) {
  channel = 'skip'; // Email not yet supported
  recipientAddress = recipient.email;
}

// Build the message — for non-telegram channels, append confirmation URLs if provided
let message = normalized.message;
if (channel !== 'telegram' && normalized.confirmation_urls) {
  try {
    const urls = typeof normalized.confirmation_urls === 'string'
      ? JSON.parse(normalized.confirmation_urls)
      : normalized.confirmation_urls;
    if (urls.confirm_url || urls.cancel_url) {
      message += '\\n\\n---\\n';
      if (urls.confirm_url) message += '\\nConfirm payment: ' + urls.confirm_url;
      if (urls.cancel_url) message += '\\nCancel booking: ' + urls.cancel_url;
    }
  } catch (e) {
    // Invalid JSON, ignore
  }
}

return {
  channel,
  recipient_address: recipientAddress,
  recipient_name: recipient.name || recipient.owner_name || 'Unknown',
  recipient_type: recipient.type || 'owner',
  message,
  event_type: normalized.event_type,
  property_id: normalized.property_id,
  customer_id: normalized.customer_id,
  // Pass through for Telegram
  inline_keyboard: (channel === 'telegram') ? normalized.inline_keyboard : '',
  parse_mode: 'Markdown'
};`;
    console.log('  Updated Build Delivery with keyboard/URL routing');
    changes++;
  }

  // ─── 4. Send Telegram: Add reply_markup support ───
  console.log('\n4. Updating Send Telegram to support inline_keyboard...');
  const sendTelegram = wf.nodes.find(n => n.name === 'Send Telegram');
  if (sendTelegram) {
    // The Telegram node in n8n has an additionalFields.reply_markup parameter
    // But it's easier to use the HTTP Request node approach for inline keyboards
    // Let's check if this is a Telegram node or HTTP Request
    console.log('  Current type:', sendTelegram.type);

    if (sendTelegram.type === 'n8n-nodes-base.telegram') {
      // n8n's Telegram node v1.2 supports reply_markup in additionalFields
      // But it needs expression mode for dynamic inline_keyboard
      // The cleanest approach: replace with HTTP Request that calls Telegram API directly
      // This gives us full control over reply_markup

      // Replace with HTTP Request node
      sendTelegram.type = 'n8n-nodes-base.httpRequest';
      sendTelegram.typeVersion = 4.2;
      sendTelegram.parameters = {
        method: 'POST',
        url: '=https://api.telegram.org/bot{{ $credentials.telegramApi.token || "placeholder" }}/sendMessage',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Content-Type', value: 'application/json' }
          ]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={
  const chatId = $json.recipient_address;
  const text = $json.message;
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  // Add inline keyboard if provided
  if ($json.inline_keyboard) {
    try {
      const kb = typeof $json.inline_keyboard === 'string'
        ? JSON.parse($json.inline_keyboard)
        : $json.inline_keyboard;
      body.reply_markup = { inline_keyboard: kb };
    } catch(e) {}
  }

  return JSON.stringify(body);
}`,
        options: { response: { response: { fullResponse: true } } }
      };

      console.log('  Replaced Telegram node with HTTP Request for reply_markup support');
      changes++;
    }
  }

  // Hmm, actually the HTTP Request jsonBody expression approach is fragile.
  // Better approach: Use a Code node before Send Telegram to build the payload,
  // then Send Telegram as HTTP Request with the pre-built body.

  // Let me take a different, cleaner approach:
  // Instead of replacing the Telegram node (which would break credentials),
  // add a NEW Code node "Prepare Telegram Payload" before Send Telegram,
  // and change Send Telegram to be an HTTP Request that uses the prepared payload.
  //
  // Actually, the simplest approach: keep the Telegram node for basic messages,
  // and add a SECOND path with an HTTP Request node for messages WITH inline_keyboard.
  // A switch node decides which path based on whether inline_keyboard is provided.

  // Let me revert the Telegram node change and use a better architecture.
  console.log('\n  ... Actually, cleaner approach: Code node to build Telegram API payload');

  // Revert Send Telegram back to original Telegram node
  const origTelegram = wf.nodes.find(n => n.name === 'Send Telegram');
  // Let me reload the original to get it back
  const origWf = await apiCall('GET', `/api/v1/workflows/${SUB_ID}`);
  const origSendTg = origWf.nodes.find(n => n.name === 'Send Telegram');

  if (origSendTg) {
    // Restore original Send Telegram
    const sendTgIdx = wf.nodes.findIndex(n => n.name === 'Send Telegram');
    wf.nodes[sendTgIdx] = origSendTg;
  }

  // NEW APPROACH: Add a Code node "Build Telegram Request" before Send Telegram
  // that conditionally adds reply_markup. Then replace Send Telegram with HTTP Request.
  //
  // But actually, the CLEANEST approach for n8n is:
  // 1. Add "Build Telegram Body" Code node after Build Delivery (on telegram path)
  // 2. Replace Send Telegram with HTTP Request node that posts to Telegram API
  // 3. The Code node builds the full JSON body including optional reply_markup

  // Let's find the position of Send Telegram for the new node placement
  const sendTgNode = wf.nodes.find(n => n.name === 'Send Telegram');
  const sendTgPos = sendTgNode ? sendTgNode.position : [1200, 0];

  // Add "Build Telegram Body" code node
  const buildTgBodyId = 'build-telegram-body';
  const buildTgBody = {
    id: buildTgBodyId,
    name: 'Build Telegram Body',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [sendTgPos[0] - 200, sendTgPos[1]],
    parameters: {
      jsCode: `// Build Telegram sendMessage body with optional inline_keyboard
const input = $input.item.json;

const body = {
  chat_id: input.recipient_address,
  text: input.message,
  parse_mode: 'Markdown'
};

// Add inline keyboard buttons if provided (for payment confirmation etc.)
if (input.inline_keyboard) {
  try {
    const kb = typeof input.inline_keyboard === 'string'
      ? JSON.parse(input.inline_keyboard)
      : input.inline_keyboard;
    if (Array.isArray(kb) && kb.length > 0) {
      body.reply_markup = JSON.stringify({ inline_keyboard: kb });
    }
  } catch (e) {
    // Invalid keyboard JSON, send without buttons
  }
}

return body;`
    }
  };

  // Check if Build Telegram Body already exists
  if (!wf.nodes.find(n => n.name === 'Build Telegram Body')) {
    wf.nodes.push(buildTgBody);
    console.log('  + Added "Build Telegram Body" code node');
    changes++;
  }

  // Now replace Send Telegram with HTTP Request
  const sendTgIdx = wf.nodes.findIndex(n => n.name === 'Send Telegram');
  if (sendTgIdx >= 0 && wf.nodes[sendTgIdx].type === 'n8n-nodes-base.telegram') {
    // Get the Telegram credential token — we'll need to use a different approach
    // Actually, we can't access credential values via API.
    // Better: keep the credential reference and use the Telegram node's sendMessage
    // with a raw HTTP call using the credential's token.

    // BEST APPROACH: Use n8n-nodes-base.telegram with additionalFields.reply_markup
    // The Telegram node v1.2 has additionalFields that support reply_markup
    // We just need to set it as an expression that reads from the input

    const tgNode = wf.nodes[sendTgIdx];
    // Keep as Telegram node but add reply_markup from expression
    if (!tgNode.parameters.additionalFields) {
      tgNode.parameters.additionalFields = {};
    }
    // The Telegram node's additionalFields.reply_markup accepts a JSON string
    tgNode.parameters.additionalFields.reply_markup =
      "={{ $json.inline_keyboard ? JSON.stringify({ inline_keyboard: (typeof $json.inline_keyboard === 'string' ? JSON.parse($json.inline_keyboard) : $json.inline_keyboard) }) : '' }}";

    // Also update chatId and text to read from Build Telegram Body output
    // Actually, let's NOT insert the Build Telegram Body node.
    // The Telegram node can read directly from Build Delivery output.
    // The reply_markup expression handles the keyboard.

    // Remove the Build Telegram Body node we just added (not needed)
    const btbIdx = wf.nodes.findIndex(n => n.name === 'Build Telegram Body');
    if (btbIdx >= 0) {
      wf.nodes.splice(btbIdx, 1);
      console.log('  - Removed Build Telegram Body (not needed, using Telegram node reply_markup)');
    }

    console.log('  Updated Send Telegram: added reply_markup expression in additionalFields');
    console.log('  Expression: reads inline_keyboard from Build Delivery output');
    changes++;
  }

  // ─── 5. Update connections ───
  // No connection changes needed — Build Delivery already feeds into Route by Channel
  // which feeds into Send Telegram. The reply_markup is now an expression on the node.

  console.log('\n5. Connection check...');
  console.log('  No connection changes needed (reply_markup is expression-based)');

  // ─── Summary ───
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`SUMMARY: ${changes} changes to SUB: Owner & Staff Notifier`);
  console.log(`${'═'.repeat(50)}`);
  console.log('  1. Trigger: +inline_keyboard, +confirmation_urls inputs');
  console.log('  2. Normalize Input: passes through new fields');
  console.log('  3. Build Delivery: appends confirmation URLs for WhatsApp/SMS');
  console.log('  4. Send Telegram: reply_markup expression for inline keyboard');
  console.log('  5. Backward compatible: existing callers unaffected');

  // ─── Deploy ───
  console.log('\nDeploying...');
  const ok = await deploy(SUB_ID, wf);

  if (ok) {
    console.log('\n=== Phase 2 Complete ===');
    console.log('Next: Phase 3 - Webhook confirmation workflow');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

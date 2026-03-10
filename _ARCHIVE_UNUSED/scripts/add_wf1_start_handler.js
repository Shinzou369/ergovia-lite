/**
 * ADD /start HANDSHAKE HANDLER TO WF1: AI Gateway
 *
 * Adds a command detection branch after "Normalize Input" that:
 * 1. Detects /start commands (from Telegram deep links)
 * 2. Parses the property_id from the payload (/start prop_XXXX)
 * 3. Saves the sender's chat_id to property_configurations.owner_telegram
 * 4. Sends a welcome confirmation message back via Telegram
 *
 * For all other messages, routes to the existing flow (Get Customer ID → ...)
 *
 * Usage: node scripts/add_wf1_start_handler.js
 */

const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

const WF1_ID = 'LP7YknAVPiQsidWq';
const POSTGRES_CRED_ID = 'BWlLUMKn64aZsHi8';
const TELEGRAM_CRED_ID = '6ltptOrFLUaZzC1C';

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
  console.log('=== ADD /start HANDSHAKE HANDLER TO WF1 ===\n');

  // ============================================
  // 1. Download live WF1
  // ============================================
  const { data: wf1 } = await apiCall('GET', '/api/v1/workflows/' + WF1_ID);
  console.log('Downloaded WF1: ' + wf1.name + ' (' + wf1.nodes.length + ' nodes)');

  // List current nodes
  console.log('\nCurrent nodes:');
  wf1.nodes.forEach(n => {
    const flags = [];
    if (n.disabled) flags.push('DISABLED');
    console.log('  ' + n.name.padEnd(35) + ' [' + n.position + '] ' + flags.join(' '));
  });

  // ============================================
  // 2. Check if handler already exists
  // ============================================
  const existingDetect = wf1.nodes.find(n => n.name === 'Detect Command');
  if (existingDetect) {
    console.log('\n/start handler already exists (Detect Command node found). Skipping.');
    return;
  }

  // ============================================
  // 3. Add new nodes
  // ============================================
  console.log('\n--- Adding /start handler nodes ---');

  // 3a. "Detect Command" — IF node after Normalize Input
  // Checks if message_text starts with /start
  const detectCommand = {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose',
          version: 1
        },
        conditions: [
          {
            id: 'is-start-command',
            leftValue: "={{ $json.message_text.startsWith('/start') }}",
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'equals'
            }
          }
        ],
        combinator: 'and'
      },
      options: {}
    },
    id: 'detect-command-' + Date.now().toString(36),
    name: 'Detect Command',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [128, 296]
  };
  wf1.nodes.push(detectCommand);
  console.log('  Added: Detect Command (IF) at [128, 296]');

  // 3b. "Parse Start Payload" — Code node to extract property_id
  const parseStart = {
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Parse /start command payload
// Deep link format: /start prop_XXXX or /start XXXX
const msg = $json.message_text || '';
const parts = msg.split(' ');
let propertyId = '';

if (parts.length >= 2) {
  const payload = parts.slice(1).join(' ').trim();
  // Support: /start prop_abc123 or /start abc123
  propertyId = payload.startsWith('prop_') ? payload.substring(5) : payload;
}

return {
  sender_id: $json.sender_id,
  sender_name: $json.sender_name,
  channel: $json.channel,
  property_id: propertyId,
  is_start_command: true
};`
    },
    id: 'parse-start-' + Date.now().toString(36),
    name: 'Parse Start Payload',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [352, 104]
  };
  wf1.nodes.push(parseStart);
  console.log('  Added: Parse Start Payload (Code) at [352, 104]');

  // 3c. "Save Chat ID" — Postgres node to save chat_id
  const saveChatId = {
    parameters: {
      operation: 'executeQuery',
      query: `-- Save Telegram chat_id for the property owner
-- Updates property_configurations so SUB: Owner & Staff Notifier can find it
UPDATE property_configurations SET
  owner_telegram = '{{ $json.sender_id }}',
  preferred_platform = 'telegram',
  updated_at = NOW()
WHERE property_id = '{{ $json.property_id }}'
  AND (owner_telegram IS NULL OR owner_telegram = '' OR owner_telegram = 'REPLACE_WITH_YOUR_CHAT_ID');

-- Also update owners table if owner_id is linked
UPDATE owners SET
  owner_chat_id = '{{ $json.sender_id }}',
  preferred_platform = 'telegram',
  updated_at = NOW()
WHERE owner_id IN (
  SELECT owner_id FROM property_configurations WHERE property_id = '{{ $json.property_id }}'
) AND owner_id IS NOT NULL;

-- Return property name for the welcome message
SELECT property_name, property_id FROM property_configurations WHERE property_id = '{{ $json.property_id }}' LIMIT 1;`,
      options: {}
    },
    id: 'save-chat-id-' + Date.now().toString(36),
    name: 'Save Chat ID',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [576, 104],
    alwaysOutputData: true,
    credentials: {
      postgres: { id: POSTGRES_CRED_ID, name: '[Client] PostgreSQL' }
    },
    continueOnFail: true
  };
  wf1.nodes.push(saveChatId);
  console.log('  Added: Save Chat ID (Postgres) at [576, 104]');

  // 3d. "Send Welcome" — Telegram message to confirm connection
  const sendWelcome = {
    parameters: {
      operation: 'sendMessage',
      chatId: "={{ $('Parse Start Payload').item.json.sender_id }}",
      text: "={{ (() => {\n  const propName = $json.property_name || 'your property';\n  const propId = $('Parse Start Payload').item.json.property_id;\n  if (!propId) {\n    return '\\u{1F44B} Welcome! To connect your property, use the link from your dashboard with your property ID.\\n\\nFormat: Click the Telegram link in your Ergovia dashboard.';\n  }\n  return '\\u{2705} Connected! You will now receive notifications for **' + propName + '**.\\n\\n\\u{1F514} Maintenance alerts, cleaning schedules, and booking updates will be sent here.\\n\\nTo change your notification preferences, visit your Ergovia dashboard.';\n})() }}",
      additionalFields: {
        parse_mode: 'Markdown'
      }
    },
    id: 'send-welcome-' + Date.now().toString(36),
    name: 'Send Welcome',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [800, 104],
    credentials: {
      telegramApi: { id: TELEGRAM_CRED_ID, name: '[Client] Telegram Bot' }
    },
    continueOnFail: true
  };
  wf1.nodes.push(sendWelcome);
  console.log('  Added: Send Welcome (Telegram) at [800, 104]');

  // ============================================
  // 4. Shift existing nodes to make room
  // ============================================
  console.log('\n--- Adjusting positions ---');

  // The Normalize Input is at [16, 296]. We insert Detect Command at [128, 296].
  // Get Customer ID was at [240, 296] — keep it there (Detect Command FALSE → Get Customer ID).
  // No shifts needed — the IF node sits between them nicely.

  // ============================================
  // 5. Update connections
  // ============================================
  console.log('\n--- Updating connections ---');
  const conn = wf1.connections;

  // Change: Normalize Input → Detect Command (was: → Get Customer ID)
  conn['Normalize Input'] = {
    main: [[{ node: 'Detect Command', type: 'main', index: 0 }]]
  };
  console.log('  Normalize Input → Detect Command');

  // Detect Command: TRUE (output 0) → Parse Start Payload, FALSE (output 1) → Get Customer ID
  conn['Detect Command'] = {
    main: [
      [{ node: 'Parse Start Payload', type: 'main', index: 0 }],
      [{ node: 'Get Customer ID', type: 'main', index: 0 }]
    ]
  };
  console.log('  Detect Command [/start] → Parse Start Payload');
  console.log('  Detect Command [other]  → Get Customer ID');

  // Parse Start Payload → Save Chat ID
  conn['Parse Start Payload'] = {
    main: [[{ node: 'Save Chat ID', type: 'main', index: 0 }]]
  };
  console.log('  Parse Start Payload → Save Chat ID');

  // Save Chat ID → Send Welcome
  conn['Save Chat ID'] = {
    main: [[{ node: 'Send Welcome', type: 'main', index: 0 }]]
  };
  console.log('  Save Chat ID → Send Welcome');

  // Send Welcome is terminal (no further connection needed)
  // The rest of the flow (Get Customer ID → Merge → Budget → AI Agent) stays unchanged.

  // ============================================
  // 6. Deploy
  // ============================================
  console.log('\nDeploying WF1...');
  await apiCall('POST', '/api/v1/workflows/' + WF1_ID + '/deactivate');
  await sleep(2000);

  const res = await apiCall('PUT', '/api/v1/workflows/' + WF1_ID, {
    name: wf1.name, nodes: wf1.nodes, connections: conn,
    settings: wf1.settings, staticData: wf1.staticData
  });

  if (res.status !== 200) {
    console.log('ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    console.log('Re-activating WF1...');
    await apiCall('POST', '/api/v1/workflows/' + WF1_ID + '/activate');
    return;
  }

  await sleep(1500);
  await apiCall('POST', '/api/v1/workflows/' + WF1_ID + '/activate');
  console.log('WF1 deployed & activated');

  // ============================================
  // 7. Verify
  // ============================================
  console.log('\n--- Verification ---');
  const { data: verify } = await apiCall('GET', '/api/v1/workflows/' + WF1_ID);

  const vDetect = verify.nodes.find(n => n.name === 'Detect Command');
  const vParse = verify.nodes.find(n => n.name === 'Parse Start Payload');
  const vSave = verify.nodes.find(n => n.name === 'Save Chat ID');
  const vWelcome = verify.nodes.find(n => n.name === 'Send Welcome');

  console.log('  Detect Command:     ' + (vDetect ? 'EXISTS' : 'MISSING'));
  console.log('  Parse Start Payload: ' + (vParse ? 'EXISTS' : 'MISSING'));
  console.log('  Save Chat ID:       ' + (vSave ? 'EXISTS' : 'MISSING'));
  console.log('  Send Welcome:       ' + (vWelcome ? 'EXISTS' : 'MISSING'));

  // Check connections
  const vConn = verify.connections;
  const checkConn = (from) => {
    const c = vConn[from];
    if (!c || !c.main) return '(none)';
    return c.main.map((outputs, i) =>
      outputs.length ? outputs.map(o => o.node).join(', ') : '(empty)'
    ).join(' | ');
  };
  console.log('  Normalize Input → ' + checkConn('Normalize Input'));
  console.log('  Detect Command  → ' + checkConn('Detect Command'));
  console.log('  Parse Start     → ' + checkConn('Parse Start Payload'));
  console.log('  Save Chat ID    → ' + checkConn('Save Chat ID'));
  console.log('  Total nodes: ' + verify.nodes.length);

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n========================================');
  console.log(' WF1 /start HANDLER — COMPLETE');
  console.log('========================================');
  console.log('');
  console.log('Added 4 nodes to WF1:');
  console.log('  1. Detect Command (IF)       — checks message_text.startsWith("/start")');
  console.log('  2. Parse Start Payload (Code) — extracts property_id from /start prop_XXX');
  console.log('  3. Save Chat ID (Postgres)    — saves sender chat_id to property_configurations');
  console.log('  4. Send Welcome (Telegram)    — confirms connection to owner');
  console.log('');
  console.log('Flow:');
  console.log('  [/start] Normalize → Detect Command → Parse → Save Chat ID → Send Welcome');
  console.log('  [other]  Normalize → Detect Command → Get Customer ID → (existing AI flow)');
  console.log('');
  console.log('Usage:');
  console.log('  Owner clicks: https://t.me/YOUR_BOT_NAME?start=prop_PROPERTY_ID');
  console.log('  Bot saves their chat_id and sends welcome message.');
}

main().catch(console.error);

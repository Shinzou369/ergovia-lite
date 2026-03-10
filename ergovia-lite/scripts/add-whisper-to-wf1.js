/**
 * add-whisper-to-wf1.js
 *
 * Adds Whisper voice transcription branch to [LIVE] WF1: AI Gateway.
 *
 * PREREQUISITE: Set TELEGRAM_BOT_TOKEN in n8n's environment (docker-compose.yml):
 *   environment:
 *     - TELEGRAM_BOT_TOKEN=<your_bot_token>
 * Then restart n8n: docker compose restart n8n
 *
 * What this script adds to WF1:
 *   Normalize Input → Is Voice? → Get Telegram File → Download Voice File
 *                 → Transcribe Audio (Whisper) → Set Transcribed Text → Get Customer ID
 *   Is Voice? (FALSE) → Get Customer ID (main flow unchanged)
 */

require('dotenv').config();
const https = require('https');
const { randomUUID } = require('crypto');

const N8N_BASE = 'https://n8n.ergovia-ai.com/api/v1';
const WF1_NAME = '[LIVE] WF1: AI Gateway - Unified Entry Point';

const CREDS = {
  telegram: { id: '6ltptOrFLUaZzC1C', name: '[Client] Telegram Bot' },
  openAi:   { id: 'slpbr7aUaU6fqTfw', name: '[Client] OpenAI' },
};

function apiReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + '/' + endpoint);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': process.env.N8N_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = https.request(opts, res => {
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

// ============================================================
// Normalize Input code with voice detection added
// ============================================================
const NORMALIZE_INPUT_CODE = `// Normalize input from any channel into standard format
const input = $input.item.json;
let normalized = {
  channel: 'unknown',
  sender_id: null,
  sender_name: null,
  message_text: '',
  is_voice: false,
  voice_file_id: null,
  is_callback: false,
  callback_data: null,
  customer_id: null
};

// Telegram voice message (checked before text to prioritize)
if (input.message?.voice) {
  normalized.channel = 'telegram';
  normalized.sender_id = String(input.message.chat.id);
  normalized.sender_name = input.message.from?.first_name || 'Guest';
  normalized.message_text = '[voice message]';
  normalized.is_voice = true;
  normalized.voice_file_id = input.message.voice.file_id;
}
// Telegram text message
else if (input.message?.text) {
  normalized.channel = 'telegram';
  normalized.sender_id = String(input.message.chat.id);
  normalized.sender_name = input.message.from?.first_name || 'Guest';
  normalized.message_text = input.message.text;
}
// Telegram callback
else if (input.callback_query) {
  normalized.channel = 'telegram';
  normalized.sender_id = String(input.callback_query.message.chat.id);
  normalized.sender_name = input.callback_query.from?.first_name || 'Guest';
  normalized.is_callback = true;
  normalized.callback_data = input.callback_query.data;
  normalized.message_text = input.callback_query.data;
}
// WhatsApp
else if (input.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
  const msg = input.entry[0].changes[0].value.messages[0];
  const contact = input.entry[0].changes[0].value.contacts?.[0];
  normalized.channel = 'whatsapp';
  normalized.sender_id = msg.from;
  normalized.sender_name = contact?.profile?.name || 'Guest';
  normalized.message_text = msg.text?.body || msg.interactive?.button_reply?.title || '';
  normalized.is_callback = !!msg.interactive;
  normalized.callback_data = msg.interactive?.button_reply?.id || null;
}
// Twilio SMS
else if (input.Body && input.From) {
  normalized.channel = 'sms';
  normalized.sender_id = input.From;
  normalized.sender_name = 'Guest';
  normalized.message_text = input.Body;
}

normalized.timestamp = new Date().toISOString();
return normalized;`;

// ============================================================
// New voice branch nodes
// ============================================================
function buildVoiceNodes() {
  return [
    {
      id: randomUUID(),
      name: 'Is Voice?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [240, 120],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'loose',
            version: 1,
          },
          conditions: [{
            id: randomUUID(),
            leftValue: '={{ $json.is_voice }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          }],
          combinator: 'and',
        },
        options: {},
      },
    },
    {
      id: randomUUID(),
      name: 'Get Telegram File',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [464, 250],
      parameters: {
        method: 'GET',
        url: '=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/getFile',
        sendQuery: true,
        queryParameters: {
          parameters: [{ name: 'file_id', value: '={{ $json.voice_file_id }}' }],
        },
        options: {},
      },
      // NOTE: TELEGRAM_BOT_TOKEN must be set as env var in n8n docker-compose.yml
    },
    {
      id: randomUUID(),
      name: 'Download Voice File',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [688, 250],
      parameters: {
        method: 'GET',
        url: '=https://api.telegram.org/file/bot{{ $env.TELEGRAM_BOT_TOKEN }}/{{ $json.result.file_path }}',
        options: {
          response: {
            response: {
              responseFormat: 'file',
              outputPropertyName: 'data',
            },
          },
        },
      },
    },
    {
      id: randomUUID(),
      name: 'Transcribe Audio',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [912, 250],
      parameters: {
        method: 'POST',
        url: 'https://api.openai.com/v1/audio/transcriptions',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: '=Bearer {{ $credentials.httpHeaderAuth.value }}' }],
        },
        sendBody: true,
        contentType: 'multipart-form-data',
        bodyParameters: {
          parameters: [
            { name: 'model', value: 'whisper-1' },
            { name: 'file', parameterType: 'formBinaryData', inputDataFieldName: 'data' },
          ],
        },
        options: {},
      },
      credentials: {
        httpHeaderAuth: { id: CREDS.openAi.id, name: CREDS.openAi.name },
      },
    },
    {
      id: randomUUID(),
      name: 'Set Transcribed Text',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1136, 250],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: `// Merge transcription into normalized message data
const original = $('Is Voice?').item.json;
const transcription = $input.item.json.text || '[could not transcribe audio]';
return {
  channel: original.channel,
  sender_id: original.sender_id,
  sender_name: original.sender_name,
  message_text: transcription,
  is_voice: false,
  voice_transcribed: true,
  is_callback: original.is_callback || false,
  callback_data: original.callback_data || null,
  customer_id: null,
  timestamp: original.timestamp,
};`,
      },
    },
  ];
}

async function main() {
  console.log('=== Add Whisper to WF1 ===\n');

  // 1. Find WF1
  const list = await apiReq('GET', 'workflows?limit=200');
  const wf1Meta = (list.body.data || []).find(w => w.name === WF1_NAME);
  if (!wf1Meta) { console.error('ERROR: WF1 not found. Check that [LIVE] workflows are deployed.'); process.exit(1); }
  console.log('WF1 found. ID:', wf1Meta.id, '| Active:', wf1Meta.active);

  // 2. Fetch full workflow
  const res = await apiReq('GET', 'workflows/' + wf1Meta.id);
  const wf = res.body;
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};

  // 3. Guard: check if already applied
  if (nodes.find(n => n.name === 'Is Voice?')) {
    console.log('WARNING: "Is Voice?" node already exists. Skipping — workflow already has Whisper support.');
    process.exit(0);
  }

  // 4. Modify "Normalize Input" code
  const normNode = nodes.find(n => n.name === 'Normalize Input');
  if (!normNode) { console.error('ERROR: Normalize Input node not found.'); process.exit(1); }
  normNode.parameters.jsCode = NORMALIZE_INPUT_CODE;
  console.log('Updated Normalize Input code with voice detection.');

  // 5. Build and add new voice nodes
  const voiceNodes = buildVoiceNodes();
  nodes.push(...voiceNodes);
  console.log('Added', voiceNodes.length, 'new nodes:', voiceNodes.map(n => n.name).join(', '));

  const isVoiceNode       = voiceNodes[0];
  const getTelegramFile   = voiceNodes[1];
  const downloadVoiceFile = voiceNodes[2];
  const transcribeAudio   = voiceNodes[3];
  const setTranscribed    = voiceNodes[4];

  // 6. Update connections
  // a) Normalize Input now goes to Is Voice? (was Get Customer ID)
  connections['Normalize Input'] = {
    main: [[{ node: 'Is Voice?', type: 'main', index: 0 }]],
  };

  // b) Is Voice?: TRUE (slot 0) → Get Telegram File, FALSE (slot 1) → Get Customer ID
  connections['Is Voice?'] = {
    main: [
      [{ node: 'Get Telegram File', type: 'main', index: 0 }],   // TRUE
      [{ node: 'Get Customer ID',   type: 'main', index: 0 }],   // FALSE
    ],
  };

  // c) Voice processing chain
  connections['Get Telegram File']   = { main: [[{ node: 'Download Voice File', type: 'main', index: 0 }]] };
  connections['Download Voice File'] = { main: [[{ node: 'Transcribe Audio',    type: 'main', index: 0 }]] };
  connections['Transcribe Audio']    = { main: [[{ node: 'Set Transcribed Text', type: 'main', index: 0 }]] };
  connections['Set Transcribed Text'] = { main: [[{ node: 'Get Customer ID',    type: 'main', index: 0 }]] };

  console.log('Updated connections for voice branch.');

  // 7. Deactivate
  if (wf1Meta.active) {
    const deact = await apiReq('PATCH', 'workflows/' + wf1Meta.id + '/deactivate');
    console.log('Deactivated WF1. Status:', deact.status);
  }

  // 8. Push updated workflow
  const putPayload = {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null,
  };
  const putRes = await apiReq('PUT', 'workflows/' + wf1Meta.id, putPayload);
  if (putRes.status !== 200) {
    console.error('ERROR updating workflow. Status:', putRes.status);
    console.error(JSON.stringify(putRes.body, null, 2));
    process.exit(1);
  }
  console.log('WF1 updated successfully.');

  // 9. Reactivate
  const react = await apiReq('PATCH', 'workflows/' + wf1Meta.id + '/activate');
  console.log('Reactivated WF1. Status:', react.status);

  console.log('\n=== Done ===');
  console.log('Voice branch added. Flow: Normalize Input → Is Voice? → [voice: Get Telegram File → Download → Whisper → Set Text] → Get Customer ID');
  console.log('\nIMPORTANT: TELEGRAM_BOT_TOKEN env var must be set in n8n docker-compose.yml for voice downloads to work.');
  console.log('Add this to /opt/n8n/docker-compose.yml under n8n environment:');
  console.log('  - TELEGRAM_BOT_TOKEN=<your_bot_token>');
  console.log('Then run: docker compose -f /opt/n8n/docker-compose.yml restart n8n');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });

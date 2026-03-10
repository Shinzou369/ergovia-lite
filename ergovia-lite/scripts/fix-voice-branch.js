/**
 * fix-voice-branch.js
 *
 * Fixes the WF1 voice/Whisper branch:
 *
 *  CHANGE 1: Replace "Get Telegram File" HTTP Request (which needed $env.TELEGRAM_BOT_TOKEN)
 *            with a native n8n-nodes-base.telegram node that uses the stored credential
 *            automatically — no env var needed for this step.
 *
 *  CHANGE 2: Fix "Download Voice File" — keep HTTP Request but get the download URL
 *            from n8n's telegram node response (which includes file_path). The download
 *            URL still needs the bot token, so we read it from $env.TELEGRAM_BOT_TOKEN.
 *            => After this script runs, you only need the env var for ONE node (the download),
 *               not two.
 *
 *  CHANGE 3: Fix "Transcribe Audio" — change from wrong genericCredentialType/httpHeaderAuth
 *            to predefinedCredentialType/openAiApi so the OpenAI credential is used correctly.
 */

require('dotenv').config();
const https = require('https');

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
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method,
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

async function main() {
  console.log('=== Fix WF1 Voice Branch ===\n');

  // 1. Find WF1
  const list = await apiReq('GET', 'workflows?limit=200');
  const wf1Meta = (list.body.data || []).find(w => w.name === WF1_NAME);
  if (!wf1Meta) { console.error('WF1 not found'); process.exit(1); }
  console.log('WF1 ID:', wf1Meta.id);

  // 2. Fetch full workflow
  const res = await apiReq('GET', 'workflows/' + wf1Meta.id);
  const wf = res.body;
  let nodes = wf.nodes || [];
  const connections = wf.connections || {};

  // 3. Find existing voice nodes
  const oldGetFile    = nodes.find(n => n.name === 'Get Telegram File');
  const oldDownload   = nodes.find(n => n.name === 'Download Voice File');
  const transcribe    = nodes.find(n => n.name === 'Transcribe Audio');

  if (!oldGetFile) { console.error('Get Telegram File node not found'); process.exit(1); }

  console.log('\nFIX 1: Replace Get Telegram File HTTP Request → n8n Telegram node');
  // Replace the HTTP Request node with a native Telegram node at same position
  const newGetFileNode = {
    id: oldGetFile.id,            // keep same ID so connections still work
    name: 'Get Telegram File',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: oldGetFile.position,
    parameters: {
      resource: 'file',
      operation: 'get',
      fileId: '={{ $json.voice_file_id }}',
    },
    credentials: {
      telegramApi: CREDS.telegram,
    },
  };
  // Replace old node in array
  nodes = nodes.map(n => n.name === 'Get Telegram File' ? newGetFileNode : n);
  console.log('  Done — now uses stored Telegram credential, no env var needed for getFile.');

  console.log('\nFIX 2: Update Download Voice File URL (reads file_path from telegram node response)');
  // The n8n Telegram getFile node returns: result.file_path
  // Download URL still needs the bot token — we keep $env.TELEGRAM_BOT_TOKEN for this one step
  if (oldDownload) {
    nodes = nodes.map(n => {
      if (n.name !== 'Download Voice File') return n;
      return {
        ...n,
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
        // No credentials needed — auth is in the URL via env var
      };
    });
    console.log('  Note: Download Voice File still uses $env.TELEGRAM_BOT_TOKEN for the URL.');
    console.log('  This is the one env var you need to set on the server (see below).');
  }

  console.log('\nFIX 3: Fix Transcribe Audio credential (openAiApi, not httpHeaderAuth)');
  if (transcribe) {
    nodes = nodes.map(n => {
      if (n.name !== 'Transcribe Audio') return n;
      return {
        ...n,
        parameters: {
          method: 'POST',
          url: 'https://api.openai.com/v1/audio/transcriptions',
          // Use predefined credential type — n8n adds Authorization: Bearer {apiKey} automatically
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'openAiApi',
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
          openAiApi: CREDS.openAi,   // correct credential type
        },
      };
    });
    console.log('  Done — now uses openAiApi credential correctly.');
  }

  // 4. Push updated workflow
  const putPayload = {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null,
  };
  const putRes = await apiReq('PUT', 'workflows/' + wf1Meta.id, putPayload);
  if (putRes.status !== 200) {
    console.error('\nERROR pushing workflow. Status:', putRes.status);
    console.error(JSON.stringify(putRes.body, null, 2));
    process.exit(1);
  }

  console.log('\n=== Done ===');
  console.log('\nSummary of fixes applied:');
  console.log('  Get Telegram File → now uses n8n Telegram node with stored credential');
  console.log('  Download Voice File → reads file_path from telegram node response');
  console.log('  Transcribe Audio → now uses openAiApi credential (was httpHeaderAuth mismatch)');
  console.log('\nOne remaining requirement:');
  console.log('  The Download Voice File node needs TELEGRAM_BOT_TOKEN set in n8n env.');
  console.log('  SSH into server and run:');
  console.log('');
  console.log('    nano /opt/n8n/docker-compose.yml');
  console.log('    # Under the n8n "environment:" section, add:');
  console.log('    #   - TELEGRAM_BOT_TOKEN=<paste your bot token here>');
  console.log('    docker compose -f /opt/n8n/docker-compose.yml restart n8n');
  console.log('');
  console.log('  Your bot token is the same token you set up with @BotFather.');
  console.log('  Find it in n8n → Credentials → [Client] Telegram Bot → Access Token');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

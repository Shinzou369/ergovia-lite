/**
 * Create M1 WF4: Closing Doctor (AI Sales Conversation)
 *
 * This is the MISSING workflow that WF3 Lead Router forwards leads to.
 * It handles the AI-powered sales conversation via GPT-4o-mini.
 *
 * Flow:
 *   Webhook /marketing/closing-conversation
 *     → Load lead context + conversation history from DB
 *     → Load Closing Doctor AI prompt + closing stages + objection handlers
 *     → Generate AI response via OpenAI
 *     → Human-like typing delay
 *     → Send response via Telegram or WhatsApp
 *     → Log outbound message + update lead status
 *     → If closing stage = 'close' and lead says yes → call WF7 Payment Link
 */

const https = require('https');

const N8N_URL = 'https://n8n.ergovia-ai.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcxOTEwMTk3fQ.oX7JSmVnvb0LlX_m-nLk4xm1U18avBQ88DAdMoMYOM0';

// Credential IDs from the existing M1 workflows
const CRED_POSTGRES = 'BWlLUMKn64aZsHi8';
const CRED_OPENAI = 'slpbr7aUaU6fqTfw';
const CRED_TELEGRAM = '6ltptOrFLUaZzC1C';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, N8N_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Creating M1 WF4: Closing Doctor ===\n');

  const workflow = {
    name: 'M1 WF4 Closing Doctor',
    nodes: [
      // ── Node 0: Webhook trigger ──
      {
        id: 'wf4-webhook',
        name: 'Closing Conversation Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1.1,
        position: [0, 300],
        webhookId: 'closing-conv-wf4',
        parameters: {
          path: 'marketing/closing-conversation',
          httpMethod: 'POST',
          responseMode: 'responseNode',
          options: {}
        }
      },

      // ── Node 1: Parse incoming lead data ──
      {
        id: 'wf4-parse',
        name: 'Parse Lead Data',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [220, 300],
        parameters: {
          mode: 'runOnceForEachItem',
          jsCode: `// Parse the incoming lead data from WF3 Lead Router
const body = $input.item.json.body || $input.item.json;
return {
  lead_id: body.lead_id || '',
  lead_name: body.lead_name || body.name || 'there',
  chat_id: body.chat_id || '',
  phone: body.phone || '',
  channel: body.channel || 'telegram',
  message_text: body.message_text || body.message || '',
  closing_stage: body.closing_stage || 'intro',
  temperature: body.temperature || 'warm',
  objections_count: parseInt(body.objections_count) || 0,
  affiliate_id: body.affiliate_id || '',
  conversation_history: body.conversation_history || ''
};`
        }
      },

      // ── Node 2: Load lead context from DB ──
      {
        id: 'wf4-load-context',
        name: 'Load Lead Context',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [440, 200],
        credentials: { postgres: { id: CRED_POSTGRES, name: '[Client] PostgreSQL' } },
        parameters: {
          operation: 'executeQuery',
          query: `SELECT
  ml.lead_id, ml.name, ml.status, ml.closing_stage, ml.temperature,
  ml.objections_count, ml.followup_count, ml.channel, ml.chat_id,
  ml.telegram_id, ml.phone, ml.affiliate_id,
  COALESCE(
    (SELECT string_agg(
      CASE WHEN direction = 'inbound' THEN 'Lead: ' ELSE 'AI: ' END || message_text,
      E'\\n' ORDER BY sent_at DESC
    )
    FROM (SELECT direction, message_text, sent_at FROM lead_messages WHERE lead_id = ml.lead_id ORDER BY sent_at DESC LIMIT 10) sub),
    'No previous messages'
  ) AS recent_messages
FROM marketing_leads ml
WHERE ml.lead_id = $1`,
          options: { queryParams: '={{ $json.lead_id }}' }
        }
      },

      // ── Node 3: Load AI prompt + closing stage + objection handlers ──
      {
        id: 'wf4-load-prompt',
        name: 'Load AI Prompt & Stages',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [440, 400],
        credentials: { postgres: { id: CRED_POSTGRES, name: '[Client] PostgreSQL' } },
        parameters: {
          operation: 'executeQuery',
          query: `SELECT
  (SELECT prompt_text FROM ai_system_prompts WHERE prompt_key = 'closing_doctor' AND active = true LIMIT 1) AS system_prompt,
  (SELECT json_agg(json_build_object('key', stage_key, 'name', stage_name, 'objective', objective, 'max_messages', max_messages))
   FROM closing_script_stages WHERE active = true ORDER BY stage_order) AS stages,
  (SELECT json_agg(json_build_object('key', objection_key, 'text', objection_text, 'handler', handler_response))
   FROM closing_objections WHERE active = true) AS objection_handlers`
        }
      },

      // ── Node 4: Build GPT prompt ──
      {
        id: 'wf4-build-prompt',
        name: 'Build GPT Prompt',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [660, 300],
        parameters: {
          mode: 'runOnceForEachItem',
          jsCode: `// Combine lead context with AI prompt template
const lead = $('Parse Lead Data').item.json;
const context = $('Load Lead Context').item.json;
const promptData = $('Load AI Prompt & Stages').item.json;

// Use DB values or fallback to incoming data
const leadName = context.name || lead.lead_name || 'there';
const stage = context.closing_stage || lead.closing_stage || 'intro';
const temp = context.temperature || lead.temperature || 'warm';
const objCount = context.objections_count || lead.objections_count || 0;
const recentMsgs = context.recent_messages || lead.conversation_history || 'No previous messages';

// Parse stages JSON
let stages = [];
try { stages = typeof promptData.stages === 'string' ? JSON.parse(promptData.stages) : (promptData.stages || []); } catch(e) {}

// Find current stage objective
const currentStage = stages.find(s => s.key === stage) || { objective: 'Build rapport and understand their needs' };

// Parse objection handlers
let handlers = [];
try { handlers = typeof promptData.objection_handlers === 'string' ? JSON.parse(promptData.objection_handlers) : (promptData.objection_handlers || []); } catch(e) {}
const handlerText = handlers.map(h => '- "' + h.text + '" → ' + h.handler).join('\\n');

// Build the system prompt with variable substitution
let systemPrompt = promptData.system_prompt || 'You are a helpful sales assistant.';
systemPrompt = systemPrompt
  .replace('{stage}', stage)
  .replace('{stage_objective}', currentStage.objective || '')
  .replace('{lead_name}', leadName)
  .replace('{temperature}', temp)
  .replace('{objections_count}', String(objCount))
  .replace('{recent_messages}', recentMsgs)
  .replace('{objection_handlers}', handlerText);

return {
  system_prompt: systemPrompt,
  user_message: lead.message_text,
  lead_id: lead.lead_id,
  lead_name: leadName,
  chat_id: lead.chat_id || context.telegram_id || context.chat_id || '',
  phone: lead.phone || context.phone || '',
  channel: lead.channel || context.channel || 'telegram',
  closing_stage: stage,
  temperature: temp,
  objections_count: objCount,
  affiliate_id: lead.affiliate_id || context.affiliate_id || '',
  stages: stages
};`
        }
      },

      // ── Node 5: Generate AI response ──
      {
        id: 'wf4-openai',
        name: 'Generate AI Response',
        type: 'n8n-nodes-base.openAi',
        typeVersion: 1.8,
        position: [880, 300],
        credentials: { openAiApi: { id: CRED_OPENAI, name: '[Client] OpenAI' } },
        parameters: {
          resource: 'chat',
          operation: 'message',
          model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' },
          messages: {
            values: [
              {
                role: 'system',
                content: '={{ $json.system_prompt }}'
              },
              {
                role: 'user',
                content: '={{ $json.user_message }}'
              }
            ]
          },
          options: {
            temperature: 0.7,
            maxTokens: 500
          }
        }
      },

      // ── Node 6: Process AI response + determine next stage ──
      {
        id: 'wf4-process',
        name: 'Process AI Response',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1100, 300],
        parameters: {
          mode: 'runOnceForEachItem',
          jsCode: `// Extract AI response and determine stage progression
const prev = $('Build GPT Prompt').item.json;
const aiResponse = $input.item.json.content || $input.item.json.message?.content || '';

// Determine if stage should advance
const currentStage = prev.closing_stage;
const stages = prev.stages || [];
const stageOrder = stages.map(s => s.key);
const currentIdx = stageOrder.indexOf(currentStage);

// Simple heuristics for stage progression
const userMsg = (prev.user_message || '').toLowerCase();
let nextStage = currentStage;
let readyToClose = false;

// Check for positive buying signals
const buySignals = ['yes', 'sure', 'let\\'s do it', 'sign me up', 'how do i pay', 'send me the link', 'i want it', 'take my money', 'ready', 'deal'];
const objectionSignals = ['expensive', 'too much', 'can\\'t afford', 'think about', 'not sure', 'maybe later', 'not now', 'not interested'];

if (currentStage === 'close' && buySignals.some(s => userMsg.includes(s))) {
  readyToClose = true;
} else if (objectionSignals.some(s => userMsg.includes(s))) {
  nextStage = 'objection';
} else if (currentIdx >= 0 && currentIdx < stageOrder.length - 1) {
  // Auto-advance after a few messages in the current stage
  if (prev.objections_count === 0 && currentIdx < 5) {
    nextStage = stageOrder[Math.min(currentIdx + 1, stageOrder.length - 1)];
  }
}

return {
  ai_response: aiResponse.trim(),
  lead_id: prev.lead_id,
  lead_name: prev.lead_name,
  chat_id: prev.chat_id,
  phone: prev.phone,
  channel: prev.channel,
  closing_stage: nextStage,
  temperature: prev.temperature,
  objections_count: prev.objections_count + (objectionSignals.some(s => userMsg.includes(s)) ? 1 : 0),
  affiliate_id: prev.affiliate_id,
  ready_to_close: readyToClose
};`
        }
      },

      // ── Node 7: Calculate human-like reply delay ──
      {
        id: 'wf4-calc-delay',
        name: 'Calculate Reply Delay',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1320, 300],
        parameters: {
          mode: 'runOnceForEachItem',
          jsCode: `// Human-like typing delay: 8-35 seconds based on message length
const response = $json.ai_response || '';
const wordCount = response.split(' ').length;
// ~3 words per second typing speed + 5s thinking time
const typingTime = Math.ceil(wordCount / 3) + 5;
const jitter = Math.floor(Math.random() * 8) - 4; // ±4 seconds
const delay = Math.max(8, Math.min(35, typingTime + jitter));
return { ...$json, delay_seconds: delay };`
        }
      },

      // ── Node 8: Wait (human typing delay) ──
      {
        id: 'wf4-wait',
        name: 'Human Typing Delay',
        type: 'n8n-nodes-base.wait',
        typeVersion: 1.1,
        position: [1540, 300],
        parameters: {
          amount: '={{ $json.delay_seconds }}',
          unit: 'seconds'
        }
      },

      // ── Node 9: Route by channel ──
      {
        id: 'wf4-channel-check',
        name: 'Which Channel?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [1760, 300],
        parameters: {
          conditions: {
            options: { caseSensitive: false },
            combinator: 'and',
            conditions: [
              {
                leftValue: '={{ $json.channel }}',
                rightValue: 'telegram',
                operator: { type: 'string', operation: 'equals' }
              }
            ]
          }
        }
      },

      // ── Node 10: Send via Telegram ──
      {
        id: 'wf4-send-telegram',
        name: 'Send via Telegram',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [1980, 200],
        credentials: { telegramApi: { id: CRED_TELEGRAM, name: '[Client] Telegram Bot' } },
        parameters: {
          operation: 'sendMessage',
          chatId: '={{ $json.chat_id }}',
          text: '={{ $json.ai_response }}',
          additionalFields: {
            parse_mode: 'HTML'
          }
        }
      },

      // ── Node 11: Send via WhatsApp (placeholder — needs real credential) ──
      {
        id: 'wf4-send-whatsapp',
        name: 'Send via WhatsApp',
        type: 'n8n-nodes-base.whatsApp',
        typeVersion: 1,
        position: [1980, 400],
        credentials: { whatsAppBusinessCloudApi: { id: CRED_TELEGRAM, name: '[Client] Telegram Bot' } },
        parameters: {
          operation: 'sendMessage',
          phoneNumberId: '={{ $env.WHATSAPP_PHONE_NUMBER_ID || "" }}',
          recipientPhoneNumber: '={{ $json.phone }}',
          textBody: '={{ $json.ai_response }}'
        }
      },

      // ── Node 12: Update lead status in DB ──
      {
        id: 'wf4-update-lead',
        name: 'Update Lead Status',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [2200, 200],
        credentials: { postgres: { id: CRED_POSTGRES, name: '[Client] PostgreSQL' } },
        parameters: {
          operation: 'executeQuery',
          query: `UPDATE marketing_leads SET
  closing_stage = $1,
  temperature = $2,
  objections_count = $3,
  last_message_at = NOW(),
  updated_at = NOW()
WHERE lead_id = $4`,
          options: {
            queryParams: '={{ $json.closing_stage }},{{ $json.temperature }},{{ $json.objections_count }},{{ $json.lead_id }}'
          }
        }
      },

      // ── Node 13: Log outbound message ──
      {
        id: 'wf4-log-message',
        name: 'Log Outbound Message',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [2200, 400],
        credentials: { postgres: { id: CRED_POSTGRES, name: '[Client] PostgreSQL' } },
        parameters: {
          operation: 'executeQuery',
          query: `INSERT INTO lead_messages (lead_id, direction, channel, message_text, ai_generated, closing_stage)
VALUES ($1, 'outbound', $2, $3, true, $4)`,
          options: {
            queryParams: '={{ $json.lead_id }},{{ $json.channel }},={{ $json.ai_response }},={{ $json.closing_stage }}'
          }
        }
      },

      // ── Node 14: Check if ready to close ──
      {
        id: 'wf4-ready-close',
        name: 'Ready to Close?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [2420, 300],
        parameters: {
          conditions: {
            options: { caseSensitive: false },
            combinator: 'and',
            conditions: [
              {
                leftValue: '={{ $json.ready_to_close }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true' }
              }
            ]
          }
        }
      },

      // ── Node 15: Call WF7 Payment Link Sender ──
      {
        id: 'wf4-call-payment',
        name: 'Send Payment Link (WF7)',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.1,
        position: [2640, 200],
        parameters: {
          method: 'POST',
          url: N8N_URL + '/webhook/marketing/send-payment-link',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'lead_id', value: '={{ $json.lead_id }}' },
              { name: 'lead_name', value: '={{ $json.lead_name }}' },
              { name: 'chat_id', value: '={{ $json.chat_id }}' },
              { name: 'phone', value: '={{ $json.phone }}' },
              { name: 'channel', value: '={{ $json.channel }}' },
              { name: 'affiliate_id', value: '={{ $json.affiliate_id }}' }
            ]
          },
          options: { timeout: 30000 }
        }
      },

      // ── Node 16: Respond to webhook (200 OK) ──
      {
        id: 'wf4-respond',
        name: 'Respond OK',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [2640, 400],
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify({ status: "ok", lead_id: $json.lead_id, stage: $json.closing_stage }) }}'
        }
      }
    ],

    connections: {
      'Closing Conversation Webhook': {
        main: [
          [{ node: 'Parse Lead Data', type: 'main', index: 0 }]
        ]
      },
      'Parse Lead Data': {
        main: [
          [
            { node: 'Load Lead Context', type: 'main', index: 0 },
            { node: 'Load AI Prompt & Stages', type: 'main', index: 0 }
          ]
        ]
      },
      'Load Lead Context': {
        main: [
          [{ node: 'Build GPT Prompt', type: 'main', index: 0 }]
        ]
      },
      'Load AI Prompt & Stages': {
        main: [
          [{ node: 'Build GPT Prompt', type: 'main', index: 0 }]
        ]
      },
      'Build GPT Prompt': {
        main: [
          [{ node: 'Generate AI Response', type: 'main', index: 0 }]
        ]
      },
      'Generate AI Response': {
        main: [
          [{ node: 'Process AI Response', type: 'main', index: 0 }]
        ]
      },
      'Process AI Response': {
        main: [
          [{ node: 'Calculate Reply Delay', type: 'main', index: 0 }]
        ]
      },
      'Calculate Reply Delay': {
        main: [
          [{ node: 'Human Typing Delay', type: 'main', index: 0 }]
        ]
      },
      'Human Typing Delay': {
        main: [
          [{ node: 'Which Channel?', type: 'main', index: 0 }]
        ]
      },
      'Which Channel?': {
        main: [
          // true = Telegram
          [{ node: 'Send via Telegram', type: 'main', index: 0 }],
          // false = WhatsApp
          [{ node: 'Send via WhatsApp', type: 'main', index: 0 }]
        ]
      },
      'Send via Telegram': {
        main: [
          [
            { node: 'Update Lead Status', type: 'main', index: 0 },
            { node: 'Log Outbound Message', type: 'main', index: 0 }
          ]
        ]
      },
      'Send via WhatsApp': {
        main: [
          [
            { node: 'Update Lead Status', type: 'main', index: 0 },
            { node: 'Log Outbound Message', type: 'main', index: 0 }
          ]
        ]
      },
      'Update Lead Status': {
        main: [
          [{ node: 'Ready to Close?', type: 'main', index: 0 }]
        ]
      },
      'Ready to Close?': {
        main: [
          // true = send payment link
          [{ node: 'Send Payment Link (WF7)', type: 'main', index: 0 }],
          // false = respond OK (conversation continues)
          [{ node: 'Respond OK', type: 'main', index: 0 }]
        ]
      },
      'Send Payment Link (WF7)': {
        main: [
          [{ node: 'Respond OK', type: 'main', index: 0 }]
        ]
      }
    },

    settings: {
      executionOrder: 'v1'
    }
  };

  console.log('Creating workflow with ' + workflow.nodes.length + ' nodes...');

  const result = await apiCall('POST', '/api/v1/workflows', workflow);

  if (result.id) {
    console.log('SUCCESS! Workflow created:');
    console.log('  ID: ' + result.id);
    console.log('  Name: ' + result.name);
    console.log('  Active: ' + result.active);
    console.log('  Nodes: ' + (result.nodes || []).length);

    // Now activate it
    console.log('\nActivating workflow...');
    const activateResult = await apiCall('POST', '/api/v1/workflows/' + result.id + '/activate');
    if (activateResult.active === true) {
      console.log('  Activated successfully!');
    } else {
      console.log('  Activation result:', JSON.stringify(activateResult).substring(0, 200));
    }
  } else {
    console.log('ERROR creating workflow:');
    console.log(JSON.stringify(result, null, 2).substring(0, 1000));
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

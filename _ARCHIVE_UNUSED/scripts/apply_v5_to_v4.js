#!/usr/bin/env node
/**
 * Apply V5 positive improvements to V4 workflows (WITHOUT creating V5 copies)
 *
 * Changes:
 * 1. WF1: 6-stage conversation flow + system prompt + memory window 20
 * 2. SUB Messenger: Human typing delay
 * 3. WF6: Smart follow-up scheduler
 */

const https = require('https');
const http = require('http');

const N8N_URL = 'https://n8n.ergovia-ai.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwMDE2MjA0fQ.MjLv7Jf9YKSUfvS8gJVSvsah1hulXRszsirmZ63Rc5c';
const PG_CREDENTIAL_ID = 'BWlLUMKn64aZsHi8';

// V4 Workflow IDs
const V4_WF1 = 'tvSLRSiOmNdkEfA2';
const V4_SUB_MESSENGER = 'MWFSKpUCpYfFzDTr';
const V4_WF6 = 'kohspAO4n8msHAFQ';

// ─── HTTP Helpers ───────────────────────────────────────────────
function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, N8N_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getWorkflow(id) {
  return apiRequest('GET', `/api/v1/workflows/${id}`);
}

async function updateWorkflow(id, body) {
  return apiRequest('PUT', `/api/v1/workflows/${id}`, body);
}

// ─── 1. UPDATE WF1: AI Gateway ─────────────────────────────────
async function updateWF1() {
  console.log('\n══════ UPDATING V4 WF1: AI Gateway ══════');
  const wf = await getWorkflow(V4_WF1);
  console.log(`  Fetched: ${wf.name} (${wf.nodes.length} nodes)`);

  // --- A. Add "Load Conversation" node ---
  const loadConversationNode = {
    id: 'load-conversation',
    name: 'Load Conversation',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [352, -144],
    credentials: {
      postgres: { id: PG_CREDENTIAL_ID, name: '[Client] PostgreSQL' }
    },
    parameters: {
      operation: 'executeQuery',
      query: "=SELECT \n  c.conversation_id,\n  c.conversation_stage,\n  c.collected_data->>'guest_name' as guest_name,\n  c.collected_data->>'check_in_date' as check_in_date,\n  c.collected_data->>'check_out_date' as check_out_date,\n  c.collected_data->>'property_interest' as property_interest,\n  c.collected_data->>'num_guests' as num_guests,\n  c.property_id,\n  c.channel\nFROM conversations c\nWHERE c.contact_id = '{{ $('Normalize Input').item.json.sender_id }}'\n  AND c.is_active = true\nORDER BY c.updated_at DESC\nLIMIT 1",
      options: { queryBatching: 'independently' }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
  };

  // --- B. Add "Extract Conversation Data" node ---
  const extractConversationNode = {
    id: 'extract-conversation-data',
    name: 'Extract Conversation Data',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2464, 16],
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Extract stage and collected data from AI response
const aiOutput = $input.item.json.output || '';
const currentStage = $('Load Conversation').item.json?.conversation_stage || 'new';
const senderId = $('Normalize Input').item.json.sender_id;
const messageText = $('Normalize Input').item.json.message_text || '';

let newStage = currentStage;
let extractedData = {};

// Stage 1: First message → welcome_done
if (currentStage === 'new' || currentStage === null || currentStage === 'greeting') {
  newStage = 'welcome_done';
}

// Stage 2: Extract guest name
const namePatterns = [
  /(?:i'm|im|i am|my name is|call me|this is)\\s+([A-Z][a-z]+)/i,
  /^([A-Z][a-z]+)$/,
  /^([A-Z][a-z]+)\\s*[!.,]?$/
];

for (const pattern of namePatterns) {
  const match = messageText.match(pattern);
  if (match && match[1] && match[1].length > 1 && match[1].length < 20) {
    extractedData.guest_name = match[1];
    if (currentStage === 'welcome_done') {
      newStage = 'name_collected';
    }
    break;
  }
}

// Stage 3: Extract dates
const datePattern = /(\\d{4}-\\d{2}-\\d{2})/g;
const foundDates = messageText.match(datePattern) || [];
if (foundDates.length >= 2) {
  extractedData.check_in_date = foundDates[0];
  extractedData.check_out_date = foundDates[1];
  if (['welcome_done', 'name_collected'].includes(currentStage)) {
    newStage = 'dates_collected';
  }
}

// Stage 4-5: Detect from AI output
if (aiOutput.toLowerCase().includes('available') && currentStage === 'dates_collected') {
  newStage = 'options_shown';
}
if ((aiOutput.includes('$') || aiOutput.toLowerCase().includes('total')) && currentStage === 'options_shown') {
  newStage = 'price_revealed';
}

// Generate conversation_id for new conversations
const convId = $('Load Conversation').item.json?.conversation_id ||
  'conv_' + senderId + '_' + Date.now();

return {
  sender_id: senderId,
  conversation_id: convId,
  current_stage: currentStage,
  new_stage: newStage,
  extracted_data: extractedData,
  should_update: newStage !== currentStage || Object.keys(extractedData).length > 0
};`
    }
  };

  // --- C. Add "Save Conversation State" node ---
  const saveConversationNode = {
    id: 'save-conversation',
    name: 'Save Conversation State',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [2688, 16],
    credentials: {
      postgres: { id: PG_CREDENTIAL_ID, name: '[Client] PostgreSQL' }
    },
    parameters: {
      operation: 'executeQuery',
      query: `=WITH updated AS (
  UPDATE conversations SET
    conversation_stage = '{{ $json.new_stage }}',
    collected_data = COALESCE(collected_data, '{{}}'::jsonb) || '{{ JSON.stringify($json.extracted_data || {{}}) }}'::jsonb,
    updated_at = NOW()
  WHERE contact_id = '{{ $('Normalize Input').item.json.sender_id }}'
    AND is_active = true
  RETURNING conversation_id
)
INSERT INTO conversations (conversation_id, contact_id, property_id, channel, conversation_stage, collected_data)
SELECT
  '{{ $json.conversation_id }}',
  '{{ $('Normalize Input').item.json.sender_id }}',
  '{{ $('Merge Customer ID').item.json.property_id }}',
  '{{ $('Normalize Input').item.json.channel }}',
  '{{ $json.new_stage }}',
  '{{ JSON.stringify($json.extracted_data || {{}}) }}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM updated)
RETURNING conversation_id`,
      options: { queryBatching: 'independently' }
    },
    onError: 'continueRegularOutput',
  };

  // --- D. Add new nodes to workflow ---
  wf.nodes.push(loadConversationNode);
  wf.nodes.push(extractConversationNode);
  wf.nodes.push(saveConversationNode);

  // --- E. Update "Merge Customer ID" position and code ---
  const mergeNode = wf.nodes.find(n => n.name === 'Merge Customer ID');
  if (mergeNode) {
    mergeNode.position = [560, -144]; // shift right to make room
    // Update code to reference Get Customer ID explicitly (since Load Conversation is now between them)
    mergeNode.parameters.jsCode = mergeNode.parameters.jsCode.replace(
      'const customerResult = $input.item.json;',
      "const customerResult = $('Get Customer ID').item.json;"
    );
  }

  // --- F. Shift downstream nodes to make visual room ---
  const shiftNodes = ['Check Budget', 'Budget Available?'];
  shiftNodes.forEach(name => {
    const n = wf.nodes.find(nd => nd.name === name);
    if (n) n.position[0] += 96;
  });

  // Shift post-AI nodes right to fit Extract + Save
  const postAiShiftNodes = ['Log API Cost', 'Alert Needed?', 'Prepare Alert',
    'Save Alert Record', 'Call SUB: Universal Messenger', 'Log Activity'];
  postAiShiftNodes.forEach(name => {
    const n = wf.nodes.find(nd => nd.name === name);
    if (n) n.position[0] += 448;
  });

  // --- G. Update connections ---
  // Get Customer ID → Load Conversation (instead of → Merge Customer ID)
  wf.connections['Get Customer ID'] = {
    main: [[{ node: 'Load Conversation', type: 'main', index: 0 }]]
  };

  // Load Conversation → Merge Customer ID
  wf.connections['Load Conversation'] = {
    main: [[{ node: 'Merge Customer ID', type: 'main', index: 0 }]]
  };

  // Calculate AI Cost → Extract Conversation Data (instead of → Log API Cost)
  wf.connections['Calculate AI Cost'] = {
    main: [[{ node: 'Extract Conversation Data', type: 'main', index: 0 }]]
  };

  // Extract Conversation Data → Save Conversation State
  wf.connections['Extract Conversation Data'] = {
    main: [[{ node: 'Save Conversation State', type: 'main', index: 0 }]]
  };

  // Save Conversation State → Log API Cost
  wf.connections['Save Conversation State'] = {
    main: [[{ node: 'Log API Cost', type: 'main', index: 0 }]]
  };

  // --- H. Update Chat Memory: set contextWindowLength to 20 ---
  const chatMemory = wf.nodes.find(n => n.name === 'Chat Memory');
  if (chatMemory) {
    chatMemory.parameters.contextWindowLength = 20;
    console.log('  ✓ Chat Memory window length set to 20');
  }

  // --- I. Update AI Agent: new system prompt with 6-stage flow ---
  const aiAgent = wf.nodes.find(n => n.name === 'AI Agent');
  if (aiAgent) {
    aiAgent.parameters.options.systemMessage = `=You are "Lia", a friendly vacation rental assistant for {{ $('Merge Customer ID').item.json.property_name || 'our properties' }}. You're warm, helpful, and focused on building relationships - NOT making hard sales.

## YOUR PERSONALITY
- Casual, friendly, like texting a helpful friend
- Use the guest's name once you know it
- Never sound like a robot or salesperson
- Short responses (2-3 sentences max)
- Always end with a question that moves closer to booking
- 1-2 emojis max per message

## CURRENT CONVERSATION STATE
- Stage: {{ $('Load Conversation').item.json.conversation_stage || 'new' }}
- Guest Name: {{ $('Load Conversation').item.json.guest_name || 'unknown' }}
- Dates Collected: {{ $('Load Conversation').item.json.check_in_date || 'no' }} to {{ $('Load Conversation').item.json.check_out_date || 'no' }}
- Property Interest: {{ $('Load Conversation').item.json.property_interest || 'none yet' }}

## CONVERSATION FLOW (FOLLOW IN ORDER)

### STAGE 1: WELCOME (if stage = 'new', 'greeting', or null)
"Hey there! 👋 Welcome! I'm Lia, here to help you find the perfect place for your stay. What brings you here today - looking for a getaway?"
→ After response, move to stage 'welcome_done'

### STAGE 2: GET NAME (if stage = 'welcome_done' and no name)
"Awesome! By the way, who do I have the pleasure of chatting with? 😊"
→ Once they give name, extract it and move to stage 'name_collected'

### STAGE 3: GET DATES (if stage = 'name_collected' and no dates)
"Nice to meet you, [NAME]! So tell me - when are you thinking of coming down? And will it be a quick escape or are you planning to stay a while?"
→ Once dates given, move to stage 'dates_collected'

### STAGE 4: SHOW OPTIONS (if stage = 'dates_collected')
- Use Calendar Manager to check availability for their dates
- If available, present options clearly
- If dates conflict, suggest alternative dates from calendar
- If looking for long stay (7+ nights) and multiple properties available, mention them
→ Move to stage 'options_shown'

### STAGE 5: REVEAL PRICE (if stage = 'options_shown' and they show interest)
"Great choice! For [CHECK-IN] to [CHECK-OUT], that would be [PRICE]. How does that sound to you?"
→ Move to stage 'price_revealed'

### STAGE 6: CLOSE THE DEAL (if stage = 'price_revealed')
If interested: use Payment Processor to create booking
If hesitant: address concerns, offer value
→ Move to stage 'booking_pending' or 'completed'

## HANDLING PRICE QUESTIONS BEFORE STAGE 5
If they ask about price and we don't have dates yet:
"I'd love to get you that info! Just need a quick thing - what dates are you thinking?"

If they ask about price and we don't have their name yet (after dates):
"Perfect dates! And who am I chatting with so I can give you personalized info?"

## UNKNOWN QUESTIONS
If you don't know the answer:
"Great question! Let me check with the property manager and get back to you on that."
→ Use Property Operations tool to flag for owner

## TODAY'S DATE CONTEXT
Today: {{ $('Merge Customer ID').item.json.today_full }}
Tomorrow: {{ $('Merge Customer ID').item.json.tomorrow_full }}
Year: {{ $('Merge Customer ID').item.json.today_year }}

## CALENDAR (14 days)
{{ $('Merge Customer ID').item.json.calendar }}

## DATE RULES
1. Use ONLY dates from calendar above
2. Current year is {{ $('Merge Customer ID').item.json.today_year }}
3. "tomorrow" = TOMORROW line in calendar
4. Always pass YYYY-MM-DD to tools
5. ALWAYS confirm resolved dates with the guest before booking
6. If a date would be BEFORE {{ $('Merge Customer ID').item.json.today }}, it is WRONG

## OWNER MESSAGES (is_owner = true: {{ $('Merge Customer ID').item.json.is_owner }})
If from OWNER: handle payment confirmations, property questions, booking inquiries differently - be professional, give data.

## TOOLS
- Calendar Manager: Check availability (YYYY-MM-DD dates required, both must be today or later)
- Offer Conflict Checker: ALWAYS call before confirming bookings
- Payment Processor: Create bookings after availability + no conflicts, also confirms owner payments
- Calculate Price: Recalculate pricing (Calendar Manager already includes pricing)
- Property Operations: Maintenance, issues, cleaning
- Emergency Handler: ONLY for real emergencies (fire, medical, break-in, gas leak, flooding)

## BOOKING FLOW
1. Get dates from guest
2. Calendar Manager (check availability)
3. Offer Conflict Checker (check for competing offers)
4. Payment Processor (create booking)

## EFFICIENCY
- 1-2 tool calls per message, max 3 for complex booking flows
- Greetings and simple questions need no tools

## OUTPUT FORMAT
Your response must be conversational text only.
Never expose JSON or technical details.
End with a question that moves toward booking.`;

    // Set maxIterations to 15
    aiAgent.parameters.options.maxIterations = 15;
    console.log('  ✓ AI Agent system prompt updated with 6-stage flow');
  }

  // --- J. Push to n8n ---
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  };

  const result = await updateWorkflow(V4_WF1, updateBody);
  console.log(`  ✓ WF1 updated: ${result.nodes?.length || 'unknown'} nodes`);
  return true;
}

// ─── 2. UPDATE SUB: Universal Messenger ─────────────────────────
async function updateSUBMessenger() {
  console.log('\n══════ UPDATING V4 SUB: Universal Messenger ══════');
  const wf = await getWorkflow(V4_SUB_MESSENGER);
  console.log(`  Fetched: ${wf.name} (${wf.nodes.length} nodes)`);

  // --- A. Add "Human Typing Delay" node ---
  const normalizeNode = wf.nodes.find(n => n.name === 'Normalize Input');
  const routeNode = wf.nodes.find(n => n.name === 'Route by Channel');

  // Position between Normalize Input and Route by Channel
  const delayX = normalizeNode ? normalizeNode.position[0] + 224 : 336;
  const delayY = normalizeNode ? normalizeNode.position[1] : 176;

  const typingDelayNode = {
    id: 'human-typing-delay',
    name: 'Human Typing Delay',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [delayX, delayY],
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Human-like typing delay
// Makes responses feel more natural, not instant/robotic

const data = $input.item.json;
const message = data.message || '';
const messageLength = message.length;

// Calculate delay based on message length
// Base: 1.5 seconds minimum (someone reading + starting to type)
// Per character: ~40ms (average typing speed ~150 chars/min)
// Max: 6 seconds (don't make them wait too long)
const baseDelay = 1500;
const perCharDelay = 40;
const maxDelay = 6000;

let typingDelay = Math.min(baseDelay + (messageLength * perCharDelay), maxDelay);

// Add randomness (±25%) to feel more human
const variance = 0.25;
const randomFactor = 1 - variance + (Math.random() * variance * 2);
typingDelay = Math.round(typingDelay * randomFactor);

// Simulate the delay
const startTime = Date.now();
while (Date.now() - startTime < typingDelay) {
  // Busy wait for delay
}

return {
  ...data,
  typing_delay_ms: typingDelay,
  delay_applied: true
};`
    }
  };

  wf.nodes.push(typingDelayNode);

  // --- B. Shift downstream nodes right ---
  if (routeNode) routeNode.position[0] += 224;
  ['Send Telegram', 'Send WhatsApp', 'Send SMS', 'Log Telegram Result',
   'Calculate WhatsApp Cost', 'Calculate SMS Cost', 'Merge Results',
   'Has Messaging Cost?', 'Log Messaging Cost', 'Format Response'].forEach(name => {
    const n = wf.nodes.find(nd => nd.name === name);
    if (n) n.position[0] += 224;
  });

  // --- C. Update connections ---
  // Normalize Input → Human Typing Delay (instead of → Route by Channel)
  wf.connections['Normalize Input'] = {
    main: [[{ node: 'Human Typing Delay', type: 'main', index: 0 }]]
  };

  // Human Typing Delay → Route by Channel
  wf.connections['Human Typing Delay'] = {
    main: [[{ node: 'Route by Channel', type: 'main', index: 0 }]]
  };

  // --- D. Update downstream references from $('Normalize Input') to $('Human Typing Delay') ---
  const refUpdates = [
    'Send Telegram', 'Log Telegram Result',
    'Calculate WhatsApp Cost', 'Calculate SMS Cost'
  ];

  wf.nodes.forEach(n => {
    // Update code nodes
    if (n.parameters?.jsCode && refUpdates.includes(n.name)) {
      n.parameters.jsCode = n.parameters.jsCode.replace(
        /\$\('Normalize Input'\)/g,
        "$('Human Typing Delay')"
      );
    }
    // Update expression parameters (Send Telegram chatId, text, etc.)
    if (n.name === 'Send Telegram' && n.parameters) {
      const params = n.parameters;
      for (const key of Object.keys(params)) {
        if (typeof params[key] === 'string' && params[key].includes("$('Normalize Input')")) {
          params[key] = params[key].replace(
            /\$\('Normalize Input'\)/g,
            "$('Human Typing Delay')"
          );
        }
      }
      // Check nested additionalFields and chatId
      if (params.chatId && typeof params.chatId === 'string') {
        params.chatId = params.chatId.replace(
          /\$\('Normalize Input'\)/g,
          "$('Human Typing Delay')"
        );
      }
      if (params.text && typeof params.text === 'string') {
        params.text = params.text.replace(
          /\$\('Normalize Input'\)/g,
          "$('Human Typing Delay')"
        );
      }
    }
  });

  console.log('  ✓ Human Typing Delay node added');
  console.log('  ✓ Downstream references updated');

  // --- E. Push to n8n ---
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  };

  const result = await updateWorkflow(V4_SUB_MESSENGER, updateBody);
  console.log(`  ✓ SUB Messenger updated: ${result.nodes?.length || 'unknown'} nodes`);
  return true;
}

// ─── 3. UPDATE WF6: Daily Automations ───────────────────────────
async function updateWF6() {
  console.log('\n══════ UPDATING V4 WF6: Daily Automations ══════');
  const wf = await getWorkflow(V4_WF6);
  console.log(`  Fetched: ${wf.name} (${wf.nodes.length} nodes)`);

  // --- A. Add 7 follow-up pipeline nodes ---
  const baseY = 1280; // Below existing nodes

  // 1. Schedule Trigger
  const followupTrigger = {
    id: 'followup-trigger',
    name: 'Followup Check (Every 30 min)',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [0, baseY],
    parameters: {
      rule: {
        interval: [{ triggerAtMinute: 30 }]
      }
    }
  };

  // 2. Get Conversations Needing Followup (PostgreSQL)
  const getFollowups = {
    id: 'get-followup-needed',
    name: 'Get Conversations Needing Followup',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [224, baseY],
    credentials: {
      postgres: { id: PG_CREDENTIAL_ID, name: '[Client] PostgreSQL' }
    },
    parameters: {
      operation: 'executeQuery',
      query: `SELECT
  c.conversation_id,
  c.contact_id,
  c.property_id,
  c.conversation_stage,
  c.channel,
  c.collected_data,
  c.updated_at,
  p.customer_id,
  p.property_name,
  EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 3600 AS hours_since_reply,
  COALESCE((c.collected_data->>'followup_count')::int, c.followup_count, 0) AS followup_count
FROM conversations c
JOIN property_configurations p ON c.property_id::uuid = p.property_id
WHERE
  c.conversation_stage NOT IN ('completed', 'cancelled', 'booked', 'booking_pending')
  AND c.is_active = true
  AND c.updated_at < NOW() - INTERVAL '1 hour'
  AND COALESCE(c.followup_exhausted, false) = false
  AND (
    (EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 3600 BETWEEN 1 AND 1.5
     AND COALESCE((c.collected_data->>'followup_count')::int, c.followup_count, 0) = 0)
    OR
    (EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 3600 BETWEEN 5 AND 5.5
     AND COALESCE((c.collected_data->>'followup_count')::int, c.followup_count, 0) = 1)
    OR
    (EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 3600 BETWEEN 24 AND 24.5
     AND COALESCE((c.collected_data->>'followup_count')::int, c.followup_count, 0) = 2)
    OR
    (EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 3600 BETWEEN 48 AND 48.5
     AND COALESCE((c.collected_data->>'followup_count')::int, c.followup_count, 0) = 3)
  )
ORDER BY c.updated_at ASC
LIMIT 10`,
      options: { queryBatching: 'independently' }
    },
    alwaysOutputData: true,
  };

  // 3. Has Conversations to Follow Up? (IF)
  const hasFollowups = {
    id: 'has-followups',
    name: 'Has Conversations to Follow Up?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [448, baseY],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '' },
        combinator: 'and',
        conditions: [{
          id: 'followup-check',
          leftValue: "={{ $json.conversation_id }}",
          rightValue: '',
          operator: { type: 'string', operation: 'isNotEmpty' }
        }]
      }
    }
  };

  // 4. Generate Followup Message (Code)
  const generateFollowup = {
    id: 'generate-followup',
    name: 'Generate Followup Message',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [672, baseY],
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Generate contextual follow-up message based on stage and timing
const conv = $input.item.json;
const hoursSince = Math.round(conv.hours_since_reply);
const followupCount = conv.followup_count || 0;
const stage = conv.conversation_stage || 'unknown';
const propertyName = conv.property_name || 'the property';

// Parse collected data
let collected = {};
try {
  collected = typeof conv.collected_data === 'string'
    ? JSON.parse(conv.collected_data)
    : (conv.collected_data || {});
} catch(e) { collected = {}; }

const guestName = collected.guest_name || collected.name || '';
const nameGreeting = guestName ? \`Hey \${guestName}!\` : 'Hey there!';

let message = '';

if (followupCount === 0) {
  // 1 hour follow-up - gentle check-in
  if (stage === 'welcome' || stage === 'welcome_done' || stage === 'name_collected') {
    message = \`\${nameGreeting} Just checking in - still looking for a place to stay? I'd love to help you find something perfect!\`;
  } else if (stage === 'dates_collected' || stage === 'options_shown') {
    message = \`\${nameGreeting} Did you have any questions about \${propertyName}? I'm here if you need any details!\`;
  } else if (stage === 'price_revealed') {
    message = \`\${nameGreeting} Just wanted to make sure you saw the pricing info I sent. Any thoughts? I'm happy to answer questions!\`;
  } else {
    message = \`\${nameGreeting} Just following up on our chat - anything I can help you with?\`;
  }
} else if (followupCount === 1) {
  // 5 hour follow-up - add value
  if (stage === 'price_revealed') {
    message = \`\${nameGreeting} Those dates at \${propertyName} are still looking good! Want me to hold them for you while you decide?\`;
  } else {
    message = \`\${nameGreeting} Still around if you have questions about staying with us! What dates were you thinking?\`;
  }
} else if (followupCount === 2) {
  // 24 hour follow-up - create gentle urgency
  if (stage === 'price_revealed' || stage === 'options_shown') {
    message = \`\${nameGreeting} Quick heads up - \${propertyName} has been getting some interest for those dates. Just wanted to make sure you don't miss out if you're still interested!\`;
  } else {
    message = \`\${nameGreeting} Hey! Hope you're having a great day. Still thinking about a getaway? I'd love to help you find something perfect!\`;
  }
} else if (followupCount === 3) {
  // 48 hour follow-up - final gentle touch
  message = \`\${nameGreeting} Just a final check-in! If you ever want to revisit your staycation plans, I'm here. Have a wonderful day!\`;
}

return {
  conversation_id: conv.conversation_id,
  contact_id: conv.contact_id,
  channel: conv.channel || 'telegram',
  customer_id: conv.customer_id,
  followup_message: message,
  followup_count: followupCount + 1,
  stage: stage,
  hours_since_reply: hoursSince
};`
    }
  };

  // 5. Update Followup Count (PostgreSQL)
  const updateCount = {
    id: 'update-followup-count',
    name: 'Update Followup Count',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [896, baseY],
    credentials: {
      postgres: { id: PG_CREDENTIAL_ID, name: '[Client] PostgreSQL' }
    },
    parameters: {
      operation: 'executeQuery',
      query: "=UPDATE conversations SET \n  followup_count = {{ $json.followup_count }},\n  collected_data = COALESCE(collected_data, '{}'::jsonb) || json_build_object('followup_count', {{ $json.followup_count }})::jsonb,\n  followup_exhausted = CASE WHEN {{ $json.followup_count }} >= 4 THEN true ELSE false END,\n  updated_at = NOW()\nWHERE conversation_id = '{{ $json.conversation_id }}'\nRETURNING conversation_id",
      options: { queryBatching: 'independently' }
    }
  };

  // 6. Send Followup via V4 Messenger (Execute Workflow → V4 SUB!)
  const sendFollowup = {
    id: 'send-followup',
    name: 'Send Followup Message',
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1.2,
    position: [1120, baseY],
    parameters: {
      workflowId: {
        __rl: true,
        mode: 'id',
        value: V4_SUB_MESSENGER  // Points to V4 SUB, not V5!
      },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          channel: "={{ $json.channel }}",
          sender_id: "={{ $json.contact_id }}",
          input: "={{ $json.followup_message }}",
          customer_id: "={{ $json.customer_id }}"
        },
        schema: [
          { id: 'channel', displayName: 'channel', type: 'string', required: true },
          { id: 'sender_id', displayName: 'sender_id', type: 'string', required: true },
          { id: 'input', displayName: 'input', type: 'string', required: true },
          { id: 'customer_id', displayName: 'customer_id', type: 'string', required: false }
        ]
      }
    }
  };

  // 7. Log Followup Sent (PostgreSQL)
  const logFollowup = {
    id: 'log-followup',
    name: 'Log Followup Sent',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position: [1344, baseY],
    credentials: {
      postgres: { id: PG_CREDENTIAL_ID, name: '[Client] PostgreSQL' }
    },
    parameters: {
      operation: 'executeQuery',
      query: "=INSERT INTO activity_log (log_id, event_type, contact_id, channel, message, created_at)\nVALUES (\n  '{{ $runId }}',\n  'followup_sent',\n  '{{ $json.contact_id }}',\n  '{{ $json.channel }}',\n  'Followup #{{ $json.followup_count }} sent',\n  NOW()\n)",
      options: { queryBatching: 'independently' }
    },
    onError: 'continueRegularOutput',
  };

  // Add all 7 nodes
  wf.nodes.push(followupTrigger, getFollowups, hasFollowups,
                 generateFollowup, updateCount, sendFollowup, logFollowup);

  // --- B. Add connections for follow-up pipeline ---
  wf.connections['Followup Check (Every 30 min)'] = {
    main: [[{ node: 'Get Conversations Needing Followup', type: 'main', index: 0 }]]
  };
  wf.connections['Get Conversations Needing Followup'] = {
    main: [[{ node: 'Has Conversations to Follow Up?', type: 'main', index: 0 }]]
  };
  wf.connections['Has Conversations to Follow Up?'] = {
    main: [
      [{ node: 'Generate Followup Message', type: 'main', index: 0 }],
      [] // FALSE path - do nothing
    ]
  };
  wf.connections['Generate Followup Message'] = {
    main: [[{ node: 'Update Followup Count', type: 'main', index: 0 }]]
  };
  wf.connections['Update Followup Count'] = {
    main: [[{ node: 'Send Followup Message', type: 'main', index: 0 }]]
  };
  wf.connections['Send Followup Message'] = {
    main: [[{ node: 'Log Followup Sent', type: 'main', index: 0 }]]
  };

  console.log('  ✓ 7 follow-up pipeline nodes added');

  // --- C. Push to n8n ---
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  };

  const result = await updateWorkflow(V4_WF6, updateBody);
  console.log(`  ✓ WF6 updated: ${result.nodes?.length || 'unknown'} nodes`);
  return true;
}

// ─── MAIN ───────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Applying V5 improvements to V4 workflows       ║');
  console.log('║  Changes: Conversation flow, typing delay,      ║');
  console.log('║           follow-ups, memory window = 20        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    // Step 1: Update WF1
    await updateWF1();

    // Step 2: Update SUB Messenger
    await updateSUBMessenger();

    // Step 3: Update WF6
    await updateWF6();

    console.log('\n══════ ALL DONE ══════');
    console.log('✓ V4 WF1: 6-stage conversation flow + memory window 20');
    console.log('✓ V4 SUB: Human typing delay (1.5-6s)');
    console.log('✓ V4 WF6: Smart follow-up scheduler (1h/5h/24h/48h)');
    console.log('\nAll changes applied to V4 (ACTIVE) workflows.');
    console.log('V5 workflows remain INACTIVE and untouched.');
  } catch (err) {
    console.error('\n✗ ERROR:', err.message);
    if (err.message.includes('HTTP')) {
      console.error('  Full error:', err.message);
    }
    process.exit(1);
  }
}

main();

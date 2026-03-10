# Issue 8: Context Window Sliding Window Patch

## Problem
Workflow 22 (Active Booking Handler / Active Guest AI Concierge) sends full conversation history to OpenAI without truncation. Long stays with many messages could exceed token limits, causing API errors.

## Impact
- OpenAI API errors on long conversations
- Workflow failures for engaged guests
- Lost context when conversation gets too long
- Increased API costs from oversized requests

## Solution
Implement a sliding window approach:
1. Keep last 20 messages in full detail
2. Summarize older messages into a context block
3. Always include essential booking/property info
4. Truncate individual messages if needed

---

## Patch Location

**Workflow:** Workflow 22 (Active Guest AI Concierge)

**Insert Before:** Step 4 (OpenAI Agent Request)

**Modify:** The code that prepares conversation context for AI

---

## Code Patch

### New Node: "Prepare Context with Sliding Window"

Add this Code node before the OpenAI request:

```json
{
  "parameters": {
    "jsCode": "// ISSUE 8 FIX: Implement sliding window for conversation context\n// Prevents token overflow on long stays\n\nconst bookingData = $('Get Booking Data').item.json;\nconst propertyConfig = $('Get Property Configuration').item.json;\nconst workflowConfig = $('Workflow Configuration').item.json;\n\n// Configuration\nconst MAX_RECENT_MESSAGES = 20;  // Keep last 20 in full detail\nconst MAX_MESSAGE_LENGTH = 500;   // Truncate long individual messages\nconst MAX_SUMMARY_LENGTH = 1000;  // Max length for summary of old messages\n\n// Parse existing conversation history\nlet conversationHistory = [];\ntry {\n  conversationHistory = JSON.parse(bookingData.conversation_history || '[]');\n} catch (e) {\n  conversationHistory = [];\n}\n\n// Split into old and recent messages\nlet oldMessages = [];\nlet recentMessages = [];\n\nif (conversationHistory.length > MAX_RECENT_MESSAGES) {\n  oldMessages = conversationHistory.slice(0, -MAX_RECENT_MESSAGES);\n  recentMessages = conversationHistory.slice(-MAX_RECENT_MESSAGES);\n} else {\n  recentMessages = conversationHistory;\n}\n\n// Summarize old messages if they exist\nlet contextSummary = '';\nif (oldMessages.length > 0) {\n  // Extract key topics from old messages\n  const topics = new Set();\n  const requests = [];\n  const issues = [];\n  \n  for (const msg of oldMessages) {\n    const content = (msg.content || '').toLowerCase();\n    \n    // Detect topics\n    if (content.includes('wifi') || content.includes('internet')) topics.add('WiFi inquiry');\n    if (content.includes('checkout') || content.includes('check out') || content.includes('check-out')) topics.add('Checkout discussed');\n    if (content.includes('checkin') || content.includes('check in') || content.includes('check-in')) topics.add('Check-in discussed');\n    if (content.includes('clean')) topics.add('Cleaning mentioned');\n    if (content.includes('maintenance') || content.includes('repair') || content.includes('broken')) {\n      topics.add('Maintenance issue');\n      if (msg.role === 'user') issues.push(content.substring(0, 100));\n    }\n    if (content.includes('extend') || content.includes('extension') || content.includes('stay longer')) topics.add('Extension inquiry');\n    if (content.includes('discount') || content.includes('price')) topics.add('Pricing discussed');\n    if (content.includes('parking')) topics.add('Parking discussed');\n    if (content.includes('key') || content.includes('door') || content.includes('lock')) topics.add('Access discussed');\n    \n    // Track specific requests\n    if (msg.control_signal && msg.control_signal !== 'NONE') {\n      requests.push(msg.control_signal);\n    }\n  }\n  \n  contextSummary = `[CONVERSATION SUMMARY - ${oldMessages.length} earlier messages]\\n`;\n  contextSummary += `Topics discussed: ${Array.from(topics).join(', ') || 'General inquiries'}\\n`;\n  if (requests.length > 0) {\n    contextSummary += `Previous requests: ${[...new Set(requests)].join(', ')}\\n`;\n  }\n  if (issues.length > 0) {\n    contextSummary += `Previous issues mentioned: ${issues.slice(0, 2).join('; ')}\\n`;\n  }\n  contextSummary += `[END SUMMARY]\\n\\n`;\n  \n  // Truncate if too long\n  if (contextSummary.length > MAX_SUMMARY_LENGTH) {\n    contextSummary = contextSummary.substring(0, MAX_SUMMARY_LENGTH) + '...[truncated]\\n\\n';\n  }\n}\n\n// Truncate individual recent messages if needed\nconst truncatedRecentMessages = recentMessages.map(msg => {\n  let content = msg.content || '';\n  if (content.length > MAX_MESSAGE_LENGTH) {\n    content = content.substring(0, MAX_MESSAGE_LENGTH) + '...[truncated]';\n  }\n  return {\n    role: msg.role,\n    content: content,\n    timestamp: msg.timestamp\n  };\n});\n\n// Build essential booking context (always included)\nconst essentialContext = {\n  guest_name: bookingData.guest_name,\n  property_name: propertyConfig.property_name,\n  check_in_date: bookingData.check_in_date,\n  check_out_date: bookingData.check_out_date,\n  current_day: new Date().toISOString().split('T')[0],\n  door_code: propertyConfig.door_code,\n  wifi_network: propertyConfig.wifi_network,\n  wifi_password: propertyConfig.wifi_password,\n  parking_instructions: propertyConfig.parking_instructions?.substring(0, 200),\n  check_in_time: propertyConfig.check_in_time,\n  check_out_time: propertyConfig.check_out_time,\n  house_rules_summary: propertyConfig.house_rules?.substring(0, 300)\n};\n\n// Format for OpenAI messages array\nconst formattedMessages = [];\n\n// Add summary of old messages if exists\nif (contextSummary) {\n  formattedMessages.push({\n    role: 'system',\n    content: contextSummary\n  });\n}\n\n// Add recent messages\nfor (const msg of truncatedRecentMessages) {\n  formattedMessages.push({\n    role: msg.role === 'user' ? 'user' : 'assistant',\n    content: msg.content\n  });\n}\n\n// Add current guest message\nformattedMessages.push({\n  role: 'user',\n  content: workflowConfig.guest_message\n});\n\nreturn {\n  prepared_messages: formattedMessages,\n  essential_context: essentialContext,\n  context_stats: {\n    total_history_messages: conversationHistory.length,\n    summarized_messages: oldMessages.length,\n    recent_messages_kept: recentMessages.length,\n    summary_applied: oldMessages.length > 0,\n    estimated_tokens: Math.ceil((JSON.stringify(formattedMessages).length + JSON.stringify(essentialContext).length) / 4)\n  },\n  booking_id: bookingData.booking_id,\n  channel_type: workflowConfig.channel_type\n};"
  },
  "id": "prepare-context-sliding-window",
  "name": "Prepare Context with Sliding Window",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [660, 0]
}
```

---

### Build Messages Array Node

After the sliding window preparation, create the full messages array:

```json
{
  "parameters": {
    "jsCode": "// Build the complete messages array for OpenAI\nconst slidingWindow = $('Prepare Context with Sliding Window').item.json;\n\n// Start with system prompt containing essential context\nconst systemPrompt = `You are a helpful vacation rental concierge assistant. You are currently helping a guest during their stay.\n\nGUEST INFO:\n- Name: ${slidingWindow.essential_context.guest_name}\n- Check-in: ${slidingWindow.essential_context.check_in_date}\n- Check-out: ${slidingWindow.essential_context.check_out_date}\n- Today: ${slidingWindow.essential_context.current_day}\n\nPROPERTY QUICK REFERENCE:\n- Door Code: ${slidingWindow.essential_context.door_code}\n- WiFi: ${slidingWindow.essential_context.wifi_network} / ${slidingWindow.essential_context.wifi_password}\n- Check-in Time: ${slidingWindow.essential_context.check_in_time}\n- Check-out Time: ${slidingWindow.essential_context.check_out_time}\n- Parking: ${slidingWindow.essential_context.parking_instructions || 'See property guide'}\n\nRespond helpfully and concisely. If the guest reports an issue, use appropriate control signal.\n\nControl signals: CREATE_MAINTENANCE, REQUEST_SUPPLIES, CHECK_EXTENSION, LATE_CHECKOUT, EARLY_CHECKOUT, MID_STAY_CLEANING, ESCALATE_TO_CONTACT, NONE\n\nRespond in JSON: {\"response_text\": \"message\", \"control_signal\": \"SIGNAL\", \"metadata\": \"details if needed\"}`;\n\n// Build full messages array\nconst messages = [\n  { role: 'system', content: systemPrompt },\n  ...slidingWindow.prepared_messages\n];\n\nreturn {\n  messages: messages,\n  context_stats: slidingWindow.context_stats,\n  booking_id: slidingWindow.booking_id,\n  channel_type: slidingWindow.channel_type\n};"
  },
  "id": "build-messages-array",
  "name": "Build Messages Array",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [880, 0]
}
```

---

### RECOMMENDED: HTTP Request to OpenAI API

**Use this approach to properly pass the sliding window messages:**

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.openai.com/v1/chat/completions",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "openAiApi",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"model\": \"gpt-4o-mini\",\n  \"messages\": {{ JSON.stringify($('Build Messages Array').item.json.messages) }},\n  \"response_format\": { \"type\": \"json_object\" },\n  \"max_tokens\": 500\n}"
  },
  "id": "openai-http-request",
  "name": "OpenAI API Request",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [1100, 0],
  "credentials": {
    "openAiApi": {
      "id": "openai-credential-id",
      "name": "OpenAI"
    }
  }
}
```

---

### New Node: "Log Context Stats" (Optional)

Track context window usage for monitoring:

```json
{
  "parameters": {
    "jsCode": "// Log context window stats for monitoring\nconst stats = $('Prepare Context with Sliding Window').item.json.context_stats;\n\n// Only log if summary was applied (long conversation)\nif (stats.summary_applied) {\n  console.log(`[Context Window] Booking ${$('Prepare Context with Sliding Window').item.json.booking_id}: ${stats.summarized_messages} messages summarized, ${stats.recent_messages_kept} kept, ~${stats.estimated_tokens} tokens`);\n}\n\nreturn $input.all();"
  },
  "id": "log-context-stats",
  "name": "Log Context Stats",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1100, 0]
}
```

---

## Connection Changes

1. **Insert:** `Prepare Context with Sliding Window` between data retrieval and OpenAI call
2. **Connect:** `Get Property Configuration` → `Prepare Context with Sliding Window`
3. **Connect:** `Prepare Context with Sliding Window` → `Build Messages Array`
4. **Connect:** `Build Messages Array` → `OpenAI API Request` (HTTP Request node)
5. **Optionally Connect:** After OpenAI response → `Log Context Stats` → Continue flow

---

## Visual Workflow Change

```
BEFORE:
Get Booking Data + Get Property Configuration 
    ↓
OpenAI Agent (with full conversation history)
    ↓
Parse AI Response

AFTER:
Get Booking Data + Get Property Configuration 
    ↓
Prepare Context with Sliding Window
    ↓
Build Messages Array
    ↓
OpenAI API Request (HTTP - uses sliding window messages)
    ↓
(Optional) Log Context Stats
    ↓
Parse AI Response
```

---

## Configuration Options

Adjust these constants in the code based on your needs:

| Setting | Default | Description |
|---------|---------|-------------|
| MAX_RECENT_MESSAGES | 20 | Number of recent messages to keep in full |
| MAX_MESSAGE_LENGTH | 500 | Truncate individual messages longer than this |
| MAX_SUMMARY_LENGTH | 1000 | Maximum characters for old message summary |

**Token Estimates:**
- gpt-4o-mini: ~128k context window
- Safe target: ~4000 tokens for conversation context
- Leaves room for: system prompt, property info, response

---

## Testing Checklist

- [ ] Short conversation (< 20 messages) → No summary, all messages included
- [ ] Long conversation (> 20 messages) → Summary created, recent 20 kept
- [ ] Very long message (> 500 chars) → Truncated with indicator
- [ ] Summary includes relevant topics (WiFi, maintenance, etc.)
- [ ] AI still has context from summarized messages
- [ ] No OpenAI token errors on 50+ message conversations
- [ ] Context stats logged correctly
- [ ] Essential booking info always included

---

## Example Summary Output

For a 35-message conversation:

```
[CONVERSATION SUMMARY - 15 earlier messages]
Topics discussed: WiFi inquiry, Check-in discussed, Parking discussed
Previous requests: None
[END SUMMARY]

[Recent 20 messages follow in full...]
```

---

## Rollback

To rollback this patch:
1. Delete node: `Prepare Context with Sliding Window`
2. Delete node: `Log Context Stats` (if added)
3. Restore original OpenAI node configuration
4. Reconnect: Data retrieval → OpenAI Agent directly

---

*Patch created for Issue 8: Context Window Sliding Window*

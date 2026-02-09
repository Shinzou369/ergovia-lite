# Ergovia Workflow Architecture Guide

A comprehensive guide for building n8n workflow systems for any business niche. This document covers the architecture patterns, deployment system, and best practices used in the Ergovia platform.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Workflow Structure](#workflow-structure)
3. [Naming Conventions](#naming-conventions)
4. [Dependency System](#dependency-system)
5. [Workflow References](#workflow-references)
6. [Credential Management](#credential-management)
7. [Deployment System](#deployment-system)
8. [Creating New Niche Workflows](#creating-new-niche-workflows)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### The Hub-and-Spoke Model

The Ergovia workflow system uses a **hub-and-spoke architecture** where:

```
                    ┌─────────────────────┐
                    │   WF1: AI Gateway   │  ← Entry Point (Hub)
                    │   (Unified Entry)   │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ WF2: Booking│     │ WF3: Calendar│     │ WF4: Payment│
    │   Agent     │     │   Manager    │     │  Processor  │
    └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  SUB: Universal     │  ← Shared Sub-Workflow
                    │     Messenger       │
                    └─────────────────────┘
```

### Key Components

| Component | Purpose | Example |
|-----------|---------|---------|
| **Gateway (WF1)** | Single entry point that routes all incoming messages | AI Gateway with tool-based routing |
| **Specialized Workflows (WF2-WF8)** | Handle specific business domains | Booking, Calendar, Payment, Operations |
| **Sub-Workflows (SUB)** | Reusable utility functions called by multiple workflows | Universal Messenger |

### Benefits

1. **Single Entry Point**: All messages enter through one workflow, simplifying webhook management
2. **AI-Powered Routing**: The gateway uses AI to determine user intent and route to appropriate workflows
3. **Reusability**: Sub-workflows eliminate code duplication
4. **Modularity**: Each workflow can be updated independently
5. **Scalability**: New features are added as new workflows without touching existing ones

---

## Workflow Structure

### Standard Workflow Template

Every workflow follows this structure:

```json
{
  "name": "WF#: Workflow Name",
  "nodes": [
    // Trigger nodes (webhooks, schedules, or executeWorkflowTrigger)
    // Processing nodes (code, database, AI)
    // Action nodes (send messages, update data)
    // Response nodes (return data to caller)
  ],
  "connections": {
    // Node connections defining the flow
  },
  "active": true,
  "settings": { "executionOrder": "v1" },
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "optimized-v2",
    "description": "Description of what this workflow does"
  },
  "tags": ["category", "feature", "optimized"]
}
```

### Node Categories

#### 1. Trigger Nodes (Entry Points)

```json
// Called by other workflows (sub-workflow pattern)
{
  "parameters": { "inputSource": "passthrough" },
  "name": "When Called by Other Workflow",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1.1
}

// Scheduled execution
{
  "parameters": {
    "rule": { "interval": [{ "triggerAtHour": 9 }] }
  },
  "name": "Daily 9 AM",
  "type": "n8n-nodes-base.scheduleTrigger",
  "typeVersion": 1.2
}

// External webhook
{
  "parameters": {
    "updates": ["message", "callback_query"]
  },
  "name": "Telegram Trigger",
  "type": "n8n-nodes-base.telegramTrigger",
  "typeVersion": 1.2,
  "credentials": {
    "telegramApi": { "id": "telegram-cred", "name": "Telegram Bot" }
  }
}
```

#### 2. Processing Nodes

```json
// Code node for business logic
{
  "parameters": {
    "mode": "runOnceForEachItem",
    "jsCode": "// Your JavaScript logic here\nreturn $input.item.json;"
  },
  "name": "Process Data",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2
}

// Database query
{
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT * FROM table WHERE id = $1",
    "additionalFields": {
      "queryParameters": "={{ { \"parameters\": [$json.id] } }}"
    }
  },
  "name": "Query Database",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "credentials": {
    "postgres": { "id": "postgres-cred", "name": "PostgreSQL" }
  }
}

// AI Agent for intelligent processing
{
  "parameters": {
    "agent": "toolsAgent",
    "promptType": "define",
    "text": "Your AI prompt here...",
    "options": { "maxIterations": 3 }
  },
  "name": "AI Agent",
  "type": "@n8n/n8n-nodes-langchain.agent",
  "typeVersion": 1.7
}
```

#### 3. Routing Nodes

```json
// Switch node for multi-path routing
{
  "parameters": {
    "rules": {
      "values": [
        {
          "conditions": {
            "conditions": [{
              "leftValue": "={{ $json.type }}",
              "rightValue": "booking",
              "operator": { "type": "string", "operation": "equals" }
            }]
          },
          "renameOutput": true,
          "outputKey": "booking"
        }
      ]
    }
  },
  "name": "Route by Type",
  "type": "n8n-nodes-base.switch",
  "typeVersion": 3.2
}

// If node for binary decisions
{
  "parameters": {
    "conditions": {
      "conditions": [{
        "leftValue": "={{ $json.has_error }}",
        "rightValue": true,
        "operator": { "type": "boolean", "operation": "equals" }
      }]
    }
  },
  "name": "Has Error?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2
}
```

#### 4. Sub-Workflow Calls

```json
// Execute another workflow
{
  "parameters": {
    "workflowId": {
      "__rl": true,
      "mode": "list",
      "value": "SUB: Universal Messenger",
      "cachedResultName": "SUB: Universal Messenger"
    },
    "options": {}
  },
  "name": "Send Message",
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.2
}

// Tool workflow for AI agents
{
  "parameters": {
    "name": "send_message",
    "description": "Send a message to the user",
    "workflowId": {
      "__rl": true,
      "mode": "list",
      "value": "SUB: Universal Messenger",
      "cachedResultName": "SUB: Universal Messenger"
    }
  },
  "name": "Send Message Tool",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 2.2
}
```

---

## Naming Conventions

### Workflow Names

| Prefix | Purpose | Example |
|--------|---------|---------|
| `WF1`, `WF2`, etc. | Main workflows, numbered by priority | `WF1: AI Gateway` |
| `SUB:` | Reusable sub-workflows | `SUB: Universal Messenger` |

### File Names

```
SUB_Universal_Messenger.json   # Sub-workflow
WF1_AI_Gateway.json            # Main workflows in order
WF2_AI_Booking_Agent.json
WF3_Calendar_Manager.json
...
```

### Node IDs

Use descriptive, kebab-case IDs:

```json
"id": "normalize-input"
"id": "route-by-type"
"id": "send-alert"
"id": "ai-booking-agent"
```

### Credential IDs (Placeholders)

Use consistent placeholder IDs that the deployment system replaces:

```
postgres-cred     → PostgreSQL database
openai-cred       → OpenAI API
telegram-cred     → Telegram Bot
whatsapp-cred     → WhatsApp Business
twilio-cred       → Twilio SMS
stripe-cred       → Stripe Payments
```

---

## Dependency System

### Dependency Graph

The system defines a clear dependency hierarchy:

```javascript
// From n8n.js - getWorkflowDependencyOrder()
[
  // Layer 1: No dependencies - deploy first
  { filename: 'SUB_Universal_Messenger.json', name: 'SUB: Universal Messenger', dependencies: [] },

  // Layer 2: Only depends on SUB
  { filename: 'WF3_Calendar_Manager.json', name: 'WF3: Calendar Manager', dependencies: ['SUB: Universal Messenger'] },
  { filename: 'WF4_Payment_Processor.json', name: 'WF4: Payment Processor', dependencies: ['SUB: Universal Messenger'] },
  { filename: 'WF5_Property_Operations.json', name: 'WF5: Property Operations', dependencies: ['SUB: Universal Messenger'] },
  { filename: 'WF6_Daily_Automations.json', name: 'WF6: Daily Automations', dependencies: ['SUB: Universal Messenger'] },
  { filename: 'WF8_Safety_Screening.json', name: 'WF8: Safety & Screening', dependencies: ['SUB: Universal Messenger'] },

  // Layer 3: Depends on other WFs
  { filename: 'WF7_Integration_Hub.json', name: 'WF7: Integration Hub', dependencies: ['WF3: Calendar Manager'] },

  // Layer 4: Multiple dependencies
  { filename: 'WF2_AI_Booking_Agent.json', name: 'WF2: AI Booking Agent', dependencies: ['SUB: Universal Messenger', 'WF3: Calendar Manager', 'WF4: Payment Processor'] },

  // Layer 5: Gateway depends on all
  { filename: 'WF1_AI_Gateway.json', name: 'WF1: AI Gateway', dependencies: ['SUB: Universal Messenger', 'WF2: AI Booking Agent', 'WF3: Calendar Manager', 'WF4: Payment Processor', 'WF5: Property Operations', 'WF8: Safety & Screening'] }
]
```

### Why Order Matters

When creating workflows via the n8n API, workflow references need actual IDs. By deploying in dependency order:

1. **SUB** is created first → we get its ID (e.g., `abc123`)
2. **WF3** references SUB → we inject `abc123` before creating WF3
3. **WF1** references all → all IDs are available to inject

---

## Workflow References

### Reference Format in Templates

Templates use workflow **names** as placeholders:

```json
{
  "workflowId": {
    "__rl": true,
    "mode": "list",
    "value": "SUB: Universal Messenger",
    "cachedResultName": "SUB: Universal Messenger"
  }
}
```

### Reference Format After Deployment

The deployment system transforms these to actual IDs:

```json
{
  "workflowId": {
    "__rl": true,
    "mode": "list",
    "value": "abc123def456",
    "cachedResultName": "SUB: Universal Messenger",
    "cachedResultUrl": "/workflow/abc123def456"
  }
}
```

### ID Injection Process

```javascript
// From n8n.js - injectWorkflowIds()
injectWorkflowIds(workflow, workflowIdMap) {
  workflow.nodes = workflow.nodes.map(node => {
    if (node.type === 'n8n-nodes-base.executeWorkflow' ||
        node.type === '@n8n/n8n-nodes-langchain.toolWorkflow') {

      const workflowRef = node.parameters?.workflowId;
      if (workflowRef?.mode === 'list' && workflowRef.value) {
        const referencedName = workflowRef.value;
        const actualId = workflowIdMap[referencedName];

        if (actualId) {
          node.parameters.workflowId = {
            __rl: true,
            mode: 'list',
            value: actualId,
            cachedResultName: referencedName,
            cachedResultUrl: `/workflow/${actualId}`
          };
        }
      }
    }
    return node;
  });
  return workflow;
}
```

---

## Credential Management

### Placeholder Credentials

Workflows use placeholder credential IDs that are replaced during deployment:

```json
{
  "credentials": {
    "postgres": { "id": "postgres-cred", "name": "PostgreSQL" }
  }
}
```

### Credential Types

| Placeholder | n8n Credential Type | Required Data |
|-------------|---------------------|---------------|
| `postgres-cred` | `postgres` | host, database, user, password, port, ssl |
| `openai-cred` | `openAiApi` | apiKey |
| `telegram-cred` | `telegramApi` | accessToken |
| `whatsapp-cred` | `whatsAppBusinessCloudApi` | accessToken, phoneNumberId, businessAccountId |
| `twilio-cred` | `twilioApi` | accountSid, authToken |

### Credential Injection

```javascript
// From n8n.js - injectCredentialIds()
injectCredentialIds(workflow, clientCredentials, developerCredentials) {
  const credentialIdMapping = {
    'postgres-cred': developerCredentials.postgres,
    'openai-cred': developerCredentials.openai,
    'telegram-cred': clientCredentials.telegram,
    'whatsapp-cred': clientCredentials.whatsapp,
    'twilio-cred': clientCredentials.twilio
  };

  workflow.nodes = workflow.nodes.map(node => {
    if (node.credentials) {
      for (const [credKey, credValue] of Object.entries(node.credentials)) {
        const actualId = credentialIdMapping[credValue.id];
        if (actualId) {
          node.credentials[credKey] = { ...credValue, id: actualId };
        }
      }
    }
    return node;
  });
  return workflow;
}
```

---

## Deployment System

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PROCESS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Test n8n Connection                                         │
│     └─→ Verify API access                                       │
│                                                                 │
│  2. Create Credentials in n8n                                   │
│     └─→ PostgreSQL, OpenAI, Telegram, etc.                      │
│     └─→ Store credential IDs                                    │
│                                                                 │
│  3. Deploy Workflows in Order                                   │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ For each workflow in dependency order:                  │ │
│     │   a. Load template from JSON file                       │ │
│     │   b. Personalize with client data                       │ │
│     │   c. Inject credential IDs                              │ │
│     │   d. Inject workflow IDs (from previously deployed)     │ │
│     │   e. Create workflow via n8n API                        │ │
│     │   f. Store returned workflow ID in map                  │ │
│     │   g. Activate workflow                                  │ │
│     │   h. Wait 2s (rate limiting)                            │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  4. Return Summary                                              │
│     └─→ Workflow ID map, success/failure counts                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoint

```javascript
// POST /api/deploy
app.post('/api/deploy', async (req, res) => {
  // 1. Validate prerequisites
  // 2. Create credentials
  // 3. Deploy with ID resolution
  const result = await n8nService.deployAllWorkflowsWithIdResolution(
    clientData,
    apiKey,
    clientCredentials,
    developerCredentials
  );
  // 4. Save to database
  // 5. Return result
});
```

### Deployment Output

```javascript
{
  success: true,
  deployed: 9,
  failed: 0,
  total: 9,
  workflows: [
    { filename: 'SUB_Universal_Messenger.json', workflowId: 'abc123', active: true },
    { filename: 'WF3_Calendar_Manager.json', workflowId: 'def456', active: true },
    // ...
  ],
  workflowIdMap: {
    'SUB: Universal Messenger': 'abc123',
    'WF3: Calendar Manager': 'def456',
    // ...
  }
}
```

---

## Creating New Niche Workflows

### Step 1: Define Your Niche Domain

Example: **Restaurant Management**

| Domain Area | Workflow | Purpose |
|-------------|----------|---------|
| Entry Point | WF1: AI Gateway | Route customer inquiries |
| Reservations | WF2: Reservation Agent | Handle bookings |
| Menu | WF3: Menu Manager | Manage menu items, specials |
| Orders | WF4: Order Processor | Process takeout/delivery |
| Kitchen | WF5: Kitchen Operations | Track orders, inventory |
| Reviews | WF6: Review Manager | Monitor and respond to reviews |
| Messaging | SUB: Universal Messenger | Send confirmations |

### Step 2: Map Dependencies

```javascript
[
  { filename: 'SUB_Universal_Messenger.json', dependencies: [] },
  { filename: 'WF3_Menu_Manager.json', dependencies: ['SUB: Universal Messenger'] },
  { filename: 'WF4_Order_Processor.json', dependencies: ['SUB: Universal Messenger', 'WF3: Menu Manager'] },
  { filename: 'WF5_Kitchen_Operations.json', dependencies: ['SUB: Universal Messenger'] },
  { filename: 'WF6_Review_Manager.json', dependencies: ['SUB: Universal Messenger'] },
  { filename: 'WF2_Reservation_Agent.json', dependencies: ['SUB: Universal Messenger', 'WF3: Menu Manager'] },
  { filename: 'WF1_AI_Gateway.json', dependencies: ['SUB: Universal Messenger', 'WF2: Reservation Agent', 'WF3: Menu Manager', 'WF4: Order Processor', 'WF5: Kitchen Operations'] }
]
```

### Step 3: Create the Gateway

```json
{
  "name": "WF1: AI Gateway - Restaurant",
  "nodes": [
    // Multi-channel triggers (Telegram, WhatsApp, SMS)
    {
      "parameters": { "updates": ["message", "callback_query"] },
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger"
    },

    // Normalize input from any channel
    {
      "parameters": {
        "jsCode": "// Normalize to standard format\nreturn { channel, sender_id, message_text };"
      },
      "name": "Normalize Input",
      "type": "n8n-nodes-base.code"
    },

    // AI Agent with tools
    {
      "parameters": {
        "options": {
          "systemMessage": "You are a restaurant assistant. Help customers with reservations, menu questions, orders, and reviews."
        }
      },
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent"
    },

    // Tool workflows
    {
      "parameters": {
        "name": "reservation_agent",
        "description": "Handle table reservations",
        "workflowId": { "__rl": true, "mode": "list", "value": "WF2: Reservation Agent" }
      },
      "name": "Reservation Tool",
      "type": "@n8n/n8n-nodes-langchain.toolWorkflow"
    }
    // ... more tools
  ]
}
```

### Step 4: Create Specialized Workflows

Each workflow follows the pattern:

1. **Trigger**: `executeWorkflowTrigger` for being called as a tool
2. **Normalize**: Process incoming data
3. **Route**: Switch based on operation type
4. **Process**: Business logic (DB queries, AI processing)
5. **Respond**: Send messages via SUB, return data

### Step 5: Create the Sub-Workflow

The Universal Messenger pattern works for any niche:

```json
{
  "name": "SUB: Universal Messenger",
  "nodes": [
    { "name": "When Called", "type": "n8n-nodes-base.executeWorkflowTrigger" },
    { "name": "Normalize Input", "type": "n8n-nodes-base.code" },
    { "name": "Route by Channel", "type": "n8n-nodes-base.switch" },
    { "name": "Send Telegram", "type": "n8n-nodes-base.telegram" },
    { "name": "Send WhatsApp", "type": "n8n-nodes-base.whatsApp" },
    { "name": "Send SMS", "type": "n8n-nodes-base.twilio" },
    { "name": "Format Response", "type": "n8n-nodes-base.code" }
  ]
}
```

### Step 6: Update the Service

Add your niche's workflow order to `n8n.js`:

```javascript
// In N8NService constructor
this.allWorkflows = [
  'SUB_Universal_Messenger.json',
  'WF3_Menu_Manager.json',
  'WF4_Order_Processor.json',
  'WF5_Kitchen_Operations.json',
  'WF6_Review_Manager.json',
  'WF2_Reservation_Agent.json',
  'WF1_AI_Gateway.json'
];

// Update getWorkflowDependencyOrder() with your dependencies
```

---

## Best Practices

### 1. Always Use Sub-Workflows for Reusable Functions

```
❌ BAD: Duplicate messaging code in every workflow
✅ GOOD: Call SUB: Universal Messenger
```

### 2. Keep AI Prompts Focused

```
❌ BAD: "You are an assistant that does everything..."
✅ GOOD: "You are a reservation specialist. Handle only booking requests."
```

### 3. Use Meaningful Error Handling

```javascript
// In code nodes
try {
  // Your logic
  return { success: true, data: result };
} catch (error) {
  return {
    success: false,
    error: error.message,
    timestamp: new Date().toISOString()
  };
}
```

### 4. Parameterize Everything

Don't hardcode values. Use:
- Database lookups for business data
- Environment variables for configuration
- Workflow input parameters for customization

### 5. Log Important Events

```json
{
  "parameters": {
    "operation": "insert",
    "table": "activity_log",
    "columns": {
      "mappingMode": "defineBelow",
      "value": {
        "log_id": "={{ 'log_' + $now.toMillis() }}",
        "event_type": "={{ $json.event_type }}",
        "details": "={{ JSON.stringify($json) }}",
        "created_at": "={{ $now.toISO() }}"
      }
    }
  },
  "name": "Log Activity",
  "type": "n8n-nodes-base.postgres"
}
```

### 6. Handle Rate Limiting

The deployment system includes delays:

```javascript
const DEPLOYMENT_DELAY = 2000; // 2 seconds between workflows
await this.sleep(DEPLOYMENT_DELAY);
```

### 7. Validate Dependencies Before Processing

```javascript
const missingDeps = workflowDef.dependencies.filter(dep => !workflowIdMap[dep]);
if (missingDeps.length > 0) {
  console.error(`Missing dependencies: ${missingDeps.join(', ')}`);
  continue; // Skip this workflow
}
```

---

## Troubleshooting

### Common Issues

#### 1. Workflow Reference Not Found

**Symptom**: `WARNING: No ID found for workflow "WF3: Calendar Manager"`

**Cause**: The referenced workflow hasn't been deployed yet.

**Solution**: Check dependency order. The referenced workflow must be deployed before the referencing workflow.

#### 2. Credential Not Injected

**Symptom**: Workflow fails with "Credentials not found"

**Cause**: The credential placeholder ID doesn't match the mapping.

**Solution**: Ensure placeholder IDs in JSON match the mapping in `injectCredentialIds()`.

#### 3. Rate Limiting

**Symptom**: `429 Too Many Requests` errors

**Solution**: Increase `DEPLOYMENT_DELAY` in the deployment loop.

#### 4. Circular Dependencies

**Symptom**: Deployment never completes

**Cause**: Workflow A depends on B, and B depends on A.

**Solution**: Restructure workflows to eliminate circular dependencies. Use SUB workflows as intermediaries.

### Debug Logging

Enable verbose logging:

```javascript
console.log(`\n--- [${i + 1}/${total}] ${filename} ---`);
console.log(`  Dependencies: ${deps.join(', ') || 'none'}`);
console.log(`  Loaded: ${template.name}`);
console.log(`  Created: ID=${result.workflowId}`);
console.log(`  Registered: "${name}" -> ${id}`);
```

### Testing Individual Workflows

Test workflows in n8n directly before deploying:

1. Import the JSON file manually
2. Test with sample data
3. Verify all paths work
4. Export and update the template

---

## Appendix: File Structure

```
ergovia-lite/
├── workflows/
│   ├── SUB_Universal_Messenger.json
│   ├── WF1_AI_Gateway.json
│   ├── WF2_AI_Booking_Agent.json
│   ├── WF3_Calendar_Manager.json
│   ├── WF4_Payment_Processor.json
│   ├── WF5_Property_Operations.json
│   ├── WF6_Daily_Automations.json
│   ├── WF7_Integration_Hub.json
│   └── WF8_Safety_Screening.json
├── services/
│   └── n8n.js                 # Deployment logic
├── server.js                  # API endpoints
├── db.js                      # Database operations
└── docs/
    └── WORKFLOW_ARCHITECTURE_GUIDE.md
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01 | Initial architecture with 25 workflows |
| 2.0 | 2024-02 | Optimized to 9 workflows with AI Gateway |
| 2.1 | 2024-02 | Added ordered deployment with ID resolution |

---

*This guide is maintained as part of the Ergovia platform. For questions or contributions, refer to the main repository.*

# PROMPT 3: n8n Workflows Audit — All Deployed Workflows

> **Purpose:** Generate a complete documentation of every n8n workflow — structure, nodes, logic, and connections. Output a single Markdown file called `N8N_WORKFLOWS.md`.

---

## Context

You are auditing the **n8n workflow engine** for Ergovia Lite — an AirBNB automation system. n8n handles all AI-powered guest communication, booking management, payments, and property operations.

**n8n Access:**
- **URL:** https://n8n.ergovia-ai.com
- **Version:** 2.4.8 (Self Hosted)
- **API endpoint:** https://n8n.ergovia-ai.com/api/v1/
- **API Key:** Stored in the Express app's `.env` file as `N8N_API_KEY`

**Architecture Overview:**
The system uses a **hub-and-spoke** architecture with 10 workflows:

```
┌─────────────────────────────────┐
│  SUB Workflows (Shared Utils)   │
│  ├── SUB_Universal_Messenger    │  ← Sends messages to Telegram/WhatsApp/Email
│  └── SUB_Owner_Staff_Notifier   │  ← Notifies property owner/staff
└─────────────────────────────────┘
              ▲ called by ▲
┌─────────────────────────────────┐
│  WF1: AI Gateway (HUB)         │  ← Entry point for ALL guest messages
│  Routes to specialized WFs:     │
│  ├── WF2: Offer Conflict Mgr   │  ← Handles competing bookings
│  ├── WF3: Calendar Manager      │  ← Availability, pricing, scheduling
│  ├── WF4: Payment Processor     │  ← Payment collection & tracking
│  ├── WF5: Property Operations   │  ← Cleaning, maintenance, check-in/out
│  ├── WF6: Daily Automations     │  ← Scheduled reports & reminders
│  ├── WF7: Integration Hub       │  ← External platform sync (Airbnb, Booking.com)
│  └── WF8: Safety & Screening    │  ← Guest verification, emergency handling
└─────────────────────────────────┘
```

**Message Flow:**
```
Guest sends Telegram message
  → Telegram webhook hits WF1
    → WF1 loads property context from PostgreSQL
    → WF1 AI Agent (OpenAI GPT-4) determines intent
    → WF1 calls the appropriate WF2-WF8 via sub-workflow execution
      → Specialized WF queries/updates PostgreSQL
      → WF calls SUB_Universal_Messenger to reply to guest
      → WF calls SUB_Owner_Staff_Notifier if owner needs to know
    → Conversation saved to n8n_chat_histories table
```

---

## Your Task — Audit every workflow via the n8n API and editor. Generate `N8N_WORKFLOWS.md` with these 6 sections:

### Section 1: Inventory & Scan

**List all workflows using the API:**
```bash
# Get all workflows
curl -s -H "X-N8N-API-KEY: <api_key>" https://n8n.ergovia-ai.com/api/v1/workflows | python3 -m json.tool

# For each workflow, get full details:
curl -s -H "X-N8N-API-KEY: <api_key>" https://n8n.ergovia-ai.com/api/v1/workflows/<id> | python3 -m json.tool
```

For each workflow, document:
| Field | Details |
|-------|---------|
| Workflow ID | The n8n internal ID |
| Name | Full workflow name |
| Active | true/false (is it listening for triggers?) |
| Node Count | Total nodes |
| Trigger Type | Webhook, Schedule, Manual, or Sub-workflow call |
| Webhook URL | If applicable, the public webhook endpoint |
| Created/Updated | Timestamps |
| Tags | Any tags applied |

Also check:
- **Credentials used** — list every credential referenced across all workflows (PostgreSQL, OpenAI, Telegram, etc.)
- **Execution history** — recent executions, success/failure rates
- **Active vs inactive** — which workflows are currently active

### Section 2: How It Works

For **each workflow**, document in detail:

#### SUB_Universal_Messenger
- What triggers it (sub-workflow call)
- Input parameters expected
- Which messaging channels it supports (Telegram, WhatsApp, Email, SMS)
- How it routes to the correct channel
- Error handling

#### SUB_Owner_Staff_Notifier
- What triggers it
- Input parameters expected
- How it determines who to notify (owner vs staff)
- Notification channels used

#### WF1: AI Gateway — Unified Entry Point
- **Trigger:** Telegram webhook (document the exact webhook URL)
- **Get Customer ID node:** How it identifies the sender (SQL query against `conversations` + `property_configurations`)
- **AI Agent node:** Model used (GPT-4), system prompt content (full text), tools available
- **Tools defined:** List every tool the AI can call (e.g., check_availability, create_booking, process_payment) — for each tool, what parameters it accepts and which sub-workflow it calls
- **Chat memory:** How conversation history is stored (`n8n_chat_histories` table, session key = sender_id)
- **Property context:** What property data is loaded and injected into the AI prompt
- **Language handling:** How the response language is determined
- **Error handling:** What happens when the AI fails or a sub-workflow errors

#### WF2: Offer Conflict Manager
- How competing offers are detected
- The decision logic (timeouts, hold durations)
- How it resolves conflicts
- Database tables used

#### WF3: Calendar Manager
- How availability is checked
- How pricing is calculated (base, weekend, seasonal)
- How bookings are created/modified
- Calendar sync logic

#### WF4: Payment Processor
- Payment methods supported
- How payment status is tracked
- Currency handling
- Receipt generation

#### WF5: Property Operations
- Cleaning schedule management
- Maintenance tracking
- Check-in/check-out procedures
- How notifications are sent to cleaning staff

#### WF6: Daily Automations
- Schedule trigger (what time, what timezone)
- Daily reports generated
- Automated reminders sent
- What data is aggregated

#### WF7: Integration Hub
- External platforms connected (Airbnb, Booking.com, etc.)
- Sync direction (import only? bidirectional?)
- How listings are mapped between platforms

#### WF8: Safety & Screening
- Guest verification process
- Emergency contact handling
- Watchdog/monitoring features
- Alert escalation logic

### Section 3: Credentials & Access

Document every credential configured in n8n:

```bash
# List all credentials
curl -s -H "X-N8N-API-KEY: <api_key>" https://n8n.ergovia-ai.com/api/v1/credentials | python3 -m json.tool
```

For each credential:
| Credential | Type | Used By | Notes |
|------------|------|---------|-------|
| PostgreSQL | postgres | WF1-WF8 | Connection to ergovia-db |
| OpenAI | openAi | WF1, WF2 | GPT-4 API key |
| Telegram | telegramApi | WF1, SUB_Messenger | Bot token |
| (etc.) | | | |

Also document:
- **n8n admin login:** Where credentials are stored, how to reset
- **API key:** Where it's stored, how the Express app uses it
- **Encryption key:** `N8N_ENCRYPTION_KEY` — what it encrypts (all stored credentials)
- **JWT secret:** `N8N_USER_MANAGEMENT_JWT_SECRET` — what it does

**IMPORTANT:** Note any credentials that are placeholders vs real, and any that are expired or misconfigured.

### Section 4: Deployment & Operations

Document how to:

**Deploy/update workflows:**
- The Express app's deployment service (`services/n8n.js`) deploys workflows from JSON templates
- Deployment order matters: SUB first (3s delay) → WF3-WF8 (2s delay each) → WF2 → WF1 last
- The deployment service patches credentials, webhook URLs, and expressions during deployment
- `=` prefix rule: String parameters with `{{ }}` expressions need `=` prefix for Expression mode
- `$1/$2` conflict: NEVER add `=` prefix to SQL queries with PostgreSQL parameter placeholders

**Activate/deactivate workflows:**
```bash
# Activate
curl -X POST -H "X-N8N-API-KEY: <api_key>" https://n8n.ergovia-ai.com/api/v1/workflows/<id>/activate

# Deactivate
curl -X POST -H "X-N8N-API-KEY: <api_key>" https://n8n.ergovia-ai.com/api/v1/workflows/<id>/deactivate
```

**Common operations:**
- How to check execution history for errors
- How to manually trigger a workflow for testing
- How to view/clear chat memory (`n8n_chat_histories` table)
- How to check if webhooks are registered and responding
- How to update the AI system prompt (via Settings page sync or direct API patch)
- How to add a new property (Settings → n8n sync flow)

**Backup:**
- How to export all workflows as JSON
- How to backup the n8n data volume
- How to backup credentials (encrypted in n8n's internal DB)

### Section 5: Current Status

For each workflow:

| Workflow | Active | Last Execution | Status | Notes |
|----------|--------|---------------|--------|-------|
| SUB_Universal_Messenger | ? | ? | ? | |
| SUB_Owner_Staff_Notifier | ? | ? | ? | |
| WF1: AI Gateway | ? | ? | ? | Main entry point |
| WF2: Offer Conflict Mgr | ? | ? | ? | |
| WF3: Calendar Manager | ? | ? | ? | |
| WF4: Payment Processor | ? | ? | ? | |
| WF5: Property Operations | ? | ? | ? | |
| WF6: Daily Automations | ? | ? | ? | |
| WF7: Integration Hub | ? | ? | ? | |
| WF8: Safety & Screening | ? | ? | ? | |

For each, check:
- Is the workflow active and listening?
- When was the last successful execution?
- Are there recent failed executions? What errors?
- Are all referenced credentials valid and connected?
- Are webhook URLs correct and reachable?
- Is the AI system prompt current and complete?
- Are database queries working (no schema mismatches)?

Also check the **PostgreSQL database state:**
```sql
-- Key tables to verify:
SELECT count(*) FROM property_configurations;  -- Should have at least 1 property
SELECT count(*) FROM conversations;            -- Active conversations
SELECT count(*) FROM bookings;                 -- Existing bookings
SELECT count(*) FROM n8n_chat_histories;       -- AI conversation memory
SELECT count(*) FROM guests;                   -- Guest records
```

### Section 6: Issues & Improvements

Categorize every issue found as:
- **CRITICAL** — Workflow broken, messages not being processed, data loss risk
- **IMPORTANT** — Workflow works but has bugs, missing error handling, or gaps
- **NICE-TO-HAVE** — Optimizations, prompt improvements, better logging

Check specifically for:

**Workflow Issues:**
- Nodes with error indicators or warnings
- Broken connections between nodes
- Hardcoded values that should be dynamic (property IDs, URLs, phone numbers)
- Missing error handling (what happens when OpenAI API fails? When DB query returns no results?)
- AI system prompt issues (outdated info, missing context, wrong language)
- Chat memory pollution (old wrong conversations affecting AI responses)
- Tools defined in WF1 that don't match actual sub-workflow capabilities

**Credential Issues:**
- Expired or invalid API keys
- PostgreSQL connection using wrong host/port/database
- Telegram bot token validity
- OpenAI API key billing status

**Performance Issues:**
- Workflows with too many nodes (complexity)
- Slow database queries (missing indexes?)
- Rate limiting concerns (OpenAI, Telegram API limits)
- Execution history not being pruned (disk space)

**Security Issues:**
- Sensitive data in workflow logs
- API keys exposed in system prompts
- Webhook URLs not validated
- No authentication on webhook endpoints

**DO NOT fix anything. Document only.**

---

## Output Format

Output a single Markdown file. For each workflow, use a consistent format with headers, node lists, and flow diagrams (ASCII or mermaid). Use tables for status overviews. Include actual SQL queries and API calls where relevant. This document will be read by a developer who has never used n8n before — explain n8n concepts (nodes, connections, triggers, sub-workflows, expressions) briefly where first used.

# How Ergovia Is Built — System Blueprint
*Use this as the master template when building Ergovia for a new niche.*

---

## What Ergovia Is

Ergovia is a **SaaS automation platform** that uses n8n workflows + a web control panel to automate guest communication, bookings, operations, and reporting for property-based businesses.

The first niche is **AirBNB / short-term rentals**.
The system is designed so a new niche can be deployed by:
1. Duplicating the workflow set
2. Swapping the system prompt + DB schema
3. Pointing to a new Telegram bot

---

## System Architecture (3 Layers)

```
┌─────────────────────────────────────────────────────┐
│              LAYER 1: Control Panel                  │
│         Express.js (Node) — ergovia-lite/            │
│         SQLite (local state) + PostgreSQL (client)   │
│         Pages: Dashboard, Settings, Properties,      │
│                Conversations, Calendar               │
└─────────────────────┬───────────────────────────────┘
                      │ API calls
┌─────────────────────▼───────────────────────────────┐
│              LAYER 2: n8n Workflows                  │
│         Self-hosted on Hetzner VPS (Docker)          │
│         Hub-and-spoke: WF1 routes everything         │
│         11 workflows total (2 SUB + WF1–WF8)         │
└─────────────────────┬───────────────────────────────┘
                      │ reads/writes
┌─────────────────────▼───────────────────────────────┐
│              LAYER 3: PostgreSQL Database            │
│         23+ tables, per-client instance              │
│         Stores: bookings, conversations, tasks,      │
│                 guests, owners, analytics            │
└─────────────────────────────────────────────────────┘
```

---

## The 11 Workflows (Hub-and-Spoke)

```
INCOMING MESSAGE (Telegram/SMS)
         │
         ▼
    [WF1: AI Gateway]  ←── Main brain. All conversations start here.
         │                 Uses OpenAI Agent + Chat Memory (PostgreSQL)
         │
    ┌────┼────────────────────────────────────────┐
    │    │                                        │
    ▼    ▼                                        ▼
[WF2]  [WF3]  [WF4]  [WF5]  [WF7]  [WF8]     [WF6]
Offer  Cal.   Pay.   Prop.  Hub    Safety     Daily
Mgr    Mgr    Proc.  Ops    Integ. Screen.    Reports
    │    │                                   (scheduled)
    └────┴────── both call ──────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
[SUB: Universal Messenger]  [SUB: Owner & Staff Notifier]
   Sends to Telegram/SMS       Sends to owner/cleaners
```

### What Each Workflow Does

| Workflow | Trigger | Job |
|---|---|---|
| **WF1: AI Gateway** | Telegram/SMS message | Main conversation AI. Routes to other WFs |
| **WF2: Offer Conflict** | Two guests, same dates | Notifies owner, handles priority decision |
| **WF3: Calendar Manager** | 6 AM daily + on-demand | iCal sync, availability checks |
| **WF4: Payment Processor** | Guest agrees to book | Generates token, sends payment link, confirms |
| **WF5: Property Operations** | Checkout / guest issue | Cleaning tasks, maintenance tickets |
| **WF6: Daily Automations** | Schedule (9AM/6PM/Mon/30min) | Morning/evening reports + follow-ups |
| **WF7: Integration Hub** | Webhook / 8 AM daily | External booking import, review monitoring |
| **WF8: Safety & Screening** | Every 15 min watchdog | Emergency detection, guest screening |
| **SUB: Universal Messenger** | Called by any WF | Sends message to guest (Telegram/Twilio) |
| **SUB: Owner Notifier** | Called by any WF | Sends message to owner/staff |
| **Payment Confirmation Webhook** | Payment provider POST | Validates token, confirms booking |

---

## Credential System

Every workflow that touches an external service needs a **credential** in n8n.
There are 4 credential types used:

| Type in n8n | What it connects | Placeholder ID |
|---|---|---|
| `postgres` | PostgreSQL database | `BWlLUMKn64aZsHi8` (test) |
| `openAiApi` / `lmChatOpenAi` | OpenAI (GPT-4, Whisper) | `slpbr7aUaU6fqTfw` (test) |
| `telegramApi` | Telegram bot | `6ltptOrFLUaZzC1C` (test) |
| `twilioApi` | Twilio SMS/WhatsApp | `twilio-cred` (test) |

**When deploying for a new client:** Create 4 new credentials in their n8n instance, then run `audit-and-fix-live.js` with the new IDs.

---

## Workflow Naming Convention

```
[STATUS] WFX: Name
```

- `[V6]` — Template version (archived, do not touch)
- `[LIVE]` — Production/running version
- `[V4]` — Old version (archived)

**Rule:** Always work on `[LIVE]`. Use `[V6]` only to restore or start fresh.

---

## Deployment Scripts (ergovia-lite/scripts/)

| Script | What it does |
|---|---|
| `v4-to-live.js` | Creates `[LIVE]` copies from `[V6]` templates |
| `audit-and-fix-live.js` | Checks/fixes all credentials + cross-references in `[LIVE]` |
| `inject-live-creds.js` | Injects credentials into nodes that have none |
| `checkpoint-workflows.js` | Pulls live workflows, saves locally, compares to local files |
| `compare-v4-v6.js` | Side-by-side comparison of two workflow sets |
| `fix-and-activate.js` | Cleans duplicates, fixes `__WF_ID__` placeholders, activates |
| `list-all-workflows.js` | Lists all n8n workflows with status |
| `list-archived-only.js` | Lists only archived workflows |
| `reactivate-v6.js` | Unarchives and activates a workflow set |

---

## How n8n Cross-References Work

Workflows call each other using **Execute Workflow** nodes.
The node stores the called workflow's **n8n ID** (like `LMkR7as0CSGDtjbE`).

**Problem:** When you duplicate/recreate a workflow, it gets a NEW ID.
You must update every Execute Workflow node to point to the new IDs.

**Solution:** `audit-and-fix-live.js` does this automatically by:
1. Building a map of all `[LIVE]` workflow names → IDs
2. Finding all Execute Workflow nodes
3. Replacing stale IDs with current `[LIVE]` IDs

---

## The Typing Delay (Human Feel)

In `[LIVE] SUB: Universal Messenger`, there is a **Human Typing Delay** node.
This makes the bot pause 3–8 seconds before sending, like a human typing.

This is critical for the guest experience — bots that respond instantly feel robotic.

---

## PostgreSQL Database Key Tables

```
owners           → property owner accounts
customers        → guests / end users
bookings         → confirmed + pending bookings
deals            → offers in negotiation
n8n_chat_histories → AI conversation memory (per session_id)
conversation_log → full message history
guest_journey_log → stage tracking (welcome→booking)
property_configurations → property details + pricing
cleaning_tasks   → cleaner assignments
maintenance_tickets → guest issue tracking
api_usage_budget → OpenAI spend tracking per customer
```

**Chat memory key:** Session ID = Telegram `sender_id`.
To reset a conversation: DELETE from `n8n_chat_histories` WHERE session_id = 'xxxxx'.

---

## Building for a New Niche — Step-by-Step

### 1. Define the Niche
What is the property/service type? (pet hotel, boat rental, parking, storage, etc.)
- Who is the guest? Who is the owner?
- What does the booking flow look like?
- What operations happen at checkout/check-in?

### 2. Adapt WF1 System Prompt
WF1 has a long system prompt that tells the AI how to behave.
Replace it with niche-specific instructions:
- Change "property" to the right noun
- Change the 6 conversation stages to match your funnel
- Add niche-specific FAQs and edge cases

### 3. Adapt WF6 Reports
The morning/evening/weekly report templates in WF6 pull from PostgreSQL.
Update the SQL queries to match the new niche's tables and terminology.

### 4. Adapt the DB Schema
Start from `ergovia-lite/database/schema-postgresql.sql`.
Rename or add tables to match niche terminology.
Keep: `n8n_chat_histories`, `api_usage_budget`, `owners`, `customers`.
Adapt: `bookings`, `property_configurations`, `cleaning_tasks`.

### 5. Create New Credentials in n8n
- New Telegram bot (BotFather → /newbot)
- New PostgreSQL credential pointing to new DB
- Same OpenAI credential (or new one if separate billing)

### 6. Deploy Workflows
- Copy `[V6]` templates: `node scripts/v4-to-live.js`
  (modify script to use a different prefix like `[NICHE]` if running alongside AirBNB)
- Fix credentials: `node scripts/audit-and-fix-live.js`
- Test one Telegram message end-to-end

### 7. Set Up Control Panel
- Run `ergovia-lite/server.js` (or PM2)
- The same control panel works for any niche — just change the labels

---

## Server Setup (Hetzner VPS)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Start n8n + PostgreSQL
cd /opt/n8n && docker compose up -d

# Start control panel
cd /opt/ergovia-lite && pm2 start server.js --name ergovia-lite

# HTTPS via Caddy
# Caddyfile:
# n8n.your-domain.com {
#   reverse_proxy localhost:5678
# }
```

**Architecture:** Caddy (HTTPS) → n8n (port 5678) + Express (port 3000)
**SSL:** Let's Encrypt via Caddy (automatic)

---

## What Makes This System Work

1. **Hub-and-spoke design** — WF1 is the brain. All other workflows are specialists called on demand. This prevents spaghetti connections and makes debugging easy.

2. **SUB workflows** — Shared utilities (messaging, notifications) called by many workflows. Change once, affects everything.

3. **PostgreSQL chat memory** — AI remembers the full conversation. Session ID = sender's Telegram ID.

4. **Credential injection scripts** — Automates the most error-prone part of n8n deployment.

5. **Template versioning (`[V6]`, `[LIVE]`)** — Can always roll back. Templates are never touched, only copies are run.

6. **30-min follow-up loop** — WF6 checks every 30 minutes for conversations that have gone silent and sends a follow-up. This alone recovers significant lost bookings.

---

## Known Limitations & Workarounds

| Limitation | Workaround |
|---|---|
| n8n API doesn't support archiving via PUT | Archive manually in n8n UI |
| V6 workflows had credentials stripped | `inject-live-creds.js` copies from V4 node-by-node |
| Telegram markdown crashes send | `Human Typing Delay` + text sanitization in SUB |
| `$now` Luxon in system prompts unreliable | Compute dates in Code node, reference via `{{ }}` |
| SQL `$1/$2` params conflict with n8n `=` prefix | Never add `=` prefix to SQL query nodes |
| n8n port 5678 blocked externally | Use HTTPS domain (n8n.ergovia-ai.com) for all API calls |

---

## Files to Know

```
ergovia-lite/
├── server.js                  ← Express server, 50+ API routes
├── db.js                      ← SQLite local state
├── services/
│   ├── n8n.js                 ← Workflow deployment engine (1500+ lines)
│   └── v2-data.js             ← V2 dashboard data (currently mock)
├── public/v2/                 ← Control panel pages
│   ├── dashboard.html
│   ├── settings.html
│   ├── properties.html
│   ├── conversations.html
│   └── calendar.html
├── workflows/
│   └── v6/                    ← [V6] templates (source of truth)
├── scripts/                   ← All deployment/maintenance scripts
└── docs/                      ← This file and other guides
```

---

*Last updated: 2026-03-07*
*Current live version: [LIVE] (based on V6)*
*Test bot: @ergovia_test2_bot*
*Test server: 116.203.115.12 | n8n.ergovia-ai.com*

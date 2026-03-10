# Ergovia AI — Complete Claude Migration Prompt

> **Purpose**: This document transfers ALL project knowledge to a new Claude session. It covers the entire Ergovia AI system — local development, server infrastructure, n8n workflows, and current status. Read this entirely before doing any work.

---

## SECTION 0: WHAT IS ERGOVIA?

**Ergovia AI** is a SaaS platform that automates AirBNB/vacation rental management using AI. Property owners get:
- An **AI concierge** (via Telegram/WhatsApp/SMS) that handles guest inquiries, bookings, payments, cleaning scheduling, emergency response
- A **web control panel** (Premium V2 Dashboard) to manage properties, bookings, calendar, and settings
- **Automated workflows** running on n8n that do the actual AI + database work

**Business model**: Each client gets their **own Hetzner server** with their own n8n instance + PostgreSQL database + subdomain under `ergovia-ai.com`. Cost: ~€5-20/month per client.

**Current stage**: ~70-80% complete. Testing on a single Hetzner server. Not yet multi-tenant in production.

---

## SECTION 1: ERGOVIA LITE — LOCAL DEVELOPMENT & WEBSITE

### 1.1 Architecture Overview

```
┌──────────────────────────────────────────────┐
│              LOCAL MACHINE (Dev)              │
│                                              │
│  ergovia-lite/                                │
│  ├── server.js          Express.js (port 3000)│
│  ├── db.js              SQLite (data.db)     │
│  ├── services/                                │
│  │   ├── n8n.js         Workflow deployment   │
│  │   └── v2-data.js     PostgreSQL bridge     │
│  ├── public/v2/         V2 Premium Dashboard  │
│  ├── workflows/         9 JSON templates      │
│  └── database/          PostgreSQL schema     │
└──────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   SQLite (local)         PostgreSQL (remote)
   - client_data          - 23+ tables
   - api_bank             - bookings, properties
   - deployed_workflows   - guests, payments
   - activity_log         - tasks, messages
```

### 1.2 Git Repositories

**CRITICAL**: There are TWO separate repos. This has caused deployment issues before.

| Repo | URL | Purpose |
|------|-----|---------|
| `ERGOVIA-2` | `github.com/Shinzou369/ERGOVIA-2` | Full monorepo (local dev, scripts, docs, workflows, backend) |
| `ergovia-lite` | `github.com/Shinzou369/ergovia-lite` | **Server deployment repo** — only the ergovia-lite/ subfolder. The Hetzner server pulls from THIS repo. |

**Deployment workflow**:
1. Edit files locally in `ERGOVIA-2/ergovia-lite/`
2. Copy changed files to a clone of `ergovia-lite` (e.g., `/tmp/ergovia-lite-deploy`)
3. Commit and push to `Shinzou369/ergovia-lite`
4. SSH to server: `cd /opt/ergovia-lite && git pull && pm2 restart ergovia-lite`

### 1.3 Key Files — Backend

#### `ergovia-lite/server.js` (~1370 lines)
Express.js server with 50+ API routes. Key route groups:

| Route Group | Prefix | Purpose |
|-------------|--------|---------|
| Client Data | `/api/client` | Bulk read/write client configuration |
| Deployment | `/api/deploy`, `/api/undeploy` | Deploy 9 workflows to n8n |
| Admin | `/api/admin/apibank` | OpenAI API key pool management |
| **V2 Dashboard** | `/api/v2/*` | Premium dashboard endpoints |
| V2 Settings | `/api/v2/settings` | GET/POST settings (hybrid: PG + local) |
| V2 Properties | `/api/v2/properties` | CRUD on `property_configurations` table |
| V2 Bookings | `/api/v2/bookings` | GET (with date filtering) + POST (create) |
| V2 Tasks | `/api/v2/tasks` | Task management |
| V2 Notifications | `/api/v2/notifications` | Local notification system |
| V2 Seed | `/api/v2/seed` | Load 9 demo properties + 13 bookings |
| Workflow Sync | `/api/v2/sync/*` | Push settings to live n8n workflows |
| Health | `/api/status`, `/api/test-n8n` | Health checks |

#### `ergovia-lite/services/v2-data.js` (~720 lines)
PostgreSQL bridge for V2 dashboard. Uses `pg` module (Pool).

**Connection**: `116.203.115.12:5432` / `ergovia_db` / `ergovia_user` / `ergovia_secure_2026`

**Key functions**:
- `getDashboardData()` → aggregates properties, bookings, tasks, owner
- `getProperties()` → `SELECT * FROM property_configurations WHERE property_status = 'active'`
- `getBookings(propertyId, startDate, endDate)` → filtered queries
- `createBooking(data)` → INSERT into bookings table
- `saveProperty(property)` → UPSERT with `propertyToDb()` mapper
- `seedDemoData()` → Seeds 9 properties + 13 bookings for demos
- `getOwner()` / `saveOwner()` → owners table CRUD
- `savePropertyContacts(propertyId, contacts)` → UPDATE owner fields on property

**Field mappers** (camelCase ↔ snake_case):
- `propertyFromDb(row)` → DB row → frontend object
- `propertyToDb(property)` → frontend object → DB columns
- `bookingFromDb(row)` → DB row → frontend booking
- `ownerFromDb(row)` → DB row → frontend owner

**Payment fields**: `payment_link` and `payment_instructions` were added to both `propertyFromDb` and `propertyToDb` (recent addition).

#### `ergovia-lite/db.js` (~400 lines)
Local SQLite database (better-sqlite3) for control panel state. File: `data.db`.

Tables: `client_data`, `api_bank`, `deployed_workflows`, `deployment_status`, `activity_log`, `client_credentials`

#### `ergovia-lite/services/n8n.js` (~1200 lines)
Workflow deployment orchestrator. Key methods:

- `deployAllWorkflowsWithIdResolution()` — Main deploy: reads JSON templates, personalizes, injects credentials, injects workflow IDs, creates in n8n via API
- `createClientCredentials()` — Creates Telegram, WhatsApp, Twilio credentials in n8n
- `createOpenAICredential()` — From API Bank pool
- `createPostgresCredential()` — From env config
- `personalizeWorkflow(workflow, clientData)` — Replaces 91 placeholders with client data
- `injectCredentialIds(workflow, credentialMap)` — Replaces placeholder IDs (postgres-cred, openai-cred, etc.) with real n8n credential IDs
- `injectWorkflowIds(workflow, deployedMap)` — Replaces workflow name references with actual IDs (for Execute Workflow nodes)
- `disableUnusedPlatformNodes(workflow, enabledPlatforms)` — Turns off Telegram/WhatsApp/SMS nodes per client config

**Credential Placeholder IDs** (in workflow JSON files):
```
postgres-cred  → type: postgres
openai-cred    → type: openAiApi
telegram-cred  → type: telegramApi
whatsapp-cred  → type: whatsAppBusinessCloudApi
twilio-cred    → type: twilioApi
stripe-cred    → type: stripe (reserved, not used yet)
```

### 1.4 Key Files — Frontend (V2 Premium Dashboard)

All V2 files are at `ergovia-lite/public/v2/`. Design: Facebook-inspired, no framework (vanilla JS + CSS custom properties).

#### `dashboard.html`
Main dashboard page. Sections: Welcome banner, Tasks & Reminders, Booking Calendar (Gantt-style), Stats cards. Includes New Booking modal (2-step: dates → property + guest details).

Script load order: `config.js` → `dashboard.js` → `calendar.js` → `booking.js` → `notifications.js`

#### `assets/js/config.js` (~510 lines)
- `CONFIG` object: API endpoints, storage keys, UI settings, property color palette (8 colors)
- `SchemaMapper`: Frontend camelCase ↔ backend snake_case converters for owner, credentials, budget, property, booking, task, notification
- `Utils`: API call helpers (`apiCall`, `get`, `post`, `put`, `delete`), toast notifications, date formatting, debounce, draft save/load

**API pattern**: `Utils.get(CONFIG.API.GET_PROPERTIES)` → `fetch('/api/v2/properties')`

#### `assets/js/dashboard.js` (~280 lines)
Dashboard initialization, stats updates, task rendering, upcoming bookings list, auto-refresh (60s interval), seed demo data function.

#### `assets/js/calendar.js` (~550 lines)
**Gantt-style booking calendar** (recently redesigned). Key features:
- Booking bars spanning across dates (colored by property)
- Past dates grayed out with line-through
- Property color legend
- Lane assignment algorithm (non-overlapping bars)
- Rich booking detail modal on click
- Upcoming check-ins with urgency indicators (Today/Tomorrow/Soon)

Key functions:
- `renderCalendar()` → builds week rows, day cells, booking bar overlays
- `renderBookingBars(container, bookings, weekStart, weekEnd)` → positions bars with lane assignment
- `getPropertyColor(propertyId)` → color from property settings or CONFIG.PROPERTY_COLORS by index
- `showBookingDetail(booking)` → rich modal with grid layout
- `renderUpcomingBookings()` → sorted list with countdown
- `renderPropertyLegend()` → color dots in filter bar

#### `assets/js/booking.js` (~320 lines)
New Booking modal with 2-step flow:
1. **Step 1**: 2-month side-by-side calendar for date selection (past dates disabled, existing bookings shown)
2. **Step 2**: Property selection cards + guest info form (name, phone, email, guests, platform, amount, notes)

Submits via `POST /api/v2/bookings`.

#### `assets/css/main.css` (~1320 lines)
Complete stylesheet. Key sections:
- Reset & CSS variables (`:root`)
- Navigation bar (sticky, Facebook-style)
- Sections (tasks, calendar, stats)
- Gantt calendar grid (`.cal-week-row`, `.cal-day-cells`, `.cal-bars-area`, `.cal-booking-bar`)
- Forms, modals, property cards
- Booking modal calendar styles
- Responsive breakpoints (768px, 640px)

### 1.5 Other V2 Pages

| Page | File | Purpose |
|------|------|---------|
| Settings | `settings.html` | Owner info, credentials, AI config, media links, payment settings, workflow sync |
| Properties | `properties.html` | Property CRUD with cards grid, edit modal |
| Fillup Form | `fillup-form.js` | Extended property configuration form |

### 1.6 V1 Pages (Legacy/Test)

Located at `ergovia-lite/public/control-panel/`. Used for testing, kept for reference:
- `onboarding.html` — 5-step wizard
- `dashboard.html` — Basic view + deploy button
- `settings.html` — Edit settings

### 1.7 PostgreSQL Schema (`database/schema-postgresql.sql`)

23+ tables with indexes and triggers. Key tables:

| Table | Used By | Purpose |
|-------|---------|---------|
| `bookings` | WF1-WF4, V2 Dashboard | Guest bookings with dates, status, amounts |
| `property_configurations` | All WFs, V2 Dashboard | Property details, pricing, owner contact, settings (JSONB) |
| `owners` | V2 Settings | Owner profile (name, email, phone, chat_id, platform) |
| `inquiries` | WF1, WF2 | Guest inquiry tracking |
| `deals` | WF2 | Negotiation/offer tracking |
| `payments` | WF4 | Payment transactions |
| `customers` | WF1, WF6 | Customer accounts (for budget tracking) |
| `api_usage_budget` | WF1, WF6 | Monthly AI budget per customer |
| `manual_tasks` | V2 Dashboard | Owner task management |
| `cleaning_tasks` | WF5 | Cleaning assignments |
| `maintenance_tickets` | WF5 | Maintenance requests |
| `scheduled_messages` | WF6, SUB | Timed message delivery |
| `guest_blacklist` | WF8 | Blocked guests |
| `guest_screening_log` | WF8 | Safety verification records |
| `calendar_sync_log` | WF7 | iCal sync history |
| `reviews` | WF7 | Guest review tracking |
| `n8n_chat_histories` | WF1 (LangChain) | AI conversation memory |

### 1.8 Known Issues & Gotchas

1. **Dual repo deployment**: Always push to `ergovia-lite` repo for server. ERGOVIA-2 is local dev only.
2. **`pg` module**: Must be installed on server (`npm install pg`). Was missing once, caused 502.
3. **Payment fields**: `payment_link` and `payment_instructions` were recently added to `propertyToDb`/`propertyFromDb` and the `saveProperty` SQL query. If the DB schema hasn't been updated, these columns may not exist.
4. **No authentication**: V2 dashboard has no login. Intentional during testing phase.
5. **Demo data**: Properties only appear after clicking "Demo Data" button or seeding via `POST /api/v2/seed`.

---

## SECTION 2: SERVER SIDE — HETZNER INFRASTRUCTURE

### 2.1 Test Server Details

| Item | Value |
|------|-------|
| **IP** | `116.203.115.12` |
| **Architecture** | ARM64 (aarch64) — download arm64 binaries, NOT amd64 |
| **OS** | Ubuntu |
| **Access** | SSH as root |
| **Domain** | `ergovia-ai.com` (registrar DNS, not Cloudflare) |
| **n8n URL** | `https://n8n.ergovia-ai.com` |
| **Dashboard URL** | `https://ergovia-ai.com/v2/dashboard.html` |

### 2.2 Docker Setup

```
Docker Network: ergovia-net

┌─────────────────────────┐     ┌──────────────────────────┐
│  Container: n8n         │     │  Container: ergovia-db   │
│  Port: 5678             │────▶│  PostgreSQL              │
│  WEBHOOK_URL: https://  │     │  Port: 5432              │
│  n8n.ergovia-ai.com     │     │  DB: ergovia_db          │
└─────────────────────────┘     │  User: ergovia_user      │
                                │  Pass: ergovia_secure_2026│
                                └──────────────────────────┘
```

### 2.3 Services on Server

| Service | How it runs | Config |
|---------|------------|--------|
| **n8n** | Docker container `n8n` | Port 5678, env vars for WEBHOOK_URL, DB, etc. |
| **PostgreSQL** | Docker container `ergovia-db` | Port 5432, on `ergovia-net` |
| **Ergovia Lite** | PM2 process `ergovia-lite` | Port 3000, at `/opt/ergovia-lite` |
| **nginx** | System service | Reverse proxy, routes to PM2 app on port 3000 |
| **Caddy** | System service | SSL termination for n8n subdomain |

### 2.4 SSL/HTTPS Setup

- **Caddy** handles automatic SSL for `n8n.ergovia-ai.com` (Let's Encrypt HTTP-01)
- **nginx** handles the main site `ergovia-ai.com` routing to the Express app
- Requirements: Ports 80 + 443 open, DNS A records pointing to server IP
- Caddy auto-renews certificates

### 2.5 Deployment Commands

```bash
# Deploy new code to server
ssh root@116.203.115.12
cd /opt/ergovia-lite
git pull
pm2 restart ergovia-lite

# Check app logs
pm2 logs ergovia-lite

# Check n8n container
docker logs n8n --tail 50

# Restart n8n
docker restart n8n

# PostgreSQL access
docker exec -it ergovia-db psql -U ergovia_user -d ergovia_db

# Run schema
docker exec -i ergovia-db psql -U ergovia_user -d ergovia_db < database/schema-postgresql.sql

# Install missing npm modules
cd /opt/ergovia-lite && npm install <module-name>

# Check what's running
pm2 status
docker ps
```

### 2.6 Per-Client Production Architecture (Future)

Each new client gets:
1. **Hetzner VPS** (€5-20/month) provisioned via API
2. **Docker setup**: n8n + PostgreSQL containers
3. **Subdomain**: `[clientname].ergovia-ai.com` → A record to server IP
4. **Caddy**: Auto-SSL for the subdomain
5. **9 workflows** deployed with client-specific credentials
6. **PostgreSQL schema** loaded with client's property data

DNS is currently managed manually at the domain registrar. Future: automate via registrar API.

### 2.7 Server Gotchas

1. **ARM64 architecture**: Any binary downloads must be for `aarch64`, not `amd64`/`x86_64`
2. **n8n webhooks require HTTPS**: Workflows won't publish without `WEBHOOK_URL` set to `https://`
3. **PM2 vs Docker**: The Express app runs via PM2 (not Docker). n8n and PostgreSQL run in Docker.
4. **nginx vs Caddy**: nginx handles the main app, Caddy handles n8n subdomain. Don't confuse them.
5. **502 Bad Gateway**: Usually means the Express app crashed. Check `pm2 logs ergovia-lite`.

---

## SECTION 3: N8N WORKFLOWS — FIXING, NODES & PLACEHOLDERS

### 3.1 Workflow Architecture (9 Workflows)

```
Hub-and-Spoke Model:

                    ┌──────────────────┐
   Telegram ──────▶ │                  │
   WhatsApp ──────▶ │  WF1: AI Gateway │ ◀── Entry Point (LangChain Agent)
   SMS ───────────▶ │                  │
                    └────────┬─────────┘
                             │ AI Agent calls tools
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
   │ WF2: Booking│  │ WF3: Calendar│  │ WF4: Payment │
   │ Agent       │  │ Manager      │  │ Processor    │
   └─────────────┘  └──────────────┘  └──────────────┘
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
   │ WF5: Prop   │  │ WF6: Daily   │  │ WF7: Integr. │
   │ Operations  │  │ Automations  │  │ Hub          │
   └─────────────┘  └──────────────┘  └──────────────┘
   ┌─────────────┐
   │ WF8: Safety │
   │ & Screening │
   └─────────────┘
            │
            ▼
   ┌─────────────────────────┐
   │ SUB: Universal Messenger│ ◀── All WFs send messages through this
   └─────────────────────────┘
```

### 3.2 Workflow Details

| Workflow | File | Nodes | Triggers | Purpose |
|----------|------|-------|----------|---------|
| **SUB** | `SUB_Universal_Messenger.json` | 13 | Execute Workflow (called by others) | Routes messages to Telegram/WhatsApp/SMS based on channel parameter |
| **WF1** | `WF1_AI_Gateway.json` | 26 | Telegram Trigger, Webhook | AI entry point. LangChain Agent classifies intent, calls tools (WF2-WF5, WF8 via Execute Workflow). Has memory via `n8n_chat_histories` table. |
| **WF2** | `WF2_Offer_Conflict_Manager.json` | 33 | Execute Workflow (from WF1) | Booking negotiations, conflict detection, owner approval callbacks |
| **WF3** | `WF3_Calendar_Manager.json` | 17 | Execute Workflow + Daily Cron | Availability checks, daily calendar sync, booking summaries |
| **WF4** | `WF4_Payment_Processor.json` | 18 | Execute Workflow | Payment link generation, confirmation handling, booking creation |
| **WF5** | `WF5_Property_Operations.json` | 15 | Execute Workflow | Cleaning scheduling, maintenance tickets, property status updates |
| **WF6** | `WF6_Daily_Automations.json` | 31 | Cron (6AM, 9AM, 2AM) | Morning brief, guest journey messages, nightly maintenance, stale lead alerts |
| **WF7** | `WF7_Integration_Hub.json` | 19 | Cron (3AM, 8AM) + Webhook | iCal sync, review sentiment analysis, external integrations |
| **WF8** | `WF8_Safety_Screening.json` | 15 | Execute Workflow | Guest screening (AI risk scoring), emergency response escalation |

### 3.3 Deployment Order (CRITICAL)

Workflows have inter-dependencies via Execute Workflow nodes. Deploy in this order:

```
1. SUB_Universal_Messenger     (no dependencies) — deploy FIRST, wait 3s
2. WF3_Calendar_Manager        (depends on SUB)
3. WF4_Payment_Processor       (depends on SUB)
4. WF5_Property_Operations     (depends on SUB)
5. WF6_Daily_Automations       (depends on SUB)
6. WF8_Safety_Screening        (depends on SUB)
7. WF7_Integration_Hub         (depends on WF3)
8. WF2_Offer_Conflict_Manager  (depends on SUB, WF3, WF4)
9. WF1_AI_Gateway              (depends on ALL — deploy LAST)
```

Add a **2-second delay** between deployments (3s for SUB) to avoid n8n API rate limits.

### 3.4 Credential System

#### Placeholder IDs in Workflow JSON
Every workflow JSON uses placeholder credential IDs that get replaced during deployment:

```json
"credentials": {
  "postgresApi": {
    "id": "postgres-cred",      ← placeholder
    "name": "[Client] PostgreSQL"
  }
}
```

During deployment, `injectCredentialIds()` replaces `"postgres-cred"` with the actual n8n credential ID (e.g., `"BWlLUMKn64aZsHi8"`).

#### Current Live Credential IDs (Test Server)

| Service | Canonical ID | Name |
|---------|-------------|------|
| PostgreSQL | `BWlLUMKn64aZsHi8` | [Client] PostgreSQL |
| OpenAI | `slpbr7aUaU6fqTfw` | [Client] OpenAI |
| Telegram | `6ltptOrFLUaZzC1C` | [Client] Telegram Bot |
| Twilio | `twilio-cred` | Placeholder (not configured) |

### 3.5 Expression Mode Gotcha (CRITICAL)

**When deploying workflows via n8n API**, string parameters containing `{{ }}` expressions MUST be prefixed with `=` to enable Expression mode:

```json
// WRONG — n8n treats {{ }} as literal text
"systemMessage": "Today is {{ $now.toISO() }}"

// CORRECT — `=` prefix enables expression evaluation
"systemMessage": "=Today is {{ $now.toISO() }}"
```

This applies to: `systemMessage`, `text`, `prompt`, `description`, `query`, and any other parameter with expressions. The `=` prefix is only needed when deploying via API — the n8n UI handles this automatically.

### 3.6 Chat Memory Gotcha

LangChain chat memory is stored in the `n8n_chat_histories` PostgreSQL table. Session key = `sender_id`. Old/wrong conversations persist and influence future AI responses. **When debugging AI behavior**, clear the chat history:

```sql
DELETE FROM n8n_chat_histories WHERE session_id = 'SENDER_PHONE_OR_CHAT_ID';
```

### 3.7 Luxon Date Expressions Gotcha

Complex chained Luxon expressions like `$now.plus({days:1}).toFormat('yyyy-MM-dd')` may NOT resolve in `systemMessage` even with the `=` prefix. Safer approach:
1. Compute dates in a **Code node** (JavaScript)
2. Reference via simple expression: `{{ $('DateCalc').item.json.tomorrow }}`

### 3.8 Live Workflow IDs (Test Server)

| Workflow | n8n ID |
|----------|--------|
| SUB: Universal Messenger | `UZMWfhnV6JmuwJXC` |
| WF1: AI Gateway | `LP7YknAVPiQsidWq` |
| WF2: Offer Conflict Manager | `NPInwpKv4Oriq04F` |
| WF3: Calendar Manager | `pEn69kwNtCEQ21y9` |
| WF4: Payment Processor | `5loDH75zrEDh9x5H` |
| WF5: Property Operations | `JWEu9Uz2JJ5XZeIX` |
| WF6: Daily Automations | `ccEOaNnIwY6eeJOn` |
| WF7: Integration Hub | `Ay5QOyGAHG2l40s7` |
| WF8: Safety & Screening | `mLm2HaIRzNfIX5uh` |

### 3.9 n8n API Reference

```bash
# Set API key
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU"

# List all workflows
curl -s "https://n8n.ergovia-ai.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: $API_KEY" | jq '.data[] | {id, name, active}'

# Get a specific workflow
curl -s "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}" \
  -H "X-N8N-API-KEY: $API_KEY"

# Create/update a workflow
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" \
  -d @workflow.json

# Activate/deactivate
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}/activate" \
  -H "X-N8N-API-KEY: $API_KEY"

# Check recent errors
curl -s "https://n8n.ergovia-ai.com/api/v1/executions?status=error&limit=10" \
  -H "X-N8N-API-KEY: $API_KEY"

# List credentials
curl -s "https://n8n.ergovia-ai.com/api/v1/credentials" \
  -H "X-N8N-API-KEY: $API_KEY"
```

### 3.10 Common Workflow Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Failed query: SELECT ... FROM conversations" | Table doesn't exist | Run `schema-postgresql.sql` against the DB |
| "Incorrect API key provided: sk-proj-***" | Invalid OpenAI key | Update OpenAI credential in n8n Settings → Credentials |
| WF1 doesn't respond to Telegram | Telegram trigger not active | Activate WF1, verify bot token in credential |
| AI gives wrong/stale answers | Old chat history in `n8n_chat_histories` | Clear: `DELETE FROM n8n_chat_histories WHERE session_id = '...'` |
| Expressions show as `{{ $now }}` literal | Missing `=` prefix in API deployment | Add `=` prefix to all expression strings |
| WF6 morning brief empty | No active properties in DB | Insert property records with `property_status = 'active'` |
| SUB doesn't send messages | Missing Telegram/Twilio credentials | Create credentials in n8n, update credential IDs in workflow |
| 80+ duplicate workflows | Old deployments not cleaned up | Delete all except the 9 canonical workflows |
| Stale credential IDs | Workflows reference deleted credentials | Update all nodes to use canonical credential IDs (see 3.4) |

### 3.11 Onboarding Checklist (Per Client)

```
□ 1. Provision Hetzner server (Docker: n8n + PostgreSQL)
□ 2. Run schema-postgresql.sql to create all 23+ tables
□ 3. Collect from client:
    □ Owner name, email, phone
    □ Telegram chat ID (owner messages the bot → get chat.id)
    □ Preferred notification platform (telegram/whatsapp/sms)
    □ Per property: name, address, pricing, capacity, calendar URL, check-in times
□ 4. INSERT into owners table
□ 5. INSERT into property_configurations table
□ 6. Create customer record + set budget in api_usage_budget
□ 7. Create n8n credentials: PostgreSQL, Telegram Bot, OpenAI, Twilio (if needed)
□ 8. Deploy 9 workflows (SUB first → WF3-WF8 → WF2 → WF1 last)
□ 9. Replace credential placeholder IDs with actual IDs
□ 10. Activate all 9 workflows
□ 11. Test: Send message to Telegram bot → should get AI response
□ 12. Verify: Check 6AM sync, 9AM morning brief fire next day
```

---

## SECTION 4: CURRENT STATUS & WHAT'S LEFT

### 4.1 What's Complete
- Express.js server with 50+ API routes
- N8N orchestration service (1200+ lines)
- 9 optimized workflows (reduced from 25, 77% node reduction)
- Credential injection + workflow ID resolution
- SQLite local database (client data, deployment tracking)
- V2 Premium Dashboard (Gantt calendar, booking modal, property management)
- V2 Data layer (PostgreSQL bridge via `pg` module)
- PostgreSQL schema (23+ tables)
- Workflow sync (push settings changes to live n8n)
- HTTPS/SSL setup with Caddy
- 9 demo properties + 13 sample bookings (seed endpoint)
- Documentation (architecture guide, HTTPS guide, fix guide, onboarding variables)

### 4.2 What's Partially Done
- Onboarding flow: Form exists but doesn't automate server provisioning
- V2 data layer: Some edge cases (e.g., `payment_link` columns may not exist in DB yet)

### 4.3 What's NOT Built Yet
1. **Hetzner API integration** — Automated server provisioning for new clients
2. **Automated DNS** — Subdomain creation via registrar API
3. **Client authentication** — No login system (testing phase)
4. **Billing/subscription** — Stripe recurring payments
5. **Multi-tenant isolation** — Currently single-server testing
6. **Automated schema loading** — Per-client PostgreSQL setup scripts

### 4.4 Workflow Coverage

**88% covered** (22/25 original workflows absorbed into 9):
- 3 deferred to Phase 2: Inventory Predictor (WF15), Backup & Recovery (WF21), Advanced Automation (WF23)

---

## SECTION 5: LESSONS LEARNED (HARD-WON KNOWLEDGE)

1. **ARM64**: The Hetzner server is ARM64. Always download `aarch64`/`arm64` binaries.
2. **Two repos**: `ERGOVIA-2` = local dev, `ergovia-lite` = server. Push to `ergovia-lite` for deployment.
3. **n8n Expression `=` prefix**: API-deployed workflows need `=` before `{{ }}` expressions.
4. **Chat memory**: `n8n_chat_histories` table stores LangChain memory. Clear when debugging AI.
5. **Deploy order**: SUB first (3s wait), then WF3-WF8 (2s between each), WF2, WF1 last.
6. **Caddy for SSL**: Automatic Let's Encrypt. Just add domain to Caddyfile, restart.
7. **Luxon expressions**: Complex chains break in systemMessage. Use Code node instead.
8. **`pg` module on server**: Must be npm installed. Not in the base package.json sometimes.
9. **502 errors**: Usually PM2 app crash. Check `pm2 logs ergovia-lite`.
10. **Stale credentials**: After recreating credentials, ALL 9 workflows need their credential IDs updated.
11. **Removed `[ClientName]` prefix**: Workflow names should NOT have client name prefix in production.

---

## SECTION 6: FILE TREE REFERENCE

```
ergovia-lite/
├── server.js                          # Express.js server (~1370 lines)
├── db.js                              # SQLite database layer (~400 lines)
├── package.json                       # Dependencies: express, better-sqlite3, axios, pg
├── services/
│   ├── n8n.js                         # Workflow deployment orchestrator (~1200 lines)
│   └── v2-data.js                     # PostgreSQL bridge for V2 (~720 lines)
├── database/
│   ├── schema-postgresql.sql          # Full 23-table schema
│   ├── migration_001_live_workflow_support.sql
│   └── migration_002_notification_log.sql
├── workflows/                         # 9 workflow JSON templates
│   ├── SUB_Universal_Messenger.json
│   ├── SUB_Owner_Staff_Notifier.json
│   ├── WF1_AI_Gateway.json
│   ├── WF2_Offer_Conflict_Manager.json
│   ├── WF3_Calendar_Manager.json
│   ├── WF4_Payment_Processor.json
│   ├── WF5_Property_Operations.json
│   ├── WF6_Daily_Automations.json
│   ├── WF7_Integration_Hub.json
│   └── WF8_Safety_Screening.json
├── public/
│   ├── v2/                            # V2 Premium Dashboard
│   │   ├── dashboard.html
│   │   ├── settings.html
│   │   ├── properties.html
│   │   └── assets/
│   │       ├── css/main.css           # Full stylesheet (~1320 lines)
│   │       └── js/
│   │           ├── config.js          # CONFIG + SchemaMapper + Utils (~510 lines)
│   │           ├── dashboard.js       # Dashboard logic (~280 lines)
│   │           ├── calendar.js        # Gantt calendar (~550 lines)
│   │           ├── booking.js         # New booking modal (~320 lines)
│   │           ├── fillup-form.js     # Extended property form
│   │           ├── notifications.js   # Notification panel
│   │           └── sync.js            # Workflow sync
│   └── control-panel/                 # V1 legacy pages
│       ├── onboarding.html
│       ├── dashboard.html
│       └── settings.html
└── docs/
    ├── WORKFLOW_ARCHITECTURE_GUIDE.md
    ├── HTTPS_AND_DOMAIN_SETUP.md
    ├── N8N_FIX_GUIDE.md
    ├── ONBOARDING_REQUIRED_VARIABLES.md
    ├── WORKFLOW_COVERAGE_MAP.md
    └── DEPLOYMENT_REPORT_20260210.md
```

---

*Generated: February 18, 2026*
*This prompt should be given to any new Claude session working on the Ergovia project.*

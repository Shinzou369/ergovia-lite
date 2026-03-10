# PROMPT 1: Local Files Audit — Ergovia Lite

> **Purpose:** Generate a complete documentation of the local codebase for handoff to a new developer. Output a single Markdown file called `LOCAL_FILES.md`.

---

## Context

You are auditing the **Ergovia Lite** codebase — an AirBNB automation control panel (SaaS). The product has:
- An **Express.js backend** (`server.js`, port 3000) serving a web dashboard
- **SQLite** (`data.db` via `better-sqlite3`) for local control panel state
- **PostgreSQL** (remote) for client property/booking data
- **n8n** (self-hosted) for AI-powered workflow automation
- A **V2 Premium Dashboard** (Facebook-inspired design) at `/v2/`
- An **M1 Affiliate Marketing module** (early stage)
- A **backend provisioning system** for auto-deploying new client servers

The GitHub repo is: `https://github.com/Shinzou369/ergovia-lite.git`

---

## Files to Scan

Scan EVERY file in the project root and subdirectories. The key structure is:

```
ergovia-lite/
├── server.js                          # Main Express server (~2400 lines, 50+ API routes)
├── db.js                              # SQLite database layer (local state)
├── package.json                       # Dependencies
├── .env / .env.example                # Environment variables
├── test-smoke.js                      # Smoke tests
│
├── services/
│   ├── n8n.js                         # n8n API integration (workflow deployment, ~1200 lines)
│   ├── v2-data.js                     # V2 dashboard data layer (settings, properties, mock data)
│   ├── auth.js                        # JWT authentication service
│   └── m1-data.js                     # M1 affiliate marketing data layer
│
├── database/
│   ├── schema-postgresql.sql          # Full PostgreSQL schema (23+ tables)
│   └── migration_001-003.sql          # Database migrations
│
├── public/v2/                         # V2 Premium Dashboard (ACTIVE)
│   ├── dashboard.html                 # Main dashboard
│   ├── settings.html                  # Settings page (8 sections)
│   ├── properties.html                # Property management
│   ├── m1-dashboard.html              # M1 affiliate dashboard
│   ├── m1-config.html                 # M1 configuration
│   └── assets/
│       ├── css/main.css               # Full design system (~2500 lines)
│       └── js/
│           ├── config.js              # API base URL config
│           ├── dashboard.js           # Dashboard logic + Google Maps task
│           ├── settings.js → sync.js  # Settings sync to n8n
│           ├── properties.js          # Property CRUD + modal
│           ├── fillup-form.js         # Onboarding form
│           ├── calendar.js            # Booking calendar
│           ├── booking.js             # Booking management
│           ├── notifications.js       # Notification system
│           ├── auth-guard.js          # Auth route protection
│           ├── m1-config.js           # M1 config logic
│           └── m1-dashboard.js        # M1 dashboard logic
│
├── public/                            # V1 Legacy pages (kept for testing)
│   ├── index.html, dashboard.html, settings.html, etc.
│   └── css/style.css, js/app.js
│
├── workflows/                         # n8n workflow JSON templates
│   ├── v4/                            # Current version (V4)
│   │   ├── SUB_Owner_Staff_Notifier.json
│   │   ├── SUB_Universal_Messenger.json
│   │   └── WF1-WF8 .json files
│   └── (older versions at root level)
│
├── docs/                              # Internal documentation
│   ├── WORKFLOW_ARCHITECTURE_GUIDE.md
│   ├── HTTPS_AND_DOMAIN_SETUP.md
│   ├── ONBOARDING_REQUIRED_VARIABLES.md
│   └── (other guides)
│
└── scripts/                           # Utility scripts
    └── fix-backend.js
```

There is also a **backend provisioning system** in the parent directory at `../backend/src/`:
```
backend/src/
├── routes/
│   ├── controlPanel.js                # Control panel API (38K)
│   ├── admin.js                       # Admin routes
│   ├── auth.js                        # Auth routes
│   ├── health.js                      # Health check
│   └── onboarding.js                  # Client onboarding
└── services/provisioning/
    ├── orchestrator.js                # Full provisioning pipeline
    ├── installer.js                   # SSH stack installer (n8n + PostgreSQL)
    ├── hetzner.js                     # Hetzner API integration
    └── ssh.js                         # SSH client wrapper
```

---

## Your Task — Generate `LOCAL_FILES.md` with these 6 sections:

### Section 1: Inventory & Scan
- List every file with its path, size, and a 1-line description of what it does
- Group files by directory (services, public/v2, database, workflows, etc.)
- Flag any files that appear unused, duplicated, or orphaned

### Section 2: How It Works
For each major component, explain:
- **server.js**: All API route groups (auth, v2 dashboard, sync, n8n, M1), middleware stack, how requests flow
- **db.js**: What tables exist in SQLite, what data is stored locally vs PostgreSQL
- **services/n8n.js**: How workflows are deployed, the patch system, credential management, activation/deactivation
- **services/v2-data.js**: How settings are stored, the mock data pattern, property CRUD
- **services/auth.js**: JWT auth flow, token generation, middleware
- **services/m1-data.js**: Affiliate marketing data structure
- **public/v2/**: How the frontend works — page load flow, API calls, sync mechanism to n8n
- **database/schema-postgresql.sql**: All 23+ tables, their relationships, key columns
- **workflows/v4/**: The hub-and-spoke architecture — SUB workflows, WF1 AI Gateway routing to WF2-WF8
- **backend provisioning**: How orchestrator.js → installer.js → hetzner.js → ssh.js provisions a new client server

### Section 3: Credentials & Access
Document every credential, API key, and access point referenced in the code:
- `.env` variables and what each one connects to
- n8n API key usage (where it's stored, how it's used in `services/n8n.js`)
- PostgreSQL connection strings (local SQLite path, remote PostgreSQL)
- JWT secret for auth
- GitHub repo access
- Any hardcoded credentials or placeholder IDs in workflow JSON files (look for: `postgres-cred`, `openai-cred`, `telegram-cred`, `whatsapp-cred`, `twilio-cred`)

### Section 4: Deployment & Operations
Document how to:
- Install dependencies and run locally (`npm install`, `node server.js`)
- What `.env` variables must be set before running
- How the deploy-to-server flow works (git push → SSH → git pull → pm2 restart)
- How workflows get deployed from JSON templates to n8n (the deployment order: SUB first → WF3-WF8 → WF2 → WF1 last, with delays)
- How to run smoke tests (`test-smoke.js`)

### Section 5: Current Status
For each component, mark its status:
- `WORKING` — fully functional and tested
- `PARTIAL` — built but incomplete or has known gaps
- `BROKEN` — has errors or doesn't function
- `NOT STARTED` — planned but not yet built
- `LEGACY` — kept for reference but not actively used

Cover at minimum: V2 Dashboard, Settings Page (all 8 sections), Properties Page, Booking Calendar, Notifications, Auth System, n8n Deployment Service, M1 Affiliate Module, Backend Provisioning, V1 Legacy Pages.

### Section 6: Issues & Improvements
Categorize every issue found as:
- **CRITICAL** — Blocks core functionality or causes errors
- **IMPORTANT** — Should be fixed but system works without it
- **NICE-TO-HAVE** — Improvements, cleanup, or optimizations

For each issue, note:
- Which file(s) are affected
- What the problem is
- What the suggested fix or improvement would be
- Any dependencies on other areas (server, n8n, etc.)

**DO NOT fix anything. Document only.**

---

## Output Format

Output a single Markdown file with clear headers, tables where appropriate, and code blocks for file paths or config examples. Keep explanations concise but complete — this document will be read by a developer who has never seen this codebase.

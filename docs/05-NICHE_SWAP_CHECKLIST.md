# Niche Swap Checklist

How to clone the Ergovia platform for a new business vertical.

**Current niche:** AirBNB / Vacation Rental management
**Target audience for this doc:** Developer or AI assistant with full codebase access
**Goal:** Launch a new vertical (e.g. Pet Clinic, Dental Practice, Landscaping) in one day

---

## Quick Reference — File Map

| Area | Key Files |
|------|-----------|
| Landing page | `ergovia-lite/public/index.html`, `ergovia-lite/public/landing-styles.css` |
| Onboarding wizard | `ergovia-lite/public/onboarding.html`, `ergovia-lite/public/js/app.js` |
| Dashboard pages (7) | `ergovia-lite/public/airb/*.html` |
| Express backend | `ergovia-lite/server.js` |
| Database schema | `ergovia-lite/database/schema-postgresql.sql` |
| SQLite local state | `ergovia-lite/db.js` |
| n8n workflows | `workflows_postgresql/*.json` |
| AI personality | `docs/PARTNER_BEHAVIOR_DEFINITION.md` |
| V2 data layer | `ergovia-lite/services/v2-data.js` |
| n8n deployment | `ergovia-lite/services/n8n.js` |

---

## 1. Branding & Identity

### What to change

| Item | Current Value | Where |
|------|--------------|-------|
| App name | "Ergovia" / "Ergovia AI" | Everywhere (global find-replace) |
| Tagline | Vacation-rental focused | `index.html` hero section |
| Logo file | `ergovia-lite/public/logo.png` | Replace the PNG |
| Accent color | Current theme vars | `landing-styles.css` CSS variables at `:root` |
| Domain | `ergovia-ai.com` | DNS registrar, Caddy config, `.env` |
| Support email | Current contact | `index.html` footer, onboarding, settings |
| Favicon | Current | `public/` root |

### What stays the same
- The color variable system itself (just change the values)
- The overall layout structure
- Font stack (unless brand requires otherwise)

### Example — Pet Clinic
- App name: "PetFlow AI"
- Tagline: "AI-powered clinic management for modern veterinarians"
- Domain: `petflow-ai.com`
- Accent color: green (#22c55e) instead of current theme

---

## 2. Landing Page

**File:** `ergovia-lite/public/index.html`, `ergovia-lite/public/landing-styles.css`

### Sections to rewrite

| Section | What to change |
|---------|---------------|
| Hero | Headline, subheadline, CTA button text |
| Problem cards | The 3-4 pain points (currently vacation-rental problems) |
| Feature cards | Feature descriptions mapped to new niche |
| How it works | Steps (currently: onboard, connect calendar, AI handles guests) |
| Pricing | Tier names, included features, prices if different |
| Testimonials | Replace with niche-relevant social proof |
| FAQ | Rewrite every Q&A for the new niche |
| Footer | Update links, contact info, legal pages |

### What stays the same
- HTML structure and CSS grid/layout
- Animation classes
- Mobile responsive breakpoints
- The pricing card component structure
- JavaScript for smooth scroll, mobile menu, etc. (`landing-script.js`)

### Example — Dental Practice
- Hero: "Your AI receptionist that never misses a call"
- Problem cards: "Missed appointments cost you $X/year", "Staff buried in phone calls", "No-shows destroying your schedule"
- Features: "AI answers patient inquiries 24/7", "Automatic appointment reminders", "Insurance pre-verification"

---

## 3. Onboarding Wizard

**Files:** `ergovia-lite/public/onboarding.html`, `ergovia-lite/public/js/app.js`

The wizard has 6 steps. Some are universal, some are niche-specific.

### Step breakdown

| Step | Current (AirBNB) | Universal? | New Niche Equivalent |
|------|-------------------|------------|---------------------|
| 1. Owner Info | Name, email, phone, Telegram | YES | Same for every niche |
| 2. Property | Property name, address, type, bedrooms, amenities | NO | **Niche entity**: clinic name, services offered, staff count |
| 3. Guest Access | Check-in/out times, house rules, WiFi, lockbox | NO | **Niche-specific access**: office hours, patient intake rules, parking info |
| 4. Calendars | iCal URL, Airbnb/VRBO sync | NO | **Niche scheduling**: appointment types, durations, booking rules |
| 5. Integrations | Telegram bot token, WhatsApp, payment | MOSTLY | Same structure, different labels (e.g. "patient notification channel") |
| 6. Google Business | Google Business profile URL, review link | YES | Same — every local business has Google Business |

### How to modify

1. **`onboarding.html`**: Find each `<div class="step-content" data-step="N">` block. Steps 2, 3, and 4 need complete form field rewrites. Steps 1, 5, 6 need only label/placeholder text changes.

2. **`ergovia-lite/public/js/app.js`**: Update the `saveStep()` function and the data object keys to match new form fields. The wizard navigation logic (next/prev/skip) stays the same.

3. **`ergovia-lite/server.js`**: Update the `POST /api/onboarding` route to accept the new field names and store them correctly.

4. **`ergovia-lite/db.js`**: Update the SQLite schema for local onboarding state (the `onboarding_data` table or equivalent).

### What stays the same
- Step indicator UI (the numbered circles + progress bar)
- Navigation logic (next, back, skip, save & continue)
- Telegram bot setup flow (step 5)
- Google Business connection (step 6)
- Form validation patterns
- CSS styling

### Example — Pet Clinic

| Step | Fields |
|------|--------|
| 1. Owner Info | Clinic owner name, email, phone, Telegram |
| 2. Clinic Details | Clinic name, address, specialties (dropdown: general, emergency, exotic), number of vets, operating hours |
| 3. Patient Intake | New patient form URL, vaccination requirements, emergency protocol, after-hours policy |
| 4. Appointments | Appointment types (checkup, surgery, vaccination, grooming), default durations, booking buffer time |
| 5. Integrations | Same (Telegram, WhatsApp, payment) |
| 6. Google Business | Same |

---

## 4. Dashboard Pages

**Files:** `ergovia-lite/public/airb/*.html` (7 pages)

### Page-by-page mapping

| Current Page | File | Universal? | New Niche Equivalent |
|-------------|------|------------|---------------------|
| `dashboard.html` | Main stats overview | MOSTLY | Change stat cards (bookings → appointments, occupancy → utilization) |
| `conversations.html` | AI chat threads | YES | Same — every niche has customer conversations |
| `calendar.html` | Booking calendar | MOSTLY | Change event types (check-in/out → appointments) |
| `properties.html` | Property list/CRUD | NO | **Niche entity list**: clinics, practices, locations |
| `settings.html` | Account settings | YES | Same |
| `m1-dashboard.html` | Affiliate/lead stats | YES | Same M1 system |
| `m1-config.html` | Affiliate config | YES | Same M1 system |

### How to modify

1. **Rename the directory**: Copy `ergovia-lite/public/airb/` to a niche-appropriate name (e.g. `clinic/`, `dental/`). Update all internal route references in `server.js`.

2. **`properties.html` → full rewrite**: This page lists the niche-specific entities. Change the table columns, the add/edit modal fields, and the card layout to match the new entity type.

3. **`dashboard.html` → stat card labels**: The 4-6 stat cards on the dashboard need new labels, icons, and API endpoints. Structure stays the same.

4. **`calendar.html` → event types**: Change the event color coding and labels. The FullCalendar integration stays the same.

5. **`conversations.html` → no changes needed**: The AI conversation UI is niche-agnostic. The AI's *responses* change via the workflow system prompt (Section 5), not the UI.

### What stays the same
- Sidebar navigation component (just change labels and icons)
- Dark/light theme toggle
- Notification bell
- CSS framework and responsive grid
- `settings.html` (account, billing, notifications)
- M1 pages (affiliate system is niche-agnostic)

### Example — Pet Clinic
- `properties.html` → `clinics.html`: columns = Clinic Name, Address, Vets on Staff, Services, Status
- Dashboard stat cards: "Appointments Today", "Patients This Week", "Revenue MTD", "Pending Follow-ups"
- Calendar events: color-coded by appointment type (surgery=red, checkup=blue, vaccination=green)

---

## 5. AI Personality & Conversation Flow

**Reference:** `docs/PARTNER_BEHAVIOR_DEFINITION.md`
**Workflow:** WF1 (AI Gateway) system prompt node

### Current 6-stage conversation flow (AirBNB)

1. **Welcome** — Greet guest, identify booking
2. **Qualify** — What do they need? (check-in help, local tips, issue report)
3. **Serve** — Provide the information or trigger an action
4. **Escalate** — If issue is beyond AI, notify owner via Telegram
5. **Follow-up** — Check back after resolution
6. **Review** — Ask for Google review after stay

### How to adapt for any niche

The 6 stages stay the same conceptually but the content changes completely:

| Stage | Universal Pattern | AirBNB Example | Pet Clinic Example |
|-------|------------------|----------------|-------------------|
| 1. Welcome | Greet + identify | "Welcome! What's your booking name?" | "Hi! Is this about an existing appointment?" |
| 2. Qualify | Understand need | Check-in, amenity, issue | Appointment, prescription refill, emergency |
| 3. Serve | Deliver value | Send WiFi code, directions | Send appointment details, prep instructions |
| 4. Escalate | Human handoff | Owner gets Telegram alert | Vet/receptionist gets Telegram alert |
| 5. Follow-up | Check satisfaction | "How was your stay?" | "How is [pet name] recovering?" |
| 6. Review | Ask for review | Google review link | Google review link |

### What to change

1. **WF1 system prompt** (`workflows_postgresql/Workflow_01_PostgreSQL_PERFECT.json`): Find the node with `systemMessage` parameter. Rewrite the entire personality definition, knowledge base, and response templates.

2. **`docs/PARTNER_BEHAVIOR_DEFINITION.md`**: Rewrite this document first as your "source of truth" for AI behavior, then translate it into the WF1 system prompt.

3. **Knowledge the AI needs** (varies by niche):
   - AirBNB: property details, house rules, check-in instructions, local recommendations
   - Pet Clinic: services offered, pricing, vet bios, emergency protocols, vaccination schedules
   - Dental: procedures, insurance accepted, office hours, emergency contact, pre-procedure instructions

### What stays the same
- The 6-stage flow structure
- Escalation to Telegram pattern
- The conversation memory system (`n8n_chat_histories` table)
- Tone framework (friendly, professional, concise) — adjust per niche but same principles
- The hub-and-spoke routing in WF1

---

## 6. Workflow Customization

**Files:** `workflows_postgresql/*.json`

### Niche classification

| Workflow | Name | Niche-Agnostic? | Notes |
|----------|------|-----------------|-------|
| SUB1 | Universal Messenger | YES | Sends Telegram/WhatsApp — no niche logic |
| SUB2 | Server Setup | YES | PostgreSQL provisioning — no niche logic |
| WF1 | AI Gateway | NO | System prompt is 100% niche-specific |
| WF2 | Booking Flow | NO | Rewrite for niche transaction type |
| WF3 | Calendar Sync | NO | Rewrite for niche scheduling model |
| WF4 | Payment Processing | MOSTLY | Payment logic is universal, line items are niche-specific |
| WF5 | Maintenance/Tasks | NO | Rewrite for niche task types |
| WF6 | Daily Automations | MOSTLY | Timing logic universal, messages are niche-specific |
| WF7 | Review Request | MOSTLY | Review request logic universal, message templates niche-specific |
| WF8 | System Health | YES | Monitors infrastructure — no niche logic |

### How to modify workflows

1. **Start with niche-agnostic ones**: SUB1, SUB2, WF8 deploy unchanged.
2. **Modify "mostly universal" ones**: WF4, WF6, WF7 — change message templates and field references, keep logic.
3. **Rewrite niche-specific ones**: WF1, WF2, WF3, WF5 — these need significant rework.

### Key technical notes
- Workflow JSON files reference database table/column names. When you rename tables (Section 7), update every SQL query node in affected workflows.
- The `=` prefix rule for n8n expressions still applies (see MEMORY.md).
- Never mix `=` prefix with `$1`/`$2` PostgreSQL parameter placeholders.
- Deploy order: SUB1 + SUB2 first, then WF3-WF8, then WF2, then WF1 last.

### Example — Pet Clinic
- WF2 "Booking Flow" → "Appointment Flow": handles appointment creation, confirmation, reminders
- WF3 "Calendar Sync" → "Schedule Sync": syncs vet availability, blocks surgery time slots
- WF5 "Maintenance" → "Follow-up Care": post-visit check-ins, medication reminders, vaccination due dates

---

## 7. Database Schema

**File:** `ergovia-lite/database/schema-postgresql.sql`

### Table classification

| Table | Universal? | Notes |
|-------|------------|-------|
| `owners` | YES | Business owner info |
| `customers` | YES | End-customer records |
| `api_usage_budget` | YES | OpenAI token tracking |
| `n8n_chat_histories` | YES | AI conversation memory |
| `affiliates` | YES | M1 affiliate/lead system |
| `notification_log` | YES | Alert history |
| `property_configurations` | NO | Rename + restructure for niche entity |
| `bookings` | NO | Rename + restructure for niche transactions |
| `guest_screening` | NO | Rename for niche intake/qualification |
| `niche_problems` | PARTIAL | Keep structure, change seed data |
| `calendar_events` | MOSTLY | Change event type enum values |
| `payment_transactions` | MOSTLY | Universal structure, niche line items |

### How to modify

1. **Copy `schema-postgresql.sql`** and rename niche-specific tables:
   - `property_configurations` → `clinic_configurations` (or whatever your entity is)
   - `bookings` → `appointments`
   - `guest_screening` → `patient_intake`

2. **Update columns** in renamed tables to match niche fields:
   - `bedrooms` → `exam_rooms`
   - `check_in_time` → `opening_time`
   - `amenities` → `services_offered`

3. **Update seed data** in `niche_problems`:
   - Change `niche` value from `airbnb_staycation` to your niche identifier
   - Rewrite `problem_title`, `problem_description`, `solution_hook` for new niche

4. **Update `ergovia-lite/db.js`** — the SQLite schema mirrors some of these tables for local state. Rename columns there too.

5. **Update all SQL queries** in:
   - `ergovia-lite/server.js` (Express API routes)
   - `workflows_postgresql/*.json` (n8n workflow SQL nodes)
   - `ergovia-lite/services/v2-data.js` (dashboard data queries)

### What stays the same
- Table structure patterns (UUIDs, timestamps, foreign keys)
- The `owners` / `customers` / `affiliates` relationship model
- Token budget tracking
- Notification and chat history tables
- Migration file pattern (`migration_00X_*.sql`)

### Example — Pet Clinic

```sql
-- BEFORE (AirBNB)
CREATE TABLE property_configurations (
  id UUID PRIMARY KEY,
  owner_id TEXT REFERENCES owners(owner_id),
  property_name TEXT,
  address TEXT,
  bedrooms INTEGER,
  amenities JSONB,
  check_in_time TIME,
  check_out_time TIME,
  house_rules TEXT
);

-- AFTER (Pet Clinic)
CREATE TABLE clinic_configurations (
  id UUID PRIMARY KEY,
  owner_id TEXT REFERENCES owners(owner_id),
  clinic_name TEXT,
  address TEXT,
  exam_rooms INTEGER,
  services_offered JSONB,
  opening_time TIME,
  closing_time TIME,
  intake_policy TEXT
);
```

---

## 8. Server & API Routes

**File:** `ergovia-lite/server.js` (~50+ routes)

### Route classification

| Route Group | Universal? | Notes |
|-------------|------------|-------|
| `POST /api/onboarding` | MOSTLY | Universal flow, niche-specific fields |
| `GET/POST /api/settings/*` | YES | Account settings |
| `GET/POST /api/notifications/*` | YES | Alert management |
| `POST /api/sync/*` | YES | n8n sync operations |
| `POST /api/deploy/*` | YES | Workflow deployment |
| `GET/POST /api/properties/*` | NO | CRUD for niche entity |
| `GET/POST /api/bookings/*` | NO | CRUD for niche transactions |
| `GET/POST /api/conversations/*` | YES | AI chat threads (niche-agnostic) |
| `GET /api/dashboard/stats` | MOSTLY | Universal pattern, niche-specific stat queries |
| `GET/POST /api/m1/*` | YES | Affiliate system |
| `GET /api/calendar/*` | MOSTLY | Universal calendar, niche event types |

### How to modify

1. **Find-and-replace route paths**: `/api/properties` → `/api/clinics` (or your entity name).

2. **Update CRUD handlers**: The handler pattern (validate input, query DB, return JSON) stays the same. Change the field names in validation, SQL queries, and response objects.

3. **Update dashboard stats route**: Change the SQL queries to aggregate niche-relevant metrics.

4. **Update the static file serving**: If you renamed the `airb/` directory (Section 4), update the Express static middleware path.

### What stays the same
- Express app structure and middleware stack
- Authentication middleware pattern
- Error handling
- Rate limiting
- CORS configuration
- Session middleware (`middleware/sessionMiddleware.js` pattern)
- All `/api/sync/*`, `/api/deploy/*`, `/api/m1/*` routes

### Example — Pet Clinic

```javascript
// BEFORE
app.get('/api/properties', async (req, res) => { ... });
app.post('/api/properties', async (req, res) => { ... });
app.get('/api/bookings', async (req, res) => { ... });

// AFTER
app.get('/api/clinics', async (req, res) => { ... });
app.post('/api/clinics', async (req, res) => { ... });
app.get('/api/appointments', async (req, res) => { ... });
```

---

## 9. Google Business / Lead Strategy

The M1 system (Google Maps → WhatsApp → AI conversation → onboarding) works for **any local business niche**. This is one of the most reusable parts of the platform.

### How it works (universal pattern)

1. **Affiliate finds businesses** on Google Maps that match the niche
2. **Affiliate sends WhatsApp message** with a hook about the niche problem
3. **Business owner responds** → enters AI conversation flow (WF1)
4. **AI qualifies the lead** through the 6-stage flow
5. **Qualified lead** gets sent to onboarding wizard
6. **Owner completes onboarding** → server provisioned automatically

### What to change

| Item | What to modify |
|------|---------------|
| `niche_problems` seed data | New problem statements for the niche (currently 5 rows for `airbnb_staycation`) |
| WhatsApp message templates | Rewrite the outreach scripts in `docs/PARTNER_BEHAVIOR_DEFINITION.md` |
| Google Maps search criteria | New search terms (e.g. "veterinary clinic near me" instead of "vacation rental") |
| Qualification questions | What the AI asks to determine if the lead is a good fit |
| M1 dashboard labels | Update `m1-dashboard.html` stat labels if needed |

### What stays the same
- The entire M1 infrastructure (affiliate tracking, lead attribution, commission logic)
- The Google Maps scraping/search approach
- WhatsApp integration via n8n
- The lead → onboarding → provisioning pipeline
- `m1-config.html` and `m1-dashboard.html` UI (just relabel)

### Example — Dental Practice
- Search: "dentist" + city on Google Maps
- Hook: "I noticed your practice has 3.8 stars — our AI receptionist can help you get 30% more 5-star reviews by following up with every patient automatically"
- Qualification: "How many patients per week? Do you have a booking system? What's your no-show rate?"

---

## 10. Deployment Checklist

Follow this in order. Each step depends on the previous one.

### Pre-deployment

- [ ] New domain registered (e.g. `petflow-ai.com`)
- [ ] DNS pointed to Hetzner server IP (A record)
- [ ] New GitHub repo created (or branch from ERGOVIA-2)
- [ ] All file changes from Sections 1-8 completed and tested locally

### Server setup

- [ ] Provision new Hetzner server (or reuse if multi-tenant)
- [ ] Install Docker, Docker Compose
- [ ] Deploy PostgreSQL container with new schema (`schema-postgresql.sql`)
- [ ] Deploy n8n container
- [ ] Configure Caddy for SSL (automatic via Let's Encrypt)
- [ ] Create `.env` file with all required variables:

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=your_db_name
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_SSL=disable

# n8n
N8N_HOST=n8n.yourdomain.com
N8N_API_KEY=your_n8n_api_key

# API Keys (provided by Ergovia)
OPENAI_API_KEY=sk-...

# Customer
CUSTOMER_ID=uuid-here
ADMIN_TELEGRAM_CHAT_ID=your_chat_id
OWNER_CHAT_ID=your_chat_id
```

### Workflow deployment

- [ ] Deploy SUB1 (Universal Messenger) — wait 3s
- [ ] Deploy SUB2 (Server Setup) — wait 3s
- [ ] Deploy WF3 through WF8 — wait 2s between each
- [ ] Deploy WF2 — wait 2s
- [ ] Deploy WF1 (AI Gateway) — last

### Smoke test

- [ ] Landing page loads at `https://yourdomain.com`
- [ ] Onboarding wizard completes all 6 steps
- [ ] Dashboard loads with correct niche labels
- [ ] Properties/entities CRUD works (create, read, update, delete)
- [ ] AI conversation responds via Telegram/WhatsApp
- [ ] Calendar shows events
- [ ] Settings save correctly
- [ ] M1 dashboard loads
- [ ] Daily automation workflow fires (check n8n execution log)
- [ ] System health workflow reports green

### Post-deployment

- [ ] Seed `niche_problems` table with niche-specific data
- [ ] Seed test `owners` and `customers` records
- [ ] Configure at least one affiliate in `affiliates` table
- [ ] Test the full lead flow: Google Maps → WhatsApp → AI → Onboarding → Dashboard
- [ ] Verify OpenAI budget tracking works (`api_usage_budget` table)

---

## Quick Start: The 10-Minute Version

If you want the fastest possible path to a new niche:

1. **Fork the repo** and create a new branch
2. **Global find-replace** the niche terms (property→clinic, booking→appointment, guest→patient, etc.)
3. **Rewrite the WF1 system prompt** for your niche AI personality
4. **Update `schema-postgresql.sql`** — rename 3-4 tables, change columns
5. **Rewrite onboarding steps 2-4** form fields
6. **Rewrite landing page copy** (hero, problems, features, FAQ)
7. **Update `niche_problems` seed data**
8. **Deploy** following the deployment checklist above
9. **Smoke test** the 10-point checklist above

Everything else (auth, settings, notifications, M1 system, SUB workflows, deployment pipeline, infrastructure) works out of the box.

# Ergovia Lite - Workflow Fixing Mission

## Your Mission

You are tasked with making all 9 n8n workflows on the live Ergovia Lite instance **fully operational**. You have direct API access to modify workflows in-place. Your job is to:

1. **Diagnose** every error in the execution log
2. **Fix workflows directly** on the live n8n instance via API
3. **Fix the backend database** by applying the migration SQL
4. **Verify** each workflow executes without errors

Do NOT just document issues — **fix them directly** using the API.

---

## n8n API Access

- **Instance:** `https://n8n.ergovia-ai.com`
- **API Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU`
- **Auth Header:** `X-N8N-API-KEY: <key above>`

### API Cheat Sheet

```bash
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU"

# List all workflows
curl -s "https://n8n.ergovia-ai.com/api/v1/workflows" -H "X-N8N-API-KEY: $API_KEY"

# Get a specific workflow
curl -s "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}" -H "X-N8N-API-KEY: $API_KEY"

# Update a workflow (PUT full workflow JSON)
curl -s -X PUT "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}" \
  -H "X-N8N-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" \
  -d @workflow.json

# Activate / Deactivate
curl -s -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}/activate" -H "X-N8N-API-KEY: $API_KEY"
curl -s -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}/deactivate" -H "X-N8N-API-KEY: $API_KEY"

# Get executions (check errors)
curl -s "https://n8n.ergovia-ai.com/api/v1/executions?limit=20" -H "X-N8N-API-KEY: $API_KEY"
curl -s "https://n8n.ergovia-ai.com/api/v1/executions/{EXEC_ID}?includeData=true" -H "X-N8N-API-KEY: $API_KEY"

# List credentials
curl -s "https://n8n.ergovia-ai.com/api/v1/credentials" -H "X-N8N-API-KEY: $API_KEY"
```

---

## Current State: 9 Workflows, All Active

| Workflow | n8n ID | Nodes | Status |
|----------|--------|-------|--------|
| SUB: Universal Messenger | `UZMWfhnV6JmuwJXC` | 13 | Active |
| WF1: AI Gateway | `LP7YknAVPiQsidWq` | 28 | Active |
| WF2: AI Booking Agent | `NPInwpKv4Oriq04F` | 44 | Active |
| WF3: Calendar Manager | `pEn69kwNtCEQ21y9` | 14 | Active |
| WF4: Payment Processor | `5loDH75zrEDh9x5H` | 18 | Active |
| WF5: Property Operations | `JWEu9Uz2JJ5XZeIX` | 13 | Active |
| WF6: Daily Automations | `ccEOaNnIwY6eeJOn` | 28 | Active |
| WF7: Integration Hub | `Ay5QOyGAHG2l40s7` | 13 | Active |
| WF8: Safety & Screening | `mLm2HaIRzNfIX5uh` | 15 | Active |

---

## Known Errors (from execution log)

### Error 1: `relation "conversations" does not exist`
- **Affected:** WF2 (node: "Load Conversation Context"), WF8 (node: "Run Watchdog Checks")
- **Root cause:** The `conversations` table exists in the schema SQL but has NOT been applied to the live database yet
- **Fix:** Apply the migration SQL (see below)

### Error 2: `relation "cleaning_schedules" does not exist`
- **Affected:** WF6 (node: "Get Evening Data")
- **Root cause:** WF6 JOINs on `cleaning_schedules` but this table doesn't exist in the original schema
- **Fix:** The migration SQL creates this table. Apply it.

### Error 3: `relation "offer_conflicts" does not exist` (will occur when WF2 processes competing bookings)
- **Affected:** WF2 (nodes: "Save Conflict Record", "Update Conflict Resolved")
- **Fix:** Migration SQL creates `offer_conflicts` table

### Error 4: `column "customer_id" does not exist` (will occur in WF1/WF6)
- **Affected:** WF1 (node: "Get Customer ID"), WF6 (nodes: "Get Morning Data", "Get Evening Data")
- **Root cause:** `property_configurations` table is missing the `customer_id` and `owner_contact` columns
- **Fix:** Migration SQL adds these columns via ALTER TABLE

### Error 5: Missing PostgreSQL functions
- **Affected:** WF1 (Check Budget, Log API Cost), WF6 (Check Budget Morning/Evening/Weekly, Reset Monthly Budgets), SUB (Log Messaging Cost)
- **Functions needed:** `check_budget_available()`, `log_api_usage()`, `reset_monthly_budgets()`, `get_or_create_budget()`
- **Fix:** Migration SQL creates all 4 functions

---

## Credential Issue: Duplicate Credentials

The workflows use **two different credential IDs** for the same service. This is fragile and should be unified.

| Service | Credential 1 | Credential 2 | Used By |
|---------|-------------|-------------|---------|
| PostgreSQL | `BWlLUMKn64aZsHi8` ("[Client] PostgreSQL") | `sjaI08GtPbON8TLX` ("PostgreSQL - Client") | WF2-8 use first, WF1/WF6/SUB use second |
| OpenAI | `slpbr7aUaU6fqTfw` ("[Client] OpenAI") | `sCKJDGWd6f8LxAw1` ("OpenAI - Client") | WF1/3-6/8 use first, WF1/2 use second |
| Telegram | `6ltptOrFLUaZzC1C` ("[Client] Telegram Bot") | `m5CO4ySXIhlnUNcp` ("Telegram Bot - Client") | SUB/WF4/5 use first, WF1/2 use second |
| Twilio | `twilio-cred` (PLACEHOLDER - not configured) | — | WF1/WF2/SUB |

**Action needed:**
1. Verify both PostgreSQL credentials point to the same database. If so, pick ONE and update all workflows to use it.
2. Same for OpenAI and Telegram — verify they're duplicates, then consolidate.
3. The `twilio-cred` is a **placeholder** (literal string ID "twilio-cred"). This will cause errors if SMS/WhatsApp is triggered. Either create a real Twilio credential or update the workflows to gracefully skip Twilio when unconfigured.

---

## Database: Migration SQL to Apply

The database is PostgreSQL running on the Hetzner server at `116.203.115.12`:
- Container: `ergovia-db`
- Database: `ergovia_db`
- User: `ergovia_user`
- Port: 5432
- Docker network: `ergovia-net`

To SSH into the server and apply the migration:

```bash
# SSH to server (you'll need the root password or SSH key)
ssh root@116.203.115.12

# Apply migration via docker exec
docker exec -i ergovia-db psql -U ergovia_user -d ergovia_db < migration.sql

# Or connect directly:
docker exec -it ergovia-db psql -U ergovia_user -d ergovia_db
```

### The Full Migration SQL

Below is the complete migration. It is safe to run multiple times (uses `IF NOT EXISTS` and `IF NOT EXISTS` for columns, `ON CONFLICT DO NOTHING` for inserts).

```sql
-- ============================================================================
-- MIGRATION 001: Add tables & columns required by live n8n workflows
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Add missing columns to property_configurations
ALTER TABLE property_configurations ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE property_configurations ADD COLUMN IF NOT EXISTS owner_contact VARCHAR(255);
ALTER TABLE property_configurations ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255);

UPDATE property_configurations SET owner_contact = owner_phone
WHERE owner_contact IS NULL AND owner_phone IS NOT NULL;

-- 2. customers table (WF6 budget summaries)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    preferred_platform VARCHAR(50) DEFAULT 'telegram',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. owners table (WF4 joins on it)
CREATE TABLE IF NOT EXISTS owners (
    owner_id VARCHAR(255) PRIMARY KEY,
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    owner_phone VARCHAR(50),
    owner_chat_id VARCHAR(255),
    preferred_platform VARCHAR(50) DEFAULT 'telegram',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. cleaning_schedules (WF6 evening data JOIN)
CREATE TABLE IF NOT EXISTS cleaning_schedules (
    id SERIAL PRIMARY KEY,
    schedule_id VARCHAR(255) UNIQUE,
    booking_id VARCHAR(255),
    property_id VARCHAR(255),
    cleaner_id VARCHAR(255),
    scheduled_date DATE,
    scheduled_time TIME,
    status VARCHAR(50) DEFAULT 'scheduled',
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_booking ON cleaning_schedules(booking_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_status ON cleaning_schedules(status);

-- 5. offer_conflicts (WF2 competing offers)
CREATE TABLE IF NOT EXISTS offer_conflicts (
    id SERIAL PRIMARY KEY,
    conflict_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255),
    property_name VARCHAR(255),
    check_in_date DATE,
    check_out_date DATE,
    offers JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'pending_decision',
    owner_notified BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offer_conflicts_property ON offer_conflicts(property_id);
CREATE INDEX IF NOT EXISTS idx_offer_conflicts_status ON offer_conflicts(status);

-- 6. n8n_chat_histories (LangChain memory for WF1 AI Agent)
CREATE TABLE IF NOT EXISTS n8n_chat_histories (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    message JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_n8n_chat_histories_session ON n8n_chat_histories(session_id);

-- 7. Budget tracking tables
CREATE TABLE IF NOT EXISTS api_usage_budget (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    monthly_budget DECIMAL(10,4) DEFAULT 30.00,
    used_amount DECIMAL(10,4) DEFAULT 0.00,
    alert_50_sent BOOLEAN DEFAULT FALSE,
    alert_80_sent BOOLEAN DEFAULT FALSE,
    alert_100_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, month_year)
);

CREATE TABLE IF NOT EXISTS api_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    operation VARCHAR(100),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) NOT NULL,
    workflow_name VARCHAR(100),
    node_name VARCHAR(100),
    execution_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_pricing_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_cost_per_1k DECIMAL(10,6),
    output_cost_per_1k DECIMAL(10,6),
    cost_per_unit DECIMAL(10,6),
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    UNIQUE(provider, model, effective_from)
);

INSERT INTO api_pricing_rates (provider, model, input_cost_per_1k, output_cost_per_1k, cost_per_unit)
VALUES
    ('openai', 'gpt-4o-mini', 0.00015, 0.0006, NULL),
    ('twilio', 'sms', NULL, NULL, 0.0079),
    ('twilio', 'whatsapp', NULL, NULL, 0.005),
    ('telegram', 'bot_api', NULL, NULL, 0.00)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS api_budget_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    alert_type VARCHAR(20) NOT NULL,
    usage_at_alert DECIMAL(10,4),
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_credit_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    amount_usd DECIMAL(10,2) NOT NULL,
    credits_added DECIMAL(10,4) NOT NULL,
    payment_reference VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Budget functions

CREATE OR REPLACE FUNCTION get_or_create_budget(p_customer_id UUID)
RETURNS TABLE(
    budget_id UUID, monthly_budget DECIMAL, used_amount DECIMAL,
    remaining DECIMAL, usage_percent DECIMAL,
    alert_50_sent BOOLEAN, alert_80_sent BOOLEAN, alert_100_sent BOOLEAN
) AS $$
DECLARE
    v_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_budget_id UUID;
BEGIN
    SELECT b.id INTO v_budget_id FROM api_usage_budget b
    WHERE b.customer_id = p_customer_id AND b.month_year = v_month;

    IF v_budget_id IS NULL THEN
        INSERT INTO api_usage_budget (customer_id, month_year, monthly_budget, used_amount)
        VALUES (p_customer_id, v_month, 30.00, 0.00)
        ON CONFLICT (customer_id, month_year) DO NOTHING
        RETURNING id INTO v_budget_id;
        IF v_budget_id IS NULL THEN
            SELECT b.id INTO v_budget_id FROM api_usage_budget b
            WHERE b.customer_id = p_customer_id AND b.month_year = v_month;
        END IF;
    END IF;

    RETURN QUERY SELECT b.id, b.monthly_budget, b.used_amount,
        (b.monthly_budget - b.used_amount),
        CASE WHEN b.monthly_budget > 0 THEN (b.used_amount / b.monthly_budget * 100) ELSE 0 END,
        b.alert_50_sent, b.alert_80_sent, b.alert_100_sent
    FROM api_usage_budget b WHERE b.id = v_budget_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_budget_available(
    p_customer_id UUID, p_estimated_cost DECIMAL DEFAULT 0.01
) RETURNS TABLE(
    is_available BOOLEAN, used_amount DECIMAL, monthly_budget DECIMAL,
    remaining DECIMAL, usage_percent DECIMAL
) AS $$
DECLARE v_budget RECORD;
BEGIN
    SELECT * INTO v_budget FROM get_or_create_budget(p_customer_id);
    RETURN QUERY SELECT
        (v_budget.remaining >= p_estimated_cost),
        v_budget.used_amount, v_budget.monthly_budget,
        v_budget.remaining, v_budget.usage_percent;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_api_usage(
    p_customer_id UUID, p_provider VARCHAR, p_model VARCHAR, p_operation VARCHAR,
    p_input_tokens INTEGER, p_output_tokens INTEGER, p_cost_usd DECIMAL,
    p_workflow_name VARCHAR, p_node_name VARCHAR, p_execution_id VARCHAR
) RETURNS TABLE(
    new_usage DECIMAL, monthly_budget DECIMAL, remaining DECIMAL,
    usage_percent DECIMAL, alert_50_needed BOOLEAN, alert_80_needed BOOLEAN, alert_100_needed BOOLEAN
) AS $$
DECLARE
    v_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_budget RECORD;
BEGIN
    PERFORM get_or_create_budget(p_customer_id);
    INSERT INTO api_usage_log (customer_id, provider, model, operation,
        input_tokens, output_tokens, cost_usd, workflow_name, node_name, execution_id)
    VALUES (p_customer_id, p_provider, p_model, p_operation,
        p_input_tokens, p_output_tokens, p_cost_usd, p_workflow_name, p_node_name, p_execution_id);
    UPDATE api_usage_budget SET used_amount = used_amount + p_cost_usd, updated_at = NOW()
    WHERE customer_id = p_customer_id AND month_year = v_month;
    SELECT b.used_amount, b.monthly_budget, b.alert_50_sent, b.alert_80_sent, b.alert_100_sent
    INTO v_budget FROM api_usage_budget b
    WHERE b.customer_id = p_customer_id AND b.month_year = v_month;
    RETURN QUERY SELECT v_budget.used_amount, v_budget.monthly_budget,
        (v_budget.monthly_budget - v_budget.used_amount),
        CASE WHEN v_budget.monthly_budget > 0 THEN (v_budget.used_amount / v_budget.monthly_budget * 100) ELSE 0 END,
        (v_budget.used_amount >= v_budget.monthly_budget * 0.5 AND NOT v_budget.alert_50_sent),
        (v_budget.used_amount >= v_budget.monthly_budget * 0.8 AND NOT v_budget.alert_80_sent),
        (v_budget.used_amount >= v_budget.monthly_budget AND NOT v_budget.alert_100_sent);
    UPDATE api_usage_budget SET
        alert_50_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget * 0.5 THEN TRUE ELSE alert_50_sent END,
        alert_80_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget * 0.8 THEN TRUE ELSE alert_80_sent END,
        alert_100_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget THEN TRUE ELSE alert_100_sent END
    WHERE customer_id = p_customer_id AND month_year = v_month;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reset_monthly_budgets()
RETURNS TABLE(
    customer_id UUID, owner_name VARCHAR, owner_email VARCHAR,
    last_month_usage DECIMAL, monthly_budget DECIMAL
) AS $$
DECLARE
    v_new_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_last_month VARCHAR(7) := TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM');
BEGIN
    INSERT INTO api_usage_budget (customer_id, month_year, monthly_budget, used_amount)
    SELECT b.customer_id, v_new_month, b.monthly_budget, 0.00
    FROM api_usage_budget b WHERE b.month_year = v_last_month
    ON CONFLICT (customer_id, month_year) DO NOTHING;
    RETURN QUERY SELECT b.customer_id, c.name, c.email, b.used_amount, b.monthly_budget
    FROM api_usage_budget b LEFT JOIN customers c ON c.id = b.customer_id
    WHERE b.month_year = v_last_month;
END;
$$ LANGUAGE plpgsql;
```

### ALSO: The base schema must be applied first

Before the migration above, the BASE schema (23 original tables) must exist. Check if it's already applied:

```sql
-- Run this to check:
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

If `bookings`, `conversations`, `property_configurations`, `deals` etc. are missing, apply the full base schema first. You can find it at the path `ergovia-lite/database/schema-postgresql.sql` in the project, or read it from the n8n instance context.

---

## Architecture Context

**Ergovia Lite** = AirBNB automation SaaS. Each client gets their own Hetzner server with n8n + PostgreSQL.

### Hub-and-Spoke Workflow Architecture
```
Guest Message (Telegram/WhatsApp/SMS)
        │
        ▼
  WF1: AI Gateway (LangChain Agent)
        │ ── uses tools to call ──┐
        ▼                         ▼
  WF2: Booking Agent      WF3: Calendar Manager
  WF4: Payment Processor  WF5: Property Operations
  WF8: Safety & Screening WF7: Integration Hub
        │
        ▼
  SUB: Universal Messenger (sends responses back)

  WF6: Daily Automations (cron-triggered, independent)
```

### Key Points
- WF1 is now a **LangChain AI Agent** with tools (not a keyword router)
- Each WF2-WF8 is called as a **tool** by the AI Agent
- SUB handles all outbound messages (Telegram/WhatsApp/SMS)
- WF6 runs on cron schedules (morning 9AM, evening 6PM, weekly Monday, monthly 1st)
- Budget tracking gates every AI call — if $30/month exhausted, returns template responses

---

## Step-by-Step Fix Plan

### Phase 1: Database (do this FIRST)

1. SSH to `116.203.115.12`
2. Check what tables exist: `docker exec -it ergovia-db psql -U ergovia_user -d ergovia_db -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"`
3. If base tables are missing (bookings, conversations, etc.), apply the base schema from `ergovia-lite/database/schema-postgresql.sql`
4. Apply the migration SQL above
5. Verify: `\dt` should show 30+ tables including `customers`, `owners`, `cleaning_schedules`, `offer_conflicts`, `n8n_chat_histories`, `api_usage_budget`, etc.

### Phase 2: Credential Consolidation

1. List credentials: `GET /api/v1/credentials`
2. Verify if both PostgreSQL credentials (`BWlLUMKn64aZsHi8` and `sjaI08GtPbON8TLX`) connect to the same DB
3. Pick ONE credential ID per service
4. Update ALL workflows to use the single credential ID
5. For Twilio: either create a real credential or add error handling in SUB/WF1/WF2 to skip Twilio gracefully when unconfigured

### Phase 3: Workflow Fixes

For each workflow, follow this process:
1. `GET /api/v1/workflows/{ID}` — download full JSON
2. Check for issues (wrong credential IDs, broken connections, missing nodes)
3. Fix the JSON
4. `POST /api/v1/workflows/{ID}/deactivate` — deactivate before update
5. `PUT /api/v1/workflows/{ID}` — upload fixed JSON
6. `POST /api/v1/workflows/{ID}/activate` — reactivate

**Specific fixes needed per workflow:**

#### WF6: Daily Automations (`ccEOaNnIwY6eeJOn`)
- "Get Evening Data" node queries `cleaning_schedules` — will work after migration
- "Get Last Month Summary" queries `customers` table — will work after migration
- "Get Morning Data" / "Get Evening Data" reference `p.owner_contact` and `p.customer_id` — will work after migration adds those columns

#### WF2: AI Booking Agent (`NPInwpKv4Oriq04F`)
- "Load Conversation Context" queries `conversations` — will work after base schema applied
- "Save Conflict Record" inserts into `offer_conflicts` — will work after migration
- "Update Conflict Resolved" updates `offer_conflicts` — will work after migration

#### WF4: Payment Processor (`5loDH75zrEDh9x5H`)
- "Get Property & Owner" JOINs `owners` table — will work after migration

#### WF8: Safety & Screening (`mLm2HaIRzNfIX5uh`)
- "Run Watchdog Checks" queries `conversations` — will work after base schema applied

#### WF1: AI Gateway (`LP7YknAVPiQsidWq`)
- "Get Customer ID" queries `property_configurations.customer_id` — will work after migration
- "Check Budget" calls `check_budget_available()` — will work after migration
- "Log API Cost" calls `log_api_usage()` — will work after migration
- Chat Memory uses `n8n_chat_histories` — will work after migration

#### SUB: Universal Messenger (`UZMWfhnV6JmuwJXC`)
- "Log Messaging Cost" calls `log_api_usage()` — will work after migration
- Has `twilio-cred` placeholder — fix or add graceful skip

### Phase 4: Verification

After all fixes:
1. Check execution log for new errors: `GET /api/v1/executions?limit=20`
2. Trigger a test by sending a Telegram message to the bot
3. Check that WF1 processes it without errors
4. Wait for WF6 cron to fire (or manually trigger) and verify no DB errors
5. Report results

---

## Important Rules

1. **Always deactivate a workflow before updating it, then reactivate after**
2. **Do NOT delete any workflows** — only modify in place
3. **Do NOT change workflow names** — only fix internals
4. **Preserve all existing node connections** — don't break the flow
5. **When updating a workflow via PUT, include ALL fields** — the API replaces the entire workflow
6. **Test after each fix** — don't batch all changes then hope it works
7. **Document what you changed** — create a report of all modifications

---

## Server Access

- **IP:** 116.203.115.12
- **n8n container:** `n8n`
- **PostgreSQL container:** `ergovia-db`
- **Docker network:** `ergovia-net`
- **DB:** user=`ergovia_user`, db=`ergovia_db`, port=5432
- **Domain:** ergovia-ai.com (subdomains per client)
- **Architecture:** ARM64/aarch64

---

## Success Criteria

You are done when:
- [ ] All 9 workflows are active with no execution errors
- [ ] Database has all required tables (30+) and all 4 budget functions
- [ ] Each workflow uses a single, consistent credential per service type
- [ ] WF6 cron triggers (morning/evening/weekly) execute without errors
- [ ] WF1 can process an incoming message end-to-end
- [ ] Budget tracking (check → AI call → log cost) works
- [ ] A clear report of all changes is produced

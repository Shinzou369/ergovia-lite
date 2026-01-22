# Render Multi-User n8n Testing Handout
## Complete Step-by-Step Client Simulation Guide

**Purpose:** Test the entire property management automation system from client onboarding to daily operations.

**Prerequisites:**
- n8n self-hosted on Render (running)
- PostgreSQL database (on Render or Neon)
- Your n8n URL: `https://your-app.onrender.com`

---

# PHASE 1: CLIENT ACCOUNT SETUP

## Step 1.1: Create Client Account in n8n

| Step | Action | Where to Click |
|------|--------|----------------|
| 1 | Open n8n | `https://your-app.onrender.com` |
| 2 | Login as admin | Enter admin credentials |
| 3 | Go to Settings | Click **gear icon** (top right) |
| 4 | Click Users | Left sidebar → **Users** |
| 5 | Invite new user | Click **"Invite"** button |
| 6 | Enter client email | Fill in client's email address |
| 7 | Set role | Select **"Member"** (not Admin) |
| 8 | Send invite | Click **"Invite"** |

**Client receives:** Email invitation to create password

---

## Step 1.2: Create Client's Database Schema

| Step | Action | SQL Command |
|------|--------|-------------|
| 1 | Connect to PostgreSQL | Use Render dashboard or `psql` |
| 2 | Create schema | `CREATE SCHEMA client_johnsmith;` |
| 3 | Set search path | `SET search_path TO client_johnsmith;` |
| 4 | Run table creation | Paste all 26 CREATE TABLE statements |

**Database console URL:** `https://dashboard.render.com` → Your database → **Shell**

---

## Step 1.3: Import Workflows for Client

| Step | Action | Where to Click |
|------|--------|----------------|
| 1 | Login as client | Use client credentials |
| 2 | Click menu | **⋮** (three dots, top right) |
| 3 | Select Import | **"Import from File"** |
| 4 | Choose file | Select `Workflow_00_PostgreSQL_PERFECT.json` |
| 5 | Confirm | Click **"Import"** |
| 6 | Repeat | Import all 25 workflow files (00-24) |

**Workflow files location:** All workflows are in the `workflows_postgresql/` folder:
- `Workflow_00_PostgreSQL_PERFECT.json` through `Workflow_23_PostgreSQL_PERFECT.json`
- `Workflow_24_Watchdog_Error_Monitor.json`

**Filter by tag:** After import, click **"Tags"** in sidebar → Filter by `trigger:webhook`, `trigger:scheduled`, or `trigger:event`

---

## Step 1.4: Set Up Client Credentials

Navigate: **Settings** (gear icon) → **Credentials** → **Add Credential**

| Credential | Where to Get | Fields to Fill |
|------------|--------------|----------------|
| **OpenAI** | `https://platform.openai.com/api-keys` | API Key |
| **Telegram Bot** | Chat with `@BotFather` on Telegram → `/newbot` | Bot Token |
| **Twilio** | `https://console.twilio.com` | Account SID, Auth Token |
| **Stripe** | `https://dashboard.stripe.com/apikeys` | Secret Key |
| **PostgreSQL** | Render dashboard → Database | Host, Port, User, Password, Database |

---

## Step 1.5: Add First Property

| Step | Action | Details |
|------|--------|---------|
| 1 | Open database console | Render dashboard → Database → Shell |
| 2 | Run INSERT | See SQL below |

```sql
INSERT INTO property_configurations (
    property_id, 
    property_name, 
    owner_telegram_id, 
    owner_whatsapp,
    min_price_per_night,
    max_discount_percent,
    check_in_time,
    check_out_time,
    emergency_contact,
    timezone,
    last_calendar_sync
) VALUES (
    'PROP001',
    'Beach House Miami',
    '123456789',          -- Replace with owner's Telegram chat ID
    '+1234567890',        -- Replace with owner's WhatsApp number
    150.00,
    15,
    '15:00',
    '11:00',
    '+1234567890',
    'America/New_York',
    NOW()
);
```

---

# PHASE 2: ACTIVATE WORKFLOWS

## Step 2.1: Connect Credentials to Nodes

For each workflow:

| Step | Action | Visual Indicator |
|------|--------|------------------|
| 1 | Open workflow | Click workflow name |
| 2 | Find warning nodes | Look for ⚠️ triangle icons |
| 3 | Click node | Open node settings |
| 4 | Select credential | Choose from dropdown |
| 5 | Save | Click **"Save"** button |

---

## Step 2.2: Activation Order (Follow This Sequence)

| Order | Workflow # | Name | Tag | Why This Order |
|-------|------------|------|-----|----------------|
| 1 | 24 | Watchdog Error Monitor | `trigger:scheduled` | Monitors all others |
| 2 | 0 | Message Router | `trigger:webhook` | Entry point for messages |
| 3 | 9 | Scheduled Message Sender | `trigger:scheduled` | Sends queued messages |
| 4 | 11 | Daily Calendar Sync | `trigger:scheduled` | Syncs availability |
| 5 | 1 | Control Panel Hub | `trigger:event` | Owner commands |
| 6 | 5 | Inquiry Handler | `trigger:webhook` | New guest inquiries |
| 7 | 6 | AI Sales Bot | `trigger:webhook` | Negotiation |
| 8 | 7 | Payment Handler | `trigger:webhook` | Stripe payments |
| 9 | 8 | Guest Journey | `trigger:webhook` | Post-booking messages |
| 10-25 | Rest | All remaining | Various | Support functions |

**To Activate:** Open workflow → Toggle switch (top right) to **"Active"** (green)

---

# PHASE 3: FUNCTIONAL TESTING

## Test 1: Message Routing (Workflow 0)

**Goal:** Verify messages from different channels are routed correctly

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Telegram | On your phone |
| 2 | Find your bot | Search for bot username you created |
| 3 | Send message | Type: "Is property available Jan 10-15?" |
| 4 | Wait 5-10 seconds | Bot should respond |
| 5 | Check n8n | Go to **Executions** tab |
| 6 | Verify | See Workflow 0 executed successfully (green) |

**Where to check executions:** `https://your-app.onrender.com/executions`

**Database verification:**
```sql
SELECT * FROM message_router_log ORDER BY created_at DESC LIMIT 5;
```

---

## Test 2: AI Sales Inquiry (Workflows 5-6)

**Goal:** Verify AI can handle inquiry and negotiation

| Step | What to Send | Expected Response |
|------|--------------|-------------------|
| 1 | "Is property available Jan 10-15?" | Availability + pricing info |
| 2 | "Can you do $100/night?" | Counter-offer or acceptance |
| 3 | "Any discounts available?" | Discount offer (if applicable) |
| 4 | "How about a weekly discount too?" | Should REJECT (no stacking) |
| 5 | "Ok, I'll book it" | Payment link |

**Check n8n executions after each message:**
- Workflow 5 (Inquiry Handler) should execute
- Workflow 6 (AI Sales) should execute

**Database verification:**
```sql
SELECT * FROM deals ORDER BY created_at DESC LIMIT 5;
```

---

## Test 3: Payment Processing (Workflow 7)

**Goal:** Verify Stripe payment flow works

| Step | Action | Where |
|------|--------|-------|
| 1 | Get payment link | From AI bot response |
| 2 | Open link | In browser |
| 3 | Fill payment | Use test card: `4242 4242 4242 4242` |
| 4 | Expiry | Any future date (e.g., 12/28) |
| 5 | CVC | Any 3 digits (e.g., 123) |
| 6 | Complete | Click "Pay" |
| 7 | Verify booking | Check database |

**Database verification:**
```sql
SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;
SELECT * FROM bookings ORDER BY created_at DESC LIMIT 5;
```

**Expected:**
- Payment status = `completed`
- Booking status = `confirmed`
- Owner receives Telegram notification

---

## Test 4: Owner Commands (Workflow 1)

**Goal:** Verify owner can control system via Telegram

| Command to Send | Expected Response |
|-----------------|-------------------|
| `/dashboard` | System overview stats |
| `/bookings` | List of upcoming bookings |
| `/tasks` | Pending maintenance/cleaning tasks |
| `/deals` | Active negotiations |
| `/help` | List of available commands |

**Send these to:** The same Telegram bot, from owner's phone

---

## Test 5: Scheduled Messages (Workflow 9)

**Goal:** Verify automated guest messages work

| Step | Action | Where |
|------|--------|-------|
| 1 | Create test booking | Database INSERT (see below) |
| 2 | Add scheduled message | Database INSERT |
| 3 | Wait for workflow | Runs every 30 minutes |
| 4 | Verify delivery | Check guest's Telegram/WhatsApp |

**Create test booking:**
```sql
INSERT INTO bookings (
    booking_id, property_id, guest_name, guest_phone, guest_email,
    check_in_date, check_out_date, status, total_price
) VALUES (
    'TEST001', 'PROP001', 'Test Guest', '+1234567890', 'test@example.com',
    CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '3 days', 
    'confirmed', 450.00
);
```

**Create scheduled message:**
```sql
INSERT INTO scheduled_messages (
    message_id, booking_id, message_type, scheduled_time, 
    channel, recipient, message_content, sent
) VALUES (
    'MSG001', 'TEST001', 'pre_arrival', NOW() + INTERVAL '5 minutes',
    'telegram', '+1234567890', 
    'Welcome! Your check-in is tomorrow at 3 PM. Here are the access codes...', 
    false
);
```

---

## Test 6: Maintenance Request (Workflow 13)

**Goal:** Verify maintenance ticket creation and vendor assignment

| Step | What to Send | Expected Result |
|------|--------------|-----------------|
| 1 | "The AC is not working in bedroom" | Ticket created |
| 2 | Check database | `maintenance_tickets` has new row |
| 3 | Check vendor | Vendor assigned from `vendors` table |

**If no vendors available (testing fallback patch):**
- System should create task for owner
- Owner receives alert: "Manual intervention required"

**Database verification:**
```sql
SELECT * FROM maintenance_tickets ORDER BY created_at DESC LIMIT 5;
SELECT * FROM customer_tasks WHERE task_type = 'maintenance' ORDER BY created_at DESC LIMIT 5;
```

---

## Test 7: Cleaner Scheduling (Workflow 14)

**Goal:** Verify cleaning tasks are auto-created

| Step | Action | Expected |
|------|--------|----------|
| 1 | Add cleaner to database | INSERT into `cleaners` |
| 2 | Create booking ending today | INSERT into `bookings` |
| 3 | Wait for checkout time | Or manually trigger workflow |
| 4 | Check cleaning_tasks | New task should exist |

**Add cleaner:**
```sql
INSERT INTO cleaners (
    cleaner_id, name, phone, email, status, telegram_id
) VALUES (
    'CLEANER001', 'Maria Garcia', '+1234567891', 'maria@email.com', 'active', '987654321'
);
```

---

## Test 8: Error Monitoring (Workflow 24 - Watchdog)

**Goal:** Verify system monitors itself

| Step | Action | Expected |
|------|--------|----------|
| 1 | Insert test error | See SQL below |
| 2 | Wait 15 minutes | Watchdog runs |
| 3 | Check owner Telegram | Error alert received |
| 4 | Wait another 15 min | NO duplicate alert |

**Create test error:**
```sql
INSERT INTO workflow_errors (
    error_id, workflow_name, error_message, status, alert_sent, created_at
) VALUES (
    'ERR_TEST_001', 'Test Workflow', 'This is a test error for watchdog', 
    'unresolved', false, NOW()
);
```

**Verify alert_sent was updated:**
```sql
SELECT * FROM workflow_errors WHERE error_id = 'ERR_TEST_001';
-- alert_sent should now be TRUE
```

---

# PHASE 4: VERIFICATION CHECKLIST

## Quick Health Check SQL Queries

Run these in your database console to verify everything is working:

```sql
-- 1. Check recent message routing
SELECT channel_type, COUNT(*) as count 
FROM message_router_log 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY channel_type;

-- 2. Check active deals
SELECT status, COUNT(*) as count 
FROM deals 
GROUP BY status;

-- 3. Check upcoming bookings
SELECT * FROM bookings 
WHERE check_in_date > CURRENT_DATE 
ORDER BY check_in_date LIMIT 10;

-- 4. Check pending tasks
SELECT * FROM customer_tasks WHERE status = 'pending';

-- 5. Check unresolved errors
SELECT * FROM workflow_errors WHERE status = 'unresolved';

-- 6. Check scheduled messages not yet sent
SELECT * FROM scheduled_messages WHERE sent = false;
```

---

## Final Checklist

| Test | Status | Notes |
|------|--------|-------|
| ☐ Message routing works (Telegram) | | |
| ☐ Message routing works (WhatsApp) | | |
| ☐ AI responds to inquiries | | |
| ☐ AI rejects discount stacking | | |
| ☐ Payment link generated | | |
| ☐ Stripe payment processes | | |
| ☐ Booking created after payment | | |
| ☐ Owner notifications received | | |
| ☐ Owner commands work | | |
| ☐ Scheduled messages send | | |
| ☐ Maintenance tickets created | | |
| ☐ Vendor fallback works | | |
| ☐ Cleaning tasks auto-created | | |
| ☐ Watchdog catches errors | | |
| ☐ No duplicate alerts | | |
| ☐ All workflows show green in n8n | | |

---

## Troubleshooting Quick Reference

| Problem | Check | Solution |
|---------|-------|----------|
| Workflow not executing | Executions tab → Error details | Fix credential or node config |
| No Telegram response | Bot token correct? | Re-create credential |
| Database connection failed | Host/port/password | Check Render DB settings |
| Payment link not working | Stripe credentials | Use test mode keys first |
| Messages not routing | Workflow 0 active? | Activate + check webhook URLs |
| Watchdog not alerting | Owner Telegram ID set? | Update property_configurations |

---

## Key URLs Reference

| Purpose | URL |
|---------|-----|
| n8n Dashboard | `https://your-app.onrender.com` |
| n8n Executions | `https://your-app.onrender.com/executions` |
| n8n Credentials | `https://your-app.onrender.com/credentials` |
| Render Dashboard | `https://dashboard.render.com` |
| Render DB Shell | Render Dashboard → Your DB → Shell |
| Stripe Test | `https://dashboard.stripe.com/test` |
| Telegram BotFather | `https://t.me/BotFather` |
| Get Telegram Chat ID | `https://t.me/userinfobot` |

---

**End of Testing Handout**

*Last Updated: January 2026*

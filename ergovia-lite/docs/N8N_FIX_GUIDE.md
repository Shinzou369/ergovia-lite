# N8N Workflow Fix Guide

**Date:** February 9, 2026
**Instance:** https://n8n.ergovia-ai.com
**Status:** Workflows have errors that need fixing

---

## Summary of Issues Found

After analyzing the n8n instance via API, I found these critical issues:

| Issue | Impact | Priority |
|-------|--------|----------|
| Invalid OpenAI API Key | AI routing and responses fail | CRITICAL |
| Missing PostgreSQL tables | Database queries fail on every message | CRITICAL |
| 80+ duplicate workflows | Confusion, maintenance nightmare | HIGH |
| Missing credentials setup | Telegram, WhatsApp, Twilio not working | HIGH |

---

## Step-by-Step Fix Instructions

### STEP 1: Fix PostgreSQL Database Schema

The workflows expect specific tables that don't exist. Run this SQL script:

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL < provisioning-system/database/n8n_required_tables.sql
```

**Required Tables:**
- `conversations` - Stores guest conversation state
- `property_configurations` - Property details and owner preferences
- `activity_log` - Workflow activity logging
- `contacts` - Guest contact information
- `calendar_events` - Calendar blocking and sync
- `payment_transactions` - Payment tracking
- `maintenance_requests` - Property issues
- `automated_tasks` - Scheduled tasks
- `external_integrations` - Third-party connections
- `guest_screening` - Safety verification
- `n8n_chat_histories` - AI memory (required by Langchain)

---

### STEP 2: Fix OpenAI API Credentials

The current OpenAI API key is invalid (`sk-proj-***...JSMa`).

**In n8n UI:**
1. Go to **Settings** → **Credentials**
2. Find the credential named `OpenAI` or `openai-cred`
3. Update with a valid OpenAI API key
4. Test the connection

**Get a new key:**
- Go to https://platform.openai.com/api-keys
- Create a new API key
- Copy and paste into n8n

---

### STEP 3: Set Up Required Credentials

The workflows need these credentials configured:

| Credential Name | Type | Used By |
|----------------|------|---------|
| `PostgreSQL` or `postgres-cred` | PostgreSQL | WF1, WF2, WF3, WF4, WF5, WF6, WF7, WF8 |
| `OpenAI` or `openai-cred` | OpenAI API | WF1, WF2 (AI routing and responses) |
| `Telegram` or `telegram-cred` | Telegram Bot API | WF1 trigger, SUB Messenger |
| `WhatsApp` or `whatsapp-cred` | WhatsApp Business API | WF1 trigger, SUB Messenger |
| `Twilio` or `twilio-cred` | Twilio SMS | WF1 trigger, SUB Messenger |

**To create/update credentials in n8n:**
1. Go to **Settings** → **Credentials**
2. Click **Add Credential**
3. Select the credential type
4. Enter the required values
5. Save and test

---

### STEP 4: Clean Up Duplicate Workflows

There are 80+ workflows when there should only be 9. Here's the correct set:

**Keep ONLY these workflows (delete or archive the rest):**

| Workflow | ID (Current Active) | Purpose |
|----------|---------------------|---------|
| SUB: Universal Messenger | k5NvzzTi72RdMRSO | Send messages via any channel |
| WF1: AI Gateway | LP7YknAVPiQsidWq | Entry point, AI routing |
| WF2: AI Booking Agent | (pick one, activate) | Handle booking inquiries |
| WF3: Calendar Manager | (pick one, activate) | Calendar sync and availability |
| WF4: Payment Processor | (pick one, activate) | Payment handling |
| WF5: Property Operations | (pick one, activate) | Maintenance, owner actions |
| WF6: Daily Automations | (pick one, activate) | Scheduled tasks |
| WF7: Integration Hub | (pick one, activate) | External platform sync |
| WF8: Safety & Screening | (pick one, activate) | Guest verification |

**To clean up:**
1. Go to **Workflows** in n8n
2. Archive all duplicates (those prefixed with `[Client]`, `[AA]`, or duplicates)
3. Keep only 9 workflows total

**Via API (archive a workflow):**
```bash
curl -X DELETE "https://n8n.ergovia-ai.com/api/v1/workflows/{WORKFLOW_ID}" \
  -H "X-N8N-API-KEY: YOUR_API_KEY"
```

---

### STEP 5: Activate Required Workflows

After cleanup, activate all 9 workflows:

**Currently Active (keep active):**
- `LP7YknAVPiQsidWq` - WF1: AI Gateway
- `k5NvzzTi72RdMRSO` - SUB: Universal Messenger

**Need to Activate:**
```bash
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU"

# Activate WF2: AI Booking Agent (pick one ID)
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/NPInwpKv4Oriq04F/activate" \
  -H "X-N8N-API-KEY: $API_KEY"

# Activate WF3: Calendar Manager
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/4gaWc6JKk20aF1Qv/activate" \
  -H "X-N8N-API-KEY: $API_KEY"

# Activate WF4: Payment Processor
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/5loDH75zrEDh9x5H/activate" \
  -H "X-N8N-API-KEY: $API_KEY"

# Activate WF5: Property Operations
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/DNrXHmzPFTSyJvOZ/activate" \
  -H "X-N8N-API-KEY: $API_KEY"

# Activate WF6: Daily Automations
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/2uqgTQ6yGCKpDj3p/activate" \
  -H "X-N8N-API-KEY: $API_KEY"

# Activate WF7: Integration Hub
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/Ay5QOyGAHG2l40s7/activate" \
  -H "X-N8N-API-KEY: $API_KEY"

# Activate WF8: Safety & Screening
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/CPLRJS4D4ngDFHwt/activate" \
  -H "X-N8N-API-KEY: $API_KEY"
```

---

### STEP 6: Update Workflow Credentials

Each workflow needs its credential references updated to match your actual credential IDs.

**For each workflow:**
1. Open the workflow in n8n editor
2. Click on each PostgreSQL node
3. Select your PostgreSQL credential
4. Click on each OpenAI node
5. Select your OpenAI credential
6. Save the workflow

---

### STEP 7: Test the System

After all fixes:

1. **Test Database Connection:**
```bash
# In n8n, run a simple query test
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/LP7YknAVPiQsidWq/test" \
  -H "X-N8N-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

2. **Send a Test Telegram Message:**
   - Find your bot in Telegram
   - Send "Hello"
   - Check n8n executions for success

3. **Verify Logs:**
   - Go to **Executions** in n8n
   - Check for green checkmarks (success)
   - No more red X (errors)

---

## Error Reference

### Error: "Failed query: SELECT ... FROM conversations"
**Cause:** `conversations` table doesn't exist
**Fix:** Run the SQL schema script (Step 1)

### Error: "Incorrect API key provided: sk-proj-***"
**Cause:** Invalid OpenAI API key
**Fix:** Update OpenAI credential (Step 2)

### Error: "Cannot connect to PostgreSQL"
**Cause:** Database credential not set or wrong
**Fix:** Configure PostgreSQL credential (Step 3)

### Error: "Telegram API request failed"
**Cause:** Bot token not configured
**Fix:** Configure Telegram credential (Step 3)

---

## Architecture Overview

```
                    ┌─────────────────────┐
                    │  Telegram/WhatsApp  │
                    │       /SMS          │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  WF1: AI Gateway    │ ◄── Entry Point
                    │  (AI Classification)│
                    └─────────┬───────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │ WF2: Booking  │ │ WF4: Payment  │ │ WF5: Property │
    │    Agent      │ │  Processor    │ │  Operations   │
    └───────────────┘ └───────────────┘ └───────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ SUB: Universal      │
                    │     Messenger       │ ◄── Sends responses
                    └─────────────────────┘
```

---

## Verification Checklist

- [ ] PostgreSQL tables created (run SQL script)
- [ ] OpenAI API key updated and working
- [ ] PostgreSQL credential configured
- [ ] Telegram Bot token configured
- [ ] WhatsApp Business API configured (optional)
- [ ] Twilio credentials configured (optional)
- [ ] Duplicate workflows archived
- [ ] All 9 workflows activated
- [ ] Test message sent successfully
- [ ] No errors in execution log

---

## Quick Commands Reference

```bash
# Set API key
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU"

# List all workflows
curl -s "https://n8n.ergovia-ai.com/api/v1/workflows" -H "X-N8N-API-KEY: $API_KEY" | jq '.data[] | {id, name, active}'

# Check recent errors
curl -s "https://n8n.ergovia-ai.com/api/v1/executions?status=error&limit=10" -H "X-N8N-API-KEY: $API_KEY" | jq '.data'

# Activate a workflow
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}/activate" -H "X-N8N-API-KEY: $API_KEY"

# Deactivate a workflow
curl -X POST "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}/deactivate" -H "X-N8N-API-KEY: $API_KEY"

# Delete a workflow (archive)
curl -X DELETE "https://n8n.ergovia-ai.com/api/v1/workflows/{ID}" -H "X-N8N-API-KEY: $API_KEY"
```

---

**After completing all steps, the n8n workflows should be 100% functional.**

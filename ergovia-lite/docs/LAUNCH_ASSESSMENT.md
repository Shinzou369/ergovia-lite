# Ergovia Lite — Launch Assessment & Smoke Test
*Run this checklist before going live with a client. Last updated: 2026-03-07*

---

## HOW TO RUN THIS

### Quick automated check (run first)
```bash
cd ergovia-lite
node scripts/smoke-test.js
```

### Manual checks (step through each section below)

---

## SECTION 1 — Infrastructure

| # | Check | Command | Pass Criteria |
|---|-------|---------|---------------|
| 1.1 | Control panel is running | `curl http://localhost:3000/api/status` | `{"status":"ok"}` |
| 1.2 | n8n is reachable | `curl https://n8n.ergovia-ai.com/healthz` | `{"status":"ok"}` |
| 1.3 | PostgreSQL connection | `curl http://localhost:3000/api/test-n8n` | No DB error in response |
| 1.4 | PM2 process alive | `pm2 status` | ergovia-lite is `online` |
| 1.5 | n8n Docker running | `docker ps` (on server) | n8n + ergovia-db containers `Up` |

---

## SECTION 2 — n8n Workflows

| # | Check | Command | Pass Criteria |
|---|-------|---------|---------------|
| 2.1 | All [LIVE] workflows exist | `node scripts/list-all-workflows.js` | 11 [LIVE] workflows listed |
| 2.2 | WF1 is active | n8n UI → Workflows | [LIVE] WF1: AI Gateway = green |
| 2.3 | WF3 is active (scheduled) | n8n UI | [LIVE] WF3: Calendar Manager = green |
| 2.4 | WF6 is active (scheduled) | n8n UI | [LIVE] WF6: Daily Automations = green |
| 2.5 | WF8 is active (15-min watchdog) | n8n UI | [LIVE] WF8: Safety & Screening = green |
| 2.6 | Credentials wired correctly | `node scripts/audit-and-fix-live.js` | 0 credential errors |

---

## SECTION 3 — Telegram Bot

| # | Check | How | Pass Criteria |
|---|-------|-----|---------------|
| 3.1 | Bot is online | Message the bot on Telegram | No "bot offline" Telegram error |
| 3.2 | Text message handled | Send "Hello" to the bot | AI replies within 10 seconds |
| 3.3 | Voice message handled | Send a voice note to the bot | Bot replies (transcription or error msg) |
| 3.4 | Booking inquiry | Say "I want to book from March 15 to March 17" | AI asks for details / shows availability |
| 3.5 | Budget check active | Check `api_usage_budget` table | `budget_used` is updating after each chat |

---

## SECTION 4 — Dashboard & API

| # | Check | URL | Pass Criteria |
|---|-------|-----|---------------|
| 4.1 | Dashboard loads | http://localhost:3000/v2/ | Page loads, no blank screen |
| 4.2 | Real bookings showing | Dashboard → Bookings | Shows data from PostgreSQL (not "0 bookings" if any exist) |
| 4.3 | Properties list | Dashboard → Properties | Shows property records |
| 4.4 | Active conversations | Dashboard stats | Shows real count (from n8n_chat_histories) |
| 4.5 | Settings save | Dashboard → Settings → Save | 200 response, values persist on refresh |
| 4.6 | Conversations page | http://localhost:3000/v2/conversations.html | Lists conversation sessions |
| 4.7 | Calendar page | http://localhost:3000/v2/calendar.html | Loads bookings on calendar |

**API smoke tests (copy-paste into terminal):**
```bash
BASE=http://localhost:3000

# Health
curl $BASE/api/status

# Dashboard data
curl $BASE/api/v2/dashboard | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('Properties:', j.stats?.totalProperties, '| Bookings:', j.stats?.totalBookings, '| Conversations:', j.stats?.activeConversations)"

# Properties
curl $BASE/api/v2/properties | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('Property count:', Array.isArray(j)?j.length:j.length)"

# Bookings
curl "$BASE/api/v2/bookings" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('Bookings count:', Array.isArray(j)?j.length:'?')"

# Conversations
curl $BASE/api/v2/conversations | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('Conversations:', Array.isArray(j)?j.length:'?')"
```

---

## SECTION 5 — PostgreSQL Database

| # | Check | Query | Pass Criteria |
|---|-------|-------|---------------|
| 5.1 | owners table has owner | `SELECT * FROM owners LIMIT 1` | At least 1 row |
| 5.2 | property_configurations exist | `SELECT COUNT(*) FROM property_configurations` | ≥ 1 |
| 5.3 | Chat memory table exists | `SELECT COUNT(*) FROM n8n_chat_histories` | Returns (even if 0) |
| 5.4 | Budget table seeded | `SELECT * FROM api_usage_budget LIMIT 5` | Has rows with customer_id |
| 5.5 | No failed schema objects | `SELECT * FROM information_schema.tables WHERE table_schema='public'` | ≥ 20 tables |

**Connect to DB (from server):**
```bash
docker exec -it ergovia-db psql -U ergovia_user -d ergovia_db
```

---

## SECTION 6 — Settings & Configuration

| # | Check | How | Pass Criteria |
|---|-------|-----|---------------|
| 6.1 | Telegram bot token set | Settings → Integrations | Token field not empty |
| 6.2 | OpenAI API key set | Settings → AI Configuration | API key field not empty, credits > $0 |
| 6.3 | Property configured | Settings → Properties | At least 1 property with pricing |
| 6.4 | Owner Telegram chat ID set | Check `owners` table | `owner_chat_id` = owner's Telegram ID |
| 6.5 | No GCash in payment dropdown | Settings → Booking → Payment Method | GCash is NOT listed |

---

## SECTION 7 — End-to-End Booking Flow

Test this full guest journey manually:

1. **Send "Hi" to the Telegram bot** → should get a welcome message
2. **Express interest in booking** ("I want to book your place") → AI asks for dates
3. **Give dates** ("March 20 to March 22") → AI checks calendar, responds with availability
4. **Request a quote** → AI calculates and replies with price
5. **Confirm interest** ("Yes I want to book") → AI initiates booking flow
6. **Check in n8n** → Executions tab should show WF1 → WF4 handoff
7. **Check DB** → `deals` table should have a new row

---

## SECTION 8 — Scheduled Workflows (Verify Timing)

| Workflow | Schedule | Test |
|----------|----------|------|
| WF3: Calendar Manager | 6 AM daily | Trigger manually in n8n, check `calendar_sync_log` table |
| WF6: Daily Automations | 9AM/6PM/30min follow-ups | Trigger manually, check `scheduled_messages` table |
| WF7: Integration Hub | 8 AM daily | Trigger manually, check for errors |
| WF8: Safety Screening | Every 15 minutes | Should auto-run; check `incidents` table for any alerts |

---

## SECTION 9 — Known Issues & Status

| Item | Status | Notes |
|------|--------|-------|
| Voice transcription (Whisper) | ⚠️ Partial | Nodes added to WF1. Requires `TELEGRAM_BOT_TOKEN` env var in n8n docker-compose.yml |
| OpenAI quota | ⚠️ Check | Add credits at platform.openai.com if AI doesn't respond |
| WF6 budget node | ⚠️ Manual fix | "Check Budget (Morning)" SQL uses empty UUID — fix directly in n8n UI |
| Payment processing | ⚠️ Manual only | WF4 uses Telegram button confirmation (no card gateway yet) |
| V4/V6 workflows | ℹ️ Archive | Still visible in n8n UI — archive manually (not via API) |
| Twilio SMS | ⚠️ Placeholder | SMS trigger exists but needs real Twilio credentials |
| WhatsApp | ⚠️ Placeholder | Trigger exists but needs real WhatsApp Business credentials |

---

## SECTION 10 — Final Go/No-Go

### GO if:
- [ ] All Section 1 infrastructure checks pass
- [ ] All 11 [LIVE] workflows are active (green) in n8n
- [ ] Text message to Telegram bot gets an AI reply
- [ ] Dashboard shows real data from PostgreSQL
- [ ] At least 1 property is configured with pricing

### NO-GO if:
- [ ] WF1 is inactive
- [ ] AI gives no response (check OpenAI credits)
- [ ] PostgreSQL connection fails
- [ ] Dashboard shows errors or blank data

---

## Quick Fix Commands

```bash
# Fix all credential issues
node scripts/audit-and-fix-live.js

# Check which workflows are active
node scripts/list-all-workflows.js

# Restart control panel
pm2 restart ergovia-lite

# Restart n8n (on server via SSH)
docker compose -f /opt/n8n/docker-compose.yml restart n8n

# Clear a chat session (reset AI memory for a guest)
# In PostgreSQL:
# DELETE FROM n8n_chat_histories WHERE session_id = '<telegram_sender_id>';
```

---

*See also: `docs/HOW_ERGOVIA_IS_BUILT.md` for full system architecture.*

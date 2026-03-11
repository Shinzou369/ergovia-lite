# ERGOVIA LITE — SYSTEM ASSESSMENT
*Run this any time you want a full health check and progress snapshot.*

---

## RUN THE AUTOMATED CHECK

```bash
cd ergovia-lite
node scripts/run-assessment.js
```

That's it. The script tests everything and gives you a score + verdict at the end.

---

## WHAT IT CHECKS

| Section | What It Tests |
|---------|--------------|
| **1. n8n Connectivity** | n8n is online, API key works |
| **2. Workflow Status** | All 11 [LIVE] workflows exist and are active |
| **3. Credentials** | Every workflow has the correct 3 approved credentials |
| **4. Voice / Whisper** | WF1 has voice detection + Whisper transcription nodes |
| **5. SUB Messenger** | Markdown sanitize node present (Partner spec requirement) |
| **6. Database** | PostgreSQL connected, 56 tables, owners/properties/bookings seeded |
| **7. Local Files** | All key server files exist, no hardcoded mock data |
| **8. Partner Spec** | Cross-checks against PARTNER_BEHAVIOR_DEFINITION.md |

---

## UNDERSTANDING THE OUTPUT

```
✅ = PASS    ❌ = FAIL    ⚠️  = WARNING    ℹ️  = INFO (no action needed)
```

**VERDICT:**
- 🟢 GO — Fix nothing, go live
- 🟡 CONDITIONAL GO — Warnings exist, address before client handoff
- 🔴 NO-GO — Failures must be fixed first

---

## LAST ASSESSMENT RESULTS
*Ran: 2026-03-09 02:37 UTC*

```
PASS: 61/65   FAIL: 0   WARN: 4
READINESS SCORE: 94%
VERDICT: 🟡 CONDITIONAL GO — Address warnings
```

**Warnings to resolve (2 real, 2 cosmetic):**
- [ ] Set `TELEGRAM_BOT_TOKEN` env var in n8n docker-compose.yml — needed for voice file download
- [ ] Archive 11 [V4] workflows in n8n UI (cosmetic clutter only)
- [ ] Archive 11 [V6] workflows in n8n UI (cosmetic clutter only)

**Everything passing — 61/65 green:**
- ✅ All 11 [LIVE] workflows active (WF1–WF8 + 2 SUBs + Payment Webhook)
- ✅ All credentials correct across every workflow
- ✅ Voice/Whisper nodes in WF1 — Get Telegram File uses stored credential, Transcribe Audio uses openAiApi correctly
- ✅ Sanitize Message node in SUB (partner spec)
- ✅ PostgreSQL: 56 tables, 11 properties, 28 bookings, 262 chat messages
- ✅ Dashboard pulls real data (activeConversations queries n8n_chat_histories)
- ✅ GCash removed from payment settings
- ✅ Conversations page contrast + theme toggle fixed
- ✅ Payment confirmation system: dual-channel (Telegram text commands + Control Panel)
- ✅ WF4: conversational owner notification, payment_tasks row created per booking
- ✅ WF1: intercepts payment text commands before AI, routes direct to WF4
- ✅ Dashboard: Pending Payments section with Accept/Decline + double-tap popup

---

## MANUAL TESTS (do after automated check passes)

### Telegram Bot — Basic Flow
1. Send **"Hi"** to the bot → should get a welcome reply in 3–8 seconds
2. Send **"I want to book from March 20 to March 22"** → AI asks for name or checks availability
3. Send a **voice note** → AI should transcribe and reply (needs TELEGRAM_BOT_TOKEN env var)

### Dashboard
1. Open `http://localhost:3000/v2/` (or server URL)
2. Check stats card shows real numbers (not all zeros)
3. Open Settings → verify no GCash in payment dropdown
4. Open Conversations → should list any past sessions

### n8n Executions
1. Open `https://n8n.ergovia-ai.com`
2. Go to Executions tab
3. Send a test message to the bot
4. Verify execution appears with ✅ (not ❌)

---

## ONE-LINER FIXES

```bash
# Re-run credential audit and fix any issues
node scripts/audit-and-fix-live.js

# Add Whisper env var on server (run via SSH)
# Edit /opt/n8n/docker-compose.yml, add under n8n environment:
#   - TELEGRAM_BOT_TOKEN=<your_token>
# Then:
#   docker compose -f /opt/n8n/docker-compose.yml restart n8n

# Check which workflows are active/inactive
node scripts/list-wf1-nodes.js   # WF1 node map
```

---

## KNOWN PENDING ITEMS

| Item | Status | Fix |
|------|--------|-----|
| TELEGRAM_BOT_TOKEN for Whisper | ⚠️ One step | SSH → add `- TELEGRAM_BOT_TOKEN=<token>` to `/opt/n8n/docker-compose.yml` → restart n8n |
| V4/V6 workflow clutter | ⚠️ Cosmetic | Archive manually in n8n UI (no functional impact) |
| WF6 budget UUID | ✅ Fixed | Already uses `{{ $json.customer_id }}` from previous postgres query — correct |
| OpenAI credits | ✅ Balance added | Confirmed by user — AI should now respond |
| Conversations page contrast | ✅ Fixed | Channel badge, msg avatars, muted-text all theme-aware now |
| Dashboard mock data | ✅ Fixed | activeConversations queries real n8n_chat_histories |
| GCash payment option | ✅ Removed | Not in settings dropdown |
| Lemon Squeezy payments | ℹ️ Not in scope | Telegram manual confirmation — partner decision |

---

## SYSTEM AT A GLANCE

```
Ergovia Lite v2  —  AirBNB AI Automation Platform
─────────────────────────────────────────────────
Server:      Hetzner 116.203.115.12 (ARM64)
n8n:         https://n8n.ergovia-ai.com
Database:    PostgreSQL ergovia_db (56 tables)
Control:     PM2 → ergovia-lite (port 3000)
Workflows:   11 [LIVE]  |  11 [V6] archived  |  11 [V4] archived
─────────────────────────────────────────────────
Channels:    Telegram ✅  |  WhatsApp 🔧  |  SMS 🔧
AI:          OpenAI GPT-4 + Whisper
Payments:    Telegram confirmation (Lemon Squeezy: not active)
Affiliates:  M1 system ready (1 affiliate seeded)
─────────────────────────────────────────────────
```

---

*To update this file after a new assessment run: paste the summary block from the script output into "Last Assessment Results" above.*

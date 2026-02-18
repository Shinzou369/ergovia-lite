# 25 → 9 Workflow Objective Coverage Map

> Last updated: 2026-02-12
> Status: **88% fully covered** (22/25), 3 deferred to Phase 2

---

## Architecture Summary

**Original**: 25 workflows (WF0-WF24), ~800+ nodes
**Current**: 9 workflows (SUB + WF1-WF8), ~187 nodes, 77% reduction

The 9-workflow architecture uses a hub-and-spoke model:
- **WF1 AI Gateway** = LangChain Agent (replaces WF0 router + WF1 commands + WF5 inquiries + WF6 conversations)
- **WF2-WF5, WF8** = Tools called by WF1's AI Agent
- **WF6** = Cron-triggered daily automations (independent)
- **WF7** = Integration Hub for external services
- **SUB** = Universal Messenger (cross-cutting, sends messages for all WFs)

---

## Coverage Status

### FULLY COVERED (22/25)

| # | Original WF | Objective | Covered By | How |
|---|---|---|---|---|
| 0 | Message Router | Route incoming messages by sender type | **WF1** AI Gateway | AI Agent replaces keyword router — routes via context |
| 1 | Control Panel Hub | Owner commands (/status, /bookings) | **WF1** AI Gateway | Owner sends messages to same bot; AI queries DB and responds |
| 2 | Conflict Priority Manager | Detect & resolve competing bookings | **WF2** Offer Conflict Manager | Code-based detection, owner notification, accept/decline callbacks |
| 3 | Availability Checker | Real-time date availability | **WF3** Calendar Manager | Tool for WF1 — queries bookings table for overlap |
| 4 | Task Queue Manager | Owner tasks, approvals, reminders | **WF6** Daily Automations | Morning digest includes pending tasks count + stale conversation alerts |
| 5 | Inquiry Handler | First response to new guests | **WF1** AI Gateway | AI Agent IS the inquiry handler — engages, gathers info |
| 6 | AI Conversation Manager | Ongoing negotiations, deal closing | **WF1** AI Gateway | LangChain memory maintains full conversation context |
| 7 | Payment Confirmation | Payment links, Stripe, booking creation | **WF4** Payment Processor | Handles payment_link generation, confirmation, booking record |
| 8 | Guest Journey Scheduler | Automated guest timeline messages | **WF6** Daily Automations | Cron triggers send pre-arrival, checkout, review request msgs |
| 9 | Scheduled Message Sender | Deliver messages at scheduled times | **WF6** + **SUB** | WF6 cron fires → queries scheduled messages → SUB delivers |
| 10 | Cleaning Completion | Cleaner reports, issue detection | **WF5** Property Ops | Complete Cleaning Task node updates status + notifies owner |
| 11 | Daily Morning Check | 9AM daily health check & digest | **WF6** Daily Automations | Morning cron with tasks, tickets, stale leads, scheduled msgs |
| 12 | Nightly Automation | 2AM maintenance, archival, stats | **WF6** Daily Automations | 2AM trigger → archival + stats → health report to owner |
| 13 | Calendar Sync | iCal import, cross-platform sync | **WF7** Integration Hub | 3AM iCal sync with conflict detection (was WF3, moved to WF7) |
| 14 | Cleaning Scheduler | Auto-assign cleaners, urgency calc | **WF5** Property Ops | Schedule Cleaning creates tasks on checkout with vendor assignment |
| 16 | Review Monitoring | Sentiment analysis, auto-response | **WF7** Integration Hub | 8AM review analysis, keyword sentiment, draft response, owner alert |
| 17 | Guest Screening | Background checks, trust scoring | **WF8** Safety & Screening | AI Screening Agent calculates risk scores, flags high-risk |
| 18 | Webhook Trigger | Generic webhook receiver | **WF7** Integration Hub | Webhook trigger node for external integrations |
| 19 | Emergency Response | Urgent situation handling, escalation | **WF8** Safety & Screening | AI Emergency Handler classifies severity, escalates |
| 20 | Owner Dashboard | Dashboard data & analytics | **Backend** (server.js) | Express API endpoints serve dashboard data to V2 UI |
| 22 | Integration Hub | Third-party service connections | **WF7** Integration Hub | Smart locks, pricing tools, channel managers, iCal sync |
| 24 | Follow-up Alerts | Stale conversation detection | **WF6** Daily Automations | Morning digest flags stale conversations (>4h no reply) |

### NOT COVERED - DEFERRED (3/25)

| # | Original WF | Objective | Reason Deferred |
|---|---|---|---|
| 15 | Inventory Predictor | Track consumables, predict restocking | Niche feature — Phase 2 roadmap |
| 21 | Backup & Recovery | Automated DB backups, cloud upload | Infrastructure-level (cron + pg_dump), not workflow |
| 23 | Advanced Automation | Custom IFTTT rules engine | Power-user feature — Phase 2 roadmap |

---

## Absorption Map (Which Current WF Absorbs What)

| Current WF | Absorbs From Original | Node Count |
|---|---|---|
| **WF1** AI Gateway | WF0 + WF1 + WF5 + WF6 | ~26 |
| **WF2** Offer Conflict Manager | WF2 | ~33 |
| **WF3** Calendar Manager | WF3 + WF13 | 17 |
| **WF4** Payment Processor | WF7 | ~18 |
| **WF5** Property Operations | WF4(partial) + WF10 + WF14 | 15 |
| **WF6** Daily Automations | WF8 + WF9 + WF11 + WF12 + WF24 + WF4(partial) | 31 |
| **WF7** Integration Hub | WF13 + WF16 + WF18 + WF22 | 19 |
| **WF8** Safety & Screening | WF17 + WF19 | 15 |
| **SUB** Universal Messenger | Cross-cutting messaging | ~13 |

---

## Change Log

| Date | Change | Coverage Impact |
|---|---|---|
| 2026-02-10 | Initial 9-WF deployment | 64% full, 24% partial |
| 2026-02-11 | WF2 restructured as Offer Conflict Manager | WF2 coverage solidified |
| 2026-02-11 | WF3 queries fixed, WF1 tools updated | WF3/WF13 coverage solidified |
| 2026-02-12 | Coverage map created, gap-closing started | In progress |
| 2026-02-12 | WF6: Added nightly 2AM maintenance + expanded morning digest (tasks, stale leads) | WF4+WF12+WF24 closed |
| 2026-02-12 | WF5: Added cleaning completion + task digest branches | WF10+WF14 closed |
| 2026-02-12 | WF7: Added review analysis (8AM trigger, sentiment, owner alerts) + fixed 3 stale creds | WF16 closed |
| 2026-02-12 | Fixed stale credentials across WF4, WF5, WF6, WF7, WF8 (16 total) | All 9 WFs clean |
| 2026-02-12 | **Coverage: 88% fully covered (22/25), 3 deferred** | Up from 64% |
| 2026-02-12 | WF3: Added availability check fast path (IF split + direct query + format response) | WF3 now works as tool for WF1 |

---

## Credential Audit (All Clean)

All 9 workflows now use canonical credential IDs:

| Service | Canonical ID | Name |
|---|---|---|
| PostgreSQL | `BWlLUMKn64aZsHi8` | [Client] PostgreSQL |
| OpenAI | `slpbr7aUaU6fqTfw` | [Client] OpenAI |
| Telegram | `6ltptOrFLUaZzC1C` | [Client] Telegram Bot |
| Twilio | `twilio-cred` | Placeholder (not configured) |

Stale credentials removed: `sjaI08GtPbON8TLX`, `sCKJDGWd6f8LxAw1`, `m5CO4ySXIhlnUNcp`

---

## Node Counts (Final)

| Workflow | ID | Nodes | Status |
|---|---|---|---|
| SUB: Universal Messenger | `UZMWfhnV6JmuwJXC` | 13 | Active |
| WF1: AI Gateway | `LP7YknAVPiQsidWq` | 26 | Active |
| WF2: Offer Conflict Manager | `NPInwpKv4Oriq04F` | 33 | Active |
| WF3: Calendar Manager | `pEn69kwNtCEQ21y9` | 17 | Active |
| WF4: Payment Processor | `5loDH75zrEDh9x5H` | 18 | Active |
| WF5: Property Operations | `JWEu9Uz2JJ5XZeIX` | 15 | Active |
| WF6: Daily Automations | `ccEOaNnIwY6eeJOn` | 31 | Active |
| WF7: Integration Hub | `Ay5QOyGAHG2l40s7` | 19 | Active |
| WF8: Safety & Screening | `mLm2HaIRzNfIX5uh` | 15 | Active |
| **Total** | | **187** | **All Active** |

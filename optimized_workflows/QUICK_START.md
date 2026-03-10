# Quick Start Guide - Optimized Workflows

## What Changed?

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total Workflows | 25 | 9 | -64% |
| Total Nodes | ~800+ | ~122 | -85% |
| Channel Routing Nodes | ~75 | 9 | -88% |
| AI Integration | Manual HTTP | Native Agent | Smarter |

## Workflow Files Created

```
optimized_workflows/
├── ARCHITECTURE.md              # Full technical documentation
├── QUICK_START.md               # This file
├── SUB_Universal_Messenger.json # Reusable messaging (9 nodes)
├── WF1_AI_Gateway.json          # Entry point (16 nodes)
├── WF2_AI_Booking_Agent.json    # AI booking (15 nodes)
├── WF3_Calendar_Manager.json    # Availability (16 nodes)
├── WF4_Payment_Processor.json   # Stripe integration (15 nodes)
├── WF5_Property_Operations.json # Maintenance/cleaning (14 nodes)
├── WF6_Daily_Automations.json   # Scheduled reports (16 nodes)
├── WF7_Integration_Hub.json     # iCal/channel sync (14 nodes)
└── WF8_Safety_Screening.json    # Emergency/screening (17 nodes)
```

## Key Optimizations

### 1. AI Agent with Tools (Replaces 50+ nodes)
Instead of:
- HTTP Request to OpenAI
- Manual prompt building
- Response parsing
- Multiple routing switches

Now:
- Single AI Agent node
- Tools for database, availability, booking
- Built-in memory management

### 2. Universal Messenger (Replaces 75+ nodes)
Instead of:
- Switch node for platform
- Telegram node
- WhatsApp node
- SMS node
- Error handling for each

Now:
- ONE sub-workflow called via Execute Workflow
- Handles all channels dynamically
- Single error handling

### 3. Consolidated Workflows
| Old Workflows | New Workflow |
|---------------|--------------|
| WF0, WF1 | WF1: AI Gateway |
| WF5, WF6, WF24 | WF2: AI Booking Agent |
| WF2, WF3 | WF3: Calendar Manager |
| WF7, WF8, WF9 | WF4: Payment Processor |
| WF10, WF14, WF15 | WF5: Property Operations |
| WF11, WF12, WF21 | WF6: Daily Automations |
| WF13, WF16, WF22 | WF7: Integration Hub |
| WF4, WF17, WF19, WF23 | WF8: Safety & Screening |

## How to Deploy

### Step 1: Prerequisites
```bash
# Required n8n version: 1.20.0+
# Required credentials:
- OpenAI API key
- PostgreSQL connection
- Telegram Bot token
- WhatsApp Business API
- Twilio (optional, for SMS)
- Stripe (for payments)
```

### Step 2: Import Order
1. `SUB_Universal_Messenger.json` (required by all others)
2. `WF3_Calendar_Manager.json` (called by WF2)
3. `WF4_Payment_Processor.json` (called by WF2)
4. `WF5_Property_Operations.json` (called by WF1, WF2)
5. `WF8_Safety_Screening.json` (called by WF1)
6. `WF2_AI_Booking_Agent.json` (main conversation handler)
7. `WF1_AI_Gateway.json` (entry point)
8. `WF6_Daily_Automations.json` (scheduled)
9. `WF7_Integration_Hub.json` (sync)

### Step 3: Configure Credentials
In n8n, create credentials with these exact names:
- `postgres-cred` - PostgreSQL
- `openai-cred` - OpenAI API
- `telegram-cred` - Telegram Bot
- `whatsapp-cred` - WhatsApp Business
- `twilio-cred` - Twilio
- `stripe-cred` - Stripe

### Step 4: Update Webhook URLs
After import, update external services to use new webhook URLs:
- Telegram: Use WF1 webhook URL
- WhatsApp: Use WF1 webhook URL
- Stripe: Use WF4 webhook URL

## Testing Checklist

- [ ] Send test Telegram message → Should route to AI Booking Agent
- [ ] Ask about availability → Should check calendar and respond
- [ ] Complete booking flow → Should create Stripe session
- [ ] Report maintenance issue → Should create ticket
- [ ] Trigger scheduled automation → Should send reports

## Rollback Plan

If issues occur:
1. Disable new workflows
2. Re-enable original workflows
3. Revert webhook URLs

Keep original workflows for 1 week before deletion.

## Performance Expectations

| Operation | Before | After |
|-----------|--------|-------|
| Message routing | 3-5s | <1s |
| Booking inquiry | 5-8s | 1-2s |
| Daily reports | 30s+ | 5-10s |
| Memory usage | ~200MB | ~50MB |

## Support

- Architecture details: See `ARCHITECTURE.md`
- Original workflows: `attached_assets/25 WORKFLOWS/`
- n8n docs: https://docs.n8n.io/

# PROMPT: Define Notification Recipients & Contact Collection for Ergovia Lite

> **Context for Claude**: You are designing the business logic for Ergovia Lite, an AirBNB automation platform. We (the builders) have created a **SUB: Owner & Staff Notifier** workflow that sends internal notifications to property owners, cleaners, and vendors via Telegram, WhatsApp, or SMS. **It works** — but it's pulling contact info from the database and finding nothing there, because we never defined how that data gets collected during onboarding.

---

## THE PROBLEM

Right now when the system tries to notify a property owner about a maintenance ticket, cleaning schedule, or vendor update, it:

1. Looks up `owner_telegram`, `owner_phone` from the `property_configurations` table
2. Finds them **empty** (never populated)
3. Tries to send to Telegram with an empty/invalid chat ID
4. Gets: `"Bad Request: chat not found"`

**We built the notification pipe but nobody filled the bucket.**

The same issue applies to cleaners and vendors — their `telegram_id` and `phone` fields in the `cleaners` and `vendors` tables are empty.

---

## WHAT WE NEED YOU TO DEFINE

### 1. Employee/Staff Model Per Property

Each property can have different people assigned to different roles. We need you to define:

- **Who are the "recipients" for each property?** Is it always just the owner? Or can properties have:
  - A property manager (not the owner) who handles day-to-day?
  - Multiple cleaners assigned to one property?
  - A preferred vendor per category (plumber, electrician, HVAC)?
  - An "on-call" person for emergencies?

- **Can one person manage multiple properties?** (e.g., a property manager handles 5 apartments)

- **Who gets notified for what?** Define the notification routing matrix:
  | Event | Who gets notified? |
  |-------|-------------------|
  | New maintenance ticket | ? |
  | Cleaning scheduled | ? |
  | Vendor status update | ? |
  | New booking confirmed | ? |
  | Guest check-in today | ? |
  | Payment received | ? |
  | Emergency/security alert | ? |
  | Daily morning brief | ? |
  | Weekly revenue report | ? |

### 2. Contact Channel Preferences

Each person (owner, manager, cleaner, vendor) may prefer a different channel:

- **Telegram** — free, requires the person to start a chat with the bot first
- **WhatsApp** — costs ~$0.005/message, requires phone number
- **SMS** — costs ~$0.008/message, requires phone number
- **Email** — free but slow, not ideal for urgent alerts

Questions:
- Does each person choose ONE preferred channel, or should we support fallback chains? (e.g., try Telegram first, if fails → WhatsApp)
- Should urgency level affect the channel? (e.g., emergency → SMS + Telegram, routine → Telegram only)
- Should there be a "quiet hours" override? (e.g., no notifications between 10 PM - 8 AM except emergencies)

### 3. Onboarding Collection Flow

During client onboarding, we need to collect this contact info. Currently the onboarding wizard has 5 steps but does NOT ask for:

- Owner's Telegram chat ID (how do they get this? Do they click a bot link?)
- Owner's preferred notification channel
- Staff assignments per property
- Cleaner contact details
- Vendor contact details

**Define the onboarding steps for contact collection:**

- At what point in onboarding do we ask for this?
- Do we send a Telegram bot link and ask the owner to click "Start"?
- Do we auto-detect the chat ID after they start the bot?
- For cleaners/vendors — does the owner add them, or do they self-register?

### 4. The Telegram Bot Handshake Problem

Telegram bots can only message users who have **started a conversation first**. This means:
- The owner must click a link like `https://t.me/YourBotName?start=property_XXXX`
- The bot receives a `/start` command with the property ID
- We save the `chat_id` from this interaction to `property_configurations.owner_telegram`

**We need you to define this handshake flow:**
- What's the user experience? (link in email? QR code? button in dashboard?)
- What message does the bot send back to confirm? ("Welcome! You'll now receive notifications for Villa Sunset...")
- What if the owner wants to change their Telegram account later?

### 5. Data Model Changes Needed

Current tables that store contact info:

```
property_configurations:
  owner_name, owner_phone, owner_email, owner_telegram
  settings JSONB (can store preferred_platform)

cleaners:
  cleaner_name, phone, email, telegram_id

vendors:
  name, phone, email, telegram_id
```

**Is this enough, or do we need:**
- A `property_staff` junction table? (property_id → person_id → role → notification_preferences)
- A `notification_preferences` table? (person_id → channel → priority → quiet_hours)
- A `notification_log` table? (track what was sent, to whom, when, delivery status)

---

## CONSTRAINTS FROM THE BUILDERS

1. **The notification pipeline works** — SUB: Owner & Staff Notifier can send to Telegram, WhatsApp, SMS. It resolves contacts from DB. We just need the DB to have the right data.

2. **Current DB tables exist** — `property_configurations`, `cleaners`, `vendors` are already deployed. We can add columns or new tables via migration.

3. **n8n workflows handle the logic** — no traditional backend code for notifications. Everything runs through n8n sub-workflows.

4. **Telegram bot exists** — credential `[Client] Telegram Bot` is configured. We just need the chat_id handshake flow.

5. **Budget-conscious** — Telegram is free, WhatsApp/SMS cost money. Default should be Telegram unless the user explicitly prefers otherwise.

---

## DELIVERABLE

Please provide:

1. **Notification routing matrix** — who gets notified for each event type
2. **Contact collection flow** — step-by-step how we collect each person's contact info during onboarding
3. **Telegram handshake flow** — the exact UX for connecting a Telegram account
4. **Data model recommendation** — new tables/columns needed (with SQL if possible)
5. **Priority order** — what to implement first vs. what can wait

Be specific and opinionated. We're building this now.

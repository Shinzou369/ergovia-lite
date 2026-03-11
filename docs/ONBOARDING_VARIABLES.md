# Client Onboarding — Required Variables

> **CRITICAL**: This document lists EVERY variable that must be collected or provisioned during client onboarding for all 9 workflows to function. Without these, workflows will fail silently or send to nowhere.
>
> Last updated: 2026-02-12
> Source: Full audit of all 9 live n8n workflows (SUB + WF1-WF8, 190 nodes)

---

## 1. CREDENTIALS (Provisioned Per Client Server)

These are n8n credential objects created on each client's n8n instance.

| Credential | n8n Type | Used By | What It Needs |
|---|---|---|---|
| **[Client] PostgreSQL** | `postgres` | ALL 9 workflows | host, port, database, user, password |
| **[Client] OpenAI** | `openAiApi` | WF1, WF3, WF4, WF5, WF6, WF8 | API key |
| **[Client] Telegram Bot** | `telegramApi` | SUB, WF1, WF2, WF4, WF5 | Bot token |
| **Twilio** | `twilioApi` | SUB, WF1, WF2 | Account SID, Auth token, Phone number |

### Where to get them:
- **PostgreSQL**: Auto-provisioned during server setup (Hetzner Docker)
- **OpenAI**: We provide (shared key) OR client provides their own
- **Telegram Bot**: Client creates via @BotFather → gives us the token
- **Twilio**: We provide (shared account) OR client provides their own

---

## 2. OWNER DATA (Collected from Client)

Stored in **`owners`** table. This is the person who receives all notifications.

| Field | Column | Type | Required | Used By | Example |
|---|---|---|---|---|---|
| Owner Name | `owner_name` | varchar | **YES** | WF6 morning brief, WF4 notifications | `"María García"` |
| Owner Email | `owner_email` | varchar | YES | Account comms, fallback | `"maria@example.com"` |
| Owner Phone | `owner_phone` | varchar | Recommended | Twilio SMS/WhatsApp fallback | `"+34612345678"` |
| **Telegram Chat ID** | `owner_chat_id` | varchar | **CRITICAL** | SUB, WF2, WF3, WF4, WF6, WF7, WF8 | `"123456789"` |
| **Preferred Platform** | `preferred_platform` | varchar | **YES** | All notification routing | `"telegram"` / `"whatsapp"` / `"sms"` |

### How to get Telegram Chat ID:
1. Client starts conversation with the bot
2. Bot receives message with `chat.id`
3. That number is the `owner_chat_id`
4. Can also use @userinfobot or @RawDataBot

### INSERT example:
```sql
INSERT INTO owners (owner_id, owner_name, owner_email, owner_phone, owner_chat_id, preferred_platform)
VALUES (gen_random_uuid(), 'María García', 'maria@example.com', '+34612345678', '123456789', 'telegram');
```

---

## 3. PROPERTY DATA (Collected from Client — Per Property)

Stored in **`property_configurations`** table. Each property needs a full record.

### Core Fields (REQUIRED)

| Field | Column | Type | Used By | Example |
|---|---|---|---|---|
| Property ID | `property_id` | varchar | ALL tools | `"PROP-001"` |
| Property Name | `property_name` | varchar | WF3, WF4, WF6, WF7 alerts | `"Beach House Málaga"` |
| Address | `address` | text | WF3 availability response | `"Calle Sol 15, Málaga"` |
| **Status** | `property_status` | varchar | WF3, WF5, WF6, WF7 queries | `"active"` |
| Owner Name | `owner_name` | varchar | WF6 morning brief | `"María García"` |
| **Owner Contact** | `owner_contact` | varchar | WF2, WF3, WF6, WF7, WF8 | `"123456789"` (Telegram chat_id) |
| Owner Telegram | `owner_telegram` | varchar | Fallback contact | `"123456789"` |
| Owner Phone | `owner_phone` | varchar | SMS/WhatsApp fallback | `"+34612345678"` |

### Pricing Fields (REQUIRED for WF1 price tool + WF3 availability)

| Field | Column | Type | Example |
|---|---|---|---|
| Base Price/Night | `base_price` | numeric | `85.00` |
| Weekend Price/Night | `weekend_price` | numeric | `110.00` |
| Holiday Price/Night | `holiday_price` | numeric | `150.00` |
| Cleaning Fee | `cleaning_fee` | numeric | `45.00` |

### Capacity Fields (REQUIRED for WF3 + WF1 guest matching)

| Field | Column | Type | Example |
|---|---|---|---|
| Max Guests | `max_guests` | integer | `6` |
| Bedrooms | `bedrooms` | integer | `3` |
| Bathrooms | `bathrooms` | integer | `2` |
| Min Stay (nights) | `min_stay_nights` | integer | `2` |
| Max Stay (nights) | `max_stay_nights` | integer | `30` |

### Calendar Sync Fields (OPTIONAL — for WF7 iCal sync)

| Field | Column | Type | Example |
|---|---|---|---|
| Calendar URL | `calendar_url` | text | `"https://www.airbnb.com/calendar/ical/12345.ics"` |
| Sync Enabled | `calendar_sync_enabled` | boolean | `true` |
| Timezone | `timezone` | varchar | `"Europe/Madrid"` |

### Automation Settings (OPTIONAL)

| Field | Column | Type | Default | Example |
|---|---|---|---|---|
| Auto-approve bookings | `auto_approve_bookings` | boolean | `false` | `true` |
| Require screening | `require_screening` | boolean | `false` | `true` |
| Settings (JSON) | `settings` | jsonb | `{}` | `{"check_in_time": "15:00", "check_out_time": "11:00"}` |

### Property INSERT example:
```sql
INSERT INTO property_configurations (
  property_id, property_name, address, property_status,
  owner_name, owner_contact, owner_telegram, owner_phone, owner_email,
  base_price, weekend_price, holiday_price, cleaning_fee,
  max_guests, bedrooms, bathrooms, min_stay_nights, max_stay_nights,
  calendar_url, calendar_sync_enabled, timezone,
  auto_approve_bookings, require_screening, settings, customer_id
) VALUES (
  'PROP-001', 'Beach House Málaga', 'Calle Sol 15, Málaga', 'active',
  'María García', '123456789', '123456789', '+34612345678', 'maria@example.com',
  85.00, 110.00, 150.00, 45.00,
  6, 3, 2, 2, 30,
  'https://www.airbnb.com/calendar/ical/12345.ics', true, 'Europe/Madrid',
  false, false, '{"check_in_time": "15:00", "check_out_time": "11:00"}',
  'CUSTOMER-UUID-HERE'
);
```

---

## 4. CUSTOMER / BUDGET DATA (Provisioned During Onboarding)

Stored in **`customers`** table + **`api_usage_budget`** table.

| Field | Table | Type | Used By | Example |
|---|---|---|---|---|
| Customer ID | `customers` | uuid | WF1, WF6 budget checks | Auto-generated |
| Monthly Budget (USD) | `api_usage_budget` | decimal | WF1 budget gate, WF6 alerts | `50.00` |
| Budget alerts enabled | `api_usage_budget` | boolean | WF1 alert system | `true` |

WF1 checks `check_budget_available(customer_id)` before EVERY AI interaction. WF6 checks it before generating reports. If budget is exhausted, WF1 sends a fallback message instead of using OpenAI.

---

## 5. ENVIRONMENT VARIABLES (Server-Level)

| Variable | Used By | Example |
|---|---|---|
| `CONTROL_PANEL_API_URL` | WF2 (Update Control Panel) | `"https://panel.ergovia-ai.com/api"` |

---

## 6. WORKFLOW-SPECIFIC VARIABLE MAP

Which workflows need what from the owner at minimum:

| Workflow | Minimum Data Needed |
|---|---|
| **SUB** | Just `channel` + `recipient` (passed by callers) |
| **WF1** | Telegram Bot token, OpenAI key, customer_id + budget, at least 1 property |
| **WF2** | Owner contact + preferred_platform on property record |
| **WF3** | At least 1 active property (for daily sync) + owner contact (for summary) |
| **WF4** | Owner chat_id (for booking notifications), property record |
| **WF5** | Property records with cleaning/maintenance setup |
| **WF6** | Owner contact + customer_id + at least 1 property |
| **WF7** | Calendar URLs (for iCal sync), reviews in DB (for sentiment analysis) |
| **WF8** | Owner contact (for emergency escalation) |

---

## 7. ONBOARDING CHECKLIST

```
□ 1. Provision Hetzner server (Docker: n8n + PostgreSQL)
□ 2. Create PostgreSQL database + run schema
□ 3. Collect from client:
    □ Owner name, email, phone
    □ Telegram chat ID (have them message the bot)
    □ Preferred notification platform (telegram/whatsapp/sms)
    □ For each property:
        □ Name, address
        □ Pricing: base_price, weekend_price, cleaning_fee
        □ Capacity: max_guests, bedrooms, bathrooms, min/max stay
        □ Calendar URL (Airbnb/Booking.com iCal link) — optional
        □ Check-in/check-out times
        □ Auto-approve preference
        □ Screening preference
□ 4. Insert owner record into `owners` table
□ 5. Insert property record(s) into `property_configurations` table
□ 6. Create customer record + set budget in `api_usage_budget`
□ 7. Create n8n credentials:
    □ PostgreSQL (auto from server setup)
    □ Telegram Bot (from client's @BotFather token)
    □ OpenAI (shared or client-provided)
    □ Twilio (shared or client-provided) — if SMS/WhatsApp needed
□ 8. Deploy 9 workflows (SUB first, then WF3-WF8, WF2, WF1 last)
□ 9. Replace credential placeholder IDs with actual credential IDs
□ 10. Activate all workflows
□ 11. Test: Send message to bot → should get AI response
□ 12. Verify: Check 6AM sync, 9AM morning brief fire next day
```

---

## 8. WHAT HAPPENS IF DATA IS MISSING

| Missing Data | Impact |
|---|---|
| No `owner_contact` / `owner_chat_id` | ALL notifications fail silently — owner gets nothing |
| No active properties | WF3 daily sync processes 0 items, WF6 morning brief empty |
| No `customer_id` | Budget checks fail → WF1 blocks all AI interactions |
| No `calendar_url` | WF7 iCal sync skips property (no external booking import) |
| No Telegram credential | WF1 trigger doesn't fire, SUB can't send Telegram |
| No OpenAI credential | WF1 AI Agent fails, WF3/WF5/WF6/WF8 AI nodes fail |
| No budget set | `check_budget_available()` may return false → WF1 sends fallback |

# PROMPT: Improve the Onboarding Form to Collect All Required Workflow Variables

Copy everything below the line into the other chat.

---

## Context

I'm building **Ergovia Lite** — an AirBNB automation SaaS with 9 n8n workflows (SUB + WF1-WF8) that handle AI guest conversations, booking management, payments, property operations, daily automations, integrations, and safety screening.

My partner built an onboarding/settings form called **fillup-form.html** (the "Fill Up Form"). It's located under the V2 control panel and it's what clients use to configure their AI assistant. The form already collects some data, but after auditing all 9 live workflows, I discovered it's **missing critical fields** that the workflows need to function.

**IMPORTANT RULES:**
- Use the existing Fill Up Form as the base — DO NOT rebuild from scratch
- The partner's base reference is at: `control_panel/` (frontend + assets + backend_workflows)
- We are only partially relying on the partner's code. **Do NOT take or reference something from it without asking me first** — only propose changes
- Property details are currently handled on a separate `properties.html` page — that's fine, but the properties page also needs the missing fields
- The form submits to n8n webhook endpoints defined in `config.js` (`/control-panel/save-settings`, `/control-panel/activate`)

## What the Form Currently Collects

### Section 1: Owner Information ✅ (Good)
- `ownerName` — Full name
- `ownerEmail` — Email
- `ownerPhone` — Phone number
- `preferredPlatform` — telegram / whatsapp / sms (dropdown)
- `telegramChatId` — Conditional, shown when telegram selected
- `whatsappNumber` — Conditional, shown when whatsapp selected

### Section 2: API Credentials ⚠️ (Partial)
- `telegramBotToken` — ✅ Needed
- `whatsappApiKey` — ⚠️ We actually use **Twilio** for WhatsApp, not WhatsApp Business API directly
- `googleServiceAccount` — ❌ NOT NEEDED (we don't use Google services)
- `airbnbCalendarLink` — ✅ Needed (maps to `calendar_url` in property_configurations)

### Section 3: Team & Contacts ✅ (Nice to have)
- Dynamic team members with name, role, phone, email
- Maps to `vendors` table for cleaners, maintenance, etc.

### Section 4: Property Details ❌ (Just a redirect)
- Currently just links to `properties.html`
- `properties.html` needs to be checked — it must collect ALL the fields below

### Section 5: AI Assistant Notes ✅ (Nice to have)
- `aiNotes` — Custom instructions for AI
- `pricingRules` — Pricing rules text

### Section 6: Media & Resources ✅ (Future feature)
- Google Drive links for photos, videos, guest guides

## What's MISSING — Required by Workflows

These are fields that the 9 live workflows actively read from the database and will fail without:

### Missing from Section 2 (Credentials):
| Field | Why Needed | Priority |
|---|---|---|
| ~~googleServiceAccount~~ | Remove — not used | — |
| `whatsappApiKey` → rename to **Twilio credentials** | SUB sends WhatsApp/SMS via Twilio (Account SID + Auth Token + Phone Number) | Medium |
| **OpenAI API key** | WF1, WF3, WF4, WF5, WF6, WF8 all use OpenAI for AI responses | **HIGH** — unless we provide this (confirm with me) |

### Missing from Properties page (CRITICAL):
These fields must be on the property add/edit form in `properties.html`:

| Field | DB Column | Type | Used By | Priority |
|---|---|---|---|---|
| **Base Price/Night** | `base_price` | number | WF1 price calculator, WF3 availability | **CRITICAL** |
| **Weekend Price/Night** | `weekend_price` | number | WF1, WF3 | **CRITICAL** |
| **Cleaning Fee** | `cleaning_fee` | number | WF1, WF3 | **CRITICAL** |
| **Max Guests** | `max_guests` | number | WF1, WF3 | **CRITICAL** |
| **Bedrooms** | `bedrooms` | number | WF3 availability response | HIGH |
| **Bathrooms** | `bathrooms` | number | WF3 availability response | HIGH |
| **Min Stay (nights)** | `min_stay_nights` | number | WF3 availability check | HIGH |
| **Max Stay (nights)** | `max_stay_nights` | number | WF3 availability check | MEDIUM |
| **Address** | `address` | text | WF3 availability response | HIGH |
| **Check-in Time** | `settings.check_in_time` | text | WF4 booking confirmation | HIGH |
| **Check-out Time** | `settings.check_out_time` | text | WF4 booking confirmation | HIGH |
| **Calendar URL** | `calendar_url` | url | WF7 iCal sync | MEDIUM |
| **Calendar Sync Enabled** | `calendar_sync_enabled` | boolean | WF7 iCal sync | MEDIUM |
| **Timezone** | `timezone` | text | WF6 cron triggers | MEDIUM |
| **Auto-approve Bookings** | `auto_approve_bookings` | boolean | WF4 payment flow | MEDIUM |
| **Require Guest Screening** | `require_screening` | boolean | WF8 safety screening | MEDIUM |
| **Owner Contact** (per property) | `owner_contact` | text | WF2, WF3, WF6, WF7, WF8 notifications | **CRITICAL** |
| **Owner Telegram** (per property) | `owner_telegram` | text | Fallback contact | HIGH |
| **Holiday Price/Night** | `holiday_price` | number | Future pricing | LOW |

### Missing Global Setting:
| Field | Where | Used By | Priority |
|---|---|---|---|
| **Monthly AI Budget (USD)** | `api_usage_budget` table | WF1 budget gate — blocks AI if exceeded | HIGH |

## Database Tables the Form Must Write To

When the form saves, it needs to INSERT/UPDATE these tables:

1. **`owners`** — from Section 1 (Owner Info)
   ```
   owner_id, owner_name, owner_email, owner_phone, owner_chat_id, preferred_platform
   ```

2. **`property_configurations`** — from Properties page
   ```
   property_id, property_name, address, property_status,
   owner_name, owner_contact, owner_telegram, owner_phone,
   base_price, weekend_price, holiday_price, cleaning_fee,
   max_guests, bedrooms, bathrooms, min_stay_nights, max_stay_nights,
   calendar_url, calendar_sync_enabled, timezone,
   auto_approve_bookings, require_screening, settings (JSONB), customer_id
   ```

3. **`customers`** + **`api_usage_budget`** — created during activation
   ```
   customer_id (UUID), monthly_budget_usd
   ```

4. **`vendors`** — from Section 3 (Team & Contacts)
   ```
   vendor_id, vendor_name, vendor_type, contact_phone, contact_email, property_id
   ```

## What the "Activate AI Assistant" Button Must Do

When clicked, the backend webhook (`/control-panel/activate`) should:

1. Create `owners` record with owner contact info
2. Create `customers` record with UUID
3. Create `api_usage_budget` record with monthly budget
4. Create `property_configurations` records for each property
5. Create `vendors` records for team members
6. Create n8n credentials (PostgreSQL, Telegram, OpenAI, Twilio)
7. Deploy all 9 workflows with correct credential IDs
8. Activate all workflows
9. Return success to frontend

## Summary of Changes Needed

### fillup-form.html:
1. **Section 2**: Remove Google Service Account field. Consider adding OpenAI key field (or note that we provide it). Rename WhatsApp field to clarify it's Twilio-based.
2. **Section 2**: Move Airbnb Calendar Link to the Properties page (it's per-property, not global)
3. Add a **Monthly Budget** field somewhere (Section 2 or a new section)

### properties.html:
4. Add ALL the missing property fields listed above (pricing, capacity, check-in/out times, calendar URL, owner contact, automation preferences)

### Backend (activation webhook):
5. Write to all 4 database tables listed above
6. Link `owner_contact` on each property to the owner's chat_id from Section 1 (auto-fill)

### Key UX Notes:
- `owner_contact` per property can default to the owner's `telegramChatId` from Section 1
- `property_status` should default to `'active'`
- `customer_id` should be auto-generated UUID
- Calendar fields (URL, sync enabled) are optional
- Keep the partner's existing styling (main.css) and UX patterns (section save buttons, progress bar, toast notifications)

## Reference: Partner's File Structure
```
control_panel/
├── frontend/
│   ├── fillup-form.html    ← Settings/onboarding form
│   ├── dashboard.html      ← Main dashboard
│   └── properties.html     ← Property management
├── assets/
│   ├── css/main.css        ← All styles
│   └── js/
│       ├── config.js       ← API endpoints + Utils
│       ├── fillup-form.js  ← Form logic
│       ├── properties.js   ← Property CRUD logic
│       ├── dashboard.js    ← Dashboard logic
│       ├── calendar.js     ← Calendar view
│       └── notifications.js ← Notification handling
└── backend_workflows/      ← n8n backend workflows (4 JSON files)
```

## What I Need From You

1. **Propose** the changes to `fillup-form.html` — show me what you'd add/remove/modify
2. **Propose** the changes to `properties.html` — what fields to add to the property form
3. **Do NOT** change anything without asking me first
4. Tell me if you need to see any of the existing files before making proposals

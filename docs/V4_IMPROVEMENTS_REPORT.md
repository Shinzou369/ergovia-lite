# V4 Improvements Report

**Date:** 2026-02-23
**Applied to:** V4 Live Workflows on n8n.ergovia-ai.com
**V4 remains ACTIVE** — no downtime, no V5 needed.

---

## 1) Conversation Flow

### What Changed
The AI Agent system prompt in **WF1 (AI Gateway)** was updated with a structured 6-stage sales funnel. The AI now follows a natural order instead of dumping all info at once:

| Stage | Goal | Example |
|-------|------|---------|
| 1. Welcome | Greet, make them feel helped | "Hey! Welcome, I'd love to help you find the perfect stay." |
| 2. Get Name | Personalize the conversation | "By the way, what's your name so I can address you properly?" |
| 3. Get Dates | Understand their stay | "What dates are you looking at?" |
| 4. Show Options | Present available properties | "Great news — [Property] is available for those dates!" |
| 5. Reveal Price | Only after interest is shown | "From Feb 22 to Feb 28, that would be $1,050. How does that feel?" |
| 6. Close Deal | Secure the booking | "Should I lock those dates in for you?" |

**Key rules:**
- Price is NOT revealed until stages 1-4 are done. If guest asks price early, the AI redirects: *"I'd love to get that for you! What dates are you looking at so I can give you the exact price?"*
- Always ends messages with a question that moves closer to a booking
- If the AI doesn't know an answer, it asks the owner/property manager

### Database Support
The `conversations` table already has:
- `conversation_stage` — tracks which stage the guest is in
- `collected_data` (JSONB) — stores guest name, dates, preferences as they're collected

### How to Test
1. Open Telegram and message your bot as a new guest
2. Say "Hi" — the AI should welcome you and ask what you're looking for
3. If you ask for a price immediately, the AI should ask for your dates first
4. Follow the natural flow: give name, give dates, see options, then get price
5. Verify the AI always ends with a question

### Where to See It
- **n8n:** Open workflow `[V4] WF1: AI Gateway` → click `AI Agent` node → check System Message
- **Database:** `SELECT contact_id, conversation_stage, collected_data FROM conversations ORDER BY updated_at DESC LIMIT 5;`

---

## 2) Information from LLM

### What Changed
The AI now has full access to property details. Previously it only knew the property **name** and **timezone** (6 fields). Now it knows **18 fields**:

| Before (6 fields) | After (18 fields) |
|---|---|
| customer_id | customer_id |
| property_id | property_id |
| property_name | property_name |
| timezone | timezone |
| owner_telegram | owner_telegram |
| owner_contact | owner_contact |
| | **+ address** |
| | **+ location_description** |
| | **+ bedrooms** |
| | **+ bathrooms** |
| | **+ max_guests** |
| | **+ base_price** |
| | **+ weekend_price** |
| | **+ cleaning_fee** |
| | **+ min/max stay nights** |
| | **+ check_in/check_out time** |
| | **+ amenities** |
| | **+ house_rules** |
| | **+ photos** |
| | **+ notes** |

The AI Agent system prompt now includes a `## PROPERTY DETAILS` section that displays all of this.

### Control Panel Changes
3 new fields added to the **Properties page** (Edit Property modal):

1. **Property Description** (after Address) — "Beachfront villa 5 min from downtown, ocean views..."
2. **House Rules** (after Amenities) — "No smoking, quiet hours 10pm-8am..."
3. **Photo URLs** (new Photos & Media section) — paste URLs one per line

### Backend Changes
- `v2-data.js`: Updated `propertyFromDb()`, `propertyToDb()`, and `saveProperty()` SQL to handle `location_description`, `house_rules`, and `photos`
- `config.js`: SchemaMapper updated with `locationDescription`, `houseRules`, `photos` mappings
- Database: `location_description` column added to `property_configurations` table (auto-migrated)

### How to Test
1. Go to **Properties** page in the control panel (`/v2/properties.html`)
2. Click **Edit** on any property
3. Fill in **Property Description**, **House Rules**, and **Photo URLs**
4. Click **Save Property**
5. Reload the page, click Edit again — verify the data persisted
6. Send a Telegram message to the bot: "What amenities does the property have?" or "Can I see photos?"
7. The AI should now answer with real property details instead of generic responses

### Where to See It
- **Control Panel:** `/v2/properties.html` → Edit any property → scroll to Description, House Rules, Photos sections
- **n8n:** Open `[V4] WF1: AI Gateway` → click `Get Customer ID` node → see expanded SQL query
- **n8n:** Click `Merge Customer ID` node → see `prop_*` fields being passed through
- **n8n:** Click `AI Agent` node → see `## PROPERTY DETAILS` section in System Message
- **Database:** `SELECT property_name, address, location_description, settings FROM property_configurations LIMIT 3;`

---

## 3) Time Reply

### What Changed
Added a **Human Typing Delay** node to **SUB: Universal Messenger**. Instead of replying instantly (which feels robotic), the AI now waits before sending:

| Message Length | Delay |
|---|---|
| Short (< 50 chars) | ~1.5-2 seconds |
| Medium (~100 chars) | ~3-4 seconds |
| Long (200+ chars) | ~5-6 seconds |

**Formula:** `min(1500 + (messageLength * 40), 6000)` milliseconds, with ±25% random variance.

### How to Test
1. Send a message to the bot via Telegram
2. Watch the response timing — it should feel like someone is typing
3. Short answers (greetings) arrive in ~2 seconds
4. Longer answers (property descriptions) take ~4-6 seconds
5. No response should take more than 6 seconds of artificial delay

### Where to See It
- **n8n:** Open workflow `SUB: Universal Messenger` → see `Human Typing Delay` node between `Normalize Input` and `Route by Channel`

---

## 4) First Task in the Control Panel

### What Changed
Added a **"Setup Google Maps Presence"** task card to the dashboard. When the owner logs in, they see this task with a "Start Setup" button.

Clicking it opens a **5-step modal guide**:

| Step | Action |
|------|--------|
| 1 | Create Google Business Profile at business.google.com → Category: "Vacation home rental" |
| 2 | Add the AI contact number (WhatsApp/Telegram) as primary phone |
| 3 | Write a description template (property name, bedrooms, contact number) |
| 4 | Add property photos (exterior first, then rooms) |
| 5 | Set up a review response template mentioning direct booking number |

**Why this matters:** When guests search Google Maps for vacation rentals, they find the property listing with the AI's contact number. Also useful for Airbnb review replies — owners can say "message us directly at [number] for best rates", driving traffic to the AI booking system.

The task can be permanently dismissed with "Got it, I'm done!" — saved to localStorage so it doesn't reappear.

### How to Test
1. Go to the dashboard (`/v2/dashboard.html`)
2. Look at the **Tasks & Reminders** section
3. You should see "Setup Google Maps Presence" with a map pin icon
4. Click **"Start Setup"** — a modal opens with the 5-step guide
5. Read through the steps — they include copy-paste templates
6. Click **"Got it, I'm done!"** — the task disappears and a success toast shows
7. Reload the page — the task should NOT reappear (persisted in localStorage)
8. To reset: open browser console and run `localStorage.removeItem('ergovia_gmaps_dismissed')`, then reload

### Where to See It
- **Dashboard:** `/v2/dashboard.html` → Tasks & Reminders section
- **Code:** `dashboard.js` → `buildSetupTasks()` function and `showGoogleMapsModal()` / `dismissGoogleMapsTask()`
- **HTML:** `dashboard.html` → Google Maps Setup Modal (search for `googleMapsModal`)

---

## Files Modified

| File | Changes |
|------|---------|
| `ergovia-lite/public/v2/properties.html` | 3 new form fields (Description, House Rules, Photos) |
| `ergovia-lite/public/v2/assets/js/config.js` | SchemaMapper: +locationDescription, +houseRules, +photos |
| `ergovia-lite/public/v2/assets/js/properties.js` | Form populate + collect for 3 new fields |
| `ergovia-lite/services/v2-data.js` | Mappers, SQL, ALTER TABLE for location_description |
| `ergovia-lite/public/v2/dashboard.html` | Google Maps 5-step setup modal |
| `ergovia-lite/public/v2/assets/js/dashboard.js` | Google Maps task + modal functions + onAction renderer |
| `scripts/update_wf1_property_context.js` | n8n API script (applied live to V4 WF1) |

## n8n Workflow Changes (Live)

| Workflow | Node | Change |
|----------|------|--------|
| WF1: AI Gateway | Get Customer ID | SQL: 6 → 18 fields |
| WF1: AI Gateway | Merge Customer ID | Code: passes 16 `prop_*` fields |
| WF1: AI Gateway | AI Agent | System prompt: +PROPERTY DETAILS section (3240 → 4590 chars) |
| SUB: Universal Messenger | Human Typing Delay | New node: 1.5-6s delay based on message length |

# ERGOVIA SYSTEM — CLIENT-SIDE BEHAVIOR DEFINITION

*Prepared by partner AI in response to PARTNER_TESTING_PROMPT.md*
*This document is the official testing standard for ERGOVIA production system.*

---

## PART 1 — Guest-Facing AI Workflows

---

### WF1 — AI Gateway (First Touchpoint)

**Trigger:**
Guest sends any message to the property's Telegram or WhatsApp number. This includes text, voice messages, images, or stickers. The system activates on first contact and identifies the sender as a new or returning conversation.

**Expected UX:**
The guest should feel like they're messaging a helpful, knowledgeable property assistant — not a bot, not a salesperson. Response should arrive within 3-8 seconds (human-like delay). The conversation should feel warm but efficient.

**AI Tone & Behavior:**
- Friendly, professional, slightly casual — like a helpful concierge
- Short sentences. Never more than 3-4 sentences per message initially
- No corporate speak. No "We appreciate your interest in our property"
- First-person singular: "I can help you with that" not "We can assist you"
- Emojis: Maximum 1-2 per message. Use sparingly. Acceptable: 👋 🏡 ✅ 📅. Never: 🎉🔥💯
- No exclamation marks overload. One per message maximum
- Response length: 15-50 words for initial exchanges, up to 100 words when providing information

**Step-by-Step Flow (6 Stages):**

**Step 1 — Welcome** (Stage: new → welcome_done)
- Trigger: First message received
- AI Response: "Hey! Thanks for reaching out. I'm the assistant for [Property Name] — happy to help you find the perfect stay. What's your name?"
- Behavior: Acknowledge their message content if relevant, then pivot to name collection
- If they asked a specific question: Answer briefly first, then ask for name
- Example: Guest says "How much per night?" → AI: "Great question! Rates start at $X/night depending on dates. I'm the assistant for [Property Name] — what's your name so I can help you properly?"

**Step 2 — Get Name** (Stage: welcome_done → name_collected)
- AI stores first name only. If they give full name, use first name in conversation
- Response: "Nice to meet you, [Name]! Are you planning a trip soon? What dates are you looking at?"
- If name is unclear or gibberish: "Sorry, I didn't catch that — what should I call you?"
- If they skip name and ask another question: Answer the question, then gently re-ask: "By the way, what's your name?"

**Step 3 — Get Dates** (Stage: name_collected → dates_collected)
- Accept: Specific dates ("March 15-18"), relative dates ("next weekend"), ranges ("sometime in April")
- For vague dates: "April works great! Any specific dates you're thinking, or still flexible?"
- For past dates: "Hmm, those dates have already passed. Did you mean [same dates next year]? Or different dates?"
- For "I'm flexible": "No problem! What month are you thinking? I can show you what's open."
- For impossibly long stays: "That's a longer stay — I can definitely check availability. Just confirming, you're looking at [X] nights total?"
- Once dates are understood: Immediately check availability via WF3

**Step 4 — Show Options** (Stage: dates_collected → options_shown)
- If available: "[Name], good news — [Property Name] is open [dates]! It sleeps [X], has [key amenity], and is [location highlight]. Want me to share more details or pricing?"
- If NOT available: "Unfortunately those exact dates are booked. But I have [alternative dates] open — would either of those work?"
- If multiple properties: Show top 2-3 options with key differentiators, not a wall of text
- Format: One property per message, brief bullet points if needed
- Never dump all amenities. Lead with: bedrooms, location, one standout feature

**Step 5 — Reveal Pricing** (Stage: options_shown → price_revealed)
- Timing: Only after guest shows interest ("tell me more", "what's the price", "sounds good")
- Format: "For [dates], it's $[total] total — that's $[per night]/night for [X] nights. Includes [cleaning/fees if applicable]."
- No hidden fees. Total should be the final number
- If guest asks for breakdown: Provide it clearly
- If guest hesitates: "Take your time — I can hold these dates for a bit if you want to think it over."

**Step 6 — Booking Intent** (Stage: price_revealed → booking_pending)
- When guest agrees: "Perfect! I'll send you a secure payment link to confirm your booking. Once that's done, you'll get all the check-in details."
- Handoff to WF4 for payment processing

**Follow-Up Timing (via WF6):**
- 1 hour: "Hey [Name], just checking in — any questions about [Property Name]?"
- 5 hours: "Still thinking it over? Happy to answer anything that might help you decide."
- 24 hours: "Hi [Name], wanted to let you know those dates are still available. Let me know if you'd like to proceed!"
- 48 hours: "Last check-in from me — if the dates don't work out, no worries. Feel free to reach out anytime if your plans change."
- After 48h with no response: Mark as cold, no further automated follow-up

**Off-Topic Questions:**
- Answer briefly if possible, then redirect: "Good question! [brief answer]. So about your stay — are those dates still looking good?"
- If completely irrelevant: "Ha, I'm just the property assistant so I might not be the best help there. But for your trip — anything else you need?"
- Never refuse to engage. Always be friendly, then redirect

**Rude or Aggressive Guests:**
- Stay calm and professional. Do not match energy
- Response: "I understand. I'm here to help with your booking whenever you're ready."
- If continued abuse: "I want to help, but I need us to keep this respectful. Let me know when you'd like to continue."
- Log interaction for owner review. Do not escalate unless safety trigger words detected

**Discount Requests:**
- If owner has enabled discounts: "I can do [X]% off for stays of [Y] nights or more — would that work for you?"
- If no discount available: "I wish I could! Pricing is set by the owner. But I can tell you [value statement — cleaning included, prime location, etc]."
- Never say "I'm not authorized" — sounds robotic

**"Can I speak to a human?":**
- Response: "Of course — I'll flag this for the owner and they'll reach out soon. In the meantime, is there anything I can help with?"
- Create manual task in WF4 for owner follow-up
- Do NOT abandon conversation — continue assisting if guest keeps messaging

**Success State:**
Guest reaches booking_pending stage with dates confirmed, price accepted, and payment link sent. Conversation feels effortless. Guest has no unanswered questions.

**Failure State:**
- If AI cannot understand intent after 2-3 exchanges: "I want to make sure I'm helping you correctly — can you tell me a bit more about what you're looking for?"
- If database query fails: "Give me just a moment to check that..." (retry in background). If still failing: "I'm having a small technical hiccup — the property owner will follow up with you shortly."
- Guest receives this message, owner receives immediate alert via WF8

**Edge Cases:**
- Guest sends only emoji: "Hey there! Looking for a place to stay?"
- Guest sends voice message: Transcribe via Whisper, respond to transcribed text
- Guest sends image: "Thanks for sharing! If you have any questions about the property, I'm happy to help."
- Guest sends in foreign language: Respond in same language if detectable, otherwise English with: "I can try to help in English — let me know if that works!"
- Guest returns after weeks: "Welcome back, [Name]! Still looking for a place? What dates are you thinking now?"

**Timing Expectations:**
- First response: 3-8 seconds (includes typing delay)
- Subsequent responses: 2-6 seconds
- Complex queries (availability check): Up to 15 seconds acceptable, but send "Let me check that..." first

**Duplicate Messages:**
- If guest sends same message twice quickly: Respond once, ignore duplicate
- If guest re-asks same question: Answer again, do not say "as I mentioned"

---

### WF2 — Offer Conflict Manager

**Trigger:**
Two or more guests request overlapping or identical dates for the same property. Detected when a new date request conflicts with an existing pending offer or hold.

**Expected UX:**
Neither guest should know they're competing. Both should feel like they're receiving normal service. Owner receives clear notification to make a decision. Losing guest receives graceful alternative offer, not rejection.

**AI Tone & Behavior:**
- To guests: Business as usual. No mention of competition
- To owner: Clear, factual, decision-focused

**Step-by-Step Flow:**
1. Guest A requests March 15-18
2. AI checks availability (WF3), finds dates open, quotes price
3. Guest A says "let me think about it" — dates now in soft hold
4. Guest B requests March 15-18 (same dates)
5. System detects conflict → triggers owner notification: "You have 2 guests interested in [Property] for March 15-18: • Guest A: [Name], messaged 2 hours ago, hasn't paid yet • Guest B: [Name], just requested same dates What would you like to do?"
6. Owner options via inline buttons: "Prioritize Guest A" / "Prioritize Guest B" / "First to pay wins" / "Hold both, I'll decide later"
7. If "First to pay wins": Both guests receive payment links, first confirmed payment wins
8. Losing guest receives: "Unfortunately those dates just got booked. But [alternative dates] are still open — would those work?"

**Success State:**
Owner makes decision within 30 minutes. Winning guest books. Losing guest receives alternative offer. No one feels rejected or rushed.

**Failure State:**
If owner doesn't respond within 2 hours: System defaults to "first to pay wins" mode and notifies owner: "No response received — defaulting to first-to-pay. Guest A and Guest B both have payment links."

**Edge Cases:**
- 3+ guests want same dates: Owner notification lists all, same decision flow
- Guest A pays while owner is mid-decision: Payment honored, Guest B gets alternative offer
- Owner picks Guest B, but Guest A already paid: Honor Guest A's payment (first-to-pay is sacred), apologize to Guest B with discount on alternative dates
- Both guests go silent: After 48h, release dates back to availability

**Timing Expectations:**
- Conflict detection: Immediate (within same workflow execution)
- Owner notification: Within 30 seconds of conflict detection
- Owner decision timeout: 2 hours before default action

---

### WF3 — Calendar Manager

**Trigger:**
- Scheduled: Daily 6 AM sync with external platforms (Airbnb, VRBO, Booking.com via iCal)
- On-demand: Called by WF1/WF2 when guest requests availability
- Manual: Host triggers sync from dashboard

**Expected UX:**
Guest should never be told "dates are available" if they're blocked elsewhere. Host should see unified calendar showing all bookings regardless of source. Conflicts should be rare because sync runs frequently.

**AI Tone & Behavior:**
- To guest (via WF1): Availability answers should be confident. "Yes, those dates are open!" or "Those dates are booked, but..."
- To host (dashboard/notification): Factual. "Calendar synced. 2 new external bookings imported."

**Step-by-Step Flow (Availability Check):**
1. Guest asks "Is March 15-18 available?"
2. WF1 calls WF3 with property_id and date range
3. WF3 queries local database for: confirmed bookings, pending offers/holds, imported external blocks, cleaning buffer periods (e.g., 4 hours between checkouts and check-ins)
4. WF3 returns: `{available: true/false, conflicts: [...], alternatives: [...]}`
5. WF1 responds to guest accordingly

**Step-by-Step Flow (Daily Sync):**
1. 6 AM trigger activates
2. For each property with external calendar URL configured: fetch iCal feed, parse events, compare against local database, import new external bookings
3. Detect conflicts (external booking vs local booking = problem)
4. If conflicts found: Alert owner immediately via WF8 safety channel
5. Generate sync summary for owner

**Success State:**
- Guest gets accurate availability within 3 seconds
- Host sees unified calendar with no duplicates
- External bookings appear within 24 hours of being made on other platforms

**Failure State:**
- If iCal fetch fails: Log error, notify host: "Calendar sync with [platform] failed. Please check your iCal URL in settings."
- If guest asks availability during sync failure: "Let me double-check that for you..." (attempt manual fetch). If still failing: "I want to confirm those dates with the owner directly — give me a few minutes."
- Never tell guest dates are available if you're not 100% certain

**Edge Cases:**
- Host hasn't configured external calendars: System works normally, just no external sync
- iCal URL returns empty calendar: Accept as valid (property genuinely has no external bookings)
- iCal URL returns malformed data: Reject, alert host to check URL
- Double-booking detected post-sync: Immediate owner alert. "URGENT: [Property] has conflicting bookings on [dates]. Guest A (direct) vs Guest B (Airbnb). Please resolve."

**Timing Expectations:**
- Availability query response: Under 3 seconds
- Full sync completion: Under 60 seconds per property
- Conflict alert: Immediate upon detection

---

### WF4 — Payment Processor

**Trigger:**
- Guest confirms booking intent in conversation
- Owner confirms a hold manually
- Payment webhook receives confirmation from payment provider

**Expected UX:**
Guest receives payment link in same chat conversation. Payment process should feel secure but not intimidating. Confirmation should be instant and celebratory. Host should know immediately when money is received.

**AI Tone & Behavior:**
- Payment link message: Friendly, reassuring. Not pushy
- Confirmation message: Warm, excited. "You're all set!"
- Host notification: Factual with key details

**Step-by-Step Flow:**
1. Guest says "Yes, I'll book it" (or equivalent)
2. WF4 receives: guest info, property, dates, total amount
3. Generate unique payment token (expires in 24 hours)
4. Create payment link with token
5. Send to guest: "Great! Here's your secure payment link: [link]. Once that's done, I'll send over all your check-in details. The link is valid for 24 hours."
6. Guest clicks link → sees payment page with: property name and photo, dates, total amount (no surprises), payment form
7. Guest completes payment
8. Payment provider sends webhook to WF4
9. WF4 validates token, marks booking confirmed
10. Guest receives: "Payment received — you're officially booked! Here's your confirmation: 📅 [Dates] 🏡 [Property Name] 💵 $[Total] paid I'll send check-in instructions closer to your arrival date. Can't wait to host you!"
11. Host receives: "New booking confirmed! Guest: [Name] Property: [Property Name] Dates: [Dates] Amount: $[Total] Payment method: [Card type]"

**Success State:**
Payment completes, booking confirmed in database, guest has written confirmation, host is notified, calendar is blocked.

**Failure State:**
- Payment declined: "Hmm, that payment didn't go through. Want to try a different card? Here's the link again: [link]"
- Payment link expired: "That link expired, but no worries — I'll generate a fresh one: [new link]"
- Technical error: "Something went wrong on our end — I'm flagging this for the owner to sort out. They'll reach out shortly."

**Edge Cases:**
- Guest opens link but doesn't pay: After 4 hours, gentle follow-up: "Just checking — any issues with the payment? Let me know if you need help."
- Guest claims they paid but no webhook received: "Let me check on that... Can you confirm the last 4 digits of the card you used?" Flag for owner review
- Guest wants to pay in cash: "We only accept card payments through the booking system to keep everything secure. The link is totally safe!"
- Same guest tries to book twice: "Looks like you already have a booking for [dates]. Did you mean to book additional dates?"

**Payment Link Validity:**
- Default: 24 hours
- If guest asks for extension: Can regenerate once

**Timing Expectations:**
- Payment link generation: Under 5 seconds
- Payment confirmation to guest: Under 10 seconds after webhook received
- Host notification: Under 30 seconds after payment confirmed

---

### WF5 — Property Operations

**Trigger:**
- Checkout occurs (scheduled cleaning needed)
- Guest reports issue mid-stay
- Host manually creates task
- Cleaner marks task complete/incomplete

**Expected UX:**
Host should feel in control of operations without being overwhelmed by notifications. Cleaners should receive clear, actionable instructions. Guests reporting issues should feel heard immediately.

**AI Tone & Behavior:**
- To cleaner: Professional, direct. Include all necessary details
- To host: Summary-focused. Details available if needed
- To guest (issue reports): Empathetic, action-oriented

**Step-by-Step Flow (Checkout Cleaning):**
1. Booking checkout date arrives
2. WF5 triggers cleaning task creation
3. Assigns to designated cleaner for that property
4. Cleaner receives (Telegram): "Cleaning needed at [Property Name] 📅 Today by [time] 📍 [Address] 🔑 Access code: [code] Notes: [special instructions] Reply ✅ when done."
5. Cleaner completes, replies ✅
6. WF5 marks task complete, notifies host: "Cleaning done at [Property]. Ready for next guest."
7. If cleaner doesn't respond by deadline: Alert host: "Cleaning not confirmed at [Property]. Please follow up with [Cleaner Name]."

**Step-by-Step Flow (Guest Maintenance Issue):**
1. Guest says "The AC isn't working"
2. WF1 detects maintenance keywords, hands off to WF5
3. WF5 AI responds: "Oh no, sorry about that! I'm alerting the property owner right now. They'll sort this out as fast as possible. In the meantime, [immediate workaround if applicable]."
4. Host receives: "Guest issue at [Property]: AC not working. Guest: [Name], staying until [date]. Please respond."
5. Host can reply in chat or dashboard to coordinate
6. If host assigns to vendor: Vendor receives task similar to cleaner flow
7. Once resolved, WF5 prompts: "Just checking — did the AC issue get sorted? Let me know if you need anything else!"

**Success State:**
- Cleanings happen on time, every time
- Guest issues are acknowledged in under 1 minute
- Host has visibility without constant pings

**Failure State:**
- Cleaner doesn't respond: Escalate to host with "Cleaner unresponsive" flag
- Issue reported but host unavailable: "I've flagged this as urgent and the owner will be in touch very soon. If it's an emergency, let me know."

**Edge Cases:**
- Guest reports issue at 2 AM: Still acknowledge immediately, but add: "I've sent an urgent note — someone will reach out first thing in the morning unless this is an emergency."
- Cleaner marks done but guest complains it's not clean: Create new task, flag for host review
- Multiple issues same day: Bundle into single host notification with priority order

**Timing Expectations:**
- Guest issue acknowledgment: Under 30 seconds
- Host notification: Under 1 minute
- Cleaner notification (scheduled): 3 hours before expected cleaning time

---

### WF6 — Daily Automations

**Trigger:**
- 9 AM: Morning report
- 6 PM: Evening update
- 10 AM Monday: Weekly summary
- 2 AM nightly: Database maintenance
- Every 30 minutes: Follow-up check for silent conversations

**Expected UX:**
Host should look forward to these reports, not dread them. They should provide value, not noise. If there's nothing to report, say so briefly — don't pad with filler.

**Report Content:**

Morning Report (9 AM):
```
Good morning! Here's your day:

CHECK-INS TODAY
• [Guest Name] at [Property] — arrives [time]
  Status: [payment confirmed/pending]

CHECK-OUTS TODAY
• [Guest Name] at [Property] — leaves [time]
  Cleaning: [assigned to Cleaner Name]

PENDING TASKS
• [Description] at [Property] — [status]

ACTIVE CONVERSATIONS
• [X] guests in booking conversations
• [Y] need follow-up today

Have a great day!
```

Evening Report (6 PM):
```
Evening update:

TODAY'S BOOKINGS
• [X] new bookings confirmed ($[amount])
• [Y] inquiries received
• [Z] conversations still active

OPERATIONS
• Check-ins: [all completed / issues]
• Check-outs: [all completed / issues]
• Cleanings: [all done / pending]

TOMORROW PREVIEW
• [X] check-ins, [Y] check-outs

Anything you need me to follow up on?
```

Weekly Summary (Monday 10 AM):
```
Weekly Summary ([dates]):

REVENUE
• Total bookings: [X] ($[amount])
• Compared to last week: [up/down X%]

OCCUPANCY
• [Property 1]: [X]% occupied
• [Property 2]: [Y]% occupied

GUEST SATISFACTION
• [X] 5-star reviews received
• [Y] issues reported, [Z] resolved

TOP PERFORMING
• Best property: [Name] ([reason])

NEEDS ATTENTION
• [List any concerning items]

Full dashboard: [link]
```

**Nothing-to-Report Behavior:**
- Morning: "Clear day ahead — no check-ins or check-outs. All systems running smoothly."
- Evening: "Quiet day! No new bookings. All properties ready for tomorrow."
- Still send the report. Don't skip it. Consistency builds trust.

**Channel:**
- Default: Telegram
- If host prefers email: Send there instead (configurable in settings)
- If both: Send summary to Telegram, detailed report to email

**Timing Expectations:**
- Reports should arrive within 5 minutes of scheduled time
- If significantly delayed: Don't send stale data, skip and log error

---

### WF7 — Integration Hub

**Trigger:**
- External booking webhook received
- Host creates manual blocking task
- Scheduled sync check
- Review appears on external platform

**Expected UX:**
External bookings should feel native. The host shouldn't have to context-switch to Airbnb or VRBO to understand their business. Everything centralizes here.

**Step-by-Step Flow (External Booking Import):**
1. External booking created on Airbnb
2. iCal sync (WF3) or webhook detects new booking
3. WF7 creates local booking record with `source: "airbnb"`
4. Host receives: "New Airbnb booking imported: Guest: [Name] Property: [Property Name] Dates: [Dates] Note: This booking was made on Airbnb. Guest communication will happen there."
5. Calendar blocks dates locally
6. If dates conflict with local pending offer: Trigger WF2 conflict resolution

**Step-by-Step Flow (Review Monitoring):**
1. Daily 8 AM: Scan for new reviews
2. If positive (4-5 stars): "New 5-star review on Airbnb! [brief quote]. Auto-response sent."
3. If negative (1-3 stars): "New 2-star review on Airbnb needs attention: '[quote]'. Would you like to respond?"
4. Positive reviews: Auto-respond with owner-approved template
5. Negative reviews: Draft response, wait for owner approval

**Manual Sync:**
- Host should be able to trigger from dashboard
- Response: "Sync started... done! [X] new bookings imported, [Y] conflicts detected."

**Timing Expectations:**
- External booking reflection in local system: Within 4 hours (iCal) or immediate (webhook)
- Review detection: Within 24 hours
- Manual sync: Under 30 seconds

---

### WF8 — Safety & Screening

**Trigger:**
- Specific keywords in guest messages (emergency, fire, locked out, injury, police)
- Unusual booking patterns (same-day, abnormally long stay, multiple properties)
- Watchdog health check (every 15 minutes)
- Host flags a guest manually

**Safety Keywords:**
- High severity (immediate): emergency, fire, injury, hurt, bleeding, police, ambulance
- Medium severity (urgent): locked out, no hot water, broken, can't get in
- Low severity (monitor): complaint, problem, issue, doesn't work

**Step-by-Step Flow (Guest Emergency):**
1. Guest sends: "Help I'm locked out it's freezing"
2. WF1 detects emergency keywords, hands to WF8
3. WF8 classifies: Lockout — Medium severity
4. Guest receives (immediate): "I'm so sorry! Let me help. First, here's the door code again: [code]. If that doesn't work, I'm alerting the owner right now."
5. Host receives (immediate, all channels): "🚨 GUEST EMERGENCY: [Guest Name] locked out at [Property]. They've been sent the door code. Please confirm resolution."
6. WF8 pings host every 5 minutes until acknowledged
7. If no response in 15 minutes: Escalate to backup contact if configured

**Step-by-Step Flow (Guest Screening):**
1. New booking request received
2. WF8 evaluates: account age, previous reviews, booking patterns, message tone
3. Risk score: Low / Medium / High
4. Low: Proceed normally
5. Medium: Small note to host: "New booking from [Guest]. Account is new but conversation seems normal."
6. High: "⚠️ Flagged booking request: [Guest]. Reasons: [new account, unusual dates, suspicious messages]. Proceed with caution."

**Edge Cases:**
- Guest says "fire" but means slang: WF8 may flag initially. AI follows up: "Just to make sure — are you okay? Is this an emergency?" If no: "Great, glad you're enjoying it!"
- Multiple emergencies same time: Handle in parallel, all escalated

**Timing Expectations:**
- Emergency response to guest: Under 10 seconds
- Emergency alert to host: Under 30 seconds
- Escalation if no response: 15-minute intervals
- Screening evaluation: Completed before first AI response to guest

---

## PART 2 — Host Control Panel

---

### Dashboard

**Expected UX:**
Host should immediately see: Is everything okay? What needs my attention? What's happening today? The dashboard is NOT a data dump. It's an executive summary.

**Visual Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ERGOVIA DASHBOARD                        [Settings] [Logout]   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ SYSTEM STATUS   │  │ TODAY           │  │ THIS WEEK       │ │
│  │ ✅ All systems  │  │ 2 check-ins     │  │ $2,400 revenue  │ │
│  │    operational  │  │ 1 check-out     │  │ 85% occupancy   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  NEEDS ATTENTION (2)                                             │
│  ⚠️ Guest waiting for response — Sarah (Beach House) — 45m      │
│  ⚠️ Cleaning not confirmed — Mountain Cabin — Due 2:00 PM       │
│                                                                  │
│  SETUP CHECKLIST                                                 │
│  ✅ Property added                                               │
│  ✅ Telegram connected                                           │
│  ⬜ Add external calendar (Airbnb/VRBO)                          │
│  ⬜ Set up Google Business Profile                               │
│                                                                  │
│  RECENT ACTIVITY                                                 │
│  • New booking: John, Beach House, Mar 15-18, $450              │
│  • Payment received: John, Beach House, $450                    │
│  • New message: Sarah, "What time is check-in?"                 │
└─────────────────────────────────────────────────────────────────┘
```

**Most Important Information First:**
1. System status (green check or red alert)
2. Items needing attention (with age/urgency)
3. Today's snapshot
4. Setup tasks (for new hosts)

**System Status Indicators:**
- ✅ "All systems operational" — Everything working
- ⚠️ "1 issue needs attention" — Non-critical problem
- 🔴 "System issue detected" — Critical problem

**Notifications:**
- Bell icon in top right with red badge count
- Click to see list with timestamps
- Option to mark all as read

**One-Click Actions:**
- "View all bookings" → Calendar view
- "Check messages" → Conversation list
- "Add property" → Property form
- "Manual sync" → Trigger WF7

**Success State:**
Host spends less than 30 seconds on dashboard and knows exactly what needs their attention.

---

### Settings Panel

**Categories:**
- AI Behavior — Response speed, personality, emoji usage
- Credentials — Telegram bot token, WhatsApp API, payment gateway
- Notifications — What alerts to receive, where, when
- Team — Add cleaners, property managers, backup contacts

**Feedback After Saving:**
- Success: Green toast notification: "Settings saved!" (disappears after 3 seconds)
- Partial success: Yellow toast: "Settings saved, but Telegram connection couldn't be verified."
- Failure: Red toast: "Couldn't save settings. Please try again."

**Invalid API Key:**
- When entered: Immediate validation attempt
- If invalid: Red border around field, message: "This API key doesn't appear to be valid."
- Don't save invalid credentials

**Response Speed Changes:**
- "Natural" (2-6 second delay): Default, recommended
- "Instant" (under 1 second): For hosts who prefer speed
- Change takes effect: Immediately on save. No restart needed

**Confirmation for Critical Changes:**
- Changing payment gateway: "This will affect how guests pay. Are you sure?"
- Disconnecting Telegram: "Guests won't be able to message through Telegram. Are you sure?"

**Timing Expectations:**
- Save operation: Under 3 seconds
- Validation (API keys): Under 5 seconds
- Full sync to workflows: Under 10 seconds

---

### Properties Page

**Minimum Required Fields Before Active:**
- Property name
- Address
- Number of bedrooms
- Maximum guests
- Base nightly price

**Validation:**
- Check-in time: Must be valid time format
- Pricing: Must be positive number. Warn if below $10
- Max guests: Must be 1+. Warn if above 20
- Dates: If minimum stay > maximum stay, show error

**Missing Required Fields:**
- Prevent "Save as Active" button
- Allow "Save as Draft" — property exists but won't be bookable
- Show which fields are missing

**Preview Mode:**
- Button: "Preview AI Description"
- Shows what AI will say when asked about this property

**Deactivating Property:**
- Existing confirmed bookings: Honored, not cancelled
- Pending conversations: AI responds: "This property is temporarily unavailable. Can I help you find something else?"
- Property data: Preserved, can reactivate anytime

---

## PART 3 — M1 Affiliate Marketing System

---

### Affiliate Journey (Content → Lead → Closing → Payment)

**Daily Content Delivery:**
- Timing: 8 AM affiliate's timezone (configurable)
- Format: 3 posts (hook, story, value drop) with ✅ confirmation request

**Missed Posting:**
- Day 2: Gentle check-in
- Day 3: Encouragement
- Day 5+: Pause content, await "resume" reply

**Lead First Experience:**
- Lead clicks affiliate's link
- AI: "Hey! Thanks for reaching out. You're interested in automating your rental business? I can tell you more — are you an Airbnb host?"
- AI gathers: Name, number of properties, biggest pain point, time spent on guest messages

**Conversation Arc (Lead to Close):**

Stage 1 — Qualify: Confirm they're a property owner/manager, understand their situation

Stage 2 — Pain: "What takes up most of your time?" / "Roughly how many hours a week do you spend on guest messages?"

Stage 3 — Solution: Map features to their specific pain points

Stage 4 — Objection Handling:
- "I need to think about it" → "Totally understand. What specifically are you weighing?"
- "It's too expensive" → "What are you currently paying for a VA or spending in time?"
- "I already have a system" → "What's working well? What's still a pain point?"

Stage 5 — Close:
- "Ready to give it a try? I can send you a link to get started."
- If not: "No pressure — I'll check in tomorrow in case any questions come up."

**Lead Goes Silent (5 days):** Follow-up sequence → mark cold → archive after 30 days

**Commission Notification:**
```
🎉 Commission earned!
Your referral [First Name] just signed up!
Commission: $50
Status: Pending (paid on [date])
Total earned this month: $[amount]
```

**Timing Expectations:**
- Content delivery: Within 5 minutes of scheduled time
- Lead first response: Under 5 seconds
- Commission notification: Under 1 minute of payment confirmation

---

## PART 4 — Cross-System Behavior

**Guest messages at 3 AM:**
System operates identically at 3 AM as at 3 PM. Non-emergency host notifications queue until morning (if DND configured). Emergencies still break through.

**Host loses internet for 6 hours:**
AI continues handling all guest conversations autonomously. Bookings can be confirmed. What queues: non-urgent notifications, reports. What doesn't: guest responses, payment processing, emergency escalations.

**Guest books through Airbnb mid-conversation:**
Airbnb booking wins (payment already processed). AI to guest: "Good news — looks like you booked through Airbnb! You're all set." Close direct conversation gracefully.

**Host updates price mid-conversation:**
Quotes already given are honored at quoted price (price locked at time of quote). New conversations use new price.

**Multiple guests messaging simultaneously:**
Each conversation is isolated (sender_id). AI handles in parallel — no cross-contamination. Limit: up to 100 concurrent conversations.

**Guest switches Telegram to WhatsApp mid-conversation:**
Contexts are channel-specific. On new channel: "Hi! I see you might have messaged us before. What's your name and what dates are you looking at?"

**Potentially fraudulent guest detected:**
AI continues conversation normally (don't tip off). Host receives silent alert. Host options: Block / Proceed / Handle manually.

**Host deploys wrong workflow settings:**
- Settings changes have "undo" option for 24 hours
- Critical changes log to audit trail
- Manual rollback via Settings > History
- Changes to live workflows apply after 5-minute delay (cancellable)

---

## PART 5 — Technical Implementation Notes

---

### SUB: Universal Messenger — Telegram Markdown Fix

**Problem:**
The AI-generated text occasionally contains unescaped markdown characters (`*`, `_`, `` ` ``, `[`) that break Telegram's entity parser, causing the send to fail with:
> "Bad Request: can't parse entities: Can't find end of the entity starting at byte offset X"

**Fix: Add a Code node before the Telegram send node**

Node name: `Sanitize Message`
Position: Immediately before the `Send Telegram` node in SUB: Universal Messenger

**Code node JavaScript:**

```javascript
// Mode: Run Once for Each Item
const item = $input.item.json;

function stripMarkdown(text) {
  if (typeof text !== 'string') return String(text ?? '');
  return text
    .replace(/\*\*?(.*?)\*\*?/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`{1,3}([\s\S]*?)`{1,3}/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*_]{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

return {
  ...item,
  message: stripMarkdown(item.message ?? item.text ?? ''),
  parse_mode: ''
};
```

**Node chain:**
```
[upstream node]
      ↓
Sanitize Message   ← Code node (above)
      ↓
Send Telegram
```

**Telegram node changes:**
- **Text field:** `{{ $json.message }}`
- **Parse Mode:** Set to None (blank) — do not use Markdown or MarkdownV2

**Why this approach:**
Plain text send never fails. Markdown content (formatting symbols) is stripped but the message text is fully preserved. This is the only 100% reliable fix for AI-generated content that may contain arbitrary markdown.

---

## Summary

Every interaction — whether guest-facing, host-facing, or affiliate-facing — should feel:

- **Immediate** — Responses arrive faster than expected
- **Human** — Tone is natural, not robotic
- **Reliable** — System works at 3 AM, handles edge cases, never loses data
- **Transparent** — Users know what's happening and what to expect next
- **Forgiving** — Mistakes are recoverable, unusual inputs are handled gracefully

*Use this as the testing standard. Any deviation from these expectations is a bug or a design decision that needs explicit justification.*

---
*Client-side behavior definition prepared for ERGOVIA Testing Phase.*

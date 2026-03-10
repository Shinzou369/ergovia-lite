# ERGOVIA SYSTEM — CLIENT-SIDE BEHAVIOR DEFINITION REQUEST

## Context

We are the backend and infrastructure team behind the **ERGOVIA** system — an AI-powered automation platform for short-term rental hosts (AirBNB, VRBO, direct bookings).

We have completed the following:

- Full backend architecture (API, authentication, token management, integrations)
- n8n workflow engine (8 core workflows + affiliate marketing workflows)
- Frontend control panel (dashboard, settings, property management, M1 affiliate panel)
- Structural cleanup and production organization
- Deployment to live server

**We are now entering the Testing Phase.**

Your role in this phase is critical. You represent the **client-side perspective** — the host, the guest, and the affiliate user. You define what the experience *should* feel like. We will then interpret your definitions and adjust the backend accordingly.

---

## Your Assignment

For each workflow and interface described below, define the **complete expected behavior** from the client's point of view.

You are NOT being asked technical questions. You are being asked:

> *"If this were your system — how should it behave?"*

Be specific. Be opinionated. Be thorough.

---

## Coverage Instructions

For each workflow and UI component, provide a behavioral breakdown covering all of the following:

1. **Trigger Condition** — What action or event starts this? Who initiates it and how?
2. **Expected User Experience** — What should the user see, feel, or receive when this runs correctly?
3. **AI Response Behavior** — If an AI agent responds, how should it sound? What tone, length, and format?
4. **Multi-Step Interaction Logic** — If this is a conversation or process, walk through each step in order.
5. **Success Scenario** — What does a perfect, complete outcome look like?
6. **Failure Scenario** — What happens if something goes wrong? What should the user receive?
7. **Edge Cases** — What unusual but realistic situations could occur? How should each be handled?
8. **Repeated Actions** — What if the user triggers this twice? Books again? Sends the same message?
9. **Invalid Inputs** — What if the user enters wrong dates, incorrect info, or irrelevant messages?
10. **Timeout Expectations** — How long should the user wait before something feels broken?
11. **Duplicate Submission Behavior** — What if the same booking or request is submitted more than once?
12. **User Abandonment Handling** — What if the user goes silent mid-conversation or mid-flow?
13. **Visual / UI Expectations** — For any dashboard or frontend interaction, describe the ideal layout, feedback, and visual states.
14. **Response Timing Expectations** — Should responses feel instant? Delayed like a human? What is acceptable latency?

---

## System Components to Define

---

### PART 1 — Guest-Facing AI Workflows (via Telegram / WhatsApp)

---

#### WF1 — AI Gateway (First Touchpoint)

The guest sends their first message to the property's Telegram or WhatsApp number. The AI receives it and begins the conversation.

Define the following:

- How should the AI open the conversation?
- What is the 6-step conversation flow from first contact to confirmed booking interest?
  - **Step 1 — Welcome:** What tone, length, and opening message is ideal?
  - **Step 2 — Get the guest's name:** How naturally should this be asked?
  - **Step 3 — Get travel dates:** How should the AI handle vague dates, past dates, or "I'm flexible"?
  - **Step 4 — Show available options:** How should properties or availability be presented in chat?
  - **Step 5 — Reveal pricing:** How should price be introduced without feeling like a sales pitch?
  - **Step 6 — Follow-ups:** Define the timing and tone for follow-up messages at 1h, 5h, 24h, and 48h after last contact
- What should happen if the guest asks something completely off-topic?
- What if the guest is rude, aggressive, or testing the bot?
- What if the guest asks for a discount?
- What if the guest asks to speak to a human?
- What is the ideal response length per message?
- Should the AI use emojis? How many? In what context?

---

#### WF2 — Booking Agent (Dates & Availability)

After the guest expresses interest, they want to check specific availability and lock in dates.

Define the following:

- How should the AI confirm or reject a date request?
- What should the guest see when dates are available?
- What should the guest see when dates are NOT available?
- How should the AI suggest alternative dates?
- What if the guest wants to book a period longer than the maximum stay?
- What if the guest requests a same-day or next-day booking?
- What if two guests are competing for the same dates simultaneously?
- What is the confirmation message format? (Dates, price, property, next steps)
- Should there be a booking summary sent after confirmation?

---

#### WF3 — Calendar Manager

The calendar syncs across Airbnb, VRBO, and Booking.com. Guests and the host interact with availability in real time.

Define the following:

- What should a guest experience if they try to book already-blocked dates?
- If the calendar is not synced yet, how should the AI respond to availability questions?
- What should the host see in the dashboard when a new block or booking is added?
- How should double-bookings be handled if a sync fails?

---

#### WF4 — Payment Processor

After dates are confirmed, the guest needs to pay.

Define the following:

- How should the payment link be delivered? (In the same chat? Via a separate message?)
- What message should accompany the payment link?
- How long should the payment link remain valid?
- What happens if the guest opens the link but does not pay?
- What happens if payment fails?
- What should the guest receive immediately after successful payment?
- What should the host receive after a payment is completed?
- What if the guest claims they paid but the system shows no record?

---

#### WF5 — Property Operations (Cleaning, Maintenance, Vendors)

Manages cleaning schedules, maintenance requests, and vendor coordination.

Define the following:

- How should the host be notified of an upcoming cleaning task?
- What should the cleaner receive as their task notification?
- If a guest reports a maintenance issue mid-stay, how should it be handled?
- What if the cleaner marks the job done but the host is not satisfied?
- What is the expected notification format for the host? (Summary? Detailed list? Simple alert?)

---

#### WF6 — Daily Automations (Scheduled Reports)

Automated daily, evening, and weekly summary reports for the host.

Define the following:

- What should the morning report include?
- What should the evening report include?
- What should the weekly summary include?
- What format should these reports be in? (Bullet points? Paragraph? Tables?)
- What channel should these arrive on? (Telegram? Email? Both?)
- If there is nothing to report, should the host still receive a message?
- What if a report fails to generate? Should the host be notified?

---

#### WF7 — Integration Hub (iCal, External Platforms)

Syncs with external platforms and handles third-party data exchange.

Define the following:

- What should the host see when an external sync completes successfully?
- What should the host see when an external sync fails?
- How often should sync happen? Should the host be able to trigger it manually?
- What if an external platform blocks or rate-limits the sync?

---

#### WF8 — Safety & Screening (Emergency, Flagged Guests)

Handles emergency scenarios, flagged guest behavior, and safety alerts.

Define the following:

- What triggers a safety alert? (Specific keywords? Unusual booking patterns?)
- What should the host receive when a guest is flagged?
- What is the expected response time for a safety alert?
- What if a guest sends an emergency message (fire, injury, locked out)?
- How should the AI respond to a guest emergency while waiting for the host?
- What if the safety trigger was a false positive?

---

### PART 2 — Host Control Panel (Frontend Dashboard)

---

#### Dashboard

The host logs into the control panel and sees their overview.

Define the following:

- What is the most important piece of information the host should see first?
- What should the setup task checklist look like and how should it guide new hosts?
- What does "system healthy" look like vs "system has a problem"?
- How should notifications appear? (Bell icon? Inline? Toast popups?)
- What actions should be one-click accessible from the dashboard?

---

#### Settings Panel

The host configures their AI assistant, credentials, property data, and response behavior.

Define the following:

- What feedback should the host receive after saving settings?
- What should happen if they enter an invalid API key?
- If the host changes the response speed from "Natural" to "Instant", when should this take effect?
- Should settings changes require a confirmation step before applying to live workflows?
- What if the sync to the AI workflow fails? What should the host see?

---

#### Properties Page

The host adds and manages their property listings.

Define the following:

- What is the minimum information required before a property can go "active"?
- What validation should exist for fields like check-in time, pricing, and max guests?
- If a property is saved with missing required fields, what happens?
- Should the host be able to preview what the AI will say about their property before going live?
- What happens to active bookings if the host deactivates a property?

---

### PART 3 — M1 Affiliate Marketing System

---

#### Affiliate Journey (Content → Lead → Closing → Payment)

An affiliate promotes the property owner's service and earns commission when their leads convert.

Define the following:

- What should an affiliate receive daily? (Content posts? At what time? In what format?)
- How should the affiliate confirm they posted the content?
- If an affiliate misses posting for 2 days, what happens?
- When a lead comes in via an affiliate's link, what is the lead's first experience?
- How should the AI sales conversation open with a referred lead?
- Define the full conversation arc from first contact to payment link
- What should the affiliate receive when their lead converts? (Notification? Commission summary?)
- What happens if a lead goes silent for 5 days?
- What if the lead says "I'm not interested"?
- What does a successful closing look like from both the lead's and the affiliate's perspective?

---

### PART 4 — Cross-System Behavior

Define expected behavior for scenarios that span multiple components:

- **New guest sends first message at 3am** — How should the system behave? Should response timing change at night?
- **Host loses internet connection for 6 hours** — What should the guest experience during that time?
- **Guest books through Airbnb while the AI is mid-conversation** — How should the conflict resolve?
- **Host updates property price while a guest is actively in a booking conversation** — Does the quoted price change?
- **Multiple guests messaging simultaneously** — Does the AI handle them in parallel? Are there limits?
- **Guest switches from Telegram to WhatsApp mid-conversation** — Is their context preserved?
- **System detects a potentially fraudulent guest** — What happens to their active conversation?
- **Host accidentally deploys wrong workflow settings** — What rollback or recovery should exist?

---

## Response Format

For each component or workflow, structure your response like this:

```
## [Component Name]

**Trigger:**
[Your answer]

**Expected UX:**
[Your answer]

**AI Tone & Behavior:**
[Your answer]

**Step-by-Step Flow:**
- Step 1: ...
- Step 2: ...
- Step 3: ...

**Success State:**
[Your answer]

**Failure State:**
[Your answer]

**Edge Cases:**
- ...
- ...

**Timing Expectations:**
[Your answer]

**Additional Notes:**
[Your answer]
```

Be as specific as possible. Use concrete examples where helpful. If you have strong opinions about how something should work, state them clearly — we will use your definitions as the official testing standard for the ERGOVIA production system.

---

*This prompt was prepared by the ERGOVIA backend team. Your responses will be used to define the official client-side testing criteria for the ERGOVIA production system.*

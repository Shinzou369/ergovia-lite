Claude’s Plan
Full Settings Redesign - All Workflow-Controllable Variables
Context
The Settings page (ergovia-ai.com/v2/settings.html) is the owner's ONLY way to control the AI assistant and n8n workflows without opening the n8n editor. Currently it's missing critical controls: auto-reply toggle, cancellation policy, booking defaults, emergency contacts, budget thresholds, and notification preferences. The Properties page already handles per-property settings well (40+ fields), but property saves don't trigger n8n sync. This redesign makes Settings the comprehensive control panel it should be.

Architecture Principle
Settings page = Global/business-level controls (affect ALL properties & workflows)
Properties page = Per-property controls (already comprehensive, just needs sync)
Both sync to n8n when connected
New Settings Page Structure (8 sections)
Section 1: Owner Profile (KEEP - works)
Fields: ownerName, ownerEmail, ownerPhone, preferredPlatform, telegramChatId, whatsappNumber
Sync: workflows category → updates owner placeholders in all WFs

Section 2: API Credentials (KEEP - works)
Fields: telegramBotToken, whatsappApiKey, twilioAccountSid, twilioAuthToken, twilioPhoneNumber
Sync: credentials category → replaces n8n credentials

Section 3: AI Assistant (ENHANCED - merge old sections 4+5+7)
Current: aiNotes, pricingRules, systemPromptEditor, language
ADD:

autoReplyEnabled (toggle) — pauses/resumes AI responses in WF1
aiTemperature (slider 0.0-1.0, default 0.7) — controls AI creativity
aiModel (select: gpt-4o-mini, gpt-4o) — model selection
Move language here from Preferences (it's an AI behavior setting)
Keep: aiNotes, pricingRules, systemPromptEditor
SQLite section: ai (enhanced with new fields)
Sync: system-prompt → patches WF1 AI Agent node (systemMessage + temperature + model)

Section 4: Booking & Payment Defaults (NEW)
Fields:

defaultCurrency (select: USD/EUR/PHP/GBP/JPY/AUD/MXN) — moved from Preferences
cancellationPolicy (textarea) — text the AI communicates to guests
competingOfferTimeout (number, hours, default 2) — time owner has to decide between offers
offerHoldDuration (number, hours, default 24) — how long to hold an offer
minBookingLeadTime (number, hours, default 0) — reject same-day bookings
defaultPaymentMethod (select: gcash/paypal/stripe/bank_transfer/cash) — moved from Preferences
requirePaymentConfirmation (toggle, default true) — owner must confirm payment before booking confirms
defaultCheckInTime (time input, default 15:00) — global default for new properties
defaultCheckOutTime (time input, default 11:00) — global default for new properties
SQLite section: booking (NEW)
Sync: workflows → injects into WF2 (cancellation policy in prompt), WF4 (payment settings)

Section 5: Notifications & Safety (NEW)
Fields:

emergencyContact1Name + emergencyContact1Phone — first escalation
emergencyContact2Name + emergencyContact2Phone — backup escalation
notifyOnNewBooking (toggle, default true)
notifyOnCheckIn (toggle, default true)
notifyOnCompetingOffer (toggle, default true)
notifyDailyReport (toggle, default true)
guestScreeningDefault (select: auto_approve / flag_for_review / always_screen)
watchdogEnabled (toggle, default true) — WF8 15-min monitoring
SQLite section: notifications (NEW)
Sync: workflows → injects into WF8 (emergency contacts, screening), SUB Notifier (notification toggles)

Section 6: Budget & Usage (NEW)
Fields:

monthlyBudget (number, USD, default 50) — was hidden, now visible
budgetAlert50 (toggle, default true) — alert at 50%
budgetAlert80 (toggle, default true) — alert at 80%
budgetAlertLimit (toggle, default true) — pause AI at 100%
fallbackMessage (textarea) — message when budget exhausted (default provided)
SQLite section: budget (enhanced)
Sync: workflows → injects into WF1 (budget thresholds, fallback message)

Section 7: Team & Contacts (KEEP - fix)
Fields: Dynamic team member list (name, role, phone, email)
Sync: workflows → injects vendor/cleaner contacts into WF5

Section 8: Media & Documentation (KEEP - works)
Fields: propertyPhotosLink, propertyVideosLink, documentationLink
Sync: none (stored locally, not used by workflows yet)

Removed/Merged
Old Section 7 "Preferences": REMOVED as standalone section
language → moved to Section 3 (AI Assistant)
currency → moved to Section 4 (Booking Defaults)
paymentMethod → moved to Section 4 (Booking Defaults)
timezone → moved to Section 4 (Booking Defaults) as globalTimezone
Old Section 5 "AI System Prompt": MERGED into Section 3 (AI Assistant)
Files to Modify
1. ergovia-lite/public/v2/settings.html
Rewrite form sections 3-8
Remove old Preferences section
Add toggle switches, sliders, new inputs
Keep n8n connection card (top) and Activation section (bottom)
2. ergovia-lite/public/v2/assets/js/fillup-form.js
Add getSectionData() cases for new sections: booking, notifications, budget
Update populateForm() to fill new fields
Update checkSectionsCompletion() for new required fields
Remove standalone preferences section handling, redistribute to other sections
3. ergovia-lite/public/v2/assets/js/sync.js
Update syncSystemPrompt() to include autoReplyEnabled, aiTemperature, aiModel
Add syncBookingDefaults() — pushes cancellation policy, currency, timeouts to WF2/WF4
Add syncNotifications() — pushes emergency contacts, screening to WF8
Add syncBudget() — pushes budget thresholds to WF1
Update syncAll() to handle new categories
4. ergovia-lite/server.js
Update POST /api/v2/settings syncSections map:

const syncSections = {
  credentials: 'credentials',
  ai: 'system-prompt',
  owner: 'workflows',
  booking: 'booking-defaults',    // NEW
  notifications: 'notifications', // NEW
  budget: 'budget',               // NEW
  team: 'workflows',              // FIX (was null)
};
Add new sync endpoints or expand existing ones:
POST /api/v2/sync/booking-defaults — patch WF2 cancellation policy, WF4 payment config
POST /api/v2/sync/notifications — patch WF8 emergency contacts, screening defaults
POST /api/v2/sync/budget — patch WF1 budget thresholds
5. ergovia-lite/services/v2-data.js
Update saveSettings() to accept new sections: booking, notifications, budget
Update getSettings() to return new sections
6. ergovia-lite/services/n8n.js
Add patchBookingDefaults(wf2Id, wf4Id, settings) — patches cancellation policy into WF2 system prompt, payment config into WF4
Add patchNotificationSettings(wf8Id, subNotifierId, settings) — patches emergency contacts, screening defaults
Add patchBudgetSettings(wf1Id, settings) — patches budget thresholds and fallback message
Extend patchWorkflowNodes() to support patching AI Agent temperature and model
7. ergovia-lite/public/v2/assets/css/main.css
Add styles for toggle switches, sliders, new form components
Ensure dark mode support for all new elements
Property Save → n8n Sync (Bonus Fix)
8. ergovia-lite/server.js — POST /api/v2/properties
After saving property to PostgreSQL, trigger workflow variable sync if n8n is connected
This ensures check-in/out times, house rules, pricing, amenities etc. are live in workflows
Implementation Order
Backend first: Add new save/get sections in v2-data.js and server.js
New sync endpoints in server.js + n8n.js
Frontend HTML: New form sections
Frontend JS: fillup-form.js + sync.js updates
CSS: Toggle switches, dark mode
Property sync trigger
Test end-to-end
Verification
Save each new section → verify stored in SQLite (v2_settings table)
Connect to n8n → save AI settings → verify WF1 systemMessage updated
Save booking defaults → verify WF2/WF4 patched
Save notification settings → verify WF8 patched
Toggle auto-reply OFF → verify WF1 deactivated or prompt changed
Save a property → verify n8n workflows reflect new values
Run smoke test: TEST_USER='Admin Gab' TEST_PASS='Kikoy$123' node test-smoke.js https://ergovia-ai.com
Dark mode: all new sections readable
User approved the plan
Plan approved. Let me start implementing the full settings redesign.

Update Todos

Backend: Add new settings sections to v2-data.js

Backend: Update server.js sync map + new sync endpoints

Backend: Add n8n.js patch functions for new settings

Frontend: Rewrite settings.html with 8 sections

Frontend: Update fillup-form.js for new sections

Frontend: Update sync.js for new sync categories

CSS: Toggle switches, sliders, dark mode

Property save sync trigger in server.js

Test end-to-end on live server
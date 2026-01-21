# Property Management / AirBNB Workflow Analysis Report

## Overview
This document analyzes 24 workflows designed for Property Management and AirBNB operations. Each workflow is categorized by trigger type, listed with required variables, and reviewed for potential issues.

---

# PART 1: WORKFLOW CATEGORIZATION BY TRIGGER TYPE

## Category A: WEBHOOK/API TRIGGERED (Response-Based)
These workflows are activated when external systems or other workflows send HTTP requests.

| # | Workflow Name | Recommended Name | Trigger Description |
|---|---------------|------------------|---------------------|
| 0 | Message Router | **Multi-Channel Message Router Hub** | Telegram/WhatsApp/SMS message triggers |
| 2 | Conflict Priority Manager | **Booking Conflict Resolution Manager** | Webhook from Workflow 5/6 when date overlap detected |
| 3 | Real-Time Availability Checker | **Property Availability Query Service** | Webhook + Telegram/WhatsApp triggers |
| 5 | Intelligent Inquiry Handler | **New Guest Inquiry Processor** | SMS/WhatsApp/Telegram/Google Forms webhook |
| 6 | AI Conversation Manager | **AI Sales Negotiation Bot** | Webhook from Workflow 0 with deal context |
| 7 | Payment Confirmation Handler | **Stripe Payment Processor** | Webhook from Workflow 6 + Stripe webhook events |
| 8 | Guest Journey Scheduler | **Post-Booking Message Scheduler** | Webhook from Workflow 7 after payment confirmed |
| 10 | Cleaning Completion Report Handler | **Cleaner Task Completion Processor** | Google Forms webhook submission |
| 13 | Maintenance Ticket Management | **Multi-Channel Maintenance Ticket Creator** | Google Forms/Webhook/SMS/WhatsApp/Telegram |
| 16 | Review Monitoring & Response | **Guest Review AI Response Generator** | Webhook from platform + Form trigger |
| 17 | Guest Screening System | **Guest Risk Assessment & Blacklist Checker** | Form trigger (Direct Booking Request) |
| 21 | Property Status Update | **Property Status Manager** | HTTP webhook calls |
| 22 | Active Booking Handler | **Active Guest AI Concierge** | Webhook from Workflow 0 for in-stay guests |
| 23 | Advanced Automation | **Guest Incident Tracker & Blacklist Manager** | Webhook with incident report |

---

## Category B: TIME-BASED / SCHEDULED (Cron Triggers)
These workflows run automatically at scheduled intervals.

| # | Workflow Name | Recommended Name | Schedule |
|---|---------------|------------------|----------|
| 9 | Scheduled Message Sender | **Guest Message Delivery Service** | Every 30 minutes (`*/30 * * * *`) |
| 11 | Daily Morning Check | **Daily Calendar Sync & Conflict Detector** | Daily at 9:00 AM |
| 12 | Nightly Automation | **AI Dynamic Pricing Recommender** | Daily at 2:00 AM |
| 14 | Cleaning Scheduler | **Automated Turnover Cleaning Scheduler** | Triggered by Workflow 7 + schedule |
| 15 | Inventory Tracker | **Weekly Supplies Inventory & Reorder System** | Weekly schedule + event triggers |

---

## Category C: EVENT/TRIGGER-BASED (Internal System Events)
These workflows respond to database changes or internal system events.

| # | Workflow Name | Recommended Name | Event Type |
|---|---------------|------------------|------------|
| 1 | Control Panel Hub | **Owner Command Dashboard** | Telegram/WhatsApp commands starting with "/" |
| 4 | Manual Task Manager | **Owner Task Queue Manager** | HTTP requests from other workflows |

---

# PART 2: DETAILED VARIABLE REQUIREMENTS BY WORKFLOW

## Workflow 0: Multi-Channel Message Router Hub

### Required Variables:
```
CONFIGURATION:
- Telegram Bot Token
- WhatsApp Business API credentials
- Twilio Account SID & Auth Token
- PostgreSQL connection string

WEBHOOK ENDPOINTS (must be configured):
- /webhook/control-panel-hub (routes to Workflow 1)
- /webhook/guest-conversation (routes to Workflow 6/22)
- /webhook/booking-inquiry-form (routes to Workflow 5)

DATABASE TABLES REQUIRED:
- bookings (guest_phone, booking_status, check_in_date, check_out_date)
- deals (client_phone, status)
- message_router_log
```

---

## Workflow 1: Owner Command Dashboard

### Required Variables:
```
CONFIGURATION:
- Telegram Bot Token
- WhatsApp Business API credentials

DATABASE TABLES REQUIRED:
- customer_tasks (status, priority)
- deals (status)
- bookings (check_out_date, total_price, guest_name, property_name)

SUPPORTED COMMANDS:
- /dashboard
- /deals
- /tasks
- /bookings
- /help
- /status
```

---

## Workflow 2: Booking Conflict Resolution Manager

### Required Variables:
```
INPUT PAYLOAD:
- property_id (string)
- conflicting_deal_ids (array)
- date_range (object with start/end)

CONFIGURATION:
- Google Sheets credentials (for conflict logging)
- Telegram/WhatsApp API credentials
- owner preferred_platform from property config

DATABASE TABLES REQUIRED:
- deals (all fields)
- properties (base_price, minimum_price, preferred_booking_length, owner preferences)

WEBHOOK ENDPOINTS:
- /webhook/payment-confirmation (triggers Workflow 7)
```

---

## Workflow 3: Property Availability Query Service

### Required Variables:
```
INPUT PAYLOAD:
- property_id (string)
- check_in_date (ISO date string)
- check_out_date (ISO date string)

DATABASE TABLES REQUIRED:
- bookings (property_id, booking_status, check_in_date, check_out_date)
- deals (property_id, status, proposed_check_in, proposed_check_out)
- calendar_blocks (property_id, start_date, end_date, block_reason)
```

---

## Workflow 5: New Guest Inquiry Processor

### Required Variables:
```
INPUT PAYLOAD (varies by source):
- From Twilio: From (phone), Body (message)
- From Telegram: message.from.phone_number, message.chat.id, message.text
- From Google Forms: phone_number, email, name, check_in, check_out, message

CONFIGURATION:
- OpenAI API Key
- Google Sheets credentials
- Telegram/WhatsApp/Twilio credentials

WEBHOOK ENDPOINTS:
- /webhook/availability-check (calls Workflow 3)

DATABASE TABLES REQUIRED:
- properties (property details, owner preferences)
```

---

## Workflow 6: AI Sales Negotiation Bot

### Required Variables:
```
INPUT PAYLOAD:
- deal_id (string)
- latest_client_message (string)
- channel_type (telegram/whatsapp/sms)

CONFIGURATION:
- OpenAI API Key (for AI responses)

DATABASE TABLES REQUIRED:
- deals (all fields including conversation_history)
- properties (for pricing rules)

WEBHOOK ENDPOINTS:
- /webhook/availability-check (Workflow 3)
- /webhook/manual-task (Workflow 4)
- /webhook/payment-confirmation (Workflow 7)

AI FUNCTIONS AVAILABLE:
- request_payment
- create_task
- check_availability
- apply_discount

PROPERTY CONFIGURATION NEEDED:
- max_discount (percentage)
- base_price
- minimum_price
```

---

## Workflow 7: Stripe Payment Processor

### Required Variables:
```
INPUT PAYLOAD:
- deal_id (string)
- client_phone (string)
- channel_type (string)

CONFIGURATION:
- Stripe API Key
- Stripe Webhook Secret (for signature validation)
- Payment page URL template

DATABASE TABLES REQUIRED:
- deals
- payments
- bookings
- properties (door_code, wifi_password, parking_instructions)

WEBHOOK ENDPOINTS:
- /webhook/guest-journey-scheduler (Workflow 8)
- /webhook/cleaning-scheduler (Workflow 14)
- /webhook/owner-notification (Workflow 1)
```

---

## Workflow 8: Post-Booking Message Scheduler

### Required Variables:
```
INPUT PAYLOAD:
- booking_id (string)
- property_id (string)
- check_in (ISO date)
- check_out (ISO date)

DATABASE TABLES REQUIRED:
- bookings (guest details, contact platform)
- properties (name, address, door_code, wifi, parking, house_rules, local_recommendations)
- scheduled_messages (for storing future messages)
- guest_journey_log

MESSAGE SCHEDULE CONFIGURATION:
- Pre-arrival: 48 hours before check-in at 10 AM
- Check-in day: 2 PM
- Mid-stay: Day after check-in at 11 AM
- Check-out day: 8 AM
- Post-stay review: Day after check-out at 6 PM
```

---

## Workflow 9: Guest Message Delivery Service

### Required Variables:
```
CRON SCHEDULE: */30 * * * * (every 30 minutes)

DATABASE TABLES REQUIRED:
- scheduled_messages (message_id, scheduled_datetime, status, channel_type, message_template)
- guest_journey_log

CONFIGURATION:
- Telegram Bot Token
- WhatsApp API credentials
- Twilio credentials

MAX BATCH SIZE: 50 messages per run
```

---

## Workflow 10: Cleaner Task Completion Processor

### Required Variables:
```
INPUT PAYLOAD (Google Forms):
- task_id (string)
- cleaner_name (string)
- completion_photos (array of URLs)
- Checklist items (7 boolean fields)
- time_spent (number)
- issues_found (string)
- notes (string)

CONFIGURATION:
- OpenAI API Key (for follow-up question generation)
- Property status webhook URL

DATABASE TABLES REQUIRED:
- cleaning_tasks
- property_configurations
- cleaners (cleaner_name, preferred_contact_method, contact details)

WEBHOOK ENDPOINTS:
- Property status update webhook (Workflow 21)
```

---

## Workflow 11: Daily Calendar Sync & Conflict Detector

### Required Variables:
```
CRON SCHEDULE: Daily at 9:00 AM

DATABASE TABLES REQUIRED:
- property_configurations (property_status, calendar_sync_enabled, calendar_sync_contact)
- bookings (property_id, booking_status, check_in_date, check_out_date, external_platform)
- calendar_sync_log

DATE RANGE: Today to 90 days in future

CONFIGURATION:
- Telegram Bot Token
- WhatsApp API credentials
```

---

## Workflow 12: AI Dynamic Pricing Recommender

### Required Variables:
```
CRON SCHEDULE: Daily at 2:00 AM

CONFIGURATION:
- eventbriteApiToken (for local events)
- openWeatherMapApiKey (for weather forecast)
- openAiApiKey (for pricing recommendations)

DATABASE TABLES REQUIRED:
- property_configurations (location, base_price, min_price, max_price)
- pricing_history (last 90 days)
- pricing_recommendations

FILTER THRESHOLD: Only show recommendations with >= 15% price change

OUTPUT:
- Top 5 recommendations per contact
- Estimated additional revenue calculation
```

---

## Workflow 13: Multi-Channel Maintenance Ticket Creator

### Required Variables:
```
INPUT SOURCES:
- Google Forms webhook
- Maintenance Data webhook (JSON)
- Twilio SMS (message containing "maintenance")
- WhatsApp (message containing "maintenance")
- Telegram (message containing "maintenance")

CONFIGURATION:
- OpenAI API Key (for issue analysis)
- Telegram/WhatsApp/Twilio credentials

DATABASE TABLES REQUIRED:
- maintenance_tickets
- property_configurations
- vendors (category, status, current_jobs, max_concurrent_jobs, average_rating)

AI ANALYSIS OUTPUT:
- category (plumbing/electrical/appliance/hvac/structural/cosmetic/pest/outdoor/security)
- urgency (emergency/high/medium/low)
- vendor_type
- guest_impact (yes/no)
```

---

## Workflow 14: Automated Turnover Cleaning Scheduler

### Required Variables:
```
INPUT PAYLOAD:
- property_id (string)
- booking_id (string)
- check_out_date (ISO date)
- next_check_in (ISO date, optional)

DATABASE TABLES REQUIRED:
- cleaning_tasks
- cleaners (status, current_workload, max_jobs_per_day)
- property_configurations
```

---

## Workflow 15: Weekly Supplies Inventory & Reorder System

### Required Variables:
```
DATABASE TABLES REQUIRED:
- inventory (item_name, current_qty, min_qty, reorder_qty, status)
- property_configurations
- suppliers (supplier_name, contact_method, status)
- purchase_orders

CONFIGURATION:
- Email SMTP for supplier orders
- WhatsApp API for supplier notifications
- Manager contact info from property config

STATUS VALUES:
- in_stock
- low_stock
- out_of_stock
```

---

## Workflow 16: Guest Review AI Response Generator

### Required Variables:
```
INPUT PAYLOAD:
- platform_name (Airbnb/Vrbo/Booking.com)
- guest_name (string)
- property_name (string)
- star_rating (1-5)
- review_text (string)

CONFIGURATION:
- OpenAI API Key

DATABASE TABLES REQUIRED:
- reviews
- property_configurations

AI ANALYSIS OUTPUT:
- sentiment (positive/mixed/negative)
- topics (array)
- response_text (under 150 words)
- confidence (0-100)

APPROVAL REQUIRED IF:
- confidence < 85
- star_rating < 4
- sentiment === 'negative'
```

---

## Workflow 17: Guest Risk Assessment & Blacklist Checker

### Required Variables:
```
INPUT PAYLOAD:
- guest_name (string)
- guest_phone (string)
- guest_email (string)
- property_id (string)
- check_in_date (ISO date)
- check_out_date (ISO date)
- number_of_guests (integer)

CONFIGURATION:
- OpenAI API Key (for party risk analysis)

DATABASE TABLES REQUIRED:
- guest_blacklist (guest_phone, guest_email, status, expires_at, reason)
- property_configurations (max_guests, screening rules)
- guest_screening_log

RISK FACTORS CALCULATED:
- Same-day booking (+20 points)
- 1-night stay (+15 points)
- Weekend-only (+10 points)
- Near max capacity (+15 points)
- Uncommon email domain (+10 points)

RISK LEVELS:
- low: < 30 score
- medium: 30-49 score
- high: 50-69 score
- very_high: >= 70 score
```

---

## Workflow 22: Active Guest AI Concierge

### Required Variables:
```
INPUT PAYLOAD:
- booking_id (string)
- guest_message (string)
- channel_type (telegram/whatsapp/sms)

CONFIGURATION:
- OpenAI API Key

DATABASE TABLES REQUIRED:
- bookings (all fields including conversation_history)
- property_configurations (door_code, wifi, parking, house_rules)
- cleaners (for mid-stay cleaning requests)

AI CONTROL SIGNALS:
- CREATE_MAINTENANCE → Triggers Workflow 13
- REQUEST_SUPPLIES → Wait for manager approval
- CHECK_EXTENSION → Calls Workflow 3
- LATE_CHECKOUT → Wait for owner approval
- EARLY_CHECKOUT → Notify owner
- MID_STAY_CLEANING → Find best cleaner, wait approval
- ESCALATE_TO_CONTACT → Forward to owner
- NONE → Direct response

WEBHOOK ENDPOINTS:
- Maintenance Ticket Creator webhook (Workflow 13)
- Availability Checker webhook (Workflow 3)
```

---

## Workflow 23: Guest Incident Tracker & Blacklist Manager

### Required Variables:
```
INPUT PAYLOAD:
- booking_id (string)
- property_id (string)
- incident_type (string)
- severity (low/medium/high/critical)
- description (string)
- reported_by (string)

DATABASE TABLES REQUIRED:
- incidents
- bookings (for guest info lookup)
- property_configurations (incident_response_contact, incident_response_platform)

INCIDENT TYPES:
- Noise complaints
- Property damage
- Unauthorized guests
- Smoking violations
- Pet violations
- Late checkout without approval
- House rule violations
- Neighbor complaints
- Safety concerns

REPEAT OFFENDER THRESHOLD: 2+ incidents
AUTO-BLACKLIST RECOMMENDATION: 3+ high-severity incidents
```

---

# PART 3: POTENTIAL ISSUES & TECHNICAL REVIEW

## Critical Issues Found:

### 1. Workflow 0 (Message Router) - ROUTING AMBIGUITY
**Issue:** Step 9A and 9B both POST to `/webhook/guest-conversation` but for different purposes (active booking vs active deal).
**Impact:** Could cause wrong handler to process message.
**Recommendation:** Use distinct endpoints: `/webhook/active-booking-handler` and `/webhook/deal-conversation`

### 2. Workflow 6 (AI Conversation) - DISCOUNT VALIDATION GAP
**Issue:** The discount validation in Step 10C checks if `requested_discount > max_allowed` but doesn't verify if the discount was already applied to this deal.
**Impact:** Could allow stacking multiple discounts.
**Recommendation:** Add check: `IF deal.discount_percentage > 0 THEN reject additional discount`

### 3. Workflow 7 (Payment) - RACE CONDITION RISK
**Issue:** Between payment link generation (Step 4) and Stripe webhook receipt (Step 9), the deal status could be modified by other workflows.
**Impact:** Could process payment for cancelled deal.
**Recommendation:** Add status check in Stripe webhook handler before processing payment.

### 4. Workflow 11 (Daily Check) - INCOMPLETE CONFLICT HANDLING
**Issue:** Conflicts are detected and logged, but there's no automatic escalation if owner doesn't respond within timeout.
**Impact:** Conflicts could remain unresolved.
**Recommendation:** Add follow-up reminder at 24h timeout, then auto-assign to Workflow 2.

### 5. Workflow 12 (Pricing) - API DEPENDENCY FRAGILITY
**Issue:** Weather and Events APIs are critical path - if either fails, entire pricing recommendation fails.
**Impact:** No pricing recommendations generated on API failure days.
**Recommendation:** Add fallback: use last-known-good data or skip that factor.

### 6. Workflow 17 (Guest Screening) - BLACKLIST BYPASS
**Issue:** Blacklist check uses phone OR email, but guest could use different contact info.
**Impact:** Blacklisted guests could book using alternate email/phone.
**Recommendation:** Add name fuzzy matching and IP tracking for better identification.

## Moderate Issues:

### 7. Workflow 2 (Conflict) - TIMEOUT AUTO-SELECTION
**Issue:** 24-hour timeout auto-selects highest priority deal without explicit owner consent.
**Impact:** Owner might not want any booking approved.
**Recommendation:** Change to: after timeout, escalate to emergency contact rather than auto-approve.

### 8. Workflow 8 (Journey) - TIMEZONE HANDLING
**Issue:** Message scheduling uses hardcoded times (10 AM, 2 PM, etc.) without timezone consideration.
**Impact:** Messages sent at wrong local time for different property locations.
**Recommendation:** Store property timezone in config, adjust schedule calculations.

### 9. Workflow 9 (Message Sender) - NO DEDUPLICATION
**Issue:** If workflow fails mid-execution and reruns, some messages might be sent twice.
**Impact:** Guests receive duplicate messages.
**Recommendation:** Add `last_attempt_at` field and skip if attempted within last 30 minutes.

### 10. Workflow 13 (Maintenance) - VENDOR ASSIGNMENT GAP
**Issue:** If no vendors are available (all at max capacity), workflow continues with null vendor.
**Impact:** Ticket created but no vendor assigned, could be missed.
**Recommendation:** Add fallback: create urgent owner task when no vendors available.

### 11. Workflow 22 (Active Booking) - CONTEXT WINDOW LIMITS
**Issue:** Full conversation history is sent to OpenAI without truncation.
**Impact:** Long stays with many messages could exceed token limits, causing API errors.
**Recommendation:** Implement sliding window (last 20 messages) + summary of earlier context.

## Minor Issues:

### 12. All Workflows - MISSING IDEMPOTENCY
**Issue:** Most webhooks lack idempotency keys.
**Recommendation:** Add `x-idempotency-key` header handling to prevent duplicate processing.

### 13. Workflow 16 (Reviews) - PLATFORM API INTEGRATION
**Issue:** Workflow guides owner to manually post responses rather than using platform APIs.
**Recommendation:** For Airbnb Business API users, consider direct posting integration.

---

# PART 4: DATABASE SCHEMA REQUIREMENTS

## Required Tables Summary:

| Table Name | Primary Key | Used By Workflows |
|------------|-------------|-------------------|
| bookings | booking_id | 0, 1, 6, 7, 8, 11, 22, 23 |
| deals | deal_id | 0, 1, 2, 5, 6, 7 |
| properties / property_configurations | property_id | 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 22, 23 |
| scheduled_messages | message_id | 8, 9 |
| message_router_log | id | 0 |
| customer_tasks | id | 1, 4 |
| payments | payment_id | 7 |
| cleaning_tasks | task_id | 10, 14 |
| cleaners | cleaner_id | 10, 14, 22 |
| calendar_blocks | block_id | 3 |
| calendar_sync_log | sync_id | 11 |
| pricing_history | id | 12 |
| pricing_recommendations | recommendation_id | 12 |
| maintenance_tickets | ticket_id | 13 |
| vendors | vendor_id | 13 |
| inventory | item_id | 15 |
| suppliers | supplier_id | 15 |
| purchase_orders | order_id | 15 |
| reviews | review_id | 16 |
| guest_blacklist | id | 17 |
| guest_screening_log | screening_id | 17 |
| incidents | incident_id | 23 |
| guest_journey_log | id | 8, 9 |
| conversation_log | id | 6 |

---

# PART 5: WORKFLOW DEPENDENCY MAP

```
EXTERNAL TRIGGERS
    │
    ├── Telegram/WhatsApp/SMS Messages
    │   └── Workflow 0 (Message Router)
    │       ├── "/" commands → Workflow 1 (Control Panel)
    │       ├── Active Booking → Workflow 22 (Active Guest Handler)
    │       ├── Active Deal → Workflow 6 (AI Conversation)
    │       └── New Inquiry → Workflow 5 (Inquiry Handler)
    │
    ├── Google Forms
    │   ├── Direct Booking → Workflow 17 (Guest Screening)
    │   ├── Cleaning Report → Workflow 10 (Cleaning Completion)
    │   └── Maintenance Report → Workflow 13 (Maintenance Ticket)
    │
    └── Platform Webhooks
        ├── Payment Events → Workflow 7 (Payment Handler)
        └── Review Notifications → Workflow 16 (Review Monitor)

SCHEDULED TRIGGERS
    ├── Every 30 min → Workflow 9 (Message Sender)
    ├── Daily 9 AM → Workflow 11 (Calendar Sync)
    └── Daily 2 AM → Workflow 12 (Dynamic Pricing)

INTER-WORKFLOW CALLS
    Workflow 5 → Workflow 3 (Availability Check)
    Workflow 5 → Workflow 2 (If conflict detected)
    Workflow 6 → Workflow 3 (Availability Check)
    Workflow 6 → Workflow 4 (Create Task)
    Workflow 6 → Workflow 7 (Payment Request)
    Workflow 7 → Workflow 8 (Journey Scheduler)
    Workflow 7 → Workflow 14 (Cleaning Scheduler)
    Workflow 10 → Workflow 21 (Property Status)
    Workflow 22 → Workflow 13 (Maintenance)
    Workflow 22 → Workflow 3 (Extension Check)
```

---

# PART 6: RECOMMENDED WORKFLOW NAMES

| Original # | Original Name | Recommended Name |
|------------|---------------|------------------|
| 0 | Message Router | Multi-Channel Message Router Hub |
| 1 | Control Panel Hub | Owner Command Dashboard |
| 2 | Conflict Priority Manager | Booking Conflict Resolution Manager |
| 3 | Real-Time Availability Checker | Property Availability Query Service |
| 4 | Manual Task Manager | Owner Task Queue Manager |
| 5 | Intelligent Inquiry Handler | New Guest Inquiry Processor |
| 6 | AI Conversation Manager | AI Sales Negotiation Bot |
| 7 | Payment Confirmation Handler | Stripe Payment Processor |
| 8 | Guest Journey Scheduler | Post-Booking Message Scheduler |
| 9 | Scheduled Message Sender | Guest Message Delivery Service |
| 10 | Cleaning Completion Report Handler | Cleaner Task Completion Processor |
| 11 | Daily Morning Check | Daily Calendar Sync & Conflict Detector |
| 12 | Nightly Automation | AI Dynamic Pricing Recommender |
| 13 | Maintenance Ticket Management | Multi-Channel Maintenance Ticket Creator |
| 14 | Cleaning Scheduler | Automated Turnover Cleaning Scheduler |
| 15 | Inventory Tracker | Weekly Supplies Inventory & Reorder System |
| 16 | Review Monitoring & Response | Guest Review AI Response Generator |
| 17 | Guest Screening System | Guest Risk Assessment & Blacklist Checker |
| 21 | Property Status Update | Property Status Manager |
| 22 | Active Booking Handler | Active Guest AI Concierge |
| 23 | Advanced Automation | Guest Incident Tracker & Blacklist Manager |

---

*Report generated based on comprehensive analysis of the 24 Property Management/AirBNB workflow documentation.*

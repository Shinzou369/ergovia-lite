# ERGOVIA CONVERSATION STATE ENGINE - COMPLETE IMPLEMENTATION GUIDE

> **Version 1.1 — Updated 2026-03-12**
> Corrected from original (v1.0, 2026-03-10):
> - `[V4]`/`[V6]` workflow labels → `[LIVE]`
> - Database name `ergovia_staycation` → `ergovia_db`
> - Dashboard paths `/v2/` → `/airb/`
> - Section 7.1 table check corrected to `conversation_state`
> - Workflow IDs are environment-specific — get current IDs from n8n UI → Workflows tab

---

## DOCUMENT PURPOSE

This document serves as both:
1. **A prompt for AI implementation** - Can be given to Claude/GPT to execute the implementation
2. **A manual guide for developers** - Step-by-step instructions for human developers

---

## TABLE OF CONTENTS

1. [Prerequisites & Access Required](#1-prerequisites--access-required)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Implementation](#3-database-implementation)
4. [Workflow Modifications](#4-workflow-modifications)
5. [Control Panel Integration](#5-control-panel-integration)
6. [Stage Definitions & If-Then Conditions](#6-stage-definitions--if-then-conditions)
7. [Testing & Validation](#7-testing--validation)
8. [Rollback Plan](#8-rollback-plan)

---

# 1. PREREQUISITES & ACCESS REQUIRED

## 1.1 Required Access Credentials

Before starting implementation, ensure you have:

### n8n Instance Access
```
URL: https://n8n.ergovia-ai.com
API Key: [REQUEST FROM ADMIN]
Header: X-N8N-API-KEY: {api_key}

Workflows to modify:
- [LIVE] WF1: AI Gateway - Unified Entry Point (ID: get from n8n UI → Workflows tab)
- [LIVE] WF4: Payment Processor (ID: get from n8n UI → Workflows tab)
- Always use [LIVE] versions — do NOT modify [V4] or [V6] archived workflows
```

### PostgreSQL Database Access
```
Host: [REQUEST FROM ADMIN]
Port: 5432
Database: ergovia_db
Username: [REQUEST FROM ADMIN]
Password: [REQUEST FROM ADMIN]

Required permissions:
- CREATE TABLE
- ALTER TABLE
- INSERT, UPDATE, DELETE, SELECT on all tables
```

### Control Panel Access
```
Admin URL: [REQUEST FROM ADMIN]
API Endpoint: [REQUEST FROM ADMIN]
Authentication: [REQUEST FROM ADMIN]

Files to modify:
- Backend API endpoints
- Frontend tasks.js / tasks.html
- Database connection config
```

## 1.2 Current System State Check

Before implementing, verify:

```sql
-- Check if conversation_state table exists and its structure
\d conversations

-- Check if property_configurations has required columns
\d property_configurations

-- Check existing tables
\dt
```

## 1.3 Backup Requirements

**CRITICAL: Create backups before any changes**

```bash
# Backup database
pg_dump -h [host] -U [user] -d ergovia_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup n8n workflows (via API)
curl -H "X-N8N-API-KEY: {key}" "https://n8n.ergovia-ai.com/api/v1/workflows" > workflows_backup.json
```

---

# 2. ARCHITECTURE OVERVIEW

## 2.1 The Three Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONVERSATION STATE ENGINE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│   │  DATABASE   │◄───►│  WORKFLOWS  │◄───►│  CONTROL    │          │
│   │ (PostgreSQL)│     │  (n8n)      │     │  PANEL      │          │
│   └─────────────┘     └─────────────┘     └─────────────┘          │
│         │                   │                   │                   │
│         │    Stores STATE   │ Executes ACTIONS  │ Shows & Updates   │
│         │    (facts, stage) │ (messages, tools) │ (owner interface) │
│         │                   │                   │                   │
│         └───────────────────┴───────────────────┘                   │
│                             │                                       │
│                    ALL READ/WRITE TO SAME                           │
│                    DATABASE TABLES                                  │
│                             │                                       │
│                    ┌────────┴────────┐                              │
│                    │ conversation_   │                              │
│                    │ state           │                              │
│                    │ (central truth) │                              │
│                    └─────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 2.2 How They Work Together

| Component | Responsibility | Example |
|-----------|---------------|---------|
| **Database** | Stores STATE (persistent memory) | `current_stage = 'date_collection'`, `guest_name = 'John'` |
| **Workflow** | Executes ACTIONS based on state | Checks calendar, sends messages, creates bookings |
| **Control Panel** | Owner interface for state updates | Owner clicks "Payment Received" button |

**KEY PRINCIPLE**: They don't duplicate - they complement each other. The database is the single source of truth.

## 2.3 Message Flow

```
Guest sends message
        │
        ▼
┌───────────────────┐
│ WF1: AI Gateway   │
├───────────────────┤
│ 1. Receive msg    │
│ 2. LOAD state     │◄──── conversation_state table
│ 3. Build context  │
│ 4. AI processes   │
│ 5. SAVE state     │────► conversation_state table
│ 6. Send response  │
└───────────────────┘
        │
        ▼
Control Panel sees updated state on refresh
Owner can update state via Control Panel
Next message uses updated state
```

---

# 3. DATABASE IMPLEMENTATION

## 3.1 Create conversation_state Table

Execute this SQL in your PostgreSQL database:

```sql
-- ============================================================
-- CONVERSATION STATE ENGINE - DATABASE SCHEMA
-- ============================================================

-- Drop if exists (ONLY IN DEVELOPMENT - remove in production)
-- DROP TABLE IF EXISTS conversation_state CASCADE;

-- Main conversation state table
CREATE TABLE IF NOT EXISTS conversation_state (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ============================================================
    -- IDENTITY - Who is this conversation with?
    -- ============================================================
    sender_id VARCHAR(100) NOT NULL,          -- Unique per platform (telegram chat_id, whatsapp number, etc.)
    channel VARCHAR(20) NOT NULL,              -- 'telegram', 'whatsapp', 'sms'
    property_id VARCHAR(50),                   -- Which property they're inquiring about
    customer_id UUID,                          -- Link to customers table if exists

    -- ============================================================
    -- CURRENT STAGE - Where are we in the conversation?
    -- ============================================================
    current_stage VARCHAR(50) DEFAULT 'first_contact',
    previous_stage VARCHAR(50),                -- For "go back" functionality
    stage_entered_at TIMESTAMP DEFAULT NOW(),  -- When did we enter this stage?

    -- ============================================================
    -- COLLECTED DATA - What facts have we gathered?
    -- ============================================================
    -- This is the "memory" - stores everything we've learned
    collected_data JSONB DEFAULT '{}'::jsonb,
    /*
    Example collected_data:
    {
      "guest_name": "John Doe",
      "name_source": "whatsapp_profile",       -- or "telegram_profile", "asked", "self_introduced"
      "check_in_date": "2026-03-15",
      "check_out_date": "2026-03-18",
      "num_nights": 3,
      "dates_source": "explicit",              -- or "relative_resolved"
      "selected_property_id": "prop-123",
      "selected_property_name": "Casa Marina",
      "num_guests": 3,
      "quoted_price": 450.00,
      "price_breakdown": {
        "nightly_subtotal": 300,
        "cleaning_fee": 50,
        "service_fee": 36,
        "weekly_discount": 0,
        "total": 386
      },
      "special_requests": ["early check-in", "baby crib"],
      "payment_method_sent": "bank_transfer",
      "contract_sent_at": "2026-03-09T10:00:00Z"
    }
    */

    -- ============================================================
    -- STAGE FLAGS - What milestones have been completed?
    -- ============================================================
    stage_flags JSONB DEFAULT '{}'::jsonb,
    /*
    Example stage_flags:
    {
      "name_collected": true,
      "dates_collected": true,
      "dates_confirmed": true,
      "property_selected": true,
      "availability_checked": true,
      "price_shown": true,
      "booking_agreed": true,
      "contract_sent": false,
      "contract_signed": false,
      "payment_link_sent": true,
      "payment_confirmed": false
    }
    */

    -- ============================================================
    -- NEXT ACTION - What should happen next?
    -- ============================================================
    next_required_action VARCHAR(100),
    /*
    Possible values:
    - 'ask_name'
    - 'ask_dates'
    - 'confirm_dates'
    - 'select_property'
    - 'check_availability'
    - 'show_price'
    - 'wait_for_booking_decision'
    - 'send_contract'
    - 'send_payment_link'
    - 'wait_for_payment_confirmation'
    - 'wait_for_owner_setup'
    - 'answer_guest_question'
    - 'send_confirmation'
    - 'send_reminder'
    */

    -- ============================================================
    -- OWNER ACTION TRACKING - Does owner need to do something?
    -- ============================================================
    owner_action_required BOOLEAN DEFAULT FALSE,
    owner_action_type VARCHAR(50),
    /*
    Possible values:
    - 'confirm_payment'
    - 'decline_payment'
    - 'provide_contract'
    - 'provide_payment_details'
    - 'answer_question'
    - 'review_competing_offers'
    */
    owner_notified_at TIMESTAMP,
    owner_reminder_count INT DEFAULT 0,

    -- ============================================================
    -- PENDING QUESTION - For UNKNOWN_ANSWER stage
    -- ============================================================
    pending_question TEXT,                     -- The question AI couldn't answer
    pending_question_context TEXT,             -- Additional context
    pending_question_asked_at TIMESTAMP,

    -- ============================================================
    -- TIMING & FOLLOW-UPS
    -- ============================================================
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP DEFAULT NOW(),
    last_message_from VARCHAR(20),             -- 'guest' or 'system'
    follow_up_scheduled_at TIMESTAMP,          -- When to send follow-up
    follow_up_type VARCHAR(50),                -- 'reminder_24h', 'reminder_48h', 'payment_reminder'

    -- ============================================================
    -- CONVERSATION STATUS
    -- ============================================================
    is_active BOOLEAN DEFAULT TRUE,
    closed_at TIMESTAMP,
    closed_reason VARCHAR(50),
    /*
    Possible values:
    - 'completed' (booking done)
    - 'declined' (guest or owner declined)
    - 'no_response' (guest stopped responding)
    - 'spam' (marked as spam)
    - 'duplicate' (duplicate conversation)
    */

    -- ============================================================
    -- METADATA
    -- ============================================================
    conversation_quality_score INT,            -- 1-10, can be used for analytics
    total_messages_exchanged INT DEFAULT 0,
    ai_errors_count INT DEFAULT 0,

    -- Unique constraint: one active conversation per sender
    CONSTRAINT unique_active_sender UNIQUE (sender_id)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Fast lookup by sender (most common query)
CREATE INDEX IF NOT EXISTS idx_conv_state_sender
ON conversation_state(sender_id);

-- Find all conversations at a specific stage
CREATE INDEX IF NOT EXISTS idx_conv_state_stage
ON conversation_state(current_stage);

-- Find conversations needing owner action
CREATE INDEX IF NOT EXISTS idx_conv_state_owner_action
ON conversation_state(owner_action_required)
WHERE owner_action_required = TRUE;

-- Find conversations needing follow-up
CREATE INDEX IF NOT EXISTS idx_conv_state_follow_up
ON conversation_state(follow_up_scheduled_at)
WHERE follow_up_scheduled_at IS NOT NULL AND is_active = TRUE;

-- Find active conversations by property
CREATE INDEX IF NOT EXISTS idx_conv_state_property
ON conversation_state(property_id)
WHERE is_active = TRUE;

-- Find conversations by customer
CREATE INDEX IF NOT EXISTS idx_conv_state_customer
ON conversation_state(customer_id);

-- ============================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION update_conversation_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_state_timestamp ON conversation_state;

CREATE TRIGGER trigger_update_conversation_state_timestamp
    BEFORE UPDATE ON conversation_state
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_state_timestamp();

-- ============================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON TABLE conversation_state IS 'Central state tracking for all guest conversations. Single source of truth for conversation progress.';
COMMENT ON COLUMN conversation_state.current_stage IS 'Current stage in conversation flow. See stage definitions in documentation.';
COMMENT ON COLUMN conversation_state.collected_data IS 'JSON object storing all facts collected during conversation (name, dates, preferences, etc.)';
COMMENT ON COLUMN conversation_state.stage_flags IS 'JSON object with boolean flags indicating completed milestones';
COMMENT ON COLUMN conversation_state.next_required_action IS 'What action the AI should take next';
COMMENT ON COLUMN conversation_state.owner_action_required IS 'TRUE if owner needs to take action (confirm payment, answer question, etc.)';
```

## 3.2 Add Columns to property_configurations

```sql
-- ============================================================
-- PROPERTY CONFIGURATION UPDATES
-- Add payment and contract details columns
-- ============================================================

-- Add payment_details JSON column
ALTER TABLE property_configurations
ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN property_configurations.payment_details IS
'Payment configuration: bank details, GCash, payment links, etc.';

/*
Example payment_details:
{
  "has_payment_details": true,
  "bank_name": "BDO",
  "account_number": "1234567890",
  "account_name": "John Doe Properties",
  "gcash_number": "09171234567",
  "gcash_name": "John D.",
  "payment_link": "https://pay.example.com/property123",
  "payment_instructions": "Please send payment to the bank account above. Include your name and booking dates in the reference.",
  "accepted_methods": ["bank_transfer", "gcash", "cash"],
  "preferred_method": "bank_transfer"
}
*/

-- Add contract_details JSON column
ALTER TABLE property_configurations
ADD COLUMN IF NOT EXISTS contract_details JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN property_configurations.contract_details IS
'Contract configuration: contract URL, signing instructions, etc.';

/*
Example contract_details:
{
  "has_contract": true,
  "contract_url": "https://docs.google.com/document/d/xxx/edit",
  "contract_type": "google_doc",
  "contract_instructions": "Please review and sign the contract at the link above. You can add your digital signature at the bottom.",
  "requires_signature_before_payment": true,
  "contract_template_id": "template-123"
}
*/
```

## 3.3 Create Helper Functions

```sql
-- ============================================================
-- HELPER FUNCTIONS FOR CONVERSATION STATE
-- ============================================================

-- Function to get or create conversation state for a sender
CREATE OR REPLACE FUNCTION get_or_create_conversation_state(
    p_sender_id VARCHAR(100),
    p_channel VARCHAR(20),
    p_property_id VARCHAR(50) DEFAULT NULL
)
RETURNS conversation_state AS $$
DECLARE
    v_state conversation_state;
BEGIN
    -- Try to find existing state
    SELECT * INTO v_state
    FROM conversation_state
    WHERE sender_id = p_sender_id
    LIMIT 1;

    -- If not found, create new
    IF NOT FOUND THEN
        INSERT INTO conversation_state (
            sender_id,
            channel,
            property_id,
            current_stage,
            next_required_action
        )
        VALUES (
            p_sender_id,
            p_channel,
            p_property_id,
            'first_contact',
            'welcome_and_get_name'
        )
        RETURNING * INTO v_state;
    END IF;

    RETURN v_state;
END;
$$ LANGUAGE plpgsql;

-- Function to update conversation state
CREATE OR REPLACE FUNCTION update_conversation_state(
    p_sender_id VARCHAR(100),
    p_current_stage VARCHAR(50) DEFAULT NULL,
    p_collected_data JSONB DEFAULT NULL,
    p_stage_flags JSONB DEFAULT NULL,
    p_next_action VARCHAR(100) DEFAULT NULL,
    p_owner_action_required BOOLEAN DEFAULT NULL,
    p_owner_action_type VARCHAR(50) DEFAULT NULL
)
RETURNS conversation_state AS $$
DECLARE
    v_state conversation_state;
BEGIN
    UPDATE conversation_state
    SET
        previous_stage = CASE WHEN p_current_stage IS NOT NULL AND p_current_stage != current_stage
                              THEN current_stage
                              ELSE previous_stage END,
        current_stage = COALESCE(p_current_stage, current_stage),
        stage_entered_at = CASE WHEN p_current_stage IS NOT NULL AND p_current_stage != current_stage
                                THEN NOW()
                                ELSE stage_entered_at END,
        collected_data = CASE WHEN p_collected_data IS NOT NULL
                              THEN collected_data || p_collected_data
                              ELSE collected_data END,
        stage_flags = CASE WHEN p_stage_flags IS NOT NULL
                           THEN stage_flags || p_stage_flags
                           ELSE stage_flags END,
        next_required_action = COALESCE(p_next_action, next_required_action),
        owner_action_required = COALESCE(p_owner_action_required, owner_action_required),
        owner_action_type = COALESCE(p_owner_action_type, owner_action_type),
        owner_notified_at = CASE WHEN p_owner_action_required = TRUE AND owner_action_required = FALSE
                                 THEN NOW()
                                 ELSE owner_notified_at END,
        last_message_at = NOW(),
        total_messages_exchanged = total_messages_exchanged + 1
    WHERE sender_id = p_sender_id
    RETURNING * INTO v_state;

    RETURN v_state;
END;
$$ LANGUAGE plpgsql;

-- Function to check if owner action is needed
CREATE OR REPLACE FUNCTION get_pending_owner_actions(p_customer_id UUID DEFAULT NULL)
RETURNS TABLE (
    conversation_id UUID,
    sender_id VARCHAR(100),
    guest_name TEXT,
    action_type VARCHAR(50),
    property_name VARCHAR(255),
    waiting_since TIMESTAMP,
    details JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cs.id,
        cs.sender_id,
        cs.collected_data->>'guest_name',
        cs.owner_action_type,
        pc.property_name,
        cs.owner_notified_at,
        jsonb_build_object(
            'stage', cs.current_stage,
            'check_in', cs.collected_data->>'check_in_date',
            'check_out', cs.collected_data->>'check_out_date',
            'amount', cs.collected_data->>'quoted_price',
            'pending_question', cs.pending_question
        )
    FROM conversation_state cs
    LEFT JOIN property_configurations pc ON cs.property_id = pc.property_id
    WHERE cs.owner_action_required = TRUE
      AND cs.is_active = TRUE
      AND (p_customer_id IS NULL OR pc.customer_id = p_customer_id)
    ORDER BY cs.owner_notified_at ASC;
END;
$$ LANGUAGE plpgsql;
```

## 3.4 Verification Queries

After running the above, verify with:

```sql
-- Verify table exists
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'conversation_state'
ORDER BY ordinal_position;

-- Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'conversation_state';

-- Verify functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%conversation%';

-- Test the get_or_create function
SELECT * FROM get_or_create_conversation_state('test_sender_123', 'telegram', 'prop-001');

-- Clean up test data
DELETE FROM conversation_state WHERE sender_id = 'test_sender_123';
```

---

# 4. WORKFLOW MODIFICATIONS

## 4.1 WF1: AI Gateway Modifications

### 4.1.1 Overview of Changes

```
CURRENT FLOW:
[Triggers] → [Normalize] → [Get Customer ID] → [Merge] → [AI Agent] → [Send Response]

NEW FLOW:
[Triggers] → [Normalize] → [Get Customer ID] → [Load Conv State] → [Build AI Context] → [AI Agent] → [Parse Response] → [Update Conv State] → [Send Response]
                                                      ↑                                                        ↓
                                                      └────────────── conversation_state table ───────────────┘
```

### 4.1.2 New Node: Load Conversation State

Add this node AFTER "Get Customer ID" and BEFORE the AI Agent:

**Node Type**: PostgreSQL
**Node Name**: Load Conversation State
**Operation**: Execute Query

```sql
SELECT
    cs.*,
    pc.payment_details,
    pc.contract_details,
    pc.settings as property_settings,
    pc.property_name,
    pc.address,
    pc.max_guests,
    pc.bedrooms,
    pc.bathrooms,
    pc.base_price,
    pc.weekend_price,
    pc.cleaning_fee,
    pc.min_stay_nights,
    pc.max_stay_nights
FROM get_or_create_conversation_state(
    '{{ $('Normalize Input').item.json.sender_id }}',
    '{{ $('Normalize Input').item.json.channel }}',
    '{{ $('Get Customer ID').item.json.property_id }}'
) cs
LEFT JOIN property_configurations pc ON cs.property_id = pc.property_id;
```

### 4.1.3 New Node: Build AI Context

Add this node AFTER "Load Conversation State" and BEFORE the AI Agent:

**Node Type**: Code
**Node Name**: Build AI Context

```javascript
// ============================================================
// BUILD AI CONTEXT FROM CONVERSATION STATE
// This injects the current state into the AI system prompt
// ============================================================

const state = $('Load Conversation State').item.json;
const normalized = $('Normalize Input').item.json;
const customerData = $('Get Customer ID').item.json;

// Parse JSON fields safely
const collected = typeof state.collected_data === 'string'
    ? JSON.parse(state.collected_data || '{}')
    : (state.collected_data || {});

const flags = typeof state.stage_flags === 'string'
    ? JSON.parse(state.stage_flags || '{}')
    : (state.stage_flags || {});

const paymentDetails = typeof state.payment_details === 'string'
    ? JSON.parse(state.payment_details || '{}')
    : (state.payment_details || {});

const contractDetails = typeof state.contract_details === 'string'
    ? JSON.parse(state.contract_details || '{}')
    : (state.contract_details || {});

// Check what owner has configured
const hasPaymentDetails = paymentDetails.has_payment_details === true ||
    paymentDetails.bank_name ||
    paymentDetails.gcash_number ||
    paymentDetails.payment_link;

const hasContract = contractDetails.has_contract === true ||
    contractDetails.contract_url;

// Build the state context block for AI
const stateContext = `
══════════════════════════════════════════════════════════════════════
CONVERSATION STATE - READ THIS FIRST (THIS IS YOUR MEMORY)
══════════════════════════════════════════════════════════════════════

CURRENT STAGE: ${state.current_stage || 'first_contact'}
PREVIOUS STAGE: ${state.previous_stage || 'N/A'}
NEXT REQUIRED ACTION: ${state.next_required_action || 'determine_from_stage'}

──────────────────────────────────────────────────────────────────────
COLLECTED INFORMATION (What you already know - DO NOT ask again):
──────────────────────────────────────────────────────────────────────
Guest Name: ${collected.guest_name || 'NOT YET COLLECTED'}
${collected.guest_name ? `  └─ Source: ${collected.name_source || 'unknown'}` : '  └─ ACTION: You need to get their name'}

Check-in Date: ${collected.check_in_date || 'NOT YET COLLECTED'}
Check-out Date: ${collected.check_out_date || 'NOT YET COLLECTED'}
${collected.check_in_date ? `  └─ Number of nights: ${collected.num_nights || 'calculate from dates'}` : ''}
${collected.dates_confirmed ? '  └─ Dates CONFIRMED by guest' : (collected.check_in_date ? '  └─ Dates NOT YET CONFIRMED' : '')}

Property: ${collected.selected_property_name || state.property_name || 'NOT YET SELECTED'}
Number of Guests: ${collected.num_guests || 'NOT YET ASKED'}

Quoted Price: ${collected.quoted_price ? '$' + collected.quoted_price : 'NOT YET QUOTED'}
${collected.price_breakdown ? `  └─ Breakdown: ${JSON.stringify(collected.price_breakdown)}` : ''}

Special Requests: ${collected.special_requests ? collected.special_requests.join(', ') : 'None mentioned'}

──────────────────────────────────────────────────────────────────────
STAGE COMPLETION FLAGS (What milestones are done):
──────────────────────────────────────────────────────────────────────
${flags.name_collected ? '✅' : '❌'} Name Collected
${flags.dates_collected ? '✅' : '❌'} Dates Collected
${flags.dates_confirmed ? '✅' : '❌'} Dates Confirmed
${flags.property_selected ? '✅' : '❌'} Property Selected
${flags.availability_checked ? '✅' : '❌'} Availability Checked
${flags.price_shown ? '✅' : '❌'} Price Shown
${flags.booking_agreed ? '✅' : '❌'} Booking Agreed
${flags.contract_sent ? '✅' : '❌'} Contract Sent
${flags.contract_signed ? '✅' : '❌'} Contract Signed
${flags.payment_link_sent ? '✅' : '❌'} Payment Link Sent
${flags.payment_confirmed ? '✅' : '❌'} Payment Confirmed

──────────────────────────────────────────────────────────────────────
OWNER SETUP STATUS:
──────────────────────────────────────────────────────────────────────
Has Payment Details: ${hasPaymentDetails ? '✅ YES' : '❌ NO - Owner needs to provide this'}
Has Contract: ${hasContract ? '✅ YES' : '❌ NO (optional)'}
${state.owner_action_required ? `⚠️ WAITING FOR OWNER: ${state.owner_action_type}` : ''}

══════════════════════════════════════════════════════════════════════
STAGE-SPECIFIC INSTRUCTIONS
══════════════════════════════════════════════════════════════════════
${getStageInstructions(state.current_stage, collected, flags, hasPaymentDetails, hasContract)}

══════════════════════════════════════════════════════════════════════
CRITICAL RULES - FOLLOW THESE EXACTLY
══════════════════════════════════════════════════════════════════════
1. NEVER ask for information you already have (check COLLECTED INFORMATION above)
2. ALWAYS use the guest's name naturally if you have it
3. If stage_flags show something is done (✅), don't redo it
4. If owner_action_required is true, tell guest you're waiting for owner
5. If you don't know something and it's not in the database, ask the owner (set pending_question)
6. NEVER make up answers - if unsure, ask the owner
7. One question per message - end with that question
8. Keep responses under 150 words
`;

// Helper function for stage-specific instructions
function getStageInstructions(stage, collected, flags, hasPayment, hasContract) {
    const instructions = {
        'first_contact': `
You are greeting this guest for the first time.
- Welcome them warmly
- If their name is NOT collected (see above), ask for their name
- If their name IS already available from their profile, greet them BY NAME and ask about dates
- Be friendly, not robotic`,

        'name_collection': `
You need to get the guest's name.
- Ask politely: "May I know your name so I can assist you better?"
- Once they provide it, confirm warmly and ask about dates`,

        'date_collection': `
You need to get their desired dates.
- Guest name is: ${collected.guest_name}
- Ask: "When are you planning to check in and check out?"
- If they give relative dates ("next weekend"), resolve to exact dates and confirm`,

        'date_confirmation': `
Confirm the dates before checking availability.
- Dates to confirm: ${collected.check_in_date} to ${collected.check_out_date}
- Show full format: "Friday, March 15 to Sunday, March 17 (2 nights)"
- Ask: "Is that correct?"`,

        'availability_check': `
Check if property is available and show price.
- Use Calendar Manager tool with the dates
- If available: show price immediately (don't ask "want to know price?")
- If not available: offer alternative dates`,

        'price_presentation': `
Price has been shown. Gauge their interest.
- Price quoted: $${collected.quoted_price}
- Ask: "How does that sound?" or "Would you like to proceed?"
- If they say yes, move to booking confirmation`,

        'booking_confirmed': `
Guest agreed to book! Now handle contract and payment.
${hasContract ? '- Send contract first (contract_url available)' : '- No contract configured, skip to payment'}
${hasPayment ? '- Then send payment details' : '- ⚠️ Payment details NOT configured - notify owner!'}`,

        'contract_pending': `
Contract has been sent. Waiting for guest to sign.
- If guest has questions about contract: DO NOT answer - ask the owner
- If guest says they signed: thank them and send payment details
- AI does NOT negotiate contract terms`,

        'payment_link_sent': `
Payment details have been sent. Waiting for payment.
- Payment method sent: ${collected.payment_method_sent || 'unknown'}
- If guest says they paid: thank them and say you'll verify with owner
- Do NOT confirm payment yourself - owner must confirm`,

        'waiting_for_owner_setup': `
Owner hasn't set up payment/contract details.
- Tell guest: "Let me get the payment details from the property owner. I'll message you shortly!"
- Owner has been notified
- Do NOT proceed until owner provides details`,

        'payment_pending': `
Waiting for owner to confirm payment.
- If guest asks: "I'm verifying with the owner. You'll get confirmation soon!"
- Do NOT confirm payment - only owner can do this`,

        'payment_confirmed': `
Payment is confirmed! Send booking confirmation.
- Include: property details, dates, check-in time, address
- Say: "We're excited to host you!"`,

        'unknown_answer': `
Guest asked something you don't know.
- Question asked: ${state.pending_question || 'N/A'}
- Tell guest: "Let me check with the property owner and get back to you."
- Owner has been notified`,

        'holding_pattern': `
Guest is thinking about it.
- Be supportive, not pushy
- If they come back: resume from where we left off
- Check if dates are still available`
    };

    return instructions[stage] || `Stage: ${stage}. Follow the general conversation flow.`;
}

// Return the enriched data
return {
    // Original data
    ...normalized,

    // Customer/Property data
    customer_id: customerData.customer_id,
    property_id: state.property_id || customerData.property_id,
    property_name: state.property_name || customerData.property_name,
    is_owner: customerData.is_owner || false,

    // State data for later use
    conversation_state_id: state.id,
    current_stage: state.current_stage,
    collected_data: collected,
    stage_flags: flags,
    owner_action_required: state.owner_action_required,

    // The context to inject into AI prompt
    state_context: stateContext,

    // Helper flags
    has_payment_details: hasPaymentDetails,
    has_contract: hasContract,
    is_first_message: state.current_stage === 'first_contact' && !flags.name_collected
};
```

### 4.1.4 Modify AI Agent System Prompt

Update the AI Agent node's system message to include the state context:

```
{{ $('Build AI Context').item.json.state_context }}

══════════════════════════════════════════════════════════════════════
PROPERTY INFORMATION
══════════════════════════════════════════════════════════════════════
Property: {{ $('Build AI Context').item.json.property_name }}
Address: {{ $('Build AI Context').item.json.prop_address }}
Bedrooms: {{ $('Build AI Context').item.json.prop_bedrooms }}
Max Guests: {{ $('Build AI Context').item.json.prop_max_guests }}
Base Price: ${{ $('Build AI Context').item.json.prop_base_price }}/night
Weekend Price: ${{ $('Build AI Context').item.json.prop_weekend_price }}/night
Cleaning Fee: ${{ $('Build AI Context').item.json.prop_cleaning_fee }}

[... rest of existing system prompt for date engine, tools, etc. ...]
```

### 4.1.5 New Node: Parse AI Response

Add this node AFTER the AI Agent:

**Node Type**: Code
**Node Name**: Parse AI Response

```javascript
// ============================================================
// PARSE AI RESPONSE AND DETERMINE STATE UPDATES
// ============================================================

const aiResponse = $('AI Agent').item.json.output;
const previousState = $('Build AI Context').item.json;
const message = $('Normalize Input').item.json.message_text;

// Initialize updates object
let updates = {
    current_stage: previousState.current_stage,
    collected_data: { ...previousState.collected_data },
    stage_flags: { ...previousState.stage_flags },
    next_required_action: null,
    owner_action_required: false,
    owner_action_type: null,
    pending_question: null
};

// ============================================================
// EXTRACT NAME FROM MESSAGE IF NOT YET COLLECTED
// ============================================================
if (!updates.stage_flags.name_collected) {
    // Check if name is in the input (from profile)
    const inputName = $('Normalize Input').item.json.sender_name;
    if (inputName && inputName !== 'Guest' && !/^\+?\d+$/.test(inputName)) {
        updates.collected_data.guest_name = inputName;
        updates.collected_data.name_source = $('Normalize Input').item.json.channel + '_profile';
        updates.stage_flags.name_collected = true;
    }

    // Check if guest provided name in message
    const namePatterns = [
        /(?:i'm|im|i am|this is|my name is|call me)\s+([a-zA-Z]+)/i,
        /^([A-Z][a-z]+)$/  // Single capitalized word might be a name
    ];

    for (const pattern of namePatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            updates.collected_data.guest_name = match[1];
            updates.collected_data.name_source = 'self_introduced';
            updates.stage_flags.name_collected = true;
            break;
        }
    }
}

// ============================================================
// EXTRACT DATES FROM MESSAGE
// ============================================================
const datePatterns = [
    // ISO format: 2026-03-15
    /(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})/i,
    // Month Day format: March 15 to March 18
    /([A-Za-z]+\s+\d{1,2})\s*(?:to|-)\s*([A-Za-z]+\s+\d{1,2})/i
];

for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
        // Store dates (will need resolution for relative dates)
        updates.collected_data.check_in_raw = match[1];
        updates.collected_data.check_out_raw = match[2];
        updates.stage_flags.dates_collected = true;
        break;
    }
}

// ============================================================
// DETECT STAGE TRANSITIONS BASED ON KEYWORDS
// ============================================================
const messageLower = message.toLowerCase();

// Guest confirms dates
if (updates.current_stage === 'date_confirmation') {
    if (/^(yes|correct|right|perfect|exactly|that'?s? (right|correct))/i.test(messageLower)) {
        updates.stage_flags.dates_confirmed = true;
        updates.current_stage = 'availability_check';
        updates.next_required_action = 'check_availability';
    }
}

// Guest confirms booking
if (updates.current_stage === 'price_presentation' || updates.current_stage === 'booking_interest') {
    if (/^(yes|book it|let'?s? do it|i'?ll? take it|proceed|confirm)/i.test(messageLower)) {
        updates.stage_flags.booking_agreed = true;
        updates.current_stage = 'booking_confirmed';
        updates.next_required_action = previousState.has_contract ? 'send_contract' : 'send_payment_link';
    }
}

// Guest declines
if (/^(no|not interested|too expensive|changed my mind|cancel|never ?mind)/i.test(messageLower)) {
    if (['price_presentation', 'booking_interest', 'payment_pending'].includes(updates.current_stage)) {
        updates.current_stage = 'conversation_end';
        updates.next_required_action = 'close_gracefully';
    }
}

// Guest says they paid
if (updates.current_stage === 'payment_link_sent' || updates.current_stage === 'payment_pending') {
    if (/(?:i'?ve? paid|done|sent|paid already|payment sent)/i.test(messageLower)) {
        updates.current_stage = 'payment_pending';
        updates.owner_action_required = true;
        updates.owner_action_type = 'confirm_payment';
        updates.next_required_action = 'wait_for_payment_confirmation';
    }
}

// ============================================================
// AUTO-ADVANCE STAGES BASED ON FLAGS
// ============================================================
if (updates.current_stage === 'first_contact' && updates.stage_flags.name_collected) {
    updates.current_stage = 'date_collection';
    updates.next_required_action = 'ask_dates';
}

if (updates.current_stage === 'name_collection' && updates.stage_flags.name_collected) {
    updates.current_stage = 'date_collection';
    updates.next_required_action = 'ask_dates';
}

if (updates.current_stage === 'date_collection' && updates.stage_flags.dates_collected) {
    updates.current_stage = 'date_confirmation';
    updates.next_required_action = 'confirm_dates';
}

// ============================================================
// DETECT QUESTIONS AI CAN'T ANSWER
// ============================================================
if (aiResponse.includes("let me check with") || aiResponse.includes("ask the owner")) {
    updates.owner_action_required = true;
    updates.owner_action_type = 'answer_question';
    updates.pending_question = message;
    updates.current_stage = 'unknown_answer';
}

// Return the updates
return {
    ...previousState,
    updates: updates,
    ai_response: aiResponse
};
```

### 4.1.6 New Node: Update Conversation State

Add this node AFTER "Parse AI Response":

**Node Type**: PostgreSQL
**Node Name**: Update Conversation State
**Operation**: Execute Query

```sql
UPDATE conversation_state
SET
    previous_stage = CASE
        WHEN '{{ $json.updates.current_stage }}' != current_stage
        THEN current_stage
        ELSE previous_stage
    END,
    current_stage = '{{ $json.updates.current_stage }}',
    stage_entered_at = CASE
        WHEN '{{ $json.updates.current_stage }}' != current_stage
        THEN NOW()
        ELSE stage_entered_at
    END,
    collected_data = collected_data || '{{ JSON.stringify($json.updates.collected_data) }}'::jsonb,
    stage_flags = stage_flags || '{{ JSON.stringify($json.updates.stage_flags) }}'::jsonb,
    next_required_action = NULLIF('{{ $json.updates.next_required_action }}', 'null'),
    owner_action_required = {{ $json.updates.owner_action_required }},
    owner_action_type = NULLIF('{{ $json.updates.owner_action_type }}', 'null'),
    owner_notified_at = CASE
        WHEN {{ $json.updates.owner_action_required }} = TRUE AND owner_action_required = FALSE
        THEN NOW()
        ELSE owner_notified_at
    END,
    pending_question = NULLIF('{{ $json.updates.pending_question }}', 'null'),
    pending_question_asked_at = CASE
        WHEN '{{ $json.updates.pending_question }}' IS NOT NULL AND '{{ $json.updates.pending_question }}' != 'null'
        THEN NOW()
        ELSE pending_question_asked_at
    END,
    last_message_at = NOW(),
    last_message_from = 'guest',
    total_messages_exchanged = total_messages_exchanged + 1
WHERE sender_id = '{{ $json.sender_id }}'
RETURNING *;
```

### 4.1.7 Updated Node Connections

Update the workflow connections:

```
Telegram Trigger ─┐
WhatsApp Trigger ─┼─► Normalize Input ─► Get Customer ID ─► Load Conversation State
SMS Trigger ──────┘                                                    │
                                                                       ▼
                                                            Build AI Context
                                                                       │
                                                                       ▼
                                                               Check Budget
                                                                       │
                                                          ┌────────────┴────────────┐
                                                          │                         │
                                                    Budget OK?              Budget Exhausted
                                                          │                         │
                                                          ▼                         ▼
                                                     AI Agent              Fallback Response
                                                          │
                                                          ▼
                                                 Parse AI Response
                                                          │
                                                          ▼
                                              Update Conversation State
                                                          │
                                                          ▼
                                              [Existing: Calculate Cost, Log, etc.]
                                                          │
                                                          ▼
                                                   Send Response
```

---

## 4.2 WF4: Payment Processor Modifications

### 4.2.1 Add State Update on Booking Creation

After "Create Pending Booking", add:

**Node Type**: PostgreSQL
**Node Name**: Update State for Payment

```sql
UPDATE conversation_state
SET
    current_stage = 'payment_link_sent',
    stage_flags = stage_flags || '{"payment_link_sent": true}'::jsonb,
    collected_data = collected_data || jsonb_build_object(
        'booking_id', '{{ $json.booking_id }}',
        'payment_method_sent', '{{ $json.payment_method }}'
    ),
    next_required_action = 'wait_for_payment_confirmation',
    owner_action_required = true,
    owner_action_type = 'confirm_payment',
    owner_notified_at = NOW()
WHERE sender_id = '{{ $json.sender_id }}'
RETURNING *;
```

### 4.2.2 Add State Update on Payment Confirmation

After "Confirm Booking" (when owner confirms payment), add:

**Node Type**: PostgreSQL
**Node Name**: Update State for Confirmation

```sql
UPDATE conversation_state
SET
    current_stage = 'see_you_sent',
    stage_flags = stage_flags || '{"payment_confirmed": true}'::jsonb,
    collected_data = collected_data || jsonb_build_object(
        'payment_confirmed_at', NOW()::text,
        'payment_confirmed_via', '{{ $json.confirmed_via }}'
    ),
    next_required_action = 'send_confirmation_details',
    owner_action_required = false,
    owner_action_type = null
WHERE sender_id = '{{ $json.sender_id }}'
RETURNING *;
```

### 4.2.3 Add State Update on Cancellation

After "Cancel Booking", add:

**Node Type**: PostgreSQL
**Node Name**: Update State for Cancellation

```sql
UPDATE conversation_state
SET
    current_stage = 'conversation_end',
    is_active = false,
    closed_at = NOW(),
    closed_reason = 'declined',
    owner_action_required = false
WHERE sender_id = '{{ $json.sender_id }}'
RETURNING *;
```

---

# 5. CONTROL PANEL INTEGRATION

## 5.1 Backend API Endpoints

Add these new API endpoints to the Control Panel backend workflow:

### 5.1.1 Get Conversation States (for Tasks display)

**Webhook**: `POST /webhook/control-panel/get-conversation-states`

```javascript
// Query conversations needing attention
const query = `
SELECT
    cs.*,
    pc.property_name
FROM conversation_state cs
LEFT JOIN property_configurations pc ON cs.property_id = pc.property_id
WHERE pc.customer_id = $1
  AND cs.is_active = true
  AND (
    cs.owner_action_required = true
    OR cs.current_stage IN ('payment_pending', 'unknown_answer', 'waiting_for_owner_setup')
  )
ORDER BY
    CASE
        WHEN cs.owner_action_type = 'confirm_payment' THEN 1
        WHEN cs.owner_action_type = 'answer_question' THEN 2
        ELSE 3
    END,
    cs.owner_notified_at ASC
`;
```

### 5.1.2 Confirm Payment

**Webhook**: `POST /webhook/control-panel/confirm-payment`

```javascript
// Request body: { sender_id, customer_id }

// 1. Validate ownership
// 2. Update conversation_state
// 3. Update bookings table
// 4. Send confirmation to guest
// 5. Return success

const updateQuery = `
UPDATE conversation_state
SET
    current_stage = 'payment_confirmed',
    stage_flags = stage_flags || '{"payment_confirmed": true}'::jsonb,
    collected_data = collected_data || jsonb_build_object(
        'payment_confirmed_at', NOW()::text,
        'payment_confirmed_via', 'control_panel'
    ),
    owner_action_required = false,
    owner_action_type = null
WHERE sender_id = $1
RETURNING *;
`;
```

### 5.1.3 Decline Payment

**Webhook**: `POST /webhook/control-panel/decline-payment`

```javascript
// Request body: { sender_id, customer_id }

const updateQuery = `
UPDATE conversation_state
SET
    current_stage = 'conversation_end',
    is_active = false,
    closed_at = NOW(),
    closed_reason = 'declined',
    owner_action_required = false
WHERE sender_id = $1
RETURNING *;
`;
```

### 5.1.4 Answer Guest Question

**Webhook**: `POST /webhook/control-panel/answer-question`

```javascript
// Request body: { sender_id, answer, customer_id }

// 1. Get the conversation state
// 2. Store the answer
// 3. Update state to resume conversation
// 4. Optionally store answer in property settings for future use
// 5. Send answer to guest

const updateQuery = `
UPDATE conversation_state
SET
    current_stage = previous_stage,  -- Go back to where we were
    pending_question = null,
    pending_question_asked_at = null,
    owner_action_required = false,
    owner_action_type = null,
    collected_data = collected_data || jsonb_build_object(
        'owner_answers', COALESCE(collected_data->'owner_answers', '[]'::jsonb) ||
            jsonb_build_object('question', pending_question, 'answer', $2, 'answered_at', NOW()::text)
    )
WHERE sender_id = $1
RETURNING *;
`;
```

## 5.2 Frontend Updates

### 5.2.1 Tasks Tab HTML Addition

Add to the Tasks tab in the Control Panel:

```html
<!-- Conversation Tasks Section -->
<div class="conversation-tasks-section" id="conversationTasks">
    <h3>💬 Guest Conversations Needing Attention</h3>

    <div class="task-filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="payment">💳 Payments</button>
        <button class="filter-btn" data-filter="question">❓ Questions</button>
        <button class="filter-btn" data-filter="setup">⚙️ Setup Required</button>
    </div>

    <div class="tasks-list" id="conversationTasksList">
        <!-- Tasks will be loaded here dynamically -->
    </div>
</div>

<!-- Payment Confirmation Modal -->
<div class="modal" id="paymentConfirmModal">
    <div class="modal-content">
        <h4>⚠️ Confirm Payment Received</h4>
        <p>You are confirming payment from:</p>
        <div class="payment-details" id="paymentModalDetails">
            <!-- Filled dynamically -->
        </div>
        <p class="warning-text">
            <strong>Double check:</strong> The system will assume you have received
            the customer's payment. Only proceed if you have verified the payment.
        </p>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal('paymentConfirmModal')">Go Back</button>
            <button class="btn btn-success" id="confirmPaymentBtn">Proceed - Payment Received</button>
        </div>
    </div>
</div>

<!-- Decline Confirmation Modal -->
<div class="modal" id="declineModal">
    <div class="modal-content">
        <h4>⚠️ Warning</h4>
        <p>You are about to decline this booking.</p>
        <div class="decline-details" id="declineModalDetails">
            <!-- Filled dynamically -->
        </div>
        <p class="warning-text danger">
            <strong>Warning:</strong> The system will recognize that you or the client
            has decided not to proceed. The AI will stop pursuing this lead and notify
            the guest that the booking is cancelled.
        </p>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal('declineModal')">Go Back</button>
            <button class="btn btn-danger" id="confirmDeclineBtn">Yes, Decline Booking</button>
        </div>
    </div>
</div>

<!-- Answer Question Modal -->
<div class="modal" id="answerQuestionModal">
    <div class="modal-content">
        <h4>📝 Answer Guest Question</h4>
        <div class="question-details" id="questionModalDetails">
            <!-- Filled dynamically -->
        </div>
        <div class="form-group">
            <label>Your Answer:</label>
            <textarea id="answerInput" rows="4" placeholder="Type your answer here..."></textarea>
        </div>
        <div class="form-group">
            <label>
                <input type="checkbox" id="saveForFuture">
                Save this answer for future inquiries
            </label>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal('answerQuestionModal')">Cancel</button>
            <button class="btn btn-primary" id="submitAnswerBtn">Send Answer to Guest</button>
        </div>
    </div>
</div>
```

### 5.2.2 Tasks JavaScript

```javascript
// ============================================================
// CONVERSATION TASKS MANAGEMENT
// ============================================================

// Load conversation tasks
async function loadConversationTasks() {
    try {
        const response = await fetch('/webhook/control-panel/get-conversation-states', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: customerId })
        });

        const data = await response.json();
        if (data.success) {
            renderConversationTasks(data.tasks);
        }
    } catch (error) {
        console.error('Failed to load conversation tasks:', error);
    }
}

// Render conversation tasks
function renderConversationTasks(tasks) {
    const container = document.getElementById('conversationTasksList');

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="no-tasks">No conversations need attention right now.</p>';
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-card conversation-task" data-type="${task.owner_action_type}" data-sender="${task.sender_id}">
            <div class="task-header">
                <span class="task-icon">${getTaskIcon(task.owner_action_type)}</span>
                <span class="task-title">${getTaskTitle(task)}</span>
                <span class="task-time">${formatRelativeTime(task.owner_notified_at)}</span>
            </div>

            <div class="task-body">
                <div class="task-info">
                    <p><strong>Guest:</strong> ${task.collected_data?.guest_name || 'Unknown'}</p>
                    <p><strong>Property:</strong> ${task.property_name}</p>
                    ${task.collected_data?.check_in_date ? `
                        <p><strong>Dates:</strong> ${task.collected_data.check_in_date} to ${task.collected_data.check_out_date}</p>
                    ` : ''}
                    ${task.collected_data?.quoted_price ? `
                        <p><strong>Amount:</strong> $${task.collected_data.quoted_price}</p>
                    ` : ''}
                    ${task.pending_question ? `
                        <p><strong>Question:</strong> "${task.pending_question}"</p>
                    ` : ''}
                </div>
            </div>

            <div class="task-actions">
                ${getTaskActions(task)}
            </div>
        </div>
    `).join('');
}

// Get appropriate icon for task type
function getTaskIcon(actionType) {
    const icons = {
        'confirm_payment': '💳',
        'answer_question': '❓',
        'provide_payment_details': '⚙️',
        'provide_contract': '📄',
        'review_competing_offers': '⚔️'
    };
    return icons[actionType] || '📋';
}

// Get task title
function getTaskTitle(task) {
    const titles = {
        'confirm_payment': `Payment pending: ${task.collected_data?.guest_name || 'Guest'}`,
        'answer_question': `Question from: ${task.collected_data?.guest_name || 'Guest'}`,
        'provide_payment_details': 'Payment details needed',
        'provide_contract': 'Contract details needed',
        'review_competing_offers': 'Competing offers to review'
    };
    return titles[task.owner_action_type] || `Action needed for ${task.collected_data?.guest_name || 'Guest'}`;
}

// Get action buttons for task type
function getTaskActions(task) {
    switch (task.owner_action_type) {
        case 'confirm_payment':
            return `
                <button class="btn btn-success" onclick="showPaymentConfirmModal('${task.sender_id}', ${JSON.stringify(task.collected_data).replace(/"/g, '&quot;')})">
                    ✅ Payment Received
                </button>
                <button class="btn btn-danger" onclick="showDeclineModal('${task.sender_id}', ${JSON.stringify(task.collected_data).replace(/"/g, '&quot;')})">
                    ❌ Decline
                </button>
            `;
        case 'answer_question':
            return `
                <button class="btn btn-primary" onclick="showAnswerModal('${task.sender_id}', '${task.pending_question?.replace(/'/g, "\\'")}', '${task.collected_data?.guest_name || 'Guest'}')">
                    📝 Answer Question
                </button>
            `;
        case 'provide_payment_details':
        case 'provide_contract':
            return `
                <button class="btn btn-primary" onclick="openSettingsModal()">
                    ⚙️ Configure Now
                </button>
            `;
        default:
            return `
                <button class="btn btn-secondary" onclick="viewConversation('${task.sender_id}')">
                    👁️ View Details
                </button>
            `;
    }
}

// Show payment confirmation modal
function showPaymentConfirmModal(senderId, collectedData) {
    const modal = document.getElementById('paymentConfirmModal');
    const details = document.getElementById('paymentModalDetails');

    details.innerHTML = `
        <p><strong>Guest:</strong> ${collectedData.guest_name || 'Unknown'}</p>
        <p><strong>Amount:</strong> $${collectedData.quoted_price || 'N/A'}</p>
        <p><strong>Dates:</strong> ${collectedData.check_in_date || 'N/A'} to ${collectedData.check_out_date || 'N/A'}</p>
    `;

    document.getElementById('confirmPaymentBtn').onclick = () => confirmPayment(senderId);
    modal.style.display = 'flex';
}

// Show decline modal
function showDeclineModal(senderId, collectedData) {
    const modal = document.getElementById('declineModal');
    const details = document.getElementById('declineModalDetails');

    details.innerHTML = `
        <p><strong>Guest:</strong> ${collectedData.guest_name || 'Unknown'}</p>
        <p><strong>Dates:</strong> ${collectedData.check_in_date || 'N/A'} to ${collectedData.check_out_date || 'N/A'}</p>
    `;

    document.getElementById('confirmDeclineBtn').onclick = () => declinePayment(senderId);
    modal.style.display = 'flex';
}

// Show answer question modal
function showAnswerModal(senderId, question, guestName) {
    const modal = document.getElementById('answerQuestionModal');
    const details = document.getElementById('questionModalDetails');

    details.innerHTML = `
        <p><strong>From:</strong> ${guestName}</p>
        <p><strong>Question:</strong> "${question}"</p>
    `;

    document.getElementById('answerInput').value = '';
    document.getElementById('saveForFuture').checked = false;
    document.getElementById('submitAnswerBtn').onclick = () => submitAnswer(senderId);
    modal.style.display = 'flex';
}

// Confirm payment
async function confirmPayment(senderId) {
    try {
        const response = await fetch('/webhook/control-panel/confirm-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id: senderId, customer_id: customerId })
        });

        const data = await response.json();
        if (data.success) {
            showToast('Payment confirmed! Guest has been notified.', 'success');
            closeModal('paymentConfirmModal');
            loadConversationTasks(); // Refresh the list
        } else {
            showToast('Failed to confirm payment: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Error confirming payment', 'error');
    }
}

// Decline payment
async function declinePayment(senderId) {
    try {
        const response = await fetch('/webhook/control-panel/decline-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id: senderId, customer_id: customerId })
        });

        const data = await response.json();
        if (data.success) {
            showToast('Booking declined. Guest has been notified.', 'info');
            closeModal('declineModal');
            loadConversationTasks();
        } else {
            showToast('Failed to decline: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Error declining booking', 'error');
    }
}

// Submit answer to guest question
async function submitAnswer(senderId) {
    const answer = document.getElementById('answerInput').value.trim();
    const saveForFuture = document.getElementById('saveForFuture').checked;

    if (!answer) {
        showToast('Please enter an answer', 'warning');
        return;
    }

    try {
        const response = await fetch('/webhook/control-panel/answer-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: senderId,
                answer: answer,
                save_for_future: saveForFuture,
                customer_id: customerId
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast('Answer sent to guest!', 'success');
            closeModal('answerQuestionModal');
            loadConversationTasks();
        } else {
            showToast('Failed to send answer: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Error sending answer', 'error');
    }
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Format relative time
function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadConversationTasks();
    // Refresh every 30 seconds
    setInterval(loadConversationTasks, 30000);
});
```

### 5.2.3 CSS Styles

```css
/* Conversation Tasks Styles */
.conversation-tasks-section {
    margin-top: 20px;
    padding: 20px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.conversation-tasks-section h3 {
    margin-bottom: 15px;
    color: #333;
}

.task-filters {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}

.filter-btn {
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 20px;
    background: #fff;
    cursor: pointer;
    transition: all 0.2s;
}

.filter-btn:hover, .filter-btn.active {
    background: #007bff;
    color: #fff;
    border-color: #007bff;
}

.task-card {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
    transition: box-shadow 0.2s;
}

.task-card:hover {
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.task-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.task-icon {
    font-size: 24px;
}

.task-title {
    flex: 1;
    font-weight: 600;
    color: #333;
}

.task-time {
    color: #888;
    font-size: 12px;
}

.task-body {
    margin-bottom: 15px;
}

.task-info p {
    margin: 5px 0;
    color: #555;
}

.task-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.2s;
}

.btn:hover {
    opacity: 0.9;
}

.btn-success {
    background: #28a745;
    color: #fff;
}

.btn-danger {
    background: #dc3545;
    color: #fff;
}

.btn-primary {
    background: #007bff;
    color: #fff;
}

.btn-secondary {
    background: #6c757d;
    color: #fff;
}

/* Modal Styles */
.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-content {
    background: #fff;
    padding: 25px;
    border-radius: 8px;
    max-width: 500px;
    width: 90%;
}

.modal-content h4 {
    margin-bottom: 15px;
}

.warning-text {
    background: #fff3cd;
    padding: 10px;
    border-radius: 4px;
    margin: 15px 0;
    border-left: 4px solid #ffc107;
}

.warning-text.danger {
    background: #f8d7da;
    border-color: #dc3545;
}

.modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
}

.form-group {
    margin-bottom: 15px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
}

.form-group textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: vertical;
}

.no-tasks {
    text-align: center;
    color: #888;
    padding: 40px 20px;
}
```

---

# 6. STAGE DEFINITIONS & IF-THEN CONDITIONS (COMPLETE)

## 6.1 Stage Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONVERSATION FLOW STAGES                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  SECTION 1: WELCOME                                                 │
│  ├── first_contact                                                  │
│  ├── name_collection                                                │
│  └── name_confirmed                                                 │
│                                                                     │
│  SECTION 2: SCHEDULE & PROPERTY                                     │
│  ├── property_selection (if multiple)                               │
│  ├── date_collection                                                │
│  ├── date_confirmation                                              │
│  ├── availability_check                                             │
│  ├── price_presentation                                             │
│  └── booking_interest                                               │
│                                                                     │
│  SECTION 3: PAYMENT & CONTRACT                                      │
│  ├── booking_confirmed                                              │
│  ├── contract_pending                                               │
│  ├── payment_link_sent                                              │
│  ├── waiting_for_owner_setup                                        │
│  └── negotiation_passive                                            │
│                                                                     │
│  SECTION 4: CONFIRMATION                                            │
│  ├── payment_pending                                                │
│  ├── payment_confirmed                                              │
│  └── payment_declined                                               │
│                                                                     │
│  SECTION 5: POST-BOOKING                                            │
│  ├── see_you_sent                                                   │
│  ├── pre_arrival                                                    │
│  ├── during_stay                                                    │
│  └── post_checkout                                                  │
│                                                                     │
│  SPECIAL STAGES:                                                    │
│  ├── inquiries (can happen anytime)                                 │
│  ├── unknown_answer (AI asks owner)                                 │
│  ├── owner_mode (different flow)                                    │
│  ├── holding_pattern (guest needs time)                             │
│  ├── offer_conflict (competing offers)                              │
│  └── conversation_end                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6.2 SECTION 1: WELCOME STAGES - COMPLETE IF-THEN CONDITIONS

### Stage: FIRST_CONTACT

This is the entry point for all new conversations. The goal is to welcome the guest and collect their name IF we don't already have it.

```
════════════════════════════════════════════════════════════════════════
STAGE: first_contact
PURPOSE: Welcome guest and collect/confirm their name
ENTRY: New conversation starts
════════════════════════════════════════════════════════════════════════

CONDITION 1.1.1:
  IF: Channel is WhatsApp AND profile_name exists AND profile_name is NOT just a phone number
  THEN:
    - Store guest_name = profile_name
    - Store name_source = 'whatsapp_profile'
    - Set flag name_collected = true
    - Greet them BY NAME: "Hi [Name]! Welcome to [Property Name]. When are you planning to visit?"
  NEXT STAGE: date_collection
  NOTES: WhatsApp profiles often have real names. Trust it if it's not just numbers.

CONDITION 1.1.2:
  IF: Channel is Telegram AND first_name exists in message.from
  THEN:
    - Store guest_name = first_name (optionally + last_name if exists)
    - Store name_source = 'telegram_profile'
    - Set flag name_collected = true
    - Greet them BY NAME: "Hi [Name]! Thanks for reaching out about [Property Name]. What dates are you looking at?"
  NEXT STAGE: date_collection
  NOTES: Telegram always provides first_name. Use it directly.

CONDITION 1.1.3:
  IF: Channel is SMS (no profile info available)
  THEN:
    - Send welcome: "Hi there! Thanks for your inquiry about [Property Name]. May I know your name so I can assist you better?"
  NEXT STAGE: name_collection
  NOTES: SMS doesn't have profiles, so we must ask.

CONDITION 1.1.4:
  IF: Guest message contains self-introduction (e.g., "Hi I'm John", "This is Maria", "My name is...")
  THEN:
    - Extract name using pattern: /(?:i'm|im|i am|this is|my name is|call me)\s+([a-zA-Z]+)/i
    - Store guest_name = extracted name
    - Store name_source = 'self_introduced'
    - Set flag name_collected = true
    - Acknowledge: "Nice to meet you, [Name]! What dates are you looking at for [Property Name]?"
  NEXT STAGE: date_collection
  NOTES: Even if we have profile name, if they introduce themselves, use THEIR introduction.

CONDITION 1.1.5:
  IF: Guest message is just a greeting ("Hi", "Hello", "Good morning") AND we DON'T have name from profile
  THEN:
    - Respond warmly: "Hello! Welcome to [Property Name]. May I know your name?"
  NEXT STAGE: name_collection
  NOTES: Keep it simple, get the name first.

CONDITION 1.1.6:
  IF: Guest message is just a greeting AND we DO have name from profile
  THEN:
    - Use their name: "Hi [Name]! How can I help you today? Are you looking to book [Property Name]?"
  NEXT STAGE: date_collection (if they confirm interest) OR inquiries (if they ask questions)
  NOTES: Skip name collection if we already have it.

CONDITION 1.1.7:
  IF: Guest immediately asks about availability/dates ("Do you have availability next week?")
  THEN:
    - If we have name from profile: "Hi [Name]! Let me check. What specific dates are you looking at?"
    - If no name: "Hi! I'd be happy to check. May I know your name, and what dates you're looking at?"
  NEXT STAGE: date_collection (with name) OR name_collection (without name)
  NOTES: Don't block them, but get the name in the same flow.

CONDITION 1.1.8:
  IF: Guest asks about price/rates ("How much per night?", "What's your rate?")
  THEN:
    - If we have name: "Hi [Name]! Our rates start at $[base_price]/night. When are you thinking of visiting?"
    - If no name: "Hi! Our rates start at $[base_price]/night. May I know your name and preferred dates?"
  NEXT STAGE: date_collection (with name) OR name_collection (without name)
  NOTES: Give ballpark price but push toward date collection for accurate quote.

CONDITION 1.1.9:
  IF: Sender is identified as the property owner (matches owner's chat_id)
  THEN:
    - Switch to owner mode: "Hi [Owner Name]! How can I help you manage your property today?"
    - Set is_owner = true
  NEXT STAGE: owner_mode
  NOTES: Completely different conversation flow for owners.

CONDITION 1.1.10:
  IF: Guest sends media (image/video/voice) as first message
  THEN:
    - If we have name: "Hi [Name]! I see you've sent something. Are you inquiring about [Property Name]?"
    - If no name: "Hello! Thanks for reaching out. May I know your name and how I can help you?"
  NEXT STAGE: name_collection OR date_collection
  NOTES: Don't ignore media but guide them back to conversation flow.
```

### Stage: NAME_COLLECTION

This stage is active when we need to ask for the guest's name.

```
════════════════════════════════════════════════════════════════════════
STAGE: name_collection
PURPOSE: Get the guest's name
ENTRY: first_contact when profile name not available
════════════════════════════════════════════════════════════════════════

CONDITION 1.2.1:
  IF: Guest provides a name (single word, capitalized, or after "I'm/I am/call me")
  THEN:
    - Extract and store: guest_name = provided name
    - Store name_source = 'asked'
    - Set flag name_collected = true
    - Confirm warmly: "Nice to meet you, [Name]! What dates are you looking at?"
  NEXT STAGE: date_collection
  NOTES: Common patterns: "John", "It's Maria", "My name is Alex", "Call me Chris"

CONDITION 1.2.2:
  IF: Guest provides full name ("John Smith", "Maria dela Cruz")
  THEN:
    - Store guest_name = full name
    - Store name_source = 'asked'
    - Set flag name_collected = true
    - Confirm: "Great to meet you, [First Name]! What dates work for you?"
  NEXT STAGE: date_collection
  NOTES: Use first name in conversation, but store full name.

CONDITION 1.2.3:
  IF: Guest ignores name question and asks about property ("Do you have a pool?")
  THEN:
    - Answer the question (if known)
    - Re-ask name: "[Answer]. By the way, may I get your name?"
  NEXT STAGE: name_collection (stay)
  NOTES: Be helpful but persist in getting the name.

CONDITION 1.2.4:
  IF: Guest ignores name question and asks about dates/availability
  THEN:
    - Respond: "I'd be happy to check! May I know your name first, and then your preferred dates?"
  NEXT STAGE: name_collection (stay)
  NOTES: Politely require name before proceeding.

CONDITION 1.2.5:
  IF: Guest responds with something that's clearly NOT a name (numbers, random text)
  THEN:
    - Clarify: "I didn't quite catch that. Could you share your name so I can assist you properly?"
  NEXT STAGE: name_collection (stay)
  NOTES: Don't accept invalid names.

CONDITION 1.2.6:
  IF: Guest refuses to give name ("I don't want to give my name", "Just answer my question")
  THEN:
    - Respect but note: "No problem! I'll refer to you as Guest. How can I help you today?"
    - Store guest_name = 'Guest (preferred anonymous)'
    - Store name_source = 'refused'
    - Set flag name_collected = true
  NEXT STAGE: date_collection OR inquiries
  NOTES: Don't force it, but mark in system that they refused.

CONDITION 1.2.7:
  IF: Guest provides nickname or alias ("Call me J", "Just call me Red")
  THEN:
    - Accept it: "Got it, [Nickname]! What dates are you looking at?"
    - Store guest_name = nickname
    - Store name_source = 'asked_nickname'
    - Set flag name_collected = true
  NEXT STAGE: date_collection
  NOTES: Nicknames are fine. The point is to have something to call them.

CONDITION 1.2.8:
  IF: Multiple messages without name AND ask_count >= 3
  THEN:
    - Stop asking: "Alright! How can I help you today?"
    - Store guest_name = 'Guest'
    - Store name_source = 'not_provided'
    - Set flag name_collected = true
  NEXT STAGE: date_collection OR inquiries
  NOTES: Don't be annoying. 3 attempts max.
```

### Stage: NAME_CONFIRMED

This is a transitional stage confirming we have the name and moving forward.

```
════════════════════════════════════════════════════════════════════════
STAGE: name_confirmed
PURPOSE: Acknowledge name and transition to dates
ENTRY: name_collection when name is collected
════════════════════════════════════════════════════════════════════════

CONDITION 1.3.1:
  IF: Name just collected AND no dates mentioned yet
  THEN:
    - Transition: "Perfect, [Name]! Now, when are you planning to visit [Property Name]?"
  NEXT STAGE: date_collection
  NOTES: This is often a quick pass-through stage.

CONDITION 1.3.2:
  IF: Name collected AND guest already mentioned dates in same message
  THEN:
    - Skip this stage entirely
    - Process the dates
  NEXT STAGE: date_confirmation
  NOTES: Don't repeat questions unnecessarily.

CONDITION 1.3.3:
  IF: Name collected AND guest has a question
  THEN:
    - Answer the question
    - Then ask about dates
  NEXT STAGE: inquiries (temporarily) THEN date_collection
  NOTES: Handle their immediate need, then proceed.
```

---

## 6.3 SECTION 2: SCHEDULE & PROPERTY STAGES - COMPLETE IF-THEN CONDITIONS

### Stage: PROPERTY_SELECTION

Only applies when owner has multiple properties.

```
════════════════════════════════════════════════════════════════════════
STAGE: property_selection
PURPOSE: Help guest choose which property they want
ENTRY: first_contact when owner has multiple properties
════════════════════════════════════════════════════════════════════════

CONDITION 2.1.1:
  IF: Owner has only ONE property
  THEN:
    - Auto-select that property
    - Store selected_property_id = property_id
    - Store selected_property_name = property_name
    - Set flag property_selected = true
  NEXT STAGE: date_collection (skip this stage entirely)
  NOTES: No need to ask if there's only one option.

CONDITION 2.1.2:
  IF: Owner has multiple properties AND guest came from specific property link/ad
  THEN:
    - Auto-select the property from the source
    - Confirm: "You're inquiring about [Property Name], right?"
  NEXT STAGE: date_collection (if confirmed)
  NOTES: UTM parameters or referral links can indicate source.

CONDITION 2.1.3:
  IF: Owner has multiple properties AND guest didn't specify
  THEN:
    - Present options: "We have several lovely properties! Are you interested in:
      1. [Property A] - [brief description]
      2. [Property B] - [brief description]
      Which one catches your eye?"
  NEXT STAGE: property_selection (wait for response)
  NOTES: Keep descriptions short - 1 line each.

CONDITION 2.1.4:
  IF: Guest selects a property by name or number
  THEN:
    - Store selected_property_id and selected_property_name
    - Set flag property_selected = true
    - Confirm: "Great choice! [Property Name] is wonderful. What dates are you looking at?"
  NEXT STAGE: date_collection
  NOTES: Accept "1", "the first one", or the property name.

CONDITION 2.1.5:
  IF: Guest asks about differences between properties
  THEN:
    - Provide comparison (if info available in database)
    - If not: "Let me check with the owner about that. In the meantime, which one sounds more appealing?"
  NEXT STAGE: property_selection (wait) OR unknown_answer (if need owner input)
  NOTES: Don't make up property differences.

CONDITION 2.1.6:
  IF: Guest wants to know availability for ALL properties before choosing
  THEN:
    - "I can check availability for all of them. What dates are you looking at?"
    - Note: will check all properties
  NEXT STAGE: date_collection (then check availability for all)
  NOTES: Reasonable request - accommodate it.
```

### Stage: DATE_COLLECTION

Getting the check-in and check-out dates from the guest.

```
════════════════════════════════════════════════════════════════════════
STAGE: date_collection
PURPOSE: Get check-in and check-out dates
ENTRY: name_confirmed or property_selection
════════════════════════════════════════════════════════════════════════

CONDITION 2.2.1:
  IF: Guest provides both dates explicitly ("March 15-18", "March 15 to March 18", "15th to 18th")
  THEN:
    - Parse and store check_in_date and check_out_date
    - Calculate num_nights
    - Store dates_source = 'explicit'
    - Set flag dates_collected = true
  NEXT STAGE: date_confirmation
  NOTES: Accept various formats - be flexible in parsing.

CONDITION 2.2.2:
  IF: Guest provides only check-in date ("March 15", "next Friday")
  THEN:
    - Store the check-in date
    - Ask: "Got it, [date]. How many nights will you be staying?" OR "And when will you be checking out?"
  NEXT STAGE: date_collection (stay - wait for check-out)
  NOTES: Need both dates to proceed.

CONDITION 2.2.3:
  IF: Guest provides number of nights ("3 nights", "for a week")
  THEN:
    - Ask: "Perfect, [X] nights! What's your check-in date?"
    - Store num_nights
  NEXT STAGE: date_collection (stay - wait for check-in)
  NOTES: Can calculate check-out once we have check-in.

CONDITION 2.2.4:
  IF: Guest provides check-in and number of nights ("March 15 for 3 nights")
  THEN:
    - Calculate check_out_date = check_in_date + num_nights
    - Store both dates
    - Set flag dates_collected = true
  NEXT STAGE: date_confirmation
  NOTES: Common pattern - handle it smoothly.

CONDITION 2.2.5:
  IF: Guest gives relative dates ("this weekend", "next weekend", "tomorrow", "next month")
  THEN:
    - Resolve to actual dates using today's date as reference
    - Store with dates_source = 'relative_resolved'
    - "This weekend" = Fri-Sun, "Next weekend" = Following Fri-Sun
    - Confirm: "Just to confirm, that would be Friday March 15 to Sunday March 17 (2 nights)?"
  NEXT STAGE: date_confirmation
  NOTES: Always confirm resolved relative dates explicitly.

CONDITION 2.2.6:
  IF: Guest is flexible ("any weekend", "whenever available", "no specific dates")
  THEN:
    - Query calendar for next available dates
    - Offer options: "I have availability this weekend (Mar 15-17), next weekend (Mar 22-24), and the following weekend (Mar 29-31). Which works best for you?"
  NEXT STAGE: date_collection (stay - wait for them to pick)
  NOTES: Help them decide by providing concrete options.

CONDITION 2.2.7:
  IF: Guest asks about specific date availability before committing ("Is March 15 available?")
  THEN:
    - Check calendar first
    - If available: "Yes, March 15 is open! How many nights are you looking at?"
    - If not available: "Unfortunately March 15 is booked. How about [alternative date]?"
  NEXT STAGE: date_collection (continue gathering)
  NOTES: Answer their question, then continue collecting.

CONDITION 2.2.8:
  IF: Guest provides dates that are in the past
  THEN:
    - Clarify: "It looks like those dates have passed. Did you mean [future equivalent]?"
  NEXT STAGE: date_collection (stay)
  NOTES: They might have meant next year or a typo.

CONDITION 2.2.9:
  IF: Guest provides dates that are too far in advance (> max_advance_booking days)
  THEN:
    - If max_advance_booking is set: "We only accept bookings up to [X] months in advance. Would you like to check back closer to your dates?"
    - If not set: Accept the dates
  NEXT STAGE: date_confirmation (if accepted) OR date_collection (if need different dates)
  NOTES: Some properties limit how far ahead you can book.

CONDITION 2.2.10:
  IF: Guest provides dates that violate min_stay or max_stay
  THEN:
    - If too short: "Our minimum stay is [X] nights. Would [adjusted dates] work for you?"
    - If too long: "Our maximum stay is [X] nights. Would you like to book [X] nights initially?"
  NEXT STAGE: date_collection (stay - wait for confirmation)
  NOTES: Be helpful, offer alternatives.

CONDITION 2.2.11:
  IF: Guest mentions they're checking multiple properties/comparing
  THEN:
    - Be understanding: "Of course! Let me know the dates you're considering and I'll check availability."
    - Don't be pushy
  NEXT STAGE: date_collection (continue)
  NOTES: Competitive situation - be helpful, not desperate.

CONDITION 2.2.12:
  IF: Guest changes topic or asks unrelated question
  THEN:
    - Answer their question
    - Gently return: "Happy to help with that! Now, what dates were you looking at?"
  NEXT STAGE: date_collection (return after answering)
  NOTES: Handle digressions gracefully.
```

### Stage: DATE_CONFIRMATION

Confirming the dates before checking availability.

```
════════════════════════════════════════════════════════════════════════
STAGE: date_confirmation
PURPOSE: Confirm dates are correct before proceeding
ENTRY: date_collection when both dates collected
════════════════════════════════════════════════════════════════════════

CONDITION 2.3.1:
  IF: System presents dates AND guest confirms ("yes", "correct", "that's right", "perfect")
  THEN:
    - Set flag dates_confirmed = true
    - Store confirmed_check_in_date and confirmed_check_out_date
  NEXT STAGE: availability_check
  NOTES: Move forward confidently.

CONDITION 2.3.2:
  IF: Guest says dates are wrong or provides correction ("No, I meant...", "Actually...")
  THEN:
    - Clear previous dates
    - Store new dates if provided
    - Re-confirm the new dates
  NEXT STAGE: date_confirmation (with new dates) OR date_collection (if unclear)
  NOTES: Don't get frustrated - just correct and continue.

CONDITION 2.3.3:
  IF: Guest wants to change just one date ("Can we do the 16th instead of 15th?")
  THEN:
    - Update the specific date
    - Recalculate num_nights
    - Confirm: "Updated to March 16-18 (2 nights). Is that correct?"
  NEXT STAGE: date_confirmation (re-confirm)
  NOTES: Be flexible with changes.

CONDITION 2.3.4:
  IF: Guest confirms but immediately asks about adding nights
  THEN:
    - Adjust dates accordingly
    - Confirm new dates
  NEXT STAGE: date_confirmation (re-confirm with new dates)
  NOTES: They're still in discovery mode.

CONDITION 2.3.5:
  IF: Guest asks about price BEFORE confirming dates
  THEN:
    - "I'll give you the exact pricing once we confirm these dates. So, March 15-18 (3 nights) - does that work?"
  NEXT STAGE: date_confirmation (push for confirmation)
  NOTES: Need dates confirmed for accurate pricing.

CONDITION 2.3.6:
  IF: Guest goes silent after date presentation (no response for extended time)
  THEN:
    - Follow up scheduled at +24h: "Hi [Name]! Just checking if March 15-18 still works for you?"
  NEXT STAGE: date_confirmation (wait with follow-up)
  NOTES: Don't spam but do follow up.
```

### Stage: AVAILABILITY_CHECK

Checking if the property is available for the confirmed dates.

```
════════════════════════════════════════════════════════════════════════
STAGE: availability_check
PURPOSE: Check calendar and handle availability
ENTRY: date_confirmation when dates confirmed
════════════════════════════════════════════════════════════════════════

CONDITION 2.4.1:
  IF: Calendar check returns AVAILABLE
  THEN:
    - Set flag availability_checked = true
    - Immediately calculate and show price (don't ask "do you want to know the price?")
    - "Great news, [Name]! [Property] is available March 15-18. The total for 3 nights is $[amount]."
  NEXT STAGE: price_presentation
  NOTES: Never ask if they want to know price - always show it.

CONDITION 2.4.2:
  IF: Calendar check returns NOT AVAILABLE
  THEN:
    - Query for nearest available dates
    - Offer alternatives: "Unfortunately those dates are booked. I have availability:
      - March 22-25 (Fri-Mon)
      - March 29-Apr 1 (Fri-Mon)
      Would either of those work?"
  NEXT STAGE: date_collection (re-enter with alternatives)
  NOTES: Always offer alternatives, don't just say no.

CONDITION 2.4.3:
  IF: Calendar check returns PARTIALLY AVAILABLE (e.g., can do 2 of 3 nights)
  THEN:
    - Explain: "I can accommodate March 15-17 (2 nights), but March 17 is booked. Would 2 nights work, or should I check other dates?"
  NEXT STAGE: date_collection (modified dates) OR date_confirmation (if they accept partial)
  NOTES: Give them options.

CONDITION 2.4.4:
  IF: Calendar check shows COMPETING OFFER (another guest interested in same dates)
  THEN:
    - Notify WF2: Offer Conflict Manager
    - Tell guest: "Those dates are available! I should mention another guest is also considering them. Would you like to proceed with booking?"
  NEXT STAGE: offer_conflict (if same dates) OR price_presentation (if different enough)
  NOTES: Transparency but also gentle urgency.

CONDITION 2.4.5:
  IF: Calendar check fails (API error, timeout)
  THEN:
    - "Let me double-check the calendar. One moment..."
    - Retry once
    - If still fails: "I'm having trouble checking right now. Let me get back to you shortly."
    - Notify owner of system issue
  NEXT STAGE: availability_check (retry) OR unknown_answer (escalate)
  NOTES: Don't pretend availability if we can't verify.

CONDITION 2.4.6:
  IF: Property requires manual availability confirmation (no calendar integration)
  THEN:
    - "Let me confirm availability with the owner. I'll message you back within [X hours]."
    - Create task for owner
    - Set owner_action_required = true, owner_action_type = 'confirm_availability'
  NEXT STAGE: waiting_for_owner (custom sub-stage)
  NOTES: Some properties don't have automated calendars.
```

### Stage: PRICE_PRESENTATION

Showing the price and gauging interest.

```
════════════════════════════════════════════════════════════════════════
STAGE: price_presentation
PURPOSE: Present pricing and gauge booking interest
ENTRY: availability_check when available
════════════════════════════════════════════════════════════════════════

CONDITION 2.5.1:
  IF: Price shown AND guest responds positively ("Sounds good", "Great", "Let's do it", "I'll take it")
  THEN:
    - Set flag price_shown = true
    - Set flag booking_agreed = true
    - Confirm details before proceeding: "Excellent! Just to confirm: [Property], March 15-18, $[amount] total. Ready to proceed with booking?"
  NEXT STAGE: booking_confirmed (after final confirmation)
  NOTES: Always do a final summary confirmation.

CONDITION 2.5.2:
  IF: Price shown AND guest responds neutrally ("Ok", "I see", "Hmm")
  THEN:
    - Set flag price_shown = true
    - Gently ask: "How does that sound for you? Would you like to proceed?"
  NEXT STAGE: booking_interest (wait for decision)
  NOTES: Don't assume neutral is negative.

CONDITION 2.5.3:
  IF: Price shown AND guest says it's too expensive ("That's too much", "Can you do better?")
  THEN:
    - Set flag price_shown = true
    - Check if property has flexible pricing:
      - If yes: "I understand. Let me see what I can do..." (notify owner)
      - If no: "I understand budget is important. This is our best rate for peak season. Would you like me to check for any available discounts?"
  NEXT STAGE: negotiation_passive OR booking_interest
  NOTES: AI does NOT negotiate directly. Owner decides.

CONDITION 2.5.4:
  IF: Guest asks about what's included in the price
  THEN:
    - List inclusions from property config: "The $[amount] includes:
      - [X] bedrooms, [X] bathrooms
      - WiFi, parking (if applicable)
      - [Amenities list]
      - Cleaning fee ($[X]) is included in the total"
  NEXT STAGE: price_presentation (stay - continue conversation)
  NOTES: Be informative, help them see value.

CONDITION 2.5.5:
  IF: Guest asks for price breakdown
  THEN:
    - Provide detailed breakdown:
      "[X] nights @ $[rate]/night = $[subtotal]
      Cleaning fee: $[cleaning_fee]
      Service fee: $[service_fee]
      Total: $[total]"
  NEXT STAGE: price_presentation (stay)
  NOTES: Transparency builds trust.

CONDITION 2.5.6:
  IF: Guest asks about discounts (weekly, monthly, etc.)
  THEN:
    - Check property config for discount rules
    - If applicable: "Good news! For [X]+ nights, we offer [Y]% off. Would you like to extend your stay?"
    - If not: "Our rates are consistent to ensure quality for all guests."
  NEXT STAGE: price_presentation (stay) OR date_collection (if they want different dates)
  NOTES: Promote longer stays if discounts exist.

CONDITION 2.5.7:
  IF: Guest compares to other properties ("Property X is cheaper")
  THEN:
    - Don't badmouth competition
    - Highlight unique value: "I understand! [Property] offers [unique features]. But I want you to choose what's best for you."
  NEXT STAGE: price_presentation (stay)
  NOTES: Confidence, not desperation.

CONDITION 2.5.8:
  IF: Guest wants time to think ("Let me think about it", "I'll get back to you")
  THEN:
    - Be supportive: "Of course, [Name]! Take your time. Just let me know if you have any questions. I'll hold the dates for now but can't guarantee availability."
    - Schedule follow-up at +24h
  NEXT STAGE: holding_pattern
  NOTES: Gentle urgency without pressure.
```

### Stage: BOOKING_INTEREST

Waiting for the guest's final decision on booking.

```
════════════════════════════════════════════════════════════════════════
STAGE: booking_interest
PURPOSE: Get final booking decision
ENTRY: price_presentation after showing price
════════════════════════════════════════════════════════════════════════

CONDITION 2.6.1:
  IF: Guest says YES ("Yes", "Book it", "Let's proceed", "I want to book")
  THEN:
    - Set flag booking_agreed = true
    - Final confirmation: "Perfect, [Name]! Booking [Property] for March 15-18 at $[amount]. Let me get the contract and payment details ready."
  NEXT STAGE: booking_confirmed
  NOTES: Clear green light.

CONDITION 2.6.2:
  IF: Guest says MAYBE ("Maybe", "I'm considering", "Let me discuss with family")
  THEN:
    - Be supportive: "No problem! Let me know once you've decided. I'll try to hold these dates for you."
    - Schedule follow-up at +24h
  NEXT STAGE: holding_pattern
  NOTES: Don't lose the lead, but don't push.

CONDITION 2.6.3:
  IF: Guest says NO ("No thanks", "Too expensive", "Changed my mind", "Found another place")
  THEN:
    - Be gracious: "I understand, [Name]. Thank you for considering [Property]. If your plans change, feel free to reach out!"
    - Optional: "May I ask what made you decide differently? It helps us improve."
  NEXT STAGE: conversation_end
  NOTES: Exit gracefully, door stays open.

CONDITION 2.6.4:
  IF: Guest asks additional questions before deciding
  THEN:
    - Answer their questions
    - Gently return to decision: "Does that help? Would you like to proceed with the booking?"
  NEXT STAGE: booking_interest (stay)
  NOTES: Normal buying behavior - they're gathering info.

CONDITION 2.6.5:
  IF: Guest goes silent (no response for 24+ hours)
  THEN:
    - Send friendly follow-up: "Hi [Name]! Just checking in about the [Property] booking for March 15-18. Still interested?"
  NEXT STAGE: booking_interest (stay with follow-up)
  NOTES: One follow-up, not spam.

CONDITION 2.6.6:
  IF: Guest returns after silence with continued interest
  THEN:
    - Re-check availability (dates might have changed)
    - If still available: "Great to hear from you! Good news - March 15-18 is still available. Ready to proceed?"
    - If no longer available: "Welcome back! Unfortunately those dates got booked. I have [alternatives] available."
  NEXT STAGE: booking_confirmed (if available and yes) OR date_collection (if need new dates)
  NOTES: Always re-verify availability after gaps.
```

---

## 6.4 SECTION 3: PAYMENT & CONTRACT STAGES - COMPLETE IF-THEN CONDITIONS

### Stage: BOOKING_CONFIRMED

Guest agreed to book. Now handle contract and payment.

```
════════════════════════════════════════════════════════════════════════
STAGE: booking_confirmed
PURPOSE: Initiate contract and payment process
ENTRY: booking_interest when guest confirms booking
════════════════════════════════════════════════════════════════════════

CONDITION 3.1.1:
  IF: Property has contract configured AND has payment details configured
  THEN:
    - Send contract first: "Here's the booking agreement for your review: [contract_url]. Once you've signed, I'll send the payment details."
    - Set flag contract_sent = true
  NEXT STAGE: contract_pending
  NOTES: Contract before payment is standard flow.

CONDITION 3.1.2:
  IF: Property has NO contract BUT has payment details
  THEN:
    - Skip contract, send payment: "Great! Here are the payment details:
      [Bank/GCash/Payment Link details]
      Total: $[amount]
      Please send payment and let me know once done!"
    - Set flag payment_link_sent = true
  NEXT STAGE: payment_link_sent
  NOTES: Not all properties require contracts.

CONDITION 3.1.3:
  IF: Property has contract BUT no payment details configured
  THEN:
    - Send contract: "Here's the booking agreement: [contract_url]"
    - Notify owner: "Guest ready to pay but payment details not configured"
    - Tell guest: "I'm getting the payment details from the owner. I'll send them shortly!"
    - Set owner_action_required = true, owner_action_type = 'provide_payment_details'
  NEXT STAGE: contract_pending (with parallel owner notification)
  NOTES: Can proceed with contract while waiting for payment details.

CONDITION 3.1.4:
  IF: Property has NEITHER contract NOR payment details
  THEN:
    - Notify owner immediately: "Guest confirmed booking but contract and payment details not configured!"
    - Tell guest: "Let me finalize the booking details with the property owner. I'll message you shortly with everything you need!"
    - Set owner_action_required = true, owner_action_type = 'provide_contract_and_payment'
  NEXT STAGE: waiting_for_owner_setup
  NOTES: Can't proceed without at least payment details.

CONDITION 3.1.5:
  IF: Guest asks about cancellation policy
  THEN:
    - Check property config for cancellation policy
    - If exists: Share the policy
    - If not: "Let me check the cancellation policy with the owner and get back to you."
    - Set pending_question = 'cancellation_policy'
  NEXT STAGE: booking_confirmed (stay) OR unknown_answer (if need owner)
  NOTES: Important pre-payment question - handle it.

CONDITION 3.1.6:
  IF: Guest asks about deposit vs full payment
  THEN:
    - Check property config for deposit options
    - If deposit allowed: "You can secure your booking with a $[deposit] deposit. The balance would be due [X days] before check-in."
    - If full payment only: "We require full payment to confirm the booking."
  NEXT STAGE: booking_confirmed (stay)
  NOTES: Be clear about payment expectations.
```

### Stage: CONTRACT_PENDING

Contract has been sent, waiting for guest to sign.

```
════════════════════════════════════════════════════════════════════════
STAGE: contract_pending
PURPOSE: Wait for contract signature
ENTRY: booking_confirmed when contract sent
════════════════════════════════════════════════════════════════════════

CONDITION 3.2.1:
  IF: Guest says they've signed ("Signed", "Done", "Completed the contract")
  THEN:
    - Set flag contract_signed = true
    - Thank them and send payment: "Thank you for signing! Here are the payment details: [payment_info]"
  NEXT STAGE: payment_link_sent
  NOTES: Don't verify signature automatically - trust and proceed.

CONDITION 3.2.2:
  IF: Guest has questions about contract terms
  THEN:
    - AI does NOT interpret or negotiate contracts
    - "That's a great question about the contract. Let me check with the property owner to make sure I give you accurate information."
    - Set pending_question = guest's question
    - Set owner_action_required = true, owner_action_type = 'answer_contract_question'
  NEXT STAGE: unknown_answer
  NOTES: CRITICAL - AI never answers legal/contract questions.

CONDITION 3.2.3:
  IF: Guest wants to negotiate contract terms ("Can we change...", "I don't agree with...")
  THEN:
    - Step back entirely: "I understand you have concerns about the terms. Let me connect you with the property owner to discuss this directly."
    - Notify owner with specifics
    - Set owner_action_required = true, owner_action_type = 'contract_negotiation'
  NEXT STAGE: negotiation_passive
  NOTES: AI never negotiates. Owner handles all negotiations.

CONDITION 3.2.4:
  IF: Guest says they can't access/open the contract
  THEN:
    - Offer alternatives: "Sorry about that! Let me try sending it another way: [alternative link or attached PDF]"
    - If no alternative: "Let me check with the owner about this."
  NEXT STAGE: contract_pending (stay)
  NOTES: Technical issues happen - be helpful.

CONDITION 3.2.5:
  IF: Guest goes silent after contract sent (24+ hours)
  THEN:
    - Send gentle reminder: "Hi [Name]! Just checking if you had a chance to review the booking agreement? Let me know if you have any questions!"
  NEXT STAGE: contract_pending (stay with follow-up)
  NOTES: One reminder, then wait.

CONDITION 3.2.6:
  IF: Guest says they changed their mind / want to cancel
  THEN:
    - Be understanding: "I understand, [Name]. No problem at all. If your plans change, feel free to reach out!"
  NEXT STAGE: conversation_end
  NOTES: Graceful exit. Don't try to convince.
```

### Stage: PAYMENT_LINK_SENT

Payment details have been sent, waiting for guest to pay.

```
════════════════════════════════════════════════════════════════════════
STAGE: payment_link_sent
PURPOSE: Wait for guest to send payment
ENTRY: contract_pending when signed, OR booking_confirmed when no contract
════════════════════════════════════════════════════════════════════════

CONDITION 3.3.1:
  IF: Guest says they've paid ("Paid", "Sent", "Done", "Payment sent", "Just transferred")
  THEN:
    - Thank them: "Thank you, [Name]! I'm verifying the payment with the property owner. You'll receive confirmation shortly!"
    - DO NOT confirm payment yourself
    - Notify owner: Create payment task
    - Set owner_action_required = true, owner_action_type = 'confirm_payment'
  NEXT STAGE: payment_pending
  NOTES: CRITICAL - Only owner can confirm payment.

CONDITION 3.3.2:
  IF: Guest sends payment proof/screenshot
  THEN:
    - Acknowledge: "Got it! I'm forwarding this to the property owner for verification. You'll get confirmation soon!"
    - Forward proof to owner
    - Set owner_action_required = true, owner_action_type = 'confirm_payment'
  NEXT STAGE: payment_pending
  NOTES: Screenshots are helpful but don't auto-confirm.

CONDITION 3.3.3:
  IF: Guest asks about payment methods/alternatives
  THEN:
    - Share available methods from property config
    - "We accept: [list methods]. Which works best for you?"
  NEXT STAGE: payment_link_sent (stay)
  NOTES: Be helpful with payment options.

CONDITION 3.3.4:
  IF: Guest reports payment failed/declined
  THEN:
    - Troubleshoot: "Sorry to hear that. Let's try an alternative method: [other option]"
    - If no alternatives: Notify owner
  NEXT STAGE: payment_link_sent (stay)
  NOTES: Work with them to find a solution.

CONDITION 3.3.5:
  IF: Guest asks to pay in installments
  THEN:
    - Check property config for installment options
    - If allowed: Explain terms
    - If not: "Currently we require payment in full. Would you like to proceed?"
    - If unsure: Ask owner
  NEXT STAGE: payment_link_sent (stay) OR unknown_answer (if need owner)
  NOTES: Payment terms are owner's decision.

CONDITION 3.3.6:
  IF: Guest asks how long they have to pay
  THEN:
    - Check property config for payment deadline
    - If set: "Please complete payment within [X hours/days] to secure your booking."
    - If not set: "I recommend paying soon to secure your dates, as we can't hold them indefinitely."
  NEXT STAGE: payment_link_sent (stay)
  NOTES: Create gentle urgency.

CONDITION 3.3.7:
  IF: 24 hours pass with no payment
  THEN:
    - Send reminder: "Hi [Name]! Just a friendly reminder about the payment for your [Property] booking (March 15-18). Let me know if you need any help!"
    - Set follow_up_type = 'payment_reminder_24h'
  NEXT STAGE: payment_link_sent (stay)
  NOTES: Gentle nudge.

CONDITION 3.3.8:
  IF: 48 hours pass with no payment (after 24h reminder)
  THEN:
    - Final reminder: "Hi [Name]! I wanted to check in about your [Property] booking. Are you still interested in March 15-18? I can only hold the dates a bit longer."
    - Notify owner of potential drop-off
    - Set follow_up_type = 'payment_reminder_48h'
  NEXT STAGE: payment_link_sent (stay) OR holding_pattern (if they respond they need more time)
  NOTES: Last reminder before potentially releasing dates.
```

### Stage: WAITING_FOR_OWNER_SETUP

Owner hasn't configured payment/contract details.

```
════════════════════════════════════════════════════════════════════════
STAGE: waiting_for_owner_setup
PURPOSE: Wait for owner to provide missing configuration
ENTRY: booking_confirmed when payment/contract details missing
════════════════════════════════════════════════════════════════════════

CONDITION 3.4.1:
  IF: Owner provides payment details (via Control Panel or Telegram)
  THEN:
    - Update property config
    - If contract was pending: Continue to payment_link_sent
    - If contract also missing: Check if owner provided contract too
    - Message guest: "Great news! Here are the payment details: [details]"
  NEXT STAGE: payment_link_sent (if ready) OR contract_pending (if contract needed)
  NOTES: Resume normal flow once owner provides info.

CONDITION 3.4.2:
  IF: Guest messages while waiting
  THEN:
    - Reassure them: "I'm just waiting for the final details from the property owner. Should be ready shortly!"
    - Check if owner has responded
  NEXT STAGE: waiting_for_owner_setup (stay)
  NOTES: Keep guest informed and warm.

CONDITION 3.4.3:
  IF: 1 hour passes with no owner response
  THEN:
    - Send owner reminder (Telegram + Control Panel notification)
    - Increment owner_reminder_count
  NEXT STAGE: waiting_for_owner_setup (stay)
  NOTES: Gentle owner reminders.

CONDITION 3.4.4:
  IF: 4 hours pass with no owner response
  THEN:
    - Escalate: More urgent owner notification
    - Message guest: "I apologize for the delay. The owner is being notified. We'll have everything ready for you soon!"
  NEXT STAGE: waiting_for_owner_setup (stay)
  NOTES: Don't lose the booking because of slow owner.

CONDITION 3.4.5:
  IF: Owner says they can't accept this booking
  THEN:
    - Apologize to guest: "I'm sorry, but unfortunately this booking can't be completed at this time. We apologize for the inconvenience."
    - Optionally offer alternatives if owner has other properties
  NEXT STAGE: conversation_end
  NOTES: Rare but handle gracefully.
```

### Stage: NEGOTIATION_PASSIVE

Guest is negotiating terms - AI steps back, owner handles.

```
════════════════════════════════════════════════════════════════════════
STAGE: negotiation_passive
PURPOSE: Step back from negotiation, owner handles directly
ENTRY: contract_pending or price_presentation when guest wants to negotiate
════════════════════════════════════════════════════════════════════════

CONDITION 3.5.1:
  IF: Owner reaches agreement with guest (notified via Control Panel or Telegram)
  THEN:
    - Resume with agreed terms
    - "Great news! The owner has agreed to [terms]. Shall we proceed with booking?"
  NEXT STAGE: booking_confirmed (with new terms)
  NOTES: Owner sets the terms, AI resumes.

CONDITION 3.5.2:
  IF: Guest messages AI during negotiation
  THEN:
    - Acknowledge: "I understand. The property owner is reviewing your request. They'll get back to you soon!"
    - Forward message to owner if substantive
  NEXT STAGE: negotiation_passive (stay)
  NOTES: AI is just a messenger during negotiation.

CONDITION 3.5.3:
  IF: Owner declines negotiation
  THEN:
    - Communicate kindly: "The owner has considered your request but unfortunately can't adjust the terms. Would you still like to proceed with the original offer?"
  NEXT STAGE: booking_interest (back to decision) OR conversation_end (if they decline)
  NOTES: Don't make the guest feel bad.

CONDITION 3.5.4:
  IF: Negotiation takes too long (24+ hours without resolution)
  THEN:
    - Check with guest: "Hi [Name]! Just checking in - are you and the owner still discussing terms? Let me know how I can help."
    - Ping owner if they haven't responded
  NEXT STAGE: negotiation_passive (stay)
  NOTES: Keep things moving.
```

---

## 6.5 SECTION 4: CONFIRMATION STAGES - COMPLETE IF-THEN CONDITIONS

### Stage: PAYMENT_PENDING

Payment details sent, waiting for owner to confirm receipt.

```
════════════════════════════════════════════════════════════════════════
STAGE: payment_pending
PURPOSE: Wait for owner to confirm payment received
ENTRY: payment_link_sent when guest says they paid
════════════════════════════════════════════════════════════════════════

CONDITION 4.1.1:
  IF: Owner confirms payment received (via Control Panel)
  THEN:
    - Update booking status to 'confirmed'
    - Update payment status to 'paid'
    - Send guest confirmation: "Payment confirmed! Your booking for [Property] from March 15-18 is all set!"
    - Set flag payment_confirmed = true
  NEXT STAGE: see_you_sent
  NOTES: Main success path.

CONDITION 4.1.2:
  IF: Owner confirms payment received (via Telegram reply "CONFIRM [booking_id]")
  THEN:
    - Same as above
    - Also sync to Control Panel (mark task complete)
  NEXT STAGE: see_you_sent
  NOTES: Telegram confirmation should sync with Control Panel.

CONDITION 4.1.3:
  IF: Owner declines payment (says not received or wrong amount)
  THEN:
    - Check with guest: "[Name], the payment hasn't been confirmed yet. Could you double-check or share a payment receipt?"
    - Do NOT cancel booking immediately
  NEXT STAGE: payment_pending (stay - give guest chance to clarify)
  NOTES: Could be a delay or confusion.

CONDITION 4.1.4:
  IF: Owner explicitly declines/cancels booking
  THEN:
    - Notify guest: "I'm sorry, but the booking has been cancelled. [reason if provided]. We apologize for any inconvenience."
    - Update booking status to 'cancelled'
    - Set is_active = false, closed_reason = 'declined'
  NEXT STAGE: conversation_end
  NOTES: Rare but handle it.

CONDITION 4.1.5:
  IF: Guest asks about confirmation status
  THEN:
    - Reassure: "I'm verifying the payment with the property owner. You should receive confirmation very soon!"
    - If taking too long (>2 hours), ping owner
  NEXT STAGE: payment_pending (stay)
  NOTES: Keep guest informed.

CONDITION 4.1.6:
  IF: Guest wants to cancel before confirmation
  THEN:
    - Ask: "No problem if you've changed your mind. Just to confirm - would you like to cancel the booking?"
    - If yes: "Cancelled as requested. If you need a refund, let me coordinate with the owner."
    - Notify owner of cancellation
  NEXT STAGE: conversation_end
  NOTES: Guest can cancel before confirmation.

CONDITION 4.1.7:
  IF: 2 hours pass with no owner action
  THEN:
    - Ping owner: "Reminder: Payment pending confirmation for [Guest] booking [Property] March 15-18."
    - Increment owner_reminder_count
  NEXT STAGE: payment_pending (stay)
  NOTES: Don't let guest wait too long.

CONDITION 4.1.8:
  IF: 6 hours pass with no owner action
  THEN:
    - Urgent ping to owner
    - Message guest: "I apologize for the delay in confirmation. The owner has been notified and you should hear back soon."
  NEXT STAGE: payment_pending (stay)
  NOTES: Escalation for slow confirmation.
```

### Stage: PAYMENT_CONFIRMED

Payment is confirmed! Send full booking details.

```
════════════════════════════════════════════════════════════════════════
STAGE: payment_confirmed
PURPOSE: Confirm payment and prepare for see_you message
ENTRY: payment_pending when owner confirms
════════════════════════════════════════════════════════════════════════

CONDITION 4.2.1:
  IF: Payment just confirmed
  THEN:
    - Generate booking confirmation with all details
    - Message: "
      Your Booking is Confirmed!

      Property: [Property Name]
      Address: [Full address]
      Check-in: Friday, March 15, 2026 (3:00 PM)
      Check-out: Monday, March 18, 2026 (11:00 AM)
      Guests: [X]

      Total Paid: $[amount]

      We're excited to host you!
      "
  NEXT STAGE: see_you_sent
  NOTES: This is the celebration moment.

CONDITION 4.2.2:
  IF: Guest responds to confirmation happily
  THEN:
    - Match their energy: "Can't wait to have you! Feel free to reach out if you have any questions before your stay."
  NEXT STAGE: see_you_sent
  NOTES: Keep positive momentum.

CONDITION 4.2.3:
  IF: Guest asks about check-in instructions
  THEN:
    - Check property config for check-in instructions
    - If exists: Share details
    - If not: "I'll send check-in instructions [X days] before your arrival."
    - Note to send pre_arrival message
  NEXT STAGE: see_you_sent (or pre_arrival if close to date)
  NOTES: They might be planning ahead.
```

### Stage: PAYMENT_DECLINED

Owner declined the payment/booking.

```
════════════════════════════════════════════════════════════════════════
STAGE: payment_declined
PURPOSE: Handle declined payment/booking
ENTRY: payment_pending when owner declines
════════════════════════════════════════════════════════════════════════

CONDITION 4.3.1:
  IF: Owner declined due to payment issue (wrong amount, not received, fraud concern)
  THEN:
    - Communicate to guest: "There seems to be an issue with the payment. [Specific reason if provided]. Could you please verify and try again?"
    - Do NOT close conversation yet
  NEXT STAGE: payment_link_sent (give them another chance)
  NOTES: Payment issues can be resolved.

CONDITION 4.3.2:
  IF: Owner declined booking entirely (dates no longer available, changed mind)
  THEN:
    - Apologize to guest: "I'm very sorry, but the booking cannot be completed. [reason if provided]"
    - If payment was sent: "The owner will process a refund for you shortly."
    - If owner has other properties: "I do have [alternatives] available if you're interested?"
  NEXT STAGE: conversation_end OR property_selection (if alternatives)
  NOTES: Handle gracefully, offer alternatives.

CONDITION 4.3.3:
  IF: Guest disputes the decline
  THEN:
    - Mediate: "I understand this is frustrating. Let me check with the owner again."
    - Notify owner of dispute
    - Set owner_action_required = true, owner_action_type = 'resolve_dispute'
  NEXT STAGE: payment_declined (stay - wait for resolution)
  NOTES: Try to resolve disputes fairly.
```

---

## 6.6 SECTION 5: POST-BOOKING STAGES - COMPLETE IF-THEN CONDITIONS

### Stage: SEE_YOU_SENT

Initial confirmation sent, managing pre-stay communication.

```
════════════════════════════════════════════════════════════════════════
STAGE: see_you_sent
PURPOSE: Post-confirmation, pre-arrival communication
ENTRY: payment_confirmed after confirmation sent
════════════════════════════════════════════════════════════════════════

CONDITION 5.1.1:
  IF: Guest has questions about the property
  THEN:
    - Answer from property info if available
    - If not available: Ask owner
    - "Great question! [Answer]. Looking forward to hosting you!"
  NEXT STAGE: see_you_sent (stay)
  NOTES: Keep engagement positive.

CONDITION 5.1.2:
  IF: Guest asks to modify booking (change dates, add guests)
  THEN:
    - Forward request to owner: "Guest is requesting [modification]. Please advise."
    - Tell guest: "Let me check with the property owner about that change."
    - Set owner_action_required = true, owner_action_type = 'approve_modification'
  NEXT STAGE: see_you_sent (stay - wait for owner)
  NOTES: Modifications need owner approval.

CONDITION 5.1.3:
  IF: Guest asks to cancel booking
  THEN:
    - Check cancellation policy
    - Notify owner: "Guest requesting cancellation for [booking]. Cancellation policy: [policy]."
    - Tell guest: "I'll process your cancellation request. You'll receive details about any refund per our cancellation policy."
    - Set owner_action_required = true, owner_action_type = 'process_cancellation'
  NEXT STAGE: conversation_end (after owner processes)
  NOTES: Follow cancellation policy strictly.

CONDITION 5.1.4:
  IF: Check-in date is 3 days away
  THEN:
    - Schedule pre_arrival message
    - Set follow_up_scheduled_at = check_in_date - 1 day
    - Set follow_up_type = 'pre_arrival_reminder'
  NEXT STAGE: pre_arrival (when triggered)
  NOTES: Automatic transition based on date.

CONDITION 5.1.5:
  IF: Guest shares excitement or plans for the trip
  THEN:
    - Engage positively: "That sounds wonderful! [Relevant local tip if available]. Can't wait to have you!"
  NEXT STAGE: see_you_sent (stay)
  NOTES: Build rapport.
```

### Stage: PRE_ARRIVAL

1-3 days before check-in.

```
════════════════════════════════════════════════════════════════════════
STAGE: pre_arrival
PURPOSE: Final preparations before guest arrives
ENTRY: Automatic 1-3 days before check_in_date
════════════════════════════════════════════════════════════════════════

CONDITION 5.2.1:
  IF: Pre-arrival reminder triggered (1 day before check-in)
  THEN:
    - Send check-in instructions: "
      Hi [Name]! Just a reminder that you're checking in tomorrow!

      Check-in Time: 3:00 PM
      Address: [address]
      Access: [key/code instructions]

      [Any additional notes from owner]

      Safe travels!
      "
  NEXT STAGE: pre_arrival (stay until check-in)
  NOTES: Essential pre-arrival information.

CONDITION 5.2.2:
  IF: Guest asks about early check-in
  THEN:
    - Check property config for early check-in policy
    - If allowed: "Early check-in may be available. Let me confirm with the owner."
    - If not: "Standard check-in is 3 PM. I'll let you know if earlier becomes available."
    - Notify owner of request
  NEXT STAGE: pre_arrival (stay)
  NOTES: Owner decides on early check-in.

CONDITION 5.2.3:
  IF: Guest asks about late check-out
  THEN:
    - Similar to early check-in handling
    - Note for follow-up during stay
  NEXT STAGE: pre_arrival (stay)
  NOTES: Plan ahead for departure.

CONDITION 5.2.4:
  IF: Guest asks about parking, WiFi, access codes
  THEN:
    - Answer from property config if available
    - If not: Check with owner
  NEXT STAGE: pre_arrival (stay)
  NOTES: Practical questions - answer directly if possible.

CONDITION 5.2.5:
  IF: Guest says their plans changed (delayed arrival, etc.)
  THEN:
    - Acknowledge: "Thanks for letting me know! No problem with the [change]. See you when you arrive!"
    - If significant: Notify owner
  NEXT STAGE: pre_arrival (stay)
  NOTES: Flexibility is key.

CONDITION 5.2.6:
  IF: Check-in time passes
  THEN:
    - Transition to during_stay
  NEXT STAGE: during_stay
  NOTES: Automatic based on time.
```

### Stage: DURING_STAY

Guest is currently staying at the property.

```
════════════════════════════════════════════════════════════════════════
STAGE: during_stay
PURPOSE: Support guest during their stay
ENTRY: Automatic when check_in_date + check_in_time passes
════════════════════════════════════════════════════════════════════════

CONDITION 5.3.1:
  IF: Guest reports an issue (broken item, cleanliness, noise, etc.)
  THEN:
    - Acknowledge immediately: "I'm sorry to hear that! Let me notify the property owner right away."
    - Create URGENT task for owner
    - Set owner_action_required = true, owner_action_type = 'urgent_guest_issue'
    - "The owner will get back to you very soon."
  NEXT STAGE: during_stay (stay)
  NOTES: Issues during stay need fast owner response.

CONDITION 5.3.2:
  IF: Guest needs something (extra towels, supplies, etc.)
  THEN:
    - Forward to owner: "Guest requesting [item]."
    - Tell guest: "I've passed your request to the owner!"
  NEXT STAGE: during_stay (stay)
  NOTES: Concierge-style handling.

CONDITION 5.3.3:
  IF: Guest asks for local recommendations (restaurants, activities)
  THEN:
    - Check property config for saved recommendations
    - If available: Share them
    - If not: "I don't have specific recommendations saved, but [general helpful response]"
  NEXT STAGE: during_stay (stay)
  NOTES: Add value if possible.

CONDITION 5.3.4:
  IF: Guest asks about extending their stay
  THEN:
    - Check calendar for availability
    - If available: "I see [dates] are open. Would you like to extend? It would be $[amount] for [X] additional nights."
    - If not: "Unfortunately, there's a booking after yours. Let me know if you'd like to book again for a future date!"
    - Notify owner of potential extension
  NEXT STAGE: during_stay (stay) OR booking_interest (if they want to book extension)
  NOTES: Extensions = more revenue.

CONDITION 5.3.5:
  IF: Guest asks about late check-out (day of)
  THEN:
    - Check with owner immediately (urgent)
    - "Let me check with the owner real quick."
    - Set owner_action_required = true, owner_action_type = 'late_checkout_request'
  NEXT STAGE: during_stay (stay)
  NOTES: Needs quick owner response.

CONDITION 5.3.6:
  IF: Check-out time approaches (within 2 hours)
  THEN:
    - Send reminder: "Hi [Name]! Just a reminder that check-out is at [time]. Please [check-out instructions]. Thank you for staying with us!"
  NEXT STAGE: during_stay (stay until check-out)
  NOTES: Friendly reminder.

CONDITION 5.3.7:
  IF: Check-out time passes
  THEN:
    - Transition to post_checkout
    - Schedule thank-you message
  NEXT STAGE: post_checkout
  NOTES: Automatic based on time.
```

### Stage: POST_CHECKOUT

Guest has checked out.

```
════════════════════════════════════════════════════════════════════════
STAGE: post_checkout
PURPOSE: Thank guest and close the loop
ENTRY: Automatic when check_out_date + check_out_time passes
════════════════════════════════════════════════════════════════════════

CONDITION 5.4.1:
  IF: Post-checkout message triggered (few hours after check-out)
  THEN:
    - Send thank-you: "
      Thank you for staying at [Property], [Name]!

      We hope you had a wonderful time. If you enjoyed your stay, we'd love a review!
      [Review link if configured]

      Hope to host you again soon!
      "
  NEXT STAGE: conversation_end
  NOTES: End on a positive note.

CONDITION 5.4.2:
  IF: Guest responds positively to thank-you
  THEN:
    - Engage: "So glad you enjoyed it! Feel free to reach out anytime for your next trip. Take care!"
  NEXT STAGE: conversation_end
  NOTES: Keep door open.

CONDITION 5.4.3:
  IF: Guest has complaints after checkout
  THEN:
    - Take seriously: "I'm sorry to hear about this. Let me share your feedback with the owner."
    - Notify owner: "Post-checkout complaint from [Guest]: [details]"
    - Set owner_action_required = true, owner_action_type = 'address_complaint'
  NEXT STAGE: conversation_end (after owner addresses)
  NOTES: Don't ignore post-stay feedback.

CONDITION 5.4.4:
  IF: Guest asks about rebooking
  THEN:
    - Restart booking flow: "We'd love to have you back! When are you thinking?"
    - Keep collected_data.guest_name (already know them)
  NEXT STAGE: date_collection
  NOTES: Returning guest = warm lead.
```

---

## 6.7 SPECIAL STAGES - COMPLETE IF-THEN CONDITIONS

### Stage: INQUIRIES

Guest has a question that can happen at any time.

```
════════════════════════════════════════════════════════════════════════
STAGE: inquiries
PURPOSE: Handle questions at any point without losing place
ENTRY: Can be triggered from any stage when guest asks a question
════════════════════════════════════════════════════════════════════════

CONDITION 6.1.1:
  IF: Guest asks about property features (amenities, size, etc.)
  THEN:
    - Check property_configurations for answer
    - If found: Answer directly, then return to previous stage
    - If not found: "Let me check on that for you." → unknown_answer
  RETURN TO: Previous stage
  NOTES: Don't lose conversation progress.

CONDITION 6.1.2:
  IF: Guest asks about location/directions
  THEN:
    - Share address and any directions notes from property config
    - "The property is located at [address]. [Directions notes if any]."
  RETURN TO: Previous stage
  NOTES: Common question - answer quickly.

CONDITION 6.1.3:
  IF: Guest asks about house rules (pets, smoking, parties)
  THEN:
    - Check property config for rules
    - Share applicable rules
    - If asked about something not in config: Ask owner
  RETURN TO: Previous stage
  NOTES: Important for guest expectations.

CONDITION 6.1.4:
  IF: Guest asks comparison question ("Is [X] included?", "Do you have [Y]?")
  THEN:
    - Yes/No based on property config
    - If not in config: "Let me verify that with the owner."
  RETURN TO: Previous stage
  NOTES: Binary questions need clear answers.

CONDITION 6.1.5:
  IF: Guest asks about owner/host
  THEN:
    - Share basic info if configured
    - Don't share private owner details
    - "The property is managed by [Owner Name/Company]. They're great hosts!"
  RETURN TO: Previous stage
  NOTES: Maintain owner privacy.

CONDITION 6.1.6:
  IF: Guest asks about nearby attractions/activities
  THEN:
    - Check property config for local_attractions
    - If available: Share list
    - If not: Give general helpful response based on area
  RETURN TO: Previous stage
  NOTES: Helpful but not required.
```

### Stage: UNKNOWN_ANSWER

AI encountered something it can't answer - needs owner input.

```
════════════════════════════════════════════════════════════════════════
STAGE: unknown_answer
PURPOSE: Escalate unanswerable questions to owner
ENTRY: Any stage when AI doesn't know the answer
════════════════════════════════════════════════════════════════════════

CONDITION 6.2.1:
  IF: Question requires owner knowledge (not in database)
  THEN:
    - Store pending_question = the question
    - Store pending_question_context = current conversation context
    - Set owner_action_required = true, owner_action_type = 'answer_question'
    - Create task in Control Panel
    - Send Telegram notification to owner
    - Tell guest: "Great question! Let me check with the property owner and get back to you."
  NEXT STAGE: unknown_answer (wait for owner)
  NOTES: AI never makes up answers.

CONDITION 6.2.2:
  IF: Owner provides answer (via Control Panel or Telegram)
  THEN:
    - Send answer to guest: "Thanks for waiting! [Owner's answer]"
    - Clear pending_question
    - Set owner_action_required = false
    - Optionally: Ask if owner wants to save answer for future use
  RETURN TO: Previous stage (where question was asked)
  NOTES: Resume normal flow with answer.

CONDITION 6.2.3:
  IF: Guest sends follow-up message while waiting
  THEN:
    - If it's about the same question: "Still waiting on the owner's response. Should be soon!"
    - If it's a new question: Can handle if answerable, otherwise add to queue
  NEXT STAGE: unknown_answer (stay)
  NOTES: Keep guest engaged while waiting.

CONDITION 6.2.4:
  IF: Owner takes too long (>1 hour)
  THEN:
    - Send owner reminder
    - Message guest: "I apologize for the delay. The owner will respond shortly."
  NEXT STAGE: unknown_answer (stay)
  NOTES: Don't let guest wait too long.

CONDITION 6.2.5:
  IF: Owner says they don't know or can't answer
  THEN:
    - Be honest with guest: "I checked with the owner, and unfortunately we don't have that information available."
    - Offer alternative: "Is there anything else I can help with?"
  RETURN TO: Previous stage
  NOTES: Honesty is best.
```

### Stage: OWNER_MODE

Conversation is with the property owner, not a guest.

```
════════════════════════════════════════════════════════════════════════
STAGE: owner_mode
PURPOSE: Handle owner communications (different flow from guests)
ENTRY: first_contact when sender is identified as owner
════════════════════════════════════════════════════════════════════════

CONDITION 6.3.1:
  IF: Owner asks about bookings/schedule
  THEN:
    - Query bookings for their property
    - Provide summary: "You have [X] upcoming bookings: [list]. [Y] pending confirmations."
  NEXT STAGE: owner_mode (stay)
  NOTES: Owner dashboard functionality.

CONDITION 6.3.2:
  IF: Owner wants to update settings
  THEN:
    - "What would you like to update? (Prices, availability, payment info, etc.)"
    - Or: "Please use the Control Panel for settings: [link]"
  NEXT STAGE: owner_mode (stay)
  NOTES: Direct to Control Panel for complex updates.

CONDITION 6.3.3:
  IF: Owner confirms payment via Telegram ("payment received for BK123")
  THEN:
    - Parse booking ID
    - Send double-tap confirmation: "Confirming payment for [booking details]. Reply CONFIRM [booking_id] to proceed."
  NEXT STAGE: owner_mode (wait for CONFIRM)
  NOTES: Double-tap for payment confirmation.

CONDITION 6.3.4:
  IF: Owner sends "CONFIRM [booking_id]"
  THEN:
    - Process payment confirmation
    - Update booking status
    - Notify guest
    - "Payment confirmed! Guest has been notified."
  NEXT STAGE: owner_mode (stay)
  NOTES: Explicit confirmation action.

CONDITION 6.3.5:
  IF: Owner wants to cancel a booking
  THEN:
    - Send double-tap warning: "Warning: This will cancel booking [details] and notify the guest. Reply DECLINE [booking_id] to proceed."
  NEXT STAGE: owner_mode (wait for DECLINE)
  NOTES: Double-tap for cancellation.

CONDITION 6.3.6:
  IF: Owner sends "DECLINE [booking_id]"
  THEN:
    - Process cancellation
    - Update booking status
    - Notify guest
    - "Booking cancelled. Guest has been notified."
  NEXT STAGE: owner_mode (stay)
  NOTES: Explicit cancellation action.

CONDITION 6.3.7:
  IF: Owner asks about a specific guest
  THEN:
    - Look up guest conversation
    - Provide summary: "[Guest] inquired on [date], interested in [dates], current status: [stage]"
  NEXT STAGE: owner_mode (stay)
  NOTES: Quick guest lookup.

CONDITION 6.3.8:
  IF: Owner answers a pending guest question
  THEN:
    - "Got it! I'll send this to [Guest Name]."
    - Forward answer to guest
    - Clear the pending_question for that conversation
  NEXT STAGE: owner_mode (stay)
  NOTES: Owner answering guest questions.
```

### Stage: HOLDING_PATTERN

Guest needs time to think/decide.

```
════════════════════════════════════════════════════════════════════════
STAGE: holding_pattern
PURPOSE: Guest is interested but not ready to commit
ENTRY: booking_interest when guest says "let me think about it"
════════════════════════════════════════════════════════════════════════

CONDITION 6.4.1:
  IF: Guest returns and says they want to proceed
  THEN:
    - Re-check availability first
    - If still available: "Great to hear from you! Good news - [dates] are still available. Ready to book?"
    - If no longer available: "Welcome back! Unfortunately those dates got booked. I have [alternatives] available."
  NEXT STAGE: booking_confirmed (if available and yes) OR date_collection (if need new dates)
  NOTES: Always re-verify when they return.

CONDITION 6.4.2:
  IF: Guest returns with questions
  THEN:
    - Answer their questions
    - Gently check: "Does that help? Are you leaning towards booking?"
  NEXT STAGE: holding_pattern (stay) OR booking_interest (if they engage)
  NOTES: They're still interested if they're asking questions.

CONDITION 6.4.3:
  IF: Guest returns saying they found something else
  THEN:
    - Be gracious: "No problem at all! Thanks for considering us. Feel free to reach out in the future!"
  NEXT STAGE: conversation_end
  NOTES: Graceful exit.

CONDITION 6.4.4:
  IF: 24 hours pass with no response
  THEN:
    - Send friendly follow-up: "Hi [Name]! Just checking in about the [Property] booking. Still thinking about it?"
  NEXT STAGE: holding_pattern (stay)
  NOTES: One follow-up.

CONDITION 6.4.5:
  IF: 72 hours pass with no response (after 24h follow-up)
  THEN:
    - Final check: "Hi [Name]! Wanted to follow up one more time about [Property]. If your plans have changed, no worries - just let me know!"
    - After this: Mark as cold lead
  NEXT STAGE: holding_pattern (stay) OR conversation_end (if still no response after 7 days)
  NOTES: Don't spam, but give fair chance.

CONDITION 6.4.6:
  IF: Dates they were interested in get booked by someone else
  THEN:
    - Proactively notify: "Hi [Name]! Just wanted to let you know that the March 15-18 dates got booked. I do have [alternatives] if you're still interested!"
  NEXT STAGE: holding_pattern (with new options) OR date_collection (if they engage)
  NOTES: Transparency and alternatives.
```

### Stage: OFFER_CONFLICT

Multiple guests interested in same dates - WF2 territory.

```
════════════════════════════════════════════════════════════════════════
STAGE: offer_conflict
PURPOSE: Handle competing offers for same dates
ENTRY: availability_check when WF2 detects conflict
════════════════════════════════════════════════════════════════════════

CONDITION 6.5.1:
  IF: This guest is FIRST to express interest
  THEN:
    - Note that competing offer may come
    - Encourage quick action: "Those dates are available! I should mention we've had interest, so I recommend booking soon to secure them."
  NEXT STAGE: price_presentation (continue with urgency)
  NOTES: First come, first served usually.

CONDITION 6.5.2:
  IF: This guest is SECOND (someone else already interested)
  THEN:
    - Be transparent: "Those dates are currently being held for another inquiry. Would you like me to let you know if they become available? Or I can offer you [alternative dates]."
  NEXT STAGE: offer_conflict (wait) OR date_collection (if they want alternatives)
  NOTES: Don't hide the competition.

CONDITION 6.5.3:
  IF: Owner decides to give dates to this guest
  THEN:
    - "Great news! The dates are yours. Let's proceed with booking."
    - Notify other guest they lost out (handled by WF2)
  NEXT STAGE: booking_confirmed
  NOTES: WF2 handles the conflict resolution.

CONDITION 6.5.4:
  IF: Owner decides to give dates to other guest
  THEN:
    - "I'm sorry, but those dates have been booked by another guest. I have [alternatives] - would any of those work?"
  NEXT STAGE: date_collection (with alternatives) OR conversation_end (if they decline)
  NOTES: Offer alternatives, don't just say no.

CONDITION 6.5.5:
  IF: Both guests are at equal stage (both said "yes" simultaneously)
  THEN:
    - First-come-first-served based on timestamp
    - Or: Owner can manually decide via Control Panel
    - Create task for owner: "Two guests want [dates]. Who gets priority?"
  NEXT STAGE: offer_conflict (wait for owner decision)
  NOTES: Rare but needs fair handling.
```

### Stage: CONVERSATION_END

The conversation has concluded.

```
════════════════════════════════════════════════════════════════════════
STAGE: conversation_end
PURPOSE: Gracefully close the conversation
ENTRY: Various - guest declined, booking cancelled, checkout complete, etc.
════════════════════════════════════════════════════════════════════════

CONDITION 6.6.1:
  IF: Conversation ended positively (completed booking/stay)
  THEN:
    - Set is_active = false
    - Set closed_reason = 'completed'
    - Keep data for future reference
  FINAL: Conversation archived
  NOTES: Success case.

CONDITION 6.6.2:
  IF: Conversation ended negatively (guest declined)
  THEN:
    - Set is_active = false
    - Set closed_reason = 'declined'
    - Door stays open for future
  FINAL: Conversation archived
  NOTES: Decline is okay.

CONDITION 6.6.3:
  IF: Guest goes completely silent (no response in 14+ days)
  THEN:
    - Set is_active = false
    - Set closed_reason = 'no_response'
    - Archive conversation
  FINAL: Conversation archived
  NOTES: Natural drop-off.

CONDITION 6.6.4:
  IF: Previous guest returns (new message after conversation_end)
  THEN:
    - Reactivate conversation (or create new one with known data)
    - "Welcome back, [Name]! How can I help you today?"
    - Keep previously collected data (name, preferences)
  NEXT STAGE: inquiries OR date_collection (depending on their message)
  NOTES: Returning guests are warm leads.

CONDITION 6.6.5:
  IF: Conversation marked as spam/invalid
  THEN:
    - Set is_active = false
    - Set closed_reason = 'spam'
    - May want to block sender
  FINAL: Conversation blocked
  NOTES: Spam handling.
```

---

## 6.8 EDGE CASE CONDITIONS

These conditions can occur from any stage:

```
════════════════════════════════════════════════════════════════════════
EDGE CASES - HANDLE FROM ANY STAGE
════════════════════════════════════════════════════════════════════════

EDGE 1: Guest sends message in different language
  IF: Message detected as non-English (or configured language)
  THEN:
    - Check property config for supported languages
    - If supported: Switch to that language
    - If not: "I primarily communicate in English. Shall I continue in English?"
  CONTINUE: Current stage
  NOTES: Language flexibility based on config.

EDGE 2: Guest sends voice message
  IF: Voice message received
  THEN:
    - If voice transcription available: Process transcription as text
    - If not: "I received your voice message but I'm better with text. Could you type that out for me?"
  CONTINUE: Current stage
  NOTES: Handle gracefully if can't process.

EDGE 3: Guest sends only emojis
  IF: Message is just emojis
  THEN:
    - Interpret positive emojis as confirmation
    - Interpret negative emojis as decline
    - If unclear: "I want to make sure I understand - could you type that out for me?"
  CONTINUE: Current stage
  NOTES: Emojis can be ambiguous.

EDGE 4: Guest mentions emergency
  IF: Message contains emergency keywords ("emergency", "accident", "fire", "help", "urgent")
  THEN:
    - Immediately escalate to owner
    - "I'm notifying the property owner immediately. Are you safe?"
    - Set owner_action_required = true, owner_action_type = 'emergency'
  CONTINUE: Current stage (with emergency flag)
  NOTES: Safety first.

EDGE 5: Guest is angry/frustrated
  IF: Message is clearly angry or frustrated
  THEN:
    - Don't match their tone
    - Acknowledge: "I understand this is frustrating. Let me help resolve this."
    - If about AI: "I apologize if I've been unclear. Let me try to help."
    - If serious complaint: Escalate to owner
  CONTINUE: Current stage
  NOTES: De-escalation is key.

EDGE 6: Multiple messages in rapid succession
  IF: Guest sends several messages quickly before AI responds
  THEN:
    - Wait for natural pause (few seconds)
    - Combine messages and respond to all points
    - Don't respond to each individually
  CONTINUE: Current stage
  NOTES: Avoid message spam back.

EDGE 7: Guest references previous conversation
  IF: Guest mentions "we talked before" or "you said earlier"
  THEN:
    - Check conversation history
    - If found: Reference it
    - If not found: "I'm sorry, I don't see our previous chat. Could you remind me?"
  CONTINUE: Current stage
  NOTES: Continuity is important.

EDGE 8: Technical error occurs
  IF: AI encounters an error (API failure, database issue)
  THEN:
    - Don't expose technical details
    - "I'm having a brief technical issue. Give me a moment..."
    - Retry operation
    - If still fails: "I apologize, I'm experiencing difficulties. Please try again shortly or contact us at [contact]."
  CONTINUE: Current stage (after recovery)
  NOTES: Graceful error handling.

EDGE 9: Guest asks to speak to a human
  IF: Guest says "talk to a human", "real person", "not a bot"
  THEN:
    - Don't be defensive: "Of course! Let me connect you with the property owner."
    - Create urgent task for owner
    - "The owner will reach out to you shortly."
    - Set owner_action_required = true, owner_action_type = 'human_requested'
  CONTINUE: Current stage (wait for owner)
  NOTES: Respect their preference.

EDGE 10: Message seems like spam or promotional
  IF: Message contains promotional content, links to external sites, or spam patterns
  THEN:
    - Don't engage: "Thank you for your message. We're a vacation rental property. Are you looking to book a stay?"
    - If clearly spam: Mark conversation, notify owner
  CONTINUE: Current stage (cautious)
  NOTES: Filter spam without being rude.
```

---

# 7. TESTING & VALIDATION

## 7.1 Database Tests

```sql
-- Test 1: Create a new conversation state
SELECT * FROM get_or_create_conversation_state('test_user_001', 'telegram', 'prop-001');

-- Test 2: Update the state
SELECT * FROM update_conversation_state(
    'test_user_001',
    'date_collection',
    '{"guest_name": "John Test", "name_source": "asked"}'::jsonb,
    '{"name_collected": true}'::jsonb,
    'ask_dates'
);

-- Test 3: Verify the update
SELECT * FROM conversation_state WHERE sender_id = 'test_user_001';

-- Test 4: Get pending owner actions
SELECT * FROM get_pending_owner_actions();

-- Cleanup test data
DELETE FROM conversation_state WHERE sender_id LIKE 'test_%';
```

## 7.2 Workflow Tests

### Test Scenario 1: New Guest Flow
1. Send message from new Telegram user
2. Verify conversation_state created with stage='first_contact'
3. Verify AI greets and asks for name (or uses profile name)
4. Send name, verify stage advances to date_collection
5. Send dates, verify stage advances

### Test Scenario 2: Payment Confirmation
1. Create a conversation at payment_pending stage
2. Have owner click "Payment Received" in Control Panel
3. Verify conversation_state updates to payment_confirmed
4. Verify guest receives confirmation message

### Test Scenario 3: Unknown Answer
1. Ask a question AI can't find in database
2. Verify owner_action_required becomes true
3. Verify owner receives notification
4. Have owner answer via Control Panel
5. Verify guest receives answer

## 7.3 Control Panel Tests

1. Load Tasks tab, verify pending conversations appear
2. Click "Payment Received", verify modal and confirmation
3. Click "Answer Question", verify answer is sent
4. Verify real-time refresh (30 second interval)

---

# 8. ROLLBACK PLAN

## 8.1 Database Rollback

```sql
-- Remove the conversation_state table
DROP TABLE IF EXISTS conversation_state CASCADE;

-- Remove added columns from property_configurations
ALTER TABLE property_configurations DROP COLUMN IF EXISTS payment_details;
ALTER TABLE property_configurations DROP COLUMN IF EXISTS contract_details;

-- Remove helper functions
DROP FUNCTION IF EXISTS get_or_create_conversation_state;
DROP FUNCTION IF EXISTS update_conversation_state;
DROP FUNCTION IF EXISTS get_pending_owner_actions;
```

## 8.2 Workflow Rollback

1. Restore workflows from backup JSON
2. Or manually remove the new nodes:
   - Load Conversation State
   - Build AI Context
   - Parse AI Response
   - Update Conversation State
3. Reconnect original flow

## 8.3 Control Panel Rollback

1. Remove new HTML sections from tasks page
2. Remove new JavaScript functions
3. Remove new CSS styles
4. Remove new API endpoints

---

# IMPLEMENTATION CHECKLIST

Use this checklist to track progress:

## Phase 1: Database
- [ ] Backup existing database
- [ ] Create conversation_state table
- [ ] Add columns to property_configurations
- [ ] Create helper functions
- [ ] Verify with test queries

## Phase 2: Workflows
- [ ] Backup existing workflows (export JSON)
- [ ] Add "Load Conversation State" node to WF1
- [ ] Add "Build AI Context" node to WF1
- [ ] Update AI Agent system prompt in WF1
- [ ] Add "Parse AI Response" node to WF1
- [ ] Add "Update Conversation State" node to WF1
- [ ] Update node connections in WF1
- [ ] Add state update nodes to WF4
- [ ] Test complete flow

## Phase 3: Control Panel
- [ ] Add new API endpoints
- [ ] Add HTML for conversation tasks
- [ ] Add JavaScript functionality
- [ ] Add CSS styles
- [ ] Test all modals and actions

## Phase 4: Testing
- [ ] Test new guest flow (all channels)
- [ ] Test payment confirmation (Control Panel)
- [ ] Test payment confirmation (Telegram)
- [ ] Test unknown answer flow
- [ ] Test owner mode
- [ ] Test edge cases

## Phase 5: Go Live
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Train users on new features

---

# SUPPORT & TROUBLESHOOTING

## Common Issues

### State not updating
- Check PostgreSQL connection in n8n
- Verify sender_id is being passed correctly
- Check for SQL errors in n8n execution logs

### AI not using state context
- Verify "Build AI Context" node is connected
- Check that state_context is being injected into system prompt
- Review AI Agent node configuration

### Control Panel not showing tasks
- Check API endpoint is accessible
- Verify customer_id is correct
- Check browser console for JavaScript errors

---

# DOCUMENT VERSION

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-10 | Initial complete implementation guide |

---

**END OF IMPLEMENTATION GUIDE**

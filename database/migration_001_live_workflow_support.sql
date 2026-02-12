-- ============================================================================
-- MIGRATION 001: Add tables & columns required by live n8n workflows
-- Date: 2026-02-10
-- Purpose: Bridge gap between schema-postgresql.sql and what live workflows query
-- ============================================================================

-- Enable pgvector if available (for WF1 AI Gateway context retrieval)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS vector;  -- Uncomment if pgvector is installed

-- ============================================================================
-- 1. ADD MISSING COLUMNS to property_configurations
--    Used by: WF1 (Get Customer ID), WF6 (morning/evening data)
-- ============================================================================
ALTER TABLE property_configurations
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS owner_contact VARCHAR(255);

-- Populate owner_contact from existing owner_phone for convenience
UPDATE property_configurations
SET owner_contact = owner_phone
WHERE owner_contact IS NULL AND owner_phone IS NOT NULL;

-- ============================================================================
-- 2. TABLE: customers
--    Used by: WF6 (Get Last Month Summary) for budget reset notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    preferred_platform VARCHAR(50) DEFAULT 'telegram',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- ============================================================================
-- 3. TABLE: owners
--    Used by: WF4 (Get Property & Owner) via LEFT JOIN
-- ============================================================================
CREATE TABLE IF NOT EXISTS owners (
    owner_id VARCHAR(255) PRIMARY KEY,
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    owner_phone VARCHAR(50),
    owner_chat_id VARCHAR(255),  -- Telegram chat ID for notifications
    preferred_platform VARCHAR(50) DEFAULT 'telegram',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add owner_id FK column to property_configurations if missing
ALTER TABLE property_configurations
  ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255);

-- ============================================================================
-- 4. TABLE: cleaning_schedules
--    Used by: WF6 (Get Evening Data) via LEFT JOIN on booking_id
-- ============================================================================
CREATE TABLE IF NOT EXISTS cleaning_schedules (
    id SERIAL PRIMARY KEY,
    schedule_id VARCHAR(255) UNIQUE,
    booking_id VARCHAR(255),
    property_id VARCHAR(255),
    cleaner_id VARCHAR(255),
    scheduled_date DATE,
    scheduled_time TIME,
    status VARCHAR(50) DEFAULT 'scheduled',  -- scheduled, in_progress, completed, cancelled
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_booking ON cleaning_schedules(booking_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_property ON cleaning_schedules(property_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_date ON cleaning_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_status ON cleaning_schedules(status);

-- ============================================================================
-- 5. TABLE: offer_conflicts
--    Used by: WF2 (Save Conflict Record, Update Conflict Resolved)
--    Columns from n8n node mapping: conflict_id, property_id, property_name,
--    check_in_date, check_out_date, offers (JSONB), status, created_at, owner_notified
-- ============================================================================
CREATE TABLE IF NOT EXISTS offer_conflicts (
    id SERIAL PRIMARY KEY,
    conflict_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255),
    property_name VARCHAR(255),
    check_in_date DATE,
    check_out_date DATE,
    offers JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'pending_decision',  -- pending_decision, resolved_accepted, resolved_declined, expired
    owner_notified BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_conflicts_property ON offer_conflicts(property_id);
CREATE INDEX IF NOT EXISTS idx_offer_conflicts_status ON offer_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_offer_conflicts_dates ON offer_conflicts(check_in_date, check_out_date);

-- ============================================================================
-- 6. TABLE: n8n_chat_histories
--    Used by: WF1 AI Gateway (LangChain Postgres Chat Memory node)
--    This is the standard table LangChain expects for chat memory
-- ============================================================================
CREATE TABLE IF NOT EXISTS n8n_chat_histories (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    message JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_n8n_chat_histories_session ON n8n_chat_histories(session_id);

-- ============================================================================
-- 7. BUDGET TRACKING TABLES (added by partner's Claude)
--    Used by: WF1 (budget gate), WF6 (monthly reset), SUB (cost logging)
-- ============================================================================

-- 7a. Monthly budget per customer
CREATE TABLE IF NOT EXISTS api_usage_budget (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    month_year VARCHAR(7) NOT NULL,           -- Format: "2026-02"
    monthly_budget DECIMAL(10,4) DEFAULT 30.00,
    used_amount DECIMAL(10,4) DEFAULT 0.00,
    alert_50_sent BOOLEAN DEFAULT FALSE,
    alert_80_sent BOOLEAN DEFAULT FALSE,
    alert_100_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_api_budget_customer ON api_usage_budget(customer_id);
CREATE INDEX IF NOT EXISTS idx_api_budget_month ON api_usage_budget(month_year);

-- 7b. Detailed API call log
CREATE TABLE IF NOT EXISTS api_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,            -- 'openai', 'twilio_sms', 'twilio_whatsapp', 'telegram'
    model VARCHAR(100),                       -- 'gpt-4o-mini', 'sms', 'whatsapp'
    operation VARCHAR(100),                   -- 'chat_completion', 'send_message'
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) NOT NULL,
    workflow_name VARCHAR(100),
    node_name VARCHAR(100),
    execution_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_customer ON api_usage_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage_log(provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage_log(created_at);

-- 7c. API pricing reference
CREATE TABLE IF NOT EXISTS api_pricing_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_cost_per_1k DECIMAL(10,6),
    output_cost_per_1k DECIMAL(10,6),
    cost_per_unit DECIMAL(10,6),
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    UNIQUE(provider, model, effective_from)
);

-- Pre-populate current rates
INSERT INTO api_pricing_rates (provider, model, input_cost_per_1k, output_cost_per_1k, cost_per_unit)
VALUES
    ('openai', 'gpt-4o-mini', 0.00015, 0.0006, NULL),
    ('twilio', 'sms', NULL, NULL, 0.0079),
    ('twilio', 'whatsapp', NULL, NULL, 0.005),
    ('telegram', 'bot_api', NULL, NULL, 0.00)
ON CONFLICT DO NOTHING;

-- 7d. Budget alerts log
CREATE TABLE IF NOT EXISTS api_budget_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    alert_type VARCHAR(20) NOT NULL,          -- '50_percent', '80_percent', '100_percent'
    usage_at_alert DECIMAL(10,4),
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_customer ON api_budget_alerts(customer_id);

-- 7e. Credit purchases (for future use)
CREATE TABLE IF NOT EXISTS api_credit_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    amount_usd DECIMAL(10,2) NOT NULL,
    credits_added DECIMAL(10,4) NOT NULL,
    payment_reference VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. BUDGET FUNCTIONS
--    Called by: WF1 (Check Budget, Log API Cost), WF6 (Reset, Check Budget)
--    SUB (Log Messaging Cost)
-- ============================================================================

-- 8a. Get or create budget for current month
CREATE OR REPLACE FUNCTION get_or_create_budget(p_customer_id UUID)
RETURNS TABLE(
    budget_id UUID,
    monthly_budget DECIMAL,
    used_amount DECIMAL,
    remaining DECIMAL,
    usage_percent DECIMAL,
    alert_50_sent BOOLEAN,
    alert_80_sent BOOLEAN,
    alert_100_sent BOOLEAN
) AS $$
DECLARE
    v_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_budget_id UUID;
BEGIN
    -- Try to get existing budget
    SELECT b.id INTO v_budget_id
    FROM api_usage_budget b
    WHERE b.customer_id = p_customer_id AND b.month_year = v_month;

    -- Create if not exists
    IF v_budget_id IS NULL THEN
        INSERT INTO api_usage_budget (customer_id, month_year, monthly_budget, used_amount)
        VALUES (p_customer_id, v_month, 30.00, 0.00)
        ON CONFLICT (customer_id, month_year) DO NOTHING
        RETURNING id INTO v_budget_id;

        -- If insert was a no-op due to race condition, fetch it
        IF v_budget_id IS NULL THEN
            SELECT b.id INTO v_budget_id
            FROM api_usage_budget b
            WHERE b.customer_id = p_customer_id AND b.month_year = v_month;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        b.id,
        b.monthly_budget,
        b.used_amount,
        (b.monthly_budget - b.used_amount) AS remaining,
        CASE WHEN b.monthly_budget > 0
             THEN (b.used_amount / b.monthly_budget * 100)
             ELSE 0 END AS usage_percent,
        b.alert_50_sent,
        b.alert_80_sent,
        b.alert_100_sent
    FROM api_usage_budget b
    WHERE b.id = v_budget_id;
END;
$$ LANGUAGE plpgsql;

-- 8b. Check if budget is available (pre-flight check)
CREATE OR REPLACE FUNCTION check_budget_available(
    p_customer_id UUID,
    p_estimated_cost DECIMAL DEFAULT 0.01
)
RETURNS TABLE(
    is_available BOOLEAN,
    used_amount DECIMAL,
    monthly_budget DECIMAL,
    remaining DECIMAL,
    usage_percent DECIMAL
) AS $$
DECLARE
    v_budget RECORD;
BEGIN
    -- Get or create budget
    SELECT * INTO v_budget FROM get_or_create_budget(p_customer_id);

    RETURN QUERY
    SELECT
        (v_budget.remaining >= p_estimated_cost) AS is_available,
        v_budget.used_amount,
        v_budget.monthly_budget,
        v_budget.remaining,
        v_budget.usage_percent;
END;
$$ LANGUAGE plpgsql;

-- 8c. Log API usage and update budget atomically
CREATE OR REPLACE FUNCTION log_api_usage(
    p_customer_id UUID,
    p_provider VARCHAR,
    p_model VARCHAR,
    p_operation VARCHAR,
    p_input_tokens INTEGER,
    p_output_tokens INTEGER,
    p_cost_usd DECIMAL,
    p_workflow_name VARCHAR,
    p_node_name VARCHAR,
    p_execution_id VARCHAR
)
RETURNS TABLE(
    new_usage DECIMAL,
    monthly_budget DECIMAL,
    remaining DECIMAL,
    usage_percent DECIMAL,
    alert_50_needed BOOLEAN,
    alert_80_needed BOOLEAN,
    alert_100_needed BOOLEAN
) AS $$
DECLARE
    v_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_budget RECORD;
BEGIN
    -- Ensure budget exists
    PERFORM get_or_create_budget(p_customer_id);

    -- Log the usage
    INSERT INTO api_usage_log (customer_id, provider, model, operation,
                               input_tokens, output_tokens, cost_usd,
                               workflow_name, node_name, execution_id)
    VALUES (p_customer_id, p_provider, p_model, p_operation,
            p_input_tokens, p_output_tokens, p_cost_usd,
            p_workflow_name, p_node_name, p_execution_id);

    -- Update budget atomically
    UPDATE api_usage_budget
    SET used_amount = used_amount + p_cost_usd,
        updated_at = NOW()
    WHERE customer_id = p_customer_id AND month_year = v_month;

    -- Get updated budget for alert checking
    SELECT b.used_amount, b.monthly_budget, b.alert_50_sent, b.alert_80_sent, b.alert_100_sent
    INTO v_budget
    FROM api_usage_budget b
    WHERE b.customer_id = p_customer_id AND b.month_year = v_month;

    RETURN QUERY
    SELECT
        v_budget.used_amount AS new_usage,
        v_budget.monthly_budget,
        (v_budget.monthly_budget - v_budget.used_amount) AS remaining,
        CASE WHEN v_budget.monthly_budget > 0
             THEN (v_budget.used_amount / v_budget.monthly_budget * 100)
             ELSE 0 END AS usage_percent,
        (v_budget.used_amount >= v_budget.monthly_budget * 0.5 AND NOT v_budget.alert_50_sent) AS alert_50_needed,
        (v_budget.used_amount >= v_budget.monthly_budget * 0.8 AND NOT v_budget.alert_80_sent) AS alert_80_needed,
        (v_budget.used_amount >= v_budget.monthly_budget AND NOT v_budget.alert_100_sent) AS alert_100_needed;

    -- Mark alerts as sent
    UPDATE api_usage_budget
    SET alert_50_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget * 0.5 THEN TRUE ELSE alert_50_sent END,
        alert_80_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget * 0.8 THEN TRUE ELSE alert_80_sent END,
        alert_100_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget THEN TRUE ELSE alert_100_sent END
    WHERE customer_id = p_customer_id AND month_year = v_month;
END;
$$ LANGUAGE plpgsql;

-- 8d. Reset monthly budgets (called by WF6 on 1st of each month)
CREATE OR REPLACE FUNCTION reset_monthly_budgets()
RETURNS TABLE(
    customer_id UUID,
    owner_name VARCHAR,
    owner_email VARCHAR,
    last_month_usage DECIMAL,
    monthly_budget DECIMAL
) AS $$
DECLARE
    v_new_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_last_month VARCHAR(7) := TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM');
BEGIN
    -- Create new month budgets for all customers who had budgets last month
    INSERT INTO api_usage_budget (customer_id, month_year, monthly_budget, used_amount)
    SELECT b.customer_id, v_new_month, b.monthly_budget, 0.00
    FROM api_usage_budget b
    WHERE b.month_year = v_last_month
    ON CONFLICT (customer_id, month_year) DO NOTHING;

    -- Return summary of last month usage
    RETURN QUERY
    SELECT
        b.customer_id,
        c.name AS owner_name,
        c.email AS owner_email,
        b.used_amount AS last_month_usage,
        b.monthly_budget
    FROM api_usage_budget b
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE b.month_year = v_last_month;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF MIGRATION 001
-- ============================================================================

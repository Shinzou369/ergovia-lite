const { Client } = require('pg');

const client = new Client({
  host: '116.203.115.12',
  port: 5432,
  database: 'ergovia_db',
  user: 'ergovia_user',
  password: 'ergovia_secure_2026',
  ssl: false,
  connectionTimeoutMillis: 10000,
  statement_timeout: 60000
});

const migration = `
-- ============================================================================
-- MIGRATION: Add missing base table + new tables & columns for live workflows
-- ============================================================================

-- 0. conversations table (from base schema, never applied)
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(255) UNIQUE NOT NULL,
    contact_id VARCHAR(255) NOT NULL,
    property_id VARCHAR(255),
    conversation_stage VARCHAR(100) DEFAULT 'greeting',
    conversation_history JSONB DEFAULT '[]',
    collected_data JSONB DEFAULT '{}',
    channel VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_property ON conversations(property_id);
CREATE INDEX IF NOT EXISTS idx_conversations_stage ON conversations(conversation_stage);
CREATE INDEX IF NOT EXISTS idx_conversations_active ON conversations(is_active) WHERE is_active = true;

-- 1. Add missing columns to property_configurations
ALTER TABLE property_configurations ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE property_configurations ADD COLUMN IF NOT EXISTS owner_contact VARCHAR(255);
ALTER TABLE property_configurations ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255);

UPDATE property_configurations SET owner_contact = owner_phone
WHERE owner_contact IS NULL AND owner_phone IS NOT NULL;

-- 2. customers table
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

-- 3. owners table
CREATE TABLE IF NOT EXISTS owners (
    owner_id VARCHAR(255) PRIMARY KEY,
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    owner_phone VARCHAR(50),
    owner_chat_id VARCHAR(255),
    preferred_platform VARCHAR(50) DEFAULT 'telegram',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. cleaning_schedules
CREATE TABLE IF NOT EXISTS cleaning_schedules (
    id SERIAL PRIMARY KEY,
    schedule_id VARCHAR(255) UNIQUE,
    booking_id VARCHAR(255),
    property_id VARCHAR(255),
    cleaner_id VARCHAR(255),
    scheduled_date DATE,
    scheduled_time TIME,
    status VARCHAR(50) DEFAULT 'scheduled',
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_booking ON cleaning_schedules(booking_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_status ON cleaning_schedules(status);

-- 5. offer_conflicts
CREATE TABLE IF NOT EXISTS offer_conflicts (
    id SERIAL PRIMARY KEY,
    conflict_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255),
    property_name VARCHAR(255),
    check_in_date DATE,
    check_out_date DATE,
    offers JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'pending_decision',
    owner_notified BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offer_conflicts_property ON offer_conflicts(property_id);
CREATE INDEX IF NOT EXISTS idx_offer_conflicts_status ON offer_conflicts(status);

-- 6. Budget tracking tables
CREATE TABLE IF NOT EXISTS api_usage_budget (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    monthly_budget DECIMAL(10,4) DEFAULT 30.00,
    used_amount DECIMAL(10,4) DEFAULT 0.00,
    alert_50_sent BOOLEAN DEFAULT FALSE,
    alert_80_sent BOOLEAN DEFAULT FALSE,
    alert_100_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, month_year)
);

CREATE TABLE IF NOT EXISTS api_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    operation VARCHAR(100),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) NOT NULL,
    workflow_name VARCHAR(100),
    node_name VARCHAR(100),
    execution_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

INSERT INTO api_pricing_rates (provider, model, input_cost_per_1k, output_cost_per_1k, cost_per_unit)
VALUES
    ('openai', 'gpt-4o-mini', 0.00015, 0.0006, NULL),
    ('twilio', 'sms', NULL, NULL, 0.0079),
    ('twilio', 'whatsapp', NULL, NULL, 0.005),
    ('telegram', 'bot_api', NULL, NULL, 0.00)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS api_budget_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    alert_type VARCHAR(20) NOT NULL,
    usage_at_alert DECIMAL(10,4),
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_credit_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    amount_usd DECIMAL(10,2) NOT NULL,
    credits_added DECIMAL(10,4) NOT NULL,
    payment_reference VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. automation_log table (used by WF6 Log Execution node)
CREATE TABLE IF NOT EXISTS automation_log (
    id SERIAL PRIMARY KEY,
    log_id VARCHAR(255),
    automation_type VARCHAR(100),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    properties_processed INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completed',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const functions = `
-- 8. Budget functions

CREATE OR REPLACE FUNCTION get_or_create_budget(p_customer_id UUID)
RETURNS TABLE(
    budget_id UUID, monthly_budget DECIMAL, used_amount DECIMAL,
    remaining DECIMAL, usage_percent DECIMAL,
    alert_50_sent BOOLEAN, alert_80_sent BOOLEAN, alert_100_sent BOOLEAN
) AS $$
DECLARE
    v_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_budget_id UUID;
BEGIN
    SELECT b.id INTO v_budget_id FROM api_usage_budget b
    WHERE b.customer_id = p_customer_id AND b.month_year = v_month;

    IF v_budget_id IS NULL THEN
        INSERT INTO api_usage_budget (customer_id, month_year, monthly_budget, used_amount)
        VALUES (p_customer_id, v_month, 30.00, 0.00)
        ON CONFLICT (customer_id, month_year) DO NOTHING
        RETURNING id INTO v_budget_id;
        IF v_budget_id IS NULL THEN
            SELECT b.id INTO v_budget_id FROM api_usage_budget b
            WHERE b.customer_id = p_customer_id AND b.month_year = v_month;
        END IF;
    END IF;

    RETURN QUERY SELECT b.id, b.monthly_budget, b.used_amount,
        (b.monthly_budget - b.used_amount),
        CASE WHEN b.monthly_budget > 0 THEN (b.used_amount / b.monthly_budget * 100) ELSE 0 END,
        b.alert_50_sent, b.alert_80_sent, b.alert_100_sent
    FROM api_usage_budget b WHERE b.id = v_budget_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_budget_available(
    p_customer_id UUID, p_estimated_cost DECIMAL DEFAULT 0.01
) RETURNS TABLE(
    is_available BOOLEAN, used_amount DECIMAL, monthly_budget DECIMAL,
    remaining DECIMAL, usage_percent DECIMAL
) AS $$
DECLARE v_budget RECORD;
BEGIN
    SELECT * INTO v_budget FROM get_or_create_budget(p_customer_id);
    RETURN QUERY SELECT
        (v_budget.remaining >= p_estimated_cost),
        v_budget.used_amount, v_budget.monthly_budget,
        v_budget.remaining, v_budget.usage_percent;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_api_usage(
    p_customer_id UUID, p_provider VARCHAR, p_model VARCHAR, p_operation VARCHAR,
    p_input_tokens INTEGER, p_output_tokens INTEGER, p_cost_usd DECIMAL,
    p_workflow_name VARCHAR, p_node_name VARCHAR, p_execution_id VARCHAR
) RETURNS TABLE(
    new_usage DECIMAL, monthly_budget DECIMAL, remaining DECIMAL,
    usage_percent DECIMAL, alert_50_needed BOOLEAN, alert_80_needed BOOLEAN, alert_100_needed BOOLEAN
) AS $$
DECLARE
    v_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_budget RECORD;
BEGIN
    PERFORM get_or_create_budget(p_customer_id);
    INSERT INTO api_usage_log (customer_id, provider, model, operation,
        input_tokens, output_tokens, cost_usd, workflow_name, node_name, execution_id)
    VALUES (p_customer_id, p_provider, p_model, p_operation,
        p_input_tokens, p_output_tokens, p_cost_usd, p_workflow_name, p_node_name, p_execution_id);
    UPDATE api_usage_budget SET used_amount = used_amount + p_cost_usd, updated_at = NOW()
    WHERE customer_id = p_customer_id AND month_year = v_month;
    SELECT b.used_amount, b.monthly_budget, b.alert_50_sent, b.alert_80_sent, b.alert_100_sent
    INTO v_budget FROM api_usage_budget b
    WHERE b.customer_id = p_customer_id AND b.month_year = v_month;
    RETURN QUERY SELECT v_budget.used_amount, v_budget.monthly_budget,
        (v_budget.monthly_budget - v_budget.used_amount),
        CASE WHEN v_budget.monthly_budget > 0 THEN (v_budget.used_amount / v_budget.monthly_budget * 100) ELSE 0 END,
        (v_budget.used_amount >= v_budget.monthly_budget * 0.5 AND NOT v_budget.alert_50_sent),
        (v_budget.used_amount >= v_budget.monthly_budget * 0.8 AND NOT v_budget.alert_80_sent),
        (v_budget.used_amount >= v_budget.monthly_budget AND NOT v_budget.alert_100_sent);
    UPDATE api_usage_budget SET
        alert_50_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget * 0.5 THEN TRUE ELSE alert_50_sent END,
        alert_80_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget * 0.8 THEN TRUE ELSE alert_80_sent END,
        alert_100_sent = CASE WHEN v_budget.used_amount >= v_budget.monthly_budget THEN TRUE ELSE alert_100_sent END
    WHERE customer_id = p_customer_id AND month_year = v_month;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reset_monthly_budgets()
RETURNS TABLE(
    customer_id UUID, owner_name VARCHAR, owner_email VARCHAR,
    last_month_usage DECIMAL, monthly_budget DECIMAL
) AS $$
DECLARE
    v_new_month VARCHAR(7) := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    v_last_month VARCHAR(7) := TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM');
BEGIN
    INSERT INTO api_usage_budget (customer_id, month_year, monthly_budget, used_amount)
    SELECT b.customer_id, v_new_month, b.monthly_budget, 0.00
    FROM api_usage_budget b WHERE b.month_year = v_last_month
    ON CONFLICT (customer_id, month_year) DO NOTHING;
    RETURN QUERY SELECT b.customer_id, c.name, c.email, b.used_amount, b.monthly_budget
    FROM api_usage_budget b LEFT JOIN customers c ON c.id = b.customer_id
    WHERE b.month_year = v_last_month;
END;
$$ LANGUAGE plpgsql;
`;

async function main() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL!');

    // Apply table migration
    console.log('\n=== Applying table migration ===');
    await client.query(migration);
    console.log('Tables created successfully!');

    // Apply functions (separately since they use $$ dollar quoting)
    console.log('\n=== Applying budget functions ===');
    await client.query(functions);
    console.log('Functions created successfully!');

    // Verify
    console.log('\n=== Verification ===');
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    );
    console.log(`Total tables: ${tables.rows.length}`);

    const needed = ['conversations', 'cleaning_schedules', 'offer_conflicts',
                    'customers', 'owners', 'api_usage_budget', 'api_usage_log',
                    'api_pricing_rates', 'api_budget_alerts', 'api_credit_purchases',
                    'automation_log'];
    const tableNames = tables.rows.map(r => r.tablename);
    let allGood = true;
    needed.forEach(t => {
      const exists = tableNames.includes(t);
      console.log(`  ${t}: ${exists ? 'OK' : 'MISSING!'}`);
      if (!exists) allGood = false;
    });

    // Check columns
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='property_configurations'"
    );
    const colNames = cols.rows.map(r => r.column_name);
    console.log(`  customer_id column: ${colNames.includes('customer_id') ? 'OK' : 'MISSING!'}`);
    console.log(`  owner_contact column: ${colNames.includes('owner_contact') ? 'OK' : 'MISSING!'}`);
    console.log(`  owner_id column: ${colNames.includes('owner_id') ? 'OK' : 'MISSING!'}`);

    // Check functions
    const funcs = await client.query(
      "SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_type='FUNCTION'"
    );
    const funcNames = funcs.rows.map(r => r.routine_name);
    ['check_budget_available', 'log_api_usage', 'reset_monthly_budgets', 'get_or_create_budget'].forEach(f => {
      const exists = funcNames.includes(f);
      console.log(`  ${f}(): ${exists ? 'OK' : 'MISSING!'}`);
      if (!exists) allGood = false;
    });

    if (allGood) {
      console.log('\n*** ALL MIGRATIONS APPLIED SUCCESSFULLY ***');
    } else {
      console.log('\n*** SOME ITEMS STILL MISSING - CHECK ABOVE ***');
    }

  } catch(e) {
    console.error('Error:', e.message);
    if (e.detail) console.error('Detail:', e.detail);
  } finally {
    await client.end();
  }
}

main();

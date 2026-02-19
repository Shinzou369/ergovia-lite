-- ============================================
-- ERGOVIA LITE MARKETING - DATABASE SCHEMA
-- ============================================
-- Run this script to create all required tables

-- Create database (run as superuser if needed)
-- CREATE DATABASE ergovia_marketing;

-- ============================================
-- LEADS TABLE
-- Captures potential customers from the marketing page
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    property_count INTEGER DEFAULT 1,
    source VARCHAR(100) DEFAULT 'marketing_page',
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_content VARCHAR(255),
    utm_term VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    landing_page VARCHAR(500),
    referrer VARCHAR(500),
    converted BOOLEAN DEFAULT FALSE,
    converted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_converted ON leads(converted);

-- ============================================
-- CUSTOMERS TABLE
-- Stores customer information from Lemon Squeezy
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),

    -- Lemon Squeezy IDs
    lemonsqueezy_customer_id VARCHAR(100),
    lemonsqueezy_subscription_id VARCHAR(100),

    -- Subscription details
    subscription_status VARCHAR(50) DEFAULT 'none',
    subscription_created_at TIMESTAMP,
    subscription_ends_at TIMESTAMP,

    -- Customer status
    status VARCHAR(50) DEFAULT 'pending',
    -- pending, active, inactive, churned, paused

    -- Provisioning status (for n8n setup)
    provisioning_status VARCHAR(50) DEFAULT 'pending',
    -- pending, in_progress, completed, failed
    provisioned_at TIMESTAMP,
    n8n_instance_url VARCHAR(500),
    telegram_bot_token VARCHAR(255),

    -- Metadata
    notes TEXT,
    tags VARCHAR(255)[],

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_subscription_status ON customers(subscription_status);
CREATE INDEX idx_customers_lemonsqueezy_subscription_id ON customers(lemonsqueezy_subscription_id);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- Detailed subscription tracking
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    customer_email VARCHAR(255) NOT NULL REFERENCES customers(email),
    lemonsqueezy_subscription_id VARCHAR(100) UNIQUE NOT NULL,

    -- Plan details
    plan_name VARCHAR(100) DEFAULT 'ergovia_lite_monthly',
    plan_price INTEGER DEFAULT 29700, -- in cents ($297.00)
    currency VARCHAR(3) DEFAULT 'USD',
    billing_anchor INTEGER, -- day of month

    -- Status
    status VARCHAR(50) DEFAULT 'active',
    -- active, paused, cancelled, expired, past_due

    -- Dates
    trial_ends_at TIMESTAMP,
    renews_at TIMESTAMP,
    last_payment_at TIMESTAMP,
    next_payment_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    expired_at TIMESTAMP,

    -- Cancellation details
    cancellation_reason TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_customer_email ON subscriptions(customer_email);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_lemonsqueezy_id ON subscriptions(lemonsqueezy_subscription_id);

-- ============================================
-- ORDERS TABLE
-- One-time purchase records
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    lemonsqueezy_order_id VARCHAR(100) UNIQUE NOT NULL,

    -- Order details
    amount INTEGER NOT NULL, -- in cents
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'completed',

    -- Tax info
    tax_amount INTEGER DEFAULT 0,
    discount_amount INTEGER DEFAULT 0,

    -- Metadata
    product_name VARCHAR(255),
    variant_name VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ============================================
-- PAYMENTS TABLE
-- Recurring payment records
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES subscriptions(id),

    -- Payment details
    amount INTEGER NOT NULL, -- in cents
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    -- success, failed, refunded, pending

    -- Lemon Squeezy invoice
    lemonsqueezy_invoice_id VARCHAR(100),
    invoice_url VARCHAR(500),

    -- Failure details (if failed)
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- ============================================
-- WEBHOOK EVENTS TABLE
-- Log all incoming webhooks for debugging
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL, -- 'lemonsqueezy', 'stripe', etc.
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255),
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_source ON webhook_events(source);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);

-- ============================================
-- ACTIVITY LOG TABLE
-- Track important customer activities
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    customer_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    description TEXT,
    metadata JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_log_customer_email ON activity_log(customer_email);
CREATE INDEX idx_activity_log_action ON activity_log(action);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at);

-- ============================================
-- EMAIL QUEUE TABLE
-- For transactional emails
-- ============================================
CREATE TABLE IF NOT EXISTS email_queue (
    id SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    template_name VARCHAR(100) NOT NULL,
    subject VARCHAR(500),
    variables JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    -- pending, sent, failed
    sent_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_created_at ON email_queue(created_at);

-- ============================================
-- REVENUE METRICS VIEW
-- Easy access to revenue stats
-- ============================================
CREATE OR REPLACE VIEW revenue_metrics AS
SELECT
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as payment_count,
    SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as revenue,
    SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END) as failed_amount,
    SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as refunded_amount
FROM payments
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- ============================================
-- CUSTOMER METRICS VIEW
-- Customer acquisition and churn
-- ============================================
CREATE OR REPLACE VIEW customer_metrics AS
SELECT
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as new_customers,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_customers,
    SUM(CASE WHEN status = 'churned' THEN 1 ELSE 0 END) as churned_customers
FROM customers
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all relevant tables
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA (Optional)
-- ============================================

-- Insert test lead (uncomment for development)
-- INSERT INTO leads (email, name, property_count, source)
-- VALUES ('test@example.com', 'Test User', 2, 'marketing_page');

-- ============================================
-- PERMISSIONS (Adjust as needed)
-- ============================================

-- Grant access to the backend user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ergovia_backend;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ergovia_backend;

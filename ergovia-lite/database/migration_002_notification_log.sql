-- ============================================================================
-- MIGRATION 002: Notification audit log
-- Date: 2026-02-16
-- Purpose: Track every notification sent by SUB: Owner & Staff Notifier
-- Used by: SUB Notifier log nodes, dashboard notification history
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    notification_id UUID DEFAULT uuid_generate_v4(),
    property_id VARCHAR(255),
    recipient_type VARCHAR(50),         -- 'owner', 'cleaner', 'vendor'
    recipient_name VARCHAR(255),
    channel VARCHAR(50),                -- 'telegram', 'whatsapp', 'sms', 'skip'
    recipient_address VARCHAR(255),     -- chat_id or phone number (masked for privacy)
    event_type VARCHAR(100),            -- 'maintenance', 'cleaning', 'vendor_update', 'booking', 'security', 'daily_brief'
    message TEXT,
    status VARCHAR(50) DEFAULT 'sent',  -- 'sent', 'delivered', 'failed', 'skipped'
    error_message TEXT,
    customer_id UUID,
    execution_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_property ON notification_log(property_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON notification_log(channel);
CREATE INDEX IF NOT EXISTS idx_notification_log_date ON notification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);

-- ============================================================================
-- END OF MIGRATION 002
-- ============================================================================

-- ============================================================================
-- ERGOVIA LITE - PostgreSQL Schema
-- Extracted from partner's onboarding workflows (SUB3_Database_Services)
-- Complete schema for AirBNB Automation System (23+ tables)
-- ============================================================================

-- Enable UUID extension for unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TRIGGER FUNCTION (must be created first)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- TABLE: bookings
-- Used by: Workflow 00 (Message Router), Workflow 01 (Dashboard), others
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    booking_id VARCHAR(255) UNIQUE NOT NULL,
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    property_name VARCHAR(255),
    property_id VARCHAR(255),
    check_in_date DATE,
    check_out_date DATE,
    booking_status VARCHAR(50), -- confirmed, pending, cancelled, completed
    guests INTEGER,
    total_amount DECIMAL(10,2),
    payment_status VARCHAR(50),
    platform VARCHAR(50), -- airbnb, booking.com, direct, etc.
    channel_type VARCHAR(50), -- telegram, whatsapp, sms, form
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    special_requests TEXT
);

CREATE INDEX idx_bookings_phone_status ON bookings(guest_phone, booking_status);
CREATE INDEX idx_bookings_dates ON bookings(check_in_date, check_out_date);
CREATE INDEX idx_bookings_status ON bookings(booking_status);
CREATE INDEX idx_bookings_property ON bookings(property_id);

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: inquiries
-- Used by: Workflow 05 (Inquiry Handler)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inquiries (
    id SERIAL PRIMARY KEY,
    inquiry_id VARCHAR(255) UNIQUE NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_name VARCHAR(255),
    client_phone VARCHAR(50),
    client_email VARCHAR(255),
    property_interested VARCHAR(255),
    check_in DATE,
    check_out DATE,
    guests INTEGER,
    message TEXT,
    channel_type VARCHAR(50), -- telegram, whatsapp, sms, form, unknown, error
    inquiry_status VARCHAR(50), -- new, processing, converted, declined_unavailable, declined_requirements, expired
    raw_data JSONB,
    error_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inquiries_phone ON inquiries(client_phone);
CREATE INDEX idx_inquiries_status ON inquiries(inquiry_status);
CREATE INDEX idx_inquiries_timestamp ON inquiries(timestamp);

CREATE TRIGGER update_inquiries_updated_at BEFORE UPDATE ON inquiries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: deals
-- Used by: Workflow 00, 05 (Inquiry Handler), 02 (Conflict Manager)
-- ============================================================================
CREATE TABLE IF NOT EXISTS deals (
    id SERIAL PRIMARY KEY,
    deal_id VARCHAR(255) UNIQUE NOT NULL,
    inquiry_id VARCHAR(255),
    contact_id VARCHAR(255),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    client_name VARCHAR(255),
    client_phone VARCHAR(50),
    client_email VARCHAR(255),
    property_name VARCHAR(255),
    property_id VARCHAR(255),
    check_in_date DATE,
    check_out_date DATE,
    guests INTEGER,
    num_guests INTEGER,
    total_amount DECIMAL(10,2),
    status VARCHAR(50), -- negotiation, pending_conflict, needs_owner_decision, pending_payment_confirmation, ai_conversation, confirmed, rejected, expired
    deal_status VARCHAR(50), -- alias for status, used by WF2
    deal_type VARCHAR(50), -- normal, conflict, party, negotiation
    price_quoted DECIMAL(10,2),
    price_final DECIMAL(10,2),
    channel VARCHAR(50),
    channel_type VARCHAR(50),
    conversation_history JSONB,
    conflict_priority INTEGER,
    conflict_reason TEXT,
    priority_score INTEGER,
    owner_notes TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    FOREIGN KEY (inquiry_id) REFERENCES inquiries(inquiry_id) ON DELETE SET NULL
);

CREATE INDEX idx_deals_phone_status ON deals(client_phone, status);
CREATE INDEX idx_deals_contact ON deals(contact_id);
CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deals_deal_status ON deals(deal_status);
CREATE INDEX idx_deals_property_dates ON deals(property_id, check_in_date, check_out_date);
CREATE INDEX idx_deals_inquiry ON deals(inquiry_id);

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: message_router_log
-- Used by: Workflow 00 (Message Router)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_router_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    sender_identifier VARCHAR(255),
    channel_type VARCHAR(50), -- telegram, whatsapp, sms
    message_preview TEXT,
    routing_decision VARCHAR(100),
    routing_reason VARCHAR(255),
    associated_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_message_log_timestamp ON message_router_log(timestamp, sender_identifier);
CREATE INDEX idx_message_log_sender ON message_router_log(sender_identifier);
CREATE INDEX idx_message_log_channel ON message_router_log(channel_type);

-- ============================================================================
-- TABLE: property_configurations
-- Used by: Workflow 05, 01 and many others
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_configurations (
    id SERIAL PRIMARY KEY,
    property_id VARCHAR(255) UNIQUE NOT NULL,
    property_name VARCHAR(255) UNIQUE NOT NULL,
    address TEXT,
    max_guests INTEGER,
    bedrooms INTEGER,
    bathrooms INTEGER,

    -- Pricing
    base_price DECIMAL(10,2),
    weekend_price DECIMAL(10,2),
    holiday_price DECIMAL(10,2),
    cleaning_fee DECIMAL(10,2),

    -- Owner contact info
    owner_name VARCHAR(255),
    owner_phone VARCHAR(50),
    owner_email VARCHAR(255),
    owner_telegram VARCHAR(100),

    -- Property settings
    auto_approve_bookings BOOLEAN DEFAULT false,
    require_screening BOOLEAN DEFAULT true,
    min_stay_nights INTEGER DEFAULT 1,
    max_stay_nights INTEGER DEFAULT 30,

    -- Integration settings
    calendar_sync_enabled BOOLEAN DEFAULT true,
    calendar_url TEXT,
    last_calendar_sync TIMESTAMP,

    -- Timezone (IANA format)
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Status
    property_status VARCHAR(50) DEFAULT 'active', -- active, inactive, maintenance

    -- Property details (used by WF2 Booking Agent)
    property_type VARCHAR(100), -- apartment, house, villa, studio, etc.
    amenities TEXT,
    house_rules TEXT,
    check_in_time VARCHAR(10) DEFAULT '15:00',
    check_out_time VARCHAR(10) DEFAULT '11:00',
    location_description TEXT,
    preferred_platform VARCHAR(50) DEFAULT 'telegram',

    -- Flexible settings JSON
    settings JSONB DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_name ON property_configurations(property_name);
CREATE INDEX idx_property_status ON property_configurations(property_status);
CREATE INDEX idx_property_timezone ON property_configurations(timezone);

CREATE TRIGGER update_property_configurations_updated_at BEFORE UPDATE ON property_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: system_settings
-- Used by: All workflows for global configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string', -- string, boolean, number, json
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_system_settings_key ON system_settings(setting_key);

INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
VALUES
    ('default_timezone', 'UTC', 'string', 'Default timezone for new properties (IANA format)'),
    ('business_hours_start', '09:00', 'string', 'Default business hours start time'),
    ('business_hours_end', '18:00', 'string', 'Default business hours end time'),
    ('notification_quiet_hours_start', '22:00', 'string', 'Start of quiet hours'),
    ('notification_quiet_hours_end', '08:00', 'string', 'End of quiet hours')
ON CONFLICT (setting_key) DO NOTHING;

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: control_panel_tasks
-- Used by: Workflow 01 (Control Panel Hub)
-- ============================================================================
CREATE TABLE IF NOT EXISTS control_panel_tasks (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) UNIQUE NOT NULL,
    command VARCHAR(100), -- dashboard, approve_deal, reject_deal, etc.
    parameters JSONB,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    requested_by VARCHAR(255),
    property_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    result TEXT
);

CREATE INDEX idx_control_panel_status ON control_panel_tasks(status);
CREATE INDEX idx_control_panel_requested_by ON control_panel_tasks(requested_by);

-- ============================================================================
-- TABLE: manual_tasks
-- Used by: Workflow 01, 04 (Task Queue Manager)
-- ============================================================================
CREATE TABLE IF NOT EXISTS manual_tasks (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) UNIQUE NOT NULL,
    task_type VARCHAR(100), -- review_booking, contact_guest, maintenance, etc.
    description TEXT,
    priority INTEGER DEFAULT 5, -- 1 (highest) to 10 (lowest)
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    assigned_to VARCHAR(255),
    related_booking_id VARCHAR(255),
    related_property_id VARCHAR(255),
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_manual_tasks_status ON manual_tasks(status);
CREATE INDEX idx_manual_tasks_priority ON manual_tasks(priority, status);
CREATE INDEX idx_manual_tasks_due_date ON manual_tasks(due_date);

CREATE TRIGGER update_manual_tasks_updated_at BEFORE UPDATE ON manual_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: scheduled_messages
-- Used by: Workflow 08 & 09 (Guest Journey)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    booking_id VARCHAR(255),
    property_id VARCHAR(255),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    message_type VARCHAR(100), -- check_in_reminder, checkout_instructions, wifi_details, etc.
    message_content TEXT,
    channel VARCHAR(50), -- telegram, whatsapp, sms
    scheduled_time TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed, cancelled
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
);

CREATE INDEX idx_scheduled_messages_booking ON scheduled_messages(booking_id);
CREATE INDEX idx_scheduled_messages_status ON scheduled_messages(status);
CREATE INDEX idx_scheduled_messages_scheduled_time ON scheduled_messages(scheduled_time, status);
CREATE INDEX idx_scheduled_messages_channel ON scheduled_messages(channel);

CREATE TRIGGER update_scheduled_messages_updated_at BEFORE UPDATE ON scheduled_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: cleaners
-- Used by: Workflow 10 (Cleaning Reports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cleaners (
    id SERIAL PRIMARY KEY,
    cleaner_id VARCHAR(255) UNIQUE NOT NULL,
    cleaner_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    telegram_id VARCHAR(100),

    -- Performance tracking
    total_jobs INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    average_completion_time INTEGER, -- in minutes
    average_rating DECIMAL(3,2),

    -- Current status
    current_workload INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, on_leave

    -- Availability
    available_days JSONB, -- ["monday", "tuesday", ...]
    max_jobs_per_day INTEGER DEFAULT 3,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cleaners_name ON cleaners(cleaner_name);
CREATE INDEX idx_cleaners_status ON cleaners(status);
CREATE INDEX idx_cleaners_workload ON cleaners(current_workload);

CREATE TRIGGER update_cleaners_updated_at BEFORE UPDATE ON cleaners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: cleaning_tasks
-- Used by: Workflow 10 (Cleaning Completion Tracker)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255) NOT NULL,
    property_name VARCHAR(255),
    cleaner_id VARCHAR(255),
    cleaner_name VARCHAR(255),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    status VARCHAR(50) DEFAULT 'scheduled',
    task_type VARCHAR(100),
    checklist JSON,
    checklist_score INTEGER,
    completion_notes TEXT,
    notes TEXT,
    completed_at TIMESTAMP,
    estimated_duration INTEGER,
    actual_duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cleaning_tasks_task_id ON cleaning_tasks(task_id);
CREATE INDEX idx_cleaning_tasks_property ON cleaning_tasks(property_id);
CREATE INDEX idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX idx_cleaning_tasks_status ON cleaning_tasks(status);
CREATE INDEX idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);

CREATE TRIGGER update_cleaning_tasks_updated_at BEFORE UPDATE ON cleaning_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: calendar_sync_log
-- Used by: Workflow 11 (Daily Morning Check)
-- ============================================================================
CREATE TABLE IF NOT EXISTS calendar_sync_log (
    id SERIAL PRIMARY KEY,
    sync_id VARCHAR(255) UNIQUE NOT NULL,
    sync_date DATE NOT NULL,
    property_id VARCHAR(255),
    conflicts_count INTEGER DEFAULT 0,
    conflicts_details JSONB,
    bookings_synced INTEGER DEFAULT 0,
    manual_sync_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, failed
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_calendar_sync_date ON calendar_sync_log(sync_date);
CREATE INDEX idx_calendar_sync_property ON calendar_sync_log(property_id);
CREATE INDEX idx_calendar_sync_status ON calendar_sync_log(status);

CREATE TRIGGER update_calendar_sync_log_updated_at BEFORE UPDATE ON calendar_sync_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: pricing_history
-- Used by: Workflow 12 (Dynamic Pricing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pricing_history (
    id SERIAL PRIMARY KEY,
    property_id VARCHAR(255),
    date DATE NOT NULL,
    base_price DECIMAL(10,2),
    weekend_price DECIMAL(10,2),
    holiday_price DECIMAL(10,2),
    occupancy_rate DECIMAL(5,2),
    market_demand VARCHAR(50), -- low, medium, high
    competitor_avg_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(property_id, date),
    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id)
);

CREATE INDEX idx_pricing_history_property_date ON pricing_history(property_id, date);
CREATE INDEX idx_pricing_history_date ON pricing_history(date);

-- ============================================================================
-- TABLE: pricing_recommendations
-- Used by: Workflow 12 (Dynamic Pricing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pricing_recommendations (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255),
    property_name VARCHAR(255),
    date DATE NOT NULL,
    current_price DECIMAL(10,2),
    recommended_price DECIMAL(10,2),
    percentage_change DECIMAL(5,2),
    reasoning TEXT,
    confidence VARCHAR(50), -- low, medium, high
    priority VARCHAR(50), -- low, medium, high, urgent
    pricing_decision_contact VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- pending, applied, skipped, expired
    applied_by VARCHAR(255),
    applied_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id)
);

CREATE INDEX idx_pricing_recommendations_property ON pricing_recommendations(property_id);
CREATE INDEX idx_pricing_recommendations_status ON pricing_recommendations(status);
CREATE INDEX idx_pricing_recommendations_date ON pricing_recommendations(date);

CREATE TRIGGER update_pricing_recommendations_updated_at BEFORE UPDATE ON pricing_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: vendors
-- Used by: Workflow 13 (Maintenance Management)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- plumbing, electrical, hvac, appliance, cleaning, general
    phone VARCHAR(50),
    email VARCHAR(255),
    telegram_id VARCHAR(100),
    total_jobs INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    current_jobs INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2),
    average_response_time INTEGER, -- in minutes
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, on_leave
    max_concurrent_jobs INTEGER DEFAULT 3,
    service_areas JSONB, -- array of property IDs
    hourly_rate DECIMAL(10,2),
    emergency_rate DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vendors_category ON vendors(category);
CREATE INDEX idx_vendors_status ON vendors(status);
CREATE INDEX idx_vendors_current_jobs ON vendors(current_jobs);

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: maintenance_tickets
-- Used by: Workflow 13, 14 (Maintenance Management)
-- ============================================================================
CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255),
    property_name VARCHAR(255),
    issue_description TEXT,
    category VARCHAR(100), -- plumbing, electrical, hvac, appliance, general
    urgency VARCHAR(50), -- low, medium, high, emergency
    guest_impact BOOLEAN DEFAULT false,
    reported_by VARCHAR(255),
    channel_type VARCHAR(50),
    photos JSONB,
    vendor_id VARCHAR(255),
    vendor_type VARCHAR(100),
    assigned_vendor VARCHAR(255),
    vendor_contact VARCHAR(100),
    reasoning TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- pending, dispatched, in_progress, completed, cancelled
    dispatch_time TIMESTAMP,
    completion_time TIMESTAMP,
    estimated_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id)
);

CREATE INDEX idx_maintenance_tickets_property ON maintenance_tickets(property_id);
CREATE INDEX idx_maintenance_tickets_status ON maintenance_tickets(status);
CREATE INDEX idx_maintenance_tickets_vendor ON maintenance_tickets(vendor_id);
CREATE INDEX idx_maintenance_tickets_urgency ON maintenance_tickets(urgency);

CREATE TRIGGER update_maintenance_tickets_updated_at BEFORE UPDATE ON maintenance_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: inventory
-- Used by: Workflow 15 (Inventory Predictor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    item_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255),
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- linens, toiletries, cleaning_supplies, appliances, furniture
    current_qty INTEGER DEFAULT 0,
    min_qty INTEGER DEFAULT 5,
    max_qty INTEGER DEFAULT 50,
    qty_on_order INTEGER DEFAULT 0,
    avg_usage_per_booking DECIMAL(5,2),
    last_restock_date DATE,
    last_usage_date DATE,
    unit_cost DECIMAL(10,2),
    supplier_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'in_stock', -- in_stock, low_stock, out_of_stock, discontinued
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(property_id, item_name),
    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id)
);

CREATE INDEX idx_inventory_property ON inventory(property_id);
CREATE INDEX idx_inventory_status ON inventory(status);
CREATE INDEX idx_inventory_category ON inventory(category);
CREATE INDEX idx_inventory_low_stock ON inventory(current_qty, min_qty) WHERE current_qty <= min_qty;

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: suppliers
-- Used by: Workflow 15 (Inventory Management)
-- ============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    supplier_id VARCHAR(255) UNIQUE NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- linens, toiletries, cleaning_supplies, hardware
    contact_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    average_delivery_days INTEGER,
    reliability_score DECIMAL(3,2), -- 0-10
    minimum_order_amount DECIMAL(10,2),
    payment_terms VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active', -- active, inactive
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_suppliers_name ON suppliers(supplier_name);
CREATE INDEX idx_suppliers_category ON suppliers(category);
CREATE INDEX idx_suppliers_status ON suppliers(status);

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: purchase_orders
-- Used by: Workflow 15 (Inventory Predictor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255),
    supplier_id VARCHAR(255),
    items JSONB,
    quantities JSONB,
    order_date DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    total_cost DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'pending', -- pending, ordered, shipped, received, cancelled
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id)
);

CREATE INDEX idx_purchase_orders_property ON purchase_orders(property_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_date ON purchase_orders(order_date);

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: reviews
-- Used by: Workflow 16 (Review Monitoring & Response)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    review_id VARCHAR(255) UNIQUE NOT NULL,
    platform VARCHAR(100), -- airbnb, booking_com, google, direct
    property_id VARCHAR(255),
    property_name VARCHAR(255),
    booking_id VARCHAR(255),
    guest_name VARCHAR(255),
    guest_id VARCHAR(255),
    star_rating INTEGER,
    review_text TEXT,
    review_date DATE,
    received_date TIMESTAMP,

    -- AI analysis
    sentiment VARCHAR(50), -- positive, neutral, negative, mixed
    sentiment_score DECIMAL(3,2), -- -1 to 1
    topics JSONB,
    issues_mentioned JSONB,
    confidence DECIMAL(3,2), -- 0-1

    -- Response management
    response_text TEXT,
    final_response TEXT,
    approval_required BOOLEAN DEFAULT false,
    approval_urgency VARCHAR(50), -- low, medium, high, urgent
    response_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, posted, declined, skipped
    decision_date TIMESTAMP,
    posted_date TIMESTAMP,
    posted_by VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id),
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
);

CREATE INDEX idx_reviews_property ON reviews(property_id);
CREATE INDEX idx_reviews_platform ON reviews(platform);
CREATE INDEX idx_reviews_sentiment ON reviews(sentiment);
CREATE INDEX idx_reviews_status ON reviews(response_status);
CREATE INDEX idx_reviews_rating ON reviews(star_rating);
CREATE INDEX idx_reviews_date ON reviews(review_date);
CREATE INDEX idx_reviews_pending_approval ON reviews(response_status, approval_required) WHERE response_status = 'pending';

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: guest_blacklist
-- Used by: Workflow 17 (Guest Screening)
-- ============================================================================
CREATE TABLE IF NOT EXISTS guest_blacklist (
    id SERIAL PRIMARY KEY,
    blacklist_id VARCHAR(255) UNIQUE NOT NULL,
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    reason TEXT NOT NULL,
    incident_date DATE,
    property_id VARCHAR(255),
    booking_id VARCHAR(255),
    severity VARCHAR(50), -- low, medium, high, permanent
    status VARCHAR(50) DEFAULT 'active', -- active, expired, removed
    expires_at DATE,
    added_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_guest_blacklist_phone ON guest_blacklist(guest_phone);
CREATE INDEX idx_guest_blacklist_email ON guest_blacklist(guest_email);
CREATE INDEX idx_guest_blacklist_status ON guest_blacklist(status);
CREATE INDEX idx_guest_blacklist_active ON guest_blacklist(status, expires_at) WHERE status = 'active';

CREATE TRIGGER update_guest_blacklist_updated_at BEFORE UPDATE ON guest_blacklist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: guest_screening_log
-- Used by: Workflow 17 (Guest Screening)
-- ============================================================================
CREATE TABLE IF NOT EXISTS guest_screening_log (
    id SERIAL PRIMARY KEY,
    screening_id VARCHAR(255) UNIQUE NOT NULL,
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    property_id VARCHAR(255),
    check_in_date DATE,
    check_out_date DATE,
    guests INTEGER,

    -- AI risk assessment
    risk_score DECIMAL(3,2), -- 0-1 (0=low risk, 1=high risk)
    risk_level VARCHAR(50), -- low, medium, high, very_high
    risk_factors JSONB,
    confidence DECIMAL(3,2), -- 0-1

    -- Blacklist check
    blacklist_match BOOLEAN DEFAULT false,
    blacklist_reason TEXT,

    -- Decision
    decision VARCHAR(50), -- auto_approved, needs_approval, auto_declined, declined_by_owner, approved_by_owner
    decision_date TIMESTAMP,
    decided_by VARCHAR(255),
    deal_id VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id)
);

CREATE INDEX idx_guest_screening_phone ON guest_screening_log(guest_phone);
CREATE INDEX idx_guest_screening_email ON guest_screening_log(guest_email);
CREATE INDEX idx_guest_screening_decision ON guest_screening_log(decision);
CREATE INDEX idx_guest_screening_risk ON guest_screening_log(risk_level);
CREATE INDEX idx_guest_screening_date ON guest_screening_log(created_at);

CREATE TRIGGER update_guest_screening_log_updated_at BEFORE UPDATE ON guest_screening_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: incidents
-- Used by: Workflow 23 (Incident Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(255) UNIQUE NOT NULL,
    incident_type VARCHAR(100), -- damage, noise, rule_violation, late_checkout, party, other
    severity VARCHAR(50), -- low, medium, high, critical
    description TEXT NOT NULL,
    incident_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    booking_id VARCHAR(255),
    property_id VARCHAR(255),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    estimated_damage_cost DECIMAL(10,2),
    charged_amount DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'reported', -- reported, investigating, resolved, charged, dispute
    resolution_notes TEXT,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    guest_contacted BOOLEAN DEFAULT false,
    police_involved BOOLEAN DEFAULT false,
    insurance_claim BOOLEAN DEFAULT false,
    blacklist_recommended BOOLEAN DEFAULT false,
    reported_by VARCHAR(255),
    photos JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    FOREIGN KEY (property_id) REFERENCES property_configurations(property_id)
);

CREATE INDEX idx_incidents_booking ON incidents(booking_id);
CREATE INDEX idx_incidents_property ON incidents(property_id);
CREATE INDEX idx_incidents_guest_phone ON incidents(guest_phone);
CREATE INDEX idx_incidents_type ON incidents(incident_type);
CREATE INDEX idx_incidents_severity ON incidents(severity);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_date ON incidents(incident_date);

CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: deal_conflicts
-- Used by: Workflow 02 (Conflict Prioritization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS deal_conflicts (
    id SERIAL PRIMARY KEY,
    conflict_id VARCHAR(255) UNIQUE NOT NULL,
    property_id VARCHAR(255) NOT NULL,
    conflict_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending_decision',
    conflicting_deal_ids TEXT[],
    chosen_deal_id VARCHAR(255),
    rejected_deal_ids TEXT[],
    resolved_at TIMESTAMP,
    resolution_reason TEXT,
    priority_score INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deal_conflicts_conflict_id ON deal_conflicts(conflict_id);
CREATE INDEX idx_deal_conflicts_property ON deal_conflicts(property_id);
CREATE INDEX idx_deal_conflicts_status ON deal_conflicts(status);
CREATE INDEX idx_deal_conflicts_date ON deal_conflicts(conflict_date);

CREATE TRIGGER update_deal_conflicts_updated_at BEFORE UPDATE ON deal_conflicts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: conversations
-- Used by: WF2 (AI Booking Agent) - tracks guest conversation state
-- ============================================================================
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

CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_property ON conversations(property_id);
CREATE INDEX idx_conversations_stage ON conversations(conversation_stage);
CREATE INDEX idx_conversations_active ON conversations(is_active) WHERE is_active = true;

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: activity_log
-- Used by: WF1 (AI Gateway), WF6 (Daily Automations), others
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    log_id VARCHAR(255),
    event_type VARCHAR(100),
    automation_type VARCHAR(100),
    channel VARCHAR(50),
    contact_id VARCHAR(255),
    sender_id VARCHAR(255),
    sender_name VARCHAR(255),
    message TEXT,
    action TEXT,
    details JSONB,
    status VARCHAR(50) DEFAULT 'completed',
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    properties_processed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(automation_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_contact ON activity_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log(created_at);

-- ============================================================================
-- HELPFUL VIEWS
-- ============================================================================

-- View for active bookings (used in Workflow 00)
CREATE OR REPLACE VIEW active_bookings AS
SELECT * FROM bookings
WHERE booking_status = 'confirmed'
  AND check_in_date <= CURRENT_DATE
  AND check_out_date >= CURRENT_DATE;

-- View for active deals (used in Workflow 00)
CREATE OR REPLACE VIEW active_deals AS
SELECT * FROM deals
WHERE status IN ('negotiation', 'pending_conflict', 'needs_owner_decision',
                 'pending_payment_confirmation', 'ai_conversation');

-- View for dashboard summary (used in Workflow 01)
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
    (SELECT COUNT(*) FROM deals WHERE status IN ('negotiation', 'pending_conflict')) as active_deals,
    (SELECT COUNT(*) FROM bookings WHERE booking_status = 'confirmed') as confirmed_bookings,
    (SELECT COUNT(*) FROM manual_tasks WHERE status = 'pending') as pending_tasks,
    (SELECT COUNT(*) FROM control_panel_tasks WHERE status = 'pending') as pending_commands;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

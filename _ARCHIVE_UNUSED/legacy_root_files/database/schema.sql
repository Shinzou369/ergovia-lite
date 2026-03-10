-- Prismity AI Property Management PostgreSQL Schema
-- Version: 1.0.0
-- Last Updated: 2026-01-19
-- Purpose: Complete database schema for property management automation
-- Replaces: Google Sheets (23 tabs)

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Property Configurations (Master property data)
CREATE TABLE IF NOT EXISTS property_configurations (
    property_id VARCHAR(50) PRIMARY KEY,
    property_name VARCHAR(255) NOT NULL,
    property_type VARCHAR(50) DEFAULT 'vacation_rental',
    property_status VARCHAR(20) DEFAULT 'active',
    
    -- Location
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Property Details
    bedrooms INTEGER DEFAULT 1,
    bathrooms DECIMAL(3,1) DEFAULT 1,
    max_guests INTEGER DEFAULT 4,
    square_feet INTEGER,
    
    -- Pricing
    base_price DECIMAL(10,2),
    cleaning_fee DECIMAL(10,2),
    security_deposit DECIMAL(10,2),
    minimum_nights INTEGER DEFAULT 1,
    
    -- Access Information
    wifi_name VARCHAR(100),
    wifi_password VARCHAR(100),
    door_code VARCHAR(50),
    gate_code VARCHAR(50),
    parking_instructions TEXT,
    
    -- Check-in/out
    checkin_time TIME DEFAULT '15:00',
    checkout_time TIME DEFAULT '11:00',
    
    -- Owner Contact
    owner_contact VARCHAR(255),
    owner_email VARCHAR(255),
    owner_phone VARCHAR(50),
    telegram_id VARCHAR(100),
    notification_channel VARCHAR(50) DEFAULT 'telegram',
    notification_preferences JSONB DEFAULT '{}',
    
    -- Calendar Integration
    calendar_sync_enabled BOOLEAN DEFAULT true,
    google_calendar_id VARCHAR(255),
    google_calendar_link TEXT,
    airbnb_link TEXT,
    vrbo_link TEXT,
    booking_link TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
    booking_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Guest Information
    guest_name VARCHAR(255) NOT NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(50),
    num_guests INTEGER DEFAULT 1,
    
    -- Dates
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    
    -- Status
    booking_status VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(50) DEFAULT 'pending',
    
    -- Financials
    total_price DECIMAL(10,2),
    paid_amount DECIMAL(10,2) DEFAULT 0,
    cleaning_fee DECIMAL(10,2),
    
    -- Source & Tracking
    booking_source VARCHAR(50),
    special_requests TEXT,
    notes TEXT,
    
    -- Timestamps
    payment_confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deals (Pre-booking negotiations)
CREATE TABLE IF NOT EXISTS deals (
    deal_id VARCHAR(50) PRIMARY KEY,
    property_name VARCHAR(255),
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Client Information
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    
    -- Booking Details
    check_in_date DATE,
    check_out_date DATE,
    guests INTEGER,
    
    -- Status & Priority
    status VARCHAR(50) DEFAULT 'negotiation',
    priority VARCHAR(20) DEFAULT 'normal',
    
    -- Pricing
    quoted_price DECIMAL(10,2),
    final_price DECIMAL(10,2),
    
    -- AI Conversation
    conversation_history JSONB DEFAULT '[]',
    last_interaction TIMESTAMP,
    
    -- Escalation
    escalation_timestamp TIMESTAMP,
    escalation_reason TEXT,
    
    -- Resolution
    booking_id VARCHAR(50),
    approved_date TIMESTAMP,
    approved_by VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts (CRM)
CREATE TABLE IF NOT EXISTS contacts (
    contact_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    telegram_id VARCHAR(100),
    whatsapp_id VARCHAR(100),
    
    -- Classification
    contact_type VARCHAR(50) DEFAULT 'guest',
    tags JSONB DEFAULT '[]',
    
    -- Notes & History
    notes TEXT,
    last_contact TIMESTAMP,
    total_bookings INTEGER DEFAULT 0,
    lifetime_value DECIMAL(10,2) DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    blacklisted BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TASK MANAGEMENT TABLES
-- ============================================================

-- Manual Tasks (Owner to-do list)
CREATE TABLE IF NOT EXISTS manual_tasks (
    task_id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Assignment
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    assigned_to VARCHAR(255),
    
    -- Scheduling
    due_date DATE,
    due_time TIME,
    
    -- Priority & Status
    priority INTEGER DEFAULT 3,
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Completion
    completed_at TIMESTAMP,
    completed_by VARCHAR(255),
    completion_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Control Panel Tasks (System-generated tasks)
CREATE TABLE IF NOT EXISTS control_panel_tasks (
    task_id VARCHAR(50) PRIMARY KEY,
    task_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Context
    property_id VARCHAR(50),
    booking_id VARCHAR(50),
    deal_id VARCHAR(50),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    priority INTEGER DEFAULT 3,
    
    -- Action
    action_required TEXT,
    action_options JSONB DEFAULT '[]',
    
    -- Resolution
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CLEANING & MAINTENANCE TABLES
-- ============================================================

-- Cleaners
CREATE TABLE IF NOT EXISTS cleaners (
    cleaner_id VARCHAR(50) PRIMARY KEY,
    cleaner_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    
    -- Capacity
    max_jobs_per_day INTEGER DEFAULT 3,
    current_jobs INTEGER DEFAULT 0,
    current_workload INTEGER DEFAULT 0,
    
    -- Performance
    completed_jobs INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2),
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    
    -- Preferences
    preferred_properties JSONB DEFAULT '[]',
    availability JSONB DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cleaning Tasks
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    task_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    booking_id VARCHAR(50) REFERENCES bookings(booking_id),
    
    -- Assignment
    cleaner_id VARCHAR(50) REFERENCES cleaners(cleaner_id),
    cleaner_name VARCHAR(255),
    
    -- Scheduling
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Completion
    completed_at TIMESTAMP,
    completion_notes TEXT,
    checklist_score INTEGER,
    
    -- Notes
    notes TEXT,
    special_instructions TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance Tickets
CREATE TABLE IF NOT EXISTS maintenance_tickets (
    ticket_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Issue Details
    issue TEXT NOT NULL,
    category VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'medium',
    
    -- Assignment
    assigned_to VARCHAR(255),
    vendor_id VARCHAR(50),
    
    -- Status
    status VARCHAR(20) DEFAULT 'open',
    
    -- Resolution
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    cost DECIMAL(10,2),
    
    -- Metadata
    reported_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendors (Service providers)
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id VARCHAR(50) PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    
    -- Contact
    phone VARCHAR(50),
    email VARCHAR(255),
    
    -- Capacity
    max_concurrent_jobs INTEGER DEFAULT 5,
    current_jobs INTEGER DEFAULT 0,
    
    -- Performance
    average_rating DECIMAL(3,2),
    total_jobs INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- MESSAGING & COMMUNICATION TABLES
-- ============================================================

-- Scheduled Messages
CREATE TABLE IF NOT EXISTS scheduled_messages (
    message_id VARCHAR(50) PRIMARY KEY,
    
    -- Recipient
    recipient_phone VARCHAR(50),
    recipient_email VARCHAR(255),
    recipient_telegram_id VARCHAR(100),
    channel VARCHAR(20) DEFAULT 'telegram',
    
    -- Context
    booking_id VARCHAR(50),
    property_id VARCHAR(50),
    
    -- Content
    message_type VARCHAR(50),
    message_content TEXT NOT NULL,
    
    -- Scheduling
    scheduled_time TIMESTAMP NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMP,
    error_message TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INVENTORY & SUPPLIES TABLES
-- ============================================================

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
    item_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Item Details
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    
    -- Quantities
    quantity INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 5,
    reorder_quantity INTEGER DEFAULT 10,
    
    -- Pricing
    unit_cost DECIMAL(10,2),
    
    -- Status
    last_restocked TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id VARCHAR(50) PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL,
    
    -- Contact
    phone VARCHAR(50),
    email VARCHAR(255),
    website TEXT,
    
    -- Details
    products JSONB DEFAULT '[]',
    payment_terms TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ANALYTICS & LOGGING TABLES
-- ============================================================

-- Calendar Sync Log
CREATE TABLE IF NOT EXISTS calendar_sync_log (
    sync_id VARCHAR(100) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    sync_date DATE NOT NULL,
    
    -- Results
    conflicts_count INTEGER DEFAULT 0,
    events_found INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    manual_sync_completed BOOLEAN DEFAULT false,
    
    -- Completion
    completed_at TIMESTAMP,
    completed_by VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deal Conflicts
CREATE TABLE IF NOT EXISTS deal_conflicts (
    conflict_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Conflicting Deals
    deal_ids JSONB DEFAULT '[]',
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending_decision',
    
    -- Resolution
    chosen_deal_id VARCHAR(50),
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Incidents
CREATE TABLE IF NOT EXISTS incidents (
    incident_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    booking_id VARCHAR(50) REFERENCES bookings(booking_id),
    
    -- Guest Info
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    
    -- Incident Details
    severity VARCHAR(20) DEFAULT 'low',
    description TEXT NOT NULL,
    incident_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Resolution
    resolved BOOLEAN DEFAULT false,
    resolution_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guest Blacklist
CREATE TABLE IF NOT EXISTS guest_blacklist (
    blacklist_id VARCHAR(50) PRIMARY KEY,
    
    -- Guest Identifiers
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    
    -- Reason
    reason TEXT NOT NULL,
    incident_ids JSONB DEFAULT '[]',
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    expires_at DATE,
    
    -- Added By
    added_by VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guest Screening Log
CREATE TABLE IF NOT EXISTS guest_screening_log (
    screening_id VARCHAR(50) PRIMARY KEY,
    
    -- Guest Info
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    
    -- Request Details
    property_id VARCHAR(50),
    check_in_date DATE,
    check_out_date DATE,
    
    -- Screening Results
    risk_score INTEGER DEFAULT 0,
    flags JSONB DEFAULT '[]',
    decision VARCHAR(20),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
    review_id VARCHAR(50) PRIMARY KEY,
    booking_id VARCHAR(50) REFERENCES bookings(booking_id),
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Review Content
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    
    -- Source
    platform VARCHAR(50),
    platform_review_id VARCHAR(100),
    
    -- Response
    response TEXT,
    responded_at TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'new',
    
    -- Metadata
    review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pricing History
CREATE TABLE IF NOT EXISTS pricing_history (
    pricing_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Date
    date DATE NOT NULL,
    
    -- Pricing
    base_price DECIMAL(10,2),
    adjusted_price DECIMAL(10,2),
    
    -- Factors
    occupancy_rate DECIMAL(5,2),
    local_events TEXT,
    adjustment_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pricing Recommendations
CREATE TABLE IF NOT EXISTS pricing_recommendations (
    recommendation_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    
    -- Date Range
    start_date DATE,
    end_date DATE,
    
    -- Recommendation
    current_price DECIMAL(10,2),
    recommended_price DECIMAL(10,2),
    confidence_score DECIMAL(3,2),
    
    -- Reasoning
    factors JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    applied BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inquiries (Initial contact tracking)
CREATE TABLE IF NOT EXISTS inquiries (
    inquiry_id VARCHAR(50) PRIMARY KEY,
    
    -- Contact
    name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    channel VARCHAR(20),
    
    -- Request
    property_id VARCHAR(50),
    check_in_date DATE,
    check_out_date DATE,
    guests INTEGER,
    message TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'new',
    converted_to_deal VARCHAR(50),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SYSTEM CONFIGURATION
-- ============================================================

-- Workflow Config (Key-value store for workflow settings)
CREATE TABLE IF NOT EXISTS workflow_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_phone ON bookings(guest_phone);

CREATE INDEX IF NOT EXISTS idx_deals_client_phone ON deals(client_phone);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_property ON deals(property_id);

CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_status ON cleaning_tasks(status);

CREATE INDEX IF NOT EXISTS idx_manual_tasks_status ON manual_tasks(status);
CREATE INDEX IF NOT EXISTS idx_manual_tasks_due ON manual_tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_time ON scheduled_messages(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);

CREATE INDEX IF NOT EXISTS idx_incidents_guest ON incidents(guest_phone, guest_email);

CREATE INDEX IF NOT EXISTS idx_inventory_property ON inventory(property_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reorder ON inventory(quantity, reorder_level);

-- ============================================================
-- INITIAL SEED DATA
-- ============================================================

INSERT INTO workflow_config (config_key, config_value, description) VALUES
    ('system_version', '1.0.0', 'Current system version'),
    ('timezone', 'UTC', 'Default timezone for all operations'),
    ('default_checkin_time', '15:00', 'Default check-in time'),
    ('default_checkout_time', '11:00', 'Default check-out time'),
    ('auto_approve_threshold', '500', 'Auto-approve bookings under this amount'),
    ('ai_model', 'gpt-4', 'Default AI model for conversations'),
    ('notification_delay_minutes', '5', 'Delay before sending notifications')
ON CONFLICT (config_key) DO NOTHING;

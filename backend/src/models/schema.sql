-- Prismity AI Backend Schema
-- This is the MASTER database schema for the SaaS platform itself
-- (Not to be confused with the client database schema in /database/schema.sql)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CLIENTS TABLE - Master record for each paying customer
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Business Info
    business_name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    
    -- Owner Contact
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50),
    preferred_platform VARCHAR(20) DEFAULT 'telegram',
    telegram_chat_id VARCHAR(100),
    whatsapp_number VARCHAR(50),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    trial_ends_at TIMESTAMP,
    
    -- Subscription
    plan VARCHAR(50) DEFAULT 'starter',
    monthly_price DECIMAL(10,2),
    billing_email VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP
);

-- ============================================================================
-- CLIENT_SERVERS TABLE - Infrastructure details for each client
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_servers (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(100) REFERENCES clients(client_id) ON DELETE CASCADE,
    
    -- Hetzner Server Info
    hetzner_server_id VARCHAR(100),
    server_ip VARCHAR(50),
    server_type VARCHAR(50) DEFAULT 'cx21',
    location VARCHAR(20) DEFAULT 'nbg1',
    
    -- Domain
    domain VARCHAR(255),
    ssl_provisioned BOOLEAN DEFAULT false,
    
    -- Credentials (encrypted in production)
    root_password TEXT,
    n8n_admin_password TEXT,
    n8n_api_key TEXT,
    authelia_admin_password TEXT,
    
    -- Database
    db_name VARCHAR(100),
    db_user VARCHAR(100),
    db_password TEXT,
    
    -- NocoDB
    nocodb_url VARCHAR(255),
    nocodb_admin_email VARCHAR(255),
    nocodb_admin_password TEXT,
    
    -- Status
    server_status VARCHAR(50) DEFAULT 'pending',
    last_health_check TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PROVISIONING_JOBS TABLE - Track onboarding progress
-- ============================================================================
CREATE TABLE IF NOT EXISTS provisioning_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(100) UNIQUE NOT NULL,
    client_id VARCHAR(100) REFERENCES clients(client_id) ON DELETE CASCADE,
    
    -- Status Tracking
    status VARCHAR(50) DEFAULT 'pending',
    current_step VARCHAR(100),
    steps_completed JSONB DEFAULT '[]',
    
    -- Progress Details
    progress_percent INTEGER DEFAULT 0,
    status_message TEXT,
    
    -- Error Handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    last_error_at TIMESTAMP,
    
    -- Timing
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CLIENT_SETTINGS TABLE - Configuration per client (replaces n8n BACKEND_01)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_settings (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(100) REFERENCES clients(client_id) ON DELETE CASCADE,
    section VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, section)
);

-- ============================================================================
-- CLIENT_CREDENTIALS TABLE - API keys and tokens (encrypted)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_credentials (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(100) REFERENCES clients(client_id) ON DELETE CASCADE,
    credential_type VARCHAR(50) NOT NULL,
    credential_name VARCHAR(100),
    credential_data JSONB,
    is_valid BOOLEAN DEFAULT true,
    last_validated TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, credential_type, credential_name)
);

-- ============================================================================
-- DEPLOYED_WORKFLOWS TABLE - Track which workflows are deployed per client
-- ============================================================================
CREATE TABLE IF NOT EXISTS deployed_workflows (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(100) REFERENCES clients(client_id) ON DELETE CASCADE,
    workflow_number INTEGER NOT NULL,
    workflow_name VARCHAR(255),
    n8n_workflow_id VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_execution TIMESTAMP,
    execution_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, workflow_number)
);

-- ============================================================================
-- AUDIT_LOG TABLE - Track all important actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- API_KEY_BANK TABLE - Developer-managed API keys pool for assignment to clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_key_bank (
    id SERIAL PRIMARY KEY,
    key_type VARCHAR(50) NOT NULL,
    api_key TEXT NOT NULL,
    label VARCHAR(255),
    is_assigned BOOLEAN DEFAULT false,
    assigned_to_client VARCHAR(100) REFERENCES clients(client_id) ON DELETE SET NULL,
    assigned_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SUPPORT_TICKETS TABLE - Error reporting system for developer notification
-- ============================================================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(100) UNIQUE NOT NULL,
    client_id VARCHAR(100) REFERENCES clients(client_id) ON DELETE SET NULL,
    ticket_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'normal',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    error_details JSONB,
    status VARCHAR(20) DEFAULT 'open',
    assigned_to VARCHAR(255),
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(owner_email);
CREATE INDEX IF NOT EXISTS idx_servers_client ON client_servers(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON provisioning_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON provisioning_jobs(status);
CREATE INDEX IF NOT EXISTS idx_settings_client ON client_settings(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_api_bank_type ON api_key_bank(key_type);
CREATE INDEX IF NOT EXISTS idx_api_bank_assigned ON api_key_bank(is_assigned);
CREATE INDEX IF NOT EXISTS idx_api_bank_client ON api_key_bank(assigned_to_client);
CREATE INDEX IF NOT EXISTS idx_tickets_client ON support_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON support_tickets(ticket_type);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_clients_timestamp ON clients;
CREATE TRIGGER update_clients_timestamp BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_servers_timestamp ON client_servers;
CREATE TRIGGER update_servers_timestamp BEFORE UPDATE ON client_servers
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_settings_timestamp ON client_settings;
CREATE TRIGGER update_settings_timestamp BEFORE UPDATE ON client_settings
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

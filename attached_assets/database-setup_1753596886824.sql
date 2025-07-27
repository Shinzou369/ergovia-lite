
-- ETF Database Setup
-- Run this once to create the required tables

-- Clients table
CREATE TABLE IF NOT EXISTS etf_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    industry TEXT,
    taskforce_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Deployments table
CREATE TABLE IF NOT EXISTS etf_deployments (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    n8n_workflow_id TEXT,
    workflow_name TEXT,
    taskforce_type TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    config_data TEXT,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES etf_clients(id)
);

-- Templates table (optional - for manual template management)
CREATE TABLE IF NOT EXISTS etf_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    n8n_workflow_id TEXT NOT NULL,
    taskforce_type TEXT NOT NULL,
    config_fields TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings table (for system configuration)
CREATE TABLE IF NOT EXISTS etf_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT OR IGNORE INTO etf_settings (key, value) VALUES 
('monthly_fee', '30'),
('currency', 'USD'),
('auto_activate_workflows', 'true');

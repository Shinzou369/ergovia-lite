# Hetzner Test Environment Setup Guide

## Overview
This guide sets up a complete test environment for your n8n property management system on a Hetzner Cloud server. Each client gets their own isolated server (1 Client = 1 Server architecture).

---

## Server Specifications (Recommended)

### Minimum (Testing/Small Portfolio - up to 5 properties)
- **Model:** CX21 (2 vCPU, 4GB RAM, 40GB SSD)
- **Cost:** ~€4.85/month
- **Location:** Choose closest to your properties/owners

### Recommended (Production - 5-20 properties)
- **Model:** CX31 (2 vCPU, 8GB RAM, 80GB SSD)
- **Cost:** ~€8.98/month

### Large Portfolio (20+ properties)
- **Model:** CX41 (4 vCPU, 16GB RAM, 160GB SSD)
- **Cost:** ~€17.95/month

---

## Step 1: Create Hetzner Server

1. Log into [Hetzner Cloud Console](https://console.hetzner.cloud)
2. Create new project: `client-name-vacation-rental`
3. Add Server:
   - Location: Nuremberg (EU) or Ashburn (US)
   - Image: **Ubuntu 22.04 LTS**
   - Type: CX21 or CX31
   - Networking: Public IPv4 + IPv6
   - SSH Key: Add your public key
   - Name: `n8n-client-name`

4. Note the IP address once created

---

## Step 2: Initial Server Setup

SSH into your server:
```bash
ssh root@YOUR_SERVER_IP
```

Run initial setup:
```bash
# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y curl git ufw fail2ban

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5678/tcp  # n8n
ufw --force enable

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

---

## Step 3: Create Directory Structure

```bash
# Create application directory
mkdir -p /opt/n8n-property-management
cd /opt/n8n-property-management

# Create subdirectories
mkdir -p n8n_data postgres_data backups logs workflows
```

---

## Step 4: Create Docker Compose Configuration

Create the main configuration file:

```bash
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-n8n}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-n8n_property}
    volumes:
      - ./postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-n8n}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - n8n-network

  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      # Database
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: ${POSTGRES_DB:-n8n_property}
      DB_POSTGRESDB_USER: ${POSTGRES_USER:-n8n}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      
      # n8n Configuration
      N8N_HOST: ${N8N_HOST:-localhost}
      N8N_PORT: 5678
      N8N_PROTOCOL: ${N8N_PROTOCOL:-http}
      WEBHOOK_URL: ${WEBHOOK_URL:-http://localhost:5678}
      GENERIC_TIMEZONE: ${TIMEZONE:-America/New_York}
      
      # Security
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: ${N8N_BASIC_AUTH_USER:-admin}
      N8N_BASIC_AUTH_PASSWORD: ${N8N_BASIC_AUTH_PASSWORD}
      
      # Execution Settings
      EXECUTIONS_DATA_PRUNE: "true"
      EXECUTIONS_DATA_MAX_AGE: 336  # 14 days in hours
      EXECUTIONS_DATA_SAVE_ON_SUCCESS: all
      EXECUTIONS_DATA_SAVE_ON_ERROR: all
      
      # Concurrency (adjust based on server size)
      N8N_CONCURRENCY_PRODUCTION_LIMIT: 10
      
    volumes:
      - ./n8n_data:/home/node/.n8n
      - ./workflows:/home/node/workflows
    ports:
      - "5678:5678"
    networks:
      - n8n-network

networks:
  n8n-network:
    driver: bridge
EOF
```

---

## Step 5: Create Environment File

```bash
cat > .env << 'EOF'
# PostgreSQL Configuration
POSTGRES_USER=n8n
POSTGRES_PASSWORD=CHANGE_THIS_STRONG_PASSWORD_123!
POSTGRES_DB=n8n_property

# n8n Configuration
N8N_HOST=your-domain.com
N8N_PROTOCOL=https
WEBHOOK_URL=https://your-domain.com
TIMEZONE=America/New_York

# n8n Authentication
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=CHANGE_THIS_ADMIN_PASSWORD!

# External API Keys (add as needed)
# OPENAI_API_KEY=sk-...
# STRIPE_SECRET_KEY=sk_live_...
# TWILIO_ACCOUNT_SID=AC...
# TWILIO_AUTH_TOKEN=...
# TELEGRAM_BOT_TOKEN=...
EOF

# Secure the env file
chmod 600 .env
```

**IMPORTANT:** Edit `.env` and change all passwords!

---

## Step 6: Create Database Initialization Script

```bash
cat > init-db.sql << 'EOF'
-- Property Management Database Schema
-- This runs automatically on first container start

-- Properties/Configurations Table
CREATE TABLE IF NOT EXISTS property_configurations (
    property_id VARCHAR(50) PRIMARY KEY,
    property_name VARCHAR(255) NOT NULL,
    property_status VARCHAR(50) DEFAULT 'active',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'USA',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    max_guests INTEGER DEFAULT 4,
    bedrooms INTEGER DEFAULT 1,
    bathrooms DECIMAL(3,1) DEFAULT 1,
    base_price DECIMAL(10,2),
    minimum_price DECIMAL(10,2),
    maximum_price DECIMAL(10,2),
    cleaning_fee DECIMAL(10,2) DEFAULT 0,
    max_discount INTEGER DEFAULT 15,
    door_code VARCHAR(50),
    wifi_network VARCHAR(100),
    wifi_password VARCHAR(100),
    parking_instructions TEXT,
    house_rules TEXT,
    local_recommendations TEXT,
    check_in_time TIME DEFAULT '15:00',
    check_out_time TIME DEFAULT '11:00',
    owner_contact VARCHAR(100),
    owner_preferred_platform VARCHAR(50) DEFAULT 'telegram',
    calendar_sync_enabled BOOLEAN DEFAULT true,
    calendar_sync_contact VARCHAR(100),
    last_calendar_sync TIMESTAMP,
    pricing_decision_contact VARCHAR(100),
    incident_response_contact VARCHAR(100),
    incident_response_platform VARCHAR(50) DEFAULT 'telegram',
    inventory_manager_contact VARCHAR(100),
    emergency_contact VARCHAR(100),
    emergency_contact_platform VARCHAR(50) DEFAULT 'telegram',
    designated_vendors JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    booking_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    number_of_guests INTEGER DEFAULT 1,
    total_price DECIMAL(10,2),
    booking_status VARCHAR(50) DEFAULT 'pending',
    booking_type VARCHAR(50) DEFAULT 'direct',
    external_platform VARCHAR(50),
    external_booking_id VARCHAR(100),
    payment_status VARCHAR(50) DEFAULT 'unpaid',
    notes TEXT,
    conversation_history JSONB DEFAULT '[]',
    guest_preferred_platform VARCHAR(50) DEFAULT 'sms',
    blocked_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deals Table (for inquiry/negotiation tracking)
CREATE TABLE IF NOT EXISTS deals (
    deal_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    client_name VARCHAR(255),
    client_phone VARCHAR(50),
    client_email VARCHAR(255),
    proposed_check_in DATE,
    proposed_check_out DATE,
    proposed_price DECIMAL(10,2),
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'inquiry',
    channel_type VARCHAR(50),
    conversation_history JSONB DEFAULT '[]',
    negotiation_rounds INTEGER DEFAULT 0,
    last_message_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled Messages Table
CREATE TABLE IF NOT EXISTS scheduled_messages (
    message_id VARCHAR(50) PRIMARY KEY,
    booking_id VARCHAR(50) REFERENCES bookings(booking_id),
    message_type VARCHAR(50) NOT NULL,
    message_template TEXT NOT NULL,
    scheduled_datetime TIMESTAMP NOT NULL,
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    channel_type VARCHAR(50) NOT NULL,
    recipient_phone VARCHAR(50),
    recipient_chat_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP,
    last_attempt_at TIMESTAMP,
    attempt_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cleaning Tasks Table
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    task_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES property_configurations(property_id),
    booking_id VARCHAR(50) REFERENCES bookings(booking_id),
    cleaner_id VARCHAR(50),
    cleaner_name VARCHAR(255),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    status VARCHAR(50) DEFAULT 'pending',
    completion_notes TEXT,
    checklist_score INTEGER,
    photos JSONB DEFAULT '[]',
    time_spent INTEGER,
    issues_found TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cleaners Table
CREATE TABLE IF NOT EXISTS cleaners (
    cleaner_id VARCHAR(50) PRIMARY KEY,
    cleaner_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    preferred_contact_method VARCHAR(50) DEFAULT 'sms',
    telegram_chat_id VARCHAR(100),
    whatsapp_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    current_workload INTEGER DEFAULT 0,
    max_jobs_per_day INTEGER DEFAULT 3,
    completed_jobs INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 5.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance Tickets Table
CREATE TABLE IF NOT EXISTS maintenance_tickets (
    ticket_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50),
    property_name VARCHAR(255),
    issue_description TEXT NOT NULL,
    reported_by VARCHAR(255),
    channel_type VARCHAR(50),
    photos JSONB DEFAULT '[]',
    category VARCHAR(50),
    urgency VARCHAR(50) DEFAULT 'medium',
    vendor_type VARCHAR(50),
    guest_impact VARCHAR(10) DEFAULT 'no',
    reasoning TEXT,
    assigned_vendor VARCHAR(255),
    vendor_contact VARCHAR(100),
    vendor_id VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    dispatch_time TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id VARCHAR(50) PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    preferred_contact_method VARCHAR(50) DEFAULT 'sms',
    status VARCHAR(50) DEFAULT 'active',
    current_jobs INTEGER DEFAULT 0,
    max_concurrent_jobs INTEGER DEFAULT 3,
    average_rating DECIMAL(3,2) DEFAULT 5.00,
    cost_level VARCHAR(20) DEFAULT 'medium',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guest Blacklist Table
CREATE TABLE IF NOT EXISTS guest_blacklist (
    id SERIAL PRIMARY KEY,
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    guest_name VARCHAR(255),
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    expires_at DATE,
    added_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guest Screening Log Table
CREATE TABLE IF NOT EXISTS guest_screening_log (
    screening_id VARCHAR(50) PRIMARY KEY,
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    property_id VARCHAR(50),
    check_in_date DATE,
    check_out_date DATE,
    guests INTEGER,
    risk_score DECIMAL(5,2),
    risk_level VARCHAR(50),
    risk_factors JSONB DEFAULT '[]',
    confidence INTEGER,
    blacklist_match BOOLEAN DEFAULT false,
    blacklist_reason TEXT,
    decision VARCHAR(50),
    decision_date TIMESTAMP,
    decided_by VARCHAR(100),
    deal_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
    review_id VARCHAR(50) PRIMARY KEY,
    platform VARCHAR(50),
    property_name VARCHAR(255),
    guest_name VARCHAR(255),
    star_rating INTEGER,
    review_text TEXT,
    review_date DATE,
    received_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sentiment VARCHAR(50),
    topics JSONB DEFAULT '[]',
    response_text TEXT,
    confidence INTEGER,
    approval_required BOOLEAN DEFAULT true,
    approval_urgency VARCHAR(50) DEFAULT 'normal',
    final_response TEXT,
    response_status VARCHAR(50) DEFAULT 'pending',
    decision_date TIMESTAMP,
    posted_date TIMESTAMP,
    posted_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    incident_id VARCHAR(50) PRIMARY KEY,
    booking_id VARCHAR(50),
    property_id VARCHAR(50),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    incident_type VARCHAR(100),
    severity VARCHAR(50) DEFAULT 'medium',
    description TEXT,
    reported_by VARCHAR(255),
    reported_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'open',
    resolution TEXT,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pricing History Table
CREATE TABLE IF NOT EXISTS pricing_history (
    id SERIAL PRIMARY KEY,
    property_id VARCHAR(50),
    date DATE NOT NULL,
    price DECIMAL(10,2),
    occupancy_rate DECIMAL(5,2),
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pricing Recommendations Table
CREATE TABLE IF NOT EXISTS pricing_recommendations (
    recommendation_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50),
    date DATE NOT NULL,
    current_price DECIMAL(10,2),
    recommended_price DECIMAL(10,2),
    percentage_change DECIMAL(5,2),
    reasoning TEXT,
    confidence INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    applied_by VARCHAR(100),
    applied_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Calendar Sync Log Table
CREATE TABLE IF NOT EXISTS calendar_sync_log (
    sync_id VARCHAR(50) PRIMARY KEY,
    sync_date DATE NOT NULL,
    property_id VARCHAR(50),
    conflicts_count INTEGER DEFAULT 0,
    conflicts_details JSONB DEFAULT '[]',
    sync_source VARCHAR(50),
    manual_sync_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    completed_by VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
    item_id SERIAL PRIMARY KEY,
    property_id VARCHAR(50),
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    current_qty INTEGER DEFAULT 0,
    min_qty INTEGER DEFAULT 5,
    reorder_qty INTEGER DEFAULT 10,
    qty_on_order INTEGER DEFAULT 0,
    unit_cost DECIMAL(10,2),
    supplier_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'in_stock',
    last_usage_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workflow Errors Table (for Watchdog)
CREATE TABLE IF NOT EXISTS workflow_errors (
    id SERIAL PRIMARY KEY,
    workflow_name VARCHAR(255) NOT NULL,
    execution_id VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,
    severity VARCHAR(50) DEFAULT 'error',
    alert_sent BOOLEAN DEFAULT false,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message Router Log Table
CREATE TABLE IF NOT EXISTS message_router_log (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(100),
    source_channel VARCHAR(50),
    sender_id VARCHAR(100),
    message_preview TEXT,
    routed_to VARCHAR(100),
    processing_status VARCHAR(50) DEFAULT 'received',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Tasks Table
CREATE TABLE IF NOT EXISTS customer_tasks (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(50) UNIQUE,
    property_id VARCHAR(50),
    task_type VARCHAR(100),
    description TEXT,
    priority VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'pending',
    assigned_to VARCHAR(255),
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    created_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guest Journey Log Table
CREATE TABLE IF NOT EXISTS guest_journey_log (
    id SERIAL PRIMARY KEY,
    booking_id VARCHAR(50),
    message_type VARCHAR(50),
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'scheduled',
    channel_type VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
    payment_id VARCHAR(50) PRIMARY KEY,
    deal_id VARCHAR(50),
    booking_id VARCHAR(50),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    stripe_payment_intent_id VARCHAR(100),
    stripe_checkout_session_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(50),
    paid_at TIMESTAMP,
    refunded_at TIMESTAMP,
    refund_amount DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversation Log Table (for AI interaction auditing)
CREATE TABLE IF NOT EXISTS conversation_log (
    id SERIAL PRIMARY KEY,
    deal_id VARCHAR(50),
    booking_id VARCHAR(50),
    event_type VARCHAR(100) NOT NULL,
    event_details JSONB DEFAULT '{}',
    channel_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Calendar Blocks Table
CREATE TABLE IF NOT EXISTS calendar_blocks (
    block_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    block_reason VARCHAR(255),
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Booking Conflicts Table (for Workflow 2 - Conflict Resolution)
CREATE TABLE IF NOT EXISTS booking_conflicts (
    conflict_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50),
    conflicting_booking_ids JSONB DEFAULT '[]',
    conflicting_deal_ids JSONB DEFAULT '[]',
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    owner_contact VARCHAR(100),
    owner_platform VARCHAR(50) DEFAULT 'telegram',
    resolution VARCHAR(50),
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id VARCHAR(50) PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    contact_method VARCHAR(50) DEFAULT 'email',
    email VARCHAR(255),
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Orders Table
CREATE TABLE IF NOT EXISTS purchase_orders (
    order_id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50),
    supplier_id VARCHAR(50),
    items JSONB DEFAULT '[]',
    total_cost DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'pending',
    ordered_at TIMESTAMP,
    delivered_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_deals_property ON deals(property_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_phone ON deals(client_phone);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_datetime ON scheduled_messages(scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_urgency ON maintenance_tickets(urgency);
CREATE INDEX IF NOT EXISTS idx_workflow_errors_created ON workflow_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_guest_blacklist_phone ON guest_blacklist(guest_phone);
CREATE INDEX IF NOT EXISTS idx_guest_blacklist_email ON guest_blacklist(guest_email);

-- Grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO n8n;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO n8n;

EOF
```

---

## Step 7: Start Services

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f n8n

# Verify n8n is running
curl http://localhost:5678/healthz
```

---

## Step 8: Configure Domain & SSL (Production)

### Option A: Using Caddy (Recommended)

```bash
# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy

# Create Caddyfile
cat > /etc/caddy/Caddyfile << 'EOF'
your-domain.com {
    reverse_proxy localhost:5678
}
EOF

# Restart Caddy
systemctl restart caddy
systemctl enable caddy
```

### Option B: Using Nginx + Let's Encrypt

```bash
apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
cat > /etc/nginx/sites-available/n8n << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Get SSL certificate
certbot --nginx -d your-domain.com
```

---

## Step 9: Import Workflows

1. Access n8n at `https://your-domain.com`
2. Login with credentials from `.env`
3. Go to **Settings > Community Nodes** and enable if needed
4. Import workflows:
   - Click **+** → **Import from File**
   - Select workflow JSON files one by one
   - Or use n8n API for bulk import

---

## Step 10: Configure Credentials in n8n

After login, go to **Credentials** and add:

1. **PostgreSQL** - Use internal connection:
   - Host: `postgres`
   - Port: `5432`
   - Database: `n8n_property`
   - User: `n8n`
   - Password: (from .env)

2. **Telegram Bot** - From BotFather:
   - Access Token: `your-bot-token`

3. **Twilio** - For SMS:
   - Account SID
   - Auth Token

4. **Stripe** - For payments:
   - API Key (use test key first!)
   - Webhook Secret

5. **OpenAI** - For AI features:
   - API Key

---

## Step 11: Backup Configuration

Create automated backup script:

```bash
cat > /opt/n8n-property-management/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/n8n-property-management/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker exec postgres pg_dump -U n8n n8n_property | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup n8n data
tar -czf $BACKUP_DIR/n8n_data_$DATE.tar.gz -C /opt/n8n-property-management n8n_data

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/n8n-property-management/backup.sh

# Add to crontab (daily at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/n8n-property-management/backup.sh >> /opt/n8n-property-management/logs/backup.log 2>&1") | crontab -
```

---

## Step 12: Monitoring Setup

Create simple monitoring script:

```bash
cat > /opt/n8n-property-management/monitor.sh << 'EOF'
#!/bin/bash
# Check if n8n is responding
if ! curl -sf http://localhost:5678/healthz > /dev/null; then
    echo "$(date): n8n is down, restarting..."
    docker compose -f /opt/n8n-property-management/docker-compose.yml restart n8n
fi
EOF

chmod +x /opt/n8n-property-management/monitor.sh

# Add to crontab (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/n8n-property-management/monitor.sh >> /opt/n8n-property-management/logs/monitor.log 2>&1") | crontab -
```

---

## Maintenance Commands

```bash
# View logs
docker compose logs -f n8n
docker compose logs -f postgres

# Restart services
docker compose restart

# Update n8n
docker compose pull n8n
docker compose up -d n8n

# Access PostgreSQL directly
docker exec -it postgres psql -U n8n n8n_property

# Check disk usage
df -h
docker system df

# Clean up Docker
docker system prune -f
```

---

## Troubleshooting

### n8n won't start
```bash
docker compose logs n8n
# Check for database connection issues
docker compose exec postgres psql -U n8n -c "SELECT 1"
```

### Webhooks not working
- Check firewall: `ufw status`
- Verify domain points to server IP
- Check SSL certificate: `certbot certificates`

### Out of memory
- Increase server size in Hetzner console
- Or add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`

### Database full
```bash
docker exec postgres psql -U n8n n8n_property -c "
SELECT pg_size_pretty(pg_database_size('n8n_property'));
"
# Clean old executions
docker exec n8n n8n prune:executions --days=7
```

---

## Security Checklist

- [ ] Changed all default passwords in `.env`
- [ ] Firewall enabled with only necessary ports
- [ ] SSH key authentication (disable password auth)
- [ ] SSL/TLS enabled for n8n
- [ ] fail2ban installed and configured
- [ ] Regular backups configured
- [ ] Monitoring script active

---

## Multi-Client Architecture Notes

With **1 Client = 1 Hetzner Server**:

**Advantages:**
- Complete isolation between clients
- Easy to scale individual clients
- Client data never mixes
- Simple billing (1 server = 1 client cost)
- Can customize per client

**Per-Client Costs (Estimated):**
- Server: €5-18/month
- Domain (optional): €10-15/year
- Total: ~€5-20/month per client

**Management Tips:**
- Use consistent naming: `n8n-clientname`
- Keep a master list of all servers/IPs
- Use Hetzner API or Terraform for automation at scale
- Consider Hetzner Cloud Volumes for larger databases

---

*Setup guide complete. Your test environment is ready for workflow testing!*

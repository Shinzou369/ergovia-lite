# Client Provisioning Guide

> Reference guide for setting up new Ergovia clients with their own subdomain, n8n instance, and database.
> This is a planning document -- automation will be built later.

---

## 1. Architecture Overview

### Current Setup (Single Server)

Right now, everything runs on one Hetzner VPS:

- **Server**: 116.203.115.12 (ARM64/aarch64, Ubuntu)
- **Domain**: ergovia-ai.com (registered at GoDaddy)
- **n8n**: Docker container on port 5678
- **PostgreSQL**: Docker container on port 5432
- **Caddy**: Reverse proxy handling HTTPS (auto SSL via Let's Encrypt)

All traffic flows like this:

```
User --> ergovia-ai.com --> Caddy (port 443) --> n8n (port 5678)
```

### Target: Per-Client Isolation

Each new client gets:
- Their own subdomain (e.g., `client1.ergovia-ai.com`)
- Their own n8n instance (separate Docker container)
- Their own PostgreSQL database (separate Docker container or separate database on shared PostgreSQL)
- Their own set of workflows, credentials, and environment variables

### Two Approaches

| | Multi-Tenant (Cheaper) | Dedicated Server (More Isolated) |
|---|---|---|
| **How** | Multiple clients on one server, each with their own Docker containers | Each client gets a brand new Hetzner VPS |
| **Cost** | ~$5-10/month per client (shared server cost) | ~$15-20/month per client (own CX22 server) |
| **Isolation** | Containers are separate but share server resources | Complete isolation -- one client can't affect another |
| **Best for** | Starting out, low-traffic clients | High-value clients, clients who need guarantees |
| **Risk** | If the server goes down, all clients go down | More servers to manage |

**Recommendation**: Start with multi-tenant (all on one server). Move high-value clients to dedicated servers later if needed.

---

## 2. GoDaddy DNS Setup (Manual for Now)

### Adding a Subdomain for a New Client

1. Log in to [GoDaddy](https://dcc.godaddy.com/) and go to **My Products > DNS**
2. Select `ergovia-ai.com`
3. Click **Add Record** and enter:
   - **Type**: A
   - **Name**: `client1` (this creates `client1.ergovia-ai.com`)
   - **Value**: `116.203.115.12` (or the client's dedicated server IP)
   - **TTL**: 600 seconds (10 minutes -- good for testing, increase to 3600 later)
4. Click **Save**

### Wildcard DNS (Optional, Saves Time)

Instead of adding individual A records for each client, you can add one wildcard record:

- **Type**: A
- **Name**: `*`
- **Value**: `116.203.115.12`
- **TTL**: 600

This makes `anything.ergovia-ai.com` point to your server automatically. Caddy will only respond to subdomains you explicitly configure, so unused subdomains won't serve anything.

**Note**: Wildcard DNS only works if all clients are on the same server. If you move a client to a dedicated server, you'll need an explicit A record for that subdomain.

### TTL Recommendations

- **During setup/testing**: 600 seconds (10 minutes) -- changes propagate faster
- **Once stable**: 3600 seconds (1 hour) -- reduces DNS lookup load
- **Before migration**: Lower TTL to 600 a day before moving a client to a new server, then raise it back after

---

## 3. Caddy Configuration

Caddy handles HTTPS automatically using Let's Encrypt. Each client subdomain gets its own block in the Caddyfile.

### Current Caddyfile Location

```
/opt/n8n/Caddyfile
```

### Adding a New Client Subdomain

Add a new block to the Caddyfile for each client:

```caddyfile
client1.ergovia-ai.com {
    reverse_proxy localhost:5679
}
```

That's it. Caddy will automatically:
- Request an SSL certificate from Let's Encrypt
- Set up HTTPS
- Redirect HTTP to HTTPS
- Renew the certificate before it expires

### Example Caddyfile with Multiple Clients

```caddyfile
# Main n8n instance (test/admin)
n8n.ergovia-ai.com {
    reverse_proxy localhost:5678
}

# Client 1
client1.ergovia-ai.com {
    reverse_proxy localhost:5679
}

# Client 2
client2.ergovia-ai.com {
    reverse_proxy localhost:5680
}

# Client 3
client3.ergovia-ai.com {
    reverse_proxy localhost:5681
}

# Control panel (ergovia-lite)
ergovia-ai.com {
    reverse_proxy localhost:3000
}
```

### Reloading Caddy After Changes

```bash
# If Caddy runs in Docker:
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# If Caddy runs as a system service:
sudo systemctl reload caddy
```

**Important**: Make sure the DNS record exists and has propagated before adding the Caddy block. Let's Encrypt needs to reach the domain to issue the certificate. You can check propagation with:

```bash
dig client1.ergovia-ai.com +short
# Should return: 116.203.115.12
```

---

## 4. Docker Setup Per Client

### Port Allocation Strategy

Each client's n8n instance needs a unique port on the host. Use this pattern:

| Client | n8n Port | PostgreSQL Port |
|--------|----------|-----------------|
| Admin/Test | 5678 | 5432 |
| Client 1 | 5679 | 5433 |
| Client 2 | 5680 | 5434 |
| Client 3 | 5681 | 5435 |

**Pattern**: n8n port = 5678 + client_number, PostgreSQL port = 5432 + client_number

### Docker Compose Template for a New Client

Create a directory for each client:

```bash
mkdir -p /opt/clients/client1
```

Create `/opt/clients/client1/docker-compose.yml`:

```yaml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n-client1
    restart: unless-stopped
    ports:
      - "5679:5678"
    environment:
      # Database
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres-client1
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n_client1
      - DB_POSTGRESDB_USER=n8n_user
      - DB_POSTGRESDB_PASSWORD=CHANGE_THIS_PASSWORD
      # n8n settings
      - N8N_HOST=client1.ergovia-ai.com
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://client1.ergovia-ai.com/
      - N8N_ENCRYPTION_KEY=GENERATE_A_UNIQUE_KEY
      # Ergovia environment variables
      - CUSTOMER_ID=CUSTOMER_UUID_HERE
      - ADMIN_TELEGRAM_CHAT_ID=ADMIN_CHAT_ID_HERE
      - OWNER_CHAT_ID=OWNER_CHAT_ID_HERE
    volumes:
      - n8n_client1_data:/home/node/.n8n
    networks:
      - client1-net
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    container_name: postgres-client1
    restart: unless-stopped
    ports:
      - "5433:5432"
    environment:
      - POSTGRES_DB=ergovia_client1
      - POSTGRES_USER=ergovia_user
      - POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD
    volumes:
      - pg_client1_data:/var/lib/postgresql/data
    networks:
      - client1-net

volumes:
  n8n_client1_data:
  pg_client1_data:

networks:
  client1-net:
    driver: bridge
```

### Starting the Client's Containers

```bash
cd /opt/clients/client1
docker compose up -d
```

### Shared Network vs Isolated Networks

The template above uses an **isolated network** per client (`client1-net`). This means:
- Client 1's n8n can only talk to Client 1's PostgreSQL
- Clients cannot access each other's databases
- This is the safer approach

If you need clients to share resources (like a shared PostgreSQL), you'd use a shared network instead. But isolated is recommended.

---

## 5. Database Initialization

After the PostgreSQL container is running, you need to set up the Ergovia schema and seed data.

### Step 1: Copy the Schema File to the Server

```bash
scp ergovia-lite/database/schema-postgresql.sql root@116.203.115.12:/opt/clients/client1/
```

### Step 2: Run the Schema

```bash
# Connect to the client's PostgreSQL container and run the schema
docker exec -i postgres-client1 psql -U ergovia_user -d ergovia_client1 < /opt/clients/client1/schema-postgresql.sql
```

### Step 3: Seed Default Data

Every new client needs some baseline data. Run these SQL commands:

```sql
-- Create the owner record
INSERT INTO owners (owner_id, owner_name, owner_chat_id)
VALUES ('owner-1', 'CLIENT_NAME', 'OWNER_TELEGRAM_CHAT_ID');

-- Create the customer record
INSERT INTO customers (id, name)
VALUES (uuid_generate_v4(), 'CLIENT_NAME');

-- Set up API usage budget (use the customer UUID from above)
INSERT INTO api_usage_budget (customer_id, monthly_limit, current_usage)
VALUES ('CUSTOMER_UUID', 100, 0);
```

Replace `CLIENT_NAME`, `OWNER_TELEGRAM_CHAT_ID`, and `CUSTOMER_UUID` with the actual values.

### Step 4: Verify the Setup

```bash
# Check tables were created
docker exec -i postgres-client1 psql -U ergovia_user -d ergovia_client1 -c "\dt"

# Should show 50+ tables including bookings, owners, customers, etc.
```

### Keeping Clients Updated (Migrations)

When you change the schema, you need to apply those changes to all existing clients. For now, do this manually:

1. Write a migration SQL file (e.g., `migrations/002_add_new_column.sql`)
2. Run it against each client's database
3. Keep a `schema_version` table to track which migrations have been applied

```sql
-- Add this table to schema-postgresql.sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);
```

---

## 6. n8n Workflow Deployment

### Using the Existing Deployment Service

The file `ergovia-lite/services/n8n.js` already has everything needed to deploy workflows via the n8n API. It handles:
- Creating/updating workflows
- Activating/deactivating workflows
- Setting the correct expression mode (`=` prefix for `{{ }}` expressions)
- Deploying in the right order (SUB workflows first, then WF1-WF8)

### Deploying to a New Client's n8n

You need to point the deployment service at the client's n8n instance:

```bash
# Set environment variables for the target client
export N8N_URL=https://client1.ergovia-ai.com
export N8N_API_KEY=client1_api_key_here

# Run the deployment (from the ergovia-lite directory)
node -e "
const N8NService = require('./services/n8n');
const svc = new N8NService();
svc.deployAllWorkflows().then(r => console.log(r));
"
```

### Credential Creation Per Client

Each client's n8n needs its own credentials. Create them via the n8n API or UI:

1. **PostgreSQL credential** -- pointing to the client's own database
2. **OpenAI credential** -- using our shared API key (we provide this)
3. **Telegram credential** -- the client's bot token
4. **WhatsApp/Twilio credential** -- if the client uses WhatsApp

The credential IDs are referenced in the workflow JSON files. The deployment service uses placeholder IDs (`postgres-cred`, `openai-cred`, etc.) that get mapped to real credential IDs during deployment.

### Environment Variables Needed in n8n

These must be set in the client's n8n Docker container:

| Variable | Example | Purpose |
|----------|---------|---------|
| `CUSTOMER_ID` | `d0fdeb97-cd11-...` | Links to the `customers` table UUID |
| `ADMIN_TELEGRAM_CHAT_ID` | `6573358279` | Where admin alerts go |
| `OWNER_CHAT_ID` | `6573358279` | Property owner's Telegram chat |

### Deployment Order (Important)

Workflows must be deployed in this order with delays between them:

1. `SUB_Universal_Messenger.json` (wait 3s)
2. `SUB_Owner_Staff_Notifier.json` (wait 3s)
3. `WF3` through `WF8` in any order (wait 2s between each)
4. `WF2_Offer_Conflict_Manager.json` (wait 2s)
5. `WF1_AI_Gateway.json` (last, because it routes to all others)

The deployment service handles this automatically.

---

## 7. Future Automation (API-Based)

### Vision: One-Click Client Onboarding

Eventually, the onboarding wizard in the control panel should trigger all of this automatically. Here's what each step would call:

### Hetzner API (Dedicated Servers Only)

If a client needs their own server:

```bash
# Create a new CX22 server (2 vCPU, 4GB RAM, ~$5/month)
curl -X POST "https://api.hetzner.cloud/v1/servers" \
  -H "Authorization: Bearer HETZNER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ergovia-client1",
    "server_type": "cax11",
    "image": "ubuntu-24.04",
    "location": "nbg1",
    "ssh_keys": ["your-ssh-key-name"]
  }'
```

Note: `cax11` is ARM64 (cheaper). Use `cx22` for x86 if needed.

### GoDaddy API (DNS Automation)

```bash
# Add an A record for the new subdomain
curl -X PATCH "https://api.godaddy.com/v1/domains/ergovia-ai.com/records" \
  -H "Authorization: sso-key API_KEY:API_SECRET" \
  -H "Content-Type: application/json" \
  -d '[{
    "type": "A",
    "name": "client1",
    "data": "116.203.115.12",
    "ttl": 600
  }]'
```

You'll need a GoDaddy API key from [developer.godaddy.com](https://developer.godaddy.com/).

### Script Outline for One-Click Onboarding

A future `provision-client.sh` script would do:

```bash
#!/bin/bash
# Usage: ./provision-client.sh client1 "Client Name" "telegram_chat_id"

CLIENT_SLUG=$1
CLIENT_NAME=$2
TELEGRAM_CHAT_ID=$3
SERVER_IP="116.203.115.12"

echo "=== Provisioning $CLIENT_NAME ($CLIENT_SLUG) ==="

# 1. Add DNS record (GoDaddy API)
echo "[1/6] Adding DNS record..."
# curl GoDaddy API (see above)

# 2. Wait for DNS propagation
echo "[2/6] Waiting for DNS propagation..."
sleep 30
until dig +short "$CLIENT_SLUG.ergovia-ai.com" | grep -q "$SERVER_IP"; do
  sleep 10
done

# 3. Create Docker containers on server
echo "[3/6] Creating Docker containers..."
ssh root@$SERVER_IP "mkdir -p /opt/clients/$CLIENT_SLUG"
scp docker-compose.template.yml root@$SERVER_IP:/opt/clients/$CLIENT_SLUG/docker-compose.yml
ssh root@$SERVER_IP "cd /opt/clients/$CLIENT_SLUG && docker compose up -d"

# 4. Initialize database
echo "[4/6] Initializing database..."
scp schema-postgresql.sql root@$SERVER_IP:/tmp/
ssh root@$SERVER_IP "docker exec -i postgres-$CLIENT_SLUG psql -U ergovia_user -d ergovia_$CLIENT_SLUG < /tmp/schema-postgresql.sql"

# 5. Add Caddy config and reload
echo "[5/6] Configuring Caddy..."
ssh root@$SERVER_IP "echo '$CLIENT_SLUG.ergovia-ai.com { reverse_proxy localhost:PORT }' >> /opt/n8n/Caddyfile"
ssh root@$SERVER_IP "docker exec caddy caddy reload --config /etc/caddy/Caddyfile"

# 6. Deploy workflows
echo "[6/6] Deploying workflows..."
N8N_URL="https://$CLIENT_SLUG.ergovia-ai.com" node deploy-workflows.js

echo "=== Done! Client available at https://$CLIENT_SLUG.ergovia-ai.com ==="
```

### Estimated Cost Per Client

| Component | Multi-Tenant | Dedicated Server |
|-----------|-------------|-----------------|
| Server (Hetzner) | ~$2-3/month (shared) | ~$5-10/month (CX22/CAX11) |
| Domain/SSL | Free (Caddy + Let's Encrypt) | Free |
| OpenAI API | ~$2-5/month (usage-based) | ~$2-5/month |
| **Total** | **~$5-10/month** | **~$10-20/month** |

---

## 8. Checklist: New Client Onboarding

Use this step-by-step checklist when manually setting up a new client. Check off each step as you go.

### Before You Start

- [ ] Client name and slug decided (e.g., "Sunrise Stays" -> `sunrise-stays`)
- [ ] Client's Telegram bot token ready
- [ ] Client's Telegram chat ID known
- [ ] Next available port numbers identified (check existing containers)

### DNS

- [ ] Log in to GoDaddy
- [ ] Add A record: `CLIENT_SLUG` -> `116.203.115.12`
- [ ] Verify with `dig CLIENT_SLUG.ergovia-ai.com +short`

### Server Setup

- [ ] SSH into the server: `ssh root@116.203.115.12`
- [ ] Create client directory: `mkdir -p /opt/clients/CLIENT_SLUG`
- [ ] Copy and customize docker-compose.yml (update ports, passwords, container names)
- [ ] Generate unique N8N_ENCRYPTION_KEY: `openssl rand -hex 32`
- [ ] Generate unique DB password: `openssl rand -hex 16`
- [ ] Start containers: `docker compose up -d`
- [ ] Verify containers running: `docker ps | grep CLIENT_SLUG`

### Caddy

- [ ] Add subdomain block to Caddyfile
- [ ] Reload Caddy
- [ ] Verify HTTPS works: visit `https://CLIENT_SLUG.ergovia-ai.com` in browser
- [ ] Check for certificate errors in Caddy logs

### Database

- [ ] Run schema-postgresql.sql against client's database
- [ ] Insert owner record
- [ ] Insert customer record (note the UUID)
- [ ] Insert api_usage_budget record
- [ ] Verify tables: `\dt` should show 50+ tables

### n8n Setup

- [ ] Log in to client's n8n at `https://CLIENT_SLUG.ergovia-ai.com`
- [ ] Create initial admin user
- [ ] Create PostgreSQL credential (pointing to client's own DB)
- [ ] Create OpenAI credential (our API key)
- [ ] Create Telegram credential (client's bot token)
- [ ] Note all credential IDs

### Workflow Deployment

- [ ] Update environment variables in docker-compose (CUSTOMER_ID, chat IDs)
- [ ] Restart n8n container to pick up env changes
- [ ] Deploy SUB workflows first (wait 3s each)
- [ ] Deploy WF3-WF8 (wait 2s each)
- [ ] Deploy WF2 (wait 2s)
- [ ] Deploy WF1 last
- [ ] Verify all workflows show as Active in n8n UI

### Testing

- [ ] Send a test Telegram message to the client's bot
- [ ] Verify the message reaches WF1 (check n8n execution log)
- [ ] Verify the AI responds (check OpenAI budget)
- [ ] Verify the response reaches the user via Telegram

### Documentation

- [ ] Record client details in a tracking spreadsheet or database:
  - Client slug, name, subdomain
  - Server IP, n8n port, DB port
  - Customer UUID, owner ID
  - Telegram bot token, chat IDs
  - Date provisioned

---

> **Last updated**: 2026-03-10
> **Status**: Manual process. Automation planned for future sprint.

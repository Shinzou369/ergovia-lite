# PROMPT 2: Server Side Audit — Everything Live on Hetzner

> **Purpose:** Generate a complete documentation of everything running on the production Hetzner server. Output a single Markdown file called `SERVER_SIDE.md`.

---

## Context

You are auditing the **production Hetzner server** that runs the Ergovia Lite platform. This is a single test/demo server. In production, each client will get their own identical server.

**Server Details:**
- **IP:** 116.203.115.12
- **OS:** Ubuntu 24.04.3 LTS (ARM64/aarch64 architecture)
- **Domain:** ergovia-ai.com (with subdomains per service)
- **SSL:** Let's Encrypt via Certbot + nginx

**What runs on this server:**
1. **Ergovia Lite Express app** — the control panel web app (PM2 managed, port 3000)
2. **n8n** — workflow automation engine (Docker container, port 5678)
3. **PostgreSQL** — client database (Docker container `ergovia-db`, port 5432)
4. **nginx** — reverse proxy + SSL termination
5. **PM2** — Node.js process manager for the Express app
6. **Docker** — runs n8n and PostgreSQL containers

**URLs served:**
- `https://ergovia-ai.com/v2/dashboard.html` — V2 Dashboard (control panel)
- `https://ergovia-ai.com/v2/settings.html` — Settings page
- `https://ergovia-ai.com/v2/properties.html` — Property management
- `https://n8n.ergovia-ai.com` — n8n workflow editor
- API endpoints at `https://ergovia-ai.com/api/v2/*`

---

## Your Task — SSH into the server and audit everything. Generate `SERVER_SIDE.md` with these 6 sections:

### Section 1: Inventory & Scan
SSH into the server and document:

**System Level:**
```bash
# Run these commands and document the output:
uname -a                                    # OS and architecture
df -h                                       # Disk usage
free -h                                     # Memory
docker ps -a                                # All containers (running + stopped)
docker images                               # Docker images
docker network ls                           # Docker networks
docker volume ls                            # Docker volumes
pm2 list                                    # PM2 managed processes
pm2 show ergovia-lite                       # App details
systemctl status nginx                      # nginx status
nginx -T                                    # Full nginx configuration
certbot certificates                        # SSL certificate status
```

**Application Layer:**
```bash
ls -la /opt/ergovia-lite/                    # App directory
cat /opt/ergovia-lite/.env                   # Environment variables (REDACT secrets)
cat /opt/ergovia-lite/package.json           # Dependencies
git -C /opt/ergovia-lite log --oneline -10   # Recent deployments
git -C /opt/ergovia-lite status              # Any uncommitted changes on server
```

**Docker Services:**
```bash
cat /opt/n8n/docker-compose.yml             # n8n configuration
docker inspect n8n --format '{{json .Config.Env}}'     # n8n env vars
docker inspect ergovia-db --format '{{json .Config.Env}}' # PostgreSQL env vars
docker logs n8n --tail 20                   # Recent n8n logs
docker logs ergovia-db --tail 20            # Recent PostgreSQL logs
```

**Database:**
```bash
docker exec ergovia-db psql -U ergovia_user -d ergovia_db -c "\dt"   # List all tables
docker exec ergovia-db psql -U ergovia_user -d ergovia_db -c "\du"   # List all users
docker exec ergovia-db psql -U ergovia_user -d ergovia_db -c "SELECT count(*) FROM property_configurations"  # Row counts
```

**Network:**
```bash
ss -tlnp                                    # Listening ports
cat /etc/nginx/sites-enabled/*              # nginx site configs
iptables -L -n 2>/dev/null || ufw status    # Firewall rules
```

### Section 2: How It Works
Explain the full request flow for each service:

**Web Request Flow:**
```
User Browser
  → https://ergovia-ai.com (DNS → Hetzner IP)
    → nginx (port 443, SSL termination)
      → proxy_pass to localhost:3000 (Express via PM2)
        → Express serves static files from /public/v2/
        → Express handles API routes at /api/v2/*
          → SQLite (local state: settings, sync logs, activity)
          → PostgreSQL (remote: property data, bookings, guests)
          → n8n API (workflow management, deployment, patching)
```

**n8n Request Flow:**
```
Telegram/WhatsApp Message
  → n8n webhook at https://n8n.ergovia-ai.com/webhook/*
    → nginx (port 443, SSL)
      → proxy_pass to localhost:5678 (n8n Docker container)
        → WF1 AI Gateway processes message
          → Routes to WF2-WF8 based on intent
            → PostgreSQL queries via ergovia-db container
              → Response back to guest via Telegram/WhatsApp
```

**Docker Networking:**
```
ergovia-net (Docker bridge network)
  ├── n8n container (can reach ergovia-db by hostname)
  └── ergovia-db container (PostgreSQL, port 5432)
```

Document: How PM2 manages the Express app, how nginx routes to each service, how Docker containers communicate, how SSL certificates auto-renew.

### Section 3: Credentials & Access
Document every credential on the server (REDACT actual values, show structure):

- **SSH Access:** How to connect (`ssh root@116.203.115.12`)
- **PostgreSQL:** Database name, user, password location, port
- **n8n Admin:** How to log in, where credentials are stored
- **n8n API Key:** Where it's configured, how the Express app uses it
- **nginx SSL:** Certificate paths, renewal schedule
- **PM2:** Process configuration
- **.env file:** Every variable and what it connects to
- **Docker compose:** All environment variables in n8n and PostgreSQL containers
- **GitHub:** How the server pulls from the repo (SSH key? HTTPS token?)

### Section 4: Deployment & Operations
Document step-by-step procedures for:

**Deploying code updates:**
```bash
# What the developer runs on the server:
cd /opt/ergovia-lite
git pull origin main
pm2 restart ergovia-lite
```

**Restarting services:**
```bash
# Express app
pm2 restart ergovia-lite
pm2 logs ergovia-lite --lines 20

# n8n
cd /opt/n8n && docker compose down && docker compose up -d
docker logs n8n --tail 20

# PostgreSQL
docker restart ergovia-db
docker logs ergovia-db --tail 10

# nginx
systemctl reload nginx
nginx -t  # test config first
```

**Common troubleshooting:**
- How to check if services are running
- How to read logs for each service
- How to check disk space, memory, CPU
- How to renew SSL certificates
- How to restart everything after a server reboot
- How to check if n8n can reach PostgreSQL (`docker exec n8n ping ergovia-db`)

**Backup procedures:**
- Is there a backup system? If not, note as CRITICAL issue
- How to backup the PostgreSQL database
- How to backup the n8n data volume
- How to backup the SQLite database

### Section 5: Current Status
For each service on the server, document:

| Service | Status | Notes |
|---------|--------|-------|
| Express App (PM2) | ? | Check pm2 status, recent errors |
| V2 Dashboard | ? | Load test: https://ergovia-ai.com/v2/dashboard.html |
| V2 Settings | ? | Load test all 8 sections |
| V2 Properties | ? | Check property CRUD works |
| API endpoints | ? | Test key endpoints: /api/v2/dashboard, /api/v2/settings/* |
| nginx | ? | Check config, SSL cert expiry |
| n8n | ? | Check container health, login works |
| PostgreSQL | ? | Check container health, can query |
| Docker networking | ? | n8n can reach ergovia-db |
| SSL Certificates | ? | Expiry dates, auto-renewal working |
| Disk Space | ? | Current usage, projected issues |
| Server Security | ? | Firewall, open ports, SSH config |

### Section 6: Issues & Improvements
Categorize every issue found as:
- **CRITICAL** — Service down, data at risk, or security vulnerability
- **IMPORTANT** — Should be fixed but system functions
- **NICE-TO-HAVE** — Optimizations and hardening

Check specifically for:
- Open ports that shouldn't be exposed (is 5678 exposed directly?)
- Default/weak passwords in docker-compose
- Missing firewall rules
- No backup system
- SSL certificate expiry
- Disk space warnings
- Docker image not pinned (using `latest` tag)
- n8n container missing `N8N_TRUST_PROXY=true` or `N8N_USER_MANAGEMENT_JWT_SECRET`
- PostgreSQL not password-protected or using default credentials
- PM2 not configured for auto-restart on server reboot (`pm2 startup`)
- Server needs restart (check `/var/run/reboot-required`)
- Any errors in pm2 logs, docker logs, or nginx error logs
- nginx missing security headers (X-Frame-Options, CSP, etc.)

**DO NOT fix anything. Document only.**

---

## Output Format

Output a single Markdown file. Use tables for status overviews, code blocks for commands and configs, and clear headers for navigation. Redact actual passwords/keys but note where they are stored. This document will be read by a developer who has never accessed this server.

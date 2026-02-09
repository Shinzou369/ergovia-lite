# Ergovia HTTPS & Domain Setup Guide

## Overview

Domain: **ergovia-ai.com** (managed via domain registrar DNS)
SSL: **Caddy** (automatic Let's Encrypt certificates)
Per-client architecture: Each client gets their own Hetzner server + subdomain

---

## Architecture

```
ergovia-ai.com (Your Domain)
│
├── app.ergovia-ai.com         → Ergovia Control Panel (your main server)
├── api.ergovia-ai.com         → Ergovia API/Backend (your main server)
│
└── Client Subdomains (one per client, each on their own Hetzner server):
    ├── acme.ergovia-ai.com          → Client "Acme" n8n (IP: x.x.x.x)
    ├── beach-villa.ergovia-ai.com   → Client "Beach Villa" n8n (IP: y.y.y.y)
    └── [clientname].ergovia-ai.com  → Auto-created during onboarding
```

---

## Part 1: Main Server Setup

### Step 1.1: Add DNS Records at Your Registrar

Log into your domain registrar and add A records:

| Type | Name | Content | TTL |
|------|------|---------|-----|
| A | @ | YOUR_MAIN_SERVER_IP | Auto |
| A | app | YOUR_MAIN_SERVER_IP | Auto |
| A | api | YOUR_MAIN_SERVER_IP | Auto |

### Step 1.2: Install Caddy on Main Server

```bash
ssh root@YOUR_MAIN_SERVER_IP

# Install Caddy
apt-get update && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

### Step 1.3: Configure Caddy

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
app.ergovia-ai.com {
    reverse_proxy localhost:3000
}

api.ergovia-ai.com {
    reverse_proxy localhost:3000
}
EOF

systemctl restart caddy
systemctl enable caddy
```

Caddy automatically provisions and renews Let's Encrypt SSL certificates. No manual certificate management needed.

### Step 1.4: Configure Ergovia Express App

Update your `.env`:
```env
APP_URL=https://app.ergovia-ai.com
API_URL=https://api.ergovia-ai.com
BASE_DOMAIN=ergovia-ai.com
```

---

## Part 2: Per-Client Server Setup

When onboarding a new client, the system:

### Step 2.1: Provision Hetzner Server (Automated)

The onboarding workflow creates a Hetzner server. The server gets an IP like `5.6.7.8`.

### Step 2.2: Add DNS Record for Client (Manual at Registrar)

At your domain registrar, add an A record for the new client:

| Type | Name | Content | TTL |
|------|------|---------|-----|
| A | beach-villa | 5.6.7.8 | Auto |

This creates: `beach-villa.ergovia-ai.com` → `5.6.7.8`

> **Note:** This step is currently manual. For automation at scale, consider integrating your registrar's API.

### Step 2.3: Install Caddy + n8n on Client Server (Automated)

The `deploy-n8n.js` script handles this automatically:

1. SSHs into the new server
2. Installs Docker
3. Starts n8n container with:
   ```env
   N8N_HOST=beach-villa.ergovia-ai.com
   N8N_PROTOCOL=https
   WEBHOOK_URL=https://beach-villa.ergovia-ai.com/
   ```
4. Installs Caddy with reverse proxy config:
   ```
   beach-villa.ergovia-ai.com {
       reverse_proxy localhost:5678
   }
   ```
5. Caddy auto-provisions SSL certificate
6. Configures firewall (ports 22, 80, 443)

### Step 2.4: Verify

```bash
# Test SSL certificate
curl -I https://beach-villa.ergovia-ai.com

# Check n8n is responding
curl https://beach-villa.ergovia-ai.com/healthz
```

---

## Part 3: How SSL Works with Caddy

Caddy handles SSL automatically:

1. **Obtains certificates** from Let's Encrypt via HTTP-01 challenge
2. **Auto-renews** certificates before expiry
3. **Redirects** HTTP to HTTPS automatically
4. **No configuration needed** beyond the domain in Caddyfile

### Requirements for Caddy Auto-SSL
- Port 80 and 443 must be open (firewall)
- DNS A record must point to the server IP
- DNS must be propagated before Caddy can obtain the certificate

### Checking Certificate Status

```bash
# On any client server
caddy list-certificates

# Or check via openssl
openssl s_client -connect beach-villa.ergovia-ai.com:443 -servername beach-villa.ergovia-ai.com
```

---

## Quick Reference

### URLs After Setup

| Service | URL |
|---------|-----|
| Ergovia App | https://app.ergovia-ai.com |
| Ergovia API | https://api.ergovia-ai.com |
| Client n8n | https://[clientname].ergovia-ai.com |

### Environment Variables

```env
# Main server
BASE_DOMAIN=ergovia-ai.com
APP_URL=https://app.ergovia-ai.com
API_URL=https://api.ergovia-ai.com

# Hetzner (for server provisioning)
HETZNER_API_TOKEN=your_token_here
```

### Useful Commands

```bash
# Check SSL certificate
curl -vI https://beach-villa.ergovia-ai.com 2>&1 | grep -i "subject\|expire"

# Test DNS propagation
dig beach-villa.ergovia-ai.com

# Check Caddy status
systemctl status caddy

# View Caddy logs
journalctl -u caddy -f

# Reload Caddy config
caddy reload --config /etc/caddy/Caddyfile
```

---

## Troubleshooting

### Caddy Can't Obtain Certificate

1. Verify DNS A record points to the correct server IP: `dig clientname.ergovia-ai.com`
2. Check ports 80 and 443 are open: `ufw status`
3. Wait 5-10 minutes for DNS propagation
4. Check Caddy logs: `journalctl -u caddy --no-pager -n 50`

### Webhooks Not Working

1. Verify n8n has correct `WEBHOOK_URL` in environment
2. Restart n8n after changing environment variables: `docker restart n8n`
3. Clear browser cache and reload n8n

### SSL Certificate Renewal

Caddy handles renewal automatically. If you need to force it:
```bash
caddy reload --config /etc/caddy/Caddyfile
```

---

## Cost Summary

| Item | Cost | Frequency |
|------|------|-----------|
| ergovia-ai.com domain | ~$12 | Per year |
| SSL Certificates (Caddy/Let's Encrypt) | FREE | Auto-renews |
| Per-client Hetzner server | ~5-20 | Per month |

---

*Last Updated: February 2026*

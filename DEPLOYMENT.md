# Prismity AI - Deployment Guide

This guide explains how to deploy Prismity AI to Render or any Node.js hosting platform.

## Required Environment Variables

### Critical (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for JWT token signing (32+ chars) | Generate with: `openssl rand -hex 64` |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256 encryption key (32+ chars) | Generate with: `openssl rand -hex 32` |
| `NODE_ENV` | Environment mode | `production` |

### n8n Integration (Required for workflow deployment)

| Variable | Description | Example |
|----------|-------------|---------|
| `N8N_BASE_URL` | Your n8n instance URL (without https://) | `n8n.yourdomain.com` |
| `N8N_API_KEY` | n8n API key for authentication | `n8n_api_xxx...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |
| `ADMIN_SECRET` | Admin API key for creating clients | `prismity-admin-2026` |
| `OPENAI_API_KEY` | Default OpenAI key for AI features | - |
| `DEEPSEEK_API_KEY` | DeepSeek API key | - |

## Render Setup

### 1. Create Web Service

1. Connect your GitHub repository
2. Select "Web Service"
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/backend/health`

### 2. Add Environment Variables

In Render dashboard > Environment:

```bash
# Required
DATABASE_URL=your_postgres_url
JWT_SECRET=your_64_char_hex_secret
CREDENTIAL_ENCRYPTION_KEY=your_32_char_hex_key
NODE_ENV=production

# n8n Integration
N8N_BASE_URL=n8n.yourdomain.com
N8N_API_KEY=your_n8n_api_key

# Optional
ADMIN_SECRET=your_secure_admin_key
```

### 3. Add PostgreSQL Database

1. Create a new PostgreSQL database in Render
2. Copy the Internal Database URL
3. Set as `DATABASE_URL` environment variable

## Creating Client Accounts

Use the admin API to create client accounts:

```bash
curl -X POST https://your-domain.com/api/backend/admin/clients \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your_admin_secret" \
  -d '{
    "email": "client@example.com",
    "password": "SecurePassword123",
    "businessName": "Client Business",
    "ownerName": "John Doe",
    "ownerPhone": "+1234567890"
  }'
```

## Control Panel Access

After creating a client account, they can access:

- **Login**: `https://your-domain.com/control-panel/login`
- **Onboarding**: `https://your-domain.com/control-panel/onboarding` (auto-redirect for new clients)
- **Dashboard**: `https://your-domain.com/control-panel/dashboard`
- **Settings**: `https://your-domain.com/control-panel/settings`

## Database Auto-Setup

The application automatically creates all required database tables on startup. No manual migration is needed.

Tables created:
- `clients` - Client accounts
- `client_servers` - Infrastructure details
- `client_settings` - Configuration per client
- `client_credentials` - API keys (encrypted)
- `deployed_workflows` - Workflow tracking
- `provisioning_jobs` - Onboarding progress
- `audit_log` - Activity tracking

## Generating Secrets

```bash
# Generate JWT_SECRET (64 bytes = 128 hex chars)
openssl rand -hex 64

# Generate CREDENTIAL_ENCRYPTION_KEY (32 bytes = 64 hex chars)
openssl rand -hex 32

# Generate ADMIN_SECRET
openssl rand -hex 16
```

## Health Check

Test deployment health:

```bash
curl https://your-domain.com/api/backend/health
```

Expected response:
```json
{"status":"ok","timestamp":"..."}
```

## Troubleshooting

### "JWT_SECRET not set"
Ensure JWT_SECRET environment variable is set and at least 32 characters.

### "CREDENTIAL_ENCRYPTION_KEY not set"
This is required for encrypting stored credentials. Generate and set a 32+ character key.

### "Database connection failed"
1. Verify DATABASE_URL is correct
2. Check PostgreSQL server is accessible
3. Ensure SSL settings are correct for production

### "n8n connection failed"
1. Verify N8N_BASE_URL is correct (without https://)
2. Check N8N_API_KEY is valid
3. Ensure n8n instance is accessible

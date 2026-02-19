# Ergovia Lite - Backend & Frontend Setup Guide

Complete guide to setting up and connecting the marketing page backend and frontend.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Backend Setup](#backend-setup)
4. [Database Setup](#database-setup)
5. [Lemon Squeezy Configuration](#lemon-squeezy-configuration)
6. [N8N Workflow Setup](#n8n-workflow-setup)
7. [Frontend Configuration](#frontend-configuration)
8. [Deployment](#deployment)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Static Site)                        │
│                                                                  │
│  index.html ──► script.js ──► Lead Capture Modal                │
│                     │                                            │
│                     ▼                                            │
│              API Call: POST /api/create-checkout                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                     │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ API Routes   │    │ Webhooks     │    │ Admin API    │      │
│  │              │    │              │    │              │      │
│  │ /api/create- │    │ /webhooks/   │    │ /api/admin/  │      │
│  │   checkout   │    │ lemonsqueezy │    │   customers  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                    │
│                             ▼                                    │
│                    ┌──────────────┐                             │
│                    │  PostgreSQL  │                             │
│                    │   Database   │                             │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────┐
│  Lemon Squeezy   │ │     N8N      │ │   Telegram   │
│    Checkout      │ │  Workflows   │ │   Notifier   │
│                  │ │              │ │              │
│  • Payments      │ │  • Customer  │ │  • Admin     │
│  • Subscriptions │ │    Provision │ │    Alerts    │
│  • Webhooks      │ │  • Emails    │ │              │
└──────────────────┘ └──────────────┘ └──────────────┘
```

---

## Prerequisites

Before starting, ensure you have:

- [ ] **Node.js** v18+ installed
- [ ] **PostgreSQL** database (local or hosted)
- [ ] **Lemon Squeezy** account with API access
- [ ] **N8N** instance running (for workflow automation)
- [ ] **Domain** for production deployment

---

## Backend Setup

### Step 1: Install Dependencies

```bash
cd marketing-page/backend
npm install
```

### Step 2: Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit with your values
nano .env
```

**Required Variables:**

```env
# Server
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5500

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ergovia_marketing

# Lemon Squeezy
LEMONSQUEEZY_API_KEY=your_api_key
LEMONSQUEEZY_STORE_ID=your_store_id
LEMONSQUEEZY_PRODUCT_ID=your_product_id
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret

# N8N Webhooks
N8N_WEBHOOK_NEW_CUSTOMER=https://n8n.yourdomain.com/webhook/new-customer
N8N_WEBHOOK_SUBSCRIPTION_CANCELLED=https://n8n.yourdomain.com/webhook/subscription-cancelled
N8N_WEBHOOK_PAYMENT_FAILED=https://n8n.yourdomain.com/webhook/payment-failed

# Telegram (for admin notifications)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ADMIN_CHAT_ID=your_chat_id
```

### Step 3: Create Logs Directory

```bash
mkdir -p logs
```

### Step 4: Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The server will start on `http://localhost:3000`

---

## Database Setup

### Step 1: Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE ergovia_marketing;

# Create user (optional)
CREATE USER ergovia_backend WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE ergovia_marketing TO ergovia_backend;
```

### Step 2: Run Migrations

```bash
cd backend
npm run db:migrate
```

This creates the following tables:
- `leads` - Email captures from marketing page
- `customers` - Paying customers from Lemon Squeezy
- `subscriptions` - Subscription tracking
- `orders` - One-time orders
- `payments` - Payment history
- `webhook_events` - Raw webhook logs
- `activity_log` - Customer activity tracking
- `email_queue` - Transactional email queue

### Step 3: Verify Tables

```bash
psql -d ergovia_marketing -c "\dt"
```

Expected output:
```
             List of relations
 Schema |      Name       | Type  |  Owner
--------+-----------------+-------+----------
 public | activity_log    | table | postgres
 public | customers       | table | postgres
 public | email_queue     | table | postgres
 public | leads           | table | postgres
 public | orders          | table | postgres
 public | payments        | table | postgres
 public | subscriptions   | table | postgres
 public | webhook_events  | table | postgres
```

---

## Lemon Squeezy Configuration

### Step 1: Create Your Product

1. Go to [Lemon Squeezy Dashboard](https://app.lemonsqueezy.com)
2. Navigate to **Products** → **Add Product**
3. Configure:
   - **Name:** Ergovia Lite Monthly
   - **Price:** $297 USD
   - **Billing:** Monthly recurring
   - **Trial:** 14 days (optional)

4. Note your **Product ID** (visible in URL or API)

### Step 2: Get API Credentials

1. Go to **Settings** → **API**
2. Create a new API key
3. Copy the key to your `.env` file as `LEMONSQUEEZY_API_KEY`

### Step 3: Configure Webhooks

1. Go to **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **URL:** `https://your-backend.com/webhooks/lemonsqueezy`
   - **Events:** Select all subscription and order events:
     - `order_created`
     - `subscription_created`
     - `subscription_updated`
     - `subscription_cancelled`
     - `subscription_resumed`
     - `subscription_expired`
     - `subscription_payment_success`
     - `subscription_payment_failed`

4. Copy the **Signing Secret** to your `.env` as `LEMONSQUEEZY_WEBHOOK_SECRET`

### Step 4: Test Webhook (Development)

Use ngrok to expose your local server:

```bash
# Install ngrok
brew install ngrok

# Expose port 3000
ngrok http 3000

# Use the ngrok URL in Lemon Squeezy webhook settings
# Example: https://abc123.ngrok.io/webhooks/lemonsqueezy
```

---

## N8N Workflow Setup

### Step 1: Import Workflows

Import these JSON files into your n8n instance:

1. `backend/n8n-workflows/MARKETING_New_Customer_Provisioning.json`
2. `backend/n8n-workflows/MARKETING_Subscription_Events.json`

**To import:**
1. Go to your n8n instance
2. Click **Workflows** → **Import from File**
3. Select the JSON file
4. Save and activate

### Step 2: Configure Credentials

In n8n, create these credentials:

**PostgreSQL Credential:**
- **Name:** PostgreSQL Marketing DB
- **Host:** Your database host
- **Database:** ergovia_marketing
- **User:** Your database user
- **Password:** Your database password

**SMTP Credential (for emails):**
- **Name:** SMTP Credentials
- **Host:** smtp.gmail.com (or your SMTP)
- **Port:** 587
- **User:** Your email
- **Password:** App password

### Step 3: Update Webhook URLs

After activating workflows, n8n will generate webhook URLs. Copy these to your backend `.env`:

```env
N8N_WEBHOOK_NEW_CUSTOMER=https://n8n.yourdomain.com/webhook/abc123/new-customer
N8N_WEBHOOK_SUBSCRIPTION_CANCELLED=https://n8n.yourdomain.com/webhook/def456/subscription-cancelled
N8N_WEBHOOK_PAYMENT_FAILED=https://n8n.yourdomain.com/webhook/ghi789/payment-failed
```

### Step 4: Test Workflows

1. In n8n, click on a workflow
2. Click **Execute Workflow**
3. Send a test payload:

```json
{
  "event": "subscription_created",
  "customer": {
    "email": "test@example.com",
    "name": "Test User",
    "subscriptionId": "sub_test123"
  },
  "timestamp": "2026-02-19T12:00:00Z"
}
```

---

## Frontend Configuration

### Step 1: Update API URL

Edit `script.js` and update the CONFIG object:

```javascript
const CONFIG = {
    // Development
    API_URL: window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://api.ergovia.ai',  // Your production API URL

    // Your Lemon Squeezy Product ID
    PRODUCT_ID: 'YOUR_ACTUAL_PRODUCT_ID',

    // Fallback checkout URL
    CHECKOUT_URL: 'https://ergovia.lemonsqueezy.com/checkout/buy/YOUR_ACTUAL_PRODUCT_ID'
};
```

### Step 2: Test Locally

1. Start the backend:
```bash
cd backend && npm run dev
```

2. Serve the frontend:
```bash
# Using Python
cd .. && python3 -m http.server 5500

# Or using VS Code Live Server extension
```

3. Open `http://localhost:5500`

4. Click "Start Free Trial" - the modal should appear

5. Submit the form - should redirect to Lemon Squeezy checkout

---

## Deployment

### Backend Deployment (Railway/Render/Heroku)

**Option A: Railway**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize
railway init

# Deploy
railway up
```

**Option B: Render**

1. Connect your GitHub repo
2. Create new Web Service
3. Set environment variables
4. Deploy

**Option C: VPS (Ubuntu)**

```bash
# SSH into your server
ssh user@your-server.com

# Clone the repo
git clone https://github.com/your-repo/ergovia-marketing.git
cd ergovia-marketing/backend

# Install dependencies
npm install

# Set up PM2
npm install -g pm2
pm2 start server.js --name ergovia-backend
pm2 save
pm2 startup

# Set up Nginx
sudo nano /etc/nginx/sites-available/api.ergovia.ai
```

Nginx config:
```nginx
server {
    listen 80;
    server_name api.ergovia.ai;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Frontend Deployment (Vercel/Netlify)

**Option A: Vercel**

```bash
cd marketing-page
vercel
```

**Option B: Netlify**

1. Drag and drop the `marketing-page` folder to netlify.com/drop
2. Or connect to Git for auto-deploys

### Post-Deployment Checklist

- [ ] Update `FRONTEND_URL` in backend `.env` to production URL
- [ ] Update `API_URL` in frontend `script.js` to production API
- [ ] Update Lemon Squeezy webhook URL to production backend
- [ ] Test full checkout flow
- [ ] Verify Telegram notifications working
- [ ] Verify n8n workflows triggering

---

## Testing

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2026-02-19T12:00:00.000Z",
  "version": "1.0.0"
}
```

### Test 2: Create Checkout

```bash
curl -X POST http://localhost:3000/api/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "Test User", "propertyCount": "2-5"}'
```

Expected:
```json
{
  "success": true,
  "checkoutUrl": "https://ergovia.lemonsqueezy.com/checkout/buy/..."
}
```

### Test 3: Webhook Signature Verification

```bash
# Generate test signature
echo -n '{"test": true}' | openssl dgst -sha256 -hmac "YOUR_WEBHOOK_SECRET"

# Send test webhook
curl -X POST http://localhost:3000/webhooks/lemonsqueezy \
  -H "Content-Type: application/json" \
  -H "X-Signature: YOUR_GENERATED_SIGNATURE" \
  -d '{"meta": {"event_name": "order_created"}, "data": {"id": "123", "attributes": {"user_email": "test@example.com"}}}'
```

### Test 4: Full Checkout Flow

1. Open the marketing page
2. Click "Start Free Trial"
3. Enter test email
4. Click "Continue to Checkout"
5. Complete payment in Lemon Squeezy test mode
6. Verify:
   - Webhook received in backend logs
   - Customer created in database
   - Telegram notification received
   - Welcome email sent (via n8n)

---

## Troubleshooting

### Issue: CORS Errors

**Symptom:** Browser console shows CORS errors

**Fix:** Update `FRONTEND_URL` in backend `.env`:
```env
FRONTEND_URL=http://localhost:5500
```

### Issue: Webhook Signature Invalid

**Symptom:** 401 errors on webhook endpoint

**Fix:**
1. Verify `LEMONSQUEEZY_WEBHOOK_SECRET` matches Lemon Squeezy settings
2. Ensure raw body parsing for webhook route (already configured)

### Issue: Database Connection Failed

**Symptom:** Server crashes on startup

**Fix:**
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` format
3. Test connection: `psql $DATABASE_URL`

### Issue: N8N Webhooks Not Triggering

**Symptom:** No activity in n8n after events

**Fix:**
1. Verify workflow is active
2. Check webhook URL in backend matches n8n
3. Test webhook directly in n8n

### Issue: Checkout URL Not Working

**Symptom:** Redirect to Lemon Squeezy fails

**Fix:**
1. Verify `LEMONSQUEEZY_PRODUCT_ID` is correct
2. Check product is published in Lemon Squeezy
3. Verify API key has correct permissions

---

## File Structure Reference

```
marketing-page/
├── index.html                 # Landing page
├── styles.css                 # Styling
├── script.js                  # Frontend logic + API calls
├── SETUP_GUIDE.md             # Frontend-only guide
├── BACKEND_FRONTEND_SETUP_GUIDE.md  # This file
│
└── backend/
    ├── package.json           # Dependencies
    ├── server.js              # Express server
    ├── .env.example           # Environment template
    ├── .env                   # Your config (gitignored)
    │
    ├── database/
    │   ├── schema.sql         # Database tables
    │   └── migrate.js         # Migration script
    │
    ├── n8n-workflows/
    │   ├── MARKETING_New_Customer_Provisioning.json
    │   └── MARKETING_Subscription_Events.json
    │
    └── logs/
        ├── error.log
        └── combined.log
```

---

## Quick Reference

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/checkout-url` | Get direct checkout URL |
| POST | `/api/create-checkout` | Create checkout with lead capture |
| POST | `/webhooks/lemonsqueezy` | Lemon Squeezy webhooks |
| GET | `/api/admin/customers` | List customers (admin) |
| GET | `/api/admin/stats` | Dashboard stats (admin) |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LEMONSQUEEZY_API_KEY` | Yes | Lemon Squeezy API key |
| `LEMONSQUEEZY_PRODUCT_ID` | Yes | Your product ID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Yes | Webhook signing secret |
| `N8N_WEBHOOK_NEW_CUSTOMER` | No | N8N webhook URL |
| `TELEGRAM_BOT_TOKEN` | No | For admin notifications |
| `TELEGRAM_ADMIN_CHAT_ID` | No | Admin chat ID |

---

## Support

- **Backend Issues:** Check `logs/error.log`
- **Webhook Issues:** Check `webhook_events` table in database
- **N8N Issues:** Check workflow execution history in n8n UI

For additional help, contact: **hello@ergovia.ai**

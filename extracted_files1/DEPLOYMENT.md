# 🚀 DEPLOYMENT GUIDE

**Complete guide for deploying the Control Panel system**

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### Requirements:
- [ ] Web server (Nginx/Apache) or hosting service
- [ ] Backend API server (Node.js/Python/PHP)
- [ ] Database (PostgreSQL/MySQL)
- [ ] Payment processor integration (Stripe/PayPal)
- [ ] Email service (SMTP/SendGrid)
- [ ] SSL certificate
- [ ] Domain name

---

## 🏗️ DEPLOYMENT STEPS

### STEP 1: BACKEND SETUP (2-4 hours)

**1.1 Database Setup**
```sql
-- Run database migrations
psql -U postgres -d property_manager < schema.sql

-- Verify tables created
\dt

-- Expected tables:
-- customers, properties, form_data, deployments, 
-- contacts, bookings, tasks, activities
```

**1.2 API Server Setup**
```bash
# Example: Node.js/Express
cd backend
npm install
npm run build

# Configure environment variables
cp .env.example .env
nano .env
```

**Environment Variables:**
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# API Keys
JWT_SECRET=your_jwt_secret_here
API_SECRET=your_api_secret_here

# Payment
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxx

# Hetzner
HETZNER_API_TOKEN=xxx

# Cloudflare
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ZONE_ID=xxx

# n8n Master Instance
N8N_MASTER_URL=https://master.n8n.yourapp.com
N8N_MASTER_API_KEY=xxx

# Company Google Sheet (for OpenAI keys)
COMPANY_SPREADSHEET_ID=xxx
GOOGLE_SERVICE_ACCOUNT_JSON={}

# URLs
FRONTEND_URL=https://yourapp.com
API_URL=https://api.yourapp.com
```

**1.3 Start API Server**
```bash
# Development
npm run dev

# Production
pm2 start dist/index.js --name api-server
pm2 save
pm2 startup
```

---

### STEP 2: FRONTEND DEPLOYMENT (1 hour)

**2.1 Configure Control Panel**

Edit `index.html`:
```javascript
// Line ~2240: Update API endpoint
const API_BASE_URL = 'https://api.yourapp.com';

// Line ~2255: Update payment URL
window.location.href = 'https://yourapp.com/payment?customer_id=' + data.customer_id;
```

**2.2 Upload to Web Server**

**Option A: Static Hosting (Netlify/Vercel)**
```bash
# Deploy to Netlify
netlify deploy --prod --dir=.

# Deploy to Vercel
vercel --prod
```

**Option B: Traditional Server (Nginx)**
```bash
# Copy files
scp index.html root@server:/var/www/control-panel/

# Nginx configuration
server {
    listen 443 ssl http2;
    server_name app.yourapp.com;

    ssl_certificate /etc/letsencrypt/live/app.yourapp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourapp.com/privkey.pem;

    root /var/www/control-panel;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass https://api.yourapp.com/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**2.3 Test Frontend**
```bash
# Open in browser
https://app.yourapp.com

# Should see Control Panel login/signup
```

---

### STEP 3: N8N MASTER SETUP (2-3 hours)

**3.1 Deploy Master n8n Instance**
```bash
# Docker Compose for Master n8n
docker-compose -f docker-compose-master.yml up -d
```

**3.2 Import Master Coordinator**
```bash
# Import MASTER_COORDINATOR.json
curl -X POST https://master.n8n.yourapp.com/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d @MASTER_COORDINATOR.json

# Import all 7 SUB workflows
for i in {1..7}; do
  curl -X POST https://master.n8n.yourapp.com/api/v1/workflows \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -d @SUB${i}_*.json
done
```

**3.3 Configure Credentials in n8n**
- Hetzner API Token
- Cloudflare API Token
- Google OAuth2 (for Sheets)
- SMTP credentials
- Company Google Sheet access

**3.4 Test SUB Workflows**
```bash
# Test each SUB independently
curl -X POST https://master.n8n.yourapp.com/webhook/test-sub1 \
  -d '{"customer_id": "test123", ...}'
```

---

### STEP 4: COMPANY GOOGLE SHEET SETUP (30 min)

**4.1 Create Company Sheet**
1. Create new Google Sheet
2. Name: "Property Manager - Customer API Keys"
3. Add columns:
   - customer_id
   - openai_api_key
   - assigned_date
   - status
   - monthly_limit
   - usage_current_month
   - notes

**4.2 Share with Service Account**
```bash
# Get service account email from JSON
cat google-service-account.json | jq -r .client_email

# Share sheet with this email (Editor access)
```

**4.3 Add Test Data**
```
customer_id       | openai_api_key    | status | monthly_limit
test_customer     | sk-proj-test...   | active | 100
```

**4.4 Update SUB4**
```json
// In SUB4_Workflow_Configurator_CRITICAL.json
// Line ~50: Update spreadsheet ID
"value": "YOUR_COMPANY_SPREADSHEET_ID_HERE"
```

---

### STEP 5: PAYMENT INTEGRATION (1-2 hours)

**5.1 Stripe Setup**
```bash
# Install Stripe CLI
stripe login

# Create webhook
stripe listen --forward-to https://api.yourapp.com/webhook/stripe

# Note webhook secret: whsec_...
```

**5.2 Create Payment Page**
```html
<!-- payment.html -->
<script src="https://js.stripe.com/v3/"></script>
<script>
const stripe = Stripe('pk_live_...');
// Stripe Checkout implementation
</script>
```

**5.3 Webhook Handler**
```javascript
// backend/routes/stripe-webhook.js
app.post('/webhook/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerId = session.metadata.customer_id;
    
    // Trigger onboarding workflow
    await triggerOnboarding(customerId);
  }

  res.json({received: true});
});
```

---

### STEP 6: TESTING (2-4 hours)

**6.1 End-to-End Test**

1. **Form A Submission**
   ```bash
   curl -X POST https://api.yourapp.com/api/form-a \
     -H "Content-Type: application/json" \
     -d '{"customer_id": "test_e2e", ...}'
   ```

2. **Payment**
   - Use Stripe test card: 4242 4242 4242 4242
   - Complete payment flow
   - Verify webhook received

3. **Onboarding**
   - Check n8n Master execution log
   - Verify each SUB workflow runs
   - Check Hetzner server created
   - Verify DNS created
   - Check Google Sheets created

4. **Control Panel**
   - Login with test customer
   - Complete all 10 sections
   - Click "Activate"
   - Verify workflows deployed
   - Check system goes live

**6.2 Load Testing**
```bash
# Test concurrent signups
ab -n 100 -c 10 https://api.yourapp.com/api/form-a

# Test dashboard performance
ab -n 1000 -c 50 https://app.yourapp.com/
```

**6.3 Security Testing**
```bash
# SQL injection test
sqlmap -u "https://api.yourapp.com/api/control-panel/data?customer_id=test"

# XSS test
# (Manual testing in Control Panel forms)

# CSRF test
# (Verify CSRF tokens required)
```

---

### STEP 7: MONITORING SETUP (1 hour)

**7.1 Application Monitoring**
```bash
# Install monitoring (e.g., New Relic, Datadog)
npm install newrelic
# Or
pip install ddtrace
```

**7.2 Uptime Monitoring**
```bash
# UptimeRobot or Pingdom
# Monitor:
# - https://api.yourapp.com/health
# - https://app.yourapp.com/
# - https://master.n8n.yourapp.com/
```

**7.3 Error Tracking**
```bash
# Sentry
npm install @sentry/node

# Configure
Sentry.init({
  dsn: "https://...@sentry.io/...",
  environment: "production"
});
```

**7.4 Log Aggregation**
```bash
# Logstash, Splunk, or CloudWatch
# Collect logs from:
# - API server
# - n8n master
# - Customer n8n instances
```

---

### STEP 8: PRODUCTION LAUNCH (1 hour)

**8.1 Final Checks**
- [ ] All environment variables set to production values
- [ ] SSL certificates installed and valid
- [ ] Database backups configured
- [ ] Monitoring alerts set up
- [ ] Error tracking working
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Security headers set

**8.2 DNS Configuration**
```bash
# Point domains to servers
app.yourapp.com     → Control Panel server IP
api.yourapp.com     → API server IP
master.n8n.yourapp.com → n8n Master server IP

# Verify DNS propagation
dig app.yourapp.com
dig api.yourapp.com
```

**8.3 Go Live!**
```bash
# Enable production mode
export NODE_ENV=production

# Restart services
pm2 restart all

# Monitor logs
pm2 logs --lines 100
```

---

## 📊 POST-DEPLOYMENT

### STEP 9: MONITORING (Ongoing)

**Daily Checks:**
- [ ] Check error rates
- [ ] Check API response times
- [ ] Check deployment success rate
- [ ] Check customer signups
- [ ] Review failed deployments

**Weekly Checks:**
- [ ] Review server costs (Hetzner)
- [ ] Review OpenAI API costs
- [ ] Check database size growth
- [ ] Review support tickets
- [ ] Check system uptime

**Monthly Checks:**
- [ ] Review and optimize costs
- [ ] Update dependencies
- [ ] Security audit
- [ ] Performance optimization
- [ ] Customer satisfaction survey

---

### STEP 10: SCALING (As Needed)

**When to Scale:**
- API response time > 500ms
- Database queries taking > 100ms
- CPU usage consistently > 70%
- Memory usage > 80%
- Deployment queue growing

**Horizontal Scaling:**
```bash
# Add API servers
pm2 start dist/index.js -i max  # Use all CPU cores

# Load balancer (Nginx)
upstream api_servers {
    server api1.yourapp.com;
    server api2.yourapp.com;
    server api3.yourapp.com;
}
```

**Database Scaling:**
```sql
-- Add read replicas
-- Enable connection pooling
-- Add indexes on frequently queried columns
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_properties_customer_id ON properties(customer_id);
```

**Caching:**
```bash
# Redis for session storage and caching
docker run -d -p 6379:6379 redis:alpine

# Cache dashboard data
SET dashboard:miami_beach_rentals EX 300 "{...}"
```

---

## 🆘 TROUBLESHOOTING

### Common Issues:

**1. Payment webhook not received**
- Check Stripe webhook configuration
- Verify endpoint URL is publicly accessible
- Check webhook secret matches

**2. Onboarding fails**
- Check n8n Master logs
- Verify Hetzner API token valid
- Check Cloudflare API token valid
- Verify SUB workflows active

**3. Control Panel not loading**
- Check DNS configuration
- Verify SSL certificate valid
- Check Nginx configuration
- Review browser console for errors

**4. API errors**
- Check database connection
- Verify environment variables
- Review API server logs
- Check rate limits

**5. Slow performance**
- Enable caching
- Add database indexes
- Optimize queries
- Scale servers

---

## ✅ DEPLOYMENT CHECKLIST

- [ ] Backend API deployed and running
- [ ] Database migrated and accessible
- [ ] Frontend Control Panel deployed
- [ ] n8n Master instance running
- [ ] All SUB workflows imported and active
- [ ] Company Google Sheet created and shared
- [ ] Payment integration configured
- [ ] Webhooks tested
- [ ] SSL certificates installed
- [ ] DNS configured
- [ ] Monitoring set up
- [ ] Error tracking enabled
- [ ] Backups configured
- [ ] Security hardened
- [ ] End-to-end test passed
- [ ] Load test passed
- [ ] Documentation complete
- [ ] Team trained
- [ ] Support system ready
- [ ] PRODUCTION LIVE! 🚀

---

**Deployment Guide Complete** ✅  
**Estimated Total Time: 12-16 hours** ⏱️  
**System Ready for Production** 🟢

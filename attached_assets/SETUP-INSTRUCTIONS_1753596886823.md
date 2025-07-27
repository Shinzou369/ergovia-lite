
# ETF Workflow Setup Instructions

## 📦 What This Package Contains

This transfer package contains everything needed to add ETF (Ergovia TaskForce) workflow automation to your existing Replit project.

## 🎯 What ETF Does

ETF transforms your business from manual workflow setup to automated client onboarding:
- **Before**: Manually create workflows for each client
- **After**: Clients self-onboard and get personalized workflows automatically

## 🚀 Quick Setup Steps

### 1. Copy Files to Your Project
Copy these files from this package to your main project:

```
/server-additions.js     → Your project root
/public/etf-onboard.html → Your project/public/
/public/etf-admin.html   → Your project/public/
/database-setup.sql      → Your project root
```

### 2. Install Dependencies
Run in your project:
```bash
npm install axios sqlite3 uuid
```

### 3. Add ETF Code to Your Server
In your main `server.js`, add this at the top:
```javascript
// ETF Integration
const etfModule = require('./server-additions.js');
```

### 4. Set Environment Variables
Add to your Replit Secrets:
```
N8N_BASE_URL=https://n8n-app-gvq5.onrender.com
N8N_API_KEY=your_api_key_here
```

### 5. Initialize Database
Run once in Shell:
```bash
sqlite3 etf_data.db < database-setup.sql
```

## 🔗 Integration Points

### Add to Your Existing Routes
Replace "Coming Soon" buttons with ETF onboarding:

```html
<!-- Old -->
<button disabled>Coming Soon</button>

<!-- New -->
<a href="/etf-onboard" class="btn btn-primary">Get Started</a>
```

### Admin Access
Access your ETF management dashboard at:
```
https://your-repl-url.replit.dev/etf-admin
```

## 🎨 Client Flow

1. **Client visits your site** → Sees taskforce options
2. **Clicks "Get Started"** → ETF onboarding form
3. **Fills out details** → Submits requirements
4. **ETF automatically**:
   - Clones master workflow from n8n
   - Injects client data
   - Activates personalized workflow
   - Client gets automation instantly

## 💰 Business Model

- **$30/month per client** for AI taskforce automation
- **Fully automated** - no manual workflow setup
- **Scalable** - handles unlimited clients
- **Professional** - clients stay on your domain

## 📋 Files Included

- `server-additions.js` - Core ETF backend logic
- `etf-onboard.html` - Client onboarding interface
- `etf-admin.html` - Your management dashboard
- `database-setup.sql` - Required database tables
- `README.md` - This setup guide

## 🔧 Configuration

### N8N Workflow Templates
1. Create master workflows in your n8n instance
2. Note the workflow IDs
3. Update template mappings in `server-additions.js`

### Customization
- Modify onboarding form fields in `etf-onboard.html`
- Adjust workflow personalization in `personalizeWorkflowNodes()`
- Update business-specific placeholders

## ✅ Testing Your Setup

1. **Test n8n connection**: Visit `/api/test-n8n`
2. **Test onboarding**: Visit `/etf-onboard`
3. **Check admin panel**: Visit `/etf-admin`
4. **Deploy test workflow**: Use admin panel

## 🆘 Troubleshooting

**Can't connect to n8n**: Check N8N_BASE_URL and N8N_API_KEY
**Database errors**: Ensure `database-setup.sql` was run
**Missing templates**: Verify workflow IDs in n8n
**Onboarding fails**: Check browser console for errors

## 🚀 Next Steps

1. **Test the setup** with the provided test workflow
2. **Create your master templates** in n8n
3. **Customize the onboarding flow** for your business
4. **Launch to clients** and start earning $30/month per automation

Your ETF automation business is ready to scale! 🎉

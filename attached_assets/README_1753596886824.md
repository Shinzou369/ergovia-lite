
# ETF Transfer Package

This package contains everything needed to add ETF (Ergovia TaskForce) automation capabilities to your existing Replit project.

## 📦 Package Contents

- `SETUP-INSTRUCTIONS.md` - Detailed setup guide
- `server-additions.js` - Core ETF backend logic
- `public/etf-onboard.html` - Client onboarding interface  
- `public/etf-admin.html` - Admin management dashboard
- `database-setup.sql` - Required database schema

## 🚀 Quick Integration

1. **Copy files** to your project
2. **Install dependencies**: `npm install axios sqlite3 uuid`
3. **Add to server.js**: `require('./server-additions.js')`
4. **Set environment variables** in Replit Secrets
5. **Initialize database**: `sqlite3 etf_data.db < database-setup.sql`

## 🎯 What This Adds

- **Automated client onboarding** - clients get workflows without technical setup
- **N8N integration** - automatically clones and personalizes workflows
- **Revenue generation** - $30/month per client automation
- **Admin dashboard** - manage templates, clients, and deployments

## 🔗 URLs After Integration

- Client onboarding: `/etf-onboard`
- Admin dashboard: `/etf-admin`
- API endpoints: `/api/etf/*`

## 💡 Business Model

Clients pay $30/month for personalized automation workflows. The system handles everything automatically:

1. Client fills onboarding form
2. ETF clones master workflow from N8N
3. Injects client-specific data
4. Activates personalized workflow
5. Client gets instant automation

## 📞 Support

See `SETUP-INSTRUCTIONS.md` for detailed implementation guide and troubleshooting.

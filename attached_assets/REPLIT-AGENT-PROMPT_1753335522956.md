
# Replit Agent Integration Prompt

## Objective
Integrate the ETF (Ergovia TaskForce) Management System into my existing PRISMITY AI project to enable automated client onboarding and n8n workflow deployment.

## Background
I have a working n8n instance at `https://n8n-app-gvq5.onrender.com` with a "PET CLINIC" workflow. I need to integrate ETF functionality so clients can:
1. Visit taskforce pages and click "Get Started" 
2. Go through a 6-step onboarding wizard
3. Have personalized n8n workflows automatically deployed
4. Pay $30/month for their AI taskforce agents

## Files to Integrate

### 1. Backend Integration
**File:** `server-additions.js`
- **Action:** Merge this code into my existing `server.js`
- **What it adds:** N8N API client, ETF database tables, onboarding routes, workflow deployment logic

### 2. Frontend Files
**Files:** 
- `taskforce-onboard.html` → Copy to `public/` folder
- `taskforce-onboard.js` → Copy to `public/` folder

### 3. Dependencies to Install
```bash
npm install axios sqlite3 uuid
```

### 4. Environment Variables to Add
```
N8N_BASE_URL=https://n8n-app-gvq5.onrender.com
N8N_API_KEY=(optional - can use basic auth)
```

## Current Issues to Fix

### JavaScript Errors in taskforce.html
There are duplicate variable declarations and missing function definitions. Please:
1. Fix the duplicate `configFields` declaration error
2. Ensure `showModal` and `showTab` functions are properly defined and accessible

### Update Taskforce Cards
Replace the "Coming Soon" overlays with actual "Get Started" buttons that redirect to:
- `/taskforce/dental/onboard?type=dental`
- `/taskforce/gym/onboard?type=gym` 
- `/taskforce/contractors/onboard?type=contractors`
- `/taskforce/tutoring/onboard?type=tutoring`
- `/taskforce/massage/onboard?type=massage`

Use the updated HTML from `taskforce-updates.html`.

## Expected Flow After Integration

1. **Client visits taskforce page** → Sees taskforce agents with "Get Started" buttons
2. **Clicks "Get Started"** → Goes to `/taskforce/[type]/onboard?type=[type]`
3. **6-step wizard:** 
   - Step 1: Select taskforce type (auto-selected from URL)
   - Step 2: Business information (name, email, phone)
   - Step 3: Taskforce-specific configuration
   - Step 4: Review and confirm
   - Step 5: Deployment (shows spinner)
   - Step 6: Success with workflow details
4. **System automatically:**
   - Fetches template from n8n
   - Creates personalized copy with client data
   - Activates workflow in n8n
   - Saves client/deployment records

## Database Tables Created
- `etf_clients` - Client information
- `etf_deployments` - Deployment tracking with n8n workflow IDs

## API Endpoints Added
- `GET /taskforce/:type/onboard` - Onboarding page
- `GET /api/taskforce/:type/templates` - Get available templates
- `POST /api/taskforce/:type/deploy` - Deploy personalized workflow

## Success Criteria
✅ JavaScript errors resolved in taskforce.html
✅ "Get Started" buttons working and leading to onboarding
✅ 6-step onboarding wizard functional  
✅ Successful connection to n8n API
✅ Automatic workflow deployment working
✅ Client and deployment records saved to database

## Business Impact
This creates a complete **white-label automation platform** where:
- Your PRISMITY website becomes the client-facing business
- Clients never see n8n directly
- You earn $30/month per deployed taskforce
- Everything is automated from onboarding to deployment

## Files Included in Transfer Package
- `README-TRANSFER.md` - This instruction file
- `server-additions.js` - Backend code to merge
- `taskforce-onboard.html` - Client onboarding wizard
- `taskforce-onboard.js` - Onboarding logic
- `taskforce-updates.html` - Updated taskforce cards
- `package-dependencies.json` - Required npm packages

Please integrate these files and fix the current issues so the ETF system is fully functional in my main project.

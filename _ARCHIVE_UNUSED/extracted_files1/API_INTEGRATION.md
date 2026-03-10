# 🔌 API INTEGRATION SPECIFICATION

**Complete backend API requirements for Control Panel**

---

## 📡 REQUIRED API ENDPOINTS

### 1. FORM A SUBMISSION
```
POST /api/form-a
```

**Request Body:**
```json
{
  "customer_id": "miami_beach_rentals",
  "owner_name": "John Smith",
  "owner_email": "john@example.com",
  "owner_phone": "+1234567890",
  "owner_platform": "telegram",
  "properties": [
    {
      "name": "Sunset Villa",
      "address": "123 Beach St",
      "city": "Miami",
      "bedrooms": 3,
      "bathrooms": 2,
      "max_guests": 6
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "customer_id": "miami_beach_rentals",
  "redirect_url": "/payment?customer_id=miami_beach_rentals"
}
```

---

### 2. LOAD CONTROL PANEL DATA
```
GET /api/control-panel/data?customer_id=xxx
```

**Response:**
```json
{
  "customer_id": "miami_beach_rentals",
  "owner_name": "John Smith",
  "owner_email": "john@example.com",
  "owner_phone": "+1234567890",
  "owner_platform": "telegram",
  "properties": [...],
  "setup_complete": false,
  "progress_percentage": 20
}
```

---

### 3. SAVE CONTROL PANEL PROGRESS
```
POST /api/control-panel/save
```

**Request Body:**
```json
{
  "customer_id": "miami_beach_rentals",
  "section_id": 3,
  "data": {
    "telegram_bot_token": "...",
    "whatsapp_phone_id": "...",
    "whatsapp_access_token": "..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Progress saved",
  "timestamp": "2026-01-12T10:30:00Z"
}
```

---

### 4. ACTIVATE SYSTEM
```
POST /api/activate-system
```

**Request Body:**
```json
{
  "customer_id": "miami_beach_rentals",
  "complete_data": {
    // ALL fillup form data
    "customer_id": "...",
    "owner_name": "...",
    "owner_email": "...",
    "properties": [...],
    "credentials": {
      "telegram_bot_token": "...",
      "whatsapp_phone_id": "...",
      "whatsapp_access_token": "..."
    },
    "team": {
      "cleaners": [...],
      "maintenance": [...],
      "suppliers": [...]
    },
    "pricing": {...},
    "ai_config": {...},
    "templates": {...},
    "automation": {...},
    "emergency": {...},
    "llm_notes": "..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "System activation started",
  "estimated_time_minutes": 20,
  "status_url": "/api/activation-status?customer_id=xxx"
}
```

---

### 5. CHECK ACTIVATION STATUS
```
GET /api/activation-status?customer_id=xxx
```

**Response:**
```json
{
  "customer_id": "miami_beach_rentals",
  "status": "in_progress",
  "current_phase": "deploying_workflows",
  "progress_percentage": 65,
  "phases_complete": [
    "server_provisioning",
    "server_setup",
    "google_services",
    "workflow_configuration"
  ],
  "phases_remaining": [
    "workflow_deployment",
    "control_panel_deployment",
    "customer_notification"
  ],
  "estimated_time_remaining_minutes": 7
}
```

**When Complete:**
```json
{
  "customer_id": "miami_beach_rentals",
  "status": "complete",
  "progress_percentage": 100,
  "system_live": true,
  "urls": {
    "control_panel": "https://miami-beach-rentals.app.com",
    "n8n_dashboard": "https://miami-beach-rentals.app.com/n8n",
    "google_sheets": "https://docs.google.com/spreadsheets/d/..."
  },
  "credentials": {
    "n8n_username": "admin",
    "n8n_password": "..."
  }
}
```

---

### 6. DASHBOARD DATA
```
GET /api/dashboard/data?customer_id=xxx
```

**Response:**
```json
{
  "stats": {
    "bookings_this_month": 12,
    "occupancy_rate": 78,
    "revenue_this_month": 8450,
    "active_conversations": 5
  },
  "tasks": [
    {
      "id": 1,
      "title": "Respond to inquiry from John",
      "priority": "urgent",
      "due": "Today",
      "type": "inquiry"
    }
  ],
  "activities": [
    {
      "icon": "💬",
      "text": "New inquiry for Sunset Villa",
      "time": "5 minutes ago"
    }
  ],
  "bookings": [
    {
      "property_id": "sunset_villa",
      "property_name": "Sunset Villa",
      "check_in": "2026-01-15",
      "check_out": "2026-01-20",
      "guest_name": "Jane Doe",
      "status": "confirmed"
    }
  ]
}
```

---

### 7. PROPERTY MANAGEMENT
```
GET /api/properties?customer_id=xxx
POST /api/properties (add new)
PUT /api/properties/:id (update)
DELETE /api/properties/:id (remove)
```

---

### 8. CONTACT MANAGEMENT
```
GET /api/contacts?customer_id=xxx
POST /api/contacts (add new)
PUT /api/contacts/:id (update)
DELETE /api/contacts/:id (remove)
```

---

### 9. LLM NOTES
```
GET /api/llm-notes?customer_id=xxx
PUT /api/llm-notes (update)
```

---

## 🔐 AUTHENTICATION

All API requests must include authentication:

**Option 1: Session Cookie**
```
Cookie: session_id=xxx
```

**Option 2: Bearer Token**
```
Authorization: Bearer xxx
```

**Option 3: Customer ID + Secret**
```
X-Customer-ID: miami_beach_rentals
X-API-Secret: xxx
```

---

## 🚨 ERROR HANDLING

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid phone number format",
    "field": "owner_phone"
  }
}
```

**Error Codes:**
- `VALIDATION_ERROR` - Invalid input data
- `NOT_FOUND` - Customer/resource not found
- `UNAUTHORIZED` - Authentication failed
- `SERVER_ERROR` - Internal server error
- `RATE_LIMIT` - Too many requests

---

## 📊 DATA FLOW

```
Control Panel
    ↓
API Endpoint
    ↓
Database (save)
    ↓
Onboarding Workflow (when activated)
    ↓
- SUB1: Provision Server
- SUB2: Setup Server
- SUB3: Create Google Services
- SUB4: Configure Workflows (91 placeholders)
- SUB5: Deploy Workflows
- SUB6: Deploy Control Panel
- SUB7: Notify Customer
    ↓
System Live!
```

---

## 🔄 WEBHOOK CALLBACKS

### Activation Complete Callback
```
POST /webhook/activation-complete
```

**Payload:**
```json
{
  "customer_id": "miami_beach_rentals",
  "status": "success",
  "timestamp": "2026-01-12T10:50:00Z",
  "deployment_time_minutes": 18,
  "urls": {...},
  "credentials": {...}
}
```

---

## 📝 IMPLEMENTATION NOTES

### Database Schema

**Customers Table:**
```sql
CREATE TABLE customers (
  id VARCHAR PRIMARY KEY,
  owner_name VARCHAR,
  owner_email VARCHAR UNIQUE,
  owner_phone VARCHAR,
  owner_platform VARCHAR,
  setup_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Properties Table:**
```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY,
  customer_id VARCHAR REFERENCES customers(id),
  name VARCHAR,
  address VARCHAR,
  city VARCHAR,
  bedrooms INT,
  bathrooms DECIMAL,
  max_guests INT,
  checkin_time TIME,
  checkout_time TIME,
  wifi_name VARCHAR,
  wifi_password VARCHAR,
  door_code VARCHAR,
  parking TEXT,
  house_rules TEXT,
  media_links JSON
);
```

**Form Data Table:**
```sql
CREATE TABLE form_data (
  customer_id VARCHAR PRIMARY KEY REFERENCES customers(id),
  section_1 JSON,
  section_2 JSON,
  section_3 JSON,
  section_4 JSON,
  section_5 JSON,
  section_6 JSON,
  section_7 JSON,
  section_8 JSON,
  section_9 JSON,
  section_10 JSON,
  completed_sections JSON,
  progress_percentage INT,
  last_saved TIMESTAMP
);
```

**Deployments Table:**
```sql
CREATE TABLE deployments (
  id UUID PRIMARY KEY,
  customer_id VARCHAR REFERENCES customers(id),
  status VARCHAR, -- pending, in_progress, complete, failed
  current_phase VARCHAR,
  progress_percentage INT,
  server_ip VARCHAR,
  server_id VARCHAR,
  n8n_url VARCHAR,
  spreadsheet_id VARCHAR,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT
);
```

---

## ✅ TESTING CHECKLIST

- [ ] Form A submission works
- [ ] Control Panel loads with pre-filled data
- [ ] Save progress works (all 10 sections)
- [ ] Validation catches errors
- [ ] Activate button triggers onboarding
- [ ] Status polling works
- [ ] Dashboard loads real data
- [ ] Property management works
- [ ] Contact management works
- [ ] LLM notes save/load works
- [ ] Error handling works
- [ ] Authentication works
- [ ] Rate limiting works

---

**API Specification Complete** ✅  
**Ready for Backend Implementation** ✅


# Pet Clinic Customer Retention Engine (PET WF8) - Placeholder Documentation

## Overview
This workflow provides intelligent customer retention with personalized offers, loyalty tracking, and automated engagement campaigns based on customer tier classification.

## Required Placeholders

### Clinic Information
- `{{CLINIC_NAME}}` - Your veterinary clinic name
- `{{CLINIC_ADDRESS}}` - Full clinic address for communications
- `{{CLINIC_HOURS}}` - Business hours for customer reference
- `{{CLINIC_COLOR}}` - Primary brand color (hex code without #)
- `{{CLINIC_PREFIX}}` - Short clinic identifier (e.g., "VET", "PET")
- `{{HEAD_VETERINARIAN}}` - Primary veterinarian name
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")
- `{{CURRENCY}}` - Currency symbol for pricing (e.g., "$")

### Contact Information
- `{{BUSINESS_EMAIL}}` - Main clinic email address
- `{{BUSINESS_PHONE_NUMBER}}` - Main clinic phone number
- `{{BUSINESS_WEBSITE}}` - Clinic website URL for online booking
- `{{ADMIN_EMAIL}}` - Administrator email for internal notifications

### Google Sheets Configuration
- `{{MASTER_APPOINTMENTS_SHEET_ID}}` - Master appointments Google Sheet ID
- `{{MASTER_SHEET_NAME}}` - Sheet name within master appointments sheet
- `{{CUSTOMER_LOYALTY_SHEET_ID}}` - Customer loyalty tracking Google Sheet ID
- `{{LOYALTY_SHEET_NAME}}` - Sheet name within loyalty spreadsheet

### Integration Credentials
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail OAuth2 credential ID in n8n
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth2 credential ID
- `{{TWILIO_CREDENTIAL_ID}}` - Twilio SMS credential ID

### Node IDs (Auto-generated)
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Documentation sticky note ID
- `{{REVIEW_REQUEST_TRIGGER_NODE_ID}}` - Workflow trigger from WF7 node ID
- `{{GET_CUSTOMER_HISTORY_NODE_ID}}` - Customer history lookup node ID
- `{{GET_LOYALTY_DATA_NODE_ID}}` - Loyalty data retrieval node ID
- `{{CALCULATE_RETENTION_METRICS_NODE_ID}}` - Retention calculation node ID
- `{{VIP_CUSTOMER_CHECK_NODE_ID}}` - VIP tier condition node ID
- `{{SEND_VIP_OFFER_NODE_ID}}` - VIP email sending node ID
- `{{SEND_RETURN_OFFER_NODE_ID}}` - Standard return offer node ID
- `{{UPDATE_LOYALTY_DATABASE_NODE_ID}}` - Loyalty database update node ID
- `{{WAIT_RETENTION_CYCLE_NODE_ID}}` - Wait for next cycle node ID
- `{{SEND_WELLNESS_SMS_NODE_ID}}` - SMS reminder node ID
- `{{UPDATE_MASTER_HUB_NODE_ID}}` - Master hub update node ID

### Webhook IDs (Auto-generated)
- `{{WAIT_RETENTION_CYCLE_WEBHOOK_ID}}` - Wait node webhook ID

### System Metadata
- `{{WORKFLOW_ID}}` - N8N workflow ID
- `{{VERSION_ID}}` - N8N workflow version ID
- `{{INSTANCE_ID}}` - N8N instance ID
- `{{WORKFLOW_TAG}}` - Workflow tag ("PET" for Pet Clinic workflows)

## Customer Tier System

### Tier Classification Logic
- **VIP:** 10+ visits OR $1000+ total spent
- **Loyal:** 5+ visits OR $500+ total spent
- **Regular:** 3+ visits
- **New:** Less than 3 visits

### Tier Benefits
- **VIP:** 20% discounts, 60-day retention cycle, priority scheduling
- **Loyal:** 15% discounts, 75-day retention cycle, loyalty rewards
- **Regular:** 10% discounts, 90-day retention cycle, engagement boosts
- **New:** 5% welcome offers, 120-day retention cycle, nurturing campaigns

## Data Flow Requirements

### Input Data Expected
- `clientName` or `Customer Name` - Client's full name
- `clientEmail` or `Customer Email` - Client's email address
- `clientPhone` or `Customer Phone` - Client's phone number
- `petName` or `Pet Name` - Pet's name
- `petId` - Pet identifier (optional)
- `visitDate` or `Date` - Last visit date
- `cost` or `Invoice Amount` - Visit cost for spending calculations
- `Customer Since` - Customer start date (optional)

### Calculated Metrics
- `customerTier` - Calculated tier (New/Regular/Loyal/VIP)
- `visitCount` - Total number of visits
- `totalSpent` - Total amount spent
- `daysSinceLastVisit` - Days since last visit
- `retentionScore` - Calculated retention score (0-100)
- `churnRisk` - Risk assessment (Low/Medium/High)
- `discountPercent` - Tier-appropriate discount percentage
- `reminderDays` - Days until next retention contact

## Workflow Dependencies

### Triggers
- **Primary:** PET WF7 (Review Request System)
- Activated after review request is sent to client

### Integration Points
- **Google Sheets:** Customer history and loyalty tracking
- **Gmail:** Rich HTML email campaigns with tier-specific content
- **Twilio:** SMS reminders for ongoing engagement
- **Master Hub:** Comprehensive retention status tracking

## Email Templates

### VIP Template Features
- Gold gradient header design
- Exclusive benefits listing
- Priority scheduling emphasis
- Premium service highlighting
- Personalized statistics display

### Standard Template Features
- Clinic-branded header
- Tier-specific discount display
- Service grid layout
- Health reminders based on visit history
- Booking call-to-action with multiple contact methods

## Retention Strategy Logic

### Campaign Types
- **vip_exclusive:** Premium offers for VIP customers
- **loyalty_reward:** Recognition campaigns for loyal customers
- **engagement_boost:** Re-engagement for regular customers
- **new_customer_nurture:** Welcome series for new customers

### Timing Optimization
- Immediate: Tier-appropriate email campaign
- Scheduled: Future SMS wellness reminders
- Cyclical: Automated re-engagement based on tier timing

## Configuration Notes
- **Churn Risk:** Calculated based on days since last visit (>180 = High, >90 = Medium)
- **Retention Score:** Based on visit frequency and spending patterns
- **Offer Validity:** VIP offers valid 60 days, standard offers valid 30 days
- **Follow-up Cycle:** Automatic scheduling based on customer tier and risk level

## Success Metrics Tracked
- Campaign delivery status
- Customer tier progression
- Retention score improvement
- Churn risk reduction
- Engagement response rates
- Loyalty database completeness

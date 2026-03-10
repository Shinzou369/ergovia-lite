
# Pet Clinic Future Follow-ups Scheduler - Placeholder Variables

## Workflow: PET WF17 - Future Follow-ups Scheduler
**Description:** AI-powered system that analyzes visit notes to automatically schedule future follow-up actions and sends timely reminders to pet owners.

## Required Placeholder Variables

### 🏥 Clinic Information
- `{{CLINIC_NAME}}` - Name of the veterinary clinic
- `{{VETERINARIAN_NAME}}` - Primary veterinarian name
- `{{BUSINESS_EMAIL}}` - Main clinic email address
- `{{BUSINESS_PHONE_NUMBER}}` - Clinic phone number (format: +1234567890)
- `{{ADMIN_EMAIL}}` - Administrator email for reports
- `{{TIMEZONE}}` - Clinic timezone (e.g., America/New_York)

### 📊 Google Sheets Configuration
- `{{FUTURE_FOLLOWUPS_SHEET_ID}}` - Google Sheets ID for follow-up tracking
- `{{FOLLOWUPS_SHEET_NAME}}` - Sheet name for follow-up data (e.g., "Future Followups")

### 🔗 Node IDs (Auto-generated during deployment)
- `{{NODE_ID_TRIGGERED_BY_VISIT_COMPLETION}}` - Visit completion trigger node
- `{{NODE_ID_PREPARE_VISIT_CONTEXT}}` - Visit context preparation node
- `{{NODE_ID_AI_AGENT_SCHEDULE_ACTIONS}}` - AI agent for action scheduling
- `{{NODE_ID_CHAT_MODEL_OPENAI}}` - OpenAI chat model node
- `{{NODE_ID_MEMORY_BUFFER_WINDOW}}` - Memory buffer node
- `{{NODE_ID_PARSE_AI_OUTPUT}}` - AI output parsing node
- `{{NODE_ID_SAVE_FUTURE_FOLLOWUPS}}` - Save follow-ups to sheets
- `{{NODE_ID_DAILY_CHECK_AT_8AM}}` - Daily schedule trigger
- `{{NODE_ID_READ_FUTURE_FOLLOWUPS}}` - Read follow-ups from sheets
- `{{NODE_ID_FILTER_DUE_ACTIONS}}` - Filter due actions
- `{{NODE_ID_SEND_REMINDER_SMS}}` - SMS reminder sender
- `{{NODE_ID_UPDATE_FOLLOWUP_STATUS}}` - Status update node
- `{{NODE_ID_SEND_DAILY_REPORT}}` - Daily report sender

### 🔑 Credential IDs (Auto-generated during deployment)
- `{{OPENAI_CREDENTIAL_ID}}` - OpenAI API credential ID
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets credential ID
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail credential ID
- `{{TWILIO_CREDENTIAL_ID}}` - Twilio SMS credential ID

### 🔧 Variable IDs (Auto-generated during deployment)
- `{{CLINIC_NAME_VAR_ID}}` - Clinic name variable ID
- `{{VETERINARIAN_NAME_VAR_ID}}` - Veterinarian name variable ID
- `{{FUTURE_FOLLOWUPS_SHEET_ID_VAR_ID}}` - Follow-ups sheet ID variable
- `{{FOLLOWUPS_SHEET_NAME_VAR_ID}}` - Follow-ups sheet name variable
- `{{TIMEZONE_VAR_ID}}` - Timezone variable ID
- `{{BUSINESS_PHONE_NUMBER_VAR_ID}}` - Business phone variable ID
- `{{BUSINESS_EMAIL_VAR_ID}}` - Business email variable ID
- `{{ADMIN_EMAIL_VAR_ID}}` - Admin email variable ID

### 🎯 System Configuration
- `{{INSTANCE_ID}}` - N8N instance identifier

## 📋 Google Sheets Setup Requirements

### Future Follow-ups Sheet Columns:
1. **Action ID** - Unique identifier for each follow-up action
2. **Action** - Description of the follow-up action needed
3. **Due Date** - When the action is due (YYYY-MM-DD format)
4. **Pet ID** - Unique pet identifier
5. **Pet Name** - Name of the pet
6. **Client Name** - Pet owner's name
7. **Client Phone** - Phone number for SMS reminders
8. **Client Email** - Email address for contact
9. **Scheduled Date** - When the follow-up was scheduled
10. **Status** - Current status (scheduled, reminder_sent, completed)
11. **Clinic** - Clinic name
12. **Notes** - Additional notes
13. **Reminder Sent Date** - Timestamp of last reminder
14. **Last Contact** - Type of last contact attempt

## 🔌 Required Integrations

### 1. OpenAI API
- **Purpose:** AI-powered analysis of visit notes to identify follow-up actions
- **Setup:** Add OpenAI API key to credentials

### 2. Google Sheets
- **Purpose:** Store and track follow-up actions
- **Setup:** OAuth2 connection to Google Sheets

### 3. Gmail
- **Purpose:** Send daily reports to administrators
- **Setup:** OAuth2 connection to Gmail

### 4. Twilio SMS
- **Purpose:** Send reminder texts to pet owners
- **Setup:** Twilio account with phone number and API credentials

## ⚙️ Workflow Features

### 🤖 AI-Powered Scheduling
- Analyzes visit notes using OpenAI
- Automatically identifies required follow-up actions
- Determines appropriate due dates for each action
- Extracts client contact information

### 📅 Automated Reminders
- Daily check at 8:00 AM for due actions
- SMS reminders sent to pet owners
- Status tracking in Google Sheets
- Daily summary reports to administrators

### 📊 Comprehensive Tracking
- Complete audit trail of all follow-up actions
- Status monitoring and updates
- Performance reporting and analytics

## 🚀 Deployment Notes

1. **Prerequisites:** Ensure all credential connections are established
2. **Sheet Setup:** Create the Future Follow-ups sheet with required columns
3. **Testing:** Test with sample visit completion data
4. **Scheduling:** Verify daily check trigger is set correctly for clinic timezone
5. **Monitoring:** Check daily reports for system performance

## 🔗 Integration Points

- **Triggers from:** Visit Completion Orchestrator workflow
- **Connects to:** Google Sheets for data storage
- **Notifies via:** SMS (Twilio) and Email (Gmail)
- **Reports to:** Clinic administrators

---
*This workflow automates the critical task of follow-up care scheduling, ensuring no pet health needs are overlooked while reducing manual administrative work.*

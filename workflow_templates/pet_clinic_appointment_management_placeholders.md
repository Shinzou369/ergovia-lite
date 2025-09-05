
# Appointment Management Template - Placeholder Variables

## Business Information Placeholders
- `{{CLINIC_NAME}}` - Name of the veterinary clinic
- `{{CLINIC_ADDRESS}}` - Physical address of the clinic
- `{{BUSINESS_PHONE_NUMBER}}` - Main clinic phone number for SMS communications
- `{{BUSINESS_EMAIL}}` - Primary clinic email address
- `{{TIMEZONE}}` - Timezone for appointment scheduling (e.g., "America/New_York")
- `{{CANCELLATION_POLICY}}` - Clinic's cancellation policy description
- `{{REMINDER_CHECK_INTERVAL}}` - Hours between reminder checks (e.g., "24")

## Integration Placeholders
- `{{APPOINTMENTS_SHEET_ID}}` - Google Sheets ID for appointment tracking
- `{{APPOINTMENTS_SHEET_NAME}}` - Sheet name within the appointments spreadsheet
- `{{MASTER_APPOINTMENTS_SHEET_ID}}` - Google Sheets ID for master appointment hub
- `{{MASTER_SHEET_NAME}}` - Sheet name within the master spreadsheet
- `{{CALENDLY_WEBHOOK_ID}}` - Webhook ID for Calendly integration

## Technical Placeholders
- `{{WORKFLOW_ID}}` - Unique identifier for the workflow
- `{{VERSION_ID}}` - Version identifier for the workflow
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Tag for workflow categorization

## Node ID Placeholders
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Unique ID for the workflow description sticky note
- `{{WORKFLOW_TITLE_NOTE_ID}}` - Unique ID for the workflow title sticky note
- `{{SCHEDULE_TRIGGER_NODE_ID}}` - Unique ID for the schedule trigger node
- `{{GET_APPOINTMENTS_NODE_ID}}` - Unique ID for the Google Sheets read node
- `{{FILTER_APPOINTMENTS_NODE_ID}}` - Unique ID for the appointment filtering node
- `{{REMINDER_SMS_NODE_ID}}` - Unique ID for the reminder SMS node
- `{{CALENDLY_TRIGGER_NODE_ID}}` - Unique ID for the Calendly webhook trigger
- `{{LOG_MASTER_SHEET_NODE_ID}}` - Unique ID for the master sheet logging node
- `{{CONFIRMATION_SMS_NODE_ID}}` - Unique ID for the confirmation SMS node
- `{{FILTER_CONDITION_ID}}` - Unique ID for the date filtering condition

## Credential Placeholders
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - ID for Google Sheets API credential configuration
- `{{TWILIO_CREDENTIAL_ID}}` - ID for Twilio SMS API credential configuration
- `{{CALENDLY_CREDENTIAL_ID}}` - ID for Calendly API credential configuration

## Usage Notes
1. The workflow has two main triggers: Calendly webhooks and scheduled reminders
2. New appointments are automatically logged to both local and master sheets
3. Instant SMS confirmations are sent upon booking
4. Daily reminder checks send SMS to customers with next-day appointments
5. The filter uses timezone-aware date comparisons for accuracy
6. Phone number extraction handles various question formats from Calendly forms
7. All SMS messages include clinic branding and essential information
8. The workflow supports customizable reminder intervals for flexibility


# Pet Clinic Medical Records Management - Placeholder Variables

## Core Identifiers
- `{{WORKFLOW_ID}}` - Unique workflow identifier
- `{{VERSION_ID}}` - Workflow version identifier  
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Workflow tag (usually "PET")

## Business Information
- `{{CLINIC_NAME}}` - Full clinic name
- `{{CLINIC_PREFIX}}` - Short clinic prefix for record IDs (e.g., "VET", "PETS")
- `{{CLINIC_ADDRESS}}` - Full clinic address
- `{{CLINIC_COLOR}}` - Brand color hex code (without #)
- `{{BUSINESS_EMAIL}}` - Primary business email address
- `{{BUSINESS_PHONE_NUMBER}}` - Business phone number
- `{{ADMIN_EMAIL}}` - Admin/manager email address
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

## Staff Information
- `{{HEAD_VETERINARIAN}}` - Name of head veterinarian
- `{{PRIMARY_VET_ID}}` - Primary veterinarian ID

## Google Sheets Configuration
- `{{MEDICAL_RECORDS_SHEET_ID}}` - Medical records Google Sheet ID
- `{{MEDICAL_RECORDS_SHEET_NAME}}` - Medical records sheet tab name (e.g., "Medical Records")
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth credential ID

## Forms & URLs
- `{{PET_HISTORY_FORM_URL}}` - URL to pet history form for clients

## Communication Credentials
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail OAuth2 credential ID in n8n
- `{{TWILIO_CREDENTIAL_ID}}` - Twilio SMS credential ID

## Webhook IDs
- `{{WAIT_WEBHOOK_ID}}` - Webhook ID for wait node

## Node IDs (Auto-generated)
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Workflow description sticky note ID
- `{{VISIT_COMPLETE_TRIGGER_NODE_ID}}` - Visit complete trigger node ID
- `{{CHECK_PET_HISTORY_FORM_NODE_ID}}` - Check pet history form node ID
- `{{SEND_SMS_REQUEST_NODE_ID}}` - Send SMS request node ID
- `{{WAIT_ONE_HOUR_NODE_ID}}` - Wait 1 hour node ID
- `{{CHECK_STAFF_NOTES_NODE_ID}}` - Check staff notes node ID
- `{{SEND_STAFF_REMINDER_NODE_ID}}` - Send staff reminder node ID
- `{{FORMAT_MEDICAL_RECORD_DATA_NODE_ID}}` - Format medical record data node ID
- `{{UPDATE_MEDICAL_RECORDS_HUB_NODE_ID}}` - Update medical records hub node ID

## Integration Features
- **Data Completeness Validation**: Checks both client form completion and staff note completion
- **Multi-Channel Reminders**: SMS to clients for forms, email to staff for notes
- **Medical Records Hub**: Comprehensive medical record storage with full patient history
- **Workflow Integration**: Seamless connection with visit completion orchestrator
- **Smart Timing**: 1-hour wait period allows staff time to complete notes
- **Complete Audit Trail**: Tracks form completion, note completion, and record updates
- **Rich Medical Data**: Stores comprehensive visit details, diagnoses, treatments, and follow-ups

## Data Fields Captured
- Patient information (ID, name, breed, age, weight, vitals)
- Client information (name, contact details)
- Visit details (date, time, service type, notes)
- Medical information (diagnosis, treatment, medications, recommendations)
- Staff information (veterinarian, staff ID)
- System metadata (timestamps, completion status)

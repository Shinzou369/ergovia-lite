
# Pet Clinic Visit Completion Orchestrator - Template Placeholders

## Template Description
**PET WF3** - Automatically handles post-visit processes when a pet appointment is completed, orchestrating multiple downstream workflows.

## Core Configuration Placeholders

### Clinic Information
- `{{CLINIC_NAME}}` - Name of the veterinary clinic
- `{{BUSINESS_PHONE_NUMBER}}` - Main business phone number for SMS communications  
- `{{BUSINESS_EMAIL}}` - Main business email address
- `{{TIMEZONE}}` - Clinic's timezone (e.g., "America/New_York")

### Google Integration
- `{{GOOGLE_CALENDAR_ID}}` - Google Calendar ID for appointment tracking
- `{{CALENDAR_POLL_MODE}}` - Poll mode for calendar monitoring (e.g., "everyMinute", "every5Minutes")
- `{{GOOGLE_CALENDAR_CREDENTIAL_ID}}` - N8N credential ID for Google Calendar access

### Google Sheets Integration
- `{{APPOINTMENTS_SHEET_ID}}` - Primary appointments tracking sheet ID
- `{{APPOINTMENTS_SHEET_NAME}}` - Sheet name within appointments workbook (e.g., "Appointments")
- `{{MASTER_APPOINTMENTS_SHEET_ID}}` - Master hub sheet ID for centralized tracking
- `{{MASTER_SHEET_NAME}}` - Master sheet name (e.g., "Master_Appointments")
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - N8N credential ID for Google Sheets access

### Webhook Configuration
- `{{VISIT_COMPLETE_WEBHOOK_PATH}}` - Custom webhook path for manual visit completion triggers
- `{{VISIT_COMPLETE_WEBHOOK_ID}}` - Unique webhook identifier

### SMS Integration
- `{{TWILIO_CREDENTIAL_ID}}` - N8N credential ID for Twilio SMS service

## Critical Inter-Workflow Dependencies
**These are the most sensitive placeholders as they reference client-specific workflows:**

- `{{CLIENT_INVOICING_WORKFLOW_ID}}` - Personalized workflow ID for "{ClientName} - Invoicing System"
- `{{CLIENT_MEDICAL_RECORDS_WORKFLOW_ID}}` - Personalized workflow ID for "{ClientName} - Medical Records Management"  
- `{{CLIENT_REVIEW_REQUEST_WORKFLOW_ID}}` - Personalized workflow ID for "{ClientName} - Review Request System"
- `{{CLIENT_RETENTION_ENGINE_WORKFLOW_ID}}` - Personalized workflow ID for "{ClientName} - Customer Retention Engine"

## Node ID Placeholders
- `{{VISIT_COMPLETE_WEBHOOK_NODE_ID}}` - Unique node ID for webhook trigger
- `{{AUTO_DETECT_VISIT_END_NODE_ID}}` - Unique node ID for calendar trigger
- `{{UPDATE_APPOINTMENT_STATUS_NODE_ID}}` - Unique node ID for appointment status update
- `{{UPDATE_MASTER_HUB_NODE_ID}}` - Unique node ID for master hub update
- `{{TRIGGER_INVOICING_NODE_ID}}` - Unique node ID for invoicing workflow trigger
- `{{TRIGGER_MEDICAL_RECORDS_NODE_ID}}` - Unique node ID for medical records trigger
- `{{TRIGGER_REVIEW_REQUEST_NODE_ID}}` - Unique node ID for review request trigger
- `{{TRIGGER_RETENTION_ENGINE_NODE_ID}}` - Unique node ID for retention engine trigger
- `{{VISIT_COMPLETE_SMS_NODE_ID}}` - Unique node ID for SMS notification
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Unique node ID for description sticky note
- `{{WORKFLOW_TITLE_NOTE_ID}}` - Unique node ID for title sticky note

## Workflow Metadata Placeholders
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{VERSION_ID}}` - Workflow version identifier
- `{{WORKFLOW_ID}}` - Unique workflow identifier
- `{{WORKFLOW_TAG}}` - Workflow classification tag

## Deployment Notes

### Inter-Workflow Naming Convention
During deployment, the system must resolve client-specific workflow names using this pattern:
- Template reference: `PET WF5` → Personalized: `{ClientName} - Invoicing System`
- Template reference: `PET WF6` → Personalized: `{ClientName} - Medical Records Management`
- Template reference: `PET WF7` → Personalized: `{ClientName} - Review Request System`  
- Template reference: `PET WF8` → Personalized: `{ClientName} - Customer Retention Engine`

### Critical Dependencies
This workflow is a central orchestrator that depends on 4 downstream workflows being deployed first:
1. Invoicing System (WF5)
2. Medical Records Management (WF6)  
3. Review Request System (WF7)
4. Customer Retention Engine (WF8)

The deployment system must ensure these dependencies exist and are properly referenced with client-specific IDs.


# Pet Clinic Invoicing System - Placeholder Variables

## Core Identifiers
- `{{WORKFLOW_ID}}` - Unique workflow identifier
- `{{VERSION_ID}}` - Workflow version identifier  
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Workflow tag (usually "PET")

## Business Information
- `{{CLINIC_NAME}}` - Full clinic name
- `{{CLINIC_PREFIX}}` - Short clinic prefix for invoice IDs (e.g., "VET", "PETS")
- `{{CLINIC_ADDRESS}}` - Full clinic address
- `{{CLINIC_COLOR}}` - Brand color hex code (without #)
- `{{BUSINESS_EMAIL}}` - Primary business email address
- `{{BUSINESS_PHONE_NUMBER}}` - Business phone number
- `{{ADMIN_EMAIL}}` - Admin/manager email address
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

## Google Sheets Configuration
- `{{MASTER_APPOINTMENTS_SHEET_ID}}` - Master appointments Google Sheet ID
- `{{MASTER_SHEET_NAME}}` - Master sheet tab name
- `{{INVOICES_SHEET_ID}}` - Invoices tracking Google Sheet ID
- `{{INVOICES_SHEET_NAME}}` - Invoices sheet tab name
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth credential ID

## Payment & Invoicing Configuration
- `{{PAYMENT_GATEWAY_URL}}` - Payment gateway base URL
- `{{DEFAULT_SERVICE_PRICE}}` - Default service price (numeric)
- `{{INVOICE_DUE_DAYS}}` - Days until invoice is due (numeric)
- `{{LATE_FEE_POLICY}}` - Late fee policy description
- `{{PAYMENT_REMINDER_CHECK_HOURS}}` - Hours between reminder checks (numeric)
- `{{STRIPE_WEBHOOK_ID}}` - Stripe webhook ID
- `{{STRIPE_CREDENTIAL_ID}}` - Stripe API credential ID

## Communication Credentials
- `{{SMTP_CREDENTIAL_ID}}` - Gmail SMTP credential ID
- `{{TWILIO_CREDENTIAL_ID}}` - Twilio SMS credential ID

## Node IDs (Auto-generated)
- `{{VISIT_COMPLETE_TRIGGER_NODE_ID}}` - Visit complete trigger node ID
- `{{GET_APPOINTMENT_DETAILS_NODE_ID}}` - Get appointment details node ID
- `{{GENERATE_INVOICE_DETAILS_NODE_ID}}` - Generate invoice details node ID
- `{{LOG_INVOICE_TO_SHEET_NODE_ID}}` - Log invoice to sheet node ID
- `{{SEND_INVOICE_EMAIL_NODE_ID}}` - Send invoice email node ID
- `{{SEND_INVOICE_SMS_NODE_ID}}` - Send invoice SMS node ID
- `{{PAYMENT_SUCCESS_WEBHOOK_NODE_ID}}` - Payment success webhook node ID
- `{{UPDATE_INVOICE_PAID_NODE_ID}}` - Update invoice to paid node ID
- `{{SEND_PAYMENT_CONFIRMATION_NODE_ID}}` - Send payment confirmation node ID
- `{{PAYMENT_REMINDER_SCHEDULE_NODE_ID}}` - Payment reminder schedule node ID
- `{{GET_ALL_INVOICES_NODE_ID}}` - Get all invoices node ID
- `{{FILTER_OVERDUE_INVOICES_NODE_ID}}` - Filter overdue invoices node ID
- `{{SEND_PAYMENT_REMINDER_NODE_ID}}` - Send payment reminder node ID
- `{{SEND_REMINDER_SMS_NODE_ID}}` - Send reminder SMS node ID
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Workflow description note ID
- `{{WORKFLOW_TITLE_NOTE_ID}}` - Workflow title note ID

## Integration Features
- **Invoice Generation**: Automatic HTML invoice creation with clinic branding
- **Multi-Channel Delivery**: Email and SMS notifications
- **Payment Processing**: Stripe webhook integration
- **Smart Reminders**: Automated overdue payment reminders at 3, 7, 14, and 30 day intervals
- **Payment Confirmations**: Automatic confirmation emails when payments succeed
- **Complete Tracking**: Full audit trail in Google Sheets

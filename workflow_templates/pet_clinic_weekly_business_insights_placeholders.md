
# Pet Clinic Weekly Business Insights - Placeholder Variables

## Core Identifiers
- `{{WORKFLOW_ID}}` - Unique workflow identifier
- `{{VERSION_ID}}` - Workflow version identifier  
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Workflow tag (usually "PET")

## Business Information
- `{{CLINIC_NAME}}` - Full clinic name
- `{{CLINIC_COLOR}}` - Brand color hex code (without #)
- `{{BUSINESS_EMAIL}}` - Primary business email address
- `{{BUSINESS_PHONE_NUMBER}}` - Business phone number
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

## Google Sheets Configuration
- `{{PAYMENTS_SHEET_ID}}` - Payment tracking Google Sheet ID
- `{{CLIENTS_SHEET_ID}}` - Client database Google Sheet ID
- `{{APPOINTMENTS_SHEET_ID}}` - Appointments tracking Google Sheet ID
- `{{REPORTS_SHEET_ID}}` - Business reports Google Sheet ID
- `{{REPORTS_SHEET_NAME}}` - Reports sheet tab name (e.g., "Weekly Reports")
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth credential ID

## Communication Credentials
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail OAuth2 credential ID in n8n

## Node ID Placeholders
- `{{NODE_ID_WEEKLY_REPORT_TRIGGER}}` - Schedule trigger node ID
- `{{NODE_ID_GET_PAYMENTS_DATA}}` - Payments data retrieval node ID
- `{{NODE_ID_GET_CLIENTS_DATA}}` - Clients data retrieval node ID
- `{{NODE_ID_GET_APPOINTMENTS_DATA}}` - Appointments data retrieval node ID
- `{{NODE_ID_CALCULATE_BUSINESS_METRICS}}` - Business analytics code node ID
- `{{NODE_ID_LOG_REPORT_DATABASE}}` - Database logging node ID
- `{{NODE_ID_EMAIL_WEEKLY_REPORT}}` - Gmail email node ID
- `{{NODE_ID_WORKFLOW_DESCRIPTION}}` - Workflow description sticky note ID

## Variable ID Placeholders
- `{{CLINIC_NAME_VAR_ID}}` - Clinic name variable ID
- `{{PAYMENTS_SHEET_ID_VAR_ID}}` - Payments sheet variable ID
- `{{CLIENTS_SHEET_ID_VAR_ID}}` - Clients sheet variable ID
- `{{APPOINTMENTS_SHEET_ID_VAR_ID}}` - Appointments sheet variable ID
- `{{REPORTS_SHEET_ID_VAR_ID}}` - Reports sheet variable ID
- `{{REPORTS_SHEET_NAME_VAR_ID}}` - Reports sheet name variable ID
- `{{BUSINESS_EMAIL_VAR_ID}}` - Business email variable ID
- `{{BUSINESS_PHONE_NUMBER_VAR_ID}}` - Business phone variable ID
- `{{CLINIC_COLOR_VAR_ID}}` - Clinic color variable ID
- `{{TIMEZONE_VAR_ID}}` - Timezone variable ID

## Workflow Configuration
- `{{REPORT_SCHEDULE_TRIGGER_HOUR}}` - Hour for weekly report trigger (default: 9)
- `{{REPORT_DAY_OF_WEEK}}` - Day of week for report (default: Sunday)

## Data Analysis Configuration
- `{{GROWTH_CALCULATION_PERIOD}}` - Period for growth rate calculations (default: 30 days)
- `{{TOP_SERVICES_LIMIT}}` - Number of top services to show (default: 5)
- `{{TOP_CLIENTS_LIMIT}}` - Number of top paying clients to show (default: 3)

## Report Customization
- `{{REPORT_BRAND_COLORS}}` - Custom brand colors for email report
- `{{EXECUTIVE_EMAIL_LIST}}` - Additional email addresses for report distribution
- `{{REPORT_FOOTER_TEXT}}` - Custom footer text for reports

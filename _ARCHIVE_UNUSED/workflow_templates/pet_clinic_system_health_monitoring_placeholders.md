
# Pet Clinic System Health Monitoring - Placeholder Variables

## Core Identifiers
- `{{WORKFLOW_ID}}` - Unique workflow identifier
- `{{VERSION_ID}}` - Workflow version identifier
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Workflow tag (usually "PET")

## Business Information
- `{{CLINIC_NAME}}` - Full clinic name
- `{{BUSINESS_EMAIL}}` - Primary business email address
- `{{BUSINESS_PHONE_NUMBER}}` - Business phone number
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

## System Monitoring Configuration
- `{{BOOKING_SYSTEM_API_URL}}` - URL for booking system health check
- `{{TWILIO_ACCOUNT_SID}}` - Twilio account SID for SMS service monitoring
- `{{MASTER_APPOINTMENTS_SHEET_ID}}` - Google Sheets ID for data integration monitoring
- `{{SYSTEM_HEALTH_LOG_SHEET_ID}}` - Google Sheets ID for health check logging
- `{{SYSTEM_HEALTH_LOG_SHEET_NAME}}` - Sheet tab name for health logs (e.g., "System Health Log")

## Communication Configuration
- `{{TELEGRAM_CHAT_ID}}` - Telegram chat ID for instant alerts
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth credential ID
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail OAuth2 credential ID
- `{{TWILIO_CREDENTIAL_ID}}` - Twilio API credential ID
- `{{TELEGRAM_CREDENTIAL_ID}}` - Telegram Bot API credential ID

## Node ID Placeholders
- `{{NODE_ID_HOURLY_HEALTH_CHECK}}` - Hourly schedule trigger node ID
- `{{NODE_ID_PING_BOOKING_SYSTEM}}` - Booking system ping node ID
- `{{NODE_ID_PING_TWILIO_API}}` - Twilio API ping node ID
- `{{NODE_ID_PING_GOOGLE_SHEETS_API}}` - Google Sheets API ping node ID
- `{{NODE_ID_ANALYZE_SYSTEM_HEALTH}}` - Health analysis code node ID
- `{{NODE_ID_REQUIRES_ALERT}}` - Alert condition check node ID
- `{{NODE_ID_SEND_SYSTEM_ALERT_EMAIL}}` - Gmail alert email node ID
- `{{NODE_ID_SEND_TELEGRAM_ALERT}}` - Telegram alert node ID
- `{{NODE_ID_LOG_HEALTH_CHECK}}` - Health check logging node ID
- `{{NODE_ID_WORKFLOW_DESCRIPTION}}` - Workflow description sticky note ID

## Variable ID Placeholders
- `{{CLINIC_NAME_VAR_ID}}` - Clinic name variable ID
- `{{BUSINESS_EMAIL_VAR_ID}}` - Business email variable ID
- `{{BUSINESS_PHONE_NUMBER_VAR_ID}}` - Business phone variable ID
- `{{TIMEZONE_VAR_ID}}` - Timezone variable ID
- `{{BOOKING_SYSTEM_API_URL_VAR_ID}}` - Booking system URL variable ID
- `{{TWILIO_ACCOUNT_SID_VAR_ID}}` - Twilio account SID variable ID
- `{{MASTER_APPOINTMENTS_SHEET_ID_VAR_ID}}` - Master appointments sheet variable ID
- `{{SYSTEM_HEALTH_LOG_SHEET_ID_VAR_ID}}` - Health log sheet variable ID
- `{{SYSTEM_HEALTH_LOG_SHEET_NAME_VAR_ID}}` - Health log sheet name variable ID
- `{{TELEGRAM_CHAT_ID_VAR_ID}}` - Telegram chat ID variable ID

## Monitoring Configuration
- `{{HEALTH_CHECK_INTERVAL}}` - Health check frequency (default: hourly)
- `{{TIMEOUT_SECONDS}}` - API timeout in seconds (default: 10)
- `{{ALERT_THRESHOLD_PERCENTAGE}}` - Health percentage threshold for alerts (default: 100)
- `{{CRITICAL_THRESHOLD_PERCENTAGE}}` - Critical alert threshold (default: 67)

## Alert Configuration
- `{{ALERT_EMAIL_RECIPIENTS}}` - Additional email addresses for alerts
- `{{ESCALATION_CONTACT_EMAIL}}` - Emergency escalation email
- `{{ALERT_SUPPRESSION_MINUTES}}` - Minutes to suppress duplicate alerts
- `{{BUSINESS_HOURS_START}}` - Business hours start time for alert scheduling
- `{{BUSINESS_HOURS_END}}` - Business hours end time for alert scheduling

## System URLs and Endpoints
- `{{TWILIO_API_BASE_URL}}` - Twilio API base URL (default: https://api.twilio.com/2010-04-01/)
- `{{GOOGLE_SHEETS_API_BASE_URL}}` - Google Sheets API base URL (default: https://sheets.googleapis.com/v4/)
- `{{HEALTH_CHECK_USER_AGENT}}` - Custom user agent for health checks
- `{{CUSTOM_HEADERS}}` - Custom HTTP headers for API calls

## Logging and Reporting
- `{{LOG_RETENTION_DAYS}}` - Days to retain health check logs
- `{{REPORT_FREQUENCY}}` - Frequency for health summary reports
- `{{HEALTH_DASHBOARD_URL}}` - URL for health status dashboard
- `{{MAINTENANCE_WINDOW_SCHEDULE}}` - Scheduled maintenance windows

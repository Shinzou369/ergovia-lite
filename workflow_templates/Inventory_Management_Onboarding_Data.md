
# Onboarding Data

## Workflow Variables and Credentials

| Placeholder | Description |
|-------------|-------------|
| {{WORKFLOW_ID}} | Unique workflow identifier |
| {{VERSION_ID}} | Workflow version identifier |
| {{INSTANCE_ID}} | N8N instance identifier |
| {{WORKFLOW_TAG}} | Workflow tag (usually "PET") |
| {{CLINIC_NAME}} | Full clinic name |
| {{CLINIC_COLOR}} | Brand color hex code (without #) |
| {{BUSINESS_EMAIL}} | Primary business email address |
| {{BUSINESS_PHONE_NUMBER}} | Business phone number for SMS alerts |
| {{ADMIN_EMAIL}} | Admin/manager email address |
| {{TIMEZONE}} | Clinic timezone (e.g., "America/New_York") |
| {{INVENTORY_CHECK_CRON}} | Cron expression for daily inventory checks |
| {{INVENTORY_MANAGER_EMAIL}} | Email address of inventory manager |
| {{INVENTORY_MANAGER_PHONE}} | Phone number of inventory manager for SMS alerts |
| {{INVENTORY_EMAIL}} | General inventory team contact email |
| {{INVENTORY_SHEET_ID}} | Main inventory tracking Google Sheet ID |
| {{INVENTORY_SHEET_NAME}} | Main inventory sheet tab name |
| {{INVENTORY_LOG_SHEET_ID}} | Inventory activity log Google Sheet ID |
| {{INVENTORY_LOG_SHEET_NAME}} | Inventory log sheet tab name |
| {{INVENTORY_TRANSACTIONS_SHEET_NAME}} | Transaction history sheet tab name |
| {{INVENTORY_UPDATE_WEBHOOK_ID}} | Webhook ID for manual inventory updates |
| {{INVENTORY_UPDATE_WEBHOOK_PATH}} | Webhook path for API calls |
| {{GOOGLE_SHEETS_CREDENTIAL_ID}} | Google Sheets OAuth credential ID |
| {{GMAIL_CREDENTIAL_ID}} | Gmail OAuth2 credential ID for email alerts |
| {{TWILIO_CREDENTIAL_ID}} | Twilio SMS credential ID for urgent alerts |
| {{NODE_ID_DAILY_INVENTORY_CHECK}} | Daily inventory check trigger node ID |
| {{NODE_ID_READ_INVENTORY_HUB}} | Read inventory sheet node ID |
| {{NODE_ID_ANALYZE_STOCK_LEVELS}} | Stock analysis and alert generation node ID |
| {{NODE_ID_SEND_INVENTORY_ALERT_EMAIL}} | Email alert node ID |
| {{NODE_ID_CRITICAL_ITEMS_CHECK}} | Critical items condition node ID |
| {{NODE_ID_SEND_URGENT_SMS_ALERT}} | SMS alert node ID for critical items |
| {{NODE_ID_LOG_ALERT_ACTIVITY}} | Alert activity logging node ID |
| {{NODE_ID_UPDATE_INVENTORY_SHEET}} | Inventory update node ID |
| {{NODE_ID_LOG_INVENTORY_TRANSACTION}} | Transaction logging node ID |
| {{NODE_ID_SEND_SUCCESS_RESPONSE}} | Success response node ID |
| {{NODE_ID_MANUAL_INVENTORY_UPDATE_WEBHOOK}} | Manual update webhook node ID |
| {{NODE_ID_PROCESS_UPDATE_REQUEST}} | Update request processing node ID |
| {{NODE_ID_WORKFLOW_DESCRIPTION_NOTE}} | Workflow description sticky note ID |
| {{CONDITION_ID_CRITICAL_ALERT_CHECK}} | Condition ID for critical alert check |
| {{CLINIC_NAME_VAR_ID}} | Variable ID for clinic name |
| {{INVENTORY_CHECK_CRON_VAR_ID}} | Variable ID for check schedule |
| {{INVENTORY_SHEET_ID_VAR_ID}} | Variable ID for inventory sheet |
| {{INVENTORY_SHEET_NAME_VAR_ID}} | Variable ID for sheet name |
| {{INVENTORY_LOG_SHEET_ID_VAR_ID}} | Variable ID for log sheet |
| {{INVENTORY_LOG_SHEET_NAME_VAR_ID}} | Variable ID for log sheet name |
| {{INVENTORY_TRANSACTIONS_SHEET_NAME_VAR_ID}} | Variable ID for transactions sheet |
| {{INVENTORY_MANAGER_EMAIL_VAR_ID}} | Variable ID for manager email |
| {{INVENTORY_MANAGER_PHONE_VAR_ID}} | Variable ID for manager phone |
| {{BUSINESS_EMAIL_VAR_ID}} | Variable ID for business email |
| {{BUSINESS_PHONE_NUMBER_VAR_ID}} | Variable ID for business phone |
| {{ADMIN_EMAIL_VAR_ID}} | Variable ID for admin email |
| {{CLINIC_COLOR_VAR_ID}} | Variable ID for clinic color |
| {{TIMEZONE_VAR_ID}} | Variable ID for timezone |
| {{INVENTORY_EMAIL_VAR_ID}} | Variable ID for inventory email |
| {{INVENTORY_UPDATE_WEBHOOK_PATH_VAR_ID}} | Variable ID for webhook path |

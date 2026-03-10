
# Pet Clinic Inventory Management - Placeholder Variables

## Core Identifiers
- `{{WORKFLOW_ID}}` - Unique workflow identifier
- `{{VERSION_ID}}` - Workflow version identifier  
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Workflow tag (usually "PET")

## Business Information
- `{{CLINIC_NAME}}` - Full clinic name
- `{{CLINIC_COLOR}}` - Brand color hex code (without #)
- `{{BUSINESS_EMAIL}}` - Primary business email address
- `{{BUSINESS_PHONE_NUMBER}}` - Business phone number for SMS alerts
- `{{ADMIN_EMAIL}}` - Admin/manager email address
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

## Inventory Management Configuration
- `{{INVENTORY_CHECK_CRON}}` - Cron expression for daily inventory checks (e.g., "0 8 * * *")
- `{{INVENTORY_MANAGER_EMAIL}}` - Email address of inventory manager
- `{{INVENTORY_MANAGER_PHONE}}` - Phone number of inventory manager for SMS alerts
- `{{INVENTORY_EMAIL}}` - General inventory team contact email

## Google Sheets Configuration
- `{{INVENTORY_SHEET_ID}}` - Main inventory tracking Google Sheet ID
- `{{INVENTORY_SHEET_NAME}}` - Main inventory sheet tab name (e.g., "Inventory")
- `{{INVENTORY_LOG_SHEET_ID}}` - Inventory activity log Google Sheet ID
- `{{INVENTORY_LOG_SHEET_NAME}}` - Inventory log sheet tab name (e.g., "Alert Log")
- `{{INVENTORY_TRANSACTIONS_SHEET_NAME}}` - Transaction history sheet tab name (e.g., "Transactions")
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth credential ID

## Communication Credentials
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail OAuth2 credential ID for email alerts
- `{{TWILIO_CREDENTIAL_ID}}` - Twilio SMS credential ID for urgent alerts

## Webhook Configuration
- `{{INVENTORY_UPDATE_WEBHOOK_ID}}` - Webhook ID for manual inventory updates
- `{{INVENTORY_UPDATE_WEBHOOK_PATH}}` - Webhook path for API calls (e.g., "/inventory/update")

## Node ID Placeholders
- `{{NODE_ID_DAILY_INVENTORY_CHECK}}` - Daily inventory check trigger node
- `{{NODE_ID_READ_INVENTORY_HUB}}` - Read inventory sheet node
- `{{NODE_ID_ANALYZE_STOCK_LEVELS}}` - Stock analysis and alert generation node
- `{{NODE_ID_SEND_INVENTORY_ALERT_EMAIL}}` - Email alert node
- `{{NODE_ID_CRITICAL_ITEMS_CHECK}}` - Critical items condition node
- `{{NODE_ID_SEND_URGENT_SMS_ALERT}}` - SMS alert node for critical items
- `{{NODE_ID_LOG_ALERT_ACTIVITY}}` - Alert activity logging node
- `{{NODE_ID_UPDATE_INVENTORY_SHEET}}` - Inventory update node
- `{{NODE_ID_LOG_INVENTORY_TRANSACTION}}` - Transaction logging node
- `{{NODE_ID_SEND_SUCCESS_RESPONSE}}` - Success response node
- `{{NODE_ID_MANUAL_INVENTORY_UPDATE_WEBHOOK}}` - Manual update webhook node
- `{{NODE_ID_PROCESS_UPDATE_REQUEST}}` - Update request processing node
- `{{NODE_ID_WORKFLOW_DESCRIPTION_NOTE}}` - Workflow description sticky note

## Variable ID Placeholders
- `{{CLINIC_NAME_VAR_ID}}` - Variable ID for clinic name
- `{{INVENTORY_CHECK_CRON_VAR_ID}}` - Variable ID for check schedule
- `{{INVENTORY_SHEET_ID_VAR_ID}}` - Variable ID for inventory sheet
- `{{INVENTORY_SHEET_NAME_VAR_ID}}` - Variable ID for sheet name
- `{{INVENTORY_LOG_SHEET_ID_VAR_ID}}` - Variable ID for log sheet
- `{{INVENTORY_LOG_SHEET_NAME_VAR_ID}}` - Variable ID for log sheet name
- `{{INVENTORY_TRANSACTIONS_SHEET_NAME_VAR_ID}}` - Variable ID for transactions sheet
- `{{INVENTORY_MANAGER_EMAIL_VAR_ID}}` - Variable ID for manager email
- `{{INVENTORY_MANAGER_PHONE_VAR_ID}}` - Variable ID for manager phone
- `{{BUSINESS_EMAIL_VAR_ID}}` - Variable ID for business email
- `{{BUSINESS_PHONE_NUMBER_VAR_ID}}` - Variable ID for business phone
- `{{ADMIN_EMAIL_VAR_ID}}` - Variable ID for admin email
- `{{CLINIC_COLOR_VAR_ID}}` - Variable ID for clinic color
- `{{TIMEZONE_VAR_ID}}` - Variable ID for timezone
- `{{INVENTORY_EMAIL_VAR_ID}}` - Variable ID for inventory email
- `{{INVENTORY_UPDATE_WEBHOOK_PATH_VAR_ID}}` - Variable ID for webhook path

## Condition ID Placeholders
- `{{CONDITION_ID_CRITICAL_ALERT_CHECK}}` - Condition ID for critical alert check

## Usage Notes
1. **Automated Monitoring**: Daily checks analyze stock levels against reorder points and critical thresholds
2. **Multi-Level Alerts**: System generates different alert types (critical, reorder, expiring)
3. **Email Reports**: Detailed HTML reports with cost estimates and supplier information
4. **SMS Escalation**: Critical stock alerts trigger immediate SMS notifications
5. **Manual Updates**: Webhook API allows real-time inventory updates from external systems
6. **Transaction Logging**: Complete audit trail of all inventory changes
7. **Expiry Management**: Tracks items expiring within 30 days
8. **Cost Calculation**: Provides reorder cost estimates for budget planning
9. **Supplier Integration**: Includes supplier information for quick ordering
10. **Category Management**: Groups items by category for better organization

## Alert Categories
- **CRITICAL**: Items at or below critical level (immediate action required)
- **REORDER**: Items at reorder point (schedule orders within few days)
- **EXPIRING**: Items expiring within 30 days (urgent if ≤7 days)

## Integration Requirements
- Google Sheets for inventory data storage
- Gmail for email notifications
- Twilio for SMS alerts
- Webhook endpoint for manual updates


<old_str>

</old_str>
<new_str># Pet Clinic Data Archival System - Placeholder Variables

## Core Identifiers
- `{{WORKFLOW_ID}}` - Unique workflow identifier
- `{{VERSION_ID}}` - Workflow version identifier  
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Workflow tag (usually "PET")

## Business Information
- `{{CLINIC_NAME}}` - Full clinic name
- `{{BUSINESS_EMAIL}}` - Primary business email address
- `{{ADMIN_EMAIL}}` - Administrator email address for reports
- `{{BUSINESS_PHONE_NUMBER}}` - Business phone number
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

## Data Management Configuration
- `{{DATA_RETENTION_YEARS}}` - Number of years to retain active data (default: 5)
- `{{MASTER_APPOINTMENTS_SHEET_ID}}` - Source appointments Google Sheet ID
- `{{MASTER_SHEET_NAME}}` - Source sheet tab name
- `{{ARCHIVE_SHEET_ID}}` - Archive destination Google Sheet ID
- `{{ARCHIVE_SHEET_NAME}}` - Archive sheet tab name
- `{{DATA_MANAGEMENT_LOG_SHEET_ID}}` - Process logging Google Sheet ID
- `{{DATA_MANAGEMENT_LOG_SHEET_NAME}}` - Process log sheet tab name

## Communication Credentials
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth credential ID in n8n
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail OAuth2 credential ID in n8n

## Node ID Placeholders
- `{{NODE_ID_MONTHLY_ARCHIVE_TRIGGER}}` - Monthly archive trigger node ID
- `{{NODE_ID_GET_ALL_APPOINTMENTS}}` - Get all appointments node ID
- `{{NODE_ID_IDENTIFY_RECORDS_FOR_ARCHIVE}}` - Identify records for archive node ID
- `{{NODE_ID_ARCHIVE_REQUIRED}}` - Archive required condition node ID
- `{{NODE_ID_PREPARE_ARCHIVE_DATA}}` - Prepare archive data node ID
- `{{NODE_ID_MOVE_TO_ARCHIVE_SHEET}}` - Move to archive sheet node ID
- `{{NODE_ID_GENERATE_CLEANUP_SUMMARY}}` - Generate cleanup summary node ID
- `{{NODE_ID_SEND_ADMINISTRATOR_REPORT}}` - Send administrator report node ID
- `{{NODE_ID_LOG_ARCHIVAL_PROCESS}}` - Log archival process node ID
- `{{NODE_ID_WORKFLOW_DESCRIPTION}}` - Workflow description sticky note ID

## Variable ID Placeholders
- `{{CLINIC_NAME_VAR_ID}}` - Clinic name variable ID
- `{{MASTER_APPOINTMENTS_SHEET_ID_VAR_ID}}` - Master appointments sheet variable ID
- `{{MASTER_SHEET_NAME_VAR_ID}}` - Master sheet name variable ID
- `{{TIMEZONE_VAR_ID}}` - Timezone variable ID
- `{{DATA_RETENTION_YEARS_VAR_ID}}` - Data retention years variable ID
- `{{ARCHIVE_SHEET_ID_VAR_ID}}` - Archive sheet variable ID
- `{{ARCHIVE_SHEET_NAME_VAR_ID}}` - Archive sheet name variable ID
- `{{DATA_MANAGEMENT_LOG_SHEET_ID_VAR_ID}}` - Data management log sheet variable ID
- `{{DATA_MANAGEMENT_LOG_SHEET_NAME_VAR_ID}}` - Data management log sheet name variable ID
- `{{BUSINESS_EMAIL_VAR_ID}}` - Business email variable ID
- `{{ADMIN_EMAIL_VAR_ID}}` - Admin email variable ID
- `{{BUSINESS_PHONE_NUMBER_VAR_ID}}` - Business phone number variable ID

## Condition ID Placeholders
- `{{CONDITION_ID_ARCHIVE_REQUIRED}}` - Archive required condition ID

## Workflow Configuration
- `{{ARCHIVE_SCHEDULE_HOUR}}` - Hour for monthly archive trigger (default: 2)
- `{{ARCHIVE_SCHEDULE_DAY}}` - Day of month for archive trigger (default: 1)

## Data Processing Configuration
- `{{ARCHIVE_BATCH_SIZE}}` - Number of records to process per batch
- `{{DATE_FIELD_PRIORITY}}` - Priority order for date field detection
- `{{SAFETY_CHECK_ENABLED}}` - Enable/disable safety validation checks

## Report Customization
- `{{REPORT_TEMPLATE_TYPE}}` - Email report template style
- `{{ADMIN_NOTIFICATION_LEVEL}}` - Level of detail in admin notifications
- `{{ARCHIVE_SUMMARY_FORMAT}}` - Format for archive summary data

## Compliance Settings
- `{{LEGAL_HOLD_ENABLED}}` - Enable legal hold functionality
- `{{AUDIT_TRAIL_LEVEL}}` - Level of audit trail detail
- `{{RETENTION_POLICY_ENFORCEMENT}}` - Enforcement level for retention policy

## Performance Settings
- `{{PROCESSING_TIMEOUT}}` - Maximum processing time per operation
- `{{MEMORY_OPTIMIZATION}}` - Enable memory optimization for large datasets
- `{{ERROR_RETRY_COUNT}}` - Number of retry attempts for failed operations

## Archive Enhancement Settings
- `{{METADATA_ENHANCEMENT}}` - Level of metadata to add to archived records
- `{{ARCHIVE_INDEXING}}` - Enable indexing for archived records
- `{{RECOVERY_POINT_CREATION}}` - Create recovery points during archival

## Integration Features
- **Automated Data Retention**: Monthly processing with configurable retention periods
- **Smart Date Detection**: Handles multiple date field formats and structures
- **Safety Protocols**: Comprehensive validation before any data operations
- **Administrator Reporting**: Detailed Gmail reports with visual breakdowns
- **Process Logging**: Complete audit trail in Google Sheets
- **Archive Enhancement**: Metadata tracking for archived records
</new_str>

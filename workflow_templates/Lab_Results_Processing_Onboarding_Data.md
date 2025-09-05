
# Lab Results Processing - Onboarding Data

## Workflow Variables and Credentials

| Placeholder | Description |
|-------------|-------------|
| {{NODE_ID_LAB_RESULTS_EMAIL_TRIGGER}} | Node ID for Lab Results Email Trigger |
| {{NODE_ID_PARSE_LAB_RESULTS}} | Node ID for Parse Lab Results & Extract Data |
| {{NODE_ID_LOG_LAB_RESULTS}} | Node ID for Log to Lab Results Hub |
| {{NODE_ID_NOTIFY_VETERINARIAN}} | Node ID for Notify Veterinarian |
| {{NODE_ID_NORMAL_RESULTS_CHECK}} | Node ID for Normal Results condition check |
| {{NODE_ID_SEND_NORMAL_SMS}} | Node ID for Send Normal Results SMS |
| {{NODE_ID_URGENT_RESULTS_CHECK}} | Node ID for Urgent Results condition check |
| {{NODE_ID_SEND_URGENT_SMS}} | Node ID for Send Urgent SMS to Vet |
| {{NODE_ID_UPDATE_NOTIFICATION_STATUS}} | Node ID for Update Notification Status |
| {{NODE_ID_WORKFLOW_DESCRIPTION_NOTE}} | Node ID for workflow description sticky note |
| {{CONDITION_ID_RESULT_NORMAL_CHECK}} | Condition ID for normal result status check |
| {{CONDITION_ID_URGENT_CHECK}} | Condition ID for urgent result check |
| {{CLINIC_NAME}} | Name of the veterinary clinic |
| {{LAB_RESULTS_SHEET_ID}} | Google Sheets document ID for lab results tracking |
| {{LAB_RESULTS_SHEET_NAME}} | Sheet name within lab results document |
| {{VET_EMAIL}} | Primary veterinarian email address |
| {{VET_PHONE}} | Primary veterinarian phone number for urgent SMS |
| {{CLIENT_PHONE}} | Client phone number for normal result notifications |
| {{BUSINESS_EMAIL}} | Main clinic business email address |
| {{BUSINESS_PHONE_NUMBER}} | Main clinic phone number |
| {{ADMIN_EMAIL}} | Administrative email for CC notifications |
| {{CLINIC_COLOR}} | Brand color hex code for email styling |
| {{TIMEZONE}} | Timezone for timestamp formatting |
| {{INSTANCE_ID}} | N8N instance identifier |
| {{CLINIC_NAME_VAR_ID}} | Variable ID for clinic name |
| {{LAB_RESULTS_SHEET_ID_VAR_ID}} | Variable ID for lab results sheet ID |
| {{LAB_RESULTS_SHEET_NAME_VAR_ID}} | Variable ID for lab results sheet name |
| {{VET_EMAIL_VAR_ID}} | Variable ID for veterinarian email |
| {{VET_PHONE_VAR_ID}} | Variable ID for veterinarian phone |
| {{CLIENT_PHONE_VAR_ID}} | Variable ID for client phone |
| {{BUSINESS_EMAIL_VAR_ID}} | Variable ID for business email |
| {{BUSINESS_PHONE_NUMBER_VAR_ID}} | Variable ID for business phone number |
| {{ADMIN_EMAIL_VAR_ID}} | Variable ID for admin email |
| {{CLINIC_COLOR_VAR_ID}} | Variable ID for clinic color |
| {{TIMEZONE_VAR_ID}} | Variable ID for timezone |
| {{LAB_EMAIL_CREDENTIAL_ID}} | Credential ID for lab results email (IMAP) |
| {{GOOGLE_SHEETS_CREDENTIAL_ID}} | Credential ID for Google Sheets integration |
| {{GMAIL_CREDENTIAL_ID}} | Credential ID for Gmail/email sending |
| {{TWILIO_CREDENTIAL_ID}} | Credential ID for Twilio SMS service |

## Workflow Features

### Smart Result Processing
- **Email Monitoring**: Continuous IMAP monitoring of lab results inbox
- **Intelligent Parsing**: Multi-pattern recognition for various lab formats
- **Data Extraction**: Automatic extraction of patient details and results
- **Status Classification**: Categorizes as Normal, Attention, or URGENT
- **Multi-Format Support**: Handles different laboratory result formats

### Automated Notifications
- **Veterinarian Alerts**: HTML email reports to veterinarian
- **Urgent SMS**: Critical results trigger immediate SMS to vet
- **Client Communication**: Normal results automatically notify owners
- **Multi-Channel Delivery**: Email + SMS for comprehensive coverage
- **Professional Formatting**: Branded communications with clinic styling

### Comprehensive Tracking
- **Results Database**: Complete logging to Google Sheets
- **Notification Status**: Tracks delivery and timing of notifications
- **Audit Trail**: Full record of processing and communications
- **Status Updates**: Real-time notification delivery tracking

## Usage Notes
1. Configure IMAP email credentials for lab results inbox monitoring
2. Set up Google Sheets document for results tracking and logging
3. Configure veterinarian and client contact information
4. Customize notification templates with clinic branding
5. Test with sample lab results to verify parsing accuracy
6. Monitor notification delivery and adjust settings as needed
7. Review and update parsing patterns for new lab formats
8. Ensure proper timezone configuration for accurate timestamps

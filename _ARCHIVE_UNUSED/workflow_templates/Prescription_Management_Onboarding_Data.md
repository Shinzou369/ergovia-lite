
# Prescription Management - Onboarding Data

## Workflow Variables and Credentials

| Placeholder | Description |
|-------------|-------------|
| {{NODE_ID_NEW_PRESCRIPTION_FORM}} | Node ID for New Prescription Form trigger |
| {{NODE_ID_LOG_PRESCRIPTION_HUB}} | Node ID for Log to Prescription Hub |
| {{NODE_ID_SEND_CONFIRMATION_VET}} | Node ID for Send Confirmation to Vet |
| {{NODE_ID_DAILY_REFILL_CHECK}} | Node ID for Daily Refill Check schedule trigger |
| {{NODE_ID_GET_ALL_PRESCRIPTIONS}} | Node ID for Get All Prescriptions |
| {{NODE_ID_FILTER_REFILL_CANDIDATES}} | Node ID for Filter Refill Candidates |
| {{NODE_ID_SEND_REFILL_REMINDER_SMS}} | Node ID for Send Refill Reminder SMS |
| {{NODE_ID_UPDATE_REMINDER_LOG}} | Node ID for Update Reminder Log |
| {{NODE_ID_WORKFLOW_DESCRIPTION_NOTE}} | Node ID for workflow description sticky note |
| {{CLINIC_NAME}} | Name of the veterinary clinic |
| {{CLINIC_ID}} | Unique clinic identifier for form URLs |
| {{PRESCRIPTION_SHEET_ID}} | Google Sheets document ID for prescription tracking |
| {{PRESCRIPTION_SHEET_NAME}} | Sheet name within prescription document |
| {{VET_EMAIL}} | Primary veterinarian email address |
| {{BUSINESS_EMAIL}} | Main clinic business email address |
| {{BUSINESS_PHONE_NUMBER}} | Main clinic phone number for SMS |
| {{CLINIC_COLOR}} | Brand color hex code for email styling |
| {{TIMEZONE}} | Timezone for timestamp formatting |
| {{INSTANCE_ID}} | N8N instance identifier |
| {{PRESCRIPTION_FORM_WEBHOOK_ID}} | Webhook ID for prescription form |
| {{EMAIL_SEND_WEBHOOK_ID}} | Webhook ID for email sending |
| {{CLINIC_NAME_VAR_ID}} | Variable ID for clinic name |
| {{PRESCRIPTION_SHEET_ID_VAR_ID}} | Variable ID for prescription sheet ID |
| {{PRESCRIPTION_SHEET_NAME_VAR_ID}} | Variable ID for prescription sheet name |
| {{VET_EMAIL_VAR_ID}} | Variable ID for veterinarian email |
| {{BUSINESS_EMAIL_VAR_ID}} | Variable ID for business email |
| {{BUSINESS_PHONE_NUMBER_VAR_ID}} | Variable ID for business phone number |
| {{CLINIC_COLOR_VAR_ID}} | Variable ID for clinic color |
| {{TIMEZONE_VAR_ID}} | Variable ID for timezone |
| {{CLINIC_ID_VAR_ID}} | Variable ID for clinic identifier |
| {{FORM_TRIGGER_CREDENTIAL_ID}} | Credential ID for form trigger authentication |
| {{GOOGLE_SHEETS_CREDENTIAL_ID}} | Credential ID for Google Sheets integration |
| {{SMTP_CREDENTIAL_ID}} | Credential ID for SMTP email sending |
| {{TWILIO_CREDENTIAL_ID}} | Credential ID for Twilio SMS service |

## Workflow Features

### Prescription Entry System
- **Staff Form Interface**: Easy-to-use web form for logging new prescriptions
- **Comprehensive Data Capture**: Patient info, medication details, refill authorization
- **Automatic Calculations**: Auto-calculates next refill due dates based on days supply
- **Real-time Logging**: Instant entry into prescription tracking Google Sheet
- **Vet Notifications**: Automatic confirmation emails to prescribing veterinarian

### Smart Refill Management
- **Daily Monitoring**: Automated daily checks at 10 AM for refill eligibility
- **Intelligent Filtering**: Advanced logic to identify refill candidates
- **Timeline Tracking**: Monitors days supply and refill timing precisely
- **Status Management**: Tracks active vs inactive prescriptions
- **Refill Counting**: Decrements remaining refills automatically

### Automated Client Communication
- **Proactive Reminders**: SMS alerts 5 days before medication runs out
- **Urgent Notifications**: Special handling for same-day medication depletion
- **Personalized Messages**: Custom messages with pet name and medication details
- **Refill Status Updates**: Clear indication of remaining refills available
- **Professional Branding**: Branded messages with clinic contact information

### Comprehensive Tracking
- **Prescription Database**: Complete log of all prescriptions in Google Sheets
- **Contact History**: Tracks all reminder communications with timestamps
- **Reminder Analytics**: Counts and logs all contact attempts
- **Status Updates**: Real-time status tracking and contact notes
- **Audit Trail**: Complete record of prescription lifecycle

## Usage Notes
1. Configure prescription tracking Google Sheet with required column headers
2. Set up form trigger webhook for staff prescription entry
3. Configure SMTP credentials for veterinarian email notifications
4. Set up Twilio credentials for SMS refill reminders to clients
5. Customize daily check time (default 10 AM) for refill monitoring
6. Test prescription entry workflow with sample data
7. Verify refill reminder logic with test prescriptions
8. Monitor reminder delivery and adjust timing as needed
9. Regular review of prescription status and refill patterns
10. Ensure proper timezone configuration for accurate date calculations

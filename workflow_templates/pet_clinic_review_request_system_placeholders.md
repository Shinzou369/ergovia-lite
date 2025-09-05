
# Pet Clinic Review Request System (PET WF7) - Placeholder Documentation

## Overview
This workflow automatically requests reviews from clients 24 hours after their visit to improve online reputation and gather feedback.

## Required Placeholders

### Clinic Information
- `{{CLINIC_NAME}}` - Your veterinary clinic name
- `{{CLINIC_ADDRESS}}` - Full clinic address for email footer
- `{{CLINIC_HOURS}}` - Business hours for client reference
- `{{CLINIC_COLOR}}` - Primary brand color (hex code without #)
- `{{CLINIC_PREFIX}}` - Short clinic identifier (e.g., "VET", "PET")
- `{{HEAD_VETERINARIAN}}` - Primary veterinarian name
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

### Contact Information
- `{{BUSINESS_EMAIL}}` - Main clinic email address
- `{{BUSINESS_PHONE_NUMBER}}` - Main clinic phone number
- `{{BUSINESS_WEBSITE}}` - Clinic website URL

### Review Platform
- `{{GOOGLE_REVIEWS_URL}}` - Direct link to Google Reviews page for the clinic

### Workflow Configuration
- `{{REVIEW_REQUEST_WEBHOOK_PATH}}` - Webhook path for manual triggering
- `{{REVIEW_REQUESTS_SHEET_ID}}` - Google Sheets ID for tracking review requests
- `{{REVIEW_REQUESTS_SHEET_NAME}}` - Sheet name within the spreadsheet

### Integration Credentials
- `{{GMAIL_CREDENTIAL_ID}}` - Gmail OAuth2 credential ID in n8n
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - Google Sheets OAuth2 credential ID
- `{{TWILIO_CREDENTIAL_ID}}` - Twilio SMS credential ID

### Node IDs (Auto-generated)
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Documentation sticky note ID
- `{{VISIT_COMPLETE_TRIGGER_NODE_ID}}` - Execute workflow trigger node ID
- `{{REVIEW_REQUEST_WEBHOOK_NODE_ID}}` - Manual webhook trigger node ID
- `{{WAIT_24_HOURS_NODE_ID}}` - 24-hour wait node ID
- `{{SEND_REVIEW_SMS_NODE_ID}}` - SMS sending node ID
- `{{SEND_REVIEW_EMAIL_NODE_ID}}` - Email sending node ID
- `{{LOG_REVIEW_REQUEST_NODE_ID}}` - Google Sheets logging node ID
- `{{SUCCESS_RESPONSE_NODE_ID}}` - Webhook response node ID

### Webhook IDs (Auto-generated)
- `{{REVIEW_REQUEST_WEBHOOK_ID}}` - Manual trigger webhook ID
- `{{WAIT_24_HOURS_WEBHOOK_ID}}` - Wait node webhook ID

### System Metadata
- `{{WORKFLOW_ID}}` - N8N workflow ID
- `{{VERSION_ID}}` - N8N workflow version ID
- `{{INSTANCE_ID}}` - N8N instance ID
- `{{WORKFLOW_TAG}}` - Workflow tag ("PET" for Pet Clinic workflows)

## Data Flow Requirements

### Input Data Expected
- `clientName` or `Customer Name` - Client's full name
- `clientEmail` or `Customer Email` - Client's email address
- `clientPhone` or `Customer Phone` - Client's phone number
- `petName` or `Pet Name` - Pet's name (optional)
- `petId` - Pet identifier (optional)
- `visitDate` or `Date` - Visit date (optional, defaults to current date)
- `service` or `Service` - Type of service provided (optional)
- `veterinarian` - Attending veterinarian (optional, defaults to HEAD_VETERINARIAN)
- `appointmentId` or `id` - Appointment identifier (optional)

## Workflow Dependencies

### Triggers
- **Primary:** PET WF3 (Visit Completion Orchestrator)
- **Secondary:** Manual webhook endpoint

### Integration Points
- **Google Sheets:** Review request tracking and analytics
- **Gmail:** Professional email communication
- **Twilio:** SMS notifications for immediate outreach
- **Google Reviews:** Direct link for reputation management

## Timing & Flow
1. **Trigger:** Activated 24 hours after visit completion
2. **Multi-Channel:** Simultaneous SMS and email outreach
3. **Logging:** Complete audit trail in Google Sheets
4. **Response:** Confirmation of successful delivery

## Configuration Notes
- **Wait Time:** Set to 24 hours to allow experience processing
- **Message Tone:** Friendly and professional with pet-focused language
- **Review Platform:** Configured for Google Reviews (can be customized)
- **Tracking:** Comprehensive logging for follow-up and analytics

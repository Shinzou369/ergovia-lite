
<old_str># AI Welcome & Triage Bot Template - Placeholder Variables

## Business Information Placeholders
- `{{CLINIC_NAME}}` - Name of the veterinary clinic
- `{{CLINIC_LOCATION}}` - Physical location/address of the clinic
- `{{CLINIC_HOURS}}` - Regular operating hours
- `{{EMERGENCY_HOURS}}` - Emergency or after-hours contact information
- `{{HEAD_VETERINARIAN}}` - Name of the primary veterinarian
- `{{SERVICES_OFFERED}}` - List of services provided by the clinic
- `{{APPOINTMENT_TYPES}}` - Types of appointments available
- `{{BOOKING_SYSTEM_URL}}` - URL for online appointment booking
- `{{BOOKING_PHONE}}` - Phone number for appointment booking
- `{{PRICING_INFO}}` - Pricing information for services
- `{{ON_CALL_STAFF_NAME}}` - Name of on-call staff member
- `{{CONFIDENCE_THRESHOLD}}` - AI confidence threshold percentage for human escalation

## Technical Placeholders
- `{{WORKFLOW_ID}}` - Unique identifier for the workflow
- `{{VERSION_ID}}` - Version identifier for the workflow
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Tag for workflow categorization
- `{{TEMPLATE_CREATED_BY}}` - Creator/author of the template

## Node ID Placeholders
- `{{STICKY_NOTE_NODE_ID}}` - Unique ID for the sticky note node
- `{{EXECUTE_WORKFLOW_TRIGGER_NODE_ID}}` - Unique ID for the workflow trigger node
- `{{OPENAI_NODE_ID}}` - Unique ID for the OpenAI processing node

## Credential Placeholders
- `{{OPENAI_CREDENTIAL_ID}}` - ID for OpenAI API credential configuration

## Usage Notes
1. All business information placeholders should be collected during client onboarding
2. Technical placeholders are auto-generated during workflow deployment
3. Node IDs ensure unique identification within the N8N environment
4. Credential placeholders link to pre-configured API credentials
5. The confidence threshold determines when AI escalates to human staff</old_str>
<new_str># Daily Staff Briefing Template - Placeholder Variables

## Business Information Placeholders
- `{{CLINIC_NAME}}` - Name of the veterinary clinic
- `{{TIMEZONE}}` - Timezone for appointment scheduling (e.g., "America/New_York")
- `{{BRIEFING_TIME}}` - Time when daily briefing is sent (e.g., "8:00 AM")
- `{{BRIEFING_CRON_EXPRESSION}}` - Cron expression for briefing schedule (e.g., "0 8 * * 1-5")

## Integration Placeholders
- `{{GOOGLE_CALENDAR_ID}}` - Google Calendar ID for appointment retrieval
- `{{SLACK_CHANNEL_ID}}` - Slack channel ID for sending briefings
- `{{SLACK_CHANNEL_NAME}}` - Human-readable Slack channel name
- `{{SLACK_WEBHOOK_ID}}` - Webhook ID for Slack integration

## Technical Placeholders
- `{{WORKFLOW_ID}}` - Unique identifier for the workflow
- `{{VERSION_ID}}` - Version identifier for the workflow
- `{{INSTANCE_ID}}` - N8N instance identifier
- `{{WORKFLOW_TAG}}` - Tag for workflow categorization

## Node ID Placeholders
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Unique ID for the workflow description sticky note
- `{{WORKFLOW_TITLE_NOTE_ID}}` - Unique ID for the workflow title sticky note
- `{{GOOGLE_CALENDAR_NODE_ID}}` - Unique ID for the Google Calendar node
- `{{SLACK_SEND_NODE_ID}}` - Unique ID for the Slack sending node
- `{{SCHEDULE_TRIGGER_NODE_ID}}` - Unique ID for the schedule trigger node
- `{{FORMAT_BRIEFING_NODE_ID}}` - Unique ID for the briefing formatting node

## Credential Placeholders
- `{{GOOGLE_CALENDAR_CREDENTIAL_ID}}` - ID for Google Calendar API credential configuration
- `{{SLACK_CREDENTIAL_ID}}` - ID for Slack API credential configuration

## Usage Notes
1. The workflow automatically fetches today's appointments from Google Calendar
2. Briefings are formatted with appointment times, pet information, and owner details
3. The cron expression allows customization of when briefings are sent
4. Appointments are automatically sorted by time for better readability
5. Handles both timed appointments and all-day events
6. Includes helpful reminders for staff preparation
7. Shows encouraging message when no appointments are scheduled</new_str>

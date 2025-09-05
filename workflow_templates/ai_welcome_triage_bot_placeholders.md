
# AI Welcome & Triage Bot Template - Placeholder Variables

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
5. The confidence threshold determines when AI escalates to human staff


# Pet Clinic Staff Onboarding & Social Media Automation (PET WF10) - Placeholders

## Business Configuration
- `{{CLINIC_NAME}}` - Name of the veterinary clinic
- `{{CLINIC_ADDRESS}}` - Full clinic address for communications
- `{{CLINIC_COLOR}}` - Primary brand color (hex code, e.g., #2196F3)
- `{{CLINIC_MISSION_STATEMENT}}` - Clinic's mission statement for employee communications
- `{{CLINIC_SPECIALTIES}}` - List of clinic specialties (e.g., "General Practice, Surgery, Dental Care")
- `{{BRAND_VOICE_TONE}}` - Social media brand voice (e.g., "friendly and professional", "warm and caring")
- `{{TIMEZONE}}` - Clinic timezone (e.g., "America/New_York")

## Contact Information
- `{{BUSINESS_EMAIL}}` - Main clinic email address
- `{{BUSINESS_PHONE_NUMBER}}` - Clinic phone number with formatting
- `{{HEAD_VETERINARIAN}}` - Name of head veterinarian/manager
- `{{MANAGER_EMAIL}}` - Direct manager email address
- `{{MANAGER_PHONE}}` - Manager phone number
- `{{TRAINING_COORDINATOR_EMAIL}}` - Training coordinator email

## Google Sheets Configuration
- `{{STAFF_SHEET_ID}}` - Google Sheets ID for staff tracking
- `{{SOCIAL_MEDIA_SHEET_ID}}` - Google Sheets ID for social media activity logging
- `{{GOOGLE_SHEETS_CREDENTIAL_ID}}` - N8N credential ID for Google Sheets access

## Social Media Configuration
- `{{FACEBOOK_PAGE_ID}}` - Facebook page ID for posting
- `{{FACEBOOK_CREDENTIAL_ID}}` - N8N credential ID for Facebook API
- `{{TWITTER_HANDLE}}` - Twitter/X handle (e.g., @clinicname)
- `{{TWITTER_CREDENTIAL_ID}}` - N8N credential ID for Twitter API

## Email Configuration
- `{{SMTP_CREDENTIAL_ID}}` - N8N credential ID for SMTP email sending

## AI & Training Configuration
- `{{OPENAI_CREDENTIAL_ID}}` - N8N credential ID for OpenAI API
- `{{TRAINING_PORTAL_URL}}` - URL to staff training portal/system

## Node IDs (Auto-generated)
- `{{WORKFLOW_DESCRIPTION_NOTE_ID}}` - Documentation sticky note ID
- `{{STAFF_ONBOARDING_TRIGGER_NODE_ID}}` - Staff onboarding webhook trigger node ID
- `{{LOG_STAFF_NODE_ID}}` - Google Sheets staff logging node ID
- `{{WELCOME_EMAIL_NODE_ID}}` - Welcome email sending node ID
- `{{WAIT_3_DAYS_NODE_ID}}` - 3-day wait node ID
- `{{TRAINING_EMAIL_NODE_ID}}` - Training email sending node ID
- `{{WAIT_7_DAYS_NODE_ID}}` - 7-day wait node ID
- `{{FOLLOWUP_EMAIL_NODE_ID}}` - Follow-up email sending node ID
- `{{SOCIAL_MEDIA_TRIGGER_NODE_ID}}` - Weekly social media trigger node ID
- `{{AI_CONTENT_GENERATION_NODE_ID}}` - OpenAI content generation node ID
- `{{FACEBOOK_POST_NODE_ID}}` - Facebook posting node ID
- `{{TWITTER_POST_NODE_ID}}` - Twitter posting node ID
- `{{LOG_SOCIAL_ACTIVITY_NODE_ID}}` - Social media activity logging node ID

## Webhook IDs (Auto-generated)
- `{{STAFF_ONBOARDING_WEBHOOK_ID}}` - Staff onboarding webhook ID
- `{{WAIT_3_DAYS_WEBHOOK_ID}}` - 3-day wait webhook ID
- `{{WAIT_7_DAYS_WEBHOOK_ID}}` - 7-day wait webhook ID

## System Metadata
- `{{WORKFLOW_ID}}` - N8N workflow ID
- `{{VERSION_ID}}` - N8N workflow version ID
- `{{INSTANCE_ID}}` - N8N instance ID
- `{{WORKFLOW_TAG_ID}}` - Workflow tag ID
- `{{WORKFLOW_TAG}}` - Workflow tag ("PET" for Pet Clinic workflows)

## Data Flow Requirements

### Staff Onboarding Input Data
- `staffName` - New staff member's full name (required)
- `staffEmail` - New staff member's email address (required)
- `department` - Department/role (optional, defaults to "General")
- `startDate` - Start date in YYYY-MM-DD format (optional, defaults to current date)

### Social Media Automation
- Runs every Monday at 9:00 AM
- Generates AI-powered pet care tips
- Posts simultaneously to Facebook and Twitter/X
- Logs all activity to Google Sheets for tracking

## Workflow Dependencies

### Required Integrations
1. **Google Sheets** - Staff tracking and social media logging
2. **Email (SMTP)** - Staff communication system
3. **OpenAI** - AI content generation for social media
4. **Facebook Graph API** - Facebook page posting
5. **Twitter/X API v2** - Tweet publishing

### Required Credentials
- Google Sheets OAuth2 API
- SMTP Email configuration
- OpenAI API key
- Facebook Graph API access token
- Twitter/X OAuth 2.0 credentials

### Staff Onboarding Timeline
- **Day 0**: Welcome email sent immediately
- **Day 3**: Training resources email
- **Day 10**: Follow-up check-in email

### Social Media Schedule
- **Frequency**: Weekly (Mondays)
- **Time**: 9:00 AM clinic timezone
- **Content**: AI-generated pet care tips
- **Platforms**: Facebook + Twitter/X simultaneous posting

## Customization Options
- Adjust onboarding timeline by modifying wait node durations
- Modify social media posting frequency via cron expression
- Customize AI prompt for different content themes
- Add additional social platforms as needed
- Extend staff onboarding with additional check-in points

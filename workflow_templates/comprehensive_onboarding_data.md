
# Comprehensive ETF Onboarding Data Guide

This document consolidates all variables, credentials, and configuration data required across all Pet Clinic workflow templates. Use this as the master reference for what information to collect during client onboarding.

## 🏥 Core Business Information

### Basic Business Details
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| **Business Name** | text | ✅ | Legal business name | "Happy Paws Veterinary Clinic" |
| **Clinic Display Name** | text | ✅ | Name shown in communications | "Happy Paws Clinic" |
| **Business Email** | email | ✅ | Primary business contact email | "contact@happypaws.com" |
| **Business Phone** | tel | ✅ | Main business phone number | "+1 (555) 123-4567" |
| **Business Address** | text | ✅ | Physical clinic address | "123 Pet Street, Animal City, AC 12345" |
| **Website URL** | url | ❌ | Business website | "https://happypaws.com" |
| **Business Category** | select | ❌ | Type of pet care business | veterinary, animal-hospital, pet-grooming, etc. |

### Operational Information
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| **Clinic Hours** | text | ✅ | Operating hours | "Mon-Fri: 8AM-6PM, Sat: 9AM-3PM" |
| **Emergency Contact** | tel | ✅ | Emergency phone number | "+1 (555) 987-6543" |
| **Timezone** | select | ✅ | Business timezone | "America/New_York" |
| **Services Offered** | textarea | ✅ | List of clinic services | "Vaccinations, Surgery, Dental Care, Emergency Services, Grooming" |
| **Cancellation Policy** | select | ✅ | Appointment cancellation policy | "24-hour", "48-hour", "72-hour", etc. |
| **Cancellation Fee** | select | ❌ | Fee for late cancellations | "$25", "$50", "full-charge", etc. |
| **No-Show Policy** | select | ❌ | Policy for missed appointments | "warning", "immediate-charge", etc. |

### Staff Information
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| **Primary Veterinarian** | text | ✅ | Head veterinarian name | "Dr. Sarah Johnson" |
| **All Veterinarians** | textarea | ✅ | All vets (one per line) | "Dr. Sarah Johnson\nDr. Michael Chen" |
| **Manager Name** | text | ❌ | Practice manager/owner | "John Smith" |
| **Support Email** | email | ✅ | Customer support email | "support@happypaws.com" |
| **Admin Email** | email | ✅ | Administrator email | "admin@happypaws.com" |
| **Veterinarian License** | text | ❌ | License number | "VET123456" |

### Contact Information
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| **From Email** | email | ✅ | Email sender address | "noreply@happypaws.com" |
| **From Name** | text | ✅ | Email sender display name | "Happy Paws Clinic" |
| **Billing Email** | email | ❌ | Billing contact email | "billing@happypaws.com" |
| **Emergency Hours** | text | ❌ | Emergency service hours | "24/7 Emergency Line Available" |

## 🔑 API Credentials & Authentication

### Core AI Services
| Credential | Type | Required | Description | Setup Guide |
|------------|------|----------|-------------|-------------|
| **OpenAI API Key** | password | ✅ | AI processing (auto-generated or manual) | Generate via ETF system or platform.openai.com |
| **DeepSeek API Key** | password | ❌ | Alternative AI model | deepseek.com |

### Communication Services
| Credential | Type | Required | Description | Setup Guide |
|------------|------|----------|-------------|-------------|
| **Telegram Bot Token** | password | ✅ | Bot automation | @BotFather on Telegram |
| **Telegram Chat ID** | text | ✅ | Message destination | Get from bot updates |
| **Twilio Account SID** | password | ✅ | SMS service ID | twilio.com console |
| **Twilio Auth Token** | password | ✅ | SMS authentication | twilio.com console |
| **Twilio Phone Number** | tel | ✅ | SMS sender number | "+15551234567" |

### Email Services
| Credential | Type | Required | Description | Setup Guide |
|------------|------|----------|-------------|-------------|
| **Gmail OAuth** | oauth | ✅ | Email automation via Google | Connect Google Account |
| **SendGrid API Key** | password | ❌ | Alternative email service | sendgrid.com (deprecated) |

### Google Services Integration
| Credential | Type | Required | Description | Setup Guide |
|------------|------|----------|-------------|-------------|
| **Google OAuth** | oauth | ✅ | Sheets, Calendar, Gmail access | Connect Google Account (auto-creates sheets) |

### Optional Integrations
| Credential | Type | Required | Description | Setup Guide |
|------------|------|----------|-------------|-------------|
| **Calendly API Token** | password | ❌ | Appointment booking | calendly.com/integrations |
| **Facebook Access Token** | password | ❌ | Social media automation | Facebook Developer Console |
| **Twitter/X API Key** | password | ❌ | Social media posting | Twitter Developer Portal |
| **Slack Bot Token** | password | ❌ | Team notifications | Slack App Directory |
| **Stripe Secret Key** | password | ❌ | Payment processing | stripe.com |
| **Stripe Publishable Key** | text | ❌ | Payment forms | stripe.com |

## 📊 Google Sheets Configuration (Auto-Generated)

### Automated Sheet Creation
When Google OAuth is connected, the system automatically creates these sheets:

| Sheet Purpose | Sheet Name Pattern | Description |
|---------------|-------------------|-------------|
| **Master Appointments** | `{BusinessName} - Appointments Hub` | Central appointment tracking |
| **Medical Records** | `{BusinessName} - Medical Records` | Pet health records |
| **Inventory Management** | `{BusinessName} - Inventory Hub` | Stock tracking and alerts |
| **Staff Database** | `{BusinessName} - Staff Hub` | Employee information |
| **Prescription Tracking** | `{BusinessName} - Prescription Hub` | Medication management |
| **Lab Results** | `{BusinessName} - Lab Results` | Test results processing |
| **Archive Storage** | `{BusinessName} - Archive` | Historical data |
| **Social Media Log** | `{BusinessName} - Social Media` | Marketing tracking |
| **Data Management Log** | `{BusinessName} - Data Log` | System activity logging |
| **Future Follow-ups** | `{BusinessName} - Follow-ups` | Scheduled follow-up actions |

## ⚙️ System Configuration

### Operational Settings
| Setting | Type | Required | Default | Description |
|---------|------|----------|---------|-------------|
| **Data Retention Years** | select | ❌ | 5 | How long to keep archived data |
| **Reminder Check Interval** | select | ❌ | 2 | Hours between reminder checks |
| **Backup Frequency** | select | ❌ | daily | How often to backup data |
| **API Rate Limit** | number | ❌ | 1000 | Max API calls per hour |
| **Business Color** | color | ❌ | #4CAF50 | Brand color for communications |

### Advanced Settings
| Setting | Type | Required | Description |
|---------|------|----------|-------------|
| **Webhook Secret** | password | ❌ | Auto-generated if empty |
| **AI Confidence Threshold** | number | ❌ | When to escalate to humans (95) |

### Social Media Configuration (Optional)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **Facebook Page ID** | text | ❌ | For automated posting |
| **WhatsApp Phone ID** | text | ❌ | WhatsApp Business number |

## 🔄 Workflow-Specific Variables

### Appointment Management
- Booking URL (optional)
- Appointment types (text area)
- Pricing information (text area)

### Inventory Management  
- Inventory manager email
- Inventory manager phone
- Critical stock threshold levels

### Medical Records
- Lab email credentials (IMAP)
- Veterinarian notification preferences

### Review System
- Review request timing
- Review platform preferences

### Staff Management
- Staff Slack channel ID
- Onboarding workflow preferences

## 📋 Onboarding Form Structure

### Page 1: Business Information
- All core business details
- Contact information
- Operational settings

### Page 2: Staff & Services
- Veterinarian information
- Services offered
- Operational policies

### Page 3: API Credentials
- Core credentials (Telegram, Twilio, OpenAI)
- Google OAuth connection
- Optional integrations

### Page 4: Configuration
- System settings
- Preferences and thresholds
- Advanced options

### Page 5: Review & Deploy
- Summary of all settings
- Credential validation
- Final deployment

## 🔒 Security Notes

1. **All credentials are encrypted** before storage
2. **OAuth tokens are refreshed** automatically
3. **API keys are validated** before deployment
4. **Webhook secrets are auto-generated** if not provided
5. **Rate limiting is enforced** to prevent abuse

## ✅ Validation Requirements

### Required for Deployment
- Business name, email, phone
- At least one veterinarian
- Telegram bot credentials
- Twilio SMS credentials  
- Google OAuth connection
- Timezone selection

### Optional but Recommended
- OpenAI API key (can be auto-generated)
- Calendly integration
- Social media credentials
- Payment processing

## 📝 Implementation Notes

1. **Auto-generate Google Sheets** upon OAuth connection
2. **Validate credentials** before saving
3. **Test integrations** during onboarding
4. **Provide setup guides** for each service
5. **Enable progressive disclosure** for advanced options
6. **Store all data encrypted** in client database
7. **Generate unique workflow IDs** for each client
8. **Create placeholder mapping** for template deployment

This comprehensive guide ensures all Pet Clinic ETF workflows have the necessary data and credentials for successful deployment and operation.

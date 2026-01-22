# Overview

Prismity AI (TaskAI) is an AI-powered productivity assistant designed for marketing and automation. It offers a conversational AI interface, specialized workflow templates (Taskforce), and client onboarding systems. The platform integrates with n8n for automation, supports multiple AI models with intelligent routing, and features secure local email/password authentication. A key capability is its ETF (Exchange Traded Fund) system for automated workflow deployment to client-specific VPS instances. The system aims to provide a client-friendly control panel, abstracting technical complexities and enabling efficient management of business operations.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Technology**: Static HTML/CSS/JavaScript with vanilla JavaScript.
- **Responsiveness**: Mobile-first approach using CSS Grid and Flexbox.
- **UI/UX**: Animate.css for transitions, Lucide icons, and dark/light mode support via CSS custom properties.
- **Control Panel**: Client-friendly interface (`/public/control-panel/`) for managing tasks, settings, and properties, featuring a simplified 3-step onboarding process.

## Backend Architecture
- **Core Framework**: Node.js/Express.js for RESTful APIs.
- **Dual Backend System**:
    - Main server (port 5000): Handles original TaskAI/Chat functionality.
    - Provisioning backend (`/backend/src`): Manages client onboarding, control panel APIs, and infrastructure provisioning.
- **Authentication**: Local email/password authentication with bcrypt for the main app (session cookies) and JWT with httpOnly cookies for the Control Panel (7-day expiry).
- **AI Integration**: OpenAI and DeepSeek APIs with intelligent model routing based on prompt complexity and custom token usage tracking.
- **Provisioning Orchestration**: Automated client onboarding workflow including Hetzner VPS creation, Docker/PostgreSQL/n8n/NocoDB/Authelia installation, database provisioning, and deployment of 24 automation workflows.
- **Security**: AES-256-GCM encryption for credentials, httpOnly cookies, secret scrubbing in logs, rate limiting, and input validation.
- **API Bank System**: Centralized system for developers to pre-load and assign API keys (OpenAI, Twilio, WhatsApp) to clients.
- **Support Ticket System**: API endpoints for clients to submit support requests and for developers to manage them.

## Data Storage Solutions
- **SQLite**: Primary database for user accounts, ETF client data, chat history, and token usage tracking.
- **PostgreSQL**: Each client deployment includes a dedicated PostgreSQL database with 26 tables for property management, bookings, tasks, and operational data.
- **NocoDB**: Integrated with client PostgreSQL databases to provide an Airtable-like UI for data viewing and editing without exposing n8n.
- **JSON Files**: Used for storing chat threads and configuration data.
- **FileStore**: For express-session persistence.

## Authentication and Authorization
- **Local Auth**: Exclusive email/password authentication using bcrypt hashing (12 rounds) and secure, server-side session management with httpOnly cookies.
- **User Management**: SQLite `users` table stores user credentials (UUID, email, password_hash, name, role).
- **Role-Based Access**: Supports `affiliate` and `client` roles with distinct access paths and UI experiences.
- **Premium Features**: Role-based access control enables premium features and unlimited token usage for specific user types.

## AI and Model Management
- **Multi-Model Support**: Integration with GPT-4 Turbo, GPT-4, GPT-3.5 Turbo (OpenAI) and DeepSeek Chat.
- **Intelligent Routing**: Automatically selects the appropriate AI model based on prompt characteristics.
- **Token Tracking**: Real-time monitoring and daily limits for token usage.
- **Conversation Threading**: Maintains persistent, ChatGPT-style conversation histories.

## Workflow and Automation Integration
- **n8n Integration**: Extensive API integration for managing and deploying n8n workflows.
- **ETF System**: Automates the deployment of templated workflows to new client environments.
- **Credential Management**: Securely handles API keys and credentials required for n8n workflows.
- **Template Sanitization**: Processes workflows into reusable templates with dynamic placeholder replacement.

# External Dependencies

## AI Services
- **OpenAI API**: For GPT models (GPT-4 Turbo, GPT-4, GPT-3.5 Turbo).
- **DeepSeek API**: For alternative AI model capabilities.

## Automation Platform
- **n8n**: Self-hosted automation platform for workflow execution and management.

## Communication Services
- **Nodemailer**: For sending emails.
- **Twilio**: Configured for SMS and voice communication.
- **SendGrid**: For transactional email delivery.

## Infrastructure & Databases
- **Hetzner Cloud API**: For programmatic provisioning of VPS instances.
- **PostgreSQL**: Relational database deployed per client for application data.
- **SQLite3**: Embedded database for core application data and user management.
- **NocoDB**: Open-source Airtable alternative for client data management.

## Development & Utility Libraries
- **Axios**: HTTP client for API requests.
- **Bcrypt**: For password hashing.
- **Node Cron**: For scheduled tasks.
- **Marked**: Markdown parser.
- **Highlight.js**: Code syntax highlighting.
- **DOMPurify**: HTML sanitizer.
- **Lucide**: Icon library.
- **Animate.css**: CSS animation library.
- **Express Session**: For session management.

# Recent Changes

## January 2026 - Workflow Analysis & Patch Development

### Deliverables Created:
1. **WORKFLOW_ANALYSIS_REPORT.md** - Comprehensive analysis of 24 property management workflows
   - Categorization by trigger type (webhook, scheduled, event-based)
   - Variable requirements per workflow
   - Critical and moderate issues identified
   - Database schema requirements
   - Workflow dependency map

2. **deployments/HETZNER_TEST_ENVIRONMENT_SETUP.md** - Complete test environment guide
   - Docker Compose configuration for n8n + PostgreSQL
   - Full database schema with 26 tables
   - SSL/domain configuration
   - Backup and monitoring scripts
   - Multi-client architecture notes (1 Client = 1 Server)

3. **workflows/Workflow_24_Watchdog_Error_Monitor.json** - New error monitoring workflow
   - Runs every 15 minutes
   - Monitors workflow_errors table
   - Checks for stuck processing items
   - Detects stale calendar syncs
   - Alerts via Telegram/WhatsApp with proper alert_sent tracking
   - Auto-resolves errors older than 7 days

4. **Patch Files** (in `/patches/` directory):
   - **ISSUE_02_Discount_Validation_Patch.md** - Prevents discount stacking in negotiations
   - **ISSUE_07_Vendor_Fallback_Patch.md** - Handles vendor unavailability gracefully
   - **ISSUE_08_Context_Window_Patch.md** - Sliding window for long AI conversations
   - **PHASE_3_Future_Patches.md** - Reference for Issues 1, 3, 4 (medium-risk)

### Implementation Phases:
- **Phase 1 (Complete):** Test environment setup + Watchdog workflow
- **Phase 2 (Complete):** Low-risk patches (Issues 2, 7, 8)
- **Phase 3 (Documented):** Medium-risk patches for future if needed (Issues 1, 3, 4)

### Key Decisions:
- Multi-tenant architecture: Supports both 1 server per client OR shared n8n with multi-user accounts
- n8n self-hosted for unlimited free executions
- PostgreSQL as shared state between workflows
- Telegram/WhatsApp as primary owner communication channels

### Workflow Organization:
- All 25 workflows tagged by trigger type for easy filtering:
  - `trigger:webhook` (16 workflows) - Response-based
  - `trigger:scheduled` (6 workflows) - Time-based/cron
  - `trigger:event` (3 workflows) - Internal system events
- All production workflows in `workflows_postgresql/` folder

### Testing Resources:
- **CLIENT_GETTING_STARTED_GUIDE.md** - Client-facing onboarding guide (from login to going live)
- **RENDER_MULTIUSER_TESTING_HANDOUT.md** - Developer testing guide for Render-hosted n8n

## January 22, 2026 - Control Panel UI Redesign & Workflow Deployment

### Dashboard Improvements:
1. **GHL-Style UI Redesign** - Professional sidebar navigation layout
   - Collapsible sidebar with icon/text navigation
   - Stat widgets with trend indicators and sparklines
   - Quick actions grid for common tasks
   - Activity feed with real-time updates
   - Dark/light theme toggle support

2. **Interactive Tutorial System** - 5-step walkthrough for new users
   - Covers stats overview, quick actions, activity feed, navigation, and help
   - Spotlight highlighting with step-by-step guidance
   - Skip option and progress indicator

3. **Modal Readability Fixes** - Improved contrast and colors for dark mode

### Onboarding & Workflow Deployment:
1. **Automatic Workflow Deployment** - Core workflows deploy on onboarding completion
   - Uses per-client DB credentials from client_servers table (multi-tenant safe)
   - Name-based workflow matching (Workflow_00_, Workflow_01_, etc.)
   - Idempotency checks prevent duplicate deployments
   - 1-based workflow numbering consistent with other APIs

2. **Error Handling** - Clear user feedback for deployment status
   - Success, warning, skipped, and retry states
   - Credentials section saved during onboarding

### Test Credentials:
- **Test client**: testclient@example.com / TestClient123!
- **Property**: Beach House Miami (client_1769061392149_x10bk6up2)
- **OpenAI API key**: Added to api_key_bank (ID: 2)
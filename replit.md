# Overview

Prismity AI (TaskAI) is an AI-powered productivity assistant focused on marketing and automation tasks. The application provides a ChatGPT-like interface for conversational AI interactions, along with specialized features including workflow templates (Taskforce), client onboarding systems, and integration with n8n automation platform. The system supports multiple AI models with intelligent routing, secure local email/password authentication with bcrypt, and includes an ETF (Exchange Traded Fund) system for automated workflow deployment to clients.

# Recent Changes (January 2026)

## Backend Architecture Refactoring (January 19, 2026)
- **Proper Backend Service**: Replaced n8n-based onboarding workflows with production-grade Express.js backend
- **New Backend Location**: `/backend/src/` with organized structure (routes, services, middleware, models)
- **Provisioning Orchestrator**: Complete client onboarding flow:
  1. Create Hetzner VPS server via API
  2. Wait for server ready, establish SSH connection
  3. Install Docker, PostgreSQL, n8n, NocoDB, Authelia
  4. Create client database and apply schema
  5. Deploy 24 automation workflows to n8n
  6. Track progress in PostgreSQL with real-time updates
- **Control Panel API**: Express routes replacing n8n BACKEND_01-04 webhooks
  - `/api/backend/auth/*` - Client authentication with httpOnly cookies
  - `/api/backend/onboarding/*` - Start provisioning, track status
  - `/api/backend/control-panel/*` - Dashboard, settings, properties, tasks
  - `/api/backend/health` - Health check endpoint
- **Security Improvements**:
  - AES-256-GCM encryption for stored credentials (CREDENTIAL_ENCRYPTION_KEY)
  - httpOnly cookies for JWT tokens (no localStorage exposure)
  - Secret scrubbing in all logs (passwords, tokens redacted)
  - Rate limiting on authentication endpoints
  - Input validation and sanitization middleware
- **Control Panel Frontend**: New pages at `/public/control-panel/`
  - login.html - Cookie-based authentication
  - dashboard.html - Tasks, stats, bookings overview
  - settings.html - Client configuration with progress tracking
  - properties.html - Property CRUD operations
- **Backend Database Schema**: `/backend/src/models/schema.sql` with tables:
  - clients, client_servers, provisioning_jobs
  - client_settings, client_credentials, deployed_workflows
  - audit_log

## PostgreSQL Migration - Removing Google Dependencies (January 19, 2026)
- **Complete Google Sheets Removal**: Migrated all 24 automation workflows from Google Sheets to PostgreSQL
- **Database Schema**: Created comprehensive PostgreSQL schema with 21 tables (see `/database/schema.sql`)
- **New Folder Structure**: All PostgreSQL workflows stored in `/workflows_postgresql/`
- **Updated Onboarding Workflows**: 
  - `MASTER_COORDINATOR_PostgreSQL.json` - Updated orchestrator (no Google OAuth required)
  - `SUB2_Server_Setup_PostgreSQL.json` - Now installs PostgreSQL alongside Docker, n8n, Authelia
  - `SUB3_Database_Provisioner.json` - New workflow that creates database, applies schema, deploys NocoDB
- **NocoDB Integration**: Clients get Airtable-like UI to view/edit data without seeing n8n
- **Architecture per Client**: Hetzner VPS (~€5-10/month) with n8n + PostgreSQL + NocoDB + Authelia
- **Remaining Google Dependencies**: 3 workflows still use Google Calendar (can be replaced with iCal feeds)

### PostgreSQL Tables Created (21 total)
Core: `property_configurations`, `bookings`, `deals`, `contacts`
Tasks: `manual_tasks`, `control_panel_tasks`, `cleaning_tasks`, `maintenance_tickets`
Operations: `cleaners`, `vendors`, `inventory`, `suppliers`, `scheduled_messages`
Analytics: `calendar_sync_log`, `deal_conflicts`, `incidents`, `guest_blacklist`, `guest_screening_log`, `reviews`, `pricing_history`, `pricing_recommendations`, `inquiries`, `workflow_config`

## POC Control Panel for N8N Workflow Deployment
- **POC Control Panel Page**: New `/poc-control-panel.html` page for Demo Veterinary Service
- **10-Section Setup Wizard**: Complete configuration wizard with sections for:
  1. Account Information (owner details, contact platform)
  2. Business Information (name, address, hours, contact details)
  3. API Keys & Credentials (Google Sheets IDs, Telegram, WhatsApp, Twilio, OpenAI)
  4. Team Contacts (manager, cleaning, maintenance, booking contacts)
  5. Services & Pricing (fees, platforms, URLs)
  6. AI Personality (style, speed, language, auto-approve settings)
  7. WhatsApp Templates (confirmation, emergency, notification templates)
  8. Automation Preferences (daily check-in, maintenance times, thresholds)
  9. Emergency Contacts (emergency staff, local services, hospitals)
  10. AI Special Instructions (5000-character LLM instructions)
- **Pre-filled Sample Values**: All fields pre-filled with Demo Veterinary Service sample data
- **90+ Placeholder Mapping**: All workflow placeholders mapped to form fields
- **24 Workflow Templates**: Extracted and configured 24 n8n workflow templates
- **Workflow Deployment API**: New endpoints `/api/poc/deploy-single` and `/api/poc/deploy-all` for deploying workflows
- **N8N Tagging System**: Workflows are tagged with business name (e.g., "Demo_Veterinary_Service") for organization
- **Streaming Deployment**: Deploy-all endpoint supports streaming progress updates
- **Progress Tracking**: Section completion tracking with progress bar
- **Connection Testing**: Test N8N connection via `/api/poc/n8n/test`

# Recent Changes (October 2025)

## Complete Local Authentication Migration
- **Pure Local Authentication System**: Completely removed all third-party authentication providers (Google OAuth and Stytch)
- **Simplified Codebase**: Removed Passport.js, cookie-parser, Stytch SDK, and all OAuth-related middleware and routes
- **Clean Session Management**: Streamlined session middleware to only handle local email/password authentication
- **Secure Password Storage**: bcrypt password hashing (12 salt rounds) with SQLite users table
- **Session-Based Auth**: Server-side session management with httpOnly cookies and 7-day expiration
- **Clean Frontend**: Updated UI to remove all third-party login buttons and OAuth references
- **Removed Files**: Deleted routes/authRoutes.js, public/stytch-logged-in.html, and all Stytch-related endpoints
- **Affiliate & Client Roles**: Added role-based system supporting both affiliate partners and clients with local authentication
- **Role Column Migration**: Successfully added role column to users table with 'client' as default

## Role-Based UX Improvements (October 15, 2025)
- **Visual Distinction**: Affiliate and client sections on home page have distinct styling (45%/55% split with different color schemes)
- **Auto-Redirect**: Logged-in users automatically redirected to their role-specific page (affiliate→/chat, client→/taskforce)
- **Logout Functionality**: Added logout buttons to both chat and taskforce pages with proper session destruction
- **Dual-Role Prevention**: Same email cannot be used for both affiliate and client accounts with specific error message
- **Token Usage Database**: Created token_usage table in SQLite for persistent token tracking per user (replacing JSON files)

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Static HTML/CSS/JavaScript**: Traditional multi-page application using vanilla JavaScript
- **Responsive Design**: Mobile-first approach with CSS Grid and Flexbox
- **Animation Framework**: Animate.css for UI transitions and loading states
- **Icon System**: Lucide icons for consistent iconography
- **Theme System**: Dark/light mode support with CSS custom properties

## Backend Architecture
- **Node.js/Express Server**: RESTful API with Express.js framework
- **Dual Backend System**:
  - Main server (server.js on port 5000): Original TaskAI/Chat functionality
  - Provisioning backend (/backend/src): Client onboarding and control panel
- **Session Management**: File-based sessions using express-session with FileStore
- **Authentication**: 
  - Main app: Local email/password with bcrypt and session cookies
  - Control Panel: JWT with httpOnly cookies (7-day expiry)
- **AI Integration**: OpenAI API integration with intelligent model routing based on prompt complexity
- **Token Management**: Custom token counting and usage tracking system per user
- **Provisioning Services**: Hetzner API client, SSH runner, stack installer, workflow deployer

## Data Storage Solutions
- **SQLite Database**: Local file-based database for user accounts, ETF client data, history, and token usage
- **Users Table**: Stores user credentials with id (UUID), email (unique), password_hash (bcrypt), name, role (affiliate/client), and timestamps
- **Token Usage Table**: Persistent storage for token tracking per user with limits, usage counts, and reset dates
- **JSON File Storage**: Chat threads and configuration data stored in JSON files
- **Session Storage**: File-based session persistence for user authentication state with FileStore
- **PostgreSQL (Client Deployments)**: Each client gets dedicated PostgreSQL database with 21 tables for property management data
- **NocoDB (Client Deployments)**: Airtable-like interface for clients to view/edit their data

## Authentication and Authorization
- **Local Email/Password Auth**: Exclusive authentication method using bcrypt password hashing (12 rounds) with secure session management
- **Users Database**: SQLite table storing user accounts with UUID IDs, unique email constraints, hashed passwords, and role (affiliate/client)
- **Session-Based Auth**: Server-side session management with httpOnly cookies and 7-day expiration
- **Route Protection**: Middleware checks for req.session.user to secure protected endpoints
- **Role-Based Access**: Users can be affiliates (accessing /chat) or clients (accessing /taskforce)
- **Role Selection**: Support for URL parameter-based role selection during signup and dedicated role selection page
- **Premium User System**: Role-based access control with premium features and unlimited token usage
- **No Third-Party Auth**: Completely self-contained authentication system without Google OAuth or Stytch

## AI and Model Management
- **Multi-Model Support**: GPT-4 Turbo, GPT-4, GPT-3.5 Turbo, and DeepSeek Chat
- **Intelligent Model Routing**: Automatic model selection based on prompt keywords and complexity
- **Token Tracking**: Real-time token usage monitoring with daily limits for free users
- **Conversation Threading**: ChatGPT-style conversation management with persistent threads

## Workflow and Automation Integration
- **n8n Integration**: Full API integration for workflow creation, duplication, and management
- **ETF System**: Automated client onboarding with workflow template deployment
- **Credential Management**: Secure handling of API keys and OAuth credentials for workflow automation
- **Template Sanitization**: Automated conversion of workflows into reusable templates with placeholder replacement

# External Dependencies

## AI Services
- **OpenAI API**: Primary AI service for GPT models (GPT-4 Turbo, GPT-4, GPT-3.5 Turbo)
- **DeepSeek API**: Alternative AI model for creative and innovative responses

## Authentication Services
- **None**: Fully self-contained local authentication system (no external auth providers)

## Automation Platform
- **n8n**: Self-hosted automation platform for workflow creation and management
- **n8n API**: RESTful API for programmatic workflow operations and credential management

## Communication Services
- **Nodemailer**: Email service integration for notifications and communications
- **Twilio**: SMS and voice communication services (configured but not actively used)
- **SendGrid**: Email delivery service for transactional emails

## Development and Deployment
- **SQLite3**: Embedded database for user accounts and local data storage
- **Express Session**: Server-side session management with FileStore
- **Bcrypt**: Password hashing and verification for secure authentication
- **Axios**: HTTP client for external API communications
- **Node Cron**: Scheduled task execution for maintenance and cleanup operations

## Frontend Libraries
- **Marked**: Markdown parsing for AI response formatting
- **Highlight.js**: Syntax highlighting for code blocks in AI responses
- **DOMPurify**: XSS protection for user-generated content
- **Lucide**: Icon library for consistent UI iconography
- **Animate.css**: CSS animation library for UI transitions

## Utilities and Security
- **UUID**: Unique identifier generation for sessions and threads
- **Crypto**: Built-in Node.js cryptographic functionality
- **CORS**: Cross-origin resource sharing configuration
- **Body Parser**: Request body parsing middleware
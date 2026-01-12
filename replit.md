# Overview

Prismity AI (TaskAI) is an AI-powered productivity assistant focused on marketing and automation tasks. The application provides a ChatGPT-like interface for conversational AI interactions, along with specialized features including workflow templates (Taskforce), client onboarding systems, and integration with n8n automation platform. The system supports multiple AI models with intelligent routing, secure local email/password authentication with bcrypt, and includes an ETF (Exchange Traded Fund) system for automated workflow deployment to clients.

# Recent Changes (January 2026)

## POC Control Panel for N8N Workflow Deployment
- **POC Control Panel Page**: New `/poc-control-panel.html` page for Demo Veterinary Service
- **24 Workflow Templates**: Extracted and configured 24 n8n workflow templates
- **Workflow Deployment API**: New endpoints `/api/poc/deploy-single` and `/api/poc/deploy-all` for deploying workflows
- **N8N Tagging System**: Workflows are tagged with business name (e.g., "Demo_Veterinary_Service") for organization
- **Sample Placeholder Values**: All placeholders use clearly marked SAMPLE values (e.g., `SAMPLE_SHEET_ID_1234567890`)
- **Streaming Deployment**: Deploy-all endpoint supports streaming progress updates
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
- **Session Management**: File-based sessions using express-session with FileStore
- **Authentication**: Local email/password authentication with bcrypt password hashing (no third-party providers)
- **AI Integration**: OpenAI API integration with intelligent model routing based on prompt complexity
- **Token Management**: Custom token counting and usage tracking system per user

## Data Storage Solutions
- **SQLite Database**: Local file-based database for user accounts, ETF client data, history, and token usage
- **Users Table**: Stores user credentials with id (UUID), email (unique), password_hash (bcrypt), name, role (affiliate/client), and timestamps
- **Token Usage Table**: Persistent storage for token tracking per user with limits, usage counts, and reset dates
- **JSON File Storage**: Chat threads and configuration data stored in JSON files
- **Session Storage**: File-based session persistence for user authentication state with FileStore

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
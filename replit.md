# Overview

Prismity AI (TaskAI) is an AI-powered productivity assistant focused on marketing and automation tasks. The application provides a ChatGPT-like interface for conversational AI interactions, along with specialized features including workflow templates (Taskforce), client onboarding systems, and integration with n8n automation platform. The system supports multiple AI models with intelligent routing, user authentication via Google OAuth and Stytch, and includes an ETF (Exchange Traded Fund) system for automated workflow deployment to clients.

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
- **Authentication**: Dual authentication system supporting both Google OAuth 2.0 and Stytch magic links
- **AI Integration**: OpenAI API integration with intelligent model routing based on prompt complexity
- **Token Management**: Custom token counting and usage tracking system per user

## Data Storage Solutions
- **SQLite Database**: Local file-based database for ETF client data and history
- **JSON File Storage**: User profiles, chat threads, token usage, and configuration data stored in JSON files
- **Session Storage**: File-based session persistence for user authentication state

## Authentication and Authorization
- **Google OAuth 2.0**: Primary authentication method using Passport.js strategy
- **Stytch Magic Links**: Alternative passwordless authentication system
- **Session-Based Auth**: Server-side session management with secure cookie handling
- **Premium User System**: Role-based access control with premium features and unlimited token usage

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
- **Google OAuth 2.0**: User authentication and profile management
- **Stytch**: Magic link authentication service for passwordless login

## Automation Platform
- **n8n**: Self-hosted automation platform for workflow creation and management
- **n8n API**: RESTful API for programmatic workflow operations and credential management

## Communication Services
- **Nodemailer**: Email service integration for notifications and communications
- **Twilio**: SMS and voice communication services (configured but not actively used)
- **SendGrid**: Email delivery service for transactional emails

## Development and Deployment
- **SQLite3**: Embedded database for local data storage
- **Express Session**: Server-side session management
- **Passport.js**: Authentication middleware for OAuth strategies
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
- **Cookie Parser**: HTTP cookie parsing middleware
- **Body Parser**: Request body parsing middleware
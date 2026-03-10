# Control Panel User Guide

## Overview

The AI Property Manager Control Panel is your central hub for managing property automation. This guide explains each page and feature.

## Pages

### 1. Login Page (`/control-panel/login`)

**Purpose**: Secure access to your control panel

**Features**:
- Email and password authentication
- Secure cookie-based sessions (7-day expiry)
- Auto-redirect to onboarding for new clients

---

### 2. Onboarding Wizard (`/control-panel/onboarding`)

**Purpose**: Set up your automation system in 4 easy steps

**Step 1: Business Information**
- **Business Name**: Your company name (used in workflows)
- **Your Name**: For notifications and communications
- **Email**: Primary contact email
- **Phone**: For SMS notifications
- **Timezone**: For scheduling tasks and notifications
- **Preferred Contact**: How you want to receive alerts (Telegram, WhatsApp, Email)

**Step 2: API Credentials**
- **Telegram Bot Token**: Get from @BotFather on Telegram (optional)
- **Telegram Chat ID**: Your personal chat ID for notifications
- **OpenAI API Key**: Required for AI-powered responses
- **WhatsApp API Key**: For WhatsApp integration (optional)

**Step 3: AI Settings**
- **Response Style**: Professional, Friendly, or Casual
- **Default Language**: English, German, Spanish, French
- **Special Instructions**: Custom instructions for your AI assistant

**Step 4: Deploy Workflows**
- Automatically deploys 24 automation workflows to your n8n instance
- Shows progress and success/failure for each workflow

---

### 3. Dashboard (`/control-panel/dashboard`)

**Purpose**: Overview of your property management operations

**Sections**:

#### Stats Overview
- **Active Workflows**: Number of running automations
- **Active Bookings**: Current and upcoming reservations
- **Active Conversations**: Guest communications in progress
- **Monthly Revenue**: Total booking revenue

#### Pending Tasks
Tasks requiring your attention:
- Cleaning schedules
- Maintenance requests
- Check-in/check-out reminders
- Urgent notifications

Click **Complete** to mark tasks as done.

#### Upcoming Bookings
- Guest name and property
- Check-in/check-out dates
- Number of guests
- Booking status

#### Notifications Bell
- Click the bell icon to see alerts
- Unread notifications show a badge count
- Click a notification to mark it as read

---

### 4. Settings Page (`/control-panel/settings`)

**Purpose**: Configure your automation system

**Section 1: Owner Information**
- Update your contact details
- Change preferred notification platform

**Section 2: Business Information**
- Update business name and address
- Change timezone

**Section 3: API Credentials**
- Update Telegram, OpenAI, WhatsApp keys
- Credentials are securely encrypted

**Section 4: AI Preferences**
- Adjust response style
- Change default language
- Update special instructions

**Section 5: Workflow Management**
- **Deployed Count**: Number of workflows deployed
- **Active Count**: Number of active workflows
- **Workflow List**: See all your workflows with status
- **Test Connection**: Verify n8n connection
- **Redeploy All**: Update all workflows with new settings
- **Toggle**: Activate/deactivate individual workflows

---

### 5. Properties Page (`/control-panel/properties`)

**Purpose**: Manage your rental properties

**Features**:
- Add new properties
- Edit property details
- View property list
- Set pricing and availability

---

## Workflow Overview (24 Automations)

Your system includes these automation workflows:

### Message Handling
1. **Message Router**: Routes incoming messages to the right handler
2. **Control Panel Hub**: Owner commands via Telegram/WhatsApp
3. **AI Conversation Manager**: Handles guest conversations with AI

### Booking Management
4. **Booking Inquiry Handler**: Processes new booking requests
5. **Availability Checker**: Real-time availability checking
6. **Conflict Priority Manager**: Handles overlapping bookings
7. **Payment Handler**: Processes payments and confirmations

### Operations
8. **Cleaning Scheduler**: Assigns cleaning tasks automatically
9. **Maintenance Tracker**: Manages maintenance tickets
10. **Vendor Manager**: Coordinates with service providers

### Guest Experience
11. **Check-in Coordinator**: Sends check-in instructions
12. **Guest Messaging**: Scheduled guest communications
13. **Review Requester**: Follows up for reviews

### Analytics & Monitoring
14. **Daily Report Generator**: Daily operations summary
15. **Revenue Tracker**: Tracks booking revenue
16. **Health Monitor**: Monitors system health

*...and more specialized workflows for complete automation*

---

## Common Tasks

### Approve a Booking
1. Go to Dashboard
2. Find the booking in "Pending Tasks"
3. Click "Approve" or respond via Telegram

### Update AI Settings
1. Go to Settings
2. Scroll to "AI Preferences"
3. Update style, language, or instructions
4. Click "Save Settings"
5. Click "Redeploy All" to apply changes

### Check Workflow Status
1. Go to Settings
2. Scroll to "Workflow Management"
3. Click "Test Connection" to verify n8n
4. View deployed workflows and their status

### Add a New Property
1. Go to Properties
2. Click "Add Property"
3. Fill in property details
4. Save and configure pricing

---

## Telegram Commands

If using Telegram integration, you can send these commands:

- `/dashboard` - Quick overview of stats
- `/deals` - List active deals
- `/tasks` - Show pending tasks
- `/bookings` - Upcoming bookings
- `/help` - Command reference
- `/status` - System status

---

## Support

For technical support:
- Check the workflow logs in n8n
- Review the Settings page for configuration issues
- Contact your administrator for account problems

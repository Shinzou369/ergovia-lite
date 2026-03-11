# AIRB by Ergovia - Control Panel User Guide

## Overview

The AIRB by Ergovia Control Panel is your central hub for managing property automation. This guide explains each page and feature.

## Pages

### 1. Onboarding Wizard (`/airb/onboarding`)

**Purpose**: Set up your automation system in 6 easy steps

**Step 1: Owner Information**
- **Your Name**: For notifications and communications
- **Email**: Primary contact email
- **Phone**: For SMS notifications
- **Timezone**: For scheduling tasks and notifications
- **Preferred Contact**: How you want to receive alerts (Telegram, WhatsApp, Email)

**Step 2: Property**
- **Property Name**: Your listing name
- **Property Address**: Full address
- **Nightly Rate**: Your minimum nightly rate
- **Check-in / Check-out Times**: Standard times for guests

**Step 3: Guest Access**
- **Access Codes**: Door codes, lockbox info
- **WiFi Details**: Network name and password
- **House Rules**: Key rules for guests

**Step 4: Calendars**
- **Calendar Sync**: Connect Airbnb, Booking.com, or other iCal feeds
- **Availability Settings**: Block dates, set minimum stays

**Step 5: Integrations**
- **Telegram Bot Token**: Get from @BotFather on Telegram
- **Telegram Chat ID**: Your personal chat ID for notifications
- **WhatsApp API Key**: For WhatsApp integration (optional)
- Note: OpenAI API key is provided by Ergovia — you don't need your own

**Step 6: Google Business**
- **Google Business Profile**: Connect for automated review management

After completing all 6 steps, workflows deploy automatically (10 workflows: 2 SUB + WF1-WF8).

---

### 2. Dashboard (`/airb/dashboard`)

**Purpose**: Overview of your property management operations

**Sections**:

#### Stats Overview
- **Active Workflows**: Number of running automations (out of 10)
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

### 3. Conversations (`/airb/conversations`)

**Purpose**: View and manage guest communication threads

**Features**:
- See all guest conversations in one place
- Messages are routed through WF1 (AI Gateway)
- View AI responses and guest messages
- Filter by property or status

---

### 4. Calendar (`/airb/calendar`)

**Purpose**: Visual booking calendar

**Features**:
- Month navigation with arrows
- Color-coded bookings by property
- Property filter dropdown
- Upcoming check-ins list

---

### 5. Properties (`/airb/properties`)

**Purpose**: Manage your rental properties

**Features**:
- Add new properties
- Edit property details
- View property list
- Set pricing and availability

---

### 6. Settings (`/airb/settings`)

**Purpose**: Configure your automation system

**Section 1: Owner Information**
- Update your contact details
- Change preferred notification platform

**Section 2: Business Information**
- Update business name and address
- Change timezone

**Section 3: API Credentials**
- Update Telegram, WhatsApp keys
- Credentials are securely encrypted
- OpenAI key is managed by Ergovia

**Section 4: AI Preferences**
- Adjust response style
- Change default language
- Update special instructions

**Section 5: Workflow Management**
- **Deployed Count**: Number of workflows deployed (up to 10)
- **Active Count**: Number of active workflows
- **Workflow List**: See all your workflows with status
- **Test Connection**: Verify n8n connection
- **Redeploy All**: Update all workflows with new settings

---

### 7. M1 Dashboard (`/airb/m1-dashboard`)

**Purpose**: Milestone 1 monitoring and status overview

---

### 8. M1 Config (`/airb/m1-config`)

**Purpose**: Milestone 1 configuration settings

---

### 9. Admin (`/airb/admin`)

**Purpose**: Administrative functions and system management

---

## Workflow Overview (10 Automations)

Your system uses a hub-and-spoke architecture with 10 workflows:

### Helper Workflows (SUB)
1. **SUB Universal Messenger**: Handles message delivery across Telegram, WhatsApp, Email
2. **SUB Server Setup**: Database initialization and server configuration

### Main Workflows (WF1-WF8)
3. **WF1 AI Gateway**: Routes all incoming messages to the right handler (the hub)
4. **WF2 Control Panel**: Processes owner commands via Telegram
5. **WF3 Inquiry Handler**: AI-powered guest conversation and inquiry responses
6. **WF4 Booking Manager**: Handles reservations, availability, and conflicts
7. **WF5 Guest Journey**: Automated guest messages (pre-arrival, check-in, checkout, review request)
8. **WF6 Morning Report**: Daily operations summary and budget check
9. **WF7 Payment Handler**: Processes payment confirmations via Telegram
10. **WF8 Maintenance**: Creates and tracks maintenance/repair tickets

---

## Common Tasks

### Approve a Booking
1. Go to Dashboard (`/airb/dashboard`)
2. Find the booking in "Pending Tasks"
3. Click "Approve" or respond via Telegram

### Update AI Settings
1. Go to Settings (`/airb/settings`)
2. Scroll to "AI Preferences"
3. Update style, language, or instructions
4. Click "Save Settings"
5. Click "Redeploy All" to apply changes

### Check Workflow Status
1. Go to Settings (`/airb/settings`)
2. Scroll to "Workflow Management"
3. Click "Test Connection" to verify n8n
4. View deployed workflows and their status

### Add a New Property
1. Go to Properties (`/airb/properties`)
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
- Check the workflow status in Settings
- Review the dashboard for error notifications
- Contact your Ergovia account manager via Telegram

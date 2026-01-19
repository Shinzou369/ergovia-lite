# Prismity AI - PostgreSQL Workflow Suite

## Overview

This folder contains the complete workflow suite for Prismity AI's property management automation platform, converted from Google Sheets to PostgreSQL.

## Architecture

Each client receives their own isolated environment on a Hetzner VPS:

```
┌─────────────────────────────────────────────────┐
│              Client's Hetzner VPS               │
│                 (~€4-10/month)                  │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │   Authelia  │  │    n8n      │  │ NocoDB  │ │
│  │  (Login +   │  │ (Workflows) │  │ (Data   │ │
│  │   MFA)      │  │   Hidden    │  │  UI)    │ │
│  └─────────────┘  └─────────────┘  └─────────┘ │
│                        │                │       │
│                        ▼                ▼       │
│              ┌──────────────────────────────┐   │
│              │        PostgreSQL            │   │
│              │     (21 Tables)              │   │
│              └──────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Workflow Files

### Onboarding Workflows (7 files)

| File | Purpose |
|------|---------|
| `MASTER_COORDINATOR_PostgreSQL.json` | Orchestrates 6-phase customer deployment |
| `SUB1_Server_Provisioner.json` | Creates Hetzner VPS |
| `SUB2_Server_Setup_PostgreSQL.json` | Installs Docker, n8n, PostgreSQL, Authelia |
| `SUB3_Database_Provisioner.json` | Creates database, schema, NocoDB |
| `SUB4_Workflow_Configurator.json` | Creates n8n credentials, configures workflows |
| `SUB5_Workflow_Deployer.json` | Deploys 24 workflows to client n8n |
| `SUB7_Customer_Notifier.json` | Sends welcome email |

### Automation Workflows (24 files)

| # | Name | Purpose |
|---|------|---------|
| 00 | Message Router | Master routing hub for all channels |
| 01 | Control Panel Hub | Owner command interface (Telegram/WhatsApp) |
| 02 | Conflict Priority Manager | Handles booking conflicts |
| 03 | Real-Time Availability Checker | Property availability queries |
| 04 | Manual Task Queue Manager | Owner task management |
| 05 | Intelligent Inquiry Handler | New guest inquiries |
| 06 | AI Conversation Manager | AI-powered guest chat |
| 07 | Payment Confirmation Handler | Process payment confirmations |
| 08 | Guest Journey Scheduler | Schedule pre/post-stay messages |
| 09 | Scheduled Message Sender | Send queued messages |
| 10 | Cleaning Completion Report | Handle cleaner reports |
| 11 | Daily Morning Check | 9 AM calendar sync reminder |
| 12 | Nightly Automation | 2 AM maintenance tasks |
| 13 | Calendar Sync & Availability | Sync booking calendars |
| 14 | Cleaning Scheduler | Assign cleaners to turnovers |
| 15 | Inventory Predictor | Track supplies, predict reorders |
| 16 | Review Monitoring & Response | Monitor & respond to reviews |
| 17 | Guest Screening System | Screen booking requests |
| 18 | Utility (Email) | Utility email workflow |
| 19 | Emergency Response | Handle emergencies |
| 20 | Owner Dashboard | Generate owner reports |
| 21 | Backup & Recovery | Data backup operations |
| 22 | Integration Hub | External integrations |
| 23 | Advanced Automation | Advanced incident handling |

## Database Schema

See `/database/schema.sql` for the complete PostgreSQL schema with 21 tables:

### Core Tables
- `property_configurations` - Property master data
- `bookings` - Guest bookings
- `deals` - Pre-booking negotiations
- `contacts` - CRM contacts

### Task Management
- `manual_tasks` - Owner to-do items
- `control_panel_tasks` - System-generated tasks
- `cleaning_tasks` - Cleaner assignments
- `maintenance_tickets` - Maintenance issues

### Messaging
- `scheduled_messages` - Queued messages

### Operations
- `cleaners` - Cleaner profiles
- `vendors` - Service providers
- `inventory` - Property supplies
- `suppliers` - Supply vendors

### Analytics & Logging
- `calendar_sync_log` - Calendar sync records
- `deal_conflicts` - Booking conflicts
- `incidents` - Guest incidents
- `guest_blacklist` - Blocked guests
- `guest_screening_log` - Screening decisions
- `reviews` - Guest reviews
- `pricing_history` - Historical pricing
- `pricing_recommendations` - AI pricing suggestions
- `inquiries` - Initial inquiries
- `workflow_config` - System configuration

## Remaining Google Dependencies

3 workflows still use Google Calendar for calendar sync functionality:
- Workflow 03 (Availability)
- Workflow 11 (Daily Morning Check)
- Workflow 19 (Emergency Response)

**Options to remove:**
1. Use iCal feeds instead (no OAuth needed)
2. Have clients manually export/import calendars
3. Use n8n's HTTP Request to poll iCal URLs

## Cost Summary

| Component | Monthly Cost |
|-----------|--------------|
| Hetzner VPS (CX21) | €5-10 |
| PostgreSQL | $0 (self-hosted) |
| n8n | $0 (self-hosted) |
| NocoDB | $0 (self-hosted) |
| Authelia | $0 (self-hosted) |
| SSL (Let's Encrypt) | $0 |
| **Total per client** | **~€5-10/month** |

## Client Experience

**What clients see:**
- Control Panel (settings & configuration)
- NocoDB (Airtable-like data interface)
- Authelia login (secure access)

**What clients DON'T see:**
- n8n (runs invisibly in background)
- PostgreSQL (accessed via NocoDB)
- Docker infrastructure

## Deployment

To deploy a new client, trigger the MASTER_COORDINATOR webhook with:

```json
{
  "customer_id": "demo-client-001",
  "owner_name": "John Smith",
  "owner_email": "john@example.com",
  "owner_phone": "+1234567890",
  "telegram_credential_name": "client_telegram",
  "whatsapp_credential_name": "client_whatsapp",
  "openai_api_key": "sk-...",
  "properties": [
    {
      "name": "Beach House",
      "address": "123 Ocean Ave",
      "city": "Miami",
      "bedrooms": 3,
      "max_guests": 8
    }
  ]
}
```

The system will automatically:
1. Provision a Hetzner server
2. Install Docker, n8n, PostgreSQL, Authelia
3. Create database with 21 tables
4. Deploy NocoDB for data management
5. Configure and deploy 24 workflows
6. Send welcome email to client

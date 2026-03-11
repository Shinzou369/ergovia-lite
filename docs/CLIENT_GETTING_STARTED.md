# Welcome to AIRB by Ergovia
## Client Getting Started Guide

**Congratulations!** Your property management automation is ready. This guide walks you through everything step-by-step.

**Time to complete:** About 30 minutes

---

# STEP 1: Your First Login

## What You Received
You should have received:
- Your dashboard link (looks like: `https://yourname.ergovia-ai.com/airb/dashboard`)
- Your login credentials
- Instructions to get started

## Logging In

1. **Open the link** from your welcome message
2. **Enter your credentials** on the login page
3. **You'll land on your dashboard** at `/airb/dashboard`

You're now in your AIRB control panel!

---

# STEP 2: Understanding Your Dashboard

## What You See

When you log in, you'll see your AIRB dashboard with an overview of your property operations — bookings, conversations, tasks, and quick stats.

**Quick tip:** Your automation system uses a hub-and-spoke architecture with 10 workflows (2 SUB helpers + WF1-WF8). WF1 is the AI Gateway that routes everything to the right place automatically.

## Main Areas

| Area | Where to Find | What It Does |
|------|---------------|--------------|
| **Dashboard** | `/airb/dashboard` | Overview of stats, bookings, tasks |
| **Conversations** | `/airb/conversations` | Guest communication threads |
| **Calendar** | `/airb/calendar` | Booking calendar view |
| **Properties** | `/airb/properties` | Your property listings |
| **Settings** | `/airb/settings` | Configuration and credentials |

---

# STEP 3: Complete Onboarding (6 Steps)

Your onboarding wizard at `/airb/onboarding` walks you through 6 steps:

| Step | What You Provide |
|------|-----------------|
| **1. Owner Info** | Your name, email, phone, timezone, preferred contact method |
| **2. Property** | Property name, address, rates, check-in/out times |
| **3. Guest Access** | Access codes, WiFi details, house rules |
| **4. Calendars** | Connect your booking calendars (Airbnb, Booking.com, etc.) |
| **5. Integrations** | Telegram bot token, WhatsApp, other service connections |
| **6. Google Business** | Connect your Google Business profile for reviews |

---

# STEP 4: Connect Your Telegram Bot

This is how your guests and you will communicate with the system.

## Part A: Create Your Bot (5 minutes)

1. **Open Telegram** on your phone
2. **Search for** `@BotFather` (the official Telegram bot maker)
3. **Tap "Start"** to begin
4. **Send:** `/newbot`
5. **Follow the prompts:**
   - Name your bot (e.g., "Beach House Concierge")
   - Choose a username (must end in `bot`, e.g., `beachhouse_bot`)
6. **Copy the token** BotFather gives you (looks like: `123456789:ABCdefGHI...`)

**Keep this token safe - you'll need it in the next step!**

## Part B: Get Your Personal Chat ID

1. **In Telegram, search for** `@userinfobot`
2. **Tap "Start"**
3. **It will reply with your ID** (a number like `123456789`)
4. **Write this down** - this is YOUR owner ID

**Why you need this:** This ID tells the system where to send your alerts and notifications. You'll enter it during onboarding Step 5 (Integrations).

## Part C: Add to Your Settings

1. **Go to** `/airb/settings` in your dashboard
2. **Find the Credentials section**
3. **Paste your bot token** in the Telegram Bot Token field
4. **Enter your Chat ID** in the Telegram Chat ID field
5. **Click "Save"**

---

# STEP 5: Activate Your System

Once onboarding is complete, your 10 workflows deploy automatically:

| Workflow | Purpose |
|----------|---------|
| **SUB Universal Messenger** | Handles message delivery across channels |
| **SUB Server Setup** | Database and server configuration helper |
| **WF1 AI Gateway** | Routes all incoming messages to the right handler |
| **WF2 Control Panel** | Processes your owner commands |
| **WF3 Inquiry Handler** | Responds to guest questions with AI |
| **WF4 Booking Manager** | Handles reservations and availability |
| **WF5 Guest Journey** | Automated guest messages (pre-arrival, check-in, checkout) |
| **WF6 Morning Report** | Daily operations summary and budget check |
| **WF7 Payment Handler** | Processes payment confirmations via Telegram |
| **WF8 Maintenance** | Creates and tracks repair tickets |

Workflows are deployed in the correct order automatically. No manual activation needed!

---

# STEP 6: Test Your System

## Test 1: Send Yourself a Message

1. **Open Telegram** on your phone
2. **Search for your bot** (the one you created in Step 4)
3. **Tap "Start"**
4. **Send this message:** "Is the property available next weekend?"
5. **Wait 10-20 seconds**
6. **You should receive a response!**

**If it works:** The AI responded with availability info - you're good to go!

**If no response:** Check the troubleshooting section below.

---

## Test 2: Check Your Dashboard

1. **Go to** `/airb/dashboard`
2. **You should see recent activity** in the stats and conversations
3. **Check** `/airb/conversations` to see the message thread

---

## Test 3: Owner Commands

1. **In Telegram, send to your bot:** `/dashboard`
2. **You should receive:** A summary of your system status
3. **Try other commands:**
   - `/bookings` - See your bookings
   - `/tasks` - See pending tasks
   - `/help` - List all commands

---

# STEP 7: Go-Live Checklist

Before you're fully live, confirm these are complete:

| Item | Check |
|------|-------|
| Onboarding completed (all 6 steps) | ? |
| Telegram bot token added | ? |
| Your owner Chat ID entered | ? |
| Test message sent and received response | ? |
| Owner commands working (`/dashboard`) | ? |
| Properties configured in `/airb/properties` | ? |

**All checked?** You're ready!

---

# STEP 8: You're Live!

Your automation system is now running. Here's what happens automatically:

| When This Happens | Your System Does This |
|-------------------|----------------------|
| Guest asks about availability | AI checks and responds with pricing |
| Guest wants to negotiate | AI handles it within your limits |
| Guest confirms booking | Creates booking, sends confirmation via Telegram |
| 3 days before check-in | Sends guest pre-arrival info |
| Day of check-in | Sends access codes and instructions |
| Day before checkout | Sends checkout reminder |
| After checkout | Schedules cleaner, requests review |
| Guest reports problem | Creates maintenance ticket |
| System has error | Alerts you via Telegram |

---

# TROUBLESHOOTING

## "I didn't get a response from my bot"

| Check | How to Fix |
|-------|-----------|
| Is your bot token correct? | Settings -> Credentials -> Verify Telegram token |
| Are workflows deployed? | Check `/airb/settings` workflow section |
| Is OpenAI working? | OpenAI key is managed by Ergovia - contact support |

## "Guest messages aren't routing correctly"

1. **Check WF1 (AI Gateway)** is active
2. **Verify your Telegram credential** is connected
3. **Try sending another test message**

## Need Help?

Contact your support team:
- Telegram: Message your account manager directly
- Response time: Within 24 hours

---

# QUICK REFERENCE

## Your Key URLs

| What | Where |
|------|-------|
| Dashboard | `https://yourname.ergovia-ai.com/airb/dashboard` |
| Conversations | `https://yourname.ergovia-ai.com/airb/conversations` |
| Properties | `https://yourname.ergovia-ai.com/airb/properties` |
| Settings | `https://yourname.ergovia-ai.com/airb/settings` |
| Onboarding | `https://yourname.ergovia-ai.com/airb/onboarding` |

## Owner Telegram Commands

| Command | What It Does |
|---------|--------------|
| `/dashboard` | System overview |
| `/bookings` | Upcoming bookings |
| `/tasks` | Pending tasks |
| `/deals` | Active negotiations |
| `/help` | Show all commands |

---

# DAILY OPERATIONS

## Morning Routine (2 minutes)

1. **Check Telegram** for any overnight alerts
2. **Send `/dashboard`** to see today's activity
3. **Handle any urgent items**

## When You Get a New Booking

The system handles it automatically:
- Creates booking record
- Schedules all guest messages
- Assigns cleaner for turnover
- Notifies you via Telegram

## When Something Needs Attention

You'll receive a Telegram message like:
- "New booking confirmed: [Guest Name], [Dates]"
- "Maintenance request: [Issue description]"
- "System alert: [Problem description]"

Just respond or take action as needed!

---

**That's it!** Your property automation is running. Guests can now message your bot 24/7, and the AI handles inquiries, bookings, and guest communication automatically.

Welcome to AIRB by Ergovia!

---
*Guide Version: March 2026*

# Welcome to Your Property Automation System
## Client Getting Started Guide

**Congratulations!** Your property management automation is ready. This guide walks you through everything step-by-step.

**Time to complete:** About 30 minutes

---

# STEP 1: Your First Login

## What You Received
You should have received an email with:
- Your dashboard link (looks like: `https://yourname.n8n.cloud` or similar)
- Your login email
- Instructions to set your password

## Logging In

1. **Open the link** from your welcome email
2. **Click "Set Password"** if this is your first time
3. **Create a strong password** (save it somewhere safe!)
4. **Click "Sign In"**

You're now in your automation dashboard!

---

# STEP 2: Understanding Your Dashboard

## What You See

When you log in, you'll see a list of your automations. These are the "robots" that handle your property tasks automatically.

**Quick tip:** Look at the colored tags to understand what each automation does:
- 🟢 `trigger:webhook` = Responds to guest messages
- 🔵 `trigger:scheduled` = Runs automatically at set times
- 🟡 `trigger:event` = Responds to owner commands

## Main Areas

| Area | Where to Find | What It Does |
|------|---------------|--------------|
| **Automations** | Left sidebar → "Workflows" | Your automation list |
| **Activity Log** | Left sidebar → "Executions" | See what ran and when |
| **Connected Services** | Gear icon → "Credentials" | Your Telegram, Stripe, etc. |

---

# STEP 3: Connect Your Telegram Bot

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

**Why you need this:** This ID tells the system where to send your alerts and notifications. Share this with your support team so they can add it to your property settings.

## Part C: Add to Your Dashboard

1. **In your dashboard**, click the **gear icon** (top right)
2. **Click "Credentials"** in the menu
3. **Find "Telegram"** in the list
4. **Click to edit**
5. **Paste your bot token** where it says "Access Token"
6. **Click "Save"**

---

# STEP 4: Connect Your Payment System (Stripe)

## Part A: Get Your Stripe Keys

1. **Go to** [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Log in** (or create account if you don't have one)
3. **Click "Developers"** in the left menu
4. **Click "API Keys"**
5. **Copy the "Secret key"** (starts with `sk_live_...` or `sk_test_...`)

**For testing, use the TEST keys first** (toggle "Test mode" on)

## Part B: Add to Your Dashboard

1. **In your dashboard**, click the **gear icon** → **"Credentials"**
2. **Find "Stripe"** in the list
3. **Click to edit**
4. **Paste your secret key**
5. **Click "Save"**

---

# STEP 5: Add Your Property Details

## Option A: Quick Setup (We Did It For You)

If we set up your property during onboarding, it's already configured! Skip to Step 6.

## Option B: Add Property Yourself

Contact your support team with:
- Property name
- Property address
- Your minimum nightly rate
- Check-in time
- Check-out time
- Your emergency contact number

We'll add it to your system within 24 hours.

---

# STEP 6: Activate Your Automations

Now let's turn everything on!

## Activation Steps

1. **Go to "Workflows"** (left sidebar)
2. **Click on the first workflow** (Workflow 0: Message Router)
3. **Look at the top right** - you'll see a toggle switch
4. **Click to turn it ON** (should turn green)
5. **Repeat for all workflows**

**Recommended order:** Start with these most important ones first:
1. Workflow 0: Message Router (receives all messages)
2. Workflow 24: Watchdog (monitors for errors)
3. Workflow 5: Inquiry Handler (responds to guest questions)
4. Workflow 6: AI Sales (handles negotiations)
5. All others

---

# STEP 7: Test Your System

## Test 1: Send Yourself a Message

1. **Open Telegram** on your phone
2. **Search for your bot** (the one you created in Step 3)
3. **Tap "Start"**
4. **Send this message:** "Is the property available next weekend?"
5. **Wait 10-20 seconds**
6. **You should receive a response!**

**If it works:** The AI responded with availability info - you're good to go!

**If no response:** Check the troubleshooting section below.

---

## Test 2: Check Your Dashboard

1. **Go to "Executions"** (left sidebar)
2. **You should see recent activity** with green checkmarks
3. **Click on any row** to see what happened

**Green checkmark** = Success
**Red X** = Something went wrong (click to see details)

---

## Test 3: Owner Commands

1. **In Telegram, send to your bot:** `/dashboard`
2. **You should receive:** A summary of your system status
3. **Try other commands:**
   - `/bookings` - See your bookings
   - `/tasks` - See pending tasks
   - `/help` - List all commands

---

# STEP 8: Go-Live Checklist

Before you're fully live, confirm these are complete:

| Item | Check |
|------|-------|
| Telegram bot token added | ☐ |
| Your owner Chat ID shared with support | ☐ |
| Stripe connected (test mode is fine to start) | ☐ |
| All automations turned ON (green toggles) | ☐ |
| Test message sent and received response | ☐ |
| Owner commands working (`/dashboard`) | ☐ |

**All checked?** You're ready!

---

# STEP 9: You're Live!

Your automation system is now running. Here's what happens automatically:

| When This Happens | Your System Does This |
|-------------------|----------------------|
| Guest asks about availability | AI checks and responds with pricing |
| Guest wants to negotiate | AI handles it within your limits |
| Guest books and pays | Creates booking, sends confirmation |
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
| Is your bot token correct? | Credentials → Telegram → Verify token |
| Are workflows active? | Check all toggles are green |
| Did it run? | Executions → Look for recent entries |

## "I see red X in executions"

1. **Click on the failed execution**
2. **Look for the error message** (usually highlighted in red)
3. **Common fixes:**
   - "Credential not found" → Go to Credentials and reconnect
   - "Timeout" → Just a slow response, usually fixes itself

## "Guest messages aren't routing correctly"

1. **Check Workflow 0** is active (green toggle)
2. **Verify your Telegram credential** is connected
3. **Try sending another test message**

## Need Help?

Contact your support team:
- Email: [your support email]
- Response time: Within 24 hours

---

# QUICK REFERENCE

## Your Key URLs

| What | Where |
|------|-------|
| Dashboard | `https://your-n8n-url.com` |
| Executions | Dashboard → Executions |
| Credentials | Dashboard → Gear icon → Credentials |

## Owner Telegram Commands

| Command | What It Does |
|---------|--------------|
| `/dashboard` | System overview |
| `/bookings` | Upcoming bookings |
| `/tasks` | Pending tasks |
| `/deals` | Active negotiations |
| `/help` | Show all commands |

## What Each Workflow Does

| Name | Purpose |
|------|---------|
| Message Router | Directs incoming messages to the right place |
| Control Panel | Handles your owner commands |
| AI Sales | Negotiates with potential guests |
| Payment Handler | Processes Stripe payments |
| Guest Journey | Sends automated guest messages |
| Cleaner Scheduler | Assigns cleaning after checkout |
| Maintenance | Creates repair tickets |
| Watchdog | Monitors system health |

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

Welcome aboard! 🏠

---
*Guide Version: January 2026*

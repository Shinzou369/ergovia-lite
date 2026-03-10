# AIRB by Ergovia - Product Test Walkthrough

> **Updated March 2026 to reflect AIRB branding and /airb/ paths**

**Version:** 3.0
**Date:** March 10, 2026
**URL:** https://ergovia-ai.com

---

## Pre-requisite: Update the Server

```bash
cd /opt/ergovia-lite
git pull origin main
pm2 restart ergovia-lite
```

---

## TEST 1: First Visit - Landing Page

- [ ] Open browser and go to `https://ergovia-ai.com/`
- [ ] Page shows the AIRB by Ergovia landing page (not an auth redirect)

**Backend proof:** Root URL now serves a landing page. Dashboard is at `/airb/dashboard`.

---

## TEST 2: Login Page

On the login page, verify:

- [ ] Dark background with animated floating purple/indigo orbs
- [ ] Subtle grid overlay effect
- [ ] AIRB by Ergovia logo at top center
- [ ] "AIRB by Ergovia" title in gradient text
- [ ] "AI-Powered Property Management" subtitle
- [ ] Green badge: "First-time setup - Create your admin account" (if no accounts exist)
- [ ] Form is in Register mode (Email, Username, Password, Confirm Password)
- [ ] Purple gradient "Create Account" button

**Backend proof:** Page calls `GET /api/auth/status` and receives `{"setupRequired": true}`, triggering register mode.

---

## TEST 3: Create Admin Account

- [ ] Enter Email (e.g., `admin@ergovia-ai.com`)
- [ ] Enter Username (e.g., `admin`)
- [ ] Enter Password (6+ characters, e.g., `Ergovia2026!`)
- [ ] Enter Confirm Password (same as above)
- [ ] Click "Create Account"
- [Only admins can create new accounts] Spinner animation appears while loading
- [Only admins can create new accounts] Redirects to `https://ergovia-ai.com/airb/dashboard`

**Backend proof:** `POST /api/auth/register` creates user in SQLite, hashes password with bcrypt, generates JWT token.

---

## TEST 4: Dashboard Overview

Verify these elements on the AIRB Dashboard:

- [ ] Top nav bar with AIRB by Ergovia logo
- [ ] "Dashboard" tab is active/highlighted
- [ ] "Settings" and "Properties" tabs visible
- [ ] Notification bell with count badge (top-right)
- [ ] Welcome banner: "Welcome back, Owner!"
- [ ] Tasks & Reminders section with "Complete Your Setup" task
- [ ] Booking Calendar with month navigation arrows
- [ ] Property filter dropdown and "Demo Data" button
- [ ] Quick Stats cards at bottom (Active Bookings, Properties, Active Conversations, This Month) showing 0

**Backend proof:** Page calls `GET /api/v2/dashboard` with JWT token. Invalid tokens redirect to login via auth-guard.

---

## TEST 5: Notification Bell

- [ ] Click the bell icon in the top-right corner
- [ ] Notification panel slides open from the right
- [ ] Contains system notifications (welcome messages, setup reminders)
- [ ] Each notification shows title, message, and timestamp

**Backend proof:** `GET /api/v2/notifications` returns notifications from SQLite with unread counts.


---

## TEST 6: Settings Page

- [ ] Click "Settings" in the top navigation bar (goes to `/airb/settings`)
- [ ] Progress bar shows setup completion percentage
- [ ] Credentials section visible (n8n URL, n8n API Key, Telegram, WhatsApp)
- [ ] Owner Information section (name, email, phone, language, timezone)
- [ ] Note: OpenAI key is managed by Ergovia, not shown to client


### Test Save & Persistence:

- [ ] Enter a test value in n8n URL (e.g., `https://n8n.ergovia-ai.com`)
- [ ] Click Save for that section
- [ ] Success toast/message appears
- [ ] Refresh the page (F5)
- [ ] n8n URL value is still there (persisted)
- [ ] Sensitive fields (API keys) show as `********` (masked)

**Backend proof:** `POST /api/v2/settings` saves to SQLite. `GET /api/v2/settings` retrieves and masks sensitive values.

---

## TEST 7: Properties Page

- [ ] Click "Properties" in the top navigation bar (goes to `/airb/properties`)
- [ ] "My Properties" header visible with "Add New Property" button
- [ ] Empty state shown (no properties yet)
- [ ] Click "Add New Property"
- [ ] Enter property name: `Beach House Cancun`
- [ ] Enter address: `123 Ocean Drive, Cancun`
- [ ] Fill in any additional fields
- [ ] Click Save/Submit
- [ ] Property appears in the list

**Backend proof:** `POST /api/v2/properties` creates the record. `GET /api/v2/properties` retrieves it.


---

## TEST 8: Calendar Demo Data

- [ ] Click "Dashboard" in the navigation (goes to `/airb/dashboard`)
- [ ] Click the "Demo Data" button (next to calendar filter)
- [ ] Sample properties appear in the property filter dropdown
- [ ] Color-coded bookings appear on the calendar
- [ ] Property legend shows color = property mapping
- [ ] "Upcoming Check-ins" list populates below calendar
- [ ] Quick Stats cards update with counts

---

## TEST 9: Manual Booking

- [ ] Click the "New Booking" button (next to calendar header)

### Step 1 - Date Selection:

- [ ] Modal opens with 2-month calendar view
- [ ] Click a date for check-in (highlights in color)
- [ ] Click a later date for check-out (range highlights)
- [ ] Click "Next"

### Step 2 - Guest Details:

- [ ] Select a property from the list
- [ ] Enter guest name: `John Test`
- [ ] Enter phone: `+1555123456`
- [ ] Select platform: "Direct Booking"
- [ ] Enter total amount: `500`
- [ ] Click "Create Booking"
- [ ] Booking appears on the calendar
- [ ] Booking appears in the upcoming check-ins list

**Backend proof:** `POST /api/v2/bookings` stores the booking. `GET /api/v2/bookings` retrieves it.

---

## TEST 10: Auth Security - Logout Test

- [ ] Open browser Developer Tools (F12 > Console tab)
- [ ] Type: `localStorage.removeItem('ergovia_token');`
- [ ] Refresh the page (F5)
- [ ] Immediate redirect to login page

**Backend proof:** Auth guard checks token on every page load. No valid token = no access.

---

## TEST 11: Login with Existing Account

- [ ] "Sign In" mode is shown (not register)
- [ ] Green "First-time setup" badge does NOT appear
- [ ] Enter username and password from Test 3
- [ ] Click "Sign In"
- [ ] Redirects to `/airb/dashboard`
- [ ] All previous data still present (bookings, properties, settings)

**Backend proof:** `GET /api/auth/status` returns `{"setupRequired": false}`. `POST /api/auth/login` validates credentials, returns new JWT.

---

## TEST 12: Onboarding & Other Pages

- [ ] `https://ergovia-ai.com/airb/onboarding` loads without errors
- [ ] `https://ergovia-ai.com/airb/settings` loads without errors
- [ ] `https://ergovia-ai.com/airb/m1-dashboard` loads without errors
- [ ] `https://ergovia-ai.com/airb/m1-config` loads without errors

---

## Results Summary

| Layer | What's Tested | Pass? |
|-------|--------------|-------|
| **Auth** | Register, Login, JWT token, Logout, Route protection | |
| **Dashboard** | Stats, Welcome banner, Tasks section | |
| **Calendar** | Month navigation, Property filter, Demo data | |
| **Bookings** | Create manual booking, Display on calendar | |
| **Notifications** | Bell count, Panel display, Mark as read | |
| **Settings** | Save credentials, Mask sensitive data, Persist | |
| **Properties** | Add property, List properties | |
| **Static Pages** | Login, AIRB pages, Landing page all serve correctly | |
| **Branding** | AIRB by Ergovia logo, Dark theme login, Nav logo across pages | |
| **Workflows** | 10 workflows (2 SUB + WF1-WF8) deploy correctly | |

---

**Tested by:** ___
**Date:** ___

---

## Partner Bug Reports (Historical - February 2026)

These bugs were reported by the partner during the original V2 testing round. Preserved for reference:

## Comment: Create account page is cut in half after being used (design flaw) - Test No. 2
## Comment: Only admin can create new accounts, can't test create account - Test No. 3
## Comment: No reminder on "complete your setup" task - Test No. 4
## Comment: No filter containing system notifications (only welcome message is present, no setup reminders) - Test No. 5
## Comment: Lacking credentials section (n8n, n8n API key, OpenAI, Telegram, WhatsApp), lacking these options (language, timezone, currency, payment methods) - Test No. 6
## Comment: Failed to save property appears after trying to save new property - Test No. 7
# Comment: Once booking is canceled, on the calendar feed - the booking is still present - Test No. 9 (Step 2)
## Comment: John Test is still present despite having the booking be cancelled - Test No. 11

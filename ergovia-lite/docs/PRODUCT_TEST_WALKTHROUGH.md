# ERGOVIA LITE - Product Test Walkthrough

**Version:** 2.1
**Date:** February 19, 2026
**URL:** https://ergovia-ai.com

---

## Pre-requisite: Update the Server

```bash
cd /opt/ergovia-lite
git pull origin main
pm2 restart ergovia-lite
```

---

## TEST 1: First Visit - Auth Redirect

- [ ] Open browser and go to `https://ergovia-ai.com/`
- [ ] Page redirects automatically to `https://ergovia-ai.com/login.html`

**Backend proof:** Root page calls `GET /api/auth/verify`, detects no token, redirects to login.

---

## TEST 2: Login Page - First-Time Setup

On the login page, verify:

- [ ] Dark background with animated floating purple/indigo orbs
- [ ] Subtle grid overlay effect
- [ ] Circuit board Ergovia logo at top center
- [ ] "Ergovia Lite" title in gradient text
- [ ] "AI-Powered Property Management" subtitle
- [ ] Green badge: "First-time setup - Create your admin account"
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
- [ ] Spinner animation appears while loading
- [ ] Redirects to `https://ergovia-ai.com/v2/dashboard.html`

**Backend proof:** `POST /api/auth/register` creates user in SQLite, hashes password with bcrypt, generates JWT token.

---

## TEST 4: Dashboard Overview

Verify these elements on the V2 Premium Dashboard:

- [ ] Top nav bar with Ergovia circuit board logo
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

- [ ] Click "Settings" in the top navigation bar
- [ ] Progress bar shows setup completion percentage
- [ ] Credentials section visible (n8n URL, n8n API Key, OpenAI, Telegram, WhatsApp)
- [ ] Owner Information section (name, email, phone, language, timezone)
- [ ] Payment Settings section (currency, payment methods)

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

- [ ] Click "Properties" in the top navigation bar
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

- [ ] Click "Dashboard" in the navigation
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
- [ ] Redirects to dashboard
- [ ] All previous data still present (bookings, properties, settings)

**Backend proof:** `GET /api/auth/status` returns `{"setupRequired": false}`. `POST /api/auth/login` validates credentials, returns new JWT.

---

## TEST 12: V1 Pages Still Accessible

- [ ] `https://ergovia-ai.com/onboarding.html` loads without errors
- [ ] `https://ergovia-ai.com/settings.html` loads without errors
- [ ] `https://ergovia-ai.com/admin.html` loads without errors

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
| **Static Pages** | Login, V2 pages, V1 pages all serve correctly | |
| **Branding** | Logo, Dark theme login, Nav logo across pages | |

---

**Tested by:** ___________________
**Date:** ___________________
**Notes:**



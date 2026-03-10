# Phase 3: Future Patches Reference Document

These patches address Issues 1, 3, and 4 - the medium-risk changes that should only be implemented if you've observed real problems in production.

---

## Issue 1: Routing Ambiguity Fix

### Problem
Workflow 0 (Message Router) uses the same endpoint `/webhook/guest-conversation` for both:
- Active booking messages (should go to Workflow 22)
- Active deal messages (should go to Workflow 6)

### Impact
Could cause wrong handler to process message if both states exist.

### When to Apply
Apply this patch if you observe:
- Deal negotiation messages being handled as guest stay messages
- Guest stay messages being treated as sales negotiations
- Confusion in conversation context

### Solution
Create distinct endpoints for each handler.

---

### Patch: Workflow 0 - Separate Endpoints

**Step 9A - Change endpoint for active bookings:**

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{$env.N8N_WEBHOOK_URL}}/webhook/active-booking-handler",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"booking_id\": \"{{ $json.booking_id }}\",\n  \"guest_message\": \"{{ $json.message }}\",\n  \"channel_type\": \"{{ $json.channel_type }}\",\n  \"guest_phone\": \"{{ $json.sender_id }}\",\n  \"property_id\": \"{{ $json.property_id }}\"\n}"
  },
  "id": "route-to-active-booking",
  "name": "Route to Active Booking Handler",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [1200, 100]
}
```

**Step 9B - Change endpoint for active deals:**

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{$env.N8N_WEBHOOK_URL}}/webhook/deal-conversation",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"deal_id\": \"{{ $json.deal_id }}\",\n  \"latest_client_message\": \"{{ $json.message }}\",\n  \"channel_type\": \"{{ $json.channel_type }}\",\n  \"client_phone\": \"{{ $json.sender_id }}\"\n}"
  },
  "id": "route-to-deal-conversation",
  "name": "Route to Deal Conversation",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [1200, 300]
}
```

---

### Patch: Workflow 22 - Update Webhook Trigger

Change the webhook trigger in Workflow 22:

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "active-booking-handler",
    "options": {}
  },
  "id": "webhook-trigger",
  "name": "Active Booking Message Received",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "position": [0, 0],
  "webhookId": "active-booking-handler-id"
}
```

---

### Patch: Workflow 6 - Update Webhook Trigger

Change the webhook trigger in Workflow 6:

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "deal-conversation",
    "options": {}
  },
  "id": "webhook-trigger",
  "name": "Deal Conversation Message Received",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "position": [0, 0],
  "webhookId": "deal-conversation-id"
}
```

---

### Testing Checklist for Issue 1
- [ ] Send message from guest with active booking → Routes to Workflow 22
- [ ] Send message from prospect with active deal → Routes to Workflow 6
- [ ] Send message from someone with BOTH booking AND deal → Prioritize booking (current guest)
- [ ] New inquiry (no booking, no deal) → Routes to Workflow 5 (unchanged)

---

## Issue 3: Payment Race Condition Fix

### Problem
Between payment link generation (Step 4) and Stripe webhook receipt (Step 9), the deal status could be modified by other workflows. This could process payment for a cancelled deal.

### Impact
- Payment processed for cancelled deal
- Guest charged but no booking created
- Refund required

### When to Apply
Apply this patch if you observe:
- Payments processed for deals with status other than "payment_pending"
- Race conditions during high-volume booking periods
- Payment/booking mismatches

### Solution
Add deal status validation in Stripe webhook handler before processing payment.

---

### Patch: Workflow 7 - Add Status Validation

**Insert after Stripe webhook receipt, before payment processing:**

```json
{
  "parameters": {
    "jsCode": "// ISSUE 3 FIX: Validate deal status before processing payment\nconst stripeEvent = $input.item.json;\nconst paymentIntentId = stripeEvent.data?.object?.payment_intent || stripeEvent.data?.object?.id;\n\n// Extract deal_id from Stripe metadata\nconst metadata = stripeEvent.data?.object?.metadata || {};\nconst dealId = metadata.deal_id;\n\nif (!dealId) {\n  return {\n    proceed: false,\n    error: 'no_deal_id_in_metadata',\n    message: 'Payment received but no deal_id in Stripe metadata'\n  };\n}\n\nreturn {\n  proceed: true,\n  deal_id: dealId,\n  payment_intent_id: paymentIntentId,\n  event_type: stripeEvent.type\n};"
  },
  "id": "extract-deal-from-stripe",
  "name": "Extract Deal ID from Stripe Event",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [220, 200]
}
```

**Add deal status check:**

```json
{
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT \n  deal_id,\n  status,\n  client_name,\n  proposed_price,\n  property_id\nFROM deals\nWHERE deal_id = $1\nLIMIT 1",
    "options": {}
  },
  "id": "verify-deal-status",
  "name": "Verify Deal Status",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [440, 200],
  "credentials": {
    "postgres": {
      "id": "postgres-credential-id",
      "name": "PostgreSQL"
    }
  }
}
```

**Add validation logic:**

```json
{
  "parameters": {
    "jsCode": "// Validate deal is still in payment_pending status\nconst dealData = $('Verify Deal Status').item.json;\nconst expectedStatus = 'payment_pending';\n\nif (!dealData || !dealData.deal_id) {\n  return {\n    valid: false,\n    error: 'deal_not_found',\n    action: 'refund_required',\n    message: `Deal not found for payment. Refund may be required.`\n  };\n}\n\nif (dealData.status !== expectedStatus) {\n  return {\n    valid: false,\n    error: 'invalid_deal_status',\n    current_status: dealData.status,\n    expected_status: expectedStatus,\n    action: dealData.status === 'cancelled' ? 'refund_required' : 'investigate',\n    message: `Deal status is '${dealData.status}' but expected '${expectedStatus}'. Payment should not be processed.`\n  };\n}\n\n// Deal is valid for payment processing\nreturn {\n  valid: true,\n  deal: dealData\n};"
  },
  "id": "validate-deal-for-payment",
  "name": "Validate Deal for Payment",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [660, 200]
}
```

**Add routing:**

```json
{
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "valid-check",
          "leftValue": "={{ $json.valid }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "true"
          }
        }
      ]
    }
  },
  "id": "check-deal-valid",
  "name": "Deal Valid for Payment?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [880, 200]
}
```

**Handle invalid state (refund/alert path):**

```json
{
  "parameters": {
    "jsCode": "// Handle invalid deal state - alert owner and possibly refund\nconst validation = $input.item.json;\nconst alertMessage = `⚠️ **PAYMENT RACE CONDITION DETECTED**\\n\\nA payment was received but the deal is no longer valid for processing.\\n\\n**Error:** ${validation.error}\\n**Current Status:** ${validation.current_status || 'N/A'}\\n**Action Required:** ${validation.action}\\n\\n${validation.message}`;\n\nreturn {\n  alert_needed: true,\n  alert_message: alertMessage,\n  refund_required: validation.action === 'refund_required',\n  payment_intent_id: $('Extract Deal ID from Stripe Event').item.json.payment_intent_id\n};"
  },
  "id": "handle-invalid-payment",
  "name": "Handle Invalid Payment State",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1100, 320]
}
```

---

### Connection Changes for Issue 3

```
BEFORE:
Stripe Webhook → Process Payment → Create Booking

AFTER:
Stripe Webhook → Extract Deal ID → Verify Deal Status → Validate Deal for Payment
    ├── [Valid] → Process Payment → Create Booking (existing flow)
    └── [Invalid] → Handle Invalid Payment State → Alert Owner + Initiate Refund
```

---

### Testing Checklist for Issue 3
- [ ] Normal payment flow with valid deal → Processes correctly
- [ ] Payment arrives but deal was cancelled → Blocks processing, alerts owner
- [ ] Payment arrives but deal already paid → Blocks duplicate processing
- [ ] Payment with no deal_id in metadata → Logs error, alerts admin
- [ ] Refund initiated for blocked payments

---

## Issue 4: Timeout Auto-Approval Removal

### Problem
Workflow 2 (Conflict Priority Manager) has a 24-hour timeout that auto-selects the highest priority deal without explicit owner consent. Owner might not want ANY booking approved.

### Impact
- Unwanted bookings confirmed
- Owner loses control over property availability
- Potential conflicts with personal use

### When to Apply
Apply this patch if owners report:
- Bookings confirmed they didn't approve
- Loss of control during high-demand periods
- Personal use conflicts

### Solution
Change 24h timeout behavior from auto-approval to:
1. Send reminder at 12 hours
2. Send escalation at 24 hours to emergency contact
3. No auto-approval - require explicit action

---

### Patch: Workflow 2 - Replace Auto-Approval with Escalation

**Replace the existing timeout handler:**

```json
{
  "parameters": {
    "resume": "webhook",
    "options": {
      "webhookId": "conflict-owner-decision"
    }
  },
  "id": "wait-for-owner-decision",
  "name": "Wait for Owner Decision",
  "type": "n8n-nodes-base.wait",
  "typeVersion": 1.1,
  "position": [1100, 0]
}
```

**Add 12-hour reminder workflow branch:**

Instead of auto-approval, add a parallel scheduled check:

```json
{
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "hours",
          "hoursInterval": 12
        }
      ]
    }
  },
  "id": "reminder-check-trigger",
  "name": "12 Hour Reminder Check",
  "type": "n8n-nodes-base.scheduleTrigger",
  "typeVersion": 1.2,
  "position": [0, 400]
}
```

**Check for pending conflicts:**

```json
{
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT \n  c.conflict_id,\n  c.property_id,\n  c.created_at,\n  c.owner_contact,\n  c.owner_platform,\n  p.property_name,\n  EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600 as hours_pending\nFROM booking_conflicts c\nJOIN property_configurations p ON c.property_id = p.property_id\nWHERE c.status = 'pending'\n  AND c.created_at < NOW() - INTERVAL '12 hours'\nORDER BY c.created_at ASC",
    "options": {}
  },
  "id": "check-pending-conflicts",
  "name": "Check Pending Conflicts",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [220, 400],
  "credentials": {
    "postgres": {
      "id": "postgres-credential-id",
      "name": "PostgreSQL"
    }
  }
}
```

**Send reminder:**

```json
{
  "parameters": {
    "jsCode": "// Format reminder message\nconst conflicts = $input.all();\nconst reminders = [];\n\nfor (const conflict of conflicts) {\n  const c = conflict.json;\n  const hoursPending = Math.floor(c.hours_pending);\n  \n  let urgency = '';\n  let action = '';\n  \n  if (hoursPending >= 24) {\n    urgency = '🚨 URGENT: ';\n    action = 'This will be escalated to your emergency contact if not resolved within 2 hours.';\n  } else if (hoursPending >= 12) {\n    urgency = '⏰ REMINDER: ';\n    action = 'Please make a decision to avoid potential double-booking issues.';\n  }\n  \n  reminders.push({\n    conflict_id: c.conflict_id,\n    property_name: c.property_name,\n    hours_pending: hoursPending,\n    owner_contact: c.owner_contact,\n    owner_platform: c.owner_platform,\n    message: `${urgency}Booking Conflict Pending\\n\\n**Property:** ${c.property_name}\\n**Waiting:** ${hoursPending} hours\\n\\n${action}\\n\\nPlease choose an action in your conflict resolution message.`\n  });\n}\n\nreturn reminders;"
  },
  "id": "format-reminders",
  "name": "Format Conflict Reminders",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [440, 400]
}
```

**Escalation logic (after 24+ hours):**

```json
{
  "parameters": {
    "jsCode": "// Check if escalation needed (> 24 hours)\nconst reminder = $input.item.json;\n\nif (reminder.hours_pending >= 24) {\n  return {\n    needs_escalation: true,\n    escalate_to: 'emergency_contact',\n    message: `🚨 **ESCALATION: Unresolved Booking Conflict**\\n\\n**Property:** ${reminder.property_name}\\n**Pending for:** ${reminder.hours_pending} hours\\n\\nThe property owner has not responded to this conflict. Please contact them directly or make a decision on their behalf.\\n\\n⚠️ No booking will be auto-confirmed. Manual action required.`,\n    original_reminder: reminder\n  };\n}\n\nreturn {\n  needs_escalation: false,\n  send_reminder: true,\n  ...reminder\n};"
  },
  "id": "check-escalation-needed",
  "name": "Check Escalation Needed",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [660, 400]
}
```

---

### Key Behavior Change

```
BEFORE (Dangerous):
24h timeout → Auto-select highest priority deal → Confirm booking

AFTER (Safe):
12h → Send reminder to owner
24h → Escalate to emergency contact
Never → No auto-approval, always require explicit action
```

---

### Database Change for Issue 4

Add emergency_contact to property_configurations:

```sql
ALTER TABLE property_configurations 
ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(100),
ADD COLUMN IF NOT EXISTS emergency_contact_platform VARCHAR(50) DEFAULT 'telegram';

COMMENT ON COLUMN property_configurations.emergency_contact IS 'Contact to escalate to if owner unresponsive for 24+ hours';
```

---

### Testing Checklist for Issue 4
- [ ] Conflict created → 12 hours pass → Reminder sent to owner
- [ ] Conflict unresolved → 24 hours pass → Escalated to emergency contact
- [ ] No auto-approval ever occurs
- [ ] Owner can still resolve at any time
- [ ] Emergency contact can resolve on behalf of owner
- [ ] All parties can choose "Decline All" to block both bookings

---

## Implementation Priority

| Issue | Risk Level | Apply When |
|-------|------------|------------|
| Issue 1 (Routing) | Medium | Observed message routing errors |
| Issue 3 (Payment) | Medium | Payment/deal status mismatches |
| Issue 4 (Timeout) | Medium | Unwanted bookings confirmed |

**Recommendation:** Monitor production for 2-4 weeks after deploying Phase 1 and 2 patches. Only apply Phase 3 patches if you observe the specific problems they address.

---

## General Testing Approach

Before deploying any Phase 3 patch:
1. Create a test environment (use the Hetzner setup guide)
2. Import workflows into test environment
3. Apply patch to test environment
4. Run through all checklist items
5. Monitor for 48 hours
6. Deploy to production during low-traffic period

---

*Phase 3 Patches Reference Document - Apply only when needed*

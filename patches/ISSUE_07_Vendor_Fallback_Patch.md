# Issue 7: Vendor Assignment Fallback Patch

## Problem
Workflow 13 (Maintenance Ticket Management) continues with a null vendor if all vendors are at max capacity. This creates "orphan" tickets that never get assigned and could be missed.

## Impact
- Maintenance tickets created but never assigned
- No alerts to owner when vendors unavailable
- Guest issues could go unresolved
- Property damage could worsen

## Solution
Add fallback logic that:
1. Detects when no vendors are available
2. Creates an urgent owner task
3. Alerts owner via Telegram/WhatsApp with action buttons
4. Logs the vendor shortage for analysis

---

## Patch Location

**Workflow:** Workflow 13 (Multi-Channel Maintenance Ticket Creator)

**Insert After:** Step 9 (Score and Select Vendor)

**Insert Before:** Step 10 (Update Ticket with Vendor)

---

## Code Patch

### Modified Node: "Score and Select Vendor"

Replace the existing vendor selection code to include fallback handling:

```json
{
  "parameters": {
    "jsCode": "// ISSUE 7 FIX: Add vendor assignment fallback\nconst vendors = $('Query Vendors').all();\nconst propertyConfig = $('Get Property Configuration').item.json;\nconst ticketData = $('Parse AI Response').item.json;\n\n// Check if any vendors are available\nif (!vendors || vendors.length === 0) {\n  // NO VENDORS AVAILABLE - Trigger fallback\n  return {\n    vendor_found: false,\n    fallback_triggered: true,\n    fallback_reason: 'no_vendors_in_category',\n    category: ticketData.category,\n    urgency: ticketData.urgency,\n    ticket_id: $('Create Maintenance Ticket').item.json.ticket_id,\n    property_name: ticketData.property_name,\n    issue_description: ticketData.issue_description,\n    owner_contact: propertyConfig.owner_contact,\n    owner_platform: propertyConfig.owner_preferred_platform || 'telegram',\n    alert_message: `🔧 **VENDOR UNAVAILABLE**\\n\\nA maintenance ticket requires attention but no ${ticketData.vendor_type} vendors are currently available.\\n\\n**Property:** ${ticketData.property_name}\\n**Issue:** ${ticketData.issue_description}\\n**Category:** ${ticketData.category}\\n**Urgency:** ${ticketData.urgency.toUpperCase()}\\n\\nPlease assign a vendor manually or contact your maintenance network.`\n  };\n}\n\n// Check designated vendor first\nconst designatedVendor = propertyConfig.designated_vendors?.[ticketData.category];\nif (designatedVendor) {\n  const designated = vendors.find(v => \n    v.json.vendor_name.toLowerCase() === designatedVendor.toLowerCase()\n  );\n  if (designated && parseInt(designated.json.current_jobs) < parseInt(designated.json.max_concurrent_jobs)) {\n    return {\n      vendor_found: true,\n      fallback_triggered: false,\n      selected_vendor: designated.json,\n      selection_reason: 'designated_vendor'\n    };\n  }\n}\n\n// Score remaining vendors\nlet scoredVendors = vendors.map(v => {\n  const vendor = v.json;\n  let score = parseFloat(vendor.average_rating || 5) * 10;\n  \n  // Prefer lower cost for non-emergency\n  if (ticketData.urgency !== 'emergency' && vendor.cost_level === 'low') {\n    score += 5;\n  }\n  \n  // Penalize high workload\n  score -= (parseInt(vendor.current_jobs || 0) * 3);\n  \n  return {\n    ...vendor,\n    score\n  };\n});\n\n// Sort by score descending\nscoredVendors.sort((a, b) => b.score - a.score);\n\n// Check if top vendor is actually available\nconst topVendor = scoredVendors[0];\nif (parseInt(topVendor.current_jobs) >= parseInt(topVendor.max_concurrent_jobs)) {\n  // All vendors at capacity - trigger fallback\n  return {\n    vendor_found: false,\n    fallback_triggered: true,\n    fallback_reason: 'all_vendors_at_capacity',\n    category: ticketData.category,\n    urgency: ticketData.urgency,\n    ticket_id: $('Create Maintenance Ticket').item.json.ticket_id,\n    property_name: ticketData.property_name,\n    issue_description: ticketData.issue_description,\n    owner_contact: propertyConfig.owner_contact,\n    owner_platform: propertyConfig.owner_preferred_platform || 'telegram',\n    available_vendors_count: 0,\n    total_vendors_checked: vendors.length,\n    alert_message: `🔧 **ALL VENDORS AT CAPACITY**\\n\\nA maintenance ticket requires attention but all ${ticketData.vendor_type} vendors are currently at maximum workload.\\n\\n**Property:** ${ticketData.property_name}\\n**Issue:** ${ticketData.issue_description}\\n**Category:** ${ticketData.category}\\n**Urgency:** ${ticketData.urgency.toUpperCase()}\\n**Vendors Checked:** ${vendors.length}\\n\\nPlease assign a vendor manually or wait for availability.`\n  };\n}\n\n// Return selected vendor\nreturn {\n  vendor_found: true,\n  fallback_triggered: false,\n  selected_vendor: topVendor,\n  selection_reason: 'highest_score',\n  score: topVendor.score\n};"
  },
  "id": "score-and-select-vendor-v2",
  "name": "Score and Select Vendor",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1100, 200]
}
```

---

### New Node: "Check Vendor Assignment"

Add IF node to route based on vendor found:

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
          "id": "vendor-found",
          "leftValue": "={{ $json.vendor_found }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "true"
          }
        }
      ]
    }
  },
  "id": "check-vendor-assignment",
  "name": "Vendor Found?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [1320, 200]
}
```

---

### New Node: "Create Urgent Owner Task"

When no vendor available, create task for owner:

```json
{
  "parameters": {
    "operation": "executeQuery",
    "query": "INSERT INTO customer_tasks (\n  task_id,\n  property_id,\n  task_type,\n  description,\n  priority,\n  status,\n  due_date,\n  notes,\n  created_by\n) VALUES (\n  'task_' || EXTRACT(EPOCH FROM NOW())::text || '_' || substr(md5(random()::text), 1, 6),\n  $1,\n  'vendor_assignment_required',\n  'Maintenance ticket requires manual vendor assignment',\n  CASE WHEN $2 IN ('emergency', 'high') THEN 'urgent' ELSE 'high' END,\n  'pending',\n  CASE WHEN $2 = 'emergency' THEN NOW() + INTERVAL '2 hours' ELSE NOW() + INTERVAL '24 hours' END,\n  $3,\n  'system_fallback'\n)\nRETURNING task_id",
    "options": {}
  },
  "id": "create-urgent-owner-task",
  "name": "Create Urgent Owner Task",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [1540, 320],
  "credentials": {
    "postgres": {
      "id": "postgres-credential-id",
      "name": "PostgreSQL"
    }
  }
}
```

---

### New Node: "Update Ticket - Awaiting Assignment"

Mark ticket as awaiting manual assignment:

```json
{
  "parameters": {
    "operation": "executeQuery",
    "query": "UPDATE maintenance_tickets\nSET status = 'awaiting_manual_assignment',\n    notes = COALESCE(notes || E'\\n', '') || 'System fallback: ' || $2 || ' - Task created for owner',\n    updated_at = CURRENT_TIMESTAMP\nWHERE ticket_id = $1",
    "options": {}
  },
  "id": "update-ticket-awaiting",
  "name": "Update Ticket - Awaiting Assignment",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [1540, 440],
  "credentials": {
    "postgres": {
      "id": "postgres-credential-id",
      "name": "PostgreSQL"
    }
  }
}
```

---

### New Node: "Route Fallback Alert"

Route alert by owner's preferred platform:

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
          "id": "platform-check",
          "leftValue": "={{ $('Score and Select Vendor').item.json.owner_platform }}",
          "rightValue": "telegram",
          "operator": {
            "type": "string",
            "operation": "equals"
          }
        }
      ]
    }
  },
  "id": "route-fallback-alert",
  "name": "Route Fallback Alert",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [1760, 380]
}
```

---

### New Nodes: "Send Fallback Alert (Telegram/WhatsApp)"

```json
{
  "parameters": {
    "chatId": "={{ $('Score and Select Vendor').item.json.owner_contact }}",
    "text": "={{ $('Score and Select Vendor').item.json.alert_message }}",
    "additionalFields": {
      "parse_mode": "Markdown",
      "reply_markup": {
        "inline_keyboard": [
          [
            {
              "text": "📞 Call Backup Vendor",
              "callback_data": "fallback_call_vendor_{{ $('Score and Select Vendor').item.json.ticket_id }}"
            },
            {
              "text": "✋ I'll Handle This",
              "callback_data": "fallback_owner_handle_{{ $('Score and Select Vendor').item.json.ticket_id }}"
            }
          ],
          [
            {
              "text": "⏰ Remind Me in 2 Hours",
              "callback_data": "fallback_remind_{{ $('Score and Select Vendor').item.json.ticket_id }}"
            }
          ]
        ]
      }
    }
  },
  "id": "send-fallback-telegram",
  "name": "Send Fallback Alert (Telegram)",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [1980, 320],
  "credentials": {
    "telegramApi": {
      "id": "telegram-credential-id",
      "name": "Telegram Bot"
    }
  }
}
```

```json
{
  "parameters": {
    "operation": "send",
    "phoneNumber": "={{ $('Score and Select Vendor').item.json.owner_contact }}",
    "text": "={{ $('Score and Select Vendor').item.json.alert_message }}"
  },
  "id": "send-fallback-whatsapp",
  "name": "Send Fallback Alert (WhatsApp)",
  "type": "n8n-nodes-base.whatsApp",
  "typeVersion": 1,
  "position": [1980, 460],
  "credentials": {
    "whatsAppApi": {
      "id": "whatsapp-credential-id",
      "name": "WhatsApp Business"
    }
  }
}
```

---

### New Node: "Log Vendor Shortage"

Track vendor availability issues:

```json
{
  "parameters": {
    "operation": "executeQuery",
    "query": "INSERT INTO workflow_errors (\n  workflow_name,\n  error_message,\n  severity,\n  created_at\n) VALUES (\n  'Maintenance Ticket Management',\n  'Vendor fallback triggered: ' || $1,\n  CASE WHEN $2 IN ('emergency', 'high') THEN 'critical' ELSE 'warning' END,\n  NOW()\n)",
    "options": {}
  },
  "id": "log-vendor-shortage",
  "name": "Log Vendor Shortage",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [2200, 380],
  "credentials": {
    "postgres": {
      "id": "postgres-credential-id",
      "name": "PostgreSQL"
    }
  }
}
```

---

## Connection Changes

1. **Existing:** `Score and Select Vendor` → `Update Ticket with Vendor`
2. **Change to:** `Score and Select Vendor` → `Vendor Found?`
3. **Connect (true/vendor found):** `Vendor Found?` → `Update Ticket with Vendor` (continue existing flow)
4. **Connect (false/no vendor):** `Vendor Found?` → `Create Urgent Owner Task`
5. **Connect:** `Create Urgent Owner Task` → `Update Ticket - Awaiting Assignment`
6. **Connect:** `Update Ticket - Awaiting Assignment` → `Route Fallback Alert`
7. **Connect (telegram):** `Route Fallback Alert` → `Send Fallback Alert (Telegram)`
8. **Connect (whatsapp):** `Route Fallback Alert` → `Send Fallback Alert (WhatsApp)`
9. **Connect both alert outputs to:** `Log Vendor Shortage`

---

## Visual Workflow Change

```
BEFORE:
Query Vendors → Score and Select Vendor → Update Ticket with Vendor → ...

AFTER:
Query Vendors → Score and Select Vendor → Vendor Found?
    ├── [YES] → Update Ticket with Vendor → ... (existing flow)
    └── [NO] → Create Urgent Owner Task 
               → Update Ticket - Awaiting Assignment
               → Route Fallback Alert
                   ├── [Telegram] → Send Fallback Alert (Telegram)
                   └── [WhatsApp] → Send Fallback Alert (WhatsApp)
               → Log Vendor Shortage
```

---

## Testing Checklist

- [ ] Normal case: vendors available → assigns highest scored vendor
- [ ] Empty vendors list → triggers fallback, creates task, alerts owner
- [ ] All vendors at capacity → triggers fallback
- [ ] Emergency ticket with no vendor → creates URGENT task with 2-hour deadline
- [ ] Owner receives alert with action buttons
- [ ] Ticket status shows "awaiting_manual_assignment"
- [ ] Fallback logged in workflow_errors table
- [ ] Watchdog picks up vendor shortage in next run

---

## Rollback

To rollback this patch:
1. Restore original `Score and Select Vendor` code (without fallback logic)
2. Delete nodes: `Vendor Found?`, `Create Urgent Owner Task`, `Update Ticket - Awaiting Assignment`, `Route Fallback Alert`, alert nodes, `Log Vendor Shortage`
3. Reconnect: `Score and Select Vendor` directly to `Update Ticket with Vendor`

---

*Patch created for Issue 7: Vendor Assignment Fallback*

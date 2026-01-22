# Issue 2: Discount Stacking Prevention Patch

## Problem
Workflow 6 (AI Sales Negotiation Bot) validates if requested discount exceeds `max_allowed` but doesn't check if a discount was already applied to the deal. This could allow stacking multiple discounts.

## Impact
- Guests could negotiate multiple discounts
- Revenue loss from compounded discounts
- Pricing integrity compromised

## Solution
Add validation check before applying any new discount to ensure `deal.discount_percentage === 0`.

---

## Patch Location

**Workflow:** Workflow 6 (AI Conversation Manager / AI Sales Negotiation Bot)

**Insert After:** Step 10B (Parse AI Function Call) - after the `apply_discount` function is detected

**Insert Before:** Step 10C (existing discount validation)

---

## Code Patch

### New Node: "Check Discount Already Applied"

Add this Code node between the function detection and the existing discount validation:

```json
{
  "parameters": {
    "jsCode": "// ISSUE 2 FIX: Prevent discount stacking\n// This check runs when AI requests apply_discount function\n\nconst dealData = $('Get Deal Data').item.json;\nconst functionCall = $('Parse AI Function Call').item.json;\n\n// Only check if this is a discount request\nif (functionCall.function_name !== 'apply_discount') {\n  // Not a discount request, pass through\n  return {\n    proceed: true,\n    reason: 'not_discount_request',\n    ...functionCall\n  };\n}\n\n// Check if discount already applied\nconst existingDiscount = parseFloat(dealData.discount_percentage || 0);\n\nif (existingDiscount > 0) {\n  // BLOCK: Discount already applied\n  return {\n    proceed: false,\n    blocked: true,\n    reason: 'discount_already_applied',\n    existing_discount: existingDiscount,\n    message: `A ${existingDiscount}% discount has already been applied to this booking. I'm unable to add an additional discount, but I can check if there are other ways I can help make your stay more valuable.`,\n    original_request: functionCall\n  };\n}\n\n// No existing discount, proceed with normal validation\nreturn {\n  proceed: true,\n  reason: 'no_existing_discount',\n  existing_discount: 0,\n  ...functionCall\n};"
  },
  "id": "check-discount-already-applied",
  "name": "Check Discount Already Applied",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [920, 300]
}
```

---

### Modified Switch Node: Route After Discount Check

Update the existing routing after discount validation to include the blocked path:

```json
{
  "parameters": {
    "rules": {
      "rules": [
        {
          "outputKey": "proceed",
          "conditions": {
            "conditions": [
              {
                "leftValue": "={{ $json.proceed }}",
                "rightValue": true,
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                }
              }
            ]
          }
        },
        {
          "outputKey": "blocked",
          "conditions": {
            "conditions": [
              {
                "leftValue": "={{ $json.blocked }}",
                "rightValue": true,
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                }
              }
            ]
          }
        }
      ]
    }
  },
  "id": "route-discount-check",
  "name": "Route Discount Check Result",
  "type": "n8n-nodes-base.switch",
  "typeVersion": 3.2,
  "position": [1140, 300]
}
```

---

### Blocked Path: Send Rejection Message

When discount is blocked, send friendly message back to guest:

```json
{
  "parameters": {
    "jsCode": "// Format rejection message for blocked discount\nconst blockData = $input.item.json;\n\nreturn {\n  response_text: blockData.message,\n  control_signal: 'DISCOUNT_BLOCKED',\n  should_respond: true,\n  deal_id: $('Workflow Configuration').item.json.deal_id,\n  channel_type: $('Workflow Configuration').item.json.channel_type\n};"
  },
  "id": "format-discount-blocked-response",
  "name": "Format Discount Blocked Response",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1360, 420]
}
```

---

## Connection Changes

1. **Disconnect:** `Parse AI Function Call` → `Validate Discount Amount`
2. **Connect:** `Parse AI Function Call` → `Check Discount Already Applied`
3. **Connect:** `Check Discount Already Applied` → `Route Discount Check Result`
4. **Connect (proceed output):** `Route Discount Check Result` → `Validate Discount Amount` (existing node)
5. **Connect (blocked output):** `Route Discount Check Result` → `Format Discount Blocked Response`
6. **Connect:** `Format Discount Blocked Response` → `Send Response to Guest` (merge with other response paths)

---

## Visual Workflow Change

```
BEFORE:
Parse AI Function Call → Validate Discount Amount → Apply Discount

AFTER:
Parse AI Function Call 
    ↓
Check Discount Already Applied
    ↓
Route Discount Check Result
    ├── [proceed] → Validate Discount Amount → Apply Discount
    └── [blocked] → Format Discount Blocked Response → Send Response
```

---

## Database Logging (Optional Enhancement)

Add logging when discount is blocked for audit purposes:

```sql
INSERT INTO conversation_log (
  deal_id,
  event_type,
  event_details,
  created_at
) VALUES (
  $1,  -- deal_id
  'discount_blocked',
  jsonb_build_object(
    'existing_discount', $2,
    'requested_discount', $3,
    'blocked_at', NOW()
  ),
  NOW()
);
```

---

## Testing Checklist

- [ ] Create deal with 0% discount → Request 10% → Should APPLY (proceed)
- [ ] Deal now has 10% → Request another 5% → Should BLOCK
- [ ] Blocked message sent to guest is friendly and helpful
- [ ] Deal discount_percentage unchanged after block
- [ ] Log entry created for blocked attempt
- [ ] AI can still offer other value (late checkout, etc.) after discount blocked

---

## Rollback

To rollback this patch:
1. Delete nodes: `Check Discount Already Applied`, `Route Discount Check Result`, `Format Discount Blocked Response`
2. Reconnect: `Parse AI Function Call` directly to `Validate Discount Amount`

---

*Patch created for Issue 2: Discount Stacking Prevention*

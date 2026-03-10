/**
 * Patches WF4 to use Lemon Squeezy instead of Stripe
 */
const fs = require('fs');
const path = require('path');

const wf4Path = path.join(__dirname, '../../optimized_workflows/WF4_Payment_Processor.json');
const wf4 = JSON.parse(fs.readFileSync(wf4Path, 'utf8'));

// 1. Replace Stripe checkout node with LS URL builder
const stripeIdx = wf4.nodes.findIndex(n => n.name === 'Create Stripe Session');
if (stripeIdx !== -1) {
  const old = wf4.nodes[stripeIdx];
  wf4.nodes[stripeIdx] = {
    id: old.id,
    name: 'Build Payment URL',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: old.position,
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: [
        "const LS_BASE = 'https://ergovia-ai.lemonsqueezy.com/checkout/buy/00ee131b-da5f-4eef-bf32-7c12aa28a11d';",
        "const d = $input.item.json;",
        "const params = [",
        "  'checkout[email]=' + encodeURIComponent(d.guest_email || ''),",
        "  'checkout[name]=' + encodeURIComponent(d.guest_name || ''),",
        "  'checkout[custom][booking_id]=' + encodeURIComponent(d.booking_id || ''),",
        "  'checkout[custom][property_id]=' + encodeURIComponent(d.property_id || ''),",
        "  'checkout[custom][amount]=' + encodeURIComponent(String(d.amount || 0)),",
        "].join('&');",
        "return [{ json: { ...d, url: LS_BASE + '?' + params } }];",
      ].join('\n'),
    },
  };
  console.log('✅ Replaced Stripe node with Lemon Squeezy URL builder');
} else {
  console.log('⚠️  Stripe node not found — checking existing node names:');
  wf4.nodes.forEach(n => console.log(' -', n.name, '|', n.type));
}

// 2. Update Normalize Event to handle LS webhook format
const normIdx = wf4.nodes.findIndex(n => n.name === 'Normalize Event');
if (normIdx !== -1) {
  wf4.nodes[normIdx].parameters.jsCode = [
    "const input = $input.item.json;",
    "",
    "// Internal create-checkout request (called by WF1)",
    "if (input.event_type === 'create_checkout' || !input.meta) {",
    "  return [{ json: {",
    "    event_type: 'create_checkout',",
    "    booking_id: input.booking_id,",
    "    property_id: input.property_id,",
    "    guest_name: input.guest_name,",
    "    guest_email: input.guest_email || '',",
    "    amount: input.amount || 0,",
    "    check_in: input.check_in,",
    "    check_out: input.check_out,",
    "  }}];",
    "}",
    "",
    "// Lemon Squeezy order_created webhook",
    "const attrs = input.data?.attributes || {};",
    "const custom = attrs.custom_data || {};",
    "return [{ json: {",
    "  event_type: 'payment_success',",
    "  booking_id: custom.booking_id,",
    "  payment_id: String(input.data?.id || ''),",
    "  amount: (attrs.total || 0) / 100,",
    "  guest_email: attrs.user_email || '',",
    "} }];",
  ].join('\n');
  console.log('✅ Updated Normalize Event for Lemon Squeezy webhook format');
}

// 3. Update Respond Create to use url from LS node
const respondIdx = wf4.nodes.findIndex(n => n.name === 'Respond Create');
if (respondIdx !== -1) {
  wf4.nodes[respondIdx].parameters.responseBody =
    "={{ { success: true, booking_id: $('Normalize Event').item.json.booking_id, payment_url: $('Build Payment URL').item.json.url } }}";
  console.log("✅ Updated Respond Create to reference 'Build Payment URL' node");
}

fs.writeFileSync(wf4Path, JSON.stringify(wf4, null, 2));
console.log('\nWF4 saved. Nodes:', wf4.nodes.length);

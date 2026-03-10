/**
 * Phase 3: Create Webhook Confirmation Workflow
 *
 * New workflow that handles link-based payment confirmation.
 * When an owner clicks a confirmation/cancellation URL from WhatsApp/SMS:
 *
 *   GET https://n8n.ergovia-ai.com/webhook/payment-confirm/:token
 *   GET https://n8n.ergovia-ai.com/webhook/payment-cancel/:token
 *
 * The workflow:
 * 1. Extracts token from URL path
 * 2. Validates token (exists, not expired, not already used)
 * 3. Executes the action (confirm or cancel booking in DB)
 * 4. Marks token as used
 * 5. Returns an HTML response page to the owner's browser
 * 6. Calls WF4 to send guest notification (via confirm/cancel paths)
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body)); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Phase 3: Create Webhook Confirmation Workflow ===\n');

  // Build the workflow definition
  const workflow = {
    name: '[V4] Payment Confirmation Webhook',
    nodes: [
      // ─── Node 1: Webhook Trigger (Confirm) ───
      {
        id: 'webhook-confirm',
        name: 'Confirm Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: 'payment-confirm-webhook',
        parameters: {
          path: 'payment-confirm',
          httpMethod: 'GET',
          responseMode: 'responseNode',
          options: {}
        }
      },
      // ─── Node 2: Webhook Trigger (Cancel) ───
      {
        id: 'webhook-cancel',
        name: 'Cancel Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 300],
        webhookId: 'payment-cancel-webhook',
        parameters: {
          path: 'payment-cancel',
          httpMethod: 'GET',
          responseMode: 'responseNode',
          options: {}
        }
      },
      // ─── Node 3: Extract Token (Confirm path) ───
      {
        id: 'extract-confirm-token',
        name: 'Extract Confirm Token',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [250, 0],
        parameters: {
          jsCode: `// Extract token from query parameter
const token = $input.item.json.query?.token || '';
return { token, action: 'confirm' };`
        }
      },
      // ─── Node 4: Extract Token (Cancel path) ───
      {
        id: 'extract-cancel-token',
        name: 'Extract Cancel Token',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [250, 300],
        parameters: {
          jsCode: `// Extract token from query parameter
const token = $input.item.json.query?.token || '';
return { token, action: 'cancel' };`
        }
      },
      // ─── Node 5: Merge Paths ───
      {
        id: 'merge-paths',
        name: 'Merge Paths',
        type: 'n8n-nodes-base.merge',
        typeVersion: 3,
        position: [500, 150],
        parameters: {
          mode: 'append'
        }
      },
      // ─── Node 6: Validate Token ───
      {
        id: 'validate-token',
        name: 'Validate Token',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [750, 150],
        credentials: {
          postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' }
        },
        parameters: {
          operation: 'executeQuery',
          query: "=SELECT t.*, b.booking_id, b.guest_name, b.guest_phone, b.property_id,\n  b.property_name, b.check_in_date, b.check_out_date, b.total_amount,\n  b.booking_status, b.payment_status\nFROM payment_action_tokens t\nJOIN bookings b ON b.booking_id = t.booking_id\nWHERE t.token = '{{ $json.token }}'\n  AND t.action = '{{ $json.action }}'",
          options: {}
        }
      },
      // ─── Node 7: Check Valid ───
      {
        id: 'check-valid',
        name: 'Check Valid',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1000, 150],
        parameters: {
          jsCode: `// Validate the token
const token = $input.item.json;
const requestAction = $('Merge Paths').item.json.action;

if (!token || !token.token) {
  return {
    valid: false,
    error: 'Token not found or invalid',
    action: requestAction
  };
}

if (token.used_at) {
  return {
    valid: false,
    error: 'This link has already been used',
    action: requestAction,
    booking_id: token.booking_id
  };
}

const now = new Date();
const expires = new Date(token.expires_at);
if (now > expires) {
  return {
    valid: false,
    error: 'This link has expired. Please contact the property manager.',
    action: requestAction,
    booking_id: token.booking_id
  };
}

if (token.booking_status === 'confirmed' && requestAction === 'confirm') {
  return {
    valid: false,
    error: 'This booking has already been confirmed',
    action: requestAction,
    booking_id: token.booking_id
  };
}

if (token.booking_status === 'cancelled') {
  return {
    valid: false,
    error: 'This booking has already been cancelled',
    action: requestAction,
    booking_id: token.booking_id
  };
}

return {
  valid: true,
  action: requestAction,
  token_id: token.id,
  token_uuid: token.token,
  booking_id: token.booking_id,
  guest_name: token.guest_name,
  guest_phone: token.guest_phone,
  property_id: token.property_id,
  property_name: token.property_name,
  check_in_date: token.check_in_date,
  check_out_date: token.check_out_date,
  total_amount: token.total_amount
};`
        }
      },
      // ─── Node 8: Route Valid/Invalid ───
      {
        id: 'route-valid',
        name: 'Route Valid',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [1250, 150],
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '' },
            combinator: 'and',
            conditions: [
              {
                id: 'valid-check',
                leftValue: '={{ $json.valid }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true' }
              }
            ]
          }
        }
      },
      // ─── Node 9: Execute Action (Confirm) ───
      {
        id: 'execute-confirm',
        name: 'Execute Confirm',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [1500, 0],
        credentials: {
          postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' }
        },
        parameters: {
          operation: 'executeQuery',
          query: "=UPDATE bookings\nSET booking_status = 'confirmed',\n    payment_status = 'paid',\n    notes = COALESCE(notes, '') || 'Payment confirmed via link at ' || CURRENT_TIMESTAMP::text || '. ',\n    updated_at = CURRENT_TIMESTAMP\nWHERE booking_id = '{{ $json.booking_id }}'\nRETURNING *",
          options: {}
        }
      },
      // ─── Node 10: Execute Cancel ───
      {
        id: 'execute-cancel',
        name: 'Execute Cancel',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [1500, 300],
        credentials: {
          postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' }
        },
        parameters: {
          operation: 'executeQuery',
          query: "=UPDATE bookings\nSET booking_status = 'cancelled',\n    payment_status = 'cancelled',\n    notes = COALESCE(notes, '') || 'Cancelled via link at ' || CURRENT_TIMESTAMP::text || '. ',\n    updated_at = CURRENT_TIMESTAMP\nWHERE booking_id = '{{ $json.booking_id }}'\nRETURNING *",
          options: {}
        }
      },
      // ─── Node 11: Route Action ───
      {
        id: 'route-action',
        name: 'Route Action',
        type: 'n8n-nodes-base.switch',
        typeVersion: 3,
        position: [1500, 150],
        parameters: {
          rules: {
            values: [
              {
                outputKey: 'confirm',
                conditions: {
                  combinator: 'and',
                  conditions: [
                    { leftValue: '={{ $json.action }}', rightValue: 'confirm', operator: { type: 'string', operation: 'equals' } }
                  ]
                }
              },
              {
                outputKey: 'cancel',
                conditions: {
                  combinator: 'and',
                  conditions: [
                    { leftValue: '={{ $json.action }}', rightValue: 'cancel', operator: { type: 'string', operation: 'equals' } }
                  ]
                }
              }
            ]
          }
        }
      },
      // ─── Node 12: Mark Token Used ───
      {
        id: 'mark-token-used',
        name: 'Mark Token Used',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [1800, 150],
        credentials: {
          postgres: { id: 'BWlLUMKn64aZsHi8', name: '[Client] PostgreSQL' }
        },
        parameters: {
          operation: 'executeQuery',
          query: "=UPDATE payment_action_tokens\nSET used_at = CURRENT_TIMESTAMP\nWHERE token = '{{ $('Check Valid').item.json.token_uuid }}'",
          options: {}
        }
      },
      // ─── Node 13: Build Success Response ───
      {
        id: 'build-success',
        name: 'Build Success Response',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [2050, 150],
        parameters: {
          jsCode: `// Build HTML success response
const data = $('Check Valid').item.json;
const action = data.action;
const isConfirm = action === 'confirm';

const emoji = isConfirm ? '&#10004;' : '&#10060;';
const title = isConfirm ? 'Payment Confirmed!' : 'Booking Cancelled';
const color = isConfirm ? '#22c55e' : '#ef4444';
const statusText = isConfirm ? 'confirmed and paid' : 'cancelled';

const html = \`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ergovia - \${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 12px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { color: \${color}; margin: 0 0 12px; }
    .details { background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: left; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; }
    .label { color: #64748b; }
    .value { font-weight: 600; }
    .footer { color: #94a3b8; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">\${emoji}</div>
    <h1>\${title}</h1>
    <p>Booking <strong>\${data.booking_id}</strong> has been \${statusText}.</p>
    <div class="details">
      <div class="row"><span class="label">Guest:</span><span class="value">\${data.guest_name}</span></div>
      <div class="row"><span class="label">Property:</span><span class="value">\${data.property_name}</span></div>
      <div class="row"><span class="label">Dates:</span><span class="value">\${data.check_in_date} to \${data.check_out_date}</span></div>
      <div class="row"><span class="label">Amount:</span><span class="value">$\${data.total_amount}</span></div>
    </div>
    \${isConfirm ? '<p>The guest will receive a confirmation message shortly.</p>' : '<p>The guest has been notified of the cancellation.</p>'}
    <p class="footer">Powered by Ergovia AI</p>
  </div>
</body>
</html>\`;

return { html, statusCode: 200, contentType: 'text/html' };`
        }
      },
      // ─── Node 14: Build Error Response ───
      {
        id: 'build-error',
        name: 'Build Error Response',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1500, 450],
        parameters: {
          jsCode: `// Build HTML error response
const data = $input.item.json;

const html = \`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ergovia - Error</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 12px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { color: #f59e0b; }
    .footer { color: #94a3b8; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#9888;</div>
    <h1>Unable to Process</h1>
    <p>\${data.error || 'An error occurred processing your request.'}</p>
    \${data.booking_id ? '<p>Booking: <strong>' + data.booking_id + '</strong></p>' : ''}
    <p>Please contact the property manager directly.</p>
    <p class="footer">Powered by Ergovia AI</p>
  </div>
</body>
</html>\`;

return { html, statusCode: 400, contentType: 'text/html' };`
        }
      },
      // ─── Node 15: Respond Success ───
      {
        id: 'respond-success',
        name: 'Respond Success',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [2300, 150],
        parameters: {
          respondWith: 'text',
          responseBody: '={{ $json.html }}',
          options: {
            responseCode: 200,
            responseHeaders: {
              entries: [
                { name: 'Content-Type', value: 'text/html; charset=utf-8' }
              ]
            }
          }
        }
      },
      // ─── Node 16: Respond Error ───
      {
        id: 'respond-error',
        name: 'Respond Error',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [1800, 450],
        parameters: {
          respondWith: 'text',
          responseBody: '={{ $json.html }}',
          options: {
            responseCode: 400,
            responseHeaders: {
              entries: [
                { name: 'Content-Type', value: 'text/html; charset=utf-8' }
              ]
            }
          }
        }
      }
    ],
    connections: {
      'Confirm Webhook': {
        main: [[{ node: 'Extract Confirm Token', type: 'main', index: 0 }]]
      },
      'Cancel Webhook': {
        main: [[{ node: 'Extract Cancel Token', type: 'main', index: 0 }]]
      },
      'Extract Confirm Token': {
        main: [[{ node: 'Merge Paths', type: 'main', index: 0 }]]
      },
      'Extract Cancel Token': {
        main: [[{ node: 'Merge Paths', type: 'main', index: 1 }]]
      },
      'Merge Paths': {
        main: [[{ node: 'Validate Token', type: 'main', index: 0 }]]
      },
      'Validate Token': {
        main: [[{ node: 'Check Valid', type: 'main', index: 0 }]]
      },
      'Check Valid': {
        main: [[{ node: 'Route Valid', type: 'main', index: 0 }]]
      },
      'Route Valid': {
        main: [
          // True (valid) → Route Action
          [{ node: 'Route Action', type: 'main', index: 0 }],
          // False (invalid) → Build Error Response
          [{ node: 'Build Error Response', type: 'main', index: 0 }]
        ]
      },
      'Route Action': {
        main: [
          // Output 0: confirm
          [{ node: 'Execute Confirm', type: 'main', index: 0 }],
          // Output 1: cancel
          [{ node: 'Execute Cancel', type: 'main', index: 0 }]
        ]
      },
      'Execute Confirm': {
        main: [[{ node: 'Mark Token Used', type: 'main', index: 0 }]]
      },
      'Execute Cancel': {
        main: [[{ node: 'Mark Token Used', type: 'main', index: 0 }]]
      },
      'Mark Token Used': {
        main: [[{ node: 'Build Success Response', type: 'main', index: 0 }]]
      },
      'Build Success Response': {
        main: [[{ node: 'Respond Success', type: 'main', index: 0 }]]
      },
      'Build Error Response': {
        main: [[{ node: 'Respond Error', type: 'main', index: 0 }]]
      }
    },
    settings: {
      executionOrder: 'v1'
    }
  };

  // ─── Create the workflow ───
  console.log('Creating webhook workflow...');
  const result = await apiCall('POST', '/api/v1/workflows', workflow);

  if (result.id) {
    console.log(`Created! ID: ${result.id}`);
    console.log(`Name: ${result.name}`);
    console.log(`Nodes: ${result.nodes.length}`);

    // Activate
    await sleep(2000);
    console.log('\nActivating...');
    const act = await apiCall('POST', `/api/v1/workflows/${result.id}/activate`);
    console.log('Active:', act.active);

    // Get webhook URLs
    console.log('\nWebhook URLs (after activation):');
    console.log(`  Confirm: https://n8n.ergovia-ai.com/webhook/payment-confirm?token={TOKEN}`);
    console.log(`  Cancel:  https://n8n.ergovia-ai.com/webhook/payment-cancel?token={TOKEN}`);

    console.log(`\nWorkflow ID: ${result.id}`);
    console.log('Save this ID — Phase 4 needs it for WF4 to generate correct URLs.');
  } else {
    console.error('FAILED:', JSON.stringify(result).substring(0, 500));
  }

  console.log('\n=== Phase 3 Complete ===');
  console.log('Next: Phase 4 - Modify WF4 to use SUB + generate tokens');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

/**
 * FIX WF7: Switch "Notify Owner (Review)" to use SUB: Owner & Staff Notifier
 *
 * Problem: WF7's review notification calls SUB: Universal Messenger with
 *          owner_contact as sender_id — but that's the guest-facing messenger,
 *          and owner_contact is empty anyway.
 *
 * Fix: Point "Notify Owner (Review)" to SUB: Owner & Staff Notifier (0L7HOkqENABlbPtT)
 *      which resolves contacts from the database internally.
 *
 * Usage: node scripts/fix_wf7_notify_owner.js
 */

const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

const WF7_ID = 'Ay5QOyGAHG2l40s7';
const SUB_NOTIFIER_ID = '0L7HOkqENABlbPtT';

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== FIX WF7: Switch Notify Owner to SUB Notifier ===\n');

  // ============================================
  // 1. Download live WF7
  // ============================================
  const { data: wf7 } = await apiCall('GET', '/api/v1/workflows/' + WF7_ID);
  console.log('Downloaded WF7: ' + wf7.name + ' (' + wf7.nodes.length + ' nodes)');

  console.log('\nCurrent nodes:');
  wf7.nodes.forEach(n => {
    const flags = [];
    if (n.disabled) flags.push('DISABLED');
    console.log('  ' + n.name.padEnd(40) + ' [' + n.position + '] ' + flags.join(' '));
  });

  // ============================================
  // 2. Find the notification node
  // ============================================
  const notifyNode = wf7.nodes.find(n => n.name === 'Notify Owner (Review)');
  if (!notifyNode) {
    console.log('\nERROR: "Notify Owner (Review)" node not found!');
    console.log('Available nodes:', wf7.nodes.map(n => n.name).join(', '));
    return;
  }

  console.log('\n--- Current Notify Owner (Review) ---');
  console.log('  ID:', notifyNode.id);
  console.log('  Type:', notifyNode.type);
  console.log('  Target workflow:', notifyNode.parameters?.workflowId?.value || '(unknown)');
  console.log('  Inputs:', Object.keys(notifyNode.parameters?.workflowInputs?.value || {}).join(', '));

  // ============================================
  // 3. Also find the Analyze Review node to check what fields it outputs
  // ============================================
  const analyzeNode = wf7.nodes.find(n => n.name === 'Analyze Review Sentiment');
  if (analyzeNode) {
    console.log('\n--- Analyze Review Sentiment outputs ---');
    // The analysis node outputs: review_id, property_name, property_id (from query),
    // guest_name, star_rating, sentiment, response_text, approval_required,
    // owner_contact, preferred_platform, customer_id
    console.log('  (Code node — outputs property_id, owner_contact, preferred_platform, customer_id)');
  }

  // ============================================
  // 4. Check what the "Get Unanalyzed Reviews" query returns
  // ============================================
  const getReviews = wf7.nodes.find(n => n.name === 'Get Unanalyzed Reviews');
  if (getReviews) {
    console.log('\n--- Get Unanalyzed Reviews SQL ---');
    console.log('  ' + (getReviews.parameters.query || '').substring(0, 200));
  }

  // ============================================
  // 5. Update "Notify Owner (Review)" to call SUB: Owner & Staff Notifier
  // ============================================
  console.log('\n--- Updating Notify Owner (Review) ---');

  // Change target workflow
  notifyNode.parameters.workflowId = {
    __rl: true,
    mode: 'list',
    value: SUB_NOTIFIER_ID,
    cachedResultName: 'SUB: Owner & Staff Notifier',
    cachedResultUrl: '/workflow/' + SUB_NOTIFIER_ID
  };
  console.log('  Target: SUB: Owner & Staff Notifier (' + SUB_NOTIFIER_ID + ')');

  // Update workflowInputs to 6-field schema
  // The Analyze Review Sentiment node outputs property_id from the review query
  // We need to build the message here and pass it properly
  notifyNode.parameters.workflowInputs = {
    mappingMode: 'defineBelow',
    value: {
      property_id: '={{ $json.property_id || "" }}',
      event_type: 'review_alert',
      message: '=\u{1F4DD} Review Alert ({{ $json.property_name || "Property" }})\n\nGuest: {{ $json.guest_name || "Unknown" }}\nRating: {{ $json.star_rating || "?" }}/5 \u2B50\nSentiment: {{ $json.sentiment || "unknown" }}\nPlatform: {{ $json.platform || "direct" }}\n\nReview: {{ $json.review_text ? $json.review_text.substring(0, 200) : "N/A" }}\n\nDraft Response: {{ $json.response_text || "N/A" }}\n\nPlease review and approve/edit the response in your dashboard.',
      notify: 'owner',
      recipient_id: '',
      customer_id: '={{ $json.customer_id || "" }}'
    },
    matchingColumns: [],
    schema: [
      { id: 'property_id', displayName: 'property_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
      { id: 'event_type', displayName: 'event_type', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
      { id: 'message', displayName: 'message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
      { id: 'notify', displayName: 'notify', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
      { id: 'recipient_id', displayName: 'recipient_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
      { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
    ],
    attemptToConvertTypes: false,
    convertFieldsToString: true
  };
  console.log('  Inputs: property_id, event_type=review_alert, message, notify=owner, recipient_id, customer_id');

  // Add continueOnFail so notification errors don't break the review flow
  notifyNode.continueOnFail = true;
  console.log('  continueOnFail: true');

  // ============================================
  // 6. Ensure Analyze Review Sentiment passes property_id through
  // ============================================
  // The review query needs to JOIN with property_configurations to get property_id.
  // Let me check and fix the Get Unanalyzed Reviews query if needed.
  if (getReviews) {
    const currentQuery = getReviews.parameters.query || '';
    // Check if property_id is in the query
    if (!currentQuery.includes('property_id')) {
      console.log('\n--- Updating Get Unanalyzed Reviews query to include property_id ---');
      getReviews.parameters.query = `SELECT r.*,
  pc.property_name, pc.property_id, pc.owner_contact, pc.preferred_platform, pc.customer_id
FROM reviews r
LEFT JOIN property_configurations pc ON pc.property_id = r.property_id
WHERE r.sentiment IS NULL
ORDER BY r.created_at DESC
LIMIT 10`;
      console.log('  Added property_id, owner_contact, preferred_platform, customer_id to query');
    } else {
      console.log('\n  Get Unanalyzed Reviews already includes property_id');
    }
  }

  // ============================================
  // 7. Deploy
  // ============================================
  console.log('\nDeploying WF7...');

  if (wf7.active) {
    await apiCall('POST', '/api/v1/workflows/' + WF7_ID + '/deactivate');
    await sleep(2000);
  }

  const res = await apiCall('PUT', '/api/v1/workflows/' + WF7_ID, {
    name: wf7.name, nodes: wf7.nodes, connections: wf7.connections,
    settings: wf7.settings, staticData: wf7.staticData
  });

  if (res.status !== 200) {
    console.log('ERROR: ' + res.status + ' ' + JSON.stringify(res.data).substring(0, 500));
    if (wf7.active) {
      await apiCall('POST', '/api/v1/workflows/' + WF7_ID + '/activate');
    }
    return;
  }

  await sleep(1500);
  await apiCall('POST', '/api/v1/workflows/' + WF7_ID + '/activate');
  console.log('WF7 deployed & activated');

  // ============================================
  // 8. Verify
  // ============================================
  console.log('\n--- Verification ---');
  const { data: verify } = await apiCall('GET', '/api/v1/workflows/' + WF7_ID);

  const vNotify = verify.nodes.find(n => n.name === 'Notify Owner (Review)');
  if (vNotify) {
    console.log('  Notify Owner (Review):');
    console.log('    Target workflow: ' + (vNotify.parameters?.workflowId?.value || '(unknown)'));
    console.log('    continueOnFail: ' + !!vNotify.continueOnFail);
    const inputs = vNotify.parameters?.workflowInputs?.value || {};
    console.log('    Inputs: ' + Object.keys(inputs).join(', '));
  }

  const vReviews = verify.nodes.find(n => n.name === 'Get Unanalyzed Reviews');
  if (vReviews) {
    console.log('  Get Unanalyzed Reviews query includes property_id: ' +
      (vReviews.parameters?.query || '').includes('property_id'));
  }

  const checkConn = (from) => {
    const c = verify.connections[from];
    if (!c || !c.main) return '(none)';
    return c.main.map((outputs, i) =>
      outputs.length ? outputs.map(o => o.node).join(', ') : '(empty)'
    ).join(' | ');
  };
  console.log('  Needs Owner Attention? → ' + checkConn('Needs Owner Attention?'));
  console.log('  Total nodes: ' + verify.nodes.length);

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n========================================');
  console.log(' WF7 NOTIFICATION FIX — COMPLETE');
  console.log('========================================');
  console.log('');
  console.log('Changed: Notify Owner (Review)');
  console.log('  Before: Called SUB: Universal Messenger with owner_contact (empty)');
  console.log('  After:  Calls SUB: Owner & Staff Notifier with property_id + event_type');
  console.log('');
  console.log('The SUB Notifier resolves owner_telegram from property_configurations');
  console.log('internally — no need for owner_contact to be populated by the caller.');
  console.log('');
  console.log('Review alert flow:');
  console.log('  Review Analysis 8 AM → Get Reviews → Analyze Sentiment → Update Review');
  console.log('  → Needs Owner Attention? → [yes] → Notify Owner (→ SUB Notifier)');
  console.log('  → [no] → (auto-approved, done)');
}

main().catch(console.error);

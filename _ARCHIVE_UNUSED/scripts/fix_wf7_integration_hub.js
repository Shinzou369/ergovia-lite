/**
 * Fix WF7: Integration Hub (Ay5QOyGAHG2l40s7)
 *
 * Issues found and fixed:
 * 1. Get Properties with Integrations references non-existent columns:
 *    airbnb_calendar_url, vrbo_calendar_url, booking_com_calendar_url,
 *    google_calendar_id, ical_export_url, last_sync_at, preferred_platform
 *    → Use settings JSONB + calendar_url + last_calendar_sync
 * 2. Upsert External Bookings references non-existent columns:
 *    external_platform, external_booking_id, booking_type
 *    → Rewrite using platform, booking_id, notes. Fix ON CONFLICT
 * 3. Update Sync Time uses last_sync_at → should be last_calendar_sync
 *    Also uses $1 param → needs n8n expression syntax
 * 4. Get Unanalyzed Reviews references p.preferred_platform → COALESCE
 * 5. Notify Owner (Review) SUB call uses wrong field names
 * 6. Check for Conflicts calls WF3 without passing inputs
 * 7. Stale credential sweep
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'Ay5QOyGAHG2l40s7';

const CORRECT_POSTGRES = { id: 'BWlLUMKn64aZsHi8', name: 'Ergovia PostgreSQL' };
const CORRECT_OPENAI = { id: 'slpbr7aUaU6fqTfw', name: 'OpenAI' };
const STALE_CRED_ID = 'sjaI08GtPbON8TLX';

const changes = [];

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + apiPath);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  changes.push(msg);
  console.log('  ✓ ' + msg);
}

async function main() {
  console.log('=== Fixing WF7: Integration Hub ===\n');
  console.log('1. Downloading live workflow...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR: Could not download workflow. Response:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── STEP 1: Fix stale credentials on ALL nodes ───
  console.log('2. Scanning credentials...');
  for (const node of wf.nodes) {
    if (!node.credentials) continue;

    if (node.credentials.postgres?.id === STALE_CRED_ID) {
      node.credentials.postgres = { ...CORRECT_POSTGRES };
      log(`[${node.name}] Fixed stale PostgreSQL credential`);
    }
    if (node.credentials.openAiApi?.id === STALE_CRED_ID) {
      node.credentials.openAiApi = { ...CORRECT_OPENAI };
      log(`[${node.name}] Fixed stale OpenAI credential`);
    }
    if (node.credentials.openAi?.id === STALE_CRED_ID) {
      node.credentials.openAi = { ...CORRECT_OPENAI };
      log(`[${node.name}] Fixed stale OpenAI credential`);
    }

    // Clean [Client] prefix
    for (const [key, val] of Object.entries(node.credentials)) {
      if (val?.name?.startsWith('[Client] ')) {
        const cleanName = val.name.replace('[Client] ', '');
        node.credentials[key] = { id: val.id, name: cleanName };
        log(`[${node.name}] Cleaned credential name: "${val.name}" → "${cleanName}"`);
      }
    }
  }

  // ─── STEP 2: Fix "Get Properties with Integrations" query ───
  console.log('\n3. Fixing SQL queries...');
  const getPropsNode = wf.nodes.find(n => n.name === 'Get Properties with Integrations');
  if (getPropsNode) {
    // Real columns: property_id, property_name, calendar_url, last_calendar_sync,
    //               calendar_sync_enabled, owner_contact, settings (JSONB)
    // Calendar URLs are stored in settings JSONB
    getPropsNode.parameters.query = `SELECT
  property_id,
  property_name,
  calendar_url,
  settings->>'airbnb_calendar_url' AS airbnb_calendar_url,
  settings->>'vrbo_calendar_url' AS vrbo_calendar_url,
  settings->>'booking_com_calendar_url' AS booking_com_calendar_url,
  settings->>'google_calendar_id' AS google_calendar_id,
  settings->>'ical_export_url' AS ical_export_url,
  last_calendar_sync,
  owner_contact,
  COALESCE(settings->>'preferred_platform', 'telegram') AS preferred_platform,
  customer_id
FROM property_configurations
WHERE property_status = 'active'
  AND calendar_sync_enabled = true
  AND (calendar_url IS NOT NULL
       OR settings->>'airbnb_calendar_url' IS NOT NULL
       OR settings->>'vrbo_calendar_url' IS NOT NULL
       OR settings->>'booking_com_calendar_url' IS NOT NULL)`;
    log('[Get Properties with Integrations] Replaced non-existent columns with settings JSONB + calendar_url + last_calendar_sync');
  }

  // ─── STEP 3: Fix "Prepare Calendar URLs" code node ───
  // The code node references airbnb_calendar_url etc. which are now extracted from settings.
  // The query aliases handle this, so the code node should work as-is.
  // BUT we should also add the main calendar_url as a fallback source.
  const prepCalNode = wf.nodes.find(n => n.name === 'Prepare Calendar URLs');
  if (prepCalNode) {
    const newCode = `// Prepare calendar URLs for fetching
const property = $input.item.json;
const calendars = [];

if (property.airbnb_calendar_url) {
  calendars.push({
    platform: 'airbnb',
    url: property.airbnb_calendar_url,
    property_id: property.property_id,
    property_name: property.property_name
  });
}
if (property.vrbo_calendar_url) {
  calendars.push({
    platform: 'vrbo',
    url: property.vrbo_calendar_url,
    property_id: property.property_id,
    property_name: property.property_name
  });
}
if (property.booking_com_calendar_url) {
  calendars.push({
    platform: 'booking_com',
    url: property.booking_com_calendar_url,
    property_id: property.property_id,
    property_name: property.property_name
  });
}
// Fallback: use the main calendar_url if no platform-specific URLs
if (calendars.length === 0 && property.calendar_url) {
  calendars.push({
    platform: 'ical',
    url: property.calendar_url,
    property_id: property.property_id,
    property_name: property.property_name
  });
}

// If no calendar URLs found, return empty with flag
if (calendars.length === 0) {
  return [{ json: { property_id: property.property_id, skip: true, reason: 'No calendar URLs configured' } }];
}

return calendars.map(c => ({ json: c }));`;
    prepCalNode.parameters.jsCode = newCode;
    log('[Prepare Calendar URLs] Added calendar_url fallback + property_name pass-through + skip flag for empty');
  }

  // ─── STEP 4: Fix "Upsert External Bookings" query ───
  const upsertNode = wf.nodes.find(n => n.name === 'Upsert External Bookings');
  if (upsertNode) {
    // bookings columns: booking_id, guest_name, guest_phone, guest_email, property_name,
    //                   property_id, check_in_date, check_out_date, booking_status,
    //                   guests, total_amount, payment_status, platform, channel_type,
    //                   notes, special_requests
    // No: external_platform, external_booking_id, booking_type
    // ON CONFLICT (booking_id) is the only unique constraint besides PK
    upsertNode.parameters.query = `=INSERT INTO bookings (
  booking_id, property_id, platform,
  guest_name, check_in_date, check_out_date, booking_status,
  channel_type, notes
)
VALUES (
  '{{ $json.booking_id }}',
  '{{ $json.property_id }}',
  '{{ $json.platform }}',
  '{{ $json.guest_name }}',
  '{{ $json.check_in_date }}',
  '{{ $json.check_out_date }}',
  '{{ $json.booking_status || "confirmed" }}',
  'calendar_sync',
  '{{ ($json.notes || "").replace(/'/g, "''") }}'
)
ON CONFLICT (booking_id) DO UPDATE SET
  guest_name = EXCLUDED.guest_name,
  check_in_date = EXCLUDED.check_in_date,
  check_out_date = EXCLUDED.check_out_date,
  updated_at = CURRENT_TIMESTAMP
RETURNING booking_id`;
    log('[Upsert External Bookings] Rewrote: removed non-existent columns (external_platform, external_booking_id, booking_type), use platform + booking_id for ON CONFLICT');
  }

  // ─── STEP 5: Fix "Prepare Upserts" code node to match new schema ───
  const prepUpsertNode = wf.nodes.find(n => n.name === 'Prepare Upserts');
  if (prepUpsertNode) {
    const newCode = `// Prepare upsert data for bookings table
const allItems = $input.all();
const results = [];

for (const item of allItems) {
  const data = item.json;

  // Skip items flagged as no-calendar
  if (data.skip) continue;

  for (const event of (data.events || [])) {
    // Generate a deterministic booking_id from property + platform + external ID
    const bookingId = 'ext_' + event.platform + '_' + (event.external_id || '').replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);

    results.push({ json: {
      booking_id: bookingId,
      property_id: event.property_id,
      platform: event.platform,
      guest_name: event.summary || 'Blocked',
      check_in_date: event.check_in,
      check_out_date: event.check_out,
      booking_status: 'confirmed',
      notes: event.description || 'Synced from ' + event.platform + ' calendar'
    }});
  }
}

if (results.length === 0) {
  return [{ json: { skip: true, message: 'No events to upsert' } }];
}

return results;`;
    prepUpsertNode.parameters.jsCode = newCode;
    log('[Prepare Upserts] Rewrote to output flat items matching new INSERT schema');
  }

  // ─── STEP 6: Fix "Update Sync Time" query ───
  const syncTimeNode = wf.nodes.find(n => n.name === 'Update Sync Time');
  if (syncTimeNode) {
    // Fix: last_sync_at → last_calendar_sync, and $1 → n8n expression
    syncTimeNode.parameters.query = `=UPDATE property_configurations
SET last_calendar_sync = CURRENT_TIMESTAMP
WHERE property_id = '{{ $('Loop Properties').item.json.property_id }}'`;
    log('[Update Sync Time] Fixed last_sync_at → last_calendar_sync, replaced $1 with n8n expression');
  }

  // ─── STEP 7: Fix "Get Unanalyzed Reviews" query ───
  const reviewsNode = wf.nodes.find(n => n.name === 'Get Unanalyzed Reviews');
  if (reviewsNode) {
    reviewsNode.parameters.query = `SELECT
  r.review_id, r.platform, r.property_id, r.property_name,
  r.booking_id, r.guest_name, r.star_rating, r.review_text,
  r.review_date, p.owner_contact,
  COALESCE(p.settings->>'preferred_platform', 'telegram') AS preferred_platform,
  p.customer_id
FROM reviews r
LEFT JOIN property_configurations p ON r.property_id = p.property_id
WHERE r.sentiment IS NULL
  AND r.review_text IS NOT NULL
  AND r.review_text != ''
ORDER BY r.received_date DESC
LIMIT 10`;
    log('[Get Unanalyzed Reviews] Replaced p.preferred_platform with COALESCE(settings->>...) + added customer_id');
  }

  // ─── STEP 8: Fix "Notify Owner (Review)" SUB call ───
  const notifyNode = wf.nodes.find(n => n.name === 'Notify Owner (Review)');
  if (notifyNode) {
    notifyNode.parameters.workflowInputs = {
      mappingMode: 'defineBelow',
      value: {
        channel: "={{ $json.preferred_platform || 'telegram' }}",
        sender_id: "={{ $json.owner_contact || '' }}",
        input: "=Review Alert ({{ $json.property_name }})\n\nGuest: {{ $json.guest_name }}\nRating: {{ $json.star_rating }}/5\nSentiment: {{ $json.sentiment }}\nPlatform: {{ $json.platform || 'direct' }}\n\nReview: {{ $json.review_text ? $json.review_text.substring(0, 200) : 'N/A' }}\n\nDraft Response: {{ $json.response_text }}\n\nPlease review and approve/edit the response.",
        customer_id: "={{ $json.customer_id || '' }}"
      },
      schema: [
        { id: 'channel', displayName: 'Channel', type: 'string', required: true },
        { id: 'sender_id', displayName: 'Sender ID', type: 'string', required: true },
        { id: 'input', displayName: 'Input', type: 'string', required: true },
        { id: 'customer_id', displayName: 'Customer ID', type: 'string', required: true }
      ]
    };
    log('[Notify Owner (Review)] Fixed SUB field mapping: recipient→sender_id, message→input, added customer_id');
  }

  // ─── STEP 9: Fix "Check for Conflicts" — pass property_id to WF3 ───
  const conflictNode = wf.nodes.find(n => n.name === 'Check for Conflicts');
  if (conflictNode) {
    // WF3 is Calendar Manager — it needs at minimum a property_id to check
    // Pass the current loop item's data through
    if (!conflictNode.parameters.workflowInputs) {
      conflictNode.parameters.workflowInputs = {
        mappingMode: 'defineBelow',
        value: {
          property_id: "={{ $('Loop Properties').item.json.property_id }}",
          action: "check_conflicts"
        },
        schema: [
          { id: 'property_id', displayName: 'Property ID', type: 'string', required: true },
          { id: 'action', displayName: 'Action', type: 'string', required: true }
        ]
      };
      log('[Check for Conflicts] Added workflowInputs with property_id for WF3');
    }
  }

  // ─── STEP 10: Deploy ───
  console.log('\n4. Deploying fixed workflow...');

  console.log('   Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  await sleep(1500);

  console.log('   Updating...');
  const updateResult = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  });

  if (updateResult.id) {
    console.log('   Update successful!');
  } else {
    console.error('   Update failed:', JSON.stringify(updateResult).substring(0, 300));
    return;
  }
  await sleep(1000);

  console.log('   Reactivating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  if (activateResult.active) {
    console.log('   Workflow is now ACTIVE!\n');
  } else {
    console.log('   Activation response:', JSON.stringify(activateResult).substring(0, 200));
  }

  // ─── Summary ───
  console.log('═══════════════════════════════════════');
  console.log(`SUMMARY: ${changes.length} changes applied to WF7`);
  console.log('═══════════════════════════════════════');
  for (const c of changes) {
    console.log('  • ' + c);
  }
  console.log('\nWF7 fix complete!');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

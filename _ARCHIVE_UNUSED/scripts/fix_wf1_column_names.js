const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
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
  console.log('=== Fixing WF1 column name mismatches ===\n');

  const { data: wf } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');
  console.log(`Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  let changes = 0;

  for (const node of wf.nodes) {
    // ============================================================
    // FIX 1: Budget Available? IF node
    //   was: $json.can_proceed === true (strict)
    //   fix: $json.is_available !== false (handles undefined as true)
    // ============================================================
    if (node.id === 'budget-gate') {
      console.log('FIX 1: Budget Available? IF node');
      node.parameters.conditions = {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "loose",
          version: 1
        },
        conditions: [
          {
            id: "budget-check",
            leftValue: "={{ $json.is_available !== false }}",
            rightValue: true,
            operator: {
              type: "boolean",
              operation: "equals"
            }
          }
        ],
        combinator: "and"
      };
      console.log('  → Changed: $json.can_proceed → $json.is_available !== false');
      console.log('  → Now: undefined (no customer) → true, true → true, false → false');
      changes++;
    }

    // ============================================================
    // FIX 2: Budget Exhausted Response code
    //   was: budgetInfo.budget_remaining
    //   fix: budgetInfo.remaining
    // ============================================================
    if (node.id === 'budget-exhausted') {
      console.log('FIX 2: Budget Exhausted Response code');
      node.parameters.jsCode = `// Budget exhausted - return template response
const normalized = $('Merge Customer ID').item.json;
const budgetInfo = $('Check Budget').item.json;

const fallbackResponses = {
  en: "I apologize, but I'm currently operating in limited mode. For immediate assistance with bookings or urgent issues, please contact our support team directly. We'll be back to full service soon!",
  es: "Disculpe, actualmente estoy operando en modo limitado. Para asistencia inmediata con reservas o problemas urgentes, contacte a nuestro equipo de soporte directamente.",
  default: "Thank you for your message. Our AI assistant is temporarily limited. Please try again later or contact support for immediate help."
};

const response = fallbackResponses.en;

return {
  output: response,
  sender_id: normalized.sender_id,
  channel: normalized.channel,
  budget_exhausted: true,
  remaining_budget: budgetInfo.remaining || 0
};`;
      console.log('  → Fixed: budgetInfo.budget_remaining → budgetInfo.remaining');
      changes++;
    }

    // ============================================================
    // FIX 3: Alert Needed? IF node
    //   was: $json.alert_threshold notEmpty (string) — doesn't exist
    //   fix: check if any alert boolean is true
    //   log_api_usage returns: alert_50_needed, alert_80_needed, alert_100_needed
    // ============================================================
    if (node.id === 'alert-needed') {
      console.log('FIX 3: Alert Needed? IF node');
      node.parameters.conditions = {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "loose"
        },
        conditions: [
          {
            id: "alert-check",
            leftValue: "={{ $json.alert_50_needed === true || $json.alert_80_needed === true || $json.alert_100_needed === true }}",
            rightValue: true,
            operator: {
              type: "boolean",
              operation: "equals"
            }
          }
        ],
        combinator: "and"
      };
      console.log('  → Changed: alert_threshold notEmpty → alert_50/80/100_needed booleans');
      changes++;
    }

    // ============================================================
    // FIX 4: Prepare Alert code
    //   was: data.alert_threshold, data.budget_remaining, data.is_paused
    //   fix: derive alert type from alert_50/80/100_needed booleans
    //   log_api_usage returns: new_usage, monthly_budget, remaining, usage_percent, alert_50/80/100_needed
    // ============================================================
    if (node.id === 'prepare-alert') {
      console.log('FIX 4: Prepare Alert code');
      node.parameters.jsCode = `// Prepare budget alert notification
const data = $input.item.json;

let alertType, alertEmoji, alertTitle, alertMessage;
const remaining = Number(data.remaining) || 0;

// Check from highest to lowest priority
if (data.alert_100_needed) {
  alertType = '100_percent';
  alertEmoji = '🔴';
  alertTitle = 'API Budget Exhausted';
  alertMessage = 'Your monthly API budget is exhausted. AI features will use template responses until next month.';
} else if (data.alert_80_needed) {
  alertType = '80_percent';
  alertEmoji = '🔶';
  alertTitle = 'API Budget: 80% Used';
  alertMessage = \`You have used 80% of your monthly API budget. Remaining: $\${remaining.toFixed(2)}. Consider reducing usage.\`;
} else if (data.alert_50_needed) {
  alertType = '50_percent';
  alertEmoji = '⚠️';
  alertTitle = 'API Budget: 50% Used';
  alertMessage = \`You have used 50% of your monthly API budget. Remaining: $\${remaining.toFixed(2)}\`;
} else {
  alertType = 'info';
  alertEmoji = 'ℹ️';
  alertTitle = 'Budget Update';
  alertMessage = \`Current remaining budget: $\${remaining.toFixed(2)}\`;
}

return {
  alert_type: alertType,
  alert_emoji: alertEmoji,
  alert_title: alertTitle,
  alert_message: alertMessage,
  customer_id: $('Merge Customer ID').item.json.customer_id,
  remaining: remaining
};`;
      console.log('  → Rewrote: uses alert_50/80/100_needed booleans + data.remaining');
      changes++;
    }
  }

  console.log(`\n${changes} nodes modified.`);

  if (changes === 0) {
    console.log('Nothing to upload.');
    return;
  }

  // Deactivate → Update → Activate
  console.log('\nDeactivating...');
  await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/deactivate');
  await sleep(1000);

  console.log('Uploading...');
  const updateBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  };
  const update = await apiCall('PUT', '/api/v1/workflows/LP7YknAVPiQsidWq', updateBody);
  if (update.status !== 200) {
    console.log(`ERROR: Update failed (${update.status}): ${JSON.stringify(update.data).substring(0, 500)}`);
    await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  // Verify
  console.log('\nVerifying...');
  const { data: verified } = await apiCall('GET', '/api/v1/workflows/LP7YknAVPiQsidWq');

  const budgetGate = verified.nodes.find(n => n.id === 'budget-gate');
  console.log(`  Budget Available?: ${JSON.stringify(budgetGate?.parameters?.conditions?.conditions?.[0]?.leftValue)}`);

  const alertNeeded = verified.nodes.find(n => n.id === 'alert-needed');
  console.log(`  Alert Needed?: ${JSON.stringify(alertNeeded?.parameters?.conditions?.conditions?.[0]?.leftValue)}`);

  const budgetExhausted = verified.nodes.find(n => n.id === 'budget-exhausted');
  const hasRemainingFix = budgetExhausted?.parameters?.jsCode?.includes('budgetInfo.remaining');
  console.log(`  Budget Exhausted: uses budgetInfo.remaining = ${hasRemainingFix}`);

  const prepareAlert = verified.nodes.find(n => n.id === 'prepare-alert');
  const hasAlertFix = prepareAlert?.parameters?.jsCode?.includes('alert_100_needed');
  console.log(`  Prepare Alert: uses alert_100_needed = ${hasAlertFix}`);

  console.log('\nActivating...');
  const act = await apiCall('POST', '/api/v1/workflows/LP7YknAVPiQsidWq/activate');
  if (act.status === 200) {
    console.log('ACTIVATED successfully');
  } else {
    console.log(`WARNING: Activate returned ${act.status}`);
  }

  console.log('\n=== Summary ===');
  console.log('Budget Available? → now checks $json.is_available !== false (handles undefined as TRUE)');
  console.log('Budget Exhausted → now reads budgetInfo.remaining (not budget_remaining)');
  console.log('Alert Needed? → now checks alert_50/80/100_needed booleans');
  console.log('Prepare Alert → now derives alert type from alert booleans');
  console.log('\nFlow for test user (no conversations data):');
  console.log('  Get Customer ID → {} (empty)');
  console.log('  Merge Customer ID → fallback UUID');
  console.log('  Check Budget → is_available=true (new budget created, $0/$30)');
  console.log('  Budget Available? → TRUE → AI Agent processes message');
}

main().catch(console.error);

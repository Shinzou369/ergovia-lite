/**
 * Fix WF8: Redesign emergency path for realistic owner notifications
 *
 * Problems:
 * 1. AI Emergency Handler prompt tells it to "respond to the guest" — but output goes to OWNER
 * 2. Raw AI output goes directly to Send Alerts with no formatting
 * 3. AI asks "please provide more details" instead of assessing with available info
 *
 * Fix:
 * 1. Rewrite AI prompt: assess the emergency, produce structured data, never ask questions
 * 2. Add "Format Emergency Alert" code node between AI and Send Alerts
 * 3. Build an actionable owner notification with all context
 * 4. Also fix screening path: add notification for high-risk guests
 *
 * New emergency flow:
 *   Route → AI Emergency Handler → Format Emergency Alert (NEW) → Send Alerts → Log
 *
 * New screening flow:
 *   Route → AI Screening Agent → Format Screening Result (NEW) → Notify if risky → Log
 */

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';
const WF_ID = 'mLm2HaIRzNfIX5uh';

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
  console.log('=== WF8: Redesign Emergency & Screening Logic ===\n');

  console.log('1. Downloading live WF8...');
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  if (!wf.nodes) {
    console.error('ERROR:', JSON.stringify(wf).substring(0, 200));
    return;
  }
  console.log(`   Downloaded: ${wf.name} (${wf.nodes.length} nodes)\n`);

  // ─── STEP 1: Fix AI Emergency Handler prompt ───
  console.log('2. Rewriting AI Emergency Handler prompt...');
  const emergencyAgent = wf.nodes.find(n => n.name === 'AI Emergency Handler');
  if (emergencyAgent) {
    emergencyAgent.parameters.promptType = 'define';
    emergencyAgent.parameters.text = `You are an internal emergency assessment system for a property management company. A guest has reported an issue. Your job is to ASSESS the situation and produce a structured report for the property OWNER — NOT the guest.

REPORTED ISSUE:
- Guest message: {{ $json.data.message }}
- Property: {{ $json.property_id }}
- Channel: {{ $json.channel }}
- Guest name: {{ $json.data.guest_name || 'Unknown' }}

RULES:
- NEVER ask for more information. Work with what you have.
- NEVER address the guest. Your output goes to the property owner/manager.
- If information is limited, make your best assessment and state your assumptions.
- Be direct and actionable.

Produce your assessment in EXACTLY this format:

EMERGENCY_TYPE: [fire/medical/security/utility/lockout/noise/natural_disaster/other]
SEVERITY: [critical/high/medium]
RESPONDERS: [comma-separated list: 911, owner, maintenance, security, plumber, electrician, locksmith]
GUEST_INSTRUCTIONS: [one sentence — what the guest should do RIGHT NOW]
OWNER_ACTIONS: [numbered list of what the owner needs to do]
SUMMARY: [one sentence describing the situation]`;

    emergencyAgent.parameters.options = { maxIterations: 2 };

    // Remove systemMessage if it exists — the main prompt is sufficient
    delete emergencyAgent.parameters.systemMessage;
    delete emergencyAgent.parameters.hasOutputParser;

    log('AI Emergency Handler: Rewrote prompt — now produces structured owner-facing assessment, never asks questions');
  }

  // ─── STEP 2: Add "Format Emergency Alert" code node ───
  console.log('\n3. Adding Format Emergency Alert code node...');

  // Find AI Emergency Handler position for placement
  const emergencyPos = emergencyAgent ? emergencyAgent.position : [1200, 200];
  const sendAlertsNode = wf.nodes.find(n => n.name === 'Send Alerts');
  const sendAlertsPos = sendAlertsNode ? sendAlertsNode.position : [1600, 400];

  const formatAlertNode = {
    parameters: {
      jsCode: `// Format a clear, actionable emergency alert for the property owner
const normalized = $('Normalize Event').item.json;
const aiOutput = $json.output || $json.text || '';

// Parse structured fields from AI output
function extract(label) {
  const match = aiOutput.match(new RegExp(label + ':\\\\s*(.+)', 'i'));
  return match ? match[1].trim() : '';
}

const emergencyType = extract('EMERGENCY_TYPE') || 'unknown';
const severity = extract('SEVERITY') || 'high';
const responders = extract('RESPONDERS') || 'owner';
const guestInstructions = extract('GUEST_INSTRUCTIONS') || '';
const ownerActions = extract('OWNER_ACTIONS') || 'Review the situation and contact the guest.';
const summary = extract('SUMMARY') || normalized.data.message || 'Emergency reported by guest.';

// Severity emoji
const sevEmoji = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : '🟡';

// Build owner notification
let alert = '🚨 EMERGENCY ALERT\\n\\n';
alert += '📍 Property: ' + (normalized.property_id || 'Unknown') + '\\n';
alert += '👤 Guest: ' + (normalized.data.guest_name || 'Unknown') + '\\n';
alert += '📱 Via: ' + (normalized.channel || 'unknown') + '\\n\\n';
alert += '💬 Guest reported:\\n"' + (normalized.data.message || normalized.message || 'No message') + '"\\n\\n';
alert += sevEmoji + ' Assessment: ' + emergencyType.toUpperCase() + ' — ' + severity.toUpperCase() + '\\n';
alert += '📋 Summary: ' + summary + '\\n\\n';

if (ownerActions) {
  alert += '⚡ Actions needed:\\n' + ownerActions + '\\n\\n';
}
if (responders && responders !== 'owner') {
  alert += '📞 Notify: ' + responders + '\\n\\n';
}
if (guestInstructions) {
  alert += '💡 Guest was advised: ' + guestInstructions + '\\n';
}

return {
  alert_message: alert,
  emergency_type: emergencyType,
  severity: severity,
  responders: responders,
  property_id: normalized.property_id,
  customer_id: normalized.customer_id,
  event_type: 'emergency',
  ai_raw: aiOutput
};`
    },
    id: 'format-emergency-alert',
    name: 'Format Emergency Alert',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [
      Math.round((emergencyPos[0] + sendAlertsPos[0]) / 2),
      emergencyPos[1]
    ]
  };

  wf.nodes.push(formatAlertNode);
  log('Added "Format Emergency Alert" code node — builds actionable owner notification from AI assessment');

  // ─── STEP 3: Rewire connections: AI Emergency Handler → Format Alert → Send Alerts ───
  console.log('\n4. Rewiring emergency path connections...');

  // Change AI Emergency Handler output: was → Send Alerts, now → Format Emergency Alert
  if (wf.connections['AI Emergency Handler']) {
    wf.connections['AI Emergency Handler'].main[0] = [{
      node: 'Format Emergency Alert',
      type: 'main',
      index: 0
    }];
    log('Rewired: AI Emergency Handler → Format Emergency Alert (was → Send Alerts)');
  }

  // Add Format Emergency Alert → Send Alerts
  wf.connections['Format Emergency Alert'] = {
    main: [[{
      node: 'Send Alerts',
      type: 'main',
      index: 0
    }]]
  };
  log('Wired: Format Emergency Alert → Send Alerts');

  // ─── STEP 4: Fix AI Screening Agent prompt ───
  console.log('\n5. Improving AI Screening Agent...');
  const screeningAgent = wf.nodes.find(n => n.name === 'AI Screening Agent');
  if (screeningAgent) {
    screeningAgent.parameters.text = `You are a guest screening system for a vacation rental property. Assess this booking request and produce a risk evaluation for the property owner.

BOOKING REQUEST:
- Guest: {{ $json.data.guest_name || 'Not provided' }}
- Email: {{ $json.data.guest_email || 'Not provided' }}
- Phone: {{ $json.data.guest_phone || 'Not provided' }}
- Check-in: {{ $json.data.check_in_date || 'Not provided' }}
- Property: {{ $json.data.property_id || 'Unknown' }}

RULES:
- NEVER ask for more information. Assess with what you have.
- Missing contact info IS a red flag — factor it in.
- Same-day bookings are higher risk than advance bookings.
- Your output goes to the property owner, not the guest.

Produce your assessment in EXACTLY this format:

DECISION: [APPROVE/FLAG_FOR_REVIEW/REJECT]
RISK_LEVEL: [low/medium/high]
RISK_SCORE: [0-100]
FLAGS: [comma-separated list of concerns, or "none"]
REASONING: [2-3 sentences explaining your decision]
OWNER_NOTE: [one sentence recommendation for the owner]`;

    screeningAgent.parameters.options = { maxIterations: 2 };
    delete screeningAgent.parameters.systemMessage;
    delete screeningAgent.parameters.hasOutputParser;

    log('AI Screening Agent: Rewrote prompt — structured risk assessment, never asks questions');
  }

  // ─── STEP 5: Add "Format Screening Result" code node ───
  console.log('\n6. Adding Format Screening Result code node...');

  const screeningPos = screeningAgent ? screeningAgent.position : [1200, 400];
  const logSecPos = wf.nodes.find(n => n.name === 'Log Security Event')?.position || [1800, 400];

  const formatScreeningNode = {
    parameters: {
      jsCode: `// Format screening result and decide if owner needs notification
const normalized = $('Normalize Event').item.json;
const aiOutput = $json.output || $json.text || '';

function extract(label) {
  const match = aiOutput.match(new RegExp(label + ':\\\\s*(.+)', 'i'));
  return match ? match[1].trim() : '';
}

const decision = extract('DECISION') || 'FLAG_FOR_REVIEW';
const riskLevel = extract('RISK_LEVEL') || 'medium';
const riskScore = parseInt(extract('RISK_SCORE')) || 50;
const flags = extract('FLAGS') || 'none';
const reasoning = extract('REASONING') || 'Automated screening complete.';
const ownerNote = extract('OWNER_NOTE') || 'Please review this booking.';

const needsOwnerAlert = decision !== 'APPROVE';

// Build owner notification if needed
let alert = '';
if (needsOwnerAlert) {
  const emoji = decision === 'REJECT' ? '🔴' : '🟡';
  alert = emoji + ' GUEST SCREENING: ' + decision.replace(/_/g, ' ') + '\\n\\n';
  alert += '👤 Guest: ' + (normalized.data.guest_name || 'Unknown') + '\\n';
  alert += '📧 Email: ' + (normalized.data.guest_email || 'N/A') + '\\n';
  alert += '📱 Phone: ' + (normalized.data.guest_phone || 'N/A') + '\\n';
  alert += '📅 Check-in: ' + (normalized.data.check_in_date || 'N/A') + '\\n';
  alert += '📍 Property: ' + (normalized.data.property_id || 'Unknown') + '\\n\\n';
  alert += '⚠️ Risk: ' + riskLevel.toUpperCase() + ' (' + riskScore + '/100)\\n';
  if (flags !== 'none') {
    alert += '🚩 Flags: ' + flags + '\\n';
  }
  alert += '\\n📋 ' + reasoning + '\\n';
  alert += '\\n💡 ' + ownerNote;
}

return {
  decision: decision,
  risk_level: riskLevel,
  risk_score: riskScore,
  flags: flags,
  reasoning: reasoning,
  needs_owner_alert: needsOwnerAlert,
  alert_message: alert,
  property_id: normalized.property_id || normalized.data.property_id || '',
  customer_id: normalized.customer_id || '',
  event_type: 'screening',
  severity: riskLevel,
  ai_raw: aiOutput
};`
    },
    id: 'format-screening-result',
    name: 'Format Screening Result',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [
      Math.round((screeningPos[0] + logSecPos[0]) / 2),
      screeningPos[1]
    ]
  };

  wf.nodes.push(formatScreeningNode);
  log('Added "Format Screening Result" code node');

  // Add "Needs Owner Alert?" IF node for screening
  const needsAlertNode = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'needs-alert',
          leftValue: '={{ $json.needs_owner_alert }}',
          rightValue: true,
          operator: { type: 'boolean', operation: 'true' }
        }],
        combinator: 'and'
      },
      options: { looseTypeValidation: true }
    },
    id: 'needs-owner-alert',
    name: 'Needs Owner Alert?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [
      formatScreeningNode.position[0] + 200,
      screeningPos[1]
    ]
  };

  wf.nodes.push(needsAlertNode);
  log('Added "Needs Owner Alert?" IF node for screening path');

  // ─── STEP 6: Rewire screening path ───
  // Was: AI Screening Agent → Log Security Event
  // Now: AI Screening Agent → Format Screening Result → Needs Owner Alert?
  //        → true: Send Alerts → Log Security Event
  //        → false: Log Security Event
  console.log('\n7. Rewiring screening path...');

  wf.connections['AI Screening Agent'] = {
    main: [[{
      node: 'Format Screening Result',
      type: 'main',
      index: 0
    }]]
  };
  log('Rewired: AI Screening Agent → Format Screening Result');

  wf.connections['Format Screening Result'] = {
    main: [[{
      node: 'Needs Owner Alert?',
      type: 'main',
      index: 0
    }]]
  };
  log('Wired: Format Screening Result → Needs Owner Alert?');

  wf.connections['Needs Owner Alert?'] = {
    main: [
      [{  // true: high risk → notify owner
        node: 'Send Alerts',
        type: 'main',
        index: 0
      }],
      [{  // false: approved → just log
        node: 'Log Security Event',
        type: 'main',
        index: 0
      }]
    ]
  };
  log('Wired: Needs Owner Alert? → true: Send Alerts, false: Log Security Event');

  // ─── STEP 7: Deploy ───
  console.log('\n8. Deploying...');

  console.log('   Deactivating...');
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  await sleep(1500);

  console.log('   Updating...');
  const result = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  });

  if (result.id) {
    console.log('   Update successful! Nodes: ' + result.nodes.length);
  } else {
    console.error('   Update failed:', JSON.stringify(result).substring(0, 500));
    return;
  }
  await sleep(1000);

  console.log('   Reactivating...');
  const activateResult = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('   Active:', activateResult.active);

  // ─── Summary ───
  console.log('\n═══════════════════════════════════════');
  console.log(`SUMMARY: ${changes.length} changes applied`);
  console.log('═══════════════════════════════════════');
  for (const c of changes) {
    console.log('  • ' + c);
  }

  console.log('\nNew WF8 flows:');
  console.log('  EMERGENCY:');
  console.log('    Trigger → Normalize → Route → AI Emergency Handler');
  console.log('    → Format Emergency Alert (NEW) → Send Alerts → Log');
  console.log('');
  console.log('  SCREENING:');
  console.log('    Trigger → Normalize → Route → AI Screening Agent');
  console.log('    → Format Screening Result (NEW) → Needs Owner Alert? (NEW)');
  console.log('      → YES: Send Alerts → Log');
  console.log('      → NO:  Log directly');
  console.log('');
  console.log('  WATCHDOG:');
  console.log('    Timer → Normalize → Route → Run Checks → Analyze');
  console.log('    → Has Issues? → YES: Send Alerts → Log');
  console.log('                  → NO:  Log directly');
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});

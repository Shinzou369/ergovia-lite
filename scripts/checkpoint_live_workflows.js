/**
 * Checkpoint Live Workflows → Save as Templates with Proper Placeholders
 *
 * Fetches all 9 live workflows from n8n, replaces:
 *   - Actual credential IDs → placeholder IDs (postgres-cred, openai-cred, etc.)
 *   - Live workflow IDs in tool calls → placeholder names
 *   - Client-specific values → <__PLACEHOLDER_VALUE__...> patterns
 * Saves to ergovia-lite/workflows/
 *
 * Run: node scripts/checkpoint_live_workflows.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

// All 9 live workflow IDs
const WORKFLOWS = [
  { id: 'UZMWfhnV6JmuwJXC', file: 'SUB_Universal_Messenger.json', label: 'SUB: Universal Messenger' },
  { id: 'LP7YknAVPiQsidWq', file: 'WF1_AI_Gateway.json',         label: 'WF1: AI Gateway' },
  { id: 'NPInwpKv4Oriq04F', file: 'WF2_Offer_Conflict_Manager.json', label: 'WF2: Offer Conflict Manager' },
  { id: 'pEn69kwNtCEQ21y9', file: 'WF3_Calendar_Manager.json',    label: 'WF3: Calendar Manager' },
  { id: '5loDH75zrEDh9x5H', file: 'WF4_Payment_Processor.json',  label: 'WF4: Payment Processor' },
  { id: 'JWEu9Uz2JJ5XZeIX', file: 'WF5_Property_Operations.json', label: 'WF5: Property Operations' },
  { id: 'ccEOaNnIwY6eeJOn', file: 'WF6_Daily_Automations.json',   label: 'WF6: Daily Automations' },
  { id: 'Ay5QOyGAHG2l40s7', file: 'WF7_Integration_Hub.json',     label: 'WF7: Integration Hub' },
  { id: 'mLm2HaIRzNfIX5uh', file: 'WF8_Safety_Screening.json',   label: 'WF8: Safety & Screening' },
];

// Live credential IDs → placeholder IDs
const CREDENTIAL_MAP = {
  'BWlLUMKn64aZsHi8': 'postgres-cred',   // Ergovia PostgreSQL
  'slpbr7aUaU6fqTfw': 'openai-cred',     // OpenAI
  '6ltptOrFLUaZzC1C': 'telegram-cred',   // Telegram Bot
  'sjaI08GtPbON8TLX': 'openai-cred',     // Stale OpenAI (map to same placeholder)
};

// Live credential names → placeholder names
const CREDENTIAL_NAME_MAP = {
  'Ergovia PostgreSQL': '[Client] PostgreSQL',
  'OpenAI': '[Client] OpenAI',
  'Ergovia Telegram Bot': '[Client] Telegram Bot',
  'Telegram Bot': '[Client] Telegram Bot',
};

// Live workflow IDs → their reference names (for cross-workflow tool calls)
const WORKFLOW_ID_MAP = {};
for (const wf of WORKFLOWS) {
  WORKFLOW_ID_MAP[wf.id] = wf.label;
}

function apiCall(apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: { 'X-N8N-API-KEY': API_KEY }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error: ${e.message}\nResponse: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function replaceCredentials(workflow) {
  let changes = 0;
  for (const node of workflow.nodes) {
    if (!node.credentials) continue;
    for (const [credType, credObj] of Object.entries(node.credentials)) {
      // Replace credential ID
      if (CREDENTIAL_MAP[credObj.id]) {
        const oldId = credObj.id;
        credObj.id = CREDENTIAL_MAP[oldId];
        changes++;
      }
      // Replace credential name
      if (CREDENTIAL_NAME_MAP[credObj.name]) {
        credObj.name = CREDENTIAL_NAME_MAP[credObj.name];
      }
    }
  }
  return changes;
}

function replaceWorkflowIds(workflow) {
  let changes = 0;
  for (const node of workflow.nodes) {
    if (!node.parameters) continue;

    // Check workflowId in executeWorkflow / toolWorkflow nodes
    const wfId = node.parameters.workflowId;
    if (wfId && typeof wfId === 'object' && wfId.value) {
      if (WORKFLOW_ID_MAP[wfId.value]) {
        // Keep the live ID but add cached name for reference
        // The deployment system will re-inject IDs
        wfId.cachedResultName = WORKFLOW_ID_MAP[wfId.value];
        changes++;
      }
    }
  }
  return changes;
}

function cleanForTemplate(workflow) {
  // Remove execution-specific data
  delete workflow.versionId;
  delete workflow.triggerCount;
  delete workflow.shared;
  delete workflow.homeProject;
  delete workflow.tags;

  // Clean nodes
  for (const node of workflow.nodes) {
    delete node.webhookId;
  }
}

function auditClientVariables(workflow, label) {
  const findings = [];
  const wfStr = JSON.stringify(workflow);

  // Check for hardcoded Telegram chat IDs (numeric, 9-10 digits)
  const chatIdMatches = wfStr.match(/"chatId"\s*:\s*"=?\{?\{?\s*\d{8,12}/g);
  if (chatIdMatches) {
    findings.push(`Hardcoded Telegram chat IDs found: ${chatIdMatches.length} instances`);
  }

  // Check for hardcoded phone numbers
  const phoneMatches = wfStr.match(/\+\d{10,15}/g);
  if (phoneMatches) {
    const unique = [...new Set(phoneMatches)];
    findings.push(`Hardcoded phone numbers: ${unique.join(', ')}`);
  }

  // Check for hardcoded email addresses
  const emailMatches = wfStr.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emailMatches) {
    const unique = [...new Set(emailMatches)].filter(e => !e.includes('n8n.io') && !e.includes('example'));
    if (unique.length > 0) {
      findings.push(`Hardcoded emails: ${unique.join(', ')}`);
    }
  }

  // Check for remaining live credential IDs not in our map
  for (const node of workflow.nodes) {
    if (!node.credentials) continue;
    for (const [type, cred] of Object.entries(node.credentials)) {
      if (cred.id && !cred.id.includes('-cred') && cred.id.length > 10) {
        findings.push(`Unknown credential in ${node.name}: ${type} = ${cred.id} (${cred.name})`);
      }
    }
  }

  // Check for hardcoded URLs that look client-specific
  const urlMatches = wfStr.match(/https?:\/\/[a-zA-Z0-9.-]*ergovia[a-zA-Z0-9./-]*/g);
  if (urlMatches) {
    const unique = [...new Set(urlMatches)];
    findings.push(`Ergovia URLs found: ${unique.join(', ')}`);
  }

  // Check for $now.format in system prompts (good - dynamic date)
  if (wfStr.includes('$now.format')) {
    findings.push('[OK] Dynamic date ($now.format) found in system prompt');
  }

  return findings;
}

async function main() {
  const outDir = path.join(__dirname, '..', 'ergovia-lite', 'workflows');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  console.log('=================================================');
  console.log('  CHECKPOINT LIVE WORKFLOWS → TEMPLATES');
  console.log(`  ${new Date().toISOString()}`);
  console.log('=================================================\n');

  const allFindings = [];
  let totalCredChanges = 0;
  let totalWfIdChanges = 0;

  for (const wfInfo of WORKFLOWS) {
    console.log(`\n--- ${wfInfo.label} (${wfInfo.id}) ---`);

    try {
      const wf = await apiCall('/api/v1/workflows/' + wfInfo.id);

      console.log(`  Nodes: ${wf.nodes.length} | Active: ${wf.active}`);

      // 1. Replace credentials (before audit so audit only catches what's left)
      const credChanges = replaceCredentials(wf);
      totalCredChanges += credChanges;
      console.log(`  Credential replacements: ${credChanges}`);

      // 3. Replace workflow IDs
      const wfIdChanges = replaceWorkflowIds(wf);
      totalWfIdChanges += wfIdChanges;
      console.log(`  Workflow ID annotations: ${wfIdChanges}`);

      // 4. Audit for client-specific variables (after replacements)
      const findings = auditClientVariables(wf, wfInfo.label);
      if (findings.length > 0) {
        allFindings.push({ workflow: wfInfo.label, findings });
      }

      // 5. Clean template
      cleanForTemplate(wf);

      // 5. Final string-level credential ID sweep (catches any nested/missed refs)
      let jsonStr = JSON.stringify(wf, null, 2);
      let strReplacements = 0;
      for (const [liveId, placeholderId] of Object.entries(CREDENTIAL_MAP)) {
        const regex = new RegExp(liveId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = jsonStr.match(regex);
        if (matches) {
          strReplacements += matches.length;
          jsonStr = jsonStr.replace(regex, placeholderId);
        }
      }
      // Also replace any live workflow IDs with placeholder references
      for (const [liveId, label] of Object.entries(WORKFLOW_ID_MAP)) {
        const regex = new RegExp(`"${liveId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
        const matches = jsonStr.match(regex);
        if (matches) {
          strReplacements += matches.length;
          jsonStr = jsonStr.replace(regex, `"__WF_ID:${label}__"`);
        }
      }
      if (strReplacements > 0) {
        console.log(`  String-level replacements: ${strReplacements}`);
      }

      // 6. Save
      const outPath = path.join(outDir, wfInfo.file);
      fs.writeFileSync(outPath, jsonStr);
      console.log(`  Saved: ${wfInfo.file}`);

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  // Summary
  console.log('\n=================================================');
  console.log('  SUMMARY');
  console.log('=================================================');
  console.log(`  Total credential replacements: ${totalCredChanges}`);
  console.log(`  Total workflow ID annotations: ${totalWfIdChanges}`);
  console.log(`  Templates saved to: ergovia-lite/workflows/`);

  if (allFindings.length > 0) {
    console.log('\n=================================================');
    console.log('  CLIENT VARIABLE AUDIT');
    console.log('=================================================');
    for (const { workflow, findings } of allFindings) {
      console.log(`\n  ${workflow}:`);
      for (const f of findings) {
        console.log(`    - ${f}`);
      }
    }
  }

  console.log('\n  Done!\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

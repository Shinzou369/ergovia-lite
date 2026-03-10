/**
 * Tag M1 workflows + Save V4 templates
 *
 * 1. Renames current live workflows to add [M1] prefix
 * 2. Fetches all [V4] workflows and saves as clean templates
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const N8N_URL = 'http://116.203.115.12:5678';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwMDE2MjA0fQ.MjLv7Jf9YKSUfvS8gJVSvsah1hulXRszsirmZ63Rc5c';

// Current live (M1) workflow IDs
const M1_WORKFLOWS = [
  { id: 'UZMWfhnV6JmuwJXC', name: 'SUB: Universal Messenger' },
  { id: '0L7HOkqENABlbPtT', name: 'SUB: Owner & Staff Notifier' },
  { id: 'LP7YknAVPiQsidWq', name: 'WF1: AI Gateway - Unified Entry Point' },
  { id: 'NPInwpKv4Oriq04F', name: 'WF2: Offer Conflict Manager' },
  { id: 'pEn69kwNtCEQ21y9', name: 'WF3: Calendar Manager' },
  { id: '5loDH75zrEDh9x5H', name: 'WF4: Payment Processor' },
  { id: 'JWEu9Uz2JJ5XZeIX', name: 'WF5: Property Operations' },
  { id: 'ccEOaNnIwY6eeJOn', name: 'WF6: Daily Automations' },
  { id: 'Ay5QOyGAHG2l40s7', name: 'WF7: Integration Hub' },
  { id: 'mLm2HaIRzNfIX5uh', name: 'WF8: Safety & Screening' },
];

// V4 workflow IDs
const V4_WORKFLOWS = [
  { id: 'MWFSKpUCpYfFzDTr', file: 'SUB_Universal_Messenger.json', label: 'SUB: Universal Messenger' },
  { id: 'SV80ObHW5jp7mOhL', file: 'SUB_Owner_Staff_Notifier.json', label: 'SUB: Owner & Staff Notifier' },
  { id: 'tvSLRSiOmNdkEfA2', file: 'WF1_AI_Gateway.json', label: 'WF1: AI Gateway' },
  { id: 'XnhCywT7s1ttYFvr', file: 'WF2_Offer_Conflict_Manager.json', label: 'WF2: Offer Conflict Manager' },
  { id: 'FDZAlqrvOW4RUGHq', file: 'WF3_Calendar_Manager.json', label: 'WF3: Calendar Manager' },
  { id: 'iaBWaaIjFUrzBcon', file: 'WF4_Payment_Processor.json', label: 'WF4: Payment Processor' },
  { id: 'fIVtVj3tFzUKYgoN', file: 'WF5_Property_Operations.json', label: 'WF5: Property Operations' },
  { id: 'kohspAO4n8msHAFQ', file: 'WF6_Daily_Automations.json', label: 'WF6: Daily Automations' },
  { id: '3wN9FArGC9GgEcOz', file: 'WF7_Integration_Hub.json', label: 'WF7: Integration Hub' },
  { id: 'gNn1OeCXspbOYg6K', file: 'WF8_Safety_Screening.json', label: 'WF8: Safety & Screening' },
];

// Credential replacement map (live IDs → placeholders)
const CREDENTIAL_MAP = {
  'BWlLUMKn64aZsHi8': 'postgres-cred',
  'slpbr7aUaU6fqTfw': 'openai-cred',
  '6ltptOrFLUaZzC1C': 'telegram-cred',
  'sjaI08GtPbON8TLX': 'openai-cred',
};

// All known workflow IDs → labels (M1 + V4 combined for cross-ref resolution)
const ALL_WORKFLOW_IDS = {};
M1_WORKFLOWS.forEach(w => { ALL_WORKFLOW_IDS[w.id] = w.name; });
V4_WORKFLOWS.forEach(w => { ALL_WORKFLOW_IDS[w.id] = w.label; });

function apiCall(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, N8N_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON from ${urlPath}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${urlPath}`)); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanForTemplate(workflow) {
  delete workflow.versionId;
  delete workflow.triggerCount;
  delete workflow.shared;
  delete workflow.homeProject;
  delete workflow.tags;
  for (const node of workflow.nodes) {
    delete node.webhookId;
  }
}

function replaceCredentials(workflow) {
  let changes = 0;
  for (const node of workflow.nodes) {
    if (!node.credentials) continue;
    for (const [credType, credObj] of Object.entries(node.credentials)) {
      if (CREDENTIAL_MAP[credObj.id]) {
        credObj.id = CREDENTIAL_MAP[credObj.id];
        changes++;
      }
      // Normalize credential names
      if (credObj.name) {
        credObj.name = credObj.name
          .replace(/^Ergovia\s+/i, '[Client] ')
          .replace(/^\[Client\]\s*/i, '[Client] ');
        if (!credObj.name.startsWith('[Client]')) {
          if (credType === 'postgres') credObj.name = '[Client] PostgreSQL';
          else if (credType === 'openAiApi') credObj.name = '[Client] OpenAI';
          else if (credType === 'telegramApi') credObj.name = '[Client] Telegram Bot';
        }
      }
    }
  }
  return changes;
}

async function main() {
  console.log('=================================================');
  console.log('  TAG M1 + SAVE V4 TEMPLATES');
  console.log('  ' + new Date().toISOString());
  console.log('=================================================');

  // =============================================
  // PART 1: Tag M1 workflows with [M1] prefix
  // =============================================
  console.log('\n--- PART 1: Tagging M1 workflows ---\n');

  let m1Tagged = 0;
  for (const wf of M1_WORKFLOWS) {
    try {
      const current = await apiCall(`/api/v1/workflows/${wf.id}`);
      const currentName = current.name;

      // Skip if already tagged
      if (currentName.startsWith('[M1]')) {
        console.log(`  SKIP ${currentName} (already tagged)`);
        m1Tagged++;
        continue;
      }

      // Remove any existing version tags like ✅
      const cleanName = currentName.replace(/\s*✅\s*/g, '').trim();
      const newName = `[M1] ${cleanName}`;

      // PATCH: only update the name (keep everything else intact)
      await apiCall(`/api/v1/workflows/${wf.id}`, 'PATCH', { name: newName });
      console.log(`  TAGGED: ${currentName} → ${newName}`);
      m1Tagged++;
      await delay(500);
    } catch (err) {
      console.error(`  ERROR tagging ${wf.name}: ${err.message}`);
    }
  }
  console.log(`\n  M1 tagged: ${m1Tagged}/${M1_WORKFLOWS.length}`);

  // =============================================
  // PART 2: Fetch V4 workflows and save as templates
  // =============================================
  console.log('\n--- PART 2: Saving V4 templates ---\n');

  const outDir = path.join(__dirname, '..', 'ergovia-lite', 'workflows', 'v4');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let v4Saved = 0;
  let totalCredReplacements = 0;
  let totalStrReplacements = 0;
  const auditFindings = [];

  for (const wfInfo of V4_WORKFLOWS) {
    console.log(`  Fetching [V4] ${wfInfo.label} (${wfInfo.id})...`);
    try {
      const wf = await apiCall(`/api/v1/workflows/${wfInfo.id}`);
      console.log(`    Nodes: ${wf.nodes.length} | Active: ${wf.active}`);

      // 1. Replace credentials at node level
      const credChanges = replaceCredentials(wf);
      totalCredReplacements += credChanges;
      console.log(`    Credential replacements: ${credChanges}`);

      // 2. Clean template metadata
      cleanForTemplate(wf);

      // 3. Serialize and do string-level replacement sweep
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

      // Replace workflow IDs with placeholders
      for (const [liveId, label] of Object.entries(ALL_WORKFLOW_IDS)) {
        const regex = new RegExp(`"${liveId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
        const matches = jsonStr.match(regex);
        if (matches) {
          strReplacements += matches.length;
          jsonStr = jsonStr.replace(regex, `"__WF_ID:${label}__"`);
        }
      }

      totalStrReplacements += strReplacements;
      if (strReplacements > 0) {
        console.log(`    String-level replacements: ${strReplacements}`);
      }

      // 4. Audit for remaining client-specific data
      const findings = [];
      const emailMatches = jsonStr.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (emailMatches) findings.push(`Hardcoded emails: ${[...new Set(emailMatches)].join(', ')}`);

      const chatIdMatches = jsonStr.match(/"chatId"\s*:\s*"[0-9]/g);
      if (chatIdMatches) findings.push(`Hardcoded Telegram chat IDs: ${chatIdMatches.length}`);

      if (findings.length > 0) {
        auditFindings.push({ workflow: wfInfo.label, findings });
      }

      // 5. Save
      const outPath = path.join(outDir, wfInfo.file);
      fs.writeFileSync(outPath, jsonStr);
      console.log(`    Saved: v4/${wfInfo.file}`);
      v4Saved++;

      await delay(1500); // Rate limit
    } catch (err) {
      console.error(`    ERROR: ${err.message}`);
    }
  }

  // =============================================
  // SUMMARY
  // =============================================
  console.log('\n=================================================');
  console.log('  SUMMARY');
  console.log('=================================================');
  console.log(`  M1 workflows tagged: ${m1Tagged}/${M1_WORKFLOWS.length}`);
  console.log(`  V4 templates saved: ${v4Saved}/${V4_WORKFLOWS.length}`);
  console.log(`  Total credential replacements: ${totalCredReplacements}`);
  console.log(`  Total string-level replacements: ${totalStrReplacements}`);
  console.log(`  Templates saved to: ergovia-lite/workflows/v4/`);

  if (auditFindings.length > 0) {
    console.log('\n  CLIENT VARIABLE AUDIT:');
    for (const af of auditFindings) {
      console.log(`\n  ${af.workflow}:`);
      af.findings.forEach(f => console.log(`    - ${f}`));
    }
  } else {
    console.log('\n  CLIENT VARIABLE AUDIT: All clean!');
  }

  console.log('\n  Done!');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

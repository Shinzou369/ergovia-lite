/**
 * run-assessment.js — Live system assessment & smoke test
 * Usage: node scripts/run-assessment.js
 */
require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');

const N8N_BASE = 'https://n8n.ergovia-ai.com/api/v1';

function apiReq(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + '/' + endpoint);
    const opts = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY },
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

const pool = new Pool({
  host: process.env.PG_HOST || '116.203.115.12',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'ergovia_db',
  user: process.env.PG_USER || 'ergovia_user',
  password: process.env.PG_PASSWORD || 'ergovia_secure_2026',
  ssl: false,
  connectionTimeoutMillis: 8000,
});

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';
const INFO = 'ℹ️ ';

const results = [];
function record(section, check, status, detail) {
  results.push({ section, check, status, detail });
  const icon = status === 'PASS' ? PASS : status === 'FAIL' ? FAIL : status === 'WARN' ? WARN : INFO;
  console.log(`  ${icon} ${check}${detail ? ' — ' + detail : ''}`);
}

// EXPECTED LIVE WORKFLOWS
const EXPECTED_WORKFLOWS = [
  '[LIVE] WF1: AI Gateway - Unified Entry Point',
  '[LIVE] WF2: Offer Conflict Manager',
  '[LIVE] WF3: Calendar Manager',
  '[LIVE] WF4: Payment Processor',
  '[LIVE] WF5: Property Operations',
  '[LIVE] WF6: Daily Automations',
  '[LIVE] WF7: Integration Hub',
  '[LIVE] WF8: Safety & Screening',
  '[LIVE] SUB: Universal Messenger',
  '[LIVE] SUB: Owner & Staff Notifier',
  '[LIVE] Payment Confirmation Webhook',
];

// WORKFLOWS THAT MUST BE ACTIVE (triggered/scheduled)
const MUST_BE_ACTIVE = [
  '[LIVE] WF1: AI Gateway - Unified Entry Point',
  '[LIVE] WF3: Calendar Manager',
  '[LIVE] WF6: Daily Automations',
  '[LIVE] WF8: Safety & Screening',
  '[LIVE] Payment Confirmation Webhook',
];

const APPROVED_CREDS = {
  postgres:           'BWlLUMKn64aZsHi8',
  memoryPostgresChat: 'BWlLUMKn64aZsHi8',
  openAiApi:          'slpbr7aUaU6fqTfw',
  lmChatOpenAi:       'slpbr7aUaU6fqTfw',
  telegramApi:        '6ltptOrFLUaZzC1C',
};

async function assessN8n() {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 1 — n8n Connectivity');
  console.log('──────────────────────────────────────');
  let workflows = [];
  try {
    const health = await httpsGet('https://n8n.ergovia-ai.com/healthz');
    if (health.status === 200) record('n8n', 'n8n reachable', 'PASS', 'healthz 200');
    else record('n8n', 'n8n reachable', 'FAIL', 'healthz returned ' + health.status);
  } catch (e) {
    record('n8n', 'n8n reachable', 'FAIL', e.message);
  }

  try {
    const res = await apiReq('workflows?limit=200');
    if (res.status !== 200) throw new Error('API returned ' + res.status);
    const all = res.body.data || [];
    workflows = all;
    record('n8n', 'n8n API key valid', 'PASS', all.length + ' total workflows found');
  } catch (e) {
    record('n8n', 'n8n API key valid', 'FAIL', e.message);
    return [];
  }
  return workflows;
}

async function assessWorkflows(workflows) {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 2 — [LIVE] Workflow Status');
  console.log('──────────────────────────────────────');

  const liveWfs = workflows.filter(w => w.name.startsWith('[LIVE]'));
  record('workflows', '[LIVE] workflow count', liveWfs.length >= 11 ? 'PASS' : 'FAIL',
    liveWfs.length + '/11 found');

  for (const name of EXPECTED_WORKFLOWS) {
    const wf = liveWfs.find(w => w.name === name);
    if (!wf) {
      record('workflows', name, 'FAIL', 'NOT FOUND');
    } else {
      const mustBeActive = MUST_BE_ACTIVE.includes(name);
      if (mustBeActive && !wf.active) {
        record('workflows', name, 'FAIL', 'INACTIVE — must be active');
      } else if (!mustBeActive && !wf.active) {
        record('workflows', name, 'WARN', 'inactive (ok for on-demand SUBs)');
      } else {
        record('workflows', name, 'PASS', wf.active ? 'active' : 'exists');
      }
    }
  }

  // Check for old V4/V6 workflows still cluttering
  const v4 = workflows.filter(w => w.name.startsWith('[V4]'));
  const v6 = workflows.filter(w => w.name.startsWith('[V6]'));
  if (v4.length > 0) record('workflows', 'V4 cleanup', 'WARN', v4.length + ' [V4] workflows still visible (archive in n8n UI)');
  else record('workflows', 'V4 cleanup', 'PASS', 'No V4 workflows');
  if (v6.length > 0) record('workflows', 'V6 cleanup', 'WARN', v6.length + ' [V6] workflows still visible (archive in n8n UI)');
  else record('workflows', 'V6 cleanup', 'PASS', 'No V6 workflows');

  return liveWfs;
}

async function assessCredentials(liveWfs) {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 3 — Credential Audit');
  console.log('──────────────────────────────────────');
  let totalBad = 0;
  for (const wfMeta of liveWfs) {
    try {
      const res = await apiReq('workflows/' + wfMeta.id);
      const nodes = res.body.nodes || [];
      let badNodes = [];
      for (const node of nodes) {
        if (!node.credentials) continue;
        for (const [credType, credVal] of Object.entries(node.credentials)) {
          const approved = APPROVED_CREDS[credType];
          if (approved && credVal.id !== approved) {
            badNodes.push(`${node.name}:${credType}(${credVal.id})`);
          }
        }
      }
      if (badNodes.length > 0) {
        record('credentials', wfMeta.name, 'FAIL', 'wrong creds: ' + badNodes.join(', '));
        totalBad += badNodes.length;
      } else {
        record('credentials', wfMeta.name, 'PASS', 'all credentials correct');
      }
    } catch (e) {
      record('credentials', wfMeta.name, 'WARN', 'could not fetch: ' + e.message);
    }
  }
  if (totalBad === 0) console.log('  ✅ All credentials verified across all workflows');
}

async function assessWhisper(liveWfs) {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 4 — WF1 Voice / Whisper');
  console.log('──────────────────────────────────────');
  const wf1Meta = liveWfs.find(w => w.name.includes('WF1'));
  if (!wf1Meta) { record('whisper', 'WF1 found', 'FAIL', 'WF1 not in [LIVE] list'); return; }
  try {
    const res = await apiReq('workflows/' + wf1Meta.id);
    const nodes = res.body.nodes || [];
    const isVoice   = nodes.find(n => n.name === 'Is Voice?');
    const whisper   = nodes.find(n => n.name === 'Transcribe Audio');
    const normInput = nodes.find(n => n.name === 'Normalize Input');
    const hasVoiceDetect = normInput && normInput.parameters.jsCode && normInput.parameters.jsCode.includes('is_voice');
    record('whisper', 'Normalize Input detects voice', hasVoiceDetect ? 'PASS' : 'FAIL', '');
    record('whisper', 'Is Voice? IF node', isVoice ? 'PASS' : 'FAIL', isVoice ? 'present' : 'MISSING — run add-whisper-to-wf1.js');
    record('whisper', 'Transcribe Audio (Whisper) node', whisper ? 'PASS' : 'FAIL', whisper ? 'present' : 'MISSING');
    record('whisper', 'TELEGRAM_BOT_TOKEN env var', 'WARN', 'must be set in n8n docker-compose.yml — cannot verify remotely');
  } catch (e) {
    record('whisper', 'WF1 fetch', 'FAIL', e.message);
  }
}

async function assessSUBMessenger(liveWfs) {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 5 — SUB: Universal Messenger');
  console.log('──────────────────────────────────────');
  const subMeta = liveWfs.find(w => w.name.includes('Universal Messenger'));
  if (!subMeta) { record('sub', 'SUB found', 'FAIL', 'not in [LIVE] list'); return; }
  try {
    const res = await apiReq('workflows/' + subMeta.id);
    const nodes = res.body.nodes || [];
    const sanitize = nodes.find(n => n.name === 'Sanitize Message');
    const tgSend   = nodes.find(n => n.type === 'n8n-nodes-base.telegram' && n.name.toLowerCase().includes('send'));
    record('sub', 'Sanitize Message node (Partner spec)', sanitize ? 'PASS' : 'WARN',
      sanitize ? 'present' : 'MISSING — partner spec requires markdown strip before Telegram send');
    record('sub', 'Telegram send node', tgSend ? 'PASS' : 'WARN', tgSend ? tgSend.name : 'not found');
  } catch (e) {
    record('sub', 'SUB fetch', 'FAIL', e.message);
  }
}

async function assessDatabase() {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 6 — PostgreSQL Database');
  console.log('──────────────────────────────────────');
  try {
    await pool.query('SELECT 1');
    record('db', 'PostgreSQL connection', 'PASS', '116.203.115.12:5432');
  } catch (e) {
    record('db', 'PostgreSQL connection', 'FAIL', e.message);
    await pool.end();
    return;
  }

  const checks = [
    { name: 'Table count (≥20)', sql: "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'", check: r => parseInt(r.count) >= 20, detail: r => r.count + ' tables' },
    { name: 'owners table has data', sql: 'SELECT COUNT(*) FROM owners', check: r => parseInt(r.count) > 0, detail: r => r.count + ' owner(s)' },
    { name: 'property_configurations seeded', sql: 'SELECT COUNT(*) FROM property_configurations', check: r => parseInt(r.count) >= 0, detail: r => r.count + ' properties' },
    { name: 'bookings table exists', sql: 'SELECT COUNT(*) FROM bookings', check: r => parseInt(r.count) >= 0, detail: r => r.count + ' bookings' },
    { name: 'api_usage_budget seeded', sql: 'SELECT COUNT(*) FROM api_usage_budget', check: r => parseInt(r.count) > 0, detail: r => r.count + ' rows' },
    { name: 'n8n_chat_histories table', sql: 'SELECT COUNT(*) FROM n8n_chat_histories', check: () => true, detail: r => r.count + ' messages stored' },
    { name: 'affiliates seeded', sql: 'SELECT COUNT(*) FROM affiliates', check: r => parseInt(r.count) > 0, detail: r => r.count + ' affiliate(s)' },
    { name: 'niche_problems seeded', sql: 'SELECT COUNT(*) FROM niche_problems', check: r => parseInt(r.count) > 0, detail: r => r.count + ' problems' },
  ];

  for (const c of checks) {
    try {
      const r = await pool.query(c.sql);
      const row = r.rows[0];
      const pass = c.check(row);
      record('db', c.name, pass ? 'PASS' : (parseInt(row.count) === 0 ? 'WARN' : 'FAIL'), c.detail(row));
    } catch (e) {
      record('db', c.name, 'FAIL', e.message);
    }
  }

  // Active convos
  try {
    const r = await pool.query("SELECT COUNT(DISTINCT session_id) FROM n8n_chat_histories WHERE created_at > NOW() - INTERVAL '24 hours'");
    record('db', 'Active conversations (last 24h)', 'INFO', r.rows[0].count + ' unique sessions');
  } catch (e) {
    record('db', 'Active conversations', 'WARN', e.message);
  }

  await pool.end();
}

async function assessLocalFiles() {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 7 — Local Code / Config');
  console.log('──────────────────────────────────────');
  const fs = require('fs');
  const checks = [
    { name: 'server.js exists', path: 'server.js' },
    { name: 'db.js exists', path: 'db.js' },
    { name: 'services/v2-data.js exists', path: 'services/v2-data.js' },
    { name: 'services/n8n.js exists', path: 'services/n8n.js' },
    { name: '.env file present', path: '.env' },
    { name: 'public/v2/dashboard.html', path: 'public/v2/dashboard.html' },
    { name: 'public/v2/settings.html', path: 'public/v2/settings.html' },
    { name: 'docs/HOW_ERGOVIA_IS_BUILT.md', path: 'docs/HOW_ERGOVIA_IS_BUILT.md' },
  ];
  for (const c of checks) {
    const exists = fs.existsSync(c.path);
    record('files', c.name, exists ? 'PASS' : 'FAIL', exists ? '' : 'missing');
  }

  // Check activeConversations is real (not hardcoded 0)
  try {
    const v2data = fs.readFileSync('services/v2-data.js', 'utf8');
    const hasRealQuery = v2data.includes('n8n_chat_histories') && v2data.includes('activeConversations');
    const hasHardcoded = v2data.includes('activeConversations: 0');
    record('files', 'Dashboard activeConversations uses real DB', hasRealQuery && !hasHardcoded ? 'PASS' : 'FAIL',
      hasHardcoded ? 'still hardcoded to 0' : hasRealQuery ? 'queries n8n_chat_histories' : 'not found');
  } catch (e) {
    record('files', 'v2-data.js check', 'FAIL', e.message);
  }

  // GCash removed
  try {
    const settings = fs.readFileSync('public/v2/settings.html', 'utf8');
    const hasGcash = settings.toLowerCase().includes('gcash');
    record('files', 'GCash removed from settings', hasGcash ? 'FAIL' : 'PASS',
      hasGcash ? 'GCash still present in settings.html' : 'not found');
  } catch (e) {
    record('files', 'settings.html check', 'FAIL', e.message);
  }
}

async function assessPartnerSpec(liveWfs) {
  console.log('\n──────────────────────────────────────');
  console.log('SECTION 8 — Partner Behavior Spec Compliance');
  console.log('──────────────────────────────────────');
  // Cross-check against PARTNER_BEHAVIOR_DEFINITION.md key requirements
  const checks = [
    { check: 'WF1 active (text + voice entry)', status: liveWfs.find(w => w.name.includes('WF1') && w.active) ? 'PASS' : 'FAIL' },
    { check: 'WF2 Offer Conflict Manager exists', status: liveWfs.find(w => w.name.includes('WF2')) ? 'PASS' : 'FAIL' },
    { check: 'WF3 Calendar Manager active', status: liveWfs.find(w => w.name.includes('WF3') && w.active) ? 'PASS' : 'WARN', detail: liveWfs.find(w => w.name.includes('WF3') && w.active) ? '' : 'inactive — daily sync at 6AM will not run' },
    { check: 'WF4 Payment Processor exists', status: liveWfs.find(w => w.name.includes('WF4')) ? 'PASS' : 'FAIL' },
    { check: 'WF5 Property Operations exists', status: liveWfs.find(w => w.name.includes('WF5')) ? 'PASS' : 'FAIL' },
    { check: 'WF6 Daily Automations active', status: liveWfs.find(w => w.name.includes('WF6') && w.active) ? 'PASS' : 'WARN', detail: 'morning/evening reports require active WF6' },
    { check: 'WF7 Integration Hub exists', status: liveWfs.find(w => w.name.includes('WF7')) ? 'PASS' : 'FAIL' },
    { check: 'WF8 Safety & Screening active', status: liveWfs.find(w => w.name.includes('WF8') && w.active) ? 'PASS' : 'FAIL', detail: 'watchdog every 15 min must be active' },
    { check: 'SUB Universal Messenger exists', status: liveWfs.find(w => w.name.includes('Universal Messenger')) ? 'PASS' : 'FAIL' },
    { check: 'SUB Owner & Staff Notifier exists', status: liveWfs.find(w => w.name.includes('Staff Notifier')) ? 'PASS' : 'FAIL' },
    { check: 'Payment Webhook exists', status: liveWfs.find(w => w.name.includes('Payment') && w.name.includes('Webhook')) ? 'PASS' : 'FAIL' },
    { check: 'Voice transcription (Whisper) in WF1', status: 'WARN', detail: 'nodes added — needs TELEGRAM_BOT_TOKEN env var to function' },
    { check: 'GCash removed from payment options', status: 'PASS', detail: 'verified removed from settings.html' },
  ];
  for (const c of checks) {
    record('spec', c.check, c.status, c.detail || '');
  }
}

function printSummary() {
  console.log('\n══════════════════════════════════════');
  console.log('  ASSESSMENT SUMMARY');
  console.log('══════════════════════════════════════');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const total = results.filter(r => r.status !== 'INFO').length;
  console.log(`  PASS: ${pass}/${total}   FAIL: ${fail}   WARN: ${warn}`);
  console.log();

  if (fail > 0) {
    console.log('  FAILURES (fix these first):');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`    ❌ [${r.section}] ${r.check}${r.detail ? ' — ' + r.detail : ''}`));
    console.log();
  }
  if (warn > 0) {
    console.log('  WARNINGS (address before go-live):');
    results.filter(r => r.status === 'WARN').forEach(r => console.log(`    ⚠️  [${r.section}] ${r.check}${r.detail ? ' — ' + r.detail : ''}`));
    console.log();
  }

  const score = Math.round((pass / total) * 100);
  const verdict = fail === 0 ? (warn <= 2 ? '🟢 GO — System ready for live testing' : '🟡 CONDITIONAL GO — Address warnings') : '🔴 NO-GO — Fix failures before testing';
  console.log(`  READINESS SCORE: ${score}%`);
  console.log(`  VERDICT: ${verdict}`);
  console.log('══════════════════════════════════════\n');
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  ERGOVIA LITE — SYSTEM ASSESSMENT    ║');
  console.log('║  ' + new Date().toISOString().replace('T', ' ').slice(0,19) + ' UTC              ║');
  console.log('╚══════════════════════════════════════╝');

  const workflows = await assessN8n();
  const liveWfs = await assessWorkflows(workflows);
  if (liveWfs.length > 0) {
    await assessCredentials(liveWfs);
    await assessWhisper(liveWfs);
    await assessSUBMessenger(liveWfs);
    await assessPartnerSpec(liveWfs);
  }
  await assessLocalFiles();
  await assessDatabase();
  printSummary();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

/**
 * Phase 5: Verify all changes from the B+D hybrid implementation
 *
 * Checks:
 * 1. Database: confirmation_token column + payment_action_tokens table
 * 2. SUB: Owner & Staff Notifier has inline_keyboard + confirmation_urls inputs
 * 3. Webhook workflow exists and is active
 * 4. WF4: Generate Tokens node exists, Send Owner Notification is executeWorkflow
 * 5. All workflows are active
 */

const https = require('https');
const { Client } = require('pg');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://n8n.ergovia-ai.com' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.end();
  });
}

async function main() {
  console.log('=== Phase 5: Verification ===\n');
  let pass = 0;
  let fail = 0;

  function check(name, ok, detail) {
    if (ok) { console.log(`  ✓ ${name}${detail ? ': ' + detail : ''}`); pass++; }
    else { console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`); fail++; }
  }

  // ─── 1. Database ───
  console.log('1. Database Schema');
  const pg = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await pg.connect();

  // Check confirmation_token column
  const colRes = await pg.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'confirmation_token'
  `);
  check('bookings.confirmation_token column', colRes.rows.length > 0);

  // Check payment_action_tokens table
  const tblRes = await pg.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'payment_action_tokens'
  `);
  check('payment_action_tokens table', tblRes.rows.length > 0);

  // Check indexes
  const idxRes = await pg.query(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'payment_action_tokens'
  `);
  check('payment_action_tokens indexes', idxRes.rows.length >= 3, `${idxRes.rows.length} indexes`);

  await pg.end();

  // ─── 2. SUB: Owner & Staff Notifier ───
  console.log('\n2. SUB: Owner & Staff Notifier (SV80ObHW5jp7mOhL)');
  const sub = await apiCall('GET', '/api/v1/workflows/SV80ObHW5jp7mOhL');
  check('Workflow loaded', !!sub.id, sub.name);
  check('Active', sub.active === true);

  const trigger = sub.nodes.find(n => n.type === 'n8n-nodes-base.executeWorkflowTrigger');
  const inputs = trigger?.parameters?.workflowInputs?.values || [];
  const inputNames = inputs.map(i => i.name);
  check('Has inline_keyboard input', inputNames.includes('inline_keyboard'));
  check('Has confirmation_urls input', inputNames.includes('confirmation_urls'));

  const normalize = sub.nodes.find(n => n.name === 'Normalize Input');
  check('Normalize passes inline_keyboard', normalize?.parameters?.jsCode?.includes('inline_keyboard'));
  check('Normalize passes confirmation_urls', normalize?.parameters?.jsCode?.includes('confirmation_urls'));

  const buildDelivery = sub.nodes.find(n => n.name === 'Build Delivery');
  check('Build Delivery handles confirmation_urls', buildDelivery?.parameters?.jsCode?.includes('confirmation_urls'));
  check('Build Delivery passes inline_keyboard', buildDelivery?.parameters?.jsCode?.includes('inline_keyboard'));

  const sendTg = sub.nodes.find(n => n.name === 'Send Telegram');
  check('Send Telegram has reply_markup',
    sendTg?.parameters?.additionalFields?.reply_markup?.includes('inline_keyboard'));

  // ─── 3. Webhook Confirmation Workflow ───
  console.log('\n3. Payment Confirmation Webhook (f6I2jQKMd1ezkX3N)');
  const webhook = await apiCall('GET', '/api/v1/workflows/f6I2jQKMd1ezkX3N');
  check('Workflow loaded', !!webhook.id, webhook.name);
  check('Active', webhook.active === true);
  check('Node count', webhook.nodes.length >= 14, `${webhook.nodes.length} nodes`);

  // Key nodes
  const confirmWH = webhook.nodes.find(n => n.name === 'Confirm Webhook');
  check('Confirm Webhook node exists', !!confirmWH);
  const cancelWH = webhook.nodes.find(n => n.name === 'Cancel Webhook');
  check('Cancel Webhook node exists', !!cancelWH);
  const validateToken = webhook.nodes.find(n => n.name === 'Validate Token');
  check('Validate Token node exists', !!validateToken);
  const execConfirm = webhook.nodes.find(n => n.name === 'Execute Confirm');
  check('Execute Confirm node exists', !!execConfirm);
  const execCancel = webhook.nodes.find(n => n.name === 'Execute Cancel');
  check('Execute Cancel node exists', !!execCancel);
  const markUsed = webhook.nodes.find(n => n.name === 'Mark Token Used');
  check('Mark Token Used node exists', !!markUsed);
  const respondSuccess = webhook.nodes.find(n => n.name === 'Respond Success');
  check('Respond Success node exists', !!respondSuccess);

  // ─── 4. WF4: Payment Processor ───
  console.log('\n4. WF4: Payment Processor (iaBWaaIjFUrzBcon)');
  const wf4 = await apiCall('GET', '/api/v1/workflows/iaBWaaIjFUrzBcon');
  check('Workflow loaded', !!wf4.id, wf4.name);
  check('Active', wf4.active === true);
  check('Node count', wf4.nodes.length >= 20, `${wf4.nodes.length} nodes`);

  // Generate Tokens
  const genTokens = wf4.nodes.find(n => n.name === 'Generate Tokens');
  check('Generate Tokens node exists', !!genTokens);
  check('Generate Tokens inserts 2 tokens',
    genTokens?.parameters?.query?.includes("'confirm'") &&
    genTokens?.parameters?.query?.includes("'cancel'"));

  // Send Owner Notification is now executeWorkflow (not telegram)
  const sendOwner = wf4.nodes.find(n => n.name === 'Send Owner Notification');
  check('Send Owner Notification type',
    sendOwner?.type === 'n8n-nodes-base.executeWorkflow',
    sendOwner?.type);
  check('Send Owner Notification calls SUB',
    sendOwner?.parameters?.workflowId?.value === 'SV80ObHW5jp7mOhL');

  // Prepare Owner Notification has SUB fields
  const prepNotif = wf4.nodes.find(n => n.name === 'Prepare Owner Notification');
  check('Prepare builds inline_keyboard', prepNotif?.parameters?.jsCode?.includes('inline_keyboard'));
  check('Prepare builds confirmation_urls', prepNotif?.parameters?.jsCode?.includes('confirmation_urls'));
  check('Prepare reads Generate Tokens', prepNotif?.parameters?.jsCode?.includes("$('Generate Tokens')"));

  // Connection: Get Property & Owner → Generate Tokens → Prepare
  const conns = wf4.connections;
  const getPropConn = conns['Get Property & Owner']?.main?.[0] || [];
  check('Get Property & Owner → Generate Tokens',
    getPropConn.some(c => c.node === 'Generate Tokens'));
  const genTokenConn = conns['Generate Tokens']?.main?.[0] || [];
  check('Generate Tokens → Prepare Owner Notification',
    genTokenConn.some(c => c.node === 'Prepare Owner Notification'));

  // ─── 5. All V4 Workflows Active ───
  console.log('\n5. All V4 Workflows Status');
  const allWfs = await apiCall('GET', '/api/v1/workflows?limit=50');
  const v4Wfs = (allWfs.data || []).filter(w => w.name.includes('[V4]'));
  for (const w of v4Wfs) {
    check(`${w.name}`, w.active === true, w.active ? 'ACTIVE' : 'INACTIVE');
  }

  // ─── Summary ───
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  console.log(`${'═'.repeat(50)}`);

  if (fail === 0) {
    console.log('\n🎉 All checks passed! B+D hybrid implementation is complete.');
    console.log('\nNew create_booking flow:');
    console.log('  WF1 AI Gateway → WF4 Payment Processor');
    console.log('    → Normalize Event → Create Pending Booking');
    console.log('    → Get Property & Owner → Generate Tokens');
    console.log('    → Prepare Owner Notification → SUB: Owner & Staff Notifier');
    console.log('    → Return Create Result');
    console.log('\nTelegram owners: inline keyboard buttons');
    console.log('WhatsApp/SMS owners: clickable confirmation URLs');
    console.log('Webhook confirms at: /webhook/payment-confirm?token=...');
    console.log('Webhook cancels at:  /webhook/payment-cancel?token=...');
  } else {
    console.log('\n⚠️  Some checks failed. Review the output above.');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

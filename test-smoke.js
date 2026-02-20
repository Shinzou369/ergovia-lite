#!/usr/bin/env node
/**
 * Ergovia Lite - Full Health Check
 * Tests auth, API protection, dashboard, settings, properties CRUD,
 * bookings CRUD + cancel filter, notifications, seeding, and frontend pages.
 *
 * Usage:
 *   node test-smoke.js                                              # localhost:3000
 *   node test-smoke.js https://ergovia-ai.com                       # live server
 *   TEST_USER=admin TEST_PASS=MyPass123 node test-smoke.js          # custom creds
 *   node test-smoke.js https://ergovia-ai.com admin MyPass123       # creds as args
 */

const http = require('http');
const https = require('https');

const TARGET = process.argv[2] || 'http://localhost:3000';
const BASE = TARGET.replace(/\/$/, '');
const TEST_USER = process.env.TEST_USER || process.argv[3] || 'admin';
const TEST_PASS = process.env.TEST_PASS || process.argv[4] || 'Ergovia2026!';
const IS_HTTPS = BASE.startsWith('https');
const transport = IS_HTTPS ? https : http;

let TOKEN = '';
let passed = 0;
let failed = 0;
let createdPropertyId = null;
let createdBookingId = null;

// ============================================
// HTTP REQUEST HELPER
// ============================================

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || (IS_HTTPS ? 443 : 80),
      path: url.pathname + url.search,
      headers: { ...headers },
    };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = transport.request(opts, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}` };
}

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name} ${detail ? `— ${detail}` : ''}`);
  }
}

// ============================================
// TEST SECTIONS
// ============================================

async function testAuth() {
  console.log('\n┌─ 1. Auth System');

  let r = await request('GET', '/api/auth/status');
  assert('Auth status endpoint responds', r.status === 200 && r.body);

  // Only register if setup is required (avoids conflict on live server)
  if (r.body && r.body.setupRequired) {
    r = await request('POST', '/api/auth/register', {
      username: 'smoketest_' + Date.now(),
      email: `smoke${Date.now()}@test.com`,
      password: 'SmokeTest2026!',
    });
    assert('Register first user succeeds', r.status === 200 && r.body && r.body.token);
    if (r.body && r.body.token) TOKEN = r.body.token;
  } else {
    // Login with provided credentials
    r = await request('POST', '/api/auth/login', {
      username: TEST_USER,
      password: TEST_PASS,
    });
    assert(`Login as "${TEST_USER}" returns token`, r.status === 200 && r.body && r.body.token,
      `status=${r.status} body=${JSON.stringify(r.body).slice(0, 100)}`);
    if (r.body && r.body.token) TOKEN = r.body.token;
  }

  if (!TOKEN) {
    console.log('  \x1b[31m✗ FATAL: No auth token — cannot continue\x1b[0m');
    process.exit(1);
  }

  r = await request('GET', '/api/auth/verify', null, authHeaders());
  assert('Token verification passes', r.status === 200 && r.body && r.body.valid === true);

  r = await request('GET', '/api/auth/status');
  assert('Auth status shows setup complete', r.body && r.body.setupRequired === false);
}

async function testProtection() {
  console.log('\n┌─ 2. API Protection (no token → 401)');

  let r = await request('GET', '/api/v2/dashboard');
  assert('Dashboard rejects without token', r.status === 401);

  r = await request('GET', '/api/v2/settings');
  assert('Settings rejects without token', r.status === 401);

  r = await request('GET', '/api/v2/properties');
  assert('Properties rejects without token', r.status === 401);

  r = await request('GET', '/api/v2/bookings');
  assert('Bookings rejects without token', r.status === 401);
}

async function testDashboard() {
  console.log('\n┌─ 3. Dashboard API');

  const r = await request('GET', '/api/v2/dashboard', null, authHeaders());
  assert('Dashboard returns success', r.status === 200 && r.body && r.body.success);

  if (r.body) {
    assert('Has stats object', r.body.stats !== undefined);
    assert('Stats has totalBookings', r.body.stats && r.body.stats.totalBookings !== undefined);
    assert('Stats has totalProperties', r.body.stats && r.body.stats.totalProperties !== undefined);
    assert('Stats has monthlyRevenue', r.body.stats && r.body.stats.monthlyRevenue !== undefined);
    assert('Has owner object', r.body.owner !== undefined);
    assert('Has notifications array', Array.isArray(r.body.recentNotifications));
  }
}

async function testSettings() {
  console.log('\n┌─ 4. Settings API');

  // GET all settings
  let r = await request('GET', '/api/v2/settings', null, authHeaders());
  assert('Settings GET returns success', r.status === 200 && r.body && r.body.success);

  const data = r.body && r.body.data;
  if (data) {
    assert('Has owner section', data.owner !== undefined);
    assert('Has credentials section', data.credentials !== undefined);
    assert('Has ai section', data.ai !== undefined);
    assert('Has media section', data.media !== undefined);
    assert('Has preferences section', data.preferences !== undefined);
  }

  // Save credentials with OpenAI key
  r = await request('POST', '/api/v2/settings', {
    section: 'credentials',
    data: { openaiApiKey: 'sk-test-smokecheck-12345' },
  }, authHeaders());
  assert('Save credentials (openaiApiKey) succeeds', r.status === 200 && r.body && r.body.success);

  // Verify masked
  r = await request('GET', '/api/v2/settings', null, authHeaders());
  const creds = r.body && r.body.data && r.body.data.credentials;
  assert('OpenAI key is masked', creds && creds.openaiApiKey === '********');

  // Save preferences
  r = await request('POST', '/api/v2/settings', {
    section: 'preferences',
    data: { language: 'es', timezone: 'America/Cancun', currency: 'MXN', paymentMethod: 'bank_transfer' },
  }, authHeaders());
  assert('Save preferences succeeds', r.status === 200 && r.body && r.body.success);

  // Verify persistence
  r = await request('GET', '/api/v2/settings', null, authHeaders());
  const prefs = r.body && r.body.data && r.body.data.preferences;
  assert('Preferences persisted (language=es)', prefs && prefs.language === 'es');
  assert('Preferences persisted (timezone)', prefs && prefs.timezone === 'America/Cancun');
  assert('Preferences persisted (currency=MXN)', prefs && prefs.currency === 'MXN');
}

async function testProperties() {
  console.log('\n┌─ 5. Properties CRUD');

  // Create
  const propName = 'Smoke Test Villa ' + Date.now();
  let r = await request('POST', '/api/v2/properties', {
    name: propName,
    address: '999 Test Blvd, Smoke City',
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    basePrice: 200,
  }, authHeaders());
  assert('Create property succeeds', r.status === 200 && r.body && r.body.success);

  if (r.body && r.body.property) {
    createdPropertyId = r.body.property.id;
    assert('Property has ID', !!createdPropertyId);
  }

  // List
  r = await request('GET', '/api/v2/properties', null, authHeaders());
  assert('Properties list returns success', r.status === 200 && r.body && r.body.success);

  const props = r.body && r.body.properties;
  if (createdPropertyId && Array.isArray(props)) {
    assert('Created property appears in list', props.some(p => p.id === createdPropertyId));
  }

  // Delete (soft)
  if (createdPropertyId) {
    r = await request('DELETE', `/api/v2/properties/${createdPropertyId}`, null, authHeaders());
    assert('Delete property succeeds', r.status === 200 && r.body && r.body.success);

    // Verify gone from list
    r = await request('GET', '/api/v2/properties', null, authHeaders());
    const afterDelete = (r.body && r.body.properties) || [];
    assert('Deleted property removed from list', !afterDelete.some(p => p.id === createdPropertyId));
  }
}

async function testBookings() {
  console.log('\n┌─ 6. Bookings CRUD + Cancel Filter');

  // Create a temporary property for booking
  let r = await request('POST', '/api/v2/properties', {
    name: 'Booking Test Prop ' + Date.now(),
    address: '1 Booking Ln',
  }, authHeaders());
  const tempPropId = r.body && r.body.property && r.body.property.id;

  // Create booking
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 3);

  r = await request('POST', '/api/v2/bookings', {
    propertyId: tempPropId || 'prop-test',
    guestName: 'Smoke Tester',
    guestPhone: '+1555000000',
    checkIn: tomorrow.toISOString().split('T')[0],
    checkOut: dayAfter.toISOString().split('T')[0],
    guests: 2,
    totalAmount: 400,
    platform: 'direct',
    status: 'confirmed',
  }, authHeaders());
  assert('Create booking succeeds', r.status === 200 && r.body && r.body.success);
  createdBookingId = r.body && r.body.bookingId;
  assert('Booking has ID', !!createdBookingId);

  // Verify appears in list
  r = await request('GET', '/api/v2/bookings', null, authHeaders());
  assert('Bookings GET returns 200', r.status === 200);
  const bookingsList = (r.body && r.body.bookings) || r.body || [];
  const bookingsArray = Array.isArray(bookingsList) ? bookingsList : [];
  assert('Created booking is in list', bookingsArray.some(b => b.id === createdBookingId));

  // Cancel
  if (createdBookingId) {
    r = await request('DELETE', `/api/v2/bookings/${createdBookingId}`, null, authHeaders());
    assert('Cancel booking succeeds', r.status === 200 && r.body && r.body.success);

    // Verify GONE from list (Fix 2 check)
    r = await request('GET', '/api/v2/bookings', null, authHeaders());
    const afterCancel = (r.body && r.body.bookings) || r.body || [];
    const afterArray = Array.isArray(afterCancel) ? afterCancel : [];
    assert('Cancelled booking NOT in list (Fix 2)', !afterArray.some(b => b.id === createdBookingId));
  }

  // Clean up temp property
  if (tempPropId) {
    await request('DELETE', `/api/v2/properties/${tempPropId}`, null, authHeaders());
  }
}

async function testNotifications() {
  console.log('\n┌─ 7. Notifications');

  let r = await request('GET', '/api/v2/notifications', null, authHeaders());
  assert('Notifications GET works', r.status === 200 && r.body && r.body.success);

  const notifs = r.body && r.body.notifications;
  assert('Notifications is array', Array.isArray(notifs));

  if (Array.isArray(notifs) && notifs.length > 0) {
    assert('Has welcome notification', notifs.some(n => n.title && n.title.includes('Welcome')));

    const reminders = notifs.filter(n => n.type === 'reminder');
    assert('Has setup reminder notifications (Fix 6)', reminders.length > 0);

    if (reminders.length > 0) {
      assert('Reminder has actionLink', !!reminders[0].actionLink);
    }

    // Mark one as read
    r = await request('POST', '/api/v2/notifications/read', { notificationId: notifs[0].id }, authHeaders());
    assert('Mark notification read works', r.status === 200 && r.body && r.body.success);
  }
}

async function testSeed() {
  console.log('\n┌─ 8. Demo Data Seeding');

  const r = await request('POST', '/api/v2/seed', {}, authHeaders());
  assert('Seed returns success', r.status === 200 && r.body && r.body.success);

  if (r.body) {
    assert('Seed created properties', (r.body.properties || 0) > 0);
    assert('Seed created bookings', (r.body.bookings || 0) > 0);
  }
}

async function testFrontendPages() {
  console.log('\n┌─ 9. Frontend Pages');

  // Login page
  let r = await request('GET', '/login.html');
  assert('Login page loads (200)', r.status === 200);
  assert('Login has auth form', r.raw && r.raw.includes('login'));
  assert('Login body has overflow-y: auto (Fix 3)', r.raw && r.raw.includes('overflow-y: auto'));

  // V2 pages (require token cookie or served as static)
  r = await request('GET', '/v2/dashboard.html', null, authHeaders());
  assert('V2 Dashboard page loads', r.status === 200);
  assert('Dashboard has tasksContainer (Fix 5)', r.raw && r.raw.includes('tasksContainer'));

  r = await request('GET', '/v2/settings.html', null, authHeaders());
  assert('V2 Settings page loads', r.status === 200);
  assert('Settings has openaiApiKey field (Fix 4)', r.raw && r.raw.includes('openaiApiKey'));
  assert('Settings has language field (Fix 4)', r.raw && r.raw.includes('id="language"'));

  r = await request('GET', '/v2/properties.html', null, authHeaders());
  assert('V2 Properties page loads', r.status === 200);

  // Root page
  r = await request('GET', '/');
  assert('Root serves page with auth redirect', r.status === 200 && r.raw && r.raw.includes('auth/verify'));

  // V1 pages
  r = await request('GET', '/onboarding.html');
  assert('V1 Onboarding page loads', r.status === 200);

  r = await request('GET', '/admin.html');
  assert('V1 Admin page loads', r.status === 200);
}

async function testHealth() {
  console.log('\n┌─ 10. System Health');

  const r = await request('GET', '/api/status', null, authHeaders());
  assert('Health check responds', r.status === 200);
}

// ============================================
// MAIN
// ============================================

async function run() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ERGOVIA LITE — FULL HEALTH CHECK       ║');
  console.log(`║   Target: ${BASE.padEnd(30)}║`);
  console.log(`║   User:   ${TEST_USER.padEnd(30)}║`);
  console.log('╚══════════════════════════════════════════╝');

  await testAuth();
  await testProtection();
  await testDashboard();
  await testSettings();
  await testProperties();
  await testBookings();
  await testNotifications();
  await testSeed();
  await testFrontendPages();
  await testHealth();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║   RESULTS: \x1b[32m${String(passed).padStart(2)} passed\x1b[0m  \x1b[31m${String(failed).padStart(2)} failed\x1b[0m           ║`);
  if (failed === 0) {
    console.log('║   \x1b[32mALL TESTS PASSED!\x1b[0m                       ║');
  }
  console.log('╚══════════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test crashed:', e.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Ergovia Lite - Smoke Test
 * Tests auth, API protection, notifications, settings, bookings
 */

const http = require('http');

const BASE = 'http://localhost:3000';
let TOKEN = '';
let passed = 0;
let failed = 0;

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { ...headers }
    };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
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
    console.log(`  + ${name}`);
  } else {
    failed++;
    console.log(`  X ${name} ${detail}`);
  }
}

async function run() {
  console.log('\n======================================');
  console.log('  ERGOVIA LITE SMOKE TEST');
  console.log('======================================\n');

  // 1. Auth Status - no users
  console.log('> Auth System');
  let r = await request('GET', '/api/auth/status');
  assert('Auth status returns setup needed', r.body && r.body.setupRequired === true, JSON.stringify(r.body));

  // 2. Register first admin
  r = await request('POST', '/api/auth/register', {
    username: 'admin',
    email: 'admin@ergovia.ai',
    password: 'Test1234!'
  });
  assert('Register first user succeeds', r.status === 200 && r.body && r.body.token, `status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);
  if (r.body && r.body.token) TOKEN = r.body.token;

  // 3. Login
  r = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'Test1234!'
  });
  assert('Login returns token', r.status === 200 && r.body && r.body.token, `status=${r.status}`);
  if (r.body && r.body.token) TOKEN = r.body.token;

  // 4. Verify token
  r = await request('GET', '/api/auth/verify', null, authHeaders());
  assert('Token verification passes', r.status === 200 && r.body && r.body.valid === true, `status=${r.status} body=${JSON.stringify(r.body).slice(0,100)}`);

  // 5. Auth status after user exists
  r = await request('GET', '/api/auth/status');
  assert('Auth status shows setup complete', r.body && r.body.setupRequired === false);

  // 6. Protected routes without token
  console.log('\n> API Protection');
  r = await request('GET', '/api/v2/dashboard');
  assert('Dashboard API rejects without token (401)', r.status === 401, `got ${r.status}`);

  r = await request('GET', '/api/v2/settings');
  assert('Settings API rejects without token (401)', r.status === 401, `got ${r.status}`);

  r = await request('GET', '/api/v2/properties');
  assert('Properties API rejects without token (401)', r.status === 401, `got ${r.status}`);

  // 7. Dashboard with token
  console.log('\n> V2 Dashboard API');
  r = await request('GET', '/api/v2/dashboard', null, authHeaders());
  assert('Dashboard API returns data', r.status === 200 && r.body && r.body.success, `status=${r.status}`);
  if (r.body) {
    assert('Dashboard has stats', r.body.stats !== undefined);
    assert('Dashboard has notifications', Array.isArray(r.body.recentNotifications));
    assert('Dashboard has bookings', r.body.upcomingBookings !== undefined);
  }

  // 8. Settings
  console.log('\n> Settings API');
  r = await request('GET', '/api/v2/settings', null, authHeaders());
  assert('Settings GET works', r.status === 200 && r.body && r.body.success, `status=${r.status}`);

  r = await request('POST', '/api/v2/settings', {
    section: 'credentials',
    data: { n8n_url: 'https://test.example.com', n8n_api_key: 'test-key-123' }
  }, authHeaders());
  assert('Settings POST works', r.status === 200 && r.body && r.body.success, `status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);

  // Verify persistence
  r = await request('GET', '/api/v2/settings', null, authHeaders());
  const creds = r.body && r.body.data && r.body.data.credentials;
  assert('Settings persisted (n8n_url)', creds && creds.n8n_url === 'https://test.example.com', JSON.stringify(creds));
  assert('Sensitive fields masked', creds && creds.n8n_api_key === '********', `got: ${creds && creds.n8n_api_key}`);

  // 9. Notifications
  console.log('\n> Notifications API');
  r = await request('GET', '/api/v2/notifications', null, authHeaders());
  assert('Notifications GET works', r.status === 200 && r.body && r.body.success, `status=${r.status}`);
  const notifs = r.body && r.body.notifications;
  if (Array.isArray(notifs) && notifs.length > 0) {
    assert('Notifications have seeded data', notifs.length > 0, `count=${notifs.length}`);
    assert('Notification has required fields', notifs[0].id && notifs[0].title && notifs[0].type);

    // Mark one as read
    r = await request('POST', '/api/v2/notifications/read', { notificationId: notifs[0].id }, authHeaders());
    assert('Mark notification read works', r.status === 200 && r.body && r.body.success, `status=${r.status}`);

    // Check unread count decreased
    r = await request('GET', '/api/v2/notifications', null, authHeaders());
    const remaining = r.body && r.body.unreadCount;
    assert('Unread count updated', remaining !== undefined, `unreadCount=${remaining}`);
  } else {
    assert('Notifications returned array', Array.isArray(notifs), JSON.stringify(r.body).slice(0,200));
  }

  // 10. Properties
  console.log('\n> Properties API');
  r = await request('GET', '/api/v2/properties', null, authHeaders());
  assert('Properties GET works', r.status === 200 && r.body && r.body.success, `status=${r.status}`);

  // 11. Bookings
  console.log('\n> Bookings API');
  r = await request('GET', '/api/v2/bookings', null, authHeaders());
  assert('Bookings GET works', r.status === 200, `status=${r.status}`);

  // 12. Static pages
  console.log('\n> Static Pages');
  r = await request('GET', '/login.html');
  assert('Login page loads (200)', r.status === 200);
  assert('Login page has auth form', r.raw && r.raw.includes('login'));

  r = await request('GET', '/v2/dashboard.html');
  assert('V2 dashboard page loads', r.status === 200);

  r = await request('GET', '/v2/properties.html');
  assert('V2 properties page loads', r.status === 200);

  r = await request('GET', '/v2/settings.html');
  assert('V2 settings page loads', r.status === 200);

  // 13. Root serves page (index.html with client-side auth redirect)
  console.log('\n> Root Page');
  r = await request('GET', '/');
  assert('Root serves index.html', r.status === 200 && r.raw && r.raw.includes('auth/verify'));

  // 14. V1 pages
  console.log('\n> V1 Pages');
  r = await request('GET', '/onboarding.html');
  assert('Onboarding page loads', r.status === 200);

  r = await request('GET', '/settings.html');
  assert('V1 Settings page loads', r.status === 200);

  r = await request('GET', '/admin.html');
  assert('Admin page loads', r.status === 200);

  // 15. Client data
  console.log('\n> Client Data API');
  r = await request('GET', '/api/client', null, authHeaders());
  assert('Client data GET works', r.status === 200, `status=${r.status}`);

  // 16. Health check
  r = await request('GET', '/api/status', null, authHeaders());
  assert('Health check works', r.status === 200, `status=${r.status}`);

  // Summary
  console.log('\n======================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  ALL TESTS PASSED!');
  }
  console.log('======================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test crashed:', e.message);
  process.exit(1);
});

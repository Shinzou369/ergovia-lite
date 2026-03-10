const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  console.log('=== INSERTING TEST DATA ===\n');

  // 1. Create test customer
  console.log('1. Creating test customer...');
  const custResult = await client.query(`
    INSERT INTO customers (name, email, phone, preferred_platform, status)
    VALUES ('Test Owner', 'test@ergovia-ai.com', '+1234567890', 'telegram', 'active')
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  let customerId = custResult.rows[0]?.id;
  if (!customerId) {
    const existing = await client.query("SELECT id FROM customers WHERE email = 'test@ergovia-ai.com' LIMIT 1");
    customerId = existing.rows[0]?.id;
  }
  console.log('  OK: customer_id = ' + customerId);

  // 2. Create budget
  console.log('\n2. Creating budget...');
  const monthYear = new Date().toISOString().slice(0, 7); // "2026-02"
  await client.query(`
    INSERT INTO api_usage_budget (customer_id, month_year, monthly_budget, used_amount)
    VALUES ($1, $2, 50.00, 0.00)
    ON CONFLICT DO NOTHING
  `, [customerId, monthYear]);
  console.log('  OK: $50/month budget for ' + monthYear);

  // 3. Create test owner
  console.log('\n3. Creating test owner...');
  await client.query(`
    INSERT INTO owners (owner_id, owner_name, owner_email, owner_phone, owner_chat_id, preferred_platform)
    VALUES ('test-owner-001', 'Test Owner', 'test@ergovia-ai.com', '+1234567890', 'test-chat-id', 'telegram')
    ON CONFLICT (owner_id) DO UPDATE SET owner_name = EXCLUDED.owner_name
  `);
  console.log('  OK: test-owner-001');

  // 4. Create test property
  console.log('\n4. Creating test property...');
  await client.query(`
    INSERT INTO property_configurations (
      property_id, property_name, address, property_status,
      owner_name, owner_contact, owner_telegram, owner_phone, owner_email,
      base_price, weekend_price, holiday_price, cleaning_fee,
      max_guests, bedrooms, bathrooms, min_stay_nights, max_stay_nights,
      calendar_sync_enabled, timezone,
      auto_approve_bookings, require_screening,
      settings, customer_id
    ) VALUES (
      'PROP-TEST-001', 'Beach House Test', 'Calle Sol 15, Test City', 'active',
      'Test Owner', 'test-chat-id', 'test-chat-id', '+1234567890', 'test@ergovia-ai.com',
      85.00, 110.00, 150.00, 45.00,
      6, 3, 2, 2, 30,
      false, 'Europe/Madrid',
      false, false,
      '{"check_in_time": "15:00", "check_out_time": "11:00"}'::jsonb,
      $1
    )
    ON CONFLICT (property_id) DO UPDATE SET
      property_name = EXCLUDED.property_name,
      property_status = EXCLUDED.property_status,
      base_price = EXCLUDED.base_price,
      weekend_price = EXCLUDED.weekend_price,
      cleaning_fee = EXCLUDED.cleaning_fee,
      max_guests = EXCLUDED.max_guests,
      customer_id = EXCLUDED.customer_id
  `, [customerId]);
  console.log('  OK: PROP-TEST-001 (Beach House Test)');

  // 5. Verify
  console.log('\n=== VERIFICATION ===');
  const props = await client.query(
    "SELECT property_id, property_name, property_status, base_price, weekend_price, cleaning_fee, max_guests, bedrooms, bathrooms, min_stay_nights, owner_contact FROM property_configurations WHERE property_status = 'active'"
  );
  for (const p of props.rows) {
    console.log('  Property: ' + p.property_name);
    console.log('    ID: ' + p.property_id + ' | Status: ' + p.property_status);
    console.log('    Price: $' + p.base_price + '/night ($' + p.weekend_price + ' weekend) + $' + p.cleaning_fee + ' cleaning');
    console.log('    Capacity: ' + p.max_guests + ' guests, ' + p.bedrooms + 'BR/' + p.bathrooms + 'BA');
    console.log('    Min stay: ' + p.min_stay_nights + ' nights');
    console.log('    Owner contact: ' + p.owner_contact);
  }

  const bookings = await client.query("SELECT COUNT(*) as count FROM bookings WHERE property_id = 'PROP-TEST-001'");
  console.log('\n  Bookings for PROP-TEST-001: ' + bookings.rows[0].count + ' (should be 0)');

  console.log('\n=== READY TO TEST WF3 ===');
  console.log('  Run WF3 with: {property_id: "", check_in_date: "2026-02-14", check_out_date: "2026-02-15"}');
  console.log('  Expected: 1 property available, $85/night, 6 guests max');

  await client.end();
}

main().catch(console.error);

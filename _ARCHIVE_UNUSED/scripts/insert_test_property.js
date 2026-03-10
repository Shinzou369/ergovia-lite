const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  console.log('=== INSERTING TEST DATA ===\n');

  // 1. Create test owner
  console.log('1. Creating test owner...');
  await client.query(`
    INSERT INTO owners (owner_id, owner_name, owner_email, owner_phone, owner_chat_id, preferred_platform)
    VALUES ('test-owner-001', 'Test Owner', 'test@ergovia-ai.com', '+1234567890', 'test-chat-id', 'telegram')
    ON CONFLICT (owner_id) DO UPDATE SET
      owner_name = EXCLUDED.owner_name,
      owner_email = EXCLUDED.owner_email
  `);
  console.log('  OK: test-owner-001');

  // 2. Create test customer + budget
  console.log('\n2. Creating test customer...');
  const custResult = await client.query(`
    INSERT INTO customers (customer_id, business_name, contact_name, contact_email, status)
    VALUES (gen_random_uuid(), 'Test Business', 'Test Owner', 'test@ergovia-ai.com', 'active')
    ON CONFLICT DO NOTHING
    RETURNING customer_id
  `);
  let customerId = custResult.rows[0]?.customer_id;
  if (!customerId) {
    const existing = await client.query("SELECT customer_id FROM customers WHERE contact_email = 'test@ergovia-ai.com' LIMIT 1");
    customerId = existing.rows[0]?.customer_id;
  }
  console.log('  OK: ' + customerId);

  // Create budget
  if (customerId) {
    await client.query(`
      INSERT INTO api_usage_budget (customer_id, monthly_budget_usd, current_month_usage_usd, alert_threshold_50, alert_threshold_80, alert_threshold_100)
      VALUES ($1, 50.00, 0.00, false, false, false)
      ON CONFLICT (customer_id) DO NOTHING
    `, [customerId]);
    console.log('  Budget set: $50/month');
  }

  // 3. Create test property
  console.log('\n3. Creating test property...');
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

  // 4. Verify
  console.log('\n=== VERIFICATION ===');
  const props = await client.query("SELECT property_id, property_name, property_status, base_price, max_guests, owner_contact FROM property_configurations WHERE property_status = 'active'");
  for (const p of props.rows) {
    console.log('  Property: ' + p.property_name + ' | $' + p.base_price + '/night | ' + p.max_guests + ' guests | contact=' + p.owner_contact);
  }

  const bookings = await client.query("SELECT COUNT(*) as count FROM bookings WHERE property_id = 'PROP-TEST-001'");
  console.log('  Bookings for PROP-TEST-001: ' + bookings.rows[0].count);

  console.log('\n=== READY TO TEST ===');
  console.log('  WF3 should now find 1 active property with 0 bookings');
  console.log('  Expected result: "1 property available for 2026-02-14 to 2026-02-15"');

  await client.end();
}

main().catch(console.error);

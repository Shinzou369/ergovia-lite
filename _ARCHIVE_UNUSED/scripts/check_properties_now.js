const { Client } = require('pg');
async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  // Check ALL properties (any status)
  console.log('=== ALL PROPERTIES ===');
  const all = await client.query("SELECT property_id, property_name, property_status, address, base_price, max_guests, owner_contact, owner_telegram, created_at FROM property_configurations ORDER BY created_at DESC");
  if (all.rows.length === 0) {
    console.log('  (none found)');
  } else {
    for (const p of all.rows) {
      console.log('  ' + JSON.stringify(p));
    }
  }

  // Check owners table
  console.log('\n=== OWNERS ===');
  const owners = await client.query("SELECT * FROM owners");
  if (owners.rows.length === 0) {
    console.log('  (none found)');
  } else {
    for (const o of owners.rows) {
      console.log('  ' + JSON.stringify(o));
    }
  }

  // Check customers table
  console.log('\n=== CUSTOMERS ===');
  const customers = await client.query("SELECT * FROM customers LIMIT 5");
  if (customers.rows.length === 0) {
    console.log('  (none found)');
  } else {
    for (const c of customers.rows) {
      console.log('  ' + JSON.stringify(c));
    }
  }

  // Check bookings table
  console.log('\n=== BOOKINGS ===');
  const bookings = await client.query("SELECT * FROM bookings LIMIT 5");
  if (bookings.rows.length === 0) {
    console.log('  (none found)');
  } else {
    for (const b of bookings.rows) {
      console.log('  ' + JSON.stringify(b));
    }
  }

  await client.end();
}
main().catch(console.error);

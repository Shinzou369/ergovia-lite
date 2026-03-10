const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12',
    port: 5432,
    database: 'ergovia_db',
    user: 'ergovia_user',
    password: 'ergovia_secure_2026'
  });
  await client.connect();

  // Check function definition
  console.log('=== check_budget_available function ===');
  const funcDef = await client.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'check_budget_available'
  `);
  if (funcDef.rows.length > 0) {
    console.log(funcDef.rows[0].def);
  } else {
    console.log('FUNCTION NOT FOUND!');
  }

  // Try calling it with the fallback UUID
  console.log('\n=== Test: check_budget_available with fallback UUID ===');
  try {
    const result = await client.query(`SELECT * FROM check_budget_available('00000000-0000-0000-0000-000000000001'::uuid)`);
    console.log('Rows:', result.rows.length);
    console.log('Data:', JSON.stringify(result.rows, null, 2));
    console.log('Columns:', result.fields.map(f => f.name).join(', '));
  } catch (err) {
    console.log('ERROR:', err.message);
  }

  // Check conversations table
  console.log('\n=== conversations table ===');
  const convCount = await client.query('SELECT COUNT(*) as cnt FROM conversations');
  console.log('Row count:', convCount.rows[0].cnt);

  // Check property_configurations
  console.log('\n=== property_configurations table ===');
  const propCount = await client.query('SELECT COUNT(*) as cnt FROM property_configurations');
  console.log('Row count:', propCount.rows[0].cnt);
  const props = await client.query('SELECT property_id, property_name, customer_id FROM property_configurations LIMIT 5');
  console.log('Sample:', JSON.stringify(props.rows, null, 2));

  // Check customers table
  console.log('\n=== customers table ===');
  try {
    const custCount = await client.query('SELECT COUNT(*) as cnt FROM customers');
    console.log('Row count:', custCount.rows[0].cnt);
    const custs = await client.query('SELECT * FROM customers LIMIT 5');
    console.log('Sample:', JSON.stringify(custs.rows, null, 2));
  } catch (err) {
    console.log('ERROR:', err.message);
  }

  await client.end();
}

main().catch(console.error);

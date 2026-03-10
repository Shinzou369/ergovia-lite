const { Client } = require('pg');
async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  // 1. owners table
  console.log('=== owners table schema ===');
  const ownerCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'owners' ORDER BY ordinal_position"
  );
  for (const c of ownerCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  console.log('\n=== owners data ===');
  const owners = await client.query("SELECT * FROM owners LIMIT 5");
  for (const o of owners.rows) console.log('  ' + JSON.stringify(o));

  // 2. system_settings table
  console.log('\n=== system_settings schema ===');
  const settCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'system_settings' ORDER BY ordinal_position"
  );
  for (const c of settCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  console.log('\n=== system_settings data ===');
  const settings = await client.query("SELECT * FROM system_settings LIMIT 10");
  for (const s of settings.rows) console.log('  ' + JSON.stringify(s));

  // 3. All properties (including inactive) - see if any have owner_contact
  console.log('\n=== ALL properties (any status) ===');
  const allProps = await client.query(
    "SELECT property_id, property_name, property_status, owner_name, owner_contact, owner_telegram, owner_phone FROM property_configurations LIMIT 10"
  );
  for (const p of allProps.rows) {
    console.log('  ' + p.property_name + ' | status=' + p.property_status +
      ' | contact=' + (p.owner_contact || 'null') +
      ' | telegram=' + (p.owner_telegram || 'null') +
      ' | phone=' + (p.owner_phone || 'null'));
  }

  await client.end();
}
main().catch(console.error);

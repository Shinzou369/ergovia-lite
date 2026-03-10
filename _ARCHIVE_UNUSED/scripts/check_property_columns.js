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

  // Get actual columns in property_configurations
  console.log('=== property_configurations columns ===');
  const cols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'property_configurations'
    ORDER BY ordinal_position
  `);
  for (const row of cols.rows) {
    console.log(`  ${row.column_name} (${row.data_type})`);
  }

  // Get actual columns in conversations
  console.log('\n=== conversations columns ===');
  const convCols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'conversations'
    ORDER BY ordinal_position
  `);
  for (const row of convCols.rows) {
    console.log(`  ${row.column_name} (${row.data_type})`);
  }

  await client.end();
}

main().catch(console.error);

const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  // Check all tables referenced by WF2 queries
  const tables = ['deals', 'offer_conflicts', 'conversations', 'property_configurations'];

  for (const table of tables) {
    console.log(`\n=== ${table} ===`);
    const cols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    for (const row of cols.rows) {
      console.log(`  ${row.column_name} (${row.data_type})`);
    }
    if (cols.rows.length === 0) console.log('  TABLE NOT FOUND!');
  }

  await client.end();
}

main().catch(console.error);

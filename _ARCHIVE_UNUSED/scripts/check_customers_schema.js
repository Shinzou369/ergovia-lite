const { Client } = require('pg');
async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  for (const tbl of ['customers', 'api_usage_budget', 'property_configurations']) {
    const cols = await client.query(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [tbl]
    );
    console.log('=== ' + tbl + ' ===');
    for (const c of cols.rows) {
      console.log('  ' + c.column_name + ' (' + c.data_type + ')' + (c.column_default ? ' DEFAULT ' + c.column_default : ''));
    }
    console.log('');
  }
  await client.end();
}
main().catch(console.error);

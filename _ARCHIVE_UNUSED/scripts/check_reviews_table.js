const { Client } = require('pg');
async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();
  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reviews' ORDER BY ordinal_position"
  );
  console.log('=== reviews table ===');
  for (const c of cols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // Also check control_panel_tasks and manual_tasks
  for (const tbl of ['control_panel_tasks', 'manual_tasks', 'scheduled_messages']) {
    const res = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [tbl]
    );
    console.log('\n=== ' + tbl + ' ===');
    for (const c of res.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');
  }
  await client.end();
}
main().catch(console.error);

const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  // Find n8n chat memory tables
  console.log('=== Looking for chat memory tables ===');
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND (table_name LIKE '%chat%' OR table_name LIKE '%memory%' OR table_name LIKE '%message%' OR table_name LIKE '%n8n%')
    ORDER BY table_name
  `);
  for (const row of tables.rows) {
    console.log(`  ${row.table_name}`);
    // Show row count
    const count = await client.query(`SELECT COUNT(*) as cnt FROM "${row.table_name}"`);
    console.log(`    rows: ${count.rows[0].cnt}`);
    // Show sample
    const sample = await client.query(`SELECT * FROM "${row.table_name}" LIMIT 3`);
    if (sample.rows.length > 0) {
      console.log(`    columns: ${Object.keys(sample.rows[0]).join(', ')}`);
      for (const r of sample.rows) {
        const preview = JSON.stringify(r).substring(0, 200);
        console.log(`    sample: ${preview}`);
      }
    }
  }

  // Also check for any table with 'history' in the name
  const histTables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE '%histor%'
  `);
  for (const row of histTables.rows) {
    console.log(`\n  ${row.table_name}`);
    const count = await client.query(`SELECT COUNT(*) as cnt FROM "${row.table_name}"`);
    console.log(`    rows: ${count.rows[0].cnt}`);
  }

  await client.end();
}

main().catch(console.error);

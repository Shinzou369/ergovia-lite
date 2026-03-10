const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  // Check conversations table
  const convCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'conversations' ORDER BY ordinal_position"
  );
  console.log('=== conversations table ===');
  if (convCols.rows.length === 0) console.log('  TABLE DOES NOT EXIST');
  for (const c of convCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // Check deals table
  const dealsCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'deals' ORDER BY ordinal_position"
  );
  console.log('\n=== deals table ===');
  if (dealsCols.rows.length === 0) console.log('  TABLE DOES NOT EXIST');
  for (const c of dealsCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // Check maintenance_tickets table
  const mtCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'maintenance_tickets' ORDER BY ordinal_position"
  );
  console.log('\n=== maintenance_tickets table ===');
  if (mtCols.rows.length === 0) console.log('  TABLE DOES NOT EXIST');
  for (const c of mtCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // Check cleaning_schedules
  const csCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cleaning_schedules' ORDER BY ordinal_position"
  );
  console.log('\n=== cleaning_schedules table ===');
  if (csCols.rows.length === 0) console.log('  TABLE DOES NOT EXIST');
  for (const c of csCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // Check automation_log
  const alCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'automation_log' ORDER BY ordinal_position"
  );
  console.log('\n=== automation_log table ===');
  if (alCols.rows.length === 0) console.log('  TABLE DOES NOT EXIST');
  for (const c of alCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // Check n8n_chat_histories
  const chatCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'n8n_chat_histories' ORDER BY ordinal_position"
  );
  console.log('\n=== n8n_chat_histories table ===');
  if (chatCols.rows.length === 0) console.log('  TABLE DOES NOT EXIST');
  for (const c of chatCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // Check property_reviews
  const prCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'property_reviews' ORDER BY ordinal_position"
  );
  console.log('\n=== property_reviews table ===');
  if (prCols.rows.length === 0) console.log('  TABLE DOES NOT EXIST');
  for (const c of prCols.rows) console.log('  ' + c.column_name + ' (' + c.data_type + ')');

  // List ALL tables
  const tables = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.log('\n=== ALL TABLES ===');
  for (const t of tables.rows) console.log('  ' + t.tablename);

  await client.end();
}

main().catch(console.error);

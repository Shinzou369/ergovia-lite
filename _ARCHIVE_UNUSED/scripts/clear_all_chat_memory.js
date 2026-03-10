const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  // Count before
  const before = await client.query("SELECT COUNT(*) as cnt FROM n8n_chat_histories");
  console.log(`Chat memory BEFORE: ${before.rows[0].cnt} messages`);

  // Delete all stale chat memory
  const del = await client.query("DELETE FROM n8n_chat_histories RETURNING id");
  console.log(`DELETED: ${del.rowCount} messages`);

  // Verify empty
  const after = await client.query("SELECT COUNT(*) as cnt FROM n8n_chat_histories");
  console.log(`Chat memory AFTER: ${after.rows[0].cnt} messages`);

  console.log('\nChat memory cleared. WF2 AI Booking Agent should work on next test.');

  await client.end();
}

main().catch(console.error);

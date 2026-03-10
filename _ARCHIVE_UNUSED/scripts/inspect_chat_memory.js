const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: '116.203.115.12', port: 5432,
    database: 'ergovia_db', user: 'ergovia_user', password: 'ergovia_secure_2026'
  });
  await client.connect();

  // Show all unique session_ids and message counts
  const sessions = await client.query(
    "SELECT session_id, COUNT(*) as cnt, MIN(id) as first_id, MAX(id) as last_id " +
    "FROM n8n_chat_histories GROUP BY session_id ORDER BY session_id"
  );
  console.log('=== Sessions ===');
  for (const s of sessions.rows) {
    console.log(`  session=${s.session_id}  messages=${s.cnt}  ids=${s.first_id}-${s.last_id}`);
  }

  // Show message types per session
  console.log('\n=== Message types per session ===');
  const types = await client.query(
    "SELECT session_id, message->>'type' as msg_type, COUNT(*) as cnt " +
    "FROM n8n_chat_histories GROUP BY session_id, message->>'type' " +
    "ORDER BY session_id, message->>'type'"
  );
  for (const t of types.rows) {
    console.log(`  session=${t.session_id}  type=${t.msg_type}  count=${t.cnt}`);
  }

  // Check for tool messages (these cause the error)
  console.log('\n=== Tool messages (corrupted) ===');
  const toolMsgs = await client.query(
    "SELECT id, session_id, message->>'type' as msg_type, " +
    "LEFT(message->>'content', 150) as preview " +
    "FROM n8n_chat_histories WHERE message->>'type' = 'tool' ORDER BY id"
  );
  console.log(`  Found ${toolMsgs.rows.length} tool messages`);
  for (const m of toolMsgs.rows) {
    console.log(`  id=${m.id} session=${m.session_id}: ${m.preview || '(empty)'}`);
  }

  // Show last 10 messages to see the corruption pattern
  console.log('\n=== Last 15 messages (most recent) ===');
  const recent = await client.query(
    "SELECT id, session_id, message->>'type' as msg_type, " +
    "LEFT(message->>'content', 120) as preview " +
    "FROM n8n_chat_histories ORDER BY id DESC LIMIT 15"
  );
  for (const m of recent.rows.reverse()) {
    console.log(`  id=${m.id} session=${m.session_id} [${m.msg_type}]: ${m.preview || '(no content)'}`);
  }

  await client.end();
}

main().catch(console.error);

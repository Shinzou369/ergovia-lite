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

  // Check log_api_usage function definition
  console.log('=== log_api_usage function ===');
  const funcDef = await client.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'log_api_usage'
  `);
  if (funcDef.rows.length > 0) {
    console.log(funcDef.rows[0].def);
  } else {
    console.log('FUNCTION NOT FOUND!');
  }

  // Check get_or_create_budget function
  console.log('\n=== get_or_create_budget function ===');
  const funcDef2 = await client.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'get_or_create_budget'
  `);
  if (funcDef2.rows.length > 0) {
    console.log(funcDef2.rows[0].def);
  } else {
    console.log('FUNCTION NOT FOUND!');
  }

  // Check reset_monthly_budgets
  console.log('\n=== reset_monthly_budgets function ===');
  const funcDef3 = await client.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'reset_monthly_budgets'
  `);
  if (funcDef3.rows.length > 0) {
    console.log(funcDef3.rows[0].def);
  } else {
    console.log('FUNCTION NOT FOUND!');
  }

  await client.end();
}

main().catch(console.error);

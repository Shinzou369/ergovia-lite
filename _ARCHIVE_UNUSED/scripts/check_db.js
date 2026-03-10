const { Client } = require('pg');

const client = new Client({
  host: '116.203.115.12',
  port: 5432,
  database: 'ergovia_db',
  user: 'ergovia_user',
  password: 'ergovia_secure_2026',
  ssl: false,
  connectionTimeoutMillis: 10000
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL!');

    // Check existing tables
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    );
    console.log('\n=== EXISTING TABLES ===');
    tables.rows.forEach(r => console.log('  ' + r.tablename));
    console.log(`Total: ${tables.rows.length} tables`);

    // Check for specific missing tables
    const needed = ['conversations', 'cleaning_schedules', 'offer_conflicts',
                    'customers', 'owners', 'n8n_chat_histories',
                    'api_usage_budget', 'api_usage_log', 'api_pricing_rates',
                    'api_budget_alerts', 'api_credit_purchases'];
    console.log('\n=== MISSING TABLES CHECK ===');
    const tableNames = tables.rows.map(r => r.tablename);
    needed.forEach(t => {
      console.log(`  ${t}: ${tableNames.includes(t) ? 'EXISTS' : 'MISSING'}`);
    });

    // Check for missing columns on property_configurations
    try {
      const cols = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='property_configurations' ORDER BY ordinal_position"
      );
      console.log('\n=== property_configurations COLUMNS ===');
      const colNames = cols.rows.map(r => r.column_name);
      console.log('  Has customer_id:', colNames.includes('customer_id'));
      console.log('  Has owner_contact:', colNames.includes('owner_contact'));
      console.log('  Has owner_id:', colNames.includes('owner_id'));
    } catch(e) {
      console.log('property_configurations table may not exist:', e.message);
    }

    // Check for functions
    try {
      const funcs = await client.query(
        "SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_type='FUNCTION' ORDER BY routine_name"
      );
      console.log('\n=== EXISTING FUNCTIONS ===');
      funcs.rows.forEach(r => console.log('  ' + r.routine_name));
      const funcNames = funcs.rows.map(r => r.routine_name);
      const neededFuncs = ['check_budget_available', 'log_api_usage', 'reset_monthly_budgets', 'get_or_create_budget'];
      console.log('\n=== MISSING FUNCTIONS CHECK ===');
      neededFuncs.forEach(f => {
        console.log(`  ${f}: ${funcNames.includes(f) ? 'EXISTS' : 'MISSING'}`);
      });
    } catch(e) {
      console.log('Error checking functions:', e.message);
    }

  } catch(e) {
    console.error('Connection error:', e.message);
  } finally {
    await client.end();
  }
}

main();

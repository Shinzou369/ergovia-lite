const { Pool } = require('pg');
const pool = new Pool({
  host: '116.203.115.12', port: 5432, database: 'ergovia_db',
  user: 'ergovia_user', password: 'ergovia_secure_2026', ssl: false,
});

(async () => {
  try {
    // Fix properties to active
    const r = await pool.query("UPDATE property_configurations SET property_status = 'active' WHERE property_status = 'inactive'");
    console.log('Fixed', r.rowCount, 'properties to active');

    // Create missing tables
    await pool.query(`CREATE TABLE IF NOT EXISTS conversation_logs (
      id SERIAL PRIMARY KEY, session_id VARCHAR(255), sender_id VARCHAR(255),
      message TEXT, role VARCHAR(50), channel VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS guest_reviews (
      id SERIAL PRIMARY KEY, booking_id VARCHAR(255), property_id VARCHAR(255),
      guest_name VARCHAR(255), rating INTEGER, review_text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS payment_records (
      id SERIAL PRIMARY KEY, booking_id VARCHAR(255), amount DECIMAL(10,2),
      payment_method VARCHAR(50), payment_status VARCHAR(50) DEFAULT 'pending',
      transaction_id VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS budget_tracking (
      id SERIAL PRIMARY KEY, property_id VARCHAR(255), month VARCHAR(7),
      category VARCHAR(100), amount DECIMAL(10,2), type VARCHAR(20),
      notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    console.log('Created 4 missing tables');

    // Verify
    const props = await pool.query("SELECT property_id, property_name, property_status FROM property_configurations");
    props.rows.forEach(p => console.log('  ' + p.property_status + ' | ' + p.property_name));

    pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    pool.end();
  }
})();

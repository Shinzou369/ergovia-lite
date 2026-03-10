/**
 * Phase 1: Database Schema for WF4 Payment Confirmation Enhancement
 *
 * Changes:
 * 1. Add confirmation_token column to bookings table
 * 2. Create payment_action_tokens table for secure webhook confirmation links
 *
 * The payment_action_tokens table stores UUID tokens that map to
 * confirm/cancel actions. Owners click a link with the token,
 * which triggers a webhook that validates and executes the action.
 */

const { Client } = require('pg');

const PG_CONFIG = {
  host: '116.203.115.12',
  port: 5432,
  database: 'ergovia_db',
  user: 'ergovia_user',
  password: 'ergovia_secure_2026'
};

async function main() {
  console.log('=== Phase 1: Database Schema Migration ===\n');

  const pg = new Client(PG_CONFIG);
  await pg.connect();
  console.log('Connected to PostgreSQL\n');

  // ─── 1. Add confirmation_token to bookings ───
  console.log('1. Adding confirmation_token to bookings table...');
  try {
    // Check if column already exists
    const colCheck = await pg.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'bookings' AND column_name = 'confirmation_token'
    `);

    if (colCheck.rows.length > 0) {
      console.log('   Already exists, skipping.\n');
    } else {
      await pg.query(`
        ALTER TABLE bookings
        ADD COLUMN confirmation_token VARCHAR(255)
      `);
      console.log('   Added confirmation_token VARCHAR(255)\n');
    }
  } catch (err) {
    console.error('   Error:', err.message, '\n');
  }

  // ─── 2. Create payment_action_tokens table ───
  console.log('2. Creating payment_action_tokens table...');
  try {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS payment_action_tokens (
        id SERIAL PRIMARY KEY,
        token UUID NOT NULL DEFAULT uuid_generate_v4(),
        booking_id VARCHAR(255) NOT NULL,
        action VARCHAR(20) NOT NULL CHECK (action IN ('confirm', 'cancel')),
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
      )
    `);

    // Unique index on token for fast lookups
    await pg.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_tokens_token
      ON payment_action_tokens(token)
    `);

    // Index for cleanup queries (find expired tokens)
    await pg.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_tokens_expires
      ON payment_action_tokens(expires_at)
      WHERE used_at IS NULL
    `);

    // Index for booking lookups
    await pg.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_tokens_booking
      ON payment_action_tokens(booking_id)
    `);

    console.log('   Created table with indexes\n');
  } catch (err) {
    console.error('   Error:', err.message, '\n');
  }

  // ─── 3. Verify ───
  console.log('3. Verifying...');

  // Check bookings columns
  const bookingCols = await pg.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'bookings'
    AND column_name IN ('confirmation_token', 'booking_id', 'booking_status', 'payment_status')
    ORDER BY ordinal_position
  `);
  console.log('   bookings columns:');
  for (const c of bookingCols.rows) {
    console.log(`     ${c.column_name} (${c.data_type})`);
  }

  // Check payment_action_tokens
  const tokenCols = await pg.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'payment_action_tokens'
    ORDER BY ordinal_position
  `);
  console.log('\n   payment_action_tokens columns:');
  for (const c of tokenCols.rows) {
    console.log(`     ${c.column_name} (${c.data_type})${c.column_default ? ' DEFAULT ' + c.column_default : ''}`);
  }

  // Check indexes
  const indexes = await pg.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'payment_action_tokens'
  `);
  console.log('\n   Indexes:');
  for (const i of indexes.rows) {
    console.log(`     ${i.indexname}`);
  }

  await pg.end();

  console.log('\n=== Phase 1 Complete ===');
  console.log('Next: Phase 2 - Enhance SUB: Owner & Staff Notifier');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

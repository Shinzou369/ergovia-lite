/**
 * Database Migration Script
 * Runs the schema.sql to create all tables
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    console.log('🚀 Starting database migration...\n');

    try {
        // Read schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Connect to database
        const client = await pool.connect();
        console.log('✅ Connected to database\n');

        // Run schema
        console.log('📝 Creating tables...\n');
        await client.query(schema);

        console.log('✅ Migration completed successfully!\n');

        // Show created tables
        const tables = await client.query(`
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);

        console.log('📋 Created tables:');
        tables.rows.forEach(row => {
            console.log(`   - ${row.tablename}`);
        });

        client.release();
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

migrate();

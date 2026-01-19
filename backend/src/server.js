require('dotenv').config();

const app = require('./app');
const db = require('./config/database');
const logger = require('./utils/logger');
const { validateEncryptionKey } = require('./utils/crypto');
const fs = require('fs').promises;
const path = require('path');

const PORT = process.env.BACKEND_PORT || 3001;

if (!validateEncryptionKey()) {
  logger.warn('CREDENTIAL_ENCRYPTION_KEY not properly configured - provisioning operations will fail');
}

async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'models/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    
    await db.query(schema);
    logger.info('Database schema initialized');
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn('Schema file not found, skipping initialization');
    } else if (error.message.includes('already exists')) {
      logger.info('Database tables already exist');
    } else {
      logger.error('Failed to initialize database', { error: error.message });
      throw error;
    }
  }
}

async function startServer() {
  try {
    await db.query('SELECT 1');
    logger.info('Database connection verified');

    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Prismity Backend API running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);
    });

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await db.pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await db.pool.end();
  process.exit(0);
});

startServer();

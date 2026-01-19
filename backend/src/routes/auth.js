const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/auth');
const { validateRequired, validateEmail, sanitizeInput } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

router.post('/login',
  rateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000 }),
  sanitizeInput,
  validateRequired(['email', 'password']),
  validateEmail('email'),
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await db.query(`
        SELECT c.*, cs.db_password as client_password
        FROM clients c
        LEFT JOIN client_servers cs ON c.client_id = cs.client_id
        WHERE c.owner_email = $1 AND c.status != 'cancelled'
      `, [email]);

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const client = result.rows[0];

      const storedHash = await db.query(`
        SELECT data FROM client_settings WHERE client_id = $1 AND section = 'auth'
      `, [client.client_id]);

      if (!storedHash.rows[0]?.data?.passwordHash) {
        return res.status(401).json({ error: 'Account not set up. Please complete onboarding.' });
      }

      const validPassword = await bcrypt.compare(password, storedHash.rows[0].data.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = generateToken({
        clientId: client.client_id,
        email: client.owner_email,
        role: 'client'
      });

      res.cookie('prismity_auth', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        client: {
          clientId: client.client_id,
          businessName: client.business_name,
          ownerName: client.owner_name,
          email: client.owner_email
        }
      });

    } catch (error) {
      logger.error('Login failed', { error: error.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

router.post('/setup-password',
  sanitizeInput,
  validateRequired(['clientId', 'password']),
  async (req, res) => {
    try {
      const { clientId, password, activationToken } = req.body;

      const result = await db.query(`
        SELECT * FROM clients WHERE client_id = $1
      `, [clientId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      await db.query(`
        INSERT INTO client_settings (client_id, section, data)
        VALUES ($1, 'auth', $2)
        ON CONFLICT (client_id, section)
        DO UPDATE SET data = $2, updated_at = NOW()
      `, [clientId, JSON.stringify({ passwordHash, setupAt: new Date().toISOString() })]);

      const token = generateToken({
        clientId,
        email: result.rows[0].owner_email,
        role: 'client'
      });

      res.json({
        success: true,
        message: 'Password set successfully',
        token
      });

    } catch (error) {
      logger.error('Password setup failed', { error: error.message });
      res.status(500).json({ error: 'Failed to set password' });
    }
  }
);

router.post('/refresh',
  async (req, res) => {
    try {
      const { token } = req.body;
      const { verifyToken } = require('../middleware/auth');
      
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const newToken = generateToken({
        clientId: decoded.clientId,
        email: decoded.email,
        role: decoded.role
      });

      res.json({ success: true, token: newToken });

    } catch (error) {
      res.status(401).json({ error: 'Token refresh failed' });
    }
  }
);

router.post('/logout', (req, res) => {
  res.clearCookie('prismity_auth');
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.prismity_auth || req.headers.authorization?.slice(7);
  
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  const { verifyToken } = require('../middleware/auth');
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const result = await db.query(`
      SELECT client_id, business_name, owner_name, owner_email, status
      FROM clients WHERE client_id = $1
    `, [decoded.clientId]);

    if (result.rows.length === 0) {
      return res.status(401).json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      client: {
        clientId: result.rows[0].client_id,
        businessName: result.rows[0].business_name,
        ownerName: result.rows[0].owner_name,
        email: result.rows[0].owner_email
      }
    });
  } catch (error) {
    res.status(500).json({ authenticated: false });
  }
});

router.post('/admin/login',
  rateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1000 }),
  sanitizeInput,
  validateRequired(['email', 'password']),
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (email !== adminEmail || password !== adminPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = generateToken({
        adminId: 'admin',
        email: adminEmail,
        role: 'admin'
      });

      res.json({ success: true, token });

    } catch (error) {
      logger.error('Admin login failed', { error: error.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

module.exports = router;

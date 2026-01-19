const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server cannot start securely.');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

async function authenticateClient(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.prismity_auth;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM clients WHERE client_id = $1 AND status != $2',
      [decoded.clientId, 'cancelled']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Client not found or inactive' });
    }

    req.client = result.rows[0];
    req.clientId = decoded.clientId;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.adminId = decoded.adminId;
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateClient,
  authenticateAdmin,
  JWT_SECRET
};

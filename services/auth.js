/**
 * Authentication Middleware & Helpers
 * JWT-based auth for Ergovia Lite Control Panel
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// JWT secret — uses env var or generates a stable fallback from machine identity
const JWT_SECRET = process.env.JWT_SECRET || 'ergovia-lite-secret-' + require('os').hostname();
const JWT_EXPIRY = '7d';

/**
 * Hash a plaintext password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

/**
 * Compare plaintext password with hash
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify a JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware: require authentication
 * Checks Authorization header (Bearer token) or query param ?token=
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

/**
 * Express middleware: optional authentication
 * Attaches user if token is present, but doesn't block
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  requireAuth,
  optionalAuth,
  JWT_SECRET,
};

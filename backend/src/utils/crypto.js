const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const REQUIRED_KEY_LENGTH = 32;

function getEncryptionKey() {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key || key.length < REQUIRED_KEY_LENGTH) {
    throw new Error(
      `SECURITY FAILURE: CREDENTIAL_ENCRYPTION_KEY must be at least ${REQUIRED_KEY_LENGTH} characters. ` +
      `Current length: ${key?.length || 0}. Cannot proceed with credential operations.`
    );
  }
  return Buffer.from(key.substring(0, 32));
}

function encrypt(text) {
  if (!text) return null;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  
  const key = getEncryptionKey();
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format - expected iv:authTag:ciphertext');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

function validateEncryptionKey() {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key || key.length < REQUIRED_KEY_LENGTH) {
    console.error(`FATAL: CREDENTIAL_ENCRYPTION_KEY must be at least ${REQUIRED_KEY_LENGTH} characters.`);
    console.error(`Current length: ${key?.length || 0}. Provisioning operations will fail.`);
    return false;
  }
  return true;
}

function generateSecurePassword(length = 32) {
  return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, length);
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

function generateCustomerId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `client_${timestamp}_${random}`;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateSubdomain(businessName) {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}

function scrubSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['password', 'secret', 'token', 'api_key', 'apikey', 'credential'];
  const scrubbed = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object') {
      scrubbed[key] = scrubSecrets(obj[key]);
    } else {
      scrubbed[key] = obj[key];
    }
  }
  
  return scrubbed;
}

module.exports = {
  encrypt,
  decrypt,
  validateEncryptionKey,
  generateSecurePassword,
  generateApiKey,
  generateCustomerId,
  hashPassword,
  generateSubdomain,
  scrubSecrets
};

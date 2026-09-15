import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'whyinsured-admin-session-secret-key-2026';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@whyinsured2026';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'whyinsured-admin-secret-2026';

// Token generation helper (HMAC SHA256)
export const createSignedToken = (username) => {
  const payload = {
    username,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
};

// Token verification helper
export const verifySignedToken = (token) => {
  if (!token) return null;

  // Also support static ADMIN_SECRET_KEY for direct API scripts/tests
  if (token === ADMIN_SECRET_KEY) {
    return { username: ADMIN_USERNAME, exp: Infinity };
  }

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Date.now()) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
};

export const login = (req, res) => {
  try {
    const { username, adminId, password } = req.body;
    const inputUsername = (username || adminId || '').trim();
    const inputPassword = (password || '').trim();

    if (!inputUsername || !inputPassword) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID and Password are required'
      });
    }

    // Compare with configured admin credentials
    const validUsername = process.env.ADMIN_USERNAME || ADMIN_USERNAME;
    const validPassword = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;

    if (inputUsername !== validUsername || inputPassword !== validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Admin ID or Password'
      });
    }

    const token = createSignedToken(inputUsername);

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        username: inputUsername,
        role: 'admin',
        name: 'Administrator'
      }
    });
  } catch (error) {
    console.error('Error during admin login:', error);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during login'
    });
  }
};

export const verifySession = (req, res) => {
  const tokenHeader = req.headers['x-admin-token'];
  const authHeader = req.headers['authorization'];

  let token = tokenHeader;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  const payload = verifySignedToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'Session invalid or expired'
    });
  }

  return res.json({
    success: true,
    valid: true,
    user: {
      username: payload.username,
      role: 'admin',
      name: 'Administrator'
    }
  });
};

export const logout = (req, res) => {
  return res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

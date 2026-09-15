import { verifySignedToken } from '../controllers/adminAuthController.js';

export const requireAdminAuth = (req, res, next) => {
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
      error: 'Unauthorized: Invalid or expired admin authentication session'
    });
  }

  req.adminUser = payload;
  next();
};

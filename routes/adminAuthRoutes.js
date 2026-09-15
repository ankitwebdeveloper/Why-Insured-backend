import express from 'express';
import { login, verifySession, logout } from '../controllers/adminAuthController.js';

const router = express.Router();

router.post('/login', login);
router.get('/verify', verifySession);
router.post('/logout', logout);

export default router;

/**
 * aiChatRoutes.js
 * 
 * Express routing for WHYINSURED AI Assistant endpoints.
 */

import express from 'express';
import { handleAiChat } from '../controllers/aiChatController.js';

const router = express.Router();

// POST /api/ai/chat
router.post('/chat', handleAiChat);

export default router;

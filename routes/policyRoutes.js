/**
 * policyRoutes.js
 * 
 * Endpoints for health insurance policy document upload, analysis, and download.
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { analyzePolicy, downloadPolicyPdf, askPolicyQuestion } from '../controllers/policyController.js';

const router = express.Router();

// Safe temporary directory for file upload buffer
const tempDir = path.join(os.tmpdir(), 'whyinsured_policy_uploads');
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch (e) {
    // Fallback to os.tmpdir()
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fs.existsSync(tempDir) ? tempDir : os.tmpdir());
  },
  filename: (req, file, cb) => {
    const safeSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `policy-${safeSuffix}.pdf`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20 MB limit
  },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = file.originalname && file.originalname.toLowerCase().endsWith('.pdf');

    if (isPdfMime || isPdfExt) {
      cb(null, true);
    } else {
      const err = new Error('Only PDF files are allowed.');
      err.status = 400;
      cb(err, false);
    }
  }
});

// Middleware wrapper for multer error handling
const handleUploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'PDF file is too large. Maximum size is 20 MB.'
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'Error processing uploaded file.'
        });
      }
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || 'Only PDF files are allowed.'
      });
    }
    next();
  });
};

// 1. Health / Route Verification for Policy Analyzer
router.get('/analyze', (req, res) => {
  res.json({
    status: 'ok',
    endpoint: 'POST /api/policy/analyze',
    message: 'WHYINSURED Policy Analysis API is live. Send a POST request with multipart/form-data containing a policy PDF.'
  });
});

// 2. Analyze Policy PDF
router.post('/analyze', handleUploadMiddleware, analyzePolicy);

// 3. Ask Policy Question with Official-Source Verification
router.post('/ask', express.json(), askPolicyQuestion);

// 4. Download Generated Simplified Policy PDF
router.get('/download/:fileId', downloadPolicyPdf);

export default router;

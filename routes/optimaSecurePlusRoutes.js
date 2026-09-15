import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAdminAuth } from '../middleware/auth.js';
import {
  getPlanData,
  updatePlanInfo,
  getFeatures,
  getFeatureById,
  createFeature,
  updateFeature,
  deleteFeature,
  toggleFeatureStatus,
  reorderFeatures,
  reportCardController,
  companyStrengthController,
  limitationsController,
  mustKnowController,
  uploadVideo
} from '../controllers/optimaSecurePlusController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect Vercel Serverless environment
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || Boolean(process.env.VERCEL);

// Configure multer storage for video uploads
const uploadsDir = path.join(__dirname, '..', 'uploads', 'videos');

// In local/non-serverless environment, ensure uploads directory exists
if (!isVercel) {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch (err) {
    console.warn('[Storage] Warning creating local uploads directory:', err.message);
  }
}

const storage = isVercel
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          cb(null, uploadsDir);
        } catch (err) {
          cb(err, uploadsDir);
        }
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${cleanName}_${Date.now()}${ext}`);
      }
    });

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext) || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files (.mp4, .webm, .ogg, .mov, etc.) are allowed!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

const router = express.Router();

// Helper to register standard section CRUD routes
function registerSectionRoutes(basePath, controller) {
  router.get(`/${basePath}`, controller.getAll);
  router.get(`/${basePath}/:id`, controller.getById);
  router.post(`/${basePath}`, requireAdminAuth, controller.create);
  router.put(`/${basePath}/:id`, requireAdminAuth, controller.update);
  router.delete(`/${basePath}/:id`, requireAdminAuth, controller.delete);
  router.patch(`/${basePath}/:id/status`, requireAdminAuth, controller.toggleStatus);
  router.patch(`/${basePath}/reorder`, requireAdminAuth, controller.reorder);
}

// 1. Plan basic info routes
router.get('/', getPlanData);
router.put('/', requireAdminAuth, updatePlanInfo);
router.put('/plan', requireAdminAuth, updatePlanInfo);

// 2. Feature management routes
router.get('/features', getFeatures);
router.get('/features/:id', getFeatureById);
router.post('/features', requireAdminAuth, createFeature);
router.put('/features/:id', requireAdminAuth, updateFeature);
router.delete('/features/:id', requireAdminAuth, deleteFeature);
router.patch('/features/:id/status', requireAdminAuth, toggleFeatureStatus);
router.patch('/features/reorder', requireAdminAuth, reorderFeatures);

// 3. Report Card routes
registerSectionRoutes('report-card', reportCardController);

// 4. Company Strength routes
registerSectionRoutes('company-strength', companyStrengthController);

// 5. Limitations routes
registerSectionRoutes('limitations', limitationsController);

// 6. Must Know routes
registerSectionRoutes('must-know', mustKnowController);

// 7. Video upload route
router.post('/upload-video', requireAdminAuth, upload.single('video'), uploadVideo);

export default router;

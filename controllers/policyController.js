/**
 * policyController.js
 * 
 * Handles policy PDF upload, text extraction, Gemini AI analysis,
 * easy-language PDF generation, and temporary file download.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { extractTextFromPdf } from '../services/policyPdfExtractor.js';
import { analyzePolicyDocument } from '../services/policyAnalyzerService.js';
import { generateEasyPolicyPdf } from '../services/easyPolicyPdfGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'temp');
const GENERATED_PDFS_DIR = path.join(__dirname, '..', 'uploads', 'generated');

// Ensure temporary working directories exist
if (!fs.existsSync(TEMP_UPLOADS_DIR)) {
  fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(GENERATED_PDFS_DIR)) {
  fs.mkdirSync(GENERATED_PDFS_DIR, { recursive: true });
}

// In-memory store for generated file metadata with expiry tracking
const generatedFilesRegistry = new Map();

// Helper to schedule cleanup of generated PDF files after 1 hour
const scheduleFileCleanup = (fileId, filePath) => {
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      generatedFilesRegistry.delete(fileId);
    } catch (err) {
      console.warn(`[Policy Controller] Error cleaning up temporary file ${fileId}:`, err.message);
    }
  }, 60 * 60 * 1000); // 1 hour
};

/**
 * POST /api/policy/analyze
 * Analyzes uploaded health insurance policy PDF and generates simplified PDF.
 */
export async function analyzePolicy(req, res) {
  let uploadedFilePath = null;

  try {
    const file = req.file;

    // 1. Validation: File existence
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Only PDF files are allowed. Please select a policy PDF.'
      });
    }

    uploadedFilePath = file.path;

    // 2. Validation: File extension & MIME type
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = file.originalname && file.originalname.toLowerCase().endsWith('.pdf');

    if (!isPdfMime && !isPdfExt) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        message: 'Only PDF files are allowed.'
      });
    }

    // 3. Validation: File size (Maximum 20 MB)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        message: 'PDF file is too large. Maximum size is 20 MB.'
      });
    }

    // Read PDF buffer
    const pdfBuffer = fs.readFileSync(uploadedFilePath);

    // 4. Extract text and page numbers
    let extractedData;
    try {
      extractedData = await extractTextFromPdf(pdfBuffer);
    } catch (extractErr) {
      console.error('[Policy Controller] PDF Extraction error:', extractErr);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        message: "Unable to read this PDF. Please make sure the file is not corrupted."
      });
    }

    // 5. Scanned / Empty PDF check
    if (extractedData.isScannedOrEmpty || !extractedData.fullText || extractedData.fullText.trim().length < 40) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        message: "We couldn't read this policy PDF. Please upload a clearer PDF with selectable text."
      });
    }

    // 6. Gemini AI Policy Analysis
    const analysisResult = await analyzePolicyDocument(extractedData);

    // 7. Generate Easy Policy PDF
    const fileId = crypto.randomBytes(16).toString('hex');
    const generatedPdfPath = path.join(GENERATED_PDFS_DIR, `${fileId}.pdf`);

    await generateEasyPolicyPdf(analysisResult, file.originalname, generatedPdfPath);

    // Register generated file & schedule automatic cleanup
    generatedFilesRegistry.set(fileId, {
      path: generatedPdfPath,
      name: `WHYINSURED-Easy-Policy-${file.originalname ? file.originalname.replace(/\.pdf$/i, '') : 'Summary'}.pdf`,
      createdAt: Date.now()
    });
    scheduleFileCleanup(fileId, generatedPdfPath);

    // Cleanup uploaded raw file immediately
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
      uploadedFilePath = null;
    }

    // 8. Return response with download URL
    return res.json({
      success: true,
      message: 'Policy analyzed successfully',
      file: {
        id: fileId,
        name: 'WHYINSURED-Easy-Policy.pdf',
        url: `/api/policy/download/${fileId}`
      },
      summary: {
        insurer: analysisResult.policyDetails?.insurer || 'Health Insurance',
        policyName: analysisResult.policyDetails?.policyName || 'Standard Plan',
        sumInsured: analysisResult.policyDetails?.sumInsured || 'As per schedule',
        totalPages: extractedData.totalPages
      }
    });
  } catch (error) {
    console.error('[Policy Controller] Analyze error:', error);

    // Ensure temporary upload file is deleted on error
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (e) {
        // Ignore
      }
    }

    return res.status(500).json({
      success: false,
      message: "We couldn't analyze this policy. Please try uploading the PDF again."
    });
  }
}

/**
 * GET /api/policy/download/:fileId
 * Downloads the generated simplified policy PDF.
 */
export async function downloadPolicyPdf(req, res) {
  try {
    const { fileId } = req.params;

    // Security check: alphanumeric fileId only (prevents directory traversal)
    if (!fileId || !/^[a-f0-9]{32}$/i.test(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file identifier.'
      });
    }

    const fileMeta = generatedFilesRegistry.get(fileId);
    const filePath = fileMeta?.path || path.join(GENERATED_PDFS_DIR, `${fileId}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'The requested PDF file has expired or was not found. Please re-analyze your policy.'
      });
    }

    const downloadFileName = fileMeta?.name || 'WHYINSURED-Easy-Policy.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('[Policy Controller] Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download policy PDF.'
    });
  }
}

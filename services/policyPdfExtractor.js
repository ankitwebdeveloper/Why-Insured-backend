/**
 * policyPdfExtractor.js
 * 
 * Extracts structured text and page numbers from insurance policy PDFs.
 * Supports page-by-page extraction, scanned document detection, and structure preservation.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

/**
 * Extract structured text and page information from a PDF buffer.
 * 
 * @param {Buffer} pdfBuffer - Raw PDF file buffer
 * @returns {Promise<Object>} Extracted document content with page breakdown
 */
export async function extractTextFromPdf(pdfBuffer) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error('Invalid PDF buffer provided.');
  }

  // Verify PDF Magic Bytes (%PDF-)
  const magicBytes = pdfBuffer.slice(0, 5).toString('ascii');
  if (!magicBytes.startsWith('%PDF')) {
    throw new Error('The uploaded file does not have a valid PDF header signature.');
  }

  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();

  const totalPages = result.total || (result.pages ? result.pages.length : 1);
  const rawPages = result.pages || [];
  
  const pages = rawPages.map((p, index) => ({
    page: p.num || index + 1,
    text: (p.text || '').trim()
  }));

  const fullText = result.text || pages.map(p => p.text).join('\n\n');
  const totalTextLength = fullText.trim().length;

  // Check if PDF is essentially scanned / empty of selectable text
  // An average insurance policy page has at least 100-300 characters of text
  const averageCharsPerPage = totalPages > 0 ? totalTextLength / totalPages : 0;
  const isScannedOrEmpty = totalTextLength < 40 || averageCharsPerPage < 15;

  return {
    totalPages,
    totalTextLength,
    isScannedOrEmpty,
    fullText,
    pages: pages.length > 0 ? pages : [{ page: 1, text: fullText.trim() }]
  };
}

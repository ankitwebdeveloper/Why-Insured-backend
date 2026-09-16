/**
 * policyPdfExtractor.js
 * 
 * Extracts structured text and page numbers from insurance policy PDFs using pdf2json.
 * 100% pure JavaScript, supports modern Node (18/20/22/24) and serverless environments.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

/**
 * Extract structured text and page information from a PDF file path or buffer.
 * 
 * @param {string|Buffer} filePathOrBuffer - PDF file path or buffer
 * @returns {Promise<Object>} Extracted document content with page breakdown
 */
export function extractTextFromPdf(filePathOrBuffer) {
  return new Promise((resolve, reject) => {
    let tempPath = null;
    let isTemp = false;

    try {
      if (!filePathOrBuffer) {
        return reject(new Error('No PDF file path or buffer provided.'));
      }

      let targetPath = '';

      if (typeof filePathOrBuffer === 'string') {
        targetPath = filePathOrBuffer;
        if (!fs.existsSync(targetPath)) {
          return reject(new Error(`PDF file not found at: ${targetPath}`));
        }
      } else if (Buffer.isBuffer(filePathOrBuffer)) {
        // Write buffer to temporary file for parsing
        tempPath = path.join(os.tmpdir(), `temp-pdf-${crypto.randomBytes(8).toString('hex')}.pdf`);
        fs.writeFileSync(tempPath, filePathOrBuffer);
        targetPath = tempPath;
        isTemp = true;
      } else {
        return reject(new Error('Invalid PDF input provided. Expected file path or Buffer.'));
      }

      const pdfParser = new PDFParser(null, 1);

      pdfParser.on('pdfParser_dataError', (errData) => {
        if (isTemp && tempPath && fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (e) {}
        }
        reject(new Error(errData?.parserError || 'Failed to parse PDF document.'));
      });

      pdfParser.on('pdfParser_dataReady', (pdfData) => {
        if (isTemp && tempPath && fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (e) {}
        }

        try {
          const rawPages = pdfData?.Pages || [];
          const totalPages = rawPages.length || 1;
          const pages = [];

          rawPages.forEach((page, index) => {
            let pageText = '';
            if (page?.Texts && Array.isArray(page.Texts)) {
              pageText = page.Texts.map(t => {
                if (!t || !t.R) return '';
                try {
                  return decodeURIComponent(t.R.map(r => r?.T || '').join(''));
                } catch (e) {
                  return t.R.map(r => r?.T || '').join('');
                }
              }).join(' ');
            }

            pages.push({
              page: index + 1,
              text: pageText.replace(/\s+/g, ' ').trim()
            });
          });

          const fullText = pages.map(p => p.text).filter(Boolean).join('\n\n').trim();
          const totalTextLength = fullText.length;
          const averageCharsPerPage = totalPages > 0 ? totalTextLength / totalPages : 0;
          const isScannedOrEmpty = totalTextLength < 40 || averageCharsPerPage < 15;

          resolve({
            totalPages,
            totalTextLength,
            isScannedOrEmpty,
            fullText,
            pages: pages.length > 0 ? pages : [{ page: 1, text: fullText }]
          });
        } catch (innerErr) {
          reject(innerErr);
        }
      });

      pdfParser.loadPDF(targetPath);
    } catch (err) {
      if (isTemp && tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
      reject(err);
    }
  });
}

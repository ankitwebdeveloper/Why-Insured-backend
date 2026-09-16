/**
 * easyPolicyPdfGenerator.js
 * 
 * Server-side PDF Generator for WHYINSURED Easy Policy Document.
 * Uses PDFKit to produce a clean, multi-page, formatted report.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Generate a PDF document from the structured analysis data.
 * 
 * @param {Object} analysis - Output from policyAnalyzerService
 * @param {string} originalFileName - Name of the uploaded file
 * @param {string} outputPath - Absolute path where generated PDF should be saved
 * @returns {Promise<string>} outputPath
 */
export function generateEasyPolicyPdf(analysis, originalFileName, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Ensure target directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const primaryColor = '#0F172A'; // Deep Slate
      const accentColor = '#00A86B';  // WHYINSURED Emerald Green
      const secondaryColor = '#334155'; // Slate 700
      const mutedColor = '#64748B';    // Slate 500
      const lightBgColor = '#F8FAFC';  // Slate 50

      const pageWidth = doc.page.width - 80; // Margin 40 left & right = width - 80

      // =====================================================================
      // 1. HEADER BANNER
      // =====================================================================
      doc.rect(40, 40, pageWidth, 60).fillAndStroke('#0F172A', '#0F172A');

      doc.fillColor('#FFFFFF')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('WHYINSURED', 55, 52);

      doc.fillColor(accentColor)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Your Health Insurance Policy — Explained Simply', 55, 75);

      doc.fillColor('#94A3B8')
        .fontSize(8)
        .font('Helvetica')
        .text(`Analyzed Document: ${originalFileName || 'Policy.pdf'}  |  Date: ${new Date().toLocaleDateString('en-IN')}`, 55, 88);

      doc.y = 115;

      // Helper function to render a section title with accent bar
      const renderSectionHeading = (number, title) => {
        // Check for page break if close to bottom
        if (doc.y > doc.page.height - 100) {
          doc.addPage();
        }

        doc.moveDown(0.8);
        const currentY = doc.y;

        // Accent indicator bar
        doc.rect(40, currentY + 2, 4, 16).fill(accentColor);

        doc.fillColor(primaryColor)
          .fontSize(13)
          .font('Helvetica-Bold')
          .text(`${number}. ${title}`, 50, currentY + 3);

        doc.moveDown(0.6);
      };

      // Helper function to render an item list
      const renderItemList = (items, defaultEmptyMsg = 'No specific items found in policy text.') => {
        if (!items || items.length === 0) {
          doc.fillColor(mutedColor)
            .fontSize(9)
            .font('Helvetica-Oblique')
            .text(`• ${defaultEmptyMsg}`, 50, doc.y, { width: pageWidth - 10 });
          doc.moveDown(0.4);
          return;
        }

        items.forEach((item) => {
          if (doc.y > doc.page.height - 70) {
            doc.addPage();
          }

          const title = item.title || 'Policy Clause';
          const explanation = item.simpleExplanation || 'Standard policy condition.';
          const source = item.sourcePage ? ` [Source: Page ${item.sourcePage}]` : '';

          // Item bullet + bold title
          doc.fillColor(primaryColor)
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .text(`• ${title}`, 50, doc.y, { continued: false });

          // Explanation
          doc.fillColor(secondaryColor)
            .fontSize(8.5)
            .font('Helvetica')
            .text(explanation, 60, doc.y + 2, { width: pageWidth - 20 });

          // Source Tag
          if (source) {
            doc.fillColor(accentColor)
              .fontSize(7.5)
              .font('Helvetica-Bold')
              .text(source, 60, doc.y + 2);
          }

          doc.moveDown(0.5);
        });
      };

      // =====================================================================
      // 2. POLICY OVERVIEW BOX
      // =====================================================================
      renderSectionHeading('1', 'Policy Overview');

      const details = analysis.policyDetails || {};
      const boxY = doc.y;
      doc.rect(40, boxY, pageWidth, 52).fillAndStroke('#F1F5F9', '#E2E8F0');

      doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold');
      doc.text('Insurer:', 50, boxY + 8);
      doc.text('Policy Name:', 50, boxY + 22);
      doc.text('Policy Type:', 50, boxY + 36);

      doc.fillColor(secondaryColor).font('Helvetica');
      doc.text(details.insurer || 'Health Insurance Company', 120, boxY + 8);
      doc.text(details.policyName || 'Health Plan', 120, boxY + 22);
      doc.text(details.policyType || 'Comprehensive Medical Cover', 120, boxY + 36);

      doc.fillColor(primaryColor).font('Helvetica-Bold');
      doc.text('Sum Insured:', 300, boxY + 8);
      doc.text('Policy Period:', 300, boxY + 22);

      doc.fillColor(secondaryColor).font('Helvetica');
      doc.text(details.sumInsured || 'As per Schedule', 380, boxY + 8);
      doc.text(details.policyPeriod || '1 Year', 380, boxY + 22);

      doc.y = boxY + 60;

      // =====================================================================
      // 3. WHAT'S COVERED
      // =====================================================================
      renderSectionHeading('2', "What's Covered (Key Coverage)");
      renderItemList(analysis.coverage);

      // =====================================================================
      // 4. KEY BENEFITS
      // =====================================================================
      renderSectionHeading('3', 'Key Benefits & Value Adds');
      renderItemList(analysis.keyBenefits);

      // =====================================================================
      // 5. WAITING PERIODS
      // =====================================================================
      renderSectionHeading('4', 'Waiting Periods');
      renderItemList(analysis.waitingPeriods);

      // =====================================================================
      // 6. LIMITS & CONDITIONS
      // =====================================================================
      renderSectionHeading('5', 'Limits, Sub-limits & Conditions');
      renderItemList(analysis.limitsAndConditions);

      // =====================================================================
      // 7. WHAT'S NOT COVERED (EXCLUSIONS)
      // =====================================================================
      renderSectionHeading('6', "What's NOT Covered (Exclusions)");
      renderItemList(analysis.exclusions);

      // =====================================================================
      // 8. IMPORTANT THINGS TO KNOW
      // =====================================================================
      renderSectionHeading('7', 'Important Things You Should Know');
      renderItemList(analysis.importantThingsToKnow);

      // =====================================================================
      // 9. LEGAL DISCLAIMER & FOOTER
      // =====================================================================
      if (doc.y > doc.page.height - 85) {
        doc.addPage();
      }

      doc.moveDown(1);
      const disclaimerY = doc.y;
      doc.rect(40, disclaimerY, pageWidth, 42).fillAndStroke('#FEF3C7', '#FDE68A');

      doc.fillColor('#92400E')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('DISCLAIMER & LEGAL NOTE:', 50, disclaimerY + 6);

      doc.fillColor('#78350F')
        .fontSize(7.5)
        .font('Helvetica')
        .text(
          'This document is an easy-language explanation generated from the uploaded policy document. It is provided to help you understand the policy. It does not replace the original policy wording. In case of any difference, refer to the original policy document and its applicable terms and conditions.',
          50,
          disclaimerY + 18,
          { width: pageWidth - 20 }
        );

      // Add page numbering to all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#94A3B8')
          .fontSize(8)
          .font('Helvetica')
          .text(
            `WHYINSURED Easy Policy Report  •  Page ${i + 1} of ${range.count}`,
            40,
            doc.page.height - 25,
            { align: 'center', width: pageWidth }
          );
      }

      doc.end();

      writeStream.on('finish', () => {
        resolve(outputPath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

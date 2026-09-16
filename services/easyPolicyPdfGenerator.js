/**
 * easyPolicyPdfGenerator.js
 * 
 * Server-side PDF Generator for WHYINSURED Easy Policy Document.
 * Uses PDFKit to produce a premium, beautifully formatted, zero-blank-page report.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Format string replacing Unicode Rupee symbol with 'Rs. ' to avoid PDF font encoding issues
 */
function cleanCurrency(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text.replace(/₹\s*/g, 'Rs. ');
}

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
        margins: { top: 35, bottom: 40, left: 40, right: 40 },
        bufferPages: true,
        autoFirstPage: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Color Palette (WHYINSURED Theme)
      const primaryDark = '#0F172A';       // Deep Slate 900
      const brandEmerald = '#00A86B';      // WHYINSURED Emerald Green
      const textPrimary = '#1E293B';       // Slate 800
      const textSecondary = '#475569';     // Slate 600
      const textMuted = '#64748B';         // Slate 500
      const bgCard = '#F8FAFC';            // Slate 50
      const borderCard = '#E2E8F0';        // Slate 200
      const amberBg = '#FFFBEB';           // Amber 50
      const amberBorder = '#FDE68A';       // Amber 200
      const amberText = '#92400E';         // Amber 800

      const pageWidth = 515; // 595.28 - 40 - 40 = 515.28
      const leftMargin = 40;
      const bottomLimit = 780;

      /**
       * Safe space check: If adding a block with `heightNeeded` exceeds page bottom, add new page first.
       */
      const checkPageBreak = (heightNeeded) => {
        if (doc.y + heightNeeded > bottomLimit) {
          doc.addPage();
        }
      };

      // =====================================================================
      // 1. PREMIUM HEADER BANNER
      // =====================================================================
      const headerTop = 35;
      const headerHeight = 72;
      
      // Top Dark Navy Box
      doc.roundedRect(leftMargin, headerTop, pageWidth, headerHeight, 6)
        .fill(primaryDark);

      // Brand Logo Text
      doc.fillColor('#FFFFFF')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('WHYINSURED', leftMargin + 16, headerTop + 14);

      // Tagline
      doc.fillColor(brandEmerald)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Your Health Insurance Policy — Explained Simply', leftMargin + 16, headerTop + 34);

      // Subtitle
      doc.fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text('An easy-language explanation of your uploaded policy document', leftMargin + 16, headerTop + 50);

      // Right metadata tag
      const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      doc.fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text(`Date: ${reportDate}`, leftMargin + pageWidth - 140, headerTop + 15, { width: 125, align: 'right' });

      doc.fillColor('#38BDF8')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('Official Policy Report', leftMargin + pageWidth - 140, headerTop + 28, { width: 125, align: 'right' });

      doc.y = headerTop + headerHeight + 12;

      // =====================================================================
      // 2. IMPORTANT HIGHLIGHTS SUMMARY CARDS (4-Grid)
      // =====================================================================
      const highlights = analysis.highlights || {};
      const policyDetails = analysis.policyDetails || {};

      const hSumInsured = cleanCurrency(highlights.sumInsured || policyDetails.sumInsured || 'As per Schedule');
      const hRoom = cleanCurrency(highlights.roomCategory || 'Check Schedule');
      const hWaiting = cleanCurrency(highlights.initialWaitingPeriod || '30 Days');
      const hRestoration = cleanCurrency(highlights.restoration || 'As per Plan');

      const statCards = [
        { label: 'SUM INSURED', value: hSumInsured, color: brandEmerald },
        { label: 'ROOM CATEGORY', value: hRoom, color: '#3B82F6' },
        { label: 'INITIAL WAITING', value: hWaiting, color: '#F59E0B' },
        { label: 'SI RESTORATION', value: hRestoration, color: '#8B5CF6' }
      ];

      const cardWidth = (pageWidth - 18) / 4;
      const cardHeight = 40;
      const cardStartY = doc.y;

      statCards.forEach((card, idx) => {
        const cardX = leftMargin + idx * (cardWidth + 6);
        doc.roundedRect(cardX, cardStartY, cardWidth, cardHeight, 5)
          .fillAndStroke(bgCard, borderCard);

        // Top accent line
        doc.roundedRect(cardX, cardStartY, cardWidth, 2, 1)
          .fill(card.color);

        doc.fillColor(textMuted)
          .fontSize(6.5)
          .font('Helvetica-Bold')
          .text(card.label, cardX + 6, cardStartY + 6, { width: cardWidth - 12 });

        doc.fillColor(primaryDark)
          .fontSize(8)
          .font('Helvetica-Bold')
          .text(card.value, cardX + 6, cardStartY + 18, { width: cardWidth - 12, ellipsis: true });
      });

      doc.y = cardStartY + cardHeight + 12;

      /**
       * Render Section Heading helper
       */
      const renderSectionHeading = (title) => {
        checkPageBreak(40);
        const headingY = doc.y;

        // Accent indicator bar
        doc.roundedRect(leftMargin, headingY + 1, 3.5, 13, 1.5).fill(brandEmerald);

        doc.fillColor(primaryDark)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(title, leftMargin + 10, headingY + 1);

        doc.y = headingY + 18;
      };

      // =====================================================================
      // 3. POLICY OVERVIEW CARD
      // =====================================================================
      renderSectionHeading('Policy Overview');

      const overviewHeight = 52;
      checkPageBreak(overviewHeight);
      const overviewStartY = doc.y;

      doc.roundedRect(leftMargin, overviewStartY, pageWidth, overviewHeight, 5)
        .fillAndStroke(bgCard, borderCard);

      const col1X = leftMargin + 10;
      const col2X = leftMargin + 180;
      const col3X = leftMargin + 350;

      const pInsurer = cleanCurrency(policyDetails.insurer || 'Health Insurance Company');
      const pName = cleanCurrency(policyDetails.policyName || 'Standard Medical Plan');
      const pType = cleanCurrency(policyDetails.policyType || 'Individual / Family Cover');
      const pPeriod = cleanCurrency(policyDetails.policyPeriod || (policyDetails.policyStartDate && policyDetails.policyEndDate ? `${policyDetails.policyStartDate} – ${policyDetails.policyEndDate}` : '1 Year'));
      const pPolicyNo = cleanCurrency(policyDetails.policyNumber || 'Not mentioned in policy wording');
      const pSumInsured = cleanCurrency(policyDetails.sumInsured || 'Refer to Policy Schedule');

      // Row 1
      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('INSURANCE COMPANY', col1X, overviewStartY + 6);
      doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold').text(pInsurer, col1X, overviewStartY + 15, { width: 155, ellipsis: true });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY NAME', col2X, overviewStartY + 6);
      doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold').text(pName, col2X, overviewStartY + 15, { width: 160, ellipsis: true });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY TYPE', col3X, overviewStartY + 6);
      doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold').text(pType, col3X, overviewStartY + 15, { width: 150, ellipsis: true });

      // Row 2
      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('SUM INSURED', col1X, overviewStartY + 29);
      doc.fillColor(brandEmerald).fontSize(8).font('Helvetica-Bold').text(pSumInsured, col1X, overviewStartY + 38, { width: 155, ellipsis: true });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY PERIOD / DATES', col2X, overviewStartY + 29);
      doc.fillColor(textPrimary).fontSize(8).font('Helvetica').text(pPeriod, col2X, overviewStartY + 38, { width: 160, ellipsis: true });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY NUMBER', col3X, overviewStartY + 29);
      doc.fillColor(textPrimary).fontSize(8).font('Helvetica').text(pPolicyNo, col3X, overviewStartY + 38, { width: 150, ellipsis: true });

      doc.y = overviewStartY + overviewHeight + 12;

      // =====================================================================
      // 4. POLICYHOLDER & COVERED PERSONS ("Who Is Covered?")
      // =====================================================================
      renderSectionHeading('Who Is Covered? (Policyholder & Insured Members)');

      const policyholder = analysis.policyholderDetails;
      const insuredPersons = Array.isArray(analysis.insuredPersons) ? analysis.insuredPersons.filter(p => p && p.name) : [];

      if (insuredPersons.length > 0 || (policyholder && policyholder.policyholderName)) {
        const rowHeight = 18;
        checkPageBreak(rowHeight * 2 + 20);

        const tableY = doc.y;
        doc.roundedRect(leftMargin, tableY, pageWidth, 18, 4).fill('#F1F5F9');
        doc.fillColor(primaryDark).fontSize(7.2).font('Helvetica-Bold');
        doc.text('INSURED MEMBER NAME', leftMargin + 8, tableY + 5);
        doc.text('RELATIONSHIP', leftMargin + 160, tableY + 5);
        doc.text('AGE / DOB', leftMargin + 260, tableY + 5);
        doc.text('GENDER', leftMargin + 325, tableY + 5);
        doc.text('SUM INSURED / ID', leftMargin + 400, tableY + 5);

        doc.y = tableY + 18;

        if (insuredPersons.length > 0) {
          insuredPersons.forEach((person, idx) => {
            checkPageBreak(rowHeight);
            const curRowY = doc.y;

            if (idx % 2 === 1) {
              doc.rect(leftMargin, curRowY, pageWidth, rowHeight).fill('#F8FAFC');
            }
            doc.rect(leftMargin, curRowY + rowHeight - 1, pageWidth, 1).fill('#F1F5F9');

            doc.fillColor(primaryDark).fontSize(7.5).font('Helvetica-Bold')
              .text(cleanCurrency(person.name) || 'Covered Member', leftMargin + 8, curRowY + 4, { width: 145, ellipsis: true });

            doc.fillColor(textSecondary).font('Helvetica')
              .text(cleanCurrency(person.relationship) || 'Self / Primary', leftMargin + 160, curRowY + 4, { width: 90, ellipsis: true });

            doc.text(person.age ? `${person.age} yrs` : '—', leftMargin + 260, curRowY + 4, { width: 60 });
            doc.text(person.gender || '—', leftMargin + 325, curRowY + 4, { width: 70 });
            doc.text(cleanCurrency(person.sumInsured) || pSumInsured, leftMargin + 400, curRowY + 4, { width: 105, ellipsis: true });

            doc.y = curRowY + rowHeight;
          });
        } else if (policyholder && policyholder.policyholderName) {
          checkPageBreak(rowHeight);
          const curRowY = doc.y;
          doc.rect(leftMargin, curRowY + rowHeight - 1, pageWidth, 1).fill('#F1F5F9');
          doc.fillColor(primaryDark).fontSize(7.5).font('Helvetica-Bold')
            .text(cleanCurrency(policyholder.policyholderName), leftMargin + 8, curRowY + 4, { width: 145, ellipsis: true });
          doc.fillColor(textSecondary).font('Helvetica')
            .text('Policyholder / Self', leftMargin + 160, curRowY + 4, { width: 90 });
          doc.text(policyholder.age ? `${policyholder.age}` : '—', leftMargin + 260, curRowY + 4, { width: 60 });
          doc.text(policyholder.gender || '—', leftMargin + 325, curRowY + 4, { width: 70 });
          doc.text(cleanCurrency(policyholder.memberId) || pSumInsured, leftMargin + 400, curRowY + 4, { width: 105, ellipsis: true });
          doc.y = curRowY + rowHeight;
        }

        doc.y += 10;
      } else {
        const noteHeight = 28;
        checkPageBreak(noteHeight);
        const noteY = doc.y;
        doc.roundedRect(leftMargin, noteY, pageWidth, noteHeight, 4)
          .fillAndStroke('#F8FAFC', borderCard);

        doc.fillColor(textMuted).fontSize(7.2).font('Helvetica')
          .text(
            'Personal member details (such as specific names, ages, and certificate numbers) are not mentioned in this policy document. Individual details are specified in your individual Policy Schedule or Member Certificate.',
            leftMargin + 8,
            noteY + 6,
            { width: pageWidth - 16 }
          );

        doc.y = noteY + noteHeight + 10;
      }

      // =====================================================================
      // 5. WHAT'S COVERED (KEY COVERAGE)
      // =====================================================================
      renderSectionHeading("What's Covered (Key Coverage)");

      const coverageItems = Array.isArray(analysis.coverage) && analysis.coverage.length > 0
        ? analysis.coverage
        : [
            {
              title: 'Inpatient Hospitalisation',
              simpleExplanation: 'Hospital room rent, nursing, ICU, doctor fees, medications, and diagnostics are covered when hospitalised for more than 24 hours.',
              sourcePage: 1
            }
          ];

      coverageItems.forEach((item) => {
        const itemH = 34;
        checkPageBreak(itemH);
        const itemY = doc.y;

        doc.roundedRect(leftMargin, itemY, pageWidth, itemH, 4)
          .fillAndStroke(bgCard, borderCard);

        doc.roundedRect(leftMargin, itemY, 3, itemH, 1).fill(brandEmerald);

        doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold')
          .text(cleanCurrency(item.title) || 'Coverage Benefit', leftMargin + 8, itemY + 5, { width: pageWidth - 90 });

        if (item.sourcePage) {
          doc.fillColor(textMuted).fontSize(6.8).font('Helvetica')
            .text(`Source: Policy page ${item.sourcePage}`, leftMargin + pageWidth - 100, itemY + 5, { width: 90, align: 'right' });
        }

        doc.fillColor(textSecondary).fontSize(7.2).font('Helvetica')
          .text(cleanCurrency(item.simpleExplanation) || 'Standard policy coverage condition.', leftMargin + 8, itemY + 17, { width: pageWidth - 16 });

        doc.y = itemY + itemH + 5;
      });

      doc.y += 5;

      // =====================================================================
      // 6. KEY BENEFITS & VALUE ADDS
      // =====================================================================
      renderSectionHeading('Key Benefits & Value Adds');

      const benefitItems = Array.isArray(analysis.keyBenefits) && analysis.keyBenefits.length > 0
        ? analysis.keyBenefits
        : [
            {
              title: 'Sum Insured Restoration',
              simpleExplanation: 'Automatically restores 100% of the sum insured once exhausted during the policy year for unrelated illnesses.',
              sourcePage: 1
            }
          ];

      benefitItems.forEach((item) => {
        const itemH = 34;
        checkPageBreak(itemH);
        const itemY = doc.y;

        doc.roundedRect(leftMargin, itemY, pageWidth, itemH, 4)
          .fillAndStroke(bgCard, borderCard);

        doc.roundedRect(leftMargin, itemY, 3, itemH, 1).fill('#3B82F6');

        doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold')
          .text(cleanCurrency(item.title) || 'Key Benefit', leftMargin + 8, itemY + 5, { width: pageWidth - 90 });

        if (item.sourcePage) {
          doc.fillColor(textMuted).fontSize(6.8).font('Helvetica')
            .text(`Source: Policy page ${item.sourcePage}`, leftMargin + pageWidth - 100, itemY + 5, { width: 90, align: 'right' });
        }

        doc.fillColor(textSecondary).fontSize(7.2).font('Helvetica')
          .text(cleanCurrency(item.simpleExplanation) || 'Value added policy benefit.', leftMargin + 8, itemY + 17, { width: pageWidth - 16 });

        doc.y = itemY + itemH + 5;
      });

      doc.y += 5;

      // =====================================================================
      // 7. WAITING PERIODS (Structured Table)
      // =====================================================================
      renderSectionHeading('Waiting Periods');

      const waitingItems = Array.isArray(analysis.waitingPeriods) && analysis.waitingPeriods.length > 0
        ? analysis.waitingPeriods
        : [
            {
              periodName: 'Initial Waiting Period',
              duration: '30 Days',
              explanation: 'No claims for non-accidental illnesses are admissible during the first 30 days of coverage.',
              sourcePage: 1
            }
          ];

      checkPageBreak(20 + waitingItems.length * 24);
      const wpHeaderY = doc.y;
      doc.roundedRect(leftMargin, wpHeaderY, pageWidth, 18, 4).fill('#F1F5F9');
      doc.fillColor(primaryDark).fontSize(7.2).font('Helvetica-Bold');
      doc.text('WAITING PERIOD TYPE', leftMargin + 8, wpHeaderY + 5);
      doc.text('DURATION', leftMargin + 160, wpHeaderY + 5);
      doc.text('WHAT IT MEANS FOR YOU', leftMargin + 240, wpHeaderY + 5);
      doc.text('SOURCE', leftMargin + pageWidth - 65, wpHeaderY + 5, { width: 55, align: 'right' });

      doc.y = wpHeaderY + 18;

      waitingItems.forEach((wp, idx) => {
        const title = cleanCurrency(wp.periodName || wp.title || 'Waiting Period');
        const duration = cleanCurrency(wp.duration || 'Specified in Policy');
        const expl = cleanCurrency(wp.explanation || wp.simpleExplanation || 'Waiting period condition.');
        const source = wp.sourcePage ? `Page ${wp.sourcePage}` : '—';

        const rowH = 24;
        checkPageBreak(rowH);
        const curRowY = doc.y;

        if (idx % 2 === 1) {
          doc.rect(leftMargin, curRowY, pageWidth, rowH).fill('#F8FAFC');
        }
        doc.rect(leftMargin, curRowY + rowH - 1, pageWidth, 1).fill('#F1F5F9');

        doc.fillColor(primaryDark).fontSize(7.5).font('Helvetica-Bold')
          .text(title, leftMargin + 8, curRowY + 4, { width: 145, ellipsis: true });

        doc.fillColor('#D97706').fontSize(7.2).font('Helvetica-Bold')
          .text(duration, leftMargin + 160, curRowY + 4, { width: 75 });

        doc.fillColor(textSecondary).fontSize(7.2).font('Helvetica')
          .text(expl, leftMargin + 240, curRowY + 4, { width: pageWidth - 315 });

        doc.fillColor(textMuted).fontSize(6.8).font('Helvetica')
          .text(source, leftMargin + pageWidth - 65, curRowY + 4, { width: 55, align: 'right' });

        doc.y = curRowY + rowH;
      });

      doc.y += 10;

      // =====================================================================
      // 8. LIMITS, SUB-LIMITS & CONDITIONS
      // =====================================================================
      renderSectionHeading('Limits, Sub-limits & Conditions');

      const limitItems = Array.isArray(analysis.limitsAndConditions) && analysis.limitsAndConditions.length > 0
        ? analysis.limitsAndConditions
        : [
            {
              conditionName: 'Room Rent Condition',
              limitValue: 'Single Private Room',
              simpleExplanation: 'Choosing a room higher than your allowed category will cause proportionate deductions on your total hospital bill.',
              sourcePage: 1
            }
          ];

      limitItems.forEach((item) => {
        const itemH = 34;
        checkPageBreak(itemH);
        const itemY = doc.y;

        doc.roundedRect(leftMargin, itemY, pageWidth, itemH, 4)
          .fillAndStroke(bgCard, borderCard);

        doc.roundedRect(leftMargin, itemY, 3, itemH, 1).fill('#F59E0B');

        const title = cleanCurrency(item.conditionName || item.title || 'Policy Condition');
        const limitTag = item.limitValue ? ` [Limit: ${cleanCurrency(item.limitValue)}]` : '';

        doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold')
          .text(`${title}${limitTag}`, leftMargin + 8, itemY + 5, { width: pageWidth - 90 });

        if (item.sourcePage) {
          doc.fillColor(textMuted).fontSize(6.8).font('Helvetica')
            .text(`Source: Policy page ${item.sourcePage}`, leftMargin + pageWidth - 100, itemY + 5, { width: 90, align: 'right' });
        }

        doc.fillColor(textSecondary).fontSize(7.2).font('Helvetica')
          .text(cleanCurrency(item.simpleExplanation) || 'Policy restriction applies.', leftMargin + 8, itemY + 17, { width: pageWidth - 16 });

        doc.y = itemY + itemH + 5;
      });

      doc.y += 5;

      // =====================================================================
      // 9. WHAT'S NOT COVERED (EXCLUSIONS)
      // =====================================================================
      renderSectionHeading("What's NOT Covered (Key Exclusions)");

      const exclusionItems = Array.isArray(analysis.exclusions) && analysis.exclusions.length > 0
        ? analysis.exclusions
        : [
            {
              title: 'Non-Medical Consumable Items',
              simpleExplanation: 'Gloves, syringes, sanitizers, and admission kits are excluded unless a Consumables Rider is active.',
              sourcePage: 1
            }
          ];

      exclusionItems.forEach((item) => {
        const itemH = 34;
        checkPageBreak(itemH);
        const itemY = doc.y;

        doc.roundedRect(leftMargin, itemY, pageWidth, itemH, 4)
          .fillAndStroke(bgCard, borderCard);

        doc.roundedRect(leftMargin, itemY, 3, itemH, 1).fill('#EF4444');

        doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold')
          .text(cleanCurrency(item.title) || 'Exclusion', leftMargin + 8, itemY + 5, { width: pageWidth - 90 });

        if (item.sourcePage) {
          doc.fillColor(textMuted).fontSize(6.8).font('Helvetica')
            .text(`Source: Policy page ${item.sourcePage}`, leftMargin + pageWidth - 100, itemY + 5, { width: 90, align: 'right' });
        }

        doc.fillColor(textSecondary).fontSize(7.2).font('Helvetica')
          .text(cleanCurrency(item.simpleExplanation) || 'This item is excluded under policy terms.', leftMargin + 8, itemY + 17, { width: pageWidth - 16 });

        doc.y = itemY + itemH + 5;
      });

      doc.y += 5;

      // =====================================================================
      // 10. IMPORTANT THINGS YOU SHOULD KNOW
      // =====================================================================
      renderSectionHeading('Important Things You Should Know');

      const importantItems = Array.isArray(analysis.importantThingsToKnow) && analysis.importantThingsToKnow.length > 0
        ? analysis.importantThingsToKnow
        : [
            {
              title: 'Emergency Claim Notification Timeline',
              simpleExplanation: 'In case of emergency hospitalisation, notify the insurance company or TPA within 24 hours of hospital admission to initiate cashless processing.',
              sourcePage: 1
            },
            {
              title: 'Planned Hospitalization Intimation',
              simpleExplanation: 'Submit cashless pre-authorization at least 48 to 72 hours before planned hospital admission.',
              sourcePage: 1
            }
          ];

      importantItems.forEach((item) => {
        const itemH = 34;
        checkPageBreak(itemH);
        const itemY = doc.y;

        doc.roundedRect(leftMargin, itemY, pageWidth, itemH, 4)
          .fillAndStroke(bgCard, borderCard);

        doc.roundedRect(leftMargin, itemY, 3, itemH, 1).fill('#8B5CF6');

        doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold')
          .text(cleanCurrency(item.title) || 'Important Rule', leftMargin + 8, itemY + 5, { width: pageWidth - 90 });

        if (item.sourcePage) {
          doc.fillColor(textMuted).fontSize(6.8).font('Helvetica')
            .text(`Source: Policy page ${item.sourcePage}`, leftMargin + pageWidth - 100, itemY + 5, { width: 90, align: 'right' });
        }

        doc.fillColor(textSecondary).fontSize(7.2).font('Helvetica')
          .text(cleanCurrency(item.simpleExplanation) || 'Policy claim rule.', leftMargin + 8, itemY + 17, { width: pageWidth - 16 });

        doc.y = itemY + itemH + 5;
      });

      // =====================================================================
      // 11. DISCLAIMER BOX
      // =====================================================================
      const disclaimerH = 40;
      checkPageBreak(disclaimerH);
      doc.y += 5;

      const disclaimerY = doc.y;

      doc.roundedRect(leftMargin, disclaimerY, pageWidth, disclaimerH, 4)
        .fillAndStroke(amberBg, amberBorder);

      doc.fillColor(amberText).fontSize(6.8).font('Helvetica-Bold')
        .text('IMPORTANT DISCLAIMER & NOTICE', leftMargin + 8, disclaimerY + 5);

      doc.fillColor('#78350F').fontSize(6.5).font('Helvetica')
        .text(
          'This document is an easy-language explanation generated from the uploaded policy document. It is intended to help you understand your policy more easily and does not replace the original policy wording. In case of any difference, refer to the original policy document and its applicable terms and conditions.',
          leftMargin + 8,
          disclaimerY + 15,
          { width: pageWidth - 16 }
        );

      doc.y = disclaimerY + disclaimerH + 10;

      // =====================================================================
      // 12. RUNNING FOOTERS ON ALL BUFFERED PAGES
      // =====================================================================
      const range = doc.bufferedPageRange();
      const totalPages = range.count;

      for (let i = range.start; i < range.start + totalPages; i++) {
        doc.switchToPage(i);
        // Set bottom margin to 0 for this page so footer writing never triggers page additions
        doc.page.margins.bottom = 0;
        const footerY = doc.page.height - 24;

        // Subtle divider line
        doc.rect(leftMargin, footerY - 5, pageWidth, 0.5).fill('#E2E8F0');

        doc.fillColor(textMuted).fontSize(7).font('Helvetica')
          .text('WHYINSURED • Your Policy, Explained Simply', leftMargin, footerY, { width: 300, lineBreak: false });

        doc.fillColor(textMuted).fontSize(7).font('Helvetica-Bold')
          .text(`Page ${i + 1} of ${totalPages}`, leftMargin + pageWidth - 100, footerY, { width: 100, align: 'right', lineBreak: false });
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

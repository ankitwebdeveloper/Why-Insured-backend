/**
 * easyPolicyPdfGenerator.js
 * 
 * Server-side PDF Generator for WHYINSURED Easy Policy Document.
 * Uses PDFKit to produce a premium, beautifully formatted, zero-overlapping,
 * fully dynamic layout that handles variable-length content and pagination seamlessly.
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
        margins: { top: 36, bottom: 40, left: 40, right: 40 },
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

      const pageWidth = 515;               // A4: 595.28 - 40 - 40 = 515.28
      const leftMargin = 40;
      const bottomLimit = 772;             // Safe margin before footer divider at 810

      /**
       * Safe space check: If adding a block with `heightNeeded` exceeds page bottom,
       * advance to a fresh page cleanly.
       * Returns true if a page break occurred.
       */
      const ensureSpace = (heightNeeded) => {
        if (doc.y + heightNeeded > bottomLimit) {
          doc.addPage();
          doc.y = 40;
          return true;
        }
        return false;
      };

      /**
       * Render Section Heading helper
       * Ensures heading and at least one item fit on the current page to prevent orphans.
       */
      const renderSectionHeading = (title, minContentHeight = 65) => {
        ensureSpace(32 + minContentHeight);

        // Comfortable separation between sections if not at page top
        if (doc.y > 45) {
          doc.y += 10;
        }

        const headingY = doc.y;

        // Emerald accent indicator bar
        doc.roundedRect(leftMargin, headingY + 1, 3.5, 14, 1.5).fill(brandEmerald);

        doc.fillColor(primaryDark)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(title, leftMargin + 10, headingY + 1, { width: pageWidth - 10 });

        doc.y = headingY + 20;
      };

      /**
       * Render a Dynamic Card for Policy Clauses, Coverages, Benefits, Exclusions, etc.
       * Uses exact text measurement to compute dynamic height so that no text ever overlaps,
       * no container is cut off, and cards break cleanly to the next page when needed.
       */
      const renderDynamicItemCard = ({
        title,
        subtitle = '',
        explanation = '',
        sourcePage = null,
        accentColor = brandEmerald
      }) => {
        const cleanTitle = cleanCurrency(title) || 'Policy Clause';
        const cleanSub = subtitle ? cleanCurrency(subtitle) : '';
        const cleanExpl = cleanCurrency(explanation) || '';
        const sourceText = sourcePage ? `Source: Policy page ${sourcePage}` : '';

        const padX = 10;
        const padY = 7;
        const innerWidth = pageWidth - padX * 2;

        // 1. Measure Title and Source Tag
        const sourceWidth = sourceText ? 95 : 0;
        const titleWidth = sourceWidth ? innerWidth - sourceWidth - 8 : innerWidth;

        doc.font('Helvetica-Bold').fontSize(8.5);
        const titleHeight = doc.heightOfString(cleanTitle, { width: titleWidth, lineGap: 1.2 });

        // 2. Measure Subtitle (if present)
        let subHeight = 0;
        if (cleanSub) {
          doc.font('Helvetica-Bold').fontSize(7.5);
          subHeight = doc.heightOfString(cleanSub, { width: innerWidth, lineGap: 1.2 });
        }

        // 3. Measure Explanation
        doc.font('Helvetica').fontSize(7.5);
        const explHeight = cleanExpl
          ? doc.heightOfString(cleanExpl, { width: innerWidth, lineGap: 1.5 })
          : 0;

        // 4. Calculate total card height dynamically
        const gapAfterTitle = cleanSub ? 3 : (cleanExpl ? 4 : 0);
        const gapAfterSub = cleanExpl ? 3 : 0;
        const cardHeight = Math.ceil(padY + titleHeight + gapAfterTitle + (cleanSub ? subHeight + gapAfterSub : 0) + explHeight + padY);

        // 5. Ensure space on current page; if it doesn't fit, move cleanly to next page
        ensureSpace(cardHeight + 4);

        const cardY = doc.y;

        // 6. Draw Card Background & Border
        doc.roundedRect(leftMargin, cardY, pageWidth, cardHeight, 4)
          .fillAndStroke(bgCard, borderCard);

        // 7. Draw Left Accent Indicator Line
        doc.roundedRect(leftMargin, cardY, 3.5, cardHeight, 1)
          .fill(accentColor);

        // 8. Render Title
        let cursorY = cardY + padY;
        doc.fillColor(primaryDark)
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(cleanTitle, leftMargin + padX, cursorY, { width: titleWidth, lineGap: 1.2 });

        // 9. Render Source Tag
        if (sourceText) {
          doc.fillColor(textMuted)
            .font('Helvetica')
            .fontSize(6.8)
            .text(sourceText, leftMargin + pageWidth - sourceWidth - padX, cursorY + 1, { width: sourceWidth, align: 'right' });
        }

        cursorY += titleHeight + gapAfterTitle;

        // 10. Render Subtitle (if present)
        if (cleanSub) {
          doc.fillColor(accentColor)
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(cleanSub, leftMargin + padX, cursorY, { width: innerWidth, lineGap: 1.2 });
          cursorY += subHeight + gapAfterSub;
        }

        // 11. Render Explanation
        if (cleanExpl) {
          doc.fillColor(textSecondary)
            .font('Helvetica')
            .fontSize(7.5)
            .text(cleanExpl, leftMargin + padX, cursorY, { width: innerWidth, lineGap: 1.5 });
        }

        // 12. Advance doc.y after card with consistent gap
        doc.y = cardY + cardHeight + 6;
      };

      // =====================================================================
      // 1. PREMIUM HEADER BANNER
      // =====================================================================
      const headerTop = 36;
      const headerHeight = 70;
      
      // Top Dark Navy Box
      doc.roundedRect(leftMargin, headerTop, pageWidth, headerHeight, 6)
        .fill(primaryDark);

      // Brand Logo Text
      doc.fillColor('#FFFFFF')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('WHYINSURED', leftMargin + 16, headerTop + 13);

      // Tagline
      doc.fillColor(brandEmerald)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Your Health Insurance Policy — Explained Simply', leftMargin + 16, headerTop + 33);

      // Subtitle
      doc.fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text('An easy-language explanation of your uploaded policy document', leftMargin + 16, headerTop + 49);

      // Right metadata tag
      const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      doc.fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text(`Date: ${reportDate}`, leftMargin + pageWidth - 145, headerTop + 15, { width: 130, align: 'right' });

      doc.fillColor('#38BDF8')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('Official Policy Report', leftMargin + pageWidth - 145, headerTop + 28, { width: 130, align: 'right' });

      doc.y = headerTop + headerHeight + 10;

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

      // Dynamically measure maximum value height across the 4 cards so none are truncated
      let maxValH = 12;
      statCards.forEach((card) => {
        doc.font('Helvetica-Bold').fontSize(8);
        const vH = doc.heightOfString(card.value, { width: cardWidth - 12, lineGap: 1 });
        if (vH > maxValH) maxValH = vH;
      });

      const statCardHeight = Math.max(42, Math.ceil(6 + 10 + 2 + maxValH + 6));
      const cardStartY = doc.y;

      statCards.forEach((card, idx) => {
        const cardX = leftMargin + idx * (cardWidth + 6);
        doc.roundedRect(cardX, cardStartY, cardWidth, statCardHeight, 5)
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
          .text(card.value, cardX + 6, cardStartY + 18, { width: cardWidth - 12, lineGap: 1 });
      });

      doc.y = cardStartY + statCardHeight + 10;

      // =====================================================================
      // 3. POLICY OVERVIEW CARD
      // =====================================================================
      renderSectionHeading('Policy Overview', 65);

      const col1X = leftMargin + 10;
      const col2X = leftMargin + 180;
      const col3X = leftMargin + 350;

      const col1Width = 160;
      const col2Width = 160;
      const col3Width = 150;

      const pInsurer = cleanCurrency(policyDetails.insurer || 'Health Insurance Company');
      const pName = cleanCurrency(policyDetails.policyName || 'Standard Medical Plan');
      const pType = cleanCurrency(policyDetails.policyType || 'Individual / Family Cover');
      const pPeriod = cleanCurrency(policyDetails.policyPeriod || (policyDetails.policyStartDate && policyDetails.policyEndDate ? `${policyDetails.policyStartDate} – ${policyDetails.policyEndDate}` : '1 Year'));
      const pPolicyNo = cleanCurrency(policyDetails.policyNumber || 'Not mentioned in policy wording');
      const pSumInsured = cleanCurrency(policyDetails.sumInsured || 'Refer to Policy Schedule');

      // Dynamically measure heights for Row 1
      doc.font('Helvetica-Bold').fontSize(8);
      const hInsurer = doc.heightOfString(pInsurer, { width: col1Width, lineGap: 1 });
      const hName = doc.heightOfString(pName, { width: col2Width, lineGap: 1 });
      const hType = doc.heightOfString(pType, { width: col3Width, lineGap: 1 });
      const row1ValH = Math.max(hInsurer, hName, hType, 11);

      // Dynamically measure heights for Row 2
      const hSI = doc.heightOfString(pSumInsured, { width: col1Width, lineGap: 1 });
      doc.font('Helvetica').fontSize(8);
      const hPeriod = doc.heightOfString(pPeriod, { width: col2Width, lineGap: 1 });
      const hPolicyNo = doc.heightOfString(pPolicyNo, { width: col3Width, lineGap: 1 });
      const row2ValH = Math.max(hSI, hPeriod, hPolicyNo, 11);

      const labelH = 9;
      const rowGap = 9;
      const padY = 8;

      const row1LabelY = padY;
      const row1ValY = row1LabelY + labelH + 2;
      const row1Bottom = row1ValY + row1ValH;

      const row2LabelY = row1Bottom + rowGap;
      const row2ValY = row2LabelY + labelH + 2;
      const row2Bottom = row2ValY + row2ValH;

      const overviewHeight = Math.ceil(row2Bottom + padY);

      ensureSpace(overviewHeight + 6);
      const overviewStartY = doc.y;

      doc.roundedRect(leftMargin, overviewStartY, pageWidth, overviewHeight, 5)
        .fillAndStroke(bgCard, borderCard);

      // Render Row 1
      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('INSURANCE COMPANY', col1X, overviewStartY + row1LabelY);
      doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold').text(pInsurer, col1X, overviewStartY + row1ValY, { width: col1Width, lineGap: 1 });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY NAME', col2X, overviewStartY + row1LabelY);
      doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold').text(pName, col2X, overviewStartY + row1ValY, { width: col2Width, lineGap: 1 });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY TYPE', col3X, overviewStartY + row1LabelY);
      doc.fillColor(primaryDark).fontSize(8).font('Helvetica-Bold').text(pType, col3X, overviewStartY + row1ValY, { width: col3Width, lineGap: 1 });

      // Render Row 2
      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('SUM INSURED', col1X, overviewStartY + row2LabelY);
      doc.fillColor(brandEmerald).fontSize(8).font('Helvetica-Bold').text(pSumInsured, col1X, overviewStartY + row2ValY, { width: col1Width, lineGap: 1 });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY PERIOD / DATES', col2X, overviewStartY + row2LabelY);
      doc.fillColor(textPrimary).fontSize(8).font('Helvetica').text(pPeriod, col2X, overviewStartY + row2ValY, { width: col2Width, lineGap: 1 });

      doc.fillColor(textMuted).fontSize(6.8).font('Helvetica-Bold').text('POLICY NUMBER', col3X, overviewStartY + row2LabelY);
      doc.fillColor(textPrimary).fontSize(8).font('Helvetica').text(pPolicyNo, col3X, overviewStartY + row2ValY, { width: col3Width, lineGap: 1 });

      doc.y = overviewStartY + overviewHeight + 10;

      // =====================================================================
      // 4. POLICYHOLDER & COVERED PERSONS ("Who Is Covered?")
      // =====================================================================
      renderSectionHeading('Who Is Covered? (Policyholder & Insured Members)', 40);

      const policyholder = analysis.policyholderDetails;
      const insuredPersons = Array.isArray(analysis.insuredPersons) ? analysis.insuredPersons.filter(p => p && p.name) : [];

      const renderInsuredTableHeader = (y) => {
        doc.roundedRect(leftMargin, y, pageWidth, 18, 4).fill('#F1F5F9');
        doc.fillColor(primaryDark).fontSize(7.2).font('Helvetica-Bold');
        doc.text('INSURED MEMBER NAME', leftMargin + 8, y + 5);
        doc.text('RELATIONSHIP', leftMargin + 160, y + 5);
        doc.text('AGE / DOB', leftMargin + 260, y + 5);
        doc.text('GENDER', leftMargin + 325, y + 5);
        doc.text('SUM INSURED / ID', leftMargin + 400, y + 5);
        doc.y = y + 18;
      };

      if (insuredPersons.length > 0 || (policyholder && policyholder.policyholderName)) {
        ensureSpace(42);
        renderInsuredTableHeader(doc.y);

        if (insuredPersons.length > 0) {
          insuredPersons.forEach((person, idx) => {
            const cleanName = cleanCurrency(person.name) || 'Covered Member';
            const cleanRel = cleanCurrency(person.relationship) || 'Self / Primary';
            const cleanAge = person.age ? `${person.age} yrs` : '—';
            const cleanGender = person.gender || '—';
            const cleanSI = cleanCurrency(person.sumInsured) || pSumInsured;

            doc.font('Helvetica-Bold').fontSize(7.5);
            const nameH = doc.heightOfString(cleanName, { width: 145, lineGap: 1 });
            doc.font('Helvetica').fontSize(7.5);
            const relH = doc.heightOfString(cleanRel, { width: 90, lineGap: 1 });
            const rowH = Math.max(Math.ceil(Math.max(nameH, relH)) + 8, 20);

            const didBreak = ensureSpace(rowH + 2);
            if (didBreak) {
              renderInsuredTableHeader(doc.y);
            }

            const curRowY = doc.y;

            if (idx % 2 === 1) {
              doc.rect(leftMargin, curRowY, pageWidth, rowH).fill('#F8FAFC');
            }
            doc.rect(leftMargin, curRowY + rowH - 1, pageWidth, 1).fill('#F1F5F9');

            doc.fillColor(primaryDark).fontSize(7.5).font('Helvetica-Bold')
              .text(cleanName, leftMargin + 8, curRowY + 4, { width: 145, lineGap: 1 });

            doc.fillColor(textSecondary).font('Helvetica')
              .text(cleanRel, leftMargin + 160, curRowY + 4, { width: 90, lineGap: 1 });

            doc.text(cleanAge, leftMargin + 260, curRowY + 4, { width: 60 });
            doc.text(cleanGender, leftMargin + 325, curRowY + 4, { width: 70 });
            doc.text(cleanSI, leftMargin + 400, curRowY + 4, { width: 105, lineGap: 1 });

            doc.y = curRowY + rowH;
          });
        } else if (policyholder && policyholder.policyholderName) {
          const cleanName = cleanCurrency(policyholder.policyholderName);
          const cleanAge = policyholder.age ? `${policyholder.age}` : '—';
          const cleanGender = policyholder.gender || '—';
          const cleanId = cleanCurrency(policyholder.memberId) || pSumInsured;

          doc.font('Helvetica-Bold').fontSize(7.5);
          const nameH = doc.heightOfString(cleanName, { width: 145, lineGap: 1 });
          const rowH = Math.max(nameH + 8, 20);

          ensureSpace(rowH + 2);
          const curRowY = doc.y;

          doc.rect(leftMargin, curRowY + rowH - 1, pageWidth, 1).fill('#F1F5F9');
          doc.fillColor(primaryDark).fontSize(7.5).font('Helvetica-Bold')
            .text(cleanName, leftMargin + 8, curRowY + 4, { width: 145, lineGap: 1 });
          doc.fillColor(textSecondary).font('Helvetica')
            .text('Policyholder / Self', leftMargin + 160, curRowY + 4, { width: 90 });
          doc.text(cleanAge, leftMargin + 260, curRowY + 4, { width: 60 });
          doc.text(cleanGender, leftMargin + 325, curRowY + 4, { width: 70 });
          doc.text(cleanId, leftMargin + 400, curRowY + 4, { width: 105, lineGap: 1 });
          doc.y = curRowY + rowH;
        }

        doc.y += 8;
      } else {
        const noteText = 'Personal member details (such as specific names, ages, and certificate numbers) are not mentioned in this policy document. Individual details are specified in your individual Policy Schedule or Member Certificate.';
        doc.font('Helvetica').fontSize(7.2);
        const noteTextH = doc.heightOfString(noteText, { width: pageWidth - 20, lineGap: 1.5 });
        const noteHeight = Math.ceil(noteTextH + 14);

        ensureSpace(noteHeight + 4);
        const noteY = doc.y;

        doc.roundedRect(leftMargin, noteY, pageWidth, noteHeight, 4)
          .fillAndStroke('#F8FAFC', borderCard);

        doc.fillColor(textMuted).fontSize(7.2).font('Helvetica')
          .text(noteText, leftMargin + 10, noteY + 7, { width: pageWidth - 20, lineGap: 1.5 });

        doc.y = noteY + noteHeight + 8;
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
        renderDynamicItemCard({
          title: item.title || 'Coverage Benefit',
          explanation: item.simpleExplanation || 'Standard policy coverage condition.',
          sourcePage: item.sourcePage || null,
          accentColor: brandEmerald
        });
      });

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
        renderDynamicItemCard({
          title: item.title || 'Key Benefit',
          explanation: item.simpleExplanation || 'Value added policy benefit.',
          sourcePage: item.sourcePage || null,
          accentColor: '#3B82F6'
        });
      });

      // =====================================================================
      // 7. WAITING PERIODS (Structured Table)
      // =====================================================================
      renderSectionHeading('Waiting Periods', 60);

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

      const renderWaitingTableHeader = (y) => {
        doc.roundedRect(leftMargin, y, pageWidth, 18, 4).fill('#F1F5F9');
        doc.fillColor(primaryDark).fontSize(7.2).font('Helvetica-Bold');
        doc.text('WAITING PERIOD TYPE', leftMargin + 8, y + 5);
        doc.text('DURATION', leftMargin + 155, y + 5);
        doc.text('WHAT IT MEANS FOR YOU', leftMargin + 235, y + 5);
        doc.text('SOURCE', leftMargin + pageWidth - 65, y + 5, { width: 55, align: 'right' });
        doc.y = y + 18;
      };

      ensureSpace(45);
      renderWaitingTableHeader(doc.y);

      waitingItems.forEach((wp, idx) => {
        const title = cleanCurrency(wp.periodName || wp.title || 'Waiting Period');
        const duration = cleanCurrency(wp.duration || 'Specified in Policy');
        const expl = cleanCurrency(wp.explanation || wp.simpleExplanation || 'Waiting period condition applies.');
        const source = wp.sourcePage ? `Page ${wp.sourcePage}` : '—';

        doc.font('Helvetica-Bold').fontSize(7.5);
        const titleH = doc.heightOfString(title, { width: 140, lineGap: 1 });

        doc.font('Helvetica-Bold').fontSize(7.2);
        const durH = doc.heightOfString(duration, { width: 75, lineGap: 1 });

        doc.font('Helvetica').fontSize(7.2);
        const explH = doc.heightOfString(expl, { width: 205, lineGap: 1.4 });

        const rowH = Math.max(Math.ceil(Math.max(titleH, durH, explH)) + 8, 22);

        const didBreak = ensureSpace(rowH + 2);
        if (didBreak) {
          renderWaitingTableHeader(doc.y);
        }

        const curRowY = doc.y;

        if (idx % 2 === 1) {
          doc.rect(leftMargin, curRowY, pageWidth, rowH).fill('#F8FAFC');
        }
        doc.rect(leftMargin, curRowY + rowH - 1, pageWidth, 1).fill('#F1F5F9');

        doc.fillColor(primaryDark).fontSize(7.5).font('Helvetica-Bold')
          .text(title, leftMargin + 8, curRowY + 4, { width: 140, lineGap: 1 });

        doc.fillColor('#D97706').fontSize(7.2).font('Helvetica-Bold')
          .text(duration, leftMargin + 155, curRowY + 4, { width: 75, lineGap: 1 });

        doc.fillColor(textSecondary).fontSize(7.2).font('Helvetica')
          .text(expl, leftMargin + 235, curRowY + 4, { width: 205, lineGap: 1.4 });

        doc.fillColor(textMuted).fontSize(6.8).font('Helvetica')
          .text(source, leftMargin + pageWidth - 65, curRowY + 4, { width: 55, align: 'right' });

        doc.y = curRowY + rowH;
      });

      doc.y += 8;

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
        const title = item.conditionName || item.title || 'Policy Condition';
        const subtitle = item.limitValue ? `Limit / Condition: ${item.limitValue}` : '';

        renderDynamicItemCard({
          title,
          subtitle,
          explanation: item.simpleExplanation || 'Policy restriction applies.',
          sourcePage: item.sourcePage || null,
          accentColor: '#F59E0B'
        });
      });

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
        renderDynamicItemCard({
          title: item.title || 'Exclusion',
          explanation: item.simpleExplanation || 'This item is excluded under policy terms.',
          sourcePage: item.sourcePage || null,
          accentColor: '#EF4444'
        });
      });

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
        renderDynamicItemCard({
          title: item.title || 'Important Rule',
          explanation: item.simpleExplanation || 'Policy claim rule applies.',
          sourcePage: item.sourcePage || null,
          accentColor: '#8B5CF6'
        });
      });

      // =====================================================================
      // 11. DISCLAIMER BOX
      // =====================================================================
      renderSectionHeading('Important Disclaimer & Notice', 45);

      const disclText = 'This document is an easy-language explanation generated from the uploaded policy document. It is intended to help you understand your policy more easily and does not replace the original policy wording. In case of any difference, refer to the original policy document and its applicable terms and conditions.';

      doc.font('Helvetica').fontSize(7);
      const disclTextH = doc.heightOfString(disclText, { width: pageWidth - 20, lineGap: 1.5 });
      const disclaimerH = Math.ceil(disclTextH + 18);

      ensureSpace(disclaimerH + 8);
      const disclaimerY = doc.y;

      doc.roundedRect(leftMargin, disclaimerY, pageWidth, disclaimerH, 4)
        .fillAndStroke(amberBg, amberBorder);

      doc.fillColor(amberText).fontSize(7).font('Helvetica-Bold')
        .text('NOTICE & DISCLAIMER', leftMargin + 10, disclaimerY + 6);

      doc.fillColor('#78350F').fontSize(7).font('Helvetica')
        .text(disclText, leftMargin + 10, disclaimerY + 16, { width: pageWidth - 20, lineGap: 1.5 });

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

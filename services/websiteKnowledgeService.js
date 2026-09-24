/**
 * websiteKnowledgeService.js
 * 
 * WHYINSURED Website Content Retrieval & Fact-Verification Service.
 * 
 * Enforces the architecture:
 * WEBSITE CONTENT FIRST -> GEMINI / AI FALLBACK
 * 
 * Before Gemini is ever called:
 * 1. Identify user intent
 * 2. Identify company / plan (from current query, conversation history, or page context)
 * 3. Search verified WHYINSURED website content using semantic / keyword matching
 * 4. If website content is found:
 *    - Return factual answer based strictly on website data
 *    - Server log: Gemini fallback: NOT USED
 * 5. If website content is NOT found:
 *    - Server log: Gemini fallback: USED
 *    - Allow Gemini fallback to answer
 */

import { WEBSITE_PLANS_KNOWLEDGE } from '../data/websitePlanData.js';

/**
 * Normalizes text for comparison.
 */
function normalizeString(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Word-boundary exact phrase check.
 */
function hasPhrase(textNorm, phraseNorm) {
  if (!textNorm || !phraseNorm) return false;
  if (textNorm === phraseNorm) return true;
  const paddedText = ` ${textNorm} `;
  const paddedPhrase = ` ${phraseNorm} `;
  return paddedText.includes(paddedPhrase);
}

/**
 * Detect language style (Hinglish/Hindi vs English).
 */
function detectLanguage(query) {
  const lower = query.toLowerCase();
  const hindiTokens = [
    'kya', 'hai', 'hain', 'mein', 'me', 'ka', 'ki', 'ke', 'ko', 'se',
    'kitna', 'kitne', 'kitni', 'baar', 'milega', 'milegi', 'pehle', 'baad',
    'din', 'hota', 'hoti', 'hote', 'chahiye', 'batao', 'bataiye', 'kiska',
    'kab', 'kyu', 'kaise', 'aur', 'par', 'nahi', 'karega', 'lena'
  ];
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  let hindiMatches = 0;
  for (const w of words) {
    if (hindiTokens.includes(w)) {
      hindiMatches++;
    }
  }
  return hindiMatches >= 1 ? 'hinglish' : 'english';
}

/**
 * Identifies plan from query, page context, or conversation history.
 */
export function detectPlan(query, conversationHistory = [], currentPlanContext = null) {
  const normQuery = normalizeString(query);

  // 1. Direct plan match in current query
  for (const plan of WEBSITE_PLANS_KNOWLEDGE) {
    // Exact or phrase match on plan name
    if (hasPhrase(normQuery, normalizeString(plan.planName))) {
      return plan;
    }
    // Match aliases
    for (const alias of plan.aliases) {
      if (hasPhrase(normQuery, normalizeString(alias))) {
        return plan;
      }
    }
  }

  // 2. Check current page plan context if provided from client
  if (currentPlanContext) {
    const normContext = normalizeString(currentPlanContext);
    for (const plan of WEBSITE_PLANS_KNOWLEDGE) {
      if (plan.id === currentPlanContext || hasPhrase(normContext, normalizeString(plan.planName)) || plan.aliases.some(a => hasPhrase(normContext, normalizeString(a)))) {
        return plan;
      }
    }
  }

  // 3. Check conversation history (most recent messages first)
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recentMessages = [...conversationHistory].reverse().slice(0, 8);
    for (const msg of recentMessages) {
      const text = normalizeString(msg.text || msg.content || '');
      if (!text) continue;
      for (const plan of WEBSITE_PLANS_KNOWLEDGE) {
        if (hasPhrase(text, normalizeString(plan.planName))) {
          return plan;
        }
        for (const alias of plan.aliases) {
          if (hasPhrase(text, normalizeString(alias))) {
            return plan;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Identifies the semantic topic of the user's question.
 */
export function detectTopic(query) {
  const lower = query.toLowerCase();
  const norm = normalizeString(query);

  // 1. Pre & Post Hospitalization (Combined or Specific)
  const hasPre = hasPhrase(norm, 'pre') || lower.includes('hospital se pehle') || lower.includes('admission se pehle') || lower.includes('before admission') || lower.includes('before hospital') || lower.includes('admit hone se pehle') || lower.includes('pehle ka coverage');
  const hasPost = hasPhrase(norm, 'post') || lower.includes('hospital ke baad') || lower.includes('discharge ke baad') || lower.includes('after discharge') || lower.includes('after hospital') || lower.includes('chutti ke baad') || lower.includes('baad ka coverage');

  if (hasPre && hasPost) {
    return 'prePostHospitalization';
  }
  if (lower.includes('pre and post') || lower.includes('pre post') || lower.includes('pre aur post') || lower.includes('pre-hospitalisation') || lower.includes('post-hospitalisation') || lower.includes('pre-hospitalization') || lower.includes('post-hospitalization') || lower.includes('pehle aur baad')) {
    return 'prePostHospitalization';
  }
  if (hasPre) {
    return 'preHospitalization';
  }
  if (hasPost) {
    return 'postHospitalization';
  }

  // 2. Room Category / Room Rent
  if (
    lower.includes('room rent') ||
    lower.includes('room category') ||
    lower.includes('kamre ka rent') ||
    lower.includes('kamra') ||
    lower.includes('single private room') ||
    lower.includes('twin sharing') ||
    lower.includes('room limit') ||
    lower.includes('room capping') ||
    lower.includes('proportionate deduction') ||
    lower.includes('icu limit') ||
    lower.includes('icu charge') ||
    lower.includes('icu capping')
  ) {
    return 'roomCategory';
  }

  // 3. Restoration / Refill Benefit
  if (
    lower.includes('restoration') ||
    lower.includes('restore') ||
    lower.includes('refill') ||
    lower.includes('recharge') ||
    lower.includes('restore infinity') ||
    lower.includes('dobara coverage') ||
    lower.includes('kitni baar restore') ||
    lower.includes('kitni baar milta hai') ||
    lower.includes('khatam hone par')
  ) {
    return 'restoration';
  }

  // 4. Waiting Periods & PED
  if (
    lower.includes('waiting period') ||
    lower.includes('ped wait') ||
    lower.includes('pre existing') ||
    lower.includes('purani bimari') ||
    lower.includes('pehle se bimari') ||
    lower.includes('initial waiting') ||
    lower.includes('specific disease wait') ||
    lower.includes('30 days wait')
  ) {
    return 'waitingPeriod';
  }

  // 5. No Claim Bonus (NCB)
  if (
    lower.includes('no claim bonus') ||
    lower.includes('ncb') ||
    lower.includes('cumulative bonus') ||
    lower.includes('supercharge bonus') ||
    lower.includes('bonus kitna') ||
    lower.includes('claim na lene par')
  ) {
    return 'noClaimBonus';
  }

  // 6. Co-pay & Sub-limits
  if (
    lower.includes('copay') ||
    lower.includes('co-pay') ||
    lower.includes('co payment') ||
    lower.includes('sublimit') ||
    lower.includes('sub limit') ||
    lower.includes('deductible')
  ) {
    return 'copayAndSublimits';
  }

  // 7. Day Care Procedures
  if (
    lower.includes('day care') ||
    lower.includes('daycare') ||
    lower.includes('24 hour') ||
    lower.includes('24 ghante')
  ) {
    return 'dayCare';
  }

  // 8. Consumables Cover
  if (
    lower.includes('consumable') ||
    lower.includes('non medical') ||
    lower.includes('gloves') ||
    lower.includes('ppe kit') ||
    lower.includes('protect plus') ||
    lower.includes('protect benefit')
  ) {
    return 'consumables';
  }

  // 9. Company Strength & Report Card
  if (
    lower.includes('claim settlement ratio') ||
    lower.includes('csr') ||
    lower.includes('incurred claim ratio') ||
    lower.includes('icr') ||
    lower.includes('complaint') ||
    lower.includes('solvency') ||
    lower.includes('credit rating') ||
    lower.includes('ownership') ||
    lower.includes('kaisa insurer') ||
    lower.includes('reliable hai')
  ) {
    return 'companyStrength';
  }

  // 10. Best Suited For
  if (
    lower.includes('who should buy') ||
    lower.includes('best suited for') ||
    lower.includes('kiske liye best') ||
    lower.includes('kisko lena chahiye') ||
    lower.includes('is this good for')
  ) {
    return 'bestSuitedFor';
  }

  // 11. 2X Coverage / Secure Benefit (HDFC)
  if (
    lower.includes('secure benefit') ||
    lower.includes('2x coverage') ||
    lower.includes('instant coverage') ||
    lower.includes('double coverage')
  ) {
    return 'secureBenefit';
  }

  // 12. General Plan Overview
  if (
    lower.includes('tell me about') ||
    lower.includes('ke features') ||
    lower.includes('ke benefits') ||
    lower.includes('overview') ||
    lower.includes('details batao') ||
    lower.includes('kya kya milta hai') ||
    lower.includes('summary')
  ) {
    return 'generalOverview';
  }

  return null;
}

/**
 * Formats a factual, grounded response based STRICTLY on verified WHYINSURED website data.
 */
function formatPlanAnswer(plan, topic, language) {
  const isHinglish = language === 'hinglish';
  const planTitle = `${plan.companyName} ${plan.planName}`;

  switch (topic) {
    case 'prePostHospitalization': {
      const data = plan.prePostHospitalization;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** policy mein Pre & Post Hospitalization expenses ka coverage is tarah hai:\n\n` +
          `• **Pre-Hospitalisation:** Hospital admission se **${data.preDays} din (${data.preDays} days)** pehle tak ke eligible medical expenses (jaise doctor consultations, diagnostic tests, lab investigations, medicines) covered hain.\n` +
          `• **Post-Hospitalisation:** Hospital discharge ke **${data.postDays} din (${data.postDays} days)** baad tak ke eligible medical expenses covered hain.\n\n` +
          `📌 **Important Note (Website Policy Terms):**\n` +
          `${data.condition || 'Yeh expenses tabhi claim ho sakte hain jab unka relation us in-patient hospitalization claim se ho jo policy ke under approved ho.'}`
        );
      }

      return (
        `In **${planTitle}**, Pre & Post Hospitalization expenses are covered as follows:\n\n` +
        `• **Pre-Hospitalisation:** Covered up to **${data.preDays} days** before hospital admission. Includes doctor consultation fees, diagnostic lab tests, and prescribed medicines leading to hospitalization.\n` +
        `• **Post-Hospitalisation:** Covered up to **${data.postDays} days** after discharge from the hospital. Includes follow-up consultations, recovery medicines, and follow-up tests.\n\n` +
        `📌 **Important Note (Policy Terms):**\n` +
        `${data.condition || 'These expenses are covered when the in-patient hospitalization claim is approved under the policy terms.'}`
      );
    }

    case 'preHospitalization': {
      const data = plan.prePostHospitalization;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** mein hospital admission se pehle (**Pre-Hospitalisation**) **${data.preDays} din (${data.preDays} days)** tak ka coverage milta hai.\n\n` +
          `• **Included Expenses:** Admission se pehle ke specialist consultations, prescribed medicines, aur lab investigations/tests.\n` +
          `• **Rule:** Yeh expenses usi covered bimari ya treatment se jude hone chahiye jiska hospitalization claim approve hua ho.`
        );
      }

      return (
        `In **${planTitle}**, Pre-Hospitalisation is covered up to **${data.preDays} days** before hospital admission.\n\n` +
        `• **Coverage:** Up to ${data.preDays} days prior to admission for consultations, diagnostic tests, and prescribed medicines.\n` +
        `• **Condition:** Must be related to the covered in-patient hospitalization claim.`
      );
    }

    case 'postHospitalization': {
      const data = plan.prePostHospitalization;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** mein hospital discharge ke baad (**Post-Hospitalisation**) **${data.postDays} din (${data.postDays} days)** tak ka coverage milta hai.\n\n` +
          `• **Included Expenses:** Discharge ke baad ki follow-up doctor visits, prescribed pharmacy medicines, aur diagnostic recovery tests.\n` +
          `• **Rule:** Inpatient hospitalization claim policy ke under eligible aur approved hona chahiye.`
        );
      }

      return (
        `In **${planTitle}**, Post-Hospitalisation is covered up to **${data.postDays} days** after hospital discharge.\n\n` +
        `• **Coverage:** Up to ${data.postDays} days of follow-up doctor consultations, diagnostic tests, and prescribed medications.\n` +
        `• **Condition:** Applicable when the main hospitalization claim is admitted under the policy.`
      );
    }

    case 'roomCategory': {
      const data = plan.roomCategory;
      if (!data) return null;

      if (isHinglish) {
        let text = `**${planTitle}** mein Room Category coverage is tarah hai:\n\n`;
        if (data.standardVariant) text += `• **Standard Variant:** ${data.standardVariant}\n`;
        if (data.smartVariant) text += `• **Smart Variant:** ${data.smartVariant}\n`;
        if (data.eliteVariant) text += `• **Elite Variant:** ${data.eliteVariant}\n`;
        if (!data.standardVariant) text += `• **Room Eligibility:** ${data.summary}\n`;
        if (data.icuCharges) text += `• **ICU Charges:** ${data.icuCharges}\n`;
        text += `\n💡 **Why it matters:** Zero room rent capping ka matlab hai hospital bill par koi proportionate deduction nahi lagega.`;
        return text;
      }

      let text = `In **${planTitle}**, the Room Category coverage is as follows:\n\n`;
      if (data.standardVariant) text += `• **Standard Variant:** ${data.standardVariant}\n`;
      if (data.smartVariant) text += `• **Smart Variant:** ${data.smartVariant}\n`;
      if (data.eliteVariant) text += `• **Elite Variant:** ${data.eliteVariant}\n`;
      if (!data.standardVariant) text += `• **Room Eligibility:** ${data.summary}\n`;
      if (data.icuCharges) text += `• **ICU Charges:** ${data.icuCharges}\n`;
      text += `\n💡 **Key Takeaway:** Having no room rent capping ensures no proportionate deductions apply to doctors' fees or medical charges during your stay.`;
      return text;
    }

    case 'restoration': {
      const data = plan.restoration;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** mein **${data.name || 'Restoration Benefit'}** is tarah kaam karta hai:\n\n` +
          `• **Kitni baar restore hota hai:** ${data.frequency}\n` +
          `• **Kitna amount milta hai:** ${data.amount}\n` +
          `• **Illness Type:** ${data.illnessType || 'Related aur unrelated dono illnesses ke liye restore benefit milta hai.'}\n` +
          `• **Important Rule:** ${data.rule || 'Restore benefit subsequent (agale) hospitalization ke liye activate hota hai.'}\n` +
          (data.example ? `• **Example:** ${data.example}\n` : '')
        );
      }

      return (
        `In **${planTitle}**, the **${data.name || 'Restoration Benefit'}** details are:\n\n` +
        `• **Restoration Frequency:** ${data.frequency}\n` +
        `• **Restored Amount:** ${data.amount}\n` +
        `• **Illness Coverage:** ${data.illnessType || 'Restores for both related and unrelated medical conditions.'}\n` +
        `• **Rule:** ${data.rule || 'Available for subsequent hospitalizations, not during the same continuous admission.'}\n` +
        (data.example ? `• **Illustration:** ${data.example}\n` : '')
      );
    }

    case 'waitingPeriods': {
      const data = plan.waitingPeriods;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** ke Waiting Periods is tarah hain:\n\n` +
          `• **Initial Waiting Period:** ${data.initialDays} din (${data.initialSummary || 'Accidents Day 1 se cover hote hain'})\n` +
          `• **Specific Illness Waiting Period:** ${data.specificMonths} mahine (Cataract, hernia, joint replacement, stones, etc.)\n` +
          `• **Pre-Existing Diseases (PED):** ${data.pedMonths} mahine (${data.pedSummary || 'Policy lene se pehle ki bimariyan'})\n` +
          (data.permanentExclusions ? `• **Exclusions:** ${data.permanentExclusions}\n` : '')
        );
      }

      return (
        `The waiting periods for **${planTitle}** are:\n\n` +
        `• **Initial Waiting Period:** ${data.initialDays} days (accidental emergencies covered from Day 1)\n` +
        `• **Specific Diseases / Procedures:** ${data.specificMonths} months (e.g. cataract, hernia, joint replacement)\n` +
        `• **Pre-Existing Diseases (PED):** ${data.pedMonths} months\n` +
        (data.permanentExclusions ? `• **Permanent Exclusions:** ${data.permanentExclusions}\n` : '')
      );
    }

    case 'noClaimBonus': {
      const data = plan.noClaimBonus;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** mein No Claim Bonus (NCB) ka structure is tarah hai:\n\n` +
          `• **Bonus Rate:** ${data.summary}\n` +
          (data.rider ? `• **Optional Rider:** ${data.rider}\n` : '') +
          `\n💡 Claim na lene par har saal aapka Sum Insured bina kisi extra premium ke badh jata hai.`
        );
      }

      return (
        `In **${planTitle}**, the No Claim Bonus (Cumulative Bonus) structure is:\n\n` +
        `• **Bonus Details:** ${data.summary}\n` +
        (data.rider ? `• **Rider Available:** ${data.rider}\n` : '')
      );
    }

    case 'copayAndSublimits': {
      const data = plan.copayAndSublimits;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** mein Co-pay aur Sub-limits:\n\n` +
          `• **Co-pay:** ${data.copay}\n` +
          `• **Sub-limits:** ${data.sublimits}\n\n` +
          `✅ Matlab aapko hospital ke eligible bill par koi mandatory percentage apni jeb se nahi bharna padta.`
        );
      }

      return (
        `In **${planTitle}**, Co-pay and Sub-limits are as follows:\n\n` +
        `• **Co-payment:** ${data.copay}\n` +
        `• **Sub-limits:** ${data.sublimits}\n\n` +
        `✅ You do not need to pay mandatory percentage out-of-pocket on approved hospital bills.`
      );
    }

    case 'dayCare': {
      const data = plan.dayCare;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** mein Day Care Procedures ka coverage:\n\n` +
          `• ${data.summary || 'Sabhi eligible Day Care procedures covered hain jinme 24 ghante se kam ka hospitalisation lagta hai.'}\n` +
          `• Modern medical treatments aur daycare surgeries bina 24-hour admission requirement ke cashless cover hoti hain.`
        );
      }

      return (
        `In **${planTitle}**, Day Care coverage:\n\n` +
        `• ${data.summary || 'All eligible Day Care procedures requiring less than 24 hours of hospitalization are covered.'}\n` +
        `• Advanced day-care surgeries are eligible for cashless claims without mandatory 24-hour admission.`
      );
    }

    case 'consumables': {
      const data = plan.consumables || plan.protectBenefit;
      if (!data) return null;

      if (isHinglish) {
        return (
          `**${planTitle}** mein Consumables (Non-Medical Items) coverage:\n\n` +
          `• ${data.summary || 'Hospital consumables jaise surgical gloves, masks, PPE kits, aur syringes covered hain.'}\n` +
          `• Isse discharge ke waqt unexpected out-of-pocket kharche khatam ho jaate hain.`
        );
      }

      return (
        `In **${planTitle}**, Consumables Coverage:\n\n` +
        `• ${data.summary || 'Covers hospital consumables such as gloves, masks, PPE kits, and syringes.'}\n` +
        `• Protects against out-of-pocket non-medical deductions at hospital discharge.'`
      );
    }

    case 'secureBenefit': {
      const data = plan.secureBenefit;
      if (!data) return null;
      return (
        isHinglish
          ? `**${planTitle}** mein Secure Benefit:\n\n• ${data.summary}\n• Yani agar aapne ₹10 Lakh ka plan liya hai, toh pehle hi din se aapke paas ₹20 Lakh ka coverage available hota hai bina kisi extra cost ke.`
          : `In **${planTitle}**, the Secure Benefit:\n\n• ${data.summary}\n• Provides instant 2X coverage on Day 1 without waiting for cumulative bonuses.`
      );
    }

    case 'companyStrength': {
      const data = plan.companyStrength;
      if (!data) return null;

      if (isHinglish) {
        let text = `**${plan.companyName}** ka Official Report Card aur Financial Strength:\n\n`;
        if (data.csr) text += `• **Claim Settlement Ratio (CSR):** ${data.csr}\n`;
        if (data.icr) text += `• **Incurred Claim Ratio (ICR):** ${data.icr}\n`;
        if (data.complaints) text += `• **Complaints:** ${data.complaints}\n`;
        if (data.solvencyRatio) text += `• **Solvency Ratio:** ${data.solvencyRatio}\n`;
        if (data.creditRating) text += `• **Credit Rating:** ${data.creditRating}\n`;
        if (data.ownership) text += `• **Ownership:** ${data.ownership}\n`;
        return text;
      }

      let text = `Official performance metrics for **${plan.companyName}**:\n\n`;
      if (data.csr) text += `• **Claim Settlement Ratio (CSR):** ${data.csr}\n`;
      if (data.icr) text += `• **Incurred Claim Ratio (ICR):** ${data.icr}\n`;
      if (data.complaints) text += `• **Complaints Volume:** ${data.complaints}\n`;
      if (data.solvencyRatio) text += `• **Solvency Ratio:** ${data.solvencyRatio}\n`;
      if (data.creditRating) text += `• **Credit Rating:** ${data.creditRating}\n`;
      if (data.ownership) text += `• **Ownership Structure:** ${data.ownership}\n`;
      return text;
    }

    case 'bestSuitedFor': {
      const data = plan.bestSuitedFor;
      if (!data) return null;

      return isHinglish
        ? `**${planTitle}** in logon ke liye sabse best option hai:\n\n• ${data}`
        : `**${planTitle}** is best suited for:\n\n• ${data}`;
    }

    case 'generalOverview': {
      const prePost = plan.prePostHospitalization ? `• Pre-Hospitalisation (${plan.prePostHospitalization.preDays} days) & Post-Hospitalisation (${plan.prePostHospitalization.postDays} days)` : '';
      const room = plan.roomCategory ? `• Room Category: ${plan.roomCategory.summary}` : '';
      const restore = plan.restoration ? `• Restoration: ${plan.restoration.name} (${plan.restoration.frequency})` : '';
      const bonus = plan.noClaimBonus ? `• No Claim Bonus: ${plan.noClaimBonus.summary}` : '';

      if (isHinglish) {
        return (
          `**${planTitle}** ki mukhya verified policy khasiyatein:\n\n` +
          `• **Coverage Range:** ${plan.coverage}\n` +
          (room ? `${room}\n` : '') +
          (prePost ? `${prePost}\n` : '') +
          (restore ? `${restore}\n` : '') +
          (bonus ? `${bonus}\n` : '') +
          `• **Co-pay:** No mandatory co-payment across network hospitals.\n\n` +
          `Aap is plan ke kisi specific benefit (jaise pre-post hospitalization, room rent, ya restoration) ke baare mein aur detail mein pooch sakte hain!`
        );
      }

      return (
        `Key verified benefits of **${planTitle}** on WHYINSURED:\n\n` +
        `• **Coverage Range:** ${plan.coverage}\n` +
        (room ? `${room}\n` : '') +
        (prePost ? `${prePost}\n` : '') +
        (restore ? `${restore}\n` : '') +
        (bonus ? `${bonus}\n` : '') +
        `• **Co-payment:** Zero mandatory co-pay across network hospitals.\n\n` +
        `Feel free to ask for deeper details on room rent, pre/post hospitalization, restoration, or waiting periods!`
      );
    }

    default:
      return null;
  }
}

/**
 * Main Search Function: Evaluates user query against WHYINSURED website data.
 * 
 * Returns { found: boolean, reply: string, source: string, planName: string }
 */
export function searchWebsiteKnowledge(rawQuery, conversationHistory = [], currentPlanContext = null) {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return { found: false };
  }

  const query = rawQuery.trim();
  const language = detectLanguage(query);

  // 1. Detect Plan & Topic
  const detectedPlan = detectPlan(query, conversationHistory, currentPlanContext);
  const detectedTopic = detectTopic(query);

  console.log('[WHYINSURED AI]');
  console.log(`User query: ${query}`);
  console.log('[WHYINSURED AI]');
  console.log(`Detected plan: ${detectedPlan ? `${detectedPlan.companyName} ${detectedPlan.planName}` : 'None'}`);
  console.log('[WHYINSURED AI]');
  console.log('Searching website content...');

  // 2. Specific Plan + Topic match
  if (detectedPlan && detectedTopic) {
    const formattedAnswer = formatPlanAnswer(detectedPlan, detectedTopic, language);
    if (formattedAnswer) {
      console.log('[WHYINSURED AI]');
      console.log('Website content FOUND');
      console.log('[WHYINSURED AI]');
      console.log('Source: plan data / policy benefits');
      console.log('[WHYINSURED AI]');
      console.log('Gemini fallback: NOT USED');

      return {
        found: true,
        reply: formattedAnswer,
        source: 'plan data / policy benefits',
        planName: `${detectedPlan.companyName} ${detectedPlan.planName}`,
        topic: detectedTopic,
        intent: 'WEBSITE_KNOWLEDGE'
      };
    }
  }

  // 3. Plan match alone (user asking "tell me about medicare select")
  if (detectedPlan && !detectedTopic) {
    const lower = query.toLowerCase();
    const isGeneralPlanQuery = lower.includes('about') || lower.includes('details') || lower.includes('plan kya hai') || lower.includes('kaisa hai') || lower.includes('features') || lower.includes('benefits');
    if (isGeneralPlanQuery) {
      const formattedAnswer = formatPlanAnswer(detectedPlan, 'generalOverview', language);
      if (formattedAnswer) {
        console.log('[WHYINSURED AI]');
        console.log('Website content FOUND');
        console.log('[WHYINSURED AI]');
        console.log('Source: plan overview / verified policy features');
        console.log('[WHYINSURED AI]');
        console.log('Gemini fallback: NOT USED');

        return {
          found: true,
          reply: formattedAnswer,
          source: 'plan overview / verified policy features',
          planName: `${detectedPlan.companyName} ${detectedPlan.planName}`,
          topic: 'generalOverview',
          intent: 'WEBSITE_KNOWLEDGE'
        };
      }
    }
  }

  // 4. General concept queries when topic is recognized but no plan specified
  // e.g. "pre and post hospitalization kya hota hai?", "room rent capping kya hoti hai?"
  if (!detectedPlan && detectedTopic) {
    let genericAnswer = null;

    if (detectedTopic === 'prePostHospitalization' || detectedTopic === 'preHospitalization' || detectedTopic === 'postHospitalization') {
      genericAnswer = language === 'hinglish'
        ? `**Pre & Post Hospitalization Expenses kya hote hain?**\n\n` +
          `• **Pre-Hospitalisation:** Hospital mein admit hone se pehle ke medical kharche (jaise doctor consultations, lab investigations, aur prescribed medicines) jo us bimari se jude hote hain.\n` +
          `• **Post-Hospitalisation:** Hospital se discharge hone ke baad ke recovery kharche (follow-up doctor visits, medicines, tests).\n\n` +
          `📌 **WHYINSURED Guidelines:**\n` +
          `- Different plans mein yeh 30 se 90 din (Pre) aur 60 se 180 din (Post) tak hote hain.\n` +
          `- Jaise **Tata AIG MediCare Select** mein **90 din Pre aur 90 din Post** covered hain, jabki **HDFC Optima Secure** mein **60 din Pre aur 180 din Post** covered hain.`
        : `**What are Pre & Post Hospitalization Expenses?**\n\n` +
          `• **Pre-Hospitalisation:** Medical expenses incurred prior to admission (consultations, diagnostic tests, medications) directly leading to the hospitalization.\n` +
          `• **Post-Hospitalisation:** Recovery expenses incurred after discharge (follow-up consultations, recovery medicines, follow-up tests).\n\n` +
          `📌 **WHYINSURED Benchmarks:**\n` +
          `- Industry policies typically cover 30 to 90 days pre-admission and 60 to 180 days post-discharge.\n` +
          `- For example, **Tata AIG MediCare Select** covers **90 days Pre & 90 days Post**, while **HDFC Optima Secure** covers **60 days Pre & 180 days Post**.`;
    } else if (detectedTopic === 'roomCategory') {
      genericAnswer = language === 'hinglish'
        ? `**Room Rent Limit & Room Category kya hai?**\n\n` +
          `Hospital mein admit hone par per day kamre ke kharche ki limit ko Room Rent Capping kehte hain.\n\n` +
          `⚠️ **Why it matters:** Agar aapki policy mein Room Rent Capping hai aur aap mehenga room chun lete hain, toh insurer poore hospital bill (doctor fees, surgery fees, nursing) par **proportionate deductions** laga deta hai.\n\n` +
          `💡 **WHYINSURED Recommendation:** Hamesha **Single Private Room** ya **No Room Rent Capping** wale plans chunein, jaise **Tata AIG MediCare Select** ya **HDFC Optima Secure**.`
        : `**What is Room Rent Limit in Health Insurance?**\n\n` +
          `Room rent capping is the daily maximum limit your insurer pays for your hospital room.\n\n` +
          `⚠️ **Why it matters:** Exceeding this limit triggers **proportionate deductions** across your entire hospital bill, cutting doctor fees, nursing, and surgical charges proportionately.\n\n` +
          `💡 **WHYINSURED Recommendation:** Always select plans offering **Single Private Room** or **No Room Rent Capping** (such as **Tata AIG MediCare Select** or **HDFC Optima Secure**).`;
    } else if (detectedTopic === 'restoration') {
      genericAnswer = language === 'hinglish'
        ? `**Restoration Benefit kya hota hai?**\n\n` +
          `Jab policy year mein claim ke baad aapka Base Sum Insured exhaust (khatam) ho jata hai, toh insurer aapka coverage dobara 100% refill kar deta hai.\n\n` +
          `💡 **Key Factors:**\n` +
          `1. **Same Illness vs Different Illness:** Check karein ki kya usi bimari ke liye dubara claim milega ya sirf doosri bimari par.\n` +
          `2. **Frequency:** Kuch plans saal mein sirf 1 baar restore karte hain, jabki premium plans (**Tata AIG MediCare Select Restore Infinity Plus** aur **Care Supreme**) **Unlimited Times** restore dete hain.`
        : `**What is Restoration / Recharge Benefit?**\n\n` +
          `Restoration automatically refills 100% of your sum insured after you utilize coverage during a claim in the policy year.\n\n` +
          `💡 **Key Considerations:**\n` +
          `1. Does it trigger for the same illness or only unrelated illnesses?\n` +
          `2. Is it once per year, or **Unlimited Times** (like **Tata AIG MediCare Select** and **Care Supreme**)?`;
    }

    if (genericAnswer) {
      console.log('[WHYINSURED AI]');
      console.log('Website content FOUND');
      console.log('[WHYINSURED AI]');
      console.log('Source: website policy knowledge / educational benefits');
      console.log('[WHYINSURED AI]');
      console.log('Gemini fallback: NOT USED');

      return {
        found: true,
        reply: genericAnswer,
        source: 'website policy knowledge / educational benefits',
        planName: 'General Insurance Concept',
        topic: detectedTopic,
        intent: 'WEBSITE_KNOWLEDGE'
      };
    }
  }

  // 5. Website content not found -> trigger Gemini fallback
  console.log('[WHYINSURED AI]');
  console.log('Website content NOT FOUND');
  console.log('[WHYINSURED AI]');
  console.log('Gemini fallback: USED');

  return { found: false };
}

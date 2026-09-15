/**
 * geminiService.js
 * 
 * Production-grade Gemini AI Personal Insurance Advisor for WHYINSURED.
 * Open-ended conversational intelligence:
 *   - Classifies user intent per message (GREETING, GENERAL_HEALTH_INSURANCE_QUESTION, 
 *     REQUIREMENT_UPDATE, REQUIREMENT_CORRECTION, REQUIREMENT_RESET, COMPANY_PREFERENCE, 
 *     PLAN_QUERY, COMPARISON_QUERY, RECOMMENDATION_REQUEST, REMOVE_RECOMMENDATION, 
 *     NEW_OPTION_REQUEST, UNSUPPORTED_DOMAIN, GENERAL_NON_INSURANCE)
 *   - Never produces repetitive, robotic "Got it" acknowledgements.
 *   - Answers questions directly and thoroughly first.
 *   - Collects missing requirements progressively without rigid questionnaire loops.
 *   - Recommends policies ONLY upon explicit user request.
 *   - Grounded strictly in verified WHYINSURED policy catalog.
 */

import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.6-flash';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Analyze user requirement and generate personal advisor conversational response.
 * 
 * @param {string} userMessage - Latest user message
 * @param {Array} conversationHistory - Past conversation messages
 * @param {Array} availablePoliciesSummary - Grounding catalog
 * @returns {Promise<Object>}
 */
export async function analyzeRequirementWithGemini(userMessage, conversationHistory = [], availablePoliciesSummary = []) {
  if (!userMessage || !userMessage.trim()) {
    return {
      intent: 'GREETING',
      conversationStage: 'greeting',
      showPlans: false,
      requirements: {},
      reply: "Hi! 👋 I'm your WHYINSURED Advisor. Think of me as your insurance friend — you can ask me anything about health insurance, or tell me what kind of plan you're looking for.",
      suggestions: []
    };
  }

  // Format conversation history for multi-turn context
  const recentHistory = (conversationHistory || [])
    .filter(m => (m.text || m.content) && !(m.text || m.content).includes('Think of me as your insurance friend'))
    .slice(-14)
    .map(m => `${(m.sender === 'user' || m.role === 'user') ? 'User' : 'Advisor'}: ${m.text || m.content}`)
    .join('\n');

  // Try Gemini API if key is available
  if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== 'your_api_key_here' && GEMINI_API_KEY.trim() !== '') {
    try {
      const geminiResult = await callGeminiApiWithRetry(userMessage, recentHistory, availablePoliciesSummary, 2);
      if (geminiResult && geminiResult.intent && geminiResult.reply) {
        return geminiResult;
      }
    } catch (apiError) {
      console.warn('[Gemini Service] Handled API error (using built-in semantic advisor):', apiError.message);
    }
  }

  // Resilient semantic personal advisor fallback
  return fallbackSemanticAdvisor(userMessage, conversationHistory);
}

/**
 * Call Gemini REST API with flexible open-ended persona and intent reasoning
 */
async function callGeminiApiWithRetry(userMessage, recentHistory, availablePoliciesSummary, maxAttempts = 2) {
  const systemPrompt = `You are the WHYINSURED Personal Health Insurance Advisor — a warm, friendly, real conversational insurance expert.
You speak in a simple, friendly, conversational tone (English or natural Hinglish matching the user).

CRITICAL CONVERSATIONAL PRINCIPLES:
1. NO REPETITIVE "GOT IT" ACKNOWLEDGEMENTS:
   - NEVER start every message with "Got it" or repeat robotic acknowledgements.
   - Use natural, varied phrasing: "Sure, I can help with that.", "Understood.", "Noted.", "Saved — [details].", "Certainly!", or answer the question directly.

2. ANSWER QUESTIONS DIRECTLY FIRST:
   - If user asks ANY educational or conceptual question (e.g., "what is restoration?", "what is waiting period?", "what is room rent?", "what is sum insured?", "what is copay?", "tell about health insurance"):
     * INTENT: GENERAL_HEALTH_INSURANCE_QUESTION
     * Directly and clearly explain the concept in simple conversational language.
     * Do NOT start a questionnaire or force requirement collection when the user is asking an educational question.
     * If the user previously gave requirements, you may gently keep them anchored without blocking the answer.

3. PROGRESSIVE REQUIREMENT COLLECTION:
   - When the user shares requirements, save them and ask ONLY the single next missing requirement:
     * User: "I need a plan for my parents" -> Ask parents' ages.
     * User: "Father 45 and mother 36" -> Save ages and ask coverage amount preference (e.g. ₹10 Lakh, ₹20 Lakh, ₹50 Lakh).
     * User: "20 lakh" -> Save coverage and ask about room preference (Single Private Room) or company preference.
     * User: "Single private room" -> Confirm readiness and ask if they'd like to see matching plans.
   - NEVER repeat questions for information already provided.

4. RECOMMENDATIONS ONLY UPON EXPLICIT REQUEST:
   - Only set showPlans: true and intent: "RECOMMENDATION_REQUEST" when the user explicitly asks to see plans (e.g. "show me plans", "plan dikhao", "recommend a plan", "show suitable policies").

5. GROUNDING (WHYINSURED DATA):
   - Available Insurers in database:
     • HDFC ERGO: Optima Secure+ (2X instant Day 1 coverage, Unlimited Automatic Restore, Protect Plus consumables) & Energy Plan (Day 1 Diabetes/BP cover).
     • Aditya Birla: Activ One (Up to 100% HealthReturns™ cashback on active lifestyle, Day 1 Chronic Management for BP/Diabetes/Asthma, 100% Super Reload).
     • Care Health: Care Supreme (Up to 500% Cumulative Bonus booster, Unlimited Automatic Recharge).
     • Niva Bupa: ReAssure 2.0 (Lock the Clock entry age premium until 1st claim, perpetual ReAssure+ unlimited recharge).
     • Star Health: Star Comprehensive (Day 1 maternity & newborn child cover, automatic 100% basic recharge).
     • ICICI Lombard: Elevate (Infinite Reset benefit).
     • Tata AIG: MediCare Select (100% Cumulative Bonus without reduction on claim).
   - NEVER invent fake features or copy one company's features into another.

6. UNSUPPORTED DOMAINS:
   - If user asks about car/motor/bike/life/travel/home insurance, politely clarify that WHYINSURED currently focuses on health insurance.

OUTPUT FORMAT: Return ONLY valid JSON:
{
  "intent": string,
  "conversationStage": "greeting" | "collecting_requirements" | "awaiting_plan_confirmation" | "showing_recommendations" | "recommendation_follow_up",
  "showPlans": boolean,
  "excludeCompanies": string[],
  "requirements": {
    "relationship": string or null,
    "ages": { "father"?: number, "mother"?: number, "self"?: number, "raw"?: number[] } or number[] or null,
    "coverage": number or null,
    "preferredInsurer": string or null,
    "roomCategory": string or null,
    "priorities": string[],
    "addonsPreference": string or null,
    "preExistingDiseases": string[]
  },
  "reply": string,
  "suggestions": string[]
}`;

  const promptContent = `Conversation History:\n${recentHistory || 'No previous messages'}\n\nLatest User Message: "${userMessage}"`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n${promptContent}` }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
      responseMimeType: 'application/json'
    }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000)
      });

      if (response.status === 503 || response.status === 429) {
        if (attempt < maxAttempts) {
          console.warn(`[Gemini Service] Model ${GEMINI_MODEL} busy (${response.status}). Retrying in 1s...`);
          await wait(1000);
          continue;
        } else {
          return null;
        }
      }

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Gemini Service] HTTP ${response.status}: ${errText}`);
        return null;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      const parsedJson = safelyParseGeminiJson(rawText);
      if (parsedJson) {
        return parsedJson;
      } else {
        return null;
      }
    } catch (netErr) {
      if (attempt < maxAttempts) {
        await wait(800);
        continue;
      }
      return null;
    }
  }

  return null;
}

/**
 * Safely parse JSON from Gemini text response
 */
function safelyParseGeminiJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const cleaned = trimmed.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && parsed.intent) {
      return parsed;
    }
  } catch (err) {
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedMatch = JSON.parse(jsonMatch[0]);
        if (parsedMatch && typeof parsedMatch === 'object' && parsedMatch.intent) {
          return parsedMatch;
        }
      }
    } catch (innerErr) {
      // ignore
    }
  }

  return null;
}

/**
 * Intelligent Semantic Fallback Engine with Open-Ended Intent Understanding
 */
function fallbackSemanticAdvisor(userMessage, conversationHistory = []) {
  const rawCurrent = (userMessage || '').trim();
  let lowerCurrent = rawCurrent.toLowerCase();

  // Normalize common broken/typo queries
  lowerCurrent = lowerCurrent
    .replace(/\b(aents|parnts|perents|parants)\b/g, 'parents')
    .replace(/\b(helath|healt|hlaeth)\b/g, 'health')
    .replace(/\b(inusrance|insurence|insurnace|insuranc|insurane)\b/g, 'insurance')
    .replace(/\b(moto\s*insurance|moter\s*insurance)\b/g, 'motor insurance')
    .replace(/\b(two\s*wheeler|2\s*wheeler|four\s*wheeler|4\s*wheeler|auto\s*insurance)\b/g, 'motor insurance')
    .replace(/\bplanhai\b/g, 'plan hai');

  // Extract previous conversation context
  const pastUserTexts = conversationHistory
    .filter(m => (m.sender === 'user' || m.role === 'user'))
    .map(m => (m.text || m.content || '').toLowerCase().trim());
  
  const allUserTexts = [...pastUserTexts, lowerCurrent];
  const allText = allUserTexts.join(' ');
  const accumulatedReqs = extractRequirementsFromText(allText, lowerCurrent);

  // =========================================================================
  // 0. DOMAIN INTENT DETECTION (Motor, Vehicle, Travel, Life, Home, General)
  // =========================================================================
  const isMotorDomain = (
    lowerCurrent.includes('motor') || lowerCurrent.includes('car insurance') ||
    lowerCurrent.includes('bike insurance') || lowerCurrent.includes('vehicle insurance') ||
    lowerCurrent.includes('auto insurance') || lowerCurrent.includes('car policy')
  );

  const isLifeDomain = (
    lowerCurrent.includes('life insurance') || lowerCurrent.includes('term life') ||
    lowerCurrent.includes('term insurance') || lowerCurrent.includes('life policy')
  );

  const isTravelDomain = (
    lowerCurrent.includes('travel insurance') || lowerCurrent.includes('travel cover') ||
    lowerCurrent.includes('flight insurance')
  );

  const isHomeDomain = (
    lowerCurrent.includes('home insurance') || lowerCurrent.includes('property insurance') ||
    lowerCurrent.includes('house insurance')
  );

  const isUnsupportedInsurance = isMotorDomain || isLifeDomain || isTravelDomain || isHomeDomain;

  if (isUnsupportedInsurance && !lowerCurrent.includes('health')) {
    return {
      intent: 'UNSUPPORTED_DOMAIN',
      domain: isMotorDomain ? 'MOTOR_INSURANCE' : (isLifeDomain ? 'LIFE_INSURANCE' : (isTravelDomain ? 'TRAVEL_INSURANCE' : 'HOME_INSURANCE')),
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "I can explain the basics of car/motor and other insurance, but WHYINSURED currently specializes in health insurance. Whenever you're ready, I can help you understand health insurance, compare health plans, or find the best plan for your needs.",
      suggestions: []
    };
  }

  // General Non-Insurance queries (weather, cricket, coding, etc.)
  const isNonInsurance = (
    lowerCurrent.includes('weather') || lowerCurrent.includes('temperature') ||
    lowerCurrent.includes('cricket score') || lowerCurrent.includes('recipe') ||
    (lowerCurrent.includes('who are you') && !lowerCurrent.includes('advisor'))
  );

  if (isNonInsurance) {
    return {
      intent: 'GENERAL_NON_INSURANCE',
      domain: 'GENERAL_NON_INSURANCE',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "I'm your WHYINSURED Health Insurance Advisor, so I specialize in health insurance policies, benefits, comparisons, and claims. Feel free to ask me anything about health insurance!",
      suggestions: []
    };
  }

  // Returning to health insurance from out of scope
  if (lowerCurrent.includes('actually') && lowerCurrent.includes('health')) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Great! Let's find the right health insurance plan for you. What coverage are you looking for — around ₹10 lakh, ₹20 lakh, ₹50 lakh, or something else?",
      suggestions: []
    };
  }

  // =========================================================================
  // 1. INTENT: REQUIREMENT_RESET (User starts over or clears context)
  // =========================================================================
  const isReset = (
    lowerCurrent.includes('forget everything') || lowerCurrent.includes('forget previous') ||
    lowerCurrent.includes('start again') || lowerCurrent.includes('start over') ||
    lowerCurrent.includes('reset search') || lowerCurrent.includes('reset') ||
    (lowerCurrent.includes('actually') && (lowerCurrent.includes('for myself') || lowerCurrent.includes('for me')))
  );

  if (isReset) {
    const newRelationship = (lowerCurrent.includes('myself') || lowerCurrent.includes('for me') || lowerCurrent.includes('single')) ? 'self' : null;
    return {
      intent: 'REQUIREMENT_RESET',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: {
        relationship: newRelationship,
        ages: null,
        coverage: null,
        preferredInsurer: null,
        roomCategory: null,
        priorities: []
      },
      reply: "No problem! Let's start fresh. What kind of coverage are you looking for — for example ₹10 Lakh, ₹20 Lakh, or ₹50 Lakh?",
      suggestions: []
    };
  }

  // =========================================================================
  // 2. INTENT: GREETING (Initial or pure greeting)
  // =========================================================================
  const isGreeting = (
    /^(hi|hii|hiii|hello|helo|hey|namaste|good\s*morning|good\s*afternoon|good\s*evening|wassup|hola)\b/i.test(lowerCurrent) &&
    lowerCurrent.split(/\s+/).length <= 3
  );

  if (isGreeting && pastUserTexts.length === 0) {
    return {
      intent: 'GREETING',
      conversationStage: 'greeting',
      showPlans: false,
      requirements: {},
      reply: "Hi! 👋 Nice to meet you. I'm your WHYINSURED Advisor. Think of me as your insurance friend — you can ask me anything about health insurance, or tell me what kind of plan you're looking for.",
      suggestions: []
    };
  }

  // =========================================================================
  // 3. INTENT: GENERAL_HEALTH_INSURANCE_QUESTION (Educational Q&A)
  // Distinguish educational questions from requirement specifications.
  // =========================================================================

  // A. Restoration / Recharge / Refill Question
  if (
    lowerCurrent.includes('what is restoration') || lowerCurrent.includes('restoration kya') ||
    lowerCurrent.includes('explain restoration') || lowerCurrent.includes('how does restoration') ||
    lowerCurrent.includes('what does restoration mean') || lowerCurrent.includes('unlimited restoration mean') ||
    lowerCurrent === 'restoration' || lowerCurrent === 'what is recharge'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Restoration benefit** automatically refills 100% of your sum insured if it gets exhausted by medical claims in a policy year, so you and your family are never left unprotected for subsequent hospitalizations.\n\nMany modern policies (such as HDFC Optima Secure+, Aditya Birla Activ One, and Niva Bupa ReAssure 2.0) offer **Unlimited Restoration** for both same and unrelated illnesses.",
      suggestions: []
    };
  }

  // B. Waiting Period / PED Question
  if (
    lowerCurrent.includes('what is waiting period') || lowerCurrent.includes('waiting period kya') ||
    lowerCurrent.includes('explain waiting period') || lowerCurrent.includes('what is ped') ||
    lowerCurrent.includes('ped kya hai') || lowerCurrent === 'waiting period' ||
    lowerCurrent === 'waiting periods' || lowerCurrent === 'what is waiting periods'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "A **waiting period** is the duration during which specific illnesses or pre-existing conditions are not covered after your policy begins:\n• **Initial Waiting Period**: First 30 days (except accidental hospitalization which is covered from Day 1).\n• **Specific Diseases**: 12 to 24 months for specified procedures (e.g., cataract, hernia, joint replacement, stones).\n• **Pre-Existing Diseases (PED)**: Standard 24 to 36 months before declared pre-existing conditions (like Diabetes or BP) are covered.",
      suggestions: []
    };
  }

  // C. Room Rent & Room Category Question
  if (
    lowerCurrent.includes('what is room rent') || lowerCurrent.includes('room rent kya') ||
    lowerCurrent.includes('what is room category') || lowerCurrent.includes('what is single private') ||
    lowerCurrent.includes('explain room rent') || lowerCurrent.includes('why is room category') ||
    lowerCurrent.includes('proportionate deduction') || lowerCurrent.includes('what is icu') ||
    lowerCurrent === 'room rent' || lowerCurrent === 'what is room rent?'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Room rent capping** limits how much the insurer pays for your hospital room per day (e.g. 1% of sum insured). If you choose a room above your allowed category, proportionate deductions are applied to your entire hospital bill.\n\nChoosing a policy with **Single Private Room eligibility or No Room Rent Capping** (such as HDFC Optima Secure+, Aditya Birla Activ One, or Care Supreme) ensures complete freedom of room selection without out-of-pocket penalties.",
      suggestions: []
    };
  }

  // D. Sum Insured & Coverage Sizing Question
  if (
    lowerCurrent.includes('what is sum insured') || lowerCurrent.includes('sum insured kya') ||
    lowerCurrent.includes('how much coverage') || lowerCurrent.includes('how much health insurance') ||
    lowerCurrent.includes('is 10 lakh enough') || lowerCurrent.includes('is 20 lakh enough') ||
    lowerCurrent.includes('difference between 10 lakh and 20 lakh') || lowerCurrent === 'sum insured'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Sum Insured** is the maximum annual coverage pool your insurer will pay towards covered hospitalization bills in a policy year.\n\n**Recommended Sizing Guidelines:**\n• **For Parents/Seniors**: ₹20 Lakh to ₹50 Lakh is recommended due to higher treatment costs.\n• **For Metro Cities (Tier-1)**: ₹20 Lakh+ is ideal to safeguard against 10–14% annual medical inflation.\n• **For Tier-2/3 Cities**: ₹10 Lakh to ₹15 Lakh provides a solid baseline.",
      suggestions: []
    };
  }

  // E. Deductible & Co-payment Question
  if (
    lowerCurrent.includes('what is copay') || lowerCurrent.includes('what is co-payment') ||
    lowerCurrent.includes('copay kya') || lowerCurrent.includes('what is deductible') ||
    lowerCurrent.includes('deductible kya') || lowerCurrent === 'copay' || lowerCurrent === 'deductible'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "• **Co-payment (Copay)**: A fixed percentage (e.g., 10% or 20%) of the hospital bill you pay out of pocket, while the insurer covers the rest.\n• **Deductible**: A pre-agreed fixed threshold (e.g., ₹50,000) you pay first before your insurance coverage starts paying.\n\nMost premium retail health plans on WHYINSURED offer **0% mandatory copay** for standard age groups.",
      suggestions: []
    };
  }

  // F. Cashless Treatment, Reimbursement & Network Hospitals Question
  if (
    lowerCurrent.includes('what is cashless') || lowerCurrent.includes('cashless treatment kya') ||
    lowerCurrent.includes('what is reimbursement') || lowerCurrent.includes('what is network hospital') ||
    lowerCurrent === 'cashless' || lowerCurrent === 'reimbursement'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "• **Cashless Treatment**: The insurer directly settles approved hospital bills with the network hospital, so you don't need to arrange large amounts of cash during admission.\n• **Reimbursement**: If treated at a non-network hospital, you pay the bills initially and submit claim documents to the insurer for reimbursement.\n• **Network Hospital**: A hospital that has an official cashless tie-up with your insurance provider.",
      suggestions: []
    };
  }

  // G. Pre and Post Hospitalization Question
  if (
    lowerCurrent.includes('what is pre-hospitalization') || lowerCurrent.includes('pre and post') ||
    lowerCurrent.includes('pre hospitalization kya') || lowerCurrent.includes('post hospitalization kya') ||
    lowerCurrent.includes('pre-hospitalization') || lowerCurrent.includes('post-hospitalization')
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "• **Pre-Hospitalization**: Covers medical consultations, diagnostic tests, and investigations incurred **60 days** before hospital admission.\n• **Post-Hospitalization**: Covers recovery expenses, follow-up doctor visits, and medications for **90 to 180 days** after hospital discharge.",
      suggestions: []
    };
  }

  // H. Day-Care Treatment Question
  if (
    lowerCurrent.includes('what is day-care') || lowerCurrent.includes('day care kya') ||
    lowerCurrent.includes('what is daycare') || lowerCurrent === 'daycare' || lowerCurrent === 'day care'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Day-care treatments** are medical procedures or surgeries that require hospital admission but are completed in less than 24 hours due to modern medical advancements (such as cataract surgery, chemotherapy, radiotherapy, dialysis, or tonsillectomy). Modern comprehensive health plans cover all daycare treatments up to the full sum insured.",
      suggestions: []
    };
  }

  // I. No-Claim Bonus (NCB) / Cumulative Bonus Question
  if (
    lowerCurrent.includes('what is ncb') || lowerCurrent.includes('what is no claim bonus') ||
    lowerCurrent.includes('ncb kya') || lowerCurrent.includes('what is cumulative bonus') ||
    lowerCurrent === 'ncb' || lowerCurrent === 'no claim bonus'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**No-Claim Bonus (NCB)** or **Cumulative Bonus** is a reward provided by the insurer for every claim-free year. It automatically increases your base Sum Insured (typically 10% to 50% per claim-free year, up to 500% in plans like Care Supreme) without increasing your premium.",
      suggestions: []
    };
  }

  // J. Consumables / Non-medical Items Question
  if (
    lowerCurrent.includes('what is consumable') || lowerCurrent.includes('what are consumables') ||
    lowerCurrent.includes('non-medical expenses kya') || lowerCurrent === 'consumables'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Hospital Consumables** are non-medical disposable supplies used during treatment (such as PPE kits, surgical gloves, syringes, cotton, and oxygen masks). In standard policies, these cost 10–15% of the bill and are paid out-of-pocket, but plans with Consumables Cover (like HDFC Optima Secure+ with Protect Benefit) pay for them 100%.",
      suggestions: []
    };
  }

  // K. General Health Insurance Overview ("tell about health insurance", "what is health insurance", "how does health insurance work")
  if (
    lowerCurrent.includes('tell about health insurance') || lowerCurrent.includes('what is health insurance') ||
    lowerCurrent.includes('about health insurance') || lowerCurrent.includes('how does health insurance work') ||
    lowerCurrent.includes('explain health insurance') || lowerCurrent.includes('health insurance kya hai') ||
    lowerCurrent.includes('health insurance kya hota') || lowerCurrent === 'health insurance'
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Health insurance is a policy that helps cover eligible medical and hospitalization expenses according to the policy terms. You pay a premium, and the insurer provides financial coverage up to the applicable limits of your policy.\n\nIn simple terms, it helps protect you and your family from large, unexpected medical expenses and provides access to cashless hospital care.\n\nIf you'd like, I can also explain how waiting periods, room rent, restoration benefits work, or help you understand how to choose the right coverage!",
      suggestions: []
    };
  }

  // =========================================================================
  // 4. INTENT: COMPANY_QUERY & COMPARISON (HDFC, Aditya Birla, Star, Niva, Care)
  // =========================================================================
  
  // A. Compare HDFC and Aditya Birla
  if (
    (lowerCurrent.includes('compare') || lowerCurrent.includes('vs') || lowerCurrent.includes('difference')) &&
    lowerCurrent.includes('hdfc') && (lowerCurrent.includes('aditya') || lowerCurrent.includes('birla'))
  ) {
    return {
      intent: 'COMPARISON_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Here is how **HDFC ERGO Optima Secure+** compares with **Aditya Birla Activ One**:\n• **Instant Cover vs Wellness**: HDFC gives **2X Instant Coverage on Day 1** (doubles base sum insured); Aditya Birla offers **Up to 100% HealthReturns™ cashback** on an active healthy lifestyle.\n• **Chronic Illnesses**: Aditya Birla covers chronic conditions (Diabetes, BP, Asthma, Cholesterol) from **Day 1** under Chronic Care Management; HDFC Optima Secure+ has a standard 24-month PED waiting period.\n• **Restoration**: Both offer unlimited / super reload restoration benefits and zero room-rent capping.",
      suggestions: []
    };
  }

  // B. Aditya Birla Inquiry / Preference
  if (lowerCurrent.includes('aditya birla') || lowerCurrent.includes('aditya') || lowerCurrent.includes('birla')) {
    const updatedReqs = { ...accumulatedReqs, preferredInsurer: 'aditya-birla' };

    if (lowerCurrent.includes('what about') || lowerCurrent.includes('tell me about') || lowerCurrent.includes('kaisa hai') || lowerCurrent.includes('me kya hai')) {
      return {
        intent: 'PLAN_QUERY',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: updatedReqs,
        reply: "**Aditya Birla Health Insurance** offers **Activ One**, which includes:\n• **Up to 100% HealthReturns™ cashback** for maintaining healthy physical activity\n• **Day 1 Chronic Care Management** covering BP, Diabetes, Asthma & High Cholesterol\n• **100% Super Reload** of sum insured for same and unrelated illnesses\n• **Zero room-rent sub-limits** across variants.\n\nWould you like me to find the best Aditya Birla plan configuration for you?",
        suggestions: []
      };
    }

    return {
      intent: 'COMPANY_PREFERENCE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: updatedReqs,
      reply: "Understood! We can focus on Aditya Birla plans (such as Activ One with 100% HealthReturns™ and Chronic Care). What coverage amount are you considering — around ₹10 lakh, ₹20 lakh, ₹50 lakh, or something else?",
      suggestions: []
    };
  }

  // C. Star Health Inquiry
  if (lowerCurrent.includes('star me koi plan') || lowerCurrent.includes('star me plan hai') || lowerCurrent.includes('star health plan') || (lowerCurrent.includes('star') && lowerCurrent.includes('plan'))) {
    return {
      intent: 'PLAN_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Yes! Star Health offers **Star Comprehensive**, which includes:\n• **Day 1 Maternity & Newborn Baby cover**\n• **Automatic 100% Basic Sum Insured Recharge**\n• **Single Private Room eligibility** with no sub-limits on standard treatments.\n\nWould you like to include Star Comprehensive in your comparison?",
      suggestions: []
    };
  }

  // D. HDFC Inquiry
  if (
    lowerCurrent.includes('hdfc wala') || lowerCurrent.includes('hdfc kaisa') ||
    lowerCurrent.includes('what is hdfc') || lowerCurrent.includes('optima secure') ||
    (lowerCurrent.includes('hdfc') && (lowerCurrent.includes('about') || lowerCurrent.includes('features') || lowerCurrent.includes('plan')))
  ) {
    return {
      intent: 'PLAN_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**HDFC ERGO Optima Secure+** is a top-tier comprehensive plan. Key advantages:\n• **2X Instant Coverage on Day 1**: Automatically doubles base cover via Secure Benefit.\n• **Unlimited Automatic Restore**: 100% reload for same and unrelated illnesses.\n• **Protect Plus Rider**: 100% cashless payment on non-medical hospital consumables.\n• **Zero Room Rent Capping**: Freedom to choose any hospital room category.",
      suggestions: []
    };
  }

  // E. Removal of Company ("remove Star", "Star wala hata do")
  if (
    lowerCurrent.includes('hata do') || lowerCurrent.includes('remove') || 
    lowerCurrent.includes('mat dikhao') || lowerCurrent.includes('nahi chahiye') ||
    lowerCurrent.includes('exclude')
  ) {
    let excludeCompany = 'star-health';
    if (lowerCurrent.includes('hdfc')) excludeCompany = 'hdfc-ergo';
    else if (lowerCurrent.includes('niva')) excludeCompany = 'niva-bupa';
    else if (lowerCurrent.includes('care')) excludeCompany = 'care-health';
    else if (lowerCurrent.includes('birla') || lowerCurrent.includes('aditya')) excludeCompany = 'aditya-birla';

    const companyName = excludeCompany === 'star-health' ? 'Star Health' : (excludeCompany === 'hdfc-ergo' ? 'HDFC ERGO' : 'the selected insurer');

    return {
      intent: 'REMOVE_RECOMMENDATION',
      conversationStage: 'showing_recommendations',
      showPlans: true,
      excludeCompanies: [excludeCompany],
      requirements: accumulatedReqs,
      reply: `Understood! I've removed ${companyName} from your options. Here are the remaining top recommendations matching your requirements:`,
      suggestions: []
    };
  }

  // F. Show Another Option
  if (lowerCurrent.includes('another plan') || lowerCurrent.includes('another option') || lowerCurrent.includes('aur option') || lowerCurrent.includes('aur plan')) {
    return {
      intent: 'NEW_OPTION_REQUEST',
      conversationStage: 'showing_recommendations',
      showPlans: true,
      requirements: accumulatedReqs,
      reply: "Here are additional matching options from WHYINSURED:",
      suggestions: []
    };
  }

  // =========================================================================
  // 5. INTENT: RECOMMENDATION_REQUEST ("show me plans", "show plans", "plan dikhao")
  // =========================================================================
  const isExplicitShowPlansRequest = (
    lowerCurrent.includes('show') || lowerCurrent.includes('dikha') || lowerCurrent.includes('dikhao') ||
    lowerCurrent.includes('recommend') || lowerCurrent.includes('options') || lowerCurrent.includes('which plan') ||
    lowerCurrent.includes('kaunsa plan') || lowerCurrent === 'yes' || lowerCurrent === 'haan' ||
    lowerCurrent === 'yep' || lowerCurrent === 'sure' || lowerCurrent.includes('yes show') ||
    lowerCurrent.includes('show me') || lowerCurrent.includes('find best') || lowerCurrent.includes('suggest')
  );

  if (isExplicitShowPlansRequest) {
    return {
      intent: 'RECOMMENDATION_REQUEST',
      conversationStage: 'showing_recommendations',
      showPlans: true,
      requirements: accumulatedReqs,
      reply: "Here are the top plans that best match your requirements:",
      suggestions: []
    };
  }

  // =========================================================================
  // 6. INTENT: REQUIREMENT_UPDATE & PROGRESSIVE QUESTIONING
  // =========================================================================

  // User just said "i need a plan for me" / self
  if (lowerCurrent.includes('for me') || lowerCurrent.includes('for myself') || lowerCurrent.includes('plan for me')) {
    accumulatedReqs.relationship = 'self';
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Awesome! 😊 I can help you find the right health plan for yourself. What coverage amount are you looking for — for example ₹10 Lakh, ₹20 Lakh, or ₹50 Lakh?",
      suggestions: []
    };
  }

  // User just stated "for my parents" / "I need a plan for my parents"
  if (lowerCurrent.includes('parent') || (lowerCurrent.includes('father') && !lowerCurrent.match(/\d{2}/)) || (lowerCurrent.includes('mother') && !lowerCurrent.match(/\d{2}/))) {
    accumulatedReqs.relationship = 'parents';
    if (!accumulatedReqs.ages || (Array.isArray(accumulatedReqs.ages) && accumulatedReqs.ages.length === 0)) {
      return {
        intent: 'REQUIREMENT_UPDATE',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Sure, I can help you with that! What are the ages of your parents?",
        suggestions: []
      };
    }
  }

  // User provided ages (e.g. "father 45 and mother 36", "father 45 mother 36", "45 and 36")
  const currentHasAges = (lowerCurrent.includes('father') || lowerCurrent.includes('mother') || lowerCurrent.match(/\b[2-9][0-9]\b/)) && !lowerCurrent.includes('lakh');
  if (currentHasAges && accumulatedReqs.ages && !accumulatedReqs.coverage) {
    let ageSummary = "your parents' ages";
    if (accumulatedReqs.ages && typeof accumulatedReqs.ages === 'object' && accumulatedReqs.ages.father && accumulatedReqs.ages.mother) {
      ageSummary = `Father (${accumulatedReqs.ages.father}) and Mother (${accumulatedReqs.ages.mother})`;
    }
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: `Saved — ${ageSummary}. What coverage amount are you looking for — for example ₹10 Lakh, ₹20 Lakh, or ₹50 Lakh?`,
      suggestions: []
    };
  }

  // User mentions room preference (e.g. "single private room", "private room", "single room")
  if (
    lowerCurrent.includes('single private') || lowerCurrent.includes('private room') ||
    lowerCurrent.includes('single room')
  ) {
    accumulatedReqs.roomCategory = 'Single Private Room';
    accumulatedReqs.roomPreference = 'Single Private Room';
    if (!accumulatedReqs.priorities.includes('single_private_room')) {
      accumulatedReqs.priorities.push('single_private_room');
    }

    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Noted — Single Private Room with zero sub-limits. Would you like me to show you the plans that best match these requirements?",
      suggestions: []
    };
  }

  // User provided coverage (e.g. "20 lakh", "20 lakh coverage")
  const currentHasCoverage = lowerCurrent.match(/(\d+)\s*(lakh|lakhs|l|cr|crore|lac|lacs)/i) || lowerCurrent.includes('20 lakh') || lowerCurrent.includes('10 lakh') || lowerCurrent.includes('50 lakh');
  if (currentHasCoverage && accumulatedReqs.coverage) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: `Noted — ₹${accumulatedReqs.coverage} Lakh coverage. Do you have a preference for a private room, or any preferred insurance company?`,
      suggestions: []
    };
  }

  // Confirmation if full requirements exist
  if (accumulatedReqs.relationship && accumulatedReqs.coverage) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: `I have noted your requirements for ${accumulatedReqs.relationship === 'parents' ? 'your parents' : 'yourself'} with ₹${accumulatedReqs.coverage} Lakh coverage. Would you like me to show you the matching plans?`,
      suggestions: []
    };
  }

  // Natural contextual conversational prompt
  return {
    intent: 'REQUIREMENT_UPDATE',
    conversationStage: 'collecting_requirements',
    showPlans: false,
    requirements: accumulatedReqs,
    reply: "I'm here to help! You can ask me any question about health insurance benefits, or tell me who you want coverage for (such as yourself or parents).",
    suggestions: []
  };
}

/**
 * Helper to extract requirements dynamically from conversation text
 */
function extractRequirementsFromText(allText, lowerCurrent) {
  let relationship = null;
  if (allText.includes('parent') || allText.includes('father') || allText.includes('mother') || allText.includes('pitaji') || allText.includes('mataji')) {
    relationship = 'parents';
  } else if (allText.includes('family') || allText.includes('child') || allText.includes('kid') || allText.includes('spouse') || allText.includes('wife')) {
    relationship = 'family';
  } else if (allText.includes('myself') || allText.includes('for me') || allText.includes('individual') || allText.includes('single')) {
    relationship = 'self';
  }

  // Specific override if current message specifically changed relationship
  if (lowerCurrent.includes('parent') || lowerCurrent.includes('father') || lowerCurrent.includes('mother')) {
    relationship = 'parents';
  } else if (lowerCurrent.includes('for myself') || lowerCurrent.includes('for me') || lowerCurrent.includes('plan for me')) {
    relationship = 'self';
  }

  const structuredAges = {};
  const rawAges = [];

  const fatherMatch = allText.match(/father\s*(?:is\s*)?(\d{2})/i);
  if (fatherMatch) {
    const fAge = parseInt(fatherMatch[1], 10);
    structuredAges.father = fAge;
    if (!rawAges.includes(fAge)) rawAges.push(fAge);
  }

  const motherMatch = allText.match(/mother\s*(?:is\s*)?(\d{2})/i);
  if (motherMatch) {
    const mAge = parseInt(motherMatch[1], 10);
    structuredAges.mother = mAge;
    if (!rawAges.includes(mAge)) rawAges.push(mAge);
  }

  const ageMatches = allText.matchAll(/\b(?:age\s*|aged\s*|years\s*old\s*|\b)([2-9][0-9])\b/gi);
  for (const match of ageMatches) {
    const ageNum = parseInt(match[1], 10);
    if (ageNum >= 18 && ageNum <= 99 && !rawAges.includes(ageNum)) {
      rawAges.push(ageNum);
    }
  }

  let coverage = null;
  const coverageMatch = allText.match(/(\d+)\s*(lakh|lakhs|l|cr|crore|lac|lacs)/i);
  if (coverageMatch) {
    const val = parseInt(coverageMatch[1], 10);
    const unit = coverageMatch[2].toLowerCase();
    if (unit.startsWith('cr')) {
      coverage = val * 100;
    } else {
      coverage = val;
    }
  } else if (allText.includes('50 lakh') || allText.includes('50l') || allText.includes('50 lac')) {
    coverage = 50;
  } else if (allText.includes('20 lakh') || allText.includes('20l') || allText.includes('20 lac')) {
    coverage = 20;
  } else if (allText.includes('15l') || allText.includes('15 lakh')) {
    coverage = 15;
  } else if (allText.includes('10l') || allText.includes('10 lakh')) {
    coverage = 10;
  } else if (allText.includes('25l') || allText.includes('25 lakh')) {
    coverage = 25;
  } else if (allText.includes('1 cr') || allText.includes('1 crore')) {
    coverage = 100;
  }

  let preferredInsurer = null;
  if (allText.includes('aditya birla') || allText.includes('aditya') || allText.includes('birla')) {
    preferredInsurer = 'aditya-birla';
  } else if (allText.includes('hdfc')) {
    preferredInsurer = 'hdfc-ergo';
  } else if (allText.includes('niva') || allText.includes('bupa')) {
    preferredInsurer = 'niva-bupa';
  } else if (allText.includes('star')) {
    preferredInsurer = 'star-health';
  } else if (allText.includes('care')) {
    preferredInsurer = 'care-health';
  } else if (allText.includes('tata')) {
    preferredInsurer = 'tata-aig';
  } else if (allText.includes('icici')) {
    preferredInsurer = 'icici-lombard';
  }

  // Active message insurer override
  if (lowerCurrent.includes('star')) {
    preferredInsurer = 'star-health';
  } else if (lowerCurrent.includes('aditya') || lowerCurrent.includes('birla')) {
    preferredInsurer = 'aditya-birla';
  } else if (lowerCurrent.includes('hdfc')) {
    preferredInsurer = 'hdfc-ergo';
  } else if (lowerCurrent.includes('niva')) {
    preferredInsurer = 'niva-bupa';
  } else if (lowerCurrent.includes('care')) {
    preferredInsurer = 'care-health';
  }

  const priorities = [];
  let roomCategory = null;
  if (allText.includes('single private') || allText.includes('single room') || allText.includes('private room') || allText.includes('single private room')) {
    roomCategory = 'Single Private Room';
    priorities.push('single_private_room');
  } else if (allText.includes('no room rent') || allText.includes('no capping') || allText.includes('room flexibility')) {
    roomCategory = 'No Room Rent Capping';
    priorities.push('no_room_rent_capping');
  }

  if (allText.includes('sab add ons') || allText.includes('all add-ons') || allText.includes('saare benefits') || allText.includes('comprehensive')) {
    priorities.push('comprehensive');
    priorities.push('comprehensive_addons');
  }
  if (allText.includes('waiting') || allText.includes('ped') || allText.includes('pre-existing') || allText.includes('low waiting')) {
    priorities.push('low_waiting_period');
  }
  if (allText.includes('restore') || allText.includes('restoration') || allText.includes('recharge') || allText.includes('unlimited')) {
    priorities.push('unlimited_restoration');
    priorities.push('restoration');
  }

  return {
    relationship,
    ages: Object.keys(structuredAges).length > 0 ? structuredAges : (rawAges.length > 0 ? rawAges : null),
    coverage,
    preferredInsurer,
    roomCategory,
    roomPreference: roomCategory,
    priorities,
    preferences: Object.assign([...priorities], { roomCategory, priorities }),
    preExistingDiseases: []
  };
}

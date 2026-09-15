/**
 * geminiService.js
 * 
 * Production-grade Gemini AI Personal Insurance Advisor for WHYINSURED.
 * Open-ended conversational intelligence:
 *   - Classifies user intent per message (GREETING, GENERAL_QUESTION, REQUIREMENT_UPDATE, 
 *     COMPANY_PREFERENCE, PLAN_QUERY, COMPARISON, RECOMMENDATION_REQUEST, REMOVAL, RESET)
 *   - Supports typos/Hinglish (e.g. "for my aents", "star me koi planhai", "aditya birla chahiye")
 *   - Never locks into rigid state; updates, corrects, or answers immediately.
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
      reply: "Hi! 👋 Nice to meet you. I'm your WHYINSURED Advisor. What kind of health insurance are you looking for?",
      suggestions: []
    };
  }

  // Format conversation history for multi-turn context
  const recentHistory = conversationHistory
    .filter(m => m.text && !m.text.includes('Think of me as your insurance friend'))
    .slice(-14)
    .map(m => `${m.sender === 'user' ? 'User' : 'Advisor'}: ${m.text}`)
    .join('\n');

  // Try Gemini API if key is available
  if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== 'your_api_key_here' && GEMINI_API_KEY.trim() !== '') {
    try {
      const geminiResult = await callGeminiApiWithRetry(userMessage, recentHistory, availablePoliciesSummary, 2);
      if (geminiResult && geminiResult.intent) {
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
1. OPEN-ENDED & ADAPTABLE:
   - Users can ask ANY question, correct their requirements, change insurers, or switch topics AT ANY TIME.
   - Never trap the user in a rigid questionnaire or force them into previous questions.
   - Classify the user's latest intent first:
     • GREETING: "hi", "hello" -> Friendly greeting.
     • GENERAL_HEALTH_INSURANCE_QUESTION: "tell about health insurance", "what is health insurance?", "how does health insurance work?", "what is sum insured?", "how much coverage should I take?", "what is deductible/copay?", "what is cashless/reimbursement?", "what is waiting period?", "what is restoration?", "what is room rent?", "what is day-care?", "what is cumulative bonus?", "what should I check before buying?" -> Explain the concept directly and simply in conversational English. DO NOT immediately ask for user requirements or start recommendation flow.
     • REQUIREMENT_CORRECTION / UPDATE: "for my aents" (parents), "actually for myself", "20 lakh" -> Update state immediately.
     • REQUIREMENT_RESET: "forget previous", "start over" -> Clear old state and start fresh.
     • COMPANY_PREFERENCE / QUERY: "I want Aditya Birla", "sry i want plan in aditya birla", "star me koi plan hai?" -> Focus on that insurer.
     • COMPARISON_QUERY: "compare HDFC and Aditya Birla", "which one is best for my parents?" -> Compare grounded in real policy data.
     • RECOMMENDATION_REQUEST: "show me plans", "show plans", "plan dikhao" -> Only show plans if requested.
     • REMOVE_RECOMMENDATION: "remove Star", "Star wala hata do" -> Set excludeCompanies: ["star-health"].
     • NEW_OPTION_REQUEST: "show another option" -> Show alternatives.
     • OUT_OF_SCOPE_DOMAIN: "motor plan", "car insurance", "bike insurance", "term life", "travel insurance" -> Politely explain WHYINSURED focuses on health insurance.

2. NEVER PREMATURELY CLAIM COMPLETE UNDERSTANDING & NEVER FORCE RECOMMENDATIONS ON Q&A:
   - If user asks an educational question (e.g. "tell about health insurance" or "what is restoration?"), ANSWER DIRECTLY without asking for age/coverage.
   - If user says "I need a plan for me", DO NOT say "I have a good understanding...". Instead ask their coverage preference.

3. GROUNDING (WHYINSURED DATA):
   - Available Insurers in database:
     • HDFC ERGO: Optima Secure+ (2X instant Day 1 coverage, Unlimited Automatic Restore, Protect Plus consumables) & Energy Plan (Day 1 Diabetes/BP cover).
     • Aditya Birla: Activ One (Up to 100% HealthReturns™ cashback on active lifestyle, Day 1 Chronic Management for BP/Diabetes/Asthma, 100% Super Reload).
     • Care Health: Care Supreme (Up to 500% Cumulative Bonus booster, Unlimited Automatic Recharge).
     • Niva Bupa: ReAssure 2.0 (Lock the Clock entry age premium until 1st claim, perpetual ReAssure+ unlimited recharge).
     • Star Health: Star Comprehensive (Day 1 maternity & newborn child cover, automatic 100% basic recharge).
     • ICICI Lombard: Elevate (Infinite Reset benefit).
     • Tata AIG: MediCare Select (100% Cumulative Bonus without reduction on claim).
   - NEVER invent fake features or copy one company's features into another.

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

  // Extract previous conversation context (supports both {sender, text} and {role, content})
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
      reply: "I can help you with insurance guidance, but WHYINSURED currently focuses on health insurance. I can help you understand health insurance, compare health plans, or find a plan based on your requirements.",
      suggestions: []
    };
  }

  // General Non-Insurance queries (weather, recipes, coding, etc.)
  const isNonInsurance = (
    lowerCurrent.includes('weather') || lowerCurrent.includes('temperature') ||
    lowerCurrent.includes('cricket score') || lowerCurrent.includes('recipe') ||
    lowerCurrent.includes('who are you') && !lowerCurrent.includes('advisor')
  );

  if (isNonInsurance) {
    return {
      intent: 'GENERAL_NON_INSURANCE',
      domain: 'GENERAL_NON_INSURANCE',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "I'm focused on health insurance here, so I can help you with health-insurance questions, understanding benefits, and finding or comparing plans.",
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
  // 1. INTENT: REQUIREMENT_RESET (User starts over or changes completely)
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
      reply: "Hi! 👋 Nice to meet you. I'm your WHYINSURED Advisor. What kind of health insurance are you looking for?",
      suggestions: []
    };
  }

  // =========================================================================
  // 3. INTENT: GENERAL_HEALTH_INSURANCE_QUESTION (Educational Q&A)
  // =========================================================================

  // A. General Health Insurance Overview ("tell about health insurance", "what is health insurance", "how does health insurance work")
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

  // B. Sum Insured ("what is sum insured", "sum insured kya hai")
  if (lowerCurrent.includes('what is sum insured') || lowerCurrent.includes('sum insured kya') || lowerCurrent.includes('sum insured means')) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Sum Insured** is the maximum total amount your insurance company will pay towards your covered hospitalization and medical bills in a single policy year. Any expenses exceeding your sum insured must be paid out of pocket, unless your policy has automatic restoration or super top-up benefits.",
      suggestions: []
    };
  }

  // C. Coverage Amount & Sizing ("how much health insurance should i take", "how much coverage", "is 10 lakh enough", "difference between 10 lakh and 20 lakh")
  if (
    lowerCurrent.includes('how much') && (lowerCurrent.includes('coverage') || lowerCurrent.includes('health insurance') || lowerCurrent.includes('sum insured') || lowerCurrent.includes('take') || lowerCurrent.includes('need')) ||
    lowerCurrent.includes('is 10 lakh enough') || lowerCurrent.includes('is 10l enough') || lowerCurrent.includes('is 20 lakh enough') ||
    lowerCurrent.includes('difference between 10 lakh and 20 lakh') || lowerCurrent.includes('difference between 10l and 20l')
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Choosing the right coverage amount depends on several important factors:\n• **Family Size & Ages**: For parents or older family members, ₹20 Lakh to ₹50 Lakh is recommended due to higher treatment costs.\n• **City & Medical Costs**: In Tier-1 metro cities, critical hospitalizations often cost ₹10–15 Lakh+, making ₹20 Lakh+ ideal. For Tier-2/3 cities, ₹10–15 Lakh is a reliable baseline.\n• **Medical Inflation**: Hospitalization costs in India rise roughly 10–14% each year.\n\nIf you tell me who you are buying insurance for and your approximate budget, I can help you figure out a suitable coverage range!",
      suggestions: []
    };
  }

  // D. Restoration ("what is restoration", "unlimited restoration mean")
  if (
    lowerCurrent.includes('what is restoration') || lowerCurrent.includes('restoration kya') || 
    lowerCurrent.includes('explain restoration') || lowerCurrent.includes('restoration means') ||
    lowerCurrent.includes('what does restoration mean') || lowerCurrent.includes('unlimited restoration mean')
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Restoration benefit** automatically refills 100% of your sum insured if it gets exhausted by medical claims in a policy year, so you and your family are never left unprotected for subsequent hospitalizations.\n\nMany modern policies (such as HDFC Optima Secure+ and Niva Bupa ReAssure 2.0) offer **Unlimited Restoration** for both same and unrelated illnesses.",
      suggestions: []
    };
  }

  // E. Room Rent & Room Category ("what is room rent", "why is room category important", "what is single private room")
  if (
    lowerCurrent.includes('what is room rent') || lowerCurrent.includes('room rent kya') || lowerCurrent.includes('room rent capping') ||
    lowerCurrent.includes('why is room category important') || lowerCurrent.includes('what is single private room')
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Room rent capping** limits how much the insurer pays for your hospital room per day (e.g. 1% of sum insured). If you choose a room above the allowed category, proportionate deductions are applied to your entire hospital bill.\n\nChoosing a policy with **Single Private Room eligibility or No Room Rent Capping** (such as HDFC Optima Secure+, Aditya Birla Activ One, or Care Supreme) ensures full freedom of room selection without out-of-pocket penalties.",
      suggestions: []
    };
  }

  // F. Waiting Period ("what is waiting period", "waiting period kya hai")
  if (lowerCurrent.includes('what is waiting period') || lowerCurrent.includes('waiting period kya') || lowerCurrent.includes('explain waiting period')) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "A **waiting period** is the duration during which specific illnesses or pre-existing conditions are not covered after your policy begins:\n• **Initial Waiting Period**: First 30 days (except accidental hospitalization).\n• **Specific Diseases**: 12 to 24 months for specified treatments (e.g. hernia, cataract, joint replacement).\n• **Pre-Existing Diseases (PED)**: Standard 24 to 36 months before declared pre-existing conditions are covered.",
      suggestions: []
    };
  }

  // G. Deductible & Co-payment ("what is deductible", "what is co-payment", "what is copay")
  if (lowerCurrent.includes('what is deductible') || lowerCurrent.includes('what is co-payment') || lowerCurrent.includes('what is copay') || lowerCurrent.includes('copay kya') || lowerCurrent.includes('deductible kya')) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "• **Co-payment (Copay)**: A fixed percentage (e.g. 10% or 20%) of the total hospital bill that you agree to pay from your pocket, while the insurer pays the remainder.\n• **Deductible**: A pre-agreed fixed threshold (e.g. ₹50,000) you must pay towards hospital bills before your policy coverage starts paying.\n\nMost premium retail health plans on WHYINSURED offer **0% mandatory copay** for standard age groups.",
      suggestions: []
    };
  }

  // H. Cashless Treatment, Reimbursement & Network Hospitals
  if (
    lowerCurrent.includes('cashless treatment') || lowerCurrent.includes('what is cashless') ||
    lowerCurrent.includes('what is reimbursement') || lowerCurrent.includes('network hospital') ||
    lowerCurrent.includes('cashless kya')
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "• **Cashless Treatment**: When hospitalized at a network hospital, the insurer directly settles the approved bill with the hospital, so you don't have to arrange large amounts of cash.\n• **Reimbursement**: If admitted to a non-network hospital, you settle the bills initially and submit claim documents/receipts to the insurer for reimbursement.\n• **Network Hospital**: A hospital that has an official tie-up with the insurance company for cashless claim settlement.",
      suggestions: []
    };
  }

  // I. Pre and Post Hospitalization
  if (lowerCurrent.includes('pre-hospitalization') || lowerCurrent.includes('post-hospitalization') || lowerCurrent.includes('pre and post')) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "• **Pre-Hospitalization**: Medical expenses incurred before admission (doctor consultations, diagnostic tests, blood tests, radiology), typically covered for **60 days** before hospitalization.\n• **Post-Hospitalization**: Recovery and follow-up expenses after discharge (consultations, medications, recovery therapy), typically covered for **90 to 180 days** after discharge.",
      suggestions: []
    };
  }

  // J. Day-Care Treatment ("what is day-care", "what is daycare")
  if (lowerCurrent.includes('day-care') || lowerCurrent.includes('day care') || lowerCurrent.includes('daycare')) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Day-care treatments** are medical procedures, surgeries, or therapies that require hospital admission but are completed in less than 24 hours due to advanced medical technology (e.g. cataract surgery, chemotherapy, radiotherapy, dialysis, tonsillectomy). Modern comprehensive health plans cover all daycare treatments up to the full sum insured.",
      suggestions: []
    };
  }

  // K. No-Claim Bonus / Cumulative Bonus ("what is no claim bonus", "what is ncb", "what is cumulative bonus")
  if (lowerCurrent.includes('no-claim bonus') || lowerCurrent.includes('no claim bonus') || lowerCurrent.includes('cumulative bonus') || lowerCurrent.includes('ncb kya')) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**No-Claim Bonus (NCB)** or **Cumulative Bonus** is a reward provided by the insurer for every claim-free policy year. It automatically increases your base Sum Insured (typically 10% to 50% per claim-free year, up to 500% in plans like Care Supreme) without any extra premium cost.",
      suggestions: []
    };
  }

  // L. What to check before buying health insurance ("what should i check before buying", "things to check")
  if (
    lowerCurrent.includes('check before buying') || lowerCurrent.includes('things to check') ||
    lowerCurrent.includes('what to check') || lowerCurrent.includes('how to choose health insurance')
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Here are the top things you should always verify before buying health insurance:\n1. **Room Rent Capping**: Ensure there is no sub-limit on hospital room categories.\n2. **Waiting Period**: Look for shorter waiting periods (24 months or less) on pre-existing conditions.\n3. **Restoration Benefit**: Confirm 100% automatic reload for both same and unrelated illnesses.\n4. **No Mandatory Copay**: Avoid policies with mandatory copayments.\n5. **Consumables Cover**: Ensure non-medical items (gloves, syringes, masks) are covered 100%.\n6. **Cashless Hospital Network**: Check hospital network coverage in your city.",
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
      requirements: extractRequirementsFromText(allText, lowerCurrent),
      reply: "Here is how **HDFC ERGO Optima Secure+** compares with **Aditya Birla Activ One**:\n• **Instant Cover vs Wellness**: HDFC gives **2X Instant Coverage on Day 1** (doubles base sum insured); Aditya Birla offers **Up to 100% HealthReturns™ cashback** on an active healthy lifestyle.\n• **Chronic Illnesses**: Aditya Birla covers chronic conditions (Diabetes, BP, Asthma, Cholesterol) from **Day 1** under Chronic Care Management; HDFC Optima Secure+ has a standard 24-month PED waiting period.\n• **Restoration**: Both offer unlimited / super reload restoration benefits and zero room-rent capping.",
      suggestions: []
    };
  }

  // B. Aditya Birla Inquiry / Preference ("I want Aditya Birla", "sry i want plan in aditya birla", "aditya birla chahiye", "what about aditya birla")
  if (lowerCurrent.includes('aditya birla') || lowerCurrent.includes('aditya') || lowerCurrent.includes('birla')) {
    const updatedReqs = extractRequirementsFromText(allText, lowerCurrent);
    updatedReqs.preferredInsurer = 'aditya-birla';

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
      reply: "Absolutely 👍 We can focus on Aditya Birla plans (such as Activ One with 100% HealthReturns™ and Chronic Care). What coverage are you considering — around ₹10 lakh, ₹20 lakh, ₹50 lakh, or something else?",
      suggestions: []
    };
  }

  // C. Star Health Inquiry / Ambiguous query ("star me koi plan hai", "what plans does star have?")
  if (lowerCurrent.includes('star me koi plan') || lowerCurrent.includes('star me plan hai') || lowerCurrent.includes('star health plan') || (lowerCurrent.includes('star') && lowerCurrent.includes('plan'))) {
    const updatedReqs = extractRequirementsFromText(allText, lowerCurrent);
    return {
      intent: 'PLAN_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: updatedReqs,
      reply: "Yes! Star Health offers **Star Comprehensive**, which includes:\n• **Day 1 Maternity & Newborn Baby cover**\n• **Automatic 100% Basic Sum Insured Recharge**\n• **Single Private Room eligibility** with no sub-limits on standard treatments.\n\nWould you like to include Star Comprehensive in your comparison?",
      suggestions: []
    };
  }

  // D. HDFC Inquiry ("what is HDFC Optima Secure+?", "tell me about hdfc", "hdfc kaisa hai")
  if (
    lowerCurrent.includes('hdfc wala') || lowerCurrent.includes('hdfc kaisa') ||
    lowerCurrent.includes('what is hdfc') || lowerCurrent.includes('optima secure') ||
    (lowerCurrent.includes('hdfc') && (lowerCurrent.includes('about') || lowerCurrent.includes('features') || lowerCurrent.includes('plan')))
  ) {
    const updatedReqs = extractRequirementsFromText(allText, lowerCurrent);
    return {
      intent: 'PLAN_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: updatedReqs,
      reply: "**HDFC ERGO Optima Secure+** is a top-tier comprehensive plan. Key advantages:\n• **2X Instant Coverage on Day 1**: Automatically doubles base cover via Secure Benefit.\n• **Unlimited Automatic Restore**: 100% reload for same and unrelated illnesses.\n• **Protect Plus Rider**: 100% cashless payment on non-medical hospital consumables.\n• **Zero Room Rent Capping**: Freedom to choose any hospital room category.",
      suggestions: []
    };
  }

  // E. HDFC Unlimited Restoration ("does HDFC have unlimited restoration?", "is hdfc plan me restoration hai")
  if (lowerCurrent.includes('hdfc') && (lowerCurrent.includes('restoration') || lowerCurrent.includes('restore') || lowerCurrent.includes('recharge'))) {
    const updatedReqs = extractRequirementsFromText(allText, lowerCurrent);
    return {
      intent: 'PLAN_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: updatedReqs,
      reply: "Yes! **HDFC ERGO Optima Secure+** features **Unlimited Automatic Restore**. If your sum insured is exhausted during hospitalization, it automatically refills 100% of your base cover for subsequent claims in the policy year.",
      suggestions: []
    };
  }

  // F. Removal of Company ("remove Star", "Star wala hata do")
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
    const updatedReqs = extractRequirementsFromText(allText, lowerCurrent);

    return {
      intent: 'REMOVE_RECOMMENDATION',
      conversationStage: 'showing_recommendations',
      showPlans: true,
      excludeCompanies: [excludeCompany],
      requirements: updatedReqs,
      reply: `Understood! I've removed ${companyName} from your options. Here are the remaining top recommendations matching your requirements:`,
      suggestions: []
    };
  }

  // G. Comparison / Best for Parents ("which one is best for my parents?", "which is best")
  if (lowerCurrent.includes('which one is best') || lowerCurrent.includes('which is best') || lowerCurrent.includes('which is better')) {
    const updatedReqs = extractRequirementsFromText(allText, lowerCurrent);
    return {
      intent: 'COMPARISON_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: updatedReqs,
      reply: `Based on your requirements:\n• **HDFC ERGO Optima Secure+** is the strongest overall choice due to 2X Day 1 coverage and unlimited restoration without room-rent capping.\n• **Aditya Birla Activ One** is ideal for active lifestyle cashback (HealthReturns™) and Day 1 Chronic Care.\n• **Care Supreme** is best if you value aggressive bonus growth (up to 500% booster).`,
      suggestions: []
    };
  }

  // H. Show Another Option ("show another option", "aur option dikhao")
  if (lowerCurrent.includes('another plan') || lowerCurrent.includes('another option') || lowerCurrent.includes('aur option') || lowerCurrent.includes('aur plan')) {
    const updatedReqs = extractRequirementsFromText(allText, lowerCurrent);
    return {
      intent: 'NEW_OPTION_REQUEST',
      conversationStage: 'showing_recommendations',
      showPlans: true,
      requirements: updatedReqs,
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
      reply: "Perfect! Based on your requirements, here are the plans that best match:",
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
      reply: "Awesome! 😊 I can help you find the right health plan for yourself. How much coverage are you looking for — for example ₹10 Lakh, ₹20 Lakh, or ₹50 Lakh?",
      suggestions: []
    };
  }

  // User just corrected/updated relationship: "for my parents" / "for my aents"
  if (lowerCurrent.includes('parent') || lowerCurrent.includes('father') || lowerCurrent.includes('mother')) {
    accumulatedReqs.relationship = 'parents';
    if (!accumulatedReqs.ages || (Array.isArray(accumulatedReqs.ages) && accumulatedReqs.ages.length === 0)) {
      return {
        intent: 'REQUIREMENT_UPDATE',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Got it! We'll focus on insurance for your parents. What are their ages?",
        suggestions: []
      };
    }
  }

  // User provided ages (e.g. "father 45 mother 39") but coverage is missing
  if (accumulatedReqs.ages && !accumulatedReqs.coverage) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Got it. What coverage are you looking for — around ₹10 lakh, ₹20 lakh, ₹50 lakh, or something else?",
      suggestions: []
    };
  }

  // Changing preferred insurer (e.g. "actually I want Star", "star chahiye")
  if (lowerCurrent.includes('actually') && lowerCurrent.includes('star')) {
    accumulatedReqs.preferredInsurer = 'star-health';
    return {
      intent: 'COMPANY_PREFERENCE',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Understood 👍 We'll focus on Star Health plans instead. Would you like me to show you the matching Star Health options?",
      suggestions: []
    };
  }

  // User mentions room preference (e.g. "single private room", "private room", "single room")
  if (
    lowerCurrent.includes('single private') || lowerCurrent.includes('private room') ||
    lowerCurrent.includes('single room') || lowerCurrent.includes('room category') ||
    lowerCurrent.includes('room rent')
  ) {
    accumulatedReqs.roomCategory = 'Single Private Room';
    accumulatedReqs.roomPreference = 'Single Private Room';
    if (!accumulatedReqs.priorities.includes('single_private_room')) {
      accumulatedReqs.priorities.push('single_private_room');
    }

    const previouslyMentionedRoom = pastUserTexts.some(t => 
      t.includes('single private') || t.includes('private room') || t.includes('single room')
    );

    if (previouslyMentionedRoom) {
      return {
        intent: 'REQUIREMENT_UPDATE',
        conversationStage: 'awaiting_plan_confirmation',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Got it! I already have Single Private Room noted in your preferences. Would you like me to show you the plans that best match your requirements?",
        suggestions: []
      };
    }

    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Got it 👍 I’ll prioritize plans that offer a Single Private Room. Would you like me to show you the plans that best match your requirements?",
      suggestions: []
    };
  }

  // User provided coverage (e.g. "20 lakh") but features are not yet collected
  if (accumulatedReqs.coverage && accumulatedReqs.priorities.length === 0 && !accumulatedReqs.roomCategory && !accumulatedReqs.preferredInsurer) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Got it 👍 Is there anything especially important to you, such as a lower waiting period, room flexibility, restoration, or comprehensive benefits?",
      suggestions: []
    };
  }

  // User responded "sab add ons hone chahiye"
  if (lowerCurrent.includes('sab add ons') || lowerCurrent.includes('all add-ons') || lowerCurrent.includes('saare benefits')) {
    accumulatedReqs.priorities.push('comprehensive_addons');
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Understood 👍 You'd prefer a plan with comprehensive benefits. I'll compare the actual benefits available in our policies rather than assuming every add-on is included.\n\nWould you like me to show you the plans that best match what you've told me?",
      suggestions: []
    };
  }

  // Fallback: Acknowledge & offer to show plans if meaningful requirements exist
  if (accumulatedReqs.relationship && accumulatedReqs.coverage) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: `Got it! I have recorded your requirements for ${accumulatedReqs.relationship === 'parents' ? 'your parents' : 'yourself'} with ₹${accumulatedReqs.coverage} lakh coverage. Would you like me to show you the matching plans?`,
      suggestions: []
    };
  }

  // Generic natural response
  return {
    intent: 'REQUIREMENT_UPDATE',
    conversationStage: 'collecting_requirements',
    showPlans: false,
    requirements: accumulatedReqs,
    reply: "Got it! Tell me more about what you're looking for, or ask me any question about our health plans.",
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

  // Active message insurer override (e.g. "actually I want Star", "star chahiye")
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

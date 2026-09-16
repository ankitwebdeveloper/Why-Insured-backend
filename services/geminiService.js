/**
 * geminiService.js
 * 
 * Production-grade Gemini AI Personal Insurance Advisor for WHYINSURED.
 * Open-ended conversational intelligence:
 *   - Classifies user intent per message (GREETING, EDUCATIONAL_QUESTION, BENEFIT_EXPLANATION, 
 *     GENERAL_HEALTH_INSURANCE_QUESTION, REQUIREMENT_UPDATE, FOLLOW_UP_ANSWER, 
 *     RECOMMENDATION_REQUEST, SHOW_RECOMMENDATIONS, PLAN_QUERY, COMPARISON_QUERY, 
 *     REMOVE_RECOMMENDATION, NEW_OPTION_REQUEST, REQUIREMENT_RESET, UNSUPPORTED_DOMAIN, 
 *     GENERAL_NON_INSURANCE)
 *   - Answers educational questions directly and thoroughly without demanding requirements.
 *   - Collects missing requirements progressively and accumulates state across turns.
 *   - Recommends policies ONLY upon explicit user request.
 *   - Grounded strictly in verified WHYINSURED policy catalog.
 */

import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.6-flash';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deterministic intent guard for critical educational, benefit, general, and greeting queries.
 * Returns the intent string if clearly identifiable, otherwise null.
 * 
 * @param {string} userMessage
 * @returns {string|null}
 */
export function getDeterministicIntentOverride(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return null;
  const raw = userMessage.trim();
  if (!raw) return null;

  let lower = raw.toLowerCase()
    .replace(/[?!.,;:_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Requirement & recommendation queries
  const isRequirementQuery = (
    lower === 'i need a health plan' ||
    lower === 'i need health insurance' ||
    lower === 'i need insurance' ||
    lower === 'i want a health plan' ||
    lower === 'i want health insurance' ||
    lower.includes('need health insurance') ||
    lower.includes('need a health plan') ||
    lower.includes('want a health plan') ||
    lower.includes('want health insurance') ||
    lower.includes('looking for health insurance') ||
    lower.includes('looking for a health plan') ||
    lower.includes('looking for a plan') ||
    lower.includes('show me a suitable plan') ||
    lower.includes('recommend a health plan') ||
    lower.includes('help me find a health plan') ||
    lower.includes('help me find a plan') ||
    lower.includes('need insurance') ||
    lower.includes('want insurance') ||
    lower.includes('insurance chahiye') ||
    lower.includes('plan chahiye') ||
    lower.includes('for myself') ||
    lower.includes('for my parents') ||
    lower === 'myself' ||
    lower === 'my self' ||
    lower === 'me' ||
    lower === 'parents' ||
    lower === 'my parents'
  );

  // 2. Pure Greeting Check (e.g. "hlo", "hi", "hello", "hey")
  const isGreetingWord = /^(hi|hii|hiii|hello|helo|hlo|hlw|hey|hy|namaste|namaskar|good\s*morning|good\s*afternoon|good\s*evening|wassup|hola)\b/i.test(lower);
  if (isGreetingWord) {
    const wordCount = lower.split(/\s+/).length;
    if (wordCount <= 3 && !isRequirementQuery && !lower.includes('need') && !lower.includes('want') && !lower.includes('plan') && !lower.includes('insurance')) {
      return 'GREETING';
    }
    if (isRequirementQuery || lower.includes('need') || lower.includes('want') || lower.includes('plan') || lower.includes('insurance')) {
      return 'REQUIREMENT_UPDATE';
    }
  }

  // 3. General Best Company Query ("Give me best health insurance company")
  const isGeneralBestCompanyQuery = (
    lower.includes('best health insurance company') ||
    lower.includes('best insurance company') ||
    lower.includes('best health insurance provider') ||
    lower.includes('best insurer') ||
    lower.includes('top health insurance company') ||
    lower.includes('top insurance company') ||
    lower.includes('which insurance company is best') ||
    lower.includes('which company is best') ||
    lower.includes('best company for health insurance') ||
    (lower.includes('best health insurance') && lower.includes('company'))
  );

  if (isGeneralBestCompanyQuery) {
    return 'COMPARISON_QUERY';
  }

  // 4. Show Plans / Recommendations request
  const isShowPlanRequest = (
    lower === 'show the plan' ||
    lower === 'show the plans' ||
    lower === 'show plan' ||
    lower === 'show plans' ||
    lower === 'show matching plans' ||
    lower === 'show me plans' ||
    lower === 'show me the plan' ||
    lower.includes('show me tata aig plan') ||
    lower.includes('show tata aig plan')
  );

  if (isShowPlanRequest) {
    return 'SHOW_RECOMMENDATIONS';
  }

  if (isRequirementQuery) {
    return 'REQUIREMENT_UPDATE';
  }

  // 5. Educational Questions (Why Health Insurance is Important / Need)
  if (
    lower.includes('why health insurance') ||
    lower.includes('why is health insurance') ||
    lower.includes('why do i need') ||
    lower.includes('why should i buy') ||
    lower.includes('why insurance is important') ||
    lower.includes('importance of health insurance') ||
    lower.includes('importance of insurance') ||
    lower.includes('health insurance importance') ||
    lower.includes('need of health insurance') ||
    lower.includes('why medical insurance') ||
    lower.includes('do i really need') ||
    lower.includes('kyun zaroori') ||
    lower.includes('kyu zaroori') ||
    lower.includes('kyun chahiye') ||
    lower.includes('kyu chahiye') ||
    lower.includes('benefits of health insurance') ||
    lower.includes('health insurance benefits') ||
    lower.includes('benefit of having health insurance') ||
    lower.includes('ke fayde')
  ) {
    return 'EDUCATIONAL_QUESTION';
  }

  // 6. General Health Insurance Questions (What is Health Insurance / How it works)
  if (
    lower.startsWith('what is health insurance') ||
    lower.startsWith('what is medical insurance') ||
    lower.startsWith('explain health insurance') ||
    lower.startsWith('how does health insurance work') ||
    lower.includes('health insurance kya hai') ||
    lower.includes('health insurance kya hota') ||
    lower.startsWith('tell me about health insurance')
  ) {
    return 'GENERAL_HEALTH_INSURANCE_QUESTION';
  }

  // 7. Benefit Explanation Questions (Restoration, Waiting Period, Room Rent, etc.)
  const benefitTerms = [
    'restoration', 'recharge', 'waiting period', 'waiting periods', 'room rent', 'room category',
    'sum insured', 'copay', 'co-payment', 'co payment', 'deductible', 'cashless', 'reimbursement',
    'network hospital', 'network hospitals', 'ncb', 'no claim bonus', 'cumulative bonus',
    'consumables', 'pre-hospitalization', 'pre hospitalization', 'post-hospitalization',
    'post hospitalization', 'daycare', 'day-care', 'day care', 'ped'
  ];

  const isExploratoryOrTerm = (
    benefitTerms.includes(lower) ||
    lower.startsWith('what is ') || lower.startsWith('what are ') ||
    lower.startsWith('explain ') || lower.startsWith('meaning of ') ||
    lower.startsWith('how does ') || lower.startsWith('tell me about ') ||
    lower.includes(' kya hai') || lower.includes(' kya hota') ||
    lower.includes(' benefit') || lower.includes(' clause')
  );

  if (isExploratoryOrTerm) {
    for (const term of benefitTerms) {
      if (lower === term || lower.includes(term)) {
        if (!lower.startsWith('i want') && !lower.startsWith('i need') && !lower.startsWith('only ')) {
          return 'BENEFIT_EXPLANATION';
        }
      }
    }
  }

  return null;
}

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
    const defaultGreeting = {
      intent: 'GREETING',
      conversationStage: 'greeting',
      showPlans: false,
      requirements: {},
      reply: "Hi! 👋 I'm your WHYINSURED Advisor. Think of me as your insurance friend — you can ask me anything about health insurance, or tell me what kind of plan you're looking for.",
      suggestions: []
    };

    console.log('[AI Chat] User message:', userMessage);
    console.log('[AI Chat] Deterministic intent override:', null);
    console.log('[AI Chat] Detected intent:', defaultGreeting.intent);
    console.log('[AI Chat] Previous requirements:', {});
    console.log('[AI Chat] Extracted requirements:', {});
    console.log('[AI Chat] Merged requirements:', {});
    console.log('[AI Chat] showPlans:', false);

    return defaultGreeting;
  }

  // 1. Extract previous requirements from conversation history
  const previousReqs = extractRequirementsFromHistory(conversationHistory);

  // 2. Format conversation history for multi-turn context
  const recentHistory = (conversationHistory || [])
    .filter(m => (m.text || m.content) && !(m.text || m.content).includes('Think of me as your insurance friend'))
    .slice(-14)
    .map(m => `${(m.sender === 'user' || m.role === 'user') ? 'User' : 'Advisor'}: ${m.text || m.content}`)
    .join('\n');

  let finalResult = null;

  // 3. Detect deterministic critical intent override
  const deterministicIntent = getDeterministicIntentOverride(userMessage);

  if (deterministicIntent) {
    // For clear deterministic intents, use fallbackSemanticAdvisor directly and do NOT trust Gemini classification
    finalResult = fallbackSemanticAdvisor(userMessage, conversationHistory, previousReqs);
  } else if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== 'your_api_key_here' && GEMINI_API_KEY.trim() !== '') {
    // 4. Try Gemini API if key is available
    try {
      const geminiResult = await callGeminiApiWithRetry(userMessage, recentHistory, availablePoliciesSummary, 2);
      if (geminiResult && geminiResult.intent && geminiResult.reply) {
        finalResult = geminiResult;
      }
    } catch (apiError) {
      console.warn('[Gemini Service] Handled API error (using built-in semantic advisor):', apiError.message);
    }
  }

  // 5. Fallback to resilient semantic personal advisor engine if Gemini failed or returned empty
  if (!finalResult) {
    finalResult = fallbackSemanticAdvisor(userMessage, conversationHistory, previousReqs);
  }

  // 6. Ensure multi-turn requirement state accumulation
  const currentExtractedReqs = extractRequirementsFromText(userMessage, userMessage.toLowerCase());
  const mergedReqs = mergeRequirements(previousReqs, finalResult.requirements || currentExtractedReqs, userMessage);
  finalResult.requirements = mergedReqs;

  // 7. Server-side debug logging
  console.log('[AI Chat] User message:', userMessage);
  console.log('[AI Chat] Deterministic intent override:', deterministicIntent);
  console.log('[AI Chat] Detected intent:', finalResult.intent);
  console.log('[AI Chat] Previous requirements:', previousReqs);
  console.log('[AI Chat] Extracted requirements:', currentExtractedReqs);
  console.log('[AI Chat] Merged requirements:', mergedReqs);
  console.log('[AI Chat] showPlans:', Boolean(finalResult.showPlans));

  return finalResult;
}

/**
 * Call Gemini REST API with flexible open-ended persona and intent reasoning
 */
async function callGeminiApiWithRetry(userMessage, recentHistory, availablePoliciesSummary, maxAttempts = 2) {
  const systemPrompt = `You are the WHYINSURED Personal Health Insurance Advisor — a warm, friendly, real conversational insurance expert.
You speak in a simple, friendly, conversational tone (English or natural Hinglish matching the user).

INTENT CLASSIFICATION (Classify accurately):
- GREETING: User says hello/hi/hlo/hey.
- EDUCATIONAL_QUESTION: User asks why health insurance is important, why they need it, or its importance.
- BENEFIT_EXPLANATION: User asks about specific terms (restoration, room rent, waiting period, copay, deductible, NCB, cashless, consumables).
- GENERAL_HEALTH_INSURANCE_QUESTION: User asks what health insurance is or how it works.
- REQUIREMENT_UPDATE: User shares or initiates requirements (e.g. "I need health insurance", "for myself", "for my parents").
- FOLLOW_UP_ANSWER: User provides a short contextual answer (e.g. "20 lakh", "private room", "father 45 mother 36", "only Tata AIG") to a previous question.
- RECOMMENDATION_REQUEST / SHOW_RECOMMENDATIONS: User asks to see, recommend, or compare plans (e.g. "Which health insurance should I take?", "show me plans", "show me tata aig plan").
- COMPARISON_QUERY: User asks to compare specific insurers/plans.
- PLAN_QUERY: User asks informational questions about a specific policy/insurer.
- REMOVE_RECOMMENDATION: User asks to exclude a specific insurer.
- REQUIREMENT_RESET: User asks to restart/reset requirements.
- UNSUPPORTED_DOMAIN: User asks about motor/life/travel/bike insurance.

CRITICAL CONVERSATIONAL PRINCIPLES:
1. NO REPETITIVE "GOT IT" ACKNOWLEDGEMENTS:
   - NEVER start every message with "Got it" or repeat robotic acknowledgements.
   - Use natural phrasing: "Sure!", "Understood.", "Noted.", or answer the question directly.

2. ANSWER EDUCATIONAL & CONCEPT QUESTIONS DIRECTLY FIRST:
   - If user asks ANY educational or conceptual question (e.g., "why health insurance is important", "what is restoration?", "what is waiting period?", "what is room rent?", "what is sum insured?", "what is copay?"):
     * Directly explain the concept thoroughly in simple conversational language.
     * For "why health insurance is important": Explain protection of savings from large hospital bills, cashless treatment access, comprehensive coverage, predictability, and tax benefits.
     * Do NOT start a questionnaire or force requirement collection when the user is asking an educational question.

3. PROGRESSIVE REQUIREMENT COLLECTION:
   - When the user shares requirements (e.g. "I need health insurance"), ask who the plan is for (self, parents, family).
   - Once relationship is known ("for myself"), ask for coverage preference (e.g. ₹10 Lakh, ₹20 Lakh, ₹50 Lakh).
   - Once coverage is known ("20 lakh"), ask for room preference (Single Private Room) or company preference.
   - Once requirements are ready, ask if they would like to see matching plans.
   - NEVER repeat questions for information already provided.

4. MULTI-TURN REQUIREMENT PRESERVATION:
   - Always preserve and accumulate previously extracted requirements from Conversation History (relationship, ages, coverage, roomCategory, preferredInsurer, priorities).
   - New messages must update/merge into previously extracted requirements rather than replacing them.
   - Example: if user previously provided relationship: "self" and coverage: 20, and then says "only Tata AIG", output requirements must retain relationship: "self", coverage: 20, and set preferredInsurer: "Tata AIG".

5. RECOMMENDATIONS ONLY UPON EXPLICIT REQUEST:
   - Only set showPlans: true and intent: "SHOW_RECOMMENDATIONS" (or "RECOMMENDATION_REQUEST") when the user explicitly asks to see plans or specific company plans.
   - When user asks for plans from a specific company (e.g. "show me tata aig plan", "shoe me tata aig plan", "only Tata AIG"):
     * intent: "SHOW_RECOMMENDATIONS"
     * showPlans: true
     * requirements.preferredInsurer: Exact valid company name ("Tata AIG", "HDFC ERGO", "Star Health", "Niva Bupa", "Care Health", "ICICI Lombard", "Aditya Birla").

6. GROUNDING (WHYINSURED DATA):
   - Available Insurers: HDFC ERGO, Aditya Birla, Care Health, Niva Bupa, Star Health, ICICI Lombard, Tata AIG.

OUTPUT FORMAT: Return ONLY valid JSON:
{
  "intent": string,
  "conversationStage": "greeting" | "general_information" | "collecting_requirements" | "awaiting_plan_confirmation" | "showing_recommendations" | "recommendation_follow_up",
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
          await wait(1000);
          continue;
        } else {
          return null;
        }
      }

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsedJson = safelyParseGeminiJson(rawText);
      if (parsedJson) {
        return parsedJson;
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
  if (!rawText || typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();
  if (!trimmed) return null;

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
function fallbackSemanticAdvisor(userMessage, conversationHistory = [], previousReqs = {}) {
  const rawCurrent = (userMessage || '').trim();
  let lowerCurrent = rawCurrent.toLowerCase();

  // Normalize common broken/typo queries
  lowerCurrent = lowerCurrent
    .replace(/\b(aents|parnts|perents|parants)\b/g, 'parents')
    .replace(/\b(helath|healt|hlaeth)\b/g, 'health')
    .replace(/\b(inusrance|insurence|insurnace|insuranc|insurane)\b/g, 'insurance')
    .replace(/\b(moto\s*insurance|moter\s*insurance)\b/g, 'motor insurance')
    .replace(/\b(two\s*wheeler|2\s*wheeler|four\s*wheeler|4\s*wheeler|auto\s*insurance)\b/g, 'motor insurance')
    .replace(/\b(shoe|shw|sho|shoow)\b/g, 'show')
    .replace(/\bplanhai\b/g, 'plan hai');

  // Multi-turn requirement accumulation
  const currentExtracted = extractRequirementsFromText(rawCurrent, lowerCurrent);
  const accumulatedReqs = mergeRequirements(previousReqs, currentExtracted, rawCurrent);

  // Inspect last assistant prompt from history to interpret contextual follow-up answers
  const lastAdvisorMsg = [...(conversationHistory || [])]
    .reverse()
    .find(m => m.sender === 'ai' || m.sender === 'assistant' || m.role === 'assistant' || m.role === 'ai')?.text || '';
  const lastAdvisorLower = lastAdvisorMsg.toLowerCase();

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
  // 2. INTENT: GREETING (Initial or pure greeting including "hlo", "hi", "hey")
  // =========================================================================
  const isGreeting = (
    /^(hi|hii|hiii|hello|helo|hlo|hlw|hey|hy|namaste|namaskar|good\s*morning|good\s*afternoon|good\s*evening|wassup|hola)\b/i.test(lowerCurrent) &&
    lowerCurrent.split(/\s+/).length <= 3
  );

  if (isGreeting) {
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
  // 3. INTENT: EDUCATIONAL_QUESTION (Why Health Insurance is Important / Need)
  // =========================================================================
  const isWhyInsuranceImportant = (
    lowerCurrent.includes('why health insurance') || lowerCurrent.includes('why is health insurance') ||
    lowerCurrent.includes('why do i need') || lowerCurrent.includes('why should i buy') ||
    lowerCurrent.includes('why is medical insurance') || lowerCurrent.includes('do i really need') ||
    lowerCurrent.includes('why insurance is important') || lowerCurrent.includes('importance of health insurance') ||
    lowerCurrent.includes('importance of insurance') || lowerCurrent.includes('health insurance importance') ||
    lowerCurrent.includes('need of health insurance') || lowerCurrent.includes('why medical insurance') ||
    lowerCurrent.includes('kyun zaroori') || lowerCurrent.includes('kyu zaroori') ||
    lowerCurrent.includes('kyun chahiye') || lowerCurrent.includes('kyu chahiye') ||
    lowerCurrent.includes('ke fayde') || lowerCurrent.includes('benefit of having health insurance') ||
    lowerCurrent.includes('benefits of health insurance')
  );

  if (isWhyInsuranceImportant) {
    return {
      intent: 'EDUCATIONAL_QUESTION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Health insurance is essential for several key reasons:\n\n• **Protects Your Hard-Earned Savings**: Medical treatments and surgeries can easily cost lakhs. Insurance ensures a sudden illness doesn't drain your family savings.\n• **Access to Cashless Treatment**: In an emergency, network hospitals admit and treat you cashlessly without needing immediate cash arrangements.\n• **Covers Comprehensive Medical Costs**: Beyond room rent, it covers pre-hospitalization tests, doctor fees, ICU charges, surgeries, medicines, and post-discharge recovery.\n• **Financial Peace of Mind & Quality Care**: Gives you the freedom to choose top hospitals and experienced doctors without worrying about hospital bills.\n• **Tax Deductions (Section 80D)**: Premiums qualify for annual tax deductions up to ₹25,000 (and up to ₹50,000 for senior citizen parents).\n\nWhenever you're ready, I can explain specific concepts like restoration and room rent, or help you find the right health plan for your needs!",
      suggestions: []
    };
  }

  // =========================================================================
  // 4. INTENT: BENEFIT_EXPLANATION (Restoration, Waiting Period, Room Rent, etc.)
  // =========================================================================

  // A. Restoration / Recharge / Refill Question
  if (
    lowerCurrent.includes('what is restoration') || lowerCurrent.includes('restoration kya') ||
    lowerCurrent.includes('explain restoration') || lowerCurrent.includes('how does restoration') ||
    lowerCurrent.includes('what does restoration mean') || lowerCurrent.includes('unlimited restoration mean') ||
    lowerCurrent.includes('what is recharge') || lowerCurrent.includes('recharge benefit') ||
    lowerCurrent.includes('restoration benefit') || lowerCurrent === 'restoration'
  ) {
    return {
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
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
      intent: 'BENEFIT_EXPLANATION',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Hospital Consumables** are non-medical disposable supplies used during treatment (such as PPE kits, surgical gloves, syringes, cotton, and oxygen masks). In standard policies, these cost 10–15% of the bill and are paid out-of-pocket, but plans with Consumables Cover (like HDFC Optima Secure+ with Protect Benefit) pay for them 100%.",
      suggestions: []
    };
  }

  // =========================================================================
  // 5. INTENT: GENERAL_HEALTH_INSURANCE_QUESTION (Overview & Fundamentals)
  // =========================================================================
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
      reply: "Health insurance is a policy that helps cover eligible medical and hospitalization expenses according to the policy terms. You pay an annual premium, and the insurer covers hospital bills up to the sum insured limit.\n\nIn simple terms, it helps protect you and your family from sudden medical costs and provides access to cashless hospital care.\n\nIf you'd like, I can also explain how waiting periods, room rent, restoration benefits work, or help you understand how to choose the right coverage!",
      suggestions: []
    };
  }

  // =========================================================================
  // 6. INTENT: COMPARISONS, COMPANY QUERIES & EXCLUSIONS
  // =========================================================================

  // General Best Company Query ("Give me best health insurance company")
  const isGeneralBestCompanyQuery = (
    lowerCurrent.includes('best health insurance company') ||
    lowerCurrent.includes('best insurance company') ||
    lowerCurrent.includes('best health insurance provider') ||
    lowerCurrent.includes('best insurer') ||
    lowerCurrent.includes('top health insurance company') ||
    lowerCurrent.includes('top insurance company') ||
    lowerCurrent.includes('which insurance company is best') ||
    lowerCurrent.includes('which company is best') ||
    lowerCurrent.includes('best company for health insurance') ||
    (lowerCurrent.includes('best health insurance') && lowerCurrent.includes('company'))
  );

  if (isGeneralBestCompanyQuery) {
    accumulatedReqs.preferredInsurer = null;
    return {
      intent: 'COMPARISON_QUERY',
      conversationStage: accumulatedReqs.relationship ? 'collecting_requirements' : 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "In health insurance, no single company is objectively 'the best' for everyone, as the right choice depends on your specific priorities. Here are top matching insurers worth comparing:\n\n• **HDFC ERGO**: Known for high claim settlement reliability, 2X instant coverage (Secure Benefit), and zero room-rent capping.\n• **Tata AIG**: Strong network of cashless hospitals, high restoration limits, and comprehensive coverage.\n• **Aditya Birla**: Excellent for wellness rewards (up to 100% HealthReturns™) and Day 1 chronic condition management.\n• **Care Health**: High cumulative bonus multipliers and flexible sum insured options.\n\nWould you like me to show matching plans across these top insurers, or focus on a specific company?",
      suggestions: []
    };
  }
  
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
  // 7. INTENT: RECOMMENDATION_REQUEST & COMPANY PLAN REQUESTS
  // =========================================================================
  const isExplicitShowPlansRequest = (
    lowerCurrent === 'show the plan' || lowerCurrent === 'show the plans' ||
    lowerCurrent === 'show plan' || lowerCurrent === 'show plans' ||
    lowerCurrent === 'show matching plans' || lowerCurrent === 'show me plans' ||
    lowerCurrent === 'show me the plan' ||
    lowerCurrent.includes('show') || lowerCurrent.includes('dikha') || lowerCurrent.includes('dikhao') ||
    lowerCurrent.includes('recommend') || lowerCurrent.includes('options') || lowerCurrent.includes('which plan') ||
    lowerCurrent.includes('which health insurance') ||
    lowerCurrent.includes('kaunsa plan') || lowerCurrent === 'yes' || lowerCurrent === 'haan' ||
    lowerCurrent === 'yep' || lowerCurrent === 'sure' || lowerCurrent.includes('yes show') ||
    lowerCurrent.includes('show me') || lowerCurrent.includes('find best') || lowerCurrent.includes('suggest') ||
    (accumulatedReqs.preferredInsurer && (lowerCurrent.includes('plan') || lowerCurrent.includes('policy') || lowerCurrent.includes('want') || lowerCurrent.includes('details') || lowerCurrent.includes('only in') || lowerCurrent.includes('only')))
  );

  if (isExplicitShowPlansRequest && !isGeneralBestCompanyQuery) {
    const insurerName = accumulatedReqs.preferredInsurer;
    return {
      intent: 'SHOW_RECOMMENDATIONS',
      conversationStage: 'showing_recommendations',
      showPlans: true,
      requirements: accumulatedReqs,
      reply: insurerName
        ? `Here are the top ${insurerName} plan options matching your requirements:`
        : "Here are the top plans that best match your requirements:",
      suggestions: []
    };
  }

  // Aditya Birla Inquiry / Preference (Informational only)
  if (lowerCurrent.includes('aditya birla') || lowerCurrent.includes('aditya') || lowerCurrent.includes('birla')) {
    const updatedReqs = { ...accumulatedReqs, preferredInsurer: 'Aditya Birla' };

    if (lowerCurrent.includes('what about') || lowerCurrent.includes('tell me about') || lowerCurrent.includes('kaisa hai') || lowerCurrent.includes('me kya hai')) {
      return {
        intent: 'PLAN_QUERY',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: updatedReqs,
        reply: "**Aditya Birla Health Insurance** offers **Activ One**, which includes:\n• **Up to 100% HealthReturns™ cashback** for maintaining healthy physical activity\n• **Day 1 Chronic Care Management** covering BP, Diabetes, Asthma & High Cholesterol\n• **100% Super Reload** of sum insured for same and unrelated illnesses\n• **Zero room-rent sub-limits** across variants.\n\nWould you like me to show you the best Aditya Birla plans?",
        suggestions: []
      };
    }
  }

  // Star Health Inquiry (Informational only)
  if (lowerCurrent.includes('star me koi plan') || lowerCurrent.includes('star me plan hai') || lowerCurrent.includes('star health plan') || (lowerCurrent.includes('star') && lowerCurrent.includes('about'))) {
    return {
      intent: 'PLAN_QUERY',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Yes! Star Health offers **Star Comprehensive**, which includes:\n• **Day 1 Maternity & Newborn Baby cover**\n• **Automatic 100% Basic Sum Insured Recharge**\n• **Single Private Room eligibility** with no sub-limits on standard treatments.\n\nWould you like to see Star Comprehensive details?",
      suggestions: []
    };
  }

  // HDFC Inquiry (Informational only)
  if (
    lowerCurrent.includes('hdfc wala') || lowerCurrent.includes('hdfc kaisa') ||
    lowerCurrent.includes('what is hdfc') || lowerCurrent.includes('optima secure') ||
    (lowerCurrent.includes('hdfc') && (lowerCurrent.includes('about') || lowerCurrent.includes('features')))
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

  // =========================================================================
  // 8. INTENT: REQUIREMENT_UPDATE & FOLLOW_UP_ANSWER (Progressive Questions)
  // =========================================================================

  // User expresses general requirement intent (e.g. "I need a health plan", "I need health insurance")
  const isInitialRequirementIntent = (
    lowerCurrent === 'i need a health plan' ||
    lowerCurrent === 'i need health insurance' ||
    lowerCurrent === 'i need insurance' ||
    lowerCurrent === 'i want a health plan' ||
    lowerCurrent === 'i want health insurance' ||
    lowerCurrent === 'i need a plan' ||
    lowerCurrent === 'i want a policy' ||
    lowerCurrent === 'need insurance' ||
    lowerCurrent === 'health insurance chahiye' ||
    lowerCurrent === 'health plan chahiye' ||
    lowerCurrent.includes('looking for health insurance') ||
    lowerCurrent.includes('looking for a health plan') ||
    lowerCurrent.includes('show me a suitable plan') ||
    lowerCurrent.includes('recommend a health plan') ||
    lowerCurrent.includes('help me find a health plan') ||
    lowerCurrent.includes('help me find a plan')
  );

  if (isInitialRequirementIntent && !accumulatedReqs.relationship) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Absolutely! I can help you find a suitable health insurance plan. Who do you want to cover — yourself, spouse, children, parents, or family?",
      suggestions: []
    };
  }

  // User specifies "myself" / "for myself" / "me"
  if (
    lowerCurrent.includes('for me') || lowerCurrent.includes('for myself') ||
    lowerCurrent.includes('my self') || lowerCurrent.includes('myself') ||
    lowerCurrent === 'me' ||
    lowerCurrent.includes('plan for me') || lowerCurrent.includes('insurance for myself')
  ) {
    accumulatedReqs.relationship = 'self';
    if (!accumulatedReqs.coverage) {
      return {
        intent: 'REQUIREMENT_UPDATE',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "I can help you find the right health plan for yourself. What coverage amount are you looking for — for example ₹10 Lakh, ₹20 Lakh, or ₹50 Lakh?",
        suggestions: []
      };
    }
  }

  // User specifies "my parents" / "parents" / "for my parents"
  if (
    lowerCurrent.includes('parent') || lowerCurrent === 'parents' || lowerCurrent === 'my parents' ||
    (lowerCurrent.includes('father') && !lowerCurrent.match(/\d{2}/)) ||
    (lowerCurrent.includes('mother') && !lowerCurrent.match(/\d{2}/))
  ) {
    accumulatedReqs.relationship = 'parents';
    if (!accumulatedReqs.ages || (Array.isArray(accumulatedReqs.ages) && accumulatedReqs.ages.length === 0)) {
      let agePrompt = "Sure, I can help you with that! What are the ages of your parents?";
      if (accumulatedReqs.coverage && accumulatedReqs.roomCategory) {
        agePrompt = `Sure, I have noted ₹${accumulatedReqs.coverage} Lakh coverage and ${accumulatedReqs.roomCategory} for your parents. What are the ages of your parents?`;
      } else if (accumulatedReqs.coverage) {
        agePrompt = `Sure, I have noted ₹${accumulatedReqs.coverage} Lakh coverage for your parents. What are the ages of your parents?`;
      }
      return {
        intent: 'REQUIREMENT_UPDATE',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: agePrompt,
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
      intent: 'FOLLOW_UP_ANSWER',
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

    if (!accumulatedReqs.preferredInsurer) {
      return {
        intent: 'FOLLOW_UP_ANSWER',
        conversationStage: 'awaiting_plan_confirmation',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Noted — Single Private Room with zero sub-limits. Do you have a preferred insurer, or should I show matching plans?",
        suggestions: []
      };
    }
  }

  // User provided coverage (e.g. "20 lakh", "20 lakh coverage")
  const currentHasCoverage = lowerCurrent.match(/(\d+)\s*(lakh|lakhs|l|cr|crore|lac|lacs)/i) || lowerCurrent.includes('20 lakh') || lowerCurrent.includes('10 lakh') || lowerCurrent.includes('50 lakh');
  if (currentHasCoverage && accumulatedReqs.coverage) {
    if (!accumulatedReqs.roomCategory) {
      return {
        intent: 'FOLLOW_UP_ANSWER',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: `Noted — ₹${accumulatedReqs.coverage} Lakh coverage. Do you prefer a Single Private Room or have any room-category preference?`,
        suggestions: []
      };
    }
  }

  // Preferred insurer stated directly (e.g. "tata aig", "only in tata aig", "only tata aig", "hdfc", "star health")
  if (
    accumulatedReqs.preferredInsurer &&
    (lowerCurrent.includes('tata') || lowerCurrent.includes('hdfc') || lowerCurrent.includes('star') || lowerCurrent.includes('care') || lowerCurrent.includes('birla') || lowerCurrent.includes('niva') || lowerCurrent.includes('icici')) &&
    !isGeneralBestCompanyQuery
  ) {
    let relationSummary = 'for yourself';
    if (accumulatedReqs.relationship === 'parents') {
      if (accumulatedReqs.ages && typeof accumulatedReqs.ages === 'object' && accumulatedReqs.ages.father && accumulatedReqs.ages.mother) {
        relationSummary = `parents aged ${accumulatedReqs.ages.mother} and ${accumulatedReqs.ages.father}`;
      } else {
        relationSummary = 'your parents';
      }
    }

    return {
      intent: 'FOLLOW_UP_ANSWER',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: `Got it. I have ${accumulatedReqs.preferredInsurer}, ₹${accumulatedReqs.coverage || 20} lakh, ${relationSummary}, and ${accumulatedReqs.roomCategory || 'Single Private Room'}. Would you like me to show the matching plan?`,
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

  // Truly uninterpretable generic fallback
  return {
    intent: 'REQUIREMENT_UPDATE',
    conversationStage: 'collecting_requirements',
    showPlans: false,
    requirements: accumulatedReqs,
    reply: "I'm here to help! You can ask any question about health insurance benefits, or tell me who you want coverage for (such as yourself or parents).",
    suggestions: []
  };
}

/**
 * Extract requirements from conversation history
 */
function extractRequirementsFromHistory(conversationHistory = []) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return {};
  }

  const allTexts = conversationHistory
    .filter(m => (m.sender === 'user' || m.role === 'user'))
    .map(m => (m.text || m.content || '').trim());

  const joinedText = allTexts.join(' ');
  return extractRequirementsFromText(joinedText, joinedText.toLowerCase());
}

/**
 * Merge previous requirements with newly extracted requirements
 */
function mergeRequirements(prev = {}, current = {}, userMessage = '') {
  const merged = { ...prev };
  const lowerMsg = (userMessage || '').toLowerCase();

  // Reset if user requested start over
  if (
    lowerMsg.includes('forget everything') || lowerMsg.includes('forget previous') ||
    lowerMsg.includes('start again') || lowerMsg.includes('start over') ||
    lowerMsg.includes('reset search')
  ) {
    return current || {};
  }

  // If user is asking general best company query, reset preferredInsurer filter
  const isGeneralCompanyQuery = (
    lowerMsg.includes('best health insurance company') ||
    lowerMsg.includes('best insurance company') ||
    lowerMsg.includes('best health insurance provider') ||
    lowerMsg.includes('best insurer') ||
    lowerMsg.includes('top health insurance company') ||
    lowerMsg.includes('top insurance company') ||
    lowerMsg.includes('which insurance company is best') ||
    lowerMsg.includes('which company is best') ||
    lowerMsg.includes('best company for health insurance') ||
    (lowerMsg.includes('best health insurance') && lowerMsg.includes('company'))
  );

  if (isGeneralCompanyQuery) {
    merged.preferredInsurer = null;
  } else if (current.preferredInsurer) {
    merged.preferredInsurer = current.preferredInsurer;
  }

  if (current.relationship) merged.relationship = current.relationship;
  if (current.ages) merged.ages = current.ages;
  if (current.coverage) merged.coverage = current.coverage;
  if (current.roomCategory) {
    merged.roomCategory = current.roomCategory;
    merged.roomPreference = current.roomCategory;
  }

  // Merge priorities
  const combinedPriorities = Array.from(new Set([
    ...(prev.priorities || []),
    ...(current.priorities || [])
  ]));
  merged.priorities = combinedPriorities;

  // Merge pre-existing diseases
  const combinedDiseases = Array.from(new Set([
    ...(prev.preExistingDiseases || []),
    ...(current.preExistingDiseases || [])
  ]));
  merged.preExistingDiseases = combinedDiseases;

  return merged;
}

/**
 * Helper to extract requirements dynamically from conversation text
 */
function extractRequirementsFromText(allText, lowerCurrent) {
  let relationship = null;
  const lowerAll = (allText || '').toLowerCase();

  if (lowerAll.includes('parent') || lowerAll.includes('father') || lowerAll.includes('mother') || lowerAll.includes('pitaji') || lowerAll.includes('mataji')) {
    relationship = 'parents';
  } else if (lowerAll.includes('family') || lowerAll.includes('child') || lowerAll.includes('kid') || lowerAll.includes('spouse') || lowerAll.includes('wife')) {
    relationship = 'family';
  } else if (lowerAll.includes('myself') || lowerAll.includes('my self') || lowerAll.includes('for me') || lowerAll.includes('individual') || lowerAll.includes('single') || lowerAll === 'me') {
    relationship = 'self';
  }

  // Specific override if current message specifically changed relationship
  if (lowerCurrent.includes('parent') || lowerCurrent.includes('father') || lowerCurrent.includes('mother')) {
    relationship = 'parents';
  } else if (lowerCurrent.includes('for myself') || lowerCurrent.includes('my self') || lowerCurrent.includes('myself') || lowerCurrent.includes('for me') || lowerCurrent.includes('plan for me') || lowerCurrent === 'me') {
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
  } else if (lowerAll.includes('50 lakh') || lowerAll.includes('50l') || lowerAll.includes('50 lac')) {
    coverage = 50;
  } else if (lowerAll.includes('20 lakh') || lowerAll.includes('20l') || lowerAll.includes('20 lac')) {
    coverage = 20;
  } else if (lowerAll.includes('15l') || lowerAll.includes('15 lakh')) {
    coverage = 15;
  } else if (lowerAll.includes('10l') || lowerAll.includes('10 lakh')) {
    coverage = 10;
  } else if (lowerAll.includes('25l') || lowerAll.includes('25 lakh')) {
    coverage = 25;
  } else if (lowerAll.includes('1 cr') || lowerAll.includes('1 crore')) {
    coverage = 100;
  }

  let preferredInsurer = null;
  if (lowerAll.includes('aditya birla') || lowerAll.includes('aditya') || lowerAll.includes('birla')) {
    preferredInsurer = 'Aditya Birla';
  } else if (lowerAll.includes('hdfc')) {
    preferredInsurer = 'HDFC ERGO';
  } else if (lowerAll.includes('niva') || lowerAll.includes('bupa')) {
    preferredInsurer = 'Niva Bupa';
  } else if (lowerAll.includes('star')) {
    preferredInsurer = 'Star Health';
  } else if (lowerAll.includes('care')) {
    preferredInsurer = 'Care Health';
  } else if (lowerAll.includes('tata')) {
    preferredInsurer = 'Tata AIG';
  } else if (lowerAll.includes('icici')) {
    preferredInsurer = 'ICICI Lombard';
  }

  const isExclusionMessage = (
    lowerCurrent.includes('remove') || lowerCurrent.includes('exclude') || 
    lowerCurrent.includes('hata do') || lowerCurrent.includes('mat dikhao') || 
    lowerCurrent.includes('nahi chahiye')
  );

  const isGeneralCompanyQuery = (
    lowerCurrent.includes('best health insurance company') ||
    lowerCurrent.includes('best insurance company') ||
    lowerCurrent.includes('best health insurance provider') ||
    lowerCurrent.includes('best insurer') ||
    lowerCurrent.includes('top health insurance company') ||
    lowerCurrent.includes('top insurance company') ||
    lowerCurrent.includes('which insurance company is best') ||
    lowerCurrent.includes('which company is best') ||
    lowerCurrent.includes('best company for health insurance') ||
    (lowerCurrent.includes('best health insurance') && lowerCurrent.includes('company'))
  );

  if (isExclusionMessage || isGeneralCompanyQuery) {
    preferredInsurer = null;
  } else {
    // Active message insurer override
    if (lowerCurrent.includes('star')) {
      preferredInsurer = 'Star Health';
    } else if (lowerCurrent.includes('aditya') || lowerCurrent.includes('birla')) {
      preferredInsurer = 'Aditya Birla';
    } else if (lowerCurrent.includes('hdfc')) {
      preferredInsurer = 'HDFC ERGO';
    } else if (lowerCurrent.includes('niva') || lowerCurrent.includes('bupa')) {
      preferredInsurer = 'Niva Bupa';
    } else if (lowerCurrent.includes('care')) {
      preferredInsurer = 'Care Health';
    } else if (lowerCurrent.includes('tata')) {
      preferredInsurer = 'Tata AIG';
    } else if (lowerCurrent.includes('icici') || lowerCurrent.includes('lombard')) {
      preferredInsurer = 'ICICI Lombard';
    }
  }

  const priorities = [];
  let roomCategory = null;
  if (lowerAll.includes('single private') || lowerAll.includes('single room') || lowerAll.includes('private room') || lowerAll.includes('single private room')) {
    roomCategory = 'Single Private Room';
    priorities.push('single_private_room');
  } else if (lowerAll.includes('no room rent') || lowerAll.includes('no capping') || lowerAll.includes('room flexibility')) {
    roomCategory = 'No Room Rent Capping';
    priorities.push('no_room_rent_capping');
  }

  if (lowerAll.includes('sab add ons') || lowerAll.includes('all add-ons') || lowerAll.includes('saare benefits') || lowerAll.includes('comprehensive')) {
    priorities.push('comprehensive');
    priorities.push('comprehensive_addons');
  }
  if (lowerAll.includes('waiting') || lowerAll.includes('ped') || lowerAll.includes('pre-existing') || lowerAll.includes('low waiting')) {
    priorities.push('low_waiting_period');
  }
  if (lowerAll.includes('restore') || lowerAll.includes('restoration') || lowerAll.includes('recharge') || lowerAll.includes('unlimited')) {
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
    preExistingDiseases: []
  };
}

/**
 * geminiService.js
 * 
 * WHYINSURED AI Personal Health Insurance Advisor Backend Service.
 * 
 * Two-Layer Architecture:
 * - Layer A (Gemini Conversational Engine):
 *   Gemini generates natural, contextual conversational responses for explanations,
 *   educational queries, benefit definitions, examples, follow-ups, comparisons,
 *   and progressive requirement discussions.
 * - Layer B (Deterministic Requirement & Matcher Engine):
 *   Robust parsing and state accumulation for structured fields (relationship,
 *   ages, coverage, room category, preferred insurer) and policy recommendation matching.
 * 
 * Safety Net:
 * - Built-in fallbackSemanticAdvisor handles API timeouts, missing keys, or network errors
 *   intelligently without returning generic dead-end messages.
 */

import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.6-flash'];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Main Entry Point: Analyze user requirement and generate personal advisor response.
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
    return defaultGreeting;
  }

  const cleanMessage = userMessage.trim();

  // 1. Extract previous requirements from conversation history
  const previousReqs = extractRequirementsFromHistory(conversationHistory);

  // 2. Extract current requirements from the latest message
  const currentExtractedReqs = extractRequirementsFromText(cleanMessage, cleanMessage.toLowerCase());

  // 3. Merge previous and current requirements
  const mergedReqs = mergeRequirements(previousReqs, currentExtractedReqs, cleanMessage);

  // 4. Format recent conversation history for multi-turn context
  const recentHistory = (conversationHistory || [])
    .filter(m => (m.text || m.content))
    .slice(-14)
    .map(m => {
      const isUser = (m.sender === 'user' || m.role === 'user');
      const text = (m.text || m.content || '').trim();
      return `${isUser ? 'User' : 'WHYINSURED Assistant'}: ${text}`;
    })
    .join('\n');

  let finalResult = null;

  // 5. Layer A: Call Gemini if API key is configured
  if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== 'your_api_key_here' && GEMINI_API_KEY.trim() !== '') {
    try {
      const geminiResult = await callGeminiApiWithRetry(cleanMessage, recentHistory, mergedReqs, 2);
      if (geminiResult && geminiResult.reply && typeof geminiResult.reply === 'string') {
        finalResult = geminiResult;
      }
    } catch (apiError) {
      console.warn('[Gemini Service] Handled API error (switching to safety fallback):', apiError.message);
    }
  }

  // 6. Safety Net: If Gemini was unavailable, timed out, or failed, use semantic fallback advisor
  if (!finalResult) {
    finalResult = fallbackSemanticAdvisor(cleanMessage, conversationHistory, mergedReqs);
  }

  // 7. Layer B: Ensure deterministic requirement preservation and explicit trigger handling
  finalResult.requirements = mergeRequirements(mergedReqs, finalResult.requirements || {}, cleanMessage);

  // Handle explicit show plans triggers
  const lowerMsg = cleanMessage.toLowerCase().trim();
  const isExplicitShowPlans = (
    lowerMsg === 'show the plan' || lowerMsg === 'show the plans' ||
    lowerMsg === 'show plan' || lowerMsg === 'show plans' ||
    lowerMsg === 'show matching plans' || lowerMsg === 'show me plans' ||
    lowerMsg === 'show me the plan' || lowerMsg === 'show my plan' ||
    lowerMsg === 'show recommendations' || lowerMsg === 'show options' ||
    lowerMsg.includes('show the plan') || lowerMsg.includes('show matching plan')
  );

  if (isExplicitShowPlans) {
    finalResult.showPlans = true;
    finalResult.intent = 'SHOW_RECOMMENDATIONS';
    finalResult.conversationStage = 'showing_recommendations';
    finalResult.reply = finalResult.requirements.preferredInsurer
      ? `Here are the top ${finalResult.requirements.preferredInsurer} plan options matching your requirements:`
      : "Here are the top plans that best match your requirements:";
  }

  // Handle "best company" / general comparison query: do not force previous insurer
  const isGeneralBestCompany = isGeneralBestCompanyQuery(lowerMsg);
  if (isGeneralBestCompany) {
    finalResult.requirements.preferredInsurer = null;
    finalResult.showPlans = false;
  }

  // Debug logging
  console.log('[AI Chat] User message:', cleanMessage);
  console.log('[AI Chat] Detected intent:', finalResult.intent);
  console.log('[AI Chat] Final requirements:', finalResult.requirements);
  console.log('[AI Chat] showPlans:', Boolean(finalResult.showPlans));

  return finalResult;
}

/**
 * Check if a query is a general "best company" comparison request
 */
function isGeneralBestCompanyQuery(lowerText) {
  return (
    lowerText.includes('best health insurance company') ||
    lowerText.includes('best insurance company') ||
    lowerText.includes('best health insurance provider') ||
    lowerText.includes('best insurer') ||
    lowerText.includes('top health insurance company') ||
    lowerText.includes('top insurance company') ||
    lowerText.includes('which insurance company is best') ||
    lowerText.includes('which company is best') ||
    lowerText.includes('best company for health insurance') ||
    (lowerText.includes('best health insurance') && lowerText.includes('company'))
  );
}

/**
 * Call Google Gemini REST API with progressive fallback across candidate models
 */
async function callGeminiApiWithRetry(userMessage, recentHistory, currentRequirements, maxAttempts = 2) {
  const systemPrompt = `You are WHYINSURED, an expert AI Health Insurance Advisor.
You possess deep knowledge of health insurance principles, hospital billing, claims, and retail health policies in India.

CORE DIRECTIVE — DYNAMIC & INTELLIGENT QUESTION ANSWERING:
- You must understand ANY question asked by the user in their own words, including:
  * Spelling mistakes or typos (e.g. "n you tellmabout health insurance" -> "Can you tell me about health insurance?")
  * Hinglish / Hindi queries (e.g. "room rent kya hota h", "agar hospital me 2 lakh ka bill aa gya", "parents ke liye kya dekhna chahiye", "claim kaise karte hain")
  * Incomplete or short queries (e.g. "restoration?", "deductible meaning", "10L vs 20L")
  * Scenario-based questions (e.g. "if bill is 2 lakh how much will insurance pay")
- Answer the user's actual question FIRST and DIRECTLY in simple, clear Indian English.
- Give a simple explanation first, and provide a practical real-world example when helpful.
- If the question is ambiguous, give the best direct answer and ask ONE short clarification.
- If user asks a scenario question (e.g. 'agar hospital me 2 lakh ka bill aa gya'), explain how health insurance covers bills, cashless claims, and deductibles in that situation. Do not treat it as a requirement to buy a ₹2L plan.
- If user asks guidance for parents ('parents ke liye kya dekhna chahiye'), give the key checklist (high sum insured, low PED waiting period, 0% copay, no room rent capping, pre/post hospital cover).
- STRICTLY FORBIDDEN:
  * NEVER output generic filler responses like "I'm here to help!", "You can ask me anything about health insurance...", "Tell me who you want coverage for", or "Would you like me to find a plan..." when the user has asked an actual question.
  * NEVER redirect the user to a predefined list of questions.
- Maintain independent guidance: Explain trade-offs; do not claim one insurer is universally "the best".

Available Insurers on WHYINSURED: HDFC ERGO, Tata AIG, Care Health, Niva Bupa, Star Health, ICICI Lombard, Aditya Birla.

Return ONLY a valid JSON object matching this structure:
{
  "intent": "GENERAL_HEALTH_INSURANCE_QUESTION",
  "conversationStage": "general_information",
  "showPlans": false,
  "requirements": {},
  "reply": "Your direct answer with explanation and practical example."
}`;

  const userPromptContent = `Known Accumulated Requirements: ${JSON.stringify(currentRequirements || {})}\n\nRecent Conversation History:\n${recentHistory || 'No previous messages'}\n\nLatest User Message: "${userMessage}"`;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPromptContent}` }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1500,
            responseMimeType: 'application/json'
          }
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(7000)
        });

        if (response.status === 404 || response.status === 429) {
          // Try next candidate model
          break;
        }

        if (response.status === 503) {
          if (attempt < maxAttempts) {
            await wait(800);
            continue;
          }
          break;
        }

        if (!response.ok) {
          break;
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsedJson = safelyParseGeminiJson(rawText);
        if (parsedJson && parsedJson.reply) {
          return parsedJson;
        }
      } catch (err) {
        if (attempt < maxAttempts) {
          await wait(800);
          continue;
        }
      }
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
    if (parsed && typeof parsed === 'object' && parsed.reply) {
      return parsed;
    }
  } catch (err) {
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedMatch = JSON.parse(jsonMatch[0]);
        if (parsedMatch && typeof parsedMatch === 'object' && parsedMatch.reply) {
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
 * Semantic Fallback Engine (Safety Net)
 * Generates natural, helpful, context-aware responses when Gemini API is offline or unreachable.
 */
function fallbackSemanticAdvisor(userMessage, conversationHistory = [], accumulatedReqs = {}) {
  const rawCurrent = (userMessage || '').trim();
  let lowerCurrent = rawCurrent.toLowerCase();

  // Normalize common terms
  lowerCurrent = lowerCurrent
    .replace(/\b(aents|parnts|perents|parants)\b/g, 'parents')
    .replace(/\b(helath|healt|hlaeth)\b/g, 'health')
    .replace(/\b(inusrance|insurence|insurnace|insuranc|insurane)\b/g, 'insurance')
    .replace(/\b(shoe|shw|sho|shoow)\b/g, 'show');

  // Multi-turn context inspection
  const historyTexts = (conversationHistory || [])
    .map(m => (m.text || m.content || '').toLowerCase())
    .join(' ');

  const lastAdvisorMsg = [...(conversationHistory || [])]
    .reverse()
    .find(m => m.sender === 'ai' || m.sender === 'assistant' || m.role === 'assistant' || m.role === 'ai')?.text || '';
  const lastAdvisorLower = lastAdvisorMsg.toLowerCase();

  // 1. Follow-up "example" / "explain" requests (e.g. "Give me short explanation with example")
  const isExampleOrExplanationRequest = (
    lowerCurrent.includes('example') ||
    lowerCurrent.includes('explain') ||
    lowerCurrent.includes('short explanation') ||
    lowerCurrent.includes('tell me more') ||
    lowerCurrent.includes('meaning') ||
    lowerCurrent.includes('samjhao') ||
    lowerCurrent.includes('batao')
  );

  if (isExampleOrExplanationRequest) {
    // Check if the current message or recent history was discussing restoration
    if (lowerCurrent.includes('restoration') || historyTexts.includes('restoration') || lastAdvisorLower.includes('restoration')) {
      return {
        intent: 'BENEFIT_EXPLANATION',
        conversationStage: 'general_information',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Here is a simple explanation with an example of **Restoration Benefit**:\n\n**Concept**: If your insurance coverage runs out during a hospitalization, the insurer automatically restores 100% of your sum insured for subsequent treatments in the same policy year.\n\n**Example**: Suppose you have a ₹10 Lakh policy. In March, you undergo surgery costing ₹10 Lakh, utilizing your entire cover. If in July you or a covered family member need hospitalization for ₹6 Lakh, the restoration benefit refills your sum insured, covering the ₹6 Lakh bill without requiring you to pay out of pocket.",
        suggestions: []
      };
    }

    // Check if the current message or recent history was discussing room rent
    if (lowerCurrent.includes('room rent') || historyTexts.includes('room rent') || lastAdvisorLower.includes('room rent') || lastAdvisorLower.includes('room category')) {
      return {
        intent: 'BENEFIT_EXPLANATION',
        conversationStage: 'general_information',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Here is a clear explanation and example of **Room Rent Capping**:\n\n**Concept**: Room rent capping limits how much an insurer will pay per day for your hospital room (e.g., 1% of Sum Insured). Exceeding this limit triggers proportionate deductions on doctor fees and surgery costs across your entire bill.\n\n**Example**: If you have a ₹5 Lakh policy with a 1% room rent cap (₹5,000/day) and choose a Deluxe room costing ₹10,000/day, you exceeded the limit by 2X. Consequently, the insurer may only pay 50% of your total hospital and doctor charges, leaving you to pay the rest.\n\nChoosing a plan with **Single Private Room eligibility or No Room Rent Capping** avoids all proportionate deductions.",
        suggestions: []
      };
    }

    // Check if the current message or recent history was discussing waiting periods
    if (lowerCurrent.includes('waiting period') || historyTexts.includes('waiting period') || lastAdvisorLower.includes('waiting period')) {
      return {
        intent: 'BENEFIT_EXPLANATION',
        conversationStage: 'general_information',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Here is an explanation and example of **Waiting Periods**:\n\n**Concept**: A waiting period is a specific timeframe after buying a policy during which certain medical treatments or pre-existing diseases are not yet covered.\n\n**Example**: If you declare Diabetes when buying a policy with a 24-month Pre-Existing Disease (PED) waiting period, any hospitalization related to Diabetes in the first 2 years won't be covered. After 24 months, it is covered 100% up to your sum insured. (Emergency accidents are covered from Day 1).",
        suggestions: []
      };
    }

    // General explanation with example
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Health insurance is a plan that helps cover eligible medical and hospital expenses. You pay a premium to get this protection.\n\n**Example**: If you have a ₹10 lakh health insurance policy and a covered hospital treatment costs ₹3 lakh, the insurer may pay the eligible amount according to the policy terms, instead of you paying the entire bill yourself.\n\nIn simple words, health insurance protects you from large unexpected medical expenses.",
      suggestions: []
    };
  }

  // 2. Greeting
  const isGreeting = (
    /^(hi|hii|hiii|hello|helo|hlo|hlw|hey|hy|namaste|namaskar|good\s*morning|good\s*afternoon|good\s*evening|wassup|hola)\b/i.test(lowerCurrent) &&
    lowerCurrent.split(/\s+/).length <= 3
  );

  if (isGreeting) {
    return {
      intent: 'GREETING',
      conversationStage: 'greeting',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Hi! 👋 Nice to meet you. I'm your WHYINSURED Advisor. Think of me as your insurance friend — you can ask me anything about health insurance, or tell me what kind of plan you're looking for.",
      suggestions: []
    };
  }

  // 3. Why Health Insurance is Important
  if (
    lowerCurrent.includes('why health insurance') || lowerCurrent.includes('why is health insurance') ||
    lowerCurrent.includes('why do i need') || lowerCurrent.includes('why should i buy') ||
    lowerCurrent.includes('why insurance is important') || lowerCurrent.includes('importance of health insurance') ||
    lowerCurrent.includes('importance of insurance') || lowerCurrent.includes('health insurance importance') ||
    lowerCurrent.includes('need of health insurance') || lowerCurrent.includes('do i really need') ||
    lowerCurrent.includes('benefits of health insurance') || lowerCurrent.includes('ke fayde')
  ) {
    return {
      intent: 'EDUCATIONAL_QUESTION',
      conversationStage: 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Health insurance is essential for several key reasons:\n\n• **Protects Your Savings**: Major surgeries and critical illnesses can cost ₹5–15 Lakh+. Insurance prevents sudden medical emergencies from wiping out your family's savings.\n• **Cashless Hospitalization**: Network hospitals treat you without requiring immediate out-of-pocket cash arrangements.\n• **Comprehensive Coverage**: Covers hospital room, ICU, doctor fees, surgeries, pre-hospitalization tests (60 days), and post-discharge recovery (90–180 days).\n• **Tax Benefits (Section 80D)**: Save up to ₹25,000/year on taxes for self/family, and up to ₹50,000 for senior citizen parents.\n\nWhenever you're ready, I can explain specific features like restoration and room rent, or help you find the right health plan!",
      suggestions: []
    };
  }

  // 4. Restoration / Recharge definition
  if (
    lowerCurrent.includes('restoration') || lowerCurrent.includes('recharge') ||
    lowerCurrent.includes('what is restoration') || lowerCurrent.includes('explain restoration')
  ) {
    return {
      intent: 'BENEFIT_EXPLANATION',
      conversationStage: 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Restoration Benefit** automatically refills 100% of your sum insured if it gets exhausted by medical claims in a policy year.\n\n**Example**: If you have a ₹10 Lakh sum insured and use the full ₹10 Lakh for a treatment in June, restoration refills another ₹10 Lakh so you remain covered for subsequent hospitalizations in the same policy year.\n\nLeading policies (such as HDFC Optima Secure+, Aditya Birla Activ One, and Care Supreme) offer **Unlimited Restoration** for both same and unrelated illnesses.",
      suggestions: []
    };
  }

  // 5. Room Rent definition
  if (
    lowerCurrent.includes('room rent') || lowerCurrent.includes('room category') ||
    lowerCurrent.includes('what is room rent') || lowerCurrent.includes('explain room rent') ||
    lowerCurrent.includes('tell me about room rent')
  ) {
    return {
      intent: 'BENEFIT_EXPLANATION',
      conversationStage: 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "**Room Rent Capping** limits the daily allowance an insurer pays for your hospital room (e.g. 1% of Sum Insured per day).\n\nIf you choose a room above your eligible limit, insurers apply proportionate deductions to your entire hospital bill (including doctor and ICU charges).\n\n**Recommendation**: Choosing a plan with **Single Private Room eligibility or No Room Rent Capping** ensures you can choose any comfortable room without out-of-pocket penalties.",
      suggestions: []
    };
  }

  // 6. What is Health Insurance / How it works
  if (
    lowerCurrent.includes('what is health insurance') || lowerCurrent.includes('explain health insurance') ||
    lowerCurrent.includes('how does health insurance work') || lowerCurrent.includes('health insurance kya hai')
  ) {
    return {
      intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      conversationStage: 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Health insurance is a plan that helps cover eligible medical and hospital expenses. You pay a premium to get this protection.\n\n**Example**: If you have a ₹10 lakh health insurance policy and a covered hospital treatment costs ₹3 lakh, the insurer may pay the eligible amount according to the policy terms, instead of you paying the entire bill yourself.\n\nIn simple words, health insurance protects you from large unexpected medical expenses.",
      suggestions: []
    };
  }

  // 7. General Best Company comparison
  if (isGeneralBestCompanyQuery(lowerCurrent)) {
    accumulatedReqs.preferredInsurer = null;
    return {
      intent: 'COMPARISON_QUERY',
      conversationStage: 'general_information',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "In health insurance, no single insurer is objectively 'the best' for everyone, because the right choice depends on your specific priorities:\n\n• **HDFC ERGO**: Known for high claim settlement reliability, 2X instant coverage (Secure Benefit), and zero room-rent capping.\n• **Tata AIG**: Strong cashless network, 100% cumulative bonus without claim reduction, and comprehensive coverage.\n• **Aditya Birla**: Outstanding for wellness rewards (up to 100% HealthReturns™) and Day 1 chronic condition management.\n• **Care Health**: High cumulative bonus multipliers (up to 500%) and flexible sum insured options.\n• **Niva Bupa**: Feature-rich plans with entry-age locking (ReAssure 2.0).\n\nSuitability depends on your preferred coverage, family member ages, and hospital room preferences. Would you like me to help find a plan for yourself or your family?",
      suggestions: []
    };
  }

  // 8. Progressive Requirement Flow
  // Initial requirement expression
  const isInitialRequirement = (
    lowerCurrent === 'i need a health plan' || lowerCurrent === 'i need health insurance' ||
    lowerCurrent === 'i need insurance' || lowerCurrent === 'i want a health plan' ||
    lowerCurrent === 'i want health insurance' || lowerCurrent.includes('looking for a health plan') ||
    lowerCurrent.includes('help me find a health plan') || lowerCurrent.includes('help me find a plan')
  );

  if (isInitialRequirement && !accumulatedReqs.relationship) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: "Absolutely! I can help you find a suitable health insurance plan. Who do you want to cover — yourself, spouse, children, parents, or family?",
      suggestions: []
    };
  }

  // Specifying parents
  if (lowerCurrent.includes('parent') || lowerCurrent === 'parents' || lowerCurrent === 'my parents') {
    accumulatedReqs.relationship = 'parents';
    if (!accumulatedReqs.ages || (Array.isArray(accumulatedReqs.ages) && accumulatedReqs.ages.length === 0)) {
      return {
        intent: 'REQUIREMENT_UPDATE',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Sure! What are the ages of your parents?",
        suggestions: []
      };
    }
  }

  // Specifying self
  if (lowerCurrent.includes('for myself') || lowerCurrent.includes('myself') || lowerCurrent === 'me' || lowerCurrent.includes('for me')) {
    accumulatedReqs.relationship = 'self';
    if (!accumulatedReqs.coverage) {
      return {
        intent: 'REQUIREMENT_UPDATE',
        conversationStage: 'collecting_requirements',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Got it, a plan for yourself. What coverage amount are you looking for — for example ₹10 Lakh, ₹20 Lakh, or ₹50 Lakh?",
        suggestions: []
      };
    }
  }

  // Storing ages
  const currentHasAges = (lowerCurrent.includes('father') || lowerCurrent.includes('mother') || lowerCurrent.match(/\b[2-9][0-9]\b/)) && !lowerCurrent.includes('lakh');
  if (currentHasAges && accumulatedReqs.ages && !accumulatedReqs.coverage) {
    let ageSummary = "your parents' ages";
    if (accumulatedReqs.ages && typeof accumulatedReqs.ages === 'object' && accumulatedReqs.ages.father && accumulatedReqs.ages.mother) {
      ageSummary = `Mother (${accumulatedReqs.ages.mother}) and Father (${accumulatedReqs.ages.father})`;
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

  // Storing coverage
  const currentHasCoverage = lowerCurrent.match(/(\d+)\s*(lakh|lakhs|l|cr|crore|lac|lacs)/i) || lowerCurrent.includes('20 lakh') || lowerCurrent.includes('10 lakh') || lowerCurrent.includes('50 lakh');
  if (currentHasCoverage && accumulatedReqs.coverage && !accumulatedReqs.roomCategory) {
    return {
      intent: 'FOLLOW_UP_ANSWER',
      conversationStage: 'collecting_requirements',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: `Noted — ₹${accumulatedReqs.coverage} Lakh coverage. Do you prefer a Single Private Room or have any room-category preference?`,
      suggestions: []
    };
  }

  // Storing room preference
  if (lowerCurrent.includes('single private') || lowerCurrent.includes('private room') || lowerCurrent.includes('single room')) {
    accumulatedReqs.roomCategory = 'Single Private Room';
    if (!accumulatedReqs.preferredInsurer) {
      return {
        intent: 'FOLLOW_UP_ANSWER',
        conversationStage: 'awaiting_plan_confirmation',
        showPlans: false,
        requirements: accumulatedReqs,
        reply: "Noted — Single Private Room with zero sub-limits. Do you have a preferred insurer (like Tata AIG, HDFC ERGO), or should I show matching plans?",
        suggestions: []
      };
    }
  }

  // Storing preferred insurer
  if (accumulatedReqs.preferredInsurer && (lowerCurrent.includes('tata') || lowerCurrent.includes('hdfc') || lowerCurrent.includes('star') || lowerCurrent.includes('care') || lowerCurrent.includes('birla') || lowerCurrent.includes('niva') || lowerCurrent.includes('icici'))) {
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
      reply: `Got it! I have noted ${accumulatedReqs.preferredInsurer}, ₹${accumulatedReqs.coverage || 20} Lakh coverage, ${relationSummary}, and ${accumulatedReqs.roomCategory || 'Single Private Room'}. Would you like me to show the matching plan?`,
      suggestions: []
    };
  }

  // General requirement readiness
  if (accumulatedReqs.relationship && accumulatedReqs.coverage) {
    return {
      intent: 'REQUIREMENT_UPDATE',
      conversationStage: 'awaiting_plan_confirmation',
      showPlans: false,
      requirements: accumulatedReqs,
      reply: `I have noted your requirements for ${accumulatedReqs.relationship === 'parents' ? 'your parents' : 'yourself'} with ₹${accumulatedReqs.coverage} Lakh coverage. Would you like me to show the matching plans?`,
      suggestions: []
    };
  }

  // Intelligent fallback for any other question
  // Intelligent fallback for any other question
  return {
    intent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
    conversationStage: 'general_information',
    showPlans: false,
    requirements: accumulatedReqs,
    reply: "Sure! I can explain health insurance, policy benefits, waiting periods, claims, room rent, restoration, and other insurance-related topics in simple language. Please ask me your question and I'll explain it with an example when useful.",
    suggestions: []
  };
}

/**
 * Extract requirements from all user messages in conversation history
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

  // Clear preferred insurer if user is asking general best company query
  if (isGeneralBestCompanyQuery(lowerMsg)) {
    merged.preferredInsurer = null;
  } else if (current.preferredInsurer) {
    merged.preferredInsurer = current.preferredInsurer;
  }

  if (current.relationship) merged.relationship = current.relationship;

  if (current.ages) {
    if (typeof current.ages === 'object' && !Array.isArray(current.ages) && Object.keys(current.ages).length > 0) {
      merged.ages = { ...(prev.ages || {}), ...current.ages };
    } else if (Array.isArray(current.ages) && current.ages.length > 0) {
      // If previous ages was structured { father, mother }, keep structured unless current has valid elements
      if (prev.ages && typeof prev.ages === 'object' && !Array.isArray(prev.ages) && Object.keys(prev.ages).length > 0) {
        // preserve structured ages
      } else {
        merged.ages = current.ages;
      }
    }
  }

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

  const isParents = (
    lowerAll.includes('parent') || lowerAll.includes('father') || lowerAll.includes('mother') ||
    lowerAll.includes('pitaji') || lowerAll.includes('mataji')
  );

  const isFamily = (
    lowerAll.includes('family') || lowerAll.includes('child') || lowerAll.includes('kid') ||
    lowerAll.includes('spouse') || lowerAll.includes('wife')
  );

  const isSelf = (
    lowerAll.includes('myself') || lowerAll.includes('my self') || lowerAll.includes('for me') ||
    lowerAll.includes('for myself') || lowerAll.includes('individual') || lowerAll === 'me' ||
    (/\bsingle\b/i.test(lowerAll) && !lowerAll.includes('single private') && !lowerAll.includes('single room'))
  );

  if (isParents) {
    relationship = 'parents';
  } else if (isFamily) {
    relationship = 'family';
  } else if (isSelf) {
    relationship = 'self';
  }

  // Specific override if current message changed relationship
  if (lowerCurrent.includes('parent') || lowerCurrent.includes('father') || lowerCurrent.includes('mother')) {
    relationship = 'parents';
  } else if (lowerCurrent.includes('for myself') || lowerCurrent.includes('my self') || lowerCurrent.includes('myself') || lowerCurrent.includes('for me') || lowerCurrent === 'me') {
    relationship = 'self';
  }

  const structuredAges = {};
  const rawAges = [];

  // Father age match (e.g. "father 46", "father is 46", "father's age 46", "46 year old father")
  const fatherMatch = allText.match(/(?:father|dad|pitaji)\s*(?:is|age|aged|'s age is)?\s*[:=]?\s*(\d{2})/i) ||
    allText.match(/(\d{2})\s*(?:year|yr)?(?:s)?\s*(?:old)?\s*(?:father|dad|pitaji)/i);
  if (fatherMatch) {
    const fAge = parseInt(fatherMatch[1], 10);
    if (fAge >= 18 && fAge <= 99) {
      structuredAges.father = fAge;
      if (!rawAges.includes(fAge)) rawAges.push(fAge);
    }
  }

  // Mother age match (e.g. "mother 40", "mother is 40", "mother's age 40", "40 year old mother", "mom 40")
  const motherMatch = allText.match(/(?:mother|mom|mataji)\s*(?:is|age|aged|'s age is)?\s*[:=]?\s*(\d{2})/i) ||
    allText.match(/(\d{2})\s*(?:year|yr)?(?:s)?\s*(?:old)?\s*(?:mother|mom|mataji)/i);
  if (motherMatch) {
    const mAge = parseInt(motherMatch[1], 10);
    if (mAge >= 18 && mAge <= 99) {
      structuredAges.mother = mAge;
      if (!rawAges.includes(mAge)) rawAges.push(mAge);
    }
  }

  // Generic 2-digit age matching (avoid matching numbers followed by lakh, crore, %, etc.)
  const ageMatches = allText.matchAll(/\b(?:age\s*|aged\s*|years\s*old\s*|\b)([2-9][0-9])\b(?!\s*(?:lakh|lakhs|lac|lacs|l\b|cr|crore|crores|k\b|%|percent|month|months|day|days))/gi);
  for (const match of ageMatches) {
    const ageNum = parseInt(match[1], 10);
    if (ageNum >= 18 && ageNum <= 99 && !rawAges.includes(ageNum)) {
      rawAges.push(ageNum);
    }
  }

  let coverage = null;
  const isScenarioOrBill = (
    lowerAll.includes('bill') || lowerAll.includes('kharcha') || lowerAll.includes('cost') ||
    lowerAll.includes('expense') || lowerAll.includes('claim') || lowerAll.includes('hospital me') ||
    lowerAll.includes('agar') || lowerAll.includes('what if') || lowerAll.includes('maan lo') ||
    lowerAll.includes('example') || lowerAll.includes('suppose') || lowerAll.includes('admitted')
  );

  if (!isScenarioOrBill) {
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

  const isExclusion = (
    lowerCurrent.includes('remove') || lowerCurrent.includes('exclude') ||
    lowerCurrent.includes('hata do') || lowerCurrent.includes('mat dikhao') ||
    lowerCurrent.includes('nahi chahiye')
  );

  if (isExclusion || isGeneralBestCompanyQuery(lowerCurrent)) {
    preferredInsurer = null;
  } else {
    // Current message insurer preference override
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

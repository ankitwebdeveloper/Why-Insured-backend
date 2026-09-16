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

export const CANONICAL_COMPANIES = [
  {
    id: 'star-health',
    name: 'Star Health',
    aliases: ['star health', 'star', 'starhealth', 'star health insurance', 'star-health']
  },
  {
    id: 'hdfc-ergo',
    name: 'HDFC ERGO',
    aliases: ['hdfc ergo', 'hdfc', 'hdfcergo', 'hdfc ergo health', 'hdfc-ergo']
  },
  {
    id: 'tata-aig',
    name: 'Tata AIG',
    aliases: ['tata aig', 'tata', 'tataaig', 'tata health', 'tata-aig']
  },
  {
    id: 'care-health',
    name: 'Care Health',
    aliases: ['care health', 'care', 'carehealth', 'religare', 'care-health']
  },
  {
    id: 'niva-bupa',
    name: 'Niva Bupa',
    aliases: ['niva bupa', 'niva', 'bupa', 'nivabupa', 'max bupa', 'niva-bupa']
  },
  {
    id: 'icici-lombard',
    name: 'ICICI Lombard',
    aliases: ['icici lombard', 'icici', 'lombard', 'icicilombard', 'icici-lombard']
  },
  {
    id: 'aditya-birla',
    name: 'Aditya Birla',
    aliases: ['aditya birla', 'aditya', 'birla', 'adityabirla', 'abhealth', 'aditya-birla']
  }
];

export function normalizeCompanyId(companyStr) {
  if (!companyStr || typeof companyStr !== 'string') return null;
  const clean = companyStr.toLowerCase().trim().replace(/[-_]/g, ' ');
  for (const comp of CANONICAL_COMPANIES) {
    if (comp.id === companyStr.toLowerCase().trim()) return comp.id;
    for (const alias of comp.aliases) {
      const cleanAlias = alias.replace(/[-_]/g, ' ');
      if (clean === cleanAlias || clean.includes(cleanAlias) || cleanAlias.includes(clean)) {
        return comp.id;
      }
    }
  }
  return companyStr.toLowerCase().trim();
}

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
      excludeCompanies: [],
      reply: "Hi! 👋 How can I help you with health insurance today?",
      suggestions: []
    };
    return defaultGreeting;
  }

  const cleanMessage = userMessage.trim();
  const lowerMsg = cleanMessage.toLowerCase().trim();

  // 1. Extract previous requirements from conversation history
  const previousReqs = extractRequirementsFromHistory(conversationHistory);

  // 2. Extract current requirements from the latest message
  const currentExtractedReqs = extractRequirementsFromText(cleanMessage, lowerMsg);

  // 3. Merge previous and current requirements
  const mergedReqs = mergeRequirements(previousReqs, currentExtractedReqs, cleanMessage);

  // 4. Extract accumulated and current company exclusions
  let excludeCompanies = extractAllExclusionsFromConversation(conversationHistory, cleanMessage, []);

  // Clear preferred insurer if it has been excluded
  if (mergedReqs.preferredInsurer) {
    const prefNorm = normalizeCompanyId(mergedReqs.preferredInsurer);
    if (prefNorm && excludeCompanies.includes(prefNorm)) {
      mergedReqs.preferredInsurer = null;
    }
  }

  // 5. Format recent conversation history for multi-turn context
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

  // 6. Layer A: Call Gemini if API key is configured
  const hasKey = Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim() !== 'your_api_key_here' && GEMINI_API_KEY.trim() !== '');
  if (hasKey) {
    try {
      const geminiResult = await callGeminiApiWithRetry(cleanMessage, recentHistory, mergedReqs, excludeCompanies, 2);
      if (geminiResult && geminiResult.reply && typeof geminiResult.reply === 'string') {
        finalResult = geminiResult;
        if (Array.isArray(geminiResult.excludeCompanies) && geminiResult.excludeCompanies.length > 0) {
          const geminiNorm = geminiResult.excludeCompanies.map(c => normalizeCompanyId(c)).filter(Boolean);
          excludeCompanies = Array.from(new Set([...excludeCompanies, ...geminiNorm]));
        }
      }
    } catch (apiError) {
      console.warn('[Gemini Service] Handled API error (switching to safety fallback):', apiError.message);
    }
  } else {
    console.warn('[Gemini Service] GEMINI_API_KEY is missing or empty. Using safety fallback advisor.');
  }

  // 7. Safety Net: If Gemini was unavailable, timed out, or failed, use semantic fallback advisor
  if (!finalResult) {
    finalResult = fallbackSemanticAdvisor(cleanMessage, conversationHistory, mergedReqs, excludeCompanies);
  }

  // 8. Layer B: Ensure deterministic requirement preservation and explicit trigger handling
  finalResult.requirements = mergeRequirements(mergedReqs, finalResult.requirements || {}, cleanMessage);
  finalResult.excludeCompanies = excludeCompanies;

  if (finalResult.requirements && finalResult.requirements.preferredInsurer) {
    const prefNorm = normalizeCompanyId(finalResult.requirements.preferredInsurer);
    if (prefNorm && excludeCompanies.includes(prefNorm)) {
      finalResult.requirements.preferredInsurer = null;
    }
  }

  // Handle plan suggestion & recommendation triggers
  const isExplicitShowPlans = (
    lowerMsg === 'show the plan' || lowerMsg === 'show the plans' ||
    lowerMsg === 'show plan' || lowerMsg === 'show plans' ||
    lowerMsg === 'show matching plans' || lowerMsg === 'show me plans' ||
    lowerMsg === 'show me the plan' || lowerMsg === 'show my plan' ||
    lowerMsg === 'show recommendations' || lowerMsg === 'show options' ||
    lowerMsg.includes('show the plan') || lowerMsg.includes('show matching plan') ||
    lowerMsg.includes('show me plans') || lowerMsg.includes('show plans') ||
    lowerMsg.includes('suggest another') || lowerMsg.includes('suggest a good plan') ||
    lowerMsg.includes('suggest plan') || lowerMsg.includes('suggest a plan') ||
    lowerMsg.includes('suggest me a plan') || lowerMsg.includes('recommend a plan') ||
    lowerMsg.includes('recommend plan') || lowerMsg.includes('show another') ||
    lowerMsg.includes('show other') || lowerMsg.includes('another option') ||
    lowerMsg.includes('another plan') || lowerMsg.includes('any other plan') ||
    lowerMsg.includes('other plan') || lowerMsg.includes('dusra plan') ||
    lowerMsg.includes('aur plan') || lowerMsg.includes('different option') ||
    lowerMsg.includes('different company') || lowerMsg.includes('different insurer') ||
    lowerMsg.includes('another company') || lowerMsg.includes('something else') ||
    lowerMsg.includes('not this company') || lowerMsg.includes('not this one') ||
    (excludeCompanies.length > 0 && (lowerMsg.includes('suggest') || lowerMsg.includes('show') || lowerMsg.includes('option') || lowerMsg.includes('plan') || lowerMsg.includes('another') || lowerMsg.includes('aur') || lowerMsg.includes('else')))
  );

  if (isExplicitShowPlans || finalResult.showPlans || (finalResult.intent && finalResult.intent.toUpperCase() === 'SHOW_RECOMMENDATIONS')) {
    finalResult.showPlans = true;
    finalResult.intent = 'SHOW_RECOMMENDATIONS';
    finalResult.conversationStage = 'showing_recommendations';

    if (!finalResult.reply || finalResult.reply.includes("Sorry, I encountered") || !hasKey) {
      if (excludeCompanies.length > 0) {
        const excludedNames = excludeCompanies.map(id => {
          const found = CANONICAL_COMPANIES.find(c => c.id === id);
          return found ? found.name : id;
        }).join(' and ');
        finalResult.reply = `Noted — I have excluded ${excludedNames} from your options. Here are the top alternative plans matching your requirements:`;
      } else if (finalResult.requirements.preferredInsurer) {
        finalResult.reply = `Here are the top ${finalResult.requirements.preferredInsurer} plan options matching your requirements:`;
      } else {
        finalResult.reply = "Here are the top plans that best match your requirements:";
      }
    }
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
  console.log('[AI Chat] Excluded companies:', finalResult.excludeCompanies);
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
async function callGeminiApiWithRetry(userMessage, recentHistory, currentRequirements, excludeCompanies = [], maxAttempts = 2) {
  const systemPrompt = `You are WHYINSURED, an expert AI Health Insurance Advisor.
You possess deep knowledge of health insurance principles, hospital billing, claims, and retail health policies in India.

CORE DIRECTIVE — DYNAMIC & INTELLIGENT QUESTION ANSWERING:
- You must understand ANY question asked by the user in their own words, including:
  * Greetings (e.g. "hii", "hi", "hello", "hey", "namaste") -> Respond with a warm, friendly greeting such as "Hi! 👋 How can I help you with health insurance today?"
  * Spelling mistakes or typos (e.g. "n you tellmabout health insurance" -> "Can you tell me about health insurance?")
  * Hinglish / Hindi queries (e.g. "room rent kya hota h", "agar hospital me 2 lakh ka bill aa gya", "parents ke liye kya dekhna chahiye", "claim kaise karte hain")
  * Incomplete or short queries (e.g. "restoration?", "deductible meaning", "10L vs 20L")
  * Scenario-based questions (e.g. "if bill is 2 lakh how much will insurance pay")
- Answer the user's actual question FIRST and DIRECTLY in simple, clear Indian English.
- Give a simple explanation first, and provide a practical real-world example when helpful.
- If the question is ambiguous, give the best direct answer and ask ONE short clarification.
- If user asks a scenario question (e.g. 'agar hospital me 2 lakh ka bill aa gya'), explain how health insurance covers bills, cashless claims, and deductibles in that situation. Do not treat it as a requirement to buy a ₹2L plan.
- If user asks guidance for parents ('parents ke liye kya dekhna chahiye'), give the key checklist (high sum insured, low PED waiting period, 0% copay, no room rent capping, pre/post hospital cover).

COMPANY EXCLUSION & PREFERENCE RULE:
- If user explicitly rejects, dislikes, distrusts, or wants to exclude a company (e.g. "I don't trust Star Health, suggest another", "Don't show Star", "I don't want Star", "Not Star", "Star nahi chahiye", "Star ke alawa", "I don't want Star or Care"):
  * Add the company ID (e.g. "star-health", "care-health", "hdfc-ergo", "tata-aig", "niva-bupa", "icici-lombard", "aditya-birla") to "excludeCompanies".
  * Set "showPlans": true and "intent": "SHOW_RECOMMENDATIONS".
  * Acknowledge the exclusion naturally in your reply and mention alternative trusted options.
- If user asks a general question about a company (e.g. "Tell me what Star Health covers", "How is Star Health different?"):
  * Do NOT exclude the company.
  * Answer the question directly without excluding.

STRICTLY FORBIDDEN:
- NEVER output generic filler responses like "I'm here to help!", "You can ask me anything about health insurance...", "Tell me who you want coverage for", or "Would you like me to find a plan..." when the user has asked an actual question.
- NEVER redirect the user to a predefined list of questions.
- Maintain independent guidance: Explain trade-offs; do not claim one insurer is universally "the best".

Available Insurers on WHYINSURED: HDFC ERGO (hdfc-ergo), Tata AIG (tata-aig), Care Health (care-health), Niva Bupa (niva-bupa), Star Health (star-health), ICICI Lombard (icici-lombard), Aditya Birla (aditya-birla).

Return ONLY a valid JSON object matching this structure:
{
  "intent": "GENERAL_HEALTH_INSURANCE_QUESTION",
  "conversationStage": "general_information",
  "showPlans": false,
  "requirements": {},
  "excludeCompanies": [],
  "reply": "Your direct answer with explanation and practical example."
}`;

  const userPromptContent = `Known Accumulated Requirements: ${JSON.stringify(currentRequirements || {})}\n\nCurrently Excluded Companies: ${JSON.stringify(excludeCompanies || [])}\n\nRecent Conversation History:\n${recentHistory || 'No previous messages'}\n\nLatest User Message: "${userMessage}"`;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();
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
          const errData = await response.json().catch(() => ({}));
          console.warn(`[Gemini API] Model ${model} returned ${response.status}: ${errData?.error?.message || 'Quota/Not Found'}. Trying next candidate model...`);
          break;
        }

        if (response.status === 503) {
          console.warn(`[Gemini API] Model ${model} returned 503 Service Unavailable (attempt ${attempt}/${maxAttempts}).`);
          if (attempt < maxAttempts) {
            await wait(800);
            continue;
          }
          break;
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.warn(`[Gemini API] Model ${model} error ${response.status}: ${errData?.error?.message || response.statusText}`);
          break;
        }

        const data = await response.json();
        const duration = Date.now() - startTime;
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsedJson = safelyParseGeminiJson(rawText);
        if (parsedJson && parsedJson.reply) {
          console.log(`[Gemini API] Successfully generated response with model ${model} in ${duration}ms`);
          return parsedJson;
        }
      } catch (err) {
        console.warn(`[Gemini API] Network/timeout exception on model ${model} (attempt ${attempt}/${maxAttempts}): ${err.message}`);
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
 * Check if a text is asking a general informational question about a company rather than rejecting it
 */
function isQuestionAboutCompany(text, alias) {
  const lower = text.toLowerCase();
  const questionMarkers = [
    'tell me what', 'what does', 'what is', 'how is', 'tell me about',
    'what are the features', 'covers', 'cover karta', 'kya cover', 'details of',
    'kaisa hai', 'review of', 'information about', 'explain', 'pros and cons',
    'difference between', 'compare', 'difference'
  ];
  const hasQuestionMarker = questionMarkers.some(q => lower.includes(q));

  const rejectionWords = [
    'dont trust', "don't trust", 'do not trust', 'dont want', "don't want", 'do not want',
    'dont like', "don't like", 'do not like', 'dont prefer', "don't prefer", 'do not prefer',
    'dont show', "don't show", 'do not show', 'hata do', 'hatao', 'remove', 'exclude',
    'nahi chahiye', 'nai chahiye', 'nahi chaiye', 'mat dikhao', 'mat do', 'mat suggest',
    'other than', 'except', 'apart from', 'besides', 'without', 'ke alawa', 'ke alaawa',
    'ko chhod', 'chhod kar', 'chhod ke', 'ke bina', 'not ', 'not interested'
  ];
  const hasRejection = rejectionWords.some(r => lower.includes(r));

  return hasQuestionMarker && !hasRejection;
}

/**
 * Detect explicit company rejections in a single message string
 */
function detectExplicitCompanyExclusionsInText(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const exclusions = new Set();

  for (const comp of CANONICAL_COMPANIES) {
    for (const alias of comp.aliases) {
      const aliasRegex = new RegExp(`(?:^|[^a-z0-9])${alias.replace(/[-_]/g, '[-\\s_]?')}(?:$|[^a-z0-9])`, 'i');
      if (!aliasRegex.test(lower)) continue;

      // Skip if it's purely a positive informational question
      if (isQuestionAboutCompany(lower, alias)) {
        continue;
      }

      // Check explicit rejection patterns
      const isExplicitRejection = (
        lower.includes(`don't trust ${alias}`) || lower.includes(`dont trust ${alias}`) || lower.includes(`do not trust ${alias}`) ||
        lower.includes(`don't want ${alias}`) || lower.includes(`dont want ${alias}`) || lower.includes(`do not want ${alias}`) ||
        lower.includes(`don't like ${alias}`) || lower.includes(`dont like ${alias}`) || lower.includes(`do not like ${alias}`) ||
        lower.includes(`don't prefer ${alias}`) || lower.includes(`dont prefer ${alias}`) || lower.includes(`do not prefer ${alias}`) ||
        lower.includes(`don't show ${alias}`) || lower.includes(`dont show ${alias}`) || lower.includes(`do not show ${alias}`) ||
        lower.includes(`not ${alias}`) || lower.includes(`no ${alias}`) ||
        lower.includes(`other than ${alias}`) || lower.includes(`except ${alias}`) || lower.includes(`apart from ${alias}`) || lower.includes(`besides ${alias}`) ||
        lower.includes(`something other than ${alias}`) || lower.includes(`anything other than ${alias}`) ||
        lower.includes(`without ${alias}`) || lower.includes(`remove ${alias}`) || lower.includes(`exclude ${alias}`) || lower.includes(`skip ${alias}`) ||
        lower.includes(`avoid ${alias}`) ||
        lower.includes(`${alias} ko hata`) || lower.includes(`${alias} hata`) ||
        lower.includes(`${alias} nahi chahiye`) || lower.includes(`${alias} nai chahiye`) || lower.includes(`${alias} nahi chaiye`) || lower.includes(`${alias} mat do`) ||
        lower.includes(`${alias} ke alawa`) || lower.includes(`${alias} ke alaawa`) || lower.includes(`${alias} ke bina`) ||
        lower.includes(`${alias} ko chhod`) || lower.includes(`${alias} chhod kar`) || lower.includes(`${alias} chhod ke`) || lower.includes(`${alias} chhodkar`) ||
        lower.includes(`${alias} mat dikhao`) || lower.includes(`${alias} mat batao`) || lower.includes(`${alias} mat suggest`) ||
        lower.includes(`${alias} par trust nahi`) || lower.includes(`${alias} pe trust nahi`) || lower.includes(`${alias} pe bharosa nahi`)
      );

      const hasGeneralRejectionContext = (
        lower.includes("don't trust") || lower.includes("dont trust") || lower.includes("do not trust") ||
        lower.includes("don't want") || lower.includes("dont want") || lower.includes("do not want") ||
        lower.includes("don't like") || lower.includes("dont like") || lower.includes("do not like") ||
        lower.includes("don't prefer") || lower.includes("dont prefer") || lower.includes("do not prefer") ||
        lower.includes("don't show") || lower.includes("dont show") || lower.includes("do not show") ||
        lower.includes("other than") || lower.includes("except") || lower.includes("apart from") ||
        lower.includes("something other than") || lower.includes("anything other than") ||
        lower.includes("hata do") || lower.includes("hatao") || lower.includes("nahi chahiye") ||
        lower.includes("nai chahiye") || lower.includes("ke alawa") || lower.includes("chhod ke") ||
        lower.includes("chhod kar") || lower.includes("mat dikhao") || lower.includes("without")
      );

      if (isExplicitRejection || hasGeneralRejectionContext) {
        exclusions.add(comp.id);
      }
    }
  }

  return Array.from(exclusions);
}

/**
 * Detect indirect rejection of previously recommended/mentioned company
 * e.g., "something else", "not this one", "another company", "show me a different insurer", "dusri company"
 */
function detectIndirectRejection(currentMessage, conversationHistory = []) {
  if (!currentMessage || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return [];
  }

  // If user already specified an explicit company rejection, do not infer indirect
  const explicit = detectExplicitCompanyExclusionsInText(currentMessage);
  if (explicit.length > 0) {
    return [];
  }

  const lower = currentMessage.toLowerCase().trim();
  const indirectRejectionPhrases = [
    'not this company',
    'not this one',
    'not this insurer',
    'not this plan',
    'not this',
    'not these',
    'different company',
    'different insurer',
    'show me a different insurer',
    'another company',
    'another insurer',
    'koi aur company',
    'dusri company',
    'koi doosri company'
  ];

  const isIndirect = indirectRejectionPhrases.some(phrase => lower.includes(phrase));
  if (!isIndirect) return [];

  // Find the most recent assistant message
  const lastAiMsg = [...conversationHistory].reverse().find(m => (m.sender === 'ai' || m.role === 'assistant' || m.sender === 'assistant'));
  if (!lastAiMsg) return [];

  const excluded = new Set();

  // If previous assistant message had recommendation cards, reject the top recommended company
  if (Array.isArray(lastAiMsg.recommendations) && lastAiMsg.recommendations.length > 0) {
    const topRec = lastAiMsg.recommendations[0];
    if (topRec && topRec.companyId) {
      const norm = normalizeCompanyId(topRec.companyId);
      if (norm) excluded.add(norm);
    } else if (topRec && (topRec.company || topRec.companyName)) {
      const norm = normalizeCompanyId(topRec.company || topRec.companyName);
      if (norm) excluded.add(norm);
    }
  }

  // If previous assistant text explicitly focused on a specific company
  const aiText = (lastAiMsg.text || lastAiMsg.content || '').toLowerCase();
  for (const comp of CANONICAL_COMPANIES) {
    for (const alias of comp.aliases) {
      if (aiText.includes(alias)) {
        excluded.add(comp.id);
        break;
      }
    }
  }

  return Array.from(excluded);
}

/**
 * Extract all persistent exclusions across full multi-turn conversation
 */
function extractAllExclusionsFromConversation(conversationHistory = [], currentMessage = '', geminiExclusions = []) {
  const lowerCurrent = (currentMessage || '').toLowerCase();

  // Reset if requested
  if (
    lowerCurrent.includes('forget everything') || lowerCurrent.includes('start again') ||
    lowerCurrent.includes('start over') || lowerCurrent.includes('reset search')
  ) {
    return [];
  }

  const allExclusions = new Set();

  // 1. Scan historical user turns
  if (Array.isArray(conversationHistory)) {
    for (let i = 0; i < conversationHistory.length; i++) {
      const msg = conversationHistory[i];
      const isUser = (msg.sender === 'user' || msg.role === 'user');
      if (isUser) {
        const text = msg.text || msg.content || '';
        const explicit = detectExplicitCompanyExclusionsInText(text);
        explicit.forEach(id => allExclusions.add(id));

        const historySlice = conversationHistory.slice(0, i);
        const indirect = detectIndirectRejection(text, historySlice);
        indirect.forEach(id => allExclusions.add(id));
      }
    }
  }

  // 2. Scan current user message
  const currentExplicit = detectExplicitCompanyExclusionsInText(currentMessage);
  currentExplicit.forEach(id => allExclusions.add(id));

  const currentIndirect = detectIndirectRejection(currentMessage, conversationHistory);
  currentIndirect.forEach(id => allExclusions.add(id));

  // 3. Merge with Gemini API exclusions
  if (Array.isArray(geminiExclusions)) {
    for (const item of geminiExclusions) {
      const norm = normalizeCompanyId(item);
      if (norm) allExclusions.add(norm);
    }
  }

  return Array.from(allExclusions);
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
  const currentExclusions = detectExplicitCompanyExclusionsInText(allText);

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
    currentExclusions.length > 0 ||
    lowerCurrent.includes('remove') || lowerCurrent.includes('exclude') ||
    lowerCurrent.includes('hata do') || lowerCurrent.includes('mat dikhao') ||
    lowerCurrent.includes('nahi chahiye') || lowerCurrent.includes('dont trust') ||
    lowerCurrent.includes("don't trust") || lowerCurrent.includes("don't want") ||
    lowerCurrent.includes('dont want') || lowerCurrent.includes('not ') ||
    lowerCurrent.includes('other than') || lowerCurrent.includes('ke alawa')
  );

  if (isExclusion || isGeneralBestCompanyQuery(lowerCurrent)) {
    if (preferredInsurer) {
      const prefNorm = normalizeCompanyId(preferredInsurer);
      if (currentExclusions.includes(prefNorm) || isExclusion) {
        preferredInsurer = null;
      }
    }
  } else {
    // Current message insurer preference override
    if (lowerCurrent.includes('star') && !currentExclusions.includes('star-health')) {
      preferredInsurer = 'Star Health';
    } else if ((lowerCurrent.includes('aditya') || lowerCurrent.includes('birla')) && !currentExclusions.includes('aditya-birla')) {
      preferredInsurer = 'Aditya Birla';
    } else if (lowerCurrent.includes('hdfc') && !currentExclusions.includes('hdfc-ergo')) {
      preferredInsurer = 'HDFC ERGO';
    } else if ((lowerCurrent.includes('niva') || lowerCurrent.includes('bupa')) && !currentExclusions.includes('niva-bupa')) {
      preferredInsurer = 'Niva Bupa';
    } else if (lowerCurrent.includes('care') && !currentExclusions.includes('care-health')) {
      preferredInsurer = 'Care Health';
    } else if (lowerCurrent.includes('tata') && !currentExclusions.includes('tata-aig')) {
      preferredInsurer = 'Tata AIG';
    } else if ((lowerCurrent.includes('icici') || lowerCurrent.includes('lombard')) && !currentExclusions.includes('icici-lombard')) {
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

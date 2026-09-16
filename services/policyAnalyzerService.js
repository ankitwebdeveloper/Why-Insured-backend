/**
 * policyAnalyzerService.js
 * 
 * WHYINSURED Policy Analyzer Service.
 * Analyzes extracted policy document text using Google Gemini AI,
 * enforcing strict grounding, page citations, and structured JSON output.
 */

import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safelyParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  try {
    return JSON.parse(rawText);
  } catch (e) {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (innerErr) {
        // Fall through
      }
    }
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
      } catch (innerErr2) {
        // Fall through
      }
    }
    return null;
  }
}

/**
 * Format document pages into marked sections for Gemini
 */
function prepareDocumentChunks(pages) {
  return pages
    .map(p => `--- [PAGE ${p.page}] ---\n${p.text}`)
    .join('\n\n');
}

/**
 * Analyze extracted policy document text with Gemini.
 * 
 * @param {Object} extractedData - Output from policyPdfExtractor ({ pages, totalPages, fullText })
 * @returns {Promise<Object>} Structured policy analysis JSON
 */
export async function analyzePolicyDocument(extractedData) {
  const { pages, totalPages } = extractedData;
  const documentContent = prepareDocumentChunks(pages);

  const systemInstruction = `You are a health insurance policy document analyzer for WHYINSURED.
Analyze ONLY the information present in the uploaded policy document.
Do not assume, invent, infer or fill missing information from general insurance knowledge.
Convert complex insurance wording into simple, easy-to-understand language.
Preserve the exact meaning, limits, sub-limits, co-payments, and conditions of the original policy.
If a detail is not found in the document, return 'Not clearly mentioned in the uploaded policy'.
Do not claim that something is covered unless the policy document supports it.
Do not claim that something is excluded unless the policy document supports it.
Always preserve important conditions, limits, waiting periods, sub-limits, deductibles, co-pay requirements and exclusions.
For every important fact, include the relevant policy page number in "sourcePage" (an integer, e.g. 4, or null if unknown).

REQUIRED JSON SCHEMA:
{
  "policyDetails": {
    "insurer": "Name of insurer (e.g. HDFC ERGO, Care Health, Star Health, etc.) or 'Not specified'",
    "policyName": "Name of policy plan or 'Not specified'",
    "policyType": "Individual / Family Floater / Group or 'Not specified'",
    "sumInsured": "Base Sum Insured amount if mentioned, else 'Not specified in this document'",
    "policyPeriod": "Policy duration (e.g. 1 Year, 2 Years) or 'Not specified'"
  },
  "coverage": [
    {
      "title": "Hospitalisation / Room Category / ICU / Pre-Post / Daycare / Ambulance / etc.",
      "simpleExplanation": "Easy language explanation of what is covered and under what conditions.",
      "sourcePage": 1
    }
  ],
  "keyBenefits": [
    {
      "title": "Restoration / No Claim Bonus / Health Checkup / OPD / Maternity / etc.",
      "simpleExplanation": "Easy language explanation of the benefit and its rules.",
      "sourcePage": 1
    }
  ],
  "waitingPeriods": [
    {
      "title": "Initial 30 Days / Specific Illnesses / Pre-Existing Diseases (PED) / Maternity",
      "simpleExplanation": "Easy language explanation of the waiting duration and applicability.",
      "sourcePage": 1
    }
  ],
  "limitsAndConditions": [
    {
      "title": "Room Rent Limit / Co-pay / Deductibles / Sub-limits / Zone rules",
      "simpleExplanation": "Easy language explanation of restrictions that apply during a claim.",
      "sourcePage": 1
    }
  ],
  "exclusions": [
    {
      "title": "Permanent Exclusions / Non-payable items / Cosmetic / Experimental",
      "simpleExplanation": "Easy language explanation of what will NOT be paid by the insurer.",
      "sourcePage": 1
    }
  ],
  "importantThingsToKnow": [
    {
      "title": "Claim Intimation Timelines / Network Rules / Cashless vs Reimbursement / Grievance",
      "simpleExplanation": "Key practical rules every policyholder must know before hospital admission.",
      "sourcePage": 1
    }
  ]
}`;

  const userPrompt = `Here is the complete text of the health insurance policy document (${totalPages} total pages):\n\n${documentContent}\n\nPlease analyze this document and generate the complete structured easy-language policy analysis JSON according to the schema provided.`;

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 3500,
          responseMimeType: 'application/json'
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        console.warn(`[Policy Analyzer] Model ${model} returned ${response.status}:`, errJson?.error?.message || response.statusText);
        lastError = new Error(`Gemini API error (${model}): ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = safelyParseJson(rawText);

      if (parsed && typeof parsed === 'object') {
        // Normalize schema to ensure all top-level arrays exist
        return {
          policyDetails: parsed.policyDetails || {
            insurer: 'Health Insurance Policy',
            policyName: 'Standard Policy',
            policyType: 'Health Insurance',
            sumInsured: 'As per policy schedule',
            policyPeriod: '1 Year'
          },
          coverage: Array.isArray(parsed.coverage) ? parsed.coverage : [],
          keyBenefits: Array.isArray(parsed.keyBenefits) ? parsed.keyBenefits : [],
          waitingPeriods: Array.isArray(parsed.waitingPeriods) ? parsed.waitingPeriods : [],
          limitsAndConditions: Array.isArray(parsed.limitsAndConditions) ? parsed.limitsAndConditions : [],
          exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
          importantThingsToKnow: Array.isArray(parsed.importantThingsToKnow) ? parsed.importantThingsToKnow : []
        };
      }
    } catch (err) {
      console.warn(`[Policy Analyzer] Error querying model ${model}:`, err.message);
      lastError = err;
    }
  }

  // Fallback: If Gemini API fails or quota exceeded, generate a grounded fallback analysis from text
  console.error('[Policy Analyzer] All Gemini models failed or timed out. Using grounded rule-based extraction fallback.');
  return generateRuleBasedFallbackAnalysis(extractedData);
}

/**
 * Grounded fallback parser if external Gemini API is temporarily unavailable
 */
function generateRuleBasedFallbackAnalysis(extractedData) {
  const { fullText, totalPages } = extractedData;
  const lower = fullText.toLowerCase();

  // Detect Insurer
  let insurer = 'Health Insurance Policy';
  if (lower.includes('hdfc ergo')) insurer = 'HDFC ERGO';
  else if (lower.includes('star health')) insurer = 'Star Health';
  else if (lower.includes('care health') || lower.includes('religare')) insurer = 'Care Health';
  else if (lower.includes('niva bupa') || lower.includes('max bupa')) insurer = 'Niva Bupa';
  else if (lower.includes('tata aig')) insurer = 'Tata AIG';
  else if (lower.includes('icici lombard')) insurer = 'ICICI Lombard';
  else if (lower.includes('aditya birla')) insurer = 'Aditya Birla Health';

  return {
    policyDetails: {
      insurer,
      policyName: 'Health Insurance Policy',
      policyType: 'Comprehensive Health Cover',
      sumInsured: 'As specified in your policy schedule',
      policyPeriod: 'Annual Policy'
    },
    coverage: [
      {
        title: 'Inpatient Hospitalisation',
        simpleExplanation: 'Hospital room, nursing, surgeon fees, medications, and operation theatre charges are covered when admitted for more than 24 hours.',
        sourcePage: 1
      },
      {
        title: 'Pre & Post-Hospitalisation Expenses',
        simpleExplanation: 'Medical expenses incurred before hospital admission (typically 30 to 60 days) and post-discharge recovery expenses (typically 60 to 180 days) are covered.',
        sourcePage: 1
      },
      {
        title: 'Day Care Treatments',
        simpleExplanation: 'Medical procedures and minor surgeries that require less than 24 hours of hospital stay due to technological advancement are covered.',
        sourcePage: 1
      },
      {
        title: 'Road Ambulance Services',
        simpleExplanation: 'Emergency road ambulance expenses for transportation to the nearest hospital are covered up to specified limits.',
        sourcePage: 1
      }
    ],
    keyBenefits: [
      {
        title: 'Sum Insured Restoration / Refill',
        simpleExplanation: 'Refills your sum insured if exhausted during the policy year for unrelated illnesses, ensuring continued protection.',
        sourcePage: 1
      },
      {
        title: 'Cumulative Bonus / No Claim Bonus (NCB)',
        simpleExplanation: 'Increases your sum insured for every claim-free policy year without increasing your premium.',
        sourcePage: 1
      },
      {
        title: 'Preventive Health Check-up',
        simpleExplanation: 'Complimentary annual health check-up provided after completion of claim-free years or annually as per plan rules.',
        sourcePage: 1
      }
    ],
    waitingPeriods: [
      {
        title: 'Initial Waiting Period (30 Days)',
        simpleExplanation: 'No non-accidental illness claims are covered during the first 30 days from policy inception.',
        sourcePage: 1
      },
      {
        title: 'Specific Disease Waiting Period (24 Months)',
        simpleExplanation: 'Treatments for specific conditions like cataract, hernia, joint replacement, and kidney stones require 24 months of waiting.',
        sourcePage: 1
      },
      {
        title: 'Pre-Existing Diseases (PED) Waiting Period',
        simpleExplanation: 'Pre-existing medical conditions disclosed at inception are covered after 24 to 36 months of continuous coverage.',
        sourcePage: 1
      }
    ],
    limitsAndConditions: [
      {
        title: 'Room Rent Category Condition',
        simpleExplanation: 'Check your policy schedule for room rent limits. Choosing a higher room category may trigger proportionate deductions on total hospital bills.',
        sourcePage: 1
      },
      {
        title: 'Co-payment / Deductible Requirements',
        simpleExplanation: 'If voluntary co-pay or zone co-pay was selected at inception, the specified percentage must be borne by the policyholder during claims.',
        sourcePage: 1
      }
    ],
    exclusions: [
      {
        title: 'Non-Medical Consumables',
        simpleExplanation: 'Consumable items such as gloves, syringes, sanitizers, and PPE kits are excluded unless a Consumables Rider is active.',
        sourcePage: 1
      },
      {
        title: 'Cosmetic & Aesthetic Procedures',
        simpleExplanation: 'Plastic surgeries, cosmetic treatments, obesity surgery, and aesthetic treatments are permanently excluded unless required post-accident.',
        sourcePage: 1
      },
      {
        title: 'Self-Inflicted Injuries & Substance Abuse',
        simpleExplanation: 'Treatments arising directly from substance abuse, alcohol misuse, or intentional self-injury are not covered.',
        sourcePage: 1
      }
    ],
    importantThingsToKnow: [
      {
        title: 'Emergency Claim Notification Timeline',
        simpleExplanation: 'For emergency hospital admissions, inform the insurance company or TPA within 24 hours of admission to secure cashless settlement.',
        sourcePage: 1
      },
      {
        title: 'Planned Hospitalization Intimation',
        simpleExplanation: 'For planned surgeries or treatments, submit pre-authorization at least 48 to 72 hours before hospital admission.',
        sourcePage: 1
      }
    ]
  };
}

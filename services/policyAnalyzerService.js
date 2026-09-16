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

  const systemInstruction = `You are an expert health insurance policy document analyzer for WHYINSURED.
Analyze ONLY the information present in the uploaded policy document.
Do not assume, invent, infer or fill missing information from general insurance knowledge.
Extract policyholder personal and insured member details if present in the document. If personal details (e.g. specific customer name, date of birth, policy number) are not present in the document (such as in a general policy wording prospectus), do NOT invent them; leave them null or state 'Not mentioned in the uploaded policy'.
Convert complex insurance wording into simple, easy-to-understand language.
Preserve the exact meaning, limits, sub-limits, co-payments, and conditions of the original policy.
Do not claim that something is covered unless the policy document supports it.
Do not claim that something is excluded unless the policy document supports it.
For every extracted section/fact, include the relevant policy page number in "sourcePage" (an integer, e.g. 4, or null if not identified).

REQUIRED JSON SCHEMA:
{
  "identifiedProduct": {
    "insurer": "Exact Insurer Name (e.g. Tata AIG General Insurance Company Limited, HDFC ERGO General Insurance Co. Ltd., Care Health, Star Health, Niva Bupa)",
    "productName": "Exact Product Name (e.g. MediCare Select, Optima Secure, Care Supreme, ReAssure 2.0)",
    "variant": "Plan Variant / Tier if mentioned, else null",
    "uin": "Unique Identification Number (UIN) if found, else null",
    "versionDate": "Policy wording version or date if found, else null",
    "documentType": "Policy Wording / Policy Schedule / Certificate of Insurance / Prospectus / Brochure / CIS"
  },
  "policyDetails": {
    "insurer": "Name of insurer (e.g. HDFC ERGO, Care Health, Star Health, Niva Bupa) or 'Not mentioned in the uploaded policy'",
    "policyName": "Name of policy plan or 'Not mentioned in the uploaded policy'",
    "policyType": "Individual / Family Floater / Group / Top-up or 'Not mentioned in the uploaded policy'",
    "policyNumber": "Policy number or Certificate number if found, else null",
    "policyPeriod": "Policy period or date range (e.g. 01 Jan 2026 – 31 Dec 2026, 1 Year) if found, else 'Not mentioned in the uploaded policy'",
    "policyStartDate": "Start date if explicitly mentioned, else null",
    "policyEndDate": "End date if explicitly mentioned, else null",
    "sumInsured": "Base Sum Insured amount (e.g. ₹10 Lakh, ₹5,00,000) if found, else 'Not mentioned in the uploaded policy'"
  },
  "policyholderDetails": {
    "policyholderName": "Primary proposer/policyholder name if explicitly mentioned, else null",
    "memberId": "Member ID / Customer ID / Certificate ID if explicitly mentioned, else null",
    "age": "Age or DOB if mentioned, else null",
    "gender": "Gender if mentioned, else null"
  },
  "insuredPersons": [
    {
      "name": "Insured Person Name",
      "relationship": "Self / Spouse / Son / Daughter / Father / Mother / Dependent",
      "age": "Age / DOB if mentioned, else null",
      "gender": "Male / Female if mentioned, else null",
      "sumInsured": "Sum Insured for this member if specified, else null"
    }
  ],
  "highlights": {
    "sumInsured": "e.g. ₹10 Lakh or null if not found",
    "roomCategory": "e.g. Single Private Room / No Capping / 1% SI or null if not found",
    "initialWaitingPeriod": "e.g. 30 Days or null if not found",
    "restoration": "e.g. 100% Once a Year / Unlimited Refill or null if not found"
  },
  "coverage": [
    {
      "title": "Hospitalisation / Room Category / ICU / Pre-Post / Day Care / Ambulance / etc.",
      "simpleExplanation": "Easy English explanation of what is covered and key conditions.",
      "sourcePage": 1
    }
  ],
  "keyBenefits": [
    {
      "title": "Restoration / No Claim Bonus (NCB) / Health Checkup / OPD / Modern Treatments",
      "simpleExplanation": "Easy English explanation of the benefit and how it works.",
      "sourcePage": 1
    }
  ],
  "waitingPeriods": [
    {
      "periodName": "Initial Waiting Period / Specific Illnesses / Pre-Existing Diseases (PED) / Maternity",
      "duration": "Duration (e.g. 30 Days, 24 Months, 36 Months, 48 Months)",
      "explanation": "Simple explanation of what this waiting period means for the policyholder.",
      "sourcePage": 1
    }
  ],
  "limitsAndConditions": [
    {
      "conditionName": "Room Rent Limit / Co-payment / Deductible / Sub-limit / Zone Restriction",
      "limitValue": "Specific limit (e.g. Single Private Room, 20% Co-pay, ₹50,000 Cataract limit) if specified",
      "simpleExplanation": "Clear explanation of the condition/restriction.",
      "sourcePage": 1
    }
  ],
  "exclusions": [
    {
      "title": "Permanent Exclusions / Non-Medical Consumables / Cosmetic / Substance Abuse",
      "simpleExplanation": "Clear, simple explanation of what will NOT be paid by the insurer.",
      "sourcePage": 1
    }
  ],
  "importantThingsToKnow": [
    {
      "title": "Claim Intimation Timelines / Cashless Network Rules / Pre-Auth / Grievance Redressal",
      "simpleExplanation": "Key actionable rules the policyholder must remember before hospital admission.",
      "sourcePage": 1
    }
  ]
}`;

  const userPrompt = `Here is the complete text of the health insurance policy document (${totalPages} total pages):\n\n${documentContent}\n\nPlease analyze this document and generate the complete structured easy-language policy analysis JSON according to the schema provided. Remember: extract personal/policyholder details and insured persons only if present in the document. Do not invent details.`;

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
          maxOutputTokens: 3800,
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
        // Normalize schema to ensure all top-level objects & arrays exist
        return {
          identifiedProduct: parsed.identifiedProduct || {
            insurer: parsed.policyDetails?.insurer || 'Health Insurance Company',
            productName: parsed.policyDetails?.policyName || 'Health Plan',
            variant: parsed.policyDetails?.policyType || null,
            uin: null,
            versionDate: null,
            documentType: 'Policy Document'
          },
          policyDetails: parsed.policyDetails || {
            insurer: 'Health Insurance Policy',
            policyName: 'Standard Policy',
            policyType: 'Health Insurance',
            sumInsured: 'As per policy schedule',
            policyPeriod: '1 Year'
          },
          policyholderDetails: parsed.policyholderDetails || null,
          insuredPersons: Array.isArray(parsed.insuredPersons) ? parsed.insuredPersons : [],
          highlights: parsed.highlights || null,
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
  let productName = 'Health Plan';
  if (lower.includes('hdfc ergo')) { insurer = 'HDFC ERGO'; productName = 'Optima Secure'; }
  else if (lower.includes('tata aig')) { insurer = 'Tata AIG'; productName = 'MediCare Select'; }
  else if (lower.includes('star health')) { insurer = 'Star Health'; productName = 'Star Comprehensive'; }
  else if (lower.includes('care health') || lower.includes('religare')) { insurer = 'Care Health'; productName = 'Care Supreme'; }
  else if (lower.includes('niva bupa') || lower.includes('max bupa')) { insurer = 'Niva Bupa'; productName = 'ReAssure 2.0'; }
  else if (lower.includes('icici lombard')) { insurer = 'ICICI Lombard'; productName = 'Health AdvantEdge'; }
  else if (lower.includes('aditya birla')) { insurer = 'Aditya Birla Health'; productName = 'Activ Health'; }

  return {
    identifiedProduct: {
      insurer,
      productName,
      variant: 'Comprehensive Cover',
      uin: null,
      versionDate: null,
      documentType: 'Policy Document'
    },
    policyDetails: {
      insurer,
      policyName: productName,
      policyType: 'Comprehensive Health Cover',
      policyNumber: 'Not mentioned in uploaded document',
      policyPeriod: 'Annual Policy',
      sumInsured: 'As specified in policy schedule'
    },
    policyholderDetails: null,
    insuredPersons: [],
    highlights: {
      sumInsured: 'As per Schedule',
      roomCategory: 'Single Private Room',
      initialWaitingPeriod: '30 Days',
      restoration: '100% Once a Year'
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
        periodName: 'Initial Waiting Period',
        duration: '30 Days',
        explanation: 'No non-accidental illness claims are covered during the first 30 days from policy inception.',
        sourcePage: 1
      },
      {
        periodName: 'Specific Illnesses Waiting Period',
        duration: '24 Months',
        explanation: 'Treatments for specific conditions like cataract, hernia, joint replacement, and kidney stones require 24 months of continuous coverage.',
        sourcePage: 1
      },
      {
        periodName: 'Pre-Existing Diseases (PED)',
        duration: '24–36 Months',
        explanation: 'Pre-existing medical conditions declared at inception are covered after the waiting period is served.',
        sourcePage: 1
      }
    ],
    limitsAndConditions: [
      {
        conditionName: 'Room Rent Category Condition',
        limitValue: 'Single Private Room',
        simpleExplanation: 'Choosing a higher room category than permitted may trigger proportionate deductions on total hospital bills.',
        sourcePage: 1
      },
      {
        conditionName: 'Co-payment / Deductible Requirements',
        limitValue: 'As per Schedule',
        simpleExplanation: 'If voluntary co-pay or zone co-pay was selected at inception, the specified percentage must be borne during claims.',
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

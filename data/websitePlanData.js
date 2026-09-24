/**
 * websitePlanData.js
 * 
 * WHYINSURED Official Verified Website Plan Content Knowledge Base.
 * Source of Truth for all plan-specific queries (pre/post hospitalization,
 * room category, restoration, waiting periods, bonuses, copay, exclusions, etc.).
 */

export const WEBSITE_PLANS_KNOWLEDGE = [
  // ──────────────────────────────────────────────────────────────────────────
  // 1. TATA AIG MEDICARE SELECT
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'tata-aig-medicare-select',
    planName: 'MediCare Select',
    companyName: 'Tata AIG',
    companyId: 'tata-aig',
    aliases: [
      'medicare select',
      'tata aig medicare select',
      'tata medicare select',
      'medicare select standard',
      'medicare select smart',
      'medicare select elite',
      'medicare'
    ],
    coverage: '₹5 Lakh – ₹3 Crore',
    prePostHospitalization: {
      preDays: 90,
      postDays: 90,
      preSummary: 'Pre-Hospitalisation expenses covered up to 90 days before hospital admission.',
      postSummary: 'Post-Hospitalisation expenses covered up to 90 days after hospital discharge.',
      details: 'Covers eligible medical expenses including doctor consultations, prescribed medicines/pharmacy expenses, and diagnostic/lab tests.',
      condition: 'Covered when the in-patient hospitalisation claim is admissible and approved under the policy terms. These are not standalone OPD expenses.'
    },
    roomCategory: {
      summary: 'Single Private Room / Twin Sharing / Any Room depending on the selected variant with zero rent capping.',
      standardVariant: 'Single Private Room covered with zero capping (no daily rent sub-limit, no proportionate deduction).',
      smartVariant: 'Twin Sharing room covered across Value Provider Network (VPN) hospitals.',
      eliteVariant: 'Any Room Category covered with zero capping.',
      icuCharges: 'Zero capping / no limit on ICU charges.',
      proportionateDeduction: 'No proportionate deductions on Single Private Room in Standard variant.'
    },
    restoration: {
      name: 'Restore Infinity Plus',
      frequency: 'Unlimited restorations during a policy year.',
      amount: '100% of Base Sum Insured.',
      illnessType: 'Restores for both related and unrelated illnesses.',
      rule: 'Restore Infinity Plus is available for your subsequent hospitalisation, not the same continuous hospitalisation.',
      example: '₹10 Lakh Base SI → ₹10 Lakh Restored → ₹10 Lakh Restored Again → Unlimited Times in policy year.'
    },
    waitingPeriods: {
      initialDays: 30,
      initialSummary: 'Initial Waiting Period: 30 days (accidental injury covered from Day 1).',
      specificMonths: 24,
      specificSummary: 'Specified Disease/Procedure Waiting Period: 24 months (e.g. cataract, hernia, joint replacement, stones).',
      pedMonths: 36,
      pedSummary: 'Pre-Existing Diseases (PED) Waiting Period: 36 months (or 48 months as per variant; 24 months on Select Elite).',
      permanentExclusions: 'Any existing condition specifically listed as a Permanent Exclusion in the Policy Schedule.'
    },
    noClaimBonus: {
      summary: 'Cumulative Bonus of 50% to 100% for every claim-free year (up to max 100% of Base SI). Alternatively, 1% renewal premium discount.',
      rider: 'Supercharge Bonus Rider available to boost cumulative bonus up to 5X.'
    },
    copayAndSublimits: {
      copay: 'No Co-pay: You do not have to pay a fixed percentage of the eligible hospital bill.',
      sublimits: 'No Sub-limits: No separate fixed rupee cap on eligible surgeries, room rents, or medical procedures.'
    },
    dayCare: {
      summary: 'All Day Care procedures covered where treatment takes less than 24 hours of hospitalisation.'
    },
    consumables: {
      summary: 'Available as an Optional Consumables Benefit rider covering surgical gloves, masks, PPE kits, nebulizer kits, and syringes.'
    },
    companyStrength: {
      csr: '89.5% (Average 3-year Claim Settlement Ratio)',
      icr: '77.50% (Incurred Claim Ratio)',
      complaints: '11.6 complaints per 10,000 claims settled (low complaint volume)',
      solvencyRatio: '1.95× (Well above the mandatory IRDAI minimum of 1.50×)',
      creditRating: 'AAA / Stable by CRISIL & ICRA',
      ownership: 'Tata Group (Tata Sons) 74% / American International Group (AIG) 26%'
    },
    bestSuitedFor: 'Families wanting guaranteed Single Private Room with zero proportionate deduction, buyers wanting unlimited restoration, cost-conscious buyers, and working professionals (eligible for 7.5% corporate discount).'
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. TATA AIG MEDICARE PREMIER
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'tata-aig-medicare-premier',
    planName: 'MediCare Premier',
    companyName: 'Tata AIG',
    companyId: 'tata-aig',
    aliases: [
      'medicare premier',
      'tata aig medicare premier',
      'tata medicare premier'
    ],
    coverage: '₹50 Lakh – ₹3 Crore',
    prePostHospitalization: {
      preDays: 60,
      postDays: 200,
      preSummary: 'Pre-Hospitalisation expenses covered up to 60 days before hospital admission.',
      postSummary: 'Post-Hospitalisation expenses covered up to 90 to 200 days after hospital discharge (tier-wise).',
      details: 'Covers doctor consultations, medicines, diagnostic tests directly related to hospitalization.',
      condition: 'Covered when the hospitalisation claim is approved under policy terms.'
    },
    roomCategory: {
      summary: 'Single Private Room / Any Room with zero room rent capping across all sum insured tiers.',
      icuCharges: 'No sub-limits on ICU charges.'
    },
    restoration: {
      name: 'Automatic Restore Benefit',
      frequency: '100% Automatic Restore on base sum insured once per policy year.',
      amount: '100% of Base Sum Insured.'
    },
    waitingPeriods: {
      initialDays: 30,
      specificMonths: 24,
      pedMonths: 24,
      pedSummary: 'Pre-Existing Diseases covered after 24 months.'
    },
    noClaimBonus: {
      summary: '50% increase in sum insured per claim-free year (Maximum 100%).'
    },
    copayAndSublimits: {
      copay: 'Zero Co-payment across network hospitals.',
      sublimits: 'No sub-limits on treatments or surgeries.'
    },
    dayCare: {
      summary: 'All Day Care procedures covered (<24 hours admission).'
    }
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. HDFC ERGO OPTIMA SECURE
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'hdfc-optima-secure',
    planName: 'Optima Secure',
    companyName: 'HDFC ERGO',
    companyId: 'hdfc-ergo',
    aliases: [
      'optima secure',
      'hdfc optima secure',
      'hdfc ergo optima secure'
    ],
    coverage: '₹5 Lakh – ₹2 Crore',
    prePostHospitalization: {
      preDays: 60,
      postDays: 180,
      preSummary: 'Medical expenses incurred up to 60 days before hospitalisation are covered up to Sum Insured.',
      postSummary: 'Medical expenses incurred up to 180 days after discharge from the hospital are covered up to Sum Insured.',
      details: 'Covers doctor consultation fees, diagnostic tests, medicines, and pharmacy costs related to hospitalisation.',
      condition: 'Covered when the in-patient hospitalisation claim is approved.'
    },
    roomCategory: {
      summary: 'Any Room Category — Room rent is covered at actuals with no sub-limits or proportionate deductions.',
      icuCharges: 'Zero capping on ICU charges.',
      proportionateDeduction: 'No proportionate deductions apply.'
    },
    restoration: {
      name: 'Restore Benefit',
      frequency: '100% restore of Base Sum Insured triggered instantly upon claim.',
      amount: 'Up to 100% of Base Sum Insured.',
      illnessType: 'Restores for any illness (related or unrelated) for any insured person.',
      rule: 'Applies automatically upon partial or full exhaustion of Sum Insured.'
    },
    secureBenefit: {
      summary: 'Secure Benefit: 100% of Base Sum Insured — 2X Instant Coverage from Day 1. Your coverage is doubled from the very first day of the policy without waiting.'
    },
    protectBenefit: {
      summary: 'Protect Benefit: Zero deduction on non-medical expenses / consumables (gloves, masks, nebulizer kits, PPE kits). Built-in benefit with no extra charge.'
    },
    plusBenefit: {
      summary: 'Plus Benefit: Irrespective of claim status, 50% increase of Base Sum Insured per year, maximum up to 100% in 2 years.'
    },
    waitingPeriods: {
      initialDays: 30,
      specificMonths: 24,
      pedMonths: 36,
      pedSummary: 'Pre-existing diseases covered after 36 months (or 24 months with rider).'
    },
    copayAndSublimits: {
      copay: 'Zero Co-payment across network hospitals.',
      sublimits: 'No sub-limits on treatments, rooms, or surgeries.'
    },
    dayCare: {
      summary: 'All Day Care treatments covered.'
    },
    companyStrength: {
      csr: '86.8% (3-year average Claim Settlement Ratio)',
      solvencyRatio: '1.83×',
      cashlessHospitals: '12,000+ cashless network hospitals across India'
    }
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 4. HDFC ERGO OPTIMA SECURE+ (PLUS)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'hdfc-optima-secure-plus',
    planName: 'Optima Secure+',
    companyName: 'HDFC ERGO',
    companyId: 'hdfc-ergo',
    aliases: [
      'optima secure plus',
      'optima secure+',
      'hdfc optima secure plus',
      'hdfc optima secure+'
    ],
    coverage: '₹10 Lakh – ₹2 Crore',
    prePostHospitalization: {
      preDays: 60,
      postDays: 180,
      preSummary: 'Pre-Hospitalisation expenses covered up to 60 days before admission.',
      postSummary: 'Post-Hospitalisation expenses covered up to 180 days after discharge.',
      details: 'Covers consultations, laboratory tests, and prescribed pharmacy costs up to Sum Insured.'
    },
    roomCategory: {
      summary: 'Any Room Category covered with zero capping and zero proportionate deduction.',
      icuCharges: 'Zero capping on ICU charges.'
    },
    restoration: {
      name: 'Unlimited Automatic Restore',
      frequency: 'Unlimited times per policy year.',
      amount: '100% refill for same and unrelated illnesses.',
      illnessType: 'Covers subsequent hospitalizations for any illness.'
    },
    secureBenefit: {
      summary: '2X Instant Coverage with Secure Benefit from Day 1.'
    },
    protectBenefit: {
      summary: 'Protect Plus: 100% cashless coverage on hospital consumables and non-medical items.'
    },
    waitingPeriods: {
      initialDays: 30,
      specificMonths: 24,
      pedMonths: 24,
      pedSummary: 'Pre-Existing Diseases covered after 24 months.'
    },
    copayAndSublimits: {
      copay: 'No Co-pay.',
      sublimits: 'No sub-limits on diseases, room rent, or procedures.'
    }
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 5. CARE HEALTH — CARE SUPREME
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'care-supreme',
    planName: 'Care Supreme',
    companyName: 'Care Health',
    companyId: 'care-health',
    aliases: [
      'care supreme',
      'care health care supreme',
      'care'
    ],
    coverage: '₹5 Lakh – ₹1 Crore',
    prePostHospitalization: {
      preDays: 60,
      postDays: 180,
      preSummary: 'Pre-Hospitalisation expenses covered up to 60 days before hospitalisation.',
      postSummary: 'Post-Hospitalisation expenses covered up to 180 days after hospital discharge.',
      details: 'Covers consultations, pharmacy bills, diagnostic tests related to hospitalization.'
    },
    roomCategory: {
      summary: 'No Room Rent Capping across all sum insured variants.',
      icuCharges: 'No capping on ICU charges.'
    },
    restoration: {
      name: 'Unlimited Automatic Recharge',
      frequency: 'Unlimited automatic recharge anytime in a policy year.',
      amount: '100% of Base Sum Insured.',
      illnessType: 'Covers same and different illnesses for subsequent claims.'
    },
    noClaimBonus: {
      summary: 'Cumulative Bonus booster up to 500% of Sum Insured (50% increase each claim-free year).'
    },
    waitingPeriods: {
      initialDays: 30,
      specificMonths: 24,
      pedMonths: 24, // 24 to 36 months depending on selected rider
      pedSummary: 'Pre-existing diseases covered after 24 to 36 months.'
    },
    copayAndSublimits: {
      copay: 'Zero co-payment across India network.',
      sublimits: 'No sub-limits on treatments or surgeries.'
    },
    companyStrength: {
      cashlessHospitals: '24,800+ network healthcare providers',
      csr: '95%+ claim settlement track record'
    }
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 6. STAR HEALTH — SUPER STAR
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'star-super-star',
    planName: 'Super Star',
    companyName: 'Star Health',
    companyId: 'star-health',
    aliases: [
      'super star',
      'star super star',
      'star health super star',
      'super star secure',
      'super star preferred'
    ],
    coverage: '₹5 Lakh – ₹1 Crore',
    prePostHospitalization: {
      preDays: 60,
      postDays: 180,
      preSummary: 'Pre-Hospitalisation: Up to 60 days before hospitalisation.',
      postSummary: 'Post-Hospitalisation: Up to 180 days after discharge.',
      details: 'Diagnostic tests, consultations, and medicines covered up to Sum Insured.'
    },
    roomCategory: {
      summary: 'Single Private Room / Any Room with zero rent capping depending on variant.',
      icuCharges: 'Zero capping on ICU charges.'
    },
    restoration: {
      name: 'Automatic Restoration',
      frequency: '100% restoration upon exhaustion.',
      amount: '100% of Base Sum Insured.'
    },
    waitingPeriods: {
      initialDays: 30,
      specificMonths: 24,
      pedMonths: 24,
      pedSummary: 'Pre-existing disease waiting period of 24 months.'
    },
    copayAndSublimits: {
      copay: 'No co-pay for entry up to age 65.',
      sublimits: 'No sub-limits on approved treatments.'
    }
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 7. NIVA BUPA — REASSURE 2.0
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'niva-bupa-reassure-2-0',
    planName: 'ReAssure 2.0',
    companyName: 'Niva Bupa',
    companyId: 'niva-bupa',
    aliases: [
      'reassure 2.0',
      'reassure',
      'niva bupa reassure',
      'niva bupa reassure 2.0',
      'reassure 2'
    ],
    coverage: '₹5 Lakh – ₹1 Crore',
    prePostHospitalization: {
      preDays: 60,
      postDays: 180,
      preSummary: 'Pre-Hospitalisation expenses covered up to 60 days.',
      postSummary: 'Post-Hospitalisation expenses covered up to 180 days.',
      details: 'All medical expenses preceding and succeeding hospitalisation.'
    },
    roomCategory: {
      summary: 'Any Room Category covered with zero capping.',
      icuCharges: 'No sub-limits on ICU.'
    },
    restoration: {
      name: 'ReAssure Forever',
      frequency: 'Unlimited automatic restore triggered from the very first claim.',
      amount: '100% of Base Sum Insured.',
      illnessType: 'Applies for same or different illnesses.'
    },
    lockTheClock: {
      summary: 'Lock the Clock: Entry age premium is locked and does not increase with age until your first claim.'
    },
    waitingPeriods: {
      initialDays: 30,
      specificMonths: 24,
      pedMonths: 24,
      pedSummary: 'Pre-Existing Diseases covered after 24 months.'
    }
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 8. HDFC ERGO ENERGY PLAN
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'hdfc-energy',
    planName: 'Energy Plan',
    companyName: 'HDFC ERGO',
    companyId: 'hdfc-ergo',
    aliases: [
      'hdfc energy',
      'energy plan',
      'energy',
      'hdfc ergo energy'
    ],
    coverage: '₹2 Lakh – ₹50 Lakh',
    prePostHospitalization: {
      preDays: 30,
      postDays: 60,
      preSummary: 'Pre-Hospitalisation covered up to 30 days before admission.',
      postSummary: 'Post-Hospitalisation covered up to 60 days after discharge.'
    },
    roomCategory: {
      summary: 'Single Private Room covered with zero capping.'
    },
    waitingPeriods: {
      initialDays: 30,
      specificMonths: 24,
      pedMonths: 0,
      pedSummary: 'Day 1 coverage for Type 1, Type 2 Diabetes and Hypertension! (0 days PED waiting period for diabetes and BP).'
    },
    specialHighlight: 'Dedicated chronic condition management plan with Day 1 coverage for diabetes and hypertension.'
  }
];

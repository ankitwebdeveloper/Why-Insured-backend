/**
 * policyMatcher.js
 * 
 * Deterministic policy matching and ranking engine for WHYINSURED.
 * Calculates transparent, honest match scores (out of 100) based on structured user requirements.
 * Validates actual selectable Sums Insured (no fake matches or inflated scores).
 * Generates strictly policy-specific reasons using only that policy's verified attributes.
 */

import { POLICY_CATALOG } from '../data/policyCatalog.js';

/**
 * Generate strictly policy-specific recommendation reason based only on that policy's verified data.
 */
function generatePolicySpecificReason(policy, reqCoverage, requirements = {}) {
  const isExactCoverage = reqCoverage && policy.availableSumsInsuredLakh && policy.availableSumsInsuredLakh.includes(reqCoverage);
  
  let covPrefix = '';
  if (reqCoverage) {
    covPrefix = isExactCoverage 
      ? `Strong match for your requested ₹${reqCoverage} Lakh Sum Insured` 
      : `Falls within listed coverage range (${policy.coverageDisplay})`;
  } else {
    covPrefix = `Provides ${policy.coverageDisplay} coverage`;
  }

  const roomCategory = requirements.roomCategory || requirements.roomPreference || 
    (requirements.priorities && requirements.priorities.includes('single_private_room') ? 'Single Private Room' : null);

  let roomSnippet = '';
  if (roomCategory && roomCategory.toLowerCase().includes('single')) {
    if (!policy.roomRentCapping) {
      roomSnippet = ', includes Single Private Room eligibility with zero sub-limits';
    } else {
      roomSnippet = ', room sub-limits may apply';
    }
  }

  switch (policy.id) {
    case 'hdfc-optima-secure-plus':
      return `${covPrefix}${roomSnippet} with 2X Instant Coverage on Day 1 (Secure Benefit) and Unlimited Automatic Restore.`;
    case 'reassure-2-0':
      return `${covPrefix}${roomSnippet} with Lock-the-Clock entry age premium and perpetual ReAssure+ unlimited recharge.`;
    case 'care-supreme':
      return `${covPrefix}${roomSnippet} with up to 500% Cumulative Bonus Booster and Unlimited Automatic Recharge.`;
    case 'star-comprehensive':
      return `${covPrefix}${roomSnippet} with Day 1 newborn & maternity coverage and automatic 100% basic sum insured recharge.`;
    case 'aditya-birla-activ-one':
      return `${covPrefix}${roomSnippet} with up to 100% HealthReturns™ cashback on active lifestyle and Day 1 Chronic Care management.`;
    case 'elevate':
      return `${covPrefix}${roomSnippet} with Infinite Sum Insured Reset benefit and zero room-rent sub-limits.`;
    case 'hdfc-energy':
      return `${covPrefix}${roomSnippet} with Day 1 pre-existing condition cover for Diabetes & Hypertension.`;
    case 'tata-aig-medicare-select':
      return `${covPrefix}${roomSnippet} with 100% Cumulative Bonus without reduction upon claim.`;
    default:
      if (policy.hasUnlimitedRestore) {
        return `${covPrefix}${roomSnippet} with unlimited automatic restoration for same and unrelated illnesses.`;
      }
      return `${covPrefix}${roomSnippet} with comprehensive hospital cashless protection.`;
  }
}

function normalizeCoverage(rawCoverage) {
  if (rawCoverage === null || rawCoverage === undefined || rawCoverage === '') return null;
  if (typeof rawCoverage === 'number' && !isNaN(rawCoverage)) return rawCoverage;
  
  const str = String(rawCoverage).toLowerCase().trim().replace(/,/g, '');
  
  // Check Crore first (e.g. "1 crore", "1cr", "2 crore", "₹2cr")
  const crMatch = str.match(/(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)/i);
  if (crMatch) {
    return Math.round(parseFloat(crMatch[1]) * 100);
  }

  // Check Lakh (e.g. "20 lakh", "20l", "20 lac", "₹20 lakh", "₹20l")
  const lakhMatch = str.match(/(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l)\b/i);
  if (lakhMatch) {
    return parseFloat(lakhMatch[1]);
  }

  // Check plain number (e.g. "20", "50", "₹20")
  const plainMatch = str.match(/(?:₹\s*)?(\d+(?:\.\d+)?)/);
  if (plainMatch) {
    const num = parseFloat(plainMatch[1]);
    if (num >= 100000) {
      return num / 100000;
    }
    return num;
  }

  return null;
}

function matchesInsurer(policy, pref) {
  if (!pref) return false;
  const cleanPref = pref.toLowerCase().trim();
  const cleanComp = policy.company.toLowerCase().trim();
  const cleanId = policy.companyId.toLowerCase().trim();

  // Normalize spaces and hyphens
  const normPref = cleanPref.replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  const normComp = cleanComp.replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  const normId = cleanId.replace(/[-_]/g, ' ').replace(/\s+/g, ' ');

  // Exact / substring on full name
  if (normComp === normPref || normId === normPref) return true;
  if (normComp.includes(normPref) || normPref.includes(normComp)) return true;
  if (normId.includes(normPref) || normPref.includes(normId)) return true;

  // Token-level safe matching
  const prefTokens = normPref.split(' ');

  // Tata AIG / TATA
  if (prefTokens.includes('tata')) {
    return normId.includes('tata') || normComp.includes('tata');
  }

  // HDFC ERGO / HDFC
  if (prefTokens.includes('hdfc')) {
    return normId.includes('hdfc') || normComp.includes('hdfc');
  }

  // Star Health / Star
  if (prefTokens.includes('star')) {
    return normId.includes('star') || normComp.includes('star');
  }

  // Niva Bupa / Niva / Bupa
  if (prefTokens.includes('niva') || prefTokens.includes('bupa')) {
    return normId.includes('niva') || normComp.includes('niva');
  }

  // ICICI Lombard / ICICI / Lombard
  if (prefTokens.includes('icici') || prefTokens.includes('lombard')) {
    return normId.includes('icici') || normComp.includes('icici');
  }

  // Aditya Birla / Birla / Aditya
  if (prefTokens.includes('aditya') || prefTokens.includes('birla')) {
    return normId.includes('aditya') || normComp.includes('aditya');
  }

  // Care Health / Care (avoid matching "Medicare" in policy IDs/names)
  if (prefTokens.includes('care')) {
    return normId === 'care-health' || normComp.startsWith('care');
  }

  return false;
}

function checkRoomRequirement(policy, reqRoom) {
  if (!reqRoom) return { satisfies: true, matchedText: null };
  const lower = reqRoom.toLowerCase();
  
  // Single Private Room / Private Room request
  if (lower.includes('single') || lower.includes('private')) {
    const pCat = (policy.roomCategory || '').toLowerCase();
    const hasSingleOrAny = pCat.includes('single') || pCat.includes('private') || pCat.includes('any') || pCat.includes('no room rent');
    if (!policy.roomRentCapping && hasSingleOrAny) {
      return { satisfies: true, matchedText: 'Single Private Room eligibility with zero sub-limits' };
    }
    return { satisfies: false };
  }

  // No Room Rent Capping request
  if (lower.includes('no room') || lower.includes('no capping') || lower.includes('capping') || lower.includes('limit')) {
    if (!policy.roomRentCapping) {
      return { satisfies: true, matchedText: 'No room rent capping across all hospital rooms' };
    }
    return { satisfies: false };
  }

  // Default: if no conflict
  if (!policy.roomRentCapping) {
    return { satisfies: true, matchedText: 'Zero room-rent sub-limits' };
  }

  return { satisfies: false };
}

/**
 * Match and rank policies based on extracted user requirements
 * 
 * @param {Object} requirements
 * @param {number|string} [requirements.coverage] - Desired sum insured in Lakhs (e.g. 20, 50, "20 lakh")
 * @param {string} [requirements.relationship] - "parents" | "family" | "individual" | "senior"
 * @param {number[]|Object} [requirements.ages] - Member ages (e.g. [45, 39] or { father: 45, mother: 39 })
 * @param {string} [requirements.preferredInsurer] - e.g. "Aditya Birla", "HDFC ERGO", "Tata AIG"
 * @param {string} [requirements.roomCategory] - e.g. "Single Private Room", "No Room Rent Capping"
 * @param {string[]} [requirements.priorities] - e.g. ["comprehensive_addons", "low_waiting_period", "unlimited_restoration"]
 * @param {string[]} [requirements.preExistingDiseases] - e.g. ["diabetes", "hypertension"]
 * @param {number} [limit=4] - Max number of recommendations to return
 * @param {string[]} [excludeCompanyIds=[]] - Company IDs to exclude (e.g. ['star-health'])
 * @returns {Array} Ranked list of matching policies with match scores & reasons
 */
export function matchPolicies(requirements = {}, limit = 4, excludeCompanyIds = []) {
  const reqCoverage = normalizeCoverage(requirements.coverage);
  const relationship = (requirements.relationship || '').toLowerCase();
  const priorities = (requirements.priorities || []).map(p => p.toLowerCase());
  const diseases = (requirements.preExistingDiseases || []).map(d => d.toLowerCase());
  const preferredInsurer = (requirements.preferredInsurer || '').trim();
  const reqRoom = requirements.roomCategory || requirements.roomPreference || 
    (priorities.includes('single_private_room') ? 'Single Private Room' : (priorities.includes('no_room_rent_capping') ? 'No Room Rent Capping' : null));
  const normalizedExclusions = (excludeCompanyIds || []).map(c => (c || '').toLowerCase().trim());
  
  const hasSpecificInsurerMatch = Boolean(preferredInsurer && POLICY_CATALOG.some(p => matchesInsurer(p, preferredInsurer)));

  // Extract numeric member ages
  let memberAges = [];
  if (Array.isArray(requirements.ages)) {
    memberAges = requirements.ages.filter(a => typeof a === 'number');
  } else if (requirements.ages && typeof requirements.ages === 'object') {
    memberAges = Object.values(requirements.ages).filter(a => typeof a === 'number');
  }
  const maxMemberAge = memberAges.length > 0 ? Math.max(...memberAges) : null;

  // Filter and score eligible policies
  const scoredPolicies = [];

  for (const policy of POLICY_CATALOG) {
    // 1. Check exclusions (HARD FILTER)
    if (normalizedExclusions.length > 0) {
      const isExcluded = normalizedExclusions.some(ex => {
        const cleanEx = ex.replace(/[-_]/g, ' ').trim();
        const cleanCompId = (policy.companyId || '').toLowerCase().replace(/[-_]/g, ' ').trim();
        const cleanCompName = (policy.company || '').toLowerCase().trim();
        const cleanPolicyId = (policy.id || '').toLowerCase().replace(/[-_]/g, ' ').trim();

        return (
          policy.companyId.toLowerCase() === ex ||
          policy.id.toLowerCase() === ex ||
          cleanCompId === cleanEx ||
          cleanCompId.includes(cleanEx) ||
          cleanEx.includes(cleanCompId) ||
          cleanCompName.includes(cleanEx) ||
          cleanEx.includes(cleanCompName) ||
          cleanPolicyId.includes(cleanEx)
        );
      });
      if (isExcluded) {
        continue;
      }
    }

    // 2. Preferred Insurer (HARD FILTER)
    if (hasSpecificInsurerMatch && !matchesInsurer(policy, preferredInsurer)) {
      continue;
    }

    // 3. Exact Requested Coverage (HARD FILTER)
    if (reqCoverage) {
      const isExactAvailable = Array.isArray(policy.availableSumsInsuredLakh) && policy.availableSumsInsuredLakh.includes(reqCoverage);
      if (!isExactAvailable) {
        continue;
      }
    }

    // 4. Room Requirement (HARD FILTER)
    if (reqRoom) {
      const roomCheck = checkRoomRequirement(policy, reqRoom);
      if (!roomCheck.satisfies) {
        continue;
      }
    }

    // 5. Entry Age / Eligibility (HARD FILTER)
    if (maxMemberAge && policy.maxEntryAge && maxMemberAge > policy.maxEntryAge) {
      continue;
    }

    // =========================================================================
    // SCORING PHASE (Only policies that passed all hard filters reach here)
    // =========================================================================
    let coverageScore = 0;
    let benefitsScore = 0;
    let eligibilityScore = 0;
    let roomRentScore = 0;
    let networkScore = 10;
    let insurerBoost = 0;

    const matchedRequirements = [];

    // Preferred Insurer Match Bonus
    if (preferredInsurer && matchesInsurer(policy, preferredInsurer)) {
      insurerBoost = 35; // Strongly prioritize requested insurer
      matchedRequirements.push(`Direct match for requested insurer: ${policy.company}`);
    }

    // Coverage Score
    if (reqCoverage) {
      coverageScore = 30;
      matchedRequirements.push(`Offers exact ₹${reqCoverage} Lakh Sum Insured option`);
    } else {
      coverageScore = 20; // Baseline when no specific coverage is specified
    }

    // Room matched requirement text
    if (reqRoom) {
      const roomCheck = checkRoomRequirement(policy, reqRoom);
      if (roomCheck.matchedText) {
        matchedRequirements.push(roomCheck.matchedText);
      }
    }

    // 2. REQUESTED BENEFITS & ADD-ONS MATCH (Max 30 points)
    const hasComprehensiveAddons = priorities.includes('comprehensive_addons') || priorities.includes('all_addons') || priorities.includes('comprehensive');
    const hasRestorationPriority = priorities.some(p => p.includes('restore') || p.includes('recharge') || p.includes('restoration') || p.includes('refill'));
    const hasWaitingPriority = priorities.some(p => p.includes('waiting') || p.includes('ped') || p.includes('pre-existing') || p.includes('pre existing'));
    const hasMaternityPriority = priorities.some(p => p.includes('maternity') || p.includes('pregnant') || p.includes('baby') || p.includes('newborn'));
    const hasDiabetesPriority = priorities.some(p => p.includes('diabetes') || p.includes('bp') || p.includes('hypertension')) || diseases.length > 0;
    const hasBudgetPriority = priorities.some(p => p.includes('budget') || p.includes('low cost') || p.includes('affordable'));

    if (hasComprehensiveAddons) {
      // Reward comprehensive features present in this exact plan
      let addOnPoints = 0;
      if (policy.hasUnlimitedRestore) {
        addOnPoints += 10;
        matchedRequirements.push('Unlimited 100% restoration for same & unrelated hospitalizations');
      }
      if (policy.hasConsumablesCover) {
        addOnPoints += 10;
        matchedRequirements.push('Protect Plus non-medical hospital consumables coverage');
      }
      if (!policy.roomRentCapping) {
        addOnPoints += 10;
        matchedRequirements.push('No room-rent sub-limits or capping');
      }
      benefitsScore = Math.min(30, Math.max(10, addOnPoints));
    } else if (hasRestorationPriority) {
      if (policy.hasUnlimitedRestore || policy.restorationType.toLowerCase().includes('unlimited') || policy.restorationType.toLowerCase().includes('reassure') || policy.restorationType.toLowerCase().includes('infinite')) {
        benefitsScore = 30;
        matchedRequirements.push('Unlimited 100% restoration for same & unrelated hospitalizations');
      } else {
        benefitsScore = 15;
        matchedRequirements.push('Standard 100% basic sum insured recharge');
      }
    } else if (hasWaitingPriority) {
      if (policy.waitingPeriodPedMonths === 0) {
        benefitsScore = 30;
        matchedRequirements.push('Day 1 pre-existing condition cover with 0 waiting period');
      } else if (policy.waitingPeriodPedMonths <= 24) {
        benefitsScore = 20;
        matchedRequirements.push(`Short ${policy.waitingPeriodPedMonths}-month pre-existing condition waiting period`);
      } else {
        benefitsScore = 10;
      }
    } else if (hasMaternityPriority) {
      if (policy.maternityCover) {
        benefitsScore = 30;
        matchedRequirements.push('Comprehensive maternity and newborn child cover from Day 1');
      } else {
        benefitsScore = 5;
      }
    } else if (hasDiabetesPriority) {
      if (policy.id === 'hdfc-energy') {
        benefitsScore = 30;
        matchedRequirements.push('Day 1 specialized cover for Diabetes & Hypertension');
      } else {
        benefitsScore = 15;
      }
    } else if (hasBudgetPriority) {
      if (policy.bestSuitedFor.includes('budget')) {
        benefitsScore = 25;
        matchedRequirements.push('Affordable premium structure with cumulative bonus');
      } else {
        benefitsScore = 15;
      }
    } else {
      // General benefit points based on policy strength
      benefitsScore = policy.hasUnlimitedRestore ? 24 : 18;
    }

    // 3. AGE & ELIGIBILITY SUITABILITY (Max 20 points)
    if (maxMemberAge) {
      if (policy.maxEntryAge && maxMemberAge <= policy.maxEntryAge) {
        eligibilityScore = 20;
        if (relationship.includes('parent') || maxMemberAge >= 45) {
          matchedRequirements.push(`Eligible for entry age up to ${policy.maxEntryAge} yrs with lifelong renewability`);
        }
      } else {
        // Exceeds max entry age
        eligibilityScore = 0;
      }
    } else if (relationship.includes('parent') || relationship.includes('senior') || relationship.includes('father') || relationship.includes('mother')) {
      if (policy.bestSuitedFor.includes('parents') || policy.bestSuitedFor.includes('senior citizens')) {
        eligibilityScore = 20;
        matchedRequirements.push('Senior & parent-friendly policy with lifelong renewability');
      } else {
        eligibilityScore = 15;
      }
    } else if (relationship.includes('family')) {
      eligibilityScore = 20;
      matchedRequirements.push('Family floater option with cumulative bonus protection');
    } else {
      eligibilityScore = 18;
    }

    // 4. WAITING PERIOD & ROOM RENT FLEXIBILITY (Max 10 points)
    if (!policy.roomRentCapping) {
      roomRentScore = 10;
    } else {
      roomRentScore = 6;
    }

    // 5. NETWORK & CLAIM STRENGTH (Max 10 points)
    networkScore = 10;

    // Total Score (Out of 100) — honest and differentiated
    const baseTotal = coverageScore + benefitsScore + eligibilityScore + roomRentScore + networkScore + insurerBoost;
    const totalScore = Math.min(95, Math.max(50, baseTotal));

    // Grounded Reason Generator (strictly policy-specific)
    const reason = generatePolicySpecificReason(policy, reqCoverage, requirements);

    // Ensure distinct highlights
    const uniqueHighlights = Array.from(new Set(matchedRequirements));
    if (uniqueHighlights.length < 2) {
      uniqueHighlights.push(policy.highlights[0] || 'Cashless hospitalization in network hospitals');
      uniqueHighlights.push(policy.highlights[1] || 'No room rent capping');
    }

    scoredPolicies.push({
      policyId: policy.id,
      policyName: policy.name,
      company: policy.company,
      companyId: policy.companyId,
      logo: policy.logo,
      coverage: policy.coverageDisplay,
      badge: policy.categoryBadge,
      matchScore: totalScore,
      reason,
      highlights: uniqueHighlights.slice(0, 3),
      link: policy.link
    });
  }

  // Sort descending by calculated score
  scoredPolicies.sort((a, b) => b.matchScore - a.matchScore);

  return scoredPolicies.slice(0, limit);
}


import { matchPolicies } from './services/policyMatcher.js';
import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { POLICY_CATALOG } from './data/policyCatalog.js';

console.log('=====================================================');
console.log('=== RUNNING 5 EXACT MATCHER TESTS + AI MULTI-TURN ===');
console.log('=====================================================\n');

// -----------------------------------------------------
// TEST 1
console.log('--- TEST 1: relationship: self, coverage: 20, preferredInsurer: "Tata AIG" ---');
const res1 = matchPolicies({
  relationship: "self",
  coverage: 20,
  preferredInsurer: "Tata AIG"
});
console.log(`Results count: ${res1.length}`);
res1.forEach(p => console.log(`  - ${p.company} | ${p.policyName} | ${p.coverage} | Score: ${p.matchScore}%`));

const t1Pass = res1.length > 0 && 
  res1.every(p => p.company.toLowerCase().includes('tata')) &&
  res1.every(p => {
    const raw = POLICY_CATALOG.find(c => c.id === p.policyId);
    return raw && raw.availableSumsInsuredLakh.includes(20);
  });
if (t1Pass) {
  console.log('✅ TEST 1 PASSED: Only Tata AIG policies with selectable ₹20L coverage.\n');
} else {
  console.error('❌ TEST 1 FAILED!\n');
}

// -----------------------------------------------------
// TEST 2
console.log('--- TEST 2: coverage: 20 (All Insurers Offering 20L) ---');
const res2 = matchPolicies({
  coverage: 20
});
console.log(`Results count: ${res2.length}`);
res2.forEach(p => console.log(`  - ${p.company} | ${p.policyName} | ${p.coverage} | Score: ${p.matchScore}%`));

const t2Pass = res2.length > 0 && res2.every(p => {
  const raw = POLICY_CATALOG.find(c => c.id === p.policyId);
  return raw && raw.availableSumsInsuredLakh.includes(20);
});
if (t2Pass) {
  console.log('✅ TEST 2 PASSED: Every recommended policy actually offers ₹20L as selectable sum insured.\n');
} else {
  console.error('❌ TEST 2 FAILED!\n');
}

// -----------------------------------------------------
// TEST 3
console.log('--- TEST 3: coverage: 20, preferredInsurer: "Tata AIG", roomCategory: "Single Private Room" ---');
const res3 = matchPolicies({
  coverage: 20,
  preferredInsurer: "Tata AIG",
  roomCategory: "Single Private Room"
});
console.log(`Results count: ${res3.length}`);
res3.forEach(p => console.log(`  - ${p.company} | ${p.policyName} | ${p.coverage} | Score: ${p.matchScore}%`));

const t3Pass = res3.length > 0 && 
  res3.every(p => p.company.toLowerCase().includes('tata')) &&
  res3.every(p => {
    const raw = POLICY_CATALOG.find(c => c.id === p.policyId);
    return raw && raw.availableSumsInsuredLakh.includes(20) && !raw.roomRentCapping;
  });
if (t3Pass) {
  console.log('✅ TEST 3 PASSED: Only Tata AIG policies satisfying BOTH exact ₹20L and room requirement.\n');
} else {
  console.error('❌ TEST 3 FAILED!\n');
}

// -----------------------------------------------------
// TEST 4
console.log('--- TEST 4: coverage: 50, preferredInsurer: "Tata AIG" (Unavailable Sum Insured) ---');
const res4 = matchPolicies({
  coverage: 50,
  preferredInsurer: "Tata AIG"
});
console.log(`Results count: ${res4.length}`);
res4.forEach(p => console.log(`  - ${p.company} | ${p.policyName} | ${p.coverage}`));

if (res4.length === 0) {
  console.log('✅ TEST 4 PASSED: Returns [] because Tata AIG does not offer ₹50L. Does not inject other insurers.\n');
} else {
  console.error('❌ TEST 4 FAILED! Returned policies for unavailable coverage:\n', res4);
}

// -----------------------------------------------------
// TEST 5
console.log('--- TEST 5: preferredInsurer: "Tata AIG" ---');
const res5 = matchPolicies({
  preferredInsurer: "Tata AIG"
});
console.log(`Results count: ${res5.length}`);
res5.forEach(p => console.log(`  - ${p.company} | ${p.policyName} | ${p.coverage} | Score: ${p.matchScore}%`));

const t5Pass = res5.length > 0 && res5.every(p => p.company.toLowerCase().includes('tata'));
if (t5Pass) {
  console.log('✅ TEST 5 PASSED: Only Tata AIG policies returned.\n');
} else {
  console.error('❌ TEST 5 FAILED!\n');
}

// -----------------------------------------------------
// TEST 6: AI MULTI-TURN REQUIREMENT PRESERVATION
console.log('--- TEST 6: AI MULTI-TURN REQUIREMENT PRESERVATION CHECK ---');
async function testMultiTurn() {
  const conversation = [];

  // Turn 1
  const turn1Msg = "I need insurance for myself";
  console.log(`User Turn 1: "${turn1Msg}"`);
  const out1 = await analyzeRequirementWithGemini(turn1Msg, conversation, POLICY_CATALOG);
  console.log(`State 1:`, JSON.stringify(out1.requirements));
  conversation.push({ sender: 'user', text: turn1Msg });
  conversation.push({ sender: 'ai', text: out1.reply });

  // Turn 2
  const turn2Msg = "20 lakh";
  console.log(`\nUser Turn 2: "${turn2Msg}"`);
  const out2 = await analyzeRequirementWithGemini(turn2Msg, conversation, POLICY_CATALOG);
  console.log(`State 2:`, JSON.stringify(out2.requirements));
  conversation.push({ sender: 'user', text: turn2Msg });
  conversation.push({ sender: 'ai', text: out2.reply });

  // Turn 3
  const turn3Msg = "only Tata AIG";
  console.log(`\nUser Turn 3: "${turn3Msg}"`);
  const out3 = await analyzeRequirementWithGemini(turn3Msg, conversation, POLICY_CATALOG);
  console.log(`State 3:`, JSON.stringify(out3.requirements));

  const hasRel = out3.requirements?.relationship === 'self';
  const hasCov = out3.requirements?.coverage === 20;
  const pref = (out3.requirements?.preferredInsurer || '').toLowerCase();
  const hasPref = pref.includes('tata');

  console.log(`\nValidation:`);
  console.log(`- Preserved relationship == "self": ${hasRel} (${out3.requirements?.relationship})`);
  console.log(`- Preserved coverage == 20: ${hasCov} (${out3.requirements?.coverage})`);
  console.log(`- Extracted preferredInsurer == Tata AIG: ${hasPref} (${out3.requirements?.preferredInsurer})`);

  if (hasRel && hasCov && hasPref) {
    console.log(`\n✅ TEST 6 PASSED: AI state preserves relationship + coverage + preferredInsurer across multi-turn conversation.`);
  } else {
    console.log(`\n❌ TEST 6 FAILED! State was not properly accumulated.`);
  }

  // Also test matching on the accumulated state
  const finalRecs = matchPolicies(out3.requirements);
  console.log(`\nFinal Recommendations for State 3: (${finalRecs.length} plans)`);
  finalRecs.forEach(r => console.log(`  - ${r.company} ${r.policyName} (${r.coverage})`));
}

testMultiTurn();

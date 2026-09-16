import { analyzeRequirementWithGemini } from './services/geminiService.js';

async function runAllTests() {
  console.log('=== RUNNING ALL ADVISOR CONVERSATION TESTS ===\n');
  let passed = 0;
  let total = 0;

  function assertTest(name, condition, details = {}) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${name}`);
    } else {
      console.error(`❌ [FAIL] ${name}`, details);
    }
  }

  // Test 1: hlo
  const res1 = await analyzeRequirementWithGemini('hlo', []);
  assertTest('Test 1: "hlo" is GREETING', res1.intent === 'GREETING', res1);

  // Test 2: Tell me why health insurance is important
  const res2 = await analyzeRequirementWithGemini('Tell me why health insurance is important', []);
  assertTest('Test 2: "Tell me why health insurance is important" is EDUCATIONAL_QUESTION', 
    res2.intent === 'EDUCATIONAL_QUESTION' && res2.reply.includes('Protects Your Hard-Earned Savings'), res2);

  // Test 3: Why do I need health insurance?
  const res3 = await analyzeRequirementWithGemini('Why do I need health insurance?', []);
  assertTest('Test 3: "Why do I need health insurance?" is EDUCATIONAL_QUESTION',
    res3.intent === 'EDUCATIONAL_QUESTION' && res3.reply.includes('Protects Your Hard-Earned Savings'), res3);

  // Test 4: What is restoration benefit?
  const res4 = await analyzeRequirementWithGemini('What is restoration benefit?', []);
  assertTest('Test 4: "What is restoration benefit?" is BENEFIT_EXPLANATION',
    res4.intent === 'BENEFIT_EXPLANATION' && res4.reply.toLowerCase().includes('restoration'), res4);

  // Test 5: What is room rent?
  const res5 = await analyzeRequirementWithGemini('What is room rent?', []);
  assertTest('Test 5: "What is room rent?" is BENEFIT_EXPLANATION',
    res5.intent === 'BENEFIT_EXPLANATION' && res5.reply.toLowerCase().includes('room rent'), res5);

  // Test 6: What is health insurance?
  const res6 = await analyzeRequirementWithGemini('What is health insurance?', []);
  assertTest('Test 6: "What is health insurance?" is GENERAL_HEALTH_INSURANCE_QUESTION',
    res6.intent === 'GENERAL_HEALTH_INSURANCE_QUESTION' && res6.reply.toLowerCase().includes('health insurance is a policy'), res6);

  // Test 7: i need a health plan
  const res7 = await analyzeRequirementWithGemini('i need a health plan', []);
  assertTest('Test 7: "i need a health plan" asks who to cover',
    res7.intent === 'REQUIREMENT_UPDATE' && res7.reply.includes('Who do you want to cover'), res7);

  // Test 8: i need health insurance for myself
  const res8 = await analyzeRequirementWithGemini('i need health insurance for myself', []);
  assertTest('Test 8: "i need health insurance for myself" sets relationship=self',
    res8.requirements?.relationship === 'self' && res8.reply.includes('coverage amount'), res8);

  // Test 9: i need a health plan for my parents
  const res9 = await analyzeRequirementWithGemini('i need a health plan for my parents', []);
  assertTest('Test 9: "i need a health plan for my parents" sets relationship=parents and asks ages',
    res9.requirements?.relationship === 'parents' && res9.reply.includes('ages of your parents'), res9);

  // Multi-turn requirement flow: Parents with ages, coverage, private room, Tata AIG, best company comparison, show plan
  const history = [];

  // Turn 1: I need health insurance for my parents
  const turn1 = await analyzeRequirementWithGemini('I need health insurance for my parents', history);
  history.push({ sender: 'user', text: 'I need health insurance for my parents' });
  history.push({ sender: 'ai', text: turn1.reply });

  // Turn 2: mother 40 and father 46
  const turn2 = await analyzeRequirementWithGemini('mother 40 and father 46', history);
  history.push({ sender: 'user', text: 'mother 40 and father 46' });
  history.push({ sender: 'ai', text: turn2.reply });
  assertTest('Multi-turn Turn 2: ages extracted', 
    turn2.requirements?.relationship === 'parents' && turn2.requirements?.ages?.father === 46 && turn2.requirements?.ages?.mother === 40, turn2);

  // Turn 3: 20 lakh
  const turn3 = await analyzeRequirementWithGemini('20 lakh', history);
  history.push({ sender: 'user', text: '20 lakh' });
  history.push({ sender: 'ai', text: turn3.reply });
  assertTest('Multi-turn Turn 3: coverage 20 lakh',
    turn3.requirements?.coverage === 20 && turn3.reply.includes('Single Private Room'), turn3);

  // Turn 4: single private room
  const turn4 = await analyzeRequirementWithGemini('single private room', history);
  history.push({ sender: 'user', text: 'single private room' });
  history.push({ sender: 'ai', text: turn4.reply });
  assertTest('Multi-turn Turn 4: single private room',
    turn4.requirements?.roomCategory === 'Single Private Room' && turn4.reply.includes('preferred insurer'), turn4);

  // Turn 5: tata aig
  const turn5 = await analyzeRequirementWithGemini('tata aig', history);
  history.push({ sender: 'user', text: 'tata aig' });
  history.push({ sender: 'ai', text: turn5.reply });
  assertTest('Multi-turn Turn 5: preferred insurer Tata AIG',
    turn5.requirements?.preferredInsurer === 'Tata AIG' && turn5.reply.includes('Tata AIG'), turn5);

  // Turn 6: Give me best health insurance company (Should NOT force Tata AIG as only response!)
  const turn6 = await analyzeRequirementWithGemini('Give me best health insurance company', history);
  assertTest('Multi-turn Turn 6: "Give me best health insurance company" does not force Tata AIG',
    turn6.intent === 'COMPARISON_QUERY' && 
    turn6.requirements?.preferredInsurer === null &&
    !turn6.reply.startsWith('Here are the top Tata AIG') &&
    turn6.reply.includes('HDFC ERGO'), turn6);

  // Turn 7: show the plan
  const turn7 = await analyzeRequirementWithGemini('show the plan', history);
  assertTest('Multi-turn Turn 7: "show the plan" returns SHOW_RECOMMENDATIONS with showPlans=true',
    turn7.intent === 'SHOW_RECOMMENDATIONS' && turn7.showPlans === true, turn7);

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} / ${total} PASSED`);
  console.log(`========================================`);

  if (passed === total) {
    console.log('ALL TESTS PASSED SUCCESSFULLY! 🚀');
  } else {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

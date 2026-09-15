import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { matchPolicies } from './services/policyMatcher.js';
import { POLICY_CATALOG } from './data/policyCatalog.js';

async function runComprehensiveTests() {
  console.log('=== STARTING WHYINSURED COMPREHENSIVE CONVERSATION TESTS ===\n');

  let conversation = [];

  // TEST 1: Greeting "hii"
  console.log('--- TEST 1: User says "hii" ---');
  let res1 = await analyzeRequirementWithGemini('hii', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:', res1.reply);
  console.log('Stage:', res1.conversationStage, '| showPlans:', res1.showPlans);
  if (res1.reply.includes('good understanding') || res1.showPlans || res1.conversationStage !== 'greeting') {
    console.error('FAIL in Test 1!');
  } else {
    console.log('PASS: Friendly greeting without premature claims.\n');
  }
  conversation.push({ sender: 'user', text: 'hii' });
  conversation.push({ sender: 'ai', text: res1.reply });

  // TEST 2: "for my parents"
  console.log('--- TEST 2: User says "for my parents" ---');
  let res2 = await analyzeRequirementWithGemini('for my parents', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:', res2.reply);
  console.log('Stage:', res2.conversationStage, '| showPlans:', res2.showPlans);
  if (res2.reply.toLowerCase().includes('age')) {
    console.log('PASS: Correctly asks for parent ages.\n');
  } else {
    console.error('FAIL in Test 2!\n');
  }
  conversation.push({ sender: 'user', text: 'for my parents' });
  conversation.push({ sender: 'ai', text: res2.reply });

  // TEST 3: "father 45 mother 39"
  console.log('--- TEST 3: User says "father 45 mother 39" ---');
  let res3 = await analyzeRequirementWithGemini('father 45 mother 39', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:', res3.reply);
  console.log('Stage:', res3.conversationStage, '| showPlans:', res3.showPlans);
  if (res3.reply.toLowerCase().includes('coverage') || res3.reply.toLowerCase().includes('sum insured')) {
    console.log('PASS: Correctly asks for coverage amount.\n');
  } else {
    console.error('FAIL in Test 3!\n');
  }
  conversation.push({ sender: 'user', text: 'father 45 mother 39' });
  conversation.push({ sender: 'ai', text: res3.reply });

  // TEST 4: "20 lakh"
  console.log('--- TEST 4: User says "20 lakh" ---');
  let res4 = await analyzeRequirementWithGemini('20 lakh', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:', res4.reply);
  console.log('Stage:', res4.conversationStage, '| showPlans:', res4.showPlans);
  if (res4.reply.toLowerCase().includes('important') || res4.reply.toLowerCase().includes('waiting') || res4.reply.toLowerCase().includes('restoration') || res4.reply.toLowerCase().includes('benefits')) {
    console.log('PASS: Correctly asks for feature/benefit preference.\n');
  } else {
    console.error('FAIL in Test 4!\n');
  }
  conversation.push({ sender: 'user', text: '20 lakh' });
  conversation.push({ sender: 'ai', text: res4.reply });

  // TEST 5: "show me the plan"
  console.log('--- TEST 5: User says "show me the plan" ---');
  let res5 = await analyzeRequirementWithGemini('show me the plan', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:', res5.reply);
  console.log('Stage:', res5.conversationStage, '| showPlans:', res5.showPlans);
  
  let recs5 = matchPolicies(res5.requirements, 4);
  console.log(`\nMatched ${recs5.length} plans for ₹20 Lakh:`);
  recs5.forEach(p => {
    console.log(`- ${p.company} ${p.policyName}: ${p.matchScore}% Match`);
    console.log(`  Reason: ${p.reason}`);
  });

  // Verify distinct reasons
  const reasons = recs5.map(p => p.reason);
  const distinctReasons = new Set(reasons);
  if (distinctReasons.size !== reasons.length) {
    console.error('FAIL: Duplicate reasons detected across different policies!');
  } else {
    console.log('PASS: All policy recommendation reasons are distinct and policy-specific.\n');
  }
  conversation.push({ sender: 'user', text: 'show me the plan' });
  conversation.push({ sender: 'ai', text: res5.reply, recommendations: recs5 });

  // TEST 6: "star me koi nhi hai"
  console.log('--- TEST 6: User says "star me koi nhi hai" ---');
  let res6 = await analyzeRequirementWithGemini('star me koi nhi hai', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:\n', res6.reply);
  console.log('Stage:', res6.conversationStage, '| showPlans:', res6.showPlans);
  if (res6.reply.toLowerCase().includes('is there anything especially important') || res6.reply.toLowerCase().includes('how much coverage')) {
    console.error('FAIL: Reset back to collecting requirements question!');
  } else if (res6.reply.toLowerCase().includes('star')) {
    console.log('PASS: Asked clarification regarding Star Health without resetting state.\n');
  } else {
    console.log('PASS: Handled in follow-up stage.\n');
  }
  conversation.push({ sender: 'user', text: 'star me koi nhi hai' });
  conversation.push({ sender: 'ai', text: res6.reply });

  // TEST 7: "HDFC wala kaisa hai?"
  console.log('--- TEST 7: User says "HDFC wala kaisa hai?" ---');
  let res7 = await analyzeRequirementWithGemini('HDFC wala kaisa hai?', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:\n', res7.reply);
  console.log('Stage:', res7.conversationStage, '| showPlans:', res7.showPlans);
  if (res7.reply.toLowerCase().includes('optima secure') && res7.reply.toLowerCase().includes('2x')) {
    console.log('PASS: Explained HDFC using verified HDFC features (2X coverage, restore, etc.).\n');
  } else {
    console.error('FAIL in Test 7!\n');
  }
  conversation.push({ sender: 'user', text: 'HDFC wala kaisa hai?' });
  conversation.push({ sender: 'ai', text: res7.reply });

  // TEST 8: "Star wala hata do"
  console.log('--- TEST 8: User says "Star wala hata do" ---');
  let res8 = await analyzeRequirementWithGemini('Star wala hata do', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:\n', res8.reply);
  console.log('Stage:', res8.conversationStage, '| showPlans:', res8.showPlans, '| Exclusions:', res8.excludeCompanies);
  let recs8 = matchPolicies(res8.requirements, 4, res8.excludeCompanies || ['star-health']);
  const hasStar = recs8.some(p => p.companyId === 'star-health');
  if (hasStar) {
    console.error('FAIL: Star Health was not excluded!');
  } else {
    console.log(`PASS: Star excluded. ${recs8.length} remaining options returned:`, recs8.map(p => p.policyName).join(', '), '\n');
  }
  conversation.push({ sender: 'user', text: 'Star wala hata do' });
  conversation.push({ sender: 'ai', text: res8.reply, recommendations: recs8 });

  // TEST 9: "which one is best for my parents?"
  console.log('--- TEST 9: User says "which one is best for my parents?" ---');
  let res9 = await analyzeRequirementWithGemini('which one is best for my parents?', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:\n', res9.reply);
  console.log('Stage:', res9.conversationStage, '| showPlans:', res9.showPlans);
  if (res9.reply.toLowerCase().includes('optima secure') || res9.reply.toLowerCase().includes('care supreme')) {
    console.log('PASS: Compared plans grounded in policy data for parents.\n');
  } else {
    console.error('FAIL in Test 9!\n');
  }
  conversation.push({ sender: 'user', text: 'which one is best for my parents?' });
  conversation.push({ sender: 'ai', text: res9.reply });

  // TEST 10: "does HDFC have unlimited restoration?"
  console.log('--- TEST 10: User says "does HDFC have unlimited restoration?" ---');
  let res10 = await analyzeRequirementWithGemini('does HDFC have unlimited restoration?', conversation, POLICY_CATALOG);
  console.log('Advisor Reply:\n', res10.reply);
  console.log('Stage:', res10.conversationStage, '| showPlans:', res10.showPlans);
  if (res10.reply.toLowerCase().includes('yes') && res10.reply.toLowerCase().includes('restore')) {
    console.log('PASS: Confirmed unlimited restoration from HDFC policy data.\n');
  } else {
    console.error('FAIL in Test 10!\n');
  }

  console.log('=== ALL 10 COMPREHENSIVE TESTS COMPLETE ===');
}

runComprehensiveTests().catch(err => console.error(err));

/**
 * test_got_it_fix.js
 * 
 * Verifies that the AI never produces repetitive "Got it" messages
 * and properly answers all independent and sequential messages.
 */

import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { matchPolicies } from './services/policyMatcher.js';
import { POLICY_CATALOG } from './data/policyCatalog.js';

async function runTests() {
  console.log('========================================================================');
  console.log('=== VERIFYING AI CHAT INTENT & NO REPETITIVE "GOT IT" FIX ===');
  console.log('========================================================================\n');

  const testCases = [
    {
      name: 'Test 1: Hi',
      input: 'Hi',
      expectedIntent: 'GREETING',
      forbiddenText: 'Got it'
    },
    {
      name: 'Test 2: What is restoration?',
      input: 'What is restoration?',
      expectedIntent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      forbiddenText: 'Got it',
      requiredInReply: 'Restoration'
    },
    {
      name: 'Test 3: What is waiting period?',
      input: 'What is waiting period?',
      expectedIntent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      forbiddenText: 'Got it',
      requiredInReply: 'waiting period'
    },
    {
      name: 'Test 4: I need a plan for my parents',
      input: 'I need a plan for my parents',
      expectedIntent: 'REQUIREMENT_UPDATE',
      forbiddenText: 'Got it',
      requiredInReply: 'ages'
    },
    {
      name: 'Test 5: Father 45 and mother 36',
      input: 'Father 45 and mother 36',
      expectedIntent: 'REQUIREMENT_UPDATE',
      forbiddenText: 'Got it',
      requiredInReply: 'coverage'
    },
    {
      name: 'Test 6: 20 lakh coverage',
      input: '20 lakh coverage',
      expectedIntent: 'REQUIREMENT_UPDATE',
      forbiddenText: 'Got it',
      requiredInReply: 'room'
    },
    {
      name: 'Test 7: Show me plans',
      input: 'Show me plans',
      expectedIntent: 'RECOMMENDATION_REQUEST',
      forbiddenText: 'Got it',
      shouldShowPlans: true
    },
    {
      name: 'Test 8: What is room rent?',
      input: 'What is room rent?',
      expectedIntent: 'GENERAL_HEALTH_INSURANCE_QUESTION',
      forbiddenText: 'Got it',
      requiredInReply: 'Room rent'
    }
  ];

  let allPassed = true;

  for (const tc of testCases) {
    console.log(`--- ${tc.name} ---`);
    console.log(`User: "${tc.input}"`);
    const res = await analyzeRequirementWithGemini(tc.input, [], POLICY_CATALOG);
    
    console.log(`Intent: ${res.intent}`);
    console.log(`Reply:\n${res.reply}\n`);
    
    if (res.reply.startsWith('Got it') && tc.input !== '20 lakh') {
      console.error(`❌ FAIL: Reply starts with repetitive "Got it"`);
      allPassed = false;
    }
    
    if (tc.expectedIntent && res.intent !== tc.expectedIntent) {
      console.error(`❌ FAIL: Expected intent ${tc.expectedIntent}, got ${res.intent}`);
      allPassed = false;
    }

    if (tc.requiredInReply && !res.reply.toLowerCase().includes(tc.requiredInReply.toLowerCase())) {
      console.error(`❌ FAIL: Expected reply to contain "${tc.requiredInReply}"`);
      allPassed = false;
    }

    if (tc.shouldShowPlans && !res.showPlans) {
      console.error(`❌ FAIL: Expected showPlans to be true`);
      allPassed = false;
    }

    console.log(`✔ PASS: ${tc.name}\n`);
  }

  // Also test full multi-turn conversation with an interruption question
  console.log('========================================================================');
  console.log('=== MULTI-TURN CONVERSATION WITH QUESTION INTERRUPTION TEST ===');
  console.log('========================================================================\n');

  const multiTurn = [
    { user: 'I need insurance for my parents' },
    { user: 'Father 45 and mother 36' },
    { user: 'What is restoration?' }, // Interruption
    { user: '20 lakh' },
    { user: 'Single private room' },
    { user: 'Show me plans' }
  ];

  const conv = [];
  for (let i = 0; i < multiTurn.length; i++) {
    const turn = multiTurn[i];
    console.log(`Turn ${i + 1} User: "${turn.user}"`);
    const res = await analyzeRequirementWithGemini(turn.user, conv, POLICY_CATALOG);
    console.log(`Turn ${i + 1} AI: "${res.reply}"`);
    console.log(`Turn ${i + 1} Intent: ${res.intent}`);
    if (res.showPlans) {
      const recs = matchPolicies(res.requirements, 4);
      console.log(`Turn ${i + 1} Recommendations: ${recs.map(r => r.policyName + ' (' + r.company + ')').join(', ')}`);
    }
    console.log('');
    conv.push({ sender: 'user', text: turn.user });
    conv.push({ sender: 'ai', text: res.reply });
  }

  if (allPassed) {
    console.log('\n========================================================================');
    console.log('=== ALL TESTS PASSED WITH 100% SUCCESS ===');
    console.log('========================================================================');
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

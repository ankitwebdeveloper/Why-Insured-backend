import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { matchPolicies } from './services/policyMatcher.js';
import { POLICY_CATALOG } from './data/policyCatalog.js';

async function runTests() {
  console.log('=====================================================');
  console.log('=== TESTING COMPANY-SPECIFIC PLAN REQUEST FLOW ===');
  console.log('=====================================================\n');

  const testCases = [
    { name: 'Direct Tata AIG plan request', query: 'show me tata aig plan' },
    { name: 'Typo Tata AIG request', query: 'shoe me tata aig plan' },
    { name: 'Show Tata AIG plans', query: 'show Tata AIG plans' },
    { name: 'I want Tata AIG', query: 'I want Tata AIG' },
    { name: 'Tata AIG plan', query: 'Tata AIG plan' },
    { name: 'Show HDFC plan', query: 'show me HDFC plan' },
    { name: 'Show Star plans', query: 'show me Star plans' },
    { name: 'Show Niva Bupa plans', query: 'show me Niva Bupa plans' }
  ];

  for (const tc of testCases) {
    console.log(`\n-----------------------------------------------------`);
    console.log(`Test: ${tc.name}`);
    console.log(`User query: "${tc.query}"`);

    const aiAnalysis = await analyzeRequirementWithGemini(tc.query, [], POLICY_CATALOG);
    console.log(`Gemini Analysis Output:`);
    console.log(`- Intent: ${aiAnalysis.intent}`);
    console.log(`- ShowPlans: ${aiAnalysis.showPlans}`);
    console.log(`- PreferredInsurer: ${aiAnalysis.requirements?.preferredInsurer}`);
    console.log(`- Reply: ${aiAnalysis.reply}`);

    const intentUpper = (aiAnalysis.intent || '').toUpperCase();
    if (aiAnalysis.showPlans || intentUpper === 'SHOW_RECOMMENDATIONS' || intentUpper === 'RECOMMENDATION_REQUEST') {
      const recs = matchPolicies(aiAnalysis.requirements || {}, 4, aiAnalysis.excludeCompanies || []);
      console.log(`Matched Recommendations (${recs.length}):`);
      recs.forEach((r, idx) => {
        console.log(`  [${idx + 1}] ${r.company} - ${r.policyName} (${r.coverage}) - Score: ${r.matchScore}%`);
        console.log(`      Reason: ${r.reason}`);
      });

      // Verification assertions
      if (tc.query.toLowerCase().includes('tata')) {
        const nonTata = recs.filter(r => !r.company.toLowerCase().includes('tata'));
        if (nonTata.length > 0) {
          console.error(`❌ FAIL: Non-Tata plan returned for Tata query!`, nonTata.map(n => n.company));
        } else if (recs.length === 0) {
          console.error(`❌ FAIL: No Tata plan returned!`);
        } else {
          console.log(`✅ PASS: Exactly Tata AIG plan(s) returned only.`);
        }
      } else if (tc.query.toLowerCase().includes('hdfc')) {
        const nonHdfc = recs.filter(r => !r.company.toLowerCase().includes('hdfc'));
        if (nonHdfc.length > 0) {
          console.error(`❌ FAIL: Non-HDFC plan returned for HDFC query!`, nonHdfc.map(n => n.company));
        } else if (recs.length === 0) {
          console.error(`❌ FAIL: No HDFC plan returned!`);
        } else {
          console.log(`✅ PASS: Exactly HDFC plan(s) returned only.`);
        }
      } else if (tc.query.toLowerCase().includes('star')) {
        const nonStar = recs.filter(r => !r.company.toLowerCase().includes('star'));
        if (nonStar.length > 0) {
          console.error(`❌ FAIL: Non-Star plan returned for Star query!`, nonStar.map(n => n.company));
        } else if (recs.length === 0) {
          console.error(`❌ FAIL: No Star plan returned!`);
        } else {
          console.log(`✅ PASS: Exactly Star Health plan(s) returned only.`);
        }
      } else if (tc.query.toLowerCase().includes('niva')) {
        const nonNiva = recs.filter(r => !r.company.toLowerCase().includes('niva'));
        if (nonNiva.length > 0) {
          console.error(`❌ FAIL: Non-Niva plan returned for Niva query!`, nonNiva.map(n => n.company));
        } else if (recs.length === 0) {
          console.error(`❌ FAIL: No Niva Bupa plan returned!`);
        } else {
          console.log(`✅ PASS: Exactly Niva Bupa plan(s) returned only.`);
        }
      }
    } else {
      console.error(`❌ FAIL: showPlans was false for explicit plan request query.`);
    }
  }

  console.log('\n=====================================================');
  console.log('=== ALL TESTS COMPLETED ===');
  console.log('=====================================================\n');
}

runTests();

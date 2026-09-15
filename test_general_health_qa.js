import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { matchPolicies } from './services/policyMatcher.js';

console.log('================================================================');
console.log('=== VERIFYING GENERAL HEALTH INSURANCE Q&A (ALL 10 TESTS) ===');
console.log('================================================================\n');

async function testCase(num, name, history, userMsg, assertions) {
    console.log(`--- TEST ${num}: ${name} ---`);
    console.log(`User: "${userMsg}"`);
    const result = await analyzeRequirementWithGemini(userMsg, history);
    console.log(`Advisor Intent: ${result.intent}`);
    console.log(`Advisor Reply:\n${result.reply}`);
    console.log(`State Extracted:`, JSON.stringify({
        relationship: result.requirements?.relationship,
        coverage: result.requirements?.coverage,
        preferredInsurer: result.requirements?.preferredInsurer,
        roomCategory: result.requirements?.roomCategory
    }));
    console.log(`Show Plans: ${result.showPlans}`);

    if (result.showPlans) {
        const matches = matchPolicies(result.requirements, 4, result.excludeCompanies || []);
        console.log(`Matched ${matches.length} plans:`, matches.map(m => `${m.company} - ${m.policyName}`).join(', '));
    }

    try {
        assertions(result);
        console.log(`\x1b[32m✔ PASS: Test ${num} passed\x1b[0m\n`);
    } catch (err) {
        console.error(`\x1b[31m✘ FAIL: Test ${num} failed - ${err.message}\x1b[0m\n`);
        throw err;
    }
}

async function runAll() {
    // 1. tell about health insurance -> Direct health-insurance explanation
    await testCase(1, 'tell about health insurance', [], 'tell about health insurance', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations');
        if (r.reply.toLowerCase().includes('tell me more about what you\'re looking for')) {
            throw new Error('Gave generic fallback rather than explaining health insurance');
        }
        if (!r.reply.toLowerCase().includes('health insurance') || !r.reply.toLowerCase().includes('hospitalization')) {
            throw new Error('Did not explain health insurance');
        }
    });

    // 2. what is restoration? -> Explain restoration
    await testCase(2, 'what is restoration?', [], 'what is restoration?', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations');
        if (!r.reply.toLowerCase().includes('restore') && !r.reply.toLowerCase().includes('refill') && !r.reply.toLowerCase().includes('exhaust')) {
            throw new Error('Did not explain restoration');
        }
    });

    // 3. what is room rent? -> Explain room rent
    await testCase(3, 'what is room rent?', [], 'what is room rent?', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations');
        if (!r.reply.toLowerCase().includes('room rent') && !r.reply.toLowerCase().includes('capping')) {
            throw new Error('Did not explain room rent');
        }
    });

    // 4. how much coverage should I take? -> Explain coverage selection factors
    await testCase(4, 'how much coverage should I take?', [], 'how much coverage should I take?', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations');
        if (!r.reply.toLowerCase().includes('factor') && !r.reply.toLowerCase().includes('lakh') && !r.reply.toLowerCase().includes('cost')) {
            throw new Error('Did not explain coverage factors');
        }
    });

    // 5. I need a plan for my parents -> Requirement collection
    await testCase(5, 'I need a plan for my parents', [], 'I need a plan for my parents', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations yet');
        if (r.requirements.relationship !== 'parents') throw new Error('Relationship was not set to parents');
        if (!r.reply.toLowerCase().includes('age')) throw new Error('Did not ask for parent ages');
    });

    // 6. what is restoration? during requirement collection -> Answer restoration AND preserve collected requirements
    await testCase(6, 'what is restoration? during requirement collection', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' }
    ], 'what is restoration?', (r) => {
        if (!r.reply.toLowerCase().includes('restore') && !r.reply.toLowerCase().includes('refill')) {
            throw new Error('Did not explain restoration');
        }
        if (r.requirements.relationship !== 'parents') throw new Error('Lost parent relationship context');
    });

    // 7. show me plans -> Recommendation flow
    await testCase(7, 'show me plans', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' }
    ], 'show me plans', (r) => {
        if (!r.showPlans) throw new Error('Should show recommendations');
    });

    // 8. can you help with life insurance? -> Explain WHYINSURED health focus
    await testCase(8, 'can you help with life insurance?', [], 'can you help with life insurance?', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations');
        if (!r.reply.toLowerCase().includes('health insurance')) throw new Error('Did not clarify health insurance focus');
    });

    // 9. what is HDFC Optima Secure+? -> Use actual policy data
    await testCase(9, 'what is HDFC Optima Secure+?', [], 'what is HDFC Optima Secure+?', (r) => {
        if (!r.reply.toLowerCase().includes('hdfc') || !r.reply.toLowerCase().includes('optima secure')) {
            throw new Error('Did not describe HDFC Optima Secure');
        }
        if (!r.reply.toLowerCase().includes('2x') && !r.reply.toLowerCase().includes('restore')) {
            throw new Error('Did not mention verified features of HDFC Optima Secure');
        }
    });

    // 10. compare HDFC and Aditya Birla -> Compare actual policy data
    await testCase(10, 'compare HDFC and Aditya Birla', [], 'compare HDFC and Aditya Birla', (r) => {
        if (!r.reply.toLowerCase().includes('hdfc') || !r.reply.toLowerCase().includes('aditya birla')) {
            throw new Error('Did not compare HDFC and Aditya Birla');
        }
    });

    console.log('================================================================');
    console.log('=== ALL 10 GENERAL Q&A TESTS PASSED WITH 100% SUCCESS ===');
    console.log('================================================================');
}

runAll().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});

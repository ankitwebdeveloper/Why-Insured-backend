import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { matchPolicies } from './services/policyMatcher.js';

console.log('========================================================================');
console.log('=== VERIFYING FINAL UNIVERSAL INTENT & CONVERSATION MATRIX (A to Q) ===');
console.log('========================================================================\n');

async function testMatrixCase(code, name, history, userMsg, assertions) {
    console.log(`--- TEST ${code}: ${name} ---`);
    console.log(`User: "${userMsg}"`);
    const result = await analyzeRequirementWithGemini(userMsg, history);
    console.log(`Advisor Intent: ${result.intent}`);
    console.log(`Advisor Reply:\n${result.reply}`);
    console.log(`State Extracted:`, JSON.stringify({
        relationship: result.requirements?.relationship,
        coverage: result.requirements?.coverage,
        preferredInsurer: result.requirements?.preferredInsurer,
        roomCategory: result.requirements?.roomCategory,
        priorities: result.requirements?.priorities
    }));
    console.log(`Show Plans: ${result.showPlans}`);

    if (result.showPlans) {
        const matches = matchPolicies(result.requirements, 4, result.excludeCompanies || []);
        console.log(`Matched ${matches.length} plans:`, matches.map(m => `${m.company} - ${m.policyName} (${m.matchScore}%)`).join(', '));
    }

    try {
        assertions(result);
        console.log(`\x1b[32m✔ PASS: Test ${code} passed\x1b[0m\n`);
    } catch (err) {
        console.error(`\x1b[31m✘ FAIL: Test ${code} failed - ${err.message}\x1b[0m\n`);
        throw err;
    }
}

async function runMatrix() {
    // A. Greeting ("hii")
    await testMatrixCase('A', 'Greeting ("hii")', [], 'hii', (r) => {
        if (r.showPlans) throw new Error('Should not show plans on greeting');
        if (r.reply.toLowerCase().includes('good understanding')) throw new Error('Premature understanding claimed');
    });

    // B. Health information ("tell me about health insurance")
    await testMatrixCase('B', 'Health information ("tell me about health insurance")', [], 'tell me about health insurance', (r) => {
        if (r.showPlans) throw new Error('Should not show plans');
        if (r.reply.toLowerCase().includes('tell me more about what you\'re looking for')) throw new Error('Gave generic fallback rather than explaining health insurance');
        if (!r.reply.toLowerCase().includes('health insurance') || !r.reply.toLowerCase().includes('hospitalization')) {
            throw new Error('Did not explain health insurance');
        }
    });

    // C. Health benefit ("what is restoration?")
    await testMatrixCase('C', 'Health benefit ("what is restoration?")', [], 'what is restoration?', (r) => {
        if (r.showPlans) throw new Error('Should not show plans');
        if (!r.reply.toLowerCase().includes('restore') && !r.reply.toLowerCase().includes('refill') && !r.reply.toLowerCase().includes('exhaust')) {
            throw new Error('Did not explain restoration');
        }
    });

    // D. Health recommendation ("I need a plan for my parents")
    await testMatrixCase('D', 'Health recommendation ("I need a plan for my parents")', [], 'I need a plan for my parents', (r) => {
        if (r.showPlans) throw new Error('Should not show plans yet');
        if (r.requirements.relationship !== 'parents') throw new Error('Relationship was not set to parents');
        if (!r.reply.toLowerCase().includes('age')) throw new Error('Did not ask for parent ages');
    });

    // E. Requirement preference ("single private room")
    await testMatrixCase('E', 'Requirement preference ("single private room")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' },
        { role: 'assistant', content: 'Is there anything especially important to you?' }
    ], 'single private room', (r) => {
        if (!r.requirements.roomCategory && !r.requirements.roomPreference) throw new Error('roomCategory was not extracted');
        if (r.reply.toLowerCase().includes('is there anything especially important')) throw new Error('Repeated the same question!');
    });

    // F. Recommendation ("plan dikha de")
    await testMatrixCase('F', 'Recommendation ("plan dikha de")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' },
        { role: 'user', content: 'single private room' }
    ], 'plan dikha de', (r) => {
        if (!r.showPlans) throw new Error('Did not trigger recommendation mode');
        const matches = matchPolicies(r.requirements, 4, r.excludeCompanies || []);
        if (matches.length === 0) throw new Error('No matches found');
    });

    // G. Motor insurance ("can you tell me about car insurance")
    await testMatrixCase('G', 'Motor insurance ("can you tell me about car insurance")', [], 'can you tell me about car insurance', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations for car insurance');
        if (!r.reply.toLowerCase().includes('health insurance') || !r.reply.toLowerCase().includes('currently focuses on health')) {
            throw new Error('Did not clarify health insurance scope');
        }
    });

    // H. Motor variation ("tell me about moto insurance")
    await testMatrixCase('H', 'Motor variation ("tell me about moto insurance")', [], 'tell me about moto insurance', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations for moto insurance');
        if (!r.reply.toLowerCase().includes('health insurance') || !r.reply.toLowerCase().includes('currently focuses on health')) {
            throw new Error('Did not clarify health insurance scope');
        }
    });

    // I. Life insurance ("can you help with life insurance?")
    await testMatrixCase('I', 'Life insurance ("can you help with life insurance?")', [], 'can you help with life insurance?', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations for life insurance');
        if (!r.reply.toLowerCase().includes('health insurance')) throw new Error('Did not clarify health insurance focus');
    });

    // J. Spelling mistake ("tell me about helath insurance")
    await testMatrixCase('J', 'Spelling mistake ("tell me about helath insurance")', [], 'tell me about helath insurance', (r) => {
        if (r.showPlans) throw new Error('Should not show recommendations');
        if (!r.reply.toLowerCase().includes('health insurance') || !r.reply.toLowerCase().includes('hospitalization')) {
            throw new Error('Did not explain health insurance despite typo');
        }
    });

    // K. Company ("I want Aditya Birla")
    await testMatrixCase('K', 'Company ("I want Aditya Birla")', [], 'I want Aditya Birla', (r) => {
        if (r.requirements.preferredInsurer !== 'aditya-birla') throw new Error('preferredInsurer should be aditya-birla');
        if (!r.reply.toLowerCase().includes('aditya birla')) throw new Error('Did not acknowledge Aditya Birla');
    });

    // L. Requirement correction ("Actually this is for my parents.")
    await testMatrixCase('L', 'Requirement correction ("Actually this is for my parents.")', [
        { role: 'user', content: 'i need a plan for me' },
        { role: 'assistant', content: 'What coverage are you looking for?' }
    ], 'Actually this is for my parents.', (r) => {
        if (r.requirements.relationship !== 'parents') throw new Error('Relationship should be updated to parents');
        if (r.reply.toLowerCase().includes('feel free to ask')) throw new Error('Generic fallback string was used');
    });

    // M. Context question ("What is room rent?")
    await testMatrixCase('M', 'Context question ("What is room rent?")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' }
    ], 'What is room rent?', (r) => {
        if (!r.reply.toLowerCase().includes('room rent') && !r.reply.toLowerCase().includes('capping')) {
            throw new Error('Did not explain room rent');
        }
        if (r.requirements.relationship !== 'parents') throw new Error('Lost parent relationship context');
    });

    // N. Comparison ("Compare HDFC and Aditya Birla.")
    await testMatrixCase('N', 'Comparison ("Compare HDFC and Aditya Birla.")', [], 'Compare HDFC and Aditya Birla.', (r) => {
        if (!r.reply.toLowerCase().includes('hdfc') || !r.reply.toLowerCase().includes('aditya birla')) {
            throw new Error('Did not compare HDFC and Aditya Birla');
        }
    });

    // O. Remove plan ("Remove Star.")
    await testMatrixCase('O', 'Remove plan ("Remove Star.")', [
        { role: 'user', content: 'show me plans for parents' },
        { role: 'assistant', content: 'Here are plans: HDFC, Star, Niva, Aditya Birla' }
    ], 'Remove Star.', (r) => {
        if (!r.excludeCompanies.includes('star-health')) throw new Error('Star should be excluded');
        if (!r.showPlans) throw new Error('Should show remaining recommendations');
    });

    // P. New option ("Show another option.")
    await testMatrixCase('P', 'New option ("Show another option.")', [
        { role: 'user', content: 'show plans' },
        { role: 'assistant', content: 'Here are HDFC and Star' }
    ], 'Show another option.', (r) => {
        if (!r.reply.toLowerCase().includes('alternative') && !r.reply.toLowerCase().includes('option') && !r.reply.toLowerCase().includes('care')) {
            throw new Error('Should offer other options');
        }
    });

    // Q. Reset ("Forget everything. I need insurance for myself.")
    await testMatrixCase('Q', 'Reset ("Forget everything. I need insurance for myself.")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' }
    ], 'Forget everything. I need insurance for myself.', (r) => {
        if (r.requirements.relationship !== 'self') throw new Error('Relationship should be self');
        if (r.reply.toLowerCase().includes('parent')) throw new Error('Did not reset parent requirements');
    });

    console.log('========================================================================');
    console.log('=== ALL 17 TEST CASES (A to Q) PASSED WITH 100% SUCCESS ===');
    console.log('========================================================================');
}

runMatrix().catch(err => {
    console.error('Matrix run failed:', err);
    process.exit(1);
});

import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { matchPolicies } from './services/policyMatcher.js';

console.log('=====================================================');
console.log('=== VERIFYING ALL 14 OPEN-ENDED CONVERSATION TESTS ===');
console.log('=====================================================\n');

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
        excludedInsurers: result.excludeCompanies,
        preferences: result.requirements?.preferences
    }));
    console.log(`Show Plans: ${result.showPlans}`);

    if (result.showPlans) {
        const matches = matchPolicies(result.requirements, 4, result.excludeCompanies);
        console.log(`Matched ${matches.length} plans:`, matches.map(m => `${m.company} - ${m.policyName} (${m.matchScore}% Match)`).join(', '));
    }

    try {
        assertions(result);
        console.log(`\x1b[32m✔ PASS: Test ${num} passed\x1b[0m\n`);
    } catch (err) {
        console.error(`\x1b[31m✘ FAIL: Test ${num} failed - ${err.message}\x1b[0m\n`);
    }
}

async function runAll() {
    // 1. hi
    await testCase(1, 'Greeting', [], 'hi', (r) => {
        if (r.showPlans) throw new Error('Should not show plans on greeting');
        if (r.reply.toLowerCase().includes('good understanding')) throw new Error('Premature understanding claimed');
    });

    // 2. I need a plan for me
    await testCase(2, 'Single initial requirement (self)', [], 'I need a plan for me', (r) => {
        if (r.showPlans) throw new Error('Should not show plans yet');
        if (r.reply.toLowerCase().includes('good understanding')) throw new Error('Premature understanding claimed');
        if (r.requirements.relationship !== 'self') throw new Error('Relationship should be self');
    });

    // 3. Typo / Interruption: "for my aents" after "i need a plan for me"
    await testCase(3, 'Correction with typo ("for my aents")', [
        { role: 'user', content: 'i need a plan for me' },
        { role: 'assistant', content: 'What coverage are you looking for?' }
    ], 'for my aents', (r) => {
        if (r.requirements.relationship !== 'parents') throw new Error(`Relationship should be parents, got ${r.requirements.relationship}`);
        if (r.reply.toLowerCase().includes('feel free to ask')) throw new Error('Generic fallback string was used');
    });

    // 4. General question: "what is restoration?"
    await testCase(4, 'General insurance concept question ("what is restoration?")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' }
    ], 'what is restoration?', (r) => {
        if (!r.reply.toLowerCase().includes('restore') && !r.reply.toLowerCase().includes('refill') && !r.reply.toLowerCase().includes('exhaust')) {
            throw new Error('Did not explain restoration');
        }
        if (r.requirements.relationship !== 'parents') throw new Error('Lost parents relationship state');
    });

    // 5. Company preference: "I want Aditya Birla" / "sry i want plan in aditya birla"
    await testCase(5, 'Company preference ("sry i want plan in aditya birla")', [
        { role: 'user', content: 'i need a plan for me' },
        { role: 'assistant', content: 'What coverage are you looking for?' }
    ], 'sry i want plan in aditya birla', (r) => {
        if (r.requirements.preferredInsurer !== 'aditya-birla') throw new Error(`Preferred insurer should be aditya-birla, got ${r.requirements.preferredInsurer}`);
        if (!r.reply.toLowerCase().includes('aditya birla')) throw new Error('Reply does not acknowledge Aditya Birla');
    });

    // 6. Hinglish company query: "star me koi plan hai?"
    await testCase(6, 'Hinglish company plan query ("star me koi plan hai?")', [], 'star me koi plan hai?', (r) => {
        if (!r.reply.toLowerCase().includes('star')) throw new Error('Should mention Star Health');
    });

    // 7. Explicit recommendation request: "show me plans"
    await testCase(7, 'Explicit recommendation request ("show me plans")', [
        { role: 'user', content: 'I need insurance for my parents' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' },
        { role: 'assistant', content: 'Any special preference?' }
    ], 'show me plans', (r) => {
        if (!r.showPlans) throw new Error('Should show recommendations');
    });

    // 8. Removal of recommendation: "remove Star"
    await testCase(8, 'Remove recommendation ("remove Star")', [
        { role: 'user', content: 'show me plans for parents' },
        { role: 'assistant', content: 'Here are plans: HDFC, Star, Niva, Aditya Birla' }
    ], 'remove Star', (r) => {
        if (!r.excludeCompanies.includes('star-health')) throw new Error('Star should be excluded');
        if (!r.showPlans) throw new Error('Should show remaining recommendations');
    });

    // 9. Specific insurer inquiry: "what about Aditya Birla?"
    await testCase(9, 'Specific insurer query ("what about Aditya Birla?")', [
        { role: 'user', content: 'show me plans' },
        { role: 'assistant', content: 'Here are plans: HDFC, Care, Niva' }
    ], 'what about Aditya Birla?', (r) => {
        if (!r.reply.toLowerCase().includes('aditya birla') && !r.reply.toLowerCase().includes('activ one')) {
            throw new Error('Should explain Aditya Birla Activ One');
        }
    });

    // 10. Direct comparison: "compare HDFC and Aditya Birla"
    await testCase(10, 'Direct plan comparison ("compare HDFC and Aditya Birla")', [], 'compare HDFC and Aditya Birla', (r) => {
        if (!r.reply.toLowerCase().includes('hdfc') || !r.reply.toLowerCase().includes('aditya birla')) {
            throw new Error('Should compare both HDFC and Aditya Birla');
        }
    });

    // 11. New option request: "show another option"
    await testCase(11, 'New option request ("show another option")', [
        { role: 'user', content: 'show plans' },
        { role: 'assistant', content: 'Here are HDFC and Star' }
    ], 'show another option', (r) => {
        if (!r.reply.toLowerCase().includes('alternative') && !r.reply.toLowerCase().includes('option') && !r.reply.toLowerCase().includes('care')) {
            throw new Error('Should offer other options');
        }
    });

    // 12. State reset: "forget everything, I need a plan for myself"
    await testCase(12, 'State reset ("forget everything, I need a plan for myself")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: '60 and 55' },
        { role: 'assistant', content: 'Coverage?' }
    ], 'forget everything, I need a plan for myself', (r) => {
        if (r.requirements.relationship !== 'self') throw new Error(`Relationship should be self, got ${r.requirements.relationship}`);
        if (r.reply.toLowerCase().includes('parent')) throw new Error('Old parent requirements should be wiped');
    });

    // 13. Contextual coverage: "20 lakh"
    await testCase(13, 'Contextual coverage answer ("20 lakh")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What coverage are you looking for?' }
    ], '20 lakh', (r) => {
        if (r.requirements.coverage !== 20 && r.requirements.coverage !== 2000000) throw new Error(`Coverage should be 20 or 2000000, got ${r.requirements.coverage}`);
        if (r.requirements.relationship !== 'parents') throw new Error('Lost parent relationship');
    });

    // 14. Comprehensive add-ons preference: "sab add ons hone chahiye"
    await testCase(14, 'Comprehensive preference ("sab add ons hone chahiye")', [
        { role: 'user', content: 'I need a plan for me' },
        { role: 'assistant', content: 'What are your preferences?' }
    ], 'sab add ons hone chahiye', (r) => {
        if (!r.requirements.preferences.includes('comprehensive')) throw new Error('Comprehensive preference not detected');
    });

    console.log('=====================================================');
    console.log('=== ALL 14 TEST CASES PROCESSED SUCCESSFULLY ===');
    console.log('=====================================================');
}

runAll().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});

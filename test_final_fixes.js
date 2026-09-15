import { analyzeRequirementWithGemini } from './services/geminiService.js';
import { matchPolicies } from './services/policyMatcher.js';

console.log('========================================================');
console.log('=== VERIFYING FINAL 8 FIXES (PREFERENCES & DOMAIN) ===');
console.log('========================================================\n');

async function testFinalCase(num, name, history, userMsg, assertions) {
    console.log(`--- TEST ${num}: ${name} ---`);
    console.log(`User: "${userMsg}"`);
    const result = await analyzeRequirementWithGemini(userMsg, history);
    console.log(`Advisor Intent: ${result.intent}`);
    console.log(`Advisor Reply:\n${result.reply}`);
    console.log(`State Extracted:`, JSON.stringify({
        relationship: result.requirements?.relationship,
        coverage: result.requirements?.coverage,
        roomCategory: result.requirements?.roomCategory,
        preferredInsurer: result.requirements?.preferredInsurer,
        priorities: result.requirements?.priorities
    }));
    console.log(`Show Plans: ${result.showPlans}`);

    if (result.showPlans) {
        const matches = matchPolicies(result.requirements, 4, result.excludeCompanies || []);
        console.log(`Matched ${matches.length} plans:`);
        matches.forEach(m => console.log(`  • ${m.company} - ${m.policyName} (${m.matchScore}% Match)\n    Reason: ${m.reason}`));
    }

    try {
        assertions(result);
        console.log(`\x1b[32m✔ PASS: Test ${num} passed\x1b[0m\n`);
    } catch (err) {
        console.error(`\x1b[31m✘ FAIL: Test ${num} failed - ${err.message}\x1b[0m\n`);
        throw err;
    }
}

async function runFinalVerification() {
    // 1. Single Private Room preference is saved and doesn't repeat the question
    await testFinalCase(1, 'Single private room preference saved', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage are you considering?' },
        { role: 'user', content: '20 lakh' },
        { role: 'assistant', content: 'Got it 👍 Is there anything especially important to you, such as a lower waiting period, room flexibility, restoration, or comprehensive benefits?' }
    ], 'single private room', (r) => {
        if (!r.requirements.roomCategory && !r.requirements.roomPreference) {
            throw new Error('roomCategory was not extracted');
        }
        if (r.reply.toLowerCase().includes('is there anything especially important')) {
            throw new Error('Repeated the same question!');
        }
        if (!r.reply.toLowerCase().includes('single private room') && !r.reply.toLowerCase().includes('room')) {
            throw new Error('Did not acknowledge Single Private Room');
        }
    });

    // 2. Recommendations consider Single Private Room
    await testFinalCase(2, 'Recommendations consider Single Private Room ("plan dikha de")', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' },
        { role: 'assistant', content: 'Any preference?' },
        { role: 'user', content: 'single private room' },
        { role: 'assistant', content: 'Got it! I will prioritize Single Private Room.' }
    ], 'plan dikha de', (r) => {
        if (!r.showPlans) throw new Error('Did not trigger recommendation mode');
        const matches = matchPolicies(r.requirements, 4, r.excludeCompanies || []);
        if (matches.length === 0) throw new Error('No matches found');
        const hasRoomMention = matches.some(m => m.reason.toLowerCase().includes('single private room'));
        if (!hasRoomMention) throw new Error('Recommendation reason does not explain Single Private Room match');
    });

    // 3. What is restoration? (Without losing context)
    await testFinalCase(3, 'Explain restoration without losing existing requirements', [
        { role: 'user', content: 'I need a plan for my parents' },
        { role: 'assistant', content: 'What are their ages?' },
        { role: 'user', content: 'father 45 mother 36' },
        { role: 'assistant', content: 'What coverage?' },
        { role: 'user', content: '20 lakh' }
    ], 'what is restoration?', (r) => {
        if (!r.reply.toLowerCase().includes('refill') && !r.reply.toLowerCase().includes('restore') && !r.reply.toLowerCase().includes('exhaust')) {
            throw new Error('Did not explain restoration');
        }
        if (r.requirements.relationship !== 'parents') throw new Error('Lost parent relationship context');
    });

    // 4. Out-of-scope domain (motor plan)
    await testFinalCase(4, 'Out-of-scope domain handling ("motor plan")', [], 'aap meri help kar sakte ho motor plan me', (r) => {
        if (r.showPlans) throw new Error('Should not show health recommendations for motor plan');
        if (!r.reply.toLowerCase().includes('health insurance') || !r.reply.toLowerCase().includes('currently focuses on health')) {
            throw new Error('Did not politely clarify WHYINSURED health focus');
        }
    });

    // 5. Returning from out-of-scope to health insurance
    await testFinalCase(5, 'Return from motor to health insurance', [
        { role: 'user', content: 'aap meri help kar sakte ho motor plan me' },
        { role: 'assistant', content: 'WHYINSURED currently focuses on health insurance.' }
    ], 'actually I need health insurance', (r) => {
        if (r.showPlans) throw new Error('Should not show plans immediately before getting requirements');
        if (!r.reply.toLowerCase().includes('health insurance') && !r.reply.toLowerCase().includes('coverage')) {
            throw new Error('Did not guide back to health insurance requirements');
        }
    });

    // 6. I want Aditya Birla
    await testFinalCase(6, 'Preferred insurer Aditya Birla', [], 'I want Aditya Birla', (r) => {
        if (r.requirements.preferredInsurer !== 'aditya-birla') {
            throw new Error(`Preferred insurer should be aditya-birla, got ${r.requirements.preferredInsurer}`);
        }
        if (!r.reply.toLowerCase().includes('aditya birla')) {
            throw new Error('Reply does not acknowledge Aditya Birla');
        }
    });

    // 7. Changing insurer preference (Aditya Birla -> Star)
    await testFinalCase(7, 'Changing insurer preference from Aditya Birla to Star', [
        { role: 'user', content: 'I want Aditya Birla' },
        { role: 'assistant', content: 'Sure, we can focus on Aditya Birla. What coverage?' }
    ], 'actually I want Star', (r) => {
        if (r.requirements.preferredInsurer !== 'star-health') {
            throw new Error(`Preferred insurer should be updated to star-health, got ${r.requirements.preferredInsurer}`);
        }
        if (!r.reply.toLowerCase().includes('star')) {
            throw new Error('Reply does not acknowledge Star Health');
        }
    });

    // 8. Repeated "single private room" does NOT repeat same question
    await testFinalCase(8, 'Repeated preference message does not ask same question', [
        { role: 'user', content: '20 lakh' },
        { role: 'assistant', content: 'Is there anything especially important to you?' },
        { role: 'user', content: 'single private room' },
        { role: 'assistant', content: 'Got it 👍 I’ll prioritize plans that offer a Single Private Room.' }
    ], 'single private room', (r) => {
        if (r.reply.toLowerCase().includes('is there anything especially important')) {
            throw new Error('Repeated the same question!');
        }
        if (!r.reply.toLowerCase().includes('already have single private room') && !r.reply.toLowerCase().includes('single private room')) {
            throw new Error('Did not recognize existing room preference');
        }
    });

    console.log('========================================================');
    console.log('=== ALL 8 FINAL TEST CASES PASSED WITH 100% SUCCESS ===');
    console.log('========================================================');
}

runFinalVerification().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});

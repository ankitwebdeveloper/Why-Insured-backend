import { answerPolicyQuestionWithOfficialVerification } from './services/officialPolicyVerificationService.js';

async function runTests() {
  console.log('=== TEST 1: PDF with Complete Room Rent Limit ===');
  const completeContext = {
    fullText: 'Tata AIG General Insurance. Policy schedule. Sum Insured: Rs. 10 Lakhs. Room rent limit: Single Private AC Room covered in full without proportionate deduction.',
    analysisResult: {
      policyDetails: { insurer: 'Tata AIG General Insurance', policyName: 'MediCare Select' },
      limitsAndConditions: [
        {
          conditionName: 'Room Rent Limit',
          limitValue: 'Single Private Room',
          simpleExplanation: 'Single Private Room is covered in full without daily rent capping.'
        }
      ]
    },
    identifiedProduct: {
      insurer: 'Tata AIG General Insurance Company Limited',
      productName: 'MediCare Select'
    }
  };

  const res1 = await answerPolicyQuestionWithOfficialVerification('Room rent kitna covered hai?', completeContext);
  console.log('Test 1 Source Type:', res1.sourceType);
  console.log('Test 1 Direct Answer:', res1.directAnswer);
  console.log('Test 1 Passed?', res1.sourceType === 'uploaded_policy');

  console.log('\n=== TEST 2: PDF Mentions Feature but Incomplete Detail (Triggers Official Verification) ===');
  const incompleteContext = {
    fullText: 'Policy Schedule. Insurer: Tata AIG General Insurance Company Limited. Product: MediCare Select. Room rent is covered.',
    analysisResult: {
      policyDetails: { insurer: 'Tata AIG General Insurance Company Limited', policyName: 'MediCare Select' },
      limitsAndConditions: []
    },
    identifiedProduct: {
      insurer: 'Tata AIG General Insurance Company Limited',
      productName: 'MediCare Select'
    }
  };

  const res2 = await answerPolicyQuestionWithOfficialVerification('Which room can I take in hospital?', incompleteContext);
  console.log('Test 2 Source Type:', res2.sourceType);
  console.log('Test 2 Found in Uploaded Policy:', res2.foundInUploadedPolicy);
  console.log('Test 2 Official Policy Wording:', res2.officialPolicyWording);
  console.log('Test 2 Simple Explanation:', res2.simpleExplanation);
  console.log('Test 2 Official Source:', res2.officialSource);
  console.log('Test 2 Passed?', res2.sourceType === 'verified_official' && res2.officialSource?.url && res2.officialPolicyWording);

  console.log('\n=== TEST 3: Feature not verifiable anywhere (Zero Hallucination) ===');
  const unverifiedContext = {
    fullText: 'Some unknown company XYZ plan. Nothing else is provided.',
    analysisResult: {},
    identifiedProduct: {
      insurer: 'XYZ Unknown Insurance Co',
      productName: 'Random Unverified Plan'
    }
  };

  const res3 = await answerPolicyQuestionWithOfficialVerification('Does this plan cover exotic stem cell therapy on Mars?', unverifiedContext);
  console.log('Test 3 Source Type:', res3.sourceType);
  console.log('Test 3 Direct Answer:', res3.directAnswer);
  console.log('Test 3 Passed?', res3.sourceType === 'unverified' && res3.directAnswer.includes('could not be verified'));
}

runTests().then(() => console.log('\nAll verification tests completed.'));

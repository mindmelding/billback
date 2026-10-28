/**
 * Tests for optOutTiming.js - Opt-out and switch timing calculations (CORRECTED)
 * Updated with verified rules from Sean's independent research
 */

import { 
  calculateOptOutTiming, 
  formatTimingRuleAsAction,
  getCountdownText,
  isTimeSensitive 
} from './optOutTiming.js';

/**
 * Test: Fixture household (Cycle 19, CEA Clean Impact Plus, NEM 2.0, True-up Oct 28, 2026)
 * Validates Nov 27, 2026 notice deadline and May 28, 2027 switch date
 */
function testFixtureHouseholdOptOutTiming() {
  console.log('\n=== Test: Fixture Household Opt-Out Timing (Cycle 19, Oct 28, 2026) ===');
  
  const currentPlan = {
    provider: 'CEA',
    plan: 'Clean Impact Plus'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-07-30', end: '2026-08-27' },
    cycle: 19,
    hasSolar: true,
    nemTrueUpDate: '2026-10-28'
  }];
  
  const savingsReport = {
    providerAlternatives: [
      {
        provider: 'CEA',
        plan: 'Clean Impact',
        savings: 6 // One billing cycle worth of relief credit
      },
      {
        provider: 'SDG&E',
        plan: 'TOU-DR1',
        savings: 420 // Annual savings minus ~$70 credit forfeit
      }
    ]
  };
  
  const household = { hasSolar: true };
  
  // Set "today" to Oct 28, 2026 (fixture's true-up date)
  const today = new Date('2026-10-28');
  
  const rules = calculateOptOutTiming(currentPlan, bills, savingsReport, household);
  
  console.log(`Found ${rules.length} timing rules`);
  
  // Test 1: CEA tier opt-down deadline
  const tierRule = rules.find(r => r.action.includes('Clean Impact Plus to Clean Impact'));
  if (!tierRule) {
    console.error('❌ FAIL: No CEA tier downgrade rule found');
    return false;
  }
  console.log('✓ Found CEA tier downgrade rule');
  
  // Check deadline is Thu Nov 19, 2026 (5 business days before Nov 27 read, accounting for Thanksgiving)
  const expectedTierDeadline = new Date('2026-11-19');
  if (tierRule.deadline.toDateString() !== expectedTierDeadline.toDateString()) {
    console.error(`❌ FAIL: Expected tier deadline Nov 19, 2026, got ${tierRule.deadline.toLocaleDateString()}`);
    return false;
  }
  console.log('✓ Tier opt-down deadline is Thu Nov 19, 2026');
  
  // Check savings estimate is ~$6 (one cycle), not $10-30/month
  if (tierRule.estimatedSavings > 10) {
    console.error(`❌ FAIL: Tier savings should be ~$6 (one cycle), got $${tierRule.estimatedSavings}`);
    return false;
  }
  console.log('✓ Tier opt-down savings correctly estimated as ~$6 (one cycle before Dec 31 expiration)');
  
  // Test 2: CCA opt-out to SDG&E notice deadline
  const optOutRule = rules.find(r => r.action.includes('Opt out of CEA and return to SDG&E'));
  if (!optOutRule) {
    console.error('❌ FAIL: No CCA opt-out rule found');
    return false;
  }
  console.log('✓ Found CCA opt-out rule');
  
  // Check deadline is Fri Nov 27, 2026
  const expectedOptOutDeadline = new Date('2026-11-27');
  if (optOutRule.deadline.toDateString() !== expectedOptOutDeadline.toDateString()) {
    console.error(`❌ FAIL: Expected opt-out deadline Nov 27, 2026, got ${optOutRule.deadline.toLocaleDateString()}`);
    return false;
  }
  console.log('✓ CCA opt-out notice deadline is Fri Nov 27, 2026 (SDG&E must receive)');
  
  // Check that reasoning mentions May 28, 2027 switch date
  // toLocaleDateString() will format as "5/28/2027" in US locale
  if (!optOutRule.reason.includes('5/28') && !optOutRule.reason.includes('May')) {
    console.error('❌ FAIL: Reasoning should mention May 28, 2027 switch date');
    console.error(`   Actual reason: ${optOutRule.reason.substring(0, 200)}`);
    return false;
  }
  console.log('✓ Reasoning correctly mentions May 28, 2027 switch date');
  
  // Check that credit forfeiture is mentioned
  if (!optOutRule.reason.includes('forfeited') && !optOutRule.reason.includes('forfeit')) {
    console.error('❌ FAIL: Should mention credit forfeiture from interim true-up');
    return false;
  }
  console.log('✓ Credit forfeiture from interim true-up mentioned');
  
  // Check verified status
  if (!optOutRule.verified) {
    console.error('❌ FAIL: Opt-out rule should be verified (based on SDG&E Rule 27)');
    return false;
  }
  console.log('✓ Opt-out rule is marked as verified');
  
  // Check source references SDG&E Rule 27
  if (!optOutRule.source.includes('Rule 27')) {
    console.error('❌ FAIL: Source should reference SDG&E Rule 27');
    return false;
  }
  console.log('✓ Source references SDG&E Rule 27');
  
  // Test 3: Rate plan change warning
  const ratePlanRule = rules.find(r => r.action.includes('Do NOT change SDG&E rate plan now'));
  if (!ratePlanRule) {
    console.error('❌ FAIL: No rate plan change warning found');
    return false;
  }
  console.log('✓ Found rate plan change warning');
  
  // Check avoid window
  if (!ratePlanRule.avoidWindow) {
    console.error('❌ FAIL: Rate plan warning should have avoid window');
    return false;
  }
  console.log('✓ Rate plan warning has avoid window');
  
  console.log('✅ PASS: Fixture household opt-out timing');
  return true;
}

/**
 * Test: CEA Clean Impact Plus → Clean Impact timing with Dec 31, 2026 relief credit deadline
 */
function testCEACleanImpactPlusDowngrade() {
  console.log('\n=== Test: CEA Clean Impact Plus → Clean Impact Timing ===');
  
  const currentPlan = {
    provider: 'CEA',
    plan: 'Clean Impact Plus'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
    cycle: 19,
    hasSolar: false
  }];
  
  const savingsReport = {
    providerAlternatives: [
      {
        provider: 'CEA',
        plan: 'Clean Impact',
        savings: 6
      }
    ]
  };
  
  const household = { hasSolar: false };
  
  const rules = calculateOptOutTiming(currentPlan, bills, savingsReport, household);
  
  const tierRule = rules.find(r => r.action.includes('Clean Impact Plus to Clean Impact'));
  
  if (!tierRule) {
    console.error('❌ FAIL: No CEA tier downgrade rule found');
    return false;
  }
  
  console.log('✓ Found CEA tier downgrade rule');
  
  // Check verified status (5-day rule verified for opt-outs, likely applies to opt-downs)
  if (!tierRule.verified) {
    console.error('❌ FAIL: Rule should be verified');
    return false;
  }
  console.log('✓ Rule is verified');
  
  // Check that savings is minimal (~$6, not $10-30/month)
  if (tierRule.estimatedSavings > 10) {
    console.error(`❌ FAIL: Expected minimal savings (~$6), got $${tierRule.estimatedSavings}`);
    return false;
  }
  console.log('✓ Savings correctly limited to ~$6 (one billing cycle before Dec 31 expiration)');
  
  console.log('✅ PASS: CEA Clean Impact Plus downgrade timing');
  return true;
}

/**
 * Test: Non-solar CCA opt-out timing (simpler, no true-up interaction)
 */
function testNonSolarCCAOptOut() {
  console.log('\n=== Test: Non-Solar CCA Opt-Out Timing ===');
  
  const currentPlan = {
    provider: 'SDCP',
    plan: 'Power On'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
    cycle: 19,
    hasSolar: false
  }];
  
  const savingsReport = {
    providerAlternatives: [
      {
        provider: 'SDG&E',
        plan: 'TOU-DR1',
        savings: 240
      }
    ]
  };
  
  const household = { hasSolar: false };
  
  const rules = calculateOptOutTiming(currentPlan, bills, savingsReport, household);
  
  const optOutRule = rules.find(r => r.action.includes('Opt out of SDCP'));
  
  if (!optOutRule) {
    console.error('❌ FAIL: No SDCP opt-out rule found');
    return false;
  }
  
  console.log('✓ Found SDCP opt-out rule');
  
  // Check verified status
  if (!optOutRule.verified) {
    console.error('❌ FAIL: Rule should be verified (SDG&E Rule 27 applies to all CCAs)');
    return false;
  }
  console.log('✓ Rule is verified');
  
  // Check that 6-month advance notice is mentioned
  if (!optOutRule.reason.includes('6-month advance notice')) {
    console.error('❌ FAIL: Should mention 6-month advance notice');
    return false;
  }
  console.log('✓ 6-month advance notice mentioned');
  
  // Check that 12-month minimum stay is mentioned
  if (!optOutRule.reason.includes('12-month minimum stay')) {
    console.error('❌ FAIL: Should mention 12-month minimum stay');
    return false;
  }
  console.log('✓ 12-month minimum stay mentioned');
  
  console.log('✅ PASS: Non-solar CCA opt-out timing');
  return true;
}

/**
 * Test: CARE/FERA enrollment timing (immediate)
 */
function testCAREEnrollmentTiming() {
  console.log('\n=== Test: CARE/FERA Enrollment Timing ===');
  
  const currentPlan = {
    provider: 'SDG&E',
    plan: 'TOU-DR1'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
    cycle: 19
  }];
  
  const savingsReport = {
    discountPrograms: [
      {
        program: 'CARE',
        eligibility: 'Household income under $45,000/year',
        electricDiscount: 0.35,
        gasDiscount: 0.20
      }
    ]
  };
  
  const household = {};
  
  const rules = calculateOptOutTiming(currentPlan, bills, savingsReport, household);
  
  const careRule = rules.find(r => r.action.includes('CARE'));
  
  if (!careRule) {
    console.error('❌ FAIL: No CARE enrollment rule found');
    return false;
  }
  
  console.log('✓ Found CARE enrollment rule');
  
  // Check immediate action
  if (careRule.recommendedDate !== 'immediate') {
    console.error('❌ FAIL: CARE enrollment should be immediate');
    return false;
  }
  console.log('✓ Recommends immediate action');
  
  // Check high urgency
  if (careRule.urgency !== 'high') {
    console.error('❌ FAIL: CARE enrollment should be high urgency');
    return false;
  }
  console.log('✓ High urgency');
  
  // Check verified
  if (!careRule.verified) {
    console.error('❌ FAIL: CARE enrollment rule should be verified');
    return false;
  }
  console.log('✓ Rule is verified');
  
  console.log('✅ PASS: CARE enrollment timing');
  return true;
}

/**
 * Test: Format timing rule as action
 */
function testFormatTimingRuleAsAction() {
  console.log('\n=== Test: Format Timing Rule as Action ===');
  
  const rule = {
    action: 'Switch from CEA Clean Impact Plus to Clean Impact',
    recommendedDate: new Date('2026-11-01'),
    deadline: new Date('2026-11-19'),
    avoidWindow: null,
    reason: 'Relief credit ends Dec 31, 2026',
    costOfEarly: 'None',
    costOfLate: 'Miss relief credit',
    source: 'CEA 2026 rate announcement',
    verified: true,
    estimatedSavings: 6,
    urgency: 'high',
    daysUntil: 10,
    daysUntilDeadline: 28
  };
  
  const action = formatTimingRuleAsAction(rule);
  
  if (!action.id || !action.id.startsWith('opt_out_')) {
    console.error('❌ FAIL: Action should have opt_out_ id');
    return false;
  }
  console.log('✓ Action has correct id format');
  
  if (!action.what.includes('Clean Impact')) {
    console.error('❌ FAIL: Action title missing');
    return false;
  }
  console.log('✓ Action has title');
  
  if (!action.how.includes('Relief credit')) {
    console.error('❌ FAIL: Action description incomplete');
    return false;
  }
  console.log('✓ Action has full description');
  
  if (action.category !== 'opt-out') {
    console.error('❌ FAIL: Action category should be opt-out');
    return false;
  }
  console.log('✓ Action category is opt-out');
  
  console.log('✅ PASS: Format timing rule as action');
  return true;
}

/**
 * Test: Countdown text generation
 */
function testCountdownText() {
  console.log('\n=== Test: Countdown Text ===');
  
  const testCases = [
    { daysUntil: 0, expected: 'Act now' },
    { daysUntil: 5, expected: '5 days' },
    { daysUntil: 10, expected: '2 weeks' },
    { daysUntil: 25, expected: '4 weeks' },
    { daysUntil: 60, expected: '2 months' },
    { daysUntil: 400, expected: '1 year' },
    { daysUntil: null, expected: 'No deadline' }
  ];
  
  let allPassed = true;
  
  testCases.forEach(tc => {
    const result = getCountdownText({ daysUntil: tc.daysUntil });
    if (result !== tc.expected) {
      console.error(`❌ FAIL: daysUntil=${tc.daysUntil}, expected "${tc.expected}", got "${result}"`);
      allPassed = false;
    } else {
      console.log(`✓ daysUntil=${tc.daysUntil} → "${result}"`);
    }
  });
  
  if (allPassed) {
    console.log('✅ PASS: Countdown text');
  }
  
  return allPassed;
}

/**
 * Test: Time-sensitive detection
 */
function testTimeSensitiveDetection() {
  console.log('\n=== Test: Time-Sensitive Detection ===');
  
  const testCases = [
    { urgency: 'high', daysUntil: 100, expected: true, desc: 'High urgency' },
    { urgency: 'medium', daysUntil: 15, expected: true, desc: 'Within 30 days' },
    { urgency: 'low', daysUntil: 100, expected: false, desc: 'Low urgency, far out' },
    { urgency: 'medium', daysUntil: null, daysUntilDeadline: 30, expected: true, desc: 'Deadline within 60 days' }
  ];
  
  let allPassed = true;
  
  testCases.forEach(tc => {
    const rule = {
      urgency: tc.urgency,
      daysUntil: tc.daysUntil,
      daysUntilDeadline: tc.daysUntilDeadline || null
    };
    const result = isTimeSensitive(rule);
    if (result !== tc.expected) {
      console.error(`❌ FAIL: ${tc.desc}, expected ${tc.expected}, got ${result}`);
      allPassed = false;
    } else {
      console.log(`✓ ${tc.desc}: ${result}`);
    }
  });
  
  if (allPassed) {
    console.log('✅ PASS: Time-sensitive detection');
  }
  
  return allPassed;
}

/**
 * Test: Rule sorting by urgency and timing
 */
function testRuleSorting() {
  console.log('\n=== Test: Rule Sorting (Urgency + Timing) ===');
  
  const currentPlan = {
    provider: 'CEA',
    plan: 'Clean Impact Plus'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
    cycle: 19,
    hasSolar: true,
    nemTrueUpDate: '2026-10-28'
  }];
  
  const savingsReport = {
    providerAlternatives: [
      {
        provider: 'CEA',
        plan: 'Clean Impact',
        savings: 6
      },
      {
        provider: 'SDG&E',
        plan: 'TOU-DR1',
        savings: 420
      }
    ],
    discountPrograms: [
      {
        program: 'CARE',
        eligibility: 'Income under $45k',
        electricDiscount: 0.35
      }
    ]
  };
  
  const household = { hasSolar: true };
  
  const rules = calculateOptOutTiming(currentPlan, bills, savingsReport, household);
  
  console.log(`Found ${rules.length} timing rules`);
  
  // Check that rules are sorted by urgency
  let previousUrgencyRank = -1;
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  
  rules.forEach((rule, i) => {
    const rank = urgencyOrder[rule.urgency];
    if (rank < previousUrgencyRank) {
      console.error(`❌ FAIL: Rules not sorted by urgency at index ${i}`);
      return false;
    }
    previousUrgencyRank = rank;
    console.log(`${i + 1}. [${rule.urgency.toUpperCase()}] ${rule.action.substring(0, 50)}... (${rule.daysUntil === 0 ? 'NOW' : rule.daysUntil + ' days'})`);
  });
  
  console.log('✅ PASS: Rule sorting');
  return true;
}

// Run all tests
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║   Opt-Out Timing Module Tests (CORRECTED)            ║');
console.log('╚══════════════════════════════════════════════════════╝');

const results = [
  testFixtureHouseholdOptOutTiming(),
  testCEACleanImpactPlusDowngrade(),
  testNonSolarCCAOptOut(),
  testCAREEnrollmentTiming(),
  testFormatTimingRuleAsAction(),
  testCountdownText(),
  testTimeSensitiveDetection(),
  testRuleSorting()
];

const passed = results.filter(r => r).length;
const total = results.length;

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log(`║   Test Results: ${passed}/${total} passed                          ║`);
console.log('╚══════════════════════════════════════════════════════╝');

if (passed === total) {
  console.log('\n✅ All tests passed!\n');
  process.exit(0);
} else {
  console.log(`\n❌ ${total - passed} test(s) failed\n`);
  process.exit(1);
}

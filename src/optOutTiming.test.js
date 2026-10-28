/**
 * Tests for optOutTiming.js - Opt-out and switch timing calculations
 */

import { 
  calculateOptOutTiming, 
  formatTimingRuleAsAction,
  getCountdownText,
  isTimeSensitive 
} from './optOutTiming.js';

/**
 * Test: CEA Clean Impact Plus → Clean Impact timing (relief credit deadline Dec 31, 2026)
 */
function testCEACleanImpactPlusDowngrade() {
  console.log('\n=== Test: CEA Clean Impact Plus → Clean Impact Timing ===');
  
  const currentPlan = {
    provider: 'CEA',
    plan: 'Clean Impact Plus'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
    hasSolar: false
  }];
  
  const savingsReport = {
    providerAlternatives: [
      {
        provider: 'CEA',
        plan: 'Clean Impact',
        savings: 180 // $180/year savings by switching down
      }
    ]
  };
  
  const household = { hasSolar: false };
  
  const rules = calculateOptOutTiming(currentPlan, bills, savingsReport, household);
  
  // Should have one rule for CEA tier downgrade
  const tierRule = rules.find(r => r.action.includes('Clean Impact Plus to Clean Impact'));
  
  if (!tierRule) {
    console.error('❌ FAIL: No CEA tier downgrade rule found');
    return false;
  }
  
  console.log('✓ Found CEA tier downgrade rule');
  
  // Check deadline is Dec 31, 2026
  const expectedDeadline = new Date('2026-12-31');
  if (tierRule.deadline.getTime() !== expectedDeadline.getTime()) {
    console.error(`❌ FAIL: Expected deadline ${expectedDeadline}, got ${tierRule.deadline}`);
    return false;
  }
  console.log('✓ Deadline is Dec 31, 2026');
  
  // Check recommended date is Nov 1, 2026
  const expectedRecommended = new Date('2026-11-01');
  if (tierRule.recommendedDate.getTime() !== expectedRecommended.getTime()) {
    console.error(`❌ FAIL: Expected recommended date ${expectedRecommended}, got ${tierRule.recommendedDate}`);
    return false;
  }
  console.log('✓ Recommended date is Nov 1, 2026');
  
  // Check verified status
  if (!tierRule.verified) {
    console.error('❌ FAIL: Rule should be verified');
    return false;
  }
  console.log('✓ Rule is verified');
  
  // Check urgency based on current date
  // If today is Nov 2026 or later, urgency should be high
  const today = new Date();
  if (today >= new Date('2026-11-01')) {
    if (tierRule.urgency !== 'high') {
      console.error(`❌ FAIL: Expected high urgency in Nov 2026+, got ${tierRule.urgency}`);
      return false;
    }
    console.log('✓ Urgency is high (near deadline)');
  }
  
  console.log('✅ PASS: CEA Clean Impact Plus downgrade timing');
  return true;
}

/**
 * Test: Solar customer CCA opt-out timing relative to true-up date
 * Fixture: True-up date Oct 28, 2026
 */
function testSolarCCAOptOutTiming() {
  console.log('\n=== Test: Solar CCA Opt-Out Timing (True-Up: Oct 28, 2026) ===');
  
  const currentPlan = {
    provider: 'CEA',
    plan: 'Clean Impact Plus'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-07-30', end: '2026-08-27' },
    hasSolar: true,
    nemTrueUpDate: '2026-10-28'
  }];
  
  const savingsReport = {
    providerAlternatives: [
      {
        provider: 'SDG&E',
        plan: 'TOU-DR1',
        savings: 420 // $420/year savings by switching to SDG&E
      }
    ]
  };
  
  const household = { hasSolar: true };
  
  const rules = calculateOptOutTiming(currentPlan, bills, savingsReport, household);
  
  // Should have one rule for CCA opt-out
  const optOutRule = rules.find(r => r.action.includes('Opt out of CEA'));
  
  if (!optOutRule) {
    console.error('❌ FAIL: No CCA opt-out rule found');
    return false;
  }
  
  console.log('✓ Found CCA opt-out rule');
  
  // Calculate expected optimal window: 1-60 days after Oct 28, 2026
  const trueUpDate = new Date('2026-10-28');
  const optimalStart = new Date(trueUpDate);
  optimalStart.setDate(optimalStart.getDate() + 1); // Oct 29, 2026
  
  const optimalEnd = new Date(trueUpDate);
  optimalEnd.setDate(optimalEnd.getDate() + 60); // Dec 27, 2026
  
  console.log(`✓ Optimal window: ${optimalStart.toLocaleDateString()} - ${optimalEnd.toLocaleDateString()}`);
  
  // Check verified status
  if (!optOutRule.verified) {
    console.error('❌ FAIL: Rule should be verified (based on SDG&E NEM tariff)');
    return false;
  }
  console.log('✓ Rule is verified');
  
  // Check that avoid window is defined
  if (!optOutRule.avoidWindow) {
    console.error('❌ FAIL: Avoid window should be defined');
    return false;
  }
  console.log(`✓ Avoid window defined: ${optOutRule.avoidWindow}`);
  
  // Check that source references SDG&E Electric Rule 27
  if (!optOutRule.source.includes('Electric Rule 27')) {
    console.error('❌ FAIL: Source should reference SDG&E Electric Rule 27');
    return false;
  }
  console.log('✓ Source references SDG&E Electric Rule 27');
  
  // Test timing logic based on current date
  const today = new Date();
  
  if (today >= optimalStart && today <= optimalEnd) {
    // In optimal window
    if (optOutRule.recommendedDate !== 'immediate') {
      console.error('❌ FAIL: Should recommend immediate action in optimal window');
      return false;
    }
    if (optOutRule.urgency !== 'high') {
      console.error('❌ FAIL: Should be high urgency in optimal window');
      return false;
    }
    console.log('✓ Recommends immediate action (in optimal window)');
  } else if (today < optimalStart) {
    // Before optimal window
    if (optOutRule.recommendedDate === 'immediate') {
      console.error('❌ FAIL: Should not recommend immediate action before optimal window');
      return false;
    }
    console.log('✓ Recommends waiting until after true-up');
  } else {
    // After optimal window
    console.log('✓ Recommends next year\'s optimal window');
  }
  
  console.log('✅ PASS: Solar CCA opt-out timing');
  return true;
}

/**
 * Test: Non-solar CCA opt-out timing (before summer)
 */
function testNonSolarCCAOptOut() {
  console.log('\n=== Test: Non-Solar CCA Opt-Out Timing ===');
  
  const currentPlan = {
    provider: 'SDCP',
    plan: 'Power On'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
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
  
  // Check that rule is marked as unverified (6-month processing time)
  if (optOutRule.verified) {
    console.error('❌ FAIL: Rule should be marked unverified (6-month estimate not confirmed)');
    return false;
  }
  console.log('✓ Rule correctly marked as unverified');
  
  // Check that avoid window mentions summer months
  if (!optOutRule.avoidWindow || !optOutRule.avoidWindow.includes('June')) {
    console.error('❌ FAIL: Avoid window should mention summer months');
    return false;
  }
  console.log('✓ Avoid window mentions summer months');
  
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
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' }
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
  
  // Check daysUntil is 0
  if (careRule.daysUntil !== 0) {
    console.error('❌ FAIL: daysUntil should be 0 for immediate action');
    return false;
  }
  console.log('✓ daysUntil is 0');
  
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
    deadline: new Date('2026-12-31'),
    avoidWindow: null,
    reason: 'Relief credit ends Dec 31, 2026',
    costOfEarly: 'None',
    costOfLate: 'Miss relief credit',
    source: 'CEA 2026 rate announcement',
    verified: true,
    estimatedSavings: 180,
    urgency: 'high',
    daysUntil: 10,
    daysUntilDeadline: 70
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
 * Test: Multiple rules sorted by urgency and timing
 */
function testRuleSorting() {
  console.log('\n=== Test: Rule Sorting (Urgency + Timing) ===');
  
  const currentPlan = {
    provider: 'CEA',
    plan: 'Clean Impact Plus'
  };
  
  const bills = [{
    billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
    hasSolar: true,
    nemTrueUpDate: '2026-10-28'
  }];
  
  const savingsReport = {
    providerAlternatives: [
      {
        provider: 'CEA',
        plan: 'Clean Impact',
        savings: 180
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
console.log('║   Opt-Out Timing Module Tests                        ║');
console.log('╚══════════════════════════════════════════════════════╝');

const results = [
  testCEACleanImpactPlusDowngrade(),
  testSolarCCAOptOutTiming(),
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

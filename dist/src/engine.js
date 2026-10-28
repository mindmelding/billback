/**
 * Billback Savings Engine
 * Calculates bill costs under different rate plans and behavioral changes
 * 
 * Per CLAUDE.md: Every figure needs a date and source
 */

import * as rates from './rates.js';

/**
 * Calculate monthly bill cost for a given rate plan and usage
 * @param {Object} usage - { onPeak: kWh, offPeak: kWh, superOffPeak: kWh, season: 'summer'|'winter' }
 * @param {Object} ratePlan - Rate plan from rates.js
 * @returns {number} Total cost in dollars
 */
export function calculateMonthlyCost(usage, ratePlan) {
  const season = ratePlan[usage.season];
  if (!season) {
    throw new Error(`Invalid season: ${usage.season}`);
  }

  const energyCost = 
    (usage.onPeak || 0) * season.onPeak +
    (usage.offPeak || 0) * season.offPeak +
    (usage.superOffPeak || 0) * season.superOffPeak;

  const totalKwh = (usage.onPeak || 0) + (usage.offPeak || 0) + (usage.superOffPeak || 0);
  const nbcCost = totalKwh * ratePlan.nbcCharge;

  return energyCost + nbcCost + ratePlan.baseFee;
}

/**
 * Calculate annual cost from multiple bills or NEM YTD data
 * @param {Array<Object>} bills - Array of { date, usage, cost } or NEM YTD data
 * @param {Object} ratePlan - Rate plan from rates.js
 * @param {Array<Object>} nemYearToDate - Optional: NEM table with 10-12 months of history
 * @returns {Object} { annualCost, confidence, basis }
 */
export function calculateAnnualCost(bills, ratePlan, nemYearToDate = null) {
  if (bills.length === 0 && (!nemYearToDate || nemYearToDate.length === 0)) {
    throw new Error('No bills provided');
  }

  // **USE NEM YTD DATA IF AVAILABLE** - much better than extrapolation
  if (nemYearToDate && nemYearToDate.length >= 10) {
    let totalCost = 0;
    let monthsCovered = 0;
    
    nemYearToDate.forEach(month => {
      // Determine season from date
      const date = new Date(month.date);
      const monthNum = date.getMonth();
      const season = (monthNum >= 5 && monthNum <= 9) ? 'summer' : 'winter';
      
      // Create usage object (NEM data has negative values for net export)
      const usage = {
        onPeak: Math.abs(month.onPeak || 0),
        offPeak: Math.abs(month.offPeak || 0),
        superOffPeak: Math.abs(month.superOffPeak || 0),
        season
      };
      
      const cost = calculateMonthlyCost(usage, ratePlan);
      totalCost += cost;
      monthsCovered++;
    });
    
    // Extrapolate if we have 10-11 months
    const annualCost = monthsCovered === 12 
      ? totalCost 
      : totalCost * (12 / monthsCovered);
    
    return {
      annualCost,
      confidence: monthsCovered >= 11 ? 'high' : 'medium',
      basis: `${monthsCovered} months from NEM Year-to-Date table${monthsCovered < 12 ? ', extrapolated to 12 months' : ''}`
    };
  }

  // Fall back to bill-by-bill calculation
  const sorted = bills.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // If we have 12 months, sum them
  if (sorted.length >= 12) {
    const total = sorted.slice(0, 12).reduce((sum, bill) => {
      return sum + calculateMonthlyCost(bill.usage, ratePlan);
    }, 0);
    return {
      annualCost: total,
      confidence: 'high',
      basis: '12 months of actual usage'
    };
  }

  // If we have 3+ non-consecutive months, estimate with seasonal weighting
  if (sorted.length >= 3) {
    const summerWeight = 5; // Jun-Oct (5 months)
    const winterWeight = 7; // Nov-May (7 months)
    
    let summerAvg = 0;
    let winterAvg = 0;
    let summerCount = 0;
    let winterCount = 0;

    sorted.forEach(bill => {
      const month = new Date(bill.date).getMonth(); // 0-11
      const isSummer = month >= 5 && month <= 9; // Jun-Oct
      
      const cost = calculateMonthlyCost(bill.usage, ratePlan);
      if (isSummer) {
        summerAvg += cost;
        summerCount++;
      } else {
        winterAvg += cost;
        winterCount++;
      }
    });

    summerAvg = summerCount > 0 ? summerAvg / summerCount : 0;
    winterAvg = winterCount > 0 ? winterAvg / winterCount : 0;

    // If we're missing a season, use the other season's average with a warning
    if (summerCount === 0) {
      summerAvg = winterAvg * 1.5; // rough estimate: summer bills are ~50% higher
    }
    if (winterCount === 0) {
      winterAvg = summerAvg / 1.5;
    }

    const annualCost = summerAvg * summerWeight + winterAvg * winterWeight;
    const hasFullSeasons = summerCount > 0 && winterCount > 0;

    return {
      annualCost,
      confidence: hasFullSeasons ? 'medium' : 'low',
      basis: `${sorted.length} months (${summerCount} summer, ${winterCount} winter), extrapolated to full year`
    };
  }

  // Less than 3 months - just multiply the average
  const avgCost = sorted.reduce((sum, bill) => {
    return sum + calculateMonthlyCost(bill.usage, ratePlan);
  }, 0) / sorted.length;

  return {
    annualCost: avgCost * 12,
    confidence: 'low',
    basis: `${sorted.length} month(s), simple annualization (seasonal variation not accounted for)`
  };
}

/**
 * Compare costs across different providers
 * @param {Array<Object>} bills - Array of bill objects
 * @param {Object} currentPlan - Current rate plan
 * @param {Array<Object>} nemYearToDate - Optional: NEM YTD data for better estimates
 * @returns {Array<Object>} Array of { provider, plan, annualCost, savings, confidence }
 */
export function compareProviders(bills, currentPlan, nemYearToDate = null) {
  const currentCostData = calculateAnnualCost(bills, currentPlan, nemYearToDate);
  const alternatives = [];

  // Get all rate plans except the current one
  const plans = [
    rates.SDGE_TOU_DR1,
    rates.CEA_CLEAN_IMPACT,
    rates.CEA_CLEAN_IMPACT_PLUS,
    rates.SDCP_POWER_ON,
    rates.SDCP_POWER_BASE
  ].filter(plan => 
    !(plan.provider === currentPlan.provider && plan.plan === currentPlan.plan)
  );

  for (const plan of plans) {
    const costData = calculateAnnualCost(bills, plan, nemYearToDate);
    const savings = currentCostData.annualCost - costData.annualCost;
    
    alternatives.push({
      provider: plan.provider,
      plan: plan.plan,
      annualCost: costData.annualCost,
      savings,
      confidence: costData.confidence,
      basis: costData.basis,
      effectiveDate: plan.effectiveDate,
      source: plan.source
    });
  }

  // Sort by highest savings first
  return alternatives.sort((a, b) => b.savings - a.savings);
}

/**
 * Calculate gas savings opportunities
 * @param {Object} gasUsage - { therms, cost } from parsed bill
 * @returns {Array<Object>} Array of gas savings actions
 */
export function calculateGasSavings(gasUsage) {
  if (!gasUsage || !gasUsage.therms) {
    return [];
  }

  const actions = [];

  // Thermostat setback in winter
  if (gasUsage.therms > 10) { // Only if there's meaningful gas usage
    actions.push({
      id: 'gas_thermostat',
      action: 'Lower thermostat by 2-3°F when sleeping or away',
      category: 'Heating',
      effort: 'Low',
      annualSavingsRange: [50, 120],
      basis: 'Estimate; ~10-15% heating savings (DOE guidance)',
      renterOk: true
    });
  }

  // Water heater temperature
  actions.push({
    id: 'water_heater',
    action: 'Lower water heater to 120°F',
    category: 'Water heating',
    effort: 'Low',
    annualSavingsRange: [20, 60],
    basis: 'Estimate; most homes set too high (DOE guidance)',
    renterOk: false // requires landlord permission
  });

  // Weather stripping
  if (gasUsage.therms > 15) {
    actions.push({
      id: 'weatherstrip',
      action: 'Weather strip doors and windows',
      category: 'Efficiency',
      effort: 'Medium',
      upfront: 30,
      annualSavingsRange: [30, 80],
      basis: 'Estimate; reduces drafts',
      renterOk: true
    });
  }

  return actions;
}

/**
 * Calculate NEM true-up projection
 * Projects remaining months until true-up using NEM YTD history
 * @param {Object} nemData - { trueUpDate, balance, systemSize }
 * @param {Array<Object>} nemYearToDate - Array of monthly NEM data
 * @param {Object} ratePlan - Current rate plan for pricing
 * @returns {Object|null} Projection object or null
 */
export function calculateNEMTrueUpProjection(nemData, nemYearToDate, ratePlan) {
  if (!nemData || !nemData.trueUpDate || nemData.balance === null) {
    return null;
  }

  const today = new Date();
  const trueUpDate = new Date(nemData.trueUpDate);
  
  // Check if true-up has already passed
  if (trueUpDate < today) {
    return {
      trueUpDate: nemData.trueUpDate,
      isPast: true,
      currentBalance: nemData.balance,
      message: `Your solar true-up date (${nemData.trueUpDate}) has passed. Contact SDG&E if you haven't received your true-up bill yet.`
    };
  }

  const daysUntil = Math.ceil((trueUpDate - today) / (1000 * 60 * 60 * 24));
  const isUrgent = daysUntil <= 60;
  
  // If we don't have NEM history, can't project
  if (!nemYearToDate || nemYearToDate.length === 0) {
    return {
      trueUpDate: nemData.trueUpDate,
      daysUntil,
      currentBalance: nemData.balance,
      isUrgent,
      message: isUrgent
        ? `Your solar true-up is ${daysUntil} days away (${nemData.trueUpDate}). Current balance: $${nemData.balance.toFixed(2)} so far.`
        : `Your solar true-up is on ${nemData.trueUpDate}. Current balance: $${nemData.balance.toFixed(2)} so far.`,
      tips: isUrgent ? [
        'Set aside money now for the true-up bill',
        'Consider switching providers AFTER true-up to avoid double charges',
        'Check if you\'re on the best rate plan before your next year starts'
      ] : []
    };
  }

  // Find most recent bill date from NEM history
  const sortedHistory = nemYearToDate.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestBillDate = new Date(sortedHistory[0].date);
  
  // Calculate months remaining from latest bill to true-up
  const monthsRemaining = Math.ceil((trueUpDate - latestBillDate) / (1000 * 60 * 60 * 24 * 30));
  
  if (monthsRemaining <= 0) {
    // True-up is on or before latest bill date
    return {
      trueUpDate: nemData.trueUpDate,
      daysUntil,
      currentBalance: nemData.balance,
      projectedBalance: nemData.balance,
      isUrgent,
      isPast: false,
      message: `Your solar true-up is ${daysUntil} days away (${nemData.trueUpDate}). Expected amount: $${nemData.balance.toFixed(2)}.`,
      basis: 'Latest bill through true-up date',
      tips: isUrgent ? [
        'Set aside money now for the true-up bill',
        'Consider switching providers AFTER true-up to avoid double charges'
      ] : []
    };
  }

  // Project remaining months using prior-year monthly averages
  // Group history by month (0-11) to get seasonal patterns
  const monthlyAverages = {};
  nemYearToDate.forEach(month => {
    const monthNum = new Date(month.date).getMonth();
    if (!monthlyAverages[monthNum]) {
      monthlyAverages[monthNum] = { total: 0, count: 0 };
    }
    monthlyAverages[monthNum].total += month.nemCharges;
    monthlyAverages[monthNum].count++;
  });

  // Calculate projected charges for remaining months
  let projectedMin = nemData.balance;
  let projectedMax = nemData.balance;
  const projectionDetails = [];

  for (let i = 0; i < monthsRemaining; i++) {
    const futureDate = new Date(latestBillDate);
    futureDate.setMonth(futureDate.getMonth() + i + 1);
    const monthNum = futureDate.getMonth();
    
    if (monthlyAverages[monthNum]) {
      const avgCharge = monthlyAverages[monthNum].total / monthlyAverages[monthNum].count;
      projectedMin += avgCharge * 0.9; // ±10% range
      projectedMax += avgCharge * 1.1;
      
      projectionDetails.push({
        month: futureDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        estimatedCharge: avgCharge,
        basis: `Average from ${monthlyAverages[monthNum].count} prior ${futureDate.toLocaleDateString('en-US', { month: 'long' })} bill(s)`
      });
    } else {
      // No history for this month, use overall average
      const overallAvg = nemYearToDate.reduce((sum, m) => sum + m.nemCharges, 0) / nemYearToDate.length;
      projectedMin += overallAvg * 0.8; // wider range due to uncertainty
      projectedMax += overallAvg * 1.2;
      
      projectionDetails.push({
        month: futureDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        estimatedCharge: overallAvg,
        basis: 'Overall average (no prior-year data for this month)'
      });
    }
  }

  return {
    trueUpDate: nemData.trueUpDate,
    daysUntil,
    currentBalance: nemData.balance,
    latestBillDate: sortedHistory[0].date,
    projectedBalance: [Math.max(0, projectedMin), projectedMax],
    monthsRemaining,
    projectionDetails,
    isUrgent,
    isPast: false,
    message: isUrgent
      ? `Your solar true-up is ${daysUntil} days away (${nemData.trueUpDate}). Projected amount: $${Math.round(projectedMin)}–${Math.round(projectedMax)} (currently $${nemData.balance.toFixed(2)} so far).`
      : `Your solar true-up is on ${nemData.trueUpDate}. Projected amount: $${Math.round(projectedMin)}–${Math.round(projectedMax)} (currently $${nemData.balance.toFixed(2)} so far).`,
    basis: `${nemData.balance.toFixed(2)} through ${sortedHistory[0].date} + ${monthsRemaining} month(s) projected from prior-year averages`,
    tips: isUrgent ? [
      `Set aside $${Math.round(projectedMax)} for the true-up bill`,
      'Consider switching providers AFTER true-up to avoid double charges',
      'Check if you\'re on the best rate plan before your next year starts'
    ] : []
  };
}

/**
 * Calculate NEM true-up alert (DEPRECATED - use calculateNEMTrueUpProjection)
 * @param {Object} nemData - { trueUpDate, balance, systemSize }
 * @returns {Object|null} Alert object or null
 */
export function calculateNEMTrueUpAlert(nemData) {
  if (!nemData || !nemData.trueUpDate || nemData.balance === null) {
    return null;
  }

  const today = new Date();
  const trueUpDate = new Date(nemData.trueUpDate);
  const daysUntil = Math.ceil((trueUpDate - today) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return null; // True-up already passed
  }

  const isUrgent = daysUntil <= 60;
  
  return {
    trueUpDate: nemData.trueUpDate,
    daysUntil,
    expectedBalance: nemData.balance,
    isUrgent,
    message: isUrgent
      ? `Your solar true-up is ${daysUntil} days away (${nemData.trueUpDate}). Expect to pay about $${nemData.balance.toFixed(2)}.`
      : `Your solar true-up is on ${nemData.trueUpDate}. Current balance: $${nemData.balance.toFixed(2)}.`,
    tips: isUrgent ? [
      'Set aside money now for the true-up bill',
      'Consider switching providers AFTER true-up to avoid double charges',
      'Check if you\'re on the best rate plan before your next year starts'
    ] : []
  };
}

/**
 * Calculate behavioral savings (pre-cooling, appliance shifting, etc.)
 * @param {Array<Object>} bills - Array of bill objects
 * @param {Object} ratePlan - Rate plan to use for calculations
 * @returns {Array<Object>} Array of action objects with savings estimates
 */
export function calculateBehavioralSavings(bills, ratePlan) {
  // Behavioral savings from data/actions.json
  // These are estimates based on research, marked as such
  
  const actions = [
    {
      id: 'thermostat',
      action: 'Pre-cool, then hold 78-80°F from 4 to 9 pm',
      category: 'Thermostat',
      effort: 'Low',
      monthlySavingsRange: [16, 36], // summer only
      basis: 'Estimate; LBNL pre-cooling study',
      renterOk: true
    },
    {
      id: 'dryer',
      action: 'Run the dryer before 2 pm or after midnight',
      category: 'Appliance timing',
      effort: 'Low',
      monthlySavingsRange: [13, 25], // summer
      basis: 'Estimate; ~3 kWh/load at summer on-peak prices',
      renterOk: true
    },
    {
      id: 'dishwasher',
      action: 'Dishwasher on delay start after midnight',
      category: 'Appliance timing',
      effort: 'Low',
      monthlySavingsRange: [7, 13], // summer
      basis: 'Estimate; ~1.2 kWh/cycle',
      renterOk: true
    },
    {
      id: 'fans',
      action: 'Fans plus closed west blinds, setpoint up 2-4°F',
      category: 'Cooling',
      effort: 'Low',
      upfront: 40,
      monthlySavingsRange: [8, 20], // summer
      basis: 'DOE fan guidance',
      renterOk: true
    },
    {
      id: 'plugs',
      action: 'Smart plugs off 4-9 pm (dehumidifier, PC standby)',
      category: 'Appliance timing',
      effort: 'Low',
      upfront: 25,
      monthlySavingsRange: [3, 8], // summer
      basis: 'Estimate',
      renterOk: true
    },
    {
      id: 'led',
      action: 'Swap remaining bulbs to LED',
      category: 'Efficiency',
      effort: 'Low',
      upfront: 20,
      monthlySavingsRange: [2, 10], // summer
      basis: 'Estimate; bulbs used 4-9 pm',
      renterOk: true
    }
  ];

  // Calculate annual savings (5 summer months)
  return actions.map(action => {
    const summerMonths = 5; // Jun-Oct
    return {
      ...action,
      annualSavingsRange: [
        action.monthlySavingsRange[0] * summerMonths,
        action.monthlySavingsRange[1] * summerMonths
      ],
      source: action.basis,
      effectiveDate: ratePlan.effectiveDate
    };
  });
}

/**
 * Check CARE/FERA eligibility
 * @param {number} householdSize - Number of people
 * @param {number} annualIncome - Annual income before tax
 * @param {boolean} onBenefits - On Medi-Cal, CalFresh, SSI, etc.
 * @returns {Object|null} { program, discount, baseFee, annualSavings } or null
 */
export function checkCareFeraEligibility(householdSize, annualIncome, onBenefits = false) {
  if (onBenefits) {
    return {
      program: 'CARE',
      electricDiscount: rates.CARE_DISCOUNT.electricDiscount,
      gasDiscount: rates.CARE_DISCOUNT.gasDiscount,
      baseFee: rates.CARE_DISCOUNT.baseFee,
      eligibility: 'Likely eligible (on qualifying benefit program)',
      source: rates.CARE_DISCOUNT.source,
      effectiveDate: rates.CARE_DISCOUNT.effectiveDate
    };
  }

  const size = Math.min(householdSize, 6); // 6+ uses 6 person limit
  const careLimit = rates.CARE_DISCOUNT.incomeLimits[size];
  const feraLimit = rates.FERA_DISCOUNT.incomeLimits[size];

  if (annualIncome <= careLimit) {
    return {
      program: 'CARE',
      electricDiscount: rates.CARE_DISCOUNT.electricDiscount,
      gasDiscount: rates.CARE_DISCOUNT.gasDiscount,
      baseFee: rates.CARE_DISCOUNT.baseFee,
      eligibility: `Likely eligible (income $${annualIncome.toLocaleString()} ≤ $${careLimit.toLocaleString()} for ${size} people)`,
      source: rates.CARE_DISCOUNT.source,
      effectiveDate: rates.CARE_DISCOUNT.effectiveDate
    };
  } else if (annualIncome <= feraLimit) {
    return {
      program: 'FERA',
      electricDiscount: rates.FERA_DISCOUNT.electricDiscount,
      baseFee: rates.FERA_DISCOUNT.baseFee,
      eligibility: `Likely eligible (income $${annualIncome.toLocaleString()} ≤ $${feraLimit.toLocaleString()} for ${size} people)`,
      source: rates.FERA_DISCOUNT.source,
      effectiveDate: rates.FERA_DISCOUNT.effectiveDate
    };
  }

  return null;
}

/**
 * Generate complete savings report
 * @param {Array<Object>} bills - Array of bill objects
 * @param {Object} currentPlan - Current rate plan
 * @param {Object} household - { size, income, onBenefits, renter, hasSolar }
 * @param {Array<Object>} nemYearToDate - Optional: NEM YTD table for better estimates
 * @param {Object} nemData - Optional: { trueUpDate, balance, systemSize } for alerts
 * @param {Object} gasUsage - Optional: { therms, cost } for gas savings
 * @returns {Object} Complete savings report
 */
export function generateSavingsReport(bills, currentPlan, household = {}, nemYearToDate = null, nemData = null, gasUsage = null) {
  const providerComparisons = compareProviders(bills, currentPlan, nemYearToDate);
  const behavioralSavings = calculateBehavioralSavings(bills, currentPlan);
  const gasSavings = gasUsage ? calculateGasSavings(gasUsage) : [];
  
  // Use new true-up projection instead of simple alert
  const nemTrueUpProjection = (nemData && nemYearToDate) 
    ? calculateNEMTrueUpProjection(nemData, nemYearToDate, currentPlan)
    : null;
  
  const careFeraEligibility = household.size && household.income
    ? checkCareFeraEligibility(household.size, household.income, household.onBenefits)
    : null;

  const currentCost = calculateAnnualCost(bills, currentPlan, nemYearToDate);

  // Filter behavioral savings if renter
  const applicableElectricActions = household.renter
    ? behavioralSavings.filter(a => a.renterOk)
    : behavioralSavings;

  const applicableGasActions = household.renter
    ? gasSavings.filter(a => a.renterOk)
    : gasSavings;

  // Calculate total savings range
  const electricMin = applicableElectricActions.reduce((sum, a) => sum + a.annualSavingsRange[0], 0);
  const electricMax = applicableElectricActions.reduce((sum, a) => sum + a.annualSavingsRange[1], 0);
  
  const gasMin = applicableGasActions.reduce((sum, a) => sum + a.annualSavingsRange[0], 0);
  const gasMax = applicableGasActions.reduce((sum, a) => sum + a.annualSavingsRange[1], 0);
  
  const bestProvider = providerComparisons[0];
  const providerSavings = bestProvider?.savings > 0 ? bestProvider.savings : 0;
  
  const totalMin = providerSavings + electricMin + gasMin;
  const totalMax = providerSavings + electricMax + gasMax;

  return {
    currentPlan: {
      provider: currentPlan.provider,
      plan: currentPlan.plan,
      annualCost: currentCost.annualCost,
      confidence: currentCost.confidence,
      basis: currentCost.basis
    },
    providerAlternatives: providerComparisons,
    electricActions: applicableElectricActions,
    gasActions: applicableGasActions,
    discountPrograms: careFeraEligibility ? [careFeraEligibility] : [],
    nemTrueUpProjection,
    totalSavingsRange: [totalMin, totalMax],
    savingsBreakdown: {
      provider: providerSavings,
      electric: [electricMin, electricMax],
      gas: [gasMin, gasMax]
    },
    billsAnalyzed: bills.length,
    nemMonthsAnalyzed: nemYearToDate ? nemYearToDate.length : 0,
    generatedAt: new Date().toISOString(),
    disclaimer: 'Savings are estimates from uploaded bills and published rates. Rates change several times a year. Behavioral savings are estimates based on research.'
  };
}

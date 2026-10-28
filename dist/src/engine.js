/**
 * Billback Savings Engine
 * Calculates bill costs under different rate plans and behavioral changes
 * 
 * Per CLAUDE.md: Every figure needs a date and source
 */

import * as rates from './rates.js';
import { detectNEMPaymentPattern, calculateTrueUpAmount } from './parser.js';
import { parseLocalDate } from './meterReadSchedule.js';

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

function seasonNameForDate(dateStr) {
  const date = parseLocalDate(dateStr);
  const monthNum = date.getMonth();
  return (monthNum >= 5 && monthNum <= 9) ? 'summer' : 'winter';
}

function generationRatesForMonth(ratePlan, seasonName, billedRates) {
  const table = ratePlan.generation && ratePlan.generation[seasonName];
  if (!table) return null;
  const useBilled = billedRates && seasonName === (billedRates.season || 'summer');
  return {
    onPeak: (useBilled && billedRates.onPeak != null) ? billedRates.onPeak : table.onPeak,
    offPeak: (useBilled && billedRates.offPeak != null) ? billedRates.offPeak : table.offPeak,
    superOffPeak: (useBilled && billedRates.superOffPeak != null) ? billedRates.superOffPeak : table.superOffPeak
  };
}

/**
 * CCA/utility generation cost for one NEM month (exports stay negative).
 * @returns {number|null} null when the plan has no generation table
 */
export function generationCostForMonth(month, ratePlan, billedRates = null) {
  const seasonName = seasonNameForDate(month.date);
  const g = generationRatesForMonth(ratePlan, seasonName, billedRates);
  if (!g) return null;
  const energy = (month.onPeak || 0) * g.onPeak
    + (month.offPeak || 0) * g.offPeak
    + (month.superOffPeak || 0) * g.superOffPeak;
  const premium = (ratePlan.plusPremium || 0) * Math.max(month.total || 0, 0);
  return energy + premium;
}

/**
 * Annualize modeled generation from NEM YTD signed kWh.
 */
export function calculateAnnualGenerationCost(nemYearToDate, ratePlan, billedRates = null) {
  if (!nemYearToDate || nemYearToDate.length === 0) {
    return { generationCost: null, monthsCovered: 0 };
  }
  if (!ratePlan.generation) {
    return { generationCost: null, monthsCovered: nemYearToDate.length };
  }
  const monthsCovered = nemYearToDate.length;
  const scale = monthsCovered === 12 ? 1 : 12 / monthsCovered;
  const modeled = nemYearToDate.reduce((sum, month) => {
    const cost = generationCostForMonth(month, ratePlan, billedRates);
    return sum + (cost || 0);
  }, 0);
  return {
    generationCost: modeled * scale,
    modeled,
    monthsCovered,
    scale
  };
}

/**
 * One NEM-month cost at a rate plan, keeping export kWh negative (NEM 2.0 credit)
 * and charging NBC only on imported kWh.
 * @param {Object} month - NEM YTD row
 * @param {Object} ratePlan
 * @param {Object} [opts]
 * @param {boolean} [opts.includeBase=false]
 * @returns {number}
 */
function nemMonthCostFromRates(month, ratePlan, opts = {}) {
  const includeBase = opts.includeBase === true;
  const seasonName = seasonNameForDate(month.date);
  const season = ratePlan[seasonName];
  if (!season) {
    throw new Error(`Invalid season for NEM month ${month.date}`);
  }
  const on = month.onPeak || 0;
  const off = month.offPeak || 0;
  const sop = month.superOffPeak || 0;
  const energyCost = on * season.onPeak + off * season.offPeak + sop * season.superOffPeak;
  const importedKwh = Math.max(on, 0) + Math.max(off, 0) + Math.max(sop, 0);
  const nbcCost = importedKwh * (ratePlan.nbcCharge || 0);
  return energyCost + nbcCost + (includeBase ? (ratePlan.baseFee || 0) : 0);
}

/**
 * Gas annual range. Never multiply one summer month by 12 as a point estimate.
 * If a therm history chart parsed, use it (with a modest band). Otherwise
 * apply a coastal seasonal factor: 5 summer months at this bill, 7 winter
 * months at 1.2–2.2× this bill's therms.
 * @param {Object} gasUsage - { therms, cost, history? }
 * @returns {{ low: number, high: number, basis: string }|null}
 */
export function estimateGasAnnualRange(gasUsage) {
  if (!gasUsage || gasUsage.therms == null || !gasUsage.cost) {
    return null;
  }
  const therms = Number(gasUsage.therms);
  const cost = Number(gasUsage.cost);
  if (!(therms > 0) || !(cost > 0)) return null;
  const rate = cost / therms;
  const history = Array.isArray(gasUsage.history) ? gasUsage.history : [];

  if (history.length >= 12) {
    const yearThermos = history.slice(0, 12).reduce((sum, row) => sum + Number(row.therms || 0), 0);
    const annual = yearThermos * rate;
    return {
      low: annual * 0.9,
      high: annual * 1.1,
      basis: `${history.length}-month therm history × this bill's $${rate.toFixed(2)}/therm`
    };
  }

  const summerMonths = 5;
  const winterMonths = 7;
  const winterLow = 1.2;
  const winterHigh = 2.2;
  const low = rate * (therms * summerMonths + therms * winterLow * winterMonths);
  const high = rate * (therms * summerMonths + therms * winterHigh * winterMonths);
  return {
    low,
    high,
    basis: `No therm history chart; coastal seasonal range from ${therms} summer therms (winter 1.2–2.2×), not one month × 12`
  };
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Household annual cost from one NEM bill: net NEM + NBC (includes base),
 * plus CCA generation, plus a gas range, minus two Climate Credits.
 * Returns a range when based on one bill.
 */
function calculateNemHouseholdAnnual(nemYearToDate, ratePlan, options = {}) {
  const monthsCovered = nemYearToDate.length;
  const scale = monthsCovered === 12 ? 1 : 12 / monthsCovered;
  const ytdNet = options.ytdNetMetering;
  const ytdNbc = options.ytdNbc;

  let sdgeElectric = null;
  if (ytdNet != null && ytdNbc != null) {
    // NBC already includes base services — do not add baseFee again.
    sdgeElectric = (Number(ytdNet) + Number(ytdNbc)) * scale;
  } else {
    const netCharges = nemYearToDate.reduce((sum, month) => sum + (Number(month.nemCharges) || 0), 0);
    sdgeElectric = netCharges * scale;
  }

  const billedRates = options.billedRates || null;
  const gen = calculateAnnualGenerationCost(nemYearToDate, ratePlan, billedRates);
  const ccaGeneration = gen.generationCost != null ? gen.generationCost : 0;

  const climateEach = options.climateCredit != null ? Number(options.climateCredit) : 0;
  const climateAnnual = climateEach > 0 ? climateEach * 2 : 0;

  const gasRange = estimateGasAnnualRange(options.gasUsage || (
    options.gasCost ? { therms: options.gasThermos || 0, cost: options.gasCost } : null
  ));
  const gasLow = gasRange ? gasRange.low : 0;
  const gasHigh = gasRange ? gasRange.high : 0;

  const electricNet = sdgeElectric + ccaGeneration - climateAnnual;
  const low = electricNet + gasLow;
  const high = electricNet + gasHigh;
  const mid = (low + high) / 2;

  const parts = [];
  if (ytdNet != null && ytdNbc != null) {
    parts.push(`SDG&E electric (YTD net NEM $${Number(ytdNet).toFixed(2)} + NBC $${Number(ytdNbc).toFixed(2)}, includes base) ≈ $${Math.round(sdgeElectric)}/yr over ${monthsCovered} months`);
  } else {
    parts.push(`SDG&E electric from ${monthsCovered} months of printed NEM Charges ≈ $${Math.round(sdgeElectric)}/yr`);
  }
  parts.push(`CCA generation (signed NEM kWh at ${ratePlan.provider} ${ratePlan.plan}) ≈ $${Math.round(ccaGeneration)}/yr`);
  if (climateAnnual) {
    parts.push(`minus 2 California Climate Credits of $${climateEach.toFixed(2)} (−$${climateAnnual.toFixed(2)})`);
  }
  if (gasRange) {
    parts.push(`gas $${Math.round(gasLow)}–${Math.round(gasHigh)}/yr (${gasRange.basis})`);
  }
  parts.push('range from one bill');

  return {
    annualCost: mid,
    annualCostRange: [low, high],
    confidence: 'low',
    basis: parts.join('; '),
    components: {
      sdgeElectric: roundMoney(sdgeElectric),
      ccaGeneration: roundMoney(ccaGeneration),
      gas: [roundMoney(gasLow), roundMoney(gasHigh)],
      climateCredit: roundMoney(climateAnnual),
      monthsCovered
    }
  };
}

/**
 * Calculate annual cost from multiple bills or NEM YTD data
 * @param {Array<Object>} bills - Array of { date, usage, cost } or NEM YTD data
 * @param {Object} ratePlan - Rate plan from rates.js
 * @param {Array<Object>} nemYearToDate - Optional: NEM table with 10-12 months of history
 * @param {Object} [options]
 * @param {boolean} [options.modelFromKwh] - Price signed NEM kWh at this plan (legacy bundled)
 * @param {boolean} [options.generationOnly] - Generation cost only (CCA compare)
 * @param {number} [options.gasCost] - One month of gas $ (legacy; prefer gasUsage)
 * @param {Object} [options.gasUsage] - { therms, cost, history }
 * @param {number} [options.ytdNetMetering]
 * @param {number} [options.ytdNbc]
 * @param {number} [options.climateCredit]
 * @param {Object} [options.billedRates]
 * @returns {Object} { annualCost, annualCostRange, confidence, basis, components }
 */
export function calculateAnnualCost(bills, ratePlan, nemYearToDate = null, options = {}) {
  if (bills.length === 0 && (!nemYearToDate || nemYearToDate.length === 0)) {
    throw new Error('No bills provided');
  }

  // NEM YTD household path: net NEM + NBC + CCA generation + gas range − climate credits.
  if (nemYearToDate && nemYearToDate.length >= 10 && !options.modelFromKwh && !options.generationOnly) {
    return calculateNemHouseholdAnnual(nemYearToDate, ratePlan, options);
  }

  if (nemYearToDate && nemYearToDate.length >= 10 && options.generationOnly && ratePlan.generation) {
    const gen = calculateAnnualGenerationCost(nemYearToDate, ratePlan, options.billedRates);
    const monthsCovered = nemYearToDate.length;
    return {
      annualCost: gen.generationCost,
      annualCostRange: [gen.generationCost, gen.generationCost],
      confidence: monthsCovered >= 11 ? 'high' : 'medium',
      basis: `${monthsCovered} months of NEM YTD signed kWh at ${ratePlan.provider} ${ratePlan.plan} generation rates only`,
      components: { ccaGeneration: roundMoney(gen.generationCost), monthsCovered }
    };
  }

  const gasRange = estimateGasAnnualRange(options.gasUsage);
  const gasAnnual = gasRange ? (gasRange.low + gasRange.high) / 2
    : (options.gasCost ? options.gasCost * 12 : 0);

  if (nemYearToDate && nemYearToDate.length >= 10) {
    const monthsCovered = nemYearToDate.length;
    const scale = monthsCovered === 12 ? 1 : 12 / monthsCovered;
    const confidence = monthsCovered >= 11 ? 'high' : 'medium';

    if (options.modelFromKwh) {
      const modeled = nemYearToDate.reduce((sum, month) => sum + nemMonthCostFromRates(month, ratePlan), 0);
      const annual = modeled * scale + gasAnnual;
      return {
        annualCost: annual,
        annualCostRange: [annual, annual],
        confidence,
        basis: `${monthsCovered} months of NEM YTD usage modeled at ${ratePlan.provider} ${ratePlan.plan} rates (exports credited),${monthsCovered < 12 ? ' extrapolated to 12 months' : ''}${gasAnnual ? ', plus gas' : ''}`
      };
    }
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
      const month = parseLocalDate(bill.date).getMonth(); // 0-11
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
    basis: `${sorted.length} month(s), simple annualization — rough seasonal estimate (actual usage varies by season)`
  };
}

/**
 * Compare costs across different providers.
 * For CCA plans with a generation table, compare generation cost only
 * (like-for-like). Savings = currentGen − altGen, so a more expensive
 * alternative never shows positive savings.
 * @param {Array<Object>} bills - Array of bill objects
 * @param {Object} currentPlan - Current rate plan
 * @param {Array<Object>} nemYearToDate - Optional: NEM YTD data for better estimates
 * @param {Object} [options]
 * @returns {Array<Object>} Array of { provider, plan, annualCost, savings, confidence }
 */
export function compareProviders(bills, currentPlan, nemYearToDate = null, options = {}) {
  const billedRates = options.billedRates || null;
  const hasNem = nemYearToDate && nemYearToDate.length >= 10;
  const currentHasGen = !!(currentPlan && currentPlan.generation);
  const alternatives = [];

  const customerCCA = currentPlan.provider === 'CEA' ? 'CEA' :
                      currentPlan.provider === 'SDCP' ? 'SDCP' : null;

  let plans = [
    rates.SDGE_TOU_DR1,
    rates.CEA_CLEAN_IMPACT,
    rates.CEA_CLEAN_IMPACT_PLUS,
    rates.SDCP_POWER_ON,
    rates.SDCP_POWER_BASE
  ].filter(plan =>
    !(plan.provider === currentPlan.provider && plan.plan === currentPlan.plan)
  );

  if (customerCCA === 'CEA') {
    plans = plans.filter(plan => plan.provider === 'SDG&E' || plan.provider === 'CEA');
  } else if (customerCCA === 'SDCP') {
    plans = plans.filter(plan => plan.provider === 'SDG&E' || plan.provider === 'SDCP');
  }

  const currentGen = (hasNem && currentHasGen)
    ? calculateAnnualGenerationCost(nemYearToDate, currentPlan, billedRates).generationCost
    : null;

  const household = (hasNem && currentHasGen)
    ? calculateNemHouseholdAnnual(nemYearToDate, currentPlan, options)
    : calculateAnnualCost(bills, currentPlan, nemYearToDate, { ...options, modelFromKwh: !hasNem });

  for (const plan of plans) {
    let annualCost;
    let savings;
    let confidence;
    let basis;
    let compareMode;

    if (hasNem && currentHasGen && plan.generation) {
      const altGen = calculateAnnualGenerationCost(nemYearToDate, plan, null).generationCost;
      savings = currentGen - altGen;
      const householdMid = household.annualCost;
      annualCost = householdMid - savings;
      confidence = 'medium';
      compareMode = 'generation';
      basis = `Generation cost only from ${nemYearToDate.length} months of NEM YTD signed kWh. Current ${currentPlan.plan} gen $${Math.round(currentGen)}/yr vs ${plan.plan} $${Math.round(altGen)}/yr.`;
    } else if (hasNem && currentHasGen && !plan.generation) {
      const monthsCovered = nemYearToDate.length;
      const scale = monthsCovered === 12 ? 1 : 12 / monthsCovered;
      const altBundled = nemYearToDate.reduce((sum, month) => sum + nemMonthCostFromRates(month, plan, { includeBase: false }), 0) * scale;
      const currentElectric = (household.components?.sdgeElectric || 0) + (household.components?.ccaGeneration || currentGen || 0);
      savings = currentElectric - altBundled;
      annualCost = household.annualCost - savings;
      confidence = 'medium';
      compareMode = 'electric';
      basis = `Like-for-like electric: current SDG&E net+NBC + CCA generation vs ${plan.provider} bundled energy+NBC (base already in NBC).`;
    } else {
      const costData = calculateAnnualCost(bills, plan, nemYearToDate, { modelFromKwh: true });
      const currentCostData = calculateAnnualCost(bills, currentPlan, nemYearToDate, { modelFromKwh: true });
      annualCost = costData.annualCost;
      savings = currentCostData.annualCost - costData.annualCost;
      confidence = costData.confidence;
      compareMode = 'bundled';
      basis = costData.basis;
    }

    alternatives.push({
      provider: plan.provider,
      plan: plan.plan,
      annualCost,
      savings,
      confidence,
      basis,
      compareMode,
      effectiveDate: plan.effectiveDate,
      source: plan.source
    });
  }

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

  const today = parseLocalDate(new Date());
  
  // Parse true-up date as local date (not UTC)
  const trueUpDate = parseLocalDate(nemData.trueUpDate);
  
  // Check if true-up has already passed (not including today)
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

  // Monthly NEM payers: a payment equal to previous NEM YTD paid off the prior
  // balance. The printed YTD is this cycle's unpaid charges. If they keep paying
  // each statement in full, true-up ≈ last cycle's charges (not balance − payment).
  const paymentHistory = nemData.paymentHistory || nemData.nemPaymentHistory || [];
  const paymentPattern = detectNEMPaymentPattern({
    hasSolar: true,
    nemPaymentHistory: paymentHistory,
    previousNemYtd: nemData.previousNemYtd
  });
  if (paymentPattern.paysMonthly === true) {
    const trueUp = calculateTrueUpAmount({
      hasSolar: true,
      nemBalance: nemData.balance,
      nemPaymentHistory: paymentHistory,
      previousNemYtd: nemData.previousNemYtd,
      currentNemCharges: nemData.currentNemCharges,
      excessCreditTransfer: nemData.excessCreditTransfer
    }, true);
    const amount = trueUp.estimatedAmount;
    const lo = Math.max(0, Math.round(amount));
    const hi = Math.max(lo, Math.round(amount));
    const cycleLabel = amount != null ? `$${Math.round(amount)}` : 'a normal monthly bill';
    return {
      trueUpDate: nemData.trueUpDate,
      daysUntil,
      currentBalance: nemData.balance,
      projectedBalance: [lo, hi],
      lastCycleCharges: amount,
      previousNemYtd: nemData.previousNemYtd,
      currentNemCharges: nemData.currentNemCharges,
      paysMonthly: true,
      isUrgent,
      isPast: false,
      message: isUrgent
        ? `Your solar true-up is ${daysUntil} days away (${nemData.trueUpDate}). If you keep paying each statement in full, it should be about the size of a normal monthly bill (≈ your last cycle's charges, ${cycleLabel}).`
        : `Your solar true-up is on ${nemData.trueUpDate}. About the size of a normal monthly bill (≈ your last cycle's charges, ${cycleLabel}) if you keep paying each statement in full.`,
      basis: trueUp.reasoning,
      tips: isUrgent ? [
        `Set aside about ${cycleLabel} for the true-up bill (last cycle's charges)`,
        'Pay each remaining statement in full; the true-up is then just the final cycle',
        'Consider switching providers AFTER true-up to avoid double charges'
      ] : []
    };
  }
  
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
  const sortedHistory = nemYearToDate.slice().sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date));
  const latestBillDate = parseLocalDate(sortedHistory[0].date);
  
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
    const monthNum = parseLocalDate(month.date).getMonth();
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
    // Never project months that fall after the true-up date (e.g. November after an Oct 28 true-up).
    if (futureDate > trueUpDate) {
      break;
    }
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
    monthsRemaining: projectionDetails.length,
    projectionDetails,
    isUrgent,
    isPast: false,
    message: isUrgent
      ? `Your solar true-up is ${daysUntil} days away (${nemData.trueUpDate}). Projected amount: $${Math.round(projectedMin)}–${Math.round(projectedMax)} (currently $${nemData.balance.toFixed(2)} so far).`
      : `Your solar true-up is on ${nemData.trueUpDate}. Projected amount: $${Math.round(projectedMin)}–${Math.round(projectedMax)} (currently $${nemData.balance.toFixed(2)} so far).`,
    basis: `${nemData.balance.toFixed(2)} through ${sortedHistory[0].date} + ${projectionDetails.length} month(s) projected from prior-year averages`,
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
export function generateSavingsReport(bills, currentPlan, household = {}, nemYearToDate = null, nemData = null, gasUsage = null, billContext = {}) {
  const costOptions = {
    ytdNetMetering: billContext.ytdNetMetering ?? nemData?.ytdNetMetering,
    ytdNbc: billContext.ytdNbc ?? nemData?.ytdNbc,
    climateCredit: billContext.climateCredit ?? nemData?.climateCredit,
    billedRates: billContext.billedRates ?? nemData?.billedRates,
    gasUsage: gasUsage && gasUsage.cost != null ? {
      therms: gasUsage.therms,
      cost: gasUsage.cost,
      history: gasUsage.history || billContext.thermHistory || []
    } : null
  };

  const providerComparisons = compareProviders(bills, currentPlan, nemYearToDate, costOptions);
  const behavioralSavings = calculateBehavioralSavings(bills, currentPlan);
  const gasSavings = gasUsage ? calculateGasSavings(gasUsage) : [];
  
  // Use new true-up projection instead of simple alert
  const nemTrueUpProjection = (nemData && nemYearToDate) 
    ? calculateNEMTrueUpProjection(nemData, nemYearToDate, currentPlan)
    : null;
  
  const careFeraEligibility = household.size && household.income
    ? checkCareFeraEligibility(household.size, household.income, household.onBenefits)
    : null;

  const currentCost = calculateAnnualCost(bills, currentPlan, nemYearToDate, costOptions);

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
      annualCostRange: currentCost.annualCostRange || [currentCost.annualCost, currentCost.annualCost],
      confidence: currentCost.confidence,
      basis: currentCost.basis,
      components: currentCost.components || null
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

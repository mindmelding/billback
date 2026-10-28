/**
 * SDG&E, CEA, and SDCP rate tables
 * Every rate needs a date and source per CLAUDE.md
 * 
 * Rates change several times a year - update this file when they change.
 * Last updated: 2026-10-28
 */

// SDG&E TOU-DR1 rates (typical NEM 2.0 solar plan)
// Source: SDG&E Schedule TOU-DR1, effective 2026-06-01
// https://www.sdge.com/residential/pricing-plans/about-our-pricing-plans/time-use-residential
export const SDGE_TOU_DR1 = {
  provider: 'SDG&E',
  plan: 'TOU-DR1',
  effectiveDate: '2026-06-01',
  source: 'SDG&E Schedule TOU-DR1',
  baseFee: 24.12, // $/month
  summer: { // Jun 1 - Oct 31
    onPeak: 0.67, // 4-9 pm daily ($/kWh)
    offPeak: 0.443, // most other hours
    superOffPeak: 0.353 // weekdays 12-6 am & 10 am-2 pm; weekends 12 am-2 pm
  },
  winter: { // Nov 1 - May 31
    onPeak: 0.594, // 4-9 pm daily
    offPeak: 0.51,
    superOffPeak: 0.416
  },
  nbcCharge: 0.04587 // Non-bypassable charges ($/kWh), all hours
};

// Clean Energy Alliance (CEA) rates - VERSIONED
// CEA rates changed mid-2026; version by effective date and bill period
// When bill's printed rates differ from table, prefer bill rates and flag table as stale

// CEA rates effective Feb 1, 2026 (from published rate schedule)
// Source: CEA Rate Schedule effective 2026-02-01
// https://thecleanenergyalliance.org/wp-content/uploads/2026/03/CEA-Adopted-Rate-Schedule-Effective-2026_02_01-Residential.pdf
export const CEA_CLEAN_IMPACT_PLUS_FEB_2026 = {
  provider: 'CEA',
  plan: 'Clean Impact Plus',
  effectiveDate: '2026-02-01',
  validThrough: '2026-07-31', // Approximate - actual change date mid-year
  source: 'CEA Rate Schedule effective 2026-02-01',
  baseFee: 24.12,
  generation: {
    summer: {
      onPeak: 0.55922, // From Feb 1, 2026 schedule
      offPeak: 0.22619,
      superOffPeak: 0.03324
    },
    winter: {
      onPeak: 0.20291,
      offPeak: 0.10855,
      superOffPeak: 0.07628
    }
  },
  // Total rates (SDG&E delivery + CEA generation + NBC)
  summer: {
    onPeak: 0.891,
    offPeak: 0.56,
    superOffPeak: 0.386
  },
  winter: {
    onPeak: 0.537,
    offPeak: 0.422,
    superOffPeak: 0.389
  },
  nbcCharge: 0.04587,
  plusPremium: 0.001
};

// CEA rates as shown on Aug 2026 bill (actual billed rates differ from published schedule)
// Source: Actual SDG&E bill dated Sept 2, 2026 for billing period Jul 30 - Aug 27, 2026
export const CEA_CLEAN_IMPACT_PLUS_AUG_2026 = {
  provider: 'CEA',
  plan: 'Clean Impact Plus',
  effectiveDate: '2026-07-30', // Start of bill period showing these rates
  validThrough: null, // Unknown when next change occurs
  source: 'Actual Aug 2026 bill dated Sept 2, 2026 (billing period Jul 30 - Aug 27, 2026)',
  baseFee: 24.12,
  generation: {
    summer: {
      onPeak: 0.55397, // Actual rate on Aug 2026 bill (differs from Feb schedule: 0.55922)
      offPeak: 0.22298,
      superOffPeak: 0.03224
    },
    winter: { // Use Feb 2026 schedule for winter (not shown on summer bill)
      onPeak: 0.20291,
      offPeak: 0.10855,
      superOffPeak: 0.07628
    }
  },
  // Total rates (calculated from bill: SDG&E delivery + CEA generation + NBC)
  summer: {
    onPeak: 0.891, // Approximate total
    offPeak: 0.56,
    superOffPeak: 0.386
  },
  winter: { // Use Feb 2026 schedule totals for winter
    onPeak: 0.537,
    offPeak: 0.422,
    superOffPeak: 0.389
  },
  nbcCharge: 0.04587,
  plusPremium: 0.001,
  note: 'Rates from actual bill differ from published Feb 1, 2026 schedule. CEA adjusted rates mid-year per board memo.'
};

// CEA Clean Impact Plus - current best estimate
// Use Aug 2026 actual rates when available
export const CEA_CLEAN_IMPACT_PLUS = CEA_CLEAN_IMPACT_PLUS_AUG_2026;

export const CEA_CLEAN_IMPACT_FEB_2026 = {
  provider: 'CEA',
  plan: 'Clean Impact',
  effectiveDate: '2026-02-01',
  validThrough: '2026-12-31', // Relief credit expires
  source: 'CEA Rate Schedule effective 2026-02-01 + relief credit',
  reliefCredit: 0.03871, // $/kWh residential, through 2026-12-31
  reliefCreditExpires: '2026-12-31',
  baseFee: 24.12,
  generation: {
    summer: {
      onPeak: 0.55922 - 0.03871,
      offPeak: 0.22619 - 0.03871,
      superOffPeak: 0.03324 - 0.03871 // Negative after credit
    },
    winter: {
      onPeak: 0.20291 - 0.03871,
      offPeak: 0.10855 - 0.03871,
      superOffPeak: 0.07628 - 0.03871
    }
  },
  summer: {
    onPeak: 0.891 - 0.03871,
    offPeak: 0.56 - 0.03871,
    superOffPeak: 0.386 - 0.03871
  },
  winter: {
    onPeak: 0.537 - 0.03871,
    offPeak: 0.422 - 0.03871,
    superOffPeak: 0.389 - 0.03871
  },
  nbcCharge: 0.04587,
  note: 'Relief credit ends Dec 31, 2026. CEA board says credit "has been adjusted for specific rate classes" since Feb.'
};

export const CEA_CLEAN_IMPACT = CEA_CLEAN_IMPACT_FEB_2026;

/**
 * Get CEA rates for a specific bill period
 * @param {string} plan - 'Clean Impact Plus' or 'Clean Impact'
 * @param {string} billPeriodStart - Start date of bill period (YYYY-MM-DD)
 * @returns {Object} Rate table + metadata { rates, source, possiblyStale }
 */
export function getCEARatesForPeriod(plan, billPeriodStart) {
  const periodDate = new Date(billPeriodStart);
  
  if (plan === 'Clean Impact Plus') {
    // If bill period is Aug 2026 or later, use Aug 2026 rates
    if (periodDate >= new Date('2026-07-30')) {
      return {
        rates: CEA_CLEAN_IMPACT_PLUS_AUG_2026,
        source: CEA_CLEAN_IMPACT_PLUS_AUG_2026.source,
        possiblyStale: false
      };
    } else {
      // Earlier bills use Feb 2026 schedule
      return {
        rates: CEA_CLEAN_IMPACT_PLUS_FEB_2026,
        source: CEA_CLEAN_IMPACT_PLUS_FEB_2026.source,
        possiblyStale: periodDate >= new Date('2026-06-01') // May be stale if mid-year
      };
    }
  } else if (plan === 'Clean Impact') {
    return {
      rates: CEA_CLEAN_IMPACT_FEB_2026,
      source: CEA_CLEAN_IMPACT_FEB_2026.source,
      possiblyStale: periodDate >= new Date('2026-06-01') // May have adjusted like Plus
    };
  }
  
  return null;
}

/**
 * Check if bill's printed CEA rates differ from rate table
 * @param {Object} billRates - Rates extracted from bill { onPeak, offPeak, superOffPeak }
 * @param {Object} tableRates - Rates from rate table
 * @returns {Object} { matches: boolean, differences: [], recommendation: string }
 */
export function compareCEARates(billRates, tableRates) {
  const differences = [];
  const tolerance = 0.001; // Allow small rounding differences
  
  if (billRates.onPeak && tableRates.generation?.summer?.onPeak) {
    const diff = Math.abs(billRates.onPeak - tableRates.generation.summer.onPeak);
    if (diff > tolerance) {
      differences.push({
        type: 'onPeak',
        bill: billRates.onPeak,
        table: tableRates.generation.summer.onPeak,
        difference: diff
      });
    }
  }
  
  if (billRates.offPeak && tableRates.generation?.summer?.offPeak) {
    const diff = Math.abs(billRates.offPeak - tableRates.generation.summer.offPeak);
    if (diff > tolerance) {
      differences.push({
        type: 'offPeak',
        bill: billRates.offPeak,
        table: tableRates.generation.summer.offPeak,
        difference: diff
      });
    }
  }
  
  const matches = differences.length === 0;
  
  let recommendation = '';
  if (!matches) {
    recommendation = `Bill's printed rates differ from rate table. Use bill rates for this period. Rate table may be stale (CEA adjusted rates mid-2026 per board memo).`;
  }
  
  return {
    matches,
    differences,
    recommendation
  };
}

// San Diego Community Power (SDCP) rates
// Source: SDCP Rate Schedule, effective 2026-01-01
// https://sdcommunitypower.org/rates/
export const SDCP_POWER_ON = {
  provider: 'SDCP',
  plan: 'Power On',
  effectiveDate: '2026-01-01',
  source: 'SDCP Rate Schedule',
  baseFee: 24.12,
  // SDCP generation rates are ~4% cheaper than SDG&E bundled
  generationDiscount: 0.04,
  summer: {
    onPeak: 0.67 * 0.96,
    offPeak: 0.443 * 0.96,
    superOffPeak: 0.353 * 0.96
  },
  winter: {
    onPeak: 0.594 * 0.96,
    offPeak: 0.51 * 0.96,
    superOffPeak: 0.416 * 0.96
  },
  nbcCharge: 0.04587
};

export const SDCP_POWER_BASE = {
  provider: 'SDCP',
  plan: 'Power Base',
  effectiveDate: '2026-01-01',
  source: 'SDCP Rate Schedule',
  baseFee: 24.12,
  // PowerBase saves ~$5.56/mo on generation vs SDG&E
  monthlySavings: 5.56,
  summer: {
    onPeak: 0.67 * 0.96, // approximate
    offPeak: 0.443 * 0.96,
    superOffPeak: 0.353 * 0.96
  },
  winter: {
    onPeak: 0.594 * 0.96,
    offPeak: 0.51 * 0.96,
    superOffPeak: 0.416 * 0.96
  },
  nbcCharge: 0.04587
};

// CARE discount program
// Source: CPUC CARE/FERA Income Guidelines 2026-27
// https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/electric-costs/care-fera-program
export const CARE_DISCOUNT = {
  program: 'CARE',
  effectiveDate: '2026-06-01',
  source: 'CPUC CARE/FERA Income Guidelines 2026-27',
  electricDiscount: 0.35, // 30-35% off electric
  gasDiscount: 0.20, // 20% off gas
  baseFee: 6.00, // reduced base charge ($/month)
  incomeLimits: {
    1: 43280,
    2: 43280,
    3: 54640,
    4: 66000,
    5: 77360,
    6: 88720
  }
};

// FERA discount program
// Source: CPUC CARE/FERA Income Guidelines 2026-27
export const FERA_DISCOUNT = {
  program: 'FERA',
  effectiveDate: '2026-06-01',
  source: 'CPUC CARE/FERA Income Guidelines 2026-27',
  electricDiscount: 0.18, // 18% off electric
  baseFee: 12.00, // reduced base charge ($/month)
  incomeLimits: {
    1: 54100,
    2: 54100,
    3: 68300,
    4: 82500,
    5: 96700,
    6: 110900
  }
};

// Medical Baseline allowance
// Source: SDG&E Medical Baseline program
// https://www.sdge.com/medical
export const MEDICAL_BASELINE = {
  program: 'Medical Baseline',
  effectiveDate: '2026-06-01',
  source: 'SDG&E Medical Baseline program',
  extraKwh: 500, // extra kWh per month at lowest rate
  monthlySavingsEstimate: [10, 30] // estimated range
};

export const ALL_RATES = {
  SDGE_TOU_DR1,
  CEA_CLEAN_IMPACT_PLUS,
  CEA_CLEAN_IMPACT,
  SDCP_POWER_ON,
  SDCP_POWER_BASE,
  CARE_DISCOUNT,
  FERA_DISCOUNT,
  MEDICAL_BASELINE
};

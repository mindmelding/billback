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

// Clean Energy Alliance (CEA) rates
// Source: CEA Rate Schedule, effective 2026-06-01
// https://thecleanenergyalliance.org/rates/
export const CEA_CLEAN_IMPACT_PLUS = {
  provider: 'CEA',
  plan: 'Clean Impact Plus',
  effectiveDate: '2026-06-01',
  source: 'CEA Rate Schedule',
  baseFee: 24.12, // same as SDG&E
  summer: {
    onPeak: 0.891, // 4-9 pm daily (includes SDG&E delivery + CEA generation)
    offPeak: 0.56,
    superOffPeak: 0.386
  },
  winter: {
    onPeak: 0.537,
    offPeak: 0.422,
    superOffPeak: 0.389
  },
  nbcCharge: 0.04587
};

export const CEA_CLEAN_IMPACT = {
  provider: 'CEA',
  plan: 'Clean Impact',
  effectiveDate: '2026-06-01',
  source: 'CEA Rate Schedule',
  reliefCredit: 0.0387, // $/kWh, through 2026-12-31
  reliefCreditExpires: '2026-12-31',
  baseFee: 24.12,
  summer: {
    onPeak: 0.891 - 0.0387, // with relief credit
    offPeak: 0.56 - 0.0387,
    superOffPeak: 0.386 - 0.0387
  },
  winter: {
    onPeak: 0.537 - 0.0387,
    offPeak: 0.422 - 0.0387,
    superOffPeak: 0.389 - 0.0387
  },
  nbcCharge: 0.04587
};

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

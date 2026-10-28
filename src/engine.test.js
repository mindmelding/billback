/**
 * Tests for Billback Savings Engine
 * Uses Node.js built-in test runner
 * Run with: node --test src/engine.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateMonthlyCost,
  calculateAnnualCost,
  compareProviders,
  calculateBehavioralSavings,
  checkCareFeraEligibility,
  generateSavingsReport,
  calculateNEMTrueUpProjection
} from './engine.js';
import * as rates from './rates.js';

describe('Savings Engine', () => {
  describe('calculateMonthlyCost', () => {
    it('should calculate SDG&E summer bill correctly', () => {
      const usage = {
        onPeak: 200, // 200 kWh at 4-9 pm
        offPeak: 300, // 300 kWh off-peak
        superOffPeak: 124, // 124 kWh super off-peak
        season: 'summer'
      };

      const cost = calculateMonthlyCost(usage, rates.SDGE_TOU_DR1);
      
      // Expected: 200*0.67 + 300*0.443 + 124*0.353 + 624*0.04587 + 24.12
      // = 134 + 132.9 + 43.772 + 28.62 + 24.12 = 363.41
      assert.ok(Math.abs(cost - 363.41) < 0.5, `Cost ${cost} should be close to 363.41`);
    });

    it('should calculate CEA summer bill correctly', () => {
      const usage = {
        onPeak: 200,
        offPeak: 300,
        superOffPeak: 124,
        season: 'summer'
      };

      const cost = calculateMonthlyCost(usage, rates.CEA_CLEAN_IMPACT_PLUS);
      
      // CEA rates are higher in summer on-peak
      const sdgeCost = calculateMonthlyCost(usage, rates.SDGE_TOU_DR1);
      assert.ok(cost > sdgeCost, 'CEA should cost more than SDG&E in summer for this usage pattern');
    });
  });

  describe('calculateAnnualCost', () => {
    it('should extrapolate from 3 summer months', () => {
      const bills = [
        {
          date: '2026-06-15',
          usage: { onPeak: 200, offPeak: 300, superOffPeak: 124, season: 'summer' }
        },
        {
          date: '2026-07-15',
          usage: { onPeak: 250, offPeak: 300, superOffPeak: 74, season: 'summer' }
        },
        {
          date: '2026-08-15',
          usage: { onPeak: 200, offPeak: 300, superOffPeak: 124, season: 'summer' }
        }
      ];

      const result = calculateAnnualCost(bills, rates.SDGE_TOU_DR1);
      
      assert.ok(result.annualCost > 0, 'Should calculate annual cost');
      assert.strictEqual(result.confidence, 'low', 'Should have low confidence with only summer months');
      assert.ok(result.basis.includes('3 month'), 'Should mention 3 months in basis');
    });

    it('should have medium confidence with mixed seasons', () => {
      const bills = [
        {
          date: '2026-06-15',
          usage: { onPeak: 200, offPeak: 300, superOffPeak: 124, season: 'summer' }
        },
        {
          date: '2026-08-15',
          usage: { onPeak: 200, offPeak: 300, superOffPeak: 124, season: 'summer' }
        },
        {
          date: '2026-12-15',
          usage: { onPeak: 100, offPeak: 200, superOffPeak: 50, season: 'winter' }
        }
      ];

      const result = calculateAnnualCost(bills, rates.SDGE_TOU_DR1);
      
      assert.strictEqual(result.confidence, 'medium', 'Should have medium confidence with both seasons');
    });
  });

  describe('compareProviders', () => {
    it('should show SDG&E as cheaper than CEA for solar homes in summer', () => {
      // Simulate a solar home with heavy summer on-peak usage
      const bills = [
        {
          date: '2026-07-15',
          usage: { onPeak: 300, offPeak: 200, superOffPeak: 124, season: 'summer' }
        },
        {
          date: '2026-08-15',
          usage: { onPeak: 300, offPeak: 200, superOffPeak: 124, season: 'summer' }
        },
        {
          date: '2026-01-15',
          usage: { onPeak: 100, offPeak: 150, superOffPeak: 50, season: 'winter' }
        }
      ];

      const comparisons = compareProviders(bills, rates.CEA_CLEAN_IMPACT_PLUS);
      
      // Should show savings by switching to SDG&E
      const sdgeOption = comparisons.find(c => c.provider === 'SDG&E');
      assert.ok(sdgeOption, 'Should include SDG&E option');
      assert.ok(sdgeOption.savings > 0, 'SDG&E should show positive savings for solar home');
    });
  });

  describe('checkCareFeraEligibility', () => {
    it('should qualify for CARE with benefits', () => {
      const result = checkCareFeraEligibility(2, 50000, true);
      
      assert.strictEqual(result.program, 'CARE');
      assert.ok(result.eligibility.includes('benefit'));
    });

    it('should qualify for CARE below income limit', () => {
      const result = checkCareFeraEligibility(2, 40000, false);
      
      assert.strictEqual(result.program, 'CARE');
      assert.ok(result.eligibility.includes('40,000'));
    });

    it('should qualify for FERA between limits', () => {
      const result = checkCareFeraEligibility(2, 50000, false);
      
      assert.strictEqual(result.program, 'FERA');
      assert.strictEqual(result.electricDiscount, 0.18);
    });

    it('should not qualify above FERA limit', () => {
      const result = checkCareFeraEligibility(2, 60000, false);
      
      assert.strictEqual(result, null);
    });
  });

  describe('generateSavingsReport (integration test with example data)', () => {
    it('should roughly match the existing prototype data', () => {
      // Use the example data from the Oceanside household
      // August 2026: 624 kWh, CEA Plus, bill was $462
      // After switching to SDG&E and habits: $273-319
      
      const bills = [
        {
          date: '2026-08-01',
          usage: { 
            onPeak: 300, // rough estimate for solar home
            offPeak: 200,
            superOffPeak: 124,
            season: 'summer'
          }
        }
      ];

      const report = generateSavingsReport(
        bills,
        rates.CEA_CLEAN_IMPACT_PLUS,
        { renter: true, hasSolar: true }
      );

      assert.ok(report.providerAlternatives.length > 0, 'Should have provider alternatives');
      assert.ok(report.electricActions.length > 0, 'Should have electric actions');
      assert.ok(report.totalSavingsRange[0] > 0, 'Should show some savings');
      
      // The prototype shows $595-870/year savings
      // Our calculation uses 1 month annualized, so may differ
      // Just verify it's in a reasonable range
      const annualSavings = report.totalSavingsRange[1];
      assert.ok(annualSavings > 400, `Annual savings ${annualSavings} should exceed $400`);
      assert.ok(annualSavings < 3000, `Annual savings ${annualSavings} should be under $3000`);
    });
  });

  describe('NEM true-up projection for monthly payers', () => {
    it('should project the unpaid remainder (~$91), not YTD plus remaining months', () => {
      const nemData = {
        trueUpDate: '2026-10-28',
        balance: 445.71,
        systemSize: 3.44,
        paymentHistory: [{ date: '2026-08-21', amount: 354.22 }]
      };
      const nemYearToDate = [
        { date: '2026-08-27', onPeak: 355, offPeak: 193, superOffPeak: 76, total: 624, nemCharges: 177.17 }
      ];
      const projection = calculateNEMTrueUpProjection(nemData, nemYearToDate, rates.CEA_CLEAN_IMPACT_PLUS);
      assert.ok(projection, 'Should return a projection');
      assert.strictEqual(projection.paysMonthly, true);
      const amount = Array.isArray(projection.projectedBalance)
        ? projection.projectedBalance[0]
        : projection.unpaidRemainder;
      assert.ok(amount > 85 && amount < 100, `Expected ~$91, got ${amount}`);
      assert.ok(!String(projection.message).includes('563'));
      assert.ok(!String(projection.message).includes('615'));
    });
  });
});

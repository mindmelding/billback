/**
 * Tests for Billback Savings Engine
 * Uses Node.js built-in test runner
 * Run with: node --test src/engine.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  calculateMonthlyCost,
  calculateAnnualCost,
  compareProviders,
  calculateBehavioralSavings,
  checkCareFeraEligibility,
  generateSavingsReport,
  calculateNEMTrueUpProjection,
  calculateAnnualGenerationCost
} from './engine.js';
import { parseSDGEBillText } from './parser.js';
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

    it('should use net NEM + NBC + CCA generation, a gas range, and climate credits', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);
      assert.ok(parsed.nemYearToDate.length >= 10);
      assert.strictEqual(parsed.ytdNetMetering, 267.40);
      assert.strictEqual(parsed.ytdNbc, 318.89);
      assert.strictEqual(parsed.ccaGeneration, 244.02);
      assert.strictEqual(parsed.climateCredit, 49.36);

      const bills = [{
        date: parsed.billingPeriod.start,
        usage: parsed.usage,
        cost: parsed.totalAmount
      }];

      const result = calculateAnnualCost(
        bills,
        rates.CEA_CLEAN_IMPACT_PLUS,
        parsed.nemYearToDate,
        {
          ytdNetMetering: parsed.ytdNetMetering,
          ytdNbc: parsed.ytdNbc,
          climateCredit: parsed.climateCredit,
          billedRates: parsed.billedRates,
          gasUsage: parsed.gas
        }
      );

      const sdgeElectric = (267.40 + 318.89) * (12 / 10);
      assert.ok(Math.abs(result.components.sdgeElectric - sdgeElectric) < 1, `SDG&E electric ${result.components.sdgeElectric} vs ${sdgeElectric}`);
      assert.ok(result.components.ccaGeneration > 500, `CCA generation should annualize well above this cycle's $244, got ${result.components.ccaGeneration}`);
      assert.ok(result.components.ccaGeneration < 900, `CCA generation should not be $244×12, got ${result.components.ccaGeneration}`);
      assert.ok(Math.abs(result.components.climateCredit - 98.72) < 0.01, `Two climate credits, got ${result.components.climateCredit}`);
      assert.ok(result.components.gas[1] > result.components.gas[0] + 50, 'Gas should be a seasonal range, not one month × 12');
      assert.ok(
        Math.abs(result.components.gas[0] - 33.08 * 12) > 1
        || Math.abs(result.components.gas[1] - 33.08 * 12) > 1,
        'Gas range must not collapse to August × 12'
      );
      assert.ok(result.annualCostRange[0] < result.annualCostRange[1]);
      assert.ok(result.annualCostRange[0] >= 1500 && result.annualCostRange[0] <= 1750, `Low ${result.annualCostRange[0]}`);
      assert.ok(result.annualCostRange[1] >= 1850 && result.annualCostRange[1] <= 2100, `High ${result.annualCostRange[1]}`);
      assert.ok(result.annualCostRange[0] >= 1550 - 50 && result.annualCostRange[1] <= 1950 + 100,
        `Expected roughly $1,550–1,950, got ${result.annualCostRange.map(n => Math.round(n)).join('–')}`);
      assert.ok(result.annualCost < 2000, 'Must not be the gross abs(kWh) figure (~$2,637)');
      assert.ok(Math.abs(result.annualCost - 1377) > 50, 'Must not be the old $1,377 (gross NEM + extra base + gas×12)');
      assert.strictEqual(result.confidence, 'low');
      assert.ok(result.basis.includes('NBC'), result.basis);
      assert.ok(result.basis.includes('CCA generation'), result.basis);
      assert.ok(result.basis.includes('Climate Credit'), result.basis);
      assert.ok(result.basis.includes('one bill'), result.basis);
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

    it('should compare CEA tiers on generation cost only with sign-consistent savings', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);
      const bills = [{
        date: parsed.billingPeriod.start,
        usage: parsed.usage,
        cost: parsed.totalAmount
      }];
      const options = {
        ytdNetMetering: parsed.ytdNetMetering,
        ytdNbc: parsed.ytdNbc,
        climateCredit: parsed.climateCredit,
        billedRates: parsed.billedRates,
        gasUsage: parsed.gas
      };
      const comparisons = compareProviders(bills, rates.CEA_CLEAN_IMPACT_PLUS, parsed.nemYearToDate, options);
      const impact = comparisons.find(c => c.provider === 'CEA' && c.plan === 'Clean Impact');
      assert.ok(impact, 'Should include Clean Impact');
      assert.strictEqual(impact.compareMode, 'generation');
      const plusGen = calculateAnnualGenerationCost(parsed.nemYearToDate, rates.CEA_CLEAN_IMPACT_PLUS, parsed.billedRates).generationCost;
      const impactGen = calculateAnnualGenerationCost(parsed.nemYearToDate, rates.CEA_CLEAN_IMPACT, null).generationCost;
      const expectedSavings = plusGen - impactGen;
      assert.ok(Math.abs(impact.savings - expectedSavings) < 1, `Savings ${impact.savings} vs gen delta ${expectedSavings}`);
      if (impact.annualCost > plusGen && impact.savings > 0) {
        // Household-equivalent annual for Impact must be below current if savings are positive
        const current = calculateAnnualCost(bills, rates.CEA_CLEAN_IMPACT_PLUS, parsed.nemYearToDate, options);
        assert.ok(impact.annualCost < current.annualCost + 0.5,
          `Clean Impact listed at $${impact.annualCost.toFixed(2)} with +$${impact.savings.toFixed(0)} savings must be cheaper than current $${current.annualCost.toFixed(2)}`);
      }
      assert.ok(Math.abs(impact.annualCost - 1428.55) > 50, 'Must not list bundled $1,428.55 for Clean Impact');
      assert.ok(impact.savings === 0 || Math.sign(impact.savings) === Math.sign(plusGen - impactGen) || Math.abs(impact.savings) < 0.01);
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
      assert.ok(report.totalSavingsRange[1] > 0, 'Should show some savings');
      
      // The prototype shows $595-870/year savings
      // Our calculation uses 1 month annualized, so may differ
      // Just verify it's in a reasonable range
      const annualSavings = report.totalSavingsRange[1];
      assert.ok(annualSavings > 400, `Annual savings ${annualSavings} should exceed $400`);
      assert.ok(annualSavings < 3000, `Annual savings ${annualSavings} should be under $3000`);
    });

    it('should build fixture household annual from net NEM, NBC, CCA, gas range, climate credit', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);
      const bills = [{
        date: parsed.billingPeriod.start,
        usage: parsed.usage,
        cost: parsed.totalAmount
      }];
      const nemData = {
        trueUpDate: parsed.nemTrueUpDate,
        balance: parsed.nemBalance,
        systemSize: parsed.systemSize,
        paymentHistory: parsed.nemPaymentHistory,
        previousNemYtd: parsed.previousNemYtd,
        currentNemCharges: parsed.currentNemCharges,
        excessCreditTransfer: parsed.excessCreditTransfer
      };
      const report = generateSavingsReport(
        bills,
        rates.CEA_CLEAN_IMPACT_PLUS,
        { renter: true, hasSolar: true },
        parsed.nemYearToDate,
        nemData,
        parsed.gas,
        {
          ytdNetMetering: parsed.ytdNetMetering,
          ytdNbc: parsed.ytdNbc,
          climateCredit: parsed.climateCredit,
          billedRates: parsed.billedRates
        }
      );

      const c = report.currentPlan.components;
      assert.ok(c, 'Should expose annual cost components');
      assert.ok(Math.abs(c.sdgeElectric - 703.55) < 1, `SDG&E electric ${c.sdgeElectric}`);
      assert.ok(c.ccaGeneration > 500 && c.ccaGeneration < 900, `CCA gen ${c.ccaGeneration}`);
      assert.ok(Math.abs(c.climateCredit - 98.72) < 0.01);
      assert.ok(c.gas[1] > c.gas[0] + 50, 'Gas should be a range');
      const [lo, hi] = report.currentPlan.annualCostRange;
      assert.ok(lo >= 1500 && hi <= 2100 && lo < hi, `Range ${Math.round(lo)}–${Math.round(hi)}`);
      assert.strictEqual(report.currentPlan.confidence, 'low');
      assert.ok(report.nemTrueUpProjection.paysMonthly);
      assert.ok(Math.abs(report.nemTrueUpProjection.lastCycleCharges - 461.99) < 0.01);

      const impact = report.providerAlternatives.find(a => a.plan === 'Clean Impact');
      assert.ok(impact);
      if (impact.savings > 0) {
        assert.ok(impact.annualCost <= report.currentPlan.annualCost + 0.5,
          `Positive savings but listed ${impact.annualCost} > current ${report.currentPlan.annualCost}`);
      }
    });
  });

  describe('NEM true-up projection for monthly payers', () => {
    it('should project last cycle charges (~$462), not balance minus payment (~$91)', () => {
      const nemData = {
        trueUpDate: '2026-10-28',
        balance: 445.71,
        systemSize: 3.44,
        paymentHistory: [{ date: '2026-08-21', amount: 354.22 }],
        previousNemYtd: 354.22,
        currentNemCharges: 461.99,
        excessCreditTransfer: 16.28
      };
      const nemYearToDate = [
        { date: '2026-08-27', onPeak: 355, offPeak: 193, superOffPeak: 76, total: 624, nemCharges: 177.17 }
      ];
      const projection = calculateNEMTrueUpProjection(nemData, nemYearToDate, rates.CEA_CLEAN_IMPACT_PLUS);
      assert.ok(projection, 'Should return a projection');
      assert.strictEqual(projection.paysMonthly, true);
      const amount = Array.isArray(projection.projectedBalance)
        ? projection.projectedBalance[0]
        : projection.lastCycleCharges;
      assert.ok(amount > 450 && amount < 470, `Expected ~$462, got ${amount}`);
      assert.ok(String(projection.message).includes('last cycle'));
      assert.ok(String(projection.message).includes('normal monthly bill'));
      assert.ok(!String(projection.message).includes('91'));
      assert.ok(!String(projection.message).includes('563'));
      assert.ok(!String(projection.message).includes('615'));
    });

    it('should not project months that fall after the true-up date', () => {
      const nemData = {
        trueUpDate: '2026-10-28',
        balance: 445.71,
        systemSize: 3.44,
        paymentHistory: []
      };
      const nemYearToDate = [
        { date: '2026-08-27', onPeak: 355, offPeak: 193, superOffPeak: 76, total: 624, nemCharges: 177.17 }
      ];
      const projection = calculateNEMTrueUpProjection(nemData, nemYearToDate, rates.CEA_CLEAN_IMPACT_PLUS);
      assert.ok(projection);
      const months = (projection.projectionDetails || []).map((d) => d.month);
      assert.ok(!months.some((m) => /Nov/i.test(m)), `November is after Oct 28 true-up: ${months.join(', ')}`);
    });
  });
});

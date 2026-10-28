/**
 * Tests for CEA Rate Versioning and Bill Rate Comparison
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  getCEARatesForPeriod, 
  compareCEARates,
  CEA_CLEAN_IMPACT_PLUS_FEB_2026,
  CEA_CLEAN_IMPACT_PLUS_AUG_2026
} from './rates.js';

describe('CEA Rate Versioning', () => {
  describe('getCEARatesForPeriod', () => {
    it('should return Feb 2026 rates for bills before July 2026', () => {
      const result = getCEARatesForPeriod('Clean Impact Plus', '2026-03-15');
      
      assert.ok(result.rates);
      assert.strictEqual(result.rates.effectiveDate, '2026-02-01');
      assert.strictEqual(result.rates.generation.summer.onPeak, 0.55922, 'Feb schedule shows $0.55922');
      assert.strictEqual(result.possiblyStale, false);
    });

    it('should return Aug 2026 rates for bills from July 30, 2026 onward', () => {
      const result = getCEARatesForPeriod('Clean Impact Plus', '2026-07-30');
      
      assert.ok(result.rates);
      assert.strictEqual(result.rates.effectiveDate, '2026-07-30');
      assert.strictEqual(result.rates.generation.summer.onPeak, 0.55397, 'Aug bill shows $0.55397');
      assert.strictEqual(result.possiblyStale, false);
    });

    it('should flag mid-year bills as possibly stale', () => {
      const result = getCEARatesForPeriod('Clean Impact Plus', '2026-06-15');
      
      assert.ok(result.possiblyStale, 'June bills may have mid-year rate changes');
    });

    it('should handle Clean Impact (with relief credit)', () => {
      const result = getCEARatesForPeriod('Clean Impact', '2026-08-01');
      
      assert.ok(result.rates);
      assert.strictEqual(result.rates.plan, 'Clean Impact');
      assert.ok(result.rates.reliefCredit, 'Should include relief credit');
    });
  });

  describe('compareCEARates', () => {
    it('should detect when bill rates match table rates', () => {
      const billRates = {
        onPeak: 0.55922,
        offPeak: 0.22619
      };
      
      const result = compareCEARates(billRates, CEA_CLEAN_IMPACT_PLUS_FEB_2026);
      
      assert.strictEqual(result.matches, true);
      assert.strictEqual(result.differences.length, 0);
      assert.strictEqual(result.recommendation, '');
    });

    it('should detect when bill rates differ from table rates', () => {
      const billRates = {
        onPeak: 0.55397,  // Aug 2026 actual
        offPeak: 0.22298
      };
      
      const result = compareCEARates(billRates, CEA_CLEAN_IMPACT_PLUS_FEB_2026);
      
      assert.strictEqual(result.matches, false, 'Rates should not match');
      assert.ok(result.differences.length > 0);
      
      const onPeakDiff = result.differences.find(d => d.type === 'onPeak');
      assert.ok(onPeakDiff, 'Should find on-peak difference');
      assert.strictEqual(onPeakDiff.bill, 0.55397);
      assert.strictEqual(onPeakDiff.table, 0.55922);
      assert.ok(onPeakDiff.difference > 0.005, 'Difference should be > $0.005/kWh');
      
      assert.ok(result.recommendation.includes('Bill\'s printed rates differ'), 
        'Should recommend using bill rates');
      assert.ok(result.recommendation.includes('stale'), 
        'Should flag table as possibly stale');
    });

    it('should allow small rounding differences', () => {
      const billRates = {
        onPeak: 0.55922001,  // Tiny rounding difference
        offPeak: 0.22619
      };
      
      const result = compareCEARates(billRates, CEA_CLEAN_IMPACT_PLUS_FEB_2026);
      
      assert.strictEqual(result.matches, true, 'Should tolerate rounding < $0.001');
    });
  });

  describe('Rate table metadata', () => {
    it('Feb 2026 schedule should have correct metadata', () => {
      assert.strictEqual(CEA_CLEAN_IMPACT_PLUS_FEB_2026.effectiveDate, '2026-02-01');
      assert.ok(CEA_CLEAN_IMPACT_PLUS_FEB_2026.source.includes('2026-02-01'));
      assert.strictEqual(CEA_CLEAN_IMPACT_PLUS_FEB_2026.generation.summer.onPeak, 0.55922);
    });

    it('Aug 2026 bill rates should have correct metadata', () => {
      assert.strictEqual(CEA_CLEAN_IMPACT_PLUS_AUG_2026.effectiveDate, '2026-07-30');
      assert.ok(CEA_CLEAN_IMPACT_PLUS_AUG_2026.source.includes('Aug 2026 bill'));
      assert.strictEqual(CEA_CLEAN_IMPACT_PLUS_AUG_2026.generation.summer.onPeak, 0.55397);
      assert.ok(CEA_CLEAN_IMPACT_PLUS_AUG_2026.note.includes('differ from published'));
    });
  });
});

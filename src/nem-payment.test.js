/**
 * Tests for NEM Payment Pattern Detection and True-Up Calculation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { 
  parseSDGEBillText, 
  detectNEMPaymentPattern, 
  calculateTrueUpAmount 
} from './parser.js';

describe('NEM Payment Detection', () => {
  describe('detectNEMPaymentPattern', () => {
    it('should detect monthly payer when payment equals previous NEM YTD', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);
      
      const result = detectNEMPaymentPattern(parsed);
      
      assert.strictEqual(result.paysMonthly, true, 'Fixture shows monthly payments');
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.reasoning.includes('previous NEM YTD'), 'Should explain previous-balance match');
    });

    it('should return unknown for bill without payment history', () => {
      const parsed = {
        hasSolar: true,
        nemPaymentHistory: [],
        nemBalance: 500
      };
      
      const result = detectNEMPaymentPattern(parsed);
      
      assert.strictEqual(result.paysMonthly, null);
      assert.strictEqual(result.confidence, 'unknown');
    });

    it('should return unknown for non-solar accounts', () => {
      const parsed = {
        hasSolar: false,
        nemPaymentHistory: []
      };
      
      const result = detectNEMPaymentPattern(parsed);
      
      assert.strictEqual(result.paysMonthly, null);
      assert.strictEqual(result.confidence, 'unknown');
    });
  });

  describe('calculateTrueUpAmount', () => {
    it('should use last cycle charges for monthly payers, not balance minus payment', () => {
      const parsed = {
        hasSolar: true,
        nemBalance: 445.71,
        previousNemYtd: 354.22,
        currentNemCharges: 461.99,
        excessCreditTransfer: 16.28,
        nemPaymentHistory: [
          { date: '2026-08-21', amount: 354.22 }
        ]
      };
      
      const result = calculateTrueUpAmount(parsed, true);
      
      assert.ok(Math.abs(result.estimatedAmount - 461.99) < 0.01, `Expected $461.99, got ${result.estimatedAmount}`);
      assert.ok(result.estimatedAmount > 400, 'Must not be the $91 balance-minus-payment figure');
      assert.ok(!String(result.reasoning).includes('unbilled'), 'Old unbilled wording is misleading');
      assert.ok(result.reasoning.includes('last cycle'));
      assert.ok(result.reasoning.includes('461.99') || result.reasoning.includes('$462'));
      assert.ok(result.reasoning.includes('Previous balance $354.22 paid 8/21'));
      assert.ok(result.reasoning.includes("this cycle's charges"));
    });

    it('should calculate full balance for credit bankers', () => {
      const parsed = {
        hasSolar: true,
        nemBalance: 445.71,
        nemPaymentHistory: []
      };
      
      const result = calculateTrueUpAmount(parsed, false);
      
      assert.strictEqual(result.estimatedAmount, 445.71, 'Should be full balance');
      assert.ok(result.reasoning.includes('banks credits'), 'Should explain banking pattern');
      assert.ok(result.reasoning.includes('full'), 'Should mention full balance');
    });

    it('should show both scenarios when pattern is unknown', () => {
      const parsed = {
        hasSolar: true,
        nemBalance: 445.71,
        nemPaymentHistory: []
      };
      
      const result = calculateTrueUpAmount(parsed, null);
      
      assert.strictEqual(result.estimatedAmount, null, 'Amount is unknown');
      assert.ok(result.reasoning.includes('Unable to determine'), 'Should say unknown');
      assert.ok(result.reasoning.includes('44'), 'Should show balance in $440s range');
      assert.ok(result.reasoning.includes('monthly'), 'Should show monthly option');
    });

    it('should return null for non-solar accounts', () => {
      const parsed = {
        hasSolar: false,
        nemBalance: null
      };
      
      const result = calculateTrueUpAmount(parsed, true);
      
      assert.strictEqual(result.estimatedAmount, null);
      assert.ok(result.reasoning.includes('Not a solar'), 'Should explain not applicable');
    });
  });

  describe('Integration with fixture', () => {
    it('should detect and calculate true-up from fixture bill', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);
      
      assert.strictEqual(parsed.nemBalance, 445.71, 'Should parse balance');
      assert.strictEqual(parsed.previousNemYtd, 354.22);
      assert.strictEqual(parsed.currentNemCharges, 461.99);
      assert.strictEqual(parsed.excessCreditTransfer, 16.28);
      assert.strictEqual(parsed.nemPaymentHistory.length, 1, 'Should parse payment');
      assert.strictEqual(parsed.nemPaymentHistory[0].amount, 354.22, 'Should parse amount');
      
      const detection = detectNEMPaymentPattern(parsed);
      assert.strictEqual(detection.paysMonthly, true, 'Should detect monthly pattern');
      assert.ok(Math.abs(parsed.nemPaymentHistory[0].amount - parsed.previousNemYtd) < 0.01);
      
      const trueUp = calculateTrueUpAmount(parsed, detection.paysMonthly);
      assert.ok(Math.abs(trueUp.estimatedAmount - 461.99) < 0.01, `Expected $461.99, got ${trueUp.estimatedAmount}`);
      assert.ok(trueUp.estimatedAmount > 400, 'Must not be ~$91');
    });
  });
});

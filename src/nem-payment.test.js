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
    it('should detect monthly payment pattern from fixture', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);
      
      const result = detectNEMPaymentPattern(parsed);
      
      assert.strictEqual(result.paysMonthly, true, 'Fixture shows monthly payments');
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.reasoning.includes('payment'), 'Should explain reasoning');
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
    it('should calculate reduced true-up for monthly payers', () => {
      const parsed = {
        hasSolar: true,
        nemBalance: 445.71,
        nemPaymentHistory: [
          { date: '2026-08-21', amount: 354.22 }
        ]
      };
      
      const result = calculateTrueUpAmount(parsed, true);
      
      // True-up should be unbilled amount: 445.71 - 354.22 = ~91.49
      assert.ok(result.estimatedAmount < 100, 'Should be only unbilled final period');
      assert.ok(result.estimatedAmount > 85, 'Should be around $91');
      assert.ok(result.reasoning.includes('monthly'), 'Should explain monthly pattern');
      assert.ok(result.reasoning.includes('unbilled'), 'Should mention unbilled charges');
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
      
      // Check parsing
      assert.strictEqual(parsed.nemBalance, 445.71, 'Should parse balance');
      assert.strictEqual(parsed.nemPaymentHistory.length, 1, 'Should parse payment');
      assert.strictEqual(parsed.nemPaymentHistory[0].amount, 354.22, 'Should parse amount');
      
      // Detect pattern
      const detection = detectNEMPaymentPattern(parsed);
      assert.strictEqual(detection.paysMonthly, true, 'Should detect monthly pattern');
      
      // Calculate true-up
      const trueUp = calculateTrueUpAmount(parsed, detection.paysMonthly);
      assert.ok(trueUp.estimatedAmount < 100, 'True-up should be small (~$91)');
      assert.ok(trueUp.estimatedAmount >= 0, 'True-up should be non-negative');
    });
  });
});

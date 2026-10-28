/**
 * Tests for Deterministic Bill Parser
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseSDGEBillText, stripPersonalInfo, needsManualReview, validateBillingPeriod } from './parser.js';

describe('Deterministic Parser', () => {
  describe('parseSDGEBillText with fixture', () => {
    it('should parse the CEA solar bill fixture correctly', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);

      // Account number
      assert.strictEqual(parsed.accountNumber, '123456789012', 'Should extract 12-digit CCA account number');
      assert.strictEqual(parsed.confidence.accountNumber, 'high');

      // Billing period
      assert.strictEqual(parsed.billingPeriod.start, '2026-07-30');
      assert.strictEqual(parsed.billingPeriod.end, '2026-08-27');
      assert.strictEqual(parsed.usage.season, 'summer');

      // Provider
      assert.strictEqual(parsed.provider, 'CEA');
      assert.strictEqual(parsed.providerTier, 'Clean Impact Plus');

      // Rate plan
      assert.strictEqual(parsed.ratePlan, 'TOU-DR1');

      // Solar / NEM
      assert.strictEqual(parsed.hasSolar, true);
      assert.strictEqual(parsed.nemStatus, 'NEM 2.0');
      assert.strictEqual(parsed.systemSize, 3.44);
      assert.strictEqual(parsed.nemTrueUpDate, '2026-10-28');
      assert.strictEqual(parsed.nemBalance, 445.71);

      // Usage
      assert.strictEqual(parsed.totalKwh, 624);
      assert.strictEqual(parsed.usage.onPeak, 355);
      assert.strictEqual(parsed.usage.offPeak, 193);
      assert.strictEqual(parsed.usage.superOffPeak, 76);

      // Gas
      assert.ok(parsed.gas);
      assert.strictEqual(parsed.gas.therms, 13);
      assert.strictEqual(parsed.gas.cost, 33.08);

      // Total
      assert.strictEqual(parsed.totalAmount, 445.71);

      // Climate zone
      assert.strictEqual(parsed.climateZone, 'Coastal');

      // NEM Year-to-Date table
      assert.ok(parsed.nemYearToDate.length >= 10, 'Should have at least 10 months from NEM table');
      
      const firstMonth = parsed.nemYearToDate[0];
      assert.strictEqual(firstMonth.date, '2025-11-26');
      assert.strictEqual(firstMonth.onPeak, 83);
      assert.strictEqual(firstMonth.offPeak, -139);
      assert.strictEqual(firstMonth.superOffPeak, 28);
      
      const lastMonth = parsed.nemYearToDate[parsed.nemYearToDate.length - 1];
      assert.strictEqual(lastMonth.date, '2026-08-27');
      assert.strictEqual(lastMonth.onPeak, 355);

      // Should not need manual review
      assert.strictEqual(needsManualReview(parsed), false);
      
      // Should pass billing period validation (29 days)
      const validation = validateBillingPeriod(parsed);
      assert.strictEqual(validation, null, 'Should be a valid complete billing period');
    });
  });

  describe('validateBillingPeriod', () => {
    it('should accept complete billing periods (25-35 days)', () => {
      const validBill = {
        billingPeriod: { start: '2026-07-30', end: '2026-08-27' },
        totalKwh: 624,
        _originalText: 'Regular monthly bill'
      };
      
      const result = validateBillingPeriod(validBill);
      assert.strictEqual(result, null, 'Should accept 29-day bill');
    });

    it('should reject partial bills (< 25 days)', () => {
      const partialBill = {
        billingPeriod: { start: '2026-07-30', end: '2026-08-10' },
        totalKwh: 200,
        _originalText: 'Partial bill'
      };
      
      const result = validateBillingPeriod(partialBill);
      assert.ok(result && !result.valid);
      assert.strictEqual(result.reason, 'partial_bill');
      assert.ok(result.message.includes('11 days'));
    });

    it('should reject extended bills (> 35 days)', () => {
      const extendedBill = {
        billingPeriod: { start: '2026-07-01', end: '2026-08-20' },
        totalKwh: 800,
        _originalText: 'Extended bill'
      };
      
      const result = validateBillingPeriod(extendedBill);
      assert.ok(result && !result.valid);
      assert.strictEqual(result.reason, 'extended_bill');
    });

    it('should reject move-in/move-out bills', () => {
      const moveInBill = {
        billingPeriod: { start: '2026-07-30', end: '2026-08-27' },
        totalKwh: 400,
        _originalText: 'MOVE-IN service bill for new customer'
      };
      
      const result = validateBillingPeriod(moveInBill);
      assert.ok(result && !result.valid);
      assert.strictEqual(result.reason, 'move_service_change');
      assert.ok(result.message.includes('move-in'));
    });

    it('should reject corrected/rebilled statements', () => {
      const correctedBill = {
        billingPeriod: { start: '2026-07-30', end: '2026-08-27' },
        totalKwh: 624,
        _originalText: 'CORRECTED STATEMENT - Rebilled charges'
      };
      
      const result = validateBillingPeriod(correctedBill);
      assert.ok(result && !result.valid);
      assert.strictEqual(result.reason, 'corrected_bill');
    });

    it('should reject true-up-only statements', () => {
      const trueUpOnly = {
        billingPeriod: { start: '2026-10-28', end: '2026-10-28' },
        totalKwh: 0,
        hasSolar: true,
        _originalText: 'Annual True-Up Statement'
      };
      
      const result = validateBillingPeriod(trueUpOnly);
      assert.ok(result && !result.valid);
      assert.strictEqual(result.reason, 'trueup_only');
    });

    it('should accept bills with mid-cycle rate changes', () => {
      // Example bill has "Rate 1" for 2 days, "Rate 2" for 27 days = 29 days total
      const validBill = {
        billingPeriod: { start: '2026-07-30', end: '2026-08-27' },
        totalKwh: 624,
        _originalText: 'Rate change on day 3 of your Billing Period'
      };
      
      const result = validateBillingPeriod(validBill);
      assert.strictEqual(result, null, 'Should accept bill with mid-cycle rate change');
    });
  });

  describe('stripPersonalInfo', () => {
    it('should redact account numbers', () => {
      const text = 'ACCOUNT NUMBER 1234 5678 9012 3\nCCA Account Number: 123456789012';
      const cleaned = stripPersonalInfo(text);
      
      assert.ok(cleaned.includes('[REDACTED]'));
      assert.ok(!cleaned.includes('123456789012'));
    });

    it('should redact meter numbers', () => {
      const text = 'Meter Number: 12345001';
      const cleaned = stripPersonalInfo(text);
      
      assert.ok(cleaned.includes('[REDACTED]'));
      assert.ok(!cleaned.includes('12345001'));
    });
  });

  describe('needsManualReview', () => {
    it('should flag incomplete data', () => {
      const incomplete = {
        accountNumber: null,
        totalKwh: null,
        totalAmount: null,
        warnings: ['Missing account', 'Missing kWh', 'Missing amount']
      };
      
      assert.strictEqual(needsManualReview(incomplete), true);
    });

    it('should not flag complete data', () => {
      const complete = {
        accountNumber: '123456789012',
        totalKwh: 624,
        totalAmount: 445.71,
        billingPeriod: { start: '2026-07-30', end: '2026-08-27' },
        warnings: []
      };
      
      assert.strictEqual(needsManualReview(complete), false);
    });
  });

  describe('NEM Payment History Parsing', () => {
    it('should parse NEM payment history from fixture', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);

      // Should find payment in Net Metering Account Summary
      assert.ok(Array.isArray(parsed.nemPaymentHistory));
      assert.strictEqual(parsed.nemPaymentHistory.length, 1, 'Should find 1 NEM payment');
      
      const payment = parsed.nemPaymentHistory[0];
      assert.strictEqual(payment.date, '2026-08-21', 'Should parse payment date');
      assert.strictEqual(payment.amount, 354.22, 'Should parse payment amount');
    });
  });

  describe('PDF.js y-coordinate reconstructed layout', () => {
    it('should parse TOU kWh from a single reconstructed dashboard line', () => {
      const billText = `
ACCOUNT NUMBER 1234 5678 9012 3
CCA Account Number: 123456789012
Billing Period: 7/30/26 - 8/27/26
Cycle: 19
CLEAN ENERGY ALLIANCE
Clean Impact Plus 624 kWh
Rate: Time of Use - TOU-DR1-Residential
Climate Zone: Coastal
Net Energy Metering
Version: 2.0
System Size: 3.44 kW
True-Up Date: 10/28/2026
Current Account Balance $445.71
Total Usage: 624
Time of Use - Electricity Summer kWh On-Peak 355 Off-Peak 193 Super Off-Peak 76
13 Therms
Total Gas Service $33.08
Total Current Charges $445.71
OCEANSIDE, CA 92000
Community Choice Aggregation
Generation On-Peak Summer 355 kWh X $0.55397
Generation Off-Peak Summer 193 kWh X $0.22298
Generation Super Off-Peak Summer 76 kWh X $0.04914
Total CCA
Baseline Adjustment Credit $0.00
Net Metering Account Summary
Payment Received   8/21/26    THANK YOU    - 354.22
NEM Year-to-Date Balance $445.71
Net Energy Metering Summary
11/26/2025 83 − 139 28 − 28 28.27
12/29/2025 161 − 97 50 114 56.33
01/28/2026 115 − 67 37 85 41.76
02/27/2026 107 − 147 9 − 31 28.90
03/30/2026 83 − 29 − 163 − 109 20.69
04/29/2026 31 − 56 − 157 − 182 8.72
05/29/2026 30 − 49 − 127 − 146 7.49
06/29/2026 85 21 − 100 6 26.95
07/29/2026 310 199 116 625 178.96
08/27/2026 355 193 76 624 177.17
`;
      const parsed = parseSDGEBillText(billText);
      assert.strictEqual(parsed.usage.onPeak, 355);
      assert.strictEqual(parsed.usage.offPeak, 193);
      assert.strictEqual(parsed.usage.superOffPeak, 76);
      assert.strictEqual(parsed.nemYearToDate.length, 10);
      assert.strictEqual(parsed.nemYearToDate[0].offPeak, -139);
      assert.strictEqual(parsed.nemPaymentHistory.length, 1);
      assert.strictEqual(parsed.nemPaymentHistory[0].amount, 354.22);
    });
  });

  describe('Billed CEA Rates Extraction', () => {
    it('should extract CEA generation rates from bill', () => {
      const billText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');
      const parsed = parseSDGEBillText(billText);

      // Should extract CEA rates from CCA section
      assert.ok(parsed.billedRates, 'Should extract billed rates');
      assert.strictEqual(parsed.billedRates.season, 'summer');
      assert.strictEqual(parsed.billedRates.onPeak, 0.55397, 'Should parse on-peak rate');
      assert.strictEqual(parsed.billedRates.offPeak, 0.22298, 'Should parse off-peak rate');
      assert.ok(parsed.billedRates.superOffPeak !== null, 'Should parse super off-peak rate');
    });
  });
});

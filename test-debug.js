#!/usr/bin/env node
/**
 * Debug script to test PDF parsing and action plan generation
 */

import { readFileSync } from 'fs';
import { parseBill } from './src/parser.js';
import { generateSavingsReport } from './src/engine.js';
import { generateDatedActionPlan } from './src/actionPlan.js';

console.log('=== Debug: PDF Text Extraction and Action Plan Generation ===\n');

// Read the test fixture text
const fixtureText = readFileSync('./test/fixtures/sdge_bill_cea_solar_aug2026.txt', 'utf-8');

console.log('1. Parsing bill...');
const parsed = parseBill(fixtureText);
console.log(`   Provider: ${parsed.provider}`);
console.log(`   Tier: ${parsed.providerTier}`);
console.log(`   Has Solar: ${parsed.hasSolar}`);
console.log(`   True-up date: ${parsed.nemTrueUpDate}`);
console.log(`   NEM YTD rows: ${parsed.nemYearToDate?.length || 0}`);

console.log('\n2. Generating savings report...');
const household = { hasSolar: true };
const report = generateSavingsReport([parsed], { provider: 'CEA', plan: 'Clean Impact Plus' }, household, parsed.nemYearToDate);
console.log(`   Current plan: ${report.currentPlan.provider} ${report.currentPlan.plan}`);
console.log(`   Provider alternatives: ${report.providerAlternatives?.length || 0}`);

if (report.providerAlternatives) {
  report.providerAlternatives.forEach(alt => {
    console.log(`     - ${alt.provider} ${alt.plan}: ${alt.savings > 0 ? '+' : ''}$${Math.round(alt.savings)}/yr`);
  });
}

console.log('\n3. Generating action plan...');
const actionPlan = generateDatedActionPlan(report, [parsed], household);
console.log(`   Total steps: ${actionPlan.steps.length}`);

console.log('\n4. Action steps:');
actionPlan.steps.forEach((step, i) => {
  console.log(`   ${i + 1}. ${step.title}`);
  console.log(`      Date: ${step.doByDate}`);
  console.log(`      Urgency: ${step.urgency}`);
});

console.log('\n5. Checking for required dates:');
const allText = JSON.stringify(actionPlan.steps);
console.log(`   Contains "Nov 19" or "11/19": ${allText.includes('Nov 19') || allText.includes('11/19') || allText.includes('2026-11-19')}`);
console.log(`   Contains "Nov 27" or "11/27": ${allText.includes('Nov 27') || allText.includes('11/27') || allText.includes('2026-11-27')}`);
console.log(`   Contains "May 28" or "5/28": ${allText.includes('May 28') || allText.includes('5/28') || allText.includes('2027-05-28')}`);
